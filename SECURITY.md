# Security / 安全问题

## Scope / 范围

The current `0.1.0` preview mainline receives fixes. Older previews are not
maintained separately. This is a loopback-only local tool; public network
hosting is not a supported security boundary.

当前维护 0.1.0 预览版主线，不单独维护旧预览版本。服务面向本机回环地址；公开网络托管
不属于当前支持的安全部署边界。

## Report privately / 私下报告

Check the repository's **Security → Report a vulnerability** entry. If private
reporting is available, use it. If it is unavailable, open a minimal issue
requesting a private reporting channel, without exploit details, credentials
or user data. A maintainer can then provide a suitable channel. This document
does not imply that GitHub private reporting is already enabled.

优先查看仓库 Security 页中的私密漏洞报告入口。如果尚未启用，请发一个仅请求私密联系
渠道的 Issue；不要公开漏洞细节、密钥或用户工程。维护者随后提供合适的报告方式。

Include the affected version, platform, impact and a minimal reproduction using
synthetic data. Remove API keys, cookies, decrypted credentials, project paths,
private story text and personal information from screenshots and logs.

## Handling / 处理

Confirmed reports are investigated on the current mainline. There is no
guaranteed response deadline, security certification or bug bounty program.
Coordinate publication with maintainers so a fix can be prepared first.
If a credential is exposed, revoke or rotate it at the provider; removing it
from a file alone does not invalidate the credential or remove Git history.

当前没有承诺响应期限、安全认证或漏洞奖励。确认漏洞后在主线修复，并与报告者协调公开
时间。如密钥暴露，应在服务商撤销或更换；仅删除文件不会撤销密钥或清除 Git 历史。
