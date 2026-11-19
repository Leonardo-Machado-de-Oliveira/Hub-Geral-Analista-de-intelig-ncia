import { Code2, X } from 'lucide-react';
import type { CompyConfig, FormInputs } from '@/src/types/compy';
import {
  buildCompyUrl,
  buildPedidoPayload,
  buildSavePedidoPayload,
  buildTituloPayload,
  formatDateYMD,
  getTodayLocalMidnight,
} from '@/src/lib/compy';
import { JsonCodeBlock } from '@/src/components/JsonCodeBlock';

interface PayloadModalProps {
  open: boolean;
  inputs: FormInputs;
  config: CompyConfig;
  onClose: () => void;
  onCopy: (text: string, label: string) => void;
}

export function PayloadModal({
  open,
  inputs,
  config,
  onClose,
  onCopy,
}: PayloadModalProps) {
  if (!open) return null;

  const docDigits = inputs.docInfo.digits || '00000000000';
  const docType = inputs.docInfo.type || (docDigits.length === 14 ? 'cnpj' : 'cpf');

  const safeInputs: FormInputs = {
    ...inputs,
    xPed: inputs.xPed || 'PED-EXEMPLO',
    docInfo: {
      valid: true,
      type: docType,
      digits: docDigits,
      error: null,
    },
    valorNum: Number.isFinite(inputs.valorNum) && inputs.valorNum > 0 ? inputs.valorNum : 150,
    vencYmd: inputs.vencYmd || formatDateYMD(getTodayLocalMidnight()),
    cProd: Number.isInteger(inputs.cProd) && inputs.cProd > 0 ? inputs.cProd : 5010124,
    qCom: Number.isFinite(inputs.qCom) && inputs.qCom > 0 ? inputs.qCom : 1,
    codigoObjetivo: inputs.codigoObjetivo || 'C15',
    codigoCobranca: inputs.codigoCobranca || '1',
  };

  const calls = [
    {
      title: '1. ws.Pedido (pré-checagem)',
      url: buildCompyUrl(config, 'ws.Pedido'),
      payload: buildPedidoPayload(safeInputs.xPed),
    },
    {
      title: '2. ws.SavePedido (criação do pedido)',
      url: buildCompyUrl(config, 'ws.SavePedido'),
      payload: buildSavePedidoPayload(safeInputs),
    },
    {
      title: '3. ws.Pedido (conferência)',
      url: buildCompyUrl(config, 'ws.Pedido'),
      payload: buildPedidoPayload(safeInputs.xPed),
    },
    {
      title: '4. ws.Titulo (consulta de título/boleto)',
      url: buildCompyUrl(config, 'ws.Titulo'),
      payload: buildTituloPayload(
        safeInputs.xPed,
        safeInputs.docInfo.type,
        safeInputs.docInfo.digits
      ),
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payloadModalTitle"
    >
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 flex max-h-[88vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Code2 className="h-5 w-5 text-[#004b93]" />
            <h2 id="payloadModalTitle" className="font-display text-base font-bold text-slate-900">
              Payloads das 4 Chamadas ao Compy
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {calls.map((c, idx) => {
            const rawJson = JSON.stringify(c.payload);
            return (
              <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                <div className="text-xs font-bold text-[#003366]">{c.title}</div>
                <div className="font-mono text-[11px] text-slate-500 break-all">
                  POST {c.url}
                </div>
                <JsonCodeBlock
                  label="Payload JSON"
                  value={c.payload}
                  onCopy={() => onCopy(rawJson, c.title)}
                />
              </div>
            );
          })}
        </div>

        <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
