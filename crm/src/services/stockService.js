import { collection, doc, increment, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig.js';

const formatReason = (type, reason) => {
  if (reason) return reason;
  return type === 'entrada' ? 'Entrada de estoque' : 'Saída de estoque';
};

export const updateStock = async (
  productId,
  type,
  quantity,
  reason = 'Movimentação de estoque',
  userInfo = null,
  storeId,
  options = {},
) => {
  const normalizedQuantity = Number(quantity);

  if (!productId) throw new Error('Produto inválido.');
  if (!storeId) throw new Error('Loja não encontrada para atualizar estoque.');
  if (!['entrada', 'saida'].includes(type)) throw new Error('Tipo de movimentação inválido.');
  if (!normalizedQuantity || normalizedQuantity <= 0) throw new Error('Informe uma quantidade maior que zero.');

  await runTransaction(db, async (transaction) => {
    const productRef = doc(db, 'lojas', storeId, 'produtos', productId);
    const stockRef = doc(db, 'lojas', storeId, 'estoque', productId);
    const movementRef = options?.idempotencyKey
      ? doc(db, 'lojas', storeId, 'kardex', options.idempotencyKey)
      : doc(collection(db, 'lojas', storeId, 'kardex'));

    const [productSnap, stockSnap, movementSnap] = await Promise.all([
      transaction.get(productRef),
      transaction.get(stockRef),
      transaction.get(movementRef),
    ]);

    if (movementSnap.exists()) return;

    if (!productSnap.exists() && !stockSnap.exists()) {
      throw new Error('Item de estoque não encontrado.');
    }

    const productData = productSnap.data() || {};
    const stockData = stockSnap.data() || {};
    const currentQuantity = Number(productData.estoque ?? stockData.quantidade ?? 0) || 0;
    const delta = type === 'entrada' ? normalizedQuantity : -normalizedQuantity;
    const newQuantity = currentQuantity + delta;
    const resolvedReason = formatReason(type, reason);

    if (productSnap.exists()) {
      transaction.update(productRef, {
        estoque: increment(delta),
        updatedAt: serverTimestamp(),
      });
    }

    if (stockSnap.exists()) {
      transaction.update(stockRef, {
        quantidade: increment(delta),
        updatedAt: serverTimestamp(),
      });
    }

    const quickSaleOrder = options?.quickSaleOrder || null;
    const quickSaleOrderRef = quickSaleOrder ? doc(collection(db, 'lojas', storeId, 'pedidos')) : null;

    transaction.set(movementRef, {
      produtoId: productId,
      tipo: type,
      quantidade: normalizedQuantity,
      delta,
      motivo: resolvedReason,
      usuarioId: userInfo?.uid || userInfo?.auth?.uid || null,
      usuarioEmail: userInfo?.email || userInfo?.auth?.email || null,
      createdAt: serverTimestamp(),
      estoqueAnterior: currentQuantity,
      estoquePosterior: newQuantity,
      lojaId: storeId,
      pedidoId: options?.pedidoCompraId || quickSaleOrderRef?.id || null,
      pedidoCompraId: options?.pedidoCompraId || null,
      origem: options?.origem || (options?.pedidoCompraId ? 'pedido_compra' : 'movimentacao_manual'),
      idempotencyKey: options?.idempotencyKey || null,
    });

    if (quickSaleOrderRef) {
      transaction.set(quickSaleOrderRef, {
        ...quickSaleOrder,
        lojaId: storeId,
        estoqueMovimentacaoId: movementRef.id,
        createdAt: serverTimestamp(),
      });
    }
  });
};

export default updateStock;
