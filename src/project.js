export const PROJECT_VERSION = 1;
export const STORAGE_KEY = 'ludo-director-project-v1';

const entity = (id, kind, name, role, position, details = {}) => ({ id, kind, name, role, position, ...details });
export function createProject() {
  return {
    version: PROJECT_VERSION,
    name: '灯港失踪案',
    world: {
      name: '灯港', district: '码头区', revision: 1,
      premise: '灯港依靠鲸油贸易生存。最近三个月，海上失踪人数不断增加。',
      rules: ['公会控制航运与工作机会', '城内禁止公开使用亡灵术'],
      tone: '克制、悬疑；人物有自己的生活与利益。',
    },
    entities: [
      entity('eve', 'character', '伊芙', '船医', { x: 475, y: 205 }, {
        tier: '关键角色', goal: '找到失踪的弟弟', boundary: '不伤害无辜者',
        knows: '船员身上出现异常伤口', unknown: '失踪案幕后组织',
        summary: '在旧港诊所救治船员，始终没有放弃寻找弟弟。', locked: true,
      }),
      entity('lorn', 'character', '洛恩', '码头工头', { x: 160, y: 102 }, {
        tier: '支线角色', goal: '维护工人生计', boundary: '不出卖工人',
        knows: '公会扣留了失踪船员的工资', unknown: '伊芙弟弟的去向', summary: '与伊芙相互信任',
      }),
      entity('mela', 'character', '梅拉', '酒馆老板', { x: 905, y: 88 }, {
        tier: '支线角色', goal: '保护来往客人', boundary: '不泄露客人的隐私',
        knows: '码头的传闻与伊芙去向', unknown: '传闻背后的真实原因', summary: '掌握码头传闻\n提供伊芙去向',
      }),
      entity('kas', 'character', '卡斯', '巡逻队员', { x: 65, y: 251 }, {
        tier: '支线角色', goal: '执行公会命令', boundary: '不伤害家人',
        knows: '公会的搜查名单', unknown: '搜查名单的真正目的', summary: '执行公会命令',
      }),
      entity('clinic', 'location', '旧港诊所', '地点', { x: 480, y: 32 }, { summary: '伊芙的常驻工作地' }),
      entity('guild', 'faction', '港务公会', '阵营', { x: 75, y: 422 }, { summary: '控制航运与工作机会' }),
      entity('relic', 'event', '遗物出现', '故事事件', { x: 478, y: 445 }, {
        day: 2, requiresEvidence: false, enabled: true, affects: ['eve'], summary: '玩家获得弟弟的遗物',
      }),
      entity('retaliation', 'event', '公会报复', '故事事件', { x: 916, y: 270 }, {
        day: 3, requiresEvidence: true, enabled: true, affects: ['eve', 'lorn', 'mela'], summary: '证据公开后触发报复',
      }),
      entity('lighthouse', 'dialogue', '灯塔见面', '条件对话', { x: 840, y: 454 }, {
        summary: '伊芙已离开诊所', characterId: 'eve', text: '诊所已经不安全了。你来之前，有人搜过我的房间。',
      }),
      ...['渔夫阿林', '登记员朵拉', '搬运工米洛', '船匠菲恩', '卖报人纳雅', '水手奥伦', '小贩莉娅', '守夜人亨克'].map((name, index) =>
        entity(`resident-${index}`, 'character', name, '背景居民', { x: 30 + index * 20, y: 50 }, {
          hidden: true, tier: '背景角色', goal: '维持码头生活', boundary: '不牵涉公会争端',
          knows: '港口最近的失踪传闻', unknown: '失踪案的真相', summary: '灯港的一位普通居民。',
        })),
    ],
    relations: [
      { id: 'lorn-eve', source: 'lorn', target: 'eve', label: '相互信任', sourceHandle: 'right-out', targetHandle: 'left-in' },
      { id: 'eve-clinic', source: 'eve', target: 'clinic', label: '常驻', sourceHandle: 'top-out', targetHandle: 'bottom-in' },
      { id: 'mela-eve', source: 'mela', target: 'eve', label: '提供情报', sourceHandle: 'left-out', targetHandle: 'right-in' },
      { id: 'guild-kas', source: 'guild', target: 'kas', label: '雇佣', sourceHandle: 'top-out', targetHandle: 'bottom-in' },
      { id: 'relic-eve', source: 'relic', target: 'eve', label: '认知更新', sourceHandle: 'top-out', targetHandle: 'bottom-in', category: 'event' },
      { id: 'retaliation-eve', source: 'retaliation', target: 'eve', label: '被迫离开', sourceHandle: 'left-out', targetHandle: 'right-in', category: 'event' },
      { id: 'retaliation-lighthouse', source: 'retaliation', target: 'lighthouse', label: '解锁', sourceHandle: 'bottom-out', targetHandle: 'top-in', category: 'dialogue' },
    ],
    dialogue: {
      opening: '海上的伤，有些不能按岸上的办法治。',
      relic: '你从哪里找到这个？先把门关上。',
      revealed: '那艘船……我上个月替他们处理过伤口。',
      threatened: '诊所已经不安全了。你来之前，有人搜过我的房间。',
      protected: '这次，我会把看见的事说完整。',
    },
    notes: { letter: '诊所已经不安全了。天黑后，到废弃灯塔来找我。——伊芙' },
    scenario: { day: 2, evidence: true, protected: false, protectedDay: null, toldOrigin: false, toldOriginDay: null, trust: 1 },
    modelProfile: { endpoint: '', model: '' },
    tasks: [{ id: 'initial', name: '码头居民', status: 'completed', detail: '8 / 8 完成' }],
  };
}

