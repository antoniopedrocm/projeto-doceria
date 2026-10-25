const {createHash}=require('node:crypto');
const {normalizeCustomerPhone}=require('./customer-phone');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const value=v=>typeof v==='string'?v.trim():'';
function historicalAddresses(customerId,data) {
  const original=Array.isArray(data.enderecos)?data.enderecos:[],result=[...original];
  // Only formats proven in the CRM model. No parsing of residential strings,
  // no orphan address assignment, no default inferred from address availability.
  const a=data.address && typeof data.address==='object' && !Array.isArray(data.address)?data.address:{};
  const sources=[];
  if(value(a.street)) sources.push({source:'address',street:value(a.street),neighborhood:value(a.district || data.bairro),city:value(a.city || data.cidade),state:value(a.state || data.uf),cep:value(a.zip || data.cep)});
  if(value(data.endereco) && value(data.endereco)!==value(a.street)) sources.push({source:'endereco',street:value(data.endereco),neighborhood:value(data.bairro),city:value(data.cidade),state:value(data.uf),cep:value(data.cep)});
  const fingerprint=a=>hash(['nickname','street','number','complement','neighborhood','city','state','cep','enderecoCompleto'].map(k=>value(a?.[k]).normalize('NFKC').toLowerCase().replace(/\s+/g,' ')));
  for(const source of sources) {
    const {source:field,...fields}=source;
    const enderecoCompleto=[fields.street,fields.neighborhood,fields.city,fields.state,fields.cep?`CEP: ${fields.cep}`:''].filter(Boolean).join(', ');
    const address={...fields,enderecoCompleto,nickname:'',isDefault:false,localizacaoFrequente:false,createdVia:'legacy_phone_canonicalization',legacySource:field};
    address.id='legacy_'+hash([customerId,field,fingerprint(address)]).slice(0,40);
    if(!result.some(existing=>existing && typeof existing==='object' && (existing.id===address.id || fingerprint(existing)===fingerprint(address)))) result.push(address);
  }
  return result;
}
function buildCustomerMigrationPlan({customers,identities=[],orders=[]}) {
  const byPhone=new Map(),unresolved=[];
  for(const record of customers) {
    try {const phone=normalizeCustomerPhone(record.data.telefone || record.data.phone_number);if(!byPhone.has(phone.e164))byPhone.set(phone.e164,[]);byPhone.get(phone.e164).push(record);}
    catch {unresolved.push({path:record.path,reason:record.data.telefone || record.data.phone_number?'INVALID_PHONE':'MISSING_PHONE'});}
  }
  const groups=[];
  for(const [phone,records]of [...byPhone].sort(([a],[b])=>a.localeCompare(b))) {
    const ids=records.map(r=>r.path.split('/').at(-1));
    const uids=[...new Set(records.flatMap(r=>[r.data.authOwnerUid,...identities.filter(i=>i.data.customerId===r.path.split('/').at(-1)).map(i=>i.data.uid)]).filter(Boolean))];
    const names=new Set(records.map(r=>value(r.data.nome).normalize('NFKC').toLowerCase().replace(/\s+/g,' ')).filter(Boolean));
    const reasons=[];
    if(uids.length>1)reasons.push('MULTIPLE_STRONG_UIDS');
    // No existing group has been approved for consolidation. Safe unique
    // records may proceed independently; duplicates retain all source records.
    if(records.length>1)reasons.push('ALIAS_CONSOLIDATION_REQUIRES_REVIEW');
    if(records.length>1 && names.size>1)reasons.push('DIFFERENT_NAMES_REQUIRE_REVIEW');
    if(records.some(r=>{try{return r.data.telefone&&r.data.phone_number&&normalizeCustomerPhone(r.data.telefone).e164!==normalizeCustomerPhone(r.data.phone_number).e164;}catch{return true;}}))reasons.push('CONTRADICTORY_PHONE_FIELDS');
    const referenced=record=>orders.filter(o=>[o.data.clienteId,o.data.customerId,o.data.clientId].includes(record.path.split('/').at(-1))).length;
    const ranked=[...records].sort((a,b)=>Number(!!b.data.authOwnerUid)-Number(!!a.data.authOwnerUid) || referenced(b)-referenced(a) || String(a.data.criadoEm || a.data.createdAt || '\uffff').localeCompare(String(b.data.criadoEm || b.data.createdAt || '\uffff')) || a.path.localeCompare(b.path));
    const canonical=ranked[0],customerId=canonical.path.split('/').at(-1);
    const addresses=historicalAddresses(customerId,canonical.data);
    if(records.length>1 && records.some(r=>(Array.isArray(r.data.enderecos)?r.data.enderecos:[]).filter(a=>a?.isDefault).length>1))reasons.push('AMBIGUOUS_DEFAULTS');
    groups.push({normalizedPhone:phone,phoneKey:normalizeCustomerPhone(phone).key,state:reasons.length?'MANUAL_REVIEW_REQUIRED':'READY',reasons,
      customerId:reasons.length?null:customerId,candidateIds:ids,aliases:reasons.length?[]:ids.filter(id=>id!==customerId),
      // Existing aliases are preserved. Combining multi-record payloads remains
      // a reviewed migration step; never silently drop their source addresses.
      proposedAddresses:reasons.length?null:addresses,additionalAddressCount:reasons.length?0:addresses.length-(Array.isArray(canonical.data.enderecos)?canonical.data.enderecos.length:0),
      sourceVersions:records.map(r=>({path:r.path,updateTime:r.updateTime})),orderReferences:orders.filter(o=>[o.data.clienteId,o.data.customerId,o.data.clientId].some(id=>ids.includes(id))).map(o=>o.path)});
  }
  const digest=hash({groups:groups.map(({proposedAddresses,...g})=>({...g,addressHash:hash(proposedAddresses)})),unresolved});
  return {version:1,migrationId:'customer-phone-'+digest.slice(0,16),digest,groups,unresolved,
    summary:{customers:customers.length,phones:groups.length,ready:groups.filter(g=>g.state==='READY').length,manualReview:groups.filter(g=>g.state!=='READY').length,
      unresolved:unresolved.length,additionalAddresses:groups.reduce((sum,g)=>sum+g.additionalAddressCount,0)},customerWrites:0,orderWrites:0,identityWrites:0};
}
function buildConsolidationProposal({records,identities=[],orders=[],canonicalId,samePersonConfirmed=false}) {
  if(!samePersonConfirmed || !records.some(r=>r.path.split('/').at(-1)===canonicalId))throw Error('Explicit same-person review and canonical candidate are required.');
  const phones=new Set(records.map(r=>normalizeCustomerPhone(r.data.telefone || r.data.phone_number).e164));if(phones.size!==1)throw Error('Different phones cannot be consolidated by this proposal.');
  const ordered=[...records].sort((a,b)=>Number(b.path.split('/').at(-1)===canonicalId)-Number(a.path.split('/').at(-1)===canonicalId) || a.path.localeCompare(b.path));
  const ids=ordered.map(r=>r.path.split('/').at(-1)),addresses=[],seen=new Map();let originalDefaults=0,keptDefault=false,deduplicated=0;
  for(const record of ordered) {
    const sourceId=record.path.split('/').at(-1),values=historicalAddresses(sourceId,record.data);
    for(const [index,original] of values.entries()){
      const address=typeof original==='string'?{enderecoCompleto:original}:original;
      if(!address || typeof address!=='object')continue;
      if(address.isDefault===true)originalDefaults++;
      const signature=hash(['nickname','street','number','neighborhood','city','state','cep','referencia','enderecoCompleto'].map(k=>value(address[k]).normalize('NFKC').toLowerCase().replace(/\s+/g,' ')).concat([value(address.complement || address.complemento).normalize('NFKC').toLowerCase(),address.lat ?? null,address.lng ?? null,address.semNumero ?? null]));
      const source={customerId:sourceId,index,addressId:address.id || null,originalDefault:address.isDefault===true};
      if(seen.has(signature)){
        const prior=seen.get(signature);prior.sources.push(source);deduplicated++;
        if(sourceId===canonicalId && address.isDefault===true && !keptDefault){prior.address={...address,isDefault:true};keptDefault=true;}
        continue;
      }
      const isDefault=sourceId===canonicalId && address.isDefault===true && !keptDefault;keptDefault ||= isDefault;
      const entry={address:{...address,isDefault},sources:[source]};seen.set(signature,entry);addresses.push(entry);
    }
  }
  const ownerUids=[...new Set(ordered.flatMap(r=>[r.data.authOwnerUid,...identities.filter(i=>i.data.customerId===r.path.split('/').at(-1)).map(i=>i.data.uid)]).filter(Boolean))];
  const directOrders=orders.filter(o=>[o.data.clienteId,o.data.customerId,o.data.clientId].some(id=>ids.includes(id)));
  return {state:'PROPOSAL_ONLY_NOT_APPROVED_FOR_APPLY',canonicalCustomerId:canonicalId,legacyCustomerIds:ids.filter(id=>id!==canonicalId),
    normalizedPhone:[...phones][0],authOwnerUids:ownerUids,addresses,deduplicatedAddresses:deduplicated,originalDefaultFlags:originalDefaults,proposedDefaultCount:addresses.filter(a=>a.address.isDefault).length,
    orderReferences:directOrders.map(o=>o.path),orderWrites:0,authUserWrites:0,requiresFinalApproval:true};
}
module.exports={historicalAddresses,buildCustomerMigrationPlan,buildConsolidationProposal};
