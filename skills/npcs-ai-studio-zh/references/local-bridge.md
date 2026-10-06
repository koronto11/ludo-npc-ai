# 本地协作桥接

Windows 协作包也可用 `NPCsAIStudio.exe --skill-bridge` 代替命令里的 `python scripts/npc_studio_bridge.py`，其余参数不变，先确定用户实际程序路径。它调用已有服务，不额外启动导演台。早期 Windows 包无此入口。

从 Skill 文件夹执行以下命令。`LOCAL_URL` 表示用户当前 NPCs AI Studio 的实际本机地址，`PROJECT_ID` 从 `list` 选择；替换示例占位值，不假设端口。脚本需要 Python 3.10+，无第三方依赖。

## 故事转换与新工程

```text
python scripts/npc_studio_bridge.py --base-url LOCAL_URL compile --input storyboard.json --output candidate.ludo.json
python scripts/npc_studio_bridge.py --base-url LOCAL_URL validate --input candidate.ludo.json
python scripts/npc_studio_bridge.py --base-url LOCAL_URL import --input candidate.ludo.json --destination ABSOLUTE_NEW_PROJECT_PATH
python scripts/npc_studio_bridge.py --base-url LOCAL_URL import --input candidate.ludo.json --destination ABSOLUTE_NEW_PROJECT_PATH --apply
```

`compile` 会生成新的工程 ID、人物关系画布和对白卡片坐标；带本机地址时先通过 NPCs AI Studio 校验再写文件。无地址也能编译，但结果尚未通过完整校验，不得报告“已验证”。输出目标已存在就拒绝写入。

`import` 默认只检查；`--apply` 才导入并保存。目标必须是已有文件夹中的新绝对路径；不覆盖现有文件，不复用服务里已经打开的工程 ID。导入与保存是两次调用；若保存失败，工程可能仍在服务内存中，按打印的工程 ID 检查，再在 NPCs AI Studio 另存为，不能直接再次导入。保存成功后用「项目 → 打开」选择该文件；脚本不强制切换用户页面。

## 读取已有工程

```text
python scripts/npc_studio_bridge.py --base-url LOCAL_URL list
python scripts/npc_studio_bridge.py --base-url LOCAL_URL inspect --project-id PROJECT_ID --output snapshot.json
```

`list` 只列出服务已经打开的工程，不扫描电脑。未打开工程让作者在 NPCs AI Studio 打开。输出为 `ludo-author-context`：`project` 是工程快照，`author_hash` 是服务端同一快照的作者摘要。提案的 `project_id/expected_revision` 从 `project` 读取，`expected_author_hash` 从此摘要读取。快照包含作者秘密和作品文本，保留在用户指定本地位置；不读取模型连接配置。修改既有作品前，注意用户页面的未提交表单不在服务快照中，应先让作者保存当前编辑。

## 提交实体候选

提案示例：

```json
{
  "format": "ludo-draft-proposal",
  "version": 1,
  "project_id": "project-EXACT-ID-FROM-SNAPSHOT",
  "expected_revision": 1,
  "expected_author_hash": "EXACT-AUTHOR-HASH-FROM-SNAPSHOT",
  "changes": [{
    "target": {"kind": "character", "id": "EXISTING-CHARACTER-ID"},
    "operation": "update",
    "name": "药师故事补充",
    "patch": {"story": "作者已审阅上下文后的故事候选。"},
    "source_refs": []
  }]
}
```

```text
python scripts/npc_studio_bridge.py --base-url LOCAL_URL draft --project-id PROJECT_ID --input proposal.json
python scripts/npc_studio_bridge.py --base-url LOCAL_URL draft --project-id PROJECT_ID --input proposal.json --apply
```

每份提案 1–10 个目标，每目标一个候选，`expected_revision` 必须是编写时快照的准确修订号，不自行修改它来绕过冲突。默认校验“假设采用后”的完整工程和待审核记录；`--apply` 才新增草稿并保存，正式人物字段仍保持原值。进入「草稿审核」点击卡片查看，作者自己决定采用或拒绝。

支持 `character/location/faction/fact/variable/event/rule/dialogue/text`，字段遵循对应实体 Schema。`update` 必须存在；`create` 使用新的稳定 ID，`patch` 提供必填字段。不得修改 `id/kind/confirmed_fields`，受保护字段的变更会拒绝。新增候选不能引用尚未采用的其他候选；先采用依赖对象再提交下一轮，或把整段新故事做成独立工程。

`source_refs` 只列真实已存在的依据对象，不捏造服务商或生成任务。来源标记为外部 AI 协作。候选使用服务端作者摘要作为审核基准，不在客户端猜算摘要；外部提案的内容基准变化后必须在导演台重新比较。

为既有 NPC 出场创建/更新对白，可提供 `scene_context`，精确字段见项目 Schema 的 `SceneGenerationContext`：`level_id/track_id/location_id/appearance_id/group_name/mode/start_tick/end_tick`。`mode` 为 `people`，对白归属必须对应出场人物，时间必须在出场范围内；采用后由 NPCs AI Studio 链接出场。不要用 `pool` 冒充 NPC 组。

## 连续审核与冲突

平台自身生成任务中登记的同批独立 NPC 场景对白，可以逐份审核采用。如果内容变化只来自同批其他独立 NPC 的采用及对应出场链接，服务端会核对原始基准，无需仅为这种变化重新比较。它不自动采用其他候选，也不改写历史基准。世界规则、人物设定、场景安排或已采用正文发生人工修改，同一 NPC 的多个候选，以及无法证明独立性的记录仍需显式重新比较。需要修改候选时先保存草稿再采用，让服务端能核对实际采用值。

桥接提交的外部 AI 提案没有平台生成任务登记，不享有上述同批判断；一次提交多个人物也不能绕过基准检查。仍保留准确 `expected_revision/expected_author_hash`，遇到 409 重新读取并比较，不能为消除提示伪造 `task_id`、生成记录或修改修订号。不要把这项审核优化解释为桥接能够调用平台模型或自动采用。

## 预演

```text
python scripts/npc_studio_bridge.py --base-url LOCAL_URL simulate --project-id PROJECT_ID --input trial.json --output trial-result.json
```

示例输入在 `assets/trial-injured.json` 与 `assets/trial-healthy.json`。仅读取与计算，不保存试玩记录；输出文件已存在时拒绝覆盖。未指定 `expected_content_revision` 时使用读取时的当前内容修订。对白改动须先由作者采用，否则执行的是旧正式内容。

## 异常与能力边界

- 409：快照过期；读取新快照，比较原提案，再生成新的提案，不盲目重试。
- 422：字段、类型、引用或条件不合法；核对运行服务的 `/api/v2/schema` 和 `/openapi.json`。
- 超时/连接中断：写入可能已经生效；按回执 ID 和工程内容检查，不重复提交。
- 提交后保存失败：草稿可能仍在服务内存；在 NPCs AI Studio 保存。不要重启服务来“修复”。
- 密钥、云服务、模型测试均不在此脚本范围；用户自己的 AI 完成创作，不必再调用 NPCs AI Studio 的模型接口。
