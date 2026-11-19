import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileJson,
  ListChecks,
  Network,
  Terminal,
  X,
} from 'lucide-react';
import type { CallTrace, ExecutionRecord, HistoryEntry } from '@/src/types/compy';
import {
  buildCurlCommand,
  extractCorrelationId,
  formatCpfCnpj,
  formatCurrencyBR,
  formatDateBR,
  formatDurationMs,
  formatLogText,
  isHtmlBody,
  maskCpfCnpj,
  tryParse,
} from '@/src/lib/compy';
import { OperationStatusTag, StepStatusTag } from '@/src/components/StatusPill';
import { JsonCodeBlock } from '@/src/components/JsonCodeBlock';

interface OperationDetailsDrawerProps {
  open: boolean;
  execution: ExecutionRecord | null;
  historyFallback?: HistoryEntry | null;
  onClose: () => void;
  onCopy: (text: string, label: string) => void;
  onOpenBoleto: (link: string) => void;
  onDownloadBoleto: (link: string, xPed: string) => void;
}

type DetailTab = 'overview' | 'calls' | 'raw';

function CallTraceAccordion({
  trace,
  index,
  defaultExpanded,
  onCopy,
}: {
  trace: CallTrace;
  index: number;
  defaultExpanded: boolean;
  onCopy: (text: string, label: string) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const interp = trace.interpretacao || { tipo: 'transporte', msg: '', parsed: null };

  let statusLabel = '';
  let statusBadgeClass = 'border-slate-200 bg-slate-100 text-slate-700';

  if (trace.fetchError) {
    if (trace.isTimeout) {
      statusLabel = 'TIMEOUT';
      statusBadgeClass = 'border-red-200 bg-red-50 text-red-700';
    } else if (trace.isAborted) {
      statusLabel = 'ABORTADO';
      statusBadgeClass = 'border-slate-200 bg-slate-100 text-slate-700';
    } else {
      statusLabel = 'CORS_OU_REDE';
      statusBadgeClass = 'border-red-200 bg-red-50 text-red-700';
    }
  } else {
    statusLabel = `HTTP ${trace.httpStatus}${trace.statusText ? ` ${trace.statusText}` : ''}`;
    if (interp.tipo === 'ok') {
      statusBadgeClass = 'border-emerald-200 bg-emerald-50 text-emerald-700';
    } else if (interp.tipo === 'negocio') {
      statusBadgeClass = 'border-amber-200 bg-amber-50 text-amber-800';
    } else {
      statusBadgeClass = 'border-red-200 bg-red-50 text-red-700';
    }
  }

  let parsedReqJson: unknown = null;
  try {
    parsedReqJson = JSON.parse(trace.requestBodyRaw);
  } catch {
    parsedReqJson = null;
  }

  let parsedRespJson: unknown = null;
  if (!trace.fetchError && !isHtmlBody(trace.responseBodyRaw)) {
    const trimmed = (trace.responseBodyRaw || '').trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        parsedRespJson = tryParse(trimmed);
      } catch {
        parsedRespJson = null;
      }
    }
  }

  const contentType =
    trace.responseHeaders['content-type'] ||
    trace.responseHeaders['Content-Type'] ||
    (trace.fetchError ? 'Indisponível (erro de transporte)' : 'Não exposto via CORS');

  const reqHeadersText = Object.entries(trace.requestHeaders || {})
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const respHeadersText = Object.keys(trace.responseHeaders || {}).length
    ? Object.entries(trace.responseHeaders)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    : '(Nenhum header adicional exposto via CORS pelo servidor)';

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100/70 transition-colors cursor-pointer"
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
          )}
          <span className="font-mono text-xs font-bold text-slate-500">#{index + 1}</span>
          <span className="font-mono text-xs font-bold text-[#004b93]">{trace.neuron}</span>
          <span className="text-xs font-medium text-slate-700">· {trace.etapa}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] font-semibold ${statusBadgeClass}`}
          >
            {statusLabel}
          </span>
          <span className="font-mono text-xs text-slate-600 tabular-nums">
            {trace.durationMs} ms
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 p-4 space-y-4">
          {/* Diagnostic reading */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">
                Diagnóstico técnico ({interp.tipo})
              </span>
              <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                {new Date(trace.timestampIso).toLocaleString('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'medium',
                })}
              </span>
            </div>
            <p className="text-slate-700 leading-relaxed">{interp.msg}</p>
            {trace.fetchError && (
              <p className="font-mono text-red-700 break-all">
                Erro original de transporte: {trace.fetchError}
              </p>
            )}
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-md border border-slate-200 p-2.5">
              <div className="text-[11px] text-slate-500">Status HTTP</div>
              <div className="mt-0.5 font-mono font-semibold text-slate-900">{statusLabel}</div>
            </div>
            <div className="rounded-md border border-slate-200 p-2.5">
              <div className="text-[11px] text-slate-500">Content-Type</div>
              <div className="mt-0.5 font-mono font-medium text-slate-800 truncate" title={contentType}>
                {contentType}
              </div>
            </div>
            <div className="rounded-md border border-slate-200 p-2.5">
              <div className="text-[11px] text-slate-500">Duração / Timeout</div>
              <div className="mt-0.5 font-mono font-medium text-slate-800 tabular-nums">
                {trace.durationMs} ms · limite {trace.timeoutSec}s
              </div>
            </div>
          </div>

          {/* Endpoint URL */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-700">Endpoint utilizado</span>
              <button
                type="button"
                onClick={() => onCopy(trace.url, 'Endpoint')}
                className="text-[11px] font-medium text-[#004b93] hover:underline cursor-pointer"
              >
                Copiar URL
              </button>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 font-mono text-xs text-slate-700 break-all">
              POST {trace.url}
            </div>
          </div>

          {/* Original Request */}
          <JsonCodeBlock
            label="Solicitação original (request cru enviado)"
            value={parsedReqJson ?? trace.requestBodyRaw}
            rawText={trace.requestBodyRaw}
            onCopy={onCopy}
            extraAction={
              <button
                type="button"
                onClick={() => onCopy(buildCurlCommand(trace), 'Comando cURL')}
                className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                <Terminal className="h-3 w-3" />
                Copiar cURL
              </button>
            }
          />

          {/* Original Response */}
          <JsonCodeBlock
            label="Resposta original (response cru recebido)"
            value={trace.responseBodyRaw}
            rawText={
              trace.fetchError
                ? `[ERRO DE TRANSPORTE] ${trace.fetchError}`
                : trace.responseBodyRaw || '(vazio)'
            }
            onCopy={onCopy}
          />

          {/* Interpreted JSON if valid JSON */}
          {parsedRespJson !== null && (
            <JsonCodeBlock
              label="Resposta interpretada (JSON formatado)"
              value={parsedRespJson}
              onCopy={(text, lbl) =>
                onCopy(JSON.stringify(parsedRespJson, null, 2), lbl)
              }
            />
          )}

          {/* Headers Sent & Received */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <JsonCodeBlock
              label="Headers enviados"
              value={reqHeadersText}
              rawText={reqHeadersText}
              maxHeightClass="max-h-36"
              onCopy={onCopy}
            />
            <JsonCodeBlock
              label="Headers recebidos (visíveis via CORS)"
              value={respHeadersText}
              rawText={respHeadersText}
              maxHeightClass="max-h-36"
              onCopy={onCopy}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function OperationDetailsDrawer({
  open,
  execution,
  historyFallback,
  onClose,
  onCopy,
  onOpenBoleto,
  onDownloadBoleto,
}: OperationDetailsDrawerProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');

  if (!open) return null;

  const exec = execution;
  const fallback = historyFallback;

  const xPed = exec?.xPed || exec?.result?.xPed || fallback?.xPed || '--';
  const status = exec?.result?.status || fallback?.status || 'erro';
  const correlationId = exec ? extractCorrelationId(exec) : fallback?.id || '--';
  const whenStart = exec?.startedAt
    ? new Date(exec.startedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
    : fallback?.when
      ? new Date(fallback.when).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
      : '--';
  const whenEnd = exec?.finishedAt
    ? new Date(exec.finishedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
    : '--';
  const durationDisplay = formatDurationMs(exec?.durationMs ?? fallback?.durationMs);
  const valorDisplay =
    exec?.result?.vTotDisplay && exec.result.vTotDisplay !== '--'
      ? exec.result.vTotDisplay
      : exec && Number.isFinite(exec.valorEnviado)
        ? formatCurrencyBR(exec.valorEnviado)
        : fallback?.valorDisplay || '--';
  const docDisplay = exec?.docDigits
    ? formatCpfCnpj(exec.docDigits)
    : exec?.result?.cliente || fallback?.clienteMasked || '--';
  const docMasked = exec?.docDigits
    ? maskCpfCnpj(exec.docDigits)
    : fallback?.clienteMasked || maskCpfCnpj(exec?.result?.cliente);
  const vencDisplay = exec?.vencYmd
    ? formatDateBR(exec.vencYmd)
    : fallback?.vencYmd
      ? formatDateBR(fallback.vencYmd)
      : '--';

  const boletoLink = exec?.result?.boletoLink || fallback?.boletoLink || null;
  const tituloData = exec?.result?.tituloData || null;

  const handleExportJson = () => {
    const payload = exec || fallback;
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `execucao-${xPed.replace(/[^A-Za-z0-9_\-.]/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Detalhes da operação">
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl border-l border-slate-200">
        {/* Drawer Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display text-lg font-bold text-slate-900 truncate">
                Detalhes da Operação
              </h2>
              <OperationStatusTag status={status} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
              <span>{xPed}</span>
              <span aria-hidden="true">·</span>
              <span>{docMasked}</span>
              <span aria-hidden="true">·</span>
              <span>{valorDisplay}</span>
              <span aria-hidden="true">·</span>
              <span>{durationDisplay}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {exec && (
              <>
                <button
                  type="button"
                  onClick={() => onCopy(formatLogText(exec), 'Log técnico')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar log
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Exportar JSON
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar detalhes"
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-6 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'overview'
                ? 'border-[#004b93] text-[#004b93]'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <ListChecks className="h-3.5 w-3.5" />
            Etapas, Timeline e Diagnóstico
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('calls')}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'calls'
                ? 'border-[#004b93] text-[#004b93]'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Network className="h-3.5 w-3.5" />
            Comunicação ERP ({exec?.calls?.length ?? 0})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('raw')}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'raw'
                ? 'border-[#004b93] text-[#004b93]'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileJson className="h-3.5 w-3.5" />
            JSON e Log Completo
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!exec && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
              Este registro foi salvo antes da atualização de auditoria completa. Apenas os metadados básicos do histórico estão disponíveis para esta execução antiga.
            </div>
          )}

          {activeTab === 'overview' && (
            <>
              {/* Metadata Grid */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900">Dados da Operação</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4 text-xs">
                  <div>
                    <div className="text-[11px] text-slate-500">Número do pedido (xPed)</div>
                    <div className="mt-0.5 font-mono font-semibold text-slate-900">{xPed}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">CPF/CNPJ do cliente</div>
                    <div className="mt-0.5 font-mono font-semibold text-slate-900">{docDisplay}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Valor</div>
                    <div className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                      {valorDisplay}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Vencimento</div>
                    <div className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                      {vencDisplay}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Início</div>
                    <div className="mt-0.5 font-mono text-slate-700 tabular-nums">{whenStart}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Término</div>
                    <div className="mt-0.5 font-mono text-slate-700 tabular-nums">{whenEnd}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Tempo de execução</div>
                    <div className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                      {durationDisplay}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Correlation / Exec ID</div>
                    <div className="mt-0.5 font-mono text-slate-700 truncate" title={correlationId}>
                      {correlationId}
                    </div>
                  </div>
                </div>
              </section>

              {/* Result Message & Boleto */}
              {exec?.result && (
                <section className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">Diagnóstico e Mensagem Original</h3>
                  <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs space-y-2">
                    <div className="font-semibold text-slate-900">{exec.result.title}</div>
                    <div className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {exec.result.message}
                    </div>
                    {exec.result.warnings && exec.result.warnings.length > 0 && (
                      <div className="pt-2 border-t border-slate-100">
                        <div className="font-semibold text-amber-800 mb-1">Alertas identificados:</div>
                        <ul className="list-disc pl-4 space-y-1 text-amber-900">
                          {exec.result.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {boletoLink && (
                      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenBoleto(boletoLink)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#004b93] bg-white px-3 py-1.5 text-xs font-semibold text-[#004b93] hover:bg-sky-50 cursor-pointer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Abrir boleto
                        </button>
                        <button
                          type="button"
                          onClick={() => onDownloadBoleto(boletoLink, xPed)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Baixar PDF
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Execution Steps */}
              {exec && (
                <section className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">Etapas da Execução</h3>
                  <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white">
                    {exec.steps.map((s, idx) => (
                      <div key={idx} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-900">{s.label}</div>
                          <div className="mt-0.5 text-xs text-slate-600 break-words">{s.msg}</div>
                        </div>
                        <StepStatusTag state={s.state} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Chronological Timeline */}
              {exec && exec.calls.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">Timeline Cronológica (Chamadas ao ERP)</h3>
                  <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                    {exec.calls.map((c, idx) => (
                      <div key={idx} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono text-slate-400 tabular-nums">
                            {new Date(c.timestampIso).toLocaleTimeString('pt-BR')}
                          </span>
                          <span className="font-mono font-semibold text-[#004b93]">{c.neuron}</span>
                          <span className="text-slate-700 truncate">{c.etapa}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                          <span
                            className={
                              c.interpretacao.tipo === 'ok'
                                ? 'text-emerald-700 font-semibold'
                                : c.interpretacao.tipo === 'negocio'
                                  ? 'text-amber-700 font-semibold'
                                  : 'text-red-700 font-semibold'
                            }
                          >
                            {c.fetchError
                              ? c.isTimeout
                                ? 'TIMEOUT'
                                : 'ERRO_REDE'
                              : `HTTP ${c.httpStatus}`}
                          </span>
                          <span className="text-slate-500">{c.durationMs} ms</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ws.Titulo returned fields table */}
              {tituloData && Object.keys(tituloData).length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    Campos do Título (ws.Titulo)
                  </h3>
                  <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <tbody className="divide-y divide-slate-100">
                        {Object.entries(tituloData).map(([k, v]) => {
                          const strVal =
                            typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');
                          return (
                            <tr key={k}>
                              <th className="w-1/3 bg-slate-50 px-3 py-2 font-mono font-medium text-slate-600 align-top">
                                {k}
                              </th>
                              <td className="px-3 py-2 font-mono text-slate-900 break-all">
                                {strVal}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}

          {activeTab === 'calls' && (
            <div className="space-y-4">
              {exec && exec.calls.length > 0 ? (
                exec.calls.map((trace, idx) => (
                  <CallTraceAccordion
                    key={idx}
                    trace={trace}
                    index={idx}
                    defaultExpanded={idx === 0 || trace.interpretacao.tipo !== 'ok'}
                    onCopy={onCopy}
                  />
                ))
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
                  Nenhuma chamada HTTP foi registrada para esta operação.
                </div>
              )}
            </div>
          )}

          {activeTab === 'raw' && exec && (
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <FileCode2 className="h-4 w-4 text-[#004b93]" />
                    Log Técnico Consolidado
                  </span>
                </div>
                <JsonCodeBlock
                  label="Log completo (texto)"
                  value={formatLogText(exec)}
                  rawText={formatLogText(exec)}
                  maxHeightClass="max-h-72"
                  onCopy={onCopy}
                />
              </div>

              <div className="space-y-2">
                <JsonCodeBlock
                  label="Objeto completo da execução (JSON)"
                  value={exec}
                  maxHeightClass="max-h-96"
                  onCopy={(txt, lbl) => onCopy(JSON.stringify(exec, null, 2), lbl)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
