import {apiBaseUrl} from './checkout-environment.js';
import {storeMenuUrl} from './store-links.mjs';
export {storeMenuUrl};
export async function fetchPublicStore(input, {fetchImpl=fetch, base=apiBaseUrl}={}) {
  const query = new URLSearchParams(Object.entries(input).filter(([,v])=>v != null));
  const response = await fetchImpl(`${base}/store/public-config?${query}`, {cache:'no-cache'});
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.code || 'STORE_CONFIG_UNAVAILABLE'),{code:data.code});
  return data;
}
export async function bootstrapPublicStore({location=window.location, document=window.document, fetchImpl=fetch}={}) {
  const query = new URLSearchParams(location.search), storeId=query.get('store'), channelId=query.get('channel');
  const alias = location.pathname.replace(/^\//,'').replace(/\.html$/,'');
  try {
    if (!storeId && alias === 'cardapio') {
      const panel=document.getElementById('loading-message');
      panel.replaceChildren();
      const title=document.createElement('h1'); title.textContent='Escolha uma loja'; panel.append(title);
      let cursor=null;
      const more=document.createElement('button'); more.textContent='Ver mais lojas';
      const load=async()=>{
        more.disabled=true;
        const response=await fetchImpl(`${apiBaseUrl}/store/public-list${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,{cache:'no-cache'});
        if(!response.ok) throw Error('STORE_CONFIG_UNAVAILABLE');
        const data=await response.json();
        for(const store of data.stores) {const href=storeMenuUrl(store.storeId,store.channelId || null);if(!href) continue;
          const link=document.createElement('a');link.href=href;link.textContent=store.name;link.className='block p-4 underline';panel.append(link);}
        cursor=data.nextCursor;more.hidden=!cursor;more.disabled=false;panel.append(more);
      };
      more.onclick=()=>load().catch(()=>{more.textContent='Não foi possível carregar as lojas.';});
      await load(); return null;
    }
    const config=await fetchPublicStore(storeId ? {storeId,channelId} : {alias}, {fetchImpl});
    const title=document.createElement('p');title.textContent=config.channel?.name || config.name;
    title.className='text-center font-bold p-3';document.querySelector('header')?.append(title);
    if(!config.active || !config.catalog.enabled) throw Object.assign(Error('STORE_INACTIVE'),{code:'STORE_INACTIVE'});
    return config;
  } catch(e) {
    const panel=document.getElementById('loading-message');
    if(panel) panel.textContent=e.code==='STORE_NOT_FOUND' ? 'Loja não encontrada.' : 'Este cardápio está indisponível no momento.';
    return null;
  }
}
