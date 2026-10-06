# NPCs AI Studio · Windows 体验版

解压后保留整个 `NPCsAIStudio` 文件夹，双击 `NPCsAIStudio.exe`。无需自行安装 Python、Node.js 或数据库，启动后会打开本机浏览器页面。

## 开始创作

1. 在项目菜单新建工程，填写名称、选择保存位置和空白世界或示例；系统自动创建同名项目文件夹。
2. 在关卡画布安排人物出场；进入人物总览完善设定，进入角色工作台编排对白并试玩。
3. 左侧模板提供人物设定和对白结构，支持本地复用。
4. 顶部导出先预览，再保存设计稿、对白表或完整工程备份到项目的 `exports`；也可下载到其他位置。

编辑、模板与试玩可以离线使用。AI 生成需要配置用户自己的兼容接口、模型名称和 API Key；当前版本默认勾选“记住密钥”，保存后刷新或重开自动使用。密钥保存在本机应用数据目录的 credentials.json，由当前 Windows 用户加密，不进入工程或导出。可在模型设置清除；复制配置需重新填写。旧体验包的密钥仍为页面会话输入。

## 文件在哪里

- 默认工程集合位置：当前用户的 `Documents/NPCs AI Studio Projects`；新建工程时可选择其他位置，每个项目建立独立同名文件夹。
- 应用配置与模板：当前用户的 `%LOCALAPPDATA%/NPCs AI Studio`，模板文件为 `templates.json`。
- 升级时若已有旧版目录，继续读取 `%LOCALAPPDATA%/Ludo NPC AI` 和 `Documents/Ludo Projects`，避免配置、模板和旧作品看似丢失。已有设置中选择的工程目录优先；不会自动搬移用户文件。
- `.ludo.json` 扩展名和 JSON 内的旧协议标识继续兼容，它们是文件格式，不是界面品牌名。
- 新项目的工程保存在项目文件夹根目录，恢复副本集中在 `backups`，导出集中在 `exports`。通过「项目 → 打开项目文件夹」直接查看。
- 旧项目继续使用相邻的 `.bak` 与 `.history`；可从「项目 → 整理为项目文件夹」复制当前工程和有效备份到新目录，原文件保留。此前下载到其他位置的文件需要自行移入 `exports`。
- 通过项目菜单「备份恢复」选择恢复点，两种布局都支持。复制整个项目文件夹可一起带走工程、备份和导出；只复制 `.ludo.json` 也可继续编辑，但不带历史和导出。
- 卸载或删除程序文件夹不会删除上述用户数据。工程 JSON 备份不包含独立模板库和模型配置。

## 启动与退出

默认端口为 4174。端口已占用时会选择其他空闲本机端口，并打开正确页面；控制台会打印实际地址。显式指定端口时，冲突会提示并退出。

浏览器页面关闭后，服务仍在运行。需要再次打开时，使用控制台中的地址。退出服务前完成当前编辑、保存工程并等待生成结束，再在控制台按 Ctrl C。

## 与用户 AI 协作

本次协作包附带中英文 Skill。用户的本地 AI 可用 `NPCsAIStudio.exe --skill-bridge` 调用内置协作命令，无需额外安装 Python。正常双击仍启动导演台；桥接命令连接已运行的服务。详见 [AI 协作使用说明](skill-collaboration-guide.md)。旧体验包不包含此入口。

## 撤销与恢复

顶部箭头可撤销/重做已提交的手工编辑，或在输入框以外使用 Ctrl Z、Ctrl Shift Z / Ctrl Y。输入框内保留文字编辑快捷键。未保存的编排先保存或放弃；弹窗开启时不会执行全局撤销。

撤销缓存最多 30 步、8 MB，保存在当前服务会话内；关闭服务、关闭工程、从磁盘重新加载或备份恢复后会重置。已保存文件不依赖缓存，重启后可通过工程备份恢复旧版本。

## 体验版边界

这是本机验证的 Windows 文件夹程序包，尚未在干净机器完成验收，未签名、未提供安装器或自动更新。大工程目前建议分关卡组织；极大画布和全部对白的全工程分析仍需继续优化。CSV 为交付表，尚无专用游戏引擎适配器。

## Interface language and detailed help / 界面语言与详细帮助

控制台左上方选择中文或 English，立即切换菜单、表单、画布操作和提示。偏好由本机应用记住，不写进工程，故事与人物名称保持原文。打开“帮助”按章节或关键词查询完整操作步骤。离线说明见同目录 `user-guide-zh.md` 和 `user-guide-en.md`。

Choose 中文 or English at the top of the console. The local application remembers the preference. Menus, controls and help switch immediately; project names, stories and dialogue stay verbatim. Open Help for chapter navigation and search. Offline manuals are included as `user-guide-zh.md` and `user-guide-en.md`.
