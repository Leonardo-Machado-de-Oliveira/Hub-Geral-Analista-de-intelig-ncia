import type { CallTrace, CompyConfig, OperationStatus } from '@/src/types/compy';
import {
  callCompy,
  formatCpfCnpj,
  formatCurrencyBR,
  onlyDigits,
  parseValorBR,
  validateCpfCnpj,
} from '@/src/lib/compy';

// =========================================================================
// CORREÇÃO DE PEDIDOS EM MASSA VIA API — valor e/ou CPF/CNPJ de faturamento
// Lógica e payloads conforme os logs de referência "disparos-correcao_valor"
// e "disparos-correcao_cliente".
// =========================================================================

export type BulkFlowId = 'correcao:valor' | 'correcao:cliente';

export const BULK_MAX_ITEMS = 500;

/** Código objetivo fixo enviado na retificação de valor (conforme log de referência). */
export const CODIGO_OBJETIVO_CORRECAO_VALOR = '02';

const XPED_RE = /^[A-Za-z0-9_\-.+]+$/;

export interface BulkInputItem {
  line: number;
  xPed: string;
  /** Novo valor total (2 casas), ou null se a linha não altera valor. */
  valorNum: number | null;
  /** CPF (11) ou CNPJ (14) de faturamento validado, ou null se a linha não altera o documento. */
  docDigits: string | null;
  docType: 'cpf' | 'cnpj' | null;
}

export interface BulkParseResult {
  items: BulkInputItem[];
  errors: string[];
}

export interface BulkItemResult {
  itemIndex: number;
  xPed: string;
  status: OperationStatus;
  message: string;
}

/** Mesmo formato dos registros dos arquivos de disparo de referência. */
export interface BulkLogEntry {
  flowId: BulkFlowId;
  batchId: string;
  itemIndex: number;
  itemKey: string;
  step: string;
  method: 'POST';
  url: string;
  requestBody: string;
  httpStatus: number | null;
  responseBody: string | null;
  error: string | null;
  startedAt: string;
  durationMs: number;
  transport: 'navegador-direto';
  targetUrl: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  responseContentType: string | null;
  responseBytes: number;
  /** Não há id de servidor no hub; campo mantido por compatibilidade com o formato de referência. */
  id: null;
}

// =========================================================================
// PARSING DA LISTA INFORMADA PELO USUÁRIO (formato unificado)
// Uma linha por pedido: "xPed;valor;CPF/CNPJ"
//   - separadores aceitos: ponto e vírgula, dois-pontos ou tabulação
//   - valor e documento são opcionais, mas a linha precisa ter pelo menos um
// Exemplos:
//   1000:70;86933914020     → altera valor para 70,00 e CPF de faturamento
//   1000;70                 → só valor
//   1000;;05054960000158    → só CNPJ de faturamento
//   1000;05054960000158     → só CNPJ (11 ou 14 dígitos sem vírgula = documento)
// =========================================================================
function pareceDocumento(raw: string): boolean {
  if (raw.includes(',')) return false;
  const d = onlyDigits(raw);
  return (d.length === 11 || d.length === 14) && /^[\d.\-/\s]+$/.test(raw);
}

export function parseBulkInput(text: string): BulkParseResult {
  const items: BulkInputItem[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  const nonEmpty = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (nonEmpty.length > BULK_MAX_ITEMS) {
    errors.push(`A lista tem ${nonEmpty.length} linhas; o limite por lote é ${BULK_MAX_ITEMS}.`);
    return { items, errors };
  }

  text.split(/\r?\n/).forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) return;
    const n = idx + 1;

    const parts = line.split(/[;:\t]/).map((p) => p.trim());
    if (parts.length < 2 || parts.length > 3 || !parts[0]) {
      errors.push(`Linha ${n}: use o formato "pedido;valor;CPF/CNPJ".`);
      return;
    }

    const xPed = parts[0];
    let valorRaw = '';
    let docRaw = '';
    if (parts.length === 3) {
      valorRaw = parts[1];
      docRaw = parts[2];
    } else if (pareceDocumento(parts[1])) {
      docRaw = parts[1];
    } else {
      valorRaw = parts[1];
    }

    if (!XPED_RE.test(xPed)) {
      errors.push(`Linha ${n}: pedido "${xPed}" contém caracteres inválidos.`);
      return;
    }
    if (seen.has(xPed)) {
      errors.push(`Linha ${n}: pedido "${xPed}" está repetido na lista.`);
      return;
    }
    if (!valorRaw && !docRaw) {
      errors.push(`Linha ${n}: informe o valor, o CPF/CNPJ ou os dois.`);
      return;
    }

    let valorNum: number | null = null;
    if (valorRaw) {
      const v = parseValorBR(valorRaw);
      if (!Number.isFinite(v) || v <= 0) {
        errors.push(`Linha ${n}: valor "${valorRaw}" inválido (deve ser maior que zero).`);
        return;
      }
      valorNum = Number(v.toFixed(2));
    }

    let docDigits: string | null = null;
    let docType: 'cpf' | 'cnpj' | null = null;
    if (docRaw) {
      const doc = validateCpfCnpj(docRaw);
      if (!doc.valid || !doc.type) {
        errors.push(`Linha ${n}: CPF/CNPJ "${docRaw}" inválido.`);
        return;
      }
      docDigits = doc.digits;
      docType = doc.type;
    }

    seen.add(xPed);
    items.push({ line: n, xPed, valorNum, docDigits, docType });
  });

  if (items.length === 0 && errors.length === 0) {
    errors.push('Informe ao menos um pedido.');
  }
  return { items, errors };
}

