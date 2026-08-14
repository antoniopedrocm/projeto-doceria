import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Boxes,
  Download,
  FileText,
  PackageCheck,
  RefreshCw,
  Store,
  Truck,
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebaseConfig';

const STATUS_LABELS = {
  aguardando_conferencia: 'Aguardando conferência',
  conferencia_sem_divergencia: 'Conferida sem divergência',
  conferencia_com_divergencia: 'Conferida com divergência',
  pagamento_informado: 'Pagamento informado',
  pagamento_confirmado: 'Pagamento confirmado',
  pagamento_contestado: 'Pagamento contestado',
};

const localIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
};

const initialFilters = () => {
  const today = new Date();
  return {
    startDate: localIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    endDate: localIsoDate(today),
    origemId: '',
    destinoId: '',
    produtoId: '',
    productSearch: '',
    status: '',
    topLimit: 5,
  };
};

const currency = (value) => (Number(value) || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const quantity = (value) => (Number(value) || 0).toLocaleString('pt-BR', {
  maximumFractionDigits: 3,
});
const dateLabel = (value) => {
  if (!value) return '-';
  const parts = String(value).slice(0, 10).split('-');
  return parts.length === 3 ? parts.reverse().join('/') : value;
};
const errorMessage = (error) => String(
    error?.message || 'Não foi possível gerar o relatório.',
).replace(/^FirebaseError:\s*/i, '');

const Field = ({label, children}) => (
  <label className="space-y-1 text-sm font-medium text-gray-700">
    <span>{label}</span>
    {children}
  </label>
);

const Select = (props) => (
  <select
    {...props}
    className={'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 ' +
      'text-sm focus:border-pink-500 focus:outline-none focus:ring-2 ' +
      'focus:ring-pink-100 ' + (props.className || '')}
  />
);

const Input = (props) => (
  <input
    {...props}
    className={'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm ' +
      'focus:border-pink-500 focus:outline-none focus:ring-2 ' +
      'focus:ring-pink-100 ' + (props.className || '')}
  />
);

const MetricCard = ({icon: Icon, label, value}) => (
  <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {label}
        </p>
        <p className="mt-1 text-xl font-bold text-gray-800">{value}</p>
      </div>
      <span className="rounded-lg bg-pink-50 p-2 text-pink-600">
        <Icon className="h-5 w-5" />
      </span>
    </div>
  </div>
);

const EmptyState = () => (
  <div className="rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center">
    <PackageCheck className="mx-auto h-10 w-10 text-gray-300" />
    <p className="mt-3 font-medium text-gray-700">
      Nenhuma remessa efetiva encontrada
    </p>
    <p className="mt-1 text-sm text-gray-500">
      Ajuste o período ou os filtros e gere o relatório novamente.
    </p>
  </div>
);

const EntreLojasReport = ({
  currentUser,
  availableStores = [],
  storeInfoMap = {},
}) => {
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [report, setReport] = useState(null);
  const [knownProducts, setKnownProducts] = useState([]);
  const [allowedStatuses, setAllowedStatuses] = useState(
      Object.keys(STATUS_LABELS),
  );
  const [allowedStoreIds, setAllowedStoreIds] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [selectedProductKey, setSelectedProductKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const initialLoad = useRef(false);

  const storeOptions = useMemo(() => {
    const allowed = allowedStoreIds ? new Set(allowedStoreIds) : null;
    return availableStores
        .filter((storeId) => !allowed || allowed.has(storeId))
        .map((storeId) => ({
          id: storeId,
          name: storeInfoMap[storeId]?.nome || storeId,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [allowedStoreIds, availableStores, storeInfoMap]);

  const loadReport = useCallback(async (nextFilters) => {
    setLoading(true);
    setReportError('');
    try {
      const selectedProduct = knownProducts.find((product) =>
        product.name.toLowerCase() ===
          String(nextFilters.productSearch || '').trim().toLowerCase(),
      );
      const payload = {
        startDate: nextFilters.startDate,
        endDate: nextFilters.endDate,
        origemId: nextFilters.origemId,
        destinoId: nextFilters.destinoId,
        produtoId: selectedProduct?.id || nextFilters.produtoId || '',
        status: nextFilters.status,
        topLimit: Number(nextFilters.topLimit) === 10 ? 10 : 5,
      };
      const callable = httpsCallable(functions, 'getEntreLojasReport');
      const response = await callable(payload);
      const nextReport = response.data || {};
      setReport(nextReport);
      setAppliedFilters({...nextFilters, produtoId: payload.produtoId});
      setAllowedStatuses(
          nextReport.filters?.allowedStatuses || Object.keys(STATUS_LABELS),
      );
      setAllowedStoreIds(nextReport.filters?.allowedStoreIds || null);
      setKnownProducts((previous) => {
        const byId = new Map(previous.map((product) => [product.id, product]));
        (nextReport.productOptions || []).forEach((product) => {
          byId.set(product.id, product);
        });
        return Array.from(byId.values()).sort((a, b) =>
          a.name.localeCompare(b.name, 'pt-BR'));
      });
      setSelectedProductKey('');
    } catch (error) {
      console.error('[Relatórios] Erro ao consultar remessas:', error);
      setReportError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [knownProducts]);

  useEffect(() => {
    if (initialLoad.current) return;
    initialLoad.current = true;
    loadReport(filters);
  }, [filters, loadReport]);

  const updateFilter = (key) => (event) => {
    const value = event.target.value;
    setFilters((previous) => ({
      ...previous,
      [key]: value,
      ...(key === 'productSearch' ? {produtoId: ''} : {}),
    }));
  };

  const submit = (event) => {
    event.preventDefault();
    loadReport(filters);
  };

  const clearFilters = () => {
    const reset = initialFilters();
    setFilters(reset);
    loadReport(reset);
  };

  const filteredDetail = useMemo(() => {
    const rows = report?.detail || [];
    if (!selectedProductKey) return rows;
    return rows.filter((row) => row.productKey === selectedProductKey);
  }, [report, selectedProductKey]);

  const openDrillDown = (productKey) => {
    setSelectedProductKey(productKey);
    setActiveTab('detail');
  };

  const selectedStoreName = (storeId) => {
    if (!storeId) return 'Todas as lojas permitidas';
    return storeInfoMap[storeId]?.nome || storeId;
  };

  const exportPdf = () => {
    if (!report?.summary?.length || typeof window.jspdf === 'undefined') {
      setReportError('A biblioteca de PDF não está disponível neste navegador.');
      return;
    }
    const {jsPDF} = window.jspdf;
    const pdf = new jsPDF({orientation: 'landscape'});
    const generatedAt = new Date();
    const userName = currentUser?.nome || currentUser?.name ||
      currentUser?.auth?.displayName || currentUser?.auth?.email ||
      currentUser?.email || 'Usuário';
    pdf.setFontSize(15);
    pdf.text('Ana Guimarães Doceria', 14, 14);
    pdf.setFontSize(12);
    pdf.text('Relatório de Remessas entre Lojas', 14, 21);
    pdf.setFontSize(9);
    pdf.text(
        'Período: ' + dateLabel(appliedFilters.startDate) + ' a ' +
        dateLabel(appliedFilters.endDate),
        14,
        28,
    );
    pdf.text(
        'Origem: ' + selectedStoreName(appliedFilters.origemId) +
        ' | Destino: ' + selectedStoreName(appliedFilters.destinoId) +
        ' | Status: ' +
        (STATUS_LABELS[appliedFilters.status] || 'Todos os válidos'),
        14,
        34,
    );
    pdf.autoTable({
      startY: 40,
      head: [[
        'Produto', 'Quantidade', 'Remessas', 'Unidade', 'Repasse', 'Revenda',
      ]],
      body: report.summary.map((row) => [
        row.productName,
        quantity(row.quantity),
        row.transferCount,
        row.unit || '-',
        currency(row.transferTotal),
        currency(row.resaleTotal),
      ]),
      styles: {fontSize: 8},
      headStyles: {fillColor: [219, 39, 119]},
      didDrawPage: (data) => {
        const page = pdf.internal.getNumberOfPages();
        const footer = 'Gerado em ' +
          generatedAt.toLocaleString('pt-BR') + ' por ' + userName +
          ' | Página ' + page;
        pdf.setFontSize(8);
        pdf.text(
            footer,
            14,
            pdf.internal.pageSize.height - 7,
        );
      },
      margin: {bottom: 14},
    });
    pdf.save(
        'relatorio-remessas-' + appliedFilters.startDate + '-' +
        appliedFilters.endDate + '.pdf',
    );
  };

  const exportSpreadsheet = () => {
    if (!report?.detail?.length) return;
    const rows = report.detail.map((row) => ({
      Remessa: '#' + row.transferNumber,
      Data: dateLabel(row.date),
      Origem: row.originName,
      Destino: row.destinationName,
      Produto: row.productName,
      Quantidade: row.quantity,
      Repasse: row.transferTotal,
      Revenda: row.resaleTotal,
      Status: STATUS_LABELS[row.status] || row.status,
      Fechamento: row.closing,
      Responsável: row.responsible,
    }));
    if (window.XLSX) {
      const workbook = window.XLSX.utils.book_new();
      const summarySheet = window.XLSX.utils.json_to_sheet(
          report.summary.map((row) => ({
            Produto: row.productName,
            Quantidade: row.quantity,
            Remessas: row.transferCount,
            Unidade: row.unit || '',
            Repasse: row.transferTotal,
            Revenda: row.resaleTotal,
          })),
      );
      const detailSheet = window.XLSX.utils.json_to_sheet(rows);
      window.XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumo');
      window.XLSX.utils.book_append_sheet(workbook, detailSheet, 'Remessas');
      window.XLSX.writeFile(
          workbook,
          'relatorio-remessas-' + appliedFilters.startDate + '.xlsx',
      );
      return;
    }
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(';'),
      ...rows.map((row) => headers.map((header) =>
        '"' + String(row[header] ?? '').replace(/"/g, '""') + '"',
      ).join(';')),
    ].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(
        ['\uFEFF' + csv],
        {type: 'text/csv;charset=utf-8'},
    ));
    link.download = 'relatorio-remessas-' + appliedFilters.startDate + '.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const totals = report?.totals || {};
  const hasRows = Boolean(report?.summary?.length);

  return (
    <div className="space-y-5">
      <form
        onSubmit={submit}
        className="rounded-2xl border border-gray-100 bg-white p-4 shadow-lg"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Data inicial">
            <Input
              type="date"
              value={filters.startDate}
              onChange={updateFilter('startDate')}
              required
            />
          </Field>
          <Field label="Data final">
            <Input
              type="date"
              value={filters.endDate}
              onChange={updateFilter('endDate')}
              required
            />
          </Field>
          <Field label="Loja origem">
            <Select value={filters.origemId} onChange={updateFilter('origemId')}>
              <option value="">Todas as lojas permitidas</option>
              {storeOptions.map((storeOption) => (
                <option key={storeOption.id} value={storeOption.id}>
                  {storeOption.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Loja destino">
            <Select
              value={filters.destinoId}
              onChange={updateFilter('destinoId')}
            >
              <option value="">Todas as lojas permitidas</option>
              {storeOptions.map((storeOption) => (
                <option key={storeOption.id} value={storeOption.id}>
                  {storeOption.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Produto">
            <Input
              list="entre-lojas-report-products"
              placeholder="Todos os produtos"
              value={filters.productSearch}
              onChange={updateFilter('productSearch')}
            />
            <datalist id="entre-lojas-report-products">
              {knownProducts.map((product) => (
                <option key={product.id} value={product.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Status">
            <Select value={filters.status} onChange={updateFilter('status')}>
              <option value="">Todos os status válidos</option>
              {allowedStatuses.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status] || status}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ranking">
            <Select value={filters.topLimit} onChange={updateFilter('topLimit')}>
              <option value={5}>Top 5</option>
              <option value={10}>Top 10</option>
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pink-700 disabled:opacity-60"
            >
              <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />
              {loading ? 'Gerando...' : 'Gerar relatório'}
            </button>
            <button
              type="button"
              onClick={clearFilters}
              disabled={loading}
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Limpar
            </button>
          </div>
        </div>
      </form>

      {reportError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {reportError}
        </div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              icon={Truck}
              label="Total de remessas"
              value={quantity(totals.transferCount)}
            />
            <MetricCard
              icon={PackageCheck}
              label="Produtos enviados"
              value={quantity(totals.quantity)}
            />
            <MetricCard
              icon={Boxes}
              label="Produtos diferentes"
              value={quantity(totals.productCount)}
            />
            <MetricCard
              icon={BarChart3}
              label="Total de repasse"
              value={currency(totals.transferTotal)}
            />
            <MetricCard
              icon={Store}
              label="Total de revenda"
              value={currency(totals.resaleTotal)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-xl border border-gray-200 bg-white p-1">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('summary');
                  setSelectedProductKey('');
                }}
                className={'rounded-lg px-4 py-2 text-sm font-semibold ' +
                  (activeTab === 'summary' ?
                    'bg-pink-600 text-white' : 'text-gray-600 hover:bg-gray-50')}
              >
                Resumo por Produto
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('detail')}
                className={'rounded-lg px-4 py-2 text-sm font-semibold ' +
                  (activeTab === 'detail' ?
                    'bg-pink-600 text-white' : 'text-gray-600 hover:bg-gray-50')}
              >
                Detalhado por Remessa
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportPdf}
                disabled={!hasRows}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <FileText className="h-4 w-4" /> Exportar PDF
              </button>
              <button
                type="button"
                onClick={exportSpreadsheet}
                disabled={!report?.detail?.length}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> Exportar Excel/CSV
              </button>
            </div>
          </div>

          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg">
            {!hasRows ? <EmptyState /> : activeTab === 'summary' ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Produto</th>
                      <th className="px-4 py-3 text-right">Qtde enviada</th>
                      <th className="px-4 py-3 text-right">Remessas</th>
                      <th className="px-4 py-3">Unidade</th>
                      {appliedFilters.origemId && <th className="px-4 py-3">Origem</th>}
                      {appliedFilters.destinoId && <th className="px-4 py-3">Destino</th>}
                      <th className="px-4 py-3 text-right">Repasse total</th>
                      <th className="px-4 py-3 text-right">Revenda total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.summary.map((row) => (
                      <tr key={row.productKey} className="hover:bg-pink-50/40">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => openDrillDown(row.productKey)}
                            className="font-semibold text-pink-700 hover:underline"
                          >
                            {row.productName}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {quantity(row.quantity)}
                        </td>
                        <td className="px-4 py-3 text-right">{row.transferCount}</td>
                        <td className="px-4 py-3">{row.unit || '-'}</td>
                        {appliedFilters.origemId && (
                          <td className="px-4 py-3">
                            {selectedStoreName(appliedFilters.origemId)}
                          </td>
                        )}
                        {appliedFilters.destinoId && (
                          <td className="px-4 py-3">
                            {selectedStoreName(appliedFilters.destinoId)}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right">
                          {currency(row.transferTotal)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {currency(row.resaleTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div>
                {selectedProductKey && (
                  <div className="flex items-center justify-between border-b border-pink-100 bg-pink-50 px-4 py-3">
                    <p className="text-sm font-medium text-pink-800">
                      Exibindo as remessas que formam o total do produto selecionado.
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedProductKey('')}
                      className="text-sm font-semibold text-pink-700 hover:underline"
                    >
                      Mostrar todos
                    </button>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                      <tr>
                        {[
                          'Remessa', 'Data', 'Origem', 'Destino', 'Produto',
                          'Qtde', 'Repasse', 'Revenda', 'Status', 'Fechamento',
                          'Responsável',
                        ].map((header) => (
                          <th key={header} className="whitespace-nowrap px-4 py-3">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredDetail.map((row) => (
                        <tr
                          key={row.transferId + ':' + row.productKey}
                          className="hover:bg-pink-50/40"
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-semibold">
                            #{row.transferNumber}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">{dateLabel(row.date)}</td>
                          <td className="whitespace-nowrap px-4 py-3">{row.originName}</td>
                          <td className="whitespace-nowrap px-4 py-3">{row.destinationName}</td>
                          <td className="whitespace-nowrap px-4 py-3">{row.productName}</td>
                          <td className="px-4 py-3 text-right">{quantity(row.quantity)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">{currency(row.transferTotal)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">{currency(row.resaleTotal)}</td>
                          <td className="whitespace-nowrap px-4 py-3">{STATUS_LABELS[row.status] || row.status}</td>
                          <td className="whitespace-nowrap px-4 py-3">{row.closing}</td>
                          <td className="whitespace-nowrap px-4 py-3">{row.responsible}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {hasRows && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-lg">
                <h3 className="font-bold text-gray-800">Produtos mais enviados</h3>
                <div className="mt-4 space-y-3">
                  {report.summary.slice(0, Number(filters.topLimit)).map((row, index) => (
                    <div key={row.productKey} className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pink-100 text-xs font-bold text-pink-700">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                        {row.productName}
                      </span>
                      <span className="text-sm font-bold text-gray-800">
                        {quantity(row.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {!appliedFilters.destinoId && (
                <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-lg">
                  <h3 className="font-bold text-gray-800">
                    Lojas que mais receberam produtos
                  </h3>
                  <div className="mt-4 space-y-3">
                    {(report.topDestinations || [])
                        .slice(0, Number(filters.topLimit))
                        .map((row, index) => (
                          <div key={row.storeId} className="flex items-center gap-3">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-700">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-gray-700">{row.storeName}</p>
                              <p className="text-xs text-gray-500">
                                {row.transferCount} remessas · {currency(row.transferTotal)}
                              </p>
                            </div>
                            <span className="text-sm font-bold text-gray-800">
                              {quantity(row.quantity)}
                            </span>
                          </div>
                        ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EntreLojasReport;
