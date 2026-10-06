# NPCs AI Studio · AI 协作 Skill / AI Collaboration Skills

这是一套面向游戏作者的协作 Skill：用户自己的 AI 阅读故事与工程，整理关卡、角色、NPC 组、对白和剧情，NPCs AI Studio 提供展示、校验、审核和预演。无需为这条创作路径再配置 NPCs AI Studio 模型 API Key。

Author-facing collaboration: your AI reads stories and projects, structures levels, characters, NPC groups, dialogue and plot; NPCs AI Studio provides visualization, validation, review and rehearsal. This workflow needs no additional NPCs AI Studio model API key.

## 当前主线版本 / Current mainline

平台与两份 Skill 统一为 **0.1.0 预览版**。版本以根目录 `package.json` 为依据，打包时检查后端一致性并同步到 SKILL.md；故事板 v1、草稿协议 v1、工程 Schema v2 是数据格式版本，保持兼容。

The platform and both Skills share **0.1.0 preview**. Packaging reads the root `package.json`, checks backend consistency and updates SKILL.md. Storyboard v1, draft-proposal v1 and project schema v2 are independent data formats and remain compatible.

当前主线源码：[中文 Skill](../skills/npcs-ai-studio-zh/SKILL.md) · [English Skill](../skills/npcs-ai-studio-en/SKILL.md)。加载时请复制完整的对应语言目录，包括脚本、Schema 和示例。需要 ZIP 时，在仓库根目录运行 `python scripts/package-skills.py --zip`，生成 `release/skills/npcs-ai-studio-zh.zip` 和 `release/skills/npcs-ai-studio-en.zip`；旁边的 `.sha256` 文件用于校验。这些是本地构建产物，不是已发布的下载附件。

The links above open the current mainline Skill sources. Copy the complete language directory, including scripts, schemas and examples. Run `python scripts/package-skills.py --zip` from the repository root to build the two archives under `release/skills/`; adjacent `.sha256` files verify integrity. These are local build outputs, not published release attachments. Replace an existing installed pack with the same language; this update does not change global AI settings.

## 获取与加载 / Load a Skill

中文包：`skills/npcs-ai-studio-zh/`。English pack: `skills/npcs-ai-studio-en/`。

新版调用名为 `$npcs-ai-studio-zh` 和 `$npcs-ai-studio-en`，使用新语言包替换旧安装的 Skill，避免同一工具发现重复版本。The new invocation names are `$npcs-ai-studio-zh` and `$npcs-ai-studio-en`; replace a previously installed language pack rather than loading both old and new copies.

品牌已更新；`.ludo.json` 和 `ludo-*` 协议标识保留，用于读写已有工程与协作文件，不需要修改旧作品。Branding changed; existing `.ludo.json` files and `ludo-*` protocol identifiers remain compatible. Do not rewrite old story files just to update the name.

保留完整文件夹（SKILL.md、references、assets、scripts、agents），放入 AI 工具支持的 Skill 目录或通过其加载界面导入；具体位置取决于该工具。通常选择一份语言包即可，作品语言可以不同。我们没有自动修改用户 AI 工具的全局配置，也没有验证每个平台的自动发现机制。不支持 Skill 的工具可手动提供 SKILL.md 与本次任务所需参考，但不会因此获得本地执行能力。

Keep the whole folder and import it through your AI tool's supported Skill mechanism. Its location depends on the host. Usually choose one language pack; story language remains independent. This delivery does not install global AI settings or certify every host's discovery behavior. A host without Skills can read SKILL.md and relevant references manually, but that does not grant local execution.

## 给 AI 的任务示例 / Example requests

> 使用这份 NPCs AI Studio Skill，将下面的故事整理为独立新工程：先提取世界规则和人物，再拆分关卡场景，安排出场，生成可选择的对白。列出补充设定，校验后保存新文件，告诉我从哪里打开。

> Use this NPCs AI Studio Skill to turn the following story into a separate new project. Extract world rules and characters, split scenes, arrange appearances and create dialogue choices. List inferred details, validate the result, save a new file and tell me how to open it.

> 读取我当前的 NPCs AI Studio 工程，为医师补充人物故事并提交待审核草稿，保留已确认设定，不直接采用。

> Read my current NPCs AI Studio project, add a healer backstory as a pending draft, preserve confirmed fields and leave adoption to me.

> 为这个场景的 4 位 NPC 各写一份对白，每人恰好 2 张卡片（包括开场和分支），每张正文最多 120 个 Unicode 字符。共 4 份对白、8 张卡片，玩家选项不计入。逐人核对数量、长度和跳转后提交待审核候选，不混入其他 NPC 的台词。

> Write one dialogue graph for each of the 4 NPCs in this scene, with exactly 2 cards per NPC including the opening and branches. Limit each card body to 120 Unicode characters: 4 graphs and 8 cards in total, excluding player choices. Check each NPC's count, length and targets, then submit pending candidates without mixing other NPC speakers into their dialogue.

