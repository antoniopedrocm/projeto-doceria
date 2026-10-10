import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { filterClients } from '../../utils/clientSearch';

const MAX_VISIBLE_CLIENTS = 100;

const SearchableClientSelect = ({ clients = [], value = '', onChange, error = '' }) => {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const inputRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedClient = useMemo(
    () => clients.find((client) => String(client.id) === String(value)) || null,
    [clients, value]
  );
  const filteredClients = useMemo(
    () => filterClients(clients, searchTerm),
    [clients, searchTerm]
  );
  const visibleClients = filteredClients.slice(0, MAX_VISIBLE_CLIENTS);
  const inputValue = isOpen ? searchTerm : (selectedClient?.nome || '');

  useEffect(() => {
    setActiveIndex(0);
  }, [searchTerm]);

  const openList = () => {
    setSearchTerm('');
    setActiveIndex(0);
    setIsOpen(true);
  };

  const closeList = () => {
    setIsOpen(false);
    setSearchTerm('');
  };

  const selectClient = (client) => {
    onChange(client);
    closeList();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isOpen) openList();
      else setActiveIndex((current) => Math.min(current + 1, visibleClients.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && isOpen && visibleClients[activeIndex]) {
      event.preventDefault();
      selectClient(visibleClients[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeList();
      inputRef.current?.blur();
    }
  };

  return (
    <div
      className="relative w-full space-y-1"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closeList();
      }}
    >
      <label className="block text-sm font-medium text-gray-700" htmlFor={inputId}>
        Cliente
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-activedescendant={isOpen && visibleClients[activeIndex] ? `${inputId}-option-${activeIndex}` : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          placeholder={isOpen ? 'Digite nome, telefone ou CPF' : 'Selecione um cliente'}
          value={inputValue}
          onFocus={() => {
            if (!isOpen) openList();
          }}
          onChange={(event) => {
            setSearchTerm(event.target.value);
            setIsOpen(true);
            if (value) onChange(null);
          }}
          onKeyDown={handleKeyDown}
          className={`w-full rounded-xl border py-3 pl-12 pr-12 transition-all focus:border-transparent focus:ring-2 focus:ring-pink-500 ${error ? 'border-red-300' : 'border-gray-300'}`}
        />
        <button
          type="button"
          aria-label={isOpen ? 'Fechar lista de clientes' : 'Abrir lista de clientes'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (isOpen) closeList();
            else {
              openList();
              inputRef.current?.focus();
            }
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100"
        >
          <ChevronDown className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {error && <p id={`${inputId}-error`} className="text-sm text-red-600">{error}</p>}

      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Clientes"
          className="absolute left-0 right-0 z-40 mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white p-1 shadow-xl"
        >
          {visibleClients.length === 0 ? (
            <p className="px-4 py-5 text-center text-sm text-gray-500">Nenhum cliente encontrado</p>
          ) : visibleClients.map((client, index) => {
            const isSelected = String(client.id) === String(value);
            const phone = client.telefone || client.phone || client.celular || client.whatsapp || '';

            return (
              <button
                key={client.id}
                id={`${inputId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectClient(client)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${index === activeIndex ? 'bg-pink-50' : 'hover:bg-gray-50'}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-800">{client.nome || 'Cliente sem nome'}</span>
                  {phone && <span className="block truncate text-xs text-gray-500">{phone}</span>}
                </span>
                {isSelected && <Check className="ml-3 h-4 w-4 flex-none text-pink-600" />}
              </button>
            );
          })}

          {filteredClients.length > MAX_VISIBLE_CLIENTS && (
            <p className="border-t border-gray-100 px-3 py-2 text-center text-xs text-gray-500">
              Mostrando os primeiros {MAX_VISIBLE_CLIENTS} clientes. Digite para refinar a busca.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableClientSelect;
