import { httpsCallable } from 'firebase/functions';

export const fetchAuthorizedTransferDestinations = async (functionsInstance, originStoreId) => {
  const listDestinations = httpsCallable(functionsInstance, 'listAuthorizedTransferDestinations');
  const result = await listDestinations({ originStoreId });
  return Array.isArray(result?.data?.destinations) ? result.data.destinations : [];
};
