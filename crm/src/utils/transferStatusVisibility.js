export const getExplicitTransferStatuses = (details, validStatuses) => {
  const module = details?.['entre-lojas'] ?? details?.entreLojas;
  const statuses = module?.statuses ?? module?.status;
  if (!Array.isArray(statuses)) return [];
  return [...new Set(statuses.filter((status) => validStatuses.includes(status)))];
};
