// Isolated browser render of production UI with fictional, local read-only data.
// Never opens a real user profile or talks to Firebase. Playwright is a temp tool.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const webpack=require('../node_modules/webpack');
const {execFileSync}=require('node:child_process');
const accountOnly=process.argv.includes('--account-only'),legacyCss=process.argv.includes('--legacy-css');
const crm=path.resolve(__dirname,'..'),root=path.resolve(crm,'..');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'doceria-customer-visual-'));
const evidence=path.join(root,accountOnly?'docs/evidence/customer-account-polish':'docs/evidence/customer-area-redesign');fs.mkdirSync(evidence,{recursive:true});
const {chromium}=require(path.join(process.env.CUSTOMER_VISUAL_PLAYWRIGHT_DIR || path.join(os.tmpdir(),'doceria-customer-visual-tools'),'node_modules/playwright'));
const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file=>fs.existsSync(file));
assert.ok(chrome,'No installed browser found');
process.env.NODE_ENV='development';
webpack({mode:'development',context:crm,entry:path.join(__dirname,'fixtures/customer-visual-entry.js'),devtool:false,
 output:{path:output,filename:'fixture.js'},resolve:{modules:[path.join(crm,'node_modules'),'node_modules']},
 plugins:[new webpack.DefinePlugin({'process.env.REACT_APP_API_BASE_URL':JSON.stringify('/fixture-api-disabled')}),new webpack.NormalModuleReplacementPlugin(/customerRuntime$/,resource=>{resource.request=path.join(__dirname,'fixtures/customer-visual-runtime.js');})],
 module:{rules:[
  {test:/\.js$/,exclude:/node_modules/,use:{loader:require.resolve('../node_modules/babel-loader'),options:{presets:[require.resolve('../node_modules/babel-preset-react-app')]}}},
  {test:/\.css$/,use:[require.resolve('../node_modules/style-loader'),require.resolve('../node_modules/css-loader'),{loader:require.resolve('../node_modules/postcss-loader'),options:{postcssOptions:{plugins:[require('../node_modules/tailwindcss')(path.join(crm,'tailwind.config.js')),require('../node_modules/autoprefixer')]}}}]}
 ]}
},async(error,stats)=>{
 if(error || stats.hasErrors()){console.error(error || stats.toString({all:false,errors:true}));process.exitCode=1;return;}
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');let file;
  if(url.pathname==='/fixture.js')file=path.join(output,'fixture.js');
  else if(/\.(mjs|css|png)$/.test(url.pathname))file=path.join(crm,'public',path.basename(url.pathname));
  if(file && fs.existsSync(file)){res.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>LOCAL · dados fictícios · revisão visual</title></head><body><div id="root"></div><script defer src="/fixture.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 let browser,page;const checks=[],screenshots=[],errors=[],external=[];
 try{
  browser=await chromium.launch({headless:true,executablePath:chrome});page=await browser.newPage();
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin){external.push(url.origin);return route.abort();}if(legacyCss && url.pathname==='/customer-area.css')return route.fulfill({contentType:'text/css',body:execFileSync('git',['show','d5ea9d03:crm/public/customer-area.css'],{cwd:root,encoding:'utf8'})});return route.continue();});
  page.on('pageerror',error=>errors.push(error.message));
  const screens=[['home','/area-cliente','Olá, Ana!'],['account','/minha-conta','Minha Conta'],['orders','/meus-pedidos','Meus Pedidos'],['detail','/meus-pedidos/visual-order?store=visual-store','Pedido #1042']];
  for(const width of [320,375,390,430,768,1024,1366,1920]){
   await page.setViewportSize({width,height:width===1920?889:800});
   for(const [name,url,heading] of accountOnly?screens.filter(([name])=>name==='account'):screens){
    await page.goto(origin+url);await page.getByRole('heading',{name:heading,exact:name!=='home'}).first().waitFor();
    await page.waitForFunction(()=>document.querySelector('.customer-area-dialog') && !document.querySelector('[data-message]')?.textContent.startsWith('Carregando'));
    if(name==='orders')await page.getByRole('button',{name:'Ver pedido',exact:true}).waitFor();
    if(name==='detail')await page.getByRole('heading',{name:'Itens do pedido',exact:true}).waitFor();
    const sizes=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,inner:[...document.querySelectorAll('.customer-shell main,.customer-shell .customer-area-dialog')].map(el=>({overflow:getComputedStyle(el).overflowY,maxHeight:getComputedStyle(el).maxHeight}))}));
    assert.ok(sizes.scroll<=width+1,`${name} horizontal overflow at ${width}: ${sizes.scroll}`);assert.ok(sizes.inner.every(s=>!['scroll','auto'].includes(s.overflow)),`${name} inner scroll at ${width}`);
    if(accountOnly){
      const styles=await page.evaluate(()=>{
        const profile=document.querySelector('[data-profile]'),card=profile.querySelector('.customer-profile-card'),save=profile.querySelector('[data-save]'),address=profile.querySelector('.customer-address-card'),actions=address.querySelector('.customer-actions'),fields=profile.querySelector('.customer-fields');
        const css=el=>getComputedStyle(el);return {cardBackground:css(card).backgroundColor,cardRadius:parseFloat(css(card).borderRadius),cardPadding:parseFloat(css(card).paddingLeft),saveBackground:css(save).backgroundColor,saveHeight:save.getBoundingClientRect().height,actionGap:parseFloat(css(actions).gap),fieldsWidth:fields.getBoundingClientRect().width,addressBorder:parseFloat(css(address).borderTopWidth),badgeBackground:css(address.querySelector('.customer-badge')).backgroundColor};
      });
      if(styles.cardBackground!=='rgb(255, 255, 255)') {await page.screenshot({path:path.join(evidence,'before-legacy-css.png'),fullPage:true});console.error(JSON.stringify({reproducedUnstyledProfile:styles}));}
      assert.equal(styles.cardBackground,'rgb(255, 255, 255)','Profile needs a white card even with legacy public CSS');assert.ok(styles.cardRadius>=12 && styles.cardPadding>=20);assert.equal(styles.saveBackground,'rgb(219, 39, 119)');assert.ok(styles.saveHeight>=44);assert.ok(styles.actionGap>=8);assert.ok(styles.fieldsWidth<=901);assert.ok(styles.addressBorder>=1);assert.notEqual(styles.badgeBackground,'rgba(0, 0, 0, 0)');
    }
    checks.push({width,screen:name,horizontalOverflow:false,mainInternalScroll:false});
    if(width===390 || width===1920){await page.evaluate(()=>scrollTo(0,0));await page.mouse.move(width-2,10);const file=`${width===390?'mobile':'desktop'}-${name}.png`;await page.screenshot({path:path.join(evidence,file),fullPage:true});screenshots.push(file);}
    if(width===390){await page.reload();await page.getByRole('heading',{name:heading,exact:name!=='home'}).first().waitFor();assert.equal(new URL(page.url()).pathname,new URL(origin+url).pathname);}
   }
  }
  if(!accountOnly){
  await page.setViewportSize({width:390,height:800});await page.goto(origin+'/area-cliente');await page.getByRole('heading',{name:/Olá, Ana/}).waitFor();
  await page.evaluate(()=>scrollTo(0,0));await page.getByRole('button',{name:'Abrir menu do cliente'}).click();await page.evaluate(()=>scrollTo(0,0));await page.mouse.move(388,10);await page.screenshot({path:path.join(evidence,'mobile-drawer.png'),fullPage:false});screenshots.push('mobile-drawer.png');await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button',{name:'Ir para o CRM',exact:true}).count(),0);
  await page.goto(origin+'/area-cliente?dual=1');await page.getByRole('button',{name:'Abrir menu do cliente'}).click();await page.getByRole('button',{name:'Ir para o CRM',exact:true}).click();assert.equal(await page.evaluate(()=>window.fixtureStaff),true);
  for(const width of [390,1920]){
   await page.setViewportSize({width,height:width===390?800:889});await page.goto(origin+'/admin/customer-preview/visual-customer/profile');await page.getByRole('heading',{name:'Minha Conta',exact:true}).waitFor();
   assert.ok(await page.getByRole('region',{name:'Visualização administrativa'}).isVisible());assert.equal(await page.locator('input').count(),0);
   await page.evaluate(()=>scrollTo(0,0));await page.mouse.move(width-2,10);const file=`${width===390?'mobile':'desktop'}-admin-preview.png`;await page.screenshot({path:path.join(evidence,file),fullPage:true});screenshots.push(file);
  }
  }
  assert.deepEqual(external,[],'Unexpected external request');assert.deepEqual(errors,[],'Browser errors');
  const result={scope:'LOCAL isolated Chrome; fictional data; no Firebase/Auth/SMS/payment requests',accountOnly,legacyPublicStylesheetSimulated:legacyCss,checks,screenshots,errors,externalRequests:external,production:false};
  fs.writeFileSync(path.join(evidence,'local-review.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({checks:checks.length,screenshots:screenshots.length,errors,externalRequests:external}));
 }catch(error){console.error(error.stack);console.error(JSON.stringify({errors,external}));if(page)console.error((await page.locator('body').innerText()).slice(0,2500));process.exitCode=1;}
 finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
