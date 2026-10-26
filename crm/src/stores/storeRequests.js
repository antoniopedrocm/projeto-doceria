import {storePerfEvent} from '../performance/storeBootstrapPerf';

// UI deadline only: never cancels a Firestore listener or grants access.
export const STORE_REQUEST_TIMEOUT_MS=15000;
export function storeDeadline(operation,ms=STORE_REQUEST_TIMEOUT_MS) {
  let timer;
  return Promise.race([Promise.resolve(operation),new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error('STORE_REQUEST_TIMEOUT')),ms);
  })]).finally(()=>clearTimeout(timer));
}

// Only in-flight public directory requests are shared. No cached authorization,
// localStorage, result TTL or stale list survives a completed request.
export function createPublicDirectoryReader(fetcher=(...args)=>fetch(...args)) {
  const pending=new Map();
  return (base,cursor=null)=>{
    const url=`${base}/store/public-list${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`;
    if(pending.has(url))return pending.get(url);
    const controller=new AbortController(),start=performance.now();
    storePerfEvent('public-links-start');
    const request=(async()=>{
      const timer=setTimeout(()=>controller.abort(),STORE_REQUEST_TIMEOUT_MS);
      try {
        const response=await fetcher(url,{cache:'no-cache',signal:controller.signal});
        if(!response.ok)throw Error('STORE_DIRECTORY_UNAVAILABLE');
        const data=await response.json();
        if(!Array.isArray(data.stores))throw Error('STORE_DIRECTORY_INVALID');
        storePerfEvent('public-links-response',{durationMs:performance.now()-start,status:response.status,documents:data.stores.length});
        return data;
      } catch(error) {
        storePerfEvent('public-links-error',{durationMs:performance.now()-start,failed:true});throw error;
      } finally {clearTimeout(timer);}
    })();
    pending.set(url,request);
    const clear=()=>{if(pending.get(url)===request)pending.delete(url);};
    request.then(clear,clear);
    return request;
  };
}
export const readPublicDirectory=createPublicDirectoryReader();
