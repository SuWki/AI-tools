import {useEffect, useState} from 'react';
import {api, ApiError} from '../api';
import {fmtTime, t} from '../i18n';
import type {Lang, Review} from '../types';
import {errorMessage, wording} from '../workflow/labels';

interface Props {
  lang:Lang; tenantId:string; toast:(msg:string)=>void; onUnauthorized:()=>void;
  onDirty:(value:boolean)=>void; origin?:{caseId:string;topic:string}; onReturn?:()=>void;
}
export default function AnalysisPage({lang,tenantId,toast,onUnauthorized,onDirty,origin,onReturn}:Props){
  const [conversation,setConversation]=useState(''),[checklist,setChecklist]=useState(''),[result,setResult]=useState('');
  const [reviews,setReviews]=useState<Review[]>([]),[busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[failure,setFailure]=useState('');
  const [attempt,setAttempt]=useState(0),[view,setView]=useState<'new'|'history'>('new');
  const w=(zh:string,en:string)=>wording(lang,zh,en);
  const fail=(error:unknown,setError:(text:string)=>void)=>{
    if(error instanceof ApiError&&error.status===401)onUnauthorized();
    else setError(errorMessage(lang,error));
  };
  useEffect(()=>{
    let active=true;
    setLoading(true);setLoadError('');
    api.reviews().then(rows=>{if(active)setReviews(rows);}).catch(error=>{if(active)fail(error,setLoadError);})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[tenantId,attempt]);
  useEffect(()=>{onDirty(!!(conversation||result));return()=>onDirty(false);},[conversation,result,onDirty]);
  useEffect(()=>setChecklist(''),[lang]);
  const run=async(operation:()=>Promise<void>)=>{
    setBusy(true);setFailure('');
    try{await operation();}catch(error){fail(error,setFailure);}finally{setBusy(false);}
  };
  const generate=()=>run(async()=>{
    const response=await api.checklist(conversation.trim(),lang);setChecklist(response.checklist);
  });
  const save=()=>run(async()=>{
    await api.saveReview({conversation:conversation.trim(),result:result.trim(),caseId:origin?.caseId});
    setConversation('');setChecklist('');setResult('');setView('history');setAttempt(n=>n+1);toast(t(lang,'recordSaved'));
  });

  return <>
    {onReturn&&<button className="btn context-back" onClick={onReturn}>{w('返回工单','Back to case')} · {origin?.caseId}</button>}
    <div className="home-heading"><div><h1>{w('销售复盘','Sales review')}</h1>
      {origin&&<p>{w('来自工单','From case')} {origin.caseId} · {origin.topic}</p>}
    </div></div>
    <nav className="proc-nav" aria-label={w('复盘导航','Review navigation')}>
      <button aria-current={view==='new'?'page':undefined} onClick={()=>setView('new')}>{w('本次复盘','New review')}</button>
      <button aria-current={view==='history'?'page':undefined} onClick={()=>setView('history')}>{t(lang,'savedReviews')}</button>
    </nav>
    {view==='new'?<section className="panel case-register">
      {failure&&<p className="notice warn" role="alert">{failure}</p>}
      <label className="field">{t(lang,'conversation')}<textarea value={conversation} disabled={busy}
        onChange={event=>{setConversation(event.target.value);setChecklist('');}} placeholder={t(lang,'conversationPH')}/></label>
      {!checklist&&<button className="btn primary" disabled={busy||!conversation.trim()} onClick={generate}>{t(lang,'runChecklist')}</button>}
      {checklist&&<>
        <h2>{t(lang,'reviewChecklist')}</h2><div className="quote">{checklist}</div>
        <form onSubmit={event=>{event.preventDefault();if(!busy&&result.trim())void save();}}>
          <label className="field">{t(lang,'reviewOutput')}<textarea required value={result} disabled={busy} onChange={e=>setResult(e.target.value)}/></label>
          <button className="btn primary" disabled={busy||!result.trim()}>{t(lang,'saveReview')}</button>
        </form>
      </>}
    </section>:<section className="panel case-register"><h2>{t(lang,'savedReviews')}</h2>
      {loading?<p role="status">{t(lang,'loading')}</p>:loadError?<p role="alert">{loadError}
        <button className="btn" onClick={()=>setAttempt(n=>n+1)}>{w('重试','Retry')}</button></p>:!reviews.length?<p>{t(lang,'noReviews')}</p>:
        reviews.map(review=><details className="task-row" key={review.id}><summary>{fmtTime(lang,review.createdAt)} · {review.result.slice(0,45)}{review.caseId&&' · '+review.caseId}</summary>
          <div className="quote">{review.result}</div><details><summary>{w('查看保存的对话','Read saved conversation')}</summary><p className="quote">{review.conversation}</p></details>
        </details>)}
    </section>}
  </>;
}
