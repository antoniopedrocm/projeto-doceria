// Start under Firebase Auth Emulator, then open /?tab=A and /?tab=B in one
// browser profile and press Run in A. Commands run the actual browser SDK and
// real IndexedDB/localStorage in separate tabs; nothing touches remote Firebase.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const http=require('node:http'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const webpack=require('../node_modules/webpack');
const root=path.resolve(__dirname,'../..');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'doceria-auth-browser-'));
const source=fs.readFileSync(path.join(root,'crm/src/canonicalAuth.mjs'));
assert.ok(source.equals(fs.readFileSync(path.join(root,'crm/public/canonical-auth.mjs'))));
const release=createHash('sha256').update(source).digest('hex').slice(0,12);
const queues={A:[],B:[]},pending=new Map();let sequence=0,running=false;
let results={status:'WAITING_FOR_TWO_TABS',release,checks:[]};
function command(tab,action,options={}){
  const id=++sequence;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+tab+' '+action));},20000);
    pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
    queues[tab].push({id,action,...options});
  });
}
function pass(name){results.checks.push(name);console.log('PERSISTENCE_PASS '+name);}
async function run(){
  if(running)return;running=true;results={status:'RUNNING',release,checks:[]};
  try{
    // Negative control reproduces the precise old Staff/local -> Customer/IDB bug.
    await command('A','boot',{mode:'legacy',context:'staff'});
    const legacy=await command('A','login',{context:'staff'});
    const oldB=await command('B','boot',{mode:'old-default',context:'customer'});
    const lost=await command('A','inspect',{wait:1600});
    assert.equal(oldB.uid,legacy.uid);assert.equal(lost.uid,null);pass('negative-control-old-policy-signs-out-A');
    await command('A','dispose');await command('B','dispose');
    const restored=await command('A','boot',{mode:'canonical',context:'staff'});
    assert.equal(restored.uid,legacy.uid);assert.equal(restored.persistence,'indexedDB');pass('existing-IndexedDB-session-restored');
    await command('A','logout');await command('A','dispose');
    await command('A','boot',{mode:'legacy',context:'staff'});
    const seeded=await command('A','login',{context:'staff'});
    const a=await command('A','boot',{mode:'canonical',context:'staff'});
    assert.equal(a.uid,seeded.uid);assert.equal(a.persistence,'indexedDB');pass('existing-localStorage-session-migrated-by-SDK');
    const b=await command('B','boot',{mode:'canonical',context:'customer'});
    assert.equal(a.sdk,'10.14.1');assert.equal(b.sdk,'10.8.0');
    assert.equal(b.uid,a.uid);assert.equal(b.persistence,a.persistence);assert.equal(b.release,a.release);
    const stillA=await command('A','inspect',{wait:1600});
    assert.equal(stillA.uid,a.uid);assert.equal(stillA.context,'staff');assert.equal(stillA.nullEvents,0);assert.equal(stillA.removedEvents,0);
    assert.equal(b.context,'customer');pass('new-tab-restores-same-UID-without-signing-out-A');pass('same-release-and-policy-in-both-entries');
    await command('B','context',{context:'staff'});await command('B','context',{context:'customer'});
    assert.equal((await command('A','inspect')).context,'staff');pass('contexts-independent-switch-without-logout');
    const refreshedA=await command('A','reload',{context:'staff'});
    const refreshedB=await command('B','reload',{context:'customer'});
    assert.equal(refreshedA.uid,a.uid);assert.equal(refreshedA.context,'staff');
    assert.equal(refreshedB.uid,a.uid);assert.equal(refreshedB.context,'customer');
    assert.equal((await command('A','inspect')).uid,a.uid);pass('refresh-both-tabs-preserves-UID-and-context');
    const outB=await command('B','logout');assert.equal(outB.uid,null);assert.ok(outB.cleanupEvents.includes('T1-cleanup'));
    const outA=await command('A','inspect',{wait:1600});assert.equal(outA.uid,null);assert.equal(outA.context,null);assert.ok(outA.nullEvents>0);
    pass('logout-B-propagates-auth-null-to-A-without-reload');
    const next=await command('B','login',{context:'customer'});assert.notEqual(next.uid,a.uid);
    const nextA=await command('A','inspect',{wait:1600});assert.equal(nextA.uid,next.uid);assert.equal(nextA.context,null);
    pass('UID-switch-does-not-restore-old-Staff-context');
    await command('B','logout');await command('A','dispose');await command('B','dispose');
    await command('A','boot',{mode:'fallback',context:'staff'});
    const fallbackA=await command('A','login',{context:'staff'});
    const fallbackB=await command('B','boot',{mode:'fallback',context:'customer'});
    assert.equal(fallbackA.persistence,'localStorage');assert.equal(fallbackB.persistence,'localStorage');
    assert.equal(fallbackA.uid,fallbackB.uid);
    assert.equal((await command('A','inspect',{wait:1600})).uid,fallbackA.uid);
    pass('IDB-unavailable-uses-real-localStorage-in-both-SDKs');
    await command('B','logout');assert.equal((await command('A','inspect',{wait:1600})).uid,null);
    pass('localStorage-fallback-logout-propagates-between-tabs');
    await command('A','dispose');await command('B','dispose');
    results.status='PASS';console.log('PERSISTENCE_BROWSER_PASS checks='+results.checks.length);
  }catch(error){results.status='FAIL';results.error=error.message;console.error('PERSISTENCE_BROWSER_FAIL '+error.message);}
  finally{running=false;}
}
webpack({mode:'development',context:root,entry:path.join(__dirname,'fixtures/auth-persistence-browser-entry.js'),
  output:{path:output,filename:'sdk.js'},devtool:false,resolve:{modules:[path.join(root,'crm/node_modules'),'node_modules']}},(error,stats)=>{
  if(error || stats.hasErrors()){console.error(error || stats.toString({all:false,errors:true}));process.exitCode=1;return;}
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const url=new URL(req.url,'http://127.0.0.1');
    const json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
    if(url.pathname==='/sdk.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(output,'sdk.js')));}
    if(url.pathname==='/canonical-auth.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(root,'crm/public/canonical-auth.mjs')));}
    if(url.pathname==='/poll')return json(queues[url.searchParams.get('tab')]?.shift() || null);
    if(url.pathname==='/results')return json(results);
    if(req.method==='POST'){
      let body='';for await(const chunk of req){body+=chunk;if(body.length>10000){res.writeHead(413);return res.end();}}
      if(url.pathname==='/run'){json({started:true});void run();return;}
      if(url.pathname==='/report'){const item=JSON.parse(body),waiter=pending.get(item.id);pending.delete(item.id);
        if(waiter)item.error?waiter.reject(Error(item.error)):waiter.resolve(item.result);return json({ok:true});}
    }
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end('<!doctype html><meta name="release" content="'+release+'"><h1>Local Auth persistence checks</h1><p id="state">Loading local SDK</p><button id="start">Run local persistence checks</button><pre id="results"></pre><script defer src="/sdk.js"></script>');
  });
  server.listen(5107,'127.0.0.1',()=>console.log('PERSISTENCE_BROWSER_READY http://127.0.0.1:5107/?tab=A (also open tab=B)'));
  process.on('SIGINT',()=>{server.close();fs.rmSync(output,{recursive:true,force:true});process.exit();});
});
