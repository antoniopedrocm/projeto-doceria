import React, {useCallback, useEffect, useRef, useState} from 'react';

const documentName = (model) => model === 55 ? 'NF-e' : 'NFC-e';
const environmentName = (environment) => environment === 'production' ? 'Produção (tpAmb=1)' : 'Homologação (tpAmb=2)';
const requestId = () => window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;

export default function FiscalNumberingControls({call, reloadKey, canManage, Modal, Button}) {
  const [data, setData] = useState(null);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const confirming = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const currentGeneration = ++generation.current;
    setLoading(true);
    try {
      const response = await call('fiscalGetNumbering', {});
      if (!mounted.current || currentGeneration !== generation.current) return;
      setData(response);
      setValues(Object.fromEntries(response.sequences.map((row) => [row.model, String(row.nextNumber)])));
    } catch (failure) {
      if (mounted.current && currentGeneration === generation.current) { setData(null); setError(failure?.message || 'Não foi possível carregar a numeração fiscal.'); }
    } finally { if (mounted.current && currentGeneration === generation.current) setLoading(false); }
  }, [call]);
  useEffect(() => { mounted.current = true; setPending(null); load(); return () => { mounted.current = false; generation.current++; }; }, [load, reloadKey]);

  const prepare = (row) => {
    const raw = values[row.model] || '';
    const nextNumber = Number(raw);
    setError(''); setMessage('');
    if (!/^\d{1,9}$/.test(raw) || nextNumber < 1 || nextNumber > 999999999) {
      setError('Informe um próximo número inteiro entre 1 e 999999999.'); return;
    }
    if (nextNumber === row.nextNumber || !canManage || !data.canManage) return;
    setPending({...row, newNumber: nextNumber, changeRequestId: requestId()});
  };
  const confirm = async () => {
    if (!pending || confirming.current || busy) return;
    confirming.current = true; setBusy(true); setError('');
    try {
      await call('fiscalSetNextNumber', {
        model: pending.model, series: pending.series, environment: pending.environment, issuerCnpj: pending.issuerCnpj,
        nextNumber: pending.newNumber, expectedNextNumber: pending.nextNumber, expectedRevision: pending.revision,
        changeRequestId: pending.changeRequestId, confirmed: true,
      });
      if (mounted.current) {
        setPending(null);
        setMessage(`Próximo número da ${documentName(pending.model)} alterado para ${pending.newNumber}.`);
        await load();
      }
    } catch (failure) {
      if (mounted.current) {
        setError(failure?.message || 'Não foi possível alterar a numeração fiscal.');
        setPending(null);
        await load();
      }
    } finally { confirming.current = false; if (mounted.current) setBusy(false); }
  };

  return <section className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 space-y-4" aria-label="Numeração fiscal">
    <div className="flex flex-wrap justify-between gap-3">
      <h3 className="text-lg font-bold text-gray-800">Numeração fiscal</h3>
      <Button type="button" variant="secondary" disabled={loading || busy} onClick={load}>Atualizar numeração</Button>
    </div>
    <p className="text-sm text-gray-600">Próximo número é o próximo nNF de uma NOVA emissão. Rascunho, prévia e checagem não reservam números. Os valores abaixo correspondem ao emitente, ambiente e séries salvos na configuração fiscal.</p>
    <p className="text-sm text-gray-600">A ausência de um número no sistema não comprova disponibilidade na SEFAZ. Em caso de rejeição 539 por duplicidade, confira o histórico fiscal e revise a numeração antes de uma nova emissão.</p>
    {loading && <p>Carregando numeração fiscal...</p>}
    {error && <p role="alert" className="p-3 rounded-xl bg-red-50 text-red-800">{error}</p>}
    {message && <p role="status" className="p-3 rounded-xl bg-green-50 text-green-800">{message}</p>}
    {!loading && data && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {data.sequences.map((row) => <div key={row.model} className="rounded-xl border border-gray-200 p-4 space-y-3">
        <h4 className="font-semibold">{documentName(row.model)} — Modelo {row.model}</h4>
        <p className="text-sm">Emitente: {row.issuerCnpj}<br />Série: {String(row.series).padStart(3, '0')}<br />Ambiente: {environmentName(row.environment)}</p>
        <label className="block text-sm font-medium" htmlFor={`fiscal-number-${row.model}`}>Próximo número da {documentName(row.model)}</label>
        <input id={`fiscal-number-${row.model}`} type="text" inputMode="numeric" maxLength={9} value={values[row.model] ?? ''}
          disabled={!canManage || !data.canManage || busy} className="w-full px-4 py-3 border rounded-xl border-gray-300"
          onChange={(event) => setValues({...values, [row.model]: event.target.value})} />
        {canManage && data.canManage && <Button type="button" disabled={busy || Number(values[row.model]) === row.nextNumber} onClick={() => prepare(row)}>Salvar numeração {documentName(row.model)}</Button>}
      </div>)}
    </div>}
    <Modal isOpen={Boolean(pending)} onClose={() => { if (!busy && !confirming.current) setPending(null); }} title={`Alterar próximo número da ${documentName(pending?.model)}?`} size="md">
      {pending && <div className="space-y-4">
        <p>Emitente: {pending.issuerCnpj}<br />Modelo: {pending.model}<br />Série: {String(pending.series).padStart(3, '0')}<br />Ambiente: {environmentName(pending.environment)}</p>
        <p>Próximo número atual: <strong>{pending.nextNumber}</strong><br />Novo próximo número: <strong>{pending.newNumber}</strong></p>
        {pending.newNumber < pending.nextNumber ? <p role="alert" className="p-3 rounded-xl border border-red-300 bg-red-50 text-red-800 font-semibold">Atenção: redução de numeração. Pode causar reutilização de números fiscais. Números conhecidos como usados, reservados ou inutilizados serão bloqueados.</p> :
          <p role="alert" className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900">Esta alteração poderá criar uma lacuna fiscal. Números não utilizados podem exigir inutilização.</p>}
        <p>Essa alteração afetará somente novas emissões. Confira a sequência com o responsável fiscal. A inutilização é uma operação separada.</p>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setPending(null)}>Cancelar</Button>
          <Button type="button" disabled={busy} onClick={confirm}>{busy ? 'Salvando...' : 'Confirmar alteração'}</Button>
        </div>
      </div>}
    </Modal>
  </section>;
}
