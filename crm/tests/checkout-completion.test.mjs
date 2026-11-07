import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {completeCheckoutAttempt} from '../public/guest-payment-attempt.mjs';
const key='doceria-payment-pending',id='a'.repeat(64),token='b'.repeat(64);
const values=()=>new Map([[key,JSON.stringify({idempotencyKey:'fixture-attempt'})],['checkoutState_v1',JSON.stringify({storeId:'fixture-store',cart:[{id:'product'}]})]]);
const storageFor=map=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});
const receipt={attemptKey:'fixture-attempt',orderId:id,paymentId:id,paymentReturnToken:token,storeId:'fixture-store',mode:'ONLINE_NOW'};
test('order acknowledgement clears matching persisted draft before retiring key; later purchase is independent',()=>{
 const map=values(),storage=storageFor(map),calls=[],remove=storage.removeItem;storage.removeItem=k=>{calls.push(k);remove(k);};
 assert.equal(completeCheckoutAttempt({storage,...receipt}),true);
 assert.deepEqual(calls,['checkoutState_v1',key]);assert.ok(map.has('doceria-payment-return:'+id));
 const proof=map.get('doceria-payment-return:'+id);map.set(key,JSON.stringify({idempotencyKey:'new-purchase'}));
 assert.equal(completeCheckoutAttempt({storage,...receipt}),false);assert.equal(map.get('doceria-payment-return:'+id),proof);
 assert.equal(JSON.parse(map.get(key)).idempotencyKey,'new-purchase');
});
test('receipt from another store never clears current cart',()=>{
 const map=values(),storage=storageFor(map);completeCheckoutAttempt({storage,...receipt,storeId:'another-store'});
 assert.equal(JSON.parse(map.get('checkoutState_v1')).storeId,'fixture-store');
});
test('redirect validates provider URL and saves proof before invoking cleanup/navigation',()=>{
 const source=fs.readFileSync(new URL('../public/checkout-payment-client.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('export function redirectToPayment')+7,source.indexOf('let onlineEnabled=false;'));
 const map=values(),events=[],context={key,sessionStorage:storageFor(map),URL,encodeURIComponent,window:{location:{assign:url=>events.push(url)}}};vm.createContext(context);vm.runInContext(fn,context);
 const data={paymentId:id,paymentReturnToken:token,checkoutUrl:'https://buy.infinitepay.io/fixture'};
 assert.throws(()=>context.redirectToPayment({...data,checkoutUrl:'https://outside.test/'},()=>events.push('cleanup')),/inválido/);assert.deepEqual(events,[]);
 context.redirectToPayment(data,()=>{assert.equal(JSON.parse(map.get('doceria-payment-return:'+id)).token,token);events.push('cleanup');});
 assert.deepEqual(events,['cleanup',data.checkoutUrl]);
});
test('old payment return cannot clear a new checkout key; return proof survives normal cart completion',async()=>{
 const source=fs.readFileSync(new URL('../public/payment-return.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('button.onclick=check;check();','button.onclick=check;');
 const map=values();completeCheckoutAttempt({storage:storageFor(map),...receipt});
 map.set(key,JSON.stringify({idempotencyKey:'another-purchase'}));const prior=map.get(key),status={},button={},returnLink={};let body;
 const context={sessionStorage:storageFor(map),window:{location:{search:''}},document:{getElementById:id=>({status,check:button,'return-menu':returnLink}[id])},URLSearchParams,AbortSignal,
  apiBaseUrl:'https://api.invalid',customerMenuDestination:()=>'/cardapio-matriz',paymentStatusHeaders:async()=>({}),fetch:async(_url,opts)=>{body=JSON.parse(opts.body);return {ok:true,json:async()=>({payment_status:'PAID'})};}};
 vm.createContext(context);vm.runInContext(source,context);await context.check();
 assert.equal(body.paymentId,id);assert.equal(body.paymentReturnToken,token);assert.equal(map.get(key),prior);assert.match(status.textContent,/confirmado/);
});
