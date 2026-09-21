const crypto = require('node:crypto');
const {readReservation, settleReservation, operationalState} = require('./checkout-reservation');
function paymentError(message, httpStatus = 409) {return Object.assign(new Error(message), {httpStatus});}
const cents = value => {const n = Math.round(Number(value)*100);if (!Number.isSafeInteger(n) || n <= 0) throw paymentError('Valor de pagamento inválido.',400);return n;};
function assertPaid(result, expectedAmount) {
  if (result?.success !== true || result?.paid !== true) throw paymentError('Pagamento ainda não confirmado.');
  if (!Number.isSafeInteger(result.amount) || result.amount !== expectedAmount || !Number.isSafeInteger(result.paid_amount) || result.paid_amount < expectedAmount) throw paymentError('Valor recebido não corresponde ao pedido.');
  if (!['pix','credit_card'].includes(result.capture_method)) throw paymentError('Forma de pagamento não reconhecida.');
}
class InfinitePayProvider {
  constructor({fetchImpl = fetch} = {}) {this.fetch = fetchImpl;}
  async post(path, body) {
    const response = await this.fetch(`https://api.checkout.infinitepay.io/${path}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw paymentError('A InfinitePay não respondeu. Consulte o pedido antes de tentar novamente.',502);
    return response.json();
  }
  create(payload) {return this.post('links', payload);}
  check(payload) {return this.post('payment_check',payload);}
}
function createPaymentService({db, admin, provider = new InfinitePayProvider(), now = Date.now}) {
  const payments = db.collection('checkoutPayments');
  const timestamp = () => admin.firestore.FieldValue.serverTimestamp();
  async function config(store) {
    const snap = await db.doc(`lojas/${store}/configuracoesInternas/infinitepay`).get();
    const c = snap.data();
    if (c?.enabled !== true || !/^[a-zA-Z0-9_-]{2,80}$/.test(c.handle || '')) throw paymentError('Pagamento online ainda não habilitado nesta loja.',503);
    const redirect = new URL(c.redirectUrl);
    const webhook = new URL(c.webhookUrl);
    if (redirect.protocol !== 'https:' || webhook.protocol !== 'https:') throw paymentError('Configuração de pagamento inválida.',503);
    return {handle:c.handle,redirectUrl:redirect.href,webhookUrl:webhook.href};
  }
  async function start(paymentId, ownerUid) {
    const ref=payments.doc(paymentId);
    await expire(paymentId);
    const payment = await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);const p=snap.data();
      if (!p || p.ownerUid !== ownerUid) throw paymentError('Pedido não encontrado.',404);
      if(p.payment_status !== 'PENDING' && p.payment_status !== 'PAID') throw paymentError('Reserva encerrada. Consulte a loja antes de pagar.');
      if(p.checkoutUrl || p.payment_status === 'PAID') return p;
      if(p.linkState) throw paymentError('Pedido aguardando conciliação. Não refaça a compra; consulte a loja.');
      tx.update(ref,{linkState:'CREATING',updatedAt:timestamp()});return p;
    });
    if(payment.checkoutUrl || payment.payment_status === 'PAID') return {id:payment.orderId, payment_status:payment.payment_status,checkoutUrl:payment.checkoutUrl || null,paymentId};
    try {
      const data=await provider.create({handle:payment.handle,order_nsu:paymentId,
        items:[{quantity:1,price:payment.amount,description:`Pedido ${payment.orderId} - ${payment.storeId}`}],
        customer:payment.customer, ...(payment.address ? {address:payment.address} : {}),
        redirect_url:payment.redirectUrl,webhook_url:payment.webhookUrl});
      const url=new URL(data.url);
      if(url.protocol!=='https:' || !(url.hostname==='infinitepay.io' || url.hostname.endsWith('.infinitepay.io'))) throw paymentError('Link de pagamento inválido.',502);
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
    const id=String(input.order_nsu || '');
    if(!/^[a-f0-9]{64}$/.test(id) || !/^[\w-]{1,160}$/.test(input.transaction_nsu || '') || !/^[\w-]{1,160}$/.test(input.invoice_slug || input.slug || '')) throw paymentError('Notificação inválida.',400);
    const ref=payments.doc(id);const snap=await ref.get();const payment=snap.data();
    if(!payment) throw paymentError('Pedido não encontrado.',404);
    // Webhook and browser parameters are hints only. Re-query the provider with stored merchant/order.
    const result=await provider.check({handle:payment.handle,order_nsu:id,transaction_nsu:input.transaction_nsu,slug:input.invoice_slug || input.slug});
    assertPaid(result,payment.amount);
    const receiptRef=db.collection('checkoutReceipts').doc(crypto.createHash('sha256').update(`${payment.handle}:${input.transaction_nsu}`).digest('hex'));
    await db.runTransaction(async tx=>{
      const [latest, receipt, order] = await Promise.all([tx.get(ref),tx.get(receiptRef),tx.get(db.doc(payment.orderPath))]);
      if(receipt.exists && receipt.data().paymentId !== id) throw paymentError('Transação já associada a outro pedido.');
      if(latest.data()?.payment_status==='PAID') return;
      if(!order.exists || cents(order.data().total) !== payment.amount) throw paymentError('Pedido requer conciliação manual.');
      const current=latest.data();
      const held=await readReservation(tx,db,current);
      const requiresReview=order.data().order_status!=='PENDING' || current.payment_status!=='PENDING' ||
        !!(current.reservation && current.reservation.state!=='HELD') ||
        !!(current.expiresAt && current.expiresAt.toMillis()<=now());
      settleReservation(tx,db,admin,held,!requiresReview);
      tx.set(receiptRef,{paymentId:id,createdAt:timestamp()});
      tx.update(ref,{payment_status:'PAID',requiresReview,transactionNsu:input.transaction_nsu,slug:input.invoice_slug || input.slug,paidAt:timestamp(),
        ...(held ? {'reservation.state':requiresReview?'RELEASED':'CONSUMED'} : {})});
      tx.update(order.ref,{payment_status:'PAID',requiresReview,order_status:requiresReview?'CANCELLED':'CONFIRMED',status:requiresReview?'Pagamento em conferência':'Pendente',formaPagamento:result.capture_method==='pix'?'Pix online':'Cartão online',paidAt:timestamp()});
    });
    return {ok:true,payment_status:'PAID'};
  }
  async function status(id,uid) {
    if(!/^[a-f0-9]{64}$/.test(id)) throw paymentError('Pedido inválido.',400);
    let p=(await payments.doc(id).get()).data();
    if(!p || p.ownerUid!==uid) throw paymentError('Pedido não encontrado.',404);
    await expire(id);
    p=(await payments.doc(id).get()).data();
    return {id:p.orderId,payment_status:p.payment_status,checkoutUrl:p.payment_status==='PENDING' ? p.checkoutUrl || null : null,requiresReview:!!p.requiresReview || p.linkState==='RECONCILIATION_REQUIRED'};
  }
  async function expire(id) {
    return db.runTransaction(async tx => {
      const ref=payments.doc(id);const p=(await tx.get(ref)).data();
      if(!p || p.payment_status!=='PENDING' || p.reservation?.state!=='HELD' || !p.expiresAt || p.expiresAt.toMillis()>now()) return false;
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
