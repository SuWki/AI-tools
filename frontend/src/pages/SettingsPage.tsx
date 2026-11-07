import { useEffect, useState } from 'react';
import { api, ApiError, DEMO_MODE } from '../api';
import { t, tenantName, I18nKey } from '../i18n';
import type { Lang, Me, SettingsData } from '../types';
import { Metric, PageHead } from '../ui';
import { request } from '../realApi';
import { profileOf } from '../workflow/client';
import { errorMessage } from '../workflow/labels';

interface Props {
  lang: Lang;
  me: Me;
  tenantId: string;
  toast: (msg: string) => void;
  onUnauthorized: () => void;
  onLogout: () => void;
}

export default function SettingsPage({ lang, me, tenantId, toast, onUnauthorized, onLogout }: Props) {
  const [data, setData] = useState<SettingsData | null>(null);
  const [auditRows,setAuditRows]=useState<Array<{id:string;action:string;entityId:string;actorName:string;createdAt:number}>>([]);
  const [auditOpen,setAuditOpen]=useState(false);

  const fail = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      onUnauthorized();
      return;
    }
    toast(errorMessage(lang,error));
  };

  useEffect(() => {
    setData(null);
    api.settings().then(setData).catch(fail);
  }, [tenantId, lang]);

  const exportJson = async () => {
    try {
      const payload = await api.exportData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `AI_WorkHub_demo_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 500);
      toast(t(lang, 'exportDone'));
    } catch (error) {
      fail(error);
    }
  };

  const reset = async () => {
    if (!window.confirm(t(lang, 'resetConfirm'))) return;
    try {
      await api.resetDemo();
      const settings = await api.settings();
      setData(settings);
      toast(t(lang, 'resetDone'));
    } catch (error) {
      fail(error);
    }
  };

  const statKeys: Array<[I18nKey, keyof SettingsData['stats']]> = [
    ['totalCases', 'totalCases'],
    ['knowledgeCount', 'knowledgeCount'],
    ['reviewCount', 'reviewCount'],
    ['doneCases', 'doneCases']
  ];

  return (
    <>
      <PageHead lang={lang} titleKey="settingsTitle" descKey="settingsDesc" />
      <div className="split-even">
        <div className="panel">
          <div className="sectionhead"><h2>{t(lang, 'orgInfo')}</h2></div>
          <div className="flex">
            <span className="pill">{tenantName(lang, me.activeTenant)}</span>
            <span className="pill slate">{t(lang, 'engineOff')}</span>
          </div>
          <div className="divider" />
          <div className="tiny-label">{t(lang, 'languages')}</div>
          <p className="muted">{t(lang, 'languagesDesc')}</p>
          <div className="tiny-label">{t(lang, 'storage')}</div>
          <p className="muted">{t(lang, DEMO_MODE ? 'storageDescDemo' : 'storageDesc')}</p>
          <div className="tiny-label">{t(lang, 'account')}</div>
          <div className="settings-account">
            <span className="pill slate">{me.user.email}</span>
            {data && <span className="pill slate">{t(lang, 'role')}: {data.role}</span>}
          </div>
          <div className="flex role-note">
            <button className="btn soft" disabled={me.role!=='ADMIN'} onClick={()=>{if(window.confirm(lang==='zh'?`导出 ${tenantName(lang,me.activeTenant)} 的工单原文、知识、复盘及工作流记录？`:`Export case messages, knowledge, reviews and workflows from ${tenantName(lang,me.activeTenant)}?`))exportJson();}}>↧ {t(lang, 'export')}</button>
            {me.role==='ADMIN'&&<button className="btn danger" onClick={reset}>↺ {t(lang, 'reset')}</button>}
            <button className="btn" onClick={onLogout}>{t(lang, 'logout')}</button>
          </div>
        </div>
        <div className="panel">
          <div className="sectionhead"><h2>{t(lang, 'about')}</h2></div>
          <p>{t(lang, 'aboutDesc')}</p>
          <div className="divider" />
          <div className="tiny-label">{t(lang, 'statsTitle')}</div>
          <p className="smallprint">{t(lang, 'statsDesc')}</p>
          {data ? (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              {statKeys.map(([label, key]) => (
                <Metric key={key} lang={lang} labelKey={label} value={data.stats[key]} />
              ))}
            </div>
          ) : <div className="empty">{t(lang, 'loading')}</div>}
          <p className="smallprint">{t(lang, 'timeWarning')}</p>
        </div>
      </div>
      <section className="panel" style={{marginTop:20}}><h2>{lang==='zh'?'企业场景与规则':'Business scenarios & rules'}</h2><p>{profileOf(tenantId)[lang==='zh'?'noticeZh':'noticeEn']}</p>{profileOf(tenantId).scenarios.map(s=><details key={s.id} className="task-row"><summary>{s[lang]}</summary>{s.fields.map(f=><p key={f.key}>• {f[lang]}</p>)}</details>)}<p className="smallprint">{lang==='zh'?'当前规则随版本发布；字段与授权配置的在线管理尚未开放。':'Rules are released with this version. Online field and authorisation management is not yet available.'}</p></section>
      {!DEMO_MODE&&['ADMIN','MANAGER'].includes(me.role)&&<section className="panel" style={{marginTop:20}}><button className="btn" onClick={async()=>{try{setAuditRows(await request('/audit?limit=100'));setAuditOpen(true);}catch(e){fail(e);}}}>{lang==='zh'?'查看企业审计日志':'View workspace audit log'}</button>{auditOpen&&auditRows.map(row=><div key={row.id} className="task-row"><strong>{row.action} · {row.entityId}</strong><small>{row.actorName} · {new Date(row.createdAt).toLocaleString(lang==='zh'?'zh-CN':'en-US')}</small></div>)}</section>}
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="sectionhead"><h2>{t(lang, 'legal')}</h2></div>
        <p className="infochip">{t(lang, 'legalDesc')}</p>
        <div className="tiny-label" style={{ marginTop: 18 }}>{t(lang, 'roadmap')}</div>
        <p className="muted">{t(lang, 'roadmapDesc')}</p>
      </div>
    </>
  );
}
