export const PREVIEW_CAPABILITY='view_customer_as_readonly';
export const canPreviewCustomer=(role,permissions,details)=>['dono','gerente'].includes(role) && permissions?.clientes===true &&
  (details?.clientes?.[PREVIEW_CAPABILITY]===true || (role==='dono' && details?.clientes?.[PREVIEW_CAPABILITY]!==false));
export const previewPermissionDetails=(role,permissions,details)=>({[PREVIEW_CAPABILITY]:canPreviewCustomer(role,permissions,details)});
export const previewTarget=path=>path.match(/^\/admin\/customer-preview\/([a-zA-Z0-9_-]{1,150})(?:\/(?:profile|orders))?\/?$/)?.[1] || null;
