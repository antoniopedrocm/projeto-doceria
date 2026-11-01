const {test} = require('node:test');
const assert = require('node:assert/strict');
const {counterId, counterRevision, nextNumberFrom, isFiscalNumber, sequenceContext, invoiceKnowsNumber, rangeBlocksNumber} = require('./fiscal-numbering');
const context = {model: 55, series: 1, environment: 'production', issuerCnpj: '37185245000140'};

test('numbering boundaries, scope, zero series and precise counter revisions', () => {
  for (const invalid of [0, -1, 1.5, NaN, Infinity, '67', true, 1000000000]) assert.equal(isFiscalNumber(invalid), false);
  assert.equal(isFiscalNumber(999999999), true);
  assert.equal(counterId('production', 55, 1), 'production_55_1');
  assert.notEqual(counterId('production', 65, 1), counterId('homologation', 65, 1));
  assert.deepEqual(sequenceContext({cnpj: '37.185.245/0001-40'}, {nfeSeries: 0, environment: 'production'}, 55), {...context, series: 0});
  assert.equal(sequenceContext({}, {environment: 'production'}, 65, 'homologation').environment, 'homologation');
  assert.equal(nextNumberFrom({exists: false}), 1);
  assert.equal(nextNumberFrom({exists: true, get: () => 0}), 0);
  assert.equal(counterRevision({exists: false}), 'missing');
  assert.notEqual(counterRevision({exists: true, updateTime: {seconds: 1, nanoseconds: 1}}), counterRevision({exists: true, updateTime: {seconds: 1, nanoseconds: 2}}));
});

test('known number includes rejected/cancelled attempts, string numbers, keys and explicit historical reservations', () => {
  for (const status of ['authorized', 'rejected', 'cancelled', 'pending_return']) assert.equal(invoiceKnowsNumber({...context, number: '000000067', status}, context, 67), true);
  assert.equal(invoiceKnowsNumber({...context, history: [{action: 'reserved', number: 67}]}, context, 67), true);
  const key = '52241037185245000140550010000000091193246958';
  assert.equal(invoiceKnowsNumber({environment: 'production', key}, context, 9), true);
  assert.equal(invoiceKnowsNumber({environment: 'production', number: 1, issuanceRejection: {xMotivo: `Duplicidade ${key}`}}, context, 9), true);
  assert.equal(invoiceKnowsNumber({environment: 'production', serviceResult: {duplicateIssueResult: {xMotivo: `Duplicidade ${key}`}}}, context, 9), true);
  assert.equal(invoiceKnowsNumber({...context, number: 67, environment: 'homologation'}, context, 67), false);
  assert.equal(invoiceKnowsNumber({...context, number: 67, model: 65}, context, 67), false);
  assert.equal(invoiceKnowsNumber({...context, number: 67, series: 2}, context, 67), false);
  assert.equal(invoiceKnowsNumber({...context, number: null, status: 'draft', clonedFromNumber: 67}, context, 67), false);
});

test('active inutilization ranges block targets only in their own sequence', () => {
  assert.equal(rangeBlocksNumber({...context, status: 'inutilized', start: 67, end: 70}, context, 68), true);
  assert.equal(rangeBlocksNumber({...context, status: 'processing', start: 67, end: 70}, context, 71), false);
  assert.equal(rangeBlocksNumber({...context, model: 65, status: 'inutilized', start: 67, end: 70}, context, 68), false);
});
