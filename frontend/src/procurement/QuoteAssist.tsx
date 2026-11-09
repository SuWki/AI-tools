import {useState} from 'react';
import {parseQuotePaste} from './demoModel';
export default function QuoteAssist({fees,apply,disabled}:{fees:string[];apply:(values:string[])=>void;disabled:boolean}){
 const [text,setText]=useState(''),[feedback,setFeedback]=useState('');
 return <details className="quote-assist"><summary>批量粘贴报价，免逐项输入</summary><p>从 Excel 复制 {fees.length} 行：单列金额按当前费用顺序，或“科目名称 + 金额”两列。双列会按名称匹配，导入只填表，不提交。</p><label className="field">粘贴 Excel 报价<textarea rows={6} disabled={disabled} value={text} onChange={e=>setText(e.target.value)} placeholder={fees.map((f,i)=>`${f}\t${i===0?'200':'0'}`).join('\n')}/></label><button type="button" className="btn soft" disabled={disabled||!text.trim()} onClick={()=>{try{const values=parseQuotePaste(text,fees);apply(values);setFeedback(`已匹配 ${values.length} 项。请检查下方金额后手动提交。`);}catch(e){setFeedback(e instanceof Error?e.message:String(e));}}}>匹配并带入报价表</button><p role="status">{feedback}</p></details>;
}
