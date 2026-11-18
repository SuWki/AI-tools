import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import type { CaseItem, Lang, Me } from '../types';
import Workspace from '../workflow/Workspace';
import { errorMessage, stateLabel, wording } from '../workflow/labels';
import type { CaseTarget } from '../workflow/types';

interface Props { lang:Lang; tenantId:string; me:Me; target?:CaseTarget; startCreating?:boolean; toast:(s:string)=>void; onUnauthorized:()=>void; onDirty:(value:boolean)=>void; onOpenCompanion:(page:'tools'|'analysis',caseId:string,topic:string)=>void }
const empty={customer:'',topic:'',message:'',channel:'Email',priority:'normal'};
export default function CasesPage({lang,tenantId,me,target,startCreating,toast,onUnauthorized,onDirty,onOpenCompanion}:Props){
  const [items,setItems]=useState<CaseItem[]>([]),[selected,setSelected]=useState(target?.caseId||''),[detail,setDetail]=useState<CaseItem|null>(null),[filter,setFilter]=useState('all'),[search,setSearch]=useState('');
  const [showForm,setShowForm]=useState(!!startCreating),[mobileDetail,setMobileDetail]=useState(!!target),[caseFailed,setCaseFailed]=useState(false),[retry,setRetry]=useState(0),[form,setForm]=useState(empty),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false);
  const w=(zh:string,en:string)=>wording(lang,zh,en);
  const fail=(e:unknown)=>{if(e instanceof ApiError&&e.status===401)onUnauthorized();else toast(errorMessage(lang,e));};
  const dirtyChange=(value:boolean)=>{setDirty(value);onDirty(value);};
  useEffect(()=>{
    let active=true;
    api.cases().then(rows=>{if(active){setItems(rows);setSelected(current=>current||target?.caseId||rows[0]?.id||'');}})
      .catch(error=>{if(active)fail(error);});
    return()=>{active=false;onDirty(false);};
  },[tenantId]);
  useEffect(()=>{
    let active=true;
    setDetail(null);setCaseFailed(false);
    if(selected)api.caseDetail(selected).then(d=>{if(active)setDetail(d);})
      .catch(error=>{if(active){setCaseFailed(true);fail(error);}});
    return()=>{active=false;};
  },[selected,tenantId,retry]);
  const refresh=async()=>{const [rows,d]=await Promise.all([api.cases(),api.caseDetail(selected)]);setItems(rows);setDetail(d);};
  const choose=(id:string)=>{if(id!==selected&&dirty&&!window.confirm(w('放弃未保存输入并切换工单？','Discard unsaved edits and switch cases?')))return;if(id!==selected)dirtyChange(false);setSelected(id);setMobileDetail(true);window.scrollTo(0,0);};
  const create=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);try{const d=await api.createCase(form);setItems(rows=>[d,...rows.filter(row=>row.id!==d.id)]);setSelected(d.id);setMobileDetail(true);window.scrollTo(0,0);setForm(empty);setShowForm(false);dirtyChange(false);toast(w('咨询已登记','Enquiry registered'));}catch(e){fail(e);}finally{setBusy(false);}};
  const filtered=items.filter(i=>(filter==='all'||i.status===filter)&&`${i.id} ${i.customer} ${i.topic}`.toLowerCase().includes(search.toLowerCase()));
  const begin=()=>{if(dirty&&!window.confirm(w('放弃当前工单中的未保存修改？','Discard unsaved case edits?')))return;
    setDetail(null);setSelected('');setMobileDetail(false);dirtyChange(false);setShowForm(true);window.scrollTo(0,0);};
  return <><div className="pagehead"><div><h1>{w('客户咨询','Customer enquiries')}</h1><p className="lead">{w('从原话到核验、回复、跟进与结案。','From original message to verification, reply, follow-up and closure.')}</p></div>{!showForm&&<button className="btn primary" onClick={begin}>＋ {w('登记咨询','New enquiry')}</button>}</div>
  {showForm&&<section className="panel case-register"><h2>{w('登记客户咨询','Register enquiry')}</h2><form onSubmit={create}><div className="formgrid">{[['customer','客户名称 / 代称','Customer / alias'],['topic','产品主题','Topic']].map(([key,zh,en])=><label className="field" key={key}>{w(zh,en)} *<input required maxLength={key==='customer'?100:120} value={form[key as 'customer'|'topic']} onChange={e=>{setForm({...form,[key]:e.target.value});dirtyChange(true);}}/></label>)}<label className="field full">{w('客户原话（保留原文）','Original customer message')} *<textarea required maxLength={4000} value={form.message} onChange={e=>{setForm({...form,message:e.target.value});dirtyChange(true);}}/></label><details className="full case-options"><summary>{w('渠道与优先级','Channel & priority')} · {form.channel} / {form.priority==='high'?w('优先','High'):w('普通','Normal')}</summary><div className="formgrid"><label className="field">{w('来源渠道','Source channel')}<select value={form.channel} onChange={e=>{setForm({...form,channel:e.target.value});dirtyChange(true);}}>{['Email','WhatsApp','Wechat','Other'].map(s=><option key={s}>{s}</option>)}</select></label><label className="field">{w('优先级','Priority')}<select value={form.priority} onChange={e=>{setForm({...form,priority:e.target.value});dirtyChange(true);}}><option value="normal">{w('普通','Normal')}</option><option value="high">{w('优先','High')}</option></select></label></div></details></div><div className="flex"><button className="btn primary" disabled={busy}>{w('保存并确认需求','Save & clarify requirements')}</button><button type="button" className="btn" disabled={busy} onClick={()=>{if(dirty&&!window.confirm(w('放弃登记内容？','Discard this enquiry?')))return;setShowForm(false);setForm(empty);dirtyChange(false);}}>{w('取消','Cancel')}</button></div></form></section>}
  {!showForm&&<div className={'case-layout '+(mobileDetail?'case-detail-open':'case-list-open')}><aside className="panel case-queue"><label className="field">{w('搜索工单、客户、主题','Search cases, customers, topics')}<input value={search} onChange={e=>setSearch(e.target.value)}/></label><label className="field">{w('状态筛选','Status filter')}<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">{w('全部','All')}</option>{['open','progress','waiting_customer','waiting_internal','done'].map(s=><option key={s} value={s}>{stateLabel(lang,s)}</option>)}</select></label>{filtered.map(i=><button className={`queue-item ${selected===i.id?'active':''}`} key={i.id} onClick={()=>choose(i.id)}><small>{i.id} · {stateLabel(lang,i.status)}</small><strong>{i.customer}</strong><span>{i.topic}</span><small>{i.ownerName||'—'}</small></button>)}{filtered.length===0&&<div className="empty">{w('暂无符合条件的咨询','No matching enquiries')}</div>}</aside><div className="case-content"><button className="btn mobile-back" onClick={()=>{setMobileDetail(false);window.scrollTo(0,0);}}>{w('返回咨询清单','Back to enquiry list')}</button>{detail?.id===selected&&detail?<Workspace key={`${tenantId}:${detail.id}`} item={detail} onOpenCompanion={page=>onOpenCompanion(page,detail.id,detail.topic)} inboxTarget={target?.caseId===detail.id?target.inbox:undefined} me={me} lang={lang} toast={toast} refresh={refresh} dirty={dirtyChange}/>:<div className="panel empty">{caseFailed?<><p role="alert">{w('无法打开该工单，请重试或选择其他工单。','Unable to open this case. Retry or choose another case.')}</p><button className="btn" onClick={()=>setRetry(n=>n+1)}>{w('重试','Retry')}</button></>:selected?w('正在加载…','Loading…'):w('登记第一条咨询开始使用','Register your first enquiry to get started')}</div>}</div></div>}</>;
}
