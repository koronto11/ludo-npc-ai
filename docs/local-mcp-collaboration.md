# 本地 MCP 协作 / Local MCP collaboration

本地 stdio MCP 将用户自己的 Codex / Claude Code 接到明确标记的对白任务。无需云服务器或额外的工具内模型 API Key。正式修改仍由作者审核采用。

## 使用流程

1. 打开并保存工程，在角色工作台画布配置或快速文本中编辑对白。
2. 点击「标记对白」，选择「当前文字」「选中多张卡片」或「整个对白流程」。当前文字支持 NPC 台词、玩家选项和结束节点收尾台词；没有选中文字时标记当前正文。多卡片可在画布按住 Shift 多选，也可在弹窗中勾选零散卡片。整个流程包括当前打开流程的所有分支、未连接卡片和结束台词，不跨其他流程。
3. 确认路径和文字，填写要求，点击「保存并创建协作任务」。这只在本地创建任务，不会自动发送到智能体聊天；需要在自己的智能体中主动读取。保存失败保留编辑和要求，不创建任务。
4. 首次打开「智能体协作 → 连接 Codex / Claude」，合并当前页面提供的配置，保留客户端已有连接。本工具不改写已安装智能体设置。
5. 在自己的智能体中说：“读取 NPCs 最新标记的任务，按要求提交修改候选。”多个任务时指定人物、卡片或编号。无需复制正文、JSON 或截图。
6. 「协作任务」会更新候选状态。当前文字点击「审核修改候选」进入草稿审核；多卡片任务点击「审核这张卡片」，逐张比较原文、候选和玩家选项，编辑、采用或拒绝。草稿收件箱也支持批量采用已保存候选。逐张采用不会覆盖已采用的其他卡片。
7. 「定位原卡片」回到稳定 ID 对应的卡片。下一轮调整重新标记最新文字，不覆盖旧候选。
8. 任务列表每行右侧的删除按钮直接移除任务，无需确认；可立即「撤销删除」，或进入「已删除」恢复。删除后智能体不能读取该任务或继续提交候选；已有候选仍可在草稿审核中处理，已采用对白不会被删除。恢复保留原任务 ID、上下文和候选关联，原有过期检查仍然生效。

## 多卡片范围与候选

一份多卡片任务最多允许修改 200 张卡片。完整对白流程、世界底稿、相关说话者和当前场景提供为冻结上下文；「选中多张卡片」只允许修改勾选卡片。只允许台词和现有玩家选项的文字，标题、说话者、ID、节点和选项数量、连线、条件、效果保持不变。没有改动的字段和卡片不必提交。任务创建不发送聊天消息，需要在自己的智能体中主动读取。

`npcs_submit_candidate` 的单段调用继续使用 `replacement`。`cards` / `flow` 范围使用结构化 `cards`，服务端按稳定 ID 检查并拆成独立待审核草稿：

```json
{"task_id":"从 npcs_get_task 获取的精确任务 ID","cards":[{"node_id":"已标记卡片 ID","text":"新的 NPC 台词","options":[{"option_id":"现有玩家选项 ID","text":"新的回答文字"}],"explanation":"修改理由"}]}
```

同一任务的不同卡片按顺序采用时，只在能精确证明背景变化来自已采用兄弟候选时继续审核；真实世界/人物改动、同卡片编辑、删除或连接变化仍要求重新比较。采用只合并这张卡片的文字，不用旧节点快照覆盖当前流程。旧单段任务、旧工程文件保持可读，不需要迁移。

## 首次连接

编辑器生成实际解释器/可执行文件路径、实际本机地址和工程 ID。源码通过 `scripts/npcs_mcp.py`，需要已安装项目后端的 Python 环境；打包程序通过 `NPCsAIStudio.exe --mcp`。stdio 由客户端启动，不额外监听 MCP 端口。

Codex 配置合并到本机 `~/.codex/config.toml` 的 `mcp_servers.npcs_ai_studio`；Claude Code 配置通过其 MCP 配置入口添加，或合并到工作目录 `.mcp.json`。按客户端要求批准并重新连接。配置绑定一个工程，换工程或服务地址变化后更新配置。编辑器需保持运行，该工程需已打开。

