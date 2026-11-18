import {useState} from 'react';
import {DEMO_MODE} from '../api';
import {request} from '../realApi';
import type {KnowledgeItem, Lang} from '../types';
import {errorMessage, wording} from './labels';

interface Version {
  version:number; content:string; status:string; authorId:string; createdAt:number;
}
interface Props {
  item:KnowledgeItem; lang:Lang; canReview:boolean; userId:string;
  reload:()=>Promise<unknown>; onDirty:(value:boolean)=>void;
}
export default function KnowledgeVersions({item,lang,canReview,userId,reload,onDirty}:Props){
  const w=(zh:string,en:string)=>wording(lang,zh,en);
  const base='/knowledge/'+encodeURIComponent(item.id);
  const [rows,setRows]=useState<Version[]>([]),[failure,setFailure]=useState('');
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
  const [draft,setDraft]=useState<{name:string;summary:string;source:string;version:number}>();
  const load=async()=>setRows(await request<Version[]>(base+'/versions'));
  const run=async(action:()=>Promise<void>)=>{
    setBusy(true);setFailure('');
    try{await action();}catch(error){setFailure(errorMessage(lang,error));}finally{setBusy(false);}
  };
  const act=(path:string,body?:object)=>run(async()=>{
    await request(path,{method:'POST',body:body?JSON.stringify(body):undefined});
    setDraft(undefined);onDirty(false);
    await reload();await load();
  });
  const label=(status:string)=>({
    draft:w('草稿','Draft'),pending:w('待审核','Pending'),published:w('有效','Published'),
    superseded:w('历史版本','Superseded'),retired:w('已撤回','Withdrawn')
  })[status]||status;
  if(DEMO_MODE)return <p className="smallprint">{w('资料修订、发布与撤回请在本地版中使用。','Use the local edition for revision, publishing and withdrawal.')}</p>;
  return <section className="knowledge-versions">
    <h3>{w('版本记录','Version history')}</h3>
    <button className="btn" disabled={busy} aria-expanded={open} onClick={()=>{
      if(open){if(draft&&!window.confirm(w('放弃修订草稿？','Discard this revision?')))return;
        setDraft(undefined);onDirty(false);setOpen(false);}
      else {setOpen(true);void run(load);}
    }}>{open?w('收起版本','Hide versions'):w('查看版本与修订','View versions and revisions')}</button>
    {failure&&<p role="alert">{failure} <button className="btn" disabled={busy} onClick={()=>run(load)}>{w('重新读取版本','Reload versions')}</button></p>}
    {open&&<>
      <div className="flex knowledge-actions">
        {!draft&&<button className="btn" disabled={busy} onClick={()=>setDraft({name:item.name,summary:item.summary,source:item.source||'',version:item.version})}>{w('提交修订草稿','Propose revision')}</button>}
        {canReview&&item.verified&&<button className="btn danger" disabled={busy||!!draft} onClick={()=>{
          if(window.confirm(w('撤回后，引用此资料的待发回复需重新核验。继续？','Withdrawal blocks outstanding replies using this evidence. Continue?')))void act(base+'/retire');
        }}>{w('撤回有效资料','Withdraw evidence')}</button>}
      </div>
      {draft&&<form onSubmit={e=>{e.preventDefault();void act(base+'/versions',draft);}}>
        {([['name',w('名称','Name'),120],['summary',w('正文','Content'),4000],['source',w('授权来源','Authorised source'),180]] as const)
          .map(([key,title,max])=>{
            const update=(value:string)=>{setDraft({...draft,[key]:value});onDirty(true);};
            return <label className="field" key={key}>{title}{key==='summary'?
              <textarea required maxLength={max} value={draft[key]} onChange={e=>update(e.target.value)}/>:
              <input required maxLength={max} value={draft[key]} onChange={e=>update(e.target.value)}/>}</label>;
          })}
        <div className="flex"><button className="btn primary" disabled={busy}>{w('保存新版本待审','Submit new version')}</button>
          <button type="button" className="btn" disabled={busy} onClick={()=>{setDraft(undefined);onDirty(false);}}>{w('取消修订','Cancel revision')}</button>
        </div>
      </form>}
      {rows.map(row=>{
        const content=JSON.parse(row.content);
        return <details key={row.version} className="task-row">
          <summary>V{row.version} · {label(row.status)}</summary>
          <strong>{content.name}</strong><p className="quote">{content.summary}</p><small>{content.source}</small>
          {row.status==='pending'&&canReview&&row.authorId!==userId&&<p><button className="btn primary" disabled={busy||!!draft}
            onClick={()=>act(base+'/versions/'+row.version+'/publish')}>{w('审核并发布本版本','Approve & publish')}</button></p>}
        </details>;
      })}
      <p className="smallprint">{w('新版本发布前仍使用当前有效版本。发布后，旧引用需重新核验。','The current version remains effective until a revision is published. Revalidate previous references after publication.')}</p>
    </>}
  </section>;
}
