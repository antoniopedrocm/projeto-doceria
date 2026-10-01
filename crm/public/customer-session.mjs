export const isLinkedCustomer = customer => Boolean(customer?.id && customer?.accountLinked);

export const retainAuthenticatedCustomer = customer => isLinkedCustomer(customer) ? customer : null;

export const createCustomerAuthState = ({onInvalidate = () => {}} = {}) => {
  let initialized = false;
  let observedUid = null;
  let publishedUid = null;
  let revision = 0;

  const invalidate = () => {
    if (publishedUid === null) return false;
    publishedUid = null;
    onInvalidate();
    return true;
  };

  const observe = rawUid => {
    const nextUid = typeof rawUid === 'string' && rawUid ? rawUid : null;
    const previousUid = observedUid;
    const changed = initialized && previousUid !== nextUid;

    if (!initialized || changed) {
      initialized = true;
      observedUid = nextUid;
      revision += 1;
      if (changed && previousUid !== null) invalidate();
    }

    return Object.freeze({uid: observedUid, revision});
  };

  const isCurrent = snapshot => Boolean(
    snapshot &&
    snapshot.uid !== null &&
    snapshot.uid === observedUid &&
    snapshot.revision === revision
  );

  const publish = snapshot => {
    if (!isCurrent(snapshot)) return false;
    publishedUid = snapshot.uid;
    return true;
  };

  return {observe, isCurrent, publish, invalidate};
};
