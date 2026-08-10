import {
  buildPurchaseOrderMoneyFields,
  calculateItemsSubtotalCents,
  cleanSupplierName,
  findEquivalentSupplier,
  formatCentsAsCurrency,
  hydratePurchaseOrder,
  moneyInputToCents,
  normalizeSupplierName,
  resolvePurchaseOrderTotalCents,
  searchSuppliers
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
      totalDefinidoManualmente: false
    });
  });
});
