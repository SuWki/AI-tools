import {useEffect, useState} from 'react';
import {api, ApiError} from '../api';
import {fmtTime, localized, t} from '../i18n';
import type {KnowledgeItem, Lang} from '../types';
import KnowledgeVersions from '../workflow/KnowledgeVersions';
import {errorMessage, wording} from '../workflow/labels';

interface Props {
  lang: Lang;
  tenantId: string;
  role: string;
  userId: string;
  toast: (message: string) => void;
  onUnauthorized: () => void;
  onDirty: (value: boolean) => void;
}

const emptyForm = {name:'', sku:'', summary:'', source:''};

export function KnowledgeDetails({item, lang}: {item:KnowledgeItem; lang:Lang}) {
  const record = item as unknown as Record<string, unknown>;
  const status = item.reviewStatus==='retired' ? wording(lang,'已撤回','Withdrawn') :
    t(lang,item.verified?'verified':'unverified');
  return <>
    <p className="muted">{item.sku} · V{item.version} · {status}</p>
    <p className="quote">{localized(lang,record,'summary')}</p>
    <dl className="document-facts">
      <div><dt>{t(lang,'source')}</dt><dd>{item.source || '—'}</dd></div>
      <div><dt>{wording(lang,'审核人','Reviewer')}</dt><dd>{item.reviewerName || '—'}</dd></div>
      <div><dt>{wording(lang,'更新时间','Updated')}</dt><dd>{fmtTime(lang,item.updatedAt)}</dd></div>
    </dl>
  </>;
}

export default function KnowledgePage({lang,tenantId,role,userId,toast,onUnauthorized,onDirty}: Props) {
  const [items,setItems]=useState<KnowledgeItem[]>([]), [loading,setLoading]=useState(true);
  const [search,setSearch]=useState(''), [selected,setSelected]=useState('');
  const [showDetail,setShowDetail]=useState(false), [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState(emptyForm), [versionDirty,setVersionDirty]=useState(false);
  const [busy,setBusy]=useState(false), [failure,setFailure]=useState(''), [attempt,setAttempt]=useState(0);
  const w=(zh:string,en:string)=>wording(lang,zh,en);
  const fail = (error:unknown) => {
    if(error instanceof ApiError && error.status===401) onUnauthorized();
    else setFailure(errorMessage(lang,error));
  };
  const dirty=showForm&&Object.values(form).some(Boolean)||versionDirty;
  useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
  useEffect(()=>{
    let current=true;
    setLoading(true);setFailure('');
    api.knowledge().then(rows=>{if(current)setItems(rows);})
      .catch(error=>{if(current)fail(error);}).finally(()=>{if(current)setLoading(false);});
    return()=>{current=false;};
  },[tenantId,attempt]);

  const reload = async () => { setItems(await api.knowledge()); };
  const run = async (action:()=>Promise<void>) => {
    setBusy(true);setFailure('');
    try { await action(); } catch(error){fail(error);} finally{setBusy(false);}
  };
  const current=items.find(item=>item.id===selected);
  const name=(item:KnowledgeItem)=>localized(lang,item as unknown as Record<string,unknown>,'name');
  const filtered=items.filter(item=>[item.name,item.nameEn,item.sku,item.summary,item.summaryEn]
    .some(text=>text?.toLowerCase().includes(search.trim().toLowerCase())));
  const canReview=role==='ADMIN'||role==='REVIEWER';
  const allow=()=>!dirty||window.confirm(w('放弃未保存的资料修改？','Discard unsaved document edits?'));
  const select=(id:string)=>{
    if(id!==selected&&!allow())return;
    if(id!==selected)setVersionDirty(false);
    setSelected(id);setShowDetail(true);window.scrollTo(0,0);
  };
  const openForm=()=>{
    if(!allow())return;
    setVersionDirty(false);setForm(emptyForm);setShowForm(true);
  };

  return <div className="knowledge-desk">
    <div className="home-heading"><h1>{w('知识资料','Knowledge')}</h1>
      {!showForm&&<button className="btn primary" disabled={busy} onClick={openForm}>{t(lang,'addKnowledge')}</button>}
    </div>
    {failure&&<div className="notice warn" role="alert">{failure}
      {!showForm&&!current&&<button className="btn" onClick={()=>setAttempt(n=>n+1)}>{w('重试','Retry')}</button>}
    </div>}
    {showForm?<section className="panel case-register">
      <h2>{w('资料草稿','Document draft')}</h2>
      <form onSubmit={event=>{event.preventDefault();void run(async()=>{
        const saved=await api.createKnowledge(form);
        setItems(rows=>[saved,...rows.filter(row=>row.id!==saved.id)]);
        setSelected(saved.id);setShowDetail(true);setForm(emptyForm);setShowForm(false);
        toast(t(lang,'kbSaved'));await reload();
      });}}>
        {([
          ['name',t(lang,'name'),120],['sku',t(lang,'sku'),80],['summary',t(lang,'summary'),4000],
          ['source',t(lang,'source'),180]
        ] as const).map(([key,label,max])=><label className="field" key={key}>{label}
          {key==='summary'?<textarea value={form[key]} maxLength={max} required onChange={e=>setForm({...form,[key]:e.target.value})}/>:
            <input value={form[key]} maxLength={max} required={key!=='source'} onChange={e=>setForm({...form,[key]:e.target.value})}/>}
        </label>)}
        <div className="flex"><button className="btn primary" disabled={busy}>{w('保存待审草稿','Save draft for review')}</button>
          <button type="button" className="btn" disabled={busy} onClick={()=>{if(allow()){setShowForm(false);setForm(emptyForm);}}}>{t(lang,'cancel')}</button>
        </div>
      </form>
    </section>:<div className={'knowledge-layout '+(showDetail?'knowledge-detail-open':'knowledge-list-open')}>
      <section className="panel knowledge-directory"><h2>{w('资料目录','Document directory')}</h2>
        <label className="field">{t(lang,'search')}<input value={search} onChange={e=>setSearch(e.target.value)}/></label>
        {loading?<p role="status">{t(lang,'loading')}</p>:!filtered.length&&!failure?<p>{t(lang,'noKnowledge')}</p>:
          filtered.map(item=><button key={item.id} className={'queue-item '+(item.id===selected?'active':'')} disabled={busy} onClick={()=>select(item.id)}>
            <strong>{name(item)}</strong><small>{item.sku} · V{item.version} · {item.reviewStatus==='retired'?w('已撤回','Withdrawn'):t(lang,item.verified?'verified':'unverified')}</small>
          </button>)}
      </section>
      <div className="knowledge-detail">
        <button className="btn mobile-back" onClick={()=>{setShowDetail(false);window.scrollTo(0,0);}}>{w('返回资料目录','Back to document directory')}</button>
        {current?<section className="panel" key={current.id}>
          <h2>{name(current)}</h2><KnowledgeDetails item={current} lang={lang}/>
          {!current.verified&&current.reviewStatus!=='retired'&&canReview&&<button className="btn primary" disabled={busy}
            onClick={()=>run(async()=>{await api.approveKnowledge(current.id);await reload();toast(t(lang,'approveOk'));})}>{t(lang,'approve')}</button>}
          <KnowledgeVersions key={current.id} item={current} lang={lang} canReview={canReview} userId={userId}
            onDirty={setVersionDirty} reload={reload}/>
        </section>:<p className="panel muted">{w('选择一条资料查看正文和版本。','Select a document to read its content and versions.')}</p>}
      </div>
    </div>}
  </div>;
}
