const {createHash}=require('node:crypto');
const {FieldValue}=require('firebase-admin/firestore');
const {readReservation,settleReservation}=require('./checkout-reservation');
const error=(message,status=409)=>Object.assign(new Error(message),{httpStatus:status});
const digest=value=>createHash('sha256').update(value).digest('hex');
const validId=id=>typeof id==='string' && /^[a-f0-9]{64}$/.test(id);
const validReference=value=>typeof value==='string' && /^[\w-]{1,160}$/.test(value);
function createFinancialEvents({db,admin,provider,verifyApproval,orderIdentity,now=Date.now}) {
  // Existing Rules exclude integrations entirely for clients/Staff. Read/write
  // APIs below apply explicit live Staff capability and store scope instead.
  const root=db.doc('integrations/paymentReconciliation'),operations=root.collection('operations'),matches=root.collection('matches'),reviews=root.collection('reviews');
  const eventsFor=storeId=>root.collection('stores').doc(storeId).collection('events');
  const stamp=()=>FieldValue.serverTimestamp();
  const operationKey=(id,type,transaction,slug)=>digest(JSON.stringify([id,type,transaction,slug]));
  const approvalInput=refs=>({order_nsu:refs.orderNsu,transaction_nsu:refs.transactionNsu,slug:refs.slug});
  async function process(signal) {
    const id=signal.references.orderNsu,paymentRef=db.doc('checkoutPayments/'+id);
    const payment=(await paymentRef.get()).data();if(!payment)throw error('Pedido não encontrado.',404);
    const {storeId,orderId}=orderIdentity(payment),refs=signal.references,event=signal.eventHint,eventRef=eventsFor(storeId).doc(signal.fingerprint);
    const opType={refunded:'REFUND_EXPECTED',canceled:'CANCEL_EXPECTED'}[event];
    const existing=(await eventRef.get()).data();
    if(existing && !opType)return {ok:true,eventDisposition:existing.disposition,duplicate:true};
    let disposition='INFORMATIONAL_UNVERIFIED',approval=null;
    if(event==='paid') {
      approval=await verifyApproval(approvalInput(refs));
      disposition=approval.requiresReview?'APPROVAL_REVIEW_REQUIRED':'APPROVAL_VERIFIED';
    }else if(event==='payment_failed') {
      disposition='FAILED_ATTEMPT_UNVERIFIED';
      if(refs.transactionNsu && refs.slug) {
        const result=await provider.check({handle:payment.handle,...approvalInput(refs)});
        if(result?.success!==true || typeof result.paid!=='boolean')throw error('Consulta de pagamento inconclusiva.',503);
        if(result.paid) {approval=await verifyApproval(approvalInput(refs));disposition=approval.requiresReview?'APPROVAL_REVIEW_REQUIRED':'APPROVAL_VERIFIED';}
        else disposition='FAILED_ATTEMPT_CHECKED';
      }
    }else if(opType) disposition='PENDING_RECONCILIATION';
    const outcome=await db.runTransaction(async tx=>{
      const [currentEvent,currentPayment,match,review]=await Promise.all([tx.get(eventRef),tx.get(paymentRef),tx.get(matches.doc(signal.fingerprint)),tx.get(reviews.doc(signal.fingerprint))]);
      if(!currentPayment.exists)throw error('Pedido não encontrado.',404);
      const p=currentPayment.data();const identity=orderIdentity(p);
      if(identity.storeId!==storeId || p.handle!==payment.handle || p.amount!==payment.amount)throw error('Referência de pagamento mudou.');
      if(match.exists)return {ok:true,eventDisposition:'MATCHED_EXPECTED_OPERATION',duplicate:true};
      if(review.exists)return {ok:true,eventDisposition:'DISMISSED_UNVERIFIED',duplicate:true};
      if(currentEvent.exists && !opType)return {ok:true,eventDisposition:currentEvent.data().disposition,duplicate:true};
      const limitRef=root.collection('eventWriteLimits').doc(id),limit=currentEvent.exists?null:(await tx.get(limitRef)).data();
      let expected=null,opRef=null,order=null,held=null;
      if(opType && refs.transactionNsu && refs.slug) {
        opRef=operations.doc(operationKey(id,opType,refs.transactionNsu,refs.slug));expected=(await tx.get(opRef)).data();
        if(expected?.status==='EXECUTION_RECORDED' && expected.storeId===storeId && expected.provider==='infinitepay' && expected.handle===p.handle && expected.amount===p.amount && expected.executionConfirmed===true) {
          order=await tx.get(db.doc(p.orderPath));
          const linked=order.exists && order.data().paymentId===id && (!order.data().lojaId || order.data().lojaId===storeId);
          const refundable=event==='refunded' && p.payment_status==='PAID' && p.transactionNsu===refs.transactionNsu && p.slug===refs.slug;
          const cancelable=event==='canceled' && p.payment_status==='PENDING';
          if(!linked || p.requiresReview || (!refundable && !cancelable))expected=null;
          else if(cancelable)held=await readReservation(tx,db,p);
        }else expected=null;
      }
      // Event documents are immutable. Later reconciliation appends a separate
      // match/audit; the original unsigned notification is never rewritten.
      const sameWindow=limit && now()-limit.windowAt<3600000;
      if(!currentEvent.exists && !expected && sameWindow && limit.count>=100)throw error('Limite temporário de notificações. Tente novamente mais tarde.',503);
      if(!currentEvent.exists)tx.set(limitRef,{windowAt:sameWindow?limit.windowAt:now(),count:(sameWindow?limit.count:0)+1});
      if(!currentEvent.exists)tx.create(eventRef,{provider:'infinitepay',eventType:event,invoiceType:signal.invoiceType,storeId,orderId,paymentId:id,
        orderNsu:id,transactionNsu:refs.transactionNsu,slug:refs.slug,disposition,createdAt:stamp(),receivedAtMs:now()});
      if(!expected)return {ok:true,eventDisposition:currentEvent.data()?.disposition || disposition,...(approval?{payment_status:approval.payment_status,requiresReview:approval.requiresReview}:{}),duplicate:currentEvent.exists};
      const next=event==='refunded'?'REFUNDED':'CANCELLED';
      if(event==='canceled')settleReservation(tx,db,admin,held,false);
      tx.update(paymentRef,{payment_status:next,financialOperationId:opRef.id,financialOperationAt:stamp(),
        ...(held?{'reservation.state':'RELEASED'}:{})});
      tx.update(order.ref,{payment_status:next,financialOperationId:opRef.id,
        ...(event==='canceled'?{order_status:'CANCELLED',status:'Cancelado'}:{})});
      tx.update(opRef,{status:'MATCHED',matchedAt:stamp(),matchedEventId:signal.fingerprint});
      tx.create(matches.doc(signal.fingerprint),{operationId:opRef.id,eventId:signal.fingerprint,storeId,paymentId:id,matchedAt:stamp()});
      tx.create(root.collection('ledger').doc(opRef.id),{storeId,orderId,paymentId:id,provider:'infinitepay',type:opType,
        amount:p.amount,previousFinancialState:p.payment_status,financialState:next,actorUid:expected.staffUid,source:'STAFF_RECORDED_EXTERNAL_EXECUTION',createdAt:stamp()});
      tx.create(root.collection('audit').doc(),{action:'EXPECTED_FINANCIAL_OPERATION_MATCHED',storeId,orderId,paymentId:id,actorUid:expected.staffUid,operationId:opRef.id,eventId:signal.fingerprint,before:p.payment_status,after:next,createdAt:stamp()});
      return {ok:true,eventDisposition:'MATCHED_EXPECTED_OPERATION',payment_status:next};
    });
    return outcome;
  }
  async function register({storeId,paymentId,type,transactionNsu,slug,executionConfirmed,executionReference,requestId},actor) {
    if(!actor?.uid || !validId(paymentId) || !['REFUND_EXPECTED','CANCEL_EXPECTED'].includes(type) || !validReference(transactionNsu) || !validReference(slug) || executionConfirmed!==true ||
      typeof executionReference!=='string' || executionReference.trim().length<4 || executionReference.length>160 || /[\p{Cc}<>]/u.test(executionReference) || !/^[\w-]{16,100}$/.test(requestId || '')) throw error('Confirme a execução real na InfinitePay e informe a referência da operação.',400);
    const ref=operations.doc(operationKey(paymentId,type,transactionNsu,slug)),paymentRef=db.doc('checkoutPayments/'+paymentId);
    // For cancellation, paid:false is required in addition to the Staff's
    // explicit execution record. It is not proof of a refund or a cancellation.
    const p=(await paymentRef.get()).data();if(!p || orderIdentity(p).storeId!==storeId)throw error('Pagamento não encontrado.',404);
    if(type==='CANCEL_EXPECTED') {
      const check=await provider.check({handle:p.handle,order_nsu:paymentId,transaction_nsu:transactionNsu,slug});
      if(check?.success!==true || check?.paid!==false)throw error('Pagamento aprovado ou consulta inconclusiva. Não registre como cancelamento.');
    }
    return db.runTransaction(async tx=>{
      const [saved,current]=await Promise.all([tx.get(ref),tx.get(paymentRef)]),d=current.data();
      if(!d || orderIdentity(d).storeId!==storeId || d.handle!==p.handle || d.amount!==p.amount || d.requiresReview)throw error('Pagamento requer análise manual.');
      if(saved.exists) {
        const old=saved.data();if(old.requestId!==requestId || old.staffUid!==actor.uid)throw error('Já existe uma operação registrada para esta transação.');
        return {ok:true,operationId:ref.id,status:old.status,duplicate:true};
      }
      if(type==='REFUND_EXPECTED' ? d.payment_status!=='PAID' || d.transactionNsu!==transactionNsu || d.slug!==slug : d.payment_status!=='PENDING')throw error('Operação incompatível com o pagamento confirmado.');
      const op={type,storeId,orderId:d.orderId,orderNsu:paymentId,paymentId,transactionNsu,slug,provider:'infinitepay',handle:d.handle,amount:d.amount,
        staffUid:actor.uid,actorRole:actor.role,executionConfirmed:true,executionReference:executionReference.trim(),requestId,
        status:'EXECUTION_RECORDED',source:'STAFF_RECORDED_EXTERNAL_EXECUTION',createdAt:stamp(),matchedAt:null};
      tx.create(ref,op);tx.create(root.collection('audit').doc(),{action:'EXPECTED_FINANCIAL_OPERATION_RECORDED',storeId,orderId:d.orderId,paymentId,actorUid:actor.uid,actorRole:actor.role,operationId:ref.id,type,createdAt:stamp()});
      return {ok:true,operationId:ref.id,status:op.status};
    });
  }
  async function list(storeId,cursor=null) {
    let query=eventsFor(storeId).orderBy('receivedAtMs','desc');
    if(cursor) {
      if(!validId(cursor))throw error('Página inválida.',400);
      const previous=await eventsFor(storeId).doc(cursor).get();if(!previous.exists)throw error('Página inválida.',400);
      query=query.startAfter(previous);
    }
    const recent=await query.limit(101).get(),docs=recent.docs.slice(0,100);
    const matched=docs.length?await db.getAll(...docs.map(d=>matches.doc(d.id))):[];
    const reviewed=docs.length?await db.getAll(...docs.map(d=>reviews.doc(d.id))):[];
    const items=docs.map((d,i)=>{const e=d.data();return {id:d.id,eventType:e.eventType,paymentId:e.paymentId,orderId:e.orderId,transactionNsu:e.transactionNsu,slug:e.slug,
      disposition:matched[i].exists?'MATCHED_EXPECTED_OPERATION':reviewed[i].exists?'DISMISSED_UNVERIFIED':e.disposition,createdAt:e.createdAt?.toDate?.().toISOString() || null};});
    return {events:items,nextCursor:recent.size>100?docs.at(-1).id:null};
  }
  async function reconcileEvent(storeId,eventId) {
    if(!validId(eventId))throw error('Evento inválido.',400);
    const e=(await eventsFor(storeId).doc(eventId).get()).data();if(!e || e.storeId!==storeId)throw error('Evento não encontrado.',404);
    return process({eventHint:e.eventType,fingerprint:eventId,invoiceType:e.invoiceType,references:{orderNsu:e.orderNsu,transactionNsu:e.transactionNsu,slug:e.slug}});
  }
  async function lookup(storeId,paymentId) {
    if(!validId(paymentId))throw error('Pedido inválido.',400);
    const p=(await db.doc('checkoutPayments/'+paymentId).get()).data();if(!p || orderIdentity(p).storeId!==storeId)throw error('Pagamento não encontrado.',404);
    return {payment:{paymentId,orderId:p.orderId,storeId,payment_status:p.payment_status,amount:p.amount,
      transactionNsu:p.transactionNsu || null,slug:p.slug || null,captureMethod:p.captureMethod || null,requiresReview:!!p.requiresReview}};
  }
  async function dismiss(storeId,eventId,reason,actor) {
    if(!actor?.uid || !validId(eventId) || typeof reason!=='string' || reason.trim().length<10 || reason.length>300 || /[\p{Cc}<>]/u.test(reason))throw error('Informe o motivo da revisão, sem dados pessoais.',400);
    return db.runTransaction(async tx=>{
      const [event,match,prior]=await Promise.all([tx.get(eventsFor(storeId).doc(eventId)),tx.get(matches.doc(eventId)),tx.get(reviews.doc(eventId))]);
      if(!event.exists || event.data().storeId!==storeId)throw error('Evento não encontrado.',404);
      if(prior.exists)return {ok:true,duplicate:true};
      if(match.exists || !['PENDING_RECONCILIATION','FAILED_ATTEMPT_UNVERIFIED','INFORMATIONAL_UNVERIFIED'].includes(event.data().disposition))throw error('Este evento não pode ser descartado por esta ação.');
      const record={storeId,eventId,paymentId:event.data().paymentId,reason:reason.trim(),actorUid:actor.uid,actorRole:actor.role,createdAt:stamp()};
      tx.create(reviews.doc(eventId),record);tx.create(root.collection('audit').doc(),{...record,action:'UNVERIFIED_FINANCIAL_EVENT_DISMISSED'});
      return {ok:true};
    });
  }
  return {process,register,list,reconcileEvent,lookup,dismiss};
}
module.exports={createFinancialEvents};
