import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BackendHealthState,
  CallTrace,
  CompyConfig,
  CompyConnectionState,
  ExecutionRecord,
  ExecutionResult,
  FormInputs,
  HistoryEntry,
  NavSection,
  OperationMode,
  StepState,
  ToastItem,
} from '@/src/types/compy';
import {
  STEP_LABELS,
  buildPedidoPayload,
  buildSavePedidoPayload,
  buildTituloPayload,
  callCompy,
  clearHistoryStorage,
  copyToClipboard,
  downloadBoletoPdf,
  downloadStandaloneHtml,
  extractPedidoDoc,
  findBoletoLink,
  formatCpfCnpj,
  formatCurrencyBR,
  formatDateYMD,
  getTodayLocalMidnight,
  isNenhumPedidoEncontrado,
  isNenhumTituloEncontrado,
  loadConfig,
  loadHistory,
  maskCpfCnpj,
  onlyDigits,
  openBoletoLink,
  parseNumericField,
  parseValorBR,
  saveConfig,
  saveHistoryEntry,
  sleep,
  validateCpfCnpj,
  validateFormForCreate,
  type FieldErrorMap,
} from '@/src/lib/compy';
import { Sidebar } from '@/src/components/Sidebar';
import { TopBar } from '@/src/components/TopBar';
import { OverviewPage } from '@/src/components/OverviewPage';
import { OrderOperationPage, type FormStateValues } from '@/src/components/OrderOperationPage';
import { BulkCorrectionPage } from '@/src/components/BulkCorrectionPage';
import { MidiaAvulsaPage } from '@/src/components/MidiaAvulsaPage';
import {
  SEQ_BOLETO_EXTERNA,
  encontrarProximoLivre,
  parseSequencia,
  saveUltimo,
} from '@/src/lib/sequencia';
import { HistoryPage } from '@/src/components/HistoryPage';
import { DiagnosticsPage } from '@/src/components/DiagnosticsPage';
import { OperationDetailsDrawer } from '@/src/components/OperationDetailsDrawer';
import { ConfigModal } from '@/src/components/ConfigModal';
import { PayloadModal } from '@/src/components/PayloadModal';
import { ToastContainer } from '@/src/components/ToastContainer';

/** Parâmetros para reaproveitar o fluxo de criação de pedido + título em outros módulos. */
export interface CreateFlowOverride {
  mode: OperationMode;
  inp: FormInputs;
  savePayload: Record<string, unknown>;
  /** Valor total esperado; null quando o preço é definido pelo Compy. */
  valorEsperado: number | null;
  produto?: string;
  validate: () => { ok: boolean; errors: string[] };
  /** Chamado quando o pedido foi gravado e conferido (para avançar a numeração). */
  onPedidoGravado?: () => void;
}

