// Financial contracts use real local transactions and synthetic provider responses.
// No real charge/refund, credentials or remote Firebase project is involved.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-doceria-checkout';
const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const admin = require('firebase-admin');
const {createPaymentService} = require('./checkout-payment');
const app = admin.initializeApp({projectId: 'demo-doceria-checkout'}, 'financial-contract-tests');
const db = app.firestore();
after(() => app.delete());
const data = async ref => (await ref.get()).data();

async function fixture(name) {
  const id = crypto.createHash('sha256').update('financial-contract-' + name).digest('hex');
  const storeId = 'financial-contract-store';
  const order = db.doc(`lojas/${storeId}/pedidos/${id}`);
  const product = db.doc(`lojas/${storeId}/produtos/${id}`);
  const payment = db.doc(`checkoutPayments/${id}`);
  await Promise.all([
    product.set({estoque: 8}),
    order.set({lojaId: storeId, paymentId: id, ownerUid: 'contract-owner', total: 10,
      order_status: 'PENDING', payment_status: 'PENDING', status: 'Aguardando pagamento'}),
    payment.set({storeId, orderId: id, orderPath: order.path, ownerUid: 'contract-owner',
      handle: 'contract-merchant', amount: 1000, payment_status: 'PENDING',
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 600000),
      reservation: {state: 'HELD', stock: [{path: product.path, quantity: 2}]}}),
  ]);
  const payload = {order_nsu: id, transaction_nsu: name, invoice_slug: 'invoice-' + name};
  const paid = {success: true, paid: true, amount: 1000, paid_amount: 1000, capture_method: 'pix'};
  const calls = [];
  const serviceFor = result => createPaymentService({db, admin, provider: {check: async input => {
    calls.push(input);
    if (result instanceof Error) throw result;
    return result;
  }}});
  return {id, storeId, order, product, payment, payload, paid, calls, serviceFor,
    receipts: () => db.collection('checkoutReceipts').where('paymentId', '==', id).get()};
}

test('stored storeId and canonical order path must agree before querying provider', async () => {
  const f = await fixture('cross-store');
  await f.payment.update({storeId: 'different-store'});
  const before = await data(f.order);
  await assert.rejects(() => f.serviceFor(f.paid).reconcile(f.payload), {httpStatus: 409});
  assert.equal(f.calls.length, 0);
  assert.deepEqual(await data(f.order), before);
  assert.equal((await data(f.product)).estoque, 8);
});

test('a same-value order linked to another payment is not confirmed or modified', async () => {
  const f = await fixture('wrong-order-link');
  await f.order.update({paymentId: 'another-payment'});
  const before = await data(f.order);
  const result = await f.serviceFor(f.paid).reconcile(f.payload);
  assert.equal(result.requiresReview, true);
  assert.equal(result.payment_status, 'PENDING');
  assert.deepEqual(await data(f.order), before);
  assert.equal((await data(f.payment)).reservation.state, 'HELD');
  assert.equal((await f.receipts()).size, 1);
});

test('old approval evidence never downgrades an internally recorded REFUNDED payment to PAID', async () => {
  const f = await fixture('old-approval-after-refund');
  // A historical internal state, not a claim that the provider emits a refund event.
  await f.payment.update({payment_status: 'REFUNDED', 'reservation.state': 'CONSUMED'});
  await f.order.update({payment_status: 'REFUNDED', order_status: 'CANCELLED', status: 'Cancelado'});
  const result = await f.serviceFor(f.paid).reconcile(f.payload);
  assert.equal(result.payment_status, 'REFUNDED');
  assert.equal(result.requiresReview, true);
  assert.equal((await data(f.order)).payment_status, 'REFUNDED');
  assert.equal((await data(f.order)).order_status, 'CANCELLED');
  assert.equal((await data(f.product)).estoque, 8);
  assert.equal((await f.receipts()).size, 1);
});

test('unconfirmed, unknown or errored responses never invent FAILED or REFUNDED', async () => {
  const f = await fixture('unconfirmed');
  const before = await data(f.payment);
  for (const result of [{success: true, paid: false}, {success: false, paid: true},
    {status: 'FAILED'}, {status: 'REFUNDED'}, new Error('synthetic unavailable provider')]) {
    await assert.rejects(() => f.serviceFor(result).reconcile(f.payload));
    assert.deepEqual(await data(f.payment), before);
    assert.equal((await data(f.order)).order_status, 'PENDING');
  }
  assert.equal((await f.receipts()).size, 0);
});

test('webhook and payment-check hints use stored merchant and deduplicate both event orders', async () => {
  for (const source of ['webhook-first', 'check-first']) {
    const f = await fixture(source);
    const service = f.serviceFor(f.paid);
    const hints = {...f.payload, handle: 'untrusted-merchant', amount: 1, storeId: 'untrusted-store'};
    await service.reconcile(hints);
    await service.reconcile(f.payload);
    assert.deepEqual(f.calls[0], {handle: 'contract-merchant', order_nsu: f.id,
      transaction_nsu: f.payload.transaction_nsu, slug: f.payload.invoice_slug});
    assert.equal((await f.receipts()).size, 1);
    assert.equal((await data(f.payment)).reservation.state, 'CONSUMED');
    assert.equal((await data(f.order)).order_status, 'CONFIRMED');
    assert.equal((await data(f.product)).estoque, 8);
  }
});

test('a later unpaid response cannot regress PAID or release consumed stock', async () => {
  const f = await fixture('old-unpaid');
  await f.serviceFor(f.paid).reconcile(f.payload);
  await assert.rejects(() => f.serviceFor({success: true, paid: false}).reconcile(f.payload));
  assert.equal((await data(f.payment)).payment_status, 'PAID');
  assert.equal((await data(f.payment)).reservation.state, 'CONSUMED');
  assert.equal((await data(f.order)).order_status, 'CONFIRMED');
  assert.equal((await f.receipts()).size, 1);
  assert.equal((await data(f.product)).estoque, 8);
});
