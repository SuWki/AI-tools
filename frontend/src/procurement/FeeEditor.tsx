import {useId, useRef, useState} from 'react';
import {cents, total} from './demoModel';

interface Props {
  fees: string[];
  amounts: string[];
  onChange: (amounts: string[]) => void;
  disabled?: boolean;
  currency?: string;
  onFinishFees?: () => void;
}

function amountIssue(value:string) {
  if (!value.trim()) return '请填写金额。此项无费用时填 0。';
  try { cents(value); return ''; }
  catch (error) { return (error as Error).message; }
}

export default function FeeEditor({fees, amounts, onChange, disabled, currency='CNY', onFinishFees}: Props) {
  const values = fees.map((_, i) => amounts[i] ?? '');
  const fields = useRef<Array<HTMLInputElement|null>>([]);
  const [active,setActive] = useState(-1);
  const [checked,setChecked] = useState<number[]>([]);
  const id = useId();
  const guided = !!onFinishFees;
  const validate = (index:number, input:HTMLInputElement, value=input.value) => {
    const issue = amountIssue(value);
    setChecked(rows=>rows.includes(index)?rows:[...rows,index]);
    input.setCustomValidity(value ? issue : '');
    return !issue;
  };
  const advance = (index:number) => {
    const current = fields.current[index];
    if (!current || !validate(index,current)) {
      current?.focus();
      return;
    }
    const next = fields.current[index+1];
    if (next) next.focus();
    else onFinishFees?.();
  };
  const filled = values.filter(value => value.trim()).length;
  let sum = '待填齐';
  if (filled === fees.length) {
    try { sum = total(values); } catch { sum = '请检查金额'; }
  }
  return <div className="fee-sheet">
    <div className="fee-heading"><strong>费用科目</strong><span>整单金额 · {currency}</span></div>
    {fees.map((name, i) => {
      const issue = guided && checked.includes(i) ? amountIssue(values[i]) : '';
      return <div className="fee-entry" key={i}>
        <label className="fee-line">
          <span>{name}</span>
          <input ref={input=>{fields.current[i]=input;if(input&&guided)input.setCustomValidity(values[i]?amountIssue(values[i]):'');}}
            type={guided?'text':'number'} required min={guided?undefined:'0'} step={guided?undefined:'0.01'}
            inputMode="decimal" enterKeyHint={guided?(i+1<fees.length?'next':'done'):undefined}
            placeholder="填写金额" value={values[i]} disabled={disabled}
            aria-invalid={issue?true:undefined} aria-describedby={issue?id+'-fee-'+i:undefined}
            onFocus={()=>{if(guided)setActive(i);}}
            onInvalid={event=>{if(guided)validate(i,event.currentTarget);}}
            onBlur={event=>{if(guided&&event.currentTarget.value)validate(i,event.currentTarget);}}
            onKeyDown={event=>{
              if(!guided||event.key!=='Enter'||event.nativeEvent.isComposing)return;
              event.preventDefault();advance(i);
            }}
            onChange={event=>{
              const value=guided?event.target.value.replace(/[，,]/g,'.').trim():event.target.value;
              if(guided)event.currentTarget.setCustomValidity(value?amountIssue(value):'');
              onChange(values.map((old,j)=>i===j?value:old));
            }}/>
        </label>
        {issue&&<p id={id+'-fee-'+i} className="fee-error">{issue}</p>}
        {guided&&active===i&&!disabled&&<div className="fee-navigation">
          {i>0&&<button type="button" className="btn" onPointerDown={event=>event.preventDefault()}
            onClick={()=>fields.current[i-1]?.focus()}>上一项</button>}
          <button type="button" className="btn soft" onPointerDown={event=>event.preventDefault()}
            onClick={()=>advance(i)}>{i+1<fees.length?'下一项':'填写附加条件'}</button>
        </div>}
      </div>;
    })}
    <div className="fee-total"><span>已填 {filled} / {fees.length} 项</span><strong>合计 {sum}</strong></div>
  </div>;
}
