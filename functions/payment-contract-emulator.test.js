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

// The names are documented; their webhook envelope/signature is not. `event` below
// is deliberately an untrusted extra field, NOT a claimed provider payload schema.
const eventNames = ['created', 'paid', 'settled', 'canceled', 'refunded', 'payment_failed'];
test('documented event names alone have no financial authority', async t => {
  for (const event of eventNames) await t.test(event, async () => {
    const f = await fixture('untrusted-' + event);
    const before = await data(f.payment);
    const orderBefore = await data(f.order);
    const service = f.serviceFor({success: true, paid: false});
    for (let attempt = 0; attempt < 2; attempt++) {
      const run = () => service.reconcile({...f.payload, event,
        paid: true, payment_status: 'REFUNDED', amount: 1000});
      if (event === 'paid') await assert.rejects(run);
      else assert.deepEqual(await run(), {ok: true, eventDisposition: 'UNVERIFIED'});
    }
    assert.deepEqual(await data(f.payment), before);
    assert.deepEqual(await data(f.order), orderBefore);
    assert.equal((await data(f.product)).estoque, 8);
    assert.equal((await f.receipts()).size, 0);
  });
});

test('created then a failed attempt can later reconcile a verified approval once', async () => {
  const f = await fixture('failed-then-retry');
  const unconfirmed = f.serviceFor({success: true, paid: false});
  for (const event of ['created', 'payment_failed', 'payment_failed']) {
    assert.deepEqual(await unconfirmed.reconcile({...f.payload, event}), {ok: true, eventDisposition: 'UNVERIFIED'});
  }
  assert.equal((await f.receipts()).size, 0);
  assert.equal((await data(f.payment)).reservation.state, 'HELD');
  const approved = f.serviceFor(f.paid);
  await approved.reconcile({...f.payload, event: 'paid'});
  await approved.reconcile({...f.payload, event: 'paid'});
  assert.equal((await data(f.payment)).payment_status, 'PAID');
  assert.equal((await data(f.payment)).reservation.state, 'CONSUMED');
  assert.equal((await data(f.order)).order_status, 'CONFIRMED');
  assert.equal((await data(f.product)).estoque, 8); // Already reduced by reservation.
  assert.equal((await f.receipts()).size, 1);
});

test('settled, refund and older event hints neither settle twice nor invent a verified refund', async () => {
  const f = await fixture('post-paid-events');
  const approved = f.serviceFor(f.paid);
  await approved.reconcile({...f.payload, event: 'paid'});
  const before = await data(f.payment);
  const orderBefore = await data(f.order);
  for (const event of ['settled', 'refunded', 'refunded', 'canceled', 'created', 'payment_failed']) {
    // A historical paid:true result is approval evidence, not proof of refund/settlement.
    await approved.reconcile({...f.payload, event});
    assert.deepEqual(await f.serviceFor({success: true, paid: false}).reconcile({...f.payload, event}),
      {ok: true, eventDisposition: 'UNVERIFIED'});
  }
  assert.deepEqual(await data(f.payment), before);
  assert.deepEqual(await data(f.order), orderBefore);
  assert.equal((await data(f.product)).estoque, 8);
  assert.equal((await f.receipts()).size, 1);
});

test('an internally recorded refund stays terminal under repeated old event hints without stock restoration', async () => {
  const f = await fixture('refunded-event-repeats');
  await f.payment.update({payment_status: 'REFUNDED', 'reservation.state': 'CONSUMED'});
  await f.order.update({payment_status: 'REFUNDED', order_status: 'DELIVERED'});
  const approved = f.serviceFor(f.paid);
  for (const event of ['refunded', 'refunded', 'paid', 'settled', 'created', 'payment_failed']) {
    const result = await approved.reconcile({...f.payload, event});
    if (event === 'paid') assert.equal(result.payment_status, 'REFUNDED');
    else assert.equal(result.eventDisposition, 'UNVERIFIED');
  }
  assert.equal((await data(f.order)).order_status, 'DELIVERED');
  assert.equal((await data(f.order)).payment_status, 'REFUNDED');
  assert.equal((await data(f.payment)).reservation.state, 'CONSUMED');
  assert.equal((await data(f.product)).estoque, 8);
  assert.equal((await f.receipts()).size, 1);
});