export function eventHasOccurred(event, scenario) {
  return !!event && event.enabled !== false && scenario.day >= event.day && (!event.requiresEvidence || scenario.evidence);
}

export function getCharacterState(project, id) {
  const role = project.entities.find(item => item.id === id);
  if (!role || role.kind !== 'character') return null;
  if (project._document && !project.entities.some(e => e.id === 'relic')) {
    const initial = project._document.content.initial_state;
    const state = initial.characters[id];
    const location = project._document.content.locations.find(l => l.id === state?.location_id);
    return { location: location?.name || '尚未设置地点', behavior: state?.behavior || role.goal || '尚未编写行为', knowledge: role.knows || '暂无初始知识', phase: '静态初始状态', causes: ['作者定义的初始状态；通用条件执行尚未接入'] };
  }
  const { scenario } = project;
  const relic = eventHasOccurred(project.entities.find(item => item.id === 'relic'), scenario);
  const threatened = eventHasOccurred(project.entities.find(item => item.id === 'retaliation'), scenario);
  let state = { location: '码头区', behavior: role.goal || '照常生活', knowledge: role.knows || '暂无确认信息', phase: '日常生活', causes: ['人物基础设定'] };
  if (id === 'eve') {
    state = { ...state, location: '旧港诊所', behavior: '谨慎透露线索', phase: '诊所问诊', causes: ['人物基础设定'] };
    if (relic) state = { ...state, behavior: '私下调查弟弟的去向', phase: '私下调查', knowledge: `${role.knows}；弟弟的遗物已被找到`, causes: ['遗物出现已发生'] };
    if (threatened) state = { ...state, location: '废弃灯塔', behavior: '躲避公会', phase: '躲避公会', knowledge: `${state.knowledge}；公会正在追捕知情者`, causes: ['公会报复已发生', '伊芙从梅拉处获知威胁'] };
    if (threatened && scenario.protected && scenario.day >= (scenario.protectedDay ?? 1)) state = { ...state, behavior: '愿意出庭作证', phase: '愿意作证', causes: [...state.causes, '玩家已承诺保护伊芙'] };
  } else if (threatened && id === 'lorn') state = { ...state, behavior: '拒绝继续配合调查', phase: '保护工人', causes: ['公会报复已发生'] };
  else if (threatened && id === 'mela') state = { ...state, behavior: '向玩家传递伊芙去向', phase: '暗中传信', causes: ['公会报复已发生'] };
  return state;
}

