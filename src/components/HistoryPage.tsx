import { useMemo, useState } from 'react';
import { Eye, FileText, Search, Trash2 } from 'lucide-react';
import type { ExecutionRecord, HistoryEntry, OperationStatus } from '@/src/types/compy';
import { formatDurationMs, maskCpfCnpj } from '@/src/lib/compy';
import { OperationStatusTag } from '@/src/components/StatusPill';

interface HistoryPageProps {
  history: HistoryEntry[];
  onClearHistory: () => void;
  onOpenDetails: (exec: ExecutionRecord | null, fallback: HistoryEntry) => void;
  onOpenBoleto: (link: string) => void;
  onSelectXPed: (xPed: string) => void;
}

export function HistoryPage({
  history,
  onClearHistory,
  onOpenDetails,
  onOpenBoleto,
  onSelectXPed,
}: HistoryPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OperationStatus>('all');
  const [modeFilter, setModeFilter] = useState<'all' | 'criar_e_buscar' | 'so_consultar_titulo'>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return history.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (modeFilter !== 'all') {
        if (item.mode !== modeFilter) return false;
      }
      if (q) {
        const matchXPed = (item.xPed || '').toLowerCase().includes(q);
        const matchDoc = (item.docDigits || '').includes(q) || (item.clienteMasked || '').toLowerCase().includes(q);
        if (!matchXPed && !matchDoc) return false;
      }
      return true;
    });
  }, [history, searchTerm, statusFilter, modeFilter]);

  return (
    <div className="space-y-4">
      {/* Filter Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por xPed ou CPF/CNPJ..."
              className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:border-[#004b93] focus:outline-none focus:ring-2 focus:ring-[#004b93]/20"
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: 'sucesso', label: 'Sucesso' },
                { id: 'parcial', label: 'Parcial' },
                { id: 'erro', label: 'Erro' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filtrar por tipo de operação"
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value as typeof modeFilter)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-[#004b93] focus:outline-none"
          >
            <option value="all">Todos os tipos</option>
            <option value="criar_e_buscar">Gerar boleto</option>
            <option value="so_consultar_titulo">Consultar título</option>
          </select>
        </div>

        {/* Clear History with inline confirmation (no window.confirm) */}
        <div className="flex items-center gap-2 shrink-0">
          {history.length > 0 && !confirmClear && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpar histórico
            </button>
          )}
          {confirmClear && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1">
              <span className="text-xs font-medium text-red-800">Confirmar limpeza?</span>
              <button
                type="button"
                onClick={() => {
                  onClearHistory();
                  setConfirmClear(false);
                }}
                className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700 cursor-pointer"
              >
                Sim, limpar
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Operations Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="font-display text-sm font-bold text-slate-900">
            Histórico de Operações ({filtered.length}
            {filtered.length !== history.length ? ` de ${history.length}` : ''})
          </h2>
          <span className="text-xs text-slate-500">Últimas 50 operações no navegador</span>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            {history.length === 0
              ? 'Nenhuma execução registrada ainda.'
              : 'Nenhuma operação corresponde aos filtros selecionados.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 pl-5 pr-3 whitespace-nowrap">Data e hora</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Número do pedido</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Documento mascarado</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Tipo de operação</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Valor</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Status</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Duração</th>
                  <th className="py-2.5 pl-3 pr-5 text-right whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item, idx) => {
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
                        : 'Operação';

                  return (
                    <tr
                      key={item.id || `${item.xPed}-${idx}`}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="py-2.5 pl-5 pr-3 font-mono text-slate-600 whitespace-nowrap tabular-nums">
                        {whenStr}
                      </td>
                      <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onSelectXPed(item.xPed)}
                          title="Clique para preencher este xPed no formulário"
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
                        <div className="inline-flex items-center gap-1.5">
                          {item.boletoLink && (
                            <button
                              type="button"
                              onClick={() => onOpenBoleto(item.boletoLink!)}
                              title="Abrir boleto"
                              className="inline-flex items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 p-1 text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenDetails(item.execution || null, item)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-[#004b93] hover:text-[#004b93] transition-colors cursor-pointer"
                          >
                            <Eye className="h-3 w-3" />
                            Ver detalhes
                          </button>
                        </div>
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