平台模型生成设置不会自动限制外部 AI 的输出；Skill 会指导 AI 自行检查数量与长度。平台生成任务的同批独立 NPC 可连续审核，桥接提案仍保留严格的快照冲突检查。上下调整画布控件属于展示排列，不代表剧情先后。

Platform generation settings do not automatically constrain an external AI; the Skill guides it to check quantity and length itself. Independent NPCs in one platform generation task support sequential review, while bridge proposals retain strict snapshot conflict checks. Vertical canvas order is presentation, not narrative sequence.

## 如何连接 / Connection

1. 启动 NPCs AI Studio，保存当前编辑，使用页面/启动器显示的实际本机 URL。先在 NPCs AI Studio 打开要协作的工程。
2. AI 必须能在用户电脑执行本地命令。云端聊天不能把自己的 localhost 当作用户电脑；无本地能力时，AI 只交付文件/内容，由用户或本地 AI 执行。
3. 使用 Skill 内 `scripts/npc_studio_bridge.py`（Python 3.10+，仅标准库），或新版 Windows 包的 `NPCsAIStudio.exe --skill-bridge`。两种命令参数一致。

Start NPCs AI Studio, save current edits, and use its actual local URL. Open an existing project in NPCs AI Studio first. The AI needs local execution on your computer. Use the standard-library Python helper or the updated Windows executable's built-in bridge; both accept identical arguments.

Windows 示例（替换程序路径和地址，PowerShell 的 `&` 用于调用带引号路径）：

```powershell
& 'C:\NPCs AI Studio\NPCsAIStudio.exe' --skill-bridge --base-url 'http://127.0.0.1:4174' list
& 'C:\NPCs AI Studio\NPCsAIStudio.exe' --skill-bridge --help
```

该地址仅为例子。内置桥接命令不另起服务，连接已经运行的 NPCs AI Studio；没有运行服务时只有离线 compile 可用。旧 Windows 体验包没有此命令和 author-context 接口，应更新至本次协作包。Python 脚本本身仍可离线生成新工程候选；与旧服务协作更新草稿不保证兼容。

The URL is an example. The built-in bridge connects to an already-running service instead of starting a second one. Offline compile works without a service. Earlier Windows builds lack this command and the author-context endpoint; use the collaboration build. Do not assume old services can submit new bridge drafts.

## 两条主要流程 / Main workflows

**故事转新工程**：AI 产出故事板 → compile/validate → import 检查 → 在用户授权下 import --apply 保存独立文件 → 项目菜单打开 → 查看关卡、人物总览、关系画布与角色工作台。基础布局可以继续手动拖动。来源故事和 `notes` 与工程一起保留；只导入结构化内容，不导入 notes。

**已有工程创作**：list/inspect → 读取 `ludo-author-context` 中的 project 和 author_hash → 编写带准确修订号和作者摘要的提案 → draft 检查 → draft --apply → 在草稿审核采用/拒绝。脚本不自动采用、不删除正式对象、不修改世界或关卡结构。

**Story to new project**: storyboard → compile/validate → dry-run import → authorized import --apply → Project/Open → level canvas, character overview, relationships and dialogue workbench. Keep source prose and inference notes alongside the project.

**Existing project**: list/inspect → use project plus author_hash from the context → proposal → validate draft → authorized submission → author review in NPCs AI Studio. No automatic adoption, formal-object deletion or world/level mutation.

`--apply` 是执行开关而非额外授权。脚本拒绝覆盖文件；409/写入结果不确定时停止自动重试并检查当前数据。用户页面尚未提交的表单不包含在服务快照中，请先保存。

`--apply` is an execution switch, not authorization. The bridge refuses file overwrites and automatic write retries. On 409 or an uncertain outcome, inspect current data. Unsubmitted browser forms are absent from snapshots; save first.

## 可运行示例 / Runnable examples

每份语言包包含原创「潮汐小镇」故事板，3 人、1 关卡、2 场景、1 个含 2 人的 NPC 组、3 份对白、2 条关系、1 个事件和1份信件；附正常/受伤试玩输入。无需模型调用。

Each pack includes an original Tide Town storyboard: 3 characters, 1 level, 2 scenes, one 2-member NPC group, 3 dialogue graphs, 2 relationships, 1 event and 1 letter, plus healthy/injured trial inputs. No model calls are needed.

## 维护 / Maintenance

桥接核心源为 `backend/ludo_npc/skill_bridge.py`；中英文分发脚本和 Schema 由 `python scripts/package-skills.py` 同步。修改契约后先生成 schemas，再同步；`--check` 检查漂移，`--zip` 生成不覆盖旧文件的独立语言 ZIP。核心代码一致，说明与示例保持两版语义一致。

Canonical bridge: `backend/ludo_npc/skill_bridge.py`. `python scripts/package-skills.py` synchronizes scripts and schemas; use `--check` for drift and `--zip` for separate language archives. Regenerate schemas before syncing contract changes.

验证用 `python scripts/verify-skills.py`，Windows 版本增加 `--exe PATH_TO_NPCsAIStudio.exe`。这些本机测试不等于所有 AI 工具安装兼容性或干净 Windows 验收。后续可加外部 AI 创作结果的拖入式导入窗口和 MCP 适配。
