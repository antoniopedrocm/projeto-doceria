import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createPhoneAddressManager} from '../public/address-management.mjs';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const option={id:'opaque-address',nickname:'Casa',summary:'Rua ••, nº •• · Bueno',saved:true};
function fixture({channels=['sms']}={}){
  const dom=new JSDOM('<main>Checkout preservado</main>');let state={mode:'legacy_phone',token:'context-a',revision:2},time=1000,verified=false;
  const watchers=new Set(),intervals=new Map(),timeouts=new Map();let timerId=0;
  const identity={get:()=>state,subscribe:listener=>{watchers.add(listener);return()=>watchers.delete(listener);}};
  const calls=[],changes=[];
  const request=async(method,data,scope)=>{
    calls.push({method,data,scope});
    if(method==='status')return {channels,phoneMasked:'••••0001',resendSeconds:45,firebase:{projectId:'doceria-sms-dev-fixture'}};
    if(method==='start')return {challengeId:'challenge',expiresAt:time+300000,resendAt:time+45000};
    if(method==='verify'){if(data.code!=='123456')throw Error('Código incorreto.');verified=true;return {addressSessionToken:'limited-proof',expiresAt:time+600000,purpose:'ADDRESS_MANAGEMENT'};}
    if(method==='manage'){
      assert.equal(verified,true);assert.equal(data.addressSessionToken,'limited-proof');
      if(data.operation==='read')return {address:{id:option.id,nickname:'Casa',street:'Rua privada',number:'10',city:'Goiânia',neighborhood:'Bueno',cep:'74230000',complement:'Apto privado'}};
      return {addresses:[option]};
    }
    return {ok:true};
  };
  const clock={setInterval:fn=>{const id=++timerId;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id),
    setTimeout:(fn,ms)=>{const id=++timerId;timeouts.set(id,{fn,at:time+ms});return id;},clearTimeout:id=>timeouts.delete(id)};
  const manager=createPhoneAddressManager({document:dom.window.document,identity,storeId:'loja-futura-teste',request,onAddresses:value=>changes.push(value),recaptcha:async()=>({token:'captcha',dispose:()=>{}}),now:()=>time,clock});
  const click=async text=>{const b=[...dom.window.document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,'missing '+text);b.click();await tick();await tick();};
  const confirm=async(code='123456')=>{const input=dom.window.document.querySelector('input[autocomplete="one-time-code"]');input.value=code;input.form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();};
  return {manager,dom,calls,changes,click,confirm,watchers,intervals,timeouts,change:s=>{state=s;watchers.forEach(fn=>fn());},advance:ms=>{time+=ms;intervals.forEach(fn=>fn());for(const [id,t] of timeouts)if(t.at<=time){timeouts.delete(id);t.fn();}},close:()=>{manager.destroy();dom.window.close();}};
}
test('ver/editar/promover/excluir/padrão exigem OTP antes de ler endereço completo ou escrever',async()=>{
  for(const operation of ['view','update','create','delete','default']){
    const f=fixture();try{await f.manager.perform(operation,option);assert.match(f.dom.window.document.body.textContent,/Confirme que este número é seu/);
      assert.equal(f.calls.some(c=>c.method==='manage'),false);assert.equal(f.dom.window.document.querySelectorAll('input').length,1);assert.doesNotMatch(f.dom.window.document.body.textContent,/Rua privada/);
    }finally{f.close();}
  }
});
test('Ver após SMS libera somente o registro alvo, mantém modo financeiro e expira com o grant',async()=>{
  const f=fixture();try{
    assert.equal(f.manager.getTrustState(),'legacy_phone_unverified');
    await f.manager.perform('view',option);assert.doesNotMatch(f.dom.window.document.body.textContent,/Rua privada/);
    await f.click('Enviar código por SMS');await f.confirm();
    assert.match(f.dom.window.document.body.textContent,/Seu endereço|Rua privada/);
    assert.equal(f.manager.getTrustState(),'legacy_phone_verified');
    assert.equal(f.calls.find(c=>c.method==='manage').data.addressId,option.id);
    f.advance(600001);assert.equal(f.manager.getTrustState(),'legacy_phone_unverified');assert.doesNotMatch(f.dom.window.document.body.textContent,/Rua privada/);
  }finally{f.close();}
});
test('promover rascunho exige SMS e preenche formulário sem herdar padrão ou pagamento',async()=>{
  const f=fixture(),draft={checkoutOnly:true,id:'draft-a',nickname:'Trabalho',street:'Rua digitada',number:'20',city:'Goiânia',neighborhood:'Bueno'};
  try{await f.manager.perform('create',draft);assert.equal(f.calls.some(c=>c.method==='manage'),false);await f.click('Enviar código por SMS');await f.confirm();
    assert.equal(f.dom.window.document.querySelector('input').value,'Trabalho');assert.equal(f.dom.window.document.querySelector('input[type="checkbox"]').checked,false);
    f.dom.window.document.querySelector('form').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();
    const call=f.calls.find(c=>c.method==='manage');assert.equal(call.data.operation,'create');assert.equal(call.data.addressId,undefined);assert.equal(call.data.address.isDefault,false);
  }finally{f.close();}
});
test('SMS aprovado abre editor completo; código não fica no input e nova gravação atualiza lista',async()=>{
  const f=fixture();try{
    await f.manager.perform('update',option);await f.click('Enviar código por SMS');await f.confirm();
    assert.match(f.dom.window.document.body.textContent,/Editar endereço/);assert.equal(f.dom.window.document.querySelector('[autocomplete="one-time-code"]'),null);
    assert.equal(f.dom.window.document.querySelector('input').value,'Casa');
    const form=f.dom.window.document.querySelector('form');form.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true,bubbles:true}));await tick();await tick();
    assert.equal(f.changes.length,1);assert.equal(f.calls.find(c=>c.method==='manage'&&c.data.operation==='update').data.addressId,option.id);
    assert.equal(f.dom.window.document.querySelector('[role="dialog"]'),null);
  }finally{f.close();}
});
test('código errado não abre editor; reenvio fica desabilitado pelo intervalo e permite depois',async()=>{
  const f=fixture();try{
    await f.manager.perform('create');await f.click('Enviar código por SMS');
    let send=[...f.dom.window.document.querySelectorAll('button')].find(b=>b.textContent.includes('Reenviar'));assert.equal(send.disabled,true);
    await f.confirm('000000');assert.match(f.dom.window.document.body.textContent,/Código incorreto/);assert.equal(f.calls.some(c=>c.method==='manage'),false);
    f.advance(45000);send=[...f.dom.window.document.querySelectorAll('button')].find(b=>b.textContent==='Enviar código por SMS');assert.equal(send.disabled,false);
  }finally{f.close();}
});
test('canal WhatsApp configurado é separado de SMS; indisponibilidade nunca finge envio',async()=>{
  const f=fixture({channels:['whatsapp']});try{await f.manager.perform('default',option);await f.click('Enviar código pelo WhatsApp');await f.confirm();assert.equal(f.changes.length,1);assert.equal(f.calls.find(c=>c.method==='start').data.channel,'whatsapp');}finally{f.close();}
  const empty=fixture({channels:[]});try{await empty.manager.perform('create');assert.match(empty.dom.window.document.body.textContent,/Verificação indisponível/);assert.equal(empty.calls.some(c=>c.method==='start'),false);}finally{empty.close();}
});
test('exclusão pede confirmação adicional; Cancelar é no-op e grant temporário pode ser reutilizado',async()=>{
  const f=fixture();try{
    await f.manager.perform('delete',option);await f.click('Enviar código por SMS');await f.confirm();assert.match(f.dom.window.document.body.textContent,/Excluir este endereço/);
    await f.click('Cancelar');assert.equal(f.calls.some(c=>c.method==='manage'&&c.data.operation==='delete'),false);
    await f.manager.perform('default',option);assert.equal(f.changes.length,1);assert.equal(f.calls.filter(c=>c.method==='verify').length,1);
  }finally{f.close();}
});
test('trocar identidade ou expirar remove detalhe privado, revoga prova e nunca herda para Guest',async()=>{
  const f=fixture();try{
    await f.manager.perform('update',option);await f.click('Enviar código por SMS');await f.confirm();
    f.change({mode:'guest',token:'other-context',revision:3});await tick();
    assert.equal(f.dom.window.document.querySelector('[role="dialog"]'),null);assert.ok(f.calls.some(c=>c.method==='revoke'&&c.scope.checkoutIdentityToken==='context-a'));
    await assert.rejects(()=>f.manager.perform('create'),/Identifique/);
  }finally{f.close();}
  const g=fixture();try{await g.manager.perform('update',option);await g.click('Enviar código por SMS');await g.confirm();g.advance(600001);assert.equal(g.dom.window.document.querySelector('[role="dialog"]'),null);}finally{g.close();}
});
test('abrir/fechar não duplica observadores ou timers e preserva conteúdo/carrinho',async()=>{
  const f=fixture();try{for(let i=0;i<3;i++){await f.manager.perform('create');await f.click('Cancelar');}assert.equal(f.watchers.size,1);assert.equal(f.intervals.size,0);assert.equal(f.dom.window.document.querySelector('main').textContent,'Checkout preservado');}finally{f.close();}assert.equal(f.watchers.size,0);
});
