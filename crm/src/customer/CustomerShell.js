import React,{useEffect,useRef,useState} from 'react';
import {signOut} from 'firebase/auth';
import {auth} from '../firebaseConfig';
import {CUSTOMER_LINKS,customerRoute,menuDestination} from './customerContext';
import {customerAuth,runtimeFor,loadCustomerController} from './customerRuntime';
import './customerShell.css';

export default function CustomerShell({sessionAuth,uid,loadController=loadCustomerController}) {
  const [route,setRoute]=useState(()=>customerRoute(window.location.pathname,window.location.search));
  const [drawer,setDrawer]=useState(false),[menu,setMenu]=useState(false),[message,setMessage]=useState('Carregando sua conta…');
  const [customer,setCustomer]=useState(null);
  const host=useRef(null),manager=useRef(null),routeRef=useRef(route);routeRef.current=route;
  const go=path=>{const next=customerRoute(path);window.history.pushState(null,'',next.path);setRoute(next);setDrawer(false);setMenu(false);};
  useEffect(()=>{
    let active=true;let controller;
    const open=async()=>{const r=routeRef.current;if(controller && r.screen!=='home') {if(r.orderId) await controller.openOrder(r);else await controller.openAccount(r.screen);}};
    loadController().then(module=>{
      if(!active) return;
      const runtime=runtimeFor(sessionAuth);
      const navigate=url=>{const target=new URL(url,window.location.origin);if(sessionAuth.app.name==='[DEFAULT]') target.searchParams.set('accountContext','crm');window.location.assign(target.pathname+target.search);};
      controller=module.installCustomerAccount({host:host.current,runtime,createAccountButton:false,showCheckoutAddressAction:false,
        onSession:value=>{if(active && sessionAuth.currentUser?.uid===uid) {setCustomer(value);setMessage('');}},
        onLogout:()=>{if(active){setCustomer(null);setMessage('Entre com Google ou e-mail para acessar sua conta.');}},
        onRoute:value=>{if(active && value==='home' && routeRef.current.screen!=='home') go('/area-cliente');},
        notify:text=>{if(active) setMessage(text);},
        // Reuse the approved cart bridge. Only its navigation preserves the Auth app context.
        navigateToMenu:navigate,
      });
      manager.current=controller;
      controller.ready.then(()=>{if(active) return open();}).catch(()=>{if(active) setMessage('Não foi possível carregar esta página. Tente novamente.');});
    }).catch(()=>{if(active) setMessage('Não foi possível carregar sua conta. Tente novamente.');});
    return ()=>{active=false;manager.current=null;controller?.dispose();};
  },[sessionAuth,uid,loadController]); // Controller lifecycle follows the authenticated UID, never a route.
  useEffect(()=>{
    let active=true;
    if(window.location.pathname!==route.path) window.history.replaceState(null,'',route.path);
    if(manager.current && route.screen!=='home') {
      const request=route.orderId?manager.current.openOrder(route):manager.current.openAccount(route.screen);
      request.catch(()=>{if(active) setMessage('Não foi possível carregar esta página. Tente novamente.');});
    }
    return ()=>{active=false;};
  },[route,uid,sessionAuth]);
  useEffect(()=>{const pop=()=>setRoute(customerRoute(window.location.pathname,window.location.search));window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  const logout=async()=>{setCustomer(null);manager.current?.dispose();manager.current=null;await Promise.all([...new Set([sessionAuth,auth,customerAuth])].map(session=>signOut(session)));window.history.replaceState(null,'','/area-cliente');};
  const returnToMenu=()=>window.location.assign(menuDestination(sessionStorage,sessionAuth.app.name==='[DEFAULT]'));
  const links=<>{CUSTOMER_LINKS.map(link=><button key={link.path} aria-current={route.path===link.path?'page':undefined} onClick={()=>go(link.path)}>{link.label}</button>)}<button onClick={returnToMenu}>Voltar ao Cardápio</button></>;
  return <div className="customer-shell">
    <header><button aria-label="Abrir menu do cliente" onClick={()=>setDrawer(!drawer)}>☰</button><strong>Ana Guimarães · Área do Cliente</strong><button onClick={()=>setMenu(!menu)} aria-expanded={menu}>Minha conta ▾</button>
      {menu && <nav aria-label="Menu do usuário Customer">{links}<button onClick={logout}>Sair</button></nav>}</header>
    <aside className={drawer?'is-open':''}><nav aria-label="Navegação do cliente">{links}<button onClick={logout}>Sair</button></nav></aside>
    <main><p role="status">{message}</p>
      {uid && route.screen==='home' && <section><h1>Olá{customer?.nome?`, ${customer.nome}`:''}!</h1><p>Bem-vindo à sua Área do Cliente.</p><button onClick={returnToMenu}>Ir ao Cardápio</button><button onClick={()=>go('/meus-pedidos')}>Ver meus pedidos</button><button onClick={()=>go('/minha-conta')}>Minha Conta</button></section>}
      <div ref={host} hidden={Boolean(uid && route.screen==='home' && customer)} />
    </main></div>;
}
