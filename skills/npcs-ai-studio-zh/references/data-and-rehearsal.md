# 数据与预演要点

精确字段和必填项按 `assets/project-v2.schema.json` 查找 `$defs.Character/Level/Dialogue/Event/Rule/Condition/Effect`。运行服务若升级，以其 `/api/v2/schema` 和 `/openapi.json` 为准。所有实体、关卡、轨道、锚点、出场、对白节点/选项使用稳定 ID；字符格式为 `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$`。避免跨实体冲突，名称可以中文，ID 不依赖姓名。

条件：`always`、`all/any` 的 `conditions`、`not` 的 `condition`、`variable` 的 `variable_id/comparison/value`、`time` 的 `comparison/value`、`scene` 的 `location_id`、`appearance` 的 `level_id/appearance_id`、`knows` 的 `character_id/fact_id`、`at_location`、`event_occurred`。comparison 为 `eq/ne/gt/gte/lt/lte`。

效果：`set_variable`、`increment_variable`、`grant_knowledge`、`move_character`、`set_behavior`、`unlock_text`。字段从 Schema 确认。它们只改变运行状态，不把预演状态覆盖回作者人物档案。事件/规则没有自动日程、生态模拟或自然语言条件执行能力。

测试输入通过 `/simulate`，核心字段 `at_tick/location_id/level_id/variable_overrides/card_trial`。`card_trial` 含 `dialogue_id/started/use_entry_routes/start_node_id/actions`；actions 为 `{type: variable, variable_id, value}` 或 `{type: choice, option_id}`。

- 默认卡片试玩：`started: true`、`use_entry_routes: false`，从默认/指定卡片开始，仍检查人物出场与对白选项条件。
- 实际入口检查：`use_entry_routes: true`，按顺序匹配条件开场；与玩家选项条件不是一回事。
- 起始受伤状态用 `variable_overrides`；试玩中途改状态用 variable action，不要重放当前卡片进入效果。
- 预演结果检查 `complete/diagnostics/dialogues/log/card_trial`（以实际返回为准）；有 diagnostic 或不可用的对白不要当成功。
- 本 helper 不保存试玩记录，也不自动对候选进行采用。`trial` 只验证实际正式工程。

世界知识：事实 `available_at` 不应晚于初始已知事实的时间；秘密使用显式事实及知识条件/授予效果。单独把 `visibility` 设为 private 不能证明对白不泄密。

大工程分块创作，优先读本次关卡/人物的相关数据；不要把全部记录重复塞给 AI。读取快照后使用保守修订检查，不偷偷“修正”expected_revision。结构通过不代表所有分支都已覆盖；报告具体测试的时间、场景、初始状态和选项序列。

左侧资料库的“…”提供按类型区分的编辑与定位入口。删除先显示范围与引用，再二次确认；有引用时先处理，不能通过隐藏历史记录解除引用。人物删除明确清除自己的初始状态，关卡删除保留共享人物与对白。当前会话可撤销，已保存项目可从备份恢复。

世界底稿控制台采用四个编辑分区，切换保留当前草稿，底部固定保存状态。已确认规则为逐条可编辑的文本约束；批量粘贴每行一条，单条中的换行保留。故事前提、写作风格和每条规则最多 30000 字，规则最多 500 条；放大编辑窗口不改变项目数据。

## 画布排列与故事时间

关卡画布的 NPC 组、人物出场和剧情事件可以混合排列。拖动标题上下调整顺序，插入线表示落点；换到另一场景会更改场景归属，但保留原时间，NPC 组保留每位成员的时长与相对偏移。同一排列行内左右拖动才调整时间；关闭时间轴时不把横向拖动当作时间操作。右边缘手柄调整显示宽度，和标题拖动是不同操作。接近画布边缘会自动滚动，Esc 可取消本次拖动；完成后可用作者撤销/重做。

排列存于 `editor.level_control_orders[level_id]`，键格式为 `appearance:ID/group:ID/event:ID`；宽度存于 `editor.level_control_widths`。这些是展示元数据，不改变故事时间、对白内容或生成作者指纹。叙事顺序应使用实际锚点、出场时间、事件和对白跳转表达，不能靠卡片上下位置触发剧情。场景归属或时间修改属于叙事改动，仍需核对出场、事件作用域及对白条件。

协作时保留既有展示元数据。当前 `ludo-storyboard` 只由编译器生成基础布局，不接受自定义 `editor`；草稿桥接也不提供排列/宽度写入，向作者说明在关卡画布调整，不伪造实体字段来实现。
