// Isolated browser fixture: real markup/CSS/functions, synthetic data, no services.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {JSDOM}=require('../node_modules/jsdom');
const {chromium}=require(path.join(process.env.TEMP,'doceria-guest-visual-tools/node_modules/playwright-core'));
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'crm/public/cardapio.html'),'utf8');
const out=path.join(root,'docs/evidence/checkout-freight-refresh-local');
const extract=(a,b)=>{const start=source.indexOf(a);assert.ok(start>=0,a);return source.slice(start,source.indexOf(b,start));};
const assets=JSON.parse(fs.readFileSync(path.join(root,'crm/build/asset-manifest.json'))),css=fs.readFileSync(path.join(root,'crm/build',assets.files['main.css'].replace(/^\//,'')),'utf8');
const document=new JSDOM(source).window.document;
for(const script of document.querySelectorAll('script'))script.remove();
for(const el of document.querySelectorAll('[src], [href]')){el.removeAttribute('src');el.removeAttribute('href');}
const markup=['cart-modal','guest-checkout-modal'].map(id=>document.getElementById(id).outerHTML).join('');
const script=`
const CHECKOUT_STORAGE_KEY='checkoutState_v1',STORE_ID='fixture-store',app={};
const getAuth=()=>({currentUser:null}),createInitialGuestAddressFlowState=()=>({currentStep:1,formData:{}});
let cart=[{id:'fixture-product',nome:'Produto sintético',preco:1,quantity:1}],pendingOrderDetails={},appliedCupom=null,
cartHydrated=true,preservedCartStoreId=null,reorderOwnerUid=null,addressStep=1;
const selectedAddressText=null;
const cartCount={textContent:''},cartSubtotal=document.getElementById('cart-subtotal'),cartTotal=document.getElementById('cart-total'),
cartDiscount=document.getElementById('cart-discount'),cartDiscountLine=document.getElementById('discount-line'),
cartShipping=document.getElementById('cart-shipping'),cartShippingLine=document.getElementById('shipping-line');
${extract('const invalidateCheckoutFreight =','function persistCheckoutState(')}
${extract('function persistCheckoutState(','window.persistCheckoutState = persistCheckoutState;')}
${extract('function chargedFreight(','function updateAllSummaries(')}
${extract('function updateCartInfo()','// Funções de Navegação')}
${extract('function updateGuestSummary()','window.updateGuestSummary = updateGuestSummary;')}
function updateAllSummaries(){updateCartInfo();updateGuestSummary();}
function renderCart(){updateCartInfo();document.getElementById('cart-items').textContent='1 × Produto sintético — R$ 1,00';}
invalidateCheckoutFreight();restoreCheckoutState();renderCart();updateAllSummaries();persistCheckoutState();
document.getElementById('cart-modal').classList.remove('hidden');
window.fixture={quote:()=>{window.guestCurrentLatLng={lat:-16,lng:-49};window.guestManualAddressLocationConfirmed=true;
window.guestAddressFlowState={currentStep:3,locationConfirmed:true,formData:{street:'Rua sintética'}};
applyCheckoutFreight({valorFrete:11.48,distanciaKm:8});persistCheckoutState();updateAllSummaries();},
 guest:()=>{document.getElementById('cart-modal').classList.add('hidden');document.getElementById('guest-checkout-modal').classList.remove('hidden');
document.getElementById('guest-address-step1').classList.add('hidden');document.getElementById('guest-address-step3').classList.remove('hidden');
for(const [id,value] of Object.entries({'guest-address-street':'Rua sintética','guest-address-number':'10','guest-address-neighborhood':'Centro','guest-address-city':'Goiânia','guest-address-nickname':'Casa de teste'}))document.getElementById(id).value=value;}};
`;
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const pageHtml='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>'+css+'</style></head><body>'+markup+'<script>'+script+'</script></body></html>';
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(pageHtml);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const report=[];
 try {for(const viewport of [{width:1920,height:889},{width:390,height:800}]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='127.0.0.1')return route.continue();external.push(url.origin);return route.abort();});
  await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');
  await page.evaluate(()=>{window.fixture.quote();sessionStorage.setItem('doceria-payment-pending',JSON.stringify({idempotencyKey:'preserved-synthetic-attempt'}));});
  for(const hard of [false,true]){
   await page.evaluate(()=>{const saved=JSON.parse(sessionStorage.getItem('checkoutState_v1'));saved.valorFrete=11.48;saved.distanciaFreteKm=8;sessionStorage.setItem('checkoutState_v1',JSON.stringify(saved));});
   if(hard){const cdp=await context.newCDPSession(page);await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await Promise.all([page.waitForNavigation({waitUntil:'load'}),cdp.send('Page.reload',{ignoreCache:true})]);await page.waitForFunction(()=>!!window.fixture);await cdp.detach();}
   else await page.reload();
   const state=await page.evaluate(()=>({freight:window.valorFrete,label:document.getElementById('cart-shipping').textContent,
    total:document.getElementById('cart-total').textContent,attempt:JSON.parse(sessionStorage.getItem('doceria-payment-pending')).idempotencyKey,
    persisted:JSON.parse(sessionStorage.getItem('checkoutState_v1')),width:document.documentElement.scrollWidth,viewport:innerWidth}));
   assert.equal(state.freight,0);assert.equal(state.label,'A calcular');assert.equal(state.persisted.valorFrete,undefined);
   assert.equal(state.attempt,'preserved-synthetic-attempt');assert.match(state.total,/\+ frete/);assert.ok(state.width<=state.viewport);
   report.push({viewport,hardReload:hard,freight:state.freight,label:state.label,total:state.total,cartItems:state.persisted.cart.length,idempotencyPreserved:true});
  }
  await page.screenshot({path:path.join(out,'cart-'+viewport.width+'.png'),fullPage:true});
  await page.evaluate(()=>window.fixture.guest());await page.locator('#send-whatsapp-button').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#guest-shipping').textContent(),'Confirme o local para calcular o frete.');
  const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,card:document.querySelector('#guest-checkout-modal > div').getBoundingClientRect().width}));
  assert.ok(layout.width<=layout.viewport);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await page.screenshot({path:path.join(out,'guest-'+viewport.width+'.png'),fullPage:true});
  await context.close();
 }} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
 fs.writeFileSync(path.join(out,'browser-review.json'),JSON.stringify({schema:1,scope:'Local synthetic fixture; no Customer/provider/network service',normalAndHardReload:'PASS',report},null,2)+'\n');
 console.log(JSON.stringify({review:'PASS',reloadChecks:report.length,screenshots:4,externalServices:0,out}));
})().catch(e=>{console.error(e);process.exitCode=1;});