test('event labels do not replace missing references or identify an unknown order', async () => {
  const f = await fixture('missing-event-refs');
  const approved = f.serviceFor(f.paid);
  for (const event of eventNames) {
    if (event === 'paid') await assert.rejects(() => approved.reconcile({order_nsu: f.id, event}), {httpStatus: 400});
    else assert.equal((await approved.reconcile({order_nsu: f.id, event})).eventDisposition, 'UNVERIFIED');
  }
  await assert.rejects(() => approved.reconcile({...f.payload, order_nsu: '0'.repeat(64)}), {httpStatus: 404});
  assert.equal(f.calls.length, 0);
  assert.equal((await f.receipts()).size, 0);
});

test('a transaction receipt cannot be reused for another order despite a positive provider response', async () => {
  const first = await fixture('receipt-original');
  const second = await fixture('receipt-wrong-order');
  await first.serviceFor(first.paid).reconcile(first.payload);
  const before = await data(second.payment);
  await assert.rejects(() => second.serviceFor(second.paid).reconcile({
    ...second.payload, transaction_nsu: first.payload.transaction_nsu,
  }), {httpStatus: 409});
  assert.deepEqual(await data(second.payment), before);
  assert.equal((await data(second.order)).order_status, 'PENDING');
  assert.equal((await data(second.product)).estoque, 8);
  assert.equal((await second.receipts()).size, 0);
});

test('unverified and unknown hints cannot confirm even when the provider would report paid', async () => {
  const f = await fixture('held-signal-positive-provider');
  const before = await data(f.payment), orderBefore = await data(f.order);
  const audit = [];
  const service = createPaymentService({db, admin, provider: {check: async () => {
    assert.fail('held signals must not query approval');
  }}, auditSignal: entry => audit.push(entry)});
  for (const event of ['refunded', 'canceled', 'payment_failed', 'settled', 'created', 'unknown', 'refunded']) {
    assert.equal((await service.reconcile({...f.payload, event})).eventDisposition, 'UNVERIFIED');
  }
  assert.equal(audit.length, 7);
  assert.deepEqual(await data(f.payment), before);
  assert.deepEqual(await data(f.order), orderBefore);
  assert.equal((await data(f.product)).estoque, 8);
  assert.equal((await f.receipts()).size, 0);
});

test('checkout URL accepts the documented host and rejects lookalikes without a second creation', async () => {
  const urls = ['https://checkout.infinitepay.com.br/link', 'https://buy.infinitepay.io/link',
    'https://infinitepay.io/link', 'https://checkout.infinitepay.com.br.evil.test/link',
    'https://evil.test/infinitepay.io', 'http://checkout.infinitepay.com.br/link',
    'https://user:password@checkout.infinitepay.com.br/link', 'https://checkout.infinitepay.com.br:8443/link'];
  for (let index = 0; index < urls.length; index++) {
    const f = await fixture('checkout-url-' + index);
    let calls = 0;
    const service = createPaymentService({db, admin, provider: {create: async () => {
      calls++; return {url: urls[index]};
    }}});
    if (index < 3) {
      assert.equal((await service.start(f.id, 'contract-owner')).checkoutUrl, urls[index]);
      await service.start(f.id, 'contract-owner');
      assert.equal(calls, 1);
    } else {
      await assert.rejects(() => service.start(f.id, 'contract-owner'), {httpStatus: 502});
      await assert.rejects(() => service.start(f.id, 'contract-owner'), {httpStatus: 409});
      assert.equal(calls, 1);
      assert.equal((await data(f.payment)).linkState, 'RECONCILIATION_REQUIRED');
    }
  }
});