// =========================================================================
// PAYLOAD BUILDERS
// =========================================================================

/**
 * Divide o valor total em partes iguais, em centavos. O resto vai para os últimos itens.
 * Ex.: 67,00 em 3 partes → [22,33; 22,33; 22,34]
 */
export function dividirValorEmPartes(total: number, partes: number): number[] {
  const totalCent = Math.round(total * 100);
  const base = Math.floor(totalCent / partes);
  const resto = totalCent - base * partes;
  return Array.from({ length: partes }, (_, i) => (base + (i >= partes - resto ? 1 : 0)) / 100);
}

/**
 * Monta a retificação de valor a partir do pedido consultado (ws.Pedido),
 * no mesmo formato do log de referência.
 * O valor informado é o total do pedido. Com mais de um item, o total é dividido
 * igualmente entre os itens (centavos extras vão para os últimos).
 * Restrição: cada item deve ter qCom = 1.
 */
export function buildCorrecaoValorPayload(
  xPed: string,
  pedido: Record<string, unknown> | null,
  novoValor: number
): Record<string, unknown> {
  if (!pedido) throw new Error('Pedido sem dados na resposta do Compy.');
  if (String(pedido.xPed) !== xPed) {
    throw new Error(`Resposta do Compy veio para outro pedido (${String(pedido.xPed)}).`);
  }

  const prodList = Array.isArray(pedido.prodList)
    ? (pedido.prodList as Array<Record<string, unknown>>)
    : [];
  if (prodList.length === 0) {
    throw new Error('Pedido sem itens na resposta do Compy.');
  }
  for (const prod of prodList) {
    if (Number(prod.qCom) !== 1) {
      throw new Error(
        `Item ${String(prod.cProd)} com quantidade ${String(prod.qCom)}; a correção de valor suporta somente qCom = 1 em cada item.`
      );
    }
  }

  const valor = Number(novoValor.toFixed(2));
  const partes = dividirValorEmPartes(valor, prodList.length);
  if (partes.some((p) => p <= 0)) {
    throw new Error(`Valor ${valor} insuficiente para dividir entre ${prodList.length} itens.`);
  }
  const payload: Record<string, unknown> = {};

  if (pedido.cpf !== undefined && pedido.cpf !== null) {
    payload.cpf = pedido.cpf;
  } else if (pedido.cnpj !== undefined && pedido.cnpj !== null) {
    payload.cnpj = pedido.cnpj;
  } else {
    throw new Error('Pedido sem CPF/CNPJ na resposta do Compy.');
  }

  payload.xNome = pedido.xNome;
  payload.xPed = pedido.xPed;
  payload.dEntrega = pedido.dEntrega;
  payload.dEmi = pedido.dEmi;
  payload.vTot = valor;
  payload.limiteDeCredito = pedido.limiteDeCredito;
  payload.prodList = prodList.map((prod, i) => ({
    cProd: prod.cProd,
    qCom: prod.qCom,
    vUnCom: partes[i],
    vProd: partes[i],
  }));
  payload.dupList = Array.isArray(pedido.dupList) ? pedido.dupList : [];
  payload.bloqList = Array.isArray(pedido.bloqList) ? pedido.bloqList : [];
  payload.faturar = false;
  payload.codigoObjetivo = CODIGO_OBJETIVO_CORRECAO_VALOR;

  return payload;
}

/**
 * Correção do documento de faturamento: payload parcial, idêntico ao log de referência
 * para CNPJ (cnpjFaturamento). Para CPF usa cpfFaturamento (campo documentado do ws.SavePedido).
 */
export function buildCorrecaoClientePayload(
  xPed: string,
  docDigits: string,
  docType: 'cpf' | 'cnpj' = 'cnpj'
) {
  const campo = docType === 'cpf' ? 'cpfFaturamento' : 'cnpjFaturamento';
  return {
    pedidoList: [{ xPed: String(xPed), [campo]: docDigits }],
    sincrono: true,
  };
}

// =========================================================================
// RUNNER EM LOTE (sequencial, uma chamada por vez)
// =========================================================================
export interface BulkRunOptions {
  items: BulkInputItem[];
  config: CompyConfig;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number, result: BulkItemResult) => void;
}

export interface BulkRunOutput {
  batchId: string;
  entries: BulkLogEntry[];
  results: BulkItemResult[];
  interrompido: boolean;
}

