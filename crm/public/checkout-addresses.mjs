// Render only the server's masked projection for saved weak addresses. Never
// reconstruct a delivery destination from the visible description.
export function renderCheckoutAddresses({document,addresses=[],weak=false,onSelect,onDelete}) {
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
    text.textContent=saved ? address.summary : weak ? 'Endereço informado neste checkout · nº ••' : typeof address==='string' ? address : address.enderecoCompleto;
    card.append(text);
    const button=document.createElement('button');button.type='button';button.className='use-address-btn mt-2 bg-pink-600 text-white py-2 px-3 rounded-lg text-sm';
    button.textContent='Selecionar';button.onclick=()=>onSelect(saved ? address.summary : typeof address==='string' ? address : address.enderecoCompleto,address);card.append(button);
    // Phone possession does not authorize deleting a persisted private address.
    if(!saved && onDelete) {const remove=document.createElement('button');remove.type='button';remove.className='delete-address-btn ml-3 text-sm text-red-600';remove.textContent='Excluir';remove.onclick=()=>onDelete(index);card.append(remove);}
    return card;
  });
}
export function savedAddressFields(details) {
  return details?.checkoutAddressId ? {checkoutAddressId:details.checkoutAddressId,checkoutAddressRevision:details.checkoutAddressRevision} : {};
}
export function appendCheckoutAddress(addresses,address) {
  return [...(addresses || []).map(a=>address.isDefault && a && typeof a==='object' ? {...a,isDefault:false} : a),address];
}
