const isStoreOwner=profile=>['dono','owner'].includes(String(profile?.role || '').trim().toLowerCase());
const canManageStores=(profile,custom={})=>isStoreOwner(profile) && profile?.manage_stores!==false && profile?.capabilities?.manage_stores!==false && custom?.capabilities?.manage_stores!==false;
const persistedStaffRole=(raw,normalized,existing)=>existing && !isStoreOwner(existing) && String(existing.role).toLowerCase()==='admin' && normalized==='dono'?'admin':isStoreOwner({role:raw})?'dono':normalized==='dono'?'admin':normalized;
function assertOwnerAccountChange(requester,targetRole,existingRole,HttpsError) {
  // Admin is a legacy alias in other modules, never an owner grant here.
  if((['dono','owner'].includes(String(existingRole || '').toLowerCase()) || targetRole==='dono') && !canManageStores(requester.profile))throw new HttpsError('permission-denied','Somente Dono pode conceder ou administrar uma conta Dono.');
}
module.exports={isStoreOwner,canManageStores,assertOwnerAccountChange,persistedStaffRole};
