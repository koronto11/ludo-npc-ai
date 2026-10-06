import { useEffect, useRef, useState } from 'react';
import { api } from './localApi';
import { playInputs, appendPlayerState, restartPlay } from './dialoguePlayModel';

// Temporary card testing is independent of the saved global rehearsal branch.
export function useDialoguePlay(local, graph, level, appearance, context) {
  const document = local.project._document;
  const [inputs,setInputs] = useState(null);
  const [result,setResult] = useState(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [errorStatus,setErrorStatus]=useState(null);
  const [saving,setSaving] = useState(false);
  const [savedKey,setSavedKey] = useState('');
  const [savedRecordId,setSavedRecordId] = useState('');
  const savingRef = useRef(false);
  const [requestNumber,setRequestNumber] = useState(0);
  const busyRef = useRef(false);
  const preferences = useRef({});
  const serial = useRef(0);
  const inputKey = JSON.stringify(inputs);
  const resultKey = useRef('');
  useEffect(()=>{
    if (!document || !graph) {setInputs(null);setResult(null);return;}
    const next = context?.replayInputs ? structuredClone(context.replayInputs) : playInputs(document.content,graph,level,appearance);
    preferences.current={...next.variable_overrides,...Object.fromEntries((next.card_trial?.actions || []).filter(a=>a.type==='variable').map(a=>[a.variable_id,a.value]))};
    setInputs(next);setRequestNumber(value=>value+1);setResult(null);setError('');setSavedKey('');setSavedRecordId('');busyRef.current=true;setBusy(true);
  },[document?.project_id,graph?.id,level?.id,appearance?.id,context?.replayNonce]);
  useEffect(()=>{
    if(!document || !inputs || !graph) return;
    const version=++serial.current;
    const key=JSON.stringify(inputs);
    const controller=new AbortController();
    busyRef.current=true;setBusy(true);setError('');setErrorStatus(null);
    api(`/api/v2/projects/${document.project_id}/simulate`,{method:'POST',signal:controller.signal,body:{...inputs,expected_content_revision:document.content_revision}})
      .then(value=>{if(serial.current===version){setResult(value);resultKey.current=key;}})
      .catch(reason=>{if(serial.current===version&&reason.name!=='AbortError'){setError(reason.message);setErrorStatus(reason.status);setResult(null);}})
      .finally(()=>{if(serial.current===version){busyRef.current=false;setBusy(false);}});
    return ()=>{controller.abort();serial.current++;};
  },[document?.project_id,document?.content_revision,inputKey,graph?.id,requestNumber]);
  const mutate = next => {if(busyRef.current || saving)return false;busyRef.current=true;setBusy(true);setSavedKey('');setInputs(next);setRequestNumber(value=>value+1);return true;};
  const stateVariable = (identifier,value) => {
    if(!inputs?.card_trial || inputs.card_trial.actions.length>=128)return false;
    if(!mutate(appendPlayerState(inputs,identifier,value)))return false;
    preferences.current={...preferences.current,[identifier]:value};return true;
  };
  const restart = (nodeId=null,useEntryRoutes=false) => inputs && mutate(restartPlay(inputs,graph.id,preferences.current,nodeId,useEntryRoutes));
  const choose = optionId => {
    if(!inputs?.card_trial || inputs.card_trial.actions.length>=128)return false;
    const trial=inputs.card_trial;
    return mutate({...inputs,card_trial:{...trial,started:true,actions:[...trial.actions,{type:'choice',option_id:optionId}]}});
  };
  const contextChange = patch => {
    if(!inputs)return false;
    return mutate({...restartPlay(inputs,graph.id,preferences.current),...patch,card_trial:{dialogue_id:graph.id,start_node_id:null,use_entry_routes:false,started:false,actions:[]}});
  };
  const saveRecord = async name => {
    if(busyRef.current || savingRef.current || !result?.complete || result.content_revision!==document.content_revision || result.diagnostics.length || !result.transcript.length || resultKey.current!==inputKey)return false;
    const record={id:`play-${crypto.randomUUID()}`,name:name.trim(),created_at:new Date().toISOString(),content_revision:result.content_revision,character_id:graph.character_id,dialogue_id:graph.id,character_name:document.content.characters.find(a=>a.id===graph.character_id)?.name || '旁白',dialogue_name:graph.name,scene_name:document.content.locations.find(l=>l.id===inputs.location_id)?.name || '未指定场景',initial_variables:structuredClone(result.starting_variables),variable_labels:Object.fromEntries(document.content.variables.map(v=>[v.id,v.name])),inputs:structuredClone(inputs),transcript:structuredClone(result.transcript)};
    savingRef.current=true;setSaving(true);setError('');
    try {await local.transact([{type:'save_play_record',record}]);setSavedKey(inputKey);setSavedRecordId(record.id);return record;}
    catch(reason){setError(reason.message);setErrorStatus(reason.status);return false;}
    finally{savingRef.current=false;setSaving(false);}
  };
  const setRecordDeleted = async (record,deleted) => {
    if(savingRef.current)return false;
    savingRef.current=true;setSaving(true);setError('');
    try {await local.transact([{type:'set_play_record_deleted',source:record.legacy?'simulation_case':'play_record',record_id:record.id,deleted}]);return true;}
    catch(reason){setError(reason.message);setErrorStatus(reason.status);return false;}
    finally{savingRef.current=false;setSaving(false);}
  };
  const savedRecordDeleted=document?.editor.deleted_play_records?.some(row=>row.source==='play_record'&&row.record_id===savedRecordId);
  return {document,inputs,result,busy,error,errorStatus,saving,stateVariable,restart,choose,contextChange,saveRecord,setRecordDeleted,alreadySaved:savedKey===inputKey && !!savedKey && !savedRecordDeleted};
}
