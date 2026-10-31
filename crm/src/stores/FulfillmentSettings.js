import React,{useEffect,useRef,useState} from 'react';
import {httpsCallable} from 'firebase/functions';
import {functions} from '../firebaseConfig';

export default function FulfillmentSettings({storeId}) {
  const [data,setData]=useState(null),[form,setForm]=useState({deliveryEnabled:false,pickupEnabled:false});
  const [state,setState]=useState('loading'),[message,setMessage]=useState(''),[retry,setRetry]=useState(0);
  const pending=useRef(null),inFlight=useRef(false),generation=useRef({value:0});
  useEffect(()=>{
    let active=true;const generationState=generation.current;generationState.value++;setState('loading');setData(null);setMessage('');pending.current=null;
    httpsCallable(functions,'staffGetFulfillment')({storeId}).then(({data:result})=>{if(active){setData(result);setForm({deliveryEnabled:result.deliveryEnabled,pickupEnabled:result.pickupEnabled});setState('ready');}}).catch(()=>{if(active){setState('error');setMessage('Não foi possível carregar a disponibilidade desta loja.');}});
    return()=>{active=false;generationState.value++;};
  },[storeId,retry]);
  const change=(field,value)=>{pending.current=null;setMessage('');setForm(old=>({...old,[field]:value}));};
  const save=async event=>{
    event.preventDefault();if(inFlight.current || !data?.editable)return;
    inFlight.current=true;setState('saving');setMessage('');const token=generation.current.value;
    pending.current=pending.current || {storeId,...form,expectedRevision:data.revision,requestId:window.crypto.randomUUID()};
    try {
      const {data:result}=await httpsCallable(functions,'staffSaveFulfillment')(pending.current);
      if(token!==generation.current.value)return;
      setData(result);setForm({deliveryEnabled:result.deliveryEnabled,pickupEnabled:result.pickupEnabled});pending.current=null;setState('ready');setMessage('Disponibilidade salva.');
    } catch(error) {if(token===generation.current.value){setState('ready');setMessage(error.code==='functions/aborted'?'A configuração mudou em outra sessão. Recarregue a disponibilidade antes de salvar.':'Não foi possível salvar a disponibilidade. Tente novamente ou recarregue.');}}
    finally{inFlight.current=false;}
  };
  const disabled=state==='loading' || state==='saving' || !data?.editable;
  const changed=data && (data.deliveryEnabled!==form.deliveryEnabled || data.pickupEnabled!==form.pickupEnabled);
  return <section aria-label="Disponibilidade" className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
    <h3 className="text-xl font-bold text-gray-800">Disponibilidade</h3>
    <p className="mt-1 text-sm text-gray-500">Defina as modalidades de atendimento desta loja.</p>
    {state==='loading'&&<p role="status" className="mt-3 text-sm text-gray-500">Carregando disponibilidade…</p>}
    {state==='error'?<div role="alert" className="mt-3 text-sm text-red-700">{message}<button type="button" className="ml-2 underline" onClick={()=>setRetry(n=>n+1)}>Tentar novamente</button></div>:<form onSubmit={save} className="mt-4 space-y-4 max-w-lg">
      <fieldset disabled={disabled} className="space-y-4">
        <legend className="sr-only">Modalidades permitidas</legend>
        <label className="flex items-start gap-3 text-sm text-gray-800"><input type="checkbox" className="mt-1 h-4 w-4 accent-pink-600" checked={form.deliveryEnabled} onChange={e=>change('deliveryEnabled',e.target.checked)} /><span><strong className="block font-semibold">Entrega disponível</strong><span className="text-gray-600">Permite que clientes escolham entrega nesta loja.</span></span></label>
        <label className="flex items-start gap-3 text-sm text-gray-800"><input type="checkbox" className="mt-1 h-4 w-4 accent-pink-600" checked={form.pickupEnabled} onChange={e=>change('pickupEnabled',e.target.checked)} /><span><strong className="block font-semibold">Retirada disponível</strong><span className="text-gray-600">Permite que clientes retirem pedidos nesta loja.</span></span></label>
      </fieldset>
      {data&&<div className="space-y-1 text-sm text-gray-600"><p>Configuração técnica de frete: <strong>{data.deliveryReady?'Pronta':'Pendente'}</strong>.</p><p>Disponibilidade atual: entrega <strong>{data.deliveryAvailable?'disponível':'indisponível'}</strong>; retirada <strong>{data.pickupAvailable?'disponível':'indisponível'}</strong>.</p></div>}
      {data&&form.deliveryEnabled&&!data.deliveryReady&&<p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Entrega habilitada, porém a configuração de frete desta loja ainda não está pronta.</p>}
      {data&&!data.editable&&<p role="alert" className="text-sm text-amber-900">A loja precisa de configuração storefront V1 válida para alterar a disponibilidade.</p>}
      <div className="flex flex-wrap gap-3"><button type="submit" disabled={disabled || !changed} className="rounded-xl bg-pink-600 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-pink-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-600">{state==='saving'?'Salvando…':'Salvar disponibilidade'}</button>
      {data&&<button type="button" disabled={state==='saving'} onClick={()=>setRetry(n=>n+1)} className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700">Recarregar disponibilidade</button>}</div>
      {message&&<p role="status" className="text-sm text-gray-700">{message}</p>}
    </form>}
  </section>;
}
