const {test}=require('node:test'),assert=require('node:assert/strict');
const {createInfinitePaySecretStore}=require('./infinitepay-secret-store');
const {cardFeeSecretId}=require('./card-1x-fee-policy');
function fakeSecretClient(project='demo-credential-unit'){
 const secrets=new Map(),versions=new Map(),calls=[];
 const client={
  async getSecret({name}){calls.push({method:'get',name});if(!secrets.has(name))throw{code:5};return[secrets.get(name)];},
  async createSecret({parent,secretId,secret}){const name=parent+'/secrets/'+secretId;calls.push({method:'create',name});if(secrets.has(name))throw{code:6};const m={name,...secret};secrets.set(name,m);return[m];},
  async addSecretVersion({parent,payload}){calls.push({method:'add',name:parent});const list=versions.get(parent)||[];list.push(Buffer.from(payload.data));versions.set(parent,list);return[{name:parent+'/versions/'+list.length}];},
  async accessSecretVersion({name}){calls.push({method:'access',name});const m=/^(.*)\/versions\/(\d+)$/.exec(name);return[{payload:{data:versions.get(m[1])?.[Number(m[2])-1]}}];}
 };return{client,secrets,versions,calls,project};
}
test('existing deterministic IDs are preserved for Matriz/Garavelo',()=>{assert.equal(cardFeeSecretId('ana-guimaraes-doceria-matriz'),'infinitepay-checkout-0ac34f0f9345e914f3f3');assert.equal(cardFeeSecretId('ana-guimaraes-doceria-garavelo'),'infinitepay-checkout-a1cccade83b8102c97d1');});
test('automatic per-store creation and append-only versions preserve prior credentials and bounded labels',async()=>{
 const f=fakeSecretClient(),store=createInfinitePaySecretStore({projectId:f.project,client:f.client}),key='inchk_synthetic_version_one';
 const v1=await store.write('matriz',{handle:'merchant_a',apiKey:key}),v2=await store.write('matriz',{handle:'merchant_a',apiKey:'inchk_synthetic_version_two'}),other=await store.write('garavelo',{handle:'merchant_b',apiKey:'inchk_synthetic_other'});
 assert.ok(v1.endsWith('/versions/1'));assert.ok(v2.endsWith('/versions/2'));assert.notEqual(other.split('/versions/')[0],v1.split('/versions/')[0]);assert.equal(JSON.parse(await store.readText(v1)).apiKey,key);assert.equal(f.calls.filter(c=>c.method==='create').length,2);for(const s of f.secrets.values())assert.ok(Object.values(s.labels).every(v=>v.length<=63));assert.equal(JSON.stringify(f.calls).includes(key),false);
});
test('foreign project, arbitrary secret, latest version and invalid store never reach the SDK',async()=>{
 const f=fakeSecretClient(),store=createInfinitePaySecretStore({projectId:f.project,client:f.client});for(const name of ['projects/other/secrets/'+cardFeeSecretId('matriz')+'/versions/1','projects/'+f.project+'/secrets/fiscal_other/versions/1','projects/'+f.project+'/secrets/'+cardFeeSecretId('matriz')+'/versions/latest'])await assert.rejects(()=>store.readText(name));await assert.rejects(()=>store.write('../other',{handle:'merchant',apiKey:'inchk_synthetic'}));assert.equal(f.calls.length,0);
});
test('pre-existing unmanaged Secret cannot be overwritten or silently adopted',async()=>{
 const f=fakeSecretClient(),name=`projects/${f.project}/secrets/${cardFeeSecretId('matriz')}`;f.secrets.set(name,{name,labels:{unrelated:'true'}});const store=createInfinitePaySecretStore({projectId:f.project,client:f.client});await assert.rejects(()=>store.write('matriz',{handle:'merchant',apiKey:'inchk_synthetic'}),e=>e.credentialCode==='EXISTING_SECRET_REVIEW_REQUIRED');assert.equal(f.calls.filter(c=>c.method==='add').length,0);
});
test('manual legacy Secret adoption requires matching trusted version/store/merchant',async()=>{
 const f=fakeSecretClient(),name=`projects/${f.project}/secrets/${cardFeeSecretId('matriz')}`;f.secrets.set(name,{name,labels:{}});f.versions.set(name,[Buffer.from(JSON.stringify({schemaVersion:1,storeId:'matriz',handle:'original',apiKey:'inchk_synthetic_old'}))]);const store=createInfinitePaySecretStore({projectId:f.project,client:f.client});await assert.rejects(()=>store.write('matriz',{handle:'new',apiKey:'inchk_synthetic_new'},{storeId:'garavelo',handle:'original',secretVersion:name+'/versions/1'}));const v=await store.write('matriz',{handle:'new',apiKey:'inchk_synthetic_new'},{storeId:'matriz',handle:'original',secretVersion:name+'/versions/1'});assert.ok(v.endsWith('/2'));assert.equal(JSON.parse(await store.readText(name+'/versions/1')).handle,'original');
});
test('SDK errors never expose supplied credentials',async()=>{
 const key='inchk_synthetic_secret_never_log',store=createInfinitePaySecretStore({projectId:'demo-credential-unit',client:{getSecret:async()=>{throw Error(key);}}});await assert.rejects(()=>store.write('matriz',{handle:'merchant',apiKey:key}),e=>!e.message.includes(key)&&e.credentialCode==='CREDENTIAL_STORAGE_UNAVAILABLE');
});
test('Google numeric project resource names are normalized to the pinned current project reference',async()=>{
 const f=fakeSecretClient(),originalCreate=f.client.createSecret;f.client.createSecret=async input=>{const[m]=await originalCreate(input);m.name=m.name.replace('projects/'+f.project,'projects/123456789');return[m];};f.client.addSecretVersion=async input=>{const[m]=await f.client.getSecret({name:input.parent});return[{name:m.name+'/versions/4'}];};const store=createInfinitePaySecretStore({projectId:f.project,client:f.client});assert.equal(await store.write('matriz',{handle:'merchant',apiKey:'inchk_synthetic_key'}),`projects/${f.project}/secrets/${cardFeeSecretId('matriz')}/versions/4`);
});
module.exports={fakeSecretClient};
