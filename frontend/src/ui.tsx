import type { CaseItem, Lang } from './types';
import { I18nKey, t, fmtTime, localized } from './i18n';

export function PageHead({ lang, titleKey, descKey, action }: {
  lang: Lang;
  titleKey: I18nKey;
  descKey: I18nKey;
  action?: React.ReactNode;
}) {
  return (
    <div className="pagehead">
      <div>
        <div className="eyebrow">AI WORKHUB / {t(lang, 'demo')}</div>
        <h1>{t(lang, titleKey)}</h1>
        <p className="lead">{t(lang, descKey)}</p>
      </div>
      {action}
    </div>
  );
}

export function Metric({ lang, labelKey, value }: { lang: Lang; labelKey: I18nKey; value: number }) {
  return (
    <div className="panel metric">
      <div className="label">{t(lang, labelKey)}</div>
      <div className="num">{value}</div>
      <div className="hint">{t(lang, 'statHint')}</div>
    </div>
  );
}

export function CaseRow({ lang, item, selected, onSelect }: {
  lang: Lang;
  item: CaseItem;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const customer = localized(lang, item as unknown as Record<string, unknown>, 'customer');
  const topic = localized(lang, item as unknown as Record<string, unknown>, 'topic');
  const statusKey: I18nKey = item.status === 'done' ? 'done' : item.status === 'progress' ? 'progress' : 'open';
  return (
    <button className={`listrow ${selected ? 'selected' : ''}`} onClick={() => onSelect(item.id)}>
      <div className="avatar">{customer.slice(0, 1).toUpperCase()}</div>
      <div className="listtext">
        <strong>{customer}</strong>
        <small>{topic} · {item.channel}</small>
      </div>
      <span className={`tag ${item.status === 'done' ? 'ok' : item.status === 'open' ? 'open' : ''}`}>
        {t(lang, statusKey)}
      </span>
    </button>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function formatWhen(lang: Lang, epoch: number) {
  return fmtTime(lang, epoch);
}
