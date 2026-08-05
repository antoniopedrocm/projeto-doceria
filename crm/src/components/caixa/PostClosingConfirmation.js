import React from 'react';
import { AlertTriangle } from 'lucide-react';

const PostClosingConfirmation = ({
  isOpen,
  isSaving = false,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-closing-adjustment-title"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 id="post-closing-adjustment-title" className="text-xl font-bold text-gray-900">
              Lançamento após encerramento
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-6 text-gray-600">
              <p>Este dia já possui valor de encerramento registrado.</p>
              <p>
                O lançamento será incluído na data selecionada e o valor esperado, a diferença e os alertas do caixa serão recalculados.
              </p>
              <p>O valor de encerramento originalmente informado será preservado.</p>
              <p className="font-semibold text-gray-800">Deseja continuar?</p>
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSaving}
            className="rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:from-pink-600 hover:to-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Registrando...' : 'Confirmar lançamento'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PostClosingConfirmation;
