"""Local credentials, protected by the current Windows user's DPAPI identity.

No raw-key read API: callers receive only availability or use a key for a request.
Other platforms retain session-only input until a native secure store is supported.
"""

import base64
import ctypes
import hashlib
import json
import os
from contextlib import closing
from ctypes import wintypes

from .storage import FileLock, FileProblem, atomic_bytes, read_json


def binding(profile):
    # Model names/parameters can change at one service, but credentials must never
    # silently follow a profile ID to a different destination or transport.
    return hashlib.sha256(
        json.dumps([profile.endpoint, profile.mode, profile.protocol]).encode("utf-8")
    ).hexdigest()


def protect(data, *, decrypt=False):
    if os.name != "nt":
        raise FileProblem("当前系统暂不支持本地加密密钥，请使用仅本次会话")

    class Blob(ctypes.Structure):
        _fields_ = [("size", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_ubyte))]

    source = ctypes.create_string_buffer(data)
    incoming = Blob(len(data), ctypes.cast(source, ctypes.POINTER(ctypes.c_ubyte)))
    outgoing = Blob()
    crypt = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    function = crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData
    function.argtypes = [
        ctypes.POINTER(Blob),
        ctypes.c_void_p,
        ctypes.POINTER(Blob),
        ctypes.c_void_p,
        ctypes.c_void_p,
        wintypes.DWORD,
        ctypes.POINTER(Blob),
    ]
    function.restype = wintypes.BOOL
    # UI_FORBIDDEN; deliberately omit LOCAL_MACHINE (user-scoped encryption).
    if not function(ctypes.byref(incoming), None, None, None, None, 1, ctypes.byref(outgoing)):
        raise FileProblem("本机密钥加密或读取失败，请重新填写密钥", "credential_error")
    try:
        return ctypes.string_at(outgoing.data, outgoing.size)
    finally:
        kernel.LocalFree(outgoing.data)


class Credentials:
    def __init__(self, data_dir):
        self.path = data_dir / "credentials.json"
        self.supported = os.name == "nt"

    def _read(self):
        if not self.path.exists():
            return {}
        try:
            doc = read_json(self.path)
            if (
                doc.get("format") != "npcs-dpapi-credentials-v1"
                or not isinstance(doc.get("items"), dict)
                or len(doc["items"]) > 30
                or any(
                    not isinstance(row, dict)
                    or set(row) != {"binding", "ciphertext"}
                    or not isinstance(row["binding"], str)
                    or not isinstance(row["ciphertext"], str)
                    for row in doc["items"].values()
                )
            ):
                raise ValueError
            return doc["items"]
        except (OSError, ValueError, AttributeError, FileProblem) as exc:
            raise FileProblem("本地密钥文件无法读取；原文件已保留", "credential_error") from exc

    def get(self, profile):
        row = self._read().get(profile.id)
        if not row or row["binding"] != binding(profile) or profile.archived:
            return ""
        try:
            return protect(base64.b64decode(row["ciphertext"], validate=True), decrypt=True).decode(
                "utf-8"
            )
        except (ValueError, UnicodeError, OSError, FileProblem) as exc:
            raise FileProblem("已保存密钥无法在当前用户下读取，请清除后重新填写", "credential_error") from exc

    def status(self, profiles):
        available, warning = {}, ""
        for profile in profiles:
            try:
                available[profile.id] = bool(self.get(profile))
            except FileProblem as exc:
                available[profile.id] = False
                warning = str(exc)
        return {"supported": self.supported, "saved": available, "warning": warning}

    def set(self, profile, key):
        if not key or len(key) > 8192:
            raise FileProblem("填写有效密钥（不超过 8192 个字符）")
        encrypted = base64.b64encode(protect(key.encode("utf-8"))).decode("ascii")
        self._update(profile.id, {"binding": binding(profile), "ciphertext": encrypted})

    def clear(self, identifier):
        self._update(identifier, None)

    def _update(self, identifier, value):
        try:
            with closing(FileLock(self.path)):
                rows = self._read()
                if value is None:
                    rows.pop(identifier, None)
                else:
                    rows[identifier] = value
                payload = json.dumps(
                    {"format": "npcs-dpapi-credentials-v1", "items": rows}, indent=2
                ).encode("utf-8")
                atomic_bytes(self.path, payload)
        except OSError as exc:
            raise FileProblem("密钥保存失败，原密钥保持不变，请检查本地文件夹权限", "credential_error") from exc
