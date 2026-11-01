import React,{useEffect,useRef,useState} from 'react';
import {resolvePublicMenuRoute} from '../storefront/storeRoutes.mjs';
import {customerApiBase,lookupPhoneByStore} from './customerRuntime';

export default function LegacyPhoneAccess({menuPath}) {
  const [phone,setPhone]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const manager=useRef(null),completed=useRef(false);
  useEffect(()=>()=>{if(!completed.current)manager.current?.destroy();},[]);
  const submit=async e=>{
    e.preventDefault();if(busy)return;setBusy(true);setMessage('');manager.current?.destroy();
    try {
      const url=new URL(menuPath,window.location.origin),route=resolvePublicMenuRoute(url);
      let storeId=route.storeId;
      if(route.kind==='alias') {
        const r=await fetch(customerApiBase+'/store/public-config?alias='+encodeURIComponent(route.alias));
        if(!r.ok)throw new Error('Abra o cardápio da sua loja para acessar com celular.');
        storeId=(await r.json()).storeId;
      }
      if(!storeId)throw new Error('Abra o cardápio da sua loja e acesse Minha Conta para entrar com celular.');
      const result=await lookupPhoneByStore({lojaId:storeId,telefone:phone});
      if(!result.data.found)throw new Error('Cadastro não encontrado. Entre com Google ou e-mail para continuar.');
      const [{createPhoneAddressManager},{createSmsRecaptcha}]=await Promise.all([
        import(/* webpackIgnore: true */ '/address-management.mjs'),import(/* webpackIgnore: true */ '/address-verification-firebase.mjs')]);
      const context=result.data.checkoutIdentity;
      manager.current=createPhoneAddressManager({document,storeId,identity:{get:()=>context,subscribe:()=>()=>{}},recaptcha:createSmsRecaptcha,
        request:async(method,data,scope)=>{
          const r=await fetch(customerApiBase+'/checkout/address-verification/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...scope,...data}),signal:AbortSignal.timeout(15000)});
          const value=await r.json();if(!r.ok){const error=new Error(value.message);error.code=value.code;throw error;}return value;
        }});
      await manager.current.authorize(()=>{completed.current=true;window.location.assign('/area-cliente');});
    }catch(error){setMessage(error.message || 'Não foi possível acessar com celular.');}
    finally{setBusy(false);}
  };
  return <details className="customer-phone-access"><summary>Acessar temporariamente com celular</summary><form onSubmit={submit}><p>Confirme seu número por SMS para acessar seus dados nesta sessão.</p><label>Celular com DDD<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} autoComplete="tel" required maxLength={20}/></label><button type="submit" disabled={busy}>{busy?'Consultando…':'Confirmar celular por SMS'}</button>{message && <p role="status">{message}</p>}</form></details>;
}
