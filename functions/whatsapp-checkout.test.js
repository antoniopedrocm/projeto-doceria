const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {CONSENT_VERSION, CONSENT_TEXT, normalizeBrazilPhone, buildCheckoutWhatsApp} = require('./whatsapp-checkout');
const core = require('./freight-core');

test('normaliza Brasil sem duplicar país ou remover DDD 55', () => {
  for (const input of ['(62) 99123-4567', '62991234567', '+55 (62) 99123-4567', '5562991234567', '005562991234567']) {
    assert.equal(normalizeBrazilPhone(input).e164, '+5562991234567');
  }
  assert.equal(normalizeBrazilPhone('55991234567').e164, '+5555991234567');
  assert.equal(normalizeBrazilPhone('5532123456').e164, '+555532123456');
  assert.equal(normalizeBrazilPhone('+55 62 3212-3456').e164, '+556232123456');
});

test('números inválidos não são corrigidos por suposição', () => {
  for (const input of ['', null, 62991234567, 'abc62991234567', '62991234567 ramal 2',
    '6291234567', '20991234567', '+1 212 555 0123', '555562991234567',
    '062991234567', '02162991234567', '991234567', '+556299123456789']) {
    const result = normalizeBrazilPhone(input);
    assert.equal(result.status, 'invalid', String(input));
    assert.equal(result.e164, null);
  }
});

test('consentimento estrito, versionado e horário gerado pelo servidor', () => {
  const build = (consent) => buildCheckoutWhatsApp({phone: '62991234567', consent, serverTimestamp: () => 'SERVER'});
  assert.equal(build({accepted: true, version: CONSENT_VERSION, recordedAt: 'forjado'}).consent.recordedAt, 'SERVER');
  assert.equal(build({accepted: true, version: CONSENT_VERSION}).consent.granted, true);
  assert.equal(build({accepted: false, version: CONSENT_VERSION}).consent.status, 'declined');
  for (const consent of [undefined, null, true, {}, {accepted: 'true', version: CONSENT_VERSION},
    {accepted: true, version: 'old'}, {granted: true, version: CONSENT_VERSION}]) {
    assert.equal(build(consent).consent.granted, false);
    assert.equal(build(consent).consent.status, 'not_provided');
  }
});

// Run the actual route with a transaction double; no Firebase/Meta connection.
const runCheckout = async (phone, consent, {freightConfig = {}, checkout = {}} = {}) => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  const route = source.slice(source.indexOf('app.post("/checkout/confirmar"'), source.indexOf('// Rota para calcular frete'));
  let handler;
  let order;
  let committed = false;
  const ref = (id) => ({id: id.split('/').pop(), path: id, collection: (name) => collection(`${id}/${name}`)});
  const collection = (name) => ({doc: (id = 'order-test') => ref(`${name}/${id}`)});
  const context = {
    app: {post: (_, fn) => {handler = fn;}}, buildCheckoutWhatsApp, ...core,
    // Trusted distance double, independent of the production browser/provider.
    resolveFreightDistance: async () => checkout.distanciaFreteKm ?? 2,
    requireStoreId: () => 'loja-teste', getStoreConfigDoc: () => ref('config'), assertStoreOpen: () => {},
    FieldValue: {serverTimestamp: () => 'SERVER'},
    admin: {firestore: {FieldValue: {serverTimestamp: () => 'SERVER'}}},
    createHttpError: (httpStatus, message) => Object.assign(new Error(message), {httpStatus}),
    logger: {error: () => {}},
    db: {doc: ref, collection, runTransaction: async (fn) => {
      const result = await fn({
        get: async (documentRef) => ({exists: true, data: () => documentRef.id === 'config'
          ? {frete: {lat: -16.6, lng: -49.3, valorPorKm: 2.5, ...freightConfig}} : {nome: 'Bolo', preco: 10, estoque: 4}}),
        set: (_, data) => {order = data;}, update: () => {},
      });
      committed = true;
      return result;
    }},
  };
  const helper = source.slice(source.indexOf('const quoteOrderFreight ='), source.indexOf('// Rota para criar um novo pedido'));
  vm.runInNewContext(helper + '\n' + route, context);
  let status;
  let response;
  const res = {status: (value) => {status = value; return res;}, json: (value) => {
    response = value;
    if (value.ok) assert.equal(committed, true);
    return res;
  }};
  await handler({headers: {}, body: {
    cliente: {nome: 'Cliente teste', telefone: phone, endereco: 'Rua teste'}, itens: [{produtoId: 'bolo', nome: 'Bolo', quantity: 2, preco: 10}],
    subtotal: 20, distanciaFreteKm: 2, valorFrete: 5, whatsappConsent: consent,
    whatsappConfirmation: {phoneE164: '+5511999999999', consent: {granted: true}},
    ...checkout,
  }}, res);
  return {order, status, response};
};

test('checkout persiste metadados junto do pedido e preserva telefone e total', async () => {
  const {order, status, response} = await runCheckout('(62) 99123-4567', {accepted: true, version: CONSENT_VERSION});
  assert.equal(status, 200);
  assert.equal(response.ok, true);
  assert.equal(order.telefone, '(62) 99123-4567');
  assert.equal(order.total, 25);
  assert.equal(order.whatsappConfirmation.phoneE164, '+5562991234567');
  assert.equal(order.whatsappConfirmation.consent.granted, true);
  assert.equal(order.whatsappConfirmation.consent.recordedAt, 'SERVER');
});

