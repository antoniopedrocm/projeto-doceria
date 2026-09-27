export const isLinkedCustomer = customer => Boolean(customer?.id && customer?.accountLinked);

export const retainAuthenticatedCustomer = customer => isLinkedCustomer(customer) ? customer : null;
