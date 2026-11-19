import {
  Activity,
  Copy,
  Download,
  Eye,
  FileCode2,
  Loader2,
  PlugZap,
  RefreshCw,
  Server,
} from 'lucide-react';
import type {
  BackendHealthState,
  CompyConfig,
  CompyConnectionState,
  ExecutionRecord,
  HistoryEntry,
} from '@/src/types/compy';
import {
  extractConfigHost,
  formatDurationMs,
  formatLogText,
} from '@/src/lib/compy';
import { JsonCodeBlock } from '@/src/components/JsonCodeBlock';
import { OperationStatusTag } from '@/src/components/StatusPill';

interface DiagnosticsPageProps {
  config: CompyConfig;
  backendHealth: BackendHealthState;
  connectionState: CompyConnectionState;
  currentExecution: ExecutionRecord | null;
  history: HistoryEntry[];
  onCheckBackendHealth: () => void;
  onTestConnection: () => void;
  onDownloadHtml: () => void;
  onOpenDetails: (exec: ExecutionRecord | null, fallback?: HistoryEntry) => void;
  onCopy: (text: string, label: string) => void;
}

export function DiagnosticsPage({
  config,
  backendHealth,
  connectionState,
  currentExecution,
  history,
  onCheckBackendHealth,
  onTestConnection,
  onDownloadHtml,
  onOpenDetails,
  onCopy,
}: DiagnosticsPageProps) {
  const host = extractConfigHost(config);

  const latestExec =
    currentExecution ||
    history.find((h) => Boolean(h.execution))?.execution ||
    null;

  const handleExportJson = (exec: ExecutionRecord) => {
    const blob = new Blob([JSON.stringify(exec, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `execucao-${(exec.xPed || 'safetitulo').replace(/[^A-Za-z0-9_\-.]/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Top Diagnostic Cards: Backend + Compy Test + Standalone Download */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Backend Health */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-[#004b93]" />
              <h2 className="font-display text-sm font-bold text-slate-900">
                Saúde do Servidor (/api/health)
              </h2>
            </div>
            <button
              type="button"
              onClick={onCheckBackendHealth}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Verificar
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Status</span>
              <span className="font-mono font-semibold text-slate-900">
                {backendHealth.status.toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Serviço</span>
              <span className="font-mono text-slate-800">{backendHealth.service || '--'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Transporte ERP</span>
              <span className="font-mono text-slate-800">
                {backendHealth.erpTransport || 'navegador-direto (CORS)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Última checagem</span>
              <span className="font-mono text-slate-600 tabular-nums">
                {backendHealth.checkedAt
                  ? new Date(backendHealth.checkedAt).toLocaleTimeString('pt-BR')
                  : '--'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              Exportação offline da página
            </span>
            <button
              type="button"
              onClick={onDownloadHtml}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-[#004b93]" />
              Baixar HTML
            </button>
          </div>
        </div>

        {/* Compy CORS Probe */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#004b93]" />
              <h2 className="font-display text-sm font-bold text-slate-900">
                Diagnóstico de Rede / CORS com Compy
              </h2>
            </div>
            <button
              type="button"
              onClick={onTestConnection}
              disabled={connectionState.status === 'testing'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#004b93] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#003366] disabled:opacity-60 cursor-pointer"
            >
              {connectionState.status === 'testing' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlugZap className="h-3.5 w-3.5" />
              )}
              {connectionState.status === 'testing' ? 'Testando...' : 'Testar conexão'}
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 text-xs space-y-1.5">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 shrink-0">Endpoint alvo</span>
              <span className="font-mono text-slate-900 truncate" title={config.endpoint}>
                {host}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 shrink-0">Resultado</span>
              <span
                className={`font-semibold text-right ${
                  connectionState.status === 'ok'
                    ? 'text-emerald-700'
                    : connectionState.status === 'error' || connectionState.status === 'cors_error'
                      ? 'text-red-700'
                      : 'text-slate-700'
                }`}
              >
                {connectionState.message}
              </span>
            </div>
            {connectionState.lastTrace && (
              <>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500 shrink-0">Status HTTP / Latência</span>
                  <span className="font-mono text-slate-800 tabular-nums">
                    {connectionState.lastTrace.fetchError
                      ? 'Erro de transporte'
                      : `HTTP ${connectionState.lastTrace.httpStatus}`}{' '}
                    · {connectionState.lastTrace.durationMs} ms
                  </span>
                </div>
              </>
            )}
          </div>

          {connectionState.lastTrace && (
            <JsonCodeBlock
              label="Última resposta do teste (ws.Pedido xPed=0)"
              value={connectionState.lastTrace.responseBodyRaw}
              rawText={
                connectionState.lastTrace.fetchError
                  ? `[ERRO DE TRANSPORTE] ${connectionState.lastTrace.fetchError}`
                  : connectionState.lastTrace.responseBodyRaw || '(vazio)'
              }
              maxHeightClass="max-h-36"
              onCopy={onCopy}
            />
          )}
        </div>
      </div>

      {/* Latest Execution Full Technical Log Inspector */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <FileCode2 className="h-4 w-4 text-[#004b93]" />
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900">
                Log Técnico da Última Execução
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {latestExec
                  ? `${latestExec.xPed || '--'} · ${latestExec.calls.length} chamadas · ${formatDurationMs(latestExec.durationMs)}`
                  : 'Nenhuma execução completa disponível nesta sessão ainda.'}
              </p>
            </div>
          </div>

          {latestExec && (
            <div className="flex flex-wrap items-center gap-2">
              {latestExec.result && <OperationStatusTag status={latestExec.result.status} />}
              <button
                type="button"
                onClick={() => onCopy(formatLogText(latestExec), 'Log completo')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar log
              </button>
              <button
                type="button"
                onClick={() => handleExportJson(latestExec)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar JSON
              </button>
              <button
                type="button"
                onClick={() => onOpenDetails(latestExec)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#004b93] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#003366] cursor-pointer"
              >
                <Eye className="h-3.5 w-3.5" />
                Ver detalhes completos
              </button>
            </div>
          )}
        </div>

        <div className="p-5">
          {latestExec ? (
            <JsonCodeBlock
              label={`Log consolidado — ${latestExec.xPed || latestExec.id}`}
              value={formatLogText(latestExec)}
              rawText={formatLogText(latestExec)}
              maxHeightClass="max-h-96"
              onCopy={onCopy}
            />
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-xs text-slate-500">
              Execute uma geração de boleto ou consulta de título para visualizar o log técnico consolidado aqui, ou abra qualquer registro no Histórico de operações.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
