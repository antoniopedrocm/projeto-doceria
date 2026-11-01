import React,{useCallback,useEffect,useRef,useState} from 'react';
import {auth} from '../firebaseConfig';
import {customerApiBase} from '../customer/customerRuntime';

export async function financialRequest(storeId,method,data={}) {
  const user=auth.currentUser;if(!user || user.isAnonymous)throw new Error('Entre novamente como Staff.');
  const r=await fetch(customerApiBase+'/staff/payment-reconciliation/'+method,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},
    body:JSON.stringify({storeId,...data}),cache:'no-store',signal:AbortSignal.timeout(20000)});
  const value=await r.json();if(!r.ok)throw new Error(value.message || 'Não foi possível consultar a conciliação.');return value;
}
const statusLabel={APPROVAL_VERIFIED:'Aprovação verificada',APPROVAL_REVIEW_REQUIRED:'Aprovação em conferência',FAILED_ATTEMPT_CHECKED:'Tentativa sem aprovação',FAILED_ATTEMPT_UNVERIFIED:'Falha não verificada',INFORMATIONAL_UNVERIFIED:'Notificação informativa',PENDING_RECONCILIATION:'Conciliação pendente',MATCHED_EXPECTED_OPERATION:'Operação conciliada',DISMISSED_UNVERIFIED:'Notificação descartada após revisão'};
const button='px-4 py-2 min-h-[44px] rounded-lg border border-gray-300 text-sm font-semibold disabled:opacity-50';
export default function PaymentReconciliation({storeId,request=financialRequest}) {
  const [events,setEvents]=useState([]),[cursor,setCursor]=useState(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [paymentId,setPaymentId]=useState(''),[payment,setPayment]=useState(null),[operation,setOperation]=useState('REFUND_EXPECTED');
  const [transaction,setTransaction]=useState(''),[slug,setSlug]=useState(''),[reference,setReference]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [dismissal,setDismissal]=useState(null),[reason,setReason]=useState('');
  const generation=useRef(0),flight=useRef(false),requestId=useRef(null);
  const scoped=storeId && storeId!=='__all__';
  const load=useCallback(async(next=null)=>{
    const current=generation.current,value=await request(storeId,'list',next?{cursor:next}:{});
    if(current===generation.current){setEvents(old=>next?[...old,...value.events]:value.events);setCursor(value.nextCursor);}
  },[storeId,request]);
  useEffect(()=>{const lifecycle=generation;lifecycle.current++;setPayment(null);setEvents([]);setCursor(null);setMessage('');
    if(scoped)load().catch(e=>setMessage(e.message));
    return()=>{lifecycle.current++;};
  },[scoped,load]);
  const run=async action=>{
    if(flight.current)return;flight.current=true;setBusy(true);setMessage('');const current=generation.current;
    try{await action(current);}catch(e){if(current===generation.current)setMessage(e.message);}finally{flight.current=false;setBusy(false);}
  };
  const choose=async id=>{
    setPaymentId(id);setPayment(null);setConfirmed(false);setReference('');requestId.current=null;
    await run(async current=>{const value=await request(storeId,'payment',{paymentId:id});if(current!==generation.current)return;
      setPayment(value.payment);setOperation(value.payment.payment_status==='PENDING'?'CANCEL_EXPECTED':'REFUND_EXPECTED');setTransaction(value.payment.transactionNsu || '');setSlug(value.payment.slug || '');});
  };
  if(!scoped)return <p className="p-6 bg-white rounded-xl border">Selecione uma loja para consultar a conciliação financeira.</p>;
  return <section className="space-y-5 p-4 md:p-6 bg-white rounded-2xl border border-gray-200 shadow-sm" aria-labelledby="reconciliation-heading">
    <header><h2 id="reconciliation-heading" className="text-xl font-semibold">Conciliação InfinitePay</h2><p className="text-sm text-gray-600 mt-2">Notificações sem assinatura são indícios. Aprovações dependem de consulta autenticada; cancelamentos e estornos exigem registro de execução externa pela equipe autorizada.</p></header>
    {message && <p role="status" className="p-3 rounded-lg bg-amber-50 text-amber-900">{message}</p>}
    <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy} onClick={()=>run(()=>load())}>Atualizar notificações</button></div>
    {events.length===0 && <p className="text-sm text-gray-600">Nenhuma notificação registrada nesta loja.</p>}
    <div className="space-y-3">{events.map(event=><article key={event.id} className="border border-gray-200 rounded-xl p-4 min-w-0">
      <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold break-all">Pedido {event.orderId}</h3><span className="text-xs rounded-full px-3 py-1 bg-gray-100">{statusLabel[event.disposition] || event.disposition}</span></div>
      <p className="text-sm text-gray-600 mt-2">{event.eventType} · {event.createdAt?new Date(event.createdAt).toLocaleString('pt-BR'):''}</p>
      <div className="flex flex-wrap gap-3 mt-3"><button type="button" className={button} disabled={busy} onClick={()=>choose(event.paymentId)}>Consultar pagamento</button>
        {event.disposition==='PENDING_RECONCILIATION' && <><button type="button" className={button} disabled={busy} onClick={()=>run(async()=>{await request(storeId,'reconcile',{eventId:event.id});await load();setMessage('Notificação conferida. A transição só ocorre se existir execução externa compatível registrada.');})}>Conferir operação esperada</button><button type="button" className={button} disabled={busy} onClick={()=>{setDismissal(event);setReason('');}}>Revisar notificação sem comprovação</button></>}
      </div>
    </article>)}</div>
    {cursor && <button type="button" className={button} disabled={busy} onClick={()=>run(()=>load(cursor))}>Mais notificações</button>}
    <form className="flex flex-wrap items-end gap-3 border-t pt-5" onSubmit={e=>{e.preventDefault();void choose(paymentId);}}><label className="flex-1 min-w-0 text-sm font-medium">Identificador do pagamento / order_nsu<input className="block w-full border rounded-lg p-3 mt-2" value={paymentId} onChange={e=>setPaymentId(e.target.value)} pattern="[a-f0-9]{64}" required/></label><button className={button} disabled={busy}>Consultar pagamento</button></form>
    {payment && <form className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-4" onSubmit={e=>{e.preventDefault();if(!confirmed)return;
      void run(async current=>{if(!requestId.current)requestId.current=crypto.randomUUID();await request(storeId,'register',{paymentId:payment.paymentId,type:operation,transactionNsu:transaction,slug,executionConfirmed:confirmed,executionReference:reference,requestId:requestId.current});if(current!==generation.current)return;
        setPayment(null);setConfirmed(false);await load();setMessage('Execução externa registrada. Confira a notificação correspondente para conciliar. Nenhuma operação foi enviada à InfinitePay.');});}}>
      <h3 className="font-semibold">Registrar operação já realizada na InfinitePay</h3><p className="text-sm">Estado atual: {payment.payment_status}. Valor: {new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(payment.amount/100)}.</p>
      <p className="text-sm">Este formulário não executa estorno ou cancelamento no provider, não altera nota fiscal e não repõe estoque de produto já consumido.</p>
      <label className="block text-sm font-medium">Operação<select className="block w-full border rounded-lg p-3 mt-2" value={operation} onChange={e=>{setOperation(e.target.value);requestId.current=null;}}><option value="REFUND_EXPECTED">Registrar estorno realizado na InfinitePay</option><option value="CANCEL_EXPECTED">Registrar cancelamento realizado na InfinitePay</option></select></label>
      <label className="block text-sm font-medium">transaction_nsu<input className="block w-full border rounded-lg p-3 mt-2" value={transaction} onChange={e=>setTransaction(e.target.value)} required maxLength={160}/></label>
      <label className="block text-sm font-medium">Slug do checkout<input className="block w-full border rounded-lg p-3 mt-2" value={slug} onChange={e=>setSlug(e.target.value)} required maxLength={160}/></label>
      <label className="block text-sm font-medium">Referência da execução externa<input className="block w-full border rounded-lg p-3 mt-2" value={reference} onChange={e=>setReference(e.target.value)} minLength={4} maxLength={160} required/></label><p className="text-xs">Não informe dados de cartão, códigos de acesso ou dados pessoais.</p>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} required/><span>Confirmo que a operação foi concluída na App/Conta InfinitePay e que esta referência corresponde a este pagamento.</span></label>
      <div className="flex flex-wrap gap-3"><button className={button+' bg-pink-600 text-white border-pink-600'} disabled={busy || !confirmed || payment.requiresReview}>Registrar execução externa</button><button type="button" className={button} onClick={()=>setPayment(null)} disabled={busy}>Cancelar</button></div>
      {payment.requiresReview && <p role="alert">Este pagamento exige análise manual antes de registrar uma operação financeira.</p>}
    </form>}
    {dismissal && <form className="space-y-3 border rounded-xl p-4" onSubmit={e=>{e.preventDefault();void run(async()=>{await request(storeId,'dismiss',{eventId:dismissal.id,reason});setDismissal(null);await load();});}}><h3 className="font-semibold">Revisar notificação não comprovada</h3><p className="text-sm">Registra a decisão da equipe, preserva o evento original e não muda o pagamento.</p><label className="block text-sm font-medium">Motivo<textarea className="block w-full border rounded-lg p-3 mt-2" value={reason} onChange={e=>setReason(e.target.value)} required minLength={10} maxLength={300}/></label><div className="flex flex-wrap gap-3"><button className={button} disabled={busy}>Registrar revisão sem alteração financeira</button><button type="button" className={button} onClick={()=>setDismissal(null)}>Cancelar</button></div></form>}
  </section>;
}
