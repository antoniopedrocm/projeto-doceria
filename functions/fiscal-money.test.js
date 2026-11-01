const {test} = require('node:test');
const assert = require('node:assert/strict');
const {fiscalCents, draftTotals, allocateFiscalCharge} = require('./fiscal-money');
test('single item freight 300 included exactly once', () => {
  const totals = draftTotals({items: [{quantity: 1, unitPrice: 2025}], freight: 300});
  assert.equal(totals.invoice, 2325);
  assert.deepEqual(allocateFiscalCharge([{total: 2025}], 300), [300]);
});
test('proportional freight and exact residual cents, ignoring zero-value items', () => {
  assert.deepEqual(allocateFiscalCharge([{total: 100}, {total: 200}], 300), [100, 200]);
  assert.deepEqual(allocateFiscalCharge([{total: 1}, {total: 1}, {total: 1}, {total: 0}], .02), [0, 0, .02, 0]);
  for (let cents = 0; cents < 1000; cents++) {
    const allocated = allocateFiscalCharge([{total: 10.01}, {total: 20.03}, {total: 30.07}], cents / 100);
    assert.equal(allocated.reduce((sum, value) => sum + fiscalCents(value), 0), cents);
  }
});
test('zero freight, negatives and missing allocation basis', () => {
  assert.deepEqual(allocateFiscalCharge([{total: 0}], 0), [0]);
  assert.throws(() => allocateFiscalCharge([{total: 10}], -1));
  assert.throws(() => allocateFiscalCharge([{total: 0}], 300));
});
