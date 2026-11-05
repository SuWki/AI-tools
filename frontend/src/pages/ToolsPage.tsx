import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { copyText } from '../clipboard';
import { t, localized, I18nKey } from '../i18n';
import type { CaseItem, Lang } from '../types';
import { PageHead } from '../ui';

interface Props {
  lang: Lang;
  tenantId: string;
  toast: (msg: string) => void;
  onUnauthorized: () => void;
}

const types: I18nKey[] = ['reply', 'audit', 'productCompare', 'content'];

export default function ToolsPage({ lang, tenantId, toast, onUnauthorized }: Props) {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [type, setType] = useState<I18nKey>('reply');
  const [caseId, setCaseId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  const fail = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      onUnauthorized();
      return;
    }
    toast(error instanceof Error ? error.message : t(lang, 'loadFailed'));
  };

  useEffect(() => {
    let alive = true;
    api.cases()
      .then((list) => {
        if (!alive) return;
        setCases(list);
        setCaseId(list.length ? list[0].id : '');
      })
      .catch((error) => { if (alive) fail(error); });
    return () => { alive = false; };
  }, [tenantId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.prompt(caseId, type, lang)
      .then((result) => { if (alive) setPrompt(result.prompt); })
      .catch((error) => { if (alive) fail(error); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [caseId, type, lang, tenantId]);

  const copy = async () => {
    const ok = await copyText(prompt);
    toast(t(lang, ok ? 'copyOk' : 'copyFail'));
  };

  return (
    <>
      <PageHead lang={lang} titleKey="toolsTitle" descKey="toolsDesc" />
      <div className="split-even">
        <div className="panel">
          <div className="sectionhead">
            <div>
              <h2>{t(lang, 'promptBuilder')}</h2>
              <p>{t(lang, 'promptBuilderDesc')}</p>
            </div>
          </div>
          <div className="field">
            <label>{t(lang, 'templateType')}</label>
            <div className="template-buttons">
              {types.map((item) => (
                <button key={item} className={`btn ${type === item ? 'active' : ''}`} onClick={() => setType(item)}>
                  {t(lang, item)}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>{t(lang, 'caseSelection')}</label>
            <select value={caseId} onChange={(event) => setCaseId(event.target.value)}>
              <option value="">{t(lang, 'chooseCase')}</option>
              {cases.map((item) => (
                <option key={item.id} value={item.id}>
                  {localized(lang, item as unknown as Record<string, unknown>, 'customer')} / {localized(lang, item as unknown as Record<string, unknown>, 'topic')}
                </option>
              ))}
            </select>
          </div>
          <div className="notice">
            {t(lang, 'w1')}<br />{t(lang, 'w2')}
          </div>
          {!cases.length && <div className="empty" style={{ marginTop: 12 }}>{t(lang, 'noCaseTool')}</div>}
        </div>
        <div className="panel">
          <div className="sectionhead">
            <h2>{t(lang, 'generated')}</h2>
            <span className="pill slate">{t(lang, 'offline')}</span>
          </div>
          <textarea id="promptOutput" readOnly style={{ minHeight: 380 }} value={loading ? t(lang, 'loading') : prompt} />
          <div className="flex" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={copy} disabled={loading || !prompt}>{t(lang, 'copy')}</button>
            <span className="smallprint">{t(lang, 'saveReply')}</span>
          </div>
        </div>
      </div>
    </>
  );
}
