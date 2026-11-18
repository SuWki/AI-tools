import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { copyText } from '../clipboard';
import { fmtTime, localized } from '../i18n';
import type { CaseItem, KnowledgeItem, Lang, Me } from '../types';
import { command, getWorkflow, members, profileOf } from './client';
import type { Command, FieldValue, Member, Workflow, ReplyVersion, CaseTarget } from './types';
import { errorMessage, stateLabel, wording } from './labels';
import {KnowledgeDetails} from '../pages/KnowledgePage';

interface Props { onOpenCompanion:(page:'tools'|'analysis')=>void; inboxTarget?:CaseTarget['inbox']; item:CaseItem; me:Me; lang:Lang; toast:(s:string)=>void; refresh:()=>Promise<void>; dirty:(value:boolean)=>void }
const blank=():FieldValue=>({value:'',source:'',status:'missing'});
const localInput=(time:number)=>{const d=new Date(time);return new Date(time-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
export default function Workspace({item,onOpenCompanion,inboxTarget,me,lang,toast,refresh,dirty}:Props){
  const w=(zh:string,en:string)=>wording(lang,zh,en);
  const profile=profileOf(me.activeTenantId);
  const [data,setData]=useState<Workflow|null>(null),[people,setPeople]=useState<Member[]>([]),[knowledge,setKnowledge]=useState<KnowledgeItem[]>([]);
  const [tab,setTab]=useState(inboxTarget?.kind==='replies'?'review':inboxTarget?.kind==='tasks'?'tasks':'needs'),[busy,setBusy]=useState(false),[failure,setFailure]=useState('');
  const [scenario,setScenario]=useState(''),[fields,setFields]=useState<Record<string,FieldValue>>({}),[selectedEvidence,setSelectedEvidence]=useState<string[]>([]);
  const [text,setText]=useState(''),[risk,setRisk]=useState<ReplyVersion['risk']>('clarification'),[replyLang,setReplyLang]=useState<Lang>(lang),[reviewer,setReviewer]=useState(''),[note,setNote]=useState('');
  const [taskTitle,setTaskTitle]=useState(''),[assignee,setAssignee]=useState(me.user.id),[due,setDue]=useState(''),[taskNotes,setTaskNotes]=useState<Record<string,string>>({});
  const [channel,setChannel]=useState(item.channel),[sentAt,setSentAt]=useState(localInput(Date.now())),[result,setResult]=useState('answered'),[reason,setReason]=useState(''),[waitingReason,setWaitingReason]=useState('');
  const [status,setStatus]=useState(item.status),[stage,setStage]=useState(item.stage==='start'?'clarify':item.stage),[owner,setOwner]=useState(item.ownerId||me.user.id);
  const [unsaved,setUnsaved]=useState<string[]>([]);
  const changed=unsaved.length>0;
  const [evidenceQuery,setEvidenceQuery]=useState('');
  const [activeDocument,setDocument]=useState<KnowledgeItem>();
  const documentDialog=useRef<HTMLDialogElement>(null);
  const [expandedTask,setExpandedTask]=useState('');
  useEffect(()=>{dirty(changed);},[changed]);
  useEffect(()=>{if(activeDocument&&!documentDialog.current?.open)documentDialog.current?.showModal();},[activeDocument]);
  const [loadAttempt,setLoadAttempt]=useState(0);
  const mark=(area=tab)=>setUnsaved(areas=>areas.includes(area)?areas:[...areas,area]);
  useEffect(()=>{let alive=true;setData(null);setFailure('');
    Promise.all([getWorkflow(item.id),members(),api.knowledge()]).then(([state,team,docs])=>{if(!alive)return;setData(state);setScenario(state.scenario);setFields(state.fields);setSelectedEvidence(state.evidence.map(e=>e.id));setPeople(team);setKnowledge(docs);}).catch(e=>{if(alive)setFailure(errorMessage(lang,e));});
    return()=>{alive=false;dirty(false);};
  },[item.id,me.activeTenantId,loadAttempt]);
  const perform=async(cmd:Command)=>{
    if(!data||busy)return false;setBusy(true);setFailure('');
    try{const next=await command(item.id,data.revision,cmd);setData(next);
      const savedArea:Record<string,string>={fields:'needs',evidence:'evidence',draft:'reply',approve:'reviewNote',reject:'reviewNote',
        task:'newTask',taskComplete:'task:'+cmd.id,taskCancel:'task:'+cmd.id,close:'history',reopen:'history',
        status:'status',assign:'owner',dispatch:'dispatch'};
      setUnsaved(areas=>areas.filter(area=>area!==savedArea[cmd.op]));
      if(cmd.op==='approve'||cmd.op==='reject')setNote('');
      try { await refresh(); } catch { setFailure(w('操作已保存，工单概要刷新失败。','The action was saved. The case summary could not be refreshed.')); return true; }
      toast(w('已保存','Saved'));return true;}
    catch(e){setFailure(errorMessage(lang,e));return false;}finally{setBusy(false);}
  };
  const sc=profile.scenarios.find(s=>s.id===scenario)||profile.scenarios[0];
  const latest=data?.replies[data.replies.length-1];
  const editor=me.role==='ADMIN'||!item.ownerId||item.ownerId===me.user.id;
  const closed=item.status==='done';
  const updateField=(key:string,patch:Partial<FieldValue>)=>{setFields({...fields,[key]:{...(fields[key]||blank()),...patch}});mark();};
  const generate=()=>{
    const en=replyLang==='en';const known=sc.fields.filter(f=>data?.fields[f.key]?.status==='confirmed');const missing=sc.fields.filter(f=>data?.fields[f.key]?.status!=='confirmed');
    const lines=[en?'Thank you for your enquiry.':'感谢您的咨询。', ...known.map(f=>`${en?f.en:f.zh}: ${data!.fields[f.key].value}`), missing.length?(en?'Please help us confirm:':'请协助确认：'):'', ...missing.map(f=>`• ${en?f.en:f.zh}`),en?'Specifications, availability, pricing and delivery will be confirmed after review.':'具体适用性、供货、价格与交付条件将在核验后确认。'];setText(lines.filter(Boolean).join('\n\n'));setRisk('clarification');mark();
  };
  const copyApproved=async()=>{if(!latest)return;if(unsaved.includes('reply')){setFailure(w('请先保存或放弃未保存修改。','Save or discard your edits first.'));return;}
    if(await perform({op:'copy',id:latest.id})){const ok=await copyText(latest.body);toast(w(ok?'已复制；尚未登记发送':'复制失败，请检查剪贴板权限',ok?'Copied; dispatch is not yet recorded':'Copy failed; check clipboard access'));}
  };
  const commitDraft=async()=>{if(await perform({op:'draft',text,lang:replyLang,risk})){setText('');setReviewer('');}};
  const changeTab=(next:string)=>setTab(next);
  const requestedReply = inboxTarget?.kind==='replies' ? data?.replies.find(reply=>reply.id===inboxTarget.id) : undefined;
  const taskId = inboxTarget?.kind==='tasks' ? inboxTarget.id : undefined;
  const loaded = !!data;
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(()=>{
    if (loaded && tab==='review') reviewHeading.current?.focus({preventScroll:true});
  },[loaded,tab]);
  useEffect(()=>{
    if (!loaded || tab!=='tasks' || !(expandedTask||taskId)) return;
    const task = document.getElementById('follow-up-'+(expandedTask||taskId));
    task?.focus({preventScroll:true});
    task?.scrollIntoView({block:'center'});
  },[loaded,taskId,tab,expandedTask]);
  const reviewControls = (reply:ReplyVersion) => {
    if (closed || reply.id!==latest?.id || reply.status!=='pending' || reply.reviewerId!==me.user.id) return null;
    return <>
      <label className="field">{w('审核意见（退回必填）','Review note (required for rejection)')}
        <textarea maxLength={2000} value={note} onChange={e=>{setNote(e.target.value);mark('reviewNote');}}/>
      </label>
      <div className="flex">
        <button className="btn primary" disabled={busy||!!failure} onClick={()=>perform({op:'approve',id:reply.id,note})}>{w('通过本版本','Approve version')}</button>
        <button className="btn" disabled={busy||!!failure||!note.trim()} onClick={()=>perform({op:'reject',id:reply.id,note})}>{w('退回修改','Request changes')}</button>
      </div>
    </>;
  };
  const reload = async () => {
    try { const [fresh,docs]=await Promise.all([getWorkflow(item.id),api.knowledge()]);setData(fresh);setKnowledge(docs);setFailure(''); }
    catch (e) { setFailure(errorMessage(lang,e)); }
  };
  if(!data)return <div className="panel">
    <p role={failure?'alert':'status'}>{failure||w('正在加载工作区…','Loading workspace…')}</p>
    {failure&&<button className="btn" onClick={()=>setLoadAttempt(n=>n+1)}>{w('重试','Retry')}</button>}
  </div>;
  const openTasks=data.tasks.filter(task=>task.status==='open');
  const pendingReviews=data.replies.filter(reply=>reply.status==='pending');
  const selectedDocs=selectedEvidence.flatMap(id=>knowledge.filter(doc=>doc.id===id&&doc.verified));
  const matchingDocs=knowledge.filter(doc=>doc.verified||selectedEvidence.includes(doc.id))
    .filter(doc=>selectedEvidence.includes(doc.id)||(doc.name+' '+doc.sku).toLowerCase().includes(evidenceQuery.trim().toLowerCase()));
  const toggleEvidence=(id:string)=>{
    setSelectedEvidence(ids=>ids.includes(id)?ids.filter(value=>value!==id):[...ids,id]);mark('evidence');
  };
  return <section className="case-workspace">
    <dialog ref={documentDialog} className="case-document-dialog" onClose={()=>setDocument(undefined)}>
      {activeDocument&&<><h2>{activeDocument.name}</h2><KnowledgeDetails item={activeDocument} lang={lang}/>
        <form method="dialog"><button className="btn primary">{w('返回工单','Back to case')}</button></form></>}
    </dialog>
    <div className="panel case-header"><div><div className="eyebrow">{item.id} · {profile[lang==='zh'?'nameZh':'nameEn']}</div><h2>{localized(lang,item as unknown as Record<string,unknown>,'topic')}</h2><p>{item.customer} · {item.channel} · {item.ownerName||w('未分配','Unassigned')}</p></div><span className={`pill ${closed?'':'warn'}`}>{stateLabel(lang,item.status)}</span></div>
    <details className="case-options"><summary>{w('工单工具','Case tools')}</summary>
      <div className="flex"><button className="btn" onClick={()=>onOpenCompanion('tools')}>{w('准备业务指令','Prepare instructions')}</button>
        <button className="btn" onClick={()=>onOpenCompanion('analysis')}>{w('开始销售复盘','Start sales review')}</button></div>
    </details>
    <p className="workspace-notice">{profile[lang==='zh'?'noticeZh':'noticeEn']}</p>
    {failure&&<div className="notice warn" role="alert">{failure} <button className="btn sm" onClick={reload}>{w('重新加载记录（保留输入）','Reload record (keep input)')}</button></div>}
    <div className="workflow-tabs" role="tablist" aria-label={w('工单环节','Case workflow')}>{[['needs','需求核验','Requirements'],['evidence','知识引用','Evidence'],[inboxTarget?.kind==='replies'&&tab!=='reply'?'review':'reply','回复与审核','Reply & approval'],['tasks','跟进任务','Follow-up'],['history','记录与结案','History & closure']].map(([id,zh,en])=><button key={id} role="tab" aria-selected={tab===id} className={tab===id?'active':''} onClick={()=>changeTab(id)}>{w(zh,en)}</button>)}</div>
    {changed&&<p className="unsaved" role="status">● {w('有未保存修改','Unsaved changes')}</p>}
    {tab==='needs'&&<div className="workflow-grid"><div className="panel"><h3>{w('客户原话','Original customer message')}</h3><div className="quote">{item.message}</div><h3 className="case-section-title">{w('需求核验','Requirements')}</h3><label className="field">{w('业务场景','Business scenario')}<select value={scenario} disabled={closed||!editor} onChange={e=>{setScenario(e.target.value);setFields({});mark();}}>{profile.scenarios.map(s=><option key={s.id} value={s.id}>{s[lang]}</option>)}</select></label>
      <div className="workflow-fields">{sc.fields.map(f=>{const v=fields[f.key]||blank();return <details key={f.key} className="requirement-field"><summary>{f[lang]} <small>· {stateLabel(lang,v.status)}</small></summary><label>{w('已知信息（数值请注明单位）','Known value (include units)')}<input value={v.value} maxLength={1000} disabled={closed||!editor} onChange={e=>updateField(f.key,{value:e.target.value})}/></label><label>{w('确认状态','Confirmation status')}<select value={v.status} disabled={closed||!editor} onChange={e=>updateField(f.key,{status:e.target.value as FieldValue['status']})}>{['missing','unverified','confirmed'].map(s=><option key={s} value={s}>{stateLabel(lang,s)}</option>)}</select></label><label>{w('信息来源 / 核验依据','Information source / verification evidence')}<input value={v.source} maxLength={500} disabled={closed||!editor} onChange={e=>updateField(f.key,{source:e.target.value})}/></label></details>;})}</div>
      <button className="btn primary" disabled={busy||closed||!editor} onClick={()=>perform({op:'fields',scenario,fields})}>{w('保存需求记录','Save requirements')}</button></div>
      <aside className="panel"><h3>{w('本单资料','Case documents')}</h3><p>{data.evidence.length} {w('项已保存引用','saved references')}</p><div className="flex"><button className="btn" onClick={()=>changeTab('evidence')}>{w('查看或选择资料','View or select documents')}</button><button className="btn soft" onClick={()=>changeTab('reply')}>{w('准备回复','Prepare reply')} →</button></div><details className="case-options"><summary>{w('处理状态与分配','Status & assignment')}</summary><h3>{w('处理状态与分配','Status & assignment')}</h3><label className="field">{w('状态','Status')}<select value={status} onChange={e=>{setStatus(e.target.value as CaseItem['status']);mark('status');}}>{['open','progress','waiting_customer','waiting_internal'].map(s=><option key={s} value={s}>{stateLabel(lang,s)}</option>)}</select></label><label className="field">{w('阶段','Stage')}<select value={stage} onChange={e=>{setStage(e.target.value);mark('status');}}>{[['clarify','需求确认','Clarification'],['verify','资料核查','Verification'],['commercial','商务沟通','Commercial'],['followup','后续跟进','Follow-up']].map(([k,z,e])=><option key={k} value={k}>{w(z,e)}</option>)}</select></label><label className="field">{w('等待原因','Waiting reason')}<input value={waitingReason} onChange={e=>{setWaitingReason(e.target.value);mark('status');}}/></label><button className="btn" disabled={busy||closed||!editor} onClick={()=>perform({op:'status',status,stage,note:waitingReason})}>{w('更新状态','Update status')}</button><label className="field">{w('负责人','Owner')}<select value={owner} onChange={e=>{setOwner(e.target.value);mark('owner');}}>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className="btn" disabled={busy||closed||!editor} onClick={()=>perform({op:'assign',ownerId:owner})}>{w('分配工单','Assign case')}</button></details></aside></div>}
    {tab==='evidence'&&<div className="workflow-grid">
      <section className="panel"><h3>{w('选择当前企业资料','Select workspace documents')}</h3>
        <label className="field">{w('搜索名称或编号','Search title or reference')}<input value={evidenceQuery} onChange={e=>setEvidenceQuery(e.target.value)}/></label>
        {!matchingDocs.length&&<p>{w('没有匹配的可引用资料。','No matching documents are available to reference.')}</p>}
        {matchingDocs.map(doc=><div className="evidence-choice" key={doc.id}>
          <label><input type="checkbox" checked={selectedEvidence.includes(doc.id)} disabled={busy||closed||!editor}
            onChange={()=>toggleEvidence(doc.id)}/><span>{doc.name}<small>{doc.sku} · V{doc.version} · {doc.verified?w('有效','Published'):w('不可引用','Unavailable')}</small></span></label>
          <button className="btn" onClick={()=>setDocument(doc)}>{w('查看正文','Read document')}</button>
        </div>)}
        {selectedEvidence.filter(id=>!knowledge.some(doc=>doc.id===id)).map(id=><p key={id}>{data.evidence.find(doc=>doc.id===id)?.name||id} · {w('资料不可用','Document unavailable')}
          <button className="btn" disabled={closed||!editor} onClick={()=>toggleEvidence(id)}>{w('移除引用','Remove reference')}</button></p>)}
        <button className="btn primary" disabled={busy||closed||!editor||selectedDocs.length!==selectedEvidence.length}
          onClick={()=>perform({op:'evidence',ids:selectedEvidence,versions:Object.fromEntries(selectedDocs.map(doc=>[doc.id,doc.version]))})}>{w('保存引用版本','Save evidence references')}</button>
      </section>
      <aside className="panel"><h3>{w('已保存的引用快照','Saved evidence snapshots')}</h3>
        {!data.evidence.length&&<p>{w('本单尚未引用资料。','This case has no references yet.')}</p>}
        {data.evidence.map(doc=>{
          const active=knowledge.some(entry=>entry.id===doc.id&&entry.verified&&entry.version===doc.version);
          return <details className="task-row" key={doc.id}><summary>{doc.name} · V{doc.version} {!active&&w('· 需重新核验','· Revalidate')}</summary>
            <p>{doc.summary}</p><small>{doc.source}</small></details>;
        })}
      </aside>
    </div>}
    {tab==='review'&&<div className="workflow-grid review-layout">
      <section className="panel">
        <h3 ref={reviewHeading} tabIndex={-1}>{w('回复','Reply')} V{requestedReply?.version??inboxTarget?.version??'—'}</h3>
        {!requestedReply?<p role="status">{w('该版本已不可用，请查看工单当前记录。','This version is unavailable. Check the current case record.')}</p>:<>
          <p className="review-meta">{stateLabel(lang,requestedReply.status)} · {requestedReply.authorName} · {fmtTime(lang,requestedReply.createdAt)}</p>
          {latest?.id!==requestedReply.id&&<p className="notice warn" role="status">{w('该版本已被替代。','This version has been superseded.')}</p>}
          <div className="quote">{requestedReply.body}</div>
          {requestedReply.reviewNote&&<p>{requestedReply.reviewNote}</p>}
          {reviewControls(requestedReply)}
        </>}
        <button className="btn review-other" onClick={()=>changeTab('reply')}>{w('查看当前回复与版本记录','View current reply and version history')}</button>
      </section>
      <aside className="panel"><h3>{w('审核依据','Review evidence')}</h3>
        <details><summary>{w('客户原话','Original customer message')}</summary><div className="quote">{item.message}</div></details>
        {requestedReply?.evidence.length?requestedReply.evidence.map(e=><details key={e.id}>
          <summary>{e.name} · V{e.version}</summary><p>{e.summary}</p><p>{e.source}</p>
        </details>):<p>{w('该版本未引用企业资料。','This version has no linked evidence.')}</p>}
      </aside>
    </div>}
    {tab==='reply'&&<div className="workflow-grid"><div className="panel"><h3>{w('编辑新的回复版本','Prepare a new reply version')}</h3><div className="formgrid"><label className="field">{w('回复语言','Reply language')}<select value={replyLang} onChange={e=>{setReplyLang(e.target.value as Lang);mark();}}><option value="zh">中文</option><option value="en">English</option></select></label><label className="field">{w('内容声明（人工核对）','Content declaration (human checked)')}<select value={risk} onChange={e=>{setRisk(e.target.value as ReplyVersion['risk']);mark();}}>{[['clarification','普通澄清 / 无承诺','Clarification / no commitments'],['technical','技术适用承诺','Technical commitment'],['commercial','价格 / 库存 / 交期','Price / availability / delivery'],['aftersales','退款 / 补发等处理','Refund / replacement resolution']].map(([k,z,e])=><option value={k} key={k}>{w(z,e)}</option>)}</select></label></div><button className="btn soft" disabled={closed||!editor||unsaved.includes('reply')} onClick={generate}>{w('按已保存需求准备澄清草稿','Prepare clarification from saved requirements')}</button><p className="smallprint">{w('此处按规则整理，无模型调用。自由文本需人工检查承诺类别。','Rule-based preparation, no model call. Manually check commitment categories in free text.')}</p><label className="field">{w('回复正文','Reply body')}<textarea rows={10} maxLength={12000} value={text} disabled={closed||!editor} onChange={e=>{setText(e.target.value);mark();}}/></label><button className="btn primary" disabled={busy||closed||!editor||!text.trim()} onClick={commitDraft}>{w('保存为新版本','Save as new version')}</button>
      <div className="divider"/><h3>{w('版本记录','Version history')}</h3>{[...data.replies].reverse().map(r=><details key={r.id} className="task-row"><summary>V{r.version} · {stateLabel(lang,r.status)} · {r.authorName} · {fmtTime(lang,r.createdAt)}</summary><div className="quote">{r.body}</div><p>{r.reviewNote}</p><small>{r.reviewerName||'—'} {r.reviewedAt?fmtTime(lang,r.reviewedAt):''}</small>{r.sentAt&&<p>{r.channel} · {fmtTime(lang,r.sentAt)}</p>}<p>{r.evidence.map(e=>`${e.name} V${e.version}`).join(' / ')}</p><button className="btn sm" disabled={closed||!editor} onClick={()=>{setText(r.body);setRisk(r.risk);setReplyLang(r.lang);mark('reply');}}>{w('基于此版修订','Revise this version')}</button></details>)}</div><aside className="panel"><h3>{w('当前版本与审核','Current version & approval')}</h3>{!latest?<p>{w('请先保存回复草稿。','Save a draft first.')}</p>:<><span className="pill">V{latest.version} · {stateLabel(lang,latest.status)}</span><div className="quote">{latest.body}</div>{latest.reviewNote&&<p>{latest.reviewNote}</p>}<label className="field">{w('授权审核人','Authorised reviewer')}<select value={reviewer} onChange={e=>setReviewer(e.target.value)}><option value="">{w('选择审核人','Select reviewer')}</option>{people.filter(p=>p.id!==latest.authorId&&p.role===(latest.risk==='technical'?'REVIEWER':'MANAGER')).map(p=><option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select></label><button className="btn primary" disabled={busy||unsaved.includes('reply')||closed||!editor||latest.status!=='draft'} onClick={()=>perform({op:'submit',id:latest.id,reviewerId:reviewer})}>{latest.risk==='clarification'?w('保存人工核对结果','Confirm human review'):w('提交授权审核','Submit for approval')}</button>
      {reviewControls(latest)}
      <div className="divider"/><button className="btn soft" disabled={busy||unsaved.includes('reply')||closed||!editor||!['approved','sent'].includes(latest.status)} onClick={copyApproved}>{w('复制核准正文','Copy approved body')}</button><p className="smallprint">{w('复制不等于发送。先在外部渠道实际发送，再登记。','Copying is not dispatch. Send externally, then record it.')}</p><label className="field">{w('实际渠道','Actual channel')}<input value={channel} onChange={e=>{setChannel(e.target.value);mark('dispatch');}}/></label><label className="field">{w('实际发送时间（当前设备时区）','Actual dispatch time (device timezone)')}<input type="datetime-local" value={sentAt} onChange={e=>{setSentAt(e.target.value);mark('dispatch');}}/></label><button className="btn" disabled={busy||unsaved.includes('reply')||closed||!editor||latest.status!=='approved'} onClick={()=>perform({op:'dispatch',id:latest.id,channel,sentAt:new Date(sentAt).getTime()})}>{w('登记已发送','Record dispatch')}</button></>}</aside></div>}
    {tab==='tasks'&&<div className="workflow-grid">
      <section className="panel"><h3>{w('跟进任务','Follow-up tasks')}</h3>
        {data.tasks.length===0&&<p>{w('暂无跟进任务。','No follow-up tasks.')}</p>}
        {[...openTasks,...data.tasks.filter(task=>task.status!=='open')].map(task=>{
          const value=taskNotes[task.id]??'';
          const canComplete=editor||me.user.id===task.assigneeId;
          return <details className="task-row" key={task.id} id={'follow-up-'+task.id}
            open={expandedTask===task.id||(!expandedTask&&taskId===task.id)} tabIndex={-1}>
            <summary>{task.title} · {task.status==='open'&&task.dueAt<Date.now()?w('已逾期','Overdue'):stateLabel(lang,task.status)}</summary>
            <p>{people.find(p=>p.id===task.assigneeId)?.name} · {fmtTime(lang,task.dueAt)} · {task.timeZone}</p>
            {task.result&&<p>{task.result}</p>}
            {task.status==='open'&&!closed&&canComplete&&<>
              <label className="field">{w('本次结果或取消理由','Outcome or cancellation reason')}
                <textarea value={value} maxLength={2000} onChange={e=>{setTaskNotes(notes=>({...notes,[task.id]:e.target.value}));mark('task:'+task.id);}}/>
              </label>
              <div className="flex">
                <button className="btn primary" disabled={busy||!value.trim()} onClick={()=>perform({op:'taskComplete',id:task.id,note:value})}>{w('完成并保存结果','Complete with outcome')}</button>
                {editor&&<button className="btn" disabled={busy||!value.trim()} onClick={()=>perform({op:'taskCancel',id:task.id,note:value})}>{w('取消并保存理由','Cancel with reason')}</button>}
              </div>
            </>}
          </details>;
        })}
      </section>
      {!closed&&editor&&<aside className="panel"><h3>{w('安排下一步','Schedule next action')}</h3>
        <form onSubmit={async e=>{e.preventDefault();
          if(await perform({op:'task',title:taskTitle,assigneeId:assignee,dueAt:new Date(due).getTime(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone})){setTaskTitle('');setDue('');}
        }}>
          <label className="field">{w('明确动作','Action')}<input required maxLength={300} value={taskTitle} onChange={e=>{setTaskTitle(e.target.value);mark('newTask');}}/></label>
          <label className="field">{w('执行人','Assignee')}<select value={assignee} onChange={e=>{setAssignee(e.target.value);mark('newTask');}}>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="field">{w('到期时间（当前设备时区）','Due date (device timezone)')}<input required type="datetime-local" value={due} onChange={e=>{setDue(e.target.value);mark('newTask');}}/></label>
          <button className="btn primary" disabled={busy||!taskTitle.trim()||!due}>{w('创建跟进任务','Create follow-up')}</button>
        </form>
      </aside>}
    </div>}
    {tab==='history'&&<div className="workflow-grid"><div className="panel"><h3>{w('完整操作时间线','Action timeline')}</h3>{[...data.events].reverse().map(e=><div key={e.id} className="task-row"><strong>{e.action}</strong><p>{e.detail}</p><small>{e.actor} · {fmtTime(lang,e.at)}</small></div>)}{item.notes?.map(n=><div key={n.id} className="task-row"><p>{n.text}</p><small>{n.authorName} · {fmtTime(lang,n.createdAt)}</small></div>)}</div><aside className="panel"><h3>{closed?w('结案记录','Closure record'):w('结案检查','Close case')}</h3>{data.conclusion&&<div className="quote">{stateLabel(lang,data.result)} · {data.conclusion}</div>}{!closed&&(openTasks.length>0||pendingReviews.length>0)&&<div className="notice warn">
      <strong>{w('结案前请处理以下事项','Resolve these items before closing')}</strong>
      <ul>{openTasks.map(task=><li key={task.id}><button className="btn" onClick={()=>{setExpandedTask(task.id);changeTab('tasks');}}>{task.title}</button></li>)}
      {pendingReviews.map(reply=><li key={reply.id}><button className="btn" onClick={()=>changeTab('reply')}>{w('待审核回复','Pending review')} V{reply.version}</button></li>)}</ul>
    </div>}<label className="field">{w('结果','Outcome')}<select value={result} onChange={e=>setResult(e.target.value)}>{['answered','order','lost','deferred','invalid'].map(s=><option value={s} key={s}>{stateLabel(lang,s)}</option>)}</select></label><label className="field">{w('结论 / 原因 / 外部订单引用','Conclusion / reason / external order reference')}<textarea value={reason} onChange={e=>{setReason(e.target.value);mark();}}/></label><button className="btn primary" disabled={busy||!editor||!reason.trim()||(!closed&&(openTasks.length>0||pendingReviews.length>0))} onClick={()=>perform(closed?{op:'reopen',note:reason}:{op:'close',result,note:reason})}>{closed?w('填写原因并重开','Reopen with reason'):w('保存结果并结案','Save outcome & close')}</button></aside></div>}
  </section>;
}

