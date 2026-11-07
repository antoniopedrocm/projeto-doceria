// Local presentation only: real template/CSS, synthetic contact, no services.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const {JSDOM}=require('../node_modules/jsdom');
// Optional isolated review tooling; never part of the application bundle.
const {chromium}=require(path.join(process.env.TEMP,'doceria-guest-visual-tools/node_modules/playwright-core'));
const root=path.resolve(__dirname,'../..'),pendingMode=process.argv.includes('--pending'),out=path.join(root,pendingMode?'docs/evidence/guest-attempt-recovery-local':'docs/evidence/guest-checkout-local');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const {syncPaymentChoices,PAYMENT_CHOICES}=await import(pathToFileURL(path.join(root,'crm/public/checkout-payment-choice.mjs')));
 const assets=JSON.parse(fs.readFileSync(path.join(root,'crm/build/asset-manifest.json')));
 const css=fs.readFileSync(path.join(root,'crm/build',assets.files['main.css'].replace(/^\//,'')),'utf8');
 const source=fs.readFileSync(path.join(root,'crm/public/cardapio.html'),'utf8'),dom=new JSDOM(source),document=dom.window.document;
 const modal=document.getElementById('guest-checkout-modal');modal.classList.remove('hidden');
 document.getElementById('guest-address-step1').classList.add('hidden');document.getElementById('guest-address-step3').classList.remove('hidden');
 const values={'guest-name':'Cliente de teste local','guest-phone':'62981005566','guest-address-street':'Rua sintética','guest-address-number':'10','guest-address-neighborhood':'Centro','guest-address-city':'Goiânia','guest-address-zip':'74000000','guest-address-nickname':'Casa de teste'};
 for(const [id,value] of Object.entries(values))document.getElementById(id).value=value;
 // Serialize current values into the standalone presentation fixture.
 for(const input of modal.querySelectorAll('input'))input.setAttribute('value',input.value);
 for(const [id,value] of Object.entries({'guest-subtotal':'R$ 10,00','guest-shipping':'R$ 4,00','guest-total':'R$ 14,00'}))document.getElementById(id).textContent=value;
 const select=document.getElementById('guest-payment-method');syncPaymentChoices(select,true,true,'guest-v1');
 if(pendingMode){
  const {inspectGuestPaymentAttempt}=await import(pathToFileURL(path.join(root,'crm/public/guest-payment-attempt.mjs'))),id='e'.repeat(64);
  const values=new Map([['doceria-payment-pending',JSON.stringify({paymentId:id,idempotencyKey:'synthetic-attempt'})],['doceria-payment-return:'+id,JSON.stringify({token:'f'.repeat(64)})]]);
  const pending=await inspectGuestPaymentAttempt({storage:{getItem:k=>values.get(k),removeItem:()=>assert.fail('Pending key must stay')},request:async()=>({ok:true,data:{payment_status:'PENDING'}})});
  const fn=source.slice(source.indexOf('function showGuestPendingPayment('),source.indexOf('async function handleGuestOrder()'));
  vm.runInNewContext(fn+';showGuestPendingPayment(pending);',{document,pending,encodeURIComponent});
 }
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),report=[];
 try {for(const viewport of [{width:1920,height:889},{width:390,height:800}]) {
  const page=await browser.newPage({viewport}),errors=[];let requests=0;
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{requests++;return route.abort();});
  await page.setContent('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>'+css+'</style><style>body{margin:0;background:#f3f4f6;font-family:Arial,sans-serif}</style></head><body>'+modal.outerHTML+'</body></html>');
  for(const choice of pendingMode?['AGREED_LATER']:['ONLINE_NOW','AGREED_LATER']) {
   await page.selectOption('#guest-payment-method',choice);
   await page.locator('#guest-payment-choice-help').evaluate((el,text)=>{el.textContent=text;},PAYMENT_CHOICES[choice].helper);
   await page.locator('#send-whatsapp-button').scrollIntoViewIfNeeded();
   const layout=await page.evaluate(()=>{
    const card=document.querySelector('#guest-checkout-modal > div'),scroll=card.querySelector('.overflow-y-auto'),button=document.getElementById('send-whatsapp-button');
    const bounds=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    return {pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,card:bounds(card),button:bounds(button),scrollWidth:scroll.scrollWidth,scrollClientWidth:scroll.clientWidth,
     options:[...document.querySelector('#guest-payment-method').options].map(o=>o.textContent),privateInvitation:!!document.querySelector('[data-checkout-strong-invitation]')};
   });
   assert.ok(layout.pageWidth<=viewport.width);assert.ok(layout.scrollWidth<=layout.scrollClientWidth);
   assert.ok(layout.button.x>=layout.card.x && layout.button.right<=layout.card.right && layout.button.bottom<=viewport.height);
   assert.equal(layout.privateInvitation,false);assert.deepEqual(errors,[]);
   if(pendingMode){assert.equal(await page.locator('#guest-pending-payment').isVisible(),true);assert.equal(await page.locator('#guest-pending-payment-link').isVisible(),true);}
   const filename=choice.toLowerCase()+'-'+viewport.width+'.png';await page.screenshot({path:path.join(out,filename),fullPage:true});
   report.push({choice,viewport,...layout,errors,screenshot:filename,externalRequests:requests});
  }
  if(!pendingMode){await page.locator('#guest-name').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'contact-'+viewport.width+'.png'),fullPage:true});}await page.close();
 }} finally {dom.window.close();await browser.close();}
 fs.writeFileSync(path.join(out,'visual-review.json'),JSON.stringify({scope:'Local synthetic presentation, not live DEV homologation. Existing modal scroll retained for long address forms.',pendingMode,report},null,2)+'\n');
 console.log(JSON.stringify({cases:report.length,screenshots:pendingMode?2:6,desktop:'PASS',mobile:'PASS',externalServices:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
