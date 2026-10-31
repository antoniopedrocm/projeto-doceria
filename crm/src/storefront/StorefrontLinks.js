import React,{useEffect,useState} from 'react';
import {app} from '../firebaseConfig';
import {storeMenuUrl} from './storeRoutes.mjs';
import {storePerfMark,storePerfPaint} from '../performance/storeBootstrapPerf';
import {readPublicDirectory} from '../stores/storeRequests';
export default function StorefrontLinks() {
  const [stores,setStores]=useState([]),[cursor,setCursor]=useState(null),[message,setMessage]=useState('');
  const [busy,setBusy]=useState(true),[retry,setRetry]=useState(0),[moreError,setMoreError]=useState(false);
  const base=app.options.projectId==='demo-doceria-checkout'
    ? 'http://127.0.0.1:5001/demo-doceria-checkout/us-central1/api'
    : `https://us-central1-${app.options.projectId}.cloudfunctions.net/api`;
  useEffect(()=>{
    let active=true;storePerfMark('home-links-started');setBusy(true);setMessage('');
    readPublicDirectory(base).then(data=>{
      if(active) {setStores(data.stores);setCursor(data.nextCursor);setMessage(data.stores.length?'':'Nenhuma loja disponível.');}
    }).catch(()=>{if(active)setMessage('Não foi possível carregar as lojas.');}).finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[base,retry]);
  useEffect(()=>{if(stores.length)return storePerfPaint('home-links-rendered');},[stores]);
  const more=async()=>{
    setBusy(true);setMoreError(false);
    try {const data=await readPublicDirectory(base,cursor);setStores(previous=>[...previous,...data.stores]);setCursor(data.nextCursor);
    } catch {setMoreError(true);} finally {setBusy(false);}
  };
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full" aria-busy={busy}>
    {busy && !stores.length && <div role="status" className="col-span-full grid grid-cols-2 gap-3"><span className="sr-only">Carregando lojas</span><span aria-hidden="true" className="h-12 rounded-xl bg-pink-100 animate-pulse"/><span aria-hidden="true" className="h-12 rounded-xl bg-pink-100 animate-pulse"/></div>}
    {message && <p role="status">{message}</p>}
    {!busy && !stores.length && message.startsWith('Não foi') && <button onClick={()=>setRetry(value=>value+1)}>Tentar novamente</button>}
    {stores.map(store=>{const url=storeMenuUrl(store.storeId,store.channelId || null,store.publicSlug);return url && <a key={`${store.storeId}:${store.channelId || ''}`} href={url} target="_blank" rel="noopener noreferrer" className="p-4 rounded-xl bg-pink-600 text-white text-center">{store.name}</a>;})}
    {moreError && <p role="alert">Não foi possível carregar mais lojas. Tente novamente.</p>}
    {cursor && <button disabled={busy} onClick={more}>Ver mais lojas</button>}
    <a href="/cardapio" className="p-4 underline">Escolher loja</a>
  </div>;
}
