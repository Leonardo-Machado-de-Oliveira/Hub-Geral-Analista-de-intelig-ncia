import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { ToastItem } from '@/src/types/compy';

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (!toasts.length) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const styleMap = {
          success: 'border-emerald-200 bg-white text-slate-900',
          danger: 'border-red-200 bg-white text-slate-900',
          warning: 'border-amber-200 bg-white text-slate-900',
          info: 'border-slate-200 bg-slate-900 text-white',
        };
        const iconMap = {
          success: <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />,
          danger: <XCircle className="h-4 w-4 text-red-600 shrink-0" />,
          warning: <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />,
          info: <Info className="h-4 w-4 text-sky-400 shrink-0" />,
        };

        return (
          <div
            key={t.id}
            role="alert"
            className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-3 shadow-lg text-xs font-medium ${styleMap[t.variant]}`}
          >
            <div className="mt-0.5">{iconMap[t.variant]}</div>
            <div className="flex-1 leading-relaxed">{t.message}</div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Fechar notificação"
              className="opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
