const {createHmac}=require('node:crypto');
const {addressRecords}=require('./checkout-auth');

const unavailable=()=>Object.assign(new Error('Selecione novamente um endereço cadastrado.'),{httpStatus:409,code:'CHECKOUT_ADDRESS_UNAVAILABLE'});
const reference=(token,customerId,id)=>'addr_'+createHmac('sha256',token).update(JSON.stringify([customerId,id])).digest('hex');
function maskedAddress(address,index) {
  // Nicknames and free-form legacy text can themselves contain residential data.
  const nickname=/^(casa|trabalho|apartamento|outro)$/iu.test(address.nickname || '') ? address.nickname : `Endereço ${index+1}`;
  const street=String(address.street || address.enderecoCompleto || '');
  const match=street.match(/^\s*(avenida|av\.?|rua|r\.?|alameda|travessa|estrada)\s+([\p{L}-]{1,2})?/iu);
  const type=match?.[1] || 'Logradouro';
  const hint=match?.[2] || '';
  const neighborhood=typeof address.neighborhood==='string' && /^[\p{L}\s.-]{1,60}$/u.test(address.neighborhood.trim()) ? address.neighborhood.trim() : '';
  return {nickname,summary:`${type} ${hint}••, nº ••${neighborhood?' · '+neighborhood:''}`,isDefault:address.isDefault===true};
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
    const address=addressRecords(context.legacyCustomerId,snapshot.data()?.enderecos).find(a=>reference(token,context.legacyCustomerId,a.id)===id);
    if(!address || typeof address.enderecoCompleto!=='string' || !address.enderecoCompleto.trim()) throw unavailable();
    // Full persisted data stays server-side, including on quote/selection responses.
    return address;
  }
  return {resolve};
}
module.exports={addressOptions,maskedAddress,createCheckoutAddresses};
