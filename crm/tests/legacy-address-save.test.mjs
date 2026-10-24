import {test} from 'node:test';import assert from 'node:assert/strict';
import {createLegacyAddressSaver} from '../public/legacy-address-save.mjs';
const option={id:'opaque-persisted',saved:true,summary:'Rua P***, nº ***',isDefault:false};
const address={nickname:'Casa',street:'Rua privada',number:'10',city:'Goiânia',neighborhood:'Centro',isDefault:true,customerId:'forged'};
function fixture(request){let state={mode:'legacy_phone',token:'context',revision:2},watcher;const identity={get:()=>state,subscribe:fn=>{watcher=fn;return()=>{};}};
  let keys=0;return {saver:createLegacyAddressSaver({identity,storeId:'loja-futura-teste',request,randomId:()=>String(++keys)}),change:mode=>{state={...state,mode,revision:3};watcher();}};}
test('save usa só contexto/revisão/loja e campos do novo endereço; devolve seleção mascarada persistida',async()=>{
  let body;const f=fixture(async data=>{body=data;return {addressId:option.id,addresses:[option]};});
  const result=await f.saver.save(address);assert.equal(body.storeId,'loja-futura-teste');assert.equal(body.customerId,undefined);assert.equal(body.address.customerId,undefined);assert.equal(body.address.isDefault,undefined);assert.equal(result.selected,option);assert.equal(result.selected.enderecoCompleto,undefined);
});
test('duplo clique compartilha um único request e retry conserva chave após falha',async()=>{
  let finish,calls=0,fail=true;const keys=[];const f=fixture(async data=>{calls++;keys.push(data.requestId);if(fail){await new Promise(r=>{finish=r;});throw Error('Falha de rede');}return {addressId:option.id,addresses:[option]};});
  const first=f.saver.save(address),second=f.saver.save(address);assert.equal(first,second);await new Promise(r=>setImmediate(r));assert.equal(calls,1);finish();await assert.rejects(first,/rede/);await assert.rejects(second,/rede/);
  fail=false;assert.equal((await f.saver.save(address)).selected,option);assert.deepEqual(keys,['1','1']);
});
test('erro backend ou resposta sem ID confirmado não produz seleção local nem fallback temporário',async()=>{
  const f=fixture(async()=>{throw Error('Não foi possível salvar o endereço. Tente novamente.');});await assert.rejects(f.saver.save(address),/Não foi possível salvar/);
  const g=fixture(async()=>({addressId:'unknown',addresses:[]}));await assert.rejects(g.saver.save(address),/confirmar o endereço salvo/);
});
test('resposta atrasada não passa para outra identidade e Guest/Strong não usam caminho weak',async()=>{
  let finish;const f=fixture(()=>new Promise(r=>{finish=r;}));const pending=f.saver.save(address);await new Promise(r=>setImmediate(r));f.change('guest');finish({addressId:option.id,addresses:[option]});await assert.rejects(pending,/identificação mudou/);await assert.rejects(f.saver.save(address),/Identifique/);f.change('strong_auth');await assert.rejects(f.saver.save(address),/Identifique/);
});
