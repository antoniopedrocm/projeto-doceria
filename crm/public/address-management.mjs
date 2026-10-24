/* global globalThis */
const fields=[['nickname','Nome do endereço'],['street','Rua / logradouro'],['number','Número'],['cep','CEP'],['neighborhood','Bairro'],['city','Cidade'],['complement','Complemento'],['referencia','Referência']];
export function createPhoneAddressManager({document,identity,storeId,request,onAddresses,recaptcha,now=Date.now,clock=globalThis}) {
  let grant=null,activeScope=null,dialog=null,interval=null,expiryTimer=null,disposeCaptcha=null,generation=0;
  const scope=()=>{const s=identity.get();return {storeId,checkoutIdentityToken:s.token,checkoutIdentityRevision:s.revision};};
  const same=s=>{if(!s)return false;const current=scope();return current.checkoutIdentityToken===s.checkoutIdentityToken && current.checkoutIdentityRevision===s.checkoutIdentityRevision && identity.get().mode==='legacy_phone';};
  function closeDialog(){if(interval) clock.clearInterval(interval);interval=null;disposeCaptcha?.();disposeCaptcha=null;dialog?.remove();dialog=null;}
  function invalidate(){const old=activeScope;generation++;grant=null;activeScope=null;clock.clearTimeout(expiryTimer);closeDialog();if(old) void request('revoke',{},old).catch(()=>{});}
  const unsubscribe=identity.subscribe?.(invalidate);
  function modal(title) {
    closeDialog();const overlay=document.createElement('div');overlay.className='fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-3';
    const panel=document.createElement('section');panel.className='bg-white rounded-lg p-4 w-full max-w-lg max-h-[90vh] overflow-y-auto';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
    const heading=document.createElement('h2');heading.id='address-verification-title';heading.className='text-xl font-bold';heading.textContent=title;panel.setAttribute('aria-labelledby',heading.id);panel.append(heading);
    const message=document.createElement('p');message.setAttribute('role','status');message.className='my-3 text-sm';panel.append(message);
    const content=document.createElement('div');panel.append(content);
    const cancel=document.createElement('button');cancel.type='button';cancel.className='border rounded px-3 py-2 mt-3';cancel.textContent='Cancelar';cancel.onclick=()=>{if(!grant)invalidate();else{generation++;closeDialog();}};panel.append(cancel);
    overlay.append(panel);document.body.append(overlay);dialog=overlay;
    overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();cancel.click();}});
    heading.tabIndex=-1;heading.focus();return {content,message,cancel};
  }
  const button=(container,label,handler)=>{const b=document.createElement('button');b.type='button';b.className='border rounded px-3 py-2 mr-2 mt-2';b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await handler();}finally{b.disabled=b.dataset.cooldown==='true';}};container.append(b);return b;};
  const api=async(method,data,s=activeScope)=>{const result=await request(method,data,s);if(!same(s)) throw new Error('A identificação mudou. Abra os endereços novamente.');return result;};
  async function authorize(action) {
    const s=scope();if(identity.get().mode!=='legacy_phone') throw new Error('Identifique novamente o cliente.');
    if(grant && grant.expiresAt>now() && same(activeScope)) return action();
    activeScope=s;const current=++generation,view=modal('Confirme que este número é seu');
    view.message.textContent='Para proteger seus dados, enviaremos um código por SMS para o celular usado na identificação.';
    try {
      const availability=await api('status',{},s);if(current!==generation) return;
      if(!availability.channels.length){view.message.textContent='Verificação indisponível agora. Entre com Google ou e-mail para gerenciar seus endereços.';return;}
      const destination=document.createElement('p');destination.textContent='Celular '+availability.phoneMasked;view.content.append(destination);
      const channels=document.createElement('div');view.content.append(channels);
      if(availability.channels.includes('sms')){const consent=document.createElement('p');consent.className='text-xs my-2';consent.textContent='Ao solicitar SMS, você concorda com o uso do número pelo Google para prevenção de spam e abuso.';view.content.append(consent);}
      const captcha=document.createElement('div');view.content.append(captcha);
      const form=document.createElement('form');form.hidden=true;
      const label=document.createElement('label');label.textContent='Digite o código enviado por SMS';
      const input=document.createElement('input');input.type='text';input.inputMode='numeric';input.autocomplete='one-time-code';input.maxLength=6;input.pattern='[0-9]{6}';input.required=true;input.className='border rounded p-3 w-full';label.append(input);form.append(label);
      const submit=document.createElement('button');submit.type='submit';submit.textContent='Confirmar código';submit.className='border rounded p-3 mt-2';form.append(submit);view.content.append(form);
      let challenge=null,resendAt=0;
      const sendButtons=[];
      availability.channels.forEach(channel=>sendButtons.push(button(channels,channel==='sms'?'Enviar código por SMS':'Enviar código pelo WhatsApp',async()=>{
        try {
          let token;
          if(channel==='sms'){disposeCaptcha?.();const verifier=await recaptcha(availability.firebase,captcha);disposeCaptcha=verifier.dispose;token=verifier.token;}
          if(current!==generation || !same(s)) return;
          challenge=await api('start',{channel,...(token?{recaptchaToken:token}:{})},s);if(current!==generation) return;
          disposeCaptcha?.();disposeCaptcha=null;captcha.replaceChildren();resendAt=challenge.resendAt;input.value='';form.hidden=false;
          view.message.textContent='Digite o código enviado por SMS para confirmar seu número.';input.focus();
          if(interval) clock.clearInterval(interval);
          const tick=()=>{const seconds=Math.max(0,Math.ceil((resendAt-now())/1000));for(const b of sendButtons){b.disabled=seconds>0;b.dataset.cooldown=String(seconds>0);b.textContent=seconds?`Reenviar código em ${seconds} segundos`:b.dataset.label;}};
          tick();interval=clock.setInterval(tick,1000);
        }catch(error){if(current===generation)view.message.textContent=error.message || 'Não foi possível enviar o código agora.';}
      })));
      sendButtons.forEach(b=>{b.dataset.label=b.textContent;});
      form.onsubmit=async e=>{
        e.preventDefault();if(!challenge || !/^\d{6}$/.test(input.value)) return;submit.disabled=true;
        const code=input.value;input.value='';
        try {
          const result=await api('verify',{challengeId:challenge.challengeId,code},s);if(current!==generation) return;
          grant=result;expiryTimer=clock.setTimeout(invalidate,Math.max(0,grant.expiresAt-now()));closeDialog();await action();
        }catch(error){if(current===generation)view.message.textContent=error.message || 'Não foi possível confirmar o código.';}
        finally{submit.disabled=false;}
      };
    }catch(error){if(current===generation)view.message.textContent=error.message || 'Verificação indisponível.';}
  }
  async function execute(operation,addressId,data={}) {
    if(!grant || grant.expiresAt<=now() || !same(activeScope)){invalidate();throw new Error('Confirme novamente seu número para gerenciar endereços.');}
    try{return await api('manage',{operation,addressId,...data,addressSessionToken:grant.addressSessionToken});}
    catch(error){if(error.code==='OTP_REQUIRED'){invalidate();throw new Error('Confirme novamente seu número para gerenciar endereços.');}throw error;}
  }
  async function perform(operation,option) {
    return authorize(async()=>{
      const current=generation;
      if(operation==='default'){const result=await execute('default',option.id);if(current===generation)onAddresses(result.addresses);return;}
      if(operation==='delete'){
        const view=modal('Excluir este endereço?');view.message.textContent=option.nickname || 'Endereço selecionado';
        button(view.content,'Excluir',async()=>{view.cancel.disabled=true;try{const result=await execute('delete',option.id,{confirmed:true});if(current===generation){closeDialog();onAddresses(result.addresses);}}catch(error){view.message.textContent=error.message;}finally{view.cancel.disabled=false;}});return;
      }
      const prior=['update','view'].includes(operation)?(await execute('read',option.id)).address:option?.checkoutOnly?option:{};if(current!==generation)return;
      if(operation==='view') {
        const view=modal('Seu endereço');
        for(const [key,title] of fields){const value=prior[key] || (key==='complement'?prior.complemento:'');if(value){const row=document.createElement('p');row.className='text-sm my-2 break-words';row.textContent=title+': '+value;view.content.append(row);}}
        if(!prior.street && prior.enderecoCompleto){const row=document.createElement('p');row.className='break-words';row.textContent=prior.enderecoCompleto;view.content.append(row);}
        view.cancel.textContent='Fechar';return;
      }
      const view=modal(operation==='update'?'Editar endereço':'Adicionar novo endereço'),form=document.createElement('form'),inputs={};
      for(const [key,title] of fields){const label=document.createElement('label');label.className='block text-sm mt-2';label.textContent=title;const input=document.createElement('input');input.className='border rounded w-full p-2';input.value=prior[key] || (key==='complement'?prior.complemento:'') || '';input.maxLength=key==='nickname'?60:160;input.required=['nickname','street','number','neighborhood','city'].includes(key);label.append(input);form.append(label);inputs[key]=input;}
      if(prior.enderecoCompleto && !prior.street) view.message.textContent='Endereço antigo: complete rua, bairro e cidade para salvar a correção.';
      const defaultLabel=document.createElement('label'),isDefault=document.createElement('input');isDefault.type='checkbox';isDefault.checked=prior.isDefault===true;defaultLabel.append(isDefault,document.createTextNode(' Definir como padrão'));form.append(defaultLabel);
      const numberLabel=document.createElement('label'),noNumber=document.createElement('input');noNumber.type='checkbox';noNumber.checked=prior.semNumero===true;numberLabel.className='block mt-2';numberLabel.append(noNumber,document.createTextNode(' Sem número'));form.append(numberLabel);
      noNumber.onchange=()=>{inputs.number.required=!noNumber.checked;inputs.number.disabled=noNumber.checked;};noNumber.onchange();
      const save=document.createElement('button');save.type='submit';save.className='border rounded p-3 block mt-3';save.textContent='Salvar endereço';form.append(save);view.content.append(form);
      form.onsubmit=async e=>{e.preventDefault();save.disabled=true;view.cancel.disabled=true;try{const address=Object.fromEntries(fields.map(([key])=>[key,inputs[key].value]));address.isDefault=isDefault.checked;address.semNumero=noNumber.checked;
        const result=await execute(operation,option?.saved?option.id:undefined,{address});if(current===generation){closeDialog();onAddresses(result.addresses,option?.checkoutOnly?option.id:null);}
      }catch(error){view.message.textContent=error.message;}finally{save.disabled=false;view.cancel.disabled=false;}};
    });
  }
  return {perform,invalidate,getTrustState(){return identity.get().mode==='legacy_phone'?(grant && grant.expiresAt>now() && same(activeScope)?'legacy_phone_verified':'legacy_phone_unverified'):identity.get().mode;},destroy(){invalidate();unsubscribe?.();}};
}
