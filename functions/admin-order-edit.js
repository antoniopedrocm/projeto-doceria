const crypto = require('node:crypto');
const {fiscalChoices} = require('./order-payment-method');
const STATUSES = ['Pendente', 'Em Produção', 'Pronto para Entrega', 'Finalizado', 'Cancelado'];
const FIELDS = ['clienteId', 'status', 'categoria', 'formaPagamento', 'observacao', 'itens', 'desconto', 'cupom', 'dataEntrega'];
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,150}$/.test(value) && !/\s/.test(value);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const cents = value => Math.round(Number(value) * 100);
const quantity = item => Number(item.quantity ?? item.quantidade ?? 1);
const productId = item => item.produtoId || item.productId || item.id;
const allocation = items => (items || []).reduce((result,item) => {const id=productId(item);result[id]=(result[id] || 0)+quantity(item);return result;},{});
function auditValue(value) {
  if (value == null) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(auditValue);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined).map(([k,v]) => [k,auditValue(v)]));
  return value;
}
function initialAllocation(order) {
  const checkout = order.paymentId || order.paymentMode || order.checkoutIdentity || /card[aá]pio/i.test(order.origem || '');
  return checkout || order.status === 'Finalizado' ? allocation(order.itens) : {};
}
function clientAddress(customer) {
  if (typeof customer.endereco === 'string' && customer.endereco.trim()) return [[customer.endereco.trim(),customer.numero].filter(Boolean).join(', '),customer.complemento,customer.bairro,[customer.cidade,customer.uf || customer.estado].filter(Boolean).join(' - '),customer.cep ? 'CEP '+customer.cep : ''].filter(Boolean).join(', ');
  const list = Array.isArray(customer.enderecos) ? customer.enderecos : [];
  const address = list.find(a => a?.isDefault) || list[0];
  if (typeof address === 'string') return address;
  return address?.enderecoCompleto || [address?.rua,address?.numero,address?.complemento,address?.bairro,[address?.cidade,address?.uf || address?.estado].filter(Boolean).join(' - '),address?.cep].filter(Boolean).join(', ');
}
function createOrderAuthorizer({db,HttpsError,assertActiveUser,sanitizePermissions,extractStoreIds}) {
  return async (uid,storeId) => {
    const profile = await assertActiveUser(uid);
    const rawRole = String(profile.role || '').toLowerCase();
    const owners = ['dono','owner','admin','adm','administrador','administradora','administrador_master'];
    if (![...owners,'gerente','atendente','funcionario','corretor'].includes(rawRole)) throw new HttpsError('permission-denied','Acesso Staff de pedidos obrigatório.');
    const role = owners.includes(rawRole) ? 'dono' : rawRole === 'gerente' ? 'gerente' : 'atendente';
    const custom = (await db.collection('customProfiles').doc(uid).get()).data() || {};
    const permissions = sanitizePermissions(custom.permissions || profile.permissions,role);
    const stores = extractStoreIds(profile);
    if (!permissions.pedidos || (!(role === 'dono' && !stores.length) && !stores.includes(storeId))) throw new HttpsError('permission-denied','Sem permissão de pedidos nesta loja.');
    return {uid,name:String(profile.nome || profile.displayName || uid).slice(0,120)};
  };
}
function createAdminOrderEdit({db, admin, HttpsError, authorize}) {
  const fail = (code, message) => {throw new HttpsError(code, message);};
  const identify = data => {
    if (!validId(data?.storeId) || !validId(data?.orderId)) fail('invalid-argument', 'Loja ou pedido inválido.');
    return db.doc(`lojas/${data.storeId}/pedidos/${data.orderId}`);
  };
  async function save(request) {
    const data = request.data || {}, ref = identify(data);
    const actor = await authorize(request.auth?.uid, data.storeId);
    if (!Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0) fail('invalid-argument','Versão do pedido inválida.');
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(data.requestId || '') || !['FULL', 'STATUS'].includes(data.mode)) fail('invalid-argument', 'Operação inválida.');
    const input = data.patch;
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !FIELDS.includes(k))) fail('invalid-argument', 'Campos de edição inválidos.');
    if (data.mode === 'STATUS' && (Object.keys(input).length !== 1 || !Object.hasOwn(input, 'status'))) fail('invalid-argument', 'O atalho permite somente status.');
    if (!STATUSES.includes(input.status)) fail('invalid-argument', 'Status operacional inválido.');
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({uid:actor.uid,mode:data.mode,patch:input,expectedRevision:data.expectedRevision})).digest('hex');
    const eventRef = ref.collection('auditEvents').doc(data.requestId);
    return db.runTransaction(async tx => {
      const [snapshot, priorEvent, latestAudit] = await Promise.all([tx.get(ref), tx.get(eventRef), tx.get(ref.collection('auditEvents').orderBy('revision', 'desc').limit(1))]);
      if (!snapshot.exists) fail('not-found', 'Pedido não encontrado.');
      if (priorEvent.exists) {
        if (priorEvent.get('actorUid') !== actor.uid || priorEvent.get('requestFingerprint') !== fingerprint) fail('already-exists', 'Identificador de operação já utilizado.');
        return {ok:true, changed:true, revision:priorEvent.get('revision'), duplicate:true};
      }
      const order = snapshot.data();
      if (order.lojaId && order.lojaId !== data.storeId) fail('failed-precondition', 'A loja do pedido está inconsistente.');
      if (Number(data.expectedRevision) !== Number(order.adminRevision || 0) || (data.expectedStatus != null && data.expectedStatus !== order.status)) fail('aborted', 'O pedido mudou em outra sessão. Reabra a edição.');
      if (data.expectedUpdatedAt != null && Number(data.expectedUpdatedAt) !== (order.updatedAt?.toMillis?.() || 0)) fail('aborted', 'O pedido mudou em outra sessão. Reabra a edição.');
      let payment = null;
      if (order.paymentId) {
        payment = (await tx.get(db.doc(`checkoutPayments/${order.paymentId}`))).data();
        if (!payment || payment.orderPath !== ref.path || payment.storeId !== data.storeId || payment.payment_status !== 'PAID' || order.payment_status !== 'PAID' || payment.requiresReview || order.requiresReview) fail('failed-precondition', 'Concilie o pagamento online antes de editar este pedido.');
      }
      const patch = {status:input.status};
      if (data.mode === 'FULL') {
        for (const field of ['categoria','formaPagamento','observacao','dataEntrega']) if (Object.hasOwn(input,field)) {
          if (typeof input[field] !== 'string' || input[field].length > (field === 'observacao' ? 4000 : 150)) fail('invalid-argument', 'Texto inválido em '+field+'.');
          if (order[field] == null && (input[field] === '' || (field === 'categoria' && input[field] === 'Delivery'))) continue;
          patch[field] = input[field];
        }
        if (patch.categoria && !['Delivery','Festa'].includes(patch.categoria) && patch.categoria !== order.categoria) fail('invalid-argument','Categoria inválida.');
        if (Object.hasOwn(input,'clienteId') && input.clienteId !== order.clienteId) {
          if (order.ownerUid || order.paymentId || order.canonicalCustomerId) fail('failed-precondition', 'Este pedido possui ownership vinculado. O cliente original deve ser preservado.');
          if (!validId(input.clienteId)) fail('invalid-argument','Cliente inválido.');
          let customer = await tx.get(db.doc(`clientes/${input.clienteId}`));
          if (customer.get('canonicalCustomerId') && customer.get('canonicalStatus') === 'ALIAS') customer = await tx.get(db.doc(`clientes/${customer.get('canonicalCustomerId')}`));
          if (!customer.exists) fail('not-found','Cliente não encontrado.');
          patch.clienteId = customer.id;patch.clienteNome = customer.get('nome') || '';
          patch.telefone = customer.get('telefone') || '';
          patch.clienteEndereco = order.clienteEndereco === 'Retirar na Loja' ? order.clienteEndereco : clientAddress(customer.data());
          if (!order.originalCustomerId) patch.originalCustomerId = order.clienteId || null;
        }
        if (patch.formaPagamento && patch.formaPagamento !== order.formaPagamento) {
          if (order.paymentId || order.paymentMethodSource?.startsWith('provider/') || (order.paymentStatus || order.payment_status) === 'PAID') fail('failed-precondition','O método de pagamento confirmado deve ser preservado.');
          const choice = Object.hasOwn(fiscalChoices,patch.formaPagamento) && fiscalChoices[patch.formaPagamento];
          if (!choice) fail('invalid-argument','Selecione uma forma de pagamento suportada.');
          if (order.paymentMode === 'AGREED_LATER') Object.assign(patch,{paymentMethod:choice.method,fiscalPaymentCode:choice.code,paymentMethodSource:'crm/manual',paymentMethodResolvedAt:admin.firestore.FieldValue.serverTimestamp()});
        }
        if (!Array.isArray(input.itens) || !input.itens.length || input.itens.length > 100) fail('invalid-argument','Informe de 1 a 100 produtos.');
        const oldItems = new Map((order.itens || []).map(item => [productId(item),item]));
        const ids = input.itens.map(productId);
        if (ids.some(id => !validId(id)) || new Set(ids).size !== ids.length) fail('invalid-argument','Produtos inválidos ou duplicados.');
        const productSnaps = new Map();
        for (const id of ids) productSnaps.set(id,await tx.get(db.doc(`lojas/${data.storeId}/produtos/${id}`)));
        patch.itens = input.itens.map(item => {
          const id = productId(item), qty = quantity(item), old = oldItems.get(id), product = productSnaps.get(id);
          if (!Number.isSafeInteger(qty) || qty < 1 || qty > 1000) fail('invalid-argument','Quantidade inválida.');
          if (old) {
            if (!Number.isFinite(Number(old.preco)) || Number(old.preco) < 0) fail('failed-precondition','Preço histórico inválido.');
            return quantity(old) === qty ? old : {...old,quantity:qty};
          }
          if (!product.exists || product.get('ativo') === false || (product.get('status') || 'Ativo') !== 'Ativo') fail('failed-precondition','Produto indisponível: '+id);
          const price = Number(product.get('preco'));
          if (!Number.isFinite(price) || price < 0) fail('failed-precondition','Preço inválido.');
          return {id,produtoId:id,nome:product.get('nome') || id,preco:price,quantity:qty};
        });
        patch.subtotal = patch.itens.reduce((sum,item) => sum+cents(item.preco)*quantity(item),0)/100;
        if (input.cupom !== null && !same(input.cupom,order.cupom)) fail('invalid-argument','O cupom original não pode ser substituído na edição.');
        patch.cupom = input.cupom === null ? null : order.cupom || null;
        patch.desconto = Number(input.desconto || 0);
        if (!Number.isFinite(patch.desconto) || patch.desconto < 0 || cents(patch.desconto) > cents(patch.subtotal)) fail('invalid-argument','Desconto inválido.');
        if (patch.cupom) {
          patch.desconto = Math.min(patch.subtotal,Number(order.cupom.valorDesconto || order.desconto || 0));
          patch.cupom = {...order.cupom,valorDesconto:patch.desconto};
        }
        patch.desconto = cents(patch.desconto)/100;
        const freight = order.freteACombinar || order.tipoFrete === 'a_combinar' || order.tipoFrete === 'retirada' || order.clienteEndereco === 'Retirar na Loja' ? 0 : Number(order.valorFrete ?? order.frete ?? 0);
        if (!Number.isFinite(freight) || freight < 0) fail('failed-precondition','Frete salvo inválido.');
        patch.total = (cents(patch.subtotal)-cents(patch.desconto)+cents(freight))/100;
        if (!Number.isSafeInteger(cents(patch.total)) || patch.total < 0) fail('invalid-argument','Total inválido.');
        if (order.subtotal == null && same(patch.itens,order.itens)) delete patch.subtotal;
        if (order.desconto == null && patch.desconto === 0) delete patch.desconto;
      }
      const changes = Object.entries(patch).filter(([key,value]) => key !== 'paymentMethodResolvedAt' && !same(auditValue(order[key]),auditValue(value))).map(([field,after]) => ({field,before:auditValue(order[field]),after:auditValue(after)}));
      const material = changes.some(change => !['status','observacao'].includes(change.field));
      if (material) {
        const invoices = await tx.get(db.collection('lojas').doc(data.storeId).collection('invoices').where('orderId','==',data.orderId).limit(25));
        const locked = order.fiscal?.authorizedInvoiceId || order.fiscal?.invoiceInProgressId || ['authorized','cancelled','validating','pending_return'].includes(order.fiscal?.lastInvoiceStatus)
          || invoices.size === 25 || invoices.docs.some(invoice => ['authorized','cancelled','validating','pending_return'].includes(invoice.get('status')));
        if (locked) fail('failed-precondition','Pedido com nota autorizada ou emissão em andamento: dados fiscais protegidos. Use o fluxo fiscal apropriado.');
      }
      if (!changes.length) return {ok:true,changed:false,revision:order.adminRevision || 0};
      const previousAllocation = latestAudit.docs[0]?.get('stockAllocationAfter') || initialAllocation(order);
      const nextAllocation = data.mode === 'STATUS' ? previousAllocation : ((order.paymentId || order.paymentMode || order.checkoutIdentity || /card[aá]pio/i.test(order.origem || '') || patch.status === 'Finalizado') ? allocation(patch.itens || order.itens) : {});
      const movements = [];
      for (const id of new Set([...Object.keys(previousAllocation),...Object.keys(nextAllocation)])) {
        const delta = (nextAllocation[id] || 0)-(previousAllocation[id] || 0);
        if (!delta) continue;
        if (!validId(id)) fail('failed-precondition','Item histórico sem identificação de estoque.');
        const productRef = db.doc(`lojas/${data.storeId}/produtos/${id}`), product = await tx.get(productRef);
        if (!product.exists) fail('failed-precondition','Produto não encontrado para ajuste de estoque: '+id);
        const stock = product.get('estoque');
        if (stock == null) continue;
        if (typeof stock !== 'number' || !Number.isFinite(stock) || stock-delta < 0) fail('failed-precondition','Estoque insuficiente ou inválido: '+id);
        movements.push({ref:productRef,productId:id,quantityDelta:delta,before:stock,after:stock-delta});
      }
      if (payment && data.mode === 'FULL') {
        if (!Number.isSafeInteger(payment.amount) || payment.amount < 0) fail('failed-precondition','Valor confirmado indisponível para conciliação.');
        const total = patch.total ?? order.total;
        patch.adminPaymentAdjustment = {state:cents(total) === payment.amount ? 'BALANCED' : 'REVIEW_REQUIRED',paidCents:payment.amount,orderTotalCents:cents(total),differenceCents:cents(total)-payment.amount,source:'CRM_EDIT_ORDER',paymentId:order.paymentId};
      }
      const revision = Number(order.adminRevision || 0)+1;
      const event = {schemaVersion:1,orderId:data.orderId,storeId:data.storeId,actorUid:actor.uid,actorName:actor.name,actorType:'STAFF',action:data.mode === 'STATUS' ? 'ORDER_STATUS_UPDATED' : 'ORDER_UPDATED',source:data.mode === 'STATUS' ? 'CRM_UPDATE_STATUS' : 'CRM_EDIT_ORDER',changes,stockChanges:movements.map(m => ({productId:m.productId,quantityDelta:m.quantityDelta,before:m.before,after:m.after})),stockAllocationAfter:nextAllocation,revision,requestFingerprint:fingerprint,createdAt:admin.firestore.FieldValue.serverTimestamp(),...(patch.adminPaymentAdjustment?{paymentAdjustment:patch.adminPaymentAdjustment}:{})};
      tx.update(ref,{...patch,adminRevision:revision,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
      for (const movement of movements) tx.update(movement.ref,{estoque:movement.after,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
      tx.create(eventRef,event);
      return {ok:true,changed:true,revision,...(patch.adminPaymentAdjustment?{paymentAdjustment:patch.adminPaymentAdjustment}:{})};
    });
  }
  async function history(request) {
    const data = request.data || {}, ref = identify(data);
    await authorize(request.auth?.uid,data.storeId);
    if (!(await ref.get()).exists) fail('not-found','Pedido não encontrado.');
    let query = ref.collection('auditEvents').orderBy('revision','desc').limit(25);
    if (data.beforeRevision != null) {
      if (!Number.isSafeInteger(data.beforeRevision) || data.beforeRevision < 1) fail('invalid-argument','Cursor inválido.');
      query = query.startAfter(data.beforeRevision);
    }
    const page = await query.get();
    return {events:page.docs.map(doc => {const event = doc.data();delete event.requestFingerprint;delete event.stockAllocationAfter;return {id:doc.id,...auditValue(event)};}),nextCursor:page.size === 25 ? page.docs.at(-1).get('revision') : null};
  }
  return {save,history};
}
module.exports = {createAdminOrderEdit,createOrderAuthorizer,initialAllocation,auditValue};
