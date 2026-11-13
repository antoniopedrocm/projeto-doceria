import React, {useEffect, useRef, useState} from 'react';
import {httpsCallable} from 'firebase/functions';
import InfinitePayCredentialForm from './InfinitePayCredentialForm';
export default function InfinitePaySettings({functions,storeId}) {
  const [record,setRecord]=useState(null),[form,setForm]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[word,setWord]=useState('');
  const scope=useRef(0);
  useEffect(()=>{let active=true;const generation=++scope.current;setRecord(null);setForm(null);setError('');setConfirm(false);setBusy(false);
    if(storeId) httpsCallable(functions,'paymentSettingsGet')({storeId}).then(r=>{if(active){setRecord(r.data);setForm({...r.data.config,card1xFeePayer:r.data.config.card1xFeePayer || 'STORE'});}}).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;scope.current=generation+1;};
  },[functions,storeId]);
  async function save(){const generation=scope.current;setBusy(true);setError('');try{
    await httpsCallable(functions,'paymentSettingsSave')({storeId,config:form,expectedVersion:record.version,expectedHandle:record.config.handle,confirmChange:confirm,confirmation:word});
    if(generation!==scope.current)return;
    const r=await httpsCallable(functions,'paymentSettingsGet')({storeId});if(generation!==scope.current)return;setRecord(r.data);setForm({...r.data.config,card1xFeePayer:r.data.config.card1xFeePayer || 'STORE'});setConfirm(false);setWord('');
  }catch(e){if(generation===scope.current)setError(e.message);}finally{if(generation===scope.current)setBusy(false);}}
  if(!storeId)return <p>Selecione uma loja específica para configurar pagamentos.</p>;
  const changing=!!record?.config.handle&&record.config.handle!==form?.handle;
  const verified=record?.card1xFeePolicy?.application==='LINK_POLICY_VERIFIED_NO_PAYMENT';
  async function refreshCredential(){const generation=scope.current;const r=await httpsCallable(functions,'paymentSettingsGet')({storeId});if(generation===scope.current){setRecord(r.data);setForm({...r.data.config,card1xFeePayer:r.data.config.card1xFeePayer||'STORE'});}}
  return <section className="bg-white rounded-xl p-6 space-y-4" aria-label="Pagamentos Online">
    <h2 className="text-xl font-bold">Pagamentos Online — InfinitePay</h2>
    <p>A InfiniteTag configurada determina a conta que receberá os pagamentos desta loja.</p>
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    {!form&&!error&&<p>Carregando configuração…</p>}
    {form&&<><fieldset disabled={busy} className="space-y-4">
      <label className="block">InfiniteTag / handle<input className="block border rounded p-2" value={form.handle} onChange={e=>setForm({...form,handle:e.target.value})} maxLength={80}/></label>
      {[['enabled','InfinitePay habilitada nesta loja'],['sendCustomerData','Enviar dados do cliente automaticamente'],['sendDeliveryAddress','Enviar endereço de entrega automaticamente']].map(([key,label])=><label key={key} className="flex gap-2"><input type="checkbox" checked={form[key]} onChange={e=>setForm({...form,[key]:e.target.checked})}/>{label}</label>)}
      <section className="border-t pt-4 space-y-3" aria-labelledby="card-1x-fee-title">
        <h3 id="card-1x-fee-title" className="font-semibold">Taxas de pagamento com cartão</h3>
        <label htmlFor="card-1x-fee-payer" className="block">Quem assume a taxa do cartão em 1x?</label>
        <select id="card-1x-fee-payer" aria-describedby="card-1x-fee-help" className="block w-full max-w-lg border rounded p-3" value={form.card1xFeePayer} onChange={e=>setForm({...form,card1xFeePayer:e.target.value})}>
          <option value="STORE">Loja assume a taxa — padrão</option>
          <option value="CUSTOMER" disabled={!verified||!record.card1xFeePolicy?.customerPassThroughAvailable}>Cliente assume a taxa</option>
        </select>
        <p id="card-1x-fee-help" role="status" className={verified?'text-sm text-green-800':'text-sm text-amber-900'}>{verified?'Política por link ativada e validada sem pagamento. A escolha será aplicada pela InfinitePay aos novos links desta loja. Nenhuma taxa é somada pelo CRM.':'Preferência local; aplicação na InfinitePay pendente de validação. Este painel não acrescenta taxa ao pedido. '}{!verified&&(record.card1xFeePolicy?.application==='PREPARED_NOT_HOMOLOGATED'?'O vínculo está preparado para novos links pelo mecanismo oficial; a aplicação financeira ainda depende de validação no checkout.':'O checkout mantém as regras atuais da conta. Cadastre e valide a credencial desta loja antes de aplicar a preferência.')}</p>
        <p className="text-sm text-gray-600">Parcelamentos em 2x ou mais, Pix e Combinar Pagamento permanecem com o comportamento atual.</p>
        {record.card1xFeePolicy?.baselineAssuredInstallments>1&&<p className="text-sm text-amber-900">A política informada assume taxas até {record.card1xFeePolicy.baselineAssuredInstallments}x. Repassar a taxa em 1x também alteraria parcelas superiores; essa opção depende de uma decisão específica do Dono.</p>}
      </section>
      {!record.operationalReady&&<p>Integração técnica ainda pendente. O checkout ficará indisponível até configurar as URLs do ambiente.</p>}
      <button className="rounded bg-pink-700 text-white px-4 py-2" onClick={()=>{setWord('');setConfirm(true);}}>Revisar e salvar</button>
    </fieldset>
    <InfinitePayCredentialForm key={storeId} functions={functions} storeId={storeId} record={record} onRefresh={refreshCredential}/>
    <p>Última alteração: {record.lastChange?new Date(record.lastChange).toLocaleString('pt-BR'):'Nenhuma'}<br/>Por: {record.updatedBy?.name||'—'}</p>
    <details><summary>Histórico de alterações (20 mais recentes)</summary><ul>{record.history.map(entry=><li key={entry.id} className="border-b py-2">{new Date(entry.timestamp).toLocaleString('pt-BR')} — {entry.actor.name} ({entry.actor.role})<ul>{entry.changes.map(c=><li key={c.field}>{c.field}: {String(c.before)} → {String(c.after)}</li>)}</ul></li>)}</ul></details>
    {confirm&&<div role="dialog" aria-modal="true" aria-label={changing?'Alterar conta de recebimento?':'Confirmar configuração'} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"><div className="bg-white rounded-xl p-6 max-w-lg space-y-4">
      <h3 className="font-bold">{changing?'Alterar conta de recebimento?':'Confirmar configuração'}</h3>
      {changing?<><p>Você está alterando a InfiniteTag desta loja. Os próximos pagamentos online poderão ser direcionados à nova conta.</p><p>Atual: {record.config.handle}<br/>Nova: {form.handle}</p></>:<p>Salvar configurações para {storeId} com a tag {form.handle}?</p>}
      <p className="text-sm text-amber-900">{verified?'A escolha será aplicada pelo mecanismo oficial da InfinitePay aos novos links. O CRM não acrescenta taxa ao pedido.':'A preferência de taxa em 1x permanece pendente de aplicação no provedor. Esta alteração não adiciona taxa ao pedido nem muda o parcelamento automaticamente.'}</p>
      {changing&&record.config.enabled&&<label>Digite ALTERAR<input className="border block p-2" value={word} onChange={e=>setWord(e.target.value)}/></label>}
      <button disabled={busy||(changing&&record.config.enabled&&word!=='ALTERAR')} onClick={save} className="bg-pink-700 text-white rounded p-2 disabled:opacity-50">{busy?'Salvando…':'Confirmar'}</button> <button disabled={busy} onClick={()=>setConfirm(false)}>Cancelar</button>
      {error&&<p role="alert">{error}</p>}
    </div></div>}</>}
  </section>;
}
