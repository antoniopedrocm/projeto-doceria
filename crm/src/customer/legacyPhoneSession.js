const KEY='customerPhoneSession_v1';
export function readPhoneSession(storage=window.sessionStorage,now=Date.now()) {
  try {
    const s=JSON.parse(storage.getItem(KEY) || 'null');
    if(s?.purpose==='CUSTOMER_PRIVATE_SESSION' && /^[\w-]{1,150}$/.test(s.storeId || '') &&
      /^[a-f0-9]{64}$/.test(s.checkoutIdentityToken || '') && /^[a-f0-9]{64}$/.test(s.addressSessionToken || '') &&
      Number.isSafeInteger(s.checkoutIdentityRevision) && Number.isFinite(s.expiresAt) && s.expiresAt>now) return s;
    storage.removeItem(KEY);
  }catch { /* Cache never authorizes access. */ }
  return null;
}
export function clearPhoneSession(storage=window.sessionStorage){try {storage.removeItem(KEY);}catch{}}
export async function phoneSessionRequest(base,session,method,data={}) {
  const r=await fetch(base+'/customer/phone-session/'+method,{method:'POST',headers:{'Content-Type':'application/json'},
    cache:'no-store',body:JSON.stringify({session,data}),signal:AbortSignal.timeout(15000)});
  const result=await r.json();
  if(!r.ok){const error=new Error(result.message || 'Não foi possível acessar sua conta.');error.code=result.code;throw error;}
  return result;
}
