import {useState} from 'react';
import {Plus,MapPin,Flag} from '@phosphor-icons/react';
import {Modal} from './Modal';
import {t,tm,useI18n} from './i18n';

export function WorldAssetLibrary({local,kind,onEdit,onClose}) {
  useI18n();
  const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const rows=local.project._document.content[kind==='location'?'locations':'factions'];
  const Icon=kind==='location'?MapPin:Flag;
  const create=async e=>{
    e.preventDefault();if(busy||!name.trim())return;setBusy(true);setError('');
    const entity={id:`${kind}-${crypto.randomUUID()}`,kind,name:name.trim(),role:'',description:'',tags:[],...(kind==='location'?{parent_id:null}:{policies:[]})};
    try{await local.transact([{type:'create_entity',entity}]);onEdit(entity);}catch(reason){setError(reason.message);}finally{setBusy(false);}
  };
  return <Modal title={kind==='location'?t('地点与区域'):t('阵营')} subtitle={t('共享世界资料；场景和人物引用同一份设定。')} onClose={busy?()=>{}:onClose}>
    <div className="world-asset-list">{rows.map(row=><button disabled={busy} key={row.id} onClick={()=>onEdit(row)}><Icon size={18}/><span>{row.name}<small>{row.role || row.description}</small></span></button>)}{!rows.length&&<p>{t('尚无资料，可以在下方新建。')}</p>}</div>
    <form onSubmit={create}><label>{kind==='location'?t('新地点名称'):t('新阵营名称')}<input required maxLength={150} aria-label={kind==='location'?t('新地点名称'):t('新阵营名称')} disabled={busy} value={name} onChange={e=>setName(e.target.value)}/></label>{error&&<p className="danger" role="alert">{tm(error)}</p>}<div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>{t('关闭')}</button><button className="primary" disabled={busy||!name.trim()}><Plus size={16}/>{t('新建并编辑')}</button></div></form>
  </Modal>;
}
