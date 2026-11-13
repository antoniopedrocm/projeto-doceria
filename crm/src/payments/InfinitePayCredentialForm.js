/* global globalThis */
import React,{useEffect,useRef,useState} from 'react';
import {httpsCallable} from 'firebase/functions';
const states={NOT_CONFIGURED:'Não configurada',STORING:'Armazenando versão',VALIDATING:'Validando com a InfinitePay',PENDING_REVIEW:'Configurada — revisão dos links pendente',REVIEW_REQUIRED:'Pendente — exige revisão',ACTIVE:'Válida e ativa para novos links',CONFIGURED_PENDING_VALIDATION:'Configurada — validação pendente'};
export default function InfinitePayCredentialForm({functions,storeId,record,onRefresh}) {
 const keyInput=useRef(null),flight=useRef(false),generation=useRef({value:0});
 const [handle,setHandle]=useState(record.config.handle||''),[policy,setPolicy]=useState(false),[linksConsent,setLinksConsent]=useState(false),[review,setReview]=useState(false),[word,setWord]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const state=generation.current;state.value++;setHandle(record.config.handle||'');setPolicy(false);setLinksConsent(false);setReview(false);setWord('');setError('');setBusy(false);if(keyInput.current)keyInput.current.value='';return()=>{state.value++;};},[storeId,record.config.handle]);
 const credential=record.credential||{},changing=!!record.config.handle&&handle!==record.config.handle;
 async function save(event){event.preventDefault();if(flight.current)return;const current=generation.current.value;flight.current=true;setBusy(true);setError('');
  let apiKey=keyInput.current?.value||'';if(keyInput.current)keyInput.current.value='';
  try{if(!globalThis.crypto?.getRandomValues)throw new Error('Recarregue a página em um navegador seguro.');const requestId=globalThis.crypto.randomUUID?globalThis.crypto.randomUUID():Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
   await httpsCallable(functions,'paymentCredentialSave')({storeId,handle,apiKey,requestId,expectedVersion:record.version,expectedHandle:record.config.handle,confirmPolicy:policy,confirmValidationLinks:linksConsent,confirmChange:changing,confirmation:word});
   if(current===generation.current.value){setPolicy(false);setLinksConsent(false);await onRefresh();}
  }catch{if(current===generation.current.value){setError('Não foi possível concluir a configuração. A chave não será exibida. Consulte o estado atualizado antes de tentar novamente.');try{await onRefresh();}catch{/* Keep the safe error and the key cleared. */}}}
  finally{apiKey=null;flight.current=false;if(current===generation.current.value)setBusy(false);}
 }
 async function activate(){if(flight.current)return;const current=generation.current.value;flight.current=true;setBusy(true);setError('');try{await httpsCallable(functions,'paymentCredentialActivate')({storeId,operationId:credential.operationId,expectedVersion:record.version,expectedHandle:record.config.handle,confirmedReview:review,reviewedModes:['STORE','CUSTOMER'],confirmation:word});if(current===generation.current.value)await onRefresh();}catch{if(current===generation.current.value)setError('A ativação não foi concluída. Recarregue o estado e confira a revisão dos dois links.');}finally{flight.current=false;if(current===generation.current.value)setBusy(false);}}
 return <section aria-label="Credencial InfinitePay da loja" className="border-t pt-5 space-y-4">
  <h3 className="font-semibold">Credencial InfinitePay desta loja</h3>
  <p role="status">{states[credential.state]||'Validação pendente'}{credential.versionNumber?` · versão ${credential.versionNumber}`:''}</p>
  <p className="text-sm text-gray-600">Use a chave da conta que receberá os pagamentos desta unidade. Ela é enviada de forma segura ao backend e guardada no Secret Manager; nunca será devolvida pelo portal.</p>
  {!credential.available?<p className="text-sm text-amber-900">O gerenciamento seguro ainda não foi liberado neste ambiente.</p>:<>
   {error&&<p role="alert" className="rounded border border-red-200 p-3 text-red-800">{error}</p>}
   <form onSubmit={save} autoComplete="off" className="space-y-3">
    <fieldset disabled={busy} className="space-y-3">
     <label className="block">InfiniteTag da credencial<input className="mt-1 block w-full max-w-lg border rounded p-3" value={handle} onChange={e=>setHandle(e.target.value)} maxLength={80} required/></label>
     <label className="block">{credential.configured?'Nova API Key InfinitePay':'API Key InfinitePay'}<input ref={keyInput} type="password" autoComplete="new-password" spellCheck="false" className="mt-1 block w-full max-w-lg border rounded p-3" minLength={14} maxLength={1030} required/></label>
     <p className="text-xs text-gray-600">Ao substituir, uma nova versão será criada. Versões anteriores e links existentes serão preservados.</p>
     <label className="flex gap-2 items-start"><input type="checkbox" className="mt-1" checked={policy} onChange={e=>setPolicy(e.target.checked)}/>Confirmo a política: loja assume 1x; cliente assume a partir de 2x.</label>
     <label className="flex gap-2 items-start"><input type="checkbox" className="mt-1" checked={linksConsent} onChange={e=>setLinksConsent(e.target.checked)}/>Autorizo gerar dois links de validação de R$ 1,00, sem realizar pagamento. Os links expiram em uma hora.</label>
     {changing&&<label className="block text-amber-900">A conta de recebimento mudará de {record.config.handle} para {handle}. Digite ALTERAR para confirmar.<input className="block border rounded p-3" value={word} onChange={e=>setWord(e.target.value)}/></label>}
     <button type="submit" className="rounded bg-pink-700 text-white px-4 py-3 disabled:opacity-50" disabled={busy||!policy||!linksConsent||(changing&&word!=='ALTERAR')}>{busy?'Configurando…':'Salvar e validar credencial'}</button>
    </fieldset>
   </form>
   {credential.state==='PENDING_REVIEW'&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
    <h4 className="font-semibold">Revise antes de ativar</h4>
    <p>A InfinitePay aceitou a criação dos links com a credencial informada. Confira a conta de recebimento e as duas políticas, sem preencher cartão ou concluir pagamento.</p>
    <ul className="space-y-2">{credential.links.map(link=><li key={link.mode}><a className="text-pink-700 underline" href={link.url} target="_blank" rel="noopener noreferrer">{link.mode==='STORE'?'Conferir: Loja assume 1x':'Conferir: Cliente assume a taxa'}</a>{link.expired&&<span> — expirado</span>}</li>)}</ul>
    <label className="flex gap-2 items-start"><input type="checkbox" className="mt-1" checked={review} disabled={busy} onChange={e=>setReview(e.target.checked)}/>Conferi a conta de recebimento desta loja nos dois links e a política de 1x de cada escolha. Não realizei pagamento.</label>
    {credential.candidateHandle!==record.config.handle&&record.config.handle&&<label className="block">A nova conta será {credential.candidateHandle}. Digite ALTERAR.<input className="block border rounded p-3" value={word} onChange={e=>setWord(e.target.value)}/></label>}
    <button type="button" onClick={activate} className="rounded bg-pink-700 text-white px-4 py-3 disabled:opacity-50" disabled={busy||!review||credential.links.length!==2||credential.links.some(l=>l.expired)||(credential.candidateHandle!==record.config.handle&&record.config.handle&&word!=='ALTERAR')}>Ativar credencial validada</button>
   </div>}
   {credential.active&&credential.state!=='ACTIVE'&&<p className="text-sm">A credencial ativa anterior permanece em uso até uma nova ativação válida.</p>}
  </>}
 </section>;
}
