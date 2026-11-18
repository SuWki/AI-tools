export type ProcurementView = 'work' | 'suppliers' | 'dashboard';
const views = { work: '询价办理', suppliers: '供应商档案', dashboard: '统计与记录' };

export default function ProcurementNav({view, onChange}: {
  view: ProcurementView;
  onChange: (value: ProcurementView) => void;
}) {
  return <nav className="proc-nav" aria-label="采购导航">
    {(Object.keys(views) as ProcurementView[]).map(key => <button key={key}
      aria-current={view === key ? 'page' : undefined} onClick={() => onChange(key)}>
      {views[key]}
    </button>)}
  </nav>;
}
