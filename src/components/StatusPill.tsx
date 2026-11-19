import { AlertTriangle, CheckCircle2, Clock, MinusCircle, XCircle, Loader2 } from 'lucide-react';
import type { OperationStatus, StepState } from '@/src/types/compy';

export function OperationStatusTag({ status }: { status: OperationStatus }) {
  if (status === 'sucesso') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        Sucesso
      </span>
    );
  }
  if (status === 'parcial') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 whitespace-nowrap">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Parcial
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 whitespace-nowrap">
      <XCircle className="h-3.5 w-3.5 shrink-0" />
      Erro
    </span>
  );
}

export function StepStatusTag({ state }: { state: StepState }) {
  switch (state) {
    case 'ok':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Concluído
        </span>
      );
    case 'rodando':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#004b93] whitespace-nowrap">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          Em execução
        </span>
      );
    case 'erro':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 whitespace-nowrap">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          Falhou
        </span>
      );
    case 'aviso':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 whitespace-nowrap">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Alerta
        </span>
      );
    case 'pulado':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 whitespace-nowrap">
          <MinusCircle className="h-3.5 w-3.5 shrink-0" />
          Ignorado
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          Pendente
        </span>
      );
  }
}
