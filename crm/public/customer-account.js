import {auth, functions, httpsCallable, logout, sessionTransition} from './firebaseClientConfig.js?v=20261014-single-session';
import * as sdk from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import {installCustomerAccount as install} from './customer-account-core.mjs?v=20261014-single-session';
export function installCustomerAccount(options={}) {
  const account=install({...options,runtime:{auth,functions,httpsCallable,...sdk,logout}});
  if(sessionTransition!=='READY') options.notify?.('Entre novamente para continuar com a sessão única.');
  return account;
}
