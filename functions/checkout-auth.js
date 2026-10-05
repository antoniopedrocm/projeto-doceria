const {createHash, randomUUID} = require('node:crypto');
const {HttpsError} = require('firebase-functions/v2/https');
const {FieldValue} = require('firebase-admin/firestore');
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
function normalizeName(value) {
  const name = typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/gu, ' ') : '';
  if (!name || name.length > 120 || /\p{Cc}/u.test(name)) fail('invalid-argument', 'Informe um nome válido.');
  return name;
}
// Legacy addresses receive deterministic IDs on read; only an authorized mutation persists them.
function addressRecords(customerId, values) {
  const seen = new Map(); const ids = new Set(); let hasDefault = false;
  return (Array.isArray(values) ? values : []).map(value => {
    const address = typeof value === 'string' ? {enderecoCompleto: value} : {...value};
    const signature = JSON.stringify(Object.keys(address).sort().filter(k => !['id', 'isDefault'].includes(k)).map(k => [k, address[k]]));
    const occurrence = seen.get(signature) || 0; seen.set(signature, occurrence + 1);
    let id = typeof address.id === 'string' && address.id ? address.id : digest('address', `${customerId}:${signature}:${occurrence}`);
    if (ids.has(id)) id = digest('address', `${customerId}:${signature}:${occurrence}`);
    ids.add(id);
    const isDefault = address.isDefault === true && !hasDefault;
    hasDefault ||= isDefault;
    return {...address, id, isDefault};
  });
}
function normalizeAddress(value) {
  const address=value && typeof value==='object' ? value : {};
  const clean=(field,max)=>String(address[field] || '').trim().slice(0,max);
  const normalized={...Object.fromEntries(['cep','street','number','neighborhood','complement'].filter(k=>address[k]).map(k=>[k,clean(k,160)])),enderecoCompleto:clean('enderecoCompleto',300),nickname:clean('nickname',60),
    referencia:clean('referencia',160),complemento:clean('complemento',120),semNumero:!!address.semNumero,
    isDefault:!!address.isDefault,localizacaoFrequente:!!address.localizacaoFrequente};
  const lat=Number(address.lat),lng=Number(address.lng);
  const coordinate=value=>typeof value==='number' || (typeof value==='string' && value.trim()!=='');
  if(!normalized.enderecoCompleto || !normalized.nickname || !coordinate(address.lat) || !coordinate(address.lng) || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) fail('invalid-argument','Dados de endereço inválidos.');
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
  const stamp = () => FieldValue.serverTimestamp();
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
  const safeProfile = (id, d, identity) => ({id, accountLinked:true, nome: d.nome || '', telefone: d.telefone || '', aniversario: d.aniversario || '', enderecos: addressRecords(id, d.enderecos), email: identity.user.email || '', emailVerified: !!identity.user.emailVerified, authProvider: identity.provider, createdAt: d.criadoEm?.toDate?.().toISOString() || null});
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
    const requestedName = normalizeName(request.data?.nome || id.user.displayName || 'Cliente');
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
    const nome = normalizeName(request.data?.nome);
    const fields = {nome, atualizadoEm: stamp()};
    if (Object.prototype.hasOwnProperty.call(request.data || {}, 'aniversario')) fields.aniversario = normalizeBirthdate(request.data.aniversario);
    const phone = Object.prototype.hasOwnProperty.call(request.data || {}, 'telefone') ? normalizeContactPhone(request.data.telefone) : null;
    await db.runTransaction(async tx => {
      const ref=db.collection('clientes').doc(id.customerId); const customer=await tx.get(ref);
      if(!customer.exists || customer.data().authOwnerUid!==id.user.uid) fail('permission-denied','Cadastro não autorizado.');
      const patch={...fields};
      if (phone !== null && phone !== customer.data().telefone) Object.assign(patch, {telefone: phone, phone_number: `+55${phone}`, phone_verified_at: null});
      tx.update(ref, patch);
    });
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
      let addresses=addressRecords(id.customerId, snap.data().enderecos);
      if(addresses.length>=20) fail('resource-exhausted','Você atingiu o limite de endereços salvos.');
      if(address.isDefault) addresses=addresses.map(item=>typeof item==='object'?{...item,isDefault:false}:item);
      addresses.push({...address,id:randomUUID(),isDefault:address.isDefault || addresses.length===0,criadoEm:new Date().toISOString()});
      tx.update(ref,{enderecos:addresses,atualizadoEm:stamp()});
    });
    return account(request);
  }
  async function deleteAddress(request) {
    const id=await resolve(request);
    if(!id.customerId) fail('failed-precondition','Informe seu celular de contato.');
    const index=request.data?.index;
    if(!request.data?.addressId && (!Number.isInteger(index) || index<0)) fail('invalid-argument','Endereço inválido.');
    await db.runTransaction(async tx=>{
      const ref=db.collection('clientes').doc(id.customerId);const snap=await tx.get(ref);
      if(snap.data()?.authOwnerUid!==id.user.uid) fail('permission-denied','Cadastro não autorizado.');
      const addresses=addressRecords(id.customerId, snap.data().enderecos);
      const position=request.data.addressId ? addresses.findIndex(a=>a.id===request.data.addressId) : index;
      const address=addresses[position];
      if(!address || (!request.data.addressId && address.enderecoCompleto!==request.data.expectedAddress)) fail('failed-precondition','Os endereços mudaram. Abra sua conta novamente.');
      addresses.splice(position,1);
      if (address.isDefault && addresses.length) addresses[0].isDefault=true;
      tx.update(ref,{enderecos:addresses,atualizadoEm:stamp()});
    });
    return account(request);
  }
  async function mutateAddress(request, makeDefault) {
    const id=await resolve(request);
    if(!id.customerId) fail('failed-precondition','Informe seu celular de contato.');
    if(typeof request.data?.addressId!=='string' || !request.data.addressId) fail('invalid-argument','Endereço inválido.');
    const replacement=makeDefault ? null : normalizeAddress(request.data.address);
    await db.runTransaction(async tx=>{
      const ref=db.collection('clientes').doc(id.customerId); const snap=await tx.get(ref);
      if(!snap.exists || snap.data().authOwnerUid!==id.user.uid) fail('permission-denied','Cadastro não autorizado.');
      let addresses=addressRecords(id.customerId,snap.data().enderecos);
      const index=addresses.findIndex(a=>a.id===request.data.addressId);
      if(index<0) fail('not-found','Endereço não encontrado. Atualize sua conta.');
      const useDefault=makeDefault || replacement.isDefault;
      if(useDefault) addresses=addresses.map(a=>({...a,isDefault:false}));
      const frequent=Object.prototype.hasOwnProperty.call(request.data.address || {},'localizacaoFrequente') ? replacement?.localizacaoFrequente : addresses[index].localizacaoFrequente===true;
      addresses[index]=makeDefault ? {...addresses[index],isDefault:true} : {...addresses[index],...replacement,localizacaoFrequente:frequent,isDefault:useDefault};
      tx.update(ref,{enderecos:addresses,atualizadoEm:stamp()});
    });
    return account(request);
  }
  return {account, completeProfile, update, orders, addAddress, resolve, deleteAddress,
    updateAddress: request=>mutateAddress(request,false), setDefaultAddress: request=>mutateAddress(request,true)};
}
module.exports = {createCustomerAccount, verifiedIdentity, normalizeContactPhone, normalizeAddress, normalizeBirthdate, normalizeName, addressRecords, digest};
