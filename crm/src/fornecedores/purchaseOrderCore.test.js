import {
  PURCHASE_PAYMENT_METHOD,
  PURCHASE_PAYMENT_TYPE,
  addMonthsClamped,
  buildPurchaseOrderFinancialEntryId,
  buildPurchaseOrderFinancialEntries,
  buildPurchaseOrderStockMovementId,
  buildSuggestedPaymentSchedule,
  buildPurchaseOrderMoneyFields,
  calculateItemsSubtotalCents,
  cleanSupplierName,
  findEquivalentSupplier,
  formatCentsAsCurrency,
  hydratePurchaseOrder,
  moneyInputToCents,
  normalizeSupplierName,
  paymentConfigurationSignature,
  resolvePurchaseOrderTotalCents,
  searchSuppliers,
  splitCentsIntoInstallments,
  validatePurchaseOrderPayment
} from './purchaseOrderCore';

describe('purchaseOrderCore', () => {
  test('normaliza e encontra fornecedor equivalente sem duplicar por caixa, acento ou espacos', () => {
    const suppliers = [{ id: '1', nome: '  Casa   do Confeiteiro  ' }];

    expect(normalizeSupplierName('CASA DO CONFEITÉIRO')).toBe('casa do confeiteiro');
    expect(cleanSupplierName('  Casa   do Confeiteiro  ')).toBe('Casa do Confeiteiro');
    expect(findEquivalentSupplier(suppliers, 'casa do confeitéiro')).toEqual(suppliers[0]);
  });

  test('busca por parte do nome ignorando caixa, acento e espacos extras', () => {
    const suppliers = [
      { id: '1', nome: 'Atacadão' },
      { id: '2', nome: 'Atacadista Goiás' },
      { id: '3', nome: 'Mercado Central' }
    ];

    expect(searchSuppliers(suppliers, '  ATAC  ')).toHaveLength(2);
    expect(searchSuppliers(suppliers, 'goias').map((item) => item.id)).toEqual(['2']);
  });

  test('calcula subtotal em centavos e preserva total manual diferente', () => {
    const items = [
      { quantidade: 2, custoUnitario: 60 },
      { quantidade: 1, custoUnitarioCentavos: 8000 }
    ];

    expect(calculateItemsSubtotalCents(items)).toBe(20000);
    const moneyFields = buildPurchaseOrderMoneyFields({
      items,
      totalCents: 48750,
      manuallyDefined: true
    });
    expect(moneyFields).toEqual({
      subtotalItensCentavos: 20000,
      valorTotalCentavos: 48750,
      valorTotalInformadoCentavos: 48750,
      valorNaoDetalhadoCentavos: 28750,
      totalDefinidoManualmente: true,
      valorTotal: 487.5
    });
    expect(resolvePurchaseOrderTotalCents(moneyFields)).toBe(48750);
    expect(formatCentsAsCurrency(moneyFields.valorNaoDetalhadoCentavos)).toBe('R$ 287,50');
  });

  test('aceita pedido sem itens quando um total monetario e informado', () => {
    expect(moneyInputToCents('R$ 320,00')).toBe(32000);
    expect(buildPurchaseOrderMoneyFields({ items: [], totalCents: 32000 })).toMatchObject({
      subtotalItensCentavos: 0,
      valorTotalCentavos: 32000,
      valorNaoDetalhadoCentavos: 32000
    });
  });

  test('mantem diferenca negativa para desconto comercial', () => {
    expect(buildPurchaseOrderMoneyFields({
      items: [{ quantidade: 1, custoUnitario: 500 }],
      totalCents: 48000,
      manuallyDefined: true
    }).valorNaoDetalhadoCentavos).toBe(-2000);
  });

  test('mantem compatibilidade de pedidos antigos sem novos campos', () => {
    const oldOrder = {
      itens: [{ quantidade: 2, custoUnitario: 100 }],
      valorTotal: 200
    };

    expect(resolvePurchaseOrderTotalCents(oldOrder)).toBe(20000);
    expect(hydratePurchaseOrder(oldOrder)).toMatchObject({
      subtotalItensCentavos: 20000,
      valorTotalCentavos: 20000,
      valorNaoDetalhadoCentavos: 0,
      totalDefinidoManualmente: false,
      formaPagamento: '',
      configuracaoPagamentoDefinida: false
    });
  });

  test('divide centavos sem perda e joga o residuo na ultima parcela', () => {
    expect(splitCentsIntoInstallments(10000, 3)).toEqual([3333, 3333, 3334]);
    expect(splitCentsIntoInstallments(100000, 3)).toEqual([33333, 33333, 33334]);
  });

  test('gera cartao parcelado com vencimentos mensais e limita dia 31 ao ultimo dia', () => {
    expect(addMonthsClamped('2027-01-31', 1, 31)).toBe('2027-02-28');
    expect(addMonthsClamped('2028-01-31', 1, 31)).toBe('2028-02-29');

    expect(buildSuggestedPaymentSchedule({
      paymentMethod: PURCHASE_PAYMENT_METHOD.CREDIT_CARD,
      paymentType: PURCHASE_PAYMENT_TYPE.INSTALLMENTS,
      totalCents: 10000,
      installmentCount: 3,
      firstDueDate: '2027-01-31',
      cardDueDay: 31
    })).toEqual([
      { installmentNumber: 1, installmentCount: 3, valueCents: 3333, dueDate: '2027-01-31' },
      { installmentNumber: 2, installmentCount: 3, valueCents: 3333, dueDate: '2027-02-28' },
      { installmentNumber: 3, installmentCount: 3, valueCents: 3334, dueDate: '2027-03-31' }
    ]);
  });

  test('preserva datas e valores personalizados do boleto quando a soma confere', () => {
    const order = {
      formaPagamento: PURCHASE_PAYMENT_METHOD.BOLETO,
      tipoPagamento: PURCHASE_PAYMENT_TYPE.INSTALLMENTS,
      quantidadeParcelas: 3,
      valorTotalCentavos: 100000,
      cronogramaPagamento: [
        { valueCents: 33333, dueDate: '2026-08-15' },
        { valueCents: 33333, dueDate: '2026-09-22' },
        { valueCents: 33334, dueDate: '2026-10-18' }
      ]
    };

    expect(validatePurchaseOrderPayment(order)).toMatchObject({ valid: true });
    expect(validatePurchaseOrderPayment(order).schedule.map((entry) => entry.dueDate)).toEqual([
      '2026-08-15', '2026-09-22', '2026-10-18'
    ]);
  });

  test('bloqueia boleto cuja soma difere do total', () => {
    const validation = validatePurchaseOrderPayment({
      formaPagamento: PURCHASE_PAYMENT_METHOD.BOLETO,
      tipoPagamento: PURCHASE_PAYMENT_TYPE.INSTALLMENTS,
      quantidadeParcelas: 3,
      valorTotalCentavos: 100000,
      cronogramaPagamento: [
        { valueCents: 33333, dueDate: '2026-08-20' },
        { valueCents: 33333, dueDate: '2026-09-20' },
        { valueCents: 33333, dueDate: '2026-10-20' }
      ]
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toContain('R$ 0,01');
  });

  test('valida cartao 1x e exige dia e primeiro vencimento', () => {
    const invalid = validatePurchaseOrderPayment({
      formaPagamento: PURCHASE_PAYMENT_METHOD.CREDIT_CARD,
      tipoPagamento: PURCHASE_PAYMENT_TYPE.SINGLE,
      valorTotalCentavos: 10000,
      diaVencimentoCartao: 32,
      primeiroVencimento: ''
    });
    expect(invalid.valid).toBe(false);

    const valid = validatePurchaseOrderPayment({
      formaPagamento: PURCHASE_PAYMENT_METHOD.CREDIT_CARD,
      tipoPagamento: PURCHASE_PAYMENT_TYPE.SINGLE,
      valorTotalCentavos: 10000,
      diaVencimentoCartao: 10,
      primeiroVencimento: '2026-09-10'
    });
    expect(valid).toMatchObject({ valid: true });
    expect(valid.schedule).toEqual([
      { installmentNumber: 1, installmentCount: 1, valueCents: 10000, dueDate: '2026-09-10' }
    ]);
  });

  test('gera chaves deterministicas para impedir duplicidade financeira e de estoque', () => {
    expect(buildPurchaseOrderFinancialEntryId('PC123', 2)).toBe('pedidoCompra_PC123_parcela_2');
    expect(buildPurchaseOrderFinancialEntryId('PC123', 2)).toBe(buildPurchaseOrderFinancialEntryId('PC123', 2));
    expect(buildPurchaseOrderStockMovementId('PC123', 'item/abc', 0)).toBe('pedidoCompra_PC123_item_item_abc');
  });

  test('gera somente uma despesa paga para compra à vista', () => {
    const entries = buildPurchaseOrderFinancialEntries({
      fornecedorNome: 'Assaí',
      fornecedorId: 'fornecedor-1',
      formaPagamento: PURCHASE_PAYMENT_METHOD.CASH,
      tipoPagamento: PURCHASE_PAYMENT_TYPE.SINGLE,
      dataPedido: '2026-08-10',
      valorTotalCentavos: 10000
    }, 'PC100', { storeId: 'loja-1', userId: 'user-1' });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: 'pedidoCompra_PC100_parcela_1',
      valorCentavos: 10000,
      dataVencimento: '2026-08-10',
      dataPagamento: '2026-08-10',
      status: 'Pago',
      pedidoCompraId: 'PC100',
      lojaId: 'loja-1'
    });
  });

  test('cartão e boleto geram apenas parcelas pendentes cuja soma é o total', () => {
    const cardEntries = buildPurchaseOrderFinancialEntries({
      fornecedorNome: 'Assaí',
      formaPagamento: PURCHASE_PAYMENT_METHOD.CREDIT_CARD,
      tipoPagamento: PURCHASE_PAYMENT_TYPE.INSTALLMENTS,
      quantidadeParcelas: 3,
      diaVencimentoCartao: 10,
      primeiroVencimento: '2026-09-10',
      valorTotalCentavos: 10000
    }, 'PC-CARD');
    expect(cardEntries).toHaveLength(3);
    expect(cardEntries.map((entry) => entry.valorCentavos)).toEqual([3333, 3333, 3334]);
    expect(cardEntries.every((entry) => entry.status === 'Pendente')).toBe(true);
    expect(cardEntries.reduce((sum, entry) => sum + entry.valorCentavos, 0)).toBe(10000);

    const boletoEntries = buildPurchaseOrderFinancialEntries({
      fornecedorNome: 'Fornecedor X',
      formaPagamento: PURCHASE_PAYMENT_METHOD.BOLETO,
      tipoPagamento: PURCHASE_PAYMENT_TYPE.INSTALLMENTS,
      quantidadeParcelas: 3,
      valorTotalCentavos: 100000,
      cronogramaPagamento: [
        { valueCents: 33333, dueDate: '2026-08-15' },
        { valueCents: 33333, dueDate: '2026-09-22' },
        { valueCents: 33334, dueDate: '2026-10-18' }
      ]
    }, 'PC-BOLETO');
    expect(boletoEntries).toHaveLength(3);
    expect(boletoEntries.map((entry) => entry.dataVencimento)).toEqual(['2026-08-15', '2026-09-22', '2026-10-18']);
    expect(boletoEntries.reduce((sum, entry) => sum + entry.valorCentavos, 0)).toBe(100000);
    expect(new Set(boletoEntries.map((entry) => entry.id)).size).toBe(3);
  });

  test('boleto único gera somente uma despesa pendente no vencimento informado', () => {
    const entries = buildPurchaseOrderFinancialEntries({
      fornecedorNome: 'Fornecedor X',
      formaPagamento: PURCHASE_PAYMENT_METHOD.BOLETO,
      tipoPagamento: PURCHASE_PAYMENT_TYPE.SINGLE,
      primeiroVencimento: '2026-08-25',
      valorTotalCentavos: 50000,
      cronogramaPagamento: [{ valueCents: 50000, dueDate: '2026-08-25' }]
    }, 'PC-UNICO');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      valorCentavos: 50000,
      dataVencimento: '2026-08-25',
      status: 'Pendente',
      parcelaNumero: 1,
      parcelasTotal: 1
    });
  });

  test('assinatura financeira detecta alteração posterior de valor ou vencimento', () => {
    const base = {
      formaPagamento: PURCHASE_PAYMENT_METHOD.BOLETO,
      tipoPagamento: PURCHASE_PAYMENT_TYPE.SINGLE,
      quantidadeParcelas: 1,
      valorTotalCentavos: 50000,
      cronogramaPagamento: [{ valueCents: 50000, dueDate: '2026-08-25' }]
    };
    expect(paymentConfigurationSignature(base)).not.toBe(paymentConfigurationSignature({
      ...base,
      cronogramaPagamento: [{ valueCents: 50000, dueDate: '2026-08-26' }]
    }));
    expect(paymentConfigurationSignature(base)).not.toBe(paymentConfigurationSignature({
      ...base,
      valorTotalCentavos: 51000,
      cronogramaPagamento: [{ valueCents: 51000, dueDate: '2026-08-25' }]
    }));
  });
});
