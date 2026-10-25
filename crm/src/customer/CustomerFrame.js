import React,{useEffect,useRef,useState} from 'react';
import './customerShell.css';

// Presentation only: neither Auth, data access nor checkout actions live here.
export function CustomerHome({name,onMenu,onOrders,onProfile,readOnly=false}) {
  return <section><h1>Olá{name?`, ${name}`:''}!</h1><p>Bem-vindo à sua Área do Cliente.</p>
    <button onClick={onMenu} disabled={readOnly} title={readOnly?'Indisponível no modo administrativo':undefined}>Ir ao Cardápio</button>
    <button onClick={onOrders}>Ver meus pedidos</button><button onClick={onProfile}>Minha Conta</button></section>;
}
export default function CustomerFrame({links,children,routeKey,banner,className=''}) {
  const [drawer,setDrawer]=useState(false),[menu,setMenu]=useState(false);
  const toggle=useRef(null);
  useEffect(()=>{setDrawer(false);setMenu(false);},[routeKey]);
  useEffect(()=>{
    if(!drawer)return;
    const escape=e=>{if(e.key==='Escape'){e.preventDefault();setDrawer(false);toggle.current?.focus();}};
    const resize=()=>{if(window.innerWidth>=768)setDrawer(false);};
    window.addEventListener('keydown',escape);window.addEventListener('resize',resize);
    return()=>{window.removeEventListener('keydown',escape);window.removeEventListener('resize',resize);};
  },[drawer]);
  const close=e=>{if(e.target.closest('button,a')){setDrawer(false);setMenu(false);}};
  return <div className={`customer-shell ${className}`}>
    {banner}
    <header><button ref={toggle} aria-label="Abrir menu do cliente" aria-expanded={drawer} aria-controls="customer-drawer" onClick={()=>{if(window.innerWidth<768){setMenu(false);setDrawer(!drawer);}}}>☰</button>
      <strong>Ana Guimarães · Área do Cliente</strong><button onClick={()=>setMenu(!menu)} aria-expanded={menu}>Minha conta ▾</button>
      {menu && <nav aria-label="Menu do usuário Customer" onClick={close}>{links}</nav>}</header>
    {drawer && <button type="button" className="customer-drawer-backdrop" aria-label="Fechar menu do cliente" tabIndex={-1} onClick={()=>{setDrawer(false);toggle.current?.focus();}}/>}
    <aside id="customer-drawer" className={drawer?'is-open':''}><nav aria-label="Navegação do cliente" onClick={close}>{links}</nav></aside>
    <main>{children}</main>
  </div>;
}
