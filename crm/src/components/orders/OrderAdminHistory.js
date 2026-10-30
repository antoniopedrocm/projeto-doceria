import React,{useEffect,useRef,useState} from 'react';
import {httpsCallable} from 'firebase/functions';
import {functions} from '../../firebaseConfig';
const labels={status:'Status',clienteId:'Cliente',clienteNome:'Nome do cliente',categoria:'Categoria',formaPagamento:'Forma de pagamento',observacao:'Observação',desconto:'Desconto',subtotal:'Subtotal',total:'Total',cupom:'Cupom',dataEntrega:'Data de entrega',paymentMethod:'Método real',fiscalPaymentCode:'Código fiscal',paymentMethodSource:'Origem do método'};
const money=value=>Number(value || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function describe(change) {
  if(change.field==='itens') {
    const before=new Map((change.before || []).map(i=>[i.produtoId || i.productId || i.id,i]));
    const after=new Map((change.after || []).map(i=>[i.produtoId || i.productId || i.id,i]));
    return [...new Set([...before.keys(),...after.keys()])].map(id=>{
      const a=before.get(id),b=after.get(id),qty=i=>Number(i?.quantity ?? i?.quantidade ?? 0);
      if(!a)return `Produto adicionado: + ${qty(b)}x ${b.nome || id}`;
      if(!b)return `Produto removido: − ${qty(a)}x ${a.nome || id}`;
      return qty(a)!==qty(b)?`${b.nome || id}: ${qty(a)} → ${qty(b)}`:null;
    }).filter(Boolean).join('; ') || 'Itens atualizados';
  }
  const display=value=>value == null || value===''?'—':['desconto','subtotal','total'].includes(change.field)?money(value):typeof value==='object'?JSON.stringify(value):String(value);
  return `${labels[change.field] || change.field}: ${display(change.before)} → ${display(change.after)}`;
}
export function OrderPaymentAdjustment({order,total=order?.total}) {
  if(!order?.paymentId || order.payment_status!=='PAID')return null;
  const paid=Number(order.adminPaymentAdjustment?.paidCents ?? Math.round(Number(order.total || 0)*100))/100,difference=Math.round((Number(total)-paid)*100)/100;
  if(!difference)return null;
  return <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><h3 className="font-semibold">Pedido alterado após pagamento confirmado.</h3><dl className="mt-2 grid gap-1"><div>Valor pago: <strong>{money(paid)}</strong></div><div>Novo total: <strong>{money(total)}</strong></div><div>Diferença: <strong>{money(difference)}</strong></div></dl><p className="mt-2">A diferença exige conciliação administrativa. Nenhuma cobrança ou estorno será realizado automaticamente. A emissão fiscal fica bloqueada enquanto houver divergência.</p></div>;
}
export default function OrderAdminHistory({order}) {
  const [events,setEvents]=useState([]),[cursor,setCursor]=useState(null),[state,setState]=useState('loading'),[retry,setRetry]=useState(0);
  const generation=useRef({value:0});
  const storeId=order?.lojaId,orderId=order?.id,revision=order?.adminRevision;
  useEffect(()=>{let active=true;const generationState=generation.current;generationState.value++;setState('loading');setEvents([]);setCursor(null);
    httpsCallable(functions,'adminOrderHistory')({storeId,orderId}).then(({data})=>{if(active){setEvents(data.events || []);setCursor(data.nextCursor);setState('ready');}}).catch(()=>{if(active)setState('error');});
    return()=>{active=false;generationState.value++;};
  },[storeId,orderId,revision,retry]);
  const more=async()=>{const token=generation.current.value;setState('loading-more');try{const {data}=await httpsCallable(functions,'adminOrderHistory')({storeId,orderId,beforeRevision:cursor});if(token!==generation.current.value)return;setEvents(old=>[...old,...data.events]);setCursor(data.nextCursor);setState('ready');}catch{if(token===generation.current.value)setState('error-more');}};
  return <section aria-label="Histórico de alterações" className="rounded-xl border border-gray-200 bg-white p-4 space-y-3"><h3 className="font-semibold text-gray-800">Histórico de alterações</h3>
    {state==='loading'&&<p role="status" className="text-sm text-gray-500">Carregando histórico…</p>}
    {state==='error'&&<p role="alert">Não foi possível carregar o histórico. <button type="button" className="text-pink-700 underline" onClick={()=>setRetry(n=>n+1)}>Tentar novamente</button></p>}
    {state==='ready'&&!events.length&&<p className="text-sm text-gray-500">Nenhuma alteração registrada pela nova trilha. Registros anteriores permanecem nos logs existentes do CRM.</p>}
    <ol className="space-y-4">{[...events].sort((a,b)=>a.revision-b.revision).map(event=><li key={event.id} className="border-l-2 border-pink-200 pl-3 text-sm"><p className="font-medium">{new Date(event.createdAt).toLocaleString('pt-BR')} · {event.actorName || event.actorUid}</p><p className="text-gray-500">{event.source==='CRM_UPDATE_STATUS'?'Status atualizado':'Pedido editado'}</p><ul className="mt-1 space-y-1">{event.changes.map((change,index)=><li key={index}>{describe(change)}</li>)}</ul>{event.stockChanges?.length>0&&<p className="mt-1 text-gray-500">Estoque ajustado em {event.stockChanges.length} produto(s), na mesma operação.</p>}</li>)}</ol>
    {cursor&&<button type="button" onClick={more} disabled={state==='loading-more'} className="rounded-lg border px-3 py-2 text-sm">Ver alterações anteriores</button>}
    {state==='error-more'&&<p role="alert" className="text-sm text-red-700">Não foi possível carregar alterações anteriores. Tente novamente.</p>}
  </section>;
}
