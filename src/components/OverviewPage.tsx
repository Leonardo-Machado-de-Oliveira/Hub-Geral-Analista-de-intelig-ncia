import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eye,
  FilePlus2,
  History as HistoryIcon,
  Loader2,
  PlugZap,
  RefreshCw,
  Search,
  Server,
  Settings,
  XCircle,
} from 'lucide-react';
import type {
  BackendHealthState,
  CompyConfig,
  CompyConnectionState,
  ExecutionRecord,
  HistoryEntry,
  NavSection,
} from '@/src/types/compy';
import { extractConfigHost, formatDurationMs, maskCpfCnpj } from '@/src/lib/compy';
import { OperationStatusTag } from '@/src/components/StatusPill';

interface OverviewPageProps {
  history: HistoryEntry[];
  config: CompyConfig;
  backendHealth: BackendHealthState;
  connectionState: CompyConnectionState;
  onNavigate: (section: NavSection) => void;
  onCheckBackendHealth: () => void;
  onTestConnection: () => void;
  onOpenConfig: () => void;
  onOpenDetails: (exec: ExecutionRecord | null, fallback?: HistoryEntry) => void;
  onSelectXPed: (xPed: string) => void;
}

export function OverviewPage({
  history,
  config,
  backendHealth,
  connectionState,
  onNavigate,
  onCheckBackendHealth,
  onTestConnection,
  onOpenConfig,
  onOpenDetails,
  onSelectXPed,
}: OverviewPageProps) {
  const totalOps = history.length;
  const successOps = history.filter((h) => h.status === 'sucesso').length;
  const errorOps = history.filter((h) => h.status === 'erro').length;
  const partialOps = history.filter((h) => h.status === 'parcial').length;

  const recentOps = history.slice(0, 6);
  const host = extractConfigHost(config);

  return (
    <div className="space-y-6">
      {/* Corporate Welcome & Quick Actions Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6">
        <div className="space-y-1 max-w-2xl">
          <h2 className="font-display text-xl font-bold text-slate-900">
            Central de Emissão e Consulta de Títulos
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Integração direta via navegador (CORS) com o ERP Compy da Safeweb. Gere pedidos e acompanhe títulos financeiros com rastreabilidade completa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('query')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Search className="h-4 w-4 text-slate-600" />
            Consultar título
          </button>
          <button
            type="button"
            onClick={() => onNavigate('generate')}
            className="inline-flex items-center gap-2 rounded-lg bg-[#004b93] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#003366] transition-colors whitespace-nowrap cursor-pointer"
          >
            <FilePlus2 className="h-4 w-4" />
            Gerar boleto
          </button>
        </div>
      </div>

      {/* Real KPI Cards (derived strictly from localStorage history) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total de operações</span>
            <HistoryIcon className="h-4 w-4 text-[#004b93]" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {totalOps}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Registros salvos neste navegador (máx. 50)
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Operações concluídas</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-emerald-700 tabular-nums">
            {successOps}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Finalizadas com retorno esperado
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Operações com erro</span>
            <XCircle className="h-4 w-4 text-red-600" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-red-700 tabular-nums">
            {errorOps}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Falhas de validação, negócio ou transporte
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Operações parciais / alertas</span>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-amber-700 tabular-nums">
            {partialOps}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Pedido criado aguardando título ou divergência
          </div>
        </div>
      </div>

      {/* Status Cards: Backend + ERP Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Backend & Compy Connection Status */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-[#004b93]" />
              <h3 className="font-display text-sm font-bold text-slate-900">
                Status da Conexão (Backend e ERP)
              </h3>
            </div>
            <button
              type="button"
              onClick={onCheckBackendHealth}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#004b93] hover:underline cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />
              Atualizar
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
              <div>
                <div className="font-semibold text-slate-800">Servidor da Aplicação (/api/health)</div>
                <div className="text-slate-500 mt-0.5">
                  {backendHealth.erpTransport || 'Transporte ERP: navegador-direto (CORS)'}
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-semibold whitespace-nowrap ${
                  backendHealth.status === 'online'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : backendHealth.status === 'checking'
                      ? 'border-sky-200 bg-sky-50 text-[#004b93]'
                      : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {backendHealth.status === 'online'
                  ? 'Online'
                  : backendHealth.status === 'checking'
                    ? 'Verificando...'
                    : 'Indisponível'}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
              <div className="min-w-0">
                <div className="font-semibold text-slate-800">Conexão Direta ERP Compy (CORS)</div>
                <div className="text-slate-500 mt-0.5 truncate" title={connectionState.message}>
                  {connectionState.message}
                </div>
              </div>
              <button
                type="button"
                onClick={onTestConnection}
                disabled={connectionState.status === 'testing'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {connectionState.status === 'testing' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#004b93]" />
                ) : (
                  <PlugZap className="h-3.5 w-3.5 text-[#004b93]" />
                )}
                {connectionState.status === 'testing' ? 'Testando...' : 'Testar agora'}
              </button>
            </div>
          </div>
        </div>

        {/* ERP Configuration Summary */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-[#004b93]" />
              <h3 className="font-display text-sm font-bold text-slate-900">
                Configuração Ativa do ERP
              </h3>
            </div>
            <button
              type="button"
              onClick={onOpenConfig}
              className="text-xs font-semibold text-[#004b93] hover:underline cursor-pointer"
            >
              Editar configurações
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 sm:col-span-2">
              <div className="text-[11px] text-slate-500">Host / Endpoint</div>
              <div className="mt-0.5 font-mono font-semibold text-slate-900 truncate" title={config.endpoint}>
                {host}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
              <div className="text-[11px] text-slate-500">Domain · License</div>
              <div className="mt-0.5 font-mono font-semibold text-slate-900 truncate">
                {config.domain} · {config.license}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
              <div className="text-[11px] text-slate-500">Usuário (user)</div>
              <div className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                {config.user}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
              <div className="text-[11px] text-slate-500">Timeout / Intervalo</div>
              <div className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                {config.timeoutSec}s · {config.intervaloSec}s
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
              <div className="text-[11px] text-slate-500">Tentativas (Ped / Tit)</div>
              <div className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                {config.confTentativas}× · {config.titTentativas}×
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Operations Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="font-display text-sm font-bold text-slate-900">
              Últimas Operações Realizadas
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Resumo das execuções mais recentes registradas neste navegador
            </p>
          </div>
          {totalOps > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#004b93] hover:underline whitespace-nowrap cursor-pointer"
            >
              Ver histórico completo
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {recentOps.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="text-sm font-semibold text-slate-800">
              Nenhuma operação registrada ainda
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              As operações de geração de boleto e consulta de título realizadas nesta estação aparecerão aqui automaticamente.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => onNavigate('generate')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#004b93] px-4 py-2 text-xs font-semibold text-white hover:bg-[#003366] cursor-pointer"
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                Gerar primeiro boleto
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 pl-5 pr-3 whitespace-nowrap">Data e hora</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Número do pedido</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Documento</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Tipo</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Valor</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Status</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Duração</th>
                  <th className="py-2.5 pl-3 pr-5 text-right whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentOps.map((item, idx) => {
                  const whenStr = item.when
                    ? new Date(item.when).toLocaleString('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })
                    : '--';
                  const docMasked =
                    item.clienteMasked ||
                    (item.docDigits ? maskCpfCnpj(item.docDigits) : '--');
                  const modeLabel =
                    item.mode === 'so_consultar_titulo'
                      ? 'Consultar título'
                      : item.mode === 'criar_e_buscar'
                        ? 'Gerar boleto'
                        : item.mode === 'midia_avulsa'
                          ? `Mídia avulsa${item.produto ? ` · ${item.produto}` : ''}`
                          : 'Operação';

                  return (
                    <tr key={item.id || `${item.xPed}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 pl-5 pr-3 font-mono text-slate-600 whitespace-nowrap tabular-nums">
                        {whenStr}
                      </td>
                      <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onSelectXPed(item.xPed)}
                          title="Clique para usar este xPed no formulário"
                          className="font-semibold text-[#004b93] hover:underline cursor-pointer"
                        >
                          {item.xPed || '--'}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                        {docMasked}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                        {modeLabel}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-900 whitespace-nowrap tabular-nums">
                        {item.valorDisplay || '--'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <OperationStatusTag status={item.status} />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500 whitespace-nowrap tabular-nums">
                        {formatDurationMs(item.durationMs)}
                      </td>
                      <td className="py-2.5 pl-3 pr-5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onOpenDetails(item.execution || null, item)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-[#004b93] hover:text-[#004b93] transition-colors cursor-pointer"
                        >
                          <Eye className="h-3 w-3" />
                          Ver detalhes
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
