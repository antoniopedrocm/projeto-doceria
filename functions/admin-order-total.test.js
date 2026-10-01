const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the real administrative save/reload paths against in-memory snapshots.
// No Firebase client or network is loaded by this suite.
const app = fs.readFileSync(path.join(__dirname, '../crm/src/App.js'), 'utf8');
const freight = fs.readFileSync(path.join(__dirname, '../crm/src/utils/orderFreight.js'), 'utf8').replace(/export /g, '');
const block = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
const code = freight + '\n' +
  block('    const calculateOrderSubtotal =', '    const mapOrderItemsByProduct =') +
  block('    const reloadOrderCriticalData =', '    const reconcileOpenOrderWithLiveProducts =');

const fixture = (editingOrder = null) => {
  const saved = new Map();
  const ref = (store, collection, id) => ({id, path: `lojas/${store}/${collection}/${id}`});
  const snapshot = (r) => ({id: r.id, exists: () => true, data: () =>
    r.path.includes('/pedidos/') ? editingOrder : r.path.includes('/clientes/') ?
      {nome: 'Teste', telefone: '62999991234'} : {preco: 12, estoque: 20}});
  const context = vm.createContext({
    editingOrder, db: {}, currentPage: 'pedidos', userId: 'test',
    roundCurrency: value => Math.round(value * 100) / 100,
    getOrderItemQuantity: item => item.quantity,
    getOrderItemProductId: item => item.produtoId,
    getStoreDocRef: ref, getStoreCollectionRef: (store, collection) => ref(store, collection, 'new'),
    getStoreConfigDocRef: store => ref(store, 'configuracoes', 'config'), doc: r => r,
    getDoc: async r => snapshot(r), isStoreOpenNow: () => true,
    getCouponDocRefForOrder: async () => null,
    validateCouponSnapshot: (_snap, coupon) => ({cupom: coupon, desconto: coupon?.valorDesconto || 0}),
    getClientPrimaryAddressText: () => '',
    buildFreshItemsFromProductSnaps: items => items,
    ensureAuthenticatedUserForWrite: async () => ({uid: 'test', email: 'test@example.test'}),
    runWithRetry: async (_name, action) => action(),
    runTransaction: async (_db, action) => action({
      get: async r => snapshot(r),
      update: (r, data) => saved.set(r.path, structuredClone(data)),
      set: (r, data) => saved.set(r.path, structuredClone(data)),
    }),
    isFinalizedStatus: status => status === 'Finalizado',
    calculateOrderStockDelta: () => ({}),
    debugCacheSync: () => {}, serverTimestamp: () => 'SERVER', waitForPendingWrites: async () => {},
  });
  vm.runInContext(code, context);
  return {context, saved};
};

for (const [name, extra, expected] of [
  ['delivery', {valorFrete: 4}, 16],
  ['cupom + delivery', {valorFrete: 4, cupom: {valorDesconto: 2}}, 14],
  ['retirada', {clienteEndereco: 'Retirar na Loja', valorFrete: 4}, 12],
  ['a combinar', {tipoFrete: 'a_combinar', valorFrete: 4}, 12],
  ['zero', {valorFrete: 0}, 12],
  ['legado', {frete: 4}, 16],
  ['legado sem frete', {}, 12],
]) {
  test(`criar/editar/finalizar conserva total persistido: ${name}`, async () => {
    const initial = {id: 'old', clienteId: 'client', status: 'Pendente', total: 12,
      itens: [{produtoId: 'p1', nome: 'Doce', preco: 12, quantity: 1}], ...extra};
    for (const previous of [null, initial]) {
      const {context, saved} = fixture(previous);
      context.order = structuredClone(initial);
      const built = vm.runInContext('buildOrderWithTotals(order)', context);
      assert.equal(built.total, expected);
      context.order = built;
      const refreshed = await vm.runInContext("reloadOrderCriticalData(order, 'matriz')", context);
      assert.equal(refreshed.orderData.total, expected);
      context.order = {...refreshed.orderData, status: 'Finalizado'};
      await vm.runInContext("persistOrderWithTransaction(order, 'matriz')", context);
      const stored = saved.get(`lojas/matriz/pedidos/${previous ? 'old' : 'new'}`);
      assert.equal(stored.total, expected);
      assert.equal(stored.status, 'Finalizado');
      context.order = stored;
      assert.equal(vm.runInContext('buildOrderWithTotals(order).total', context), expected);
      assert.ok([...saved.keys()].every(p => p.startsWith('lojas/matriz/')));
    }
    assert.equal(initial.total, 12, 'historical input was not rewritten');
  });
}
