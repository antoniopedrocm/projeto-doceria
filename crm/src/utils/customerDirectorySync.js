// One scoped request, coalesced order updates, no per-customer Firestore listeners.
export function createCustomerDirectorySync({load,onData,onError,isVisible=()=>true,setTimer=setTimeout,clearTimer=clearTimeout,interval=30000,debounce=5250}) {
  let disposed=false, timer=null, queued=null, running=false, reload=false, lastProjection=null;
  const refresh=async()=>{
    if (disposed) return;
    if (!isVisible()) {clearTimer(timer);timer=setTimer(refresh,interval);return;}
    if (running) {reload=true;return;}
    running=true;
    try {const result=await load();if (!disposed) {
      // Polling revalidates access, but identical UI data must not remount open forms.
      const projection=JSON.stringify([result.clients,result.issues||[],result.canViewHistoryIssues===true]);
      if(projection!==lastProjection){onData(result);lastProjection=projection;}
    }}
    catch(error) {lastProjection=null;if (!disposed) onError(error);}
    finally {
      running=false;
      if (!disposed) {
        clearTimer(timer);
        timer=setTimer(refresh,interval);
        if (reload) {reload=false;queue();}
      }
    }
  };
  const queue=()=>{if (!disposed) {clearTimer(queued);queued=setTimer(refresh,debounce);}};
  return {start:refresh,queue,dispose(){disposed=true;clearTimer(timer);clearTimer(queued);}};
}
