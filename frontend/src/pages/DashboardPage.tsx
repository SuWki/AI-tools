import { useEffect, useState } from 'react';
import { api } from '../api';
import { t, localized, I18nKey } from '../i18n';
import type { DashboardData, Lang, Page } from '../types';
import { CaseRow, Metric, PageHead } from '../ui';

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
