const {createHash}=require('node:crypto');
const {fiscalChoices}=require('./order-payment-method');
const {createOrderAuthorizer,initialAllocation,auditValue}=require('./admin-order-edit');
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,150}$/.test(id);
const cents=value=>Math.round(Number(value)*100);
function createManualPaymentAuthorizer(deps) {
  const authorizeOrder=createOrderAuthorizer(deps);
  return async(uid,storeId)=>{
    const actor=await authorizeOrder(uid,storeId),profile=await deps.assertActiveUser(uid);
    const custom=(await deps.db.doc('customProfiles/'+uid).get()).data()||{};
    const permissions=deps.sanitizePermissions(custom.permissions||profile.permissions,deps.normalizeRole(profile.role));
    if(!permissions.financeiro)throw new deps.HttpsError('permission-denied','É necessária permissão de Pedidos e Financeiro nesta loja.');
    return actor;
  };
}
function createManualOrderPayment({db,admin,HttpsError,authorize}) {
  const fail=(code,message)=>{throw new HttpsError(code,message);};
  return async request=>{
    const d=request.data||{},fields=['storeId','orderId','requestId','expectedRevision','expectedTotalCents','methodLabel','confirmed'];
    if(Object.keys(d).some(k=>!fields.includes(k))||!validId(d.storeId)||!validId(d.orderId)||!/^[a-zA-Z0-9_-]{16,80}$/.test(d.requestId||''))fail('invalid-argument','Operação de recebimento inválida.');
    const actor=await authorize(request.auth?.uid,d.storeId);
    if(d.confirmed!==true||!Number.isSafeInteger(d.expectedRevision)||d.expectedRevision<0||!Number.isSafeInteger(d.expectedTotalCents)||d.expectedTotalCents<0)fail('invalid-argument','Confirme explicitamente o valor integral recebido.');
    const choice=Object.hasOwn(fiscalChoices,d.methodLabel)&&fiscalChoices[d.methodLabel];if(!choice)fail('invalid-argument','Selecione a forma real de pagamento.');
    const ref=db.doc(`lojas/${d.storeId}/pedidos/${d.orderId}`),eventRef=ref.collection('auditEvents').doc(d.requestId);
    const fingerprint=createHash('sha256').update(JSON.stringify({uid:actor.uid,storeId:d.storeId,orderId:d.orderId,revision:d.expectedRevision,amount:d.expectedTotalCents,method:d.methodLabel})).digest('hex');
    return db.runTransaction(async tx=>{
      const [snapshot,priorEvent,latestAudit]=await Promise.all([tx.get(ref),tx.get(eventRef),tx.get(ref.collection('auditEvents').orderBy('revision','desc').limit(1))]);
      if(!snapshot.exists)fail('not-found','Pedido não encontrado.');
      if(priorEvent.exists){if(priorEvent.get('action')!=='ORDER_PAYMENT_RECEIVED'||priorEvent.get('actorUid')!==actor.uid||priorEvent.get('requestFingerprint')!==fingerprint)fail('already-exists','Identificador já utilizado em outra operação.');return {ok:true,duplicate:true,revision:priorEvent.get('revision')};}
      const order=snapshot.data();
      if((order.lojaId&&order.lojaId!==d.storeId)||(order.storeId&&order.storeId!==d.storeId))fail('failed-precondition','A loja do pedido está inconsistente.');
      if(order.paymentMode!=='AGREED_LATER'||order.paymentId||order.paymentMethodSource?.startsWith('provider/'))fail('failed-precondition','Esta ação é exclusiva para pagamento a combinar, sem cobrança online.');
      if(order.status!=='Finalizado'&&order.order_status!=='DELIVERED')fail('failed-precondition','Finalize o pedido antes de registrar o recebimento neste fluxo.');
      if(['Cancelado','CANCELLED','CANCELED','REFUNDED','Reserva expirada'].includes(order.status)||['CANCELED','CANCELLED','EXPIRED','REFUNDED'].includes(order.order_status)||order.requiresReview||order.adminPaymentAdjustment?.state==='REVIEW_REQUIRED')fail('failed-precondition','Concilie o pedido antes de registrar o recebimento.');
      const states=[order.payment_status,order.paymentStatus,order.statusPagamento].filter(v=>v!=null&&v!=='').map(v=>String(v).toUpperCase());
      const amount=cents(order.total);
      if((typeof order.total!=='number'&&typeof order.total!=='string')||String(order.total).trim()===''||!Number.isFinite(Number(order.total))||Number(order.total)<0||!Number.isSafeInteger(amount)||amount!==d.expectedTotalCents)fail('failed-precondition','O total do pedido mudou ou é inválido. Reabra a confirmação.');
      if(order.manualPaymentReceipt&&states.length>0&&states.every(s=>s==='PAID')){
        if(order.manualPaymentReceipt.amountCents!==amount||order.manualPaymentReceipt.method!==choice.method||order.manualPaymentReceipt.methodCode!==choice.code)fail('failed-precondition','O recebimento existente exige conciliação.');
        return {ok:true,duplicate:true,revision:order.adminRevision||0};
      }
      if(states.some(s=>!['PENDING','PENDENTE','UNKNOWN','PENDING_SELECTION'].includes(s))||order.manualPaymentReceipt)fail('failed-precondition','O pagamento já foi confirmado ou possui estado incompatível.');
      if(Number(order.adminRevision||0)!==d.expectedRevision)fail('aborted','O pedido mudou em outra sessão. Reabra a confirmação.');
      if(order.paymentMethod&&(order.paymentMethod!==choice.method||(order.fiscalPaymentCode&&order.fiscalPaymentCode!==choice.code)))fail('failed-precondition','O método já definido deve ser preservado. Revise o pedido antes do recebimento.');
      const methodChanged=!order.paymentMethod||order.paymentMethod!==choice.method||order.fiscalPaymentCode!==choice.code;
      if(methodChanged){
        const invoices=await tx.get(db.collection(`lojas/${d.storeId}/invoices`).where('orderId','==',d.orderId).limit(25));
        if(order.fiscal?.authorizedInvoiceId||order.fiscal?.invoiceInProgressId||['authorized','cancelled','validating','pending_return'].includes(order.fiscal?.lastInvoiceStatus)||invoices.size===25||invoices.docs.some(i=>['authorized','cancelled','validating','pending_return'].includes(i.get('status'))))fail('failed-precondition','O método fiscal está protegido. Concilie a nota antes de registrar outro método.');
      }
      // Existing reports recognize receipts from the order. Do not create a second financial entry.
      for(const field of ['pedidoId','orderId']){
        const linked=await tx.get(db.collection(`lojas/${d.storeId}/contas_a_receber`).where(field,'==',d.orderId).limit(1));
        if(!linked.empty)fail('failed-precondition','Já existe lançamento financeiro vinculado. Concilie o lançamento existente para evitar duplicidade.');
      }
      const timestamp=admin.firestore.FieldValue.serverTimestamp(),revision=Number(order.adminRevision||0)+1;
      const receipt={schemaVersion:1,amountCents:amount,method:choice.method,methodCode:choice.code,actorUid:actor.uid,source:'CRM_MANUAL_PAYMENT_RECEIPT',auditEventId:d.requestId,receivedAt:timestamp};
      const patch={paymentStatus:'PAID',paidAt:timestamp,manualPaymentReceipt:receipt,adminRevision:revision,updatedAt:timestamp};
      for(const field of ['payment_status','statusPagamento'])if(Object.hasOwn(order,field))patch[field]='PAID';
      if(!order.paymentMethod)Object.assign(patch,{paymentMethod:choice.method,formaPagamento:d.methodLabel,fiscalPaymentCode:choice.code,paymentMethodSource:'crm/manual-receipt',paymentMethodResolvedAt:timestamp});
      else if(!order.fiscalPaymentCode)patch.fiscalPaymentCode=choice.code;
      const changes=Object.entries(patch).filter(([key])=>!['paidAt','manualPaymentReceipt','adminRevision','updatedAt','paymentMethodResolvedAt'].includes(key)).map(([field,after])=>({field,before:auditValue(order[field]),after}));
      changes.push({field:'valorRecebido',before:null,after:amount/100});
      tx.update(ref,patch);
      tx.create(eventRef,{schemaVersion:1,orderId:d.orderId,storeId:d.storeId,actorUid:actor.uid,actorName:actor.name,actorType:'STAFF',action:'ORDER_PAYMENT_RECEIVED',source:'CRM_MANUAL_PAYMENT_RECEIPT',changes,stockChanges:[],stockAllocationAfter:latestAudit.docs[0]?.get('stockAllocationAfter')||initialAllocation(order),revision,requestFingerprint:fingerprint,createdAt:timestamp});
      return {ok:true,duplicate:false,revision,amountCents:amount};
    });
  };
}
module.exports={createManualOrderPayment,createManualPaymentAuthorizer};
