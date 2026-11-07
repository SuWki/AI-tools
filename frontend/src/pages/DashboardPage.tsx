import { useEffect, useState } from 'react';
import { api } from '../api';
import { t, localized, I18nKey } from '../i18n';
import type { DashboardData, Lang, Page } from '../types';
import { CaseRow, Metric, PageHead } from '../ui';
import { inbox } from '../workflow/client';
import type { InboxItem } from '../workflow/types';
import { fmtTime } from '../i18n';

interface Props {
  lang: Lang;
  tenantId: string;
  toast: (msg: string) => void;
  navigate: (page: Page) => void;
  openCase: (id: string) => void;
  newCase: () => void;
}

export default function DashboardPage({ lang, tenantId, toast, navigate, openCase, newCase }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tasks,setTasks] = useState<InboxItem[]>([]);
  useEffect(()=>{let alive=true;setTasks([]);inbox().then(r=>{if(alive)setTasks(r);}).catch(()=>undefined);return()=>{alive=false;};},[tenantId]);

  useEffect(() => {
    let alive = true;
    api.dashboard()
      .then((res) => { if (alive) setData(res); })
      .catch(() => { if (alive) toast(t(lang, 'loadFailed')); });
    return () => { alive = false; };
  }, [tenantId, lang]);

  const steps: Array<[I18nKey, I18nKey]> = [
    ['s1', 's1d'], ['s2', 's2d'], ['s3', 's3d'], ['s4', 's4d']
  ];

  return (
    <>
      <PageHead
        lang={lang}
        titleKey="overviewTitle"
        descKey="overviewDesc"
        action={<button className="btn primary" onClick={newCase}>＋ {t(lang, 'startCase')}</button>}
      />
      <section className="panel" style={{marginBottom:20}}><div className="sectionhead"><h2>{lang==='zh'?'我的待办与待审核':'My tasks & approvals'}</h2><span className="pill">{tasks.length}</span></div>{tasks.length===0?<p className="muted">{lang==='zh'?'暂无待办，可登记咨询或继续处理近期工单。':'No pending work. Register an enquiry or continue a recent case.'}</p>:tasks.sort((a,b)=>(a.dueAt||0)-(b.dueAt||0)).map(task=><button className="queue-item" key={task.id} onClick={()=>openCase(task.caseId)}><strong>{task.title||(lang==='zh'?`待审核回复 V${task.version}`:`Reply awaiting approval V${task.version}`)}</strong><span>{task.caseId} · {task.topic}</span>{task.dueAt&&<small>{fmtTime(lang,task.dueAt)} · {task.dueAt<Date.now()?(lang==='zh'?'已逾期':'Overdue'):''}</small>}</button>)}</section>
      {!data ? <div className="panel empty">{t(lang, 'loading')}</div> : (
        <>
          <div className="grid" style={{ marginBottom: 17 }}>
            <Metric lang={lang} labelKey="totalCases" value={data.totalCases} />
            <Metric lang={lang} labelKey="openCases" value={data.openCases} />
            <Metric lang={lang} labelKey="doneCases" value={data.doneCases} />
            <Metric lang={lang} labelKey="knowledgeCount" value={data.knowledgeCount} />
          </div>
          <div className="panel" style={{ marginBottom: 17 }}>
            <div className="sectionhead">
              <div>
                <h2>{t(lang, 'quickStart')}</h2>
                <p>{t(lang, 'quickStartDesc')}</p>
              </div>
            </div>
            <div className="steps">
              {steps.map(([title, desc], index) => (
                <div className="step" key={title}>
                  <div className="n">0{index + 1} / 04</div>
                  <strong>{t(lang, title)}</strong>
                  <small>{t(lang, desc)}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="split-even">
            <div className="panel">
              <div className="sectionhead">
                <div><h2>{t(lang, 'recentCases')}</h2></div>
                <button className="btn sm" onClick={() => navigate('cases')}>{t(lang, 'seeAll')} →</button>
              </div>
              {data.recentCases.length ? data.recentCases.map((item) => (
                <CaseRow key={item.id} lang={lang} item={item} selected={false} onSelect={openCase} />
              )) : <div className="empty">{t(lang, 'noCases')}</div>}
              <div className="flex" style={{ marginTop: 14 }}>
                <button className="btn soft" onClick={() => navigate('analysis')}>{t(lang, 'startAnalysis')}</button>
                <button className="btn" onClick={() => navigate('knowledge')}>{t(lang, 'goKnowledge')}</button>
              </div>
            </div>
            <div className="panel">
              <div className="sectionhead">
                <div>
                  <h2>{t(lang, 'needCheck')}</h2>
                  <p>{t(lang, 'needCheckDesc')}</p>
                </div>
              </div>
              <div className="checklist">
                {data.requirements.map((rule) => (
                  <div className="checkitem" key={rule.id}>
                    <span className="dot">?</span>
                    {localized(lang, rule as unknown as Record<string, unknown>, 'text')}
                  </div>
                ))}
              </div>
              <div className="divider" />
              <div className="tiny-label">{t(lang, 'workflowRules')}</div>
              <div className="smallprint">
                • {t(lang, 'w1')}<br />• {t(lang, 'w2')}<br />• {t(lang, 'w3')}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
