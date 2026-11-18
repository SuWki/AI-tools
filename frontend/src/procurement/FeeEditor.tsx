import {total} from './demoModel';

interface Props {
  fees: string[];
  amounts: string[];
  onChange: (amounts: string[]) => void;
  disabled?: boolean;
  currency?: string;
}
export default function FeeEditor({fees, amounts, onChange, disabled, currency='CNY'}: Props) {
  const values = fees.map((_, i) => amounts[i] ?? '');
  const filled = values.filter(value => value.trim()).length;
  let sum = '待填齐';
  if (filled === fees.length) {
    try { sum = total(values); } catch { sum = '请检查金额'; }
  }
  return <div className="fee-sheet">
    <div className="fee-heading"><strong>费用科目</strong><span>整单金额 · {currency}</span></div>
    {fees.map((name, i) => <label className="fee-line" key={i}>
      <span>{name}</span>
      <input type="number" required min="0" step="0.01" inputMode="decimal" placeholder="0.00"
        value={values[i]} disabled={disabled}
        onChange={event => onChange(values.map((value, j) => i === j ? event.target.value : value))}/>
    </label>)}
    <div className="fee-total"><span>已填 {filled} / {fees.length} 项</span><strong>合计 {sum}</strong></div>
  </div>;
}
