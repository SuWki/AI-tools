import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { t, localized } from '../i18n';
import type { KnowledgeItem, Lang } from '../types';
import { Empty, PageHead } from '../ui';
import KnowledgeVersions from '../workflow/KnowledgeVersions';
import { errorMessage } from '../workflow/labels';

interface Props {
  lang: Lang;
  tenantId: string;
  role: string;
  toast: (msg: string) => void;
  onUnauthorized: () => void;
}

const emptyForm = { name: '', sku: '', summary: '', source: '' };

export default function KnowledgePage({ lang, tenantId, role, toast, onUnauthorized }: Props) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);

  const fail = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      onUnauthorized();
      return;
    }
    toast(errorMessage(lang,error));
  };

  const load = () => api.knowledge().then(setItems).catch(fail);

  useEffect(() => {
    setItems([]);
    setShowForm(false);
    setSearch('');
    load();
  }, [tenantId]);

  const createKnowledge = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.sku.trim() || !form.summary.trim()) {
      toast(t(lang, 'emptyInput'));
      return;
    }
    setBusy(true);
    try {
      await api.createKnowledge(form);
      setForm({ ...emptyForm });
      setShowForm(false);
      await load();
      toast(t(lang, 'kbSaved'));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const approve = async (id: string) => {
    try {
      await api.approveKnowledge(id);
      await load();
      toast(t(lang, 'approveOk'));
    } catch (error) {
      fail(error);
    }
  };

  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? items.filter((item) => {
        const haystack = [item.name, item.nameEn || '', item.sku, item.summary, item.summaryEn || '']
          .join(' ')
          .toLowerCase();
        return haystack.includes(needle);
      })
    : items;

  const canReview = role === 'ADMIN' || role === 'REVIEWER';

  return (
    <>
      <PageHead
        lang={lang}
        titleKey="knowledgeTitle"
        descKey="knowledgeDesc"
        action={<button className="btn primary" onClick={() => setShowForm((value) => !value)}>＋ {t(lang, 'addKnowledge')}</button>}
      />
      {showForm && (
        <div className="panel" style={{ marginBottom: 17 }}>
          <div className="sectionhead">
            <h2>{t(lang, 'addKnowledge')}</h2>
            <button className="btn sm" onClick={() => setShowForm(false)}>×</button>
          </div>
          <form onSubmit={createKnowledge}>
            <div className="formgrid">
              <div className="field">
                <label>{t(lang, 'name')} *</label>
                <input value={form.name} maxLength={120} required
                  onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </div>
              <div className="field">
                <label>{t(lang, 'sku')} *</label>
                <input value={form.sku} maxLength={80} required
                  onChange={(event) => setForm({ ...form, sku: event.target.value })} />
              </div>
              <div className="field full">
                <label>{t(lang, 'summary')} *</label>
                <textarea value={form.summary} maxLength={4000} required
                  onChange={(event) => setForm({ ...form, summary: event.target.value })} />
              </div>
              <div className="field full">
                <label>{t(lang, 'source')}</label>
                <input value={form.source} maxLength={180}
                  onChange={(event) => setForm({ ...form, source: event.target.value })} />
              </div>
            </div>
            <p className="infochip">{t(lang, 'newDocNote')}</p>
            <button className="btn primary" type="submit" style={{ marginTop: 12 }} disabled={busy}>
              {t(lang, 'save')}
            </button>
          </form>
        </div>
      )}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="flex between">
          <div>
            <strong>{t(lang, 'knowledgeList')}</strong>
            <div className="smallprint">{t(lang, 'compareNote')}</div>
          </div>
          <div style={{ width: 'min(100%, 300px)' }}>
            <input value={search} placeholder={t(lang, 'search')}
              onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>
      </div>
      <div className="cards">
        {filtered.map((item) => {
          const name = localized(lang, item as unknown as Record<string, unknown>, 'name');
          const summary = localized(lang, item as unknown as Record<string, unknown>, 'summary');
          return (
            <div className="panel product" key={item.id}>
              <span className="sku">{item.sku}</span>
              <h3>{name}</h3>
              <p>{summary}</p>
              <div className="smallprint">{t(lang, 'source')}: {item.source || '—'}</div>
              <div className="smallprint">V{item.version} · {item.reviewerName||'—'} · {new Date(item.updatedAt).toLocaleString(lang==='zh'?'zh-CN':'en-US')}</div>
              <div className="verified flex between">
                <span className={`pill ${item.verified ? '' : 'warn'}`}>
                  {t(lang, item.verified ? 'verified' : 'unverified')}
                </span>
                {!item.verified && item.reviewStatus !== 'retired' && canReview && (
                  <button className="btn sm soft" onClick={() => approve(item.id)}>{t(lang, 'approve')}</button>
                )}
              </div>
              {item.reviewStatus==='retired'&&<span className="pill warn">{lang==='zh'?'已撤回':'Withdrawn'}</span>}
              <KnowledgeVersions item={item} lang={lang} canReview={canReview} reload={load}/>
            </div>
          );
        })}
      </div>
      {!filtered.length && <Empty>{t(lang, 'noKnowledge')}</Empty>}
    </>
  );
}
