const asFiniteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const PURCHASE_PAYMENT_METHOD = Object.freeze({
  CASH: 'avista',
  CREDIT_CARD: 'cartao_credito',
  BOLETO: 'boleto'
});

export const PURCHASE_PAYMENT_TYPE = Object.freeze({
  SINGLE: 'avista',
  INSTALLMENTS: 'parcelado'
});

export const isValidIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

const parseIsoDateParts = (value) => {
  if (!isValidIsoDate(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month, day };
};

const formatIsoDateParts = (year, month, day) => (
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
);

export const getLastDayOfMonth = (year, month) => new Date(year, month, 0, 12, 0, 0, 0).getDate();

export const addMonthsClamped = (isoDate, monthsToAdd = 0, preferredDay = null) => {
  const parts = parseIsoDateParts(isoDate);
  if (!parts) return '';
  const baseMonthIndex = (parts.year * 12) + (parts.month - 1) + Number(monthsToAdd || 0);
  const targetYear = Math.floor(baseMonthIndex / 12);
  const targetMonth = (baseMonthIndex % 12) + 1;
  const requestedDay = Math.min(31, Math.max(1, Number(preferredDay || parts.day)));
  return formatIsoDateParts(targetYear, targetMonth, Math.min(requestedDay, getLastDayOfMonth(targetYear, targetMonth)));
};

export const splitCentsIntoInstallments = (totalCents, installmentCount) => {
  const normalizedTotal = Math.max(0, Math.round(asFiniteNumber(totalCents)));
  const count = Math.max(1, Math.trunc(asFiniteNumber(installmentCount, 1)));
  const baseValue = Math.floor(normalizedTotal / count);
  const remainder = normalizedTotal - (baseValue * count);
  return Array.from({ length: count }, (_, index) => (
    index === count - 1 ? baseValue + remainder : baseValue
  ));
};

export const buildSuggestedPaymentSchedule = ({
  paymentMethod = PURCHASE_PAYMENT_METHOD.CREDIT_CARD,
  paymentType = PURCHASE_PAYMENT_TYPE.SINGLE,
  totalCents = 0,
  installmentCount = 1,
  purchaseDate = '',
  firstDueDate = '',
  cardDueDay = null
} = {}) => {
  const count = paymentType === PURCHASE_PAYMENT_TYPE.INSTALLMENTS
    ? Math.max(2, Math.trunc(asFiniteNumber(installmentCount, 2)))
    : 1;
  const values = splitCentsIntoInstallments(totalCents, count);

  return values.map((valueCents, index) => {
    let dueDate = firstDueDate;
    if (paymentMethod === PURCHASE_PAYMENT_METHOD.CASH) dueDate = purchaseDate;
    else if (firstDueDate && index > 0) {
      dueDate = addMonthsClamped(
        firstDueDate,
        index,
        paymentMethod === PURCHASE_PAYMENT_METHOD.CREDIT_CARD ? cardDueDay : null
      );
    }

    return {
      installmentNumber: index + 1,
      installmentCount: count,
      valueCents,
      dueDate: dueDate || ''
    };
  });
};

export const normalizeBoletoSchedule = (schedule = [], installmentCount = 1) => {
  const count = Math.max(1, Math.trunc(asFiniteNumber(installmentCount, 1)));
  return Array.from({ length: count }, (_, index) => {
    const entry = schedule[index] || {};
    return {
      installmentNumber: index + 1,
      installmentCount: count,
      valueCents: Math.max(0, Math.round(asFiniteNumber(entry.valueCents))),
      dueDate: isValidIsoDate(entry.dueDate) ? entry.dueDate : ''
    };
  });
};

export const resolvePurchaseOrderPaymentSchedule = (order = {}) => {
  const paymentMethod = order.formaPagamento || PURCHASE_PAYMENT_METHOD.CREDIT_CARD;
  const paymentType = order.tipoPagamento || PURCHASE_PAYMENT_TYPE.SINGLE;
  const installmentCount = paymentType === PURCHASE_PAYMENT_TYPE.INSTALLMENTS
    ? Math.max(2, Math.trunc(asFiniteNumber(order.quantidadeParcelas, 2)))
    : 1;

  if (paymentMethod === PURCHASE_PAYMENT_METHOD.BOLETO && Array.isArray(order.cronogramaPagamento)) {
    return normalizeBoletoSchedule(order.cronogramaPagamento, installmentCount);
  }

  return buildSuggestedPaymentSchedule({
    paymentMethod,
    paymentType,
    totalCents: resolvePurchaseOrderTotalCents(order),
    installmentCount,
    purchaseDate: order.dataPedido || '',
    firstDueDate: order.primeiroVencimento || '',
    cardDueDay: order.diaVencimentoCartao
  });
};

export const validatePurchaseOrderPayment = (order = {}) => {
  const errors = [];
  const paymentMethod = order.formaPagamento;
  const paymentType = order.tipoPagamento || PURCHASE_PAYMENT_TYPE.SINGLE;
  const totalCents = resolvePurchaseOrderTotalCents(order);

  if (!Object.values(PURCHASE_PAYMENT_METHOD).includes(paymentMethod)) {
    errors.push('Selecione uma forma de pagamento válida.');
  }
  if (totalCents <= 0) errors.push('O valor total do pedido deve ser maior que zero.');

  if (paymentMethod === PURCHASE_PAYMENT_METHOD.CREDIT_CARD) {
    const dueDay = Number(order.diaVencimentoCartao);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      errors.push('Informe o dia do vencimento do cartão entre 1 e 31.');
    }
    if (!parseIsoDateParts(order.primeiroVencimento)) errors.push('Informe um primeiro vencimento válido para o cartão.');
  }

  if (paymentType === PURCHASE_PAYMENT_TYPE.INSTALLMENTS) {
    const count = Number(order.quantidadeParcelas);
    if (!Number.isInteger(count) || count < 2) errors.push('Informe uma quantidade de parcelas maior ou igual a 2.');
  }

  const schedule = resolvePurchaseOrderPaymentSchedule(order);
  if (paymentMethod === PURCHASE_PAYMENT_METHOD.BOLETO) {
    if (schedule.some((entry) => !parseIsoDateParts(entry.dueDate))) {
      errors.push(paymentType === PURCHASE_PAYMENT_TYPE.INSTALLMENTS
        ? 'Informe uma data válida para cada boleto.'
        : 'Informe a data de vencimento do boleto.');
    }
    const scheduleTotal = schedule.reduce((sum, entry) => sum + entry.valueCents, 0);
    if (scheduleTotal !== totalCents) {
      errors.push(`A soma dos boletos difere do total do pedido em ${formatCentsAsCurrency(totalCents - scheduleTotal)}.`);
    }
  }

  return { valid: errors.length === 0, errors, schedule };
};

