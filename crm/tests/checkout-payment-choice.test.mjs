import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import {PAYMENT_CHOICES, paymentSelection, syncPaymentChoices, resetPaymentChoice} from '../public/checkout-payment-choice.mjs';
const require=createRequire(import.meta.url),{JSDOM}=require('../node_modules/jsdom');
test('Strong: duas opções, padrão online, helper contextual; sincronização conserva escolha e weak restaura métodos antigos',()=>{
  const dom=new JSDOM('<select id="payment-method-select"><option value="">Escolha...</option><option>Pix</option><option>Dinheiro</option></select><p id="payment-choice-help" hidden></p>');
  const select=dom.window.document.querySelector('select'),original=select.innerHTML,helper=dom.window.document.querySelector('p');
  syncPaymentChoices(select,true,true);
  assert.deepEqual([...select.options].map(o=>o.textContent),['Pagar Agora — Pix ou Cartão','Combinar Pagamento']);
  assert.equal(select.value,'ONLINE_NOW');assert.equal(helper.textContent,PAYMENT_CHOICES.ONLINE_NOW.helper);
  select.value='AGREED_LATER';select.dispatchEvent(new dom.window.Event('change'));
  assert.equal(helper.textContent,PAYMENT_CHOICES.AGREED_LATER.helper);
  syncPaymentChoices(select,true,true);assert.equal(select.value,'AGREED_LATER');
  resetPaymentChoice(select);assert.equal(select.value,'ONLINE_NOW');assert.equal(helper.textContent,PAYMENT_CHOICES.ONLINE_NOW.helper);
  syncPaymentChoices(select,false,true);assert.equal(select.innerHTML,original);assert.equal(helper.hidden,true);
  syncPaymentChoices(select,true,false);assert.equal(select.value,'ONLINE_NOW');assert.equal(select.selectedOptions[0].disabled,true);
});
test('escolha separa momento/método sem conceder direito online a Guest/Phone',()=>{
  assert.deepEqual(paymentSelection('ONLINE_NOW',true),{forma:'Online',mode:'ONLINE_NOW'});
  assert.deepEqual(paymentSelection('AGREED_LATER',true),{forma:'A combinar',mode:'AGREED_LATER'});
  assert.throws(()=>paymentSelection('AGREED_LATER',false));
  assert.throws(()=>paymentSelection('ONLINE_NOW',false));
  assert.deepEqual(paymentSelection('Dinheiro',false),{forma:'Dinheiro'});
});
test('redirecionamento online mantém allowlist e retorno de pagamento já confirmado',()=>{
  const source=fs.readFileSync(new URL('../public/checkout-payment-client.js',import.meta.url),'utf8');
  const expression=source.slice(source.indexOf('export function redirectToPayment')+7,source.indexOf('let onlineEnabled=false;'));
  const assigned=[],location={assign:url=>assigned.push(url)},storage=new Map();
  const redirect=vm.runInNewContext('('+expression+')',{window:{location},URL,key:'pending',sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
  redirect({paymentId:'test',checkoutUrl:'https://buy.infinitepay.io/test'});assert.deepEqual(assigned,['https://buy.infinitepay.io/test']);
  assert.throws(()=>redirect({checkoutUrl:'https://example.test/not-provider'}),/inválido/);
  assert.throws(()=>redirect({}),/aguardando/);
  redirect({paymentId:'test',payment_status:'PAID'});assert.equal(location.href,'./payment-return.html?order_nsu=test');
});
