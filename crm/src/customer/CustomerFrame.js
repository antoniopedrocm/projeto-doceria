import React,{useEffect,useRef,useState} from 'react';
import {ArrowRight,ChevronDown,Home,Menu,ShoppingBag,UserRound} from 'lucide-react';
import './customerShell.css';

// Presentation only: neither Auth, data access nor checkout actions live here.
export function CustomerHome({name,onMenu,onOrders,onProfile,readOnly=false}) {
  const firstName=name?.trim().split(/\s+/)[0];
  const shortcuts=[{label:'Meus Pedidos',description:'Acompanhe seus pedidos e consulte seu histórico.',action:'Ver pedidos',icon:ShoppingBag,onClick:onOrders},
    {label:'Minha Conta',description:'Seus dados pessoais e endereços em um só lugar.',action:'Ver perfil',icon:UserRound,onClick:onProfile},
    ...(!readOnly?[{label:'Fazer um Pedido',description:'Escolha seus favoritos no nosso cardápio.',action:'Ver cardápio',icon:ShoppingBag,onClick:onMenu}]:[])];
  return <section className="customer-home">
    <div className="customer-page-heading"><span className="customer-eyebrow">ÁREA DO CLIENTE</span><h1>Olá{firstName?`, ${firstName}`:''}! <span aria-hidden="true">👋</span></h1><p>Bem-vindo à sua área do cliente.</p></div>
    <div className="customer-shortcuts">{shortcuts.map(({label,description,action,icon:Icon,onClick})=><button className="customer-shortcut" key={label} onClick={onClick}>
      <span className="customer-icon-tile"><Icon size={23} aria-hidden="true"/></span><h2>{label}</h2><p>{description}</p><span className="customer-shortcut-link">{action}<ArrowRight size={17} aria-hidden="true"/></span>
    </button>)}</div>
    <div className="customer-welcome-note"><span className="customer-icon-tile"><Home size={22} aria-hidden="true"/></span><div><h2>Que bom ter você por aqui.</h2><p>Mais praticidade para acompanhar cada pedido e manter seus dados em dia.</p></div></div>
  </section>;
}
export default function CustomerFrame({links,children,routeKey,banner,className='',name=''}) {
  const [drawer,setDrawer]=useState(false),[menu,setMenu]=useState(false);
  const toggle=useRef(null),drawerRef=useRef(null),account=useRef(null),menuRef=useRef(null);
  const parts=name.trim().split(/\s+/).filter(Boolean);
  const shortName=parts.length?[parts[0],...(parts.length>1?[parts.at(-1)]:[])].join(' '):'Minha conta';
  const initials=parts.length?parts.slice(0,2).map(part=>part[0]).join('').toUpperCase():'AG';
  useEffect(()=>{setDrawer(false);setMenu(false);},[routeKey]);
  useEffect(()=>{
    if(!drawer)return;
    const keyboard=e=>{
      if(e.key==='Escape'){e.preventDefault();setDrawer(false);toggle.current?.focus();}
      if(e.key==='Tab'){
        const items=[toggle.current,...drawerRef.current.querySelectorAll('button:not(:disabled),a[href]')].filter(Boolean);
        const first=items[0],last=items.at(-1);
        if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}
      }
    };
    const resize=()=>{if(window.innerWidth>=768)setDrawer(false);};
    window.addEventListener('keydown',keyboard);window.addEventListener('resize',resize);
    return()=>{window.removeEventListener('keydown',keyboard);window.removeEventListener('resize',resize);};
  },[drawer]);
  useEffect(()=>{
    if(!menu)return;
    const dismiss=e=>{if(!menuRef.current?.contains(e.target) && !account.current?.contains(e.target))setMenu(false);};
    const escape=e=>{if(e.key==='Escape'){setMenu(false);account.current?.focus();}};
    document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);};
  },[menu]);
  const close=e=>{if(e.target.closest('button,a')){setDrawer(false);setMenu(false);}};
  return <div className={`customer-shell ${className}`}>
    <a className="customer-skip-link" href="#customer-main">Pular para o conteúdo</a>
    {banner}
    <header className="customer-topbar">
      <button className="customer-menu-toggle" ref={toggle} aria-label="Abrir menu do cliente" aria-expanded={drawer} aria-controls="customer-drawer" onClick={()=>{if(window.innerWidth<768){setMenu(false);setDrawer(!drawer);}}}><Menu size={23} aria-hidden="true"/></button>
      <div className="customer-brand"><img src="/logotipo.png" alt="Ana Guimarães Doceria"/><span>Área do Cliente</span></div>
      <button className="customer-account-toggle" ref={account} onClick={()=>{setDrawer(false);setMenu(!menu);}} aria-label="Abrir menu da conta" aria-expanded={menu} aria-controls="customer-account-menu"><span className="customer-avatar" aria-hidden="true">{initials}</span><span className="customer-account-name">{shortName}</span><ChevronDown size={16} aria-hidden="true"/></button>
      {menu && <nav id="customer-account-menu" ref={menuRef} aria-label="Menu do usuário Customer" onClick={close}><p className="customer-menu-caption">{name || 'Sua conta'}</p>{links}</nav>}
    </header>
    {drawer && <button type="button" className="customer-drawer-backdrop" aria-label="Fechar menu do cliente" tabIndex={-1} onClick={()=>{setDrawer(false);toggle.current?.focus();}}/>}
    <aside ref={drawerRef} id="customer-drawer" className={drawer?'is-open':''}><span className="customer-nav-caption">SUA ÁREA</span><nav aria-label="Navegação do cliente" onClick={close}>{links}</nav><div className="customer-sidebar-note">Ana Guimarães Doceria<br/><span>Feito com carinho, para você.</span></div></aside>
    <main id="customer-main" tabIndex={-1}>{children}</main>
  </div>;
}
