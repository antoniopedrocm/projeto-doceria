// The backend, not this cache, derives the canonical Customer and write scope.
export function createLegacyAddressSaver({identity,storeId,request,randomId=()=>crypto.randomUUID()}) {
  let active=null,last=null,generation=0;
  const unsubscribe=identity.subscribe?.(()=>{generation++;});
  function save(address) {
    const s=identity.get(),version=generation;
    if(s.mode!=='legacy_phone' || !s.token) return Promise.reject(new Error('Identifique novamente pelo celular para salvar o endereço.'));
    const fields=['nickname','street','number','neighborhood','city','cep','complement','referencia','semNumero','lat','lng'];
    const safe=Object.fromEntries(fields.filter(key=>address[key]!==undefined).map(key=>[key,address[key]]));
    const signature=JSON.stringify([s.token,s.revision,safe]);
    if(active) return active.signature===signature?active.promise:Promise.reject(new Error('Aguarde o endereço ser salvo.'));
    if(last?.signature!==signature) last={signature,requestId:randomId()};
    const promise=Promise.resolve().then(()=>request({storeId,checkoutIdentityToken:s.token,checkoutIdentityRevision:s.revision,address:safe,requestId:last.requestId})).then(result=>{
      const current=identity.get();
      if(version!==generation || current.mode!=='legacy_phone' || current.token!==s.token || current.revision!==s.revision) throw new Error('A identificação mudou. Abra os endereços novamente.');
      const selected=result.addresses?.find(a=>a.id===result.addressId && a.saved===true);
      if(!selected) throw new Error('Não foi possível confirmar o endereço salvo. Tente novamente.');
      last=null; // Do not retain the caller's full form after a confirmed save.
      return {addresses:result.addresses,selected};
    }).finally(()=>{active=null;});
    active={signature,promise};return promise;
  }
  return {save,destroy(){generation++;unsubscribe?.();}};
}
