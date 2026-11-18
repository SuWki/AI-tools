import { useEffect, useRef, useState } from 'react';
import { api, ApiError, clearToken, DEMO_MODE, getToken, setToken } from './api';
import { t, tenantName } from './i18n';
import type { Lang, Me, Page } from './types';
import DashboardPage from './pages/DashboardPage';
import CasesPage from './pages/CasesPage';
import KnowledgePage from './pages/KnowledgePage';
import ToolsPage from './pages/ToolsPage';
import AnalysisPage from './pages/AnalysisPage';
import SettingsPage from './pages/SettingsPage';
import { setWorkspaceId } from './realApi';
import ProcurementPage from './pages/ProcurementPage';
import type { CaseTarget } from './workflow/types';

const LANG_KEY = 'workhub.lang';

type CaseOrigin = {caseId:string; topic:string; target?:CaseTarget; create?:boolean; scroll:number};
type Route = {page:Page; target?:CaseTarget; create?:boolean; origin?:CaseOrigin};
const home: Route = { page: 'dashboard' };
const mobilePages: Page[] = ['dashboard', 'cases', 'procurement', 'knowledge'];
const navPages: Page[] = ['dashboard', 'cases', 'procurement', 'knowledge', 'tools', 'analysis', 'settings'];
const navZh: Record<Page, string> = {
  dashboard: '工作台', cases: '客户咨询', procurement: '采购询价', knowledge: '知识资料',
  tools: '业务工具', analysis: '销售复盘', settings: '设置'
};

