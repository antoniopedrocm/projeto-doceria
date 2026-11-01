import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const source=fs.readFileSync(path.join(__dirname,'App.js'),'utf8');
// Exercise the actual queue expression and date helpers, without loading the
// CRM, mocking fiscal eligibility, or writing any live invoice/order.
const expression=source.match(/const invoiceableOrders = useMemo\(\(\) => \(\s*([\s\S]*?)\s*\), \[orders\]\);/)[1];
const list=orders=>vm.runInNewContext(expression,{orders});
const helper=name=>source.match(new RegExp('const '+name+' = ([\\s\\S]*?\\n});'))[1].replace(/;$/,'');
const getJSDate=vm.runInNewContext('('+helper('getJSDate')+')');
const parseDateInput=vm.runInNewContext('('+helper('parseDateInput')+')');
const inRange=vm.runInNewContext('('+helper('isDateInRange')+')',{getJSDate,parseDateInput});
test('actual fiscal queue admits online Pix/card, unresolved AGREED_LATER and historical finalized orders',()=>{
 const ready=[{id:'pix',status:'Finalizado',paymentMode:'ONLINE_NOW',paymentMethod:'PIX'},{id:'card',status:'Finalizado',paymentMode:'ONLINE_NOW',paymentMethod:'CREDIT_CARD'},
  {id:'agreed',status:'Aprovado',paymentMode:'AGREED_LATER',paymentMethod:null},{id:'legacy',status:'Finalizado',formaPagamento:'Dinheiro'}];
 const pending={id:'not-operationally-ready',status:'Pendente',paymentMode:'ONLINE_NOW',payment_status:'PAID'};
 expect(list([...ready,pending]).map(o=>o.id)).toEqual(ready.map(o=>o.id));
 expect(list([{...pending,approvedForInvoice:true}]).length).toBe(1);
});
test('queue monthly dates use actual creation time/local day boundaries; malformed date is not guessed',()=>{
 const end=new Date(2026,9,31,23,59,59,999).toISOString(),next=new Date(2026,10,1,0,0,0).toISOString();
 expect(inRange(end,'2026-10-01','2026-10-31')).toBe(true);expect(inRange(next,'2026-10-01','2026-10-31')).toBe(false);
 expect(inRange({toDate:()=>new Date(end)},'2026-10-01','2026-10-31')).toBe(true);
 expect(inRange('invalid-date','2026-10-01','2026-10-31')).toBe(false);
});
