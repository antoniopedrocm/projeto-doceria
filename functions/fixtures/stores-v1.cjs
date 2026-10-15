// Local/emulator data only. Never an automatic remote seed or deployment hook.
function storeFixtures() {
  const docs = new Map();
  const add = (id,{freight=true,payment=true}={})=>{
    docs.set(`lojas/${id}`,{nome:id,ativo:true,storeConfigVersion:1,status:'ACTIVE',criadoPor:'PRIVATE_UID'});
    docs.set(`lojas/${id}/configuracoes/storefront`,{schemaVersion:1,catalog:{enabled:true,category:'Delivery'},pickup:{enabled:true},delivery:{enabled:true},onlinePayment:{enabled:true},secret:'NEVER_PUBLIC'});
    docs.set(`lojas/${id}/configuracoes/config`,{timezone:'America/Sao_Paulo',schedule:{thu:{enabled:true,open:'08:00',close:'18:00'}},
      ...(freight ? {frete:{lat:-16.6,lng:-49.3,valorPorKm:3,valorMinimoFrete:4,freteACombinar:false,updatedBy:'PRIVATE_EMAIL'}} : {})});
    docs.set(`lojas/${id}/produtos/p1`,{nome:'Produto atual',preco:7,estoque:2,ativo:true,status:'Ativo',categoria:'Delivery'});
    if(payment) docs.set(`lojas/${id}/configuracoesInternas/infinitepay`,{enabled:true,handle:'fixture_merchant',redirectUrl:'https://example.test/return',webhookUrl:'https://example.test/webhook',secret:'PRIVATE_PAYMENT'});
  };
  add('loja-futura-teste');add('loja-futura-sem-frete',{freight:false});add('loja-futura-sem-pagamento',{payment:false});
  add('loja-inativa');docs.get('lojas/loja-inativa').ativo=false;
  // Compatibility is data: no runtime store-name branches.
  for(const [alias,store] of [['cardapio-matriz','ana-guimaraes-doceria-matriz'],['cardapio-garavelo','ana-guimaraes-doceria-garavelo']]) {
    add(store,{freight:alias==='cardapio-matriz'});
    docs.set(`storefrontAliases/${alias}`,{enabled:true,storeId:store});
  }
  docs.set('lojas/ana-guimaraes-doceria-matriz/canais/festas',{storeId:'ana-guimaraes-doceria-matriz',enabled:true,listed:true,name:'Festas',catalogCategory:'Delivery'});
  docs.set('storefrontAliases/cardapio-festa',{enabled:true,storeId:'ana-guimaraes-doceria-matriz',channelId:'festas'});
  return docs;
}
module.exports={storeFixtures};
