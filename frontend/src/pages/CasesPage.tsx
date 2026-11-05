import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { copyText } from '../clipboard';
import { t, localized, fmtTime, I18nKey } from '../i18n';
import type { CaseItem, Lang, ReplyTemplate } from '../types';
import { CaseRow, PageHead } from '../ui';

interface Props {
  lang: Lang;
  tenantId: string;
  focusCaseId: string | null;
  onFocusConsumed: () => void;
  newCaseSignal: number;
  toast: (msg: string) => void;
  onUnauthorized: () => void;
}

type Filter = 'all' | 'open' | 'progress' | 'done';

const emptyForm = { customer: '', topic: '', channel: 'WhatsApp', priority: 'normal', message: '' };

export default function CasesPage(props: Props) {
  const { lang, tenantId, focusCaseId, onFocusConsumed, newCaseSignal, toast, onUnauthorized } = props;
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaseItem | null>(null);
  const [reply, setReply] = useState<ReplyTemplate | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [followNote, setFollowNote] = useState('');
  const [busy, setBusy] = useState(false);

  const fail = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      onUnauthorized();
      return;
    }
    toast(error instanceof Error ? error.message : t(lang, 'loadFailed'));
  };

  useEffect(() => {
    setCases([]);
    setSelectedId(null);
    setDetail(null);
    setReply(null);
    setFilter('all');
    setShowForm(false);
    let alive = true;
    api.cases()
      .then((list) => {
        if (!alive) return;
        setCases(list);
        setSelectedId(list.length ? list[0].id : null);
      })
      .catch((error) => { if (alive) fail(error); });
    return () => { alive = false; };
  }, [tenantId]);

  useEffect(() => {
    if (!focusCaseId) return;
    if (cases.some((item) => item.id === focusCaseId)) {
      setSelectedId(focusCaseId);
      onFocusConsumed();
    }
  }, [focusCaseId, cases]);

  useEffect(() => {
    if (newCaseSignal > 0) {
      setShowForm(true);
    }
  }, [newCaseSignal]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setReply(null);
      return;
    }
    let alive = true;
    Promise.all([api.caseDetail(selectedId), api.reply(selectedId)])
      .then(([caseDetail, template]) => {
        if (!alive) return;
        setDetail(caseDetail);
        setReply(template);
      })
      .catch((error) => { if (alive) fail(error); });
    return () => { alive = false; };
  }, [selectedId, tenantId]);

  const reloadCases = async (keepSelection = true) => {
    const list = await api.cases();
    setCases(list);
    if (!keepSelection || !list.some((item) => item.id === selectedId)) {
      setSelectedId(list.length ? list[0].id : null);
    }
    return list;
  };

  const createCase = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.customer.trim() || !form.topic.trim() || !form.message.trim()) {
      toast(t(lang, 'emptyInput'));
      return;
    }
    setBusy(true);
    try {
      const created = await api.createCase(form);
      setForm({ ...emptyForm });
      setShowForm(false);
      setFilter('all');
      await reloadCases(true);
      setSelectedId(created.id);
      toast(t(lang, 'created'));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: 'open' | 'progress' | 'done') => {
    if (!selectedId) return;
    try {
      const updated = await api.updateStatus(selectedId, status);
      setDetail(updated);
      await reloadCases(true);
      toast(t(lang, 'statusUpdated'));
    } catch (error) {
      fail(error);
    }
  };

  const saveFollowUp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId || !followNote.trim()) return;
    try {
      const updated = await api.addNote(selectedId, followNote.trim());
      setDetail(updated);
      setFollowNote('');
      await reloadCases(true);
      toast(t(lang, 'recordSaved'));
    } catch (error) {
      fail(error);
    }
  };

  const replyText = reply ? (lang === 'en' ? reply.replyEn : reply.replyZh) : '';
  const nextText = reply ? (lang === 'en' ? reply.nextEn : reply.nextZh) : '';
  const requirements = reply ? reply.requirements : [];

  const copyReply = async () => {
    if (!selectedId || !replyText) return;
    const ok = await copyText(replyText);
    toast(t(lang, ok ? 'copyOk' : 'copyFail'));
    if (ok) {
      api.logReplyCopy(selectedId).catch(() => undefined);
    }
  };

  const copyCasePrompt = async () => {
    if (!selectedId) return;
    try {
      const result = await api.prompt(selectedId, 'audit', lang);
      const ok = await copyText(result.prompt);
      toast(t(lang, ok ? 'copyOk' : 'copyFail'));
    } catch (error) {
      fail(error);
    }
  };

  const filtered = filter === 'all' ? cases : cases.filter((item) => item.status === filter);

  const noteText = (text: string) => {
    if (text.startsWith('status:')) {
      const key = text.slice(7) as I18nKey;
      return t(lang, key);
    }
    return text;
  };

  return (
    <>
      <PageHead
        lang={lang}
        titleKey="casesTitle"
        descKey="casesDesc"
        action={<button className="btn primary" onClick={() => setShowForm(true)}>＋ {t(lang, 'newCase')}</button>}
      />
      {showForm && (
        <div className="panel" style={{ marginBottom: 17 }}>
          <div className="sectionhead">
            <h2>{t(lang, 'newCase')}</h2>
            <button className="btn sm" onClick={() => setShowForm(false)}>× {t(lang, 'closeForm')}</button>
          </div>
          <div className="notice warn" style={{ marginBottom: 14 }}>
            {t(lang, 'caseNewHint')} {t(lang, 'demoNote')}
          </div>
          <form onSubmit={createCase}>
            <div className="formgrid">
              <div className="field">
                <label>{t(lang, 'customer')} *</label>
                <input value={form.customer} maxLength={100} required
                  onChange={(event) => setForm({ ...form, customer: event.target.value })} />
              </div>
              <div className="field">
                <label>{t(lang, 'product')} *</label>
                <input value={form.topic} maxLength={120} required
                  onChange={(event) => setForm({ ...form, topic: event.target.value })} />
              </div>
              <div className="field">
                <label>{t(lang, 'channel')}</label>
                <select value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })}>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Email">{t(lang, 'channelEmail')}</option>
                  <option value="Wechat">{t(lang, 'channelWechat')}</option>
                  <option value="Other">{t(lang, 'channelOther')}</option>
                </select>
              </div>
              <div className="field">
                <label>{t(lang, 'priority')}</label>
                <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                  <option value="normal">{t(lang, 'normal')}</option>
                  <option value="high">{t(lang, 'high')}</option>
                </select>
              </div>
              <div className="field full">
                <label>{t(lang, 'message')} *</label>
                <textarea value={form.message} maxLength={4000} required
                  onChange={(event) => setForm({ ...form, message: event.target.value })} />
              </div>
            </div>
            <div className="flex">
              <button className="btn primary" type="submit" disabled={busy}>＋ {t(lang, 'submit')}</button>
              <button className="btn" type="button" onClick={() => setShowForm(false)}>{t(lang, 'cancel')}</button>
            </div>
          </form>
        </div>
      )}
      <div className="split">
        <div className="panel">
          <div className="sectionhead">
            <h2>{t(lang, 'caseQueue')}</h2>
            <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
              <option value="all">{t(lang, 'all')}</option>
              <option value="open">{t(lang, 'open')}</option>
              <option value="progress">{t(lang, 'progress')}</option>
              <option value="done">{t(lang, 'done')}</option>
            </select>
          </div>
          {filtered.length ? filtered.map((item) => (
            <CaseRow key={item.id} lang={lang} item={item} selected={item.id === selectedId}
              onSelect={(id) => setSelectedId(id)} />
          )) : <div className="empty">{t(lang, 'noCases')}</div>}
        </div>

        {!detail ? (
          <div className="panel empty">{selectedId ? t(lang, 'loading') : t(lang, 'noCases')}</div>
        ) : (
          <div className="panel">
            <div className="detail-title">
              <div>
                <div className="tiny-label">{t(lang, 'caseID')} · {detail.id}</div>
                <h2>{localized(lang, detail as unknown as Record<string, unknown>, 'customer')}</h2>
                <div className="muted" style={{ fontSize: 12 }}>
                  {localized(lang, detail as unknown as Record<string, unknown>, 'topic')} · {detail.channel}
                </div>
              </div>
              <span className={`pill ${detail.status === 'done' ? '' : 'warn'}`}>
                {t(lang, detail.status === 'done' ? 'done' : detail.status === 'progress' ? 'progress' : 'open')}
              </span>
            </div>
            <div className="divider" />
            <div className="tiny-label">{t(lang, 'clientOriginal')}</div>
            <div className="quote">{localized(lang, detail as unknown as Record<string, unknown>, 'message')}</div>
            <div className="divider" />
            <div className="sectionhead"><h2>{t(lang, 'requirements')}</h2></div>
            <div className="checklist">
              {requirements.map((rule) => (
                <div className="checkitem" key={rule.id}>
                  <span className="dot">?</span>
                  <span>{localized(lang, rule as unknown as Record<string, unknown>, 'text')}</span>
                </div>
              ))}
            </div>
            <p className="smallprint">{t(lang, 'requiredHint')}</p>
            <div className="divider" />
            <div className="tiny-label">{t(lang, 'templateReply')}</div>
            <div className="reply">{replyText}</div>
            <p className="smallprint">{t(lang, 'replyHint')}</p>
            <div className="flex">
              <button className="btn primary" onClick={copyReply}>{t(lang, 'copyReply')}</button>
              <button className="btn" onClick={copyCasePrompt}>{t(lang, 'copyPrompt')}</button>
            </div>
            <div className="divider" />
            <div className="tiny-label">{t(lang, 'nextAction')}</div>
            <div className="notice">{nextText}</div>
            <div className="flex" style={{ marginTop: 13 }}>
              <button className="btn" onClick={() => changeStatus('progress')}>{t(lang, 'markProgress')}</button>
              <button className="btn soft" onClick={() => changeStatus('done')}>✓ {t(lang, 'markDone')}</button>
              <button className="btn" onClick={() => changeStatus('open')}>{t(lang, 'markOpen')}</button>
            </div>
            <div className="divider" />
            <div className="tiny-label">{t(lang, 'followUp')}</div>
            <form onSubmit={saveFollowUp}>
              <div className="field">
                <textarea rows={2} maxLength={1400} value={followNote} required
                  placeholder={t(lang, 'followUpPlaceholder')}
                  onChange={(event) => setFollowNote(event.target.value)} />
              </div>
              <button className="btn soft" type="submit">＋ {t(lang, 'saveFollowUp')}</button>
            </form>
            <div className="tiny-label" style={{ marginTop: 20 }}>{t(lang, 'history')}</div>
            {(detail.notes || []).length ? detail.notes!.map((note) => (
              <div className="checkitem" key={note.id} style={{ marginBottom: 8 }}>
                <span className="dot">✓</span>
                <div>
                  {noteText(note.text)}
                  <div className="smallprint">{fmtTime(lang, note.createdAt)}</div>
                </div>
              </div>
            )) : <p className="smallprint">{t(lang, 'noHistory')}</p>}
          </div>
        )}
      </div>
    </>
  );
}
