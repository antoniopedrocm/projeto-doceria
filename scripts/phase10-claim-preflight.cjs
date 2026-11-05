// Read-only C15 preparation. No claim, migration, identity write or SMS operation.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {normalizeCustomerPhone}=require('../functions/customer-phone');
const {customerOwnerUids}=require('../functions/customer-ownership');
const DEV_PROJECT='crmdoceria-9959e';
const digest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');

function classify({customers,phones,uids,identities,registryReady,smsPolicy}) {
  const rows=[];
  for(const customer of customers) {
    if(customer.data.canonicalStatus==='ALIAS')continue;
    const ownerCount=customerOwnerUids(customer.data).length,reasons=[];
    let phone;
    try {phone=normalizeCustomerPhone(customer.data.telefone || customer.data.phone_number);}
    catch {reasons.push('MISSING_OR_INVALID_PHONE');}
    if(ownerCount)reasons.push('EXISTING_OWNER_DO_NOT_REASSIGN');
    if(!registryReady)reasons.push('REGISTRY_NOT_READY');
    if(phone && phone.type!=='mobile')reasons.push('PHONE_NOT_MOBILE');
    const index=phone && phones.find(row=>row.id===phone.key);
    const indexReady=!!(phone && index?.data.state==='READY' && index.data.customerId===customer.id && index.data.normalizedPhone===phone.e164);
    if(!indexReady)reasons.push('PHONE_INDEX_NOT_CANONICAL_READY');
    const family=new Set([customer.id,...(Array.isArray(customer.data.legacyCustomerIds)?customer.data.legacyCustomerIds:[])]);
    const uidMappings=uids.filter(row=>family.has(row.data.customerId)).length;
    const identityMappings=identities.filter(row=>family.has(row.data.customerId)).length;
    if(!ownerCount && (uidMappings || identityMappings))reasons.push('IDENTITY_MAPPING_REQUIRES_REVIEW');
    const smsConfigured=smsPolicy?.enabled===true && smsPolicy?.sms?.enabled===true && smsPolicy.sms.provider==='firebase' && smsPolicy.sms.verificationOnly===true && typeof smsPolicy.sms.projectId==='string' && ![DEV_PROJECT,'ana-guimaraes'].includes(smsPolicy.sms.projectId) && smsPolicy.sms.authDomain===smsPolicy.sms.projectId+'.firebaseapp.com';
    const allowlisted=!!(phone && Array.isArray(smsPolicy?.allowedRecipients) && smsPolicy.allowedRecipients.includes(phone.e164));
    if(!smsConfigured)reasons.push('SMS_POLICY_NOT_CONFIGURED');
    if(!allowlisted)reasons.push('RECIPIENT_NOT_ALLOWLISTED');
    rows.push({caseId:digest('C15:'+customer.id).slice(0,16),ownerCount,validMobile:phone?.type==='mobile',indexReady,uidMappings,identityMappings,smsConfigured,recipientAllowlisted:allowlisted,
      ...(allowlisted && !ownerCount && phone?{recipientSuffix:phone.national.slice(-4)}:{}),
      eligibility:reasons.length?'BLOCKED_DATA_PRECHECK':'DATA_PRECHECK_READY',reasons,
      participantSelected:false,destinationIdentityProvided:false,permanentClaimApproved:false,smsSendApproved:false});
  }
  return {customerDocuments:customers.length,aliasesExcluded:customers.length-rows.length,canonicalOrUnclassified:rows.length,
    dataReadyCases:rows.filter(row=>row.eligibility==='DATA_PRECHECK_READY').length,existingOwnerCases:rows.filter(row=>row.ownerCount>0).length,cases:rows};
}

function assertScope(project,workspace,storeId) {
  const parts=workspace.toLowerCase().replaceAll('\\','/').split('/');
  if(project!==DEV_PROJECT || !parts.includes('projeto-doceria-main') || parts.includes('projeto-doceria-multiloja'))throw Error('Only the authorized DEV workspace/project is permitted');
  if(typeof storeId!=='string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(storeId))throw Error('Explicit valid storeId required; no store fallback');
}
function decode(value) {
  if('stringValue'in value)return value.stringValue;
  if('integerValue'in value)return Number(value.integerValue);
  if('doubleValue'in value)return value.doubleValue;
  if('booleanValue'in value)return value.booleanValue;
  if('nullValue'in value)return null;
  if(value.arrayValue)return (value.arrayValue.values || []).map(decode);
  if(value.mapValue)return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key,v])=>[key,decode(v)]));
  return undefined;
}
function row(document) {return {id:document.name.split('/').at(-1),updateTime:document.updateTime,data:Object.fromEntries(Object.entries(document.fields || {}).map(([key,value])=>[key,decode(value)]))};}