export const buildPurchaseOrderFinancialEntryId = (purchaseOrderId, installmentNumber) => (
  `pedidoCompra_${purchaseOrderId}_parcela_${installmentNumber}`
);

export const buildPurchaseOrderFinancialEntries = (order = {}, purchaseOrderId = '', context = {}) => {
  const schedule = resolvePurchaseOrderPaymentSchedule(order);
  const isPaidAtPurchase = order.formaPagamento === PURCHASE_PAYMENT_METHOD.CASH;

  return schedule.map((installment) => {
    const id = buildPurchaseOrderFinancialEntryId(purchaseOrderId, installment.installmentNumber);
    return {
      id,
      descricao: `${order.fornecedorNome || 'Fornecedor'} - Pedido #${purchaseOrderId} - Parcela ${installment.installmentNumber}/${installment.installmentCount}`,
      valor: installment.valueCents / 100,
      valorCentavos: installment.valueCents,
      dataVencimento: installment.dueDate || order.dataPedido || '',
      ...(isPaidAtPurchase ? { dataPagamento: order.dataPedido || '' } : {}),
      status: isPaidAtPurchase ? 'Pago' : 'Pendente',
      categoria: 'Fornecedores',
      pedidoCompraId: purchaseOrderId,
      fornecedorId: order.fornecedorId || '',
      fornecedorNome: order.fornecedorNome || '',
      lojaId: context.storeId || order.lojaId || '',
      origem: 'pedido_compra',
      formaPagamento: order.formaPagamento,
      tipoPagamento: order.tipoPagamento || PURCHASE_PAYMENT_TYPE.SINGLE,
      parcelaNumero: installment.installmentNumber,
      parcelasTotal: installment.installmentCount,
      dataCompra: order.dataPedido || '',
      responsavelId: context.userId || '',
      responsavelNome: context.userName || '',
      observacao: order.observacaoGeral || '',
      idempotencyKey: id,
      createdBy: context.userId || '',
      createdByNome: context.userName || ''
    };
  });
};

export const buildPurchaseOrderStockMovementId = (purchaseOrderId, itemId, itemIndex = 0) => (
  `pedidoCompra_${purchaseOrderId}_item_${itemId || itemIndex}`.replace(/[^a-zA-Z0-9_-]/g, '_')
);

export const paymentConfigurationSignature = (order = {}) => JSON.stringify({
  formaPagamento: order.formaPagamento || '',
  tipoPagamento: order.tipoPagamento || '',
  diaVencimentoCartao: order.diaVencimentoCartao || '',
  primeiroVencimento: order.primeiroVencimento || '',
  quantidadeParcelas: order.quantidadeParcelas || 1,
  valorTotalCentavos: resolvePurchaseOrderTotalCents(order),
  cronogramaPagamento: resolvePurchaseOrderPaymentSchedule(order).map((entry) => ({
    valueCents: entry.valueCents,
    dueDate: entry.dueDate
  }))
});

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
  const hasPaymentConfiguration = Object.values(PURCHASE_PAYMENT_METHOD).includes(order.formaPagamento);
  const formaPagamento = hasPaymentConfiguration ? order.formaPagamento : '';
  const tipoPagamento = order.tipoPagamento || PURCHASE_PAYMENT_TYPE.SINGLE;
  const quantidadeParcelas = tipoPagamento === PURCHASE_PAYMENT_TYPE.INSTALLMENTS
    ? Math.max(2, Math.trunc(asFiniteNumber(order.quantidadeParcelas, 2)))
    : 1;

  return {
    ...order,
    itens: Array.isArray(order.itens) ? order.itens : [],
    subtotalItensCentavos,
    valorTotalCentavos,
    valorTotal: valorTotalCentavos / 100,
    valorNaoDetalhadoCentavos: valorTotalCentavos - subtotalItensCentavos,
    totalDefinidoManualmente: hasExplicitTotal ? order.totalDefinidoManualmente !== false : false,
    observacaoGeral: order.observacaoGeral || '',
    formaPagamento,
    tipoPagamento,
    diaVencimentoCartao: order.diaVencimentoCartao || '',
    primeiroVencimento: order.primeiroVencimento || '',
    quantidadeParcelas,
    cronogramaPagamento: Array.isArray(order.cronogramaPagamento) ? order.cronogramaPagamento : [],
    mercadoriaEmMaos: order.mercadoriaEmMaos === true,
    configuracaoPagamentoDefinida: hasPaymentConfiguration || order.configuracaoPagamentoDefinida === true
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
