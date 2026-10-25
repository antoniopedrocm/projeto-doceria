import {clearStaffUiState} from './staffUiState';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {onIdTokenChanged} from 'firebase/auth';
import {auth} from '../firebaseConfig';
import {legacyAuth,prepareCanonicalSession,logoutCanonicalSession,syncSessionCart} from './customerRuntime';
import {isCustomerPath} from './customerContext';
import {permittedContext} from './userCapabilities';
import CustomerShell from './CustomerShell';

export default function ApplicationGate({StaffApplication,resolveCapabilities}) {
  const [view,setView]=useState({kind:'loading'});
  const control=useRef({generation:0,contextGeneration:0,uid:null,activeContext:null,requestedContext:null,resolve:null});
  useEffect(()=>{
    let active=true;
    const state=control.current;
    const resolve=async({requested,transition=false}={})=>{
      const target=requested || (isCustomerPath(window.location.pathname)?'customer':'staff');
      const generation=++state.generation;
      const uid=auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser.uid : null;
      if(transition || uid!==state.uid) {state.contextGeneration++;clearStaffUiState();setView({kind:'loading'});}
      if(uid!==state.uid) state.requestedContext=null;
      state.uid=uid;
      if(requested) state.requestedContext=requested;
      const current=()=>active && generation===state.generation && (auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser.uid : null)===uid;
      try {
        const preparation=await prepareCanonicalSession();
        if(!active || generation!==state.generation) return;
        if(preparation!=='READY') {
          state.activeContext=null;
          await syncSessionCart(null,{force:true});
          if(active && generation===state.generation) setView({kind:isCustomerPath(window.location.pathname)?'customer-login':'public',
            message:preparation==='CONFLICT'?'Sessões diferentes detectadas. Entre novamente com a conta desejada.':'Entre novamente para continuar com a sessão única.'});
          return;
        }
        if(!current()) return;
        await syncSessionCart(uid);
        if(!current()) return;
        if(!uid) {
          state.activeContext=null;
          setView({kind:isCustomerPath(window.location.pathname)?'customer-login':'public'});
          return;
        }
        const capabilities=await resolveCapabilities(auth.currentUser);
        if(!current() || capabilities.uid!==uid) return;
        if(window.location.pathname.startsWith('/admin/customer-preview/') && !capabilities.isStaff) {
          state.activeContext=null;setView({kind:'admin-denied'});return;
        }
        const context=permittedContext(capabilities,target);
        state.activeContext=context;state.requestedContext=context;
        if(!context) {
          setView({kind:capabilities.customerState==='NEEDS_PHONE'?'onboarding':'blocked',uid,capabilities});
          return;
        }
        if(context==='customer' && !isCustomerPath(window.location.pathname)) window.history.replaceState(null,'','/area-cliente');
        if(context==='staff' && isCustomerPath(window.location.pathname)) window.history.replaceState(null,'','/');
        setView({kind:context,uid,capabilities,contextGeneration:state.contextGeneration,
          message:requested && requested!==context?'Este contexto não está autorizado para sua conta.':''});
      } catch {
        if(current()) {state.activeContext=null;setView({kind:'blocked'});}
      }
    };
    state.resolve=resolve;
    const stops=[onIdTokenChanged(auth,user=>resolve({requested:user?.uid===state.uid ? state.requestedContext || state.activeContext : undefined})),onIdTokenChanged(legacyAuth,user=>{if(user) resolve({transition:true});})];
    const pop=()=>resolve({requested:isCustomerPath(window.location.pathname)?'customer':'staff',transition:true});
    window.addEventListener('popstate',pop);
    return()=>{active=false;state.generation++;state.resolve=null;stops.forEach(stop=>stop());window.removeEventListener('popstate',pop);};
  },[resolveCapabilities]);
  const changeContext=useCallback(context=>control.current.resolve?.({requested:context,transition:true}),[]);
  const openCustomer=useCallback(()=>changeContext('customer'),[changeContext]);
  const openStaff=useCallback(()=>changeContext('staff'),[changeContext]);
  const revalidateStaff=useCallback(()=>changeContext('staff'),[changeContext]);
  const logout=useCallback(async()=>{
    const state=control.current;state.generation++;state.contextGeneration++;state.activeContext=null;state.requestedContext=null;
    clearStaffUiState();
    setView({kind:'loading'});
    await logoutCanonicalSession();
    window.history.replaceState(null,'','/area-cliente');
    await state.resolve?.();
  },[]);
  if(view.kind==='loading') return <p role="status" className="p-8">Carregando acesso…</p>;
  if(view.kind==='blocked') return <main className="p-8"><p role="alert">Não foi possível autorizar o acesso. Recarregue ou entre novamente.</p><button onClick={logout}>Sair</button></main>;
  if(view.kind==='admin-denied') return <main className="p-8"><p role="alert">Acesso administrativo não autorizado.</p></main>;
  if(view.kind==='staff') return <StaffApplication key={`${view.uid}:staff:${view.contextGeneration}`} staffUid={view.uid}
    canOpenCustomer={view.capabilities.isCustomer} onCustomerContext={openCustomer} onLogout={logout} onStaffAccessLost={revalidateStaff}/>;
  if(['customer','customer-login','onboarding'].includes(view.kind)) return <CustomerShell key={`${view.uid || 'login'}:customer:${view.contextGeneration || 0}`}
    onCustomerResolved={view.kind==='onboarding'?openCustomer:undefined} sessionAuth={auth} uid={view.uid || null} canOpenStaff={view.capabilities?.isStaff===true} onStaffContext={openStaff} onLogout={logout} sessionMessage={view.message}/>;
  return <>{view.message && <p role="alert">{view.message}</p>}<StaffApplication onLogout={logout}/></>;
}
