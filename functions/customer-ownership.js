// Membership is written only by verified claim or reviewed migration on Admin.
// Never use an email/phone/body field to establish it.
function customerOwnerUids(data={}) {
  const members=data.identityRegistryVersion===1 && Array.isArray(data.authOwnerUids)?data.authOwnerUids:[];
  return [...new Set([data.authOwnerUid,...members].filter(uid=>typeof uid==='string' && uid.length>0 && uid.length<=128))];
}
const ownsCustomer=(data,uid)=>data?.canonicalStatus!=='ALIAS' && typeof uid==='string' && customerOwnerUids(data).includes(uid);
module.exports={customerOwnerUids,ownsCustomer};
