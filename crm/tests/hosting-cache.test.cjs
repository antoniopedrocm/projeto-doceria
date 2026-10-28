const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {execFileSync}=require('node:child_process');
// Use the Hosting emulator's own matcher and response middleware, rather than
// assuming last-match precedence or treating rewrite destinations as URLs.
let cli;
try {cli=path.dirname(require.resolve('firebase-tools/package.json'));}
catch {cli=path.join(process.env.APPDATA || '', 'npm/node_modules/firebase-tools');}
const {default:superstatic}=require(path.join(cli,'node_modules/superstatic'));
const {configMatcher}=require(path.join(cli,'node_modules/superstatic/lib/utils/patterns'));
const root=path.resolve(__dirname,'../..');
const config=JSON.parse(fs.readFileSync(path.join(root,'firebase.json'),'utf8')).hosting;
const revalidate='no-cache, max-age=0, must-revalidate';
const immutable='public, max-age=31536000, immutable';
const routes=['/','/index','/area-cliente','/minha-conta','/meus-pedidos',
  '/meus-pedidos/order-dev-1','/configuracoes','/clientes','/pedidos','/produtos',
  '/cardapio-matriz','/cardapio-garavelo','/cardapio-festa','/payment-return',
  '/index.html','/customer-account.js','/firebaseClientConfig.js',
  '/firebase-messaging-sw.js','/canonical-auth.mjs','/customer-account-core.mjs',
  '/asset-manifest.json','/manifest.json','/customer-area.css'];
const assets=['/static/js/main.06c93ccf.js','/static/js/522.599bd7ea.chunk.js',
  '/static/css/main.19b5f73a.css','/static/media/logo.abc123ef.png'];
function policies(conf,url){return conf.headers.filter(rule=>configMatcher(url,rule))
  .flatMap(rule=>rule.headers).filter(header=>header.key.toLowerCase()==='cache-control');}
test('one cache policy per real SPA/bootstrap URL; immutable only for hashed assets',()=>{
  for(const route of routes) assert.deepEqual(policies(config,route).map(x=>x.value),[revalidate],route);
  for(const asset of assets) assert.deepEqual(policies(config,asset).map(x=>x.value),[immutable],asset);
  for(const asset of ['/static/js/main.js','/static/css/main.css','/logo192.png'])
    assert.equal(policies(config,asset).some(x=>x.value.includes('immutable')),false,asset);
});
test('negative control: the old config fails SPA/bootstrap/worker invariants',()=>{
  const old=JSON.parse(execFileSync('git',['show','8ad1bf2f:firebase.json'],{cwd:root,encoding:'utf8'})).hosting;
  assert.notDeepEqual(policies(old,'/area-cliente').map(x=>x.value),[revalidate]);
  assert.notDeepEqual(policies(old,'/firebase-messaging-sw.js').map(x=>x.value),[revalidate]);
  assert.notDeepEqual(policies(old,'/customer-account.js').map(x=>x.value),[revalidate]);
});
test('actual Hosting middleware serves SPA routes and bootstrap with revalidation; hashed JS remains immutable',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'doceria-hosting-cache-'));
  const files=['/index.html',...routes.filter(x=>/\.(js|mjs|json|css)$/.test(x)),...assets];
  for(const file of files){const dest=path.join(dir,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,file==='/index.html'?'<html>release-N</html>':'fixture');}
  const release=()=>{
    const handler=superstatic({cwd:dir,config:{...config,public:'.'},fallthrough:false});
    return http.createServer((req,res)=>handler(req,res,error=>{
      res.statusCode=error?500:404;res.end('not served');
    }));
  };
  let server=release();
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin='http://127.0.0.1:'+server.address().port;
    for(const url of [...routes,...assets]){
      const response=await fetch(origin+url);
      assert.equal(response.status,200,url);
      assert.equal(response.headers.get('cache-control'),assets.includes(url)?immutable:revalidate,url);
      if(url==='/customer-area.css'){assert.match(response.headers.get('content-type'),/text\/css/);assert.equal(await response.text(),'fixture');}else await response.text();
    }
    const first=await fetch(origin+'/area-cliente');const etag=first.headers.get('etag');await first.text();
    const port=server.address().port;
    await new Promise(resolve=>server.close(resolve));
    fs.writeFileSync(path.join(dir,'index.html'),'<html>release-N-plus-one</html>');
    // New Hosting release, with a new file provider/ETag cache at the same URL.
    server=release();await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
    const next=await fetch(origin+'/area-cliente',{headers:{'If-None-Match':etag}});
    assert.equal(next.status,200);assert.match(await next.text(),/N-plus-one/);
  }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
});
