const {createHash}=require('node:crypto');
const {normalizeCustomerPhone}=require('./customer-phone');
const hash=value=>createHash('sha256').update(value).digest('hex');
function encode(value) {
  if(value===null)return {nullValue:null};
  if(typeof value==='boolean')return {booleanValue:value};
  if(typeof value==='string')return {stringValue:value};
  if(typeof value==='number' && Number.isFinite(value))return Number.isSafeInteger(value)?{integerValue:String(value)}:{doubleValue:value};
  if(Array.isArray(value))return {arrayValue:{values:value.map(encode)}};
  if(value && typeof value==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))}};
  throw Error('Unsupported migration value');
}
const fields=object=>Object.fromEntries(Object.entries(object).map(([key,value])=>[key,encode(value)]));
const pathOf=doc=>doc.name.split('/documents/')[1];
function buildSafeMigrationWrites({plan,rawCustomers,identities=[],now}) {
  const raw=new Map(rawCustomers.map(doc=>[pathOf(doc),doc])),writes=[];
  for(const group of plan.groups) {
    for(const version of group.sourceVersions)if(raw.get(version.path)?.updateTime!==version.updateTime)throw Error('Customer changed since dry-run');
    const index={state:group.state,normalizedPhone:group.normalizedPhone,customerId:group.customerId,migrationId:plan.migrationId,updatedAt:now};
    if(group.state!=='READY')index.candidateIds=group.candidateIds;
    writes.push({path:'integrations/customerRegistry/phones/'+group.phoneKey,fields:fields(index)});
    if(group.state!=='READY')continue;
    const original=raw.get('clientes/'+group.customerId),data=original.fields;
    if(['identityRegistryVersion','authOwnerUids','legacyCustomerIds','legacyOrderPaths','canonicalStatus'].some(k=>data[k]!==undefined))throw Error('Unexpected canonical metadata requires a new audit');
    const owner=data.authOwnerUid?.stringValue,linked=identities.filter(i=>i.data.customerId===group.customerId);
    if(linked.some(i=>!owner || i.data.uid!==owner))throw Error('Identity ownership needs manual review');
    const originalAddresses=data.enderecos?.arrayValue?.values || [],count=group.proposedAddresses.length-group.additionalAddressCount;
    if(originalAddresses.length!==count)throw Error('Address source changed');
    const patch=fields({normalizedPhone:group.normalizedPhone,phone_number:group.normalizedPhone,telefone:normalizeCustomerPhone(group.normalizedPhone).national,
      identityRegistryVersion:1,canonicalStatus:'CANONICAL',legacyCustomerIds:[],legacyOrderPaths:group.orderReferences.filter(p=>p.startsWith('pedidos/')),authOwnerUids:owner?[owner]:[],phoneMigrationId:plan.migrationId});
    if(group.additionalAddressCount)patch.enderecos={arrayValue:{values:[...originalAddresses,...group.proposedAddresses.slice(count).map(encode)]}};
    writes.push({path:pathOf(original),fields:patch,updateMask:Object.keys(patch),updateTime:original.updateTime});
    if(owner)writes.push({path:'integrations/customerRegistry/uids/'+hash(owner),fields:fields({uid:owner,customerId:group.customerId,migrationId:plan.migrationId,updatedAt:now})});
  }
  writes.push({path:'integrations/customerRegistry',fields:fields({state:'READY',version:1,writersVersion:1,migrationId:plan.migrationId,updatedAt:now})});
  return writes;
}
function buildReviewedMigrationWrites({proposal,rawCustomers,identities=[],migrationId,now}) {
  if(!proposal.requiresFinalApproval || proposal.state!=='PROPOSAL_ONLY_NOT_APPROVED_FOR_APPLY')throw Error('Invalid reviewed proposal');
  const raw=new Map(rawCustomers.map(doc=>[pathOf(doc).split('/').at(-1),doc])),writes=[];
  const canonical=raw.get(proposal.canonicalCustomerId);if(!canonical)throw Error('Missing canonical source');
  const ids=new Set(),addressSources=[];
  const saved=proposal.addresses.map((entry,index)=>{
    const primary=entry.sources.find(s=>s.addressId && s.addressId===entry.address.id) || entry.sources[0];
    const source=raw.get(primary.customerId);if(!source)throw Error('Missing alias source');
    const sourceValue=source.fields.enderecos?.arrayValue?.values?.[primary.index];
    const original=sourceValue?.mapValue?.fields || fields(entry.address);
    const generated='merged_'+hash(JSON.stringify([migrationId,primary.customerId,primary.index,index])).slice(0,40);
    const id=entry.address.id && !ids.has(entry.address.id)?entry.address.id:generated;ids.add(id);
    addressSources.push({addressId:id,sources:entry.sources});
    return {mapValue:{fields:{...original,id:encode(id),isDefault:encode(entry.address.isDefault===true)}}};
  });
  const sourceIds=[proposal.canonicalCustomerId,...proposal.legacyCustomerIds];
  const stores=[...new Set(sourceIds.flatMap(id=>(raw.get(id)?.fields.lojasVisitadas?.arrayValue?.values || []).map(v=>v.stringValue).filter(Boolean)))];
  const coupons=[...new Set(sourceIds.flatMap(id=>(raw.get(id)?.fields.cuponsUsados?.arrayValue?.values || []).map(v=>v.stringValue).filter(Boolean)))];
  const patch={...fields({canonicalStatus:'CANONICAL',identityRegistryVersion:1,normalizedPhone:proposal.normalizedPhone,phone_number:proposal.normalizedPhone,telefone:normalizeCustomerPhone(proposal.normalizedPhone).national,
    legacyCustomerIds:proposal.legacyCustomerIds,legacyOrderPaths:proposal.orderReferences.filter(p=>p.startsWith('pedidos/')),authOwnerUids:proposal.authOwnerUids,lojasVisitadas:stores,cuponsUsados:coupons,phoneMigrationId:migrationId}),enderecos:{arrayValue:{values:saved}}};
  writes.push({path:pathOf(canonical),fields:patch,updateMask:Object.keys(patch),updateTime:canonical.updateTime});
  for(const id of proposal.legacyCustomerIds){
    const doc=raw.get(id);if(!doc)throw Error('Missing alias');
    const patch=fields({canonicalStatus:'ALIAS',canonicalCustomerId:proposal.canonicalCustomerId,phoneMigrationId:migrationId});
    writes.push({path:pathOf(doc),fields:patch,updateMask:Object.keys(patch),updateTime:doc.updateTime});
    writes.push({path:'integrations/customerRegistry/aliases/'+hash(id),fields:fields({state:'READY',customerId:proposal.canonicalCustomerId,migrationId,updatedAt:now})});
  }
  for(const uid of proposal.authOwnerUids)writes.push({path:'integrations/customerRegistry/uids/'+hash(uid),fields:fields({uid,customerId:proposal.canonicalCustomerId,migrationId,updatedAt:now})});
  for(const identity of identities.filter(i=>sourceIds.includes(i.data.customerId))){
    if(!proposal.authOwnerUids.includes(identity.data.uid))throw Error('Unreviewed identity');
    writes.push({path:identity.path,fields:fields({customerId:proposal.canonicalCustomerId}),updateMask:['customerId'],updateTime:identity.updateTime});
  }
  writes.push({path:'integrations/customerRegistry/phones/'+normalizeCustomerPhone(proposal.normalizedPhone).key,fields:fields({state:'READY',customerId:proposal.canonicalCustomerId,normalizedPhone:proposal.normalizedPhone,migrationId,updatedAt:now})});
  writes.push({path:'integrations/customerRegistry/migrations/'+migrationId,fields:fields({state:'APPLIED',type:'REVIEWED_CONSOLIDATION',sourceIds,addressSources,canonicalId:proposal.canonicalCustomerId,orderWrites:0,authUserWrites:0,appliedAt:now})});
  return writes;
}
module.exports={encode,fields,buildSafeMigrationWrites,buildReviewedMigrationWrites};
