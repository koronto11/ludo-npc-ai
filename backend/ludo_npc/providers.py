"""Small chat-completions protocol adapter; keys stay in transient call state."""

import asyncio
import json
from ipaddress import ip_address
from urllib.parse import urlsplit

import httpx2 as httpx


class ProviderError(Exception):
    def __init__(self, code, message, retryable=False):
        self.code, self.retryable = code, retryable
        super().__init__(message)


def completion_url(endpoint):
    value = endpoint.rstrip("/")
    return value if value.endswith("/chat/completions") else value + "/chat/completions"


def use_environment(profile):
    """Remote calls inherit proxy/NO_PROXY settings; local endpoints stay direct."""
    if profile.mode == "local":
        return False
    host = (urlsplit(profile.endpoint).hostname or "").lower().rstrip(".")
    if host == "localhost":
        return False
    try:
        return not ip_address(host).is_loopback
    except ValueError:
        return True


def token_usage(value):
    if not isinstance(value, dict):
        return {}
    return {
        k: v
        for k, v in (value or {}).items()
        if k in {"prompt_tokens", "completion_tokens", "total_tokens"} and type(v) is int and v >= 0
    }


class ChatProvider:
    def __init__(self, transport=None):
        self.transport = transport

    async def complete(self, profile, key, messages, progress=None, probe=False):
        headers = {"Authorization": "Bearer " + key} if key else {}
        payload = {
            "model": profile.model,
            "messages": messages,
            "max_tokens": 64 if probe else profile.max_tokens,
            "stream": profile.stream,
        }
        if profile.json_mode and not probe:
            payload["response_format"] = {"type": "json_object"}
        for attempt in range(profile.retry_limit + 1):
            received = False
            try:
                async with (
                    asyncio.timeout(profile.timeout_seconds),
                    httpx.AsyncClient(
                        timeout=profile.timeout_seconds,
                        trust_env=use_environment(profile),
                        follow_redirects=False,
                        transport=self.transport,
                    ) as client,
                ):
                    async with client.stream(
                        "POST", completion_url(profile.endpoint), headers=headers, json=payload
                    ) as response:
                        if response.status_code != 200:
                            code = response.status_code
                            message = {
                                401: "认证失败，请检查会话密钥",
                                403: "模型访问被拒绝",
                                429: "服务商限流或额度不足",
                            }.get(code, f"服务商返回 HTTP {code}")
                            raise ProviderError(
                                f"http_{code}", message, code in {429, 502, 503, 504}
                            )
                        usage, length = {}, 0
                        if profile.stream:
                            pieces = []
                            ended = False
                            async for line in response.aiter_lines():
                                if len(line) > 2_000_000:
                                    raise ProviderError("oversized", "模型响应超过当前大小限制")
                                if not line.startswith("data:"):
                                    continue
                                value = line[5:].strip()
                                if value == "[DONE]":
                                    ended = True
                                    break
                                chunk = json.loads(value)
                                if "error" in chunk:
                                    raise ProviderError("stream_error", "服务商流式请求失败")
                                usage.update(token_usage(chunk.get("usage")))
                                for choice in chunk.get("choices", []):
                                    if choice.get("finish_reason") == "length":
                                        raise ProviderError(
                                            "truncated", "输出达到上限，请提高输出限制或缩小任务"
                                        )
                                    if choice.get("finish_reason") == "stop":
                                        ended = True
                                    piece = choice.get("delta", {}).get("content") or ""
                                    if not isinstance(piece, str):
                                        raise ProviderError("protocol", "接口不支持当前文本协议")
                                    pieces.append(piece)
                                    length += len(piece)
                                    received |= bool(piece)
                                    if length > 2_000_000:
                                        raise ProviderError("oversized", "模型响应超过当前大小限制")
                                    if progress:
                                        progress(length)
                            if not ended:
                                raise ProviderError(
                                    "incomplete_stream", "流式响应未完整结束；没有保存半份草稿"
                                )
                            text = "".join(pieces)
                        else:
                            pieces = []
                            async for piece in response.aiter_bytes():
                                length += len(piece)
                                if length > 2_000_000:
                                    raise ProviderError("oversized", "模型响应超过当前大小限制")
                                pieces.append(piece)
                            data = json.loads(b"".join(pieces))
                            choice = data["choices"][0]
                            if choice.get("finish_reason") == "length":
                                raise ProviderError(
                                    "truncated", "输出达到上限，请提高输出限制或缩小任务"
                                )
                            text = choice["message"]["content"]
                            usage = token_usage(data.get("usage"))
                        if not isinstance(text, str) or not text.strip():
                            raise ProviderError("empty", "模型没有返回文本")
                        # Never persist a credential echoed by a provider.
                        return text.replace(key, "[密钥已移除]") if key else text, usage
            except (TimeoutError, httpx.TimeoutException):
                error = ProviderError("timeout", "模型请求超时；服务商可能已处理请求", True)
            except httpx.RequestError:
                error = ProviderError("connection", "无法连接模型服务，请检查地址和网络", True)
            except (ValueError, KeyError, IndexError, TypeError, AttributeError):
                error = ProviderError("protocol", "响应不符合 chat-completions 文本协议")
            except ProviderError as exc:
                error = exc
            if not error.retryable or received or attempt == profile.retry_limit:
                raise error
            await asyncio.sleep(2**attempt)


async def connection_test(provider, profile, key):
    text, usage = await provider.complete(
        profile, key, [{"role": "user", "content": "连接测试，请只回复 OK。"}], probe=True
    )
    return {
        "ok": True,
        "protocol": profile.protocol,
        "stream": profile.stream,
        "json_mode_requested": profile.json_mode,
        "usage": usage,
        "message": "模型文本请求已返回；生成结构仍会单独校验",
    }