源码检查入口（使用页面实际参数，不猜端口）：

```text
python scripts/npcs_mcp.py --base-url http://127.0.0.1:ACTUAL_PORT --project-id EXACT_PROJECT_ID
```

| 工具 | 用途 |
| --- | --- |
| `npcs_list_tasks` | 已配置工程的任务摘要，不读取整份工程 |
| `npcs_get_task` | 一个任务的稳定位置、原文、标记范围、用户改动和冻结上下文 |
| `npcs_submit_candidate` | 对刚读取的任务提交范围内的替换文字与说明，仅新增待审核草稿 |

MCP 不自动向现有聊天发送消息、启动推理或采用修改。没有删除作者对象、读取密钥或执行任意命令的工具。

## 数据与兼容性

- 任务存于本地应用数据目录 `agent-tasks/`，包含作品材料，不进入项目导出。正式候选沿用原有项目草稿契约，无项目 schema 变更或旧项目转换。
- 每工程最多 100 个活动任务，活动任务文件上限 20 MB；超限明确拒绝并保留旧文件，不静默删除历史。已删除任务独立保存在 `agent-tasks/deleted/`，不占活动任务数量或文件容量；恢复仍受活动容量限制。删除和恢复不修改工程版本、作者摘要、正式对白或草稿。先写恢复副本再移出活动队列；中断时仍以活动队列为准。
- 位置使用工程/对白/节点/选项稳定 ID 和 Unicode 码点范围，不依赖画布位置、行号或 UTF-16 偏移。
- 冻结上下文包括当前对白流程、世界底稿、说话者资料和选中场景背景。不提供其他工程、初始私密事实库、模型配置或密钥。正文仍可能含作者秘密；云端智能体的模型服务会处理所提供的材料。
- 标记前的文字仅是编辑器提供的改动说明；冲突判断使用服务端正式原文与作者摘要，不能通过改动说明绕过。
- 提交检查准确原文和作者摘要。作者内容变更返回冲突；草稿或显示布局修订不会允许覆盖作者字段。
- 服务端只接收范围内替换文字并自行构造节点列表，验证假设采用后的完整工程；不接收智能体传入的任意节点、连线或字段。
- 相同任务、相同候选重交不重复新增草稿；不同候选需重新标记。写入结果不确定时先读取状态，不自动重试。
- 审核沿用作者摘要、字段基准、保存和共享撤销；刷新不会覆盖工作台未保存草稿。
- 本次只增加 Windows `--mcp` 源码入口，未发布新可执行程序；新 Windows 包和干净机器验收属于后续发布工作。

## English quick start

Save a local project. In the role workbench choose **Mark dialogue**, then **Current text**, **Selected cards** or **Entire dialogue flow**. Confirm instructions and choose **Save and create collaboration task**. This creates a local task; it does not send a chat message. Add the generated stdio configuration once to your Codex or Claude Code. Keep the editor running and the configured project open.

Ask: “Read the latest NPCs collaboration task and submit candidates following its instructions.” The agent lists tasks, reads the exact task and submits replacement text for the marked range or structured changes for marked cards. Inspect the result under **Agent collaboration → Agent tasks** and review each candidate card. Only NPC speech and existing player-choice text can change; titles, speakers, IDs, connections, conditions and effects remain intact. **Locate source card** returns to the stable-ID location. Mark updated text again for another round. Tasks support quick deletion, undo and restoration without deleting their candidates or adopted dialogue.

The adapter uses the Python standard library and installed backend, with no new runtime SDK or cloud server. Configuration is scoped to one project. Tasks remain in app data; model keys, other projects and initial secret fact stores are excluded. Cloud agents still send the provided story context to their model service. No installed client settings are rewritten and no adoption is automatic. The Windows dispatcher requires a future newly built package; old executables do not acquire this feature merely from a README change.

## Sources and verification

- [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Codex MCP](https://developers.openai.com/codex/mcp/)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)

Local protocol/browser checks and actual user-agent model runs are different evidence. An official Python MCP SDK client can verify stdio, tool discovery and candidate submission; it does not prove a user's installed Codex/Claude configuration or model output quality.
