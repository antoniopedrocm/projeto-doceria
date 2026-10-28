import {useCallback,useEffect,useState} from 'react';

export const STAFF_HOME_SECTION='pagina-inicial';
// Navigation metadata only. Never adopt the old, unowned currentPage key.
export const staffSectionKey=uid=>uid?`staff-section-v1:${uid}`:null;
const readSection=key=>{
  if(!key)return STAFF_HOME_SECTION;
  try {
    const value=JSON.parse(sessionStorage.getItem(key));
    return typeof value==='string'?value:STAFF_HOME_SECTION;
  } catch {return STAFF_HOME_SECTION;}
};

// Use the existing menu catalog and permission evaluator, not cached permissions.
export function reconcileStaffSection(section,knownSections,canAccess) {
  return knownSections.includes(section) && canAccess(section)?section:STAFF_HOME_SECTION;
}

export default function useStaffSection(uid) {
  const key=staffSectionKey(uid);
  const [saved,setSaved]=useState(()=>({key,value:readSection(key)}));
  const current=saved.key===key?saved.value:readSection(key);
  useEffect(()=>{
    if(saved.key!==key){setSaved({key,value:readSection(key)});return;}
    if(key)try {sessionStorage.setItem(key,JSON.stringify(saved.value));} catch {/* Storage is optional. */}
  },[key,saved]);
  const setSection=useCallback(next=>setSaved(previous=>{
    const value=previous.key===key?previous.value:readSection(key);
    return {key,value:typeof next==='function'?next(value):next};
  }),[key]);
  return [current,setSection];
}
