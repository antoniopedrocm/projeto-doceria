const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TEMPLATE, buildOrderSummary, createOrderConfirmationPreparer} = require('./whatsapp-order-summary');
const {createWhatsAppService} = require('./whatsapp');
const {DEV_PROJECT_ID} = require('./whatsapp-config');
const {buildCheckoutWhatsApp, CONSENT_VERSION} = require('./whatsapp-checkout');

const savedOrder = () => ({
  lojaId: 'matriz', clienteNome: 'Cliente exemplo', telefone: '(62) 99123-4567',
  itens: [{nome: 'Bolo de chocolate', quantity: 2, preco: 30}, {nome: 'Brigadeiro', quantity: 3, preco: 5}],
  subtotal: 75, desconto: 5, cupom: {codigo: 'PEDIDO5', valorDesconto: 5}, valorFrete: 8,
  total: 78, clienteEndereco: 'Rua Exemplo, 10', formaPagamento: 'Pix', status: 'Pendente',
  observacao: 'Entregar na portaria',
  whatsappConfirmation: buildCheckoutWhatsApp({phone: '(62) 99123-4567',
    consent: {accepted: true, version: CONSENT_VERSION}, serverTimestamp: () => 'SERVER'}),
});
const reference = {storeId: 'matriz', orderId: 'pedido-123'};
const setup = (order = savedOrder(), extra = {}) => {
  const reads = [];
  const preparer = createOrderConfirmationPreparer({
    getProjectId: () => DEV_PROJECT_ID,
    db: {doc: (name) => {reads.push(name); return {get: async () => ({exists: !!order, data: () => order})};}},
    ...extra,
  });
  return {preparer, reads};
};

test('resumo contém dados persistidos e parâmetros posicionais compatíveis', () => {
  const result = buildOrderSummary({orderId: 'pedido-123', order: savedOrder()});
  assert.equal(result.status, 'ready');
  assert.equal(result.bodyParameters.length, 3);
  assert.equal(result.bodyParameters[0], 'pedido-123');
  assert.equal(result.bodyParameters[2], 'R$ 78,00');
  for (const text of ['2x Bolo de chocolate (R$ 30,00 un.)', '3x Brigadeiro',
    'Subtotal: R$ 75,00', 'Desconto (PEDIDO5): R$ 5,00', 'Frete: R$ 8,00',
    'Endereço: Rua Exemplo, 10', 'Pagamento: Pix', 'Status: Pendente', 'Entregar na portaria']) {
    assert.ok(result.preview.includes(text), text);
  }
  assert.equal(/aprovado|pago|promoção/i.test(result.preview), false);
  assert.ok(result.bodyParameters.every((text) => !/[\r\n\t]/.test(text)));
});

test('dados opcionais ausentes não recebem zero ou cadastro substituto', () => {
  const result = buildOrderSummary({orderId: 'abc', order: {
    itens: [{nome: 'Doce', quantity: 1}], total: 10, clienteEndereco: 'Retirar na Loja',
  }});
  assert.equal(result.status, 'ready');
  assert.ok(result.preview.includes('Retirada na loja'));
  assert.equal(/Endereço:|Subtotal:|Frete:|Cliente:|Pagamento:|R\$ 0,00/.test(result.preview), false);
});

test('pedido histórico a combinar conserva o frete e o total salvos no resumo', () => {
  const order = {...savedOrder(), freteACombinar: true, tipoFrete: 'a_combinar', valorFrete: 0, total: 70};
  const result = buildOrderSummary({orderId: 'abc', order});
  assert.equal(result.status, 'ready');
  assert.ok(result.preview.includes('Frete: A Combinar'));
  assert.ok(result.preview.includes('Total: R$ 70,00'));
  assert.equal(result.preview.includes('Frete: R$ 0,00'), false);
});

test('espaços e quebras são adaptados sem perder observações ou conteúdo', () => {
  const order = savedOrder();
  order.observacao = 'Sem vela.\n\tAvisar   portaria.';
  order.itens[0].observacao = 'Cobertura branca';
  assert.ok(buildOrderSummary({orderId: 'abc', order}).preview.includes('Sem vela. Avisar portaria.'));
  assert.ok(buildOrderSummary({orderId: 'abc', order}).preview.includes('Cobertura branca'));
});

