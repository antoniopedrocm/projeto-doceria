const {test}=require('node:test'),assert=require('node:assert/strict');
const {resolveCard1xInstallments,card1xSnapshot,card1xFeeStatus,validateCard1xPreference,cardFeeSecretId}=require('./card-1x-fee-policy');
const {createCardFeeCredentials}=require('./card-1x-fee-credentials');
const {InfinitePayProvider}=require('./checkout-payment');
const project='demo-native-fee',fakeKey=store=>'inchk_'+'synthetic-only-'+store;
const config=(store,baseline,payer='STORE')=>{const handle='merchant_'+store,secretVersion=`projects/${project}/secrets/${cardFeeSecretId(store)}/versions/1`;return {enabled:true,handle,card1xFeePayer:payer,card1xFeeBinding:{schemaVersion:1,enabled:true,storeId:store,handle,baselineAssuredInstallments:baseline,secretVersion,validation:{schemaVersion:1,state:'VERIFIED_NO_PAYMENT',storeId:store,handle,secretVersion,assuredInstallments:[0,1]}}};};
test('default STORE absorbs 1x and preserves exactly every installment from 2x through 12x for all official thresholds',()=>{
 for(let baseline=0;baseline<=12;baseline++){const target=resolveCard1xInstallments('STORE',baseline);assert.ok(target>=1);for(let n=2;n<=12;n++)assert.equal(target>=n,baseline>=n);const c=config('a',baseline);delete c.card1xFeePayer;assert.equal(card1xSnapshot(c,'a',project).assuredInstallments,target);}
});
test('CUSTOMER uses native zero only when 2x+ is unchanged; higher merchant thresholds require Owner decision',()=>{
 for(const baseline of [0,1]){assert.equal(resolveCard1xInstallments('CUSTOMER',baseline),0);assert.equal(validateCard1xPreference({card1xFeePayer:'CUSTOMER',handle:'merchant_a'},config('a',baseline),{storeId:'a'}),'CUSTOMER');}
 for(let baseline=2;baseline<=12;baseline++){assert.throws(()=>resolveCard1xInstallments('CUSTOMER',baseline),e=>e.code==='failed-precondition');assert.equal(card1xFeeStatus(config('a',baseline),'a',project).customerPassThroughAvailable,false);}
});
test('unknown policy is never inferred and absence of binding remains inactive, not financially homologated',()=>{
 for(const n of [undefined,null,-1,13,'1',1.5])assert.throws(()=>resolveCard1xInstallments('STORE',n));
 assert.equal(card1xSnapshot({handle:'a'},'a'),null);assert.equal(card1xFeeStatus(config('a',1),'a',project).application,'LINK_POLICY_VERIFIED_NO_PAYMENT');
 for(const c of [{...config('a',1),handle:'merchant_other'},{...config('a',1),card1xFeeBinding:{...config('a',1).card1xFeeBinding,storeId:'b'}},{...config('a',1),card1xFeeBinding:{...config('a',1).card1xFeeBinding,secretVersion:`projects/other/secrets/${cardFeeSecretId('a')}/versions/1`}}])assert.throws(()=>card1xSnapshot(c,'a',project));
});
test('secrets are pinned to environment/store/merchant/baseline and loaded independently, never from a global key',async()=>{
 const snapshots=['a','b'].map(s=>card1xSnapshot(config(s,1),s,project)),read=[];
 const load=createCardFeeCredentials({projectId:project,readSecret:async name=>{read.push(name);const store=name.includes(cardFeeSecretId('a'))?'a':'b';return JSON.stringify({schemaVersion:1,storeId:store,handle:'merchant_'+store,baselineAssuredInstallments:1,apiKey:fakeKey(store)});}});
 for(const s of snapshots){const r=await load(s,{storeId:s.storeId,handle:s.handle});assert.equal(r.apiKey,fakeKey(s.storeId));assert.deepEqual(r.options,{assured_installments:1});}
 assert.equal(new Set(read).size,2);assert.equal(JSON.stringify(snapshots).includes('inchk_'),false);
});
test('wrong project/store/merchant, latest alias, malicious native threshold and credential exceptions fail before any charge without revealing keys',async()=>{
 const s=card1xSnapshot(config('a',1),'a',project),secret={schemaVersion:1,storeId:'a',handle:'merchant_a',baselineAssuredInstallments:1,apiKey:fakeKey('a')};
 for(const [snapshot,target,raw]of [[s,{storeId:'b',handle:'merchant_a'},secret],[{...s,secretVersion:s.secretVersion.replace('/1','/latest')},{storeId:'a',handle:'merchant_a'},secret],[{...s,assuredInstallments:0},{storeId:'a',handle:'merchant_a'},secret],[s,{storeId:'a',handle:'merchant_a'},{...secret,handle:'other'}],[s,{storeId:'a',handle:'merchant_a'},{...secret,baselineAssuredInstallments:3}]]){
  const load=createCardFeeCredentials({projectId:project,readSecret:async()=>JSON.stringify(raw)});await assert.rejects(()=>load(snapshot,target),e=>e.httpStatus===503&&!e.message.includes(fakeKey('a')));
 }
 await assert.rejects(()=>createCardFeeCredentials({projectId:project,readSecret:async()=>{throw Error(fakeKey('a'));}})(s,{storeId:'a',handle:'merchant_a'}),e=>!e.message.includes(fakeKey('a')));
});
test('X-Api-Key stays only in link-request headers; amounts/Pix options/check requests remain unchanged and errors omit secrets',async()=>{
 const calls=[],logs=[],provider=new InfinitePayProvider({fetchImpl:async(url,options)=>{calls.push({url,...options});return {ok:true,json:async()=>({url:'https://buy.infinitepay.io/synthetic'})};},logError:x=>logs.push(x)}),payload={handle:'merchant_a',items:[{quantity:1,price:1234,description:'synthetic'}],options:{assured_installments:1}};
 await provider.create(payload,{apiKey:fakeKey('a')});await provider.create({...payload,handle:'merchant_b'},{apiKey:fakeKey('b')});await provider.check({handle:'merchant_a',order_nsu:'synthetic'});
 assert.equal(calls[0].headers['X-Api-Key'],fakeKey('a'));assert.equal(calls[1].headers['X-Api-Key'],fakeKey('b'));assert.equal(calls[2].headers['X-Api-Key'],undefined);assert.equal(calls[0].redirect,'error');assert.equal(JSON.parse(calls[0].body).items[0].price,1234);assert.equal(calls[0].body.includes('inchk_'),false);assert.equal(JSON.parse(calls[0].body).options.discounts,undefined);assert.equal(JSON.parse(calls[0].body).options.payment_methods_enabled,undefined);
 const failing=new InfinitePayProvider({fetchImpl:async()=>new Response(JSON.stringify({message:fakeKey('a'),error:fakeKey('a')}),{status:403,headers:{'content-type':'application/json'}}),logError:x=>logs.push(x)});await assert.rejects(()=>failing.create(payload,{apiKey:fakeKey('a')}),e=>!e.message.includes(fakeKey('a')));assert.equal(JSON.stringify(logs).includes(fakeKey('a')),false);
});

test('unreviewed or mismatched proof cannot enable new CUSTOMER preference',()=>{const c=config('a',1);delete c.card1xFeeBinding.validation;assert.equal(card1xFeeStatus(c,'a',project).customerPassThroughAvailable,false);assert.throws(()=>validateCard1xPreference({handle:c.handle,card1xFeePayer:'CUSTOMER'},c,{storeId:'a',projectId:project}));const wrong=config('a',1);wrong.card1xFeeBinding.validation.storeId='b';assert.equal(card1xFeeStatus(wrong,'a',project).customerPassThroughAvailable,false);});
