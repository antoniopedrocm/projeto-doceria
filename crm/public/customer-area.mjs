import {isLinkedCustomer} from './customer-session.mjs';

export const isCustomerIdentity = user => Boolean(user && !user.isAnonymous &&
  Array.isArray(user.providerData) && user.providerData.some(provider =>
    provider.providerId === 'google.com' || provider.providerId === 'password'));

export const canEnterCustomerArea = ({user, customer, ownerUid} = {}) => Boolean(
  isCustomerIdentity(user) && typeof user.uid === 'string' && user.uid &&
  user.uid === ownerUid && isLinkedCustomer(customer)
);

// Internal screen routes. Neither a route name nor a Customer ID authorizes access.
export function createCustomerAreaNavigation({getSession, onChange = () => {}}) {
  let route = 'login';
  const isAllowed = () => canEnterCustomerArea(getSession());
  const navigate = requested => {
    route = isAllowed() ? (['home', 'profile', 'orders'].includes(requested) ? requested : 'profile') : 'login';
    onChange(route);
    return route;
  };
  const invalidate = () => {route = 'login'; onChange(route);};
  return {navigate, invalidate, isAllowed, getRoute: () => route};
}
