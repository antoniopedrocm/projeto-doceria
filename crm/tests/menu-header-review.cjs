// Isolated local header review. Real template, bootstrap, account entry and cart
// open/close handlers; fictional data, no Firebase, Maps or provider requests.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),postcss=require('postcss'),tailwind=require('tailwindcss');
const {chromium}=require(path.join(os.tmpdir(),'doceria-customer-visual-tools/node_modules/playwright'));
const crm=path.resolve(__dirname,'..'),evidence=path.resolve(crm,'../docs/evidence/menu-header');
const source=fs.readFileSync(path.join(crm,'public/cardapio.html'),'utf8'),dom=new JSDOM(source),document=dom.window.document;
const header=document.querySelector('header').outerHTML,nav=document.querySelector('#subcategory-nav-container').outerHTML,cart=document.querySelector('#cart-modal').outerHTML;
const pageCss=[...document.querySelectorAll('style')].map(el=>el.textContent.replace(/@import[^;]+;/g,'')).join('\n');
const handlers=['cartButton','closeCartButton'].map(name=>{const match=source.match(new RegExp(name+"\\.addEventListener\\('click', [^\\n]+\\);"));assert.ok(match,'Missing real cart listener');return match[0];}).join('\n');
const entry=`import {bootstrapPublicStore} from '/store-public-config.mjs';
import {installCustomerAccount} from '/customer-account-core.mjs';
const query=new URLSearchParams(location.search),alias=location.pathname.replace(/^\\//,'');
const storeId=query.get('store') || (alias==='cardapio-garavelo'?'ana-guimaraes-doceria-garavelo':'ana-guimaraes-doceria-matriz');
const calls=[],config={storeId,name:'Nome da loja fictícia',active:true,catalog:{enabled:true},delivery:{available:false}};
const result=await bootstrapPublicStore({fetchImpl:async url=>{calls.push(url);return {ok:true,json:async()=>config};}});
const auth={currentUser:null},runtime={auth,functions:{},onAuthStateChanged:(_auth,fn)=>{queueMicrotask(()=>fn(null));return()=>{};},httpsCallable:()=>{throw Error('No API in header review');},EmailAuthProvider:{},signOut:async()=>{}};
const account=installCustomerAccount({runtime});await account.ready;
const cartButton=document.getElementById('cart-button'),cartModal=document.getElementById('cart-modal'),closeCartButton=document.getElementById('close-cart');
${handlers}
// Local icon substitute only; deployed Font Awesome markup is unchanged.
cartButton.querySelector('i').innerHTML='<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1h4l3 14h12l3-10H6"/><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/></svg>';
document.getElementById('subcategory-nav').innerHTML='<a class="active py-4 border-b-2">Queridinhos</a><a class="py-4">Bolos</a>';
sessionStorage.setItem('checkoutState_v1',JSON.stringify({storeId,cart:[{id:'fixture-item',quantity:2}]}));
window.headerFixture={ready:true,storeId:result.storeId,calls};`;
const skeleton=`${header}${nav}<main class="container mx-auto px-6 py-8"><h2 class="text-2xl font-bold">Queridinhos</h2><div class="mt-6 bg-white rounded-lg p-6 shadow-sm max-w-md"><h3 class="font-bold">Produto de demonstração</h3><p>Conteúdo fictício para revisão local.</p></div></main>${cart}<div id="loading-message" hidden></div>`;
(async()=>{
 fs.mkdirSync(evidence,{recursive:true});
 const css=(await postcss([tailwind({content:[{raw:source,extension:'html'},{raw:fs.readFileSync(path.join(crm,'public/customer-account-core.mjs'),'utf8'),extension:'js'}]})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined})).css;
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/area-cliente'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<h1>Área do Cliente fictícia</h1>');return;}
  if(url.pathname==='/header-fixture.mjs'){res.setHeader('Content-Type','text/javascript');res.end(entry);return;}
  if(url.pathname==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end(css+'\n'+pageCss);return;}
  if(/\.(mjs|js|css|png)$/.test(url.pathname)){const file=path.join(crm,'public',path.basename(url.pathname));if(fs.existsSync(file)){res.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));return;}}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body class="bg-pink-50">'+skeleton+'<script type="module" src="/header-fixture.mjs"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 let browser;const checks=[],screenshots=[],errors=[],external=[];
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const page=await browser.newPage();
  await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push(route.request().url());return route.abort();}return route.continue();});page.on('pageerror',error=>errors.push(error.message));
  const cases=[['matriz','/cardapio?store=ana-guimaraes-doceria-matriz','ana-guimaraes-doceria-matriz'],['garavelo','/cardapio?store=ana-guimaraes-doceria-garavelo','ana-guimaraes-doceria-garavelo'],['future','/cardapio?store=loja-futura-teste','loja-futura-teste'],['alias-matriz','/cardapio-matriz','ana-guimaraes-doceria-matriz'],['alias-garavelo','/cardapio-garavelo','ana-guimaraes-doceria-garavelo'],['alias-festa','/cardapio-festa','ana-guimaraes-doceria-matriz']];
  for(const width of [390,1920])for(const [name,url,id]of cases){
   await page.setViewportSize({width,height:width===390?800:889});await page.goto(origin+url);await page.waitForFunction(()=>window.headerFixture?.ready);
   assert.equal(await page.locator('header p').count(),0);assert.equal(await page.locator('header h1').innerText(),'Nosso Cardápio');assert.ok(await page.locator('header img').isVisible());
   const geometry=await page.evaluate(()=>{const selectors=['.menu-header-brand','#customer-account-button','#cart-button'];const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};return {header:rect(document.querySelector('header')),parts:selectors.map(s=>rect(document.querySelector(s))),scroll:document.documentElement.scrollWidth,storeId:window.headerFixture.storeId,query:window.location.search};});
   assert.equal(geometry.storeId,id);assert.equal(geometry.query,new URL(origin+url).search);assert.ok(geometry.scroll<=width+1,JSON.stringify(geometry));
   assert.ok(geometry.parts.every(r=>r.left>=0 && r.right<=width+1 && r.top>=geometry.header.top && r.bottom<=geometry.header.bottom+1));
   assert.ok(geometry.parts[0].right<=geometry.parts[1].left && geometry.parts[1].right<=geometry.parts[2].left);assert.ok(geometry.header.bottom-geometry.header.top<=90,'Header has empty row');
   await page.locator('#cart-button').click();assert.ok(await page.locator('#cart-modal').isVisible());await page.locator('#close-cart').click();assert.equal(await page.locator('#cart-modal').isVisible(),false);
   if(['matriz','garavelo'].includes(name)){const file=`${width===390?'mobile':'desktop'}-${name}.png`;await page.screenshot({path:path.join(evidence,file),fullPage:false});screenshots.push(file);}
   await page.locator('#customer-account-button').click();await page.waitForURL(url=>url.pathname==='/area-cliente');
   assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('checkoutState_v1')).storeId),id);assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('checkoutState_v1')).cart[0].quantity),2);
   checks.push({width,menu:name,storeId:id,headerHeight:geometry.header.bottom-geometry.header.top,noStoreTitle:true,noHorizontalOverflow:true,noHeaderOverlap:true,accountNavigation:true,cartOpenClose:true,storeAndCartPreserved:true});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  fs.writeFileSync(path.join(evidence,'local-review.json'),JSON.stringify({scope:'LOCAL real header/template/bootstrap/controller; fictional catalog/runtime; cart handlers extracted unchanged; font fallback and local SVG icon substitute (deployed icon unchanged)',checks,screenshots,errors,externalRequests:external,production:false},null,2)+'\n');console.log(JSON.stringify({checks:checks.length,screenshots:screenshots.length,errors,externalRequests:external}));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));dom.window.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
