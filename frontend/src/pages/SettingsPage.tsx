import { useEffect, useState } from 'react';
import { api, ApiError, DEMO_MODE } from '../api';
import { t, tenantName, I18nKey } from '../i18n';
import type { Lang, Me, SettingsData } from '../types';
import { Metric, PageHead } from '../ui';

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

  const fail = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      onUnauthorized();
      return;
    }
    toast(error instanceof Error ? error.message : t(lang, 'loadFailed'));
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
            <button className="btn soft" onClick={exportJson}>↧ {t(lang, 'export')}</button>
            <button className="btn danger" onClick={reset}>↺ {t(lang, 'reset')}</button>
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
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="sectionhead"><h2>{t(lang, 'legal')}</h2></div>
        <p className="infochip">{t(lang, 'legalDesc')}</p>
        <div className="tiny-label" style={{ marginTop: 18 }}>{t(lang, 'roadmap')}</div>
        <p className="muted">{t(lang, 'roadmapDesc')}</p>
      </div>
    </>
  );
}
