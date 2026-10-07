const {test} = require('node:test');
const assert = require('node:assert/strict');
const {cloneEditableForm, draftTotals, editableFromXml} = require('./fiscal-clone');

test('allowlist removes fiscal identities even when nested in editable objects', () => {
  const forbidden = {number: 123, key: 'old-key', protocol: 'old-protocol', receipt: 'old-receipt', status: 'authorized', issuedAt: 'old-date', authorizedAt: 'old-date', authorizedXml: '<NFe/>', signedXml: '<NFe/>', qrCode: 'old-qr', digestValue: 'digest', signature: 'signature', danfe: 'old-danfe', idempotencyKey: 'old-key', requestId: 'old-request', jobId: 'old-job', id: 'old-id', cancelProtocol: 'old-cancel'};
  const form = cloneEditableForm({...forbidden, customer: {...forbidden, name: 'Cliente', address: {...forbidden, zip: '74000000'}}, items: [{...forbidden, description: 'Bolo', quantity: 2, unitPrice: 3.335, tax: {...forbidden, csosn: '102'}}]});
  assert.deepEqual(Object.keys(form).sort(), ['customerMode', 'customer', 'items', 'stockMovementRequested'].sort());
  assert.deepEqual(form.customer, {id: 'old-id', name: 'Cliente', address: {number: 123, zip: '74000000'}}); // editable client linkage and street number only
  assert.deepEqual(form.items[0], {description: 'Bolo', quantity: 2, unitPrice: 3.335, csosn: '102', source: 'snapshot'});
  assert.equal(form.stockMovementRequested, false);
  assert.deepEqual(draftTotals({...form, freight: 2, insurance: 1, other: 0.5, total: 999}), {products: 6.67, discount: 0, freight: 2, insurance: 1, other: 0.5, invoice: 10.17});
});

const xml = require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures/fiscal-clone.xml'), 'utf8');

test('historical XML extracts only editable snapshot and keeps leading zeros', () => {
  const data = editableFromXml(xml);
  const form = cloneEditableForm(data);
  assert.equal(data.model, 55);
  assert.equal(form.customer.name, 'Maria & Filhos');
  assert.equal(form.customer.document, '04312345676');
  assert.equal(form.customer.address.zip, '07400000');
  assert.equal(form.customer.address.complement, 'Sala 2');
  assert.equal(form.items[0].csosn, '102');
  assert.equal(form.items[0].origin, 0);
  assert.equal(form.items[0].cfop, '5101');
  assert.equal(draftTotals(form).invoice, 22);
  assert.doesNotMatch(JSON.stringify(form), /original-key|protocol|signature|999/);
});

test('malformed, oversized, DTD and entity XML are rejected', () => {
  for (const invalid of ['<NFe>', '<root/>', '<!DOCTYPE NFe><NFe/>', '<!ENTITY x "a"><NFe/>', 'x'.repeat(2 * 1024 * 1024 + 1)]) assert.throws(() => editableFromXml(invalid));
});

