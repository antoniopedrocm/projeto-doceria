process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const {test}=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,updateDoc,deleteDoc,getDoc}=require('firebase/firestore');
test('Rules: disponibilidade somente servidor e auditoria append-only; frete existente preservado',async()=>{
  const env=await initializeTestEnvironment({projectId:'demo-doceria-checkout',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}});
  const root='lojas/fulfillment-rules',config=root+'/configuracoes/storefront',audit=root+'/fulfillmentAudit/event';
  try {await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),root),{nome:'Fixture store',ativo:true});await setDoc(doc(c.firestore(),'users/fulfillment-rules-owner'),{role:'dono'});await setDoc(doc(c.firestore(),config),{schemaVersion:1,delivery:{enabled:true},pickup:{enabled:true}});await setDoc(doc(c.firestore(),audit),{action:'FULFILLMENT_AVAILABILITY_CHANGED'});});
    const staff=env.authenticatedContext('fulfillment-rules-owner').firestore();await assertSucceeds(getDoc(doc(staff,config)));
    for(const db of [staff,env.authenticatedContext('customer').firestore(),env.unauthenticatedContext().firestore()]){
      await assertFails(setDoc(doc(db,config),{delivery:{enabled:false}},{merge:true}));await assertFails(updateDoc(doc(db,config),{'pickup.enabled':false}));await assertFails(deleteDoc(doc(db,config)));
      await assertFails(setDoc(doc(db,root+'/fulfillmentAudit/forged'),{action:'forged'}));await assertFails(updateDoc(doc(db,audit),{action:'forged'}));await assertFails(deleteDoc(doc(db,audit)));
    }
    await assertSucceeds(setDoc(doc(staff,root+'/configuracoes/config'),{frete:{valorPorKm:3}}));
    await assertSucceeds(setDoc(doc(staff,root+'/configuracoes/frete'),{valorPorKm:3}));
  } finally {await env.cleanup();}
});
