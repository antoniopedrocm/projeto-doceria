const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('quatro combinações usam disponibilidade efetiva, não enabled isolado',async()=>{
  const {fulfillmentBanner}=await import('../public/fulfillment-availability.mjs');
  for(const [delivery,pickup,message] of [[true,true,''],[false,true,'Entrega indisponível. Retirada disponível.'],[false,false,'Entrega e retirada indisponíveis no momento.'],[true,false,'']])assert.equal(fulfillmentBanner({delivery:{available:delivery},pickup:{enabled:pickup}}),message);
  assert.equal(fulfillmentBanner({delivery:{enabled:true,available:false},pickup:{enabled:true}}),'Entrega indisponível. Retirada disponível.');
});
test('handler real do cardápio: banner só depende de entrega; horário e modalidades bloqueiam checkout',async()=>{
  const {fulfillmentBanner}=await import('../public/fulfillment-availability.mjs'),source=fs.readFileSync(path.join(__dirname,'../public/cardapio.html'),'utf8');
  const handler=source.slice(source.indexOf('function updateStoreAvailabilityUI()'),source.indexOf('function syncStoreAvailabilityStatus()'));
  const node=()=>({disabled:false,title:'',textContent:'',classList:{toggle(){}}});
  for(const open of [true,false])for(const delivery of [true,false])for(const pickup of [true,false]){
    const context={fulfillmentBanner,publicStore:{delivery:{available:delivery},pickup:{enabled:pickup}},storeIsOpenNow:open,storeAvailability:'CLOSED',getStoreAvailabilityMessage:()=> 'Loja fechada',checkoutButton:node(),continueGuestButton:node(),storeStatusBanner:node()};
    vm.runInNewContext(handler+';updateStoreAvailabilityUI();',context);
    assert.equal(context.checkoutButton.disabled,!open || (!delivery&&!pickup));assert.equal(context.continueGuestButton.disabled,!delivery);
    assert.equal(Boolean(context.storeStatusBanner.textContent),!delivery);
  }
});
