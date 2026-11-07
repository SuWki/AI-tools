import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/procurement/demoModel.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2020}}).outputText;
const {seed,reduce,comparison,metrics,total,cents}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const published=()=>{const s=seed();return reduce(s,{type:'publish',title:s.title,route:s.route,cargo:s.cargo,terms:s.terms,deadline:s.deadline,fees:s.fees});};
const quoted=()=>{let s=published();for(const p of s.suppliers)s=reduce(s,{type:'quote',supplierId:p.id,amounts:p.sample,note:''});return s;};
const offered=()=>{let s=reduce(quoted(),{type:'close'});return reduce(s,{type:'offer',amounts:comparison(s).minima.map(v=>v.amount),terms:'整单同范围含税承接'});};
test('exact monetary values reject blanks, negative quotes and more than two decimals',()=>{
 assert.equal(total(['0.10','0.20','0']),'0.30');
 for(const value of ['', '-1','1.001','NaN'])assert.throws(()=>cents(value));
 assert.equal(cents('-150',true),-15000n);
});
test('publish freezes scope, quote versions persist and close blocks late quotes',()=>{
 const draft=seed(),s=published();assert.equal(draft.phase,'draft');assert.equal(s.phase,'quoting');
 assert.throws(()=>reduce(s,{type:'publish',title:'x',route:'x',cargo:'x',terms:'x',deadline:s.deadline,fees:s.fees}));
 let n=quoted();n=reduce(n,{type:'quote',supplierId:'A',amounts:n.suppliers[0].sample,note:''});assert.equal(n.suppliers[0].quotes.length,2);
 n=reduce(n,{type:'close'});assert.throws(()=>reduce(n,{type:'quote',supplierId:'A',amounts:n.suppliers[0].sample,note:''}));
});
test('ten-fee minima differ from executable whole quotes and show sources',()=>{
 const s=reduce(quoted(),{type:'close'}),c=comparison(s);assert.equal(c.reference,'3410.00');assert.equal(c.bestTotal,'3680.00');assert.equal(c.bestSupplier,'B');assert.equal(c.minima.length,10);assert.deepEqual(c.minima[0].suppliers,['B']);assert.equal(s.award,undefined);
});
test('a latest conditional quote is excluded and does not resurrect an old price',()=>{
 let s=quoted();s=reduce(s,{type:'quote',supplierId:'B',amounts:s.fees.map(()=> '0'),note:'只有与另单捆绑才成立'});const c=comparison(reduce(s,{type:'close'}));assert.equal(c.excluded,1);assert.notEqual(c.bestSupplier,'B');assert.ok(c.minima.every(m=>!m.suppliers.includes('B')));
});
test('conditional or superseded acceptance cannot award the order',()=>{
 let s=offered();s=reduce(s,{type:'respond',supplierId:'A',decision:'conditional',note:'需另收等候费'});assert.throws(()=>reduce(s,{type:'award',supplierId:'A'}));
 s=reduce(s,{type:'respond',supplierId:'B',decision:'accept',note:''});s=reduce(s,{type:'offer',amounts:s.offers[0].amounts,terms:'新版本条款'});assert.throws(()=>reduce(s,{type:'award',supplierId:'B'}));
 s=reduce(s,{type:'respond',supplierId:'B',decision:'accept',note:''});s=reduce(s,{type:'award',supplierId:'B'});assert.equal(s.award.supplierId,'B');
});
test('fee applications require confirmation, completion updates denominators and history',()=>{
 let s=offered();s=reduce(s,{type:'respond',supplierId:'A',decision:'accept',note:''});s=reduce(s,{type:'award',supplierId:'A'});
 s=reduce(s,{type:'change',delta:'150',reason:'客户增加装卸'});assert.throws(()=>reduce(s,{type:'complete'}));assert.equal(metrics(s)[0].completed,false);
 s=reduce(s,{type:'approveChange',id:s.changes[0].id,confirmation:'模拟双方确认'});s=reduce(s,{type:'complete'});const m=metrics(s)[0];assert.equal(m.completed,true);assert.equal(m.changed,true);assert.equal(m.accepted,1);assert.equal(s.events.at(-1).action,'complete');assert.throws(()=>reduce(s,{type:'withdraw',reason:'late'}));
});
test('supplier withdrawal is a separate recorded event, never a completed case',()=>{
 let s=offered();s=reduce(s,{type:'respond',supplierId:'C',decision:'accept',note:''});s=reduce(s,{type:'award',supplierId:'C'});s=reduce(s,{type:'withdraw',reason:'模拟供应商无法安排运力'});const m=metrics(s)[2];assert.equal(m.withdrawn,true);assert.equal(m.completed,false);assert.throws(()=>reduce(s,{type:'complete'}));
});
