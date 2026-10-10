import {getApps, initializeApp} from 'firebase/app';
import * as sdk from 'firebase/auth';
import {httpsCallable,getFunctions,connectFunctionsEmulator} from 'firebase/functions';
import {app, functions} from '../firebaseConfig';
const publicApp=getApps().find(a=>a.name==='cardapioPublic') || initializeApp(app.options,'cardapioPublic');
export const customerAuth=sdk.getAuth(publicApp);
const customerFunctions=getFunctions(publicApp,'us-central1');
if(app.options.projectId==='demo-doceria-checkout') {
  sdk.connectAuthEmulator(customerAuth,'http://127.0.0.1:9099',{disableWarnings:true});
  connectFunctionsEmulator(customerFunctions,'127.0.0.1',5001);
}
export const runtimeFor = auth => ({auth,functions:auth.app===publicApp?customerFunctions:functions,httpsCallable,...sdk});
export const loadCustomerController = () => import(/* webpackIgnore: true */ '/customer-account-core.mjs?v=20261010-customer-shell');
