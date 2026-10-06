# 本机模型密钥保存

2026-10-06，NPCs AI Studio。

## 用户操作

打开模型设置，填写一次 API Key，保留默认勾选的“记住密钥，下次打开自动使用”，点击保存配置。后续刷新页面、关闭重开或服务重启后，生成与测试会自动使用该配置的密钥。输入框不回填原文，留空表示继续使用已保存密钥；填写新值并保存可替换。

每套模型配置独立保存。可以单独清除，也可取消记住、输入仅本次使用的密钥再保存。复制模型只复制参数；移除配置保留加密密钥以供恢复，但移除期间不能自动使用。更换接口地址、连接类型或协议后，旧密钥不随配置迁移，请重新填写；同接口的模型名或请求参数调整保留密钥。

此前版本的密钥只存在于页面内存，不存在可迁移的本地密钥文件；用户在新版设置中保存一次即可。不要在聊天、故事正文或 Skill 中填写密钥。

## 数据与兼容

- 工程 JSON、项目备份、模板、角色和文本导出继续不包含模型密钥。
- `settings.json` 保存无密钥的模型参数、默认分配与目录偏好。
- 应用数据目录中的独立 `credentials.json` 保存当前 Windows 用户 DPAPI 加密密文，按配置 ID 和 endpoint/mode/protocol 指纹绑定。
- 默认目录沿用 `%LOCALAPPDATA%/NPCs AI Studio`，旧版目录和显式 `--data-dir` 覆盖仍有效。当前开发预览使用仓库内 `.local-data/planning-preview`；用户选用工程目录不改变密钥位置。
- Workspace 只返回可保存能力、按配置的已保存状态和读取警告；没有读取密钥原文的 HTTP 接口。
- 密钥文件加锁并原子替换；写入失败保留旧文件，解析或解密失败报告警告而不覆盖。损坏密文可逐配置清除再填写；整个 JSON 无法解析时保留文件，需用户处理应用目录中的损坏文件。
- 本批支持 Windows 加密保存。其他操作系统维持会话输入，界面关闭记住选项；不自动降级为明文文件。加密文件通常只能由相同 Windows 用户在原机器解密，工程跨机器分享仍不带密钥。

实现依照 [Microsoft CryptProtectData 文档](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)，使用 UI_FORBIDDEN，未启用 LOCAL_MACHINE；系统加密保护不代替当前登录用户的账户安全。

## 验证

后端全套 287 项测试、前端 108 项测试通过；Ruff、生成契约与 Skill 资源同步检查通过。实际 Windows DPAPI 测试涵盖保存与重启、隔离/复制/移除/恢复、接口变更、会话覆盖、清除、篡改、损坏、写失败及响应/工程无明文泄露。

已构建新 Windows 程序，使用真实本机 HTTP 和独立模型协议夹具通过 20 项检查：三次进程启动验证保存与清除持久化，确认测试和生成带正确密钥，生成结果保持待审核。报告为 [credentials-package-report.json](verification/credentials-package-report.json)。页面验证输入保存、刷新后读取及单独清除；截图为 [model-local-credentials.png](https://github.com/koronto11/ludo-npc-ai/blob/e96ecb7f7670362fe95fbc83d8c9006085d77099/docs/screenshots/model-local-credentials.png)。

未调用外部模型，未使用用户真实密钥；程序包本机检查仍不等同于干净 Windows 机器验收。已有预览工程修订 227、文件 SHA256 保持原值。

重现程序包测试：

```powershell
backend/.venv/Scripts/python.exe -X utf8 scripts/verify-credentials.py --exe release/npcs-ai-studio-credentials/NPCsAIStudio/NPCsAIStudio.exe --area .local-build/credentials-package-check --report docs/verification/credentials-package-report.json
```