function getInitialVencYmd(): string {
  const d = getTodayLocalMidnight();
  d.setDate(d.getDate() + 3);
  return formatDateYMD(d);
}

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [config, setConfig] = useState<CompyConfig>(() => loadConfig());
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());

  const [formValues, setFormValues] = useState<FormStateValues>(() => ({
    xPed: '', // preenchido com o próximo BoletoExternaNN livre ao abrir "Gerar boleto"
    clienteDoc: '',
    valorRaw: '150,00',
    vencYmd: getInitialVencYmd(),
    cProdRaw: '5010124',
    qComRaw: '1',
    codigoObjetivo: 'C15',
    codigoClassificacao: '',
    codigoCobranca: '1',
    faturar: false,
  }));
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});

  const [isRunning, setIsRunning] = useState(false);
  const [currentExecution, setCurrentExecution] = useState<ExecutionRecord | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [backendHealth, setBackendHealth] = useState<BackendHealthState>({
    status: 'checking',
  });
  const [connectionState, setConnectionState] = useState<CompyConnectionState>({
    status: 'untested',
    message: 'Conexão não testada',
    lastTrace: null,
  });

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [payloadModalInputs, setPayloadModalInputs] = useState<FormInputs | null>(null);
  const [detailsState, setDetailsState] = useState<{
    open: boolean;
    execution: ExecutionRecord | null;
    fallback: HistoryEntry | null;
  }>({ open: false, execution: null, fallback: null });

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const notify = useCallback(
    (message: string, variant: ToastItem['variant'] = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const checkBackendHealth = useCallback(async () => {
    setBackendHealth((prev) => ({ ...prev, status: 'checking' }));
    try {
      const res = await fetch('/api/health');
      if (!res.ok) {
        setBackendHealth({
          status: 'offline',
          checkedAt: new Date().toISOString(),
          error: `HTTP ${res.status}`,
        });
        return;
      }
      const data = await res.json();
      setBackendHealth({
        status: data.status === 'online' ? 'online' : 'offline',
        service: data.service,
        erpTransport: data.erpTransport,
        checkedAt: new Date().toISOString(),
      });
    } catch {
      setBackendHealth({
        status: 'offline',
        checkedAt: new Date().toISOString(),
        error: 'Falha ao consultar /api/health',
      });
    }
  }, []);

  useEffect(() => {
    checkBackendHealth();
  }, [checkBackendHealth]);

  const toFormInputs = useCallback((vals: FormStateValues): FormInputs => {
    return {
      xPed: vals.xPed.trim(),
      docInfo: validateCpfCnpj(vals.clienteDoc),
      valorRaw: vals.valorRaw,
      valorNum: parseValorBR(vals.valorRaw),
      vencYmd: vals.vencYmd,
      cProd: Number(vals.cProdRaw.trim()),
      cProdRaw: vals.cProdRaw.trim(),
      qCom: Number(vals.qComRaw.trim()),
      qComRaw: vals.qComRaw.trim(),
      codigoObjetivo: vals.codigoObjetivo.trim(),
      codigoClassificacao: vals.codigoClassificacao.trim(),
      codigoCobranca: vals.codigoCobranca.trim(),
      faturar: vals.faturar,
    };
  }, []);

  const handleFieldChange = useCallback(
    <K extends keyof FormStateValues>(key: K, value: FormStateValues[K]) => {
      setFormValues((prev) => ({ ...prev, [key]: value }));
      setFieldErrors((prev) => {
        if (Object.keys(prev).length === 0) return prev;
        const copy = { ...prev };
        delete copy.general;
        if (key === 'xPed') delete copy.xPed;
        if (key === 'clienteDoc') delete copy.clienteDoc;
        if (key === 'valorRaw') delete copy.valorProd;
        if (key === 'vencYmd') delete copy.tituloVencimento;
        if (key === 'cProdRaw') delete copy.cProd;
        if (key === 'qComRaw') delete copy.qCom;
        if (key === 'codigoObjetivo') delete copy.codigoObjetivo;
        if (key === 'codigoCobranca') delete copy.codigoCobranca;
        return copy;
      });
    },
    []
  );

  // Numeração sequencial da emissão externa: BoletoExterna01, 02, ... (próximo livre no Compy)
  const [gerandoXPed, setGerandoXPed] = useState(false);
  const [xPedErro, setXPedErro] = useState(false);
  const xPedAbortRef = useRef<AbortController | null>(null);

  const gerarXPedExterna = useCallback(async () => {
    xPedAbortRef.current?.abort();
    const controller = new AbortController();
    xPedAbortRef.current = controller;
    setGerandoXPed(true);
    setXPedErro(false);
    try {
      const { xPed } = await encontrarProximoLivre(SEQ_BOLETO_EXTERNA, loadConfig(), controller.signal);
      setFormValues((prev) => ({ ...prev, xPed }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== 'USER_ABORT') {
        setXPedErro(true);
        notify(`Não foi possível gerar o número BoletoExterna: ${msg}`, 'danger');
      }
    } finally {
      if (xPedAbortRef.current === controller) {
        setGerandoXPed(false);
        xPedAbortRef.current = null;
      }
    }
  }, [notify]);

  /** Registra o número usado (se for da sequência) e já busca o próximo. */
  const avancarXPedExterna = useCallback(
    (xPedUsado: string) => {
      const n = parseSequencia(SEQ_BOLETO_EXTERNA, xPedUsado);
      if (n !== null) saveUltimo(SEQ_BOLETO_EXTERNA, n);
      gerarXPedExterna();
    },
    [gerarXPedExterna]
  );

  const handleRegenerateXPed = useCallback(() => {
    gerarXPedExterna();
  }, [gerarXPedExterna]);

  const handleSelectXPed = useCallback(
    (xPed: string) => {
      if (!xPed) return;
      handleFieldChange('xPed', xPed);
      if (activeSection === 'overview' || activeSection === 'history') {
        setActiveSection('query');
      }
      notify(`xPed ${xPed} preenchido no formulário.`, 'info');
    },
    [activeSection, handleFieldChange, notify]
  );

  const testCompyConnection = useCallback(async () => {
    const activeCfg = loadConfig();
    setConnectionState({
      status: 'testing',
      message: 'Testando...',
      lastTrace: null,
    });

    const trace = await callCompy(
      activeCfg,
      'ws.Pedido',
      'Teste de conexão',
      { xPed: '0' },
      null
    );
    const interp = trace.interpretacao;

    if (trace.fetchError) {
      setConnectionState({
        status: 'cors_error',
        message: 'CORS/rede bloqueado',
        durationMs: trace.durationMs,
        checkedAt: new Date().toISOString(),
        lastTrace: trace,
      });
      notify(interp.msg, 'danger');
      return;
    }

    if (interp.tipo === 'html') {
      setConnectionState({
        status: 'error',
        message: `Falhou · HTTP ${trace.httpStatus}`,
        httpStatus: trace.httpStatus,
        durationMs: trace.durationMs,
        checkedAt: new Date().toISOString(),
        lastTrace: trace,
      });
      notify(interp.msg, 'danger');
      return;
    }

    const status = trace.httpStatus;
    if (status !== null && status < 500 && status !== 401 && status !== 403) {
      setConnectionState({
        status: 'ok',
        message: `Compy ok · ${trace.durationMs} ms`,
        httpStatus: status,
        durationMs: trace.durationMs,
        checkedAt: new Date().toISOString(),
        lastTrace: trace,
      });
      notify(`Compy respondeu em ${trace.durationMs} ms (HTTP ${status}).`, 'success');
    } else {
      setConnectionState({
        status: 'error',
        message: `Falhou · HTTP ${status}`,
        httpStatus: status,
        durationMs: trace.durationMs,
        checkedAt: new Date().toISOString(),
        lastTrace: trace,
      });
      notify(`Compy retornou HTTP ${status}: ${interp.msg}`, 'danger');
    }
  }, [notify]);

  // Execution state helpers
  /**
   * Fluxo de criação de pedido + título. Sem `override`, é a emissão de títulos
   * original (formulário "Gerar boleto"). Com `override`, outro módulo (ex.: mídias
   * avulsas) fornece o próprio payload, validação e valor esperado, reaproveitando
   * pré-checagem, conferência, consulta de título, stepper e histórico.
   */
  const runCreateFlowCore = useCallback(async (override?: CreateFlowOverride) => {
    if (isRunning) return;
    if (!override) setFieldErrors({});
    const inp = override ? override.inp : toFormInputs(formValues);
    const cfg = loadConfig();

    const startedMs = performance.now();
    let execRecord: ExecutionRecord = {
      id: `EXEC-${Date.now()}`,
      mode: override ? override.mode : 'criar_e_buscar',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      xPed: inp.xPed,
      docDigits: inp.docInfo.digits || undefined,
      vencYmd: inp.vencYmd || undefined,
      valorEnviado: override ? (override.valorEsperado ?? NaN) : inp.valorNum,
      produto: override?.produto,
      steps: STEP_LABELS.map((label) => ({
        label,
        state: 'pendente' as StepState,
        msg: 'Aguardando',
      })),
      calls: [],
      result: null,
    };

    const syncExec = (next: ExecutionRecord) => {
      execRecord = next;
      setCurrentExecution({ ...next, steps: [...next.steps], calls: [...next.calls] });
    };

    const setStep = (index: number, state: StepState, msg: string) => {
      const steps = execRecord.steps.map((s, idx) =>
        idx === index ? { ...s, state, msg, updatedAt: new Date().toISOString() } : s
      );
      syncExec({ ...execRecord, steps });
    };

    const pushCall = (trace: CallTrace) => {
      const indexedTrace: CallTrace = {
        ...trace,
        index: execRecord.calls.length + 1,
      };
      syncExec({ ...execRecord, calls: [...execRecord.calls, indexedTrace] });
    };

    const finalize = (result: ExecutionResult, recordHistory: boolean) => {
      const finishedAt = new Date().toISOString();
      const durationMs = Math.round(performance.now() - startedMs);
      const finalExec: ExecutionRecord = {
        ...execRecord,
        finishedAt,
        durationMs,
        result,
      };
      syncExec(finalExec);

      if (recordHistory) {
        const updatedHistory = saveHistoryEntry({
          id: finalExec.id,
          when: finishedAt,
          xPed: result.xPed || finalExec.xPed,
          mode: finalExec.mode,
          docDigits: finalExec.docDigits,
          clienteMasked: finalExec.docDigits
            ? maskCpfCnpj(finalExec.docDigits)
            : maskCpfCnpj(result.cliente),
          vencYmd: finalExec.vencYmd,
          valorDisplay: Number.isFinite(finalExec.valorEnviado)
            ? formatCurrencyBR(finalExec.valorEnviado)
            : result.vTotDisplay || '--',
          produto: finalExec.produto,
          durationMs,
          status: result.status,
          boletoLink: result.boletoLink || null,
          execution: finalExec,
        });
        setHistory(updatedHistory);
      }
    };

    syncExec(execRecord);

    // 1. Validação local
    setStep(0, 'rodando', 'Validando campos...');
    const valRes = override ? override.validate() : validateFormForCreate(inp);
    if (!valRes.ok) {
      if (!override) setFieldErrors((valRes as ReturnType<typeof validateFormForCreate>).fieldErrors);
      setStep(0, 'erro', valRes.errors[0]);
      setStep(1, 'pulado', 'Não executado');
      setStep(2, 'pulado', 'Não executado');
      setStep(3, 'pulado', 'Não executado');
      setStep(4, 'pulado', 'Não executado');
      finalize(
        {
          status: 'erro',
          title: 'Validação local falhou',
          message: valRes.errors.join('\n'),
          xPed: inp.xPed,
          cliente: inp.docInfo.digits ? formatCpfCnpj(inp.docInfo.digits) : '--',
          vTotDisplay: '--',
          pedidoConfirmado: false,
        },
        false
      );
      return;
    }
    setStep(0, 'ok', 'Dados válidos');

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsRunning(true);

    // Na venda de mídias com preço definido pelo Compy, o valor esperado é desconhecido (NaN)
    // e as checagens de divergência de valor são puladas.
    const valorEnviado = override
      ? (override.valorEsperado !== null ? Number(override.valorEsperado.toFixed(2)) : NaN)
      : Number(inp.valorNum.toFixed(2));
    const warnings: string[] = [];
    let pedidoConfirmado = false;
    let vTotDisplay = '--';
    let tituloData: Record<string, unknown> | null = null;
    let boletoLink: string | null = null;

    try {
      // 2. Pré-checagem ws.Pedido {xPed}
      setStep(1, 'rodando', 'Consultando se xPed já existe...');
      const preTrace = await callCompy(
        cfg,
        'ws.Pedido',
        'Pré-checagem',
        buildPedidoPayload(inp.xPed),
        controller.signal
      );
      pushCall(preTrace);
      const preInterp = preTrace.interpretacao;

      if (isNenhumPedidoEncontrado(preInterp)) {
        setStep(1, 'ok', 'xPed disponível (não existe ainda)');
      } else if (preInterp.tipo === 'ok') {
        setStep(1, 'erro', 'Pedido já existe no Compy');
        if (!override) avancarXPedExterna(inp.xPed);
        setStep(2, 'pulado', 'SavePedido NÃO enviado');
        setStep(3, 'pulado', 'Não executado');
        setStep(4, 'pulado', 'Não executado');
        finalize(
          {
            status: 'erro',
            title: `O pedido ${inp.xPed} já existe no Compy`,
            message: `O pedido ${inp.xPed} já existe no Compy. Para não duplicar, o ws.SavePedido NÃO foi enviado. Gere outro xPed ou use 'Só consultar título'.`,
            xPed: inp.xPed,
            cliente: formatCpfCnpj(inp.docInfo.digits),
            vTotDisplay: '--',
            pedidoConfirmado: true,
          },
          true
        );
        return;
      } else {
        setStep(1, 'erro', preInterp.msg);
        setStep(2, 'pulado', 'SavePedido NÃO enviado');
        setStep(3, 'pulado', 'Não executado');
        setStep(4, 'pulado', 'Não executado');
        finalize(
          {
            status: 'erro',
            title: 'Nada foi criado: não deu para consultar o Compy',
            message: preInterp.msg,
            xPed: inp.xPed,
            cliente: formatCpfCnpj(inp.docInfo.digits),
            vTotDisplay: '--',
            pedidoConfirmado: false,
          },
          true
        );
        return;
      }

      // 3. ws.SavePedido
      setStep(2, 'rodando', 'Enviando pedido ao Compy...');
      const savePayload = override ? override.savePayload : buildSavePedidoPayload(inp);
      const saveTrace = await callCompy(
        cfg,
        'ws.SavePedido',
        'Criação do pedido',
        savePayload,
        controller.signal
      );
      pushCall(saveTrace);
      const saveInterp = saveTrace.interpretacao;

      if (saveInterp.tipo !== 'ok') {
        setStep(2, 'erro', saveInterp.msg);
        setStep(3, 'pulado', 'Não executado');
        setStep(4, 'pulado', 'Não executado');

        const is5xx = saveTrace.httpStatus !== null && saveTrace.httpStatus >= 500;
        const isTimeoutOr5xx = saveTrace.isTimeout || is5xx;

        let title = 'Falha no ws.SavePedido';
        let message = saveInterp.msg;

        if (saveInterp.tipo === 'negocio' && !is5xx) {
          title = 'O Compy recusou o pedido';
          message = `O Compy recusou o pedido · ${saveInterp.msg}`;
        } else if (isTimeoutOr5xx) {
          title = saveTrace.isTimeout
            ? `ws.SavePedido falhou (Timeout em ${cfg.timeoutSec}s)`
            : `ws.SavePedido falhou (HTTP ${saveTrace.httpStatus})`;
          message = `${saveInterp.msg}\n\nATENÇÃO: O pedido pode ter sido gravado no Compy mesmo com esta falha. Use 'Só consultar título' com o mesmo xPed (${inp.xPed}) ANTES de tentar criar de novo.`;
        }

        finalize(
          {
            status: 'erro',
            title,
            message,
            xPed: inp.xPed,
            cliente: formatCpfCnpj(inp.docInfo.digits),
            vTotDisplay: '--',
            pedidoConfirmado: false,
          },
          true
        );
        return;
      }

      setStep(2, 'ok', saveInterp.msg || 'Pedido aceito para processamento');

      // 4. Conferência ws.Pedido {xPed} até confTentativas vezes (2s entre elas)
      let confObj: Record<string, unknown> = {};
      for (let attempt = 1; attempt <= cfg.confTentativas; attempt++) {
        setStep(3, 'rodando', `Conferindo pedido (${attempt}/${cfg.confTentativas})...`);
        const confTrace = await callCompy(
          cfg,
          'ws.Pedido',
          `Conferência ${attempt}/${cfg.confTentativas}`,
          buildPedidoPayload(inp.xPed),
          controller.signal
        );
        pushCall(confTrace);
        const confInterp = confTrace.interpretacao;

        if (confInterp.tipo === 'ok') {
          confObj = (confInterp.parsed && confInterp.parsed.dataObj) || {};
          pedidoConfirmado = true;
          break;
        }

        if (isNenhumPedidoEncontrado(confInterp)) {
          if (attempt < cfg.confTentativas) {
            setStep(3, 'rodando', 'Ainda não apareceu; aguardando 2s...');
            await sleep(2000, controller.signal);
          }
          continue;
        }

        setStep(3, 'erro', confInterp.msg);
        setStep(4, 'pulado', 'Não executado');
        finalize(
          {
            status: 'erro',
            title: 'Erro ao conferir pedido no Compy',
            message: `${confInterp.msg}\nUse 'Só consultar título' com este xPed antes de tentar novamente.`,
            xPed: inp.xPed,
            cliente: formatCpfCnpj(inp.docInfo.digits),
            vTotDisplay: '--',
            pedidoConfirmado: false,
          },
          true
        );
        return;
      }

      if (!pedidoConfirmado) {
        setStep(3, 'erro', `Pedido não apareceu no Compy (${cfg.confTentativas}×)`);
        setStep(4, 'pulado', 'Não executado');
        finalize(
          {
            status: 'erro',
            title: 'Pedido não confirmado no Compy',
            message: `ws.SavePedido respondeu sucesso, mas o pedido ${inp.xPed} NÃO apareceu no Compy (conferido ${cfg.confTentativas}×). Nada foi gravado.`,
            xPed: inp.xPed,
            cliente: formatCpfCnpj(inp.docInfo.digits),
            vTotDisplay: '--',
            pedidoConfirmado: false,
          },
          true
        );
        return;
      }

      const rawVTot = confObj.vTot !== undefined ? confObj.vTot : confObj.VTot;
      const vTotNum = parseNumericField(rawVTot);
      if (Number.isFinite(vTotNum)) {
        vTotDisplay = formatCurrencyBR(vTotNum);
        if (!Number.isFinite(valorEnviado)) {
          // Valor definido pelo Compy: registra o vTot conferido como valor da operação.
          syncExec({ ...execRecord, valorEnviado: vTotNum });
          setStep(3, 'ok', `Confirmado (${vTotDisplay}, preço do Compy)`);
        } else if (Math.abs(vTotNum - valorEnviado) > 0.01) {
          const w = `Divergência de valor na conferência: enviado ${formatCurrencyBR(valorEnviado)}, vTot no Compy ${vTotDisplay}.`;
          warnings.push(w);
          setStep(3, 'aviso', 'Confirmado com divergência em vTot');
        } else {
          setStep(3, 'ok', `Confirmado (${vTotDisplay})`);
        }
      } else {
        vTotDisplay = rawVTot !== undefined ? String(rawVTot) : '--';
        setStep(3, 'ok', 'Pedido confirmado no Compy');
      }

      // 5. ws.Titulo até titTentativas vezes com intervaloSec entre elas
      const tituloPayload = buildTituloPayload(inp.xPed, inp.docInfo.type, inp.docInfo.digits);
      for (let tAttempt = 1; tAttempt <= cfg.titTentativas; tAttempt++) {
        setStep(4, 'rodando', `Buscando título (${tAttempt}/${cfg.titTentativas})...`);
        const titTrace = await callCompy(
          cfg,
          'ws.Titulo',
          `Consulta título ${tAttempt}/${cfg.titTentativas}`,
          tituloPayload,
          controller.signal
        );
        pushCall(titTrace);
        const titInterp = titTrace.interpretacao;

        if (titInterp.tipo === 'ok') {
          tituloData = (titInterp.parsed && titInterp.parsed.dataObj) || {};
          boletoLink = findBoletoLink(tituloData);
          break;
        }

        if (isNenhumTituloEncontrado(titInterp)) {
          if (tAttempt < cfg.titTentativas) {
            setStep(4, 'rodando', `Título ainda não gerado; aguardando ${cfg.intervaloSec}s...`);
            await sleep(cfg.intervaloSec * 1000, controller.signal);
          }
          continue;
        }

        // Erro não recuperável no ws.Titulo
        setStep(4, 'erro', titInterp.msg);
        if (override) override.onPedidoGravado?.();
        else avancarXPedExterna(inp.xPed);
        finalize(
          {
            status: 'parcial',
            title: 'Pedido criado, mas falhou a consulta do título',
            message: `${titInterp.msg}\nO pedido já foi gravado no Compy. NÃO crie de novo, use 'Só consultar título'.`,
            warnings,
            xPed: inp.xPed,
            cliente: formatCpfCnpj(inp.docInfo.digits),
            vTotDisplay,
            pedidoConfirmado: true,
          },
          true
        );
        return;
      }

      // Gerar automaticamente um xPed novo no campo após pedido criado com sucesso
      if (override) override.onPedidoGravado?.();
      else avancarXPedExterna(inp.xPed);

      if (!tituloData) {
        setStep(4, 'aviso', 'Título ainda não apareceu');
        finalize(
          {
            status: 'parcial',
            title: 'Pedido criado, título ainda não apareceu',
            message:
              "Pedido criado, título ainda não apareceu. NÃO crie de novo, use 'Só consultar título'.",
            warnings,
            xPed: inp.xPed,
            cliente: formatCpfCnpj(inp.docInfo.digits),
            vTotDisplay,
            pedidoConfirmado: true,
          },
          true
        );
        return;
      }

      // Comparar CPF/CNPJ e valor do título com o pedido
      const titDocDigits = onlyDigits(
        tituloData.cnpj || tituloData.cpf || tituloData.cpfCnpj || tituloData.documento || ''
      );
      if (titDocDigits && titDocDigits !== inp.docInfo.digits) {
        warnings.push(
          `Divergência de documento no título: pedido ${formatCpfCnpj(inp.docInfo.digits)}, título ${formatCpfCnpj(titDocDigits)}.`
        );
      }
      const rawTitVal = tituloData.valor !== undefined ? tituloData.valor : tituloData.Valor;
      const titValNum = parseNumericField(rawTitVal);
      const valorReferencia = Number.isFinite(valorEnviado) ? valorEnviado : vTotNum;
      if (
        Number.isFinite(titValNum) &&
        Number.isFinite(valorReferencia) &&
        Math.abs(titValNum - valorReferencia) > 0.01
      ) {
        warnings.push(
          `Divergência de valor no título: pedido ${formatCurrencyBR(valorReferencia)}, título ${formatCurrencyBR(titValNum)}.`
        );
      }

      if (warnings.length > 0) {
        setStep(4, 'aviso', 'Título obtido com divergências');
        finalize(
          {
            status: 'parcial',
            title: 'Pedido criado e título obtido com avisos',
            message:
              'O pedido foi criado e o título foi localizado, mas há divergências que merecem conferência.',
            warnings,
            xPed: inp.xPed,
            cliente: formatCpfCnpj(inp.docInfo.digits),
            vTotDisplay,
            pedidoConfirmado: true,
            tituloData,
            boletoLink,
          },
          true
        );
      } else {
        setStep(4, 'ok', boletoLink ? 'Título e boleto obtidos' : 'Título obtido (sem link de boleto)');
        finalize(
          {
            status: 'sucesso',
            title: 'Pedido criado e título localizado com sucesso',
            message: boletoLink
              ? `O pedido ${inp.xPed} foi confirmado no Compy e o link do boleto foi retornado.`
              : `O pedido ${inp.xPed} foi confirmado e o título foi retornado pelo Compy.`,
            warnings: [],
            xPed: inp.xPed,
            cliente: formatCpfCnpj(inp.docInfo.digits),
            vTotDisplay,
            pedidoConfirmado: true,
            tituloData,
            boletoLink,
          },
          true
        );
      }
    } catch (err: unknown) {
      const e = err as { message?: string } | null;
      if (e?.message === 'USER_ABORT') {
        const updatedSteps = execRecord.steps.map((s) => {
          if (s.state === 'rodando') return { ...s, state: 'erro' as StepState, msg: 'Interrompido pelo usuário' };
          if (s.state === 'pendente') return { ...s, state: 'pulado' as StepState, msg: 'Interrompido' };
          return s;
        });
        syncExec({ ...execRecord, steps: updatedSteps });
        finalize(
          {
            status: 'erro',
            title: 'Execução interrompida',
            message: 'A execução foi interrompida pelo usuário.',
            warnings,
            xPed: inp.xPed,
            cliente: formatCpfCnpj(inp.docInfo.digits),
            vTotDisplay,
            pedidoConfirmado,
            tituloData,
            boletoLink,
          },
          false
        );
      } else {
        finalize(
          {
            status: 'erro',
            title: 'Erro inesperado na execução',
            message: e?.message ? e.message : String(err),
            warnings,
            xPed: inp.xPed,
            cliente: formatCpfCnpj(inp.docInfo.digits),
            vTotDisplay,
            pedidoConfirmado,
          },
          false
        );
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  }, [formValues, isRunning, toFormInputs, avancarXPedExterna]);

  // Ao abrir "Gerar boleto" sem número, busca o próximo BoletoExternaNN livre (uma vez; em erro, só pelo botão).
  useEffect(() => {
    if (activeSection === 'generate' && !formValues.xPed && !gerandoXPed && !xPedErro && !isRunning) {
      gerarXPedExterna();
    }
  }, [activeSection, formValues.xPed, gerandoXPed, xPedErro, isRunning, gerarXPedExterna]);

  // Mantém a assinatura original para o botão "Gerar boleto" (não repassa o evento de clique).
  const runCreateAndFetchFlow = useCallback(() => runCreateFlowCore(), [runCreateFlowCore]);

  const runQueryOnlyFlow = useCallback(async () => {
    if (isRunning) return;
    setFieldErrors({});
    const inp = toFormInputs(formValues);
    const cfg = loadConfig();

    const startedMs = performance.now();
    let execRecord: ExecutionRecord = {
      id: `EXEC-${Date.now()}`,
      mode: 'so_consultar_titulo',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      xPed: inp.xPed,
      docDigits: inp.docInfo.digits || undefined,
      valorEnviado: NaN,
      steps: STEP_LABELS.map((label) => ({
        label,
        state: 'pendente' as StepState,
        msg: 'Aguardando',
      })),
      calls: [],
      result: null,
    };

    const syncExec = (next: ExecutionRecord) => {
      execRecord = next;
      setCurrentExecution({ ...next, steps: [...next.steps], calls: [...next.calls] });
    };

    const setStep = (index: number, state: StepState, msg: string) => {
      const steps = execRecord.steps.map((s, idx) =>
        idx === index ? { ...s, state, msg, updatedAt: new Date().toISOString() } : s
      );
      syncExec({ ...execRecord, steps });
    };

    const pushCall = (trace: CallTrace) => {
      const indexedTrace: CallTrace = {
        ...trace,
        index: execRecord.calls.length + 1,
      };
      syncExec({ ...execRecord, calls: [...execRecord.calls, indexedTrace] });
    };

    const finalize = (result: ExecutionResult, recordHistory: boolean) => {
      const finishedAt = new Date().toISOString();
      const durationMs = Math.round(performance.now() - startedMs);
      const finalExec: ExecutionRecord = {
        ...execRecord,
        finishedAt,
        durationMs,
        result,
      };
      syncExec(finalExec);

      if (recordHistory) {
        const updatedHistory = saveHistoryEntry({
          id: finalExec.id,
          when: finishedAt,
          xPed: result.xPed || finalExec.xPed,
          mode: finalExec.mode,
          docDigits: finalExec.docDigits,
          clienteMasked: finalExec.docDigits
            ? maskCpfCnpj(finalExec.docDigits)
            : maskCpfCnpj(result.cliente),
          valorDisplay: Number.isFinite(finalExec.valorEnviado)
            ? formatCurrencyBR(finalExec.valorEnviado)
            : result.vTotDisplay || '--',
          durationMs,
          status: result.status,
          boletoLink: result.boletoLink || null,
          execution: finalExec,
        });
        setHistory(updatedHistory);
      }
    };

    syncExec(execRecord);

    setStep(0, 'rodando', 'Validando xPed...');
    if (!inp.xPed || !/^[A-Za-z0-9_\-.+]+$/.test(inp.xPed)) {
      const msg = 'xPed obrigatório e deve conter apenas [A-Za-z0-9_\\-.+].';
      setFieldErrors({ xPed: msg, general: msg });
      setStep(0, 'erro', msg);
      setStep(1, 'pulado', 'Não executado');
      setStep(2, 'pulado', 'Não executado');
      setStep(3, 'pulado', 'Não executado');
      setStep(4, 'pulado', 'Não executado');
      finalize(
        {
          status: 'erro',
          title: 'xPed inválido',
          message: msg,
          xPed: inp.xPed,
          cliente: '--',
          vTotDisplay: '--',
          pedidoConfirmado: false,
        },
        false
      );
      return;
    }
    setStep(0, 'ok', 'xPed válido');

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsRunning(true);

    try {
      // 1. ws.Pedido {xPed}
      setStep(1, 'rodando', 'Consultando pedido no Compy...');
      const pedTrace = await callCompy(
        cfg,
        'ws.Pedido',
        'Consulta do pedido',
        buildPedidoPayload(inp.xPed),
        controller.signal
      );
      pushCall(pedTrace);
      const pedInterp = pedTrace.interpretacao;

      if (isNenhumPedidoEncontrado(pedInterp)) {
        setStep(1, 'erro', 'Pedido não existe no Compy');
        setStep(2, 'pulado', 'Não utilizado na consulta');
        setStep(3, 'pulado', 'Não utilizado na consulta');
        setStep(4, 'pulado', 'Não executado');
        finalize(
          {
            status: 'erro',
            title: `O pedido ${inp.xPed} não existe no Compy`,
            message: `O pedido ${inp.xPed} não existe no Compy.`,
            xPed: inp.xPed,
            cliente: '--',
            vTotDisplay: '--',
            pedidoConfirmado: false,
          },
          true
        );
        return;
      }

      if (pedInterp.tipo !== 'ok') {
        setStep(1, 'erro', pedInterp.msg);
        setStep(2, 'pulado', 'Não utilizado na consulta');
        setStep(3, 'pulado', 'Não utilizado na consulta');
        setStep(4, 'pulado', 'Não executado');
        finalize(
          {
            status: 'erro',
            title: 'Erro ao consultar pedido no Compy',
            message: pedInterp.msg,
            xPed: inp.xPed,
            cliente: '--',
            vTotDisplay: '--',
            pedidoConfirmado: false,
          },
          true
        );
        return;
      }

      const pedObj = (pedInterp.parsed && pedInterp.parsed.dataObj) || {};
      const rawVTot = pedObj.vTot !== undefined ? pedObj.vTot : pedObj.VTot;
      const vTotNum = parseNumericField(rawVTot);
      const vTotDisplay = Number.isFinite(vTotNum)
        ? formatCurrencyBR(vTotNum)
        : rawVTot !== undefined
          ? String(rawVTot)
          : '--';
      if (Number.isFinite(vTotNum)) {
        execRecord = { ...execRecord, valorEnviado: vTotNum };
      }

      setStep(1, 'ok', `Pedido encontrado (${vTotDisplay})`);
      setStep(2, 'pulado', 'Modo consulta (não cria pedido)');
      setStep(3, 'pulado', 'Já consultado na etapa 2');

      // 2. Documento do pedido ou do formulário
      let doc = extractPedidoDoc(pedObj);
      if (!doc && inp.docInfo.valid) {
        doc = { type: inp.docInfo.type as 'cpf' | 'cnpj', digits: inp.docInfo.digits };
      }
      if (!doc) {
        const msg =
          'O pedido no Compy não retornou CPF/CNPJ. Informe um CPF ou CNPJ válido neste campo.';
        setFieldErrors({ clienteDoc: msg });
        setStep(4, 'erro', 'CPF/CNPJ necessário para ws.Titulo');
        finalize(
          {
            status: 'erro',
            title: 'Informe o CPF ou CNPJ para consultar o título',
            message:
              'O pedido existe no Compy, mas não retornou cpf/cnpj. Preencha o campo CPF/CNPJ do formulário e clique em "Só consultar título" novamente.',
            xPed: inp.xPed,
            cliente: '--',
            vTotDisplay,
            pedidoConfirmado: true,
          },
          false
        );
        return;
      }

      execRecord = { ...execRecord, docDigits: doc.digits };

      // 3. ws.Titulo com tentativas
      const tituloPayload = buildTituloPayload(inp.xPed, doc.type, doc.digits);
      let tituloData: Record<string, unknown> | null = null;
      let boletoLink: string | null = null;

      for (let tAttempt = 1; tAttempt <= cfg.titTentativas; tAttempt++) {
        setStep(4, 'rodando', `Consultando título (${tAttempt}/${cfg.titTentativas})...`);
        const titTrace = await callCompy(
          cfg,
          'ws.Titulo',
          `Consulta título ${tAttempt}/${cfg.titTentativas}`,
          tituloPayload,
          controller.signal
        );
        pushCall(titTrace);
        const titInterp = titTrace.interpretacao;

        if (titInterp.tipo === 'ok') {
          tituloData = (titInterp.parsed && titInterp.parsed.dataObj) || {};
          boletoLink = findBoletoLink(tituloData);
          break;
        }

        if (isNenhumTituloEncontrado(titInterp)) {
          if (tAttempt < cfg.titTentativas) {
            setStep(4, 'rodando', `Nenhum título ainda; aguardando ${cfg.intervaloSec}s...`);
            await sleep(cfg.intervaloSec * 1000, controller.signal);
          }
          continue;
        }

        setStep(4, 'erro', titInterp.msg);
        finalize(
          {
            status: 'erro',
            title: 'Erro ao consultar título no Compy',
            message: titInterp.msg,
            xPed: inp.xPed,
            cliente: formatCpfCnpj(doc.digits),
            vTotDisplay,
            pedidoConfirmado: true,
          },
          true
        );
        return;
      }

      if (!tituloData) {
        setStep(4, 'aviso', 'Título ainda não encontrado');
        finalize(
          {
            status: 'parcial',
            title: 'Pedido existe, mas o título ainda não foi encontrado',
            message: `O pedido ${inp.xPed} existe no Compy, porém ws.Titulo retornou "Nenhum título encontrado" após ${cfg.titTentativas} tentativa(s).`,
            xPed: inp.xPed,
            cliente: formatCpfCnpj(doc.digits),
            vTotDisplay,
            pedidoConfirmado: true,
          },
          true
        );
        return;
      }

      setStep(4, 'ok', boletoLink ? 'Título e boleto encontrados' : 'Título encontrado (sem link)');
      finalize(
        {
          status: 'sucesso',
          title: 'Título consultado com sucesso',
          message: `Dados retornados diretamente pelo Compy para o pedido ${inp.xPed}.`,
          xPed: inp.xPed,
          cliente: formatCpfCnpj(doc.digits),
          vTotDisplay,
          pedidoConfirmado: true,
          tituloData,
          boletoLink,
        },
        true
      );
    } catch (err: unknown) {
      const e = err as { message?: string } | null;
      if (e?.message === 'USER_ABORT') {
        const updatedSteps = execRecord.steps.map((s) => {
          if (s.state === 'rodando') return { ...s, state: 'erro' as StepState, msg: 'Interrompido pelo usuário' };
          if (s.state === 'pendente') return { ...s, state: 'pulado' as StepState, msg: 'Interrompido' };
          return s;
        });
        syncExec({ ...execRecord, steps: updatedSteps });
        finalize(
          {
            status: 'erro',
            title: 'Consulta interrompida',
            message: 'A consulta foi interrompida pelo usuário.',
            xPed: inp.xPed,
            cliente: '--',
            vTotDisplay: '--',
            pedidoConfirmado: false,
          },
          false
        );
      } else {
        finalize(
          {
            status: 'erro',
            title: 'Erro inesperado na consulta',
            message: e?.message ? e.message : String(err),
            xPed: inp.xPed,
            cliente: '--',
            vTotDisplay: '--',
            pedidoConfirmado: false,
          },
          false
        );
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  }, [formValues, isRunning, toFormInputs]);

  const handleStopExecution = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleSaveConfig = useCallback(
    (nextCfg: CompyConfig) => {
      saveConfig(nextCfg);
      setConfig(nextCfg);
      notify('Configurações salvas no navegador.', 'success');
    },
    [notify]
  );

  const handleClearHistory = useCallback(() => {
    clearHistoryStorage();
    setHistory([]);
    notify('Histórico limpo.', 'info');
  }, [notify]);

  const handleOpenDetails = useCallback(
    (exec: ExecutionRecord | null, fallback?: HistoryEntry) => {
      setDetailsState({
        open: true,
        execution: exec,
        fallback: fallback || null,
      });
    },
    []
  );

  const handleCopy = useCallback(
    (text: string, label: string) => {
      copyToClipboard(text, label, notify);
    },
    [notify]
  );

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        activeSection={activeSection}
        onNavigate={setActiveSection}
        config={config}
        connectionState={connectionState}
        onOpenConfig={() => setConfigModalOpen(true)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          activeSection={activeSection}
          connectionState={connectionState}
          onTestConnection={testCompyConnection}
          onOpenConfig={() => setConfigModalOpen(true)}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {activeSection === 'overview' && (
            <OverviewPage
              history={history}
              config={config}
              backendHealth={backendHealth}
              connectionState={connectionState}
              onNavigate={setActiveSection}
              onCheckBackendHealth={checkBackendHealth}
              onTestConnection={testCompyConnection}
              onOpenConfig={() => setConfigModalOpen(true)}
              onOpenDetails={handleOpenDetails}
              onSelectXPed={handleSelectXPed}
            />
          )}

          {(activeSection === 'generate' || activeSection === 'query') && (
            <OrderOperationPage
              mode={activeSection}
              formValues={formValues}
              fieldErrors={fieldErrors}
              config={config}
              isRunning={isRunning}
              currentExecution={currentExecution?.mode === 'midia_avulsa' ? null : currentExecution}
              onChangeField={handleFieldChange}
              onRegenerateXPed={handleRegenerateXPed}
              xPedGerando={gerandoXPed}
              onSubmitGenerate={runCreateAndFetchFlow}
              onSubmitQuery={runQueryOnlyFlow}
              onStopExecution={handleStopExecution}
              onOpenPayloadModal={(inputs) => setPayloadModalInputs(inputs)}
              onOpenDetails={(exec) => handleOpenDetails(exec)}
              onOpenBoleto={(link) => openBoletoLink(link, notify)}
              onDownloadBoleto={(link, xPed) => downloadBoletoPdf(link, xPed, notify)}
              toFormInputs={toFormInputs}
            />
          )}

          {activeSection === 'midia_avulsa' && (
            <MidiaAvulsaPage
              config={config}
              isRunning={isRunning}
              currentExecution={currentExecution?.mode === 'midia_avulsa' ? currentExecution : null}
              onSubmit={runCreateFlowCore}
              onStopExecution={handleStopExecution}
              onOpenDetails={(exec) => handleOpenDetails(exec)}
              onOpenBoleto={(link) => openBoletoLink(link, notify)}
              onDownloadBoleto={(link, xPed) => downloadBoletoPdf(link, xPed, notify)}
              onNotify={notify}
            />
          )}

          {(activeSection === 'bulk_valor' || activeSection === 'bulk_cnpj') && (
            <BulkCorrectionPage
              mode={activeSection}
              config={config}
              onNotify={notify}
            />
          )}

          {activeSection === 'history' && (
            <HistoryPage
              history={history}
              onClearHistory={handleClearHistory}
              onOpenDetails={(exec, fallback) => handleOpenDetails(exec, fallback)}
              onOpenBoleto={(link) => openBoletoLink(link, notify)}
              onSelectXPed={handleSelectXPed}
            />
          )}

          {activeSection === 'diagnostics' && (
            <DiagnosticsPage
              config={config}
              backendHealth={backendHealth}
              connectionState={connectionState}
              currentExecution={currentExecution}
              history={history}
              onCheckBackendHealth={checkBackendHealth}
              onTestConnection={testCompyConnection}
              onDownloadHtml={() => downloadStandaloneHtml(notify)}
              onOpenDetails={handleOpenDetails}
              onCopy={handleCopy}
            />
          )}
        </main>
      </div>

      {/* Drawers & Modals */}
      <OperationDetailsDrawer
        open={detailsState.open}
        execution={detailsState.execution}
        historyFallback={detailsState.fallback}
        onClose={() => setDetailsState({ open: false, execution: null, fallback: null })}
        onCopy={handleCopy}
        onOpenBoleto={(link) => openBoletoLink(link, notify)}
        onDownloadBoleto={(link, xPed) => downloadBoletoPdf(link, xPed, notify)}
      />

      <ConfigModal
        open={configModalOpen}
        config={config}
        onClose={() => setConfigModalOpen(false)}
        onSave={handleSaveConfig}
        onNotify={notify}
      />

      <PayloadModal
        open={payloadModalInputs !== null}
        inputs={payloadModalInputs || toFormInputs(formValues)}
        config={config}
        onClose={() => setPayloadModalInputs(null)}
        onCopy={handleCopy}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
