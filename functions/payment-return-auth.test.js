const {test}=require('node:test');
const assert=require('node:assert/strict');
const {returnToken,returnAuthorization,canReadPayment,TTL_MS}=require('./payment-return-auth');
const context='a'.repeat(64),id='b'.repeat(64);
test('return capability is deterministic per checkout attempt, hashed at rest and limited by TTL',()=>{
 const token=returnToken(context,id),authorization=returnAuthorization(context,id,100);
 assert.notEqual(token,context);assert.notEqual(token,authorization.hash);
 assert.equal(token,returnToken(context,id));assert.notEqual(token,returnToken(context,'c'.repeat(64)));
 const payment={ownerUid:null,returnAuthorization:authorization};
 assert.equal(canReadPayment(payment,null,token,101),true);
 assert.equal(canReadPayment(payment,null,token,100+TTL_MS),false);
 for(const invalid of [null,undefined,'',context,'https://evil.test']) assert.equal(canReadPayment(payment,null,invalid,101),false);
 assert.equal(canReadPayment({ownerUid:null},null,null,101),false);
 assert.equal(canReadPayment({ownerUid:'a'},'a',null,101),true);
 assert.equal(canReadPayment({ownerUid:'a'},'b',null,101),false);
});
