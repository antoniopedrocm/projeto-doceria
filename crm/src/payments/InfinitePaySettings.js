import React, {useEffect, useState} from 'react';
import {httpsCallable} from 'firebase/functions';
export default function InfinitePaySettings({functions,storeId}) {
  const [record,setRecord]=useState(null),[form,setForm]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[word,setWord]=useState('');
  useEffect(()=>{let active=true;setRecord(null);setForm(null);setError('');setConfirm(false);
    if(storeId) httpsCallable(functions,'paymentSettingsGet')({storeId}).then(r=>{if(active){setRecord(r.data);setForm(r.data.config);}}).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[functions,storeId]);
  async function save(){setBusy(true);setError('');try{
    await httpsCallable(functions,'paymentSettingsSave')({storeId,config:form,expectedVersion:record.version,expectedHandle:record.config.handle,confirmChange:confirm,confirmation:word});
    const r=await httpsCallable(functions,'paymentSettingsGet')({storeId});setRecord(r.data);setForm(r.data.config);setConfirm(false);setWord('');
  }catch(e){setError(e.message);}finally{setBusy(false);}}
  if(!storeId)return <p>Selecione uma loja específica para configurar pagamentos.</p>;
  const changing=!!record?.config.handle&&record.config.handle!==form?.handle;
  return <section className="bg-white rounded-xl p-6 space-y-4" aria-label="Pagamentos Online">
    <h2 className="text-xl font-bold">Pagamentos Online — InfinitePay</h2>
    <p>A InfiniteTag configurada determina a conta que receberá os pagamentos desta loja.</p>
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    {!form&&!error&&<p>Carregando configuração…</p>}
    {form&&<><fieldset disabled={busy} className="space-y-4">
      <label className="block">InfiniteTag / handle<input className="block border rounded p-2" value={form.handle} onChange={e=>setForm({...form,handle:e.target.value})} maxLength={80}/></label>
      {[['enabled','InfinitePay habilitada nesta loja'],['sendCustomerData','Enviar dados do cliente automaticamente'],['sendDeliveryAddress','Enviar endereço de entrega automaticamente']].map(([key,label])=><label key={key} className="flex gap-2"><input type="checkbox" checked={form[key]} onChange={e=>setForm({...form,[key]:e.target.checked})}/>{label}</label>)}
      {!record.operationalReady&&<p>Integração técnica ainda pendente. O checkout ficará indisponível até configurar as URLs do ambiente.</p>}
      <button className="rounded bg-pink-700 text-white px-4 py-2" onClick={()=>{setWord('');setConfirm(true);}}>Revisar e salvar</button>
    </fieldset>
    <p>Última alteração: {record.lastChange?new Date(record.lastChange).toLocaleString('pt-BR'):'Nenhuma'}<br/>Por: {record.updatedBy?.name||'—'}</p>
    <details><summary>Histórico de alterações (20 mais recentes)</summary><ul>{record.history.map(entry=><li key={entry.id} className="border-b py-2">{new Date(entry.timestamp).toLocaleString('pt-BR')} — {entry.actor.name} ({entry.actor.role})<ul>{entry.changes.map(c=><li key={c.field}>{c.field}: {String(c.before)} → {String(c.after)}</li>)}</ul></li>)}</ul></details>
    {confirm&&<div role="dialog" aria-modal="true" aria-label={changing?'Alterar conta de recebimento?':'Confirmar configuração'} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"><div className="bg-white rounded-xl p-6 max-w-lg space-y-4">
      <h3 className="font-bold">{changing?'Alterar conta de recebimento?':'Confirmar configuração'}</h3>
      {changing?<><p>Você está alterando a InfiniteTag desta loja. Os próximos pagamentos online poderão ser direcionados à nova conta.</p><p>Atual: {record.config.handle}<br/>Nova: {form.handle}</p></>:<p>Salvar configurações para {storeId} com a tag {form.handle}?</p>}
      {changing&&record.config.enabled&&<label>Digite ALTERAR<input className="border block p-2" value={word} onChange={e=>setWord(e.target.value)}/></label>}
      <button disabled={busy||(changing&&record.config.enabled&&word!=='ALTERAR')} onClick={save} className="bg-pink-700 text-white rounded p-2 disabled:opacity-50">{busy?'Salvando…':'Confirmar'}</button> <button disabled={busy} onClick={()=>setConfirm(false)}>Cancelar</button>
      {error&&<p role="alert">{error}</p>}
    </div></div>}</>}
  </section>;
}
