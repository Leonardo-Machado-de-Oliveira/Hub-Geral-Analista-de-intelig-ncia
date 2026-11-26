import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, RefreshCw, Send, Square } from 'lucide-react';
import type { CompyConfig, ExecutionRecord, FormInputs, ToastItem } from '@/src/types/compy';
import {
  extractConfigHost,
  formatCpfCnpj,
  formatCurrencyBR,
  formatDateBR,
  formatDateYMD,
  getTodayLocalMidnight,
  onlyDigits,
  parseValorBR,
  validateCpfCnpj,
} from '@/src/lib/compy';
import {
  MIDIA_PRODUTOS,
  buildMidiaSavePedidoPayload,
  calcularComposicao,
  encontrarProximoMidiaLivre,
  getMidiaProduto,
  loadMidiaParams,
  loadMidiaPrecos,
  saveMidiaParams,
  saveMidiaPrecos,
  saveUltimoMidia,
  validateMidiaPedido,
  type MidiaParams,
  type MidiaProdutoId,
} from '@/src/lib/midiaAvulsa';
import type { CreateFlowOverride } from '@/src/App';
import { ExecutionStepper } from '@/src/components/ExecutionStepper';
import { OperationResultSummary } from '@/src/components/OperationResultSummary';

interface MidiaAvulsaPageProps {
  config: CompyConfig;
  isRunning: boolean;
  currentExecution: ExecutionRecord | null;
  onSubmit: (override: CreateFlowOverride) => void;
  onStopExecution: () => void;
  onOpenDetails: (exec: ExecutionRecord) => void;
  onOpenBoleto: (link: string) => void;
  onDownloadBoleto: (link: string, xPed: string) => void;
  onNotify: (message: string, variant?: ToastItem['variant']) => void;
}