test('checkout grava modo a combinar e total sem frete com a configuração da loja', async () => {
  const {order, response} = await runCheckout('(62) 99123-4567', undefined, {
    freightConfig: {freteACombinar: true, valorMinimoFrete: 8, valorPorKm: 2},
    checkout: {distanciaFreteKm: 2.5, valorFrete: 50, subtotal: 20},
  });
  assert.equal(order.freteACombinar, true);
  assert.equal(order.tipoFrete, 'a_combinar');
  assert.equal(order.valorFrete, 0);
  assert.equal(order.total, 20);
  assert.equal(response.total, 20);
});

test('checkout calcula e grava mínimo ou valor por distância da própria loja', async () => {
  const freightConfig = {freteACombinar: false, valorMinimoFrete: 8, valorPorKm: 2};
  for (const [distance, expectedFreight] of [[2.5, 8], [6, 12]]) {
    const {order, response} = await runCheckout('(62) 99123-4567', undefined, {
      freightConfig,
      checkout: {distanciaFreteKm: distance, valorFrete: expectedFreight},
    });
    assert.equal(order.valorFrete, expectedFreight);
    assert.equal(order.total, 20 + expectedFreight);
    assert.equal(order.freteACombinar, false);
    assert.equal(response.valorFrete, expectedFreight);
  }
});

test('telefone inválido, recusa e checkout legado continuam criando pedido', async () => {
  for (const [phone, consent] of [
    ['inválido', {accepted: true, version: CONSENT_VERSION}],
    ['62991234567', {accepted: false, version: CONSENT_VERSION}], ['62991234567', undefined],
  ]) {
    const {order, status, response} = await runCheckout(phone, consent);
    assert.equal(status, 200);
    assert.equal(response.ok, true);
    if (phone === 'inválido') assert.equal(order.whatsappConfirmation.phoneE164, null);
    else assert.equal(order.whatsappConfirmation.consent.granted, false);
  }
});

test('telefone obrigatório ausente mantém a validação atual e não escreve pedido', async () => {
  const {order, status} = await runCheckout('', {accepted: true, version: CONSENT_VERSION});
  assert.equal(status, 400);
  assert.equal(order, undefined);
});

for (const menu of ['matriz', 'garavelo', 'festa']) {
  test(`${menu}: consentimento facultativo e fluxo real serializa escolha e limpa após sucesso`, async () => {
    // jsdom already ships with the CRM test toolchain; scripts/resources remain disabled.
    const {JSDOM} = require(require.resolve('jsdom', {paths: [path.join(__dirname, '../crm')]}));
    const html = fs.readFileSync(path.join(__dirname, `../crm/public/cardapio-${menu}.html`), 'utf8');
    const dom = new JSDOM(html);
    try {
      const {document} = dom.window;
      for (const mode of ['platform', 'guest']) {
        const checkbox = document.getElementById(`${mode}-whatsapp-consent`);
        assert.equal(checkbox.checked, false);
        assert.equal(checkbox.required, false);
        assert.ok(checkbox.closest('label').textContent.includes(CONSENT_TEXT));
      }
      const resetCode = html.slice(html.indexOf('        function resetWhatsAppConsent()'), html.indexOf("        window.addEventListener('pageshow', resetWhatsAppConsent);") + "        window.addEventListener('pageshow', resetWhatsAppConsent);".length);
      const finalizeCode = html.slice(html.indexOf('        async function finalizeOrder('), html.indexOf('        const customerAccount=installCustomerAccount', html.indexOf('        async function finalizeOrder(')));
      for (const isPlatform of [true, false]) {
        for (const accepted of [true, false]) {
          let sent;
          let toast;
          const context = vm.createContext({
            document, window: {addEventListener: () => {}, open: () => {}, valorFrete: 0},
            chargedFreight: () => 0, checkoutHeaders: async () => ({}), retainAuthenticatedCustomer: () => null,
            cart: [{id: 'bolo', preco: 10, quantity: 1, nome: 'Bolo'}], appliedCupom: null,
            STORE_ID: 'loja-teste', API_BASE_URL: 'https://example.invalid', WHATSAPP_NUMBER: '5562000000000',
            storeIsOpenNow: true, currentClient: null, pendingOrderDetails: {},
            revalidateCheckoutBeforeFinalSubmit: async () => {}, clearCheckoutBlockingIssue: () => {},
            confirmationModal: document.getElementById('confirmation-modal'),
            platformConfirmationModal: {classList: {remove: () => {}}},
            removeCupom: () => {}, clearCheckoutState: () => {}, renderCart: () => {},
            showToast: (message) => {toast = message;}, console,
            fetch: async (_, options) => {
              sent = JSON.parse(options.body);
              return {ok: true, json: async () => ({ok: true, id: 'order-test', total: 10, desconto: 0, valorFrete: 0, whatsappPhoneStatus: 'invalid'})};
            },
          });
          vm.runInContext(resetCode, context);
          document.getElementById(`${isPlatform ? 'platform' : 'guest'}-whatsapp-consent`).checked = accepted;
          await vm.runInContext(`${finalizeCode}\nfinalizeOrder({telefone:'invalid', clienteNome:'Teste', clienteEndereco:'Retirar na Loja'}, null, ${isPlatform});`, context);
          assert.deepEqual(sent.whatsappConsent, {accepted, version: CONSENT_VERSION});
          assert.equal(document.getElementById(`${isPlatform ? 'platform' : 'guest'}-whatsapp-consent`).checked, false);
          assert.equal(Boolean(toast), accepted);
        }
      }
    } finally {
      dom.window.close();
    }
  });
}
