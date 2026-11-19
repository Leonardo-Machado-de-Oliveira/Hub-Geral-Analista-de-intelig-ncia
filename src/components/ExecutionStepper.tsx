import type { ExecutionStep } from '@/src/types/compy';
import { StepStatusTag } from '@/src/components/StatusPill';

interface ExecutionStepperProps {
  steps: ExecutionStep[];
}

export function ExecutionStepper({ steps }: ExecutionStepperProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2.5">
      {steps.map((step, idx) => {
        const borderStyles: Record<ExecutionStep['state'], string> = {
          pendente: 'border-slate-200 bg-slate-50/70',
          rodando: 'border-sky-300 bg-sky-50/70',
          ok: 'border-emerald-200 bg-emerald-50/60',
          erro: 'border-red-200 bg-red-50/60',
          aviso: 'border-amber-200 bg-amber-50/60',
          pulado: 'border-slate-200 bg-slate-50/40 opacity-75',
        };

        return (
          <div
            key={idx}
            className={`rounded-lg border p-3 transition-colors ${borderStyles[step.state]}`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-semibold text-slate-900 truncate" title={step.label}>
                {step.label}
              </span>
            </div>
            <div className="mb-1">
              <StepStatusTag state={step.state} />
            </div>
            <p className="text-xs text-slate-600 leading-snug break-words line-clamp-2" title={step.msg}>
              {step.msg || 'Aguardando'}
            </p>
          </div>
        );
      })}
    </div>
  );
}
