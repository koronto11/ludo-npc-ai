import { useEffect, useRef, useState } from 'react';
import { api } from './localApi';
const copy = value => structuredClone(value);
const id = () => `branch-${crypto.randomUUID()}`;
export function useRehearsal(local, announce) {
  const document = local.project._document;
  const [branch, setBranch] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [selectedDialogue, setSelectedDialogue] = useState('');
  const projectId = useRef('');
  const serial = useRef(0);
  useEffect(() => {
    if (!document || projectId.current === document.project_id) return;
    projectId.current = document.project_id;
    const first = document.content.simulation_cases[0];
    setBranch(copy(first || { id: id(), name: '我的预演分支', at_tick: document.content.initial_state.tick, location_id: null, variable_overrides: {}, choices: [], scene_changes: [], seed: 0, notes: '' }));
    setDirty(false); setResult(null); setSelectedDialogue('');
  }, [document]);
  useEffect(() => {
    if (!document || !branch || projectId.current !== document.project_id) return;
    const version = ++serial.current;
    setBusy(true); setError('');
    const controller = new AbortController();
    api(`/api/v2/projects/${document.project_id}/simulate`, { method: 'POST', signal: controller.signal, body: { expected_content_revision: document.content_revision, at_tick: branch.at_tick, location_id: branch.location_id, variable_overrides: branch.variable_overrides, choices: branch.choices, scene_changes: branch.scene_changes || [] } })
      .then(value => { if (serial.current === version) setResult(value); })
      .catch(reason => { if (serial.current === version && reason.name !== 'AbortError') { setResult(null); setError(reason.message); } })
      .finally(() => { if (serial.current === version) setBusy(false); });
    return () => { controller.abort(); };
  }, [document?.project_id, document?.content_revision, branch]);
  useEffect(() => {
    const unload = event => { if(dirty) { event.preventDefault(); event.returnValue=''; } };
    window.addEventListener('beforeunload',unload);
    return () => window.removeEventListener('beforeunload',unload);
  },[dirty]);
  const change = update => { setBranch(previous => ({ ...previous, ...update })); setDirty(true); };
  const seek = tick => change({ at_tick: Math.max(document.content.initial_state.tick, Math.trunc(Number(tick) || 0)) });
  const sequence = () => Math.max(-1, ...branch.choices.map(r => r.sequence ?? -1), ...(branch.scene_changes || []).map(r => r.sequence ?? -1)) + 1;
  const record = (dialogue, option = null, action = 'choice') => {
    if (busy || !result?.complete) return;
    if (branch.choices.some(r => r.tick > branch.at_tick) || (branch.scene_changes || []).some(r => r.tick > branch.at_tick)) {
      announce('当前时间后还有记录，请先复制分支并从这里分叉'); return;
    }
    change({ choices: [...branch.choices, { tick: branch.at_tick, dialogue_id: dialogue, option_id: option, action, sequence: sequence(), record_id: `choice-${crypto.randomUUID()}` }] });
  };
  const scene = location => {
    if ((branch.scene_changes || []).some(r => r.tick > branch.at_tick) || branch.choices.some(r => r.tick > branch.at_tick)) { announce('未来仍有记录，请先从这里分叉'); return; }
    change({ scene_changes: [...(branch.scene_changes || []), { tick: branch.at_tick, location_id: location || null, sequence:sequence() }] });
  };
  const fork = async () => {
    const snapshot = copy(branch);
    if (dirty) {
      const preserved = { ...snapshot, at_tick:Math.max(snapshot.at_tick, ...snapshot.choices.map(r=>r.tick), ...(snapshot.scene_changes || []).map(r=>r.tick)) };
      try { await local.transact([{type:'put_simulation_case',case:preserved}]); } catch(reason) { announce(reason.message); return; }
    }
    setBranch({ ...snapshot, id:id(), name:`${snapshot.name} · 分叉`, choices:snapshot.choices.filter(r=>r.tick<=snapshot.at_tick), scene_changes:(snapshot.scene_changes || []).filter(r=>r.tick<=snapshot.at_tick) });
    setDirty(true); announce('原分支记录已保留；新分支从当前时间继续');
  };
  const select = identifier => {
    if (dirty) { announce('当前分支有未保存输入，请先保存分支或点放弃修改'); return; }
    const next = document.content.simulation_cases.find(c => c.id === identifier);
    if (next) { setBranch(copy(next)); setSelectedDialogue(''); setResult(null); }
  };
  const discard = () => { const saved = document.content.simulation_cases.find(c => c.id === branch.id); setBranch(copy(saved || { ...branch, choices: [], scene_changes: [], variable_overrides: {}, at_tick: document.content.initial_state.tick })); setDirty(false); };
  const save = async () => {
    const value = { ...branch, at_tick: Math.max(branch.at_tick, ...branch.choices.map(r => r.tick), ...(branch.scene_changes || []).map(r => r.tick)) };
    try { await local.transact([{ type: 'put_simulation_case', case: value }]); setDirty(false); announce('分支输入与选择记录已保存；人物设定未被预演修改'); } catch (reason) { announce(reason.message); }
  };
  return { branch, result, busy, error, dirty, change, seek, record, scene, fork, select, save, discard, selectedDialogue, setSelectedDialogue, document };
}
