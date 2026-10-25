import {createEnterpriseSmsVerifier} from './sms-enterprise.mjs';

// A one-time claim of an existing Customer, not an address grant or Phone login.
export function createCustomerPhoneClaimView({document,window,call,auth,onLinked}) {
  const dialog=document.createElement('dialog');dialog.className='rounded-lg shadow-xl p-6 w-full max-w-md';
  dialog.setAttribute('aria-label','Vincular cadastro existente');
  dialog.innerHTML=`<h2 class="font-bold text-xl">Confirme seu número</h2><p data-claim-message role="status" class="my-3"></p>
    <label data-claim-store-label hidden>Loja<select data-claim-store class="border rounded p-2 w-full"><option value="">Selecione uma loja</option></select></label>
    <button type="button" data-claim-send class="border rounded p-3 my-2">Enviar código por SMS</button>
    <form data-claim-form hidden><label>Código recebido<input data-claim-code inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required class="border rounded p-2 w-full"></label><button class="border rounded p-3 my-2">Confirmar código</button></form>
    <p class="text-sm">Protegido pelo reCAPTCHA. Aplicam-se a <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Política de Privacidade</a> e os <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">Termos do Google</a>.</p>
    <button type="button" data-claim-cancel class="underline mt-3">Cancelar</button>`;
  document.body.append(dialog);
  const el=name=>dialog.querySelector(`[data-claim-${name}]`),verifier=createEnterpriseSmsVerifier({document,window,mainProjectId:auth.app?.options?.projectId});
  let sequence=0,context=null,timer=null;
  function clear() {sequence++;context=null;window.clearTimeout(timer);el('code').value='';el('form').hidden=true;if(dialog.open)dialog.close();}
  const same=(s,c)=>sequence===s && context===c && auth.currentUser?.uid===c.uid;
  const message=text=>{el('message').textContent=text;};
  async function open({phone,identityReviewRequired}) {
    clear();const seq=sequence,uid=auth.currentUser?.uid;if(!uid)return;
    context={phone,uid,storeId:null,challengeId:null};const c=context;
    message(identityReviewRequired?'Este cadastro já está vinculado a outra conta. É necessária conferência para conservar os acessos existentes.':'Para recuperar seu cadastro existente, confirme o celular terminado em '+String(phone).replace(/\D/g,'').slice(-4)+'.');
    el('send').hidden=!!identityReviewRequired;el('send').disabled=false;el('store-label').hidden=true;el('store').disabled=false;
    if(!dialog.open)dialog.showModal();if(identityReviewRequired)return;
    let storeId=new URL(window.location.href).searchParams.get('store');
    try {storeId ||= JSON.parse(window.sessionStorage.getItem('checkoutState_v1') || '{}').storeId;}catch { /* No inferred store fallback. */ }
    if(/^[a-zA-Z0-9_-]{1,150}$/.test(storeId || '')){c.storeId=storeId;return;}
    try {
      const response=await window.fetch('/api/store/public-list');if(!response.ok)throw Error();const result=await response.json();if(!same(seq,c))return;
      el('store').replaceChildren(new window.Option('Selecione uma loja',''));
      const seen=new Set();for(const store of result.stores || [])if(!seen.has(store.storeId)){seen.add(store.storeId);el('store').append(new window.Option(store.name,store.storeId));}
      el('store-label').hidden=false;
    }catch {if(same(seq,c))message('Não foi possível carregar as lojas. Tente novamente mais tarde.');}
  }
  el('send').onclick=async()=>{
    const c=context,seq=sequence;if(!c)return;if(!el('store-label').hidden)c.storeId=el('store').value;
    if(!c.storeId){message('Selecione uma loja para continuar.');return;}
    el('send').disabled=true;
    try {
      const input={phone:c.phone,storeId:c.storeId},config=await call('customerPhoneClaimStatus',input);if(!same(seq,c))return;
      const proof=await verifier(config);if(!same(seq,c))return;
      const result=await call('customerPhoneClaimStart',{...input,recaptchaToken:proof.token});if(!same(seq,c))return;
      c.challengeId=result.challengeId;el('store').disabled=true;el('form').hidden=false;message('Digite o código enviado por SMS para '+result.phoneMasked+'.');el('code').focus();
      timer=window.setTimeout(()=>{if(same(seq,c))el('send').disabled=false;},Math.max(0,result.resendAt-Date.now()));
    }catch {if(same(seq,c)){message('Não foi possível enviar o código agora. Aguarde um momento e tente novamente.');el('send').disabled=false;}}
  };
  el('form').onsubmit=async event=>{
    event.preventDefault();const c=context,seq=sequence;if(!c?.challengeId)return;const button=el('form').querySelector('button');button.disabled=true;
    try {
      await call('customerPhoneClaimConfirm',{phone:c.phone,storeId:c.storeId,challengeId:c.challengeId,code:el('code').value});
      if(!same(seq,c))return;clear();await onLinked();
    }catch {if(same(seq,c))message('Não foi possível confirmar o código. Confira ou solicite um novo após aguardar.');}
    finally {button.disabled=false;}
  };
  el('cancel').onclick=clear;dialog.addEventListener('cancel',clear);
  return {open,clear,dispose:()=>{clear();dialog.remove();}};
}
