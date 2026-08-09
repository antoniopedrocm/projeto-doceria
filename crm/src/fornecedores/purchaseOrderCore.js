const asFiniteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const normalizeSupplierName = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('pt-BR');

export const cleanSupplierName = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, ' ');

export const findEquivalentSupplier = (suppliers = [], name = '') => {
  const normalizedName = normalizeSupplierName(name);
  if (!normalizedName) return null;

  return suppliers.find((supplier) => (
    normalizeSupplierName(supplier?.nomeNormalizado || supplier?.nome) === normalizedName
  )) || null;
};

export const searchSuppliers = (suppliers = [], search = '', limit = 50) => {
  const normalizedSearch = normalizeSupplierName(search);
  const sorted = [...suppliers].sort((left, right) => (
    String(left?.nome || '').localeCompare(String(right?.nome || ''), 'pt-BR')
  ));

  if (!normalizedSearch) return sorted.slice(0, limit);

  return sorted
    .filter((supplier) => normalizeSupplierName(supplier?.nome).includes(normalizedSearch))
    .slice(0, limit);
};

export const moneyInputToCents = (value) => {
  if (typeof value === 'number') return Math.max(0, Math.round(value * 100));
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? Number.parseInt(digits, 10) : 0;
};

export const formatCentsAsCurrency = (cents = 0) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
}).format(asFiniteNumber(cents) / 100);

export const calculateItemsSubtotalCents = (items = []) => items.reduce((sum, item) => {
  const quantity = Math.max(0, asFiniteNumber(item?.quantidade));
  const unitCostCents = Number.isInteger(item?.custoUnitarioCentavos)
    ? Math.max(0, item.custoUnitarioCentavos)
    : Math.max(0, Math.round(asFiniteNumber(item?.custoUnitario) * 100));
  return sum + Math.round(quantity * unitCostCents);
}, 0);

export const resolvePurchaseOrderSubtotalCents = (order = {}) => {
  if (Number.isInteger(order.subtotalItensCentavos)) {
    return Math.max(0, order.subtotalItensCentavos);
  }
  return calculateItemsSubtotalCents(order.itens || []);
};

export const resolvePurchaseOrderTotalCents = (order = {}) => {
  if (Number.isInteger(order.valorTotalCentavos)) {
    return Math.max(0, order.valorTotalCentavos);
  }
  if (Number.isInteger(order.valorTotalInformadoCentavos)) {
    return Math.max(0, order.valorTotalInformadoCentavos);
  }
  if (order.valorTotalInformado !== null && order.valorTotalInformado !== undefined && Number.isFinite(Number(order.valorTotalInformado))) {
    return Math.max(0, Math.round(Number(order.valorTotalInformado) * 100));
  }
  if (order.valorTotal !== null && order.valorTotal !== undefined && Number.isFinite(Number(order.valorTotal))) {
    return Math.max(0, Math.round(Number(order.valorTotal) * 100));
  }
  return resolvePurchaseOrderSubtotalCents(order);
};

export const hydratePurchaseOrder = (order = {}) => {
  const subtotalItensCentavos = resolvePurchaseOrderSubtotalCents(order);
  const valorTotalCentavos = resolvePurchaseOrderTotalCents(order);
  const hasExplicitTotal = Number.isInteger(order.valorTotalCentavos)
    || Number.isInteger(order.valorTotalInformadoCentavos)
    || order.totalDefinidoManualmente === true;

  return {
    ...order,
    itens: Array.isArray(order.itens) ? order.itens : [],
    subtotalItensCentavos,
    valorTotalCentavos,
    valorTotal: valorTotalCentavos / 100,
    valorNaoDetalhadoCentavos: valorTotalCentavos - subtotalItensCentavos,
    totalDefinidoManualmente: hasExplicitTotal ? order.totalDefinidoManualmente !== false : false,
    observacaoGeral: order.observacaoGeral || ''
  };
};

export const buildPurchaseOrderMoneyFields = ({
  items = [],
  totalCents = 0,
  manuallyDefined = false
} = {}) => {
  const subtotalItensCentavos = calculateItemsSubtotalCents(items);
  const valorTotalCentavos = Math.max(0, Math.round(asFiniteNumber(totalCents)));
  return {
    subtotalItensCentavos,
    valorTotalCentavos,
    valorTotalInformadoCentavos: valorTotalCentavos,
    valorNaoDetalhadoCentavos: valorTotalCentavos - subtotalItensCentavos,
    totalDefinidoManualmente: manuallyDefined === true,
    // Mantido para telas e documentos anteriores que ainda leem o valor em reais.
    valorTotal: valorTotalCentavos / 100
  };
};
