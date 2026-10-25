process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),admin=require('firebase-admin');
const project='demo-customer-phone-migration-driver',app=admin.initializeApp({projectId:project},'migration-driver-test'),db=app.firestore();
const folder=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'customer-migration-driver-fixture-')),lib=path.join(folder,'fake-cli'),workspace=path.resolve(__dirname,'..');
const endpoint='http://127.0.0.1:8080/v1/projects/'+project+'/databases/(default)/documents';
let snapshot;
function decode(value){if('stringValue'in value)return value.stringValue;if('timestampValue'in value)return value.timestampValue;if('booleanValue'in value)return value.booleanValue;if('arrayValue'in value)return(value.arrayValue.values||[]).map(decode);if('mapValue'in value)return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([k,v])=>[k,decode(v)]));return null;}
async function capture(){
  const customers=[];for(const snap of(await db.collection('clientes').get()).docs){const raw=await(await fetch(endpoint+'/'+snap.ref.path,{headers:{Authorization:'Bearer owner'}})).json();customers.push({path:snap.ref.path,updateTime:raw.updateTime,data:Object.fromEntries(Object.entries(raw.fields).map(([k,v])=>[k,decode(v)]))});}
  snapshot=path.join(folder,'snapshot-'+Date.now());fs.mkdirSync(snapshot);for(const [name,data]of Object.entries({inventory:{project:'crmdoceria-9959e'},customers,identities:[],orders:[]}))fs.writeFileSync(path.join(snapshot,name+'.json'),JSON.stringify(data));
}
function run(mode,extra=[],defaultLibrary=false){
  const result=cp.spawnSync(process.execPath,[path.join(workspace,'scripts/customer-phone-migrate.cjs'),'--project','crmdoceria-9959e',mode,'--snapshot',snapshot,...(defaultLibrary?[]:['--firebase-tools-lib',lib]),...extra],{cwd:workspace,encoding:'utf8',env:{...process.env,TEMP:folder,...(defaultLibrary?{APPDATA:path.join(folder,'default-appdata')}:{})},timeout:30000});
  return {...result,data:JSON.parse((result.stdout || result.stderr).trim().split('\n').at(-1))};
}
before(async()=>{
  fs.mkdirSync(lib);fs.writeFileSync(path.join(lib,'auth.js'),'exports.setActiveAccount=()=>{};exports.getProjectDefaultAccount=()=>({});');fs.writeFileSync(path.join(lib,'requireAuth.js'),'exports.requireAuth=async()=>{};');
  // Hard-coded localhost-only adapter. It cannot send even a read to live Google.
  fs.writeFileSync(path.join(lib,'apiv2.js'),`exports.Client=class{async request(method,p,b){if(!p.startsWith('/v1/projects/crmdoceria-9959e/'))throw Error('fixture blocked');const url='http://127.0.0.1:8080'+p.replaceAll('projects/crmdoceria-9959e/','projects/${project}/');const response=await fetch(url,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},...(b?{body:JSON.stringify(b).replaceAll('projects/crmdoceria-9959e/','projects/${project}/')}:{})});const body=await response.json();if(!response.ok)throw Object.assign(Error('fixture HTTP failure'),{status:response.status});return {body};}get(p){return this.request('GET',p);}post(p,b){return this.request('POST',p,b);}};`);
  const defaultLib=path.join(folder,'default-appdata/npm/node_modules/firebase-tools/lib');fs.mkdirSync(defaultLib,{recursive:true});for(const file of ['auth.js','requireAuth.js','apiv2.js'])fs.copyFileSync(path.join(lib,file),path.join(defaultLib,file));
  await db.doc('clientes/fixture-safe').set({nome:'Fixture',telefone:'62985550051',endereco:'Rua de teste',cidade:'Goiânia',enderecos:[]});await capture();
});
after(()=>app.delete());
test('driver dry-run/apply/retry é idempotente; rollback restaura tipagem e não toca pedidos',async()=>{
  const dry=run('--dry-run');assert.equal(dry.status,0,dry.stderr);assert.equal(dry.data.summary.additionalAddresses,1);
  const applied=run('--apply-safe',['--ack-guarded-runtime'],true);assert.equal(applied.status,0,applied.stderr);assert.equal(applied.data.state,'APPLIED');assert.equal((await db.doc('clientes/fixture-safe').get()).data().enderecos.length,1);
  const again=run('--apply-safe',['--ack-guarded-runtime']);assert.equal(again.status,0);assert.equal(again.data.writes,0);assert.equal((await db.doc('clientes/fixture-safe').get()).data().enderecos.length,1);
  const rollback=run('--rollback',['--backup',applied.data.backupFile]);assert.equal(rollback.status,0,rollback.stderr);assert.equal((await db.doc('clientes/fixture-safe').get()).data().enderecos.length,0);assert.equal((await db.doc('integrations/customerRegistry').get()).exists,false);assert.equal((await db.collectionGroup('pedidos').get()).size,0);
});
test('precondições recusam audit stale e rollback após alteração posterior',async()=>{
  const stale=run('--apply-safe',['--ack-guarded-runtime']);assert.equal(stale.status,1);
  await capture();const applied=run('--apply-safe',['--ack-guarded-runtime']);assert.equal(applied.status,0,applied.stderr);
  await db.doc('clientes/fixture-safe').update({nome:'Alteração posterior legítima'});const rollback=run('--rollback',['--backup',applied.data.backupFile]);assert.equal(rollback.status,1);assert.equal((await db.doc('clientes/fixture-safe').get()).data().nome,'Alteração posterior legítima');assert.equal((await db.doc('integrations/customerRegistry').get()).data().state,'READY');
});
