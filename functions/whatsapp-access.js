const {profileCanReceiveOrder} = require('./new-order-notifications');
const {isUserActive} = require('./user-status-core');

// Share the existing orders-module role/store policy. Never trust client roles.
const canAccessWhatsApp = async ({db, reader, uid, storeId}) => {
  if (typeof uid !== 'string' || !uid || uid.includes('/') || uid.length > 128) return false;
  const get = (path) => reader ? reader.get(db.doc(path)) : db.doc(path).get();
  const profile = (await get(`users/${uid}`)).data();
  const custom = (await get(`customProfiles/${uid}`)).data();
  return !!profile && isUserActive(profile) && profileCanReceiveOrder(profile, storeId, custom);
};
module.exports = {canAccessWhatsApp};
