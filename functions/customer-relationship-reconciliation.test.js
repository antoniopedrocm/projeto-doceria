const {test}=require('node:test'),assert=require('node:assert/strict');
const {planReconciliation}=require('./customer-relationship-reconciliation');
const decision=(storeId,customerId,extra={})=>({storeId,customerId,approved:true,reviewer:'owner',evidenceKind:'documented_owner_review',evidenceRef:'approved-manifest/entry',evidenceDigest:'sha256:'+'a'.repeat(64),...extra});
test('dry-run preserves input, canonical identity and legitimate multistore without duplicates',()=>{
  const input={customers:[{id:'legacy',enderecos:['preserved']},{id:'alias',canonicalStatus:'ALIAS'}],stores:['matriz','garavelo'],decisions:[decision('matriz','legacy'),decision('garavelo','legacy'),decision('matriz','alias')]};
  const before=structuredClone(input),result=planReconciliation(input);
  assert.deepEqual(input,before);assert.equal(result.mode,'DRY_RUN');assert.equal(result.proposed.length,2);assert.equal(result.pending.length,1);
  assert.equal(result.inputDigest,planReconciliation(input).inputDigest);
});
test('fabricated orders, absent proof, revocation and conflicting decisions never propose grants',()=>{
  for(const extra of [{evidenceKind:'order'},{evidenceDigest:''},{approved:false},{currentState:'REVOKED'},{currentState:'ACTIVE'}]) {
    assert.equal(planReconciliation({customers:[{id:'c'}],stores:['matriz'],decisions:[decision('matriz','c',extra)]}).proposed.length,0);
  }
  assert.equal(planReconciliation({customers:[{id:'c'}],stores:['matriz'],decisions:[decision('matriz','c'),decision('matriz','c')]}).proposed.length,0);
});