test('não inventa quantidade, total ou nome quando o pedido é inválido', () => {
  for (const update of [
    {total: null}, {total: NaN}, {total: -1}, {total: '78'}, {itens: []},
    {itens: [{nome: 'Bolo', quantity: 0}]}, {itens: [{nome: 'Bolo'}]},
    {itens: [{quantity: 1}]}, {valorFrete: -3},
  ]) assert.equal(buildOrderSummary({orderId: 'abc', order: {...savedOrder(), ...update}}).status, 'failed');
});

test('pedido longo falha explicitamente sem truncar itens ou valores', () => {
  const order = savedOrder();
  order.itens = Array.from({length: 80}, (_, index) => ({nome: `Doce opção ${index}`, quantity: 1, preco: 5}));
  const result = buildOrderSummary({orderId: 'abc', order});
  assert.deepEqual(result, {status: 'failed', code: 'summary_too_long'});
});

test('opções em nome são preservadas; estrutura não mapeada não é descartada', () => {
  const order = savedOrder();
  order.itens[0].nome = 'Bolo — massa branca, recheio morango';
  assert.ok(buildOrderSummary({orderId: 'abc', order}).preview.includes('massa branca, recheio morango'));
  order.itens[0].opcoes = [{nome: 'Vela'}];
  assert.equal(buildOrderSummary({orderId: 'abc', order}).code, 'unsupported_item_options');
});

test('preparação lê somente o pedido da loja e ignora carrinho/perfil recebidos', async () => {
  const {preparer, reads} = setup();
  const result = await preparer.prepare({...reference, order: {total: 1}, recipient: '5511000000000',
    cart: [{nome: 'Não salvo'}], cliente: {nome: 'Cadastro atualizado'}});
  assert.equal(result.status, 'ready');
  assert.deepEqual(reads, ['lojas/matriz/pedidos/pedido-123']);
  assert.equal(result.recipient, '5562991234567');
  assert.equal(result.preview.includes('Não salvo'), false);
  assert.equal(result.preview.includes('Cadastro atualizado'), false);
  assert.equal(result.bodyParameters[2], 'R$ 78,00');
});

test('produção e referência inválida não acessam banco', async () => {
  const {preparer, reads} = setup(savedOrder(), {getProjectId: () => 'ana-guimaraes'});
  assert.equal((await preparer.prepare(reference)).code, 'environment_blocked');
  assert.equal(reads.length, 0);
  const valid = setup();
  assert.equal((await valid.preparer.prepare({...reference, orderId: '../x'})).code, 'invalid_order_reference');
  assert.equal(valid.reads.length, 0);
});

test('pedido ausente, loja divergente, consentimento ausente e telefone alterado bloqueiam preparação', async () => {
  assert.equal((await setup(null).preparer.prepare(reference)).code, 'order_not_found');
  for (const [change, code] of [
    [{lojaId: 'outra'}, 'store_mismatch'], [{whatsappConfirmation: null}, 'consent_missing'],
    [{telefone: '62991234568'}, 'invalid_recipient'],
  ]) assert.equal((await setup({...savedOrder(), ...change}).preparer.prepare(reference)).code, code);
});

test('falha de leitura não vaza mensagens do banco', async () => {
  const {preparer} = setup(null, {db: {doc: () => {throw new Error('private customer details');}}});
  assert.deepEqual(await preparer.prepare(reference), {status: 'failed', code: 'order_unavailable'});
});

test('conteúdo pronto funciona com transporte mock e contrato errado é bloqueado', async () => {
  const prepared = await setup().preparer.prepare(reference);
  let name = TEMPLATE.name;
  const service = createWhatsAppService({getProjectId: () => DEV_PROJECT_ID,
    db: {doc: () => ({get: async () => ({exists: true, data: () => ({
      enabled: true, mode: 'mock', templateName: name, templateLanguage: TEMPLATE.language,
    })})})},
    createSecretClient: () => {throw new Error('must not read secret');},
    fetchImpl: () => {throw new Error('must not send');},
  });
  assert.equal((await service.sendTemplate(prepared)).status, 'simulated');
  name = 'outro_template';
  assert.equal((await service.sendTemplate(prepared)).code, 'template_mismatch');
});
