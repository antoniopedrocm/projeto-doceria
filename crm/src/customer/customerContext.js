export const CUSTOMER_LINKS = [
  {path:'/area-cliente', label:'Página Inicial'},
  {path:'/minha-conta', label:'Minha Conta'},
  {path:'/meus-pedidos', label:'Meus Pedidos'},
];
export const isCustomerIdentity = user => Boolean(user && !user.isAnonymous && user.providerData?.some(p=>['google.com','password'].includes(p.providerId)));
export function isStaffProfile(profile) {
  return profile && profile.ativo!==false && !['inativo'].includes(String(profile.status||'').toLowerCase().trim()) &&
    ['dono','admin','gerente','atendente','contador'].includes(String(profile.role||'').toLowerCase());
}
export function customerRoute(path, search='') {
  if(path==='/minha-conta') return {path,screen:'profile'};
  if(path==='/meus-pedidos') return {path,screen:'orders'};
  const detail=path.match(/^\/meus-pedidos\/([a-zA-Z0-9_-]{1,150})$/);
  const storeId=new URLSearchParams(search).get('store');
  if(detail && /^[a-zA-Z0-9_-]{1,150}$/.test(storeId||'')) return {path,screen:'orders',orderId:detail[1],storeId};
  return {path:'/area-cliente',screen:'home'};
}
export const isCustomerPath = path => path==='/area-cliente' || path==='/minha-conta' || path==='/meus-pedidos' || path.startsWith('/meus-pedidos/');
export function menuDestination(storage, mainSession=false) {
  let storeId=null;
  try {storeId=JSON.parse(storage.getItem('checkoutState_v1')||'{}').storeId;} catch {}
  const path=storeId==='ana-guimaraes-doceria-garavelo'?'/cardapio-garavelo':'/cardapio-matriz';
  return mainSession?path+'?accountContext=crm':path;
}
