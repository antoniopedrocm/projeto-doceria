/* global globalThis */
import React,{useRef,useState} from 'react';
import {httpsCallable} from 'firebase/functions';
const methods=['Pix dinâmico / link gerado','Pix fixo / QR Code fixo','Link de cartão de crédito','Link de cartão de débito','Cartão de Crédito','Cartão de Débito','Dinheiro','Link de Pagamento','Pix'];
export function canReceiveOrderPayment(order,permissions={}) {
  if(!permissions.pedidos||!permissions.financeiro||order?.paymentMode!=='AGREED_LATER'||order.paymentId||order.manualPaymentReceipt||order.paymentMethodSource?.startsWith('provider/')||order.requiresReview||order.adminPaymentAdjustment?.state==='REVIEW_REQUIRED')return false;
  if(order.status!=='Finalizado'&&order.order_status!=='DELIVERED')return false;
  if(['Cancelado','CANCELLED','CANCELED','REFUNDED','Reserva expirada'].includes(order.status)||['CANCELLED','CANCELED','EXPIRED','REFUNDED'].includes(order.order_status))return false;
  return [order.payment_status,order.paymentStatus,order.statusPagamento].filter(v=>v!=null&&v!=='').every(v=>['PENDING','PENDENTE','UNKNOWN','PENDING_SELECTION'].includes(String(v).toUpperCase()));
}
export default function ReceiveOrderPayment({order,functions,onRecorded,onCancel}) {
  const [method,setMethod]=useState(methods.includes(order.formaPagamento)?order.formaPagamento:''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
  const flight=useRef(false),requestId=useRef(null);
  const submit=async event=>{
    event.preventDefault();if(flight.current||done||!method||!confirmed)return;flight.current=true;setBusy(true);setError('');
    try{if(!globalThis.crypto?.getRandomValues)throw new Error('Não foi possível preparar a confirmação neste navegador. Recarregue a página.');
      if(!requestId.current)requestId.current=globalThis.crypto.randomUUID?globalThis.crypto.randomUUID():Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
      const {data}=await httpsCallable(functions,'adminOrderReceivePayment')({storeId:order.lojaId,orderId:order.id,requestId:requestId.current,expectedRevision:Number(order.adminRevision||0),expectedTotalCents:Math.round(Number(order.total)*100),methodLabel:method,confirmed:true});setDone(true);onRecorded?.(data);}
    catch(e){setError(e.message||'Não foi possível registrar o recebimento. Consulte o pedido antes de tentar novamente.');}
    finally{flight.current=false;setBusy(false);}
  };
  return <form onSubmit={submit} className="space-y-4">
    <p className="text-gray-700">Registre somente um pagamento que a loja já recebeu integralmente.</p>
    <dl className="rounded-xl bg-gray-50 p-4"><dt>Valor integral do pedido</dt><dd className="text-xl font-semibold">{Number(order.total).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</dd></dl>
    <label className="block">Forma real de pagamento<select aria-label="Forma real de pagamento" className="mt-2 w-full border rounded-xl p-3" value={method} disabled={busy||done} onChange={e=>{setMethod(e.target.value);setConfirmed(false);}} required><option value="">Selecione...</option>{methods.map(label=><option key={label}>{label}</option>)}</select></label>
    <label className="flex gap-3 items-start"><input type="checkbox" className="mt-1" checked={confirmed} disabled={busy||done} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo que a loja recebeu integralmente este valor pelo método informado.</label>
    {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">{error}</p>}
    {done&&<p role="status" className="rounded-xl bg-green-50 p-3 text-green-800">Recebimento registrado. O pedido e o histórico serão atualizados.</p>}
    <div className="flex flex-wrap justify-end gap-3"><button type="button" className="rounded-xl border px-4 py-3" disabled={busy} onClick={onCancel}>{done?'Fechar':'Cancelar'}</button><button type="submit" className="rounded-xl bg-pink-700 text-white px-4 py-3 disabled:opacity-50" disabled={busy||done||!confirmed||!method}>{busy?'Registrando…':'Registrar pagamento recebido'}</button></div>
  </form>;
}
