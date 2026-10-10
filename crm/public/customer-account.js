import {auth, functions, httpsCallable} from './firebaseClientConfig.js?v=20261010-customer-shell';
import * as sdk from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import {installCustomerAccount as install} from './customer-account-core.mjs?v=20261010-customer-shell';
export function installCustomerAccount(options={}) {return install({...options,runtime:{auth,functions,httpsCallable,...sdk}});}
