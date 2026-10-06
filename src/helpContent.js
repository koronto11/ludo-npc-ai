// The same chapter IDs drive both languages and the offline manuals.
export const helpSections=[
 {id:'start',zh:{title:'从零开始一个项目',intro:'NPCs AI Studio 用于规划文本式 NPC、人物故事、场景出场、关系和对白分支。它不生成游戏内模型，也不运行游戏引擎。手工编辑与试玩可以离线完成；只有远程模型生成需要联网。',steps:[
 '打开工具后，先保存当前作品。点击左上角「项目 → 新建本地项目」。',
 '填写项目名称，例如“荒原营地”；选择保存位置，例如 D:/我的项目。系统会预览将要创建的同名项目文件夹。',
 '项目文件名默认跟随名称，也可以单独调整。自己创作选“空白世界”，学习操作可以选“营地关卡示例”等起点。',
 '点击「创建项目文件夹」。如果同名目录已经存在，请换名称或保存位置；工具不会覆盖它。新建不会删除之前保存的作品。',
 '先填写项目共享的世界底稿，再创建关卡。在关卡设置中填写所属区域与关卡描述，接着搭场景、添加人物、安排出场，最后编排对白和剧情。旧项目区域可在指定关卡设置中移入，保存后清除旧字段。无需配置模型也能走完这条手工流程。',
 '需要生成时再选择模型、写创作要求。结果先进入草稿，审核采用后才进入正式作品。'],notes:[
 '看到未保存提示时，先保存，或明确放弃当前未保存编辑。已经保存的文件不会因为切换项目而删除。',
 '完成一次编辑后等待顶部“已保存到文件”，也可以按 Ctrl + S。表单里的内容需点击相应保存按钮后才算提交。']},en:{title:'Start a project from scratch',intro:'NPCs AI Studio plans text-based NPCs, character stories, appearances, relationships and dialogue branches. It does not create in-game models or run a game engine. Manual editing and play work offline; remote-model generation needs an internet connection.',steps:[
 'Save your current work, then choose Project → New local project in the top-left menu.',
 'Enter a project name, such as “Wasteland camp”, and choose a parent location such as D:/My projects. The dialog previews the same-name folder it will create.',
 'The filename initially follows the project name and can be adjusted. Choose Blank world for your own work, or a sample such as Camp level example to learn the workflow.',
 'Click Create project folder. If that folder already exists, change the name or location; it will not be overwritten. Previously saved projects remain.',
 'Write the shared world brief, then create levels. Set each level’s region and description before building scenes, adding characters and arranging appearances. Old region data can be moved into a chosen level in its settings; saving clears the old field. Then edit dialogue and story rules. This manual workflow needs no model.',
 'For generation, choose a model and describe your requirements. Results become drafts first and enter official content only after review.'],notes:[
 'If you see an unsaved warning, save or explicitly discard pending edits. Switching projects does not delete saved files.',
 'After submitting an edit, wait for Saved to file or press Ctrl + S. Form fields are not submitted until their own Save action succeeds.']}},
 {id:'layout',zh:{title:'认识工作区与常用操作',intro:'以“场景中谁在何时说什么”为主线使用工具。人物档案是共享资料，出场是它在某次关卡场景中的安排，对白是可复用或绑定到出场的文本流程。',steps:[
 '顶部“视图”用勾选状态控制左侧资料库、右侧属性面板和底部时间线。“专注画布”暂时隐藏这些面板，再次点击恢复；“恢复默认布局”按屏幕尺寸恢复常规布局。页面自带卡片详情时，独立属性面板选项会说明并禁用。',
 '左侧资料库用于查找关卡、人物、世界规则和文本；下方“生成与审核”显示生成中、待审核和失败数量。',
 '关卡画布安排场景、时间、出场、NPC 组和剧情事件；人物总览集中查找和分组；关系画布规划对象关系。',
 '角色工作台按人物的具体出场组织对白，中央编排卡片，右侧试玩。草稿审核集中管理候选和失败记录。',
 '画布工具栏提供选择、移动、连线、高亮或适合画布等操作；实际按钮随工作区变化。空格拖动画布，缩放后用“适合画布”找回内容。',
 '有未保存编排时，切换会显示顶部选择：不保存并跳转、保存并跳转、取消。取消保留当前编辑，保存失败不会跳转。'],notes:[
 '界面语言切换只改变操作文案，不翻译人物姓名、故事、对白、分组或场景名称，也不改变当前编辑。',
 '顶部撤销/重做与关卡工具栏共用编辑记录。Ctrl + Z 撤销，Ctrl + Shift + Z 或 Ctrl + Y 重做；输入框和弹窗内保留自身操作。']},en:{title:'Workspaces and everyday controls',intro:'Work around “who appears where and when, and what they say”. A shared character profile defines a person. An appearance places that person in a particular level and scene. Dialogue is a reusable or appearance-linked text flow.',steps:[
 'View uses checkmarks for the library, inspector and timeline. Focus workspace temporarily hides these panels; click it again to restore them. Restore default layout uses the current screen size. Pages with their own card details explain and disable the separate inspector option.',
 'The left library finds levels, characters, world rules and text. Generation and review below shows active, pending and failed counts.',
 'The level canvas arranges scenes, time, appearances, NPC groups and story events. Characters provides central search and grouping; the relationship canvas plans connections.',
 'The character workbench organizes dialogue by specific appearance. Edit cards centrally and play on the right. Draft review collects candidates and failure records.',
 'Canvas toolbars offer selection, panning, connections, highlighting or Fit canvas as appropriate. Hold Space to pan; use Fit canvas to find content after zooming.',
 'Leaving unsaved dialogue opens a top panel: Discard and leave, Save and leave, or Cancel. Cancel keeps edits; failed saving prevents navigation.'],notes:[
 'Interface language changes controls only. Character names, stories, dialogue, groups and scenes remain verbatim, as do pending edits.',
 'Global and level undo share one edit journal. Ctrl + Z undoes; Ctrl + Shift + Z or Ctrl + Y redoes. Inputs and dialogs retain their own editing behavior.']}},
 {id:'world',zh:{title:'世界底稿、事实与变量',intro:'世界底稿提供共同写作约束；事实和变量为明确条件提供数据。自然语言的“世界规则”不会自动变成可执行剧情规则。',steps:[
 '点击顶部“世界设定 → 世界底稿”或左侧“世界规则”，填写整个项目共享的世界名称、故事前提、写作风格和已确认规则。底稿分为基础信息、故事前提、已确认规则、写作风格；切换分区保留输入，可放大窗口。规则逐条编辑，批量粘贴时每行一条；底部固定保存状态与“保存并关闭”。正文、风格和每条规则最多 30000 字，规则最多 500 条。区域与局部故事背景在关卡设置中填写；左上角显示“世界 / 当前关卡”，点击各自名称打开对应设置。',
 '顶部“世界设定 → 地点与区域 / 阵营”可查看、新建和编辑共享资料，无关卡时也可使用。点击左侧地点或阵营可打开完整资料：名称、类型描述、说明、标签，以及地点所属关系或阵营政策。点击人物打开档案，点击对白或文本打开对应编排入口。',
 '世界底稿的关闭、Esc 和点击弹窗外侧都会检查未保存修改，提供保存并关闭、不保存并关闭、继续编辑。保存失败保留输入；其他页面改了同一字段时不会覆盖。',
 '顶部“世界设定”可直接进入世界事实、故事变量和全局剧情规则。关卡画布的“全局规则与资料”或左侧“剧情与文本资料”仍可定义这些资料及初始状态。',
 '事实记录内容、真实性、公开范围和可获知时间；“公开”不等于所有人物知道，需要设置人物初始认知或授予认知效果。',
 '变量支持布尔、数值和文字。例如“玩家受伤”用布尔，默认否；“信任”用数值，默认 0。',
 '在条件中引用这些变量或事实，在效果中设置值、增加数值或授予知识。人物未知的秘密应与已知资料分开。'],notes:[
 '模型可以引用世界资料，但结构检查不能自动证明自然语言没有泄密或矛盾，仍需作者审核。',
 '初始状态是故事起点定义；试玩中调整玩家变量只改变测试，不覆盖人物档案或世界初始定义。']},en:{title:'World brief, facts and variables',intro:'The world brief supplies shared writing constraints. Facts and variables supply explicit condition data. Natural-language world rules do not automatically become executable story rules.',steps:[
 'Open World settings → World brief, or World rules in the library, and enter the project-wide world name, premise, writing style and confirmed rules. The editor has Basic information, Premise, Confirmed rules and Writing style sections; switching retains input and the window can expand. Edit rules individually or paste one rule per line. Save status and Save and close remain fixed at the bottom. Premise, style and each rule support up to 30000 characters, with up to 500 rules. Put regions and local story context in level settings. The breadcrumb shows World / Current level; click either name to open its settings.',
 'World settings → Locations and regions / Factions lists, creates and edits shared assets, even before a level exists. Click a location or faction in the library to open its full data: name, role, description, tags, and parent location or faction policies. Characters open their profile and dialogue or text opens its authoring entry.',
 'Closing the world editor, pressing Escape or clicking outside checks unsaved changes. Choose Save and close, Close without saving or Continue editing. Failed saves retain your input; concurrent changes to the same field are not overwritten.',
 'World settings opens facts, variables and global story rules directly. Global rules and data on the level canvas or Story and text data in the library also provides these resources and initial state.',
 'Facts include content, truth status, visibility and availability time. Public does not mean every character knows it; set initial knowledge or grant it through an effect.',
 'Variables support Boolean, Number and String. For example, Player injured can be Boolean with a false default; Trust can be Number with a zero default.',
 'Reference variables or facts in conditions. Effects set values, increment numbers or grant knowledge. Keep unknown secrets separate from known information.'],notes:[
 'Models can use world context, but structural checks do not prove prose is free of leaks or contradictions. Author review remains necessary.',
 'Initial state defines the story starting point. Changing player variables during play changes the test, not character profiles or world initial definitions.']}},
 {id:'levels',zh:{title:'关卡、时间轴与出场',intro:'关卡画布的横轴是时间或剧情阶段，纵轴是有序场景。它展示人物出现的时机与地点，而不是游戏地图坐标。',steps:[
 '点击“新建关卡”，设置名称和起点场景；通过“场景与锚点”补充场景轨道、地点引用和时间锚点。',
 '时间横轴和场景纵轴可独立开关。剧情阶段当前对应故事时钟的整数位置，相同数值表示同时发生。',
 '双击或按 F2 修改轴标题；Enter 保存，Esc 取消。右键可编辑、移除、选择标记颜色与图标；轴末尾可以直接追加节点。',
 '拖动时间锚点左右调整时间，调整场景顺序改变上下排列。颜色和图标用于作者识别，不是剧情效果。',
 '拖入人物或点击“安排人物”，选择场景和出现区间。拖动人物控件移动出场，拖动两端调整开始和结束，也可打开“配置出场”。',
 '人物、NPC 组与事件可混合上下拖动排列；出现插入线后松开。上下排序或换场景会保留时间；同一行左右拖动调整时间。靠近画布边缘会自动滚动，Esc 取消。隐藏时间横轴后仍可上下排列；排列可以撤销，且不影响草稿审核依据。',
 '人物可重复出场，各次出场共享档案，但拥有独立条件、行为说明与对白。移除出场不会删除人物。',
 '“对白联动检查”核对明确的场景/时间条件。启用“跟随本次出场”后，移动出场或锚点可改变对白可用范围；共享对白会先复制为此次专用版本。'],notes:[
 '移除锚点会解除绑定并保留原有时间。移除场景会保留待安排的出场；有关联剧情作用范围时需先解决引用。',
 '计划行为是安排说明。要在预演中改变人物状态，需要明确设置对白效果或剧情规则。']},en:{title:'Levels, time axes and appearances',intro:'The horizontal axis represents time or plot phases; the vertical axis contains ordered scenes. This plans when and where characters appear, rather than game-map coordinates.',steps:[
 'Click New level, set its name and first scene, then use Scenes and anchors to add tracks, world-location links and time anchors.',
 'Time and scene axes can be toggled independently. Plot phases currently map to integer world-clock positions; equal values mean simultaneous actions.',
 'Double-click or press F2 to rename axis labels. Enter saves, Esc cancels. Right-click to edit, remove or assign marker colors/icons. Append nodes at either axis end.',
 'Drag time anchors horizontally and reorder scenes vertically. Colors and icons are author markers, not story effects.',
 'Drag in a character or click Arrange characters, then choose a scene and interval. Drag the control to move an appearance, adjust its endpoints or open Configure appearance.',
 'Drag appearances, NPC groups and events vertically into a mixed order; release at the insertion line. Reordering or switching scenes preserves times. Horizontal movement within the same row adjusts time. Canvas edges auto-scroll and Esc cancels. Vertical arrangement works with the time axis hidden, supports undo, and does not invalidate draft review.',
 'Characters can appear repeatedly. Appearances share the profile but have separate conditions, behavior notes and dialogue. Removing an appearance keeps the character.',
 'Dialogue linkage check inspects explicit scene/time conditions. Follow this appearance lets moves change dialogue availability; shared dialogue is copied before becoming appearance-specific.'],notes:[
 'Removing an anchor detaches bindings while retaining times. Removing a scene keeps unassigned appearances; linked story scopes must be resolved first.',
 'Planned behavior is a note. Runtime changes require explicit dialogue effects or story rules.']}},
 {id:'characters',zh:{title:'人物档案、分组和快速备注',intro:'人物总览显示全项目角色。人物档案定义身份、故事和认知，分组方便管理，快速备注帮助作者回忆设定。它们与场景中的 NPC 组用途不同。',steps:[
 '人物总览的“创建人物”只创建人物档案，填写姓名、身份、角色定位和简介，创建后留在人物总览；地点、阵营等使用各自入口。也可以生成并审核人物草稿。在人物总览选中角色，点击编辑档案，继续填写故事、性格、口吻、目标、底线和待定信息。',
 '逐字段勾选保护，可阻止模型候选覆盖已确认设定。保护不阻止作者手工编辑。',
 '卡片的快速备注在人物总览与关系画布共享，保存在工程内；它仅供作者记忆，不进入生成上下文或预演。右侧长故事可以展开或收起。',
 '点击分组标签或右键菜单的“管理分组”。一个人物可以同时属于多个分组。选中多个人物后，可批量加入、移出或移动某一项归属。',
 '批量操作中的横线表示成员归属混合：不改动保留原样，勾选全部加入，取消全部移出。改名遇到同名组会合并成员；解散分组保留人物、其他分组和出场。',
 '查看卡片出场数量，定位某次关卡出场，或打开相应场景对白。搜索和批量选择覆盖全部结果，分页每页 60 张卡片。'],notes:['一般人物分组是档案标签；场景 NPC 组是出场的集合。改一个不会自动改另一个。']},en:{title:'Profiles, groups and quick notes',intro:'Characters shows profiles across the project. A profile defines identity, story and knowledge; groups organize the library, while quick notes remind the author of concepts. These differ from scene NPC groups.',steps:[
 'Create character in Characters opens a character-only form for name, identity, narrative role and summary, and keeps you in Characters after creation. Use the respective entries for locations and factions. You may also review a generated character draft. Select Edit character profile to continue with story, personality, voice, goals, boundaries and uncertainties.',
 'Protect individual fields to stop model candidates overwriting confirmed details. Protection does not prevent manual author edits.',
 'Quick notes are shared by Characters and the relationship canvas and saved in the project. They do not enter generation context or rehearsal. Long stories in the inspector can be expanded or collapsed.',
 'Click a group tag or Manage groups in the card menu. A character may belong to several groups. Select multiple characters to add, remove or move one membership in bulk.',
 'A dash means mixed membership: leave unchanged to preserve it, check to add all, uncheck to remove all. Renaming to an existing group merges members. Dissolving keeps characters, other groups and appearances.',
 'Use appearance counts to locate a level appearance or open its dialogue. Search and bulk selection cover all results; pages contain 60 cards.'],notes:['Profile groups are tags; scene NPC groups collect appearances. Changing one does not automatically change the other.']}},
 {id:'relationships',zh:{title:'关系画布与高亮',intro:'关系画布集中展示人物及其相关对象，帮助检查阵营、地点、故事关系和人物联系。关系说明本身不会自动产生运行效果。',steps:[
 '从资料库拖入对象，或通过“添加节点”引用已有对象。引用人物不会复制档案。',
 '拖动卡片调整位置，通过连接点或“建立关联”连接对象，设置关系名称、方向、类别和说明。双击连线可编辑。',
 '通过姓名、身份、分组、关卡、场景或关系类型筛选。关系列表还能查找未显示在当前画布中的关系。',
 '选中人物后点击“高亮关联”，突出它、直接关联对象和相关连线；再次点击恢复全部。普通选中不会自动启用高亮。',
 '卡片菜单可以打开人物档案、管理分组、查看出场、进入角色工作台；快速备注与人物总览同步。'],notes:['如果想让某段剧情改变人物关系或行为，需要编排可执行条件与效果；不要仅依赖关系线上的自然语言说明。']},en:{title:'Relationships and highlighting',intro:'The relationship canvas shows characters and related objects to review factions, locations, story connections and personal ties. A relationship description does not automatically create runtime effects.',steps:[
 'Drag objects from the library or reference them through Add node. Referencing a character does not duplicate its profile.',
 'Move cards and connect their ports or use Connect. Set the relationship name, direction, category and description. Double-click a link to edit.',
 'Filter by name, identity, group, level, scene or relationship category. The relationship list also finds links outside the current canvas view.',
 'Select a character and click Highlight connections to emphasize it, direct associates and incident links. Click again to show all. Selection alone does not activate highlighting.',
 'Card actions open profiles, manage groups, show appearances or open the character workbench. Quick notes synchronize with Characters.'],notes:['If a story should change behavior or state, author executable conditions and effects; natural-language link descriptions are not sufficient.']}},
 {id:'dialogue',zh:{title:'对白卡片、玩家选项与连线',intro:'角色工作台把对白配置与试玩放在同页。先选择人物的具体出场，再组织这次场景的对白；未关联或通用对白保留在独立折叠区。',steps:[
 '从人物卡片、关卡出场或 NPC 组成员进入“编排 / 试玩”。左侧选择出场下的对白；没有对白时新建场景对白，也可关联已有对白。',
 '编辑卡片标题、说话者和正文。添加玩家选项后，点击选项文字或编辑按钮，输入玩家说的话并保存。',
 '拖动选项出口到目标卡片连接，或在选项编辑器中指定跳转。没有目标表示结束对话；可以汇合，也可以有意循环。',
 '条件决定卡片或选项是否可用，效果在进入卡片或选择选项时执行。长文本保留完整编辑窗口，不需要在小卡片中挤着写。',
 '默认开场与条件开场决定从哪里开始。条件开场按顺序匹配；希望玩家主动选择时，将条件设在玩家选项上。',
 '点击连线可以标色、添加并拖动走线控制点；双击点移除，恢复自动走线或默认颜色。连线标记不改变对白条件与运行结果。',
 '点击“保存编排”后再试玩保存内容。切换对白、出场或页面时，顶部会处理未保存编辑。'],notes:['共享对白被修改后，引用它的出场也会更新。需要只修改一次出场时，先创建或复制专用对白。']},en:{title:'Dialogue cards, choices and links',intro:'The character workbench combines editing and play. Select a specific appearance, then organize its scene dialogue. Common and unlinked dialogues remain in separate collapsible sections.',steps:[
 'Open Edit / Play from a character, appearance or NPC member. Select dialogue under the appearance. Create scene dialogue or link existing dialogue if needed.',
 'Edit the card title, speaker and text. Add a player choice, then click its text or Edit button to enter the response and save.',
 'Drag a choice output to its destination card or set the destination in its editor. No target ends dialogue. Paths may merge or intentionally loop.',
 'Conditions govern card or choice availability. Effects run on card entry or choice selection. Long text has a full editor rather than being confined to a small card.',
 'Default and conditional openings select the start card. Conditional routes are checked in order. Put a condition on the player choice when the player should choose actively.',
 'Click links to color them or add draggable routing points. Double-click a point to remove it; reset automatic routing or default color. Markers do not change dialogue execution.',
 'Save dialogue before playing saved content. Switching dialogue, appearance or page invokes the top unsaved-edit panel.'],notes:['Editing shared dialogue updates every linked appearance. Create or copy dedicated dialogue when changing only one appearance.']}},
 {id:'npc-groups',zh:{title:'批量背景 NPC 与环境文本',intro:'默认批量流程会先创建真实的人物档案和出场，关卡画布显示一个 NPC 组控件。每个 NPC 有自己独立的台词，可以逐人修改和试玩。',steps:[
 '在目标场景点击“添加 NPC 组”，填写组名、人数、身份组合、出场时间、话题和氛围。每批支持 1–10 人。',
 '可以只创建后手工写台词，也可以创建并生成。人物和出场先建立；模型请求失败仍保留 NPC，不会要求全部重建。',
 '画布控件显示组内成员。展开后可逐人编辑台词、编排 / 试玩、查看待审核候选；拖动右侧边缘可以调整宽度。',
 '生成时一项对应一个 NPC。检查候选是否只有这个人物说话，是否符合场景与世界边界；采用后绑定到它的确切出场。',
 '台词生成设置中的“每人对白卡片数”准确包含开场与全部分支，玩家选项不计数。每人支持 1–6 张；每张台词长度为简短（最多 120 字符）、适中（240）或详细（480），包含标点与空格。提交前查看人数乘卡片数的总量与单项输出上限；tokens 上限包含正文、选项和结构，实际用量以服务商返回为准。',
 '再次生成沿用已有成员，已有正式台词先保留，待新草稿采用后更新。失败项可以单独重试。',
 '拖动组标题移动场景与时间，会保留每个成员的区间差异；在组设置保存统一时间则会统一所有成员区间。解散保留人物和出场。'],notes:[
 '“高级：无指定人物的背景文本”仅创建环境文字，不创建 NPC 档案，不显示 NPC 组控件。适合公告、传言或不需要逐人管理的氛围句。',
 '数量或长度不符时仅该项失败，显示具体原因，不自动额外调用模型修补。已完成草稿与服务商报告用量保留；手动重试仅处理失败项并沿用原数量和长度。字符和 tokens 上限不能撤销已发生的服务商费用。',
 '一份环境文本里写了多个说话人，也不会自动创建相应人物。需要可单独管理的村民，请使用 NPC 组。']},en:{title:'Batch NPCs and background text',intro:'The default batch workflow first creates character profiles and appearances, then shows an NPC group on the level canvas. Every member has separate dialogue for editing and play.',steps:[
 'Click Add NPC group in the target scene. Set its name, count, identity mix, interval, topics and atmosphere. A batch supports 1–10 members.',
 'Create the group and write manually, or create and generate. Characters and appearances exist before requests; failures keep the NPCs.',
 'Expand the canvas group to edit each member, open Edit / Play or review candidates. Drag the right edge to resize the control.',
 'One generation item represents one NPC. Check that only this member speaks and that content respects the scene and world. Adoption links dialogue to its exact appearance.',
 'Cards per NPC includes the opening and every branch card, excluding player choices. Choose 1–6 cards and text length: Short (up to 120 characters), Medium (240) or Detailed (480), including punctuation and spaces. Before submitting, check the member-count × card-count total and per-item output cap. The token cap includes prose, choices and structure; actual usage comes from the provider.',
 'Regeneration reuses existing members. Official dialogue remains until a new draft is adopted. Retry failed items separately.',
 'Dragging the group header moves scene and time while preserving individual intervals. Saving a shared interval applies it to all members. Dissolving keeps profiles and appearances.'],notes:[
 'Advanced anonymous background text creates text only, with no profiles or group control. Use it for notices, rumors or ambience that needs no per-person management.',
 'A count or length mismatch fails only that item with a specific reason; no extra model call repairs it automatically. Completed drafts and reported usage are retained. Manual retry sends failed items only and keeps their count and length settings. Character and token caps cannot reverse provider charges already incurred.',
 'Multiple speaker names in background prose do not create characters automatically. Use an NPC group for individually managed villagers.']}},
 {id:'plot',zh:{title:'剧情事件、条件与效果',intro:'剧情规则融合在关卡导演台，无需再维护一块独立剧情画布。事件按计划时间等待条件，规则检查条件；每个预演分支内各触发一次。',steps:[
 '在场景中添加剧情事件，把卡片放到相应时间；打开“条件 / 效果”配置计划时间、锚点、关卡和场景范围。',
 '选择触发条件，例如到达时间、玩家变量满足数值、人物知道事实或指定事件已发生。可组合全部满足、任一满足和取反。',
 '添加效果，例如设定变量、增加信任、授予知识、改变地点或行为、解锁非对话文本。行为备注不会替代效果。',
 '事件绑定锚点后，锚点移动会同步计划时间。已到时间但条件未满足的事件继续等待，不属于执行失败。',
 '本关卡剧情管理局部事件与规则；“全局规则与资料”管理跨关卡数据。没有绑定关卡的旧定义保持全局。',
 '预演时选择正确关卡、场景和时间，查看变化记录中的条件原因与前后状态。实际效果由 Python 校验和执行。'],notes:['当前不支持周期日程或自动生态推理。自然语言故事描述需要作者或协作 AI 转成明确条件与效果，才能在预演中执行。']},en:{title:'Story events, conditions and effects',intro:'Story rules live in the level director rather than a separate story canvas. Events wait for conditions after their scheduled time; rules check conditions. Each fires once per rehearsal branch.',steps:[
 'Add an event to a scene and place it at the desired time. Open Conditions / Effects to set its time, anchor and level/scene scope.',
 'Choose conditions such as time reached, variable comparison, character knowledge or another event occurring. Combine All, Any and Negate.',
 'Add effects: set variables, increase trust, grant knowledge, change location or behavior, or unlock text. Behavior notes do not replace effects.',
 'Moving a bound anchor updates event time. An event past its time but waiting for conditions is not an execution failure.',
 'Level story manages local events and rules; Global rules and data manages cross-level definitions. Unscoped legacy definitions remain global.',
 'Rehearse the correct level, scene and time. Inspect condition reasons and before/after states in changes. Python validates and executes the effects.'],notes:['Periodic schedules and automatic ecology reasoning are not implemented. Authors or their AI must convert prose into explicit conditions and effects for execution.']}},
 {id:'models',zh:{title:'配置模型与 API Key',intro:'手工创作无需模型。使用工具内置生成时，需要提供兼容 chat/completions 文本接口的连接。多套模型可以同时启用，但不代表它们会自动协作。',steps:[
 '打开顶部“模型设置”，添加配置，填写便于识别的名称、远程/本机类型、接口地址、模型 ID 和 API Key。接口与模型 ID 以服务商提供的信息为准。',
 '接口一般填写兼容服务的基础地址；本机 HTTP 用于本地服务，远程地址使用 HTTPS。不要把密钥写进地址或故事文本。',
 '仅在服务确实支持时启用流式文本或 JSON 输出。调整输出上限、超时与重试次数；请求重试也可能产生用量。',
 'Windows 默认“记住密钥”，使用当前用户加密保存在本机应用数据目录，下次自动使用。也可选择仅本次会话；其他系统暂为会话输入。',
 '点击“测试连接”发送一次小请求，成功后保存并启用配置。在“用途与默认模型”设置通用默认，以及人物、故事、对白、文本用途。',
 '生成窗口可以为本次任务临时选择模型。已经提交的任务保留原配置来源，后来改名或移除不改变历史。',
 '复制配置不复制密钥；改变接口地址、连接类型或协议需要重新填写密钥。清除密钥在当前配置单独执行。移除配置可恢复。'],notes:[
 'API Key 不进入项目、备份导出、模板或 Skill。多个项目共用本机模型配置，不需要每个项目重新设置。',
 '测试成功只证明当次小请求可用，不保证生成结构或创作质量。远程生成会把选定世界与人物上下文发给你选择的服务商。']},en:{title:'Model profiles and API Keys',intro:'Manual creation needs no model. Built-in generation requires a compatible chat/completions text endpoint. Several profiles may be enabled; this does not imply automatic model collaboration.',steps:[
 'Open Model settings and add a profile. Enter a recognizable name, remote/local type, endpoint, model ID and API Key using the provider’s information.',
 'Use the compatible service’s base endpoint. HTTP is for local services; remote endpoints use HTTPS. Do not put keys in URLs or story text.',
 'Enable streaming or JSON output only if the service supports it. Adjust output limits, timeout and retries; retries can incur usage.',
 'Windows defaults to Remember key, encrypted for the current user in local application data and reused next time. Session-only is available; other systems currently use session input.',
 'Test connection sends one small request. Save and enable the profile, then assign general and character/story/dialogue/text defaults under Purposes and default models.',
 'Override the model for an individual generation task if desired. Submitted jobs retain their original provenance after profile edits or archiving.',
 'Copying profiles never copies keys. Changing endpoint, connection type or protocol requires re-entering the key. Clear a profile’s saved key explicitly. Archived profiles can be restored.'],notes:[
 'Keys never enter project backups, exports, templates or Skills. Projects share local model settings; no repeated setup is required.',
 'A successful small test does not guarantee structured generation or creative quality. Remote generation sends selected world and character context to your chosen provider.']}},
 {id:'drafts',zh:{title:'生成、草稿审核与失败重试',intro:'一批多份草稿通常是多个独立目标，不是只能选一份的竞赛候选。审核决定哪些字段进入作品，生成成功本身不会覆盖正式内容。',steps:[
 '从具体人物生成故事，或从场景 NPC 组批量生成台词；也可通过“生成角色”创建新设定。先保存工程，确认目标、模型、允许字段和创作要求。',
 '每批 1–10 项，最多两项并发。进度可展开查看，任务可以取消；已经完成的草稿保留。',
 '打开“草稿审核”，按待审核、已采用、已拒绝、失败等分类查看卡片，或按批次筛选。点击卡片打开全文弹窗。',
 '先阅读正文、目标人物和场景；需要时展开字段差异、条件与保护标记。编辑候选后保存，再采用选中字段。已保护字段不能由模型覆盖。',
 '如果生成依据已经变化，重新比较当前内容并明确确认过期草稿后再采用。系统不会偷偷覆盖你后来的编辑。',
 '采用后通过对应场景或人物入口查看正式内容。NPC 组台词会绑定到各自出场；匿名环境文本只加入场景文本。',
 '失败项没有可采用文本，可单独重试或删除记录。删除草稿或失败记录可撤销、恢复，不会删除已经采用的正式内容。'],notes:['候选里的多个人名不会自动变成多个人物。一项 NPC 草稿应只对应一个 NPC；目标与采用位置应以弹窗显示的信息为准。']},en:{title:'Generation, draft review and retries',intro:'A batch usually contains independent targets, not a choose-one competition. Review determines which fields enter your work; generation success alone does not overwrite official content.',steps:[
 'Generate a story from a specific character, dialogue from a scene NPC group, or profiles through Generate characters. Save first and check the target, model, allowed fields and requirements.',
 'Batches contain 1–10 items with at most two concurrent requests. Expand progress or cancel a task; completed drafts remain.',
 'Open Draft review and choose Pending, Adopted, Rejected or Failed, or filter by batch. Click a card to open full details.',
 'Review text, target character and scene. Expand field differences, conditions and protection as needed. Save candidate edits, then adopt selected fields. Protected fields cannot be overwritten by models.',
 'If context changed, compare again against current content and explicitly review stale drafts. Later author edits are not silently overwritten.',
 'After adoption, view content in its scene or character. NPC group dialogue links to each member’s appearance; anonymous background text enters scene text only.',
 'Failures have no adoptable text. Retry one item or delete its record. Draft and failure deletion is recoverable and does not remove adopted official content.'],notes:['Multiple names inside prose do not create multiple characters. One NPC draft should target one NPC; check the displayed target and adoption destination.']}},
 {id:'play',zh:{title:'试玩、玩家状态与历史记录',intro:'全局预演是跟随关卡画布的场景故事流，遵守正式对话入口。角色工作台的默认卡片试玩用于快速测试指定对白。两种方式都会检查人物出场、卡片和选项条件。',steps:[
 '在全局预演中，右侧展示当前场景、时间和条件下的在场人物与 NPC 组。点击人物的“交谈”，在中间卡片上选择玩家回答。没有编排对白的人物仍显示在场，交谈按钮不可用。',
 '进入场景、触发事件与规则、符合条件的环境文本、人物台词和玩家回答按发生顺序进入故事流；可以向上滚动查看早先内容。文本每次访问场景只显示一次，离开后回访可再次显示。',
 '点击“玩家状态”统一选择关卡、场景、时间和初始变量，再“应用并重新开始”。尚未保存的试玩会提示保存、放弃或取消；已保存的试玩直接重开。这里只调整本次测试，不修改作者出场或初始变量。',
 '在“接下来可以”选择场景、等待一个时间单位或推进到下一个时间锚点。当前对话未结束时，切换场景需要确认；离开会保留对白记录，返回后可继续。底部故事时间线、变化记录、生成记录和问题检查保留原有用途。',
 '全局预演的“试玩记录”冻结保存对白、环境文本和操作条件，支持查看、删除和恢复。“按当前内容重放操作”用当前已保存作品执行原操作，原历史文本不会被覆盖。旧记录只有操作路径。工程试玩记录可按关卡、角色卡片或全部来源查看；角色工作台列出此人物的记录，并提供全工程记录入口。角色卡片记录需回到角色工作台重新试玩。',
 '窄屏角色工作台使用“编排 / 试玩”切换，“选择出场与对白”打开目录；切换面板保留未保存编排和临时试玩状态。全局预演入口位于工作区导航，小屏还有固定播放图标。',
 '若提示内容版本已变化，点击“载入最新工程”。有未保存作者编辑时先选择保存、放弃或取消；载入失败不会悄悄丢弃编辑。旧操作路径失效时，可在诊断旁“重新开始”。',
 '角色工作台的卡片试玩：保存编排后，在右侧点击“开始试玩”。默认从指定卡片开始，选择玩家回答继续。点击“重新试玩”从本次起点重新开始。',
 '选项不可用时，先看按钮旁的原因。例如要求“玩家受伤”为是，在该选项附近把玩家受伤勾选为是，再尝试选择。',
 '玩家状态调整保留当前卡片，不会把当前节点进入效果重复执行。它只影响本次测试，不修改作者初始变量。',
 '如果要检查真实开场，在更多菜单选择“验证剧情入口”。当受伤条件入口指向“处理伤口”时，受伤为是会直接进入该节点，这是开场规则的作用。',
 '需要玩家从开场主动选择治疗时，把受伤条件设在治疗选项上，而不是用条件入口自动跳转。卡片试玩可单独测试，不需要删掉正式开场规则。',
 '在“试玩记录”保存本次过程并命名。新记录保留当时的对白、玩家选择、初始设置和变化快照；点击记录查看。',
 '记录支持删除、撤销和在已删除列表恢复。“按当前剧情重新试玩”使用原玩家设置重新开始，保留旧记录，不覆盖旧文本。'],notes:[
 '旧版保存分支只有测试输入和操作路径，没有历史对白快照，工具会明确标记，不能据此还原当时的文字。',
 '若人物不在当前关卡、场景或出现区间，先检查测试时间与出场配置。全局时间回放中的未来输入需先分叉，再添加新的过去动作。',
 '关卡试玩只使用已保存和已采用的内容，不调用模型续写。故事流显示最多 2048 条，单条冻结记录最多保存 384 条；过长时请缩短试玩范围。']},en:{title:'Play, player state and saved records',intro:'World rehearsal presents a scene story flow driven by the level canvas and authored entry routes. Default card play in the role workbench tests a specified dialogue card quickly. Both enforce character presence and card/choice conditions.',steps:[
 'On narrow screens, switch between Edit and Play. Choose appearance and dialogue opens the library. Pane switching preserves author drafts and temporary play state. World rehearsal stays in workspace navigation, with a fixed play icon on small screens.',
 'If the content version is outdated, click Load latest project. Pending author edits require save, discard or cancel; failed loading does not silently discard edits. Invalid old paths offer Restart beside the diagnostic.',
 'In World rehearsal, the right panel shows characters and NPC groups present in the current scene, time and conditions. Click Conversation, then choose responses on the central card. Characters with no authored dialogue remain visible with a disabled conversation button.',
 'Scene entries, triggered events and rules, available environmental text, NPC speech and player responses appear in execution order. Scroll up to inspect earlier content. Each text appears once per scene visit; leaving and revisiting allows it to appear again.',
 'Open Player state to select level, scene, time and initial variables, then Apply and restart. Unsaved play prompts you to save, discard or cancel; saved play restarts directly. These settings affect the test, not authored appearances or initial variables.',
 'Use Next actions to choose a scene, wait one time unit or advance to the next time anchor. Leaving an unfinished conversation requires confirmation. Its transcript remains and you can resume on return. The existing bottom timeline, changes, generation history and diagnostics keep their functions.',
 'Play records in World rehearsal freeze dialogue, environmental text and input conditions. View, delete and restore them here. Replay actions with current content executes the original inputs against the currently saved project without overwriting historical text. Legacy records contain paths only. Project play records filter by level, character card or all sources. The role workbench lists this character’s records and links to project-wide history. Card records replay only in the role workbench.',
 'For role-workbench card play, save dialogue, then click Start playing on the right. It starts at the specified card; choose responses to continue. Play again returns to that starting point.',
 'For an unavailable choice, read its reason. If it requires Player injured = Yes, enable that variable beside the choice, then try selecting it.',
 'Player adjustments keep the current card without executing its entry effects twice. They affect this test only, not author-defined initial variables.',
 'Use Verify story entry in More to check real opening routes. If an injured route points to Treat injury, setting injured to true enters that card directly because of the opening rule.',
 'To let the player choose treatment from the opening, put the injury condition on the treatment choice rather than an automatic entry route. Card play can test it without deleting official opening rules.',
 'Save and name the session in Play records. New records retain the dialogue, choices, initial settings and state snapshots. Click a record to view it.',
 'Delete records recoverably, undo or restore from Deleted. Play again against current story reuses original player settings while keeping the old record and text.'],notes:[
 'Legacy branches contain inputs and action paths but no historical dialogue snapshots. They are labeled accordingly; old wording cannot be reconstructed.',
 'If a character is absent, check level, scene, time and appearance conditions. In world replay, fork before adding past actions when future inputs remain.',
 'Level play uses saved and adopted content without model continuation. The story flow displays at most 2048 frames; a frozen record holds at most 384. Shorten the play scope when it is too long.']}},
 {id:'files',zh:{title:'本地文件、保存、恢复与搬迁',intro:'每个新项目拥有独立同名文件夹。世界、人物、对白、布局、草稿和试玩记录都在工程 JSON 中，备份与导出集中存放。无需外部数据库。',steps:[
 '新建选择的是父级保存位置。下次新建仍使用父级，不会误建进当前项目里面。项目改名不会自动重命名磁盘目录。',
 '“项目 → 打开项目文件夹”可直接查看工程。重新使用作品时，选择“打开本地项目”，从最近项目选择，或打开该文件夹中的 .ludo.json。',
 '已提交编辑自动保存到绑定文件，也可 Ctrl + S。表单、对白编排和候选编辑需先提交各自保存按钮。等待“已保存到文件”后再退出。',
 '“另存为”创建新的工程文件并继续编辑它，保留原文件，不覆盖已有目标。旧单文件布局仍兼容。',
 '旧作品可选择“整理为项目文件夹”，复制当前工程与有效备份，原文件保留。此前下载到其他位置的导出需自己移入 exports。',
 '“备份恢复”提供上一份有效保存及最近 20 个历史恢复点。恢复会替换当前内容和布局，包括未保存编辑，并先保留当前正式文件。',
 '保存完成后复制整个目录，可以带走工程、备份和导出；只复制 .ludo.json 也能打开，但不带历史。搬迁后打开新位置的工程文件。'],notes:[
 '本机模型配置、密钥和模板库独立存放，不随项目搬迁。密钥由当前 Windows 用户加密，换电脑需要重新配置。',
 '编辑撤销是本次服务会话的最多 30 步、8 MB 缓存，重启后用文件备份恢复。关闭浏览器不等于关闭本机服务。'],code:'我的项目/\n  荒原营地/\n    荒原营地.ludo.json\n    .npcs-project.json\n    backups/\n      previous.ludo.json\n      history/\n    exports/'},en:{title:'Local files, saving, recovery and moving',intro:'Each new project has a same-name folder. Its JSON includes world, characters, dialogue, layouts, drafts and play records. Backups and exports stay together; no external database is required.',steps:[
 'Choose a parent save location when creating a project. The next project uses that parent rather than nesting inside this project. Renaming a project does not rename its disk folder automatically.',
 'Use Project → Open project folder to inspect files. Continue through Open local project, Recent projects, or the folder’s .ludo.json file.',
 'Submitted edits save automatically; Ctrl + S also saves. Forms, dialogue and candidate editors require their own Save actions first. Wait for Saved to file before exiting.',
 'Save as creates a new file and continues editing it, keeping the original and refusing existing destinations. Legacy single-file projects remain compatible.',
 'Organize into a project folder copies the current project and valid backups while preserving originals. Previously downloaded exports must be moved into exports manually.',
 'Backup recovery offers the previous valid save and the latest 20 history points. Recovery replaces current content and layout, including unsaved edits, and first backs up the current official file.',
 'After saving, copy the entire folder to take the project, backups and exports. Copying only .ludo.json also works but omits history. Open the file at its new location.'],notes:[
 'Local profiles, keys and templates live separately and do not move with projects. Keys are encrypted for the Windows user; configure them again on another computer.',
 'Edit undo is a server-session cache bounded to 30 steps and 8 MB. Use file backups after restart. Closing the browser does not stop the local service.'],code:'My projects/\n  Wasteland camp/\n    Wasteland camp.ludo.json\n    .npcs-project.json\n    backups/\n      previous.ludo.json\n      history/\n    exports/'}},
 {id:'templates-export',zh:{title:'模板复用与内容交付',intro:'模板用于复制结构起点，导出用于交付正式内容或备份整个工程。它们都不会替代草稿审核。',steps:[
 '左侧选择“模板”，查看内置人物设定或对白结构，也可从已保存人物和对白保存自己的模板。模板库跨项目共用。',
 '复用人物模板创建新人物，不复制分组、认知、出场和保护标记。复用对白模板保留正文、选项与跳转，原条件、效果、开场规则和说话者被移除。',
 '使用对白模板时重新选择人物；可选择具体出场，使新对白跟随它的条件。检查移除数量与新条件后再投入使用。',
 '顶部“导出”选择关卡设计稿 Markdown、对白表 CSV 或工程备份 JSON。设计稿/表格可按关卡或全工程；工程备份包含全部工程。',
 '生成预览并检查内容，再保存到项目 exports 或下载到其他位置。重复集中保存产生新文件名，不覆盖旧导出。工程已变更时需重新预览。',
 '设计稿和对白表仅含正式内容；工程备份还包含布局、草稿与记录，但都不包含模板库、模型配置或密钥。'],notes:['设计稿包含作者秘密设定，以及未按关卡过滤的全局上下文，交给玩家前请自行检查。CSV 是通用对接表，当前没有专用游戏引擎适配器。']},en:{title:'Templates and content handoff',intro:'Templates copy reusable starting structures. Exports hand off official content or back up a whole project. Neither replaces draft review.',steps:[
 'Select Templates in the library to preview built-in profiles or dialogue structures. Save your own from existing saved content. The library is shared across projects.',
 'Character templates create new profiles without groups, knowledge, appearances or protection flags. Dialogue templates retain text, choices and links but remove source conditions, effects, opening routes and speakers.',
 'Choose a character again when applying dialogue templates. Optionally bind a specific appearance so dialogue follows its gate. Review removal counts and new conditions before use.',
 'Export Level design notes (Markdown), Dialogue table CSV or Project backup JSON. Notes/tables support a level or the whole project; project backups always contain the whole project.',
 'Generate and inspect a preview, then save to project exports or download elsewhere. Repeated folder saves create new filenames. If the project changes, prepare a fresh preview.',
 'Notes and tables contain official content only. Backups also include layouts, drafts and records, but exclude templates, profiles and keys.'],notes:['Design notes include author secrets and unfiltered global context. Review before sharing with players. CSV is a generic integration table; no dedicated game-engine exporter exists yet.']}},
 {id:'ai',zh:{title:'与自己的 AI 工具协作',intro:'中英文 Skill 可以帮助用户的 AI 将故事变成可视化工程，或给已有工程提交待审核修改。这条协作路径不需要另配工具内的模型 API Key。',steps:[
 '获取完整 skills/npcs-ai-studio-zh 或 skills/npcs-ai-studio-en 文件夹，通过自己的 AI 工具支持的 Skill 方式加载，通常选择一种语言即可。',
 '故事转新工程：让 AI 提取世界规则、人物、关卡、场景、出场和对白，将推断的补充设定列出来，校验后保存独立新文件，再从项目菜单打开。',
 '已有工程协作：先在工具中打开项目并保存编辑，让 AI 读取当前工程上下文，为具体人物或对白提交待审核草稿，保留已确认设定。',
 '本地 AI 需要能在你的电脑执行命令，使用 Skill 的桥接脚本，或新版 NPCsAIStudio.exe --skill-bridge，连接工具实际运行地址。',
 '云端聊天没有本地执行能力时，只能交付内容或文件，由用户或本地 AI 执行。AI 云端的 localhost 不是你的电脑。',
 '回到草稿审核比较并采用。工程发生版本冲突时，让 AI 重新读取上下文再提案，不能用旧快照强行覆盖。'],notes:['协作桥接不自动采用、不读取密钥、不执行任意命令。Skill 生成的独立单文件可通过“整理为项目文件夹”集中管理。'],code:'任务示例：\n使用 NPCs AI Studio Skill，把下面的故事整理为独立新工程。\n提取世界规则与人物，拆分关卡场景，安排出场并编排对白。\n列出补充设定，校验后保存新文件，告诉我从哪里打开。'},en:{title:'Collaborate with your own AI',intro:'The Chinese and English Skills help your AI turn stories into visible projects or propose reviewable edits. This collaboration path needs no additional built-in model API Key.',steps:[
 'Get the complete skills/npcs-ai-studio-zh or skills/npcs-ai-studio-en folder and load it through your AI tool’s supported Skill mechanism. Usually choose one language pack.',
 'For a new story project, ask the AI to extract world rules, characters, levels, scenes, appearances and dialogue, list inferred additions, validate and save a separate file. Open it from Project.',
 'For an existing project, open it and save your edits first. Ask the AI to read current author context and propose drafts for specific characters or dialogue while preserving confirmed fields.',
 'A local AI needs command execution on your computer. Use the Skill bridge script or a recent NPCsAIStudio.exe --skill-bridge against the tool’s actual running URL.',
 'Cloud chat without local execution can only deliver content or files for you or a local AI to run. The cloud AI’s localhost is not your computer.',
 'Review and adopt proposals in Draft review. On revision conflicts, ask the AI to reread context before proposing again, rather than overwriting from an old snapshot.'],notes:['The bridge does not auto-adopt, read keys or run arbitrary commands. Single-file Skill outputs can be organized into project folders.'],code:'Example request:\nUse the NPCs AI Studio Skill to turn this story into a separate project.\nExtract rules and characters, split level scenes, arrange appearances and dialogue.\nList inferred additions, validate, save a new file and tell me how to open it.'}},
 {id:'troubleshooting',zh:{title:'常见问题与处理顺序',intro:'先分清是编辑未提交、条件未满足、模型请求失败，还是文件保存失败。不同问题的处理方式不同，不要反复重新生成整个项目。',steps:[
 '新选项不能输入：点击选项文字或编辑按钮，在编辑窗口填写并保存；新增选项按钮只负责创建。',
 '受伤为是却跳过开场：检查是否在验证剧情入口，以及条件入口是否直接指向治疗卡片。想手动选择治疗，用选项条件；快速测试用卡片试玩。',
 '看不到原来的试玩记录：打开角色工作台右侧“试玩记录”，检查当前人物/对白及已删除列表。未点击保存的临时试玩不会成为历史快照。',
 '模型请求失败：先看失败原因，核对地址、模型 ID、配置是否启用、密钥是否有效，以及 JSON/流式能力是否匹配。仅重试失败项；远程重试可能产生费用。',
 '提示本机会话失效：页面会尝试恢复；仍失败时确认本机服务在运行，使用启动器显示的实际地址。不要把服务部署到公网来解决本机会话问题。',
 '保存失败或文件冲突：保留页面编辑，检查目录权限、磁盘空间和占用。外部编辑过工程时重新打开核对，或另存副本，不覆盖未知新内容。',
 '对象没显示：清除搜索/分组/场景筛选，适合画布，检查关卡选择与待安排出场；删除记录也可从已删除列表恢复。',
 '想查看生成采用结果：人物故事在档案，NPC 台词在组成员的对白，匿名文本在场景内容。草稿数量不等于自动创建的人物数量。'],notes:['结构化条件与引用校验已经实现；自然语言一致性、全部服务商兼容性、周期生态和专用引擎导出不能视为已完成。Windows 体验包已在本机检查，干净机器发行验收仍待完成。']},en:{title:'Troubleshooting and next actions',intro:'Distinguish unsubmitted edits, unmet conditions, provider failures and file-save failures. Their remedies differ; do not regenerate an entire project repeatedly.',steps:[
 'Cannot type in a new choice: click its text or Edit button, enter text in the editor and save. Add choice only creates the row.',
 'Injured skips the opening: check whether Verify story entry is active and its injury route targets treatment. Use a choice condition for an active player decision; card play for quick testing.',
 'Missing play history: open Play records on the character workbench, check the selected character/dialogue and Deleted records. Unsaved temporary play is not a historical snapshot.',
 'Model requests fail: read the reason, check endpoint, model ID, enabled profile, key validity and JSON/streaming support. Retry failed items only; remote retries may incur charges.',
 'Local session expired: the page attempts recovery. If it still fails, ensure the local service is running and use the launcher’s actual URL. Exposing the service publicly is not a session fix.',
 'Save failure or file conflict: keep page edits and check permissions, disk space and locks. If externally edited, reopen and compare or save a copy rather than overwriting unknown changes.',
 'Missing objects: clear search/group/scene filters, fit the canvas and check the selected level or unassigned appearances. Restore deleted records from their Deleted list.',
 'Find adopted content: character stories live in profiles, NPC dialogue under group members, and anonymous text in Scene content. Draft count does not imply a count of created characters.'],notes:['Structured checks exist, but automatic prose consistency, universal provider support, periodic ecology and dedicated engine exporters are not complete. Windows packages have local checks; clean-machine release acceptance remains outstanding.']}},
 {id:'details',zh:{title:'查看与补充更多资料',intro:'主要创作内容保持在原来的编辑入口；额外说明和标签默认折叠，展开“更多资料”即可填写。标签不会替你设置条件或执行故事效果。',steps:[
 '关卡画布 → 场景与时间锚点：关卡、每个锚点和场景轨道都有“更多资料”。右键轴节点 → 编辑，也可修改同一份资料。',
 'NPC 组 → 设置：展开“更多资料”填写组说明与标签。只改名称、说明和标签会保留成员各自的时间；修改统一时间才会将所有成员设为同一范围。',
 '剧情事件或条件规则 → 编排：展开“更多资料”编辑标签；事实、变量和非对话文本在剧情资料中编辑。非对话文本的资料说明独立于正文。',
 '角色工作台 → 对白编排区域顶部的“更多资料”：编辑当前对白的说明和标签，然后点击“保存编排”。',
 '工程试玩记录或角色工作台的试玩记录 → 旧记录详情 → 旧记录说明与备注 → 编辑记录资料：补充说明、标签与备注。随机种子只读；原来的条件、时间和操作路径不会因备注编辑而改变。',
 '资料标签每行一条。编辑后点击当前表单的保存按钮；关闭未保存表单时可选择保存、不保存或继续编辑。'],notes:[
 '轴节点的颜色和图标是画布标记；NPC 组的场景分组与人物总览的角色标签分组分别管理。',
 '旧记录没有当时的对白快照，名称来自当前内容；新版冻结试玩记录仍保持不可覆盖，重新试玩会创建独立记录。']},en:{title:'View and add more details',intro:'Primary authoring fields remain in their original editors. Optional descriptions and tags are collapsed under More details. Tags do not set conditions or execute story effects.',steps:[
 'Level canvas → Scenes and time anchors: the level, each anchor and each scene track have More details. Right-click an axis node → Edit to change the same information.',
 'NPC group → Settings: expand More details to add a description and tags. Changing names or metadata preserves member intervals; changing the common interval applies it to every member.',
 'Event or rule → Author: expand More details for tags. Facts, variables and non-dialogue texts are edited in Story resources. A text description is separate from its body.',
 'Role workbench → More details above the dialogue editor: edit the current dialogue’s description and tags, then Save authoring.',
 'Project play records or role play records → Legacy record detail → Legacy description and notes → Edit record details: add descriptions, tags and notes. The seed is read only; notes do not change the original conditions, time or action path.',
 'Enter one tag per line and use the form’s Save action. Closing a changed form offers Save, Discard or Continue editing.'],notes:[
 'Axis colors and icons are canvas markers. Scene NPC groups and the character overview’s tag-based groups are separate.',
 'Legacy records lack historical dialogue snapshots and show current names. New frozen records remain immutable; replaying creates a separate record.']}}
,
 {id:'library-actions',zh:{title:'左侧资料库：编辑、定位与删除',intro:'条目右侧的“…”提供对应资料的操作，单击条目和拖入画布仍按原来的方式工作。',steps:[
 '关卡菜单可打开画布、编辑关卡设置；人物菜单可编辑档案、打开角色工作台或查看关系；地点、阵营、事件、对白和文本使用各自的编辑入口。',
 '点击“查看使用位置”，选择具体关卡、场景或出场。一个地点在多关卡复用时分别列出，定位场景后会标记对应轨道。',
 '点击“删除”后核对确认框中的对象类型、名称和删除范围，再点击“确认删除”。关卡删除保留共享人物、地点和对白；人物删除同时清除其自己的初始状态。',
 '被出场、对白、剧情条件、预演输入、草稿或生成记录引用的资料不能直接删除。确认框列出关联入口，请先查看并处理；隐藏历史记录不会解除引用。',
 '删除后可点左侧“撤销删除”，也可使用顶部撤销。后续发生新的编辑后，快捷提示收起，顶部撤销按最新操作执行。已保存项目可通过“项目 → 备份恢复”查看删除前的恢复点。',
 '鼠标经过或选中条目显示“…”；触屏始终显示。键盘 Tab 可聚焦按钮，Enter 打开菜单，上下方向键选择，Escape 关闭。分类标题菜单用于新建或管理，不会删除整个分类。'],notes:[
 '撤销缓存属于本次服务会话，受步数和大小限制；超过限制或重启后使用项目备份恢复。',
 '历史试玩文字快照保留。旧版预演输入和生成记录仍有引用约束，不能为删除一个人物而静默删除这些记录。']},en:{title:'Library: edit, locate and delete',intro:'The ellipsis beside an item offers actions for its asset type. Single-click and drag-to-canvas behavior is preserved.',steps:[
 'Level menus open the canvas or settings. Character menus edit profiles, open the role workbench or show relationships. Locations, factions, events, dialogue and text use their dedicated editors.',
 'Choose View usages, then select the exact level, scene or appearance. Reused locations are listed separately for each scene. Scene navigation highlights the destination track.',
 'Choose Delete, review the type, name and scope, then Confirm deletion. Deleting a level retains shared characters, locations and dialogue. Deleting a character also clears its own initial state.',
 'References from appearances, dialogue, plot conditions, rehearsal inputs, drafts or generation records block deletion. Open the listed usages and resolve them first. Hiding a historical record does not remove its references.',
 'After deletion, use Undo deletion in the library or the header undo button. A later edit dismisses the shortcut; header undo follows the most recent operation. Saved projects retain recovery points under Project → Backup and recovery.',
 'The ellipsis appears on hover or selection and remains visible on touch devices. Tab focuses it, Enter opens the menu, arrow keys select an action and Escape closes it. Collection menus create or manage items; they never delete the entire collection.'],notes:[
 'Undo is limited by the current server session, step count and cache size. Use project backups after a restart or when the cache limit is exceeded.',
 'Frozen play transcript snapshots are retained. Legacy rehearsal inputs and generation history keep reference constraints and are never silently deleted to remove a character.']}}

];

export function searchHelp(query,language){const needle=query.trim().toLocaleLowerCase();return helpSections.filter(s=>!needle||JSON.stringify(s[language]).toLocaleLowerCase().includes(needle)||s.id.includes(needle));}
