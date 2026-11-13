process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const admin=require('firebase-admin'),{HttpsError}=require('firebase-functions/v2/https');
const {createManualOrderPayment,createManualPaymentAuthorizer}=require('./manual-order-payment');
const {createAdminOrderEdit}=require('./admin-order-edit');
const app=admin.initializeApp({projectId:'demo-manual-order-payment'},'manual-receipt'),db=app.firestore();
const authorize=async(uid,store)=>{if(!uid)throw new HttpsError('unauthenticated','Login');if(uid!=='owner'||store!=='matriz')throw new HttpsError('permission-denied','No access');return {uid,name:'Owner sintético'};};
const receive=createManualOrderPayment({db,admin,HttpsError,authorize}),edit=createAdminOrderEdit({db,admin,HttpsError,authorize});
const base={lojaId:'matriz',clienteId:'c',status:'Finalizado',paymentMode:'AGREED_LATER',paymentStatus:'PENDING',paymentMethod:'CREDIT_CARD',fiscalPaymentCode:'03',formaPagamento:'Cartão de Crédito',paymentMethodSource:'crm/manual',total:14.78,itens:[{produtoId:'p',preco:1,quantity:1}],subtotal:1,valorFrete:13.78,adminRevision:2};
const req=(id,extra={},uid='owner')=>({auth:uid?{uid}:null,data:{storeId:'matriz',orderId:id,requestId:'synthetic-request-'+id,expectedRevision:2,expectedTotalCents:1478,methodLabel:'Cartão de Crédito',confirmed:true,...extra}});
const seed=async(id,extra={})=>{await db.doc('lojas/matriz/pedidos/'+id).set({...base,...extra});return db.doc('lojas/matriz/pedidos/'+id);};
before(async()=>{await db.doc('lojas/matriz/produtos/p').set({nome:'Produto',estoque:10,preco:1,status:'Ativo'});});after(()=>app.delete());
test('manual receipt records PAID, actor, amount and append-only audit without stock/ledger/coupon/provider changes',async()=>{
 const ref=await seed('receipt'),before=(await ref.get()).data(),stock=(await db.doc('lojas/matriz/produtos/p').get()).data();const r=await receive(req('receipt'));
 assert.equal(r.amountCents,1478);const d=(await ref.get()).data();assert.equal(d.paymentStatus,'PAID');assert.equal(d.status,'Finalizado');assert.equal(d.manualPaymentReceipt.amountCents,1478);assert.equal(d.manualPaymentReceipt.actorUid,'owner');assert.equal(d.paymentMethodSource,'crm/manual');assert.ok(d.paidAt.toMillis());
 for(const field of ['itens','total','valorFrete','clienteId'])assert.deepEqual(d[field],before[field]);assert.deepEqual((await db.doc('lojas/matriz/produtos/p').get()).data(),stock);assert.equal((await db.collection('lojas/matriz/contas_a_receber').get()).size,0);assert.equal((await db.collection('checkoutPayments').get()).size,0);
 const events=await ref.collection('auditEvents').get();assert.equal(events.size,1);assert.equal(events.docs[0].get('source'),'CRM_MANUAL_PAYMENT_RECEIPT');assert.deepEqual(events.docs[0].get('stockChanges'),[]);
});
test('same request, repeated new request and concurrent requests cannot create a second receipt/audit',async()=>{
 const ref=await seed('repeat');await Promise.all([receive(req('repeat')),receive(req('repeat'))]);assert.equal((await receive(req('repeat',{requestId:'another-request-repeat'}))).duplicate,true);assert.equal((await ref.collection('auditEvents').get()).size,1);
 const a=await seed('parallel');await Promise.all([receive(req('parallel')),receive(req('parallel',{requestId:'another-request-parallel'}))]);assert.equal((await a.collection('auditEvents').get()).size,1);
});
test('unauthenticated or unauthorized store/Staff cannot register a receipt',async()=>{
 await seed('auth');for(const [uid,extra,code]of [[null,{},'unauthenticated'],['staff',{},'permission-denied'],['owner',{storeId:'garavelo'},'permission-denied']])await assert.rejects(()=>receive(req('auth',extra,uid)),e=>e.code===code);
});
test('explicit consent, unchanged revision/amount and known method are required; frontend cannot forge financial fields',async()=>{
 const ref=await seed('invalid'),before=(await ref.get()).data();for(const extra of [{confirmed:false},{expectedTotalCents:100},{expectedRevision:1},{methodLabel:'Inexistente'},{paymentStatus:'PAID'},{capture_method:'pix'}])await assert.rejects(()=>receive(req('invalid',extra)));
 assert.deepEqual((await ref.get()).data(),before);
});
test('online/provider, refunded, failed, canceled, reviewed and unfinished orders reject manual PAID',async()=>{
 for(const [index,extra]of [{paymentId:'online'},{paymentMode:'ONLINE_NOW'},{paymentMethodSource:'provider/infinitepay'},{paymentStatus:'REFUNDED'},{paymentStatus:'FAILED'},{status:'Cancelado'},{requiresReview:true},{status:'Pendente'}].entries()){
  const id='blocked'+index,ref=await seed(id,extra),before=(await ref.get()).data();await assert.rejects(()=>receive(req(id)),e=>e.code==='failed-precondition');assert.deepEqual((await ref.get()).data(),before);
 }
});
test('confirmed or previously defined payment method cannot be silently changed',async()=>{
 await seed('method');await assert.rejects(()=>receive(req('method',{methodLabel:'Pix'})),e=>e.code==='failed-precondition');
});
test('unknown method uses existing fiscal mapping, and issued/in-progress invoice protects unresolved mapping',async()=>{
 const ref=await seed('pix',{paymentMethod:null,fiscalPaymentCode:null,formaPagamento:'A combinar',paymentMethodSource:null});await receive(req('pix',{methodLabel:'Pix dinâmico / link gerado'}));assert.equal((await ref.get()).get('paymentMethod'),'PIX');assert.equal((await ref.get()).get('fiscalPaymentCode'),'17');
 await seed('invoice',{paymentMethod:null,fiscalPaymentCode:null,fiscal:{authorizedInvoiceId:'issued'}});await assert.rejects(()=>receive(req('invoice')),e=>e.code==='failed-precondition');
});
test('existing linked receivable blocks duplicate financial recognition',async()=>{
 await seed('ledger');await db.doc('lojas/matriz/contas_a_receber/linked').set({pedidoId:'ledger',status:'Recebido',valor:14.78});await assert.rejects(()=>receive(req('ledger')),e=>e.code==='failed-precondition');
});
test('a failed transaction preserves all original fields and emits no audit',async()=>{
 const ref=await seed('failure'),before=(await ref.get()).data();const faulty={doc:p=>db.doc(p),collection:p=>db.collection(p),runTransaction:handler=>db.runTransaction(async tx=>{await handler(tx);throw new Error('Synthetic failure before commit');})};
 await assert.rejects(()=>createManualOrderPayment({db:faulty,admin,HttpsError,authorize})(req('failure')));assert.deepEqual((await ref.get()).data(),before);assert.equal((await ref.collection('auditEvents').get()).size,0);
});
test('subsequent full edit cannot change a receipted total or original Customer; note/status edits preserve receipt',async()=>{
 const ref=await seed('edit');await receive(req('edit'));const d=(await ref.get()).data();
 const request=patch=>({auth:{uid:'owner'},data:{storeId:'matriz',orderId:'edit',expectedRevision:d.adminRevision,requestId:'after-receipt-edit-request',mode:'FULL',patch:{status:'Finalizado',clienteId:'c',formaPagamento:'Cartão de Crédito',itens:[{produtoId:'p',quantity:1}],desconto:0,cupom:null,...patch}}});
 await assert.rejects(()=>edit.save(request({desconto:.5})),e=>e.code==='failed-precondition');await assert.rejects(()=>edit.save(request({clienteId:'other'})),e=>e.code==='failed-precondition');
 await edit.save(request({observacao:'Nota administrativa'}));assert.equal((await ref.get()).get('manualPaymentReceipt.amountCents'),1478);assert.equal((await ref.get()).get('observacao'),'Nota administrativa');
});
test('receipt authorizer requires existing financial and order permissions without widening the assigned stores',async()=>{
 for(const [uid,p]of Object.entries({finance:{role:'gerente',lojaIds:['matriz'],permissions:{pedidos:true,financeiro:true}},ordersOnly:{role:'gerente',lojaIds:['matriz'],permissions:{pedidos:true,financeiro:false}},financeOnly:{role:'gerente',lojaIds:['matriz'],permissions:{pedidos:false,financeiro:true}}}))await db.doc('users/'+uid).set(p);
 const auth=createManualPaymentAuthorizer({db,HttpsError,assertActiveUser:async uid=>{if(!uid)throw new HttpsError('unauthenticated','Login');return(await db.doc('users/'+uid).get()).data();},normalizeRole:r=>r,sanitizePermissions:p=>p||{},extractStoreIds:p=>p.lojaIds||[]});
 assert.equal((await auth('finance','matriz')).uid,'finance');for(const [uid,store]of [['ordersOnly','matriz'],['financeOnly','matriz'],['finance','garavelo']])await assert.rejects(()=>auth(uid,store),e=>e.code==='permission-denied');
});
