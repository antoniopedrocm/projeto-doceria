const crypto = require('node:crypto');
const {FieldValue} = require('firebase-admin/firestore');
const {readReservation, settleReservation, operationalState} = require('./checkout-reservation');
const logger = require('firebase-functions/logger');
const {readErrorBody, diagnostic} = require('./infinitepay-diagnostics');
const {inspectPaymentSignal} = require('./payment-signal-policy');
function paymentError(message, httpStatus = 409) {return Object.assign(new Error(message), {httpStatus});}
const cents = value => {const n = Math.round(Number(value)*100);if (!Number.isSafeInteger(n) || n <= 0) throw paymentError('Valor de pagamento inválido.',400);return n;};
function assertPaid(result, expectedAmount) {
  if (result?.success !== true || result?.paid !== true) throw paymentError('Pagamento ainda não confirmado.');
  if (!Number.isSafeInteger(result.amount) || result.amount !== expectedAmount || !Number.isSafeInteger(result.paid_amount) || result.paid_amount < expectedAmount) throw paymentError('Valor recebido não corresponde ao pedido.');
  if (!['pix','credit_card'].includes(result.capture_method)) throw paymentError('Forma de pagamento não reconhecida.');
}
function orderIdentity(payment) {
  const path = /^lojas\/([^/]+)\/pedidos\/([^/]+)$/.exec(payment.orderPath || '');
  // Older records can derive identity from their canonical path, never another store.
  if (!path || (payment.storeId != null && payment.storeId !== path[1]) ||
      (payment.orderId != null && payment.orderId !== path[2])) {
    throw paymentError('Pedido requer conciliação manual.');
  }
  return {storeId: path[1], orderId: path[2]};
}
class InfinitePayProvider {
  constructor({fetchImpl = fetch, logError = entry => logger.error('InfinitePay request failed', entry)} = {}) {
    this.fetch = fetchImpl;
    this.logError = logError;
  }
  async post(path, body) {
    let response;
    const record = details => {
      // Logging failures must not retry the request or expose upstream exceptions.
      try {this.logError(diagnostic({path, body, response, ...details}));} catch (_) { /* controlled error below */ }
    };
    try {
      response = await this.fetch(`https://api.checkout.infinitepay.io/${path}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    } catch (error) {
      record({kind:'network_error',error});
      throw paymentError('A InfinitePay não respondeu. Consulte o pedido antes de tentar novamente.',path === 'links' ? 502 : 500);
    }
    if (!response.ok) {
      let sample;
      let error;
      try {sample = await readErrorBody(response);} catch (readError) {error = readError;}
      record({kind:'http_error',sample,error});
      throw paymentError('A InfinitePay não respondeu. Consulte o pedido antes de tentar novamente.',502);
    }
    try {return await response.json();} catch (error) {
      record({kind:'invalid_response',error});
      throw paymentError('A InfinitePay não respondeu. Consulte o pedido antes de tentar novamente.',path === 'links' ? 502 : 500);
    }
  }
  create(payload) {return this.post('links', payload);}
  check(payload) {return this.post('payment_check',payload);}
}
function createPaymentService({db, admin, provider = new InfinitePayProvider(), now = Date.now,
  auditSignal = entry => logger.warn('Checkout payment signal held', entry)}) {
  const payments = db.collection('checkoutPayments');
  const timestamp = () => FieldValue.serverTimestamp();
  async function config(store) {
    const snap = await db.doc(`lojas/${store}/configuracoesInternas/infinitepay`).get();
    const c = snap.data();
    if (c?.enabled !== true || !/^[a-zA-Z0-9_-]{2,80}$/.test(c.handle || '')) throw paymentError('Pagamento online ainda não habilitado nesta loja.',503);
    const redirect = new URL(c.redirectUrl);
    const webhook = new URL(c.webhookUrl);
    if (redirect.protocol !== 'https:' || webhook.protocol !== 'https:') throw paymentError('Configuração de pagamento inválida.',503);
    return {handle:c.handle,redirectUrl:redirect.href,webhookUrl:webhook.href,sendCustomerData:c.sendCustomerData!==false,sendDeliveryAddress:c.sendDeliveryAddress!==false};
  }
  async function start(paymentId, ownerUid) {
    const ref=payments.doc(paymentId);
    await expire(paymentId);
    const payment = await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);const p=snap.data();
      if (!p || p.ownerUid !== ownerUid) throw paymentError('Pedido não encontrado.',404);
      // Historical payments predate checkout selection. New records must carry
      // the server-established assurance; a Firebase token alone cannot upgrade it.
      if(p.checkoutIdentity) {
        const identity=p.checkoutIdentity;
        if(identity.mode!=='strong_auth' || !/^checkoutPayments\/_identity\/contexts\/[a-f0-9]{64}$/.test(identity.contextPath || '')) throw paymentError('Para pagar online, entre com Google ou e-mail.',403);
        const context=(await tx.get(db.doc(identity.contextPath))).data();
        if(!context || context.mode!=='strong_auth' || context.ownerUid!==ownerUid || context.customerId!==identity.customerId ||
          context.storeId!==p.storeId || context.revision!==identity.revision || context.expiresAt<=now()) throw paymentError('Para pagar online, entre com Google ou e-mail.',403);
      }
      if(p.requiresReview || (p.payment_status !== 'PENDING' && p.payment_status !== 'PAID')) throw paymentError('Pedido aguardando conciliação. Consulte a loja antes de pagar.');
      if(p.checkoutUrl || p.payment_status === 'PAID') return p;
      if(p.linkState) throw paymentError('Pedido aguardando conciliação. Não refaça a compra; consulte a loja.');
      tx.update(ref,{linkState:'CREATING',updatedAt:timestamp()});return p;
    });
    if(payment.checkoutUrl || payment.payment_status === 'PAID') return {id:payment.orderId, payment_status:payment.payment_status,checkoutUrl:payment.checkoutUrl || null,paymentId};
    try {
      const data=await provider.create({handle:payment.handle,order_nsu:paymentId,
        items:[{quantity:1,price:payment.amount,description:`Pedido ${payment.orderId} - ${payment.storeId}`}],
        ...(payment.customer ? {customer:payment.customer} : {}), ...(payment.address ? {address:payment.address} : {}),
        redirect_url:payment.redirectUrl,webhook_url:payment.webhookUrl});
      const url=new URL(data.url);
      if(url.protocol!=='https:' || url.username || url.password || (url.port && url.port!=='443') ||
        !(url.hostname==='infinitepay.io' || url.hostname.endsWith('.infinitepay.io') || url.hostname==='checkout.infinitepay.com.br')) throw paymentError('Link de pagamento inválido.',502);
      await db.runTransaction(async tx => {
        const latest=(await tx.get(ref)).data();
        if(latest.payment_status!=='PENDING') throw paymentError('Reserva encerrada. Consulte a loja antes de pagar.');
        tx.update(ref,{checkoutUrl:url.href,linkState:'READY',updatedAt:timestamp()});
      });
      return {id:payment.orderId,payment_status:'PENDING',checkoutUrl:url.href,paymentId};
    } catch(e) {
      // Do not repeat an ambiguous creation: a checkout may already exist at the provider.
      await ref.update({linkState:'RECONCILIATION_REQUIRED',updatedAt:timestamp()});throw e;
    }
  }
  async function reconcile(input) {
    const signal=inspectPaymentSignal(input);
    if(signal.action!=='VERIFY_APPROVAL') {
      // Operational audit only: no raw body, IDs, PII, credentials or financial receipt.
      try {await auditSignal({outcome:signal.action==='HOLD'?'UNVERIFIED_PROVIDER_EVENT':'REJECTED_PAYMENT_SIGNAL',
        reason:signal.reason,eventHint:signal.eventHint,correlation:signal.correlation});}
      catch {throw paymentError('Não foi possível registrar a notificação.',503);}
      if(signal.action==='REJECT') throw paymentError('Notificação inválida.',400);
      return {ok:true,eventDisposition:'UNVERIFIED'};
    }
    const {orderNsu:id,transactionNsu,slug}=signal.references;
    const ref=payments.doc(id);const snap=await ref.get();const payment=snap.data();
    if(!payment) throw paymentError('Pedido não encontrado.',404);
    const identity=orderIdentity(payment);
    // Webhook and browser parameters are hints only. Re-query the provider with stored merchant/order.
    const result=await provider.check({handle:payment.handle,order_nsu:id,transaction_nsu:transactionNsu,slug});
    if(result?.success !== true || result?.paid !== true) throw paymentError('Pagamento ainda não confirmado.');
    const receiptRef=db.collection('checkoutReceipts').doc(crypto.createHash('sha256').update(`${payment.handle}:${transactionNsu}`).digest('hex'));
    const paidMatches=(()=>{try {assertPaid(result,payment.amount);return true;} catch {return false;}})();
    const orderRef=db.doc(payment.orderPath);
    const evidence={handle:payment.handle,orderPath:payment.orderPath,transactionNsu,
      slug,amount:Number.isSafeInteger(result.amount)?result.amount:null,
      paidAmount:Number.isSafeInteger(result.paid_amount)?result.paid_amount:null,
      captureMethod:typeof result.capture_method==='string'?result.capture_method:null};
    return db.runTransaction(async tx=>{
        const [latest,receipt,order]=await Promise.all([tx.get(ref),tx.get(receiptRef),tx.get(orderRef)]);
        const current=latest.data();
        if(!current || current.handle!==payment.handle || current.amount!==payment.amount || current.orderPath!==payment.orderPath ||
          current.storeId!==payment.storeId || current.orderId!==payment.orderId || current.ownerUid!==payment.ownerUid) throw paymentError('Pedido requer conciliação manual.');
        if(receipt.exists && receipt.data().paymentId!==id) throw paymentError('Transação já associada a outro pedido.');
        if(receipt.exists) return {ok:true,payment_status:current.payment_status,requiresReview:!!current.requiresReview};
        const duplicate=current.payment_status==='PAID' && current.transactionNsu!==transactionNsu;
        const linkedOrder=order.exists &&
          (order.data().paymentId == null || order.data().paymentId === id) &&
          (order.data().lojaId == null || order.data().lojaId === identity.storeId) &&
          (order.data().storeId == null || order.data().storeId === identity.storeId) &&
          (order.data().ownerUid == null || order.data().ownerUid === current.ownerUid);
        const invalidOrder=!order.exists || !Number.isFinite(Number(order.data().total)) || Math.round(Number(order.data().total)*100)!==payment.amount;
        const reviewReason=!paidMatches?'PROVIDER_PAYMENT_MISMATCH':duplicate?'DUPLICATE_PROVIDER_TRANSACTION':
          !linkedOrder?'ORDER_PAYMENT_LINK_MISMATCH':invalidOrder?'ORDER_MISSING_OR_AMOUNT_CHANGED':
          current.payment_status==='REFUNDED'?'PAYMENT_ALREADY_REFUNDED':null;
        if(reviewReason) {
          tx.create(receiptRef,{paymentId:id,...evidence,outcome:'REVIEW',reason:reviewReason,createdAt:timestamp()});
          tx.update(ref,{requiresReview:true,reviewReason,linkState:'RECONCILIATION_REQUIRED',updatedAt:timestamp()});
          // Never mutate an order belonging to another payment, owner or store.
          if(linkedOrder) tx.update(orderRef,{requiresReview:true});
          return {ok:true,payment_status:current.payment_status,requiresReview:true};
        }
        if(current.payment_status==='PAID') return {ok:true,payment_status:'PAID',requiresReview:!!current.requiresReview};
        let held;
        try {held=await readReservation(tx,db,current);} catch {
          tx.create(receiptRef,{paymentId:id,...evidence,outcome:'REVIEW',reason:'RESERVATION_INCONSISTENT',createdAt:timestamp()});
          tx.update(ref,{requiresReview:true,reviewReason:'RESERVATION_INCONSISTENT',linkState:'RECONCILIATION_REQUIRED',updatedAt:timestamp()});
          tx.update(orderRef,{requiresReview:true});
          return {ok:true,payment_status:current.payment_status,requiresReview:true};
        }
        const requiresReview=!!current.requiresReview || !!order.data().requiresReview || order.data().order_status!=='PENDING' || current.payment_status!=='PENDING' ||
          !!(current.reservation && current.reservation.state!=='HELD') ||
          !!(current.expiresAt && current.expiresAt.toMillis()<=now());
        settleReservation(tx,db,admin,held,!requiresReview);
        tx.create(receiptRef,{paymentId:id,...evidence,outcome:requiresReview?'REVIEW':'CONFIRMED',createdAt:timestamp()});
        tx.update(ref,{payment_status:'PAID',requiresReview,transactionNsu,slug,paidAt:timestamp(),
          ...(held ? {'reservation.state':requiresReview?'RELEASED':'CONSUMED'} : {})});
        tx.update(order.ref,{payment_status:'PAID',requiresReview,order_status:requiresReview?'CANCELLED':'CONFIRMED',status:requiresReview?'Pagamento em conferência':'Pendente',formaPagamento:result.capture_method==='pix'?'Pix online':'Cartão online',paidAt:timestamp()});
        return {ok:true,payment_status:'PAID',requiresReview};
    });
  }
  async function status(id,uid) {
    if(!/^[a-f0-9]{64}$/.test(id)) throw paymentError('Pedido inválido.',400);
    let p=(await payments.doc(id).get()).data();
    if(!p || p.ownerUid!==uid) throw paymentError('Pedido não encontrado.',404);
    await expire(id);
    p=(await payments.doc(id).get()).data();
    const requiresReview=!!p.requiresReview || p.linkState==='RECONCILIATION_REQUIRED';
    return {id:p.orderId,payment_status:p.payment_status,checkoutUrl:p.payment_status==='PENDING' && !requiresReview ? p.checkoutUrl || null : null,requiresReview};
  }
  async function expire(id) {
    return db.runTransaction(async tx => {
      const ref=payments.doc(id);const p=(await tx.get(ref)).data();
      if(!p || p.requiresReview || p.payment_status!=='PENDING' || p.reservation?.state!=='HELD' || !p.expiresAt || p.expiresAt.toMillis()>now()) return false;
      const order=await tx.get(db.doc(p.orderPath));
      if(!order.exists || order.data().order_status!=='PENDING') throw paymentError('Pedido requer conciliação manual.');
      const held=await readReservation(tx,db,p);
      settleReservation(tx,db,admin,held,false);
      tx.update(ref,{payment_status:'EXPIRED','reservation.state':'RELEASED',expiredAt:timestamp()});
      tx.update(order.ref,{payment_status:'EXPIRED',order_status:'CANCELLED',status:'Reserva expirada',expiredAt:timestamp()});
      return true;
    });
  }
  async function expireDue() {
    const query=payments.where('payment_status','==','PENDING').where('expiresAt','<=',admin.firestore.Timestamp.fromMillis(now())).orderBy('expiresAt').limit(100);
    const results=[];let cursor;
    // Advance past failures too, so one damaged reservation cannot block later pages.
    while(true) {
      const due=await (cursor?query.startAfter(cursor):query).get();
      if(due.empty) break;
      results.push(...await Promise.all(due.docs.map(async doc => {
        try {return {id:doc.id,expired:await expire(doc.id)};} catch {return {id:doc.id,error:true};}
      })));
      cursor=due.docs[due.docs.length-1];
      if(due.size<100) break;
    }
    return results;
  }
  async function syncOrderStatus(orderPath) {
    await db.runTransaction(async tx => {
      const ref=db.doc(orderPath);const order=(await tx.get(ref)).data();
      if(!order?.paymentId || order.payment_status!=='PAID' || order.requiresReview) return;
      const next=operationalState(order.status);
      if(!next || next===order.order_status) return;
      const paymentRef=payments.doc(order.paymentId);
      const payment=(await tx.get(paymentRef)).data();
      if(payment?.orderPath!==orderPath || payment.payment_status!=='PAID') throw paymentError('Pedido requer conciliação manual.');
      tx.update(ref,{order_status:next,...(next==='CANCELLED'?{requiresReview:true}:{})});
      // Cancelling a paid order is not proof of refund and does not release consumed stock.
      if(next==='CANCELLED') tx.update(paymentRef,{requiresReview:true,reviewReason:'PAID_ORDER_CANCELLED'});
    });
  }
  return {config,start,reconcile,status,expire,expireDue,syncOrderStatus};
}
module.exports={InfinitePayProvider,createPaymentService,assertPaid,cents,paymentError};
