export const normalizeClientSearchText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const onlyDigits = (value) => String(value || '').replace(/\D/g, '');

export const matchesClientSearch = (client, searchTerm) => {
  const normalizedTerm = normalizeClientSearchText(searchTerm);
  if (!normalizedTerm) return true;

  const phone = client?.telefone || client?.phone || client?.celular || client?.whatsapp || '';
  const document = client?.cpf || client?.documento || client?.cpfCnpj || client?.cnpj || '';
  const searchableText = normalizeClientSearchText([
    client?.nome,
    phone,
    document,
    onlyDigits(phone),
    onlyDigits(document),
  ].filter(Boolean).join(' '));

  return normalizedTerm
    .split(' ')
    .filter(Boolean)
    .every((termPart) => searchableText.includes(termPart));
};

export const filterClients = (clients, searchTerm) => (clients || [])
  .filter((client) => matchesClientSearch(client, searchTerm))
  .sort((first, second) => String(first?.nome || '').localeCompare(
    String(second?.nome || ''),
    'pt-BR',
    { sensitivity: 'base' }
  ));
