import {useEffect, useRef, useState} from 'react';
import FeeEditor from './FeeEditor';
import QuoteAssist from './QuoteAssist';
import {total} from './demoModel';

type Quote = {id:string; amounts:string[]; conditions:string; at:number};
type Offer = {id:string; amounts:string[]; terms:string; replyDeadline:number};
type Reply = {id:string; decision:keyof typeof decisions; note:string; at:number};
type Invitation = {
  title:string; route:string; cargo:string; terms:string; currency:string; deadline:number; status:string;
  supplier:{name:string}; items:{id:string;name:string}[]; offers:Offer[]; quotes:Quote[]; responses:Reply[];
  quoteWithdrawal?:{reason:string}; responsesFrozen:boolean;
};
const decisions = {accept:'整单接受', conditional:'附条件接受', reject:'拒绝'};
const date = (value:number) => new Date(value).toLocaleString('zh-CN', {hour12:false});

async function supplierCall(id:string, body?:object):Promise<Invitation> {
  const result = await fetch('/api/supplier/' + encodeURIComponent(id), {
    method:body ? 'POST' : 'GET',
    headers:{'Content-Type':'application/json', 'X-Invitation':location.hash.slice(1)},
    body:body ? JSON.stringify(body) : undefined
  });
  const data = await result.json();
  if (!result.ok) throw Error(data.error);
  return data;
}

export default function SupplierPortal() {
  const id = new URLSearchParams(location.search).get('supplier') || '';
  const [project,setProject] = useState<Invitation>();
  const [values,setValues] = useState<string[]>([]);
  const [conditions,setConditions] = useState(''), [reply,setReply] = useState('');
  const [reason,setReason] = useState(''), [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false), [editing,setEditing] = useState(false);
  const [now,setNow] = useState(Date.now);
  const pending = useRef<{body:string; requestId:string}>();
  useEffect(() => {
    let active = true;
    supplierCall(id).then(p => {
      if (!active) return;
      const quote = p.quotes[p.quotes.length - 1];
      setValues(quote?.amounts ?? p.items.map(() => ''));
      setConditions(quote?.conditions ?? '');
      setProject(p);
    }).catch(e => { if (active) setMessage(e.message); });
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { active=false; window.clearInterval(clock); };
  }, [id]);

  async function send(input:object) {
    if (busy) return;
    setBusy(true);
    const body = JSON.stringify(input);
    try {
      if (pending.current?.body !== body) pending.current = {body,requestId:crypto.randomUUID()};
      setProject(await supplierCall(id,{...input,requestId:pending.current.requestId}));
      pending.current=undefined;
      setEditing(false); setReply(''); setReason('');
      setMessage('已收到回执，采购方同步后可查看。');
    } catch (e) { setMessage(String(e)); }
    finally { setBusy(false); }
  }
  if (!project) return <main className="supplier-portal"><p role="status">{message || '正在读取询价…'}</p></main>;
  const p=project, fees=p.items.map(i => i.name), last=p.quotes[p.quotes.length-1], offer=p.offers[p.offers.length-1];
  const canQuote=p.status==='published' && now<=p.deadline && !p.responsesFrozen && !p.quoteWithdrawal;
  const canReply=offer && now<=offer.replyDeadline && !p.responsesFrozen && !p.quoteWithdrawal;
  return <main className="supplier-portal">
    <header className="desk-heading"><div><small>{p.supplier.name} · 供应商填报</small><h1>{p.title}</h1><p>{p.route} · {p.cargo}</p></div></header>
    <p>报价截止 {date(p.deadline)} · {p.currency}</p>
    <details className="terms-note" open={canQuote && !last}><summary>统一报价条款</summary><p>{p.terms}</p></details>
    {message && <p role="status" className="notice">{message}</p>}
    {p.quoteWithdrawal && <p className="notice">报价已撤回 · {p.quoteWithdrawal.reason}</p>}
    {p.responsesFrozen && <p className="notice">承接已锁定，可查看本单回执。</p>}
    {offer && <section className="panel"><h2>采购方目标价 · 第 {p.offers.length} 版</h2>
      <p><strong>{p.currency} {total(offer.amounts)}</strong> · 回复截止 {date(offer.replyDeadline)}</p>
      <p>{offer.terms}</p><details><summary>查看逐项目标价</summary><dl className="supplier-fees">{fees.map((f,i)=><div key={i}><dt>{f}</dt><dd>{offer.amounts[i]}</dd></div>)}</dl></details>
      {canReply ? <><label className="field">回复说明（拒绝或附条件时必填）<textarea value={reply} onChange={e=>setReply(e.target.value)}/></label>
      <div className="flex">{(Object.keys(decisions) as Reply['decision'][]).map(key=><button key={key} className={'btn '+(key==='accept'?'primary':'')}
        disabled={busy || (key!=='accept' && !reply.trim())} onClick={()=>send({op:'respond',offerId:offer.id,decision:key,note:reply})}>{decisions[key]}</button>)}</div></> :
      now>offer.replyDeadline && <p>本版回复已截止。</p>}
    </section>}
    {canQuote && (!last || editing) ? <section className="panel"><h2>{last?'修订本家报价':'填写报价'}</h2>
      <QuoteAssist fees={fees} apply={setValues} disabled={busy}/>
      <form onSubmit={e=>{e.preventDefault();send({op:'quote',amounts:values,conditions});}}>
        <FeeEditor fees={fees} amounts={values} onChange={setValues} disabled={busy} currency={p.currency}/>
        <label className="field">附加条件（选填）<textarea value={conditions} disabled={busy} onChange={e=>setConditions(e.target.value)}/></label>
        <button className="btn primary" disabled={busy}>提交本家报价</button>
      </form></section> : !last && !offer && <p>本轮报价已截止。</p>}
    {last && <section className="panel"><h2>本家最新报价</h2><p>{p.currency} {total(last.amounts)} · 第 {p.quotes.length} 版 · {date(last.at)}</p>
      {canQuote && !editing && <button className="btn" onClick={()=>setEditing(true)}>修订报价</button>}
      {!p.responsesFrozen && !p.quoteWithdrawal && <details><summary>撤回本轮报价</summary><label className="field">撤回原因<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <button className="btn danger" disabled={busy||!reason.trim()} onClick={()=>{if(window.confirm('撤回后本轮不能继续报价或接受目标价，确认撤回？'))send({op:'withdrawQuote',reason});}}>确认撤回报价</button></details>}
    </section>}
    {(last || p.responses.length>0) && <details className="panel"><summary>我的回执 · {p.quotes.length+p.responses.length} 条</summary>
      {[...p.responses].reverse().map(r=><p key={r.id}>{decisions[r.decision]} · {r.note} · {date(r.at)}<small className="receipt-id">{r.id}</small></p>)}
      {[...p.quotes].reverse().map(q=><details key={q.id}><summary>{p.currency} {total(q.amounts)} · {date(q.at)}</summary><dl className="supplier-fees">{fees.map((f,i)=><div key={i}><dt>{f}</dt><dd>{q.amounts[i]}</dd></div>)}</dl><p>{q.conditions||'无附加条件'}</p><small className="receipt-id">{q.id}</small></details>)}
    </details>}
    {p.offers.length>1 && <details className="panel"><summary>往期目标价</summary>{p.offers.slice(0,-1).map((o,i)=><div key={o.id}><h3>第 {i+1} 版 · {p.currency} {total(o.amounts)}</h3><p>{o.terms}</p><dl className="supplier-fees">{fees.map((f,j)=><div key={j}><dt>{f}</dt><dd>{o.amounts[j]}</dd></div>)}</dl></div>)}</details>}
  </main>;
}
