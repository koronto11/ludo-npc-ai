import packageInfo from '../package.json';

// Product updates describe verified local work, rather than published releases.
export const releaseInfo = {
  version: packageInfo.version,
  channel: 'preview',
  updates: [
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
