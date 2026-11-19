import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileText,
  XCircle,
} from 'lucide-react';
import type { ExecutionRecord } from '@/src/types/compy';
import {
  formatCurrencyBR,
  formatDateBR,
  formatDurationMs,
  maskCpfCnpj,
} from '@/src/lib/compy';
import { OperationStatusTag } from '@/src/components/StatusPill';

interface OperationResultSummaryProps {
  execution: ExecutionRecord;
  onOpenDetails: (exec: ExecutionRecord) => void;
  onOpenBoleto: (link: string) => void;
  onDownloadBoleto: (link: string, xPed: string) => void;
}

export function OperationResultSummary({
  execution,
  onOpenDetails,
  onOpenBoleto,
  onDownloadBoleto,
}: OperationResultSummaryProps) {
  const result = execution.result;
  if (!result) return null;

  const isSuccess = result.status === 'sucesso';
  const isPartial = result.status === 'parcial';

  const containerSurface = isSuccess
    ? 'border-emerald-200 bg-emerald-50/40'
    : isPartial
      ? 'border-amber-200 bg-amber-50/40'
      : 'border-red-200 bg-red-50/40';

  const iconEl = isSuccess ? (
    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
  ) : isPartial ? (
    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
  ) : (
    <XCircle className="h-5 w-5 text-red-600 shrink-0" />
  );

  const whenText = execution.finishedAt
    ? new Date(execution.finishedAt).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'medium',
      })
    : '--';

  const valorText =
    result.vTotDisplay && result.vTotDisplay !== '--'
      ? result.vTotDisplay
      : Number.isFinite(execution.valorEnviado)
        ? formatCurrencyBR(execution.valorEnviado)
        : '--';

  const vencText = execution.vencYmd ? formatDateBR(execution.vencYmd) : '--';
  const maskedDoc = execution.docDigits
    ? maskCpfCnpj(execution.docDigits)
    : result.cliente && result.cliente !== '--'
      ? maskCpfCnpj(result.cliente)
      : '--';

  const durationText = formatDurationMs(execution.durationMs);

  return (
    <div className={`rounded-xl border p-5 ${containerSurface}`}>
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="mt-0.5">{iconEl}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="font-display text-base font-bold text-slate-900">
                {result.title}
              </h3>
              <OperationStatusTag status={result.status} />
            </div>
            <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {result.message}
            </p>
            {result.warnings && result.warnings.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-amber-900 list-disc pl-4">
                {result.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenDetails(execution)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-xs hover:bg-slate-50 hover:border-[#004b93] hover:text-[#004b93] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Eye className="h-3.5 w-3.5" />
          Ver detalhes
        </button>
      </div>

      {/* Clean Summary Grid */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 rounded-lg border border-slate-200/80 bg-white p-3.5">
        <div>
          <div className="text-[11px] font-medium text-slate-500">Número do pedido</div>
          <div className="mt-0.5 font-mono text-xs font-semibold text-slate-900 truncate tabular-nums">
            {result.xPed || execution.xPed || '--'}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-slate-500">CPF/CNPJ</div>
          <div className="mt-0.5 font-mono text-xs font-semibold text-slate-900 truncate tabular-nums">
            {maskedDoc}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-slate-500">Valor</div>
          <div className="mt-0.5 font-mono text-xs font-semibold text-slate-900 truncate tabular-nums">
            {valorText}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-slate-500">Vencimento</div>
          <div className="mt-0.5 font-mono text-xs font-semibold text-slate-900 truncate tabular-nums">
            {vencText}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-slate-500">Data e hora</div>
          <div className="mt-0.5 font-mono text-xs font-medium text-slate-700 truncate tabular-nums">
            {whenText}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-slate-500">Tempo de execução</div>
          <div className="mt-0.5 font-mono text-xs font-semibold text-slate-900 truncate tabular-nums">
            {durationText}
          </div>
        </div>
      </div>

      {/* Boleto Action Bar (when returned) */}
      {result.tituloData && (
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
          {result.boletoLink ? (
            <>
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                <FileText className="h-4 w-4 shrink-0" />
                <span>Boleto disponível para visualização e download</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenBoleto(result.boletoLink!)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#004b93] bg-white px-3 py-1.5 text-xs font-semibold text-[#004b93] hover:bg-sky-50 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir boleto
                </button>
                <button
                  type="button"
                  onClick={() => onDownloadBoleto(result.boletoLink!, result.xPed)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Baixar PDF
                </button>
              </div>
            </>
          ) : (
            <div className="text-xs text-amber-800">
              O título foi localizado no Compy (ws.Titulo), porém não trouxe link de boleto na resposta. Consulte os campos retornados em "Ver detalhes".
            </div>
          )}
        </div>
      )}
    </div>
  );
}
