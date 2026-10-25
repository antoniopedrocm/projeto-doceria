import React,{useEffect,useRef,useState} from 'react';
import CustomerFrame,{CustomerHome} from './CustomerFrame';
import './adminCustomerPreview.css';
const API=process.env.REACT_APP_API_BASE_URL || 'https://us-central1-crmdoceria-9959e.cloudfunctions.net/api';
export const loadPreviewOrders=()=>import(/* webpackIgnore: true */ '/customer-orders-view.mjs');
const screenFor=()=>window.location.pathname.endsWith('/profile')?'profile':window.location.pathname.endsWith('/orders')?'orders':'home';

// The provider holds an admin read session only. No Customer Auth, SDK mutation or cart bridge.
export function createAdminPreviewProvider({sessionAuth,uid,target,fetcher=fetch}) {
  let session=null,closed=false,startPromise=null,endPromise=null;
  async function request(resource,{method='GET',data={},withSession=true}={}) {
    const user=sessionAuth.currentUser;
    if((closed && resource!=='end') || user?.uid!==uid) throw Object.assign(new Error('Sessão encerrada'),{code:'unauthenticated'});
    const token=await user.getIdToken();
    if((closed && resource!=='end') || sessionAuth.currentUser?.uid!==uid) throw Object.assign(new Error('Sessão encerrada'),{code:'unauthenticated'});
    const query=method==='GET'?new URLSearchParams(Object.entries(data).filter(([,v])=>v!==undefined && v!==null)).toString():'';
    const response=await fetcher(`${API}/admin/customer-preview/${resource}${query?'?'+query:''}`,{method,cache:'no-store',
      ...(resource==='end'?{keepalive:true}:{}),
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(withSession?{'X-Customer-Preview':session}: {})},
      ...(method==='GET'?{}:{body:JSON.stringify(data)})});
    if(!response.ok) throw Object.assign(new Error('Visualização indisponível'),{code:response.status===401?'unauthenticated':response.status===404?'not-found':'permission-denied'});
    const result=await response.json();
    if(resource!=='sessions' && resource!=='end' && (closed || sessionAuth.currentUser?.uid!==uid))throw Object.assign(new Error('Sessão encerrada'),{code:'unauthenticated'});
    return result;
  }
  return {
    start(){startPromise=request('sessions',{method:'POST',withSession:false,data:{targetCustomerId:target}}).then(result=>{session=result.session;return result;});return startPromise;},
    profile:()=>request('profile'),addresses:()=>request('addresses'),
    call:(name,data)=>{
      if(!['customerOrders','customerOrderDetail'].includes(name)) return Promise.reject(Object.assign(new Error('Somente leitura'),{code:'permission-denied'}));
      return request(name==='customerOrders'?'orders':'order',{data});
    },
    current:()=>!closed && sessionAuth.currentUser?.uid===uid,
    end(){
      if(!endPromise){closed=true;endPromise=(async()=>{await startPromise?.catch(()=>{});if(session)await request('end',{method:'POST'});session=null;})().catch(error=>{endPromise=null;throw error;});}
      return endPromise;
    },
  };
}
export default function AdminCustomerPreview({sessionAuth,uid,target,onExit,loadOrders=loadPreviewOrders,makeProvider=createAdminPreviewProvider}) {
  const [screen,setScreen]=useState(screenFor),[customer,setCustomer]=useState(null),[addresses,setAddresses]=useState([]),[error,setError]=useState(''),[ready,setReady]=useState(false);
  const host=useRef(null),history=useRef(null),provider=useRef(null);
  useEffect(()=>{
    const shell=host.current.closest('.customer-shell');
    const banner=shell.querySelector('.admin-preview-banner'),header=shell.querySelector('header');
    const resize=()=>{shell.style.setProperty('--preview-banner-height',banner.getBoundingClientRect().height+'px');shell.style.setProperty('--preview-navigation-top',(banner.getBoundingClientRect().height+header.getBoundingClientRect().height)+'px');};
    resize();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(resize);observer?.observe(banner);observer?.observe(header);
    window.addEventListener('resize',resize);return()=>{observer?.disconnect();window.removeEventListener('resize',resize);};
  },[]);
  useEffect(()=>{
    let active=true,reader,expiryTimer;
    const api=makeProvider({sessionAuth,uid,target});provider.current=api;
    const pagehide=()=>api.end().catch(()=>{});window.addEventListener('pagehide',pagehide);
    const oldTitle=document.title;document.title='Visualizando como Cliente — somente leitura';
    let stylesheet=document.querySelector('link[href="/customer-area.css"]');
    if(!stylesheet){stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href='/customer-area.css';document.head.append(stylesheet);}
    const expired=()=>{if(active){reader?.clear();setCustomer(null);setAddresses([]);setReady(false);setError('A visualização expirou ou o acesso foi revogado. Saia e abra novamente pelo CRM.');}};
    (async()=>{
      try {
        const started=await api.start();
        if(!active){await api.end();return;}
        if(started.expiresAt)expiryTimer=setTimeout(expired,Math.max(0,started.expiresAt-Date.now()));
        const [profile,values,module]=await Promise.all([api.profile(),api.addresses(),loadOrders()]);
        if(!active || !api.current())return;
        setCustomer(profile.customer || started.customer);setAddresses(values.addresses);
        reader=module.createCustomerOrderHistory({panel:host.current,call:api.call,snapshot:()=>api,isCurrent:value=>active && value===api && api.current(),onExpired:expired,onReorder:null});
        history.current=reader;setReady(true);
      } catch {if(active)expired();}
    })();
    return()=>{active=false;clearTimeout(expiryTimer);window.removeEventListener('pagehide',pagehide);reader?.clear();history.current=null;api.end().catch(()=>{});document.title=oldTitle;};
  },[uid,target,sessionAuth,loadOrders,makeProvider]);
  useEffect(()=>{if(ready && screen==='orders')history.current?.load();},[ready,screen]);
  useEffect(()=>{const pop=()=>setScreen(screenFor());window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  const go=next=>{window.history.pushState(null,'',`/admin/customer-preview/${target}${next==='home'?'':'/'+next}`);setScreen(next);};
  const exit=async()=>{try {await provider.current?.end();onExit();} catch {setError('Não foi possível encerrar a visualização. Tente novamente.');}};
  const links=<>{[['home','Página Inicial'],['profile','Minha Conta'],['orders','Meus Pedidos']].map(([key,label])=><button key={key} aria-current={screen===key?'page':undefined} onClick={()=>go(key)}>{label}</button>)}<button onClick={exit}>Sair da visualização</button></>;
  return <CustomerFrame className="admin-customer-preview" routeKey={screen} links={links} banner={<div className="admin-preview-banner" role="region" aria-label="Visualização administrativa">
    <strong>Modo administrativo — visualizando como {customer?.nome || 'Cliente'}</strong><p>Somente leitura. Nenhuma ação será realizada em nome do cliente.</p><button onClick={exit}>Sair da visualização</button></div>}>
    {error?<p role="alert">{error}</p>:!ready?<p role="status">Autorizando visualização administrativa…</p>:<>
      {screen==='home' && <CustomerHome name={customer.nome} readOnly onOrders={()=>go('orders')} onProfile={()=>go('profile')}/>}
      {screen==='profile' && <section className="customer-area-dialog"><h1>Minha Conta</h1><h2>Meu Perfil</h2>
        <dl>{[['Nome',customer.nome],['E-mail',customer.email],['Telefone',customer.telefone],['Aniversário',customer.aniversario]].map(([label,value])=><React.Fragment key={label}><dt>{label}</dt><dd>{value || 'Não informado'}</dd></React.Fragment>)}</dl>
        <button disabled title="Indisponível no modo administrativo">Salvar dados — indisponível no modo administrativo</button>
        <h2>Endereços</h2>{!addresses.length && <p>Nenhum endereço cadastrado.</p>}
        {addresses.map((address,i)=><article className="customer-order-card" key={address.id}><h3>{address.nomeEndereco || `Endereço ${i+1}`} {address.isDefault && <small>Padrão</small>}</h3><p>{address.enderecoCompleto || [address.street,address.number,address.neighborhood,address.city,address.state].filter(Boolean).join(', ')}</p>
          {address.cep && <p>CEP: {address.cep}</p>}{(address.complement || address.complemento) && <p>Complemento: {address.complement || address.complemento}</p>}{(address.reference || address.referencia) && <p>Referência: {address.reference || address.referencia}</p>}
          <button disabled title="Indisponível no modo administrativo">Editar — indisponível no modo administrativo</button></article>)}
        <h2>Segurança da Conta</h2><p>Alterações e verificações de segurança estão indisponíveis no modo administrativo.</p><h2>Formas de Pagamento</h2><p>Operações financeiras estão indisponíveis no modo administrativo.</p></section>}
    </>}
    <section ref={host} data-orders-panel hidden={!ready || screen!=='orders'} className="customer-area-dialog">
      <div data-orders-list><h1 data-orders-heading tabIndex={-1}>Meus Pedidos</h1><button data-history>Atualizar lista</button><p data-orders-message role="status"/><ul data-orders/><button data-orders-more hidden>Carregar mais</button></div>
      <div data-order-detail hidden><h1 data-order-detail-heading tabIndex={-1}>Detalhe do Pedido</h1><p data-order-detail-message role="status"/><div data-order-detail-content/><button data-order-back>Voltar aos pedidos</button></div>
    </section>
  </CustomerFrame>;
}
