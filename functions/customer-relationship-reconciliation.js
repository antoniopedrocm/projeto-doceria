// Offline planner only: no Firebase import, database connection or apply mode.
const {createHash}=require('node:crypto');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const valid=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,150}$/.test(value)&&value!=='__all__';
function planReconciliation({customers=[],stores=[],decisions=[]}) {
  const ids=new Set(customers.filter(c=>valid(c.id)&&c.canonicalStatus!=='ALIAS').map(c=>c.id));
  const pairs=new Map(),pending=[],proposed=[];
  for(const d of decisions) {
    const pair=JSON.stringify([d.storeId,d.customerId]);
    pairs.set(pair,(pairs.get(pair)||0)+1);
  }
  for(const d of decisions) {
    const pair=JSON.stringify([d.storeId,d.customerId]);
    let reason=null;
    if(!valid(d.storeId)||!stores.includes(d.storeId)||!ids.has(d.customerId))reason='UNKNOWN_OR_NONCANONICAL_PAIR';
    else if(pairs.get(pair)!==1)reason='DUPLICATE_OR_CONFLICTING_DECISION';
    else if(d.currentState==='REVOKED')reason='REVOKED_REQUIRES_SEPARATE_DECISION';
    else if(d.currentState==='ACTIVE')reason='ALREADY_ACTIVE';
    else if(d.currentState!=null)reason='UNKNOWN_CURRENT_STATE';
    else if(d.approved!==true||!valid(d.reviewer)||!['independent_admin_record','documented_owner_review'].includes(d.evidenceKind)||typeof d.evidenceRef!=='string'||!d.evidenceRef.trim()||!/^sha256:[a-f0-9]{64}$/.test(d.evidenceDigest||''))reason='INDEPENDENT_REVIEW_REQUIRED';
    if(reason)pending.push({storeId:d.storeId,customerId:d.customerId,reason});
    else proposed.push({storeId:d.storeId,customerId:d.customerId,source:'REVIEWED_LEGACY',evidenceRef:d.evidenceRef,evidenceDigest:d.evidenceDigest,reviewer:d.reviewer});
  }
  return {mode:'DRY_RUN',inputDigest:digest({customers,stores,decisions}),proposed,pending,
    warning:'No writes. Input claims are not verified proof or authorization. Independently approve the manifest and recheck live state transactionally before any future executor.'};
}
module.exports={planReconciliation};
if(require.main===module) {
  if(process.argv.length!==3)throw new Error('Usage: node customer-relationship-reconciliation.js <offline-inventory.json> (dry-run only)');
  process.stdout.write(JSON.stringify(planReconciliation(JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8'))),null,2)+'\n');
}
