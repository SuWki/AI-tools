import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { fmtTime, t } from '../i18n';
import type { DashboardData, Lang, Page } from '../types';
import { CaseRow } from '../ui';
import { inbox } from '../workflow/client';
import type { CaseTarget, InboxItem } from '../workflow/types';

interface Props {
  lang: Lang;
  tenantId: string;
  onUnauthorized: () => void;
  navigate: (page: Page) => void;
  openCase: (id: string, inbox?: CaseTarget['inbox']) => void;
  newCase: () => void;
}

type Load<T> = { state: 'loading' | 'failed' } | { state: 'ready'; data: T };

export default function DashboardPage({lang, tenantId, onUnauthorized, navigate, openCase, newCase}: Props) {
  const [overview, setOverview] = useState<Load<DashboardData>>({state:'loading'});
  const [inboxState, setInboxState] = useState<Load<InboxItem[]>>({state:'loading'});
  const [attempt, setAttempt] = useState(0);
  const zh = lang === 'zh';
  useEffect(() => {
    let alive = true;
    const fail = (error: unknown) => {
      if (!alive) return;
      if (error instanceof ApiError && error.status === 401) onUnauthorized();
    };
    setInboxState({state:'loading'});
    setOverview({state:'loading'});
    inbox().then(data => { if (alive) setInboxState({state:'ready', data}); })
      .catch(error => { if (alive) setInboxState({state:'failed'}); fail(error); });
    api.dashboard().then(data => { if (alive) setOverview({state:'ready', data}); })
      .catch(error => { if (alive) setOverview({state:'failed'}); fail(error); });
    return () => { alive = false; };
  }, [tenantId, attempt]);

  const retry = <button className="btn" onClick={() => setAttempt(n=>n+1)}>{zh?'重试':'Retry'}</button>;
  const tasks = inboxState.state==='ready' ? [...inboxState.data].sort((a,b)=>
    (a.dueAt??Infinity) - (b.dueAt??Infinity) || a.createdAt - b.createdAt) : [];
  return <div className="home-desk">
    <div className="home-heading">
      <div>
        <h1>{zh?'我的工作台':'My workspace'}</h1>
        <p>{new Intl.DateTimeFormat(zh?'zh-CN':'en', {weekday:'long', month:'long', day:'numeric'}).format(new Date())}</p>
      </div>
      <button className="btn primary" onClick={newCase}>{zh?'登记咨询':'New enquiry'}</button>
    </div>
    <div className="home-columns">
      <div>
        <section className="panel home-sheet">
          <h2>{zh?'待我处理':'Assigned to me'}</h2>
          {inboxState.state==='loading' ? <p role="status">{t(lang,'loading')}</p> :
            inboxState.state==='failed' ? <p role="alert">{zh?'待办加载失败':'Could not load tasks'} {retry}</p> :
            tasks.length===0 ? <p>{zh?'暂无待办。':'No open tasks.'}</p> :
            tasks.map(task => <button className="home-row" key={task.kind+task.id}
              onClick={()=>openCase(task.caseId, {id:task.id, kind:task.kind, version:task.version})}>
              <span><strong>{task.kind==='replies'?(zh?'审核回复':'Review reply')+(task.version?' V'+task.version:''):task.title}</strong>
                <small>{task.topic} · {task.caseId}{task.dueAt ? ' · '+fmtTime(lang,task.dueAt) : ''}</small></span>
              <span className="home-status" data-attention={task.kind==='replies'||(task.dueAt??Infinity)<Date.now()}>
                {task.kind==='replies'?(zh?'待审核':'Pending review'):(task.dueAt??Infinity)<Date.now()?(zh?'已逾期':'Overdue'):(zh?'跟进':'Follow-up')}
              </span>
            </button>)}
        </section>
        <section className="panel home-sheet">
          <h2>{t(lang,'recentCases')}</h2>
          {overview.state==='ready' ? (overview.data.recentCases.length>0?
            overview.data.recentCases.map(item=><CaseRow key={item.id} lang={lang} item={item} selected={false} onSelect={openCase}/>):
            <p>{t(lang,'noCases')}</p>) : overview.state==='loading'?
            <p role="status">{t(lang,'loading')}</p>:<p role="alert">{t(lang,'loadFailed')} {retry}</p>}
        </section>
      </div>
      <aside className="panel home-sheet">
        <h2>{zh?'常用入口':'Quick access'}</h2>
        {([
          ['procurement', zh?'采购询价':'Procurement', zh?'查看在办询价与报价回收':'Open enquiries and supplier quotes'],
          ['knowledge', zh?'查找资料':'Find documents', zh?'按名称或编号查找':'Search by title or reference'],
          ['analysis', zh?'销售复盘':'Sales review', zh?'检查一段客户对话':'Review a customer conversation']
        ] as const).map(([id,title,detail])=><button key={id} className="home-row" onClick={()=>navigate(id)}>
          <span><strong>{title}</strong><small>{detail}</small></span><span aria-hidden>›</span>
        </button>)}
      </aside>
    </div>
  </div>;
}
