const {createHmac}=require('node:crypto');
const {addressRecords}=require('./checkout-auth');

const unavailable=()=>Object.assign(new Error('Selecione novamente um endereço cadastrado.'),{httpStatus:409,code:'CHECKOUT_ADDRESS_UNAVAILABLE'});
const reference=(token,customerId,id)=>'addr_'+createHmac('sha256',token).update(JSON.stringify([customerId,id])).digest('hex');
function maskedLocation(value,prefixPattern) {
  if(typeof value!=='string' || value.length>160 || /[\p{Cc}<>]/u.test(value)) return '***';
  const clean=value.trim(),prefix=clean.match(prefixPattern)?.[0] || '';
  const rest=clean.slice(prefix.length).trim().replace(/^(?:d[ao]s?\s+)+/iu,'');
  const initial=rest.match(/^\p{L}/u)?.[0] || '';
  return (prefix?prefix.trim()+' ':'')+initial+'***';
}
function maskedAddress(address,index) {
  // The saved nickname is public presentation; residential fields stay masked.
  // Never derive a label from the free-form destination of legacy records.
  const name=typeof address.nickname==='string' ? address.nickname.trim() : '';
  const nickname=name && name.length<=60 && !/\p{Cc}/u.test(name) ? name : `Endereço ${index+1}`;
  // Free-form legacy data contributes at most a street type/initial, never a
  // parsed residential component. Municipality/state require structured fields.
  const city=typeof address.city==='string' && /^[\p{L}\s.-]{1,60}$/u.test(address.city.trim()) ? address.city.trim() : '';
  const state=/^[A-Z]{2}$/.test(address.state || '') ? address.state : '';
  const streetMasked=maskedLocation(address.street || address.enderecoCompleto,/^(?:avenida|av\.?|rua|r\.?|alameda|travessa|estrada)\s+/iu);
  const neighborhoodMasked=maskedLocation(address.neighborhood,/^(?:setor|jardim|vila|parque|residencial|bairro)\s+/iu);
  return {nickname,streetMasked,numberMasked:'***',neighborhoodMasked,...(city?{city}:{}),...(state?{state}:{}),
    summary:`${streetMasked}, nº *** · ${neighborhoodMasked}${city?' — '+[city,state].filter(Boolean).join('/'):''} · Endereço protegido`,protected:true,isDefault:address.isDefault===true};
}
function addressOptions(token,customerId,values) {
  return addressRecords(customerId,values).filter(a=>typeof a.enderecoCompleto==='string' && a.enderecoCompleto.trim()).map((a,index)=>({
    id:reference(token,customerId,a.id),...maskedAddress(a,index),saved:true,
  })).sort((a,b)=>Number(b.isDefault)-Number(a.isDefault));
}
function createCheckoutAddresses({db,identities}) {
  async function resolve({token,storeId,id,revision,transaction}) {
    const context=await identities.read(token,storeId,transaction);
    if(context.mode!=='legacy_phone' || !context.legacyCustomerId || context.revision!==revision || !/^addr_[a-f0-9]{64}$/.test(id || '')) throw unavailable();
    const ref=db.collection('clientes').doc(context.legacyCustomerId);
    const snapshot=await (transaction?transaction.get(ref):ref.get());
    if(snapshot.data()?.canonicalStatus==='ALIAS') throw unavailable();
    const address=addressRecords(context.legacyCustomerId,snapshot.data()?.enderecos).find(a=>reference(token,context.legacyCustomerId,a.id)===id);
    if(!address || typeof address.enderecoCompleto!=='string' || !address.enderecoCompleto.trim()) throw unavailable();
    // Full persisted data stays server-side, including on quote/selection responses.
    return address;
  }
  return {resolve};
}
module.exports={addressOptions,maskedAddress,createCheckoutAddresses,addressReference:reference};
