const {createHash} = require('node:crypto');
const {HttpsError} = require('firebase-functions/v2/https');
const digest = (provider, subject) => createHash('sha256').update(`${provider}:${subject}`).digest('hex');
const fail = (code, message) => { throw new HttpsError(code, message); };
function verifiedIdentity(token, user) {
  if (!token || !user || user.disabled || token.uid !== user.uid) fail('unauthenticated', 'Entre novamente.');
  const google = (user.providerData || []).find(p => p.providerId === 'google.com');
  if (google?.uid && token.firebase?.identities?.['google.com']?.includes(google.uid)) {
    return {provider: 'google', sub: google.uid};
  }
  const password = (user.providerData || []).find(p => p.providerId === 'password');
  const tokenEmails = token.firebase?.identities?.email || [];
  if (password && user.email && token.email === user.email && tokenEmails.includes(user.email)) {
    return {provider: 'email_password', sub: user.uid};
  }
  fail('unauthenticated', 'Entre com Google ou e-mail para acessar sua conta.');
}
function normalizeContactPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
  if (!/^\d{10,11}$/.test(digits)) fail('invalid-argument', 'Informe um celular válido com DDD.');
  return digits;
}
function normalizeAddress(value) {
  const address=value && typeof value==='object' ? value : {};
  const clean=(field,max)=>String(address[field] || '').trim().slice(0,max);
  const normalized={enderecoCompleto:clean('enderecoCompleto',300),nickname:clean('nickname',60),
    referencia:clean('referencia',160),complemento:clean('complemento',120),semNumero:!!address.semNumero,
    isDefault:!!address.isDefault,localizacaoFrequente:!!address.localizacaoFrequente};
  const lat=Number(address.lat),lng=Number(address.lng);
  if(!normalized.enderecoCompleto || !normalized.nickname || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) fail('invalid-argument','Dados de endereço inválidos.');
  return {...normalized,lat,lng};
}
function normalizeBirthdate(value) {
  const text=String(value || '').trim();
  if(!text) return '';
  const match=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match) fail('invalid-argument','Informe uma data de nascimento válida.');
  const [,year,month,day]=match.map(Number);const date=new Date(Date.UTC(year,month-1,day));
  const today=new Date();const todayUtc=Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate());
  if(year<1900 || date.getUTCFullYear()!==year || date.getUTCMonth()!==month-1 || date.getUTCDate()!==day || date.getTime()>todayUtc) fail('invalid-argument','Informe uma data de nascimento válida.');
  return text;
}
function createCustomerAccount({admin, db}) {
  const stamp = () => admin.firestore.FieldValue.serverTimestamp();
  const identities = db.collection('customerAuthIdentities');
  async function identity(request) {
    if (!request.auth?.uid) fail('unauthenticated', 'Entre com Google ou e-mail.');
    const user = await admin.auth().getUser(request.auth.uid);
    return {user, ...verifiedIdentity({...request.auth.token, uid: request.auth.uid}, user)};
  }
  async function resolve(request) {
    const id = await identity(request);
    const snap = await identities.doc(digest(id.provider, id.sub)).get();
    return {...id, customerId: snap.data()?.customerId || null};
  }
  const safeProfile = (id, d, identity) => ({id, accountLinked:true, nome: d.nome || '', telefone: d.telefone || '', aniversario: d.aniversario || '', enderecos: d.enderecos || [], email: identity.user.email || '', emailVerified: !!identity.user.emailVerified, authProvider: identity.provider});
  async function account(request) {
    const id = await resolve(request);
    if (!id.customerId) return {needsPhone: true, nome: id.user.displayName || '', email: id.user.email || '', emailVerified: !!id.user.emailVerified, authProvider: id.provider};
    const snap = await db.collection('clientes').doc(id.customerId).get();
    if (!snap.exists || snap.data().authOwnerUid !== id.user.uid) fail('not-found', 'Cadastro indisponível.');
    return {customer: safeProfile(snap.id, snap.data(), id)};
  }
  async function completeProfile(request) {
    const id = await identity(request);
    const national = normalizeContactPhone(request.data?.phone);
    const requestedName = String(request.data?.nome || id.user.displayName || 'Cliente').trim();
    if (!requestedName || requestedName.length > 120) fail('invalid-argument', 'Informe um nome válido.');
    const identityRef = identities.doc(digest(id.provider, id.sub));
    const newRef = db.collection('clientes').doc();
    await db.runTransaction(async tx => {
      const identitySnap = await tx.get(identityRef);
      const customerId = identitySnap.data()?.customerId || newRef.id;
      const ref = db.collection('clientes').doc(customerId);
      const customer = await tx.get(ref);
      if (customer.data()?.authOwnerUid && customer.data().authOwnerUid !== id.user.uid) fail('already-exists', 'Este cadastro já está vinculado a outra conta.');
      if (!customer.exists) tx.set(ref, {authOwnerUid: id.user.uid, nome: requestedName,
        telefone: national, phone_number: `+55${national}`, phone_verified_at: null,
        enderecos: [], criadoEm: stamp(), atualizadoEm: stamp()});
      tx.set(identityRef, {provider: id.provider, subject: id.sub, customerId, uid: id.user.uid, updatedAt: stamp()});
    });
    return account(request);
  }
  async function update(request) {
    const id = await resolve(request);
    if (!id.customerId) fail('failed-precondition', 'Informe seu celular de contato.');
    const nome = String(request.data?.nome || '').trim();
    if (!nome || nome.length > 120) fail('invalid-argument', 'Informe um nome válido.');
    const aniversario=normalizeBirthdate(request.data?.aniversario);
    const ref=db.collection('clientes').doc(id.customerId);const customer=await ref.get();
    if(!customer.exists || customer.data().authOwnerUid!==id.user.uid) fail('permission-denied','Cadastro não autorizado.');
    await ref.update({nome, aniversario, atualizadoEm: stamp()});
    return account(request);
  }
  async function orders(request) {
    const id = await resolve(request);
    if (!id.customerId) fail('failed-precondition', 'Informe seu celular de contato.');
    const customer=await db.collection('clientes').doc(id.customerId).get();
    if(!customer.exists || customer.data().authOwnerUid!==id.user.uid) fail('permission-denied','Cadastro não autorizado.');
    // Account ownership is derived from the verified Google sub, never a request customerId.
    const result = await db.collectionGroup('pedidos').where('clienteId', '==', id.customerId).orderBy('createdAt','desc').limit(50).get();
    return {orders: result.docs.map(s => {const d=s.data();return {id:s.id, lojaId:d.lojaId || s.ref.parent.parent?.id || '', total:d.total, status:d.order_status || d.status, payment_status:d.payment_status || null, formaPagamento:d.formaPagamento || d.pagamento?.forma || '', createdAt:d.createdAt?.toDate?.().toISOString() || null, itens:(d.itens||[]).map(i=>({nome:String(i.nome || '').slice(0,120),quantity:Number(i.quantity || 0)}))};})};
  }
  async function addAddress(request) {
    const id=await resolve(request);
    if(!id.customerId) fail('failed-precondition','Informe seu celular de contato.');
    const address=normalizeAddress(request.data?.address);
    await db.runTransaction(async tx=>{
      const ref=db.collection('clientes').doc(id.customerId);const snap=await tx.get(ref);
      if(!snap.exists || snap.data().authOwnerUid!==id.user.uid) fail('permission-denied','Cadastro não autorizado.');
      let addresses=Array.isArray(snap.data().enderecos)?[...snap.data().enderecos]:[];
      if(addresses.length>=20) fail('resource-exhausted','Você atingiu o limite de endereços salvos.');
      if(address.isDefault) addresses=addresses.map(item=>typeof item==='object'?{...item,isDefault:false}:item);
      addresses.push({...address,criadoEm:new Date().toISOString()});
      tx.update(ref,{enderecos:addresses,atualizadoEm:stamp()});
    });
    return account(request);
  }
  async function deleteAddress(request) {
    const id=await resolve(request);
    if(!id.customerId) fail('failed-precondition','Informe seu celular de contato.');
    const index=request.data?.index;
    if(!Number.isInteger(index) || index<0) fail('invalid-argument','Endereço inválido.');
    await db.runTransaction(async tx=>{
      const ref=db.collection('clientes').doc(id.customerId);const snap=await tx.get(ref);
      if(snap.data()?.authOwnerUid!==id.user.uid) fail('permission-denied','Cadastro não autorizado.');
      const addresses=Array.isArray(snap.data().enderecos)?[...snap.data().enderecos]:[];
      const address=addresses[index];
      if(!address || (typeof address==='string'?address:address.enderecoCompleto)!==request.data.expectedAddress) fail('failed-precondition','Os endereços mudaram. Abra sua conta novamente.');
      addresses.splice(index,1);tx.update(ref,{enderecos:addresses,atualizadoEm:stamp()});
    });
    return account(request);
  }
  return {account, completeProfile, update, orders, addAddress, resolve, deleteAddress};
}
module.exports = {createCustomerAccount, verifiedIdentity, normalizeContactPhone, normalizeAddress, normalizeBirthdate, digest};
