// Isolated presentation review: real template/components, fictional order, no Firebase/provider.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {JSDOM}=require('../node_modules/jsdom'),React=require('../node_modules/react');
const {renderToStaticMarkup}=require('../node_modules/react-dom/server'),babel=require('../node_modules/@babel/core'),parser=require('../node_modules/@babel/parser');
const {chromium}=require(path.join(process.env.TEMP,'doceria-customer-visual-tools/node_modules/playwright'));
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/evidence/authenticated-payment-v1');
function jsxExpression(expression){const code=babel.transformSync('module.exports = ('+expression+');',{presets:[require.resolve('../node_modules/@babel/preset-react')]}).code;const module={exports:{}};vm.runInNewContext(code,{module,React});return module.exports;}
(async()=>{
  fs.mkdirSync(out,{recursive:true});const {syncPaymentChoices}=await import(pathToFileURL(path.join(root,'crm/public/checkout-payment-choice.mjs')));
  const source=fs.readFileSync(path.join(root,'crm/src/App.js'),'utf8'),ast=parser.parse(source,{sourceType:'module',plugins:['jsx']});
  const select=ast.program.body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='Select')).declarations.find(d=>d.id.name==='Select').init;
  const Select=jsxExpression(source.slice(select.start,select.end));
  const module={exports:{}};vm.runInNewContext(babel.transformSync(fs.readFileSync(path.join(root,'crm/src/components/FiscalOrderPaymentField.js'),'utf8'),{presets:[require.resolve('../node_modules/@babel/preset-react')],plugins:[require.resolve('../node_modules/@babel/plugin-transform-modules-commonjs')]}).code,{module,exports:module.exports,require:()=>React});
  const FiscalField=module.exports.default;
  const options=vm.runInNewContext(source.match(/const ORDER_PAYMENT_OPTIONS = (\[[\s\S]*?\]);/)[1]);
  const assets=JSON.parse(fs.readFileSync(path.join(root,'crm/build/asset-manifest.json'))),css=fs.readFileSync(path.join(root,'crm/build',assets.files['main.css'].replace(/^\//,'')),'utf8');
  const html=fs.readFileSync(path.join(root,'crm/public/cardapio.html'),'utf8'),cases=[];
  for(const choice of ['ONLINE_NOW','AGREED_LATER']){
    const dom=new JSDOM(html),doc=dom.window.document,field=doc.getElementById('payment-method-select');syncPaymentChoices(field,true,true);field.value=choice;field.dispatchEvent(new dom.window.Event('change'));
    const modal=doc.getElementById('payment-modal');modal.classList.remove('hidden');
    doc.getElementById('payment-subtotal').textContent='R$ 10,00';doc.getElementById('payment-total').textContent='R$ 10,00';
    cases.push({name:choice.toLowerCase(),html:modal.outerHTML});dom.window.close();
  }
  const field=renderToStaticMarkup(React.createElement(FiscalField,{order:{paymentMode:'AGREED_LATER',paymentMethod:null},Select,options,value:'',onChange:()=>{}}));
  cases.push({name:'fiscal-method-required',html:'<main style="max-width:900px;margin:24px auto;padding:20px;background:white;border:1px solid #e5e7eb;border-radius:16px"><h1 class="text-2xl font-bold mb-6">Nota Fiscal · pedido a combinar</h1>'+field+'</main>'});
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),report=[];
  try {for(const size of [{width:1920,height:889},{width:390,height:800}])for(const item of cases){
    const page=await browser.newPage({viewport:size}),errors=[];let requests=0;page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{requests++;return route.abort();});
    await page.setContent('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>'+css+'</style><style>body{margin:0;background:#f3f4f6;font-family:Arial,sans-serif}.review-note{position:fixed;bottom:0;left:0;z-index:1000;font-size:11px;background:white;padding:4px}</style></head><body>'+item.html+'<p class="review-note">Revisão local · dados fictícios · sem serviços externos</p></body></html>');
    const layout=await page.evaluate(()=>({width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,required:document.querySelector('select').required,options:[...document.querySelector('select').options].map(o=>o.textContent),value:document.querySelector('select').value}));
    assert.ok(layout.scrollWidth<=size.width,JSON.stringify(layout));assert.deepEqual(errors,[]);
    const file=item.name+'-'+size.width+'.png';await page.screenshot({path:path.join(out,file),fullPage:true});report.push({case:item.name,viewport:size,...layout,screenshot:file,errors,blockedRequests:requests});await page.close();
  }}finally{await browser.close();}
  fs.writeFileSync(path.join(out,'local-review.json'),JSON.stringify({scope:'local fictional presentation only, not authenticated DEV acceptance',report},null,2)+'\n');console.log(JSON.stringify({cases:report.length,allWithoutHorizontalOverflow:true,externalServices:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