function vencimentoPadrao(): string {
  const d = getTodayLocalMidnight();
  d.setDate(d.getDate() + 2);
  return formatDateYMD(d);
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#004b93] focus:outline-none focus:ring-2 focus:ring-[#004b93]/20 disabled:bg-slate-50';

export function MidiaAvulsaPage({
  config,
  isRunning,
  currentExecution,
  onSubmit,
  onStopExecution,
  onOpenDetails,
  onOpenBoleto,
  onDownloadBoleto,
  onNotify,
}: MidiaAvulsaPageProps) {
  const host = extractConfigHost(config);

  // Numeração
  const [xPed, setXPed] = useState('');
  const [numero, setNumero] = useState<number | null>(null);
  const [buscandoNumero, setBuscandoNumero] = useState(false);
  const [numeroMsg, setNumeroMsg] = useState<string | null>(null);
  const numeroAbortRef = useRef<AbortController | null>(null);

  // Formulário
  const [clienteDoc, setClienteDoc] = useState('');
  const [produtoId, setProdutoId] = useState<MidiaProdutoId | ''>('');
  const [vencYmd, setVencYmd] = useState(vencimentoPadrao);
  const [errors, setErrors] = useState<string[]>([]);

  // Configurações opcionais
  const [showAvancado, setShowAvancado] = useState(false);
  const [precos, setPrecos] = useState(loadMidiaPrecos);
  const [precosRaw, setPrecosRaw] = useState<Record<string, string>>(() => {
    const p = loadMidiaPrecos();
    return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.toFixed(2).replace('.', ',')]));
  });
  const [params, setParams] = useState<MidiaParams>(loadMidiaParams);

  const docInfo = useMemo(() => validateCpfCnpj(clienteDoc), [clienteDoc]);
  const produto = getMidiaProduto(produtoId);
  const composicao = useMemo(() => (produto ? calcularComposicao(produto, precos) : null), [produto, precos]);

  const gerarNumero = useCallback(async () => {
    numeroAbortRef.current?.abort();
    const controller = new AbortController();
    numeroAbortRef.current = controller;
    setBuscandoNumero(true);
    setNumeroMsg(null);
    try {
      const res = await encontrarProximoMidiaLivre(config, controller.signal, (x) =>
        setNumeroMsg(`Verificando ${x} no Compy...`)
      );
      setXPed(res.xPed);
      setNumero(res.numero);
      setNumeroMsg(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== 'USER_ABORT') {
        setXPed('');
        setNumero(null);
        setNumeroMsg(msg);
        onNotify(`Não foi possível gerar o número do pedido: ${msg}`, 'danger');
      }
    } finally {
      if (numeroAbortRef.current === controller) {
        setBuscandoNumero(false);
        numeroAbortRef.current = null;
      }
    }
  }, [config, onNotify]);

  // Gera o número ao abrir a tela
  useEffect(() => {
    gerarNumero();
    return () => numeroAbortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePrecoChange = (cProd: number, raw: string) => {
    const key = String(cProd);
    const nextRaw = { ...precosRaw, [key]: raw };
    setPrecosRaw(nextRaw);
    const next = { ...precos };
    const n = parseValorBR(raw);
    if (raw.trim() && Number.isFinite(n) && n > 0) next[key] = Number(n.toFixed(2));
    else delete next[key];
    setPrecos(next);
    saveMidiaPrecos(next);
  };

  const handleParamChange = (key: keyof MidiaParams, value: string) => {
    const next = { ...params, [key]: value };
    setParams(next);
    saveMidiaParams(next);
  };

  const validar = () =>
    validateMidiaPedido({ xPed, docInfo, produto, composicao, vencYmd });

  const handleSubmit = () => {
    if (isRunning || buscandoNumero) return;
    const val = validar();
    setErrors(val.errors);
    if (!val.ok || !produto || !composicao || numero === null) return;

    const savePayload = buildMidiaSavePedidoPayload({ xPed, docInfo, composicao, vencYmd, params });
    const numeroUsado = numero;

    // FormInputs mínimo exigido pelo fluxo compartilhado (pré-checagem, conferência, título).
    const inp: FormInputs = {
      xPed,
      docInfo,
      valorRaw: composicao.total !== null ? String(composicao.total) : '',
      valorNum: composicao.total ?? NaN,
      vencYmd,
      cProd: composicao.itens[0].cProd,
      cProdRaw: String(composicao.itens[0].cProd),
      qCom: 1,
      qComRaw: '1',
      codigoObjetivo: params.codigoObjetivo,
      codigoClassificacao: '',
      codigoCobranca: params.codigoCobranca,
      faturar: false,
    };

    onSubmit({
      mode: 'midia_avulsa',
      inp,
      savePayload,
      valorEsperado: composicao.total,
      produto: produto.label,
      validate: validar,
      onPedidoGravado: () => {
        saveUltimoMidia(numeroUsado);
        setXPed('');
        setNumero(null);
        gerarNumero();
      },
    });
  };

  const canSubmit = !isRunning && !buscandoNumero && !!xPed;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-900">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span>
            Chamadas diretas do navegador para o Compy (<strong className="font-mono">{host}</strong>). Necessário estar na rede corporativa com extensão de CORS habilitada.
          </span>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50/60 px-6 py-4">
          <h2 className="font-display text-base font-bold text-slate-900">Venda avulsa de mídias</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Gera o pedido MIDIAAVULSA no Compy (ws.SavePedido), confere (ws.Pedido) e busca o boleto (ws.Titulo).
          </p>
        </div>

        <div className="p-6 space-y-5">
          {/* Número do pedido */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Número do pedido</label>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[220px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm font-semibold text-slate-900">
                {xPed || (buscandoNumero ? 'Gerando...' : '--')}
              </div>
              <button
                type="button"
                onClick={gerarNumero}
                disabled={isRunning || buscandoNumero}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {buscandoNumero ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#004b93]" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 text-[#004b93]" />
                )}
                Gerar número
              </button>
            </div>
            <p className={`mt-1 text-xs ${numeroMsg && !buscandoNumero ? 'text-red-700' : 'text-slate-500'}`}>
              {numeroMsg ?? 'Próximo número livre, verificado no Compy. A disponibilidade é checada de novo antes de gravar.'}
            </p>
          </div>

          {/* Cliente */}
          <div>
            <label htmlFor="midia-cliente" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Cliente (CPF/CNPJ) <span className="text-red-600">*</span>
            </label>
            <input
              id="midia-cliente"
              type="text"
              inputMode="numeric"
              value={clienteDoc}
              onChange={(e) => setClienteDoc(formatCpfCnpj(onlyDigits(e.target.value)))}
              disabled={isRunning}
              placeholder="00.000.000/0000-00"
              className={`${inputCls} font-mono`}
            />
            {clienteDoc && (
              <p className={`mt-1 text-xs ${docInfo.valid ? 'text-emerald-700' : 'text-red-700'}`}>
                {docInfo.valid
                  ? `${docInfo.type === 'cnpj' ? 'CNPJ' : 'CPF'} válido: ${formatCpfCnpj(docInfo.digits)}`
                  : docInfo.error}
              </p>
            )}
          </div>

          {/* Produto */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="midia-produto" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Produto <span className="text-red-600">*</span>
              </label>
              <select
                id="midia-produto"
                value={produtoId}
                onChange={(e) => setProdutoId(e.target.value as MidiaProdutoId | '')}
                disabled={isRunning}
                className={inputCls}
              >
                <option value="">Selecione...</option>
                {MIDIA_PRODUTOS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="midia-venc" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Vencimento do boleto <span className="text-red-600">*</span>
              </label>
              <input
                id="midia-venc"
                type="date"
                value={vencYmd}
                onChange={(e) => setVencYmd(e.target.value)}
                disabled={isRunning}
                className={`${inputCls} font-mono`}
              />
              <p className="mt-1 text-xs text-slate-500">
                {vencYmd ? `Enviado como ${formatDateBR(vencYmd)} · entre hoje e +10 dias` : 'Entre hoje e +10 dias'}
              </p>
            </div>
          </div>

          {/* Composição */}
          {composicao && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Item</th>
                    <th className="px-4 py-2.5 font-semibold">Código</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Qtd.</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Unitário</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {composicao.itens.map((i) => (
                    <tr key={i.cProd}>
                      <td className="px-4 py-2.5 text-slate-900">{i.nome}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{i.cProd}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">{i.qCom} UN</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">
                        {i.vUnCom !== null ? formatCurrencyBR(i.vUnCom) : 'Compy'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">
                        {i.vProd !== null ? formatCurrencyBR(i.vProd) : 'Compy'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/60 px-4 py-3">
                <span className="text-xs text-slate-500">
                  {composicao.precoPeloErp
                    ? 'Valor definido pela tabela de preços do Compy; aparece na conferência após a gravação.'
                    : 'Valor calculado pelos preços configurados e enviado ao Compy.'}
                </span>
                <span className="font-display text-lg font-bold text-[#004b93] tabular-nums">
                  {composicao.total !== null ? formatCurrencyBR(composicao.total) : 'Preço do Compy'}
                </span>
              </div>
            </div>
          )}

          {/* Configurações opcionais */}
          <div className="rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setShowAvancado((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Configurações (objetivo 18 · cobrança 1 · preços opcionais)
              {showAvancado ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showAvancado && (
              <div className="border-t border-slate-200 p-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-2">Preço unitário por item (R$)</p>
                  <p className="text-xs text-slate-500 mb-3">
                    Deixe em branco para o Compy aplicar a tabela de preços. Só preencha se a gravação via API vier sem valor. O preço só é enviado quando todos os itens do produto estão preenchidos.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {MIDIA_PRODUTOS.flatMap((p) => p.componentes).map((c) => (
                      <label key={c.cProd} className="flex items-center gap-2 text-xs text-slate-700">
                        <span className="w-44 shrink-0">
                          {c.nome} <span className="font-mono text-slate-400">({c.cProd})</span>
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={precosRaw[String(c.cProd)] ?? ''}
                          onChange={(e) => handlePrecoChange(c.cProd, e.target.value)}
                          disabled={isRunning}
                          placeholder="Compy"
                          className={`${inputCls} font-mono text-right`}
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-slate-700">
                    <span className="block font-semibold mb-1">codigoObjetivo</span>
                    <input
                      type="text"
                      value={params.codigoObjetivo}
                      onChange={(e) => handleParamChange('codigoObjetivo', e.target.value)}
                      disabled={isRunning}
                      placeholder="18 (Prestação de Serviço e-commerce)"
                      className={`${inputCls} font-mono`}
                    />
                  </label>
                  <label className="text-xs text-slate-700">
                    <span className="block font-semibold mb-1">codigoCobranca</span>
                    <input
                      type="text"
                      value={params.codigoCobranca}
                      onChange={(e) => handleParamChange('codigoCobranca', e.target.value)}
                      disabled={isRunning}
                      placeholder="1 (Boleto Safe2Pay)"
                      className={`${inputCls} font-mono`}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          {errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-800 space-y-1">
              {errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-lg bg-[#004b93] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#003366] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isRunning ? 'Gerando pedido e boleto...' : 'Gerar pedido e boleto'}
            </button>
            {isRunning && (
              <button
                type="button"
                onClick={onStopExecution}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <Square className="h-3.5 w-3.5" />
                Parar
              </button>
            )}
          </div>
        </div>
      </section>

      {currentExecution && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900">Acompanhamento da Execução</h3>
              <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                {currentExecution.xPed || '--'} · {currentExecution.produto ?? ''} · {currentExecution.calls.length}{' '}
                {currentExecution.calls.length === 1 ? 'chamada realizada' : 'chamadas realizadas'}
              </p>
            </div>
            {!currentExecution.result && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#004b93]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Processando etapas...
              </span>
            )}
          </div>
          <ExecutionStepper steps={currentExecution.steps} />
          {currentExecution.result && (
            <OperationResultSummary
              execution={currentExecution}
              onOpenDetails={onOpenDetails}
              onOpenBoleto={onOpenBoleto}
              onDownloadBoleto={onDownloadBoleto}
            />
          )}
        </section>
      )}
    </div>
  );
}