function toLogEntry(
  trace: CallTrace,
  meta: { flow: BulkFlowId; batchId: string; itemIndex: number; itemKey: string; step: string }
): BulkLogEntry {
  const raw = trace.responseBodyRaw || '';
  return {
    flowId: meta.flow,
    batchId: meta.batchId,
    itemIndex: meta.itemIndex,
    itemKey: meta.itemKey,
    step: meta.step,
    method: 'POST',
    url: trace.url,
    requestBody: trace.requestBodyRaw,
    httpStatus: trace.httpStatus,
    responseBody: trace.fetchError ? null : raw,
    error: trace.fetchError,
    startedAt: trace.timestampIso,
    durationMs: trace.durationMs,
    transport: 'navegador-direto',
    targetUrl: trace.url,
    requestHeaders: trace.requestHeaders,
    responseHeaders: trace.responseHeaders,
    responseContentType: trace.responseHeaders['content-type'] ?? null,
    responseBytes: new TextEncoder().encode(raw).length,
    id: null,
  };
}

class Interrompido extends Error {}

/**
 * Processa cada linha em sequência. Por pedido:
 *  1. se houver valor: ws.Pedido (consulta) + ws.SavePedido (retificação)   [correcao:valor]
 *  2. se houver CPF/CNPJ: ws.SavePedido (CPF/CNPJ faturamento)              [correcao:cliente]
 * Se o valor falhar, o documento não é alterado (o pedido fica como estava).
 */
export async function runBulkCorrecao(opts: BulkRunOptions): Promise<BulkRunOutput> {
  const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const entries: BulkLogEntry[] = [];
  const results: BulkItemResult[] = [];
  let interrompido = false;
  const total = opts.items.length;

  for (let i = 0; i < total; i++) {
    if (opts.signal?.aborted) {
      interrompido = true;
      break;
    }

    const item = opts.items[i];
    const itemIndex = i; // índice base 0, como nos logs de referência
    const itemKey = item.xPed;
    const record = (flow: BulkFlowId, trace: CallTrace, step: string) => {
      entries.push(toLogEntry(trace, { flow, batchId, itemIndex, itemKey, step }));
      if (trace.isAborted) throw new Interrompido();
    };

    const feitos: string[] = [];
    let falha: string | null = null;

    try {
      // 1) Valor
      if (item.valorNum !== null) {
        const consulta = await callCompy(opts.config, 'ws.Pedido', 'Consulta do pedido', { xPed: item.xPed }, opts.signal);
        record('correcao:valor', consulta, 'ws.Pedido (consulta)');

        if (consulta.interpretacao.tipo !== 'ok') {
          falha = `Consulta falhou: ${consulta.interpretacao.msg}`;
        } else {
          const pedido = (consulta.interpretacao.parsed?.dataObj ?? null) as Record<string, unknown> | null;
          const valorAnterior = pedido ? Number(pedido.vTot) : NaN;
          const payload = buildCorrecaoValorPayload(item.xPed, pedido, item.valorNum);

          const save = await callCompy(
            opts.config,
            'ws.SavePedido',
            'Retificação do valor',
            { pedidoList: [payload], sincrono: true },
            opts.signal
          );
          record('correcao:valor', save, 'ws.SavePedido (retificação)');

          if (save.interpretacao.tipo !== 'ok') {
            falha = `Retificação do valor falhou: ${save.interpretacao.msg}`;
          } else {
            feitos.push(
              `Valor ${Number.isFinite(valorAnterior) ? formatCurrencyBR(valorAnterior) : '--'} → ${formatCurrencyBR(item.valorNum)}`
            );
          }
        }
      }

      // 2) CPF/CNPJ de faturamento (só se o valor não falhou)
      if (item.docDigits !== null && item.docType !== null) {
        const rotulo = item.docType === 'cpf' ? 'CPF' : 'CNPJ';
        if (falha) {
          falha += ` · ${rotulo} não alterado.`;
        } else {
          const save = await callCompy(
            opts.config,
            'ws.SavePedido',
            `Correção do ${rotulo} de faturamento`,
            buildCorrecaoClientePayload(item.xPed, item.docDigits, item.docType),
            opts.signal
          );
          record('correcao:cliente', save, 'ws.SavePedido (CPF/CNPJ faturamento)');

          if (save.interpretacao.tipo !== 'ok') {
            falha = `${rotulo} de faturamento falhou: ${save.interpretacao.msg}`;
          } else {
            feitos.push(`${rotulo} de faturamento → ${formatCpfCnpj(item.docDigits)}`);
          }
        }
      }
    } catch (err) {
      if (err instanceof Interrompido || (err instanceof Error && err.message === 'USER_ABORT')) {
        interrompido = true;
        falha = 'Interrompido pelo usuário';
      } else {
        falha = err instanceof Error ? err.message : 'Erro inesperado';
      }
    }

    const status: OperationStatus = !falha ? 'sucesso' : feitos.length > 0 ? 'parcial' : 'erro';
    const message = [...feitos, ...(falha ? [falha] : [])].join(' · ');
    const result: BulkItemResult = { itemIndex, xPed: itemKey, status, message };

    results.push(result);
    opts.onProgress?.(results.length, total, result);
    if (interrompido) break;
  }

  return { batchId, entries, results, interrompido };
}

export function buildBulkLogJson(entries: BulkLogEntry[]): string {
  return JSON.stringify(entries, null, 2);
}
