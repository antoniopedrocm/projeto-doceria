/* eslint-env es2020 */
const {randomBytes,createHash}=require('node:crypto');
const {FieldValue}=require('firebase-admin/firestore');
const {createCustomerOrders,customerReadContext}=require('./customer-orders');
const {addressRecords}=require('./checkout-auth');
const CAPABILITY='view_customer_as_readonly';
const SESSION_MS=30*60*1000;
const validId=id=>typeof id==='string' && /^[a-zA-Z0-9_-]{1,150}$/.test(id);
const fail=(status=403)=>{throw Object.assign(new Error('Visualização administrativa não autorizada.'),{httpStatus:status});};
const digest=value=>createHash('sha256').update(value).digest('hex');
const text=value=>typeof value==='string'?value.slice(0,300):'';
async function assertNoPreviewMutation(db,uid,now=Date.now()) {
  if(!uid)return;
  const actor=(await db.doc('integrations/adminCustomerPreview/actors/'+digest(uid)).get()).data();
  if(Object.values(actor?.sessions || {}).some(expiry=>expiry>now)) fail();
}
function previewAllowed(role,permissions,details) {
  return ['dono','gerente'].includes(role) && permissions?.clientes===true &&
    (details?.clientes?.[CAPABILITY]===true || (role==='dono' && details?.clientes?.[CAPABILITY]!==false));
}
function previewDetails(role,permissions,details) {
  return {[CAPABILITY]:previewAllowed(role,permissions,details)};
}
function profileProjection(id,data) {
  return {id,nome:text(data.nome),email:text(data.email),telefone:text(data.telefone),aniversario:text(data.aniversario)};
}
function addressProjection(id,data) {
  // Explicit allowlist: no identity metadata, coordinates, phone, audit fields or orphan root address.
  const fields=['id','nomeEndereco','enderecoCompleto','street','number','neighborhood','city','state','cep','complement','complemento','reference','referencia','semNumero'];
  return addressRecords(id,data.enderecos).map(address=>Object.fromEntries([
    ...fields.filter(key=>typeof address[key]==='string' || typeof address[key]==='boolean').map(key=>[key,address[key]]),
    ['isDefault',address.isDefault===true],
  ]));
}
function createAdminCustomerPreview({db,registry,authorize,now=()=>Date.now()}) {
  const root=db.doc('integrations/adminCustomerPreview');
  const sessionRef=token=>root.collection('sessions').doc(digest(token));
  const actorRef=uid=>root.collection('actors').doc(digest(uid));
  const audit=(type,uid,customerId,scope,extra={})=>root.collection('audit').add({type,adminUid:uid,canonicalCustomerId:customerId,
    storeIds:scope.allStores?[]:scope.stores,globalScope:scope.allStores===true,timestamp:FieldValue.serverTimestamp(),...extra});
  async function target(uid,id) {
    const scope=await authorize(uid);
    if(!previewAllowed(scope.role,scope.permissions,scope.permissionDetails)) fail();
    if(!scope.allStores && !scope.stores?.length) fail();
    if(!validId(id)) fail(404);
    let canonicalId;try {canonicalId=await registry.resolveId(id);} catch {fail(404);}
    const snapshot=await db.doc('clientes/'+canonicalId).get(),data=snapshot.data();
    if(!snapshot.exists || data.canonicalStatus==='ALIAS') fail(404);
    const context={...customerReadContext(canonicalId,data),...(!scope.allStores?{allowedStoreIds:scope.stores}:{} )};
    const orders=createCustomerOrders({db,authorizeRead:async()=>context});
    if(!scope.allStores) {
      // Customers/addresses are global; require a proven relationship to an allowed store.
      const stores=Array.isArray(data.lojasVisitadas)?data.lojasVisitadas:[];
      if(!stores.some(store=>scope.stores.includes(store)) && !(await orders.list({data:{}})).orders.length) fail();
    }
    return {id:canonicalId,data,scope,orders};
  }
  async function start(uid,id) {
    const t=await target(uid,id),token=randomBytes(32).toString('hex'),expiresAt=now()+SESSION_MS;
    const ref=sessionRef(token);
    await db.runTransaction(async tx=>{
      const actor=(await tx.get(actorRef(uid))).data(),sessions=Object.fromEntries(Object.entries(actor?.sessions || {}).filter(([,expiry])=>expiry>now()));
      if(Object.keys(sessions).length>=10)fail(429);
      sessions[ref.id]=expiresAt;
      tx.set(actorRef(uid),{sessions});
      tx.create(ref,{adminUid:uid,canonicalCustomerId:t.id,expiresAt,ended:false});
      tx.create(root.collection('audit').doc(),{type:'ADMIN_CUSTOMER_PREVIEW_STARTED',adminUid:uid,canonicalCustomerId:t.id,
        storeIds:t.scope.allStores?[]:t.scope.stores,globalScope:t.scope.allStores===true,timestamp:FieldValue.serverTimestamp()});
    });
    return {mode:'ADMIN_CUSTOMER_PREVIEW',session:token,expiresAt,customer:profileProjection(t.id,t.data)};
  }
  async function read(uid,token,resource,data={}) {
    if(!/^[a-f0-9]{64}$/.test(token || '')) fail();
    const session=(await sessionRef(token).get()).data();
    if(!session || session.adminUid!==uid || session.ended || session.expiresAt<=now()) fail();
    const t=await target(uid,session.canonicalCustomerId);
    if(t.id!==session.canonicalCustomerId) fail();
    if(resource==='profile') return {customer:profileProjection(t.id,t.data)};
    if(resource==='addresses') return {addresses:addressProjection(t.id,t.data)};
    if(resource==='orders') return t.orders.list({data:{cursor:data.cursor}});
    if(resource==='order') {
      const result=await t.orders.detail({data});
      // Receipt URLs are external bearer links, not needed for this support view.
      result.order.receipt_url=null;
      await audit('ADMIN_CUSTOMER_ORDER_VIEWED',uid,t.id,t.scope,{orderId:result.order.id,orderStoreId:result.order.storeId,orderSource:result.order.source || 'store'});
      return result;
    }
    fail();
  }
  async function end(uid,token) {
    if(!/^[a-f0-9]{64}$/.test(token || '')) fail();
    await db.runTransaction(async tx=>{
      const ref=sessionRef(token),session=(await tx.get(ref)).data();
      if(!session || session.adminUid!==uid) fail();
      if(session.ended)return;
      const actor=(await tx.get(actorRef(uid))).data(),sessions={...(actor?.sessions || {})};delete sessions[ref.id];
      tx.set(actorRef(uid),{sessions});
      tx.update(ref,{ended:true});
      tx.create(root.collection('audit').doc(),{type:'ADMIN_CUSTOMER_PREVIEW_ENDED',adminUid:uid,
        canonicalCustomerId:session.canonicalCustomerId,timestamp:FieldValue.serverTimestamp()});
    });
    return {ended:true};
  }
  return {start,read,end,assertNoMutation:uid=>assertNoPreviewMutation(db,uid,now())};
}
function mountAdminCustomerPreview(app,preview,verifyToken) {
  const prefix='/admin/customer-preview';
  app.use(async(req,res,next)=>{
    if(req.path!==prefix && !req.path.startsWith(prefix+'/')) {
      if(req.headers['x-customer-preview']) return res.status(403).json({code:'PREVIEW_READ_ONLY'});
      const protectedAction=/^\/(?:checkout|customer|pedidos|frete|cupons)(?:\/|$)/.test(req.path) || (req.method!=='GET' && /^\/clientes(?:\/|$)/.test(req.path));
      if(req.path!=='/checkout/webhook' && protectedAction && req.headers.authorization) {
        try {const user=await verifyToken(req);await preview.assertNoMutation(user.uid);} catch(error) {
          return res.status(error.httpStatus===401?401:403).json({code:'PREVIEW_READ_ONLY',message:'Indisponível no modo administrativo.'});
        }
      }
      return next();
    }
    res.setHeader('Cache-Control','no-store');
    try {
      const user=await verifyToken(req);
      if(req.method==='POST' && req.path===prefix+'/sessions') return res.json(await preview.start(user.uid,req.body?.targetCustomerId));
      if(req.method==='POST' && req.path===prefix+'/end') return res.json(await preview.end(user.uid,req.headers['x-customer-preview']));
      if(req.method!=='GET') fail();
      const match=req.path.match(/^\/admin\/customer-preview\/(profile|addresses|orders|order)$/);
      if(!match) fail(404);
      return res.json(await preview.read(user.uid,req.headers['x-customer-preview'],match[1],req.query));
    } catch(error) {
      const status=error.httpStatus || ({unauthenticated:401,'permission-denied':403,'not-found':404,'resource-exhausted':429}[error.code]) || 403;
      return res.status(status).json({code:status===401?'unauthenticated':status===404?'not-found':'permission-denied',message:'Não foi possível acessar esta visualização administrativa.'});
    }
  });
}
module.exports={CAPABILITY,SESSION_MS,previewAllowed,previewDetails,profileProjection,addressProjection,assertNoPreviewMutation,createAdminCustomerPreview,mountAdminCustomerPreview};
