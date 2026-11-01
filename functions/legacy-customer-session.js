const {createCustomerOrders,customerReadContext}=require('./customer-orders');
const {addressRecords}=require('./checkout-auth');
const {addressReference}=require('./checkout-addresses');
const fail=()=>{throw Object.assign(new Error('Confirme novamente seu celular para acessar sua conta.'),{httpStatus:403,code:'PHONE_SESSION_REQUIRED'});};
function createLegacyCustomerSession({db,verification}) {
  async function authorize(request) {
    const session=request.session;
    if(!session || session.purpose!=='CUSTOMER_PRIVATE_SESSION') fail();
    return verification.authorizeCustomer(session);
  }
  const history=createCustomerOrders({db,authorizeRead:async request=>{
    const {customer}=await authorize(request);
    return customerReadContext(customer.id,customer.data());
  }});
  async function account(request) {
    const {customer,grant}=await authorize(request),d=customer.data();
    const fields=['nickname','enderecoCompleto','street','number','neighborhood','city','cep','complement','complemento','referencia','semNumero','isDefault','lat','lng'];
    const addresses=addressRecords(customer.id,d.enderecos).map(a=>({...Object.fromEntries(fields.filter(k=>a[k]!==undefined).map(k=>[k,a[k]])),id:addressReference(request.session.checkoutIdentityToken,customer.id,a.id)}));
    return {customer:{id:customer.id,nome:d.nome || '',telefone:d.telefone || '',aniversario:d.aniversario || '',enderecos:addresses,
      temporaryPhoneSession:true,authProvider:'temporary_sms',createdAt:d.criadoEm?.toDate?.().toISOString() || null},expiresAt:grant.expiresAt};
  }
  async function call(method,session,data={}) {
    const request={session,data};await authorize(request);
    const proof=Object.fromEntries(['storeId','checkoutIdentityToken','checkoutIdentityRevision','addressSessionToken'].map(k=>[k,session[k]]));
    let result;
    if(method==='account') return account(request);
    if(method==='orders' || method==='orderDetail') result=await history[method==='orders'?'list':'detail'](request);
    else if(method==='update') {
      if(Object.keys(data).some(k=>!['nome','aniversario'].includes(k))) fail();
      await verification.profile({...proof,operation:'update',profile:data});return account(request);
    }else if(['addAddress','updateAddress','deleteAddress','setDefaultAddress'].includes(method)) {
      const operation={addAddress:'create',updateAddress:'update',deleteAddress:'delete',setDefaultAddress:'default'}[method];
      await verification.manage({...proof,operation,addressId:data.addressId,address:data.address,confirmed:data.confirmed});return account(request);
    }else if(method==='logout') return verification.revoke(session);
    else fail();
    // Revocation, phone/context changes and TTL still apply at response time.
    await authorize(request);return result;
  }
  return {call};
}
function mountLegacyCustomerSession(app,service) {
  app.post('/customer/phone-session/:method',async(req,res)=>{
    res.set('Cache-Control','no-store');
    try {
      if(req.headers['x-customer-preview'] || req.body?.mode==='ADMIN_CUSTOMER_PREVIEW' || req.body?.previewSession) fail();
      const allowed=new Set(['session','data']);
      if(Object.keys(req.body || {}).some(k=>!allowed.has(k))) fail();
      return res.json(await service.call(req.params.method,req.body?.session,req.body?.data));
    }catch {return res.status(403).json({code:'PHONE_SESSION_REQUIRED',message:'Confirme novamente seu celular para acessar sua conta.'});}
  });
}
module.exports={createLegacyCustomerSession,mountLegacyCustomerSession};
