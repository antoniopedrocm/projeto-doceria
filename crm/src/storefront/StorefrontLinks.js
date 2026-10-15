import React,{useEffect,useState} from 'react';
import {app} from '../firebaseConfig';
import {storeMenuUrl} from './storeRoutes.mjs';
export default function StorefrontLinks() {
  const [stores,setStores]=useState([]),[cursor,setCursor]=useState(null),[message,setMessage]=useState('Carregando lojas…');
  const [busy,setBusy]=useState(false);
  const base=app.options.projectId==='demo-doceria-checkout'
    ? 'http://127.0.0.1:5001/demo-doceria-checkout/us-central1/api'
    : `https://us-central1-${app.options.projectId}.cloudfunctions.net/api`;
  useEffect(()=>{
    let active=true;
    fetch(`${base}/store/public-list`,{cache:'no-cache'}).then(async r=>{if(!r.ok) throw Error();return r.json();}).then(data=>{
      if(active) {setStores(data.stores);setCursor(data.nextCursor);setMessage(data.stores.length?'':'Nenhuma loja disponível.');}
    }).catch(()=>{if(active) setMessage('Não foi possível carregar as lojas.');});
    return()=>{active=false;};
  },[base]);
  const more=async()=>{
    setBusy(true);
    try {const r=await fetch(`${base}/store/public-list?cursor=${encodeURIComponent(cursor)}`,{cache:'no-cache'});
      if(!r.ok) throw Error();const data=await r.json();setStores(previous=>[...previous,...data.stores]);setCursor(data.nextCursor);
    } catch {setMessage('Não foi possível carregar mais lojas.');} finally {setBusy(false);}
  };
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
    {message && <p role="status">{message}</p>}
    {stores.map(store=>{const url=storeMenuUrl(store.storeId,store.channelId || null);return url && <a key={`${store.storeId}:${store.channelId || ''}`} href={url} target="_blank" rel="noopener noreferrer" className="p-4 rounded-xl bg-pink-600 text-white text-center">{store.name}</a>;})}
    {cursor && <button disabled={busy} onClick={more}>Ver mais lojas</button>}
    <a href="/cardapio" className="p-4 underline">Escolher loja</a>
  </div>;
}
