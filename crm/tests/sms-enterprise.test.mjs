import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import fs from 'node:fs';
import {createEnterpriseSmsVerifier} from '../public/sms-enterprise.mjs';
const {JSDOM}=createRequire(import.meta.url)('jsdom'),key='managed-score-fixture-key';
const config={projectId:'doceria-sms-dev-fixture',enterpriseSiteKey:key};
test('token score-only fresco por envio sem widget/iframe/render/Auth ou sessão persistente',async()=>{
  const dom=new JSDOM('<head></head><body><main>Checkout</main></body>');let calls=0;
  dom.window.grecaptcha={enterprise:{ready:fn=>fn(),execute:async(siteKey,{action})=>{assert.equal(siteKey,key);assert.equal(action,'sendVerificationCode');return 'token-fixture-fresh-'+(++calls);},render:()=>assert.fail('no visible widget')}};
  const verify=createEnterpriseSmsVerifier({document:dom.window.document,window:dom.window,mainProjectId:'crmdoceria-9959e'});
  const first=verify(config);dom.window[new URL(dom.window.document.querySelector('script').src).searchParams.get('onload')]();const one=await first,two=await verify(config);
  assert.notEqual(one.token,two.token);assert.equal(calls,2);assert.equal(dom.window.document.querySelectorAll('script').length,1);assert.equal(dom.window.document.querySelectorAll('iframe,input,.g-recaptcha').length,0);assert.equal(dom.window.document.querySelector('main').textContent,'Checkout');
  const branding=dom.window.document.querySelector('style[data-sms-score-branding]');assert.equal(dom.window.document.querySelectorAll('style').length,1);assert.equal(branding.textContent,'html[data-sms-score-only="true"] .grecaptcha-badge { visibility: hidden; }');assert.doesNotMatch(branding.textContent,/iframe|display\s*:\s*none/);one.dispose();two.dispose();dom.window.close();
});
test('falha de carregamento/execute e config indevida exibem só mensagem amigável sem fallback',async()=>{
  const dom=new JSDOM('<head></head>'),verify=createEnterpriseSmsVerifier({document:dom.window.document,window:dom.window,mainProjectId:'crmdoceria-9959e'});
  await assert.rejects(verify({...config,projectId:'ana-guimaraes'}),/Não foi possível enviar/);
  const pending=verify(config);dom.window.document.querySelector('script').dispatchEvent(new dom.window.Event('error'));await assert.rejects(pending,/Não foi possível enviar/);
  dom.window.grecaptcha={enterprise:{ready:fn=>fn(),execute:async()=>{throw Error('auth/captcha-check-failed score private');}}};
  const again=verify(config);dom.window[new URL(dom.window.document.querySelector('script').src).searchParams.get('onload')]();await assert.rejects(again,error=>/Não foi possível enviar/.test(error.message) && !/captcha|score|auth\//.test(error.message));dom.window.close();
});
test('adapter OTP não inicializa Auth, não inclui verificador clássico nem container de CAPTCHA',()=>{
  const adapter=fs.readFileSync(new URL('../public/address-verification-firebase.mjs',import.meta.url),'utf8'),manager=fs.readFileSync(new URL('../public/address-management.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(adapter,/RecaptchaVerifier|initializeAuth|setPersistence|signInWithPhoneNumber/);assert.doesNotMatch(manager,/const captcha=document|view\.content\.append\(captcha\)/);assert.match(manager,/Este site é protegido por reCAPTCHA/);
});
