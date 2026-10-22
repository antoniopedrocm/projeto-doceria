export const CHECKOUT_MODES=Object.freeze({STRONG:'strong_auth',PHONE:'legacy_phone',GUEST:'guest'});
// Per-tab selection, not Firebase persistence. This cache is UX, never authority.
export function createCheckoutIdentity({storage,storeId,request,getUid=()=>null}) {
  const key=`checkoutIdentity_v1:${storeId}`;
  let state={mode:CHECKOUT_MODES.GUEST,token:null,revision:0,uid:null};
  try {
    const saved=JSON.parse(storage.getItem(key) || 'null');
    if(saved && Object.values(CHECKOUT_MODES).includes(saved.mode)) state={...state,...saved};
  } catch { /* malformed selection stays guest */ }
  let pending=Promise.resolve();
  let generation=0,networkToken=state.token;
  const save=()=>{try {storage.setItem(key,JSON.stringify(state));} catch { /* server still enforces selection */ }};
  const publish=data=>{state={...state,...data,uid:data.mode===CHECKOUT_MODES.STRONG?getUid():null};save();return {...state};};
  return {
    get:()=>({...state}),
    isStrong:()=>state.mode===CHECKOUT_MODES.STRONG && !!getUid() && state.uid===getUid(),
    select(mode) {
      const current=++generation;
      // Demote synchronously, so passive auth callbacks cannot restore privileges.
      state={...state,mode,uid:null};save();
      const operation=pending.catch(()=>{}).then(async()=>{
        const data=await request({storeId,mode,checkoutIdentityToken:networkToken});
        networkToken=data.token;
        if(current!==generation) return data;
        return publish(data);
      });
      pending=operation;return operation;
    },
    acceptPhone(data){networkToken=data.token;return publish({...data,mode:CHECKOUT_MODES.PHONE});},
    ready:()=>pending,
    invalidate(){generation++;networkToken=null;state={mode:CHECKOUT_MODES.GUEST,token:null,revision:0,uid:null};save();},
  };
}
