// Render only the server's masked projection for saved weak addresses. Never
// reconstruct a delivery destination from the visible description.
export function renderCheckoutAddresses({document,addresses=[],weak=false,onSelect,onDelete,onView,onEdit,onDefault,onPromote}) {
  return addresses.map((address,index)=>({address,index})).sort((a,b)=>Number(b.address?.isDefault===true)-Number(a.address?.isDefault===true)).map(({address,index})=>{
    const saved=weak && address?.saved===true;
    const card=document.createElement('div');
    card.className='bg-white border border-gray-200 rounded-lg p-3 mb-2';
    const heading=document.createElement('div');heading.className='flex items-center gap-2';
    const name=document.createElement('strong');name.className='text-sm break-words';
    name.textContent=weak && !saved && !/^(casa|trabalho|apartamento|outro)$/iu.test(address?.nickname || '') ? `Endereço ${index+1}` : address?.nickname || `Endereço ${index+1}`;heading.append(name);
    if(address?.isDefault) {const badge=document.createElement('span');badge.className='text-xs text-pink-700';badge.textContent='Padrão';heading.append(badge);}
    card.append(heading);
    const text=document.createElement('p');text.className='text-sm text-gray-700 break-words';
    text.textContent=saved ? address.summary : weak ? 'Informado por você · somente neste checkout' : typeof address==='string' ? address : address.enderecoCompleto;
    card.append(text);
    const button=document.createElement('button');button.type='button';button.className='use-address-btn mt-2 bg-pink-600 text-white py-2 px-3 rounded-lg text-sm';
    button.textContent=saved?'Selecionar este endereço':'Selecionar';button.onclick=()=>onSelect(saved ? address.summary : typeof address==='string' ? address : address.enderecoCompleto,address);card.append(button);
    for(const [label,handler] of [['Ver endereço completo',saved?onView:null],['Editar',saved?onEdit:null],['Definir como padrão',saved && !address?.isDefault?onDefault:null],['Salvar na minha conta',weak && address?.checkoutOnly?onPromote:null]]) {
      if(handler) {const action=document.createElement('button');action.type='button';action.className='ml-3 mt-2 text-sm text-pink-700';action.textContent=label;action.onclick=()=>handler(address);card.append(action);}
    }
    // Phone possession does not authorize deleting a persisted private address.
    if(onDelete && (!saved || onEdit)) {const remove=document.createElement('button');remove.type='button';remove.className='delete-address-btn ml-3 text-sm text-red-600';remove.textContent='Excluir';remove.onclick=()=>onDelete(index);card.append(remove);}
    return card;
  });
}
// Caller-supplied draft: never written into clientes/{id}, never default.
// It contains no private data obtained from a lookup. The normal checkout
// shipping validation remains authoritative when using this destination.
export function createCheckoutAddressDraft(address,id) {
  return {...address,id,saved:false,checkoutOnly:true,isDefault:false,localizacaoFrequente:false};
}
export function mergeCheckoutAddressOptions(saved,current=[]) {
  return [...saved,...current.filter(a=>a?.checkoutOnly===true)];
}
export function savedAddressFields(details) {
  return details?.checkoutAddressId ? {checkoutAddressId:details.checkoutAddressId,checkoutAddressRevision:details.checkoutAddressRevision} : {};
}
export function appendCheckoutAddress(addresses,address) {
  return [...(addresses || []).map(a=>address.isDefault && a && typeof a==='object' ? {...a,isDefault:false} : a),address];
}