export function getConversation(project, characterId = 'eve') {
  const actor = project.entities.find(item => item.id === characterId);
  if (project._document && !project.entities.some(e => e.id === 'relic')) return {
    text: project.entities.find(e => e.kind === 'dialogue' && e.characterId === characterId)?.text || actor?.summary || '这个角色尚未编写对话。', options: [], reason: '静态文本 · 不执行分支条件', state: getCharacterState(project, characterId),
  };
  if (characterId !== 'eve') return {
    text: actor?.summary || '这个角色尚未编写对话。', options: [], reason: '人物基础文本', state: getCharacterState(project, characterId),
  };
  const { scenario, dialogue } = project;
  const state = getCharacterState(project, 'eve');
  const threatened = eventHasOccurred(project.entities.find(item => item.id === 'retaliation'), scenario);
  const relic = eventHasOccurred(project.entities.find(item => item.id === 'relic'), scenario);
  const protectedNow = scenario.protected && scenario.day >= (scenario.protectedDay ?? 1);
  const originKnownNow = scenario.toldOrigin && scenario.day >= (scenario.toldOriginDay ?? 1);
  if (threatened && protectedNow) return { text: dialogue.protected, state, reason: '报复事件已发生 · 已承诺保护', options: [{ id: 'leave', label: '结束对话', effect: '保留当前状态' }] };
  if (threatened) return { text: dialogue.threatened, state, reason: '报复事件已发生 · 伊芙已获知威胁', options: [
    { id: 'protect', label: '答应保护她', effect: '信任 +1 · 愿意作证' },
    { id: 'searchers', label: '询问搜查者身份', effect: '获得公会搜查线索' },
  ] };
  if (relic && scenario.trust >= 1) return {
    text: originKnownNow ? dialogue.revealed : dialogue.relic, state, reason: '持有遗物 = 是 · 信任 ≥ 1',
    options: [{ id: 'origin', label: '说明遗物来源', effect: originKnownNow ? '已获得船员线索' : '信任 +1 · 获得船员线索' }, { id: 'brother', label: '询问弟弟身份', effect: '了解人物故事' }],
  };
  return { text: dialogue.opening, state, reason: relic ? '信任不足，保持谨慎' : '遗物事件尚未发生', options: [{ id: 'greet', label: '表达关心', effect: '信任 +1' }] };
}

export function applyChoice(project, choice) {
  const scenario = { ...project.scenario };
  if (choice === 'origin' && (!scenario.toldOrigin || scenario.day < scenario.toldOriginDay)) { if (!scenario.toldOrigin) scenario.trust += 1; scenario.toldOrigin = true; scenario.toldOriginDay = scenario.day; }
  if (choice === 'protect' && (!scenario.protected || scenario.day < scenario.protectedDay)) { if (!scenario.protected) scenario.trust += 1; scenario.protected = true; scenario.protectedDay = scenario.day; }
  if (choice === 'greet') scenario.trust += 1;
  return { ...project, scenario };
}

export function inspectProject(project) {
  const issues = [];
  const ids = new Set(project.entities.map(item => item.id));
  for (const edge of project.relations) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) issues.push({ type: 'error', text: `关系“${edge.label}”引用了不存在的对象` });
  }
  for (const actor of project.entities.filter(item => item.kind === 'character' && !item.hidden)) {
    if (!actor.goal?.trim()) issues.push({ type: 'warning', text: `${actor.name}缺少长期目标`, entityId: actor.id });
  }
  if (!project.scenario.evidence && project.entities.find(item => item.id === 'retaliation')?.requiresEvidence) issues.push({ type: 'info', text: '当前分支隐瞒证据，公会报复与灯塔对话不会触发', entityId: 'retaliation' });
  if (project.version === 1 && !project.entities.some(item => item.id === 'eve')) issues.push({ type: 'error', text: '示例情境需要伊芙角色' });
  return issues;
}

