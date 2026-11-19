import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, Loader2, Square } from 'lucide-react';
import type { CompyConfig, ToastItem } from '@/src/types/compy';
import {
  BULK_MAX_ITEMS,
  buildBulkLogJson,
  parseBulkInput,
  runBulkCorrecao,
  type BulkFlowId,
  type BulkItemResult,
  type BulkLogEntry,
} from '@/src/lib/bulkCorrecao';
import { triggerBlobDownload } from '@/src/lib/compy';
import { OperationStatusTag } from '@/src/components/StatusPill';

export type BulkMode = 'bulk_valor' | 'bulk_cnpj';

const FLOW_BY_MODE: Record<BulkMode, BulkFlowId> = {
  bulk_valor: 'correcao:valor',
  bulk_cnpj: 'correcao:cliente',
};

const COPY: Record<
  BulkMode,
  { title: string; description: string; placeholder: string; confirmLabel: string; helper: string }
> = {
  bulk_valor: {
    title: 'Alteração de valores em massa',
    description:
      'Para cada pedido: consulta o pedido (ws.Pedido), monta a retificação com o novo valor e grava (ws.SavePedido).',
    placeholder: '1011673416;150,00\n1011632133;1.234,56',
    confirmLabel: 'Confirmo a alteração de valor dos pedidos listados no Compy.',
    helper: 'Formato por linha: xPed;valor (ex.: 1011673416;150,00). Somente pedidos com 1 item e quantidade 1.',
  },
  bulk_cnpj: {
    title: 'Alteração de CNPJ em massa',
    description:
      'Para cada pedido: grava o novo CNPJ de faturamento diretamente no pedido (ws.SavePedido).',
    placeholder: '1011632133;05.054.960/0001-58',
    confirmLabel: 'Confirmo a alteração de CNPJ de faturamento dos pedidos listados no Compy.',
    helper: 'Formato por linha: xPed;CNPJ (ex.: 1011632133;05054960000158). Somente CNPJ válido.',
  },
};

interface BulkCorrectionPageProps {
  mode: BulkMode;
  config: CompyConfig;
  onNotify: (message: string, variant?: ToastItem['variant']) => void;
}

export function BulkCorrectionPage({ mode, config, onNotify }: BulkCorrectionPageProps) {
  const flow = FLOW_BY_MODE[mode];
  const copy = COPY[mode];
  const host = (() => {
    try {
      return new URL(config.endpoint).host;
    } catch {
      return config.endpoint;
    }
  })();

  const [text, setText] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<BulkItemResult[]>([]);
  const [entries, setEntries] = useState<BulkLogEntry[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [interrompido, setInterrompido] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const parsed = useMemo(() => parseBulkInput(text, flow), [text, flow]);
  const hasInput = text.trim() !== '';
  const canRun = !running && parsed.errors.length === 0 && parsed.items.length > 0 && confirmado;

  const handleRun = async () => {
    if (!canRun) return;
    const controller = new AbortController();
    abortRef.current = controller;

    setRunning(true);
    setResults([]);
    setEntries([]);
    setBatchId(null);
    setInterrompido(false);
    setProgress({ done: 0, total: parsed.items.length });

    try {
      const out = await runBulkCorrecao({
        flow,
        items: parsed.items,
        config,
        signal: controller.signal,
        onProgress: (done, total, result) => {
          setProgress({ done, total });
          setResults((prev) => [...prev, result]);
        },
      });
      setEntries(out.entries);
      setBatchId(out.batchId);
      setInterrompido(out.interrompido);

      const ok = out.results.filter((r) => r.status === 'sucesso').length;
      onNotify(
        `Lote concluído: ${ok} de ${out.results.length} pedido(s) alterado(s).`,
        ok === out.results.length && !out.interrompido ? 'success' : 'warning'
      );
    } catch {
      onNotify('Falha inesperada na execução do lote.', 'danger');
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleDownloadLog = () => {
    if (!batchId || entries.length === 0) return;
    const json = buildBulkLogJson(entries);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    triggerBlobDownload(blob, `disparos-${flow.replace(':', '_')}-${batchId}.json`);
  };

  const okCount = results.filter((r) => r.status === 'sucesso').length;
  const errCount = results.filter((r) => r.status === 'erro').length;

  return (
    <div className="space-y-6">
      {/* CORS Notice (mesmo padrão das demais telas) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-900">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span>
            Chamadas diretas do navegador para o Compy (<strong className="font-mono">{host}</strong>). Necessário estar na rede corporativa com extensão de CORS habilitada.
          </span>
        </div>
      </div>

      {/* Form card */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50/60 px-6 py-4">
          <h2 className="font-display text-base font-bold text-slate-900">{copy.title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{copy.description}</p>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label htmlFor="bulk-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Pedidos <span className="text-red-600">*</span>
            </label>
            <textarea
              id="bulk-input"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setConfirmado(false);
              }}
              disabled={running}
              rows={8}
              spellCheck={false}
              placeholder={copy.placeholder}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#004b93] focus:outline-none focus:ring-2 focus:ring-[#004b93]/20 disabled:bg-slate-50"
            />
            <p className="mt-1 text-xs text-slate-500">
              {copy.helper} Limite de {BULK_MAX_ITEMS} linhas por lote.
            </p>
          </div>

          {hasInput && parsed.errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-800 space-y-1">
              {parsed.errors.map((err, i) => (
                <div key={i}>{err}</div>
              ))}
            </div>
          )}

          {hasInput && parsed.errors.length === 0 && parsed.items.length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800">
              {parsed.items.length} pedido(s) pronto(s) para execução.
            </div>
          )}

          <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmado}
              onChange={(e) => setConfirmado(e.target.checked)}
              disabled={running || parsed.items.length === 0 || parsed.errors.length > 0}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#004b93] focus:ring-[#004b93]"
            />
            <span>
              {copy.confirmLabel} {parsed.items.length > 0 && <strong>({parsed.items.length})</strong>}
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleRun}
              disabled={!canRun}
              className="inline-flex items-center gap-2 rounded-lg bg-[#004b93] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#003366] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {running && <Loader2 className="h-4 w-4 animate-spin" />}
              {running ? 'Executando lote...' : 'Executar em lote'}
            </button>

            {running && (
              <button
                type="button"
                onClick={handleStop}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <Square className="h-3.5 w-3.5" />
                Parar
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Results card */}
      {(running || results.length > 0) && (
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/60 px-6 py-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">Resultado do lote</h2>
              <p className="mt-0.5 text-xs text-slate-500 font-mono tabular-nums">
                {progress.done}/{progress.total} processado(s) · {okCount} sucesso · {errCount} erro
                {interrompido && ' · interrompido'}
              </p>
            </div>
            {!running && batchId && entries.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadLog}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 text-[#004b93]" />
                Baixar log (JSON)
              </button>
            )}
          </div>

          <div className="h-1 w-full bg-slate-100">
            <div
              className="h-1 bg-[#004b93] transition-all"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">#</th>
                  <th className="px-4 py-2.5 font-semibold">xPed</th>
                  <th className="px-4 py-2.5 font-semibold">Situação</th>
                  <th className="px-4 py-2.5 font-semibold">Detalhe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((r) => (
                  <tr key={`${r.itemIndex}-${r.xPed}`}>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{r.itemIndex}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-900">{r.xPed}</td>
                    <td className="px-4 py-2.5">
                      <OperationStatusTag status={r.status} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
