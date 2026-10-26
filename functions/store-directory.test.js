const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createStoreResolver}=require('./store-config');
function fixture() {
  const data=new Map(),reads=[],queries=[];let paymentReads=0;
  const put=(id,root,definition)=>{data.set(`lojas/${id}`,root);if(definition)data.set(`lojas/${id}/configuracoes/storefront`,definition);};
  const definition={schemaVersion:1,catalog:{enabled:true,category:'Delivery'}};
  put('a',{nome:'Loja A',ativo:true,storeConfigVersion:1},definition);
  put('b',{nome:'Loja B'});
  put('c',{nome:'Loja C',ativo:true,storeConfigVersion:1},definition);
  put('d',{nome:'Draft',ativo:false,storeConfigVersion:1},definition);
  put('e',{nome:'Wrong version',ativo:true,storeConfigVersion:2},definition);
  put('f',{nome:'No catalog',ativo:true,storeConfigVersion:1},{schemaVersion:1});
  data.set('lojas/a/canais/festas',{listed:true,enabled:true,storeId:'a',name:'Festas',catalogCategory:'Festa'});
  data.set('lojas/a/canais/disabled',{listed:true,enabled:false,storeId:'a',name:'Disabled'});
  data.set('lojas/a/canais/foreign',{listed:true,enabled:true,storeId:'b',name:'Foreign'});
  data.set('lojas/a/canais/unlisted',{listed:false,enabled:true,storeId:'a',name:'Unlisted'});
  const snapshot=path=>({id:path.split('/').at(-1),exists:data.has(path),data:()=>data.get(path)});
  const db={doc:path=>({path,get:async()=>{reads.push(path);return snapshot(path);}}),getAll:async(...refs)=>{
    reads.push(...refs.map(ref=>ref.path));return refs.map(ref=>snapshot(ref.path));
  },collection:path=>{
    let cursor=null,filter=null,limit=Infinity;
    const query={orderBy:()=>query,startAfter:value=>(cursor=value,query),limit:value=>(limit=value,query),where:(key,operator,value)=>(filter=[key,value],query),get:async()=>{
      queries.push(path);const docs=[...data.keys()].filter(key=>key.startsWith(path+'/') && key.split('/').length===path.split('/').length+1 && (!cursor || key.split('/').at(-1)>cursor) && (!filter || data.get(key)[filter[0]]===filter[1])).sort().slice(0,limit).map(snapshot);
      return {docs};
    }};return query;
  }};
  const resolver=createStoreResolver({db,getAvailability:()=> 'CONFIG_UNAVAILABLE',loadPaymentConfig:async()=>{paymentReads++;return null;}});
  return {data,reads,queries,resolver,paymentReads:()=>paymentReads};
}
test('light directory preserves full resolver eligibility, order and channel ownership without private configuration',async()=>{
  const f=fixture(),actual=await f.resolver.list();
  assert.deepEqual(actual,{stores:[{storeId:'a',name:'Loja A'},{storeId:'a',name:'Festas',channelId:'festas'},{storeId:'b',name:'Loja B'},{storeId:'c',name:'Loja C'}],nextCursor:null});
  assert.equal(f.paymentReads(),0);assert.ok(f.reads.every(path=>path.endsWith('/configuracoes/storefront')));
  assert.equal(f.reads.length,6);assert.equal(f.queries.length,4); // One directory plus only eligible channel queries.
  assert.doesNotMatch(JSON.stringify(actual),/secret|handle|frete|schedule|schemaVersion|ativo/);
  for(const entry of actual.stores) {
    const full=await f.resolver.publicConfig({storeId:entry.storeId,channelId:entry.channelId});
    assert.equal(full.active,true);assert.equal(full.catalog.enabled,true);assert.equal(entry.name,full.channel?.name || full.name);
  }
});
test('empty/one/many lists and paging preserve stable store cursor, not aliases or fixed IDs',async()=>{
  const f=fixture();f.data.clear();assert.deepEqual(await f.resolver.list(),{stores:[],nextCursor:null});assert.equal(f.reads.length,0);
  for(let i=0;i<21;i++)f.data.set(`lojas/s${String(i).padStart(2,'0')}`,{nome:`Store ${i}`});
  const first=await f.resolver.list();assert.equal(first.stores.length,20);assert.equal(first.nextCursor,'s19');
  const last=await f.resolver.list({cursor:first.nextCursor});assert.deepEqual(last,{stores:[{storeId:'s20',name:'Store 20'}],nextCursor:null});
  await assert.rejects(f.resolver.list({cursor:'../bad'}),e=>e.code==='INVALID_CURSOR');
});
test('malformed contracts, inactive roots and mismatched channels remain fail-closed',async()=>{
  const f=fixture();f.data.get('lojas/a').status='INACTIVE';f.data.get('lojas/b').ativa=false;
  f.data.get('lojas/c/configuracoes/storefront').catalog={enabled:false,category:'Delivery'};
  assert.deepEqual((await f.resolver.list()).stores,[]);
});
