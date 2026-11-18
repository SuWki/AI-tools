import {useEffect, useRef, useState} from 'react';
import {api, ApiError} from '../api';
import {copyText} from '../clipboard';
import {t, localized, I18nKey} from '../i18n';
import type {CaseItem, Lang} from '../types';
import {errorMessage, wording} from '../workflow/labels';

interface Props {
  lang:Lang; tenantId:string; toast:(msg:string)=>void; onUnauthorized:()=>void;
  origin?:{caseId:string; topic:string}; onReturn?:()=>void;
}
const types:I18nKey[]=['reply','audit','productCompare','content'];

export default function ToolsPage({lang,tenantId,toast,onUnauthorized,origin,onReturn}:Props){
  const [cases,setCases]=useState<CaseItem[]>([]),[caseId,setCaseId]=useState(origin?.caseId??'');
  const [type,setType]=useState<I18nKey>('reply'),[prompt,setPrompt]=useState('');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [failure,setFailure]=useState(''),[attempt,setAttempt]=useState(0);
  const output=useRef<HTMLTextAreaElement>(null);
  const w=(zh:string,en:string)=>wording(lang,zh,en);
  const fail=(error:unknown)=>{
    if(error instanceof ApiError&&error.status===401)onUnauthorized();
    else setFailure(errorMessage(lang,error));
  };
  useEffect(()=>{
    let active=true;
    setLoading(true);setFailure('');
    api.cases().then(rows=>{if(active)setCases(rows);}).catch(error=>{if(active)fail(error);})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[tenantId,attempt]);
  useEffect(()=>{setPrompt('');},[caseId,type,lang]);
  const generation=useRef(0);
  useEffect(()=>{
    generation.current++;
    return()=>{generation.current++;};
  },[caseId,type,lang,tenantId]);
  const generate=async()=>{
    const current=++generation.current;
    setBusy(true);setFailure('');setPrompt('');
    try{const result=await api.prompt(caseId,type,lang);if(current===generation.current)setPrompt(result.prompt);}
    catch(error){if(current===generation.current)fail(error);}
    finally{if(current===generation.current)setBusy(false);}
  };
  useEffect(()=>{setBusy(false);},[lang]);
  const copy=async()=>{
    const ok=await copyText(prompt);
    if(!ok){output.current?.focus();output.current?.select();}
    toast(t(lang,ok?'copyOk':'copyFail'));
  };
  const selected=cases.some(item=>item.id===caseId);
  const chooseCase=(next:string)=>{setPrompt('');setCaseId(next);};
  return <>
    {onReturn&&<button className="btn context-back" onClick={onReturn}>{w('返回工单','Back to case')} · {origin?.caseId}</button>}
    <div className="home-heading"><h1>{w('业务工具','Business tools')}</h1></div>
    <div className="workflow-grid task-desk">
      <section className="panel"><h2>{w('准备指令','Prepare instructions')}</h2>
        <label className="field">{t(lang,'caseSelection')}<select value={selected?caseId:''} disabled={busy||loading} onChange={e=>chooseCase(e.target.value)}>
          <option value="">{t(lang,'chooseCase')}</option>
          {cases.map(item=><option key={item.id} value={item.id}>{item.id} · {localized(lang,item as unknown as Record<string,unknown>,'topic')}</option>)}
        </select></label>
        {origin&&!loading&&!selected&&!failure&&<p role="status">{w('原工单暂不可用，请重新选择。','The original case is unavailable. Choose another case.')}</p>}
        <label className="field">{t(lang,'templateType')}<select value={type} disabled={busy} onChange={e=>{setPrompt('');setType(e.target.value as I18nKey);}}>
          {types.map(item=><option key={item} value={item}>{t(lang,item)}</option>)}
        </select></label>
        {loading?<p role="status">{t(lang,'loading')}</p>:failure?<p role="alert">{failure}
          <button className="btn" onClick={()=>setAttempt(n=>n+1)}>{w('重试','Retry')}</button></p>:
          !cases.length&&<p role="status">{t(lang,'noCaseTool')}</p>}
        <button className="btn primary" type="button" disabled={busy||loading||!selected} onClick={generate}>{w('预览指令','Preview instructions')}</button>
      </section>
      <section className="panel"><h2>{w('指令预览','Instructions preview')}</h2>
        {prompt?<><label className="field">{w('检查并删去敏感信息','Review and remove sensitive information')}
          <textarea ref={output} className="prompt-output" value={prompt} onChange={event=>setPrompt(event.target.value)}/>
        </label><button className="btn primary" disabled={!prompt.trim()} onClick={copy}>{t(lang,'copy')}</button></>:
          <p role="status">{busy?t(lang,'loading'):w('选择工单和任务类型后预览。','Choose a case and task type to preview.')}</p>}
      </section>
    </div>
  </>;
}
