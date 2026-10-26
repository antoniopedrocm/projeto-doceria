import {isCustomerIdentity} from './customerContext';

// All inputs come from the current Firebase UID and existing authoritative readers.
export function createCapabilityResolver({loadStaff, loadCustomer}) {
  return async (user,{onStaffResolved}={}) => {
    if (!user || user.isAnonymous) throw Error('unauthenticated');
    const staff = await loadStaff(user);
    // Only the authoritative Staff reader can release the Staff shell. Customer
    // remains unresolved/denied until its independent private lookup completes.
    if(staff && onStaffResolved) onStaffResolved({uid:user.uid,isStaff:true,isCustomer:false,staff,customer:null,customerState:'PENDING'});
    let customer = null, customerState = 'NO_CUSTOMER';
    if (isCustomerIdentity(user)) {
      let result;
      try { result = await loadCustomer(user); } catch { customerState = 'ERROR'; }
      if (result?.customer?.id && result.customer.accountLinked === true) {
        customer = {customerId: result.customer.id, customer: result.customer};
        customerState = 'CUSTOMER_RESOLVED';
      } else if (result?.needsPhone === true) customerState = 'NEEDS_PHONE';
    }
    return {uid: user.uid, isStaff: Boolean(staff), isCustomer: Boolean(customer), staff, customer, customerState};
  };
}
export function permittedContext(capabilities, requested) {
  if (requested === 'customer' && capabilities.isCustomer) return 'customer';
  if (requested === 'staff' && capabilities.isStaff) return 'staff';
  return capabilities.isStaff ? 'staff' : capabilities.isCustomer ? 'customer' : null;
}