function readLang(): Lang {
  const stored = localStorage.getItem(LANG_KEY);
  return stored === 'en' ? 'en' : 'zh';
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [lang, setLang] = useState<Lang>(readLang());
  const [route, setRoute] = useState<Route>(home);
  const {page, target} = route;
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  const [keyboardOpen,setKeyboardOpen] = useState(false);
  useEffect(()=>{
    const viewport=window.visualViewport;
    if(!viewport)return;
    const update=()=>setKeyboardOpen(window.innerHeight-viewport.height>120&&viewport.scale===1);
    viewport.addEventListener('resize',update);
    return()=>viewport.removeEventListener('resize',update);
  },[]);
  const [toastMsg, setToastMsg] = useState('');
  const [dirty, setDirty] = useState(false);
  const [caseDirty, setCaseDirty] = useState(false);
  const guard = (keepCase = false) => (!dirty && (keepCase || !caseDirty)) || window.confirm(lang === 'zh' ? '当前有未保存内容，放弃并继续？' : 'Discard unsaved changes and continue?');
  useEffect(() => {setWorkspaceId(me?.activeTenantId || '');},[me?.activeTenantId]);
  useEffect(() => { const handler=(event:BeforeUnloadEvent)=>{if(dirty||caseDirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty,caseDirty]);

  const scope = (session: Me) => JSON.stringify([session.user.id, session.activeTenantId]);
  const storedRoute = (session: Me): Route => {
    const entry = window.history.state?.workhub;
    return entry?.scope === scope(session) && navPages.includes(entry.route?.page) ? entry.route : home;
  };
  const remember = (next: Route, session: Me, replace = false) => {
    const entry = { ...window.history.state, workhub: { route: next, scope: scope(session) } };
    if (replace) window.history.replaceState(entry, '');
    else window.history.pushState(entry, '');
  };
  useEffect(() => {
    if (!me) return;
    const onBack = () => {
      const next = storedRoute(me);
      const origin = route.origin;
      const returning = !!origin && next.page==='cases' &&
        JSON.stringify([origin.target,origin.create])===JSON.stringify([next.target,next.create]);
      if (!guard(returning)) { remember(route, me); return; }
      setDirty(false);
      if(!returning)setCaseDirty(false);
      setRoute(next);
      if (mobileMenu.current) mobileMenu.current.open = false;
      requestAnimationFrame(()=>window.scrollTo(0, returning?origin.scroll:0));
    };
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, [me, route, dirty, caseDirty, lang]);

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
        setWorkspaceId(session.activeTenantId);
        setMe(session);
        setRoute(storedRoute(session));
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
      setWorkspaceId(session.activeTenantId);
      setMe(session);
      setRoute(home);
      remember(home, session, true);
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
    setDirty(false);
    setRoute(home);
    window.history.replaceState(null, '');
  };

  const unauthorized = () => {
    clearToken();setMe(null);setWorkspaceId('');setDirty(false);setRoute(home);window.history.replaceState(null, '');
    toast(t(lang, 'sessionExpired'));
  };

  const switchTenant = async (tenantId: string) => {
    if (!me || tenantId === me.activeTenantId) return;
    if(!guard())return;
    try {
      const session = await api.switchTenant(tenantId);
      setMe(session);
      setWorkspaceId(session.activeTenantId);
      setRoute(home);setDirty(false);
      remember(home, session, true);
      if (mobileMenu.current) mobileMenu.current.open = false;
      window.scrollTo(0, 0);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        unauthorized();
        return;
      }
      toast(error instanceof Error ? error.message : t(lang, 'loadFailed'));
    }
  };

  const go = (next: Route, keepCase=false, scroll=0) => {
    if (!me || !guard(keepCase)) return;
    if (mobileMenu.current) mobileMenu.current.open = false;
    if (next.page === page && !target && !next.target && !route.create && !next.create && !route.origin && !next.origin) return;
    if (!window.history.state?.workhub) remember(route, me, true);
    remember(next, me);
    setRoute(next);
    setDirty(false);
    if(!keepCase)setCaseDirty(false);
    requestAnimationFrame(()=>window.scrollTo(0,scroll));
  };
  const navigate = (page: Page) => go({page});
  const openCase = (caseId: string, inbox?: CaseTarget['inbox']) => go({page: 'cases', target: {caseId, inbox}});
  const startNewCase = () => go({page: 'cases', create: true});

  const openFromCase = (page: 'tools'|'analysis', caseId:string, topic:string) =>
    go({page,origin:{caseId,topic,target,create:route.create,scroll:window.scrollY}},true);
  const origin = route.origin;
  const returnToCase = origin ? () => go({page:'cases',target:origin.target,create:origin.create},true,origin.scroll) : undefined;
  const caseTarget = origin ? origin.target : target;
  const caseCreate = origin ? origin.create : route.create;

  if (booting) {
    return <div className="login-shell"><div className="login-brandside"><h1 className="login-title">{t(lang, 'loading')}</h1></div></div>;
  }

  if (!me) {
    return (
      <div className="login-shell">
        <section className="login-formside">
          <div className="login-card">
            <div className="flex between" style={{ marginBottom: 18 }}>
              <strong className="wordmark">WorkHub</strong>
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
                <label htmlFor="login-email">{t(lang, 'email')}</label>
                <input id="login-email" type="email" value={loginEmail} required autoComplete="username"
                  onChange={(event) => setLoginEmail(event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="login-password">{t(lang, 'password')}</label>
                <input id="login-password" type="password" value={loginPassword} required autoComplete="current-password"
                  onChange={(event) => setLoginPassword(event.target.value)} />
              </div>
              <button className="btn primary login-submit" type="submit" disabled={loginBusy}>
                {loginBusy ? t(lang, 'loggingIn') : t(lang, 'signIn')}
              </button>
            </form>
            <details className="demo-box"><summary>{t(lang, 'demoAccounts')}</summary>

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
            </details>
          </div>
        </section>
      </div>
    );
  }

  const tenantId = me.activeTenantId;
  const label = (item: Page) => lang === 'zh' ? navZh[item] : t(lang, item);
  const workspaceName = tenantName(lang, me.activeTenant);
  const tenantControl = <select aria-label={t(lang, 'switchWorkspace')} value={tenantId}
    disabled={me.tenants.length < 2} onChange={event => switchTenant(event.target.value)}>
    {me.tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenantName(lang, tenant)}</option>)}
  </select>;
  const language = <div className="lang" role="group" aria-label={lang === 'zh' ? '界面语言' : 'Interface language'}>
    <button aria-pressed={lang === 'zh'} className={lang === 'zh' ? 'active' : ''} onClick={() => setLanguage('zh')}>中文</button>
    <button aria-pressed={lang === 'en'} className={lang === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
  </div>;
  const navButton = (item: Page, shortLabel = label(item)) => <button key={item}
    aria-current={page === item ? 'page' : undefined} onClick={() => navigate(item)}>{shortLabel}</button>;

  return (
    <div className={'app workhub-shell'+(keyboardOpen?' keyboard-open':'')}>
      <aside className="sidebar">
        <button className="workhub-wordmark" onClick={() => navigate('dashboard')}>Work<span>Hub</span></button>
        <label className="tenant-picker">{t(lang, 'orgInfo')}{tenantControl}</label>
        <nav className="workhub-navigation" aria-label={lang === 'zh' ? '工作空间' : 'Workspace'}>
          <span>{lang === 'zh' ? '业务办理' : 'Operations'}</span>
          {navPages.slice(0, 3).map(item => navButton(item))}
          <span>{lang === 'zh' ? '资料与改进' : 'Resources'}</span>
          {navPages.slice(3, 6).map(item => navButton(item))}
          {navButton('settings')}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar workhub-top">
          <span className="desktop-crumb">{t(lang, 'orgInfo')} / {label(page)}</span>
          <details className="workhub-menu" ref={mobileMenu}>
            <summary>{lang === 'zh' ? '全部页面' : 'All pages'}</summary>
            <div className="workhub-menu-body">
              {tenantControl}{language}
              <nav className="workhub-navigation" aria-label={lang === 'zh' ? '全部页面' : 'All pages'}>
                {navPages.map(item => navButton(item))}
              </nav>
            </div>
          </details>
          <span className="workhub-context">{workspaceName}{DEMO_MODE && (lang === 'zh' ? ' · 演示' : ' · Demo')}</span>
          <div className="desktop-language">{language}</div>
        </header>
        <div className="workspace" key={tenantId}>
          {page==='procurement'&&<ProcurementPage tenantId={tenantId}/>}
          {page === 'dashboard' && (
            <DashboardPage lang={lang} tenantId={tenantId} navigate={navigate} onUnauthorized={unauthorized}
              openCase={openCase} newCase={startNewCase} />
          )}
          {(page === 'cases'||origin) && (
            <div hidden={page!=='cases'}>
              <CasesPage key={JSON.stringify([caseTarget,caseCreate])} lang={lang} tenantId={tenantId}
                me={me} onDirty={setCaseDirty} target={caseTarget} startCreating={caseCreate}
                toast={toast} onUnauthorized={unauthorized} onOpenCompanion={openFromCase}/>
            </div>
          )}
          {page === 'knowledge' && (
            <KnowledgePage lang={lang} tenantId={tenantId} role={me.role} userId={me.user.id} toast={toast}
              onUnauthorized={unauthorized} onDirty={setDirty} />
          )}
          {page === 'tools' && (
            <ToolsPage lang={lang} tenantId={tenantId} toast={toast} onUnauthorized={unauthorized} origin={origin} onReturn={returnToCase}/>
          )}
          {page === 'analysis' && (
            <AnalysisPage lang={lang} tenantId={tenantId} toast={toast} onUnauthorized={unauthorized} origin={origin} onReturn={returnToCase} onDirty={setDirty}/>
          )}
          {page === 'settings' && (
            <SettingsPage lang={lang} me={me} tenantId={tenantId} toast={toast}
              onUnauthorized={unauthorized} onLogout={logout} onLanguage={setLanguage} />
          )}
        </div>
      </main>
      <nav className="workhub-mobile-nav" aria-label={lang === 'zh' ? '常用入口' : 'Quick navigation'}>
        {mobilePages.map((item, i) => navButton(item, lang === 'zh' ? ['工作台', '咨询', '采购', '资料'][i] : ['Home', 'Cases', 'Buy', 'Docs'][i]))}
      </nav>
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}
