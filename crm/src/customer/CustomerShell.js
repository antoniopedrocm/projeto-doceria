import React,{useEffect,useRef,useState} from 'react';
import {CUSTOMER_LINKS,customerRoute,menuDestination} from './customerContext';
import {logoutCanonicalSession,runtimeFor,loadCustomerController} from './customerRuntime';
import CustomerFrame,{CustomerHome} from './CustomerFrame';
import {ArrowUpRight,Home,LogOut,ShoppingBag,UserRound} from 'lucide-react';
import './customerAccount.css';
import './customerLogin.css';

export default function CustomerShell({sessionAuth,uid,canOpenStaff=false,onCustomerResolved,onStaffContext,onLogout=logoutCanonicalSession,sessionMessage='',loadController=loadCustomerController}) {
  const [route,setRoute]=useState(()=>customerRoute(window.location.pathname,window.location.search));
  const [message,setMessage]=useState(uid?'Carregando sua conta…':'');
  const [customer,setCustomer]=useState(null);
  const [logoutState,setLogoutState]=useState('idle');
  const logoutFlight=useRef(null);
  const retired=useRef(false);
  const host=useRef(null),manager=useRef(null),routeRef=useRef(route);routeRef.current=route;
  const go=path=>{const next=customerRoute(path);window.history.pushState(null,'',next.path);setRoute(next);};
  useEffect(()=>{
    let active=true;let controller;
    const open=async()=>{const r=routeRef.current;if(!retired.current && uid && controller && r.screen!=='home') {if(r.orderId) await controller.openOrder(r);else await controller.openAccount(r.screen);}};
    loadController().then(module=>{
      if(!active || retired.current) return;
      const runtime=runtimeFor(sessionAuth);
      const navigate=url=>{const target=new URL(url,window.location.origin);window.location.assign(target.pathname+target.search);};
      controller=module.installCustomerAccount({host:host.current,runtime,createAccountButton:false,showCheckoutAddressAction:false,
        onMenu:()=>window.location.assign(menuDestination(sessionStorage)),
        onSession:value=>{if(active && !retired.current && sessionAuth.currentUser?.uid===uid) {setCustomer(value);setMessage('');if(value?.accountLinked) onCustomerResolved?.();}},
        onLogout:()=>{if(active && !retired.current){setCustomer(null);setMessage('Entre com Google ou e-mail para acessar sua conta.');}},
        onRoute:value=>{if(active && !retired.current && value==='home' && routeRef.current.screen!=='home') go('/area-cliente');},
        notify:text=>{if(active && !retired.current) setMessage(text);},
        // Reuse the approved cart bridge. Only its navigation preserves the Auth app context.
        navigateToMenu:navigate,
      });
      manager.current=controller;
      controller.ready.then(()=>{if(active) return open();}).catch(()=>{if(active) setMessage('Não foi possível carregar esta página. Tente novamente.');});
    }).catch(()=>{if(active) setMessage('Não foi possível carregar sua conta. Tente novamente.');});
    return ()=>{active=false;manager.current=null;controller?.dispose();};
  },[sessionAuth,uid,loadController,onCustomerResolved]); // Controller lifecycle follows the authenticated UID, never a route.
  useEffect(()=>{
    let active=true;
    if(window.location.pathname!==route.path) window.history.replaceState(null,'',route.path);
    if(uid && manager.current && route.screen!=='home') {
      const request=route.orderId?manager.current.openOrder(route):manager.current.openAccount(route.screen);
      request.catch(()=>{if(active) setMessage('Não foi possível carregar esta página. Tente novamente.');});
    }
    return ()=>{active=false;};
  },[route,uid,sessionAuth]);
  useEffect(()=>{const pop=()=>setRoute(customerRoute(window.location.pathname,window.location.search));window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  const logout=()=>{
    if(logoutFlight.current) return logoutFlight.current;
    retired.current=true;setLogoutState('pending');setMessage('');setCustomer(null);
    manager.current?.dispose();manager.current=null;
    logoutFlight.current=Promise.resolve().then(onLogout).then(()=>setLogoutState('complete')).catch(()=>{
      setLogoutState('error');setMessage('Não foi possível sair da conta. Tente novamente.');
    }).finally(()=>{logoutFlight.current=null;});
    return logoutFlight.current;
  };
  const returnToMenu=()=>{window.location.assign(menuDestination(sessionStorage,sessionAuth.app.name==='[DEFAULT]'));};
  const openStaff=()=>{onStaffContext?.();};
  // Auth null is a public entry, never the private frame with a pending Customer.
  if(!uid || logoutState!=='idle') return <div className="customer-shell customer-login-shell">
    <header className="customer-topbar"><div className="customer-brand"><img src="/logotipo.png" alt="Ana Guimarães Doceria"/><span>Área do Cliente</span></div></header>
    <main id="customer-main"><section className="customer-login-card" aria-labelledby="customer-login-heading">
      <h1 id="customer-login-heading">Área do Cliente</h1>
      {logoutState==='pending'?<p role="status">Saindo da sua conta…</p>:<>
        <p>Entre com Google ou e-mail para acessar sua conta.</p>
        {(sessionMessage || message) && <p role="status">{sessionMessage || message}</p>}
        {logoutState==='error' && <button type="button" onClick={logout}>Tentar sair novamente</button>}
        {logoutState==='complete' && <a href="/area-cliente">Entrar na minha conta</a>}
      </>}
      <div ref={host} hidden={logoutState!=='idle'}/>
      <button type="button" onClick={returnToMenu}>Voltar ao Cardápio</button>
    </section></main>
  </div>;
  const icons=[Home,UserRound,ShoppingBag];
  const links=<>{CUSTOMER_LINKS.map((link,index)=>{const Icon=icons[index];return <button key={link.path} aria-current={route.path===link.path || (link.path==='/meus-pedidos' && route.screen==='orders')?'page':undefined} onClick={()=>go(link.path)}><Icon size={20} aria-hidden="true"/>{link.label}</button>;})}<button onClick={returnToMenu}><ShoppingBag size={20} aria-hidden="true"/>Voltar ao Cardápio</button>{canOpenStaff && <button onClick={openStaff}><ArrowUpRight size={20} aria-hidden="true"/>Ir para o CRM</button>}</>;
  return <CustomerFrame name={customer?.nome || ''} routeKey={route.path} links={<>{links}<button className="customer-signout" onClick={logout}><LogOut size={20} aria-hidden="true"/>Sair</button></>}>
    {(sessionMessage || message) && <p className={`customer-feedback${message.startsWith('Carregando')?' is-loading':''}`} role="status">{sessionMessage || message}</p>}
    {uid && route.screen==='home' && <CustomerHome name={customer?.nome} onMenu={returnToMenu} onOrders={()=>go('/meus-pedidos')} onProfile={()=>go('/minha-conta')}/>}
    <div ref={host} className={route.screen==='profile'?'customer-self-account':undefined} hidden={Boolean(uid && route.screen==='home' && customer)} />
  </CustomerFrame>;
}
