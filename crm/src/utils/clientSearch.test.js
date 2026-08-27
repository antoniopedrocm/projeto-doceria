import { filterClients, matchesClientSearch, normalizeClientSearchText } from './clientSearch';

const clients = [
  { id: '2', nome: 'Yasmin Silva', telefone: '(62) 99888-0000', cpf: '987.654.321-00' },
  { id: '1', nome: 'Yásmin Martins', telefone: '(62) 98429-8457', cpf: '123.456.789-00' },
  { id: '3', nome: 'Antônio Souza', telefone: '(11) 4002-8922' },
];

describe('busca de clientes do novo pedido', () => {
  test('normaliza acentos, maiúsculas e espaços excedentes', () => {
    expect(normalizeClientSearchText('  ANTÔNIO   Souza ')).toBe('antonio souza');
  });

  test('filtra pelo nome sem diferenciar acentos ou caixa', () => {
    expect(filterClients(clients, '  YAS  ').map((client) => client.id)).toEqual(['1', '2']);
    expect(matchesClientSearch(clients[2], 'Antonio')).toBe(true);
  });

  test('filtra por uma sequência de dígitos do telefone apesar da formatação', () => {
    expect(filterClients(clients, '6298429').map((client) => client.id)).toEqual(['1']);
  });

  test('filtra pelo CPF com ou sem pontuação', () => {
    expect(filterClients(clients, '123456').map((client) => client.id)).toEqual(['1']);
    expect(filterClients(clients, '987.654').map((client) => client.id)).toEqual(['2']);
  });

  test('com a busca vazia devolve a lista completa ordenada', () => {
    expect(filterClients(clients, '').map((client) => client.id)).toEqual(['3', '1', '2']);
  });

  test('retorna lista vazia quando não há correspondência', () => {
    expect(filterClients(clients, 'cliente inexistente')).toEqual([]);
  });
});
