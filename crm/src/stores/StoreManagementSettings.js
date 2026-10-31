import React from 'react';
import StoreManagementModal from './StoreManagementModal';

export const canManageStoreSettings = user => user?.manage_stores === true;

export function StoreManagementSettingsTab({user,activeTab,onChange}) {
  if (!canManageStoreSettings(user)) return null;
  return <button type="button" onClick={()=>onChange('gerenciar-lojas')} aria-current={activeTab==='gerenciar-lojas'?'page':undefined}
    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab==='gerenciar-lojas'?'bg-pink-600 text-white':'hover:bg-pink-100'}`}>
    Gerenciar Lojas
  </button>;
}

export default function StoreManagementSettings({user,...props}) {
  if (!canManageStoreSettings(user)) return null;
  return <StoreManagementModal {...props} canManage={true} isOpen={true} embedded={true}/>;
}
