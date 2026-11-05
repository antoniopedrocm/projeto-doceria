import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Home,LogOut,ShoppingBag,UserRound} from 'lucide-react';
import CustomerFrame,{CustomerHome} from './CustomerFrame';
import {CUSTOMER_LINKS,customerRoute,menuDestination} from './customerContext';
import {phoneSessionRequest} from './legacyPhoneSession';
import './customerAccount.css';

const currency=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value || 0));
const addressFields=[['nickname','Nome do endereço'],['street','Rua'],['number','Número'],['neighborhood','Bairro'],['city','Cidade'],['cep','CEP'],['complement','Complemento'],['referencia','Referência']];
const currentRoute=()=>{
  const route=customerRoute(window.location.pathname,window.location.search),query=new URLSearchParams(window.location.search);
  const match=window.location.pathname.match(/^\/meus-pedidos\/([a-zA-Z0-9_-]{1,150})$/);
  return query.get('source')==='legacy' && match?{path:window.location.pathname,screen:'orders',orderId:match[1],storeId:null}:route;
};
export default function LegacyCustomerShell({session,apiBase,onLogout,request=phoneSessionRequest}) {
  const [route,setRoute]=useState(currentRoute);
  const [account,setAccount]=useState(null),[orders,setOrders]=useState(null),[detail,setDetail]=useState(null);
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState(null);
  const flight=useRef(false);
  const menu=menuDestination(sessionStorage,window.location.search);
  const call=useCallback((method,data)=>request(apiBase,session,method,data),[apiBase,session,request]);
  const go=path=>{window.history.pushState(null,'',path);setRoute(currentRoute());};
  useEffect(()=>{const pop=()=>setRoute(currentRoute());window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  useEffect(()=>{
    let active=true;setMessage('');setOrders(null);setDetail(null);setEditing(null);
    const load=async()=>{
      const value=await call('account');if(!active)return;setAccount(value.customer);
      if(route.orderId){const result=await call('orderDetail',{orderId:route.orderId,storeId:route.storeId,...(new URLSearchParams(window.location.search).get('source')==='legacy'?{source:'legacy'}:{})});if(active)setDetail(result.order);}
      else if(route.screen==='orders'){const result=await call('orders');if(active)setOrders(result);}
    };
    load().catch(e=>{if(active){setAccount(null);setMessage(e.message);if(e.code==='PHONE_SESSION_REQUIRED') onLogout();}});
    return()=>{active=false;};
  },[call,route,onLogout]);
  useEffect(()=>{const timer=setTimeout(onLogout,Math.max(0,session.expiresAt-Date.now()));return()=>clearTimeout(timer);},[session.expiresAt,onLogout]);
  const mutate=async(method,data)=>{
    if(flight.current)return;flight.current=true;setBusy(true);setMessage('');
    try {const value=await call(method,data);setAccount(value.customer);setEditing(null);setMessage('Alterações salvas.');}
    catch(e){setMessage(e.message);if(e.code==='PHONE_SESSION_REQUIRED')onLogout();}
    finally{flight.current=false;setBusy(false);}
  };
  const icons=[Home,UserRound,ShoppingBag];
  const links=<>{CUSTOMER_LINKS.map((link,i)=>{const Icon=icons[i];return <button key={link.path} aria-current={route.screen===['home','profile','orders'][i]?'page':undefined} onClick={()=>go(link.path)}><Icon size={20}/>{link.label}</button>;})}<button onClick={()=>window.location.assign(menu)}><ShoppingBag size={20}/>Voltar ao Cardápio</button><button onClick={onLogout} className="customer-signout"><LogOut size={20}/>Sair</button></>;
  const openOrder=order=>go(`/meus-pedidos/${order.id}?store=${encodeURIComponent(order.storeId || '')}${order.source==='legacy'?'&source=legacy':''}`);
  if(!account) return <main className="p-8"><p role="status">{message || 'Verificando acesso temporário…'}</p><button type="button" onClick={onLogout}>Sair</button></main>;
  return <CustomerFrame name={account?.nome || ''} links={links} routeKey={route.path}>
    <p className="customer-feedback" role="status">Acesso temporário confirmado por SMS. Sua sessão Google/e-mail não foi alterada.</p>
    {message && <p role="status" className="customer-feedback">{message}</p>}
    {!account && !message && <p role="status">Carregando sua conta…</p>}
    {account && route.screen==='home' && <CustomerHome name={account.nome} onMenu={()=>window.location.assign(menu)} onOrders={()=>go('/meus-pedidos')} onProfile={()=>go('/minha-conta')}/>}
    {account && route.screen==='profile' && <div className="customer-self-account"><div data-profile="true"><div className="customer-page-heading"><h1>Minha Conta</h1><p>Gerencie seus dados pessoais e endereços.</p></div><div className="customer-account-grid">
      <form className="customer-panel customer-profile-card" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate('update',{nome:f.get('nome'),aniversario:f.get('aniversario')});}}>
        <header className="customer-panel-heading"><h2>Meu Perfil</h2><p>Seus dados para um atendimento com carinho.</p></header>
        <div className="customer-fields"><label>Nome<input name="nome" key={account.nome} defaultValue={account.nome} maxLength={120} required/></label><label>Telefone<input value={account.telefone} readOnly/></label><p className="customer-security-note">A troca de telefone exige verificação própria.</p><label>Data de nascimento<input name="aniversario" type="date" key={account.aniversario} defaultValue={account.aniversario}/></label></div>
        <button data-save="true" className="customer-button customer-button-primary" disabled={busy}>Salvar alterações</button>
      </form>
      <section className="customer-panel customer-addresses-panel"><header className="customer-section-heading"><div><h2>Meus Endereços</h2><p>Os lugares onde nossas delícias chegam até você.</p></div><button type="button" data-address-add="true" className="customer-button" onClick={()=>setEditing({})} disabled={busy}>+ Novo endereço</button></header>
        <div className="customer-address-list">{account.enderecos.map(a=><article className="customer-address-card" key={a.id}><div className="customer-address-heading"><h3>{a.nickname || 'Endereço'}</h3>{a.isDefault && <span className="customer-badge customer-badge-success">Padrão</span>}</div><p>{a.enderecoCompleto}</p><div className="customer-actions"><button type="button" className="customer-button" disabled={busy} onClick={()=>setEditing(a)}>Editar</button>{!a.isDefault && <button type="button" className="customer-button" disabled={busy} onClick={()=>mutate('setDefaultAddress',{addressId:a.id})}>Definir padrão</button>}<button type="button" className="customer-button customer-button-danger" disabled={busy} onClick={()=>setEditing({...a,deleting:true})}>Excluir</button></div></article>)}</div>
        {editing?.deleting ? <div role="group" aria-label="Confirmar exclusão" className="customer-actions"><p>Excluir este endereço?</p><button type="button" className="customer-button customer-button-danger" disabled={busy} onClick={()=>mutate('deleteAddress',{addressId:editing.id,confirmed:true})}>Confirmar exclusão</button><button type="button" className="customer-button" onClick={()=>setEditing(null)}>Cancelar</button></div> : editing && <form data-address-form="true" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),address=Object.fromEntries(addressFields.map(([key])=>[key,f.get(key)]));void mutate(editing.id?'updateAddress':'addAddress',{addressId:editing.id,address});}} key={editing.id || 'new'}>
          <h5>{editing.id?'Editar endereço':'Novo endereço'}</h5>{addressFields.map(([key,label])=><label key={key}>{label}<input name={key} defaultValue={editing[key] || ''} maxLength={160} required={!['cep','complement','referencia'].includes(key)}/></label>)}<button disabled={busy}>Salvar endereço</button><button type="button" onClick={()=>setEditing(null)}>Cancelar</button>
        </form>}
      </section></div></div></div>}
    {account && route.screen==='orders' && <section className="customer-self-account customer-phone-orders"><div data-profile="true"><div className="customer-page-heading"><h1>{route.orderId?'Detalhe do pedido':'Meus Pedidos'}</h1><p>Acompanhe seus pedidos e consulte seu histórico.</p></div>
      {route.orderId?<>{detail?<article className="customer-panel"><button type="button" className="customer-button" onClick={()=>go('/meus-pedidos')}>Voltar para Meus Pedidos</button><h2>Pedido #{detail.number}</h2><p>{detail.storeName} · {detail.status}</p><p>Pagamento: {detail.payment_status || 'A confirmar'}</p>{detail.itens.map((item,i)=><p key={i}>{item.quantity}× {item.nome} — {currency(item.total)}</p>)}<p>{detail.modalidade==='retirada'?'Retirada na loja':detail.endereco}</p><p>Subtotal: {currency(detail.subtotal)} · Desconto: {currency(detail.desconto)} · Frete: {currency(detail.frete)}</p><strong>Total: {currency(detail.total)}</strong></article>:<p role="status">Consultando pedido…</p>}</>:<>
        {!orders && <p role="status">Consultando pedidos…</p>}{orders?.orders.length===0 && <article className="customer-panel"><h2>Você ainda não fez nenhum pedido.</h2><button type="button" className="customer-button" onClick={()=>window.location.assign(menu)}>Ver Cardápio</button></article>}
        <div className="customer-account-grid">{orders?.orders.map(o=><article className="customer-panel" key={(o.storeId || 'legacy')+o.id}><h2>Pedido #{o.number}</h2><p>{o.storeName} · {o.createdAt?new Date(o.createdAt).toLocaleString('pt-BR'):''}</p><p>{o.status} · {currency(o.total)}</p><button type="button" className="customer-button" onClick={()=>openOrder(o)}>Ver pedido</button></article>)}</div>
        {orders?.hasMore && <button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{const next=await call('orders',{cursor:orders.nextCursor});setOrders({...next,orders:[...orders.orders,...next.orders]});}catch(e){setMessage(e.message);}finally{setBusy(false);}}}>Mais pedidos</button>}
      </>}
    </div></section>}
  </CustomerFrame>;
}
