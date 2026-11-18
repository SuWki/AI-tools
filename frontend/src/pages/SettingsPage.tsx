import {useState} from 'react';
import {api, ApiError, DEMO_MODE} from '../api';
import {fmtTime, t, tenantName} from '../i18n';
import type {Lang, Me} from '../types';
import {request} from '../realApi';
import {profileOf} from '../workflow/client';
import {errorMessage, wording} from '../workflow/labels';

interface Props {
  lang:Lang; me:Me; tenantId:string; toast:(msg:string)=>void;
  onUnauthorized:()=>void; onLogout:()=>void; onLanguage:(next:Lang)=>void;
}
interface AuditRow {id:string;action:string;entityId:string;actorName:string;createdAt:number}

export default function SettingsPage({lang,me,tenantId,toast,onUnauthorized,onLogout,onLanguage}:Props){
  const [auditRows,setAuditRows]=useState<AuditRow[]>();
  const [busy,setBusy]=useState(false),[failure,setFailure]=useState('');
  const w=(zh:string,en:string)=>wording(lang,zh,en);
  const company=tenantName(lang,me.activeTenant);
  const profile=profileOf(tenantId);
  const admin=me.role==='ADMIN';
  const canAudit=!DEMO_MODE&&(admin||me.role==='MANAGER');
  const scope=w('咨询工单及原话、产品资料、复盘、需求规则和工单流程记录','Enquiries with original messages, product records, reviews, requirement rules and case workflows');
  const run=async(action:()=>Promise<void>)=>{
    setBusy(true);setFailure('');
    try{await action();}catch(error){
      if(error instanceof ApiError&&error.status===401)onUnauthorized();
      else setFailure(errorMessage(lang,error));
    }finally{setBusy(false);}
  };
  const exportJson=()=>{
    if(!window.confirm(w('导出「'+company+'」的'+scope+'？','Export '+scope+' from '+company+'?')))return;
    return run(async()=>{
      const payload=await api.exportData();
      const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;
      link.download='WorkHub_'+tenantId+'_'+new Date().toISOString().slice(0,10)+'.json';
      link.click();window.setTimeout(()=>URL.revokeObjectURL(url),500);
      toast(t(lang,'exportDone'));
    });
  };
  const reset=()=>{
    const warning=DEMO_MODE?w('恢复浏览器中的示例工单、资料和复盘？','Restore sample enquiries, documents and reviews in this browser?'):
      w('将工单、知识和复盘替换为样例，并清除原审计记录？','Replace enquiries, knowledge and reviews with samples and clear the old audit log?');
    if(!window.confirm(company+' · '+warning))return;
    return run(async()=>{await api.resetDemo();setAuditRows(undefined);toast(t(lang,'resetDone'));});
  };
  return <>
    <div className="home-heading"><h1>{t(lang,'settings')}</h1></div>
    {failure&&<p role="alert" className="notice warn">{failure}</p>}
    <div className="settings-layout">
      <section className="panel"><h2>{w('账户与语言','Account & language')}</h2>
        <dl className="document-facts">
          <div><dt>{t(lang,'account')}</dt><dd>{me.user.email}</dd></div>
          <div><dt>{t(lang,'role')}</dt><dd>{me.role}</dd></div>
        </dl>
        <div className="flex"><label className="field">{t(lang,'languages')}<select value={lang} onChange={e=>onLanguage(e.target.value as Lang)}><option value="zh">中文</option><option value="en">English</option></select></label>
        <button className="btn" disabled={busy} onClick={onLogout}>{t(lang,'logout')}</button></div>
      </section>
      <section className="panel"><h2>{w('企业场景与规则','Business scenarios & rules')}</h2>
        <p><strong>{company}</strong></p><p>{profile[lang==='zh'?'noticeZh':'noticeEn']}</p>
        {profile.scenarios.map(s=><details className="task-row" key={s.id}><summary>{s[lang]}</summary><ul>{s.fields.map(f=><li key={f.key}>{f[lang]}</li>)}</ul></details>)}
      </section>
      <section className="panel"><h2>{w('数据管理','Data management')}</h2>
        <p>{DEMO_MODE?w('在线演示写入当前浏览器。','The online demo stores data in this browser.'):
          w('业务数据保存在本机 SQLite。已配置的供应商门户可联网交换邀请与回执。','Business data is stored in local SQLite. A configured supplier portal can exchange invitations and receipts online.')}</p>
        {admin?<><details className="task-row"><summary>{w('导出当前企业数据','Export current workspace data')}</summary>
          <p>{scope}。</p><button className="btn" disabled={busy} onClick={exportJson}>{w('导出 JSON','Export JSON')}</button>
        </details><details className="task-row"><summary>{t(lang,'reset')}</summary>
          <p>{w('操作会替换「'+company+'」的工单、知识与复盘数据。采购数据可通过本地备份工具备份。','This replaces enquiries, knowledge and reviews in '+company+'. Procurement data is backed up using the local backup tool.')}</p>
          <button className="btn danger" disabled={busy} onClick={reset}>{t(lang,'reset')}</button>
        </details></>:<p className="muted">{w('管理员可导出及重置数据。','Administrators can export and reset data.')}</p>}
      </section>
      {canAudit&&<section className="panel"><h2>{w('企业审计','Workspace audit')}</h2>
        <button className="btn" disabled={busy} onClick={()=>run(async()=>{setAuditRows(await request('/audit?limit=100'));})}>
          {auditRows?w('刷新最近记录','Refresh recent entries'):w('查看最近记录','Read recent entries')}
        </button>
        {auditRows?.length===0&&<p>{w('暂无审计记录。','No audit entries yet.')}</p>}
        {auditRows?.map(row=><div className="task-row" key={row.id}><strong>{row.action} · {row.entityId}</strong>
          <small>{row.actorName} · {fmtTime(lang,row.createdAt)}</small></div>)}
      </section>}
    </div>
  </>;
}
