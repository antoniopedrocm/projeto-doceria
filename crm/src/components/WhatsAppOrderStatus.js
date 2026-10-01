import React, {useEffect, useRef, useState} from 'react';
import {getFunctions, httpsCallable} from 'firebase/functions';
import {auth, functions} from '../firebaseConfig';

const labels = {
  queued: 'Envio pendente', processing: 'Enviando', retry: 'Nova tentativa agendada',
  accepted: 'Aceito pela API; aguardando confirmação', sent: 'Enviado', delivered: 'Entregue',
  read: 'Lido', failed: 'Falhou', skipped: 'Não enviado', simulated: 'Simulado (DEV)', unknown: 'Resultado indeterminado',
};
const when = (time) => time ? new Date(time).toLocaleString('pt-BR') : '—';

export default function WhatsAppOrderStatus({storeId, orderId}) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [history, setHistory] = useState(false);
  const sending = useRef(false);
  const generation = useRef(0);
  const dev = functions.app.options.projectId === 'crmdoceria-9959e';
  const valid = dev && !!storeId && !!orderId;
  const api = getFunctions(functions.app, 'southamerica-east1');
  const load = async (includeHistory = history) => {
    const current = generation.current;
    try {
      const response = await httpsCallable(api, 'getWhatsAppOrderStatus')({storeId, orderId, includeHistory});
      if (current === generation.current) {setResult(response.data); setFeedback('');}
    } catch (_) {
      if (current === generation.current) setFeedback('Não foi possível consultar o WhatsApp. O pedido permanece salvo.');
    }
  };
  useEffect(() => {
    generation.current += 1;
    setResult(null); setFeedback(''); setHistory(false);
    if (valid) load(false);
    return () => {generation.current += 1;};
    // Refresh only for the selected order. Other updates use the explicit button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, orderId, valid]);
  if (!valid) return null;
  const latest = result?.jobs?.[0];
  const manualPending = result?.jobs?.some((job) => job.mode === 'manual' && ['queued', 'processing', 'retry'].includes(job.status));
  const resend = async () => {
    if (sending.current) return;
    if (!window.confirm('Enviar novamente o resumo salvo pelo WhatsApp oficial? O cliente pode já ter recebido uma mensagem anterior, inclusive se o resultado estiver indeterminado.')) return;
    sending.current = true; setBusy(true); setFeedback('Solicitando envio…');
    const current = generation.current;
    try {
      // Preserve the same intent across network failures and component remounts.
      const key = `whatsapp-resend:${auth.currentUser?.uid}:${storeId}:${orderId}`;
      let requestId = sessionStorage.getItem(key);
      if (!requestId) {requestId = window.crypto.randomUUID(); sessionStorage.setItem(key, requestId);}
      const response = await httpsCallable(api, 'requestWhatsAppOrderResend')({storeId, orderId, requestId, confirmResend: true});
      sessionStorage.removeItem(key);
      if (current === generation.current) {
        await load();
        setFeedback(response.data.duplicate ? 'Solicitação já registrada. Atualize para acompanhar.' : 'Envio solicitado. Atualize para acompanhar o resultado.');
      }
    } catch (error) {
      if (current === generation.current) {
        const known = ['functions/failed-precondition', 'functions/permission-denied', 'functions/resource-exhausted', 'functions/not-found'].includes(error.code);
        setFeedback(known ? error.message : 'Não foi possível confirmar a solicitação. Atualize o status ou tente novamente; a mesma solicitação será reutilizada.');
      }
    } finally {sending.current = false; if (current === generation.current) setBusy(false);}
  };
  return <section className="p-3 border border-green-200 rounded-lg bg-green-50 space-y-2" aria-label="WhatsApp do pedido">
    <p className="font-semibold">WhatsApp: {result ? (labels[latest?.status] || 'Sem registro de envio pela API') : 'Consultando…'}</p>
    {latest && <p className="text-xs">{latest.mode === 'manual' ? 'Manual' : 'Automático'} · {when(latest.updatedAt)} · {latest.recipientMasked || 'Destinatário não registrado'}</p>}
    {result && !result.manualEnabled && <p className="text-xs">Envio pela API desabilitado nesta loja.</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className="px-3 py-2 border rounded disabled:opacity-50" disabled={busy} onClick={() => load()}>Atualizar status</button>
      <button type="button" className="px-3 py-2 bg-green-700 text-white rounded disabled:opacity-50" disabled={busy || !result?.manualEnabled || manualPending} onClick={resend}>{busy ? 'Solicitando…' : 'Reenviar pelo WhatsApp oficial'}</button>
      <button type="button" className="px-3 py-2 border rounded" onClick={() => {setHistory(!history); if (!history) load(true);}}>{history ? 'Ocultar histórico' : 'Ver histórico'}</button>
    </div>
    {feedback && <p role="status" className="text-sm">{feedback}</p>}
    {history && result && <div className="space-y-3 max-h-64 overflow-y-auto">{result.jobs.length ? result.jobs.map((job) => <div key={job.id} className="border-t pt-2 text-xs">
      <p>{job.mode === 'manual' ? 'Manual' : 'Automático'} · {labels[job.status] || job.status} · {when(job.createdAt)} · {job.attemptCount} tentativa(s)</p>
      {job.operatorId && <p>Operador: {job.operatorId}</p>}
      {(job.history || []).map((event, index) => <p key={index}>{when(event.recordedAt)} · {labels[event.outcome.status] || event.outcome.status} · {event.outcome.code}{event.outcome.metaCode ? ` (${event.outcome.metaCode})` : ''}</p>)}
    </div>) : <p>Não há registro de envio pela API. A abertura manual do WhatsApp não confirma envio.</p>}</div>}
  </section>;
}
