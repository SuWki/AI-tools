import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { t, fmtTime } from '../i18n';
import type { Lang, Review } from '../types';
import { Empty, PageHead } from '../ui';

interface Props {
  lang: Lang;
  tenantId: string;
  toast: (msg: string) => void;
  onUnauthorized: () => void;
}

export default function AnalysisPage({ lang, tenantId, toast, onUnauthorized }: Props) {
  const [conversation, setConversation] = useState('');
  const [checklist, setChecklist] = useState('');
  const [result, setResult] = useState('');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [busy, setBusy] = useState(false);

  const fail = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      onUnauthorized();
      return;
    }
    toast(error instanceof Error ? error.message : t(lang, 'loadFailed'));
  };

  const loadReviews = () => api.reviews().then(setReviews).catch(fail);

  useEffect(() => {
    setConversation('');
    setChecklist('');
    setResult('');
    loadReviews();
  }, [tenantId]);

  const runChecklist = async () => {
    if (!conversation.trim()) {
      toast(t(lang, 'enterConversation'));
      return;
    }
    setBusy(true);
    try {
      const res = await api.checklist(conversation.trim(), lang);
      setChecklist(res.checklist);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const saveReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!result.trim()) {
      toast(t(lang, 'saveResultFirst'));
      return;
    }
    setBusy(true);
    try {
      await api.saveReview({ conversation: conversation.trim(), result: result.trim() });
      setConversation('');
      setChecklist('');
      setResult('');
      await loadReviews();
      toast(t(lang, 'recordSaved'));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead lang={lang} titleKey="analysisTitle" descKey="analysisDesc" />
      <div className="split-even">
        <div className="panel">
          <div className="sectionhead"><h2>{t(lang, 'reviewChecklist')}</h2></div>
          <p className="smallprint">{t(lang, 'reviewDesc')}</p>
          <div className="field">
            <label>{t(lang, 'conversation')}</label>
            <textarea style={{ minHeight: 180 }} value={conversation}
              placeholder={t(lang, 'conversationPH')}
              onChange={(event) => setConversation(event.target.value)} />
          </div>
          <button className="btn soft" onClick={runChecklist} disabled={busy}>{t(lang, 'runChecklist')}</button>
          <div className="divider" />
          <div className="tiny-label">{t(lang, 'reviewResult')}</div>
          <div className="quote" style={{ maxHeight: 260, overflow: 'auto' }}>
            {checklist || t(lang, 'reviewNote')}
          </div>
          <div className="divider" />
          <form onSubmit={saveReview}>
            <div className="field">
              <label>{t(lang, 'reviewOutput')}</label>
              <textarea value={result} placeholder={t(lang, 'reviewOutputPH')} required
                onChange={(event) => setResult(event.target.value)} />
            </div>
            <button className="btn primary" type="submit" disabled={busy}>{t(lang, 'saveReview')}</button>
          </form>
          <p className="smallprint">{t(lang, 'reviewNote')}</p>
        </div>
        <div className="panel">
          <div className="sectionhead">
            <h2>{t(lang, 'savedReviews')} ({reviews.length})</h2>
          </div>
          {reviews.length ? reviews.map((review) => (
            <div className="checkitem" key={review.id} style={{ marginBottom: 10 }}>
              <span className="dot">✓</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong>{fmtTime(lang, review.createdAt)}</strong>
                <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{review.result}</div>
                <div className="smallprint">{review.conversation.slice(0, 85)}</div>
              </div>
            </div>
          )) : <Empty><div className="symbol">▤</div>{t(lang, 'noReviews')}</Empty>}
        </div>
      </div>
    </>
  );
}
