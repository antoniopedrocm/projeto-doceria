const {
  aggregateCustomerOrders,
  buildCustomerIdentityIndex,
  resolveOrderCustomerId,
  summarizeStoreMetrics,
} = require('./customer-purchase-metrics-core');

const METRICS_SCHEMA_VERSION = 1;
const METRICS_FIELD = 'metricasComprasPorLoja';

const chunk = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const createCustomerPurchaseMetricsFunctions = ({
  admin,
  db,
  onCall,
  onDocumentWritten,
  HttpsError,
  logger,
  verifyStoreAccess,
}) => {
  const customersCollection = db.collection('clientes');

  const loadCustomerIdentityIndex = async () => {
    const snapshot = await customersCollection.get();
    const customers = snapshot.docs.map((docSnapshot) => ({
      id: docSnapshot.id,
      ...docSnapshot.data(),
    }));
    return {
      customers,
      index: buildCustomerIdentityIndex(customers),
    };
  };

  const buildStoreMetric = (aggregate) => ({
    valorEmCompras: aggregate.totalCents / 100,
    valorEmComprasCentavos: aggregate.totalCents,
    numeroDeCompras: aggregate.purchaseCount,
    ultimaCompra: aggregate.lastPurchase,
    ultimaCompraMillis: aggregate.lastPurchaseMillis,
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  const updateCustomerStoreMetric = async (customerId, storeId, aggregate) => {
    const customerRef = customersCollection.doc(customerId);
    await db.runTransaction(async (transaction) => {
      const customerSnapshot = await transaction.get(customerRef);
      if (!customerSnapshot.exists) {
        logger.warn('[CustomerMetrics] Cliente vinculado não encontrado.', {
          customerId,
          storeId,
        });
        return;
      }

      const customer = customerSnapshot.data() || {};
      const currentByStore = customer[METRICS_FIELD] || {};
      const nextByStore = {
        ...currentByStore,
        [storeId]: buildStoreMetric(aggregate),
      };
      const globalMetric = summarizeStoreMetrics(nextByStore);
      const payload = {
        [METRICS_FIELD]: nextByStore,
        valorEmCompras: globalMetric.totalCents / 100,
        valorEmComprasCentavos: globalMetric.totalCents,
        numeroDeCompras: globalMetric.purchaseCount,
        ultimaCompra: globalMetric.lastPurchase || null,
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (aggregate.purchaseCount > 0) {
        payload.lojasVisitadas = admin.firestore.FieldValue.arrayUnion(storeId);
      }
      transaction.set(customerRef, payload, {merge: true});
    });
  };

  const recalculateCustomerForStore = async (storeId, customerId) => {
    const ordersSnapshot = await db.collection('lojas').doc(storeId)
        .collection('pedidos').where('clienteId', '==', customerId).get();
    const orders = ordersSnapshot.docs.map((orderSnapshot) => ({
      id: orderSnapshot.id,
      ...orderSnapshot.data(),
    }));
    const aggregate = aggregateCustomerOrders(orders, customerId);
    await updateCustomerStoreMetric(customerId, storeId, aggregate);
  };

  const resolveCustomerId = async (order) => {
    const explicitId = String(order?.clienteId || order?.customerId || '').trim();
    if (explicitId) return explicitId;
    const {index} = await loadCustomerIdentityIndex();
    return resolveOrderCustomerId(order, index);
  };

  const backfillStore = async (storeId) => {
    const markerRef = db.collection('lojas').doc(storeId)
        .collection('manutencao').doc('customerPurchaseMetrics');
    const markerSnapshot = await markerRef.get();
    if (
      markerSnapshot.exists &&
      markerSnapshot.get('schemaVersion') === METRICS_SCHEMA_VERSION &&
      markerSnapshot.get('status') === 'complete'
    ) {
      return {alreadySynchronized: true};
    }

    await markerRef.set({
      schemaVersion: METRICS_SCHEMA_VERSION,
      status: 'running',
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});

    const [{customers, index}, ordersSnapshot] = await Promise.all([
      loadCustomerIdentityIndex(),
      db.collection('lojas').doc(storeId).collection('pedidos').get(),
    ]);
    const orders = ordersSnapshot.docs.map((orderSnapshot) => ({
      id: orderSnapshot.id,
      ref: orderSnapshot.ref,
      ...orderSnapshot.data(),
    }));
    const resolvedOrders = [];
    const orderPatches = [];
    let unresolvedOrders = 0;

    orders.forEach((order) => {
      const customerId = resolveOrderCustomerId(order, index);
      if (!customerId) {
        unresolvedOrders += 1;
        return;
      }
      const resolvedOrder = {...order, clienteId: customerId};
      resolvedOrders.push(resolvedOrder);
      if (!order.clienteId) orderPatches.push({ref: order.ref, customerId});
    });

    for (const patchGroup of chunk(orderPatches, 400)) {
      const batch = db.batch();
      patchGroup.forEach(({ref, customerId}) => {
        batch.set(ref, {
          clienteId: customerId,
          clienteVinculadoEm: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
      });
      await batch.commit();
    }

    const storeCustomerIds = new Set();
    customers.forEach((customer) => {
      const visitedStores = Array.isArray(customer.lojasVisitadas) ?
        customer.lojasVisitadas : [];
      if (
        visitedStores.includes(storeId) ||
        customer.lojaId === storeId ||
        customer.lojaAtual === storeId
      ) {
        storeCustomerIds.add(customer.id);
      }
    });
    resolvedOrders.forEach((order) => storeCustomerIds.add(order.clienteId));

    const updates = Array.from(storeCustomerIds).map((customerId) => ({
      customerId,
      aggregate: aggregateCustomerOrders(resolvedOrders, customerId),
    }));
    for (const updateGroup of chunk(updates, 20)) {
      await Promise.all(updateGroup.map(({customerId, aggregate}) => (
        updateCustomerStoreMetric(customerId, storeId, aggregate)
      )));
    }

    const result = {
      alreadySynchronized: false,
      customersUpdated: updates.length,
      ordersLinked: orderPatches.length,
      unresolvedOrders,
    };
    await markerRef.set({
      ...result,
      schemaVersion: METRICS_SCHEMA_VERSION,
      status: 'complete',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});
    return result;
  };

  return {
    syncCustomerPurchaseMetrics: onDocumentWritten({
      document: 'lojas/{lojaId}/pedidos/{pedidoId}',
      region: 'southamerica-east1',
      retry: true,
    }, async (event) => {
      const storeId = String(event.params?.lojaId || '').trim();
      const before = event.data?.before?.exists ? event.data.before.data() : null;
      const after = event.data?.after?.exists ? event.data.after.data() : null;
      if (!storeId || (!before && !after)) return;

      const [beforeCustomerId, afterCustomerId] = await Promise.all([
        before ? resolveCustomerId(before) : null,
        after ? resolveCustomerId(after) : null,
      ]);

      if (after && afterCustomerId && !after.clienteId) {
        await event.data.after.ref.set({
          clienteId: afterCustomerId,
          clienteVinculadoEm: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
      }

      const affectedCustomerIds = Array.from(new Set([
        beforeCustomerId,
        afterCustomerId,
      ].filter(Boolean)));
      await Promise.all(affectedCustomerIds.map((customerId) => (
        recalculateCustomerForStore(storeId, customerId)
      )));
    }),

    ensureCustomerPurchaseMetrics: onCall({timeoutSeconds: 540}, async (request) => {
      const storeId = String(request.data?.lojaId || '').trim();
      if (!storeId) {
        throw new HttpsError('invalid-argument', 'Selecione uma loja válida.');
      }
      await verifyStoreAccess(request.auth?.uid, storeId);
      try {
        return await backfillStore(storeId);
      } catch (error) {
        logger.error('[CustomerMetrics] Falha ao sincronizar histórico.', {
          storeId,
          message: error?.message || String(error),
        });
        throw new HttpsError(
            'internal',
            'Não foi possível sincronizar o histórico de compras dos clientes.',
        );
      }
    }),
  };
};

module.exports = {
  METRICS_FIELD,
  METRICS_SCHEMA_VERSION,
  createCustomerPurchaseMetricsFunctions,
};
