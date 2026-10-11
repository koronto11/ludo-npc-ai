import packageInfo from '../package.json';

// Product updates describe verified local work, rather than published releases.
export const releaseInfo = {
  version: packageInfo.version,
  channel: 'preview',
  updates: [
    {
      date: '2026-10-11',
      title: {zh: '对白分支、结束节点与快捷删除', en: 'Dialogue branches, endings and quick deletion'},
      changes: {
        zh: ['人物总览新增单人及跨页批量删除，关卡画布支持选中组件后按 Del；确认、引用检查与撤销保护工程内容。','连线设置支持更换目标与删除源选项，画布卡片正文和选项默认展示三行；完善缩放控件与试玩结束样式。','人物默认对白与待关联对白明确分区、用途和创建入口，待关联对白可直接选择出场绑定。','出场与对白目录新增移除关联与确认删除；保留历史试玩记录，支持冲突保护与撤销，移除最后一项不再继承默认对白。','角色工作台的开场规则和结束节点支持拖动、布局保存及撤销；连线随位置更新，一键美化统一重排。','支持多个独立结束节点及可选 NPC 收尾台词；不同分支可分别连接或共用，预演显示最后一句后结束，无需再添加玩家回答。'],
        en: ['Added single and cross-page bulk character deletion and Delete shortcuts for level canvas controls, with confirmation, reference checks and Undo.','Link settings can retarget destinations or delete source choices. Canvas speech and choices show three-line previews; zoom controls and rehearsal completion are clearer.','Clarified character-default and unlinked dialogue sections, creation actions and direct appearance association.','Added confirmed unlink/delete actions to the appearance dialogue list, preserving play records with conflict protection and Undo. Removing the final link no longer inherits default dialogue.','Opening-rule and ending cards can be dragged, saved and undone; attached links follow and Beautify repositions all cards.','Added multiple named endings with optional NPC closing lines. Branches can use separate or shared endings, and rehearsal closes after showing the final line without another player response.'],
      },
    },
    {
      date: '2026-10-10',
      title: {zh: '角色工作台快速文本', en: 'Quick text in the character workbench'},
      changes: {
        zh: [
          '关卡画布新增已有出场成组、紧凑成员列表和成员管理，支持搜索、加入、移出、解散与撤销；保留独立时间和对白。',
          '人物出场组使用铜棕色，NPC 组保留绿色；场景高度适配侧栏内容，排序按钮不再越过边框。',
          '文本列表升级为快速文本，可连续编辑对白标题、说话者、正文、玩家选项和跳转。',
          '新增可收起的分支概览，支持定位正文、返回画布、快捷新增和指定卡片试玩。',
          '快速文本与画布共用草稿和保存保护，旧项目无需转换；新增卡片不会自动接入分支。',
          '完善手机写作空间及中英文帮助，窄屏默认收起概览。',
          '角色画布新增一键美化和撤销，按卡片实际尺寸排版；自动连线避开卡片，分支通道与汇入走线错开。',
        ],
        en: [
          'Added grouping for existing appearances, compact member lists and searchable membership management with addition, removal, dissolution and undo; individual times and dialogue are retained.',
          'Manual appearance groups use copper/brown and NPC groups stay green; scene height accommodates sidebar content to keep reorder buttons inside its boundary.',
          'Upgraded the text list to Quick text for continuous title, speaker, speech, choice and destination editing.',
          'Added a collapsible branch overview, text/canvas locating, keyboard creation and play from a selected card.',
          'Both modes share drafts and save protection. Existing projects need no conversion; new cards are not linked automatically.',
          'Improved mobile writing space and bilingual help; the overview starts collapsed on narrow screens.',
          'Added canvas beautification and undo, with measured card layout, obstacle-aware links, separate branch lanes and fan-in approaches.',
        ],
      },
    },
    {
      date: '2026-10-09',
      title: {zh: '资料排序与工作区伸缩', en: 'Library ordering and collapsible workspace panels'},
      changes: {
        zh: [
          '左侧支持新建关卡，空项目提供创建第一个关卡的入口。',
          '资料支持同级拖动排序、上移／下移和撤销；排序随项目保存，跨分组移动被阻止。',
          '左侧资料库和底部运行面板新增收起／展开按钮，保留已有搜索、分组和预演状态。',
          '补齐关系编辑弹窗组件，并修复开发预览的本机同源访问。',
        ],
        en: [
          'Added level creation in the left library, including a first-level entry for empty projects.',
          'Added sibling drag ordering, move up/down and undo; orders are saved with projects and cross-group moves are blocked.',
          'Added collapse/expand controls for the left library and runtime panel while retaining search, groups and rehearsal state.',
          'Restored the relationship editor component and corrected local same-origin access in the development preview.',
        ],
      },
    },
    {
      date: '2026-10-07',
      title: {zh: '工作台导航与平台介绍', en: 'Workbench navigation and platform overview'},
      changes: {
        zh: [
          '世界底稿改为分区长文编辑，支持规则逐条维护、批量粘贴和放大窗口。',
          '左侧资料新增分类操作菜单、使用位置跳转，以及带引用检查和撤销的删除确认。',
          '理清世界与关卡层级：所属区域和局部描述移入关卡设置，旧资料可明确转移。',
          '新增“关于”：平台介绍、当前版本和更新记录，支持中英文。',
          '完善“世界设定”和“视图”菜单，集中提供设定编辑、面板显示与布局恢复入口。',
          '精简顶部信息，将语言切换放到右侧，保留像素风 NPCs 标识。',
          '调整窄屏顶部布局与弹窗显示，保持帮助和主要操作可见。',
        ],
        en: [
          'Redesigned the world brief with spacious section editing, individual rules, bulk paste and an expanded window.',
          'Added contextual library menus, usage navigation and reference-checked deletion with confirmation and undo.',
          'Separated shared world context from level regions and descriptions, with explicit legacy region transfer.',
          'Added About with a platform overview, current version and update history in Chinese and English.',
          'Expanded World and View menus with setting editors, panel visibility and layout reset.',
          'Simplified the header and moved the language switch to the right, retaining the pixel NPCs wordmark.',
          'Refined narrow-screen header and dialog layouts to keep help and primary actions accessible.',
        ],
      },
    },
  ],
};
