// Opt-in diagnostic only; never records UID, permissions, tokens, URLs or document data.
export const storePerfMark=(name)=>window.__crmStorePerf?.mark(name);
export const storePerfEvent=(name,values={})=>window.__crmStorePerf?.event(name,values);
export async function storePerfRequest(name,operation) {
  const start=performance.now();
  try {
    const result=await operation();
    storePerfEvent(name,{durationMs:performance.now()-start,documents:result?.docs?.length ?? (typeof result?.exists==='function'?(result.exists()?1:0):undefined)});
    return result;
  } catch(error) {
    storePerfEvent(name,{durationMs:performance.now()-start,failed:true});throw error;
  }
}
export function storePerfPaint(name) {
  if(!window.__crmStorePerf)return ()=>{};
  const id=requestAnimationFrame(()=>storePerfMark(name));return()=>cancelAnimationFrame(id);
}
storePerfMark('T1');