async function run(args) {
  const option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
  const project=option('--project'),storeId=option('--store'),workspace=fs.realpathSync(process.cwd());assertScope(project,workspace,storeId);
  if(args.some(x=>['--apply','--send','--claim','--migrate'].includes(x)))throw Error('This command is read-only');
  const lib=option('--firebase-tools-lib'),output=path.resolve(option('--out') || '');
  if(!lib || !output.startsWith(path.join(workspace,'docs','evidence')+path.sep) || fs.existsSync(output))throw Error('CLI library and new evidence output inside workspace are required');
  const auth=require(path.join(lib,'auth')),opts={project,projectRoot:workspace};auth.setActiveAccount(opts,auth.getProjectDefaultAccount(workspace));await require(path.join(lib,'requireAuth')).requireAuth(opts);
  const Client=require(path.join(lib,'apiv2')).Client,client=new Client({urlPrefix:'https://firestore.googleapis.com',auth:true});
  const database='/v1/projects/'+DEV_PROJECT+'/databases/(default)',base=database+'/documents';
  const databaseInfo=(await client.get(database)).body;
  const queries=[];
  async function query(collection,fields) {
    const split=collection.lastIndexOf('/'),parent=split<0?'':collection.slice(0,split),collectionId=collection.slice(split+1);
    const request={structuredQuery:{from:[{collectionId}],select:{fields:fields.map(fieldPath=>({fieldPath}))},limit:1001}};
    const response=(await client.post(base+(parent?'/'+parent:'')+':runQuery',request)).body;
    const rows=(Array.isArray(response)?response:[]).filter(x=>x.document).map(x=>row(x.document));
    if(rows.length>1000)throw Error('Preflight incomplete; refine selected case instead of truncating');
    queries.push({collection,fields,documents:rows.length});return rows;
  }
  async function get(document,fields) {
    const suffix=fields.map(f=>'mask.fieldPaths='+encodeURIComponent(f)).join('&');
    try{return row((await client.get(base+'/'+document+'?'+suffix)).body);}
    catch(error){if(error.status===404 || error.context?.response?.statusCode===404)return {data:{}};throw error;}
  }
  const [customers,phones,uids,identities,registry,policy,store]=await Promise.all([
    query('clientes',['telefone','phone_number','normalizedPhone','authOwnerUid','authOwnerUids','identityRegistryVersion','canonicalStatus','legacyCustomerIds']),
    query('integrations/customerRegistry/phones',['state','normalizedPhone','customerId']),
    query('integrations/customerRegistry/uids',['uid','customerId']),
    query('customerAuthIdentities',['uid','customerId','provider']),
    get('integrations/customerRegistry',['state']),
    get('integrations/addressVerification/stores/'+storeId,['enabled','allowedRecipients','sms.enabled','sms.provider','sms.verificationOnly','sms.projectId','sms.authDomain']),
    get('lojas/'+storeId,['status'])
  ]);
  if(!store.id)throw Error('Explicit store not found');
  const result=classify({customers,phones,uids,identities,registryReady:registry.data.state==='READY',smsPolicy:policy.data});
  const evidence={schema:1,project,storeId,database:'(default)',databaseEdition:databaseInfo.databaseEdition || 'not-returned',checkedAt:new Date().toISOString(),readOnly:true,
    sourceFingerprint:digest(JSON.stringify({customers,phones,uids,identities,registry,policy})),queries,...result,
    limits:['Data-only readiness is not permission or proof of ownership','No provider status, Auth token, claim challenge, OTP or SMS operation called','Destination identity must be verified after actual Google/password login','Each provider scenario must exercise a real claim; re-login of an existing owner is not a second claim','Other-phone recipients require case-specific approval; no automatic allowlist update'],
    permanentClaimsPerformed:0,smsSends:0,remoteWrites:0,production:false};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({project,storeId,readOnly:true,customerDocuments:result.customerDocuments,dataReadyCases:result.dataReadyCases,existingOwnerCases:result.existingOwnerCases,evidence:output,remoteWrites:0,smsSends:0,production:false}));
  return evidence;
}
module.exports={classify,assertScope,decode};
if(require.main===module)run(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
