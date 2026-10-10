import fs from 'fs';
import path from 'path';
import {parse} from '@babel/parser';
import {calculateOrderTotal} from './utils/orderFreight';

const source = fs.readFileSync(path.join(__dirname, 'App.js'), 'utf8');
const tree = parse(source, {sourceType:'module', plugins:['jsx']});
const nodes = [];
function walk(node) {
  if (!node || typeof node !== 'object') return;
  nodes.push(node);
  Object.values(node).forEach(value => Array.isArray(value) ? value.forEach(walk) : walk(value));
}
walk(tree);
function actualHandler(name, bindings) {
  const node = nodes.find(n => n.type === 'VariableDeclarator' && n.id.name === name);
  const expression = node.init.type === 'CallExpression' ? node.init.arguments[0] : node.init;
  // Exercise the reconciled source handler, without connecting to Firebase.
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(bindings), `return (${source.slice(expression.start, expression.end)});`)(...Object.values(bindings));
}

test('entry binds Staff through the gate; the observer rejects a different UID', async () => {
  const gate = nodes.find(n => n.type === 'JSXOpeningElement' && n.name.name === 'ApplicationGate');
  expect(gate.attributes.find(a => a.name.name === 'StaffApplication').value.expression.name).toBe('StaffApplication');
  let callback;
  const apply = jest.fn(), signedOut = jest.fn();
  await actualHandler('initializeAuthObserver', {
    setAuthLoading:()=>{}, setPreferredAuthPersistence:async()=>{}, isMounted:true,
    unsubscribe:null, auth:{}, staffUid:'staff',
    onIdTokenChanged:(_, listener)=>{callback=listener;return ()=>{};},
    applyAuthenticatedUser:apply, applySignedOutState:signedOut,
  })();
  await callback({uid:'customer'});
  expect(apply).not.toHaveBeenCalled();
  expect(signedOut).toHaveBeenCalledTimes(1);
  await callback({uid:'staff'});
  expect(apply).toHaveBeenCalledWith({uid:'staff'});
});

test.each([
  [{valorFrete:4}, 0, 16],
  [{valorFrete:4}, 2, 14],
  [{tipoFrete:'retirada', valorFrete:4}, 0, 12],
  [{freteACombinar:true, valorFrete:0}, 0, 12],
])('administrative finalization persists the approved total alongside the published CRM: %j', async (freight, discount, expected) => {
  const item = {id:'product', quantity:1, preco:12};
  const writes = new Map();
  const snapshot = data => ({exists:()=>true, data:()=>data, id:'client'});
  const transaction = {
    get:async ref => snapshot(ref.endsWith('/clientes/client') ? {nome:'DEV'} : ref.endsWith('/pedidos/order') ? {status:'Pendente'} : ref.endsWith('/produtos/product') ? {estoque:5} : {}),
    update:(ref, data)=>writes.set(ref,data), set:(ref,data)=>writes.set(ref,data),
  };
  const save = actualHandler('persistOrderWithTransaction', {
    ensureAuthenticatedUserForWrite:async()=>({uid:'staff',email:'dev@example.invalid'}),
    editingOrder:{id:'order'}, getStoreDocRef:(store,collection,id)=>`${store}/${collection}/${id}`,
    getStoreConfigDocRef:store=>`${store}/config`, getStoreCollectionRef:(store,collection)=>`${store}/${collection}`,
    runWithRetry:async (_, operation)=>operation(), runTransaction:async (_, operation)=>operation(transaction), db:{},
    isStoreOpenNow:()=>true, getOrderItemProductId:value=>value.id,
    buildFreshItemsFromProductSnaps:items=>items, calculateOrderSubtotal:items=>items.reduce((sum,i)=>sum+i.preco*i.quantity,0),
    validateCouponSnapshot:()=>({desconto:0,cupom:null}), getClientPrimaryAddressText:()=>'',
    roundCurrency:value=>Math.round(value*100)/100, serverTimestamp:()=> 'server-time', calculateOrderTotal,
    isFinalizedStatus:status=>status==='Finalizado', calculateOrderStockDelta:()=>({product:1}),
    doc:ref=>`${ref}/audit`, user:{auth:{uid:'staff'}}, userId:'staff', currentPage:'pedidos',
    waitForPendingWrites:async()=>{}, debugCacheSync:()=>{},
  });
  await save({clienteId:'client',itens:[item],status:'Finalizado',desconto:discount,...freight},'matriz');
  expect(writes.get('matriz/pedidos/order').total).toBe(expected);
  expect(writes.get('matriz/pedidos/order').lojaId).toBe('matriz');
  expect(writes.get('matriz/produtos/product').estoque).toBe(4);
});
