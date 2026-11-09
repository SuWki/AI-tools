import type {DemoState} from './demoModel';
interface Props {state:DemoState;role:string;jump:(role:string,tab:string)=>void;close:()=>void}
export default function FlowGuide({state:s,role,jump,close}:Props){
 const quoted=s.suppliers.filter(p=>p.quotes.length),missing=s.suppliers.find(p=>!p.quotes.length);
 const offer=s.offers[s.offers.length-1];
 const waiting=s.suppliers.find(p=>p.responses[p.responses.length-1]?.offer!==offer?.version);
 const accepted=s.suppliers.filter(p=>{const r=p.responses[p.responses.length-1];return r?.offer===offer?.version&&r?.decision==='accept';});
 const person=s.suppliers.find(p=>p.id===role);
 let title='',detail='',action='',go=()=>jump('buyer','flow');
 if(s.phase==='draft'){title='下一步：确认需求并发布';detail='先检查路线和货量。费用科目与统一口径已有模板，可按需展开修改。';action='查看待发布需求';}
 else if(role!=='buyer'&&person&&s.award){title='本单已确认承接';detail='报价与回复记录已经保留，返回采购方查看履约、变更与处理结果。';action='查看履约进度';go=()=>jump('buyer','delivery');}
 else if(role!=='buyer'&&person&&s.phase==='closed'&&!offer){title='报价已截止';detail='采购方正在比较报价。已提交的报价可查看，但不能补交。';action='查看采购比价';go=()=>jump('buyer','analysis');}
 else if(role!=='buyer'&&person){
   if(offer&&!s.award){const replied=person.responses[person.responses.length-1]?.offer===offer.version;title=replied?`${person.name} 已回复目标报价`:`下一步：${person.name} 确认目标报价`;detail=replied?'本家回复已保存，可继续下一家或返回采购方核对选择。':'整单金额和条款已从采购方带入，只需选择接受、拒绝或附条件。';action=replied&&waiting?`继续模拟 ${waiting.id} 的回复`:'返回采购方查看回复';go=replied&&waiting?()=>jump(waiting.id,'analysis'):()=>jump('buyer','analysis');}
   else if(person.quotes.length){title=`${person.name} 已提交报价`;detail=`已收齐 ${quoted.length}/${s.suppliers.length} 家。${missing?'可以继续下一家，不需要手动寻找身份。':'已全部回收，可以模拟截止并比较。'}`;action=missing?`继续填写 ${missing.id} 的报价`:'全部已报价，模拟截止并比价';go=missing?()=>jump(missing.id,'flow'):close;}
   else{title=`下一步：${person.name} 填报费用`;detail='可以粘贴 Excel 报价列，或填写金额。保存草稿不会自动提交，提交后系统计算总价和回执。';action='返回采购方';}
 }else if(s.withdrawal||s.completed){title=s.completed?'本次履约已完成':'已记录承接后退出';detail='过程与原始分母已经更新，可查看供应商评估和历史。';action='查看本次评估';go=()=>jump('buyer','evaluation');}
 else if(s.award){const pending=s.changes.filter(c=>c.status==='proposed').length;title=pending?`下一步：核对 ${pending} 项费用变更`:'下一步：跟进履约或登记异常';detail=pending?'申请还不是已确认费用。先记录双方确认依据，再登记完成。':'不需要每次重新填写订单信息；只有费用变化或退出时补充原因。';action='处理履约';go=()=>jump('buyer','delivery');}
 else if(offer){title=accepted.length?`已有 ${accepted.length} 家整单接受，请选择承接方`:'下一步：收取供应商对目标价的回复';detail=waiting?`${waiting.name} 尚未回复；附条件接受不等于成交。`:'各家已回复，需重新议价或核对可执行方案。';action=waiting?`模拟 ${waiting.id} 回复目标价`:'核对回复与选择';go=waiting?()=>jump(waiting.id,'analysis'):()=>jump('buyer','analysis');}
 else if(s.phase==='closed'){title='下一步：核对自动整理的目标报价';detail='逐项最低价、来源与合计已自动带入草稿；不必抄写十项金额。核对条款后再确认发出。';action='核对并发出目标价';go=()=>jump('buyer','analysis');}
 else{title=`报价回收：${quoted.length}/${s.suppliers.length} 家`;detail=missing?`${missing.name} 尚未报价，点右侧直接进入其填报。`:'三家均已报价，可以模拟截止，查看同口径比较。';action=missing?`填写 ${missing.id} 的报价`:'全部已报价，模拟截止并比价';go=missing?()=>jump(missing.id,'flow'):close;}
 return <section className="proc-next" aria-label="当前流程指引"><div><strong>{title}</strong><p>{detail}</p></div><button className="btn primary" onClick={go}>{action} →</button></section>;
}
