const {test} = require('node:test');
const assert = require('node:assert/strict');
const {inspectPaymentSignal, PROVIDER_EVENT_NAMES} = require('./payment-signal-policy');
const {createPaymentService} = require('./checkout-payment');
const refs = {order_nsu: 'a'.repeat(64), transaction_nsu: 'transaction', slug: 'invoice'};

test('only valid references permit an independent approval query, never approval itself', () => {
  for (const input of [refs, {...refs, event: 'paid'}, {...refs, type: 'paid'}, {...refs, invoice_slug: 'legacy'}]) {
    const result = inspectPaymentSignal(input);
    assert.equal(result.action, 'VERIFY_APPROVAL');
    assert.deepEqual(result.references, {orderNsu: refs.order_nsu, transactionNsu: 'transaction',
      slug: input.invoice_slug || 'invoice'});
  }
});
test('non-paid, unknown, conflicting and malformed event hints are held without raw data', () => {
  for (const event of [...PROVIDER_EVENT_NAMES.filter(x => x !== 'paid'), 'unknown-sensitive-text', {}, [], null, 7]) {
    const result = inspectPaymentSignal({...refs, event});
    assert.equal(result.action, 'HOLD');
    assert.equal(result.reason, 'UNVERIFIED_PROVIDER_EVENT');
    assert.equal(Object.hasOwn(result, 'references'), false);
    assert.equal(JSON.stringify(result).includes('unknown-sensitive-text'), false);
  }
  assert.equal(inspectPaymentSignal({...refs, event: 'paid', type: 'refunded'}).action, 'HOLD');
  for (const status of ['PENDING', 'FAILED', 'CANCELED', 'REFUNDED']) {
    assert.equal(inspectPaymentSignal({...refs, status}).action, 'HOLD');
  }
});
test('invalid input or references cannot trigger lookup', () => {
  for (const value of [null, [], false, 'body', {}, {...refs, order_nsu: {}},
    {...refs, transaction_nsu: 1}, {...refs, slug: 'x'.repeat(161)}]) {
    assert.equal(inspectPaymentSignal(value).action, 'REJECT');
  }
});
test('audit is sanitized, awaited, and failures do not permit financial work', async () => {
  const entries = [];
  const db = {collection: () => ({doc: () => assert.fail('no database work for held input')})};
  const service = createPaymentService({db, auditSignal: async entry => {entries.push(entry);}});
  const input = {...refs, event: 'private@example.test', token: 'synthetic-secret', customer: {name: 'Private'}};
  assert.deepEqual(await service.reconcile(input), {ok: true, eventDisposition: 'UNVERIFIED'});
  assert.deepEqual(Object.keys(entries[0]).sort(), ['correlation', 'eventHint', 'outcome', 'reason']);
  for (const forbidden of ['private@', 'synthetic-secret', refs.order_nsu, refs.transaction_nsu, 'Private']) {
    assert.equal(JSON.stringify(entries).includes(forbidden), false);
  }
  await assert.rejects(() => service.reconcile(null), {httpStatus: 400});
  const unavailable = createPaymentService({db, auditSignal: async () => {throw new Error('private detail');}});
  await assert.rejects(() => unavailable.reconcile(input), error => error.httpStatus === 503 && !error.message.includes('private'));
});
