import SupplierInsights from '../procurement/SupplierInsights';
import {realSuppliers} from '../procurement/supplierData';
import ProcurementDashboard,{realRecord} from '../procurement/ProcurementDashboard';
import {useEffect,useState} from 'react';
import {request} from '../realApi';
import {DEMO_MODE} from '../api';
import DemoProcurement from '../procurement/DemoProcurement';
import ProcurementNav, {ProcurementView} from '../procurement/ProcurementNav';
import FeeEditor from '../procurement/FeeEditor';
import {copyText} from '../clipboard';
import {total} from '../procurement/demoModel';

const replyLabels:Record<string,string>={accept:'整单接受',conditional:'附条件接受',reject:'拒绝'};
const procurementErrors:Record<string,string>={
  PORTAL_SYNC_FAILED:'无法连接门户。请检查网络和门户地址，再点击同步。',
  PORTAL_NOT_CONFIGURED:'还没有配置供应商门户。可在本机验收流程，跨设备发布前请配置门户。',
  SYNC_CLOSED_ROUND_FIRST:'关闭报价后请先同步，收齐门户回执再比价。',
  BEFORE_DEADLINE:'报价窗口尚未截止。',
  NO_COMPARABLE_QUOTES:'暂无可比报价，请核对报价回执和附加条件。',
  REVISION_CONFLICT:'询价单已更新，重新打开或同步后再操作。'
};
const feeNames=['提货','起点装卸','起点仓储','干线运输','中转','终点仓储','终点装卸','配送','保险','其他约定服务'];
export default function ProcurementPage({tenantId}:{tenantId:string}){
 const [listState,setListState]=useState<'loading'|'ready'|'failed'>('loading');
 const [query,setQuery]=useState('');
 const [now,setNow]=useState(Date.now);
 const [view,setView]=useState<ProcurementView>('work');
 const [creating,setCreating]=useState(false);
 const [detailOpen,setDetailOpen]=useState(false);
 const [registryName,setRegistryName]=useState('');
 const [supplierRecords,setSupplierRecords]=useState<{id:string;name:string}[]>([]),[supplierRecordId,setSupplierRecordId]=useState(''),[rows,setRows]=useState<any[]>([]),[p,setP]=useState<any>(),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[link,setLink]=useState(''),[base,setBase]=useState(location.origin),[comparison,setComparison]=useState<any>(),[metrics,setMetrics]=useState<any>();
 const [title,setTitle]=useState(''),[route,setRoute]=useState(''),[cargo,setCargo]=useState(''),[terms,setTerms]=useState('CNY 含税整单价，所有费用按相同服务范围报价。'),[deadline,setDeadline]=useState(''),[fees,setFees]=useState(feeNames.join('\n')),[supplier,setSupplier]=useState(''),[amounts,setAmounts]=useState<string[]>([]),[offerTerms,setOfferTerms]=useState(''),[awardReason,setAwardReason]=useState(''),[changeReason,setChangeReason]=useState(''),[confirmation,setConfirmation]=useState(''),[withdrawalReason,setWithdrawalReason]=useState(''),[delta,setDelta]=useState('');
 const load=()=>Promise.all([request<any[]>('/procurement').then(setRows),request<{id:string;name:string}[]>('/procurement-suppliers').then(setSupplierRecords)]);
 const reload=()=>{setListState('loading');void load().then(()=>setListState('ready')).catch(e=>{setListState('failed');setMessage(e.message);});};
 useEffect(()=>{if(!DEMO_MODE)reload();},[]);
 useEffect(()=>{
   if(!p||p.status!=='published')return;
   setNow(Date.now());
   const clock=window.setInterval(()=>setNow(Date.now()),1000);
   return()=>window.clearInterval(clock);
 },[p?.id,p?.status]);
 const selectProject=(project:any)=>{
   setCreating(false);setDetailOpen(true);setP(project);window.scrollTo(0,0);
   setLink('');setComparison(null);setSupplier('');setSupplierRecordId('');setAmounts([]);
   setOfferTerms(project.terms);setAwardReason('');setChangeReason('');setConfirmation('');setWithdrawalReason('');setDelta('');
 };
 const run=async(fn:()=>Promise<any>)=>{
   setBusy(true);
   try{
     const result=await fn();
     try{await load();setMessage('操作成功');}
     catch{setMessage('操作已保存。列表刷新失败，请重新打开采购页面。');}
     return result;
   }catch(e){setMessage(e instanceof Error?(procurementErrors[e.message]??e.message):String(e));return null;}
   finally{setBusy(false);}
 };
 const cmd=async(body:object)=>{
   const next=await run(()=>request<any>(`/procurement/${p.id}`,{method:'POST',body:JSON.stringify({...body,revision:p.revision})}));
   if(next)setP(next);
   return next;
 };
 const confirmAward=async(candidate:{supplierId:string;offerId:string;responseId:string;reason:string})=>{
   setBusy(true);
   try{
     const next=await request(`/procurement/${p.id}`,{method:'POST',body:JSON.stringify({op:'award',revision:p.revision,...candidate})});
     setP(next);
     setMessage('承接已确认');
   }catch(e){
     const messages:Record<string,string>={
       PORTAL_ACCEPTANCE_CHANGED:'供应商已更新回复，请核对最新结果后再选择。',
       PORTAL_SYNC_FAILED:'暂未收到门户确认。联网后可继续确认同一笔承接。',
       PORTAL_UPGRADE_REQUIRED:'请升级供应商门户，然后继续确认同一笔承接。'
     };
     setMessage(e instanceof Error?(messages[e.message]||e.message):String(e));
     try{setP(await request(`/procurement/${p.id}`));}catch{/* 保留当前详情用于再次加载 */}
   }finally{
     try{await load();}catch{/* 详情已经单独加载 */}
     setBusy(false);
   }
 };
 const offer=p?.offers[p.offers.length-1];
 const offerId=offer?.id;
 const supplierName=(id:string)=>p.invitations.find((row:any)=>row.id===id)?.name??id;
 const latestQuotes=p?new Map<string,any>(p.quotes.map((quote:any)=>[quote.supplierId,quote])):new Map<string,any>();
 const quoteClosed=!!p&&now>=p.deadline;
 const visibleRows=rows.filter(row=>(row.title+' '+row.route+' '+row.id).toLowerCase().includes(query.trim().toLowerCase()));
 const latestResponses=p?Array.from(new Map<string,any>(p.responses.filter((response:any)=>response.offerId===offerId&&!p.quoteWithdrawals?.some((w:any)=>w.supplierId===response.supplierId))
   .map((response:any)=>[response.supplierId,response])).values()):[];
 if(DEMO_MODE)return <DemoProcurement tenantId={tenantId}/>;
 return <div className="procurement-real"><header className="desk-heading"><h1>采购询价</h1><button className="btn primary" disabled={busy} onClick={()=>{setView('work');setCreating(true);setDetailOpen(true);}}>新建询价</button></header>
 <ProcurementNav view={view} onChange={setView}/>
 {message&&<p className="notice" role="status">{message}</p>}
 {view==='suppliers'&&<><details className="panel"><summary>登记供应商编号</summary><label className="field">供应商档案名称<input value={registryName} onChange={e=>setRegistryName(e.target.value)}/></label><button className="btn" disabled={busy||!registryName.trim()} onClick={async()=>{const record=await run(()=>request('/procurement-suppliers',{method:'POST',body:JSON.stringify({name:registryName})}));if(record){setRegistryName('');setSupplierRecordId(record.id);}}}>保存供应商档案</button></details><SupplierInsights rows={rows.flatMap(realSuppliers).map(row=>({...row,displayName:supplierRecords.find(record=>record.id===row.key)?.name}))}/></>}
 {view==='dashboard'&&<><ProcurementDashboard records={rows.map(realRecord)}/><button className="btn" disabled={busy} onClick={async()=>setMetrics(await run(()=>request("/procurement-metrics")))}>查看供应商记录统计</button>{metrics&&<div className="panel"><p>按供应商名称初步汇总，业务评价前须核实主体；不自动归责或给总分。</p>{metrics.suppliers.map((s:any)=><p key={s.supplierKey}>{s.name} · 撤回报价 {s.quoteWithdrawals} · 已截止邀请报价 {s.quoted}/{s.endedInvitations} · 承接 {s.awards} · 退出记录 {s.withdrawals} · 完结发生核准变更 {s.completedWithChanges}/{s.completed}</p>)}</div>}</>}
 {view==='work'&&<div className={'project-layout '+(detailOpen?'show-detail':'show-list')}><aside className="panel"><h2>询价清单 <small>{rows.length}</small></h2>
 <label className="field">查找询价<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="需求、路线或编号"/></label>
 {listState==='loading'?<p role="status">正在读取询价…</p>:listState==='failed'?<button className="btn" onClick={reload}>重新读取询价</button>:!visibleRows.length&&<p>{rows.length?'没有符合条件的询价。':'暂无询价记录。'}</p>}
 {visibleRows.map(r=><button className={'queue-item '+(p?.id===r.id&&!creating?'active':'')} key={r.id} disabled={busy} onClick={()=>selectProject(r)}><strong>{r.title}</strong><small>{realRecord(r).status} · {r.route}</small></button>)}
 </aside><section className="panel project-detail">
 <button className="btn mobile-back" disabled={busy} onClick={()=>{setDetailOpen(false);window.scrollTo(0,0);}}>返回询价清单</button>
 {creating?<><h2>发布新询价</h2><form onSubmit={async e=>{e.preventDefault();const next=await run(()=>request('/procurement',{method:'POST',body:JSON.stringify({title,route,cargo,terms,currency:'CNY',deadline:new Date(deadline).getTime(),items:fees.split('\n').filter(Boolean).map(name=>({name}))})}));if(next){selectProject(next);setTitle('');setCargo('');setRoute('');setDeadline('');}}}>{[['标题',title,setTitle],['起点到终点',route,setRoute],['货量、重量、体积及运输时间',cargo,setCargo]].map(([label,v,set]:any)=><label className="field" key={label}>{label}<input required value={v} onChange={e=>set(e.target.value)}/></label>)}<label className="field">统一报价口径<textarea required value={terms} onChange={e=>setTerms(e.target.value)}/></label><label className="field">费用科目，每行一项<textarea required value={fees} onChange={e=>setFees(e.target.value)}/></label><label className="field">报价截止<input type="datetime-local" required value={deadline} onChange={e=>setDeadline(e.target.value)}/></label><button className="btn primary" disabled={busy}>冻结并发布</button></form></>:p?<><header className="project-overview"><small>{p.id} · {realRecord(p).status}</small><h2>{p.title}</h2><p>{p.route} · {p.cargo}</p><p>报价截止 {new Date(p.deadline).toLocaleString()} · {p.currency}</p></header><details className="terms-note"><summary>需求条款与同步记录</summary><p>{p.terms}</p><p>版本 {p.revision} · 最近同步 {p.syncedAt?new Date(p.syncedAt).toLocaleString():'尚未同步'}</p></details><button className="btn" disabled={busy||!!p.pendingAward} onClick={async()=>{const next=await run(()=>request(`/procurement/${p.id}/sync`,{method:'POST'}));if(next){setP(next);setComparison(null);if((next.quoteWithdrawals?.length??0)>(p.quoteWithdrawals?.length??0)){setAmounts([]);setMessage('收到撤回记录，请重新比价并检查已发出的目标价。');}}}}>发布到门户 / 同步收件</button>{p.status==='published'&&<><h3>邀请供应商</h3><label className="field">门户地址<input value={base} onChange={e=>setBase(e.target.value)}/></label><label className="field">选择供应商编号<select value={supplierRecordId} onChange={e=>setSupplierRecordId(e.target.value)}><option value="">新供应商</option>{supplierRecords.map(record=><option key={record.id} value={record.id}>{record.name} · {record.id.slice(0,8)}</option>)}</select></label>{!supplierRecordId&&<label className="field">新供应商名称<input value={supplier} onChange={e=>setSupplier(e.target.value)}/></label>}<button className="btn" disabled={busy||(!supplierRecordId&&!supplier.trim())} onClick={async()=>{const next=await cmd({op:'invite',name:supplier,supplierRecordId});if(next?.invitationToken)setLink(`${base.replace(/\/$/,'')}/?supplier=${p.id}#${next.invitationToken}`);}}>生成独立邀请</button>{link&&<div className="quote"><p>独立门户模式请先同步再分发。链接仅本次显示。</p><textarea readOnly value={link}/><div className="flex"><button className="btn" onClick={async()=>{setMessage(await copyText(link)?'已复制本次邀请链接。':'请选中链接手动复制。');}}>复制邀请链接</button><a href={link} target="_blank" rel="noreferrer">打开填报页</a></div></div>}</>}<h3>报价回收 · {latestQuotes.size} / {p.invitations.length} 家</h3>
  {!p.invitations.length&&<p className="muted">尚未邀请供应商。</p>}
  {p.invitations.map((entry:any)=>{
    const quote=latestQuotes.get(entry.id);
    const withdrew=p.quoteWithdrawals?.some((row:any)=>row.supplierId===entry.id);
    return <div className="quote-inbox-row" key={entry.id}><strong>{entry.name}</strong>
      <span>{withdrew?'已撤回':quote?'最新整单 '+p.currency+' '+total(quote.amounts):'等待报价'}</span></div>;
  })}{p.status!=='published'&&p.invitations.some((i:any)=>!i.supplierRecordId)&&<label className="field">选择关联档案<select value={supplierRecordId} onChange={e=>setSupplierRecordId(e.target.value)}><option value="">选择供应商</option>{supplierRecords.map(r=><option key={r.id} value={r.id}>{r.name} · {r.id.slice(0,8)}</option>)}</select></label>}
 {p.invitations.filter((i:any)=>!i.supplierRecordId).map((i:any)=><div className="task-row" key={i.id}>{i.name} · 历史邀请未关联 <button className="btn sm" disabled={busy||!supplierRecordId} onClick={()=>cmd({op:'linkSupplier',invitationId:i.id,supplierRecordId})}>关联到所选供应商编号</button></div>)}{p.quoteWithdrawals?.map((w:any)=><p key={w.id}>{p.invitations.find((i:any)=>i.id===w.supplierId)?.name} · 已撤回报价 · {w.reason}</p>)}<details className="terms-note"><summary>报价回执 · {p.quotes.length} 份</summary>{p.quotes.map((q:any)=><p key={q.id}>{p.invitations.find((s:any)=>s.id===q.supplierId)?.name} · {q.amounts.join(' / ')} · {q.conditions||'无额外条件'} · 回执 {q.id}</p>)}</details>{p.status==='published'&&<><button className="btn" disabled={busy||!quoteClosed} onClick={()=>cmd({op:'close'})}>截止后关闭轮次</button>
 <small>{quoteClosed?'报价截止，可结束轮次。':'到达截止时间后可以结束轮次。'}</small></>}
 {p.status==='closed'&&!p.pendingAward&&!p.award&&<details className="terms-note" key={offerId||'first-offer'} open={!offer}><summary>{offer?'更新目标报价':'比价与目标报价'}</summary><button className="btn" disabled={busy} onClick={async()=>{const result=await run(()=>request(`/procurement/${p.id}/comparison`));if(result){setComparison(result);setAmounts(result.minimums.map((m:any)=>m.amount));}}}>计算可比最低价</button>{comparison&&<div className="notice">最低整单 {comparison.bestWholeTotal}；分项参考 {comparison.referenceTotal}（不是成交价）；附条件排除 {comparison.excludedConditionalQuotes} 家，撤回排除 {comparison.excludedWithdrawnQuotes} 家</div>}<details className="terms-note" key={p.id}><summary>核对或调整逐项目标金额</summary><FeeEditor fees={p.items.map((i:any)=>i.name)} amounts={amounts} onChange={setAmounts} disabled={busy}/></details><label className="field">目标条款<textarea value={offerTerms} onChange={e=>setOfferTerms(e.target.value)}/></label><button className="btn primary" disabled={busy||amounts.length!==p.items.length||amounts.some(v=>!v.trim())||!offerTerms.trim()} onClick={async()=>{if(await cmd({op:'offer',amounts,terms:offerTerms,replyDeadline:Date.now()+86400000})){setAmounts([]);setComparison(null);setAwardReason('');}}}>核准目标报价，24 小时回复</button><p>生成后须同步到门户。附条件回复需另行核验。</p></details>}{offer&&<><h3>目标价回复</h3><p>第 {p.offers.length} 版 · {p.currency} {total(offer.amounts)} · 回复截止 {new Date(offer.replyDeadline).toLocaleString()}</p>{!latestResponses.length&&<p>暂无有效回复，可同步收件。</p>}</>}{p.pendingAward?<div className="notice">承接待门户确认 <button className="btn" disabled={busy} onClick={()=>confirmAward(p.pendingAward)}>继续确认承接</button></div>:<>{!p.award&&latestResponses.some(r=>r.decision==='accept')&&<label className="field">选择该供应商的理由<textarea value={awardReason} onChange={e=>setAwardReason(e.target.value)}/></label>}{latestResponses.map(r=><p key={r.id}>{supplierName(r.supplierId)} · {replyLabels[r.decision]??r.decision} {r.decision==='accept'&&<button className="btn sm" disabled={busy||!!p.award||!awardReason.trim()} onClick={()=>confirmAward({supplierId:r.supplierId,offerId:r.offerId,responseId:r.id,reason:awardReason})}>确认完整承接</button>}</p>)}</>}{p.award&&<><h3>履约与费用变更</h3><button className="btn" disabled={busy||!!p.completedAt||!!p.withdrawal||p.changes.some((change:any)=>change.status==='proposed')} onClick={()=>cmd({op:"complete"})}>登记履约完成</button><label className="field">费用变化金额<input value={delta} onChange={e=>setDelta(e.target.value)}/></label><label className="field">费用变更原因<textarea value={changeReason} onChange={e=>setChangeReason(e.target.value)}/></label><button className="btn" disabled={busy||!!p.completedAt||!!p.withdrawal} onClick={()=>cmd({op:'change',delta,reason:changeReason,cause:'待核验归因'})}>登记变更申请</button><label className="field">退出原因<textarea value={withdrawalReason} onChange={e=>setWithdrawalReason(e.target.value)}/></label><button className="btn" disabled={busy||!!p.completedAt||!!p.withdrawal} onClick={()=>cmd({op:'withdraw',reason:withdrawalReason})}>登记承接后退出</button><label className="field">双方确认依据<textarea value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>{p.changes.map((c:any)=><p key={c.id}>{c.delta} · {c.reason} · {c.status}{c.status==='proposed'&&<button className="btn sm" disabled={busy||!!p.completedAt||!!p.withdrawal} onClick={()=>cmd({op:'approveChange',changeId:c.id,confirmation})}>记录确认依据</button>}</p>)}</>}<details className="terms-note"><summary>过程记录 · {p.events.length} 条</summary>{[...p.events].reverse().map((e:any)=><p key={e.id}>{e.action} · {e.actor} · {new Date(e.at).toLocaleString()}</p>)}</details></>:<p>选择一张询价单，或点击「新建询价」。</p>}</section></div>}</div>;
}
