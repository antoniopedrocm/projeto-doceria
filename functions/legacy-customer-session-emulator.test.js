process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.GCLOUD_PROJECT='demo-doceria-checkout';process.env.FUNCTIONS_EMULATOR='true';
const {test,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const admin=require('firebase-admin');
const {createCheckoutIdentity}=require('./checkout-identity');
const {createAddressVerification}=require('./address-verification');
const {createLegacyCustomerSession}=require('./legacy-customer-session');
const app=admin.initializeApp({projectId:'demo-doceria-checkout'},'legacy-private-tests'),db=app.firestore();
after(()=>app.delete());
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
async function fixture(id){
 let time=Date.now();const storeId='legacy-private-store',customerId='legacy-private-'+id,phone={purposes:'62982345671',history:'62982345672',mutations:'62982345673'}[id];
 const customer=db.doc('clientes/'+customerId);await customer.set({nome:'Pessoa fixture',telefone:phone,authOwnerUid:'actual-owner',identityRegistryVersion:1,legacyCustomerIds:[customerId+'-alias'],legacyOrderPaths:['pedidos/'+id+'-reviewed'],enderecos:[{id:'address-1',nickname:'Apelido preservado',street:'Rua A',number:'10',neighborhood:'Centro',city:'Goiânia',enderecoCompleto:'Rua A, 10',isDefault:true}]});
 const identities=createCheckoutIdentity({db,now:()=>time}),context=await identities.select({storeId,mode:'legacy_phone',legacyCustomerId:customerId,phone,phoneRecordHash:hash(phone)});
 const proof={storeId,checkoutIdentityToken:context.token,checkoutIdentityRevision:context.revision};
 let sms=0;
 const provider={load:async()=>({channels:{sms:{},whatsapp:{}},policy:{otpMs:300000,sessionMs:600000,resendMs:60000,maxAttempts:5,phoneHourly:5,ipHourly:10,globalDaily:100}}),start:async()=>{sms++;return {};},verify:async()=>true};
 const verification=createAddressVerification({db,identities,provider,now:()=>time}),service=createLegacyCustomerSession({db,verification});
 const grant=async channel=>{const challenge=await verification.start({...proof,channel},'fixture-'+id);return verification.verify({...proof,challengeId:challenge.challengeId,code:'123456'});};
 return {customer,customerId,storeId,proof,identities,verification,service,grant,sms:()=>sms,advance:ms=>{time+=ms;}};
}
test('phone alone and old address/WhatsApp grants never open private Customer; SMS proof mints a temporary purpose without Auth ownership mutation',async()=>{
 const f=await fixture('purposes');const before=(await f.customer.get()).data();
 await assert.rejects(()=>f.service.call('account',{...f.proof,purpose:'CUSTOMER_PRIVATE_SESSION'}));
 const wa=await f.grant('whatsapp');assert.equal(wa.customerSession,null);
 await assert.rejects(()=>f.service.call('account',{...f.proof,addressSessionToken:wa.addressSessionToken,purpose:'CUSTOMER_PRIVATE_SESSION'}));
 f.advance(61000);const sms=await f.grant('sms');assert.ok(sms.customerSession);
 const result=await f.service.call('account',sms.customerSession);assert.equal(result.customer.nome,before.nome);assert.equal(result.customer.enderecos[0].nickname,'Apelido preservado');
 assert.equal(result.customer.accountLinked,undefined);assert.equal(result.customer.authProvider,'temporary_sms');
 assert.deepEqual((await f.customer.get()).data(),before);
 const stored=db.doc('integrations/addressVerification/grants/'+hash(sms.addressSessionToken));await stored.update({purposes:['ADDRESS_MANAGEMENT'],scopes:['address_manage','profile_basic']});
 await assert.rejects(()=>f.service.call('account',sms.customerSession));
});
test('temporary SMS history uses reviewed Customer/alias mappings; never phone-only, orphan, foreign owner or foreign Customer',async()=>{
 const f=await fixture('history'),session=(await f.grant('sms')).customerSession;
 const data={clienteId:f.customerId,ownerUid:'actual-owner',total:10,status:'Finalizado',createdAt:admin.firestore.Timestamp.now(),itens:[]};
 await Promise.all([
  db.doc(`lojas/${f.storeId}/pedidos/owned`).set(data),db.doc(`lojas/${f.storeId}/pedidos/alias`).set({...data,clienteId:f.customerId+'-alias'}),
  db.doc(`lojas/${f.storeId}/pedidos/other`).set({...data,clienteId:'foreign-customer'}),db.doc(`lojas/${f.storeId}/pedidos/foreign-owner`).set({...data,ownerUid:'foreign-owner'}),
  db.doc(`lojas/${f.storeId}/pedidos/phone-only`).set({telefone:'62982345678',total:10}),
  db.doc('pedidos/history-reviewed').set(data),db.doc('pedidos/history-unreviewed').set(data),
 ]);
 const listed=await f.service.call('orders',session);assert.deepEqual(listed.orders.map(o=>o.id).sort(),['alias','history-reviewed','owned']);
 for(const orderId of ['other','foreign-owner','phone-only']) await assert.rejects(()=>f.service.call('orderDetail',session,{storeId:f.storeId,orderId}));
 assert.equal((await f.service.call('orderDetail',session,{storeId:f.storeId,orderId:'owned'})).order.id,'owned');
 f.advance(600001);await assert.rejects(()=>f.service.call('orders',session));
});
test('SMS profile/address mutation stays scoped, records audit, rejects security fields and ends on revoke/context change',async()=>{
 const f=await fixture('mutations'),session=(await f.grant('sms')).customerSession;
 await assert.rejects(()=>f.service.call('update',session,{nome:'Pessoa',authOwnerUid:'attacker'}));
 let account=(await f.service.call('update',session,{nome:'Nome atualizado',aniversario:'1994-03-21'})).customer;
 assert.equal(account.nome,'Nome atualizado');assert.equal((await f.customer.get()).data().authOwnerUid,'actual-owner');
 const address=account.enderecos[0];account=(await f.service.call('updateAddress',session,{addressId:address.id,address:{...address,nickname:'Casa editada'}})).customer;
 assert.equal(account.enderecos[0].nickname,'Casa editada');
 await assert.rejects(()=>f.service.call('deleteAddress',session,{addressId:'foreign-address',confirmed:true}));
 assert.ok((await db.collection('integrations/addressVerification/audit').where('customerId','==',f.customerId).get()).size>=3);
 await f.service.call('logout',session);await assert.rejects(()=>f.service.call('account',session));
});
