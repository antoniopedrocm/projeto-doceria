import React,{useEffect,useState} from 'react';
import {onIdTokenChanged,signOut} from 'firebase/auth';
import {doc} from 'firebase/firestore';
import {auth,db,getDoc} from '../firebaseConfig';
import {customerAuth,runtimeFor} from './customerRuntime';
import {isCustomerIdentity,isCustomerPath,isStaffProfile} from './customerContext';
import CustomerShell from './CustomerShell';

export default function ApplicationGate({StaffApplication}) {
  const [view,setView]=useState({kind:'loading'});
  useEffect(()=>{
    let active=true,generation=0,contextKey=null;const users=[undefined,undefined];
    const resolve=async()=>{
      const revision=++generation;
      const nextKey=users.map(u=>u===undefined?'pending':u?`${u.uid}:${u.isAnonymous}:${u.providerData?.map(p=>p.providerId).join(',')}`:'signed-out').join('|');
      // Clear immediately on identity changes. Token renewal for the same UID must
      // not unmount Staff screens/forms or an in-progress Customer view.
      if(nextKey!==contextKey) {contextKey=nextKey;setView({kind:'loading'});}
      if(users.some(u=>u===undefined)) return;
      const [staffUser,publicUser]=users;
      try {
        if(staffUser && !staffUser.isAnonymous) {
          let profile;
          try {const snapshot=await getDoc(doc(db,'users',staffUser.uid));profile=snapshot.exists()?snapshot.data():null;}
          catch(error){if(!['permission-denied','firestore/permission-denied'].includes(error.code)) throw error;}
          if(profile && (profile.ativo===false || String(profile.status||'').toLowerCase().trim()==='inativo')) throw Error('inactive');
          if(isStaffProfile(profile) && !isCustomerPath(window.location.pathname)) {
            if(active && revision===generation) setView({kind:'staff',uid:staffUser.uid});return;
          }
        }
        const selected=isCustomerIdentity(publicUser)?customerAuth:isCustomerIdentity(staffUser)?auth:null;
        if(selected) {
          const uid=selected.currentUser.uid;
          // This API verifies provider, UID and Customer ownership on the server.
          const runtime=runtimeFor(selected);
          await runtime.httpsCallable(runtime.functions,'customerAccount')();
          if(active && revision===generation && selected.currentUser?.uid===uid) setView({kind:'customer',auth:selected,uid});
        } else if(active && revision===generation) setView({kind:isCustomerPath(window.location.pathname)?'customer-login':'public'});
      } catch(error){if(active && revision===generation) setView({kind:'blocked'});}
    };
    const stops=[auth,customerAuth].map((session,index)=>onIdTokenChanged(session,user=>{users[index]=user;resolve();}));
    return ()=>{active=false;generation++;stops.forEach(stop=>stop());};
  },[]);
  if(view.kind==='loading') return <p role="status" className="p-8">Carregando acesso…</p>;
  if(view.kind==='blocked') return <main className="p-8"><p role="alert">Não foi possível autorizar o acesso. Recarregue ou entre novamente.</p><button onClick={()=>Promise.all([signOut(auth),signOut(customerAuth)])}>Sair</button></main>;
  if(view.kind==='staff') return <StaffApplication key={view.uid} staffUid={view.uid} />;
  if(view.kind==='customer' || view.kind==='customer-login') return <CustomerShell key={view.uid||'login'} sessionAuth={view.auth||customerAuth} uid={view.uid||null} />;
  return <><a className="block bg-pink-50 p-3 text-center text-pink-700 font-semibold" href="/area-cliente">Entrar na Área do Cliente</a><StaffApplication /></>;
}
