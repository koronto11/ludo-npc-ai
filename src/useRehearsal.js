import {t,tm} from './i18n.js';
import { useEffect, useRef, useState } from 'react';
import { api } from './localApi';
import { newTestBranch } from './rolePreviewModel';
import { activeSimulationCases } from './dialoguePlayModel';
const copy = value => structuredClone(value);
const id = () => `branch-${crypto.randomUUID()}`;
export function useRehearsal(local, announce) {
  const document = local.project._document;
  const [branch, setBranch] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error,setError] = useState('');
  const [errorStatus,setErrorStatus]=useState(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const markDirty = value => { dirtyRef.current=value; setDirty(value); };
  const [selectedDialogue, setSelectedDialogue] = useState('');
  const [testRestore, setTestRestore] = useState(null);
  const projectId = useRef('');
  const baseline = useRef(null);
  const serial = useRef(0);
  useEffect(() => {
    if (!document || projectId.current === document.project_id) return;
    projectId.current = document.project_id;
    const first = activeSimulationCases(document)[0];
    baseline.current = copy(first || { id: id(), name: '我的预演分支', at_tick: document.content.initial_state.tick, location_id: null, variable_overrides: {}, choices: [], scene_changes: [], seed: 0, notes: '' });
    setBranch(copy(baseline.current));
    markDirty(false); setResult(null); setSelectedDialogue(''); setTestRestore(null);
  }, [document]);
  useEffect(() => {
    if (!document || !branch || projectId.current !== document.project_id) return;
    const version = ++serial.current;
    busyRef.current=true;setBusy(true);setError('');setErrorStatus(null);
    const controller = new AbortController();
    api(`/api/v2/projects/${document.project_id}/simulate`, { method: 'POST', signal: controller.signal, body: { expected_content_revision: document.content_revision, at_tick: branch.at_tick, location_id: branch.location_id, level_id: branch.level_id || null, variable_overrides: branch.variable_overrides, choices: branch.choices, scene_changes: branch.scene_changes || [] } })
      .then(value => { if (serial.current === version) setResult(value); })
      .catch(reason => { if (serial.current === version && reason.name !== 'AbortError') { setResult(null); setError(reason.message);setErrorStatus(reason.status); } })
      .finally(() => { if (serial.current === version) {busyRef.current=false;setBusy(false);} });
    return () => { controller.abort(); };
  }, [document?.project_id, document?.content_revision, branch]);
  useEffect(() => {
    const unload = event => { if(dirty) { event.preventDefault(); event.returnValue=''; } };
    window.addEventListener('beforeunload',unload);
    return () => window.removeEventListener('beforeunload',unload);
  },[dirty]);
  const change = update => { if(busyRef.current)return false;busyRef.current=true;setBusy(true);setBranch(previous => ({ ...previous, ...update })); markDirty(true);return true; };
  const replaceStory = value => {if(busyRef.current)return false;baseline.current=copy(value);setBranch(copy(value));markDirty(false);setSelectedDialogue('');setResult(null);busyRef.current=true;setBusy(true);setTestRestore(null);return true;};
  const acceptSavedStory = value => {baseline.current=copy(value);markDirty(false);setTestRestore(null);};
  const focusContext = (levelId, locationId, tick, dialogueId = '') => {
    if (!document) { announce(t("本地工程尚未载入")); return false; }
    if (dirtyRef.current) { announce(t("当前预演有未保存输入，请先保存或放弃分支修改，再切换场景")); return false; }
    baseline.current = { id:id(), name:'角色场景预演', level_id:levelId || null, location_id:locationId || null, at_tick:Math.max(document.content.initial_state.tick, tick ?? document.content.initial_state.tick), variable_overrides:{}, choices:[], scene_changes:[], seed:0, notes:'' };
    setBranch(copy(baseline.current));
    setSelectedDialogue(dialogueId); setResult(null); markDirty(false); setTestRestore(null); return true;
  };
  const applyTest = (settings, dialogueId) => {
    if (busy || !document || !branch || !dialogueId) return false;
    const next=newTestBranch(branch,settings,dialogueId,id(),`choice-${crypto.randomUUID()}`);
    setTestRestore({branch:copy(branch),baseline:copy(baseline.current),dirty,selectedDialogue});
    setBranch(next); setSelectedDialogue(dialogueId); setResult(null); setBusy(true); markDirty(true);
    return true;
  };
  const undoTest = () => {
    if (!testRestore || busy) return;
    baseline.current=copy(testRestore.baseline); setBranch(copy(testRestore.branch));setSelectedDialogue(testRestore.selectedDialogue);markDirty(testRestore.dirty);setResult(null);setBusy(true);setTestRestore(null);
  };
  const saveSettings = async (settings,dialogueId) => {
    const next=newTestBranch(branch,settings,dialogueId,id(),`choice-${crypto.randomUUID()}`);
    try { await local.transact([{type:'put_simulation_case',case:next}]);baseline.current=copy(next);setBranch(next);setSelectedDialogue(dialogueId);setResult(null);markDirty(false);setTestRestore(null);return true; }
    catch(reason) { announce(reason.message);return false; }
  };
  const seek = tick => change({ at_tick: Math.max(document.content.initial_state.tick, Math.trunc(Number(tick) || 0)) });
  const sequence = () => Math.max(-1, ...branch.choices.map(r => r.sequence ?? -1), ...(branch.scene_changes || []).map(r => r.sequence ?? -1)) + 1;
  const record = (dialogue, option = null, action = 'choice') => {
    if (busyRef.current || !result?.complete) return false;
    if (branch.choices.some(r => r.tick > branch.at_tick) || (branch.scene_changes || []).some(r => r.tick > branch.at_tick)) {
      announce(t("当前时间后还有记录，请先复制分支并从这里分叉")); return;
    }
    return change({ choices: [...branch.choices, { tick: branch.at_tick, dialogue_id: dialogue, option_id: option, action, sequence: sequence(), record_id: `choice-${crypto.randomUUID()}` }] });
  };
  const scene = location => {
    if ((branch.scene_changes || []).some(r => r.tick > branch.at_tick) || branch.choices.some(r => r.tick > branch.at_tick)) { announce(t("未来仍有记录，请先从这里分叉")); return; }
    return change({ scene_changes: [...(branch.scene_changes || []), { tick: branch.at_tick, location_id: location || null, sequence:sequence() }] });
  };
  const fork = async () => {
    const snapshot = copy(branch);
    if (dirty) {
      const preserved = { ...snapshot, at_tick:Math.max(snapshot.at_tick, ...snapshot.choices.map(r=>r.tick), ...(snapshot.scene_changes || []).map(r=>r.tick)) };
      try { await local.transact([{type:'put_simulation_case',case:preserved}]); } catch(reason) { announce(reason.message); return; }
    }
    setBranch({ ...snapshot, id:id(), name:`${snapshot.name} · 分叉`, choices:snapshot.choices.filter(r=>r.tick<=snapshot.at_tick), scene_changes:(snapshot.scene_changes || []).filter(r=>r.tick<=snapshot.at_tick) });
    setTestRestore(null); markDirty(true); announce(t("原分支记录已保留；新分支从当前时间继续"));
  };
  const select = identifier => {
    if (dirty) { announce(t("当前分支有未保存输入，请先保存分支或点放弃修改")); return; }
    const next = activeSimulationCases(document).find(c => c.id === identifier);
    if (next) { baseline.current = copy(next); setBranch(copy(next)); setSelectedDialogue(''); setResult(null); setTestRestore(null); }
  };
  const discard = () => { if(testRestore){undoTest();return;} const saved = document.content.simulation_cases.find(c => c.id === branch.id); setBranch(copy(saved || (baseline.current?.id === branch.id ? baseline.current : { ...branch, choices: [], scene_changes: [], variable_overrides: {}, at_tick: document.content.initial_state.tick }))); markDirty(false); };
  const discardForNavigation = () => {
    if(busy) return false;
    const saved=document.content.simulation_cases.find(c=>c.id===branch.id);
    const original=saved || testRestore?.baseline || baseline.current;
    setBranch(copy(original));markDirty(false);setResult(null);setTestRestore(null);return true;
  };
  const save = async () => {
    const value = { ...branch, at_tick: Math.max(branch.at_tick, ...branch.choices.map(r => r.tick), ...(branch.scene_changes || []).map(r => r.tick)) };
    try { await local.transact([{ type: 'put_simulation_case', case: value }]); baseline.current = copy(value); markDirty(false); setTestRestore(null); announce(t("分支输入与选择记录已保存；人物设定未被预演修改")); return true; } catch (reason) { announce(reason.message);return false; }
  };
  return { branch, result, busy, error, errorStatus, dirty, change, seek, record, scene, fork, select, save, discard, discardForNavigation, focusContext, applyTest, undoTest, canUndoTest:!!testRestore, saveSettings, selectedDialogue, setSelectedDialogue, document,replaceStory,acceptSavedStory };
}
