const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const core = require('./freight-core');
const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');

const checkout = async ({storeId, configs, distance = 2, pickup = false}) => {
  const reads = [];
  const writes = [];
  let handler;
  const ref = (name) => ({path: name, id: name.split('/').pop(),
    collection: (id) => collection(`${name}/${id}`)});
  const collection = (name) => ({doc: (id = 'saved-order') => ref(`${name}/${id}`)});
  const db = {doc: ref, collection,
    runTransaction: (fn) => fn({
      get: async (r) => {
        reads.push(r.path);
        const data = r.path.endsWith('/produtos/p1') ? {nome: 'Bolo', preco: 59.4, estoque: 10} : configs[r.path];
        return {exists: !!data, data: () => data};
      },
      set: (r, data) => writes.push({path: r.path, data}),
      update: (r, data) => writes.push({path: r.path, data}),
    }),
  };
  const context = { ...core, db, app: {post: (_url, fn) => { handler = fn; }},
    requireStoreId: () => storeId,
    getStoreConfigDoc: (id) => ref(`lojas/${id}/configuracoes/config`),
    assertStoreOpen: () => undefined,
    createHttpError: (status, message, code) => Object.assign(new Error(message), {httpStatus: status, code}),
    admin: {firestore: {FieldValue: {serverTimestamp: () => 'timestamp'}}},
    FieldValue: {serverTimestamp: () => 'timestamp'},
    logger: {error: () => undefined},
  };
  const helper = source.slice(source.indexOf('const quoteOrderFreight ='), source.indexOf('// Rota para criar um novo pedido'));
  const route = source.slice(source.indexOf('app.post("/checkout/confirmar"'), source.indexOf('// Rota para calcular frete'));
  vm.runInNewContext(helper + '\n' + route, context);
  let status;
  let body;
  const res = {status: (s) => { status = s; return res; }, json: (b) => { body = b; return res; }};
  await handler({headers: {}, body: {cliente: {nome: 'Teste', telefone: '62999999999', endereco: pickup ? 'Retirar na Loja' : 'Rua teste'},
    itens: [{produtoId: 'p1', quantity: 1, preco: 59.4}], subtotal: 59.4, distanciaFreteKm: distance, valorFrete: 999}}, res);
  return {status, body, reads, writes};
};

const configs = {
  'lojas/matriz/configuracoes/config': {frete: {lat: -16.6, lng: -49.3, valorPorKm: 2.26, valorMinimoFrete: 0}},
  'lojas/garavelo/configuracoes/config': {frete: {lat: -16.7, lng: -49.4, valorPorKm: 3, valorMinimoFrete: 8, freteACombinar: true}},
};

test('checkout real usa a loja, grava snapshot e responde o total salvo (63,92)', async () => {
  const result = await checkout({storeId: 'matriz', configs});
  assert.equal(result.status, 200);
  assert.equal(result.body.valorFrete, 4.52);
  assert.equal(result.body.total, 63.92);
  const saved = result.writes.find((w) => w.path.includes('/pedidos/')).data;
  assert.equal(saved.total, result.body.total);
  assert.equal(saved.freteConfiguracao.lojaId, 'matriz');
  assert.equal(saved.distanciaFreteKm, 2);
  assert.ok(result.reads.every((p) => p.startsWith('lojas/matriz/')));
});

test('a combinar mantém 59,40 e snapshot após mudança da configuração', async () => {
  const local = structuredClone(configs);
  const result = await checkout({storeId: 'garavelo', configs: local, distance: null});
  assert.equal(result.status, 200);
  const saved = result.writes.find((w) => w.path.includes('/pedidos/')).data;
  assert.equal(saved.freteACombinar, true);
  assert.equal(saved.tipoFrete, 'a_combinar');
  assert.equal(saved.total, 59.4);
  assert.equal(saved.valorFrete, 0);
  local['lojas/garavelo/configuracoes/config'].frete.freteACombinar = false;
  assert.equal(saved.freteACombinar, true);
  assert.equal(result.body.total, saved.total);
  assert.ok(result.reads.every((p) => p.startsWith('lojas/garavelo/')));
});

test('origem inválida impede salvar pedido e movimentar estoque', async () => {
  const invalid = structuredClone(configs);
  invalid['lojas/matriz/configuracoes/config'].frete.lng = -4932489499913069;
  const result = await checkout({storeId: 'matriz', configs: invalid});
  assert.equal(result.status, 400);
  assert.match(result.body.message, /Coordenadas da loja inválidas/);
  assert.equal(result.writes.length, 0);
});

test('retirada não depende de configuração de entrega', async () => {
  const result = await checkout({storeId: 'matriz', configs: {}, pickup: true});
  assert.equal(result.status, 200);
  assert.equal(result.body.tipoFrete, 'retirada');
  assert.equal(result.body.total, 59.4);
});

test('leitura legada é isolada e não migra documentos', async () => {
  const reads = [];
  const config = await core.loadStoreFreightConfig({storeId: 'matriz', db: {doc: (p) => p}, primaryData: {horarios: {}},
    read: async (p) => { reads.push(p); return {exists: true, data: () => ({valorPorKm: 2, lat: -16, lng: -49})}; },
  });
  assert.equal(config.valorPorKm, 2);
  assert.deepEqual(reads, ['lojas/matriz/configuracoes/frete']);
});
