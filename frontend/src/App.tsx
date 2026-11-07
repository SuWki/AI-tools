import { useEffect, useState } from 'react';
import { api, ApiError, clearToken, DEMO_MODE, getToken, setToken } from './api';
import { t, tenantName, I18nKey } from './i18n';
import type { Lang, Me, Page } from './types';
import DashboardPage from './pages/DashboardPage';
import CasesPage from './pages/CasesPage';
import KnowledgePage from './pages/KnowledgePage';
import ToolsPage from './pages/ToolsPage';
import AnalysisPage from './pages/AnalysisPage';
import SettingsPage from './pages/SettingsPage';
import { setWorkspaceId } from './realApi';
import ProcurementPage from './pages/ProcurementPage';

const LANG_KEY = 'workhub.lang';

const navPages: Page[] = ['dashboard', 'cases', 'procurement', 'knowledge', 'tools', 'analysis', 'settings'];
const icons: Record<Page, string> = {
  dashboard: '◫', cases: '▤', procurement:'▦', knowledge: '▧', tools: '⚒', analysis: '◷', settings: '⚙'
};

function readLang(): Lang {
  const stored = localStorage.getItem(LANG_KEY);
  return stored === 'en' ? 'en' : 'zh';
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [lang, setLang] = useState<Lang>(readLang());
  const [page, setPage] = useState<Page>('dashboard');
  const [focusCaseId, setFocusCaseId] = useState<string | null>(null);
  const [newCaseSignal, setNewCaseSignal] = useState(0);
  const [toastMsg, setToastMsg] = useState('');
  const [dirty, setDirty] = useState(false);
  const guard = () => !dirty || window.confirm(lang === 'zh' ? '当前有未保存内容，放弃并继续？' : 'Discard unsaved changes and continue?');
  useEffect(() => {setWorkspaceId(me?.activeTenantId || '');},[me?.activeTenantId]);
  useEffect(() => { const handler=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty]);

  const [loginEmail, setLoginEmail] = useState('admin@workhub.demo');
  const [loginPassword, setLoginPassword] = useState('demo1234');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    if (!getToken()) {
      setBooting(false);
      return;
    }
    api.me()
      .then((session) => {
        setMe(session);
        if (!localStorage.getItem(LANG_KEY) && (session.user.locale === 'en' || session.user.locale === 'zh')) {
          setLang(session.user.locale);
        }
      })
      .catch(() => {
        clearToken();
        setMe(null);
      })
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = lang === 'zh' ? 'AI WorkHub V3 · 企业工作台' : 'AI WorkHub V3 · Business Workspace';
  }, [lang]);

  const toast = (message: string) => {
    setToastMsg(message);
    window.setTimeout(() => setToastMsg(''), 2800);
  };

  const setLanguage = (next: Lang) => {
    setLang(next);
    localStorage.setItem(LANG_KEY, next);
    if (me) {
      api.setLocale(next).catch(() => undefined);
    }
  };

  const login = async (email = loginEmail, password = loginPassword) => {
    setLoginBusy(true);
    setLoginError('');
    try {
      const session = await api.login(email.trim(), password);
      if (session.token) {
        setToken(session.token);
      }
      setMe(session);
      setPage('dashboard');
      setFocusCaseId(null);
      if (!localStorage.getItem(LANG_KEY)) {
        setLang(session.user.locale === 'en' ? 'en' : 'zh');
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Login failed';
      setLoginError(message);
    } finally {
      setLoginBusy(false);
    }
  };

  const logout = async () => {
    if(!guard()) return;
    try {await api.logout();} catch(error) {if(!(error instanceof ApiError && error.status===401)){toast(error instanceof Error?error.message:'Logout failed');return;}}
    clearToken();
    setMe(null);
    setPage('dashboard');
    setFocusCaseId(null);
  };

  const unauthorized = () => {
    clearToken();setMe(null);setWorkspaceId('');setDirty(false);setPage('dashboard');setFocusCaseId(null);
    toast(t(lang, 'sessionExpired'));
  };

  const switchTenant = async (tenantId: string) => {
    if (!me || tenantId === me.activeTenantId) return;
    if(!guard())return;
    try {
      const session = await api.switchTenant(tenantId);
      setMe(session);
      setWorkspaceId(session.activeTenantId);
      setPage('dashboard');setDirty(false);
      setFocusCaseId(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        unauthorized();
        return;
      }
      toast(error instanceof Error ? error.message : t(lang, 'loadFailed'));
    }
  };

  const openCase = (id: string) => {
    setFocusCaseId(id);
    setPage('cases');
  };

  const startNewCase = () => {
    setNewCaseSignal((value) => value + 1);
    setPage('cases');
  };

  if (booting) {
    return <div className="login-shell"><div className="login-brandside"><h1 className="login-title">{t(lang, 'loading')}</h1></div></div>;
  }

  if (!me) {
    return (
      <div className="login-shell">
        <section className="login-brandside">
          <div className="login-logo">
            <div className="brandmark">W</div>
            <div>
              <div className="brandmain">AI WorkHub</div>
              <div className="brandsub">{t(lang, 'brandSub')}</div>
            </div>
          </div>
          <div className="login-kicker">AI WORKHUB / V3.1</div>
          <h1 className="login-title">{t(lang, 'overviewTitle')}</h1>
          <p className="login-copy">{t(lang, 'overviewDesc')}</p>
          <div className="login-points">
            <div className="login-point"><span>✓</span><span>{t(lang, 'w2')}</span></div>
            <div className="login-point"><span>✓</span><span>{t(lang, 'w3')}</span></div>
            <div className="login-point"><span>✓</span><span>{t(lang, 'replyHint')}</span></div>
          </div>
        </section>
        <section className="login-formside">
          <div className="login-card">
            <div className="flex between" style={{ marginBottom: 18 }}>
              <span className="eyebrow">AI WORKHUB / V3.1</span>
              <div className="lang">
                <button className={lang === 'zh' ? 'active' : ''} onClick={() => setLanguage('zh')}>中文</button>
                <button className={lang === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
              </div>
            </div>
            <h2>{t(lang, 'loginTitle')}</h2>
            <p>{t(lang, 'loginSub')}</p>
            {loginError && <div className="login-error">{loginError}</div>}
            <form onSubmit={(event) => { event.preventDefault(); login(); }}>
              <div className="field">
                <label>{t(lang, 'email')}</label>
                <input type="email" value={loginEmail} required autoComplete="username"
                  onChange={(event) => setLoginEmail(event.target.value)} />
              </div>
              <div className="field">
                <label>{t(lang, 'password')}</label>
                <input type="password" value={loginPassword} required autoComplete="current-password"
                  onChange={(event) => setLoginPassword(event.target.value)} />
              </div>
              <button className="btn primary login-submit" type="submit" disabled={loginBusy}>
                {loginBusy ? t(lang, 'loggingIn') : t(lang, 'signIn')}
              </button>
            </form>
            <div className="demo-box">
              <div className="tiny-label">{t(lang, 'demoAccounts')}</div>
              <p>{t(lang, 'demoHint')}</p>
              <div className="demo-buttons">
                <button onClick={() => login('admin@workhub.demo', 'demo1234')}>
                  admin@workhub.demo <small>· 3 workspaces / ADMIN</small>
                </button>
                <button onClick={() => login('sales@compressor.demo', 'demo1234')}>
                  sales@compressor.demo <small>· compressor / SALES</small>
                </button>
                <button onClick={() => login('reviewer@compressor.demo', 'demo1234')}>
                  reviewer@compressor.demo <small>· compressor / REVIEWER</small>
                </button>
                <button onClick={() => login('sales@lubricant.demo', 'demo1234')}>
                  sales@lubricant.demo <small>· lubricant / SALES</small>
                </button>
              </div>
              {DEMO_MODE && <p className="smallprint">{t(lang, 'loginDemoNote')}</p>}
            </div>
          </div>
        </section>
      </div>
    );
  }

  const tenantId = me.activeTenantId;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandmark">W</div>
          <div>
            <div className="brandmain">AI WorkHub</div>
            <div className="brandsub">{t(lang, 'brandSub')}</div>
          </div>
        </div>
        <div>
          <div className="section-label">{t(lang, 'navTag')}</div>
          <nav className="nav">
            {navPages.map((item) => (
              <button key={item} className={page === item ? 'active' : ''} onClick={() => {if(item===page||guard()){setPage(item);setDirty(false);}}}>
                <span className="ic">{icons[item]}</span>
                <span>{t(lang, item as I18nKey)}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="side-footer">
          <strong>● {t(lang, 'demo')}</strong>
          {t(lang, 'demoNote')}
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="top-left">
            {t(lang, 'topTag')}
            <strong>{t(lang, page as I18nKey)}</strong>
          </div>
          <div className="top-actions">
            <span className="pill">● {t(lang, DEMO_MODE ? 'pagesDemoBadge' : 'offline')}</span>
            <select aria-label={t(lang, 'switchWorkspace')} value={tenantId}
              disabled={me.tenants.length < 2}
              onChange={(event) => switchTenant(event.target.value)}>
              {me.tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenantName(lang, tenant)}</option>
              ))}
            </select>
            <div className="lang" role="group" aria-label="Interface language">
              <button className={lang === 'zh' ? 'active' : ''} aria-pressed={lang === 'zh'}
                onClick={() => setLanguage('zh')}>中文</button>
              <button className={lang === 'en' ? 'active' : ''} aria-pressed={lang === 'en'}
                onClick={() => setLanguage('en')}>EN</button>
            </div>
          </div>
        </div>
        <div className="workspace" key={tenantId}>
          {page==='procurement'&&<ProcurementPage/>}
          {page === 'dashboard' && (
            <DashboardPage lang={lang} tenantId={tenantId} toast={toast} navigate={setPage}
              openCase={openCase} newCase={startNewCase} />
          )}
          {page === 'cases' && (
            <CasesPage lang={lang} tenantId={tenantId} me={me} onDirty={setDirty} focusCaseId={focusCaseId}
              onFocusConsumed={() => setFocusCaseId(null)} newCaseSignal={newCaseSignal}
              toast={toast} onUnauthorized={unauthorized} />
          )}
          {page === 'knowledge' && (
            <KnowledgePage lang={lang} tenantId={tenantId} role={me.role} toast={toast}
              onUnauthorized={unauthorized} />
          )}
          {page === 'tools' && (
            <ToolsPage lang={lang} tenantId={tenantId} toast={toast} onUnauthorized={unauthorized} />
          )}
          {page === 'analysis' && (
            <AnalysisPage lang={lang} tenantId={tenantId} toast={toast} onUnauthorized={unauthorized} />
          )}
          {page === 'settings' && (
            <SettingsPage lang={lang} me={me} tenantId={tenantId} toast={toast}
              onUnauthorized={unauthorized} onLogout={logout} />
          )}
          <div className="bottomnote">
            AI WorkHub V3.1 · {t(lang, 'sampleLabel')} · {t(lang, 'engineOff')}
          </div>
        </div>
      </main>
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}
