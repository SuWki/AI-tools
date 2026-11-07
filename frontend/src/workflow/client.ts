import { api, DEMO_MODE, ApiError } from '../api';
import { request } from '../realApi';
import profiles from './profiles.json';
import { demoUsers } from '../demo/fixtures';
import { patchDemoCase } from '../demo/demoApi';
import type { BusinessProfile, Workflow, Command, Member, InboxItem, ReplyVersion, FollowUpTask, Evidence } from './types';
const uid=()=>crypto.randomUUID();
const key=(tenant:string,id:string)=>`workhub.workflow.v3:${tenant}:${id}`;
export const profileOf=(tenant:string)=>(profiles as Record<string,BusinessProfile>)[tenant];
const fail=(code:string):never=>{throw new ApiError(400,code);};
export async function members():Promise<Member[]> {
  if(!DEMO_MODE)return request('/workflow/members');
  const me=await api.me();
  return demoUsers.filter(u=>u.memberships[me.activeTenantId]).map(u=>({id:u.id,name:u.displayName,role:u.memberships[me.activeTenantId]}));
}
export async function getWorkflow(id:string):Promise<Workflow> {
  if(!DEMO_MODE)return request(`/cases/${encodeURIComponent(id)}/workflow`);
  const me=await api.me();await api.caseDetail(id);
  const raw=localStorage.getItem(key(me.activeTenantId,id));
  return raw?JSON.parse(raw):{revision:0,scenario:profileOf(me.activeTenantId).scenarios[0].id,fields:{},evidence:[],replies:[],tasks:[],events:[],result:''};
}
export async function command(id:string,revision:number,cmd:Command):Promise<Workflow> {
  if(!DEMO_MODE)return request(`/cases/${encodeURIComponent(id)}/workflow`,{method:'POST',body:JSON.stringify({...cmd,revision})});
  const me=await api.me(), state=await getWorkflow(id), item=await api.caseDetail(id), now=Date.now();
  if(state.revision!==revision)throw new ApiError(409,'REVISION_CONFLICT');
  if(item.status==='done'&&cmd.op!=='reopen')fail('CASE_CLOSED');
  const str=(k:string,required=true)=>{const s=String(cmd[k]??'').trim();if((required&&!s)||s.length>12000)fail('INVALID_INPUT');return s;};
  const invalidate=()=>state.replies.forEach(r=>{if(['approved','pending'].includes(r.status))r.status='stale';});
  const validate=(reply:ReplyVersion)=>{
    if(reply.risk!=='clarification'){
      const sc=profileOf(me.activeTenantId).scenarios.find(s=>s.id===state.scenario)!;
      if(sc.fields.some(f=>!state.fields[f.key]?.value.trim()||!state.fields[f.key]?.source.trim()||state.fields[f.key]?.status!=='confirmed'))fail('MISSING_CONFIRMED_FIELDS');
      if(!state.evidence.length)fail('EVIDENCE_REQUIRED');
    }
    if(reply.body.includes('{{')||reply.body.includes('[待填写]'))fail('UNRESOLVED_PLACEHOLDER');
  };
  const knowledge=await api.knowledge();
  if(['submit','approve','copy','dispatch'].includes(cmd.op)&&state.evidence.some(e=>!knowledge.some(k=>k.id===e.id&&k.verified&&k.version===e.version)))fail('EVIDENCE_CHANGED');
  switch(cmd.op){
    case 'fields':{
      const scenario=profileOf(me.activeTenantId).scenarios.find(s=>s.id===cmd.scenario);if(!scenario)fail('INVALID_SCENARIO');
      const values=cmd.fields as Workflow['fields'];
      if(Object.values(values).some(v=>v.status==='confirmed'&&(!v.value.trim()||!v.source.trim())))fail('CONFIRMATION_SOURCE_REQUIRED');
      invalidate();state.scenario=str('scenario');state.fields=values;break;
    }
    case 'evidence': state.evidence=(cmd.ids as string[]).map(id=>{const k=knowledge.find(k=>k.id===id&&k.verified);if(!k)fail('EVIDENCE_REQUIRED');return {id:k!.id,sku:k!.sku,name:k!.name,summary:k!.summary,source:k!.source||'',version:k!.version};});invalidate();break;
    case 'draft':invalidate();state.replies.push({id:uid(),version:state.replies.length+1,body:str('text'),lang:cmd.lang as 'zh'|'en',risk:cmd.risk as ReplyVersion['risk'],status:'draft',authorId:me.user.id,authorName:me.user.displayName,createdAt:now,fields:structuredClone(state.fields),evidence:structuredClone(state.evidence)});break;
    case 'submit':case 'approve':case 'reject':case 'copy':case 'dispatch':{
      const r=state.replies.find(r=>r.id===cmd.id);if(!r)fail('NOT_FOUND');const reply=r!;
      if(reply!==state.replies[state.replies.length-1])fail('REPLY_SUPERSEDED');
      if(cmd.op==='submit'){
        if(reply.status!=='draft')fail('INVALID_TRANSITION');validate(reply);
        reply.fields=structuredClone(state.fields);reply.evidence=structuredClone(state.evidence);
        if(reply.risk==='clarification'){reply.status='approved';reply.reviewerId=me.user.id;reply.reviewerName=me.user.displayName;reply.reviewedAt=now;}
        else {const reviewer=(await members()).find(m=>m.id===cmd.reviewerId);if(!reviewer||reviewer.id===reply.authorId)fail('SELF_APPROVAL_FORBIDDEN');if(reviewer!.role!==(reply.risk==='technical'?'REVIEWER':'MANAGER'))fail('REVIEW_AUTHORITY_REQUIRED');reply.status='pending';reply.reviewerId=reviewer!.id;}
      }else if(['approve','reject'].includes(cmd.op)){
        if(reply.reviewerId!==me.user.id||me.user.id===reply.authorId||me.role!==(reply.risk==='technical'?'REVIEWER':'MANAGER'))throw new ApiError(403,'REVIEW_AUTHORITY_REQUIRED');
        if(reply.status!=='pending')fail('INVALID_TRANSITION');if(cmd.op==='approve')validate(reply);
        reply.status=cmd.op==='approve'?'approved':'rejected';reply.reviewNote=str('note',cmd.op==='reject');reply.reviewerName=me.user.displayName;reply.reviewedAt=now;
      }else {if(!['approved','sent'].includes(reply.status))fail('APPROVAL_REQUIRED');validate(reply);
        if(cmd.op==='dispatch'){if(reply.status==='sent')fail('ALREADY_SENT');const sent=Number(cmd.sentAt);if(sent<=0||sent>now+60000)fail('INVALID_TIME');reply.channel=str('channel');reply.sentAt=sent;reply.status='sent';}
      }break;
    }
    case 'task':{const assignee=(await members()).find(m=>m.id===cmd.assigneeId);if(!assignee)fail('INVALID_ASSIGNEE');if(!Number(cmd.dueAt))fail('INVALID_TIME');state.tasks.push({id:uid(),title:str('title'),assigneeId:assignee!.id,dueAt:Number(cmd.dueAt),timeZone:str('timeZone'),status:'open',createdAt:now});break;}
    case 'taskComplete':case 'taskCancel':{const task=state.tasks.find(t=>t.id===cmd.id);if(!task||task.status!=='open')fail('INVALID_TRANSITION');task!.result=str('note');task!.status=cmd.op==='taskComplete'?'done':'cancelled';task!.completedAt=now;break;}
    case 'close':if(state.tasks.some(t=>t.status==='open'))fail('OPEN_TASKS');if(state.replies.some(r=>r.status==='pending'))fail('PENDING_APPROVAL');state.result=str('result');state.conclusion=str('note');await api.updateStatus(id,'done');break;
    case 'reopen':str('note');state.result='';await api.updateStatus(id,'open');break;
    case 'status':if(str('status').startsWith('waiting')&&!state.tasks.some(t=>t.status==='open'))fail('FOLLOWUP_REQUIRED');await api.updateStatus(id,str('status'));patchDemoCase(id,{stage:str('stage')});break;
    case 'assign':{const owner=(await members()).find(m=>m.id===cmd.ownerId);if(!owner)fail('INVALID_ASSIGNEE');patchDemoCase(id,{ownerId:owner!.id,ownerName:owner!.name});break;}
    default:fail('UNKNOWN_COMMAND');
  }
  state.revision++;state.events.push({id:uid(),action:cmd.op,detail:cmd.op,actor:me.user.displayName,at:now});localStorage.setItem(key(me.activeTenantId,id),JSON.stringify(state));return state;
}
export async function inbox():Promise<InboxItem[]> {
  if(!DEMO_MODE)return request('/workflow/inbox');
  const me=await api.me();const rows:InboxItem[]=[];
  for(const c of await api.cases()) {const w=await getWorkflow(c.id);
    w.tasks.filter(t=>t.status==='open'&&t.assigneeId===me.user.id).forEach(t=>rows.push({...t,kind:'tasks',caseId:c.id,topic:c.topic}));
    w.replies.filter(r=>r.status==='pending'&&r.reviewerId===me.user.id).forEach(r=>rows.push({...r,kind:'replies',caseId:c.id,topic:c.topic}));
  }return rows;
}
