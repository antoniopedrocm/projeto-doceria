import React, {useRef} from 'react';
import {Copy} from 'lucide-react';

export default function FiscalCloneConfirmation({invoice, busy, error, onCancel, onConfirm, Modal, Button}) {
  const confirming = useRef(false);
  const confirm = async () => {
    if (busy || confirming.current) return;
    confirming.current = true;
    try { await onConfirm(); } finally { confirming.current = false; }
  };
  return <Modal isOpen={Boolean(invoice)} onClose={() => { if (!busy && !confirming.current) onCancel(); }} title={`Clonar esta ${Number(invoice?.model) === 55 ? 'NF-e' : 'NFC-e'}?`} size="md">
    <div className="space-y-4">
      <p>Será criado um novo rascunho utilizando os dados desta nota. A nova nota ainda não será emitida e poderá ser editada.</p>
      <p className="text-sm text-gray-600">Número, chave, protocolos e arquivos fiscais pertencem somente à nota original. Confira os dados históricos antes de emitir o novo documento.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button type="button" disabled={busy} onClick={confirm}><Copy className="w-4 h-4" /> {busy ? 'Clonando...' : 'Clonar nota'}</Button>
      </div>
    </div>
  </Modal>;
}