// Imports are an untrusted project boundary. Reconstruct allowlisted fields;
// credentials and unknown properties never enter saved project files.
export function validateProject(input) {
  if (!input || input.version !== PROJECT_VERSION || !Array.isArray(input.entities) || !Array.isArray(input.relations)) throw new Error('文件不是支持的 Ludo v1 项目');
  if (input.entities.length > 1000 || input.relations.length > 5000) throw new Error('原型最多支持 1000 个对象和 5000 条关系');
  const base = createProject();
  const string = (v, max = 6000) => typeof v === 'string' ? v.slice(0, max) : '';
  const allowedKinds = new Set(['character', 'event', 'location', 'faction', 'dialogue']);
  const ids = new Set();
  const entities = input.entities.map(item => {
    if (!item || !allowedKinds.has(item.kind) || !string(item.id, 100) || ids.has(item.id)) throw new Error('对象类型或 ID 无效 / 重复');
    ids.add(item.id);
    const result = { id: string(item.id, 100), kind: item.kind, name: string(item.name, 100), role: string(item.role, 100), position: { x: Number(item.position?.x), y: Number(item.position?.y) } };
    if (!Number.isFinite(result.position.x) || !Number.isFinite(result.position.y)) throw new Error('画布坐标无效');
    for (const key of ['tier', 'goal', 'boundary', 'knows', 'unknown', 'summary', 'characterId', 'text']) if (item[key] !== undefined) result[key] = string(item[key]);
    for (const key of ['hidden', 'locked', 'enabled', 'requiresEvidence']) if (item[key] !== undefined) result[key] = !!item[key];
    if (item.kind === 'event') {
      if (!Number.isInteger(item.day) || item.day < 1 || item.day > 5) throw new Error('故事事件必须位于第 1–5 天');
      result.day = item.day;
      result.affects = Array.isArray(item.affects) ? item.affects.filter(id => typeof id === 'string').slice(0, 100) : [];
    }
    return result;
  });
  if (!ids.has('eve') || !ids.has('relic') || !ids.has('retaliation')) throw new Error('项目缺少示例情境的必要对象');
  if (entities.find(item => item.id === 'eve').kind !== 'character' || ['relic', 'retaliation'].some(id => entities.find(item => item.id === id).kind !== 'event')) throw new Error('示例情境对象类型不正确');
  for (const item of entities) if (item.affects) item.affects = item.affects.filter(id => entities.some(actor => actor.id === id && actor.kind === 'character'));
  const relationIds = new Set();
  const relations = input.relations.map(item => {
    if (!item || !ids.has(item.source) || !ids.has(item.target) || !item.id || relationIds.has(item.id)) throw new Error('关系引用或 ID 无效');
    relationIds.add(item.id);
    return { id: string(item.id, 100), source: item.source, target: item.target, label: string(item.label, 100), sourceHandle: string(item.sourceHandle, 50) || 'right-out', targetHandle: string(item.targetHandle, 50) || 'left-in', category: ['event', 'dialogue'].includes(item.category) ? item.category : undefined };
  });
  const day = Number(input.scenario?.day ?? 2);
  if (!Number.isInteger(day) || day < 1 || day > 5) throw new Error('预演时间无效');
  const trust = Number(input.scenario?.trust ?? 1);
  if (!Number.isFinite(trust) || trust < 0 || trust > 1000) throw new Error('信任值无效');
  return {
    ...base, name: string(input.name, 100) || base.name, entities, relations,
    world: { name: string(input.world?.name, 100) || base.world.name, district: string(input.world?.district, 100) || base.world.district, revision: Number.isInteger(input.world?.revision) ? input.world.revision : 1, premise: string(input.world?.premise), rules: Array.isArray(input.world?.rules) ? input.world.rules.map(v => string(v, 1000)).slice(0, 50) : base.world.rules, tone: string(input.world?.tone) },
    dialogue: Object.fromEntries(Object.keys(base.dialogue).map(key => [key, string(input.dialogue?.[key]) || base.dialogue[key]])),
    notes: { letter: string(input.notes?.letter) || base.notes.letter },
    scenario: { day, trust, evidence: input.scenario?.evidence !== false, protected: !!input.scenario?.protected, protectedDay: Number.isFinite(input.scenario?.protectedDay) ? Math.min(5, Math.max(1, input.scenario.protectedDay)) : null, toldOrigin: !!input.scenario?.toldOrigin, toldOriginDay: Number.isFinite(input.scenario?.toldOriginDay) ? Math.min(5, Math.max(1, input.scenario.toldOriginDay)) : null },
    modelProfile: { endpoint: string(input.modelProfile?.endpoint, 500), model: string(input.modelProfile?.model, 100) },
    tasks: Array.isArray(input.tasks) ? input.tasks.slice(-100).map((task, index) => ({ id: string(task?.id, 100) || `task-${index}`, name: string(task?.name, 200), detail: string(task?.detail, 200), status: task?.status === 'draft' ? 'draft' : 'completed' })) : base.tasks,
  };
}

export function exportProject(project) { return JSON.stringify(validateProject(project), null, 2); }
export function loadProject(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  return raw ? validateProject(JSON.parse(raw)) : createProject();
}
