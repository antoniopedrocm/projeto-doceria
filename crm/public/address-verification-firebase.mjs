import {app} from './firebaseClientConfig.js?v=20261015-persistence';
import {createEnterpriseSmsVerifier} from './sms-enterprise.mjs';

// Existing backend REST flow keeps OTP, provider tokens and phone users isolated.
// Enterprise JS only produces an app-risk token: no secondary browser Auth or
// persistence is necessary and [DEFAULT] is never signed in/out or changed.
export const createSmsRecaptcha=createEnterpriseSmsVerifier({document,window,mainProjectId:app.options.projectId});
