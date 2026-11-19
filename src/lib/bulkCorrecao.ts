import type { CallTrace, CompyConfig, OperationStatus } from '@/src/types/compy';
import {
  callCompy,
  formatCpfCnpj,
  formatCurrencyBR,
  isValidCNPJ,
  onlyDigits,
  parseValorBR,
} from '@/src/lib/compy';

// =========================================================================
// SOLUÇÕES EM MASSA VIA API — correção de valor e de CNPJ de faturamento
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
  /** Preenchido apenas no fluxo correcao:valor (já arredondado a 2 casas). */
  valorNum: number | null;
  /** Preenchido apenas no fluxo correcao:cliente (14 dígitos, validado). */
  cnpjDigits: string | null;
}

export interface BulkParseResult {
  items: BulkInputItem[];
  errors: string[];
}

export interface BulkItemResult {
  itemIndex: number;
  xPed: string;
  status: Extract<OperationStatus, 'sucesso' | 'erro'>;
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
// PARSING DA LISTA INFORMADA PELO USUÁRIO
// Formato por linha: "xPed;valor" (correcao:valor) ou "xPed;CNPJ" (correcao:cliente)
// Separadores aceitos: ponto e vírgula ou tabulação.
// =========================================================================
export function parseBulkInput(text: string, flow: BulkFlowId): BulkParseResult {
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

    const parts = line.split(/[;\t]/).map((p) => p.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      const esperado = flow === 'correcao:valor' ? 'valor' : 'CNPJ';
      errors.push(`Linha ${n}: use o formato "xPed;${esperado}".`);
      return;
    }

    const [xPed, segundo] = parts;
    if (!XPED_RE.test(xPed)) {
      errors.push(`Linha ${n}: xPed "${xPed}" contém caracteres inválidos.`);
      return;
    }
    if (seen.has(xPed)) {
      errors.push(`Linha ${n}: xPed "${xPed}" está repetido na lista.`);
      return;
    }
    seen.add(xPed);

    if (flow === 'correcao:valor') {
      const valor = parseValorBR(segundo);
      if (!Number.isFinite(valor) || valor <= 0) {
        errors.push(`Linha ${n}: valor "${segundo}" inválido (deve ser maior que zero).`);
        return;
      }
      items.push({ line: n, xPed, valorNum: Number(valor.toFixed(2)), cnpjDigits: null });
    } else {
      const digits = onlyDigits(segundo);
      if (digits.length !== 14 || !isValidCNPJ(digits)) {
        errors.push(`Linha ${n}: CNPJ "${segundo}" inválido.`);
        return;
      }
      items.push({ line: n, xPed, valorNum: null, cnpjDigits: digits });
    }
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
 * Monta a retificação de valor a partir do pedido consultado (ws.Pedido),
 * no mesmo formato do log de referência.
 * Restrição: somente pedidos com 1 item e qCom = 1 (é o caso coberto pelo log).
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
  if (prodList.length !== 1) {
    throw new Error(
      `Pedido com ${prodList.length} itens; a correção de valor suporta somente pedidos com 1 item.`
    );
  }
  const prod = prodList[0];
  if (Number(prod.qCom) !== 1) {
    throw new Error(`Quantidade ${String(prod.qCom)} diferente de 1; a correção de valor suporta somente qCom = 1.`);
  }

  const valor = Number(novoValor.toFixed(2));
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
  payload.prodList = [{ cProd: prod.cProd, qCom: prod.qCom, vUnCom: valor, vProd: valor }];
  payload.dupList = Array.isArray(pedido.dupList) ? pedido.dupList : [];
  payload.bloqList = Array.isArray(pedido.bloqList) ? pedido.bloqList : [];
  payload.faturar = false;
  payload.codigoObjetivo = CODIGO_OBJETIVO_CORRECAO_VALOR;

  return payload;
}

/** Correção de CNPJ de faturamento: payload parcial, idêntico ao log de referência. */
export function buildCorrecaoClientePayload(xPed: string, cnpjDigits: string) {
  return {
    pedidoList: [{ xPed: String(xPed), cnpjFaturamento: cnpjDigits }],
    sincrono: true,
  };
}

// =========================================================================
// RUNNER EM LOTE (sequencial, uma chamada por vez)
// =========================================================================
export interface BulkRunOptions {
  flow: BulkFlowId;
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
    const record = (trace: CallTrace, step: string) =>
      entries.push(toLogEntry(trace, { flow: opts.flow, batchId, itemIndex, itemKey, step }));

    const erro = (message: string): BulkItemResult => ({ itemIndex, xPed: itemKey, status: 'erro', message });
    const sucesso = (message: string): BulkItemResult => ({ itemIndex, xPed: itemKey, status: 'sucesso', message });

    let result: BulkItemResult;

    try {
      if (opts.flow === 'correcao:valor') {
        // 1) ws.Pedido (consulta) — obrigatório antes da retificação
        const consulta = await callCompy(opts.config, 'ws.Pedido', 'Consulta do pedido', { xPed: item.xPed }, opts.signal);
        record(consulta, 'ws.Pedido (consulta)');

        if (consulta.isAborted) {
          interrompido = true;
          result = erro('Interrompido pelo usuário');
        } else if (consulta.interpretacao.tipo !== 'ok') {
          result = erro(`Consulta falhou: ${consulta.interpretacao.msg}`);
        } else {
          const pedido = (consulta.interpretacao.parsed?.dataObj ?? null) as Record<string, unknown> | null;
          const valorAnterior = pedido ? Number(pedido.vTot) : NaN;

          // 2) monta a retificação a partir do pedido consultado
          const payload = buildCorrecaoValorPayload(item.xPed, pedido, item.valorNum as number);

          // 3) ws.SavePedido (retificação)
          const save = await callCompy(
            opts.config,
            'ws.SavePedido',
            'Retificação do valor',
            { pedidoList: [payload], sincrono: true },
            opts.signal
          );
          record(save, 'ws.SavePedido (retificação)');

          if (save.isAborted) {
            interrompido = true;
            result = erro('Interrompido pelo usuário');
          } else if (save.interpretacao.tipo !== 'ok') {
            result = erro(`Retificação falhou: ${save.interpretacao.msg}`);
          } else {
            result = sucesso(
              `Valor alterado de ${Number.isFinite(valorAnterior) ? formatCurrencyBR(valorAnterior) : '--'} para ${formatCurrencyBR(item.valorNum)}`
            );
          }
        }
      } else {
        // correcao:cliente — ws.SavePedido (CPF/CNPJ faturamento)
        const save = await callCompy(
          opts.config,
          'ws.SavePedido',
          'Correção do CNPJ de faturamento',
          buildCorrecaoClientePayload(item.xPed, item.cnpjDigits as string),
          opts.signal
        );
        record(save, 'ws.SavePedido (CPF/CNPJ faturamento)');

        if (save.isAborted) {
          interrompido = true;
          result = erro('Interrompido pelo usuário');
        } else if (save.interpretacao.tipo !== 'ok') {
          result = erro(`Falhou: ${save.interpretacao.msg}`);
        } else {
          result = sucesso(`CNPJ de faturamento alterado para ${formatCpfCnpj(item.cnpjDigits)}`);
        }
      }
    } catch (err) {
      result = erro(err instanceof Error ? err.message : 'Erro inesperado');
    }

    if (interrompido && result.message === 'Interrompido pelo usuário') {
      results.push(result);
      opts.onProgress?.(results.length, total, result);
      break;
    }

    results.push(result);
    opts.onProgress?.(results.length, total, result);
  }

  return { batchId, entries, results, interrompido };
}

export function buildBulkLogJson(entries: BulkLogEntry[]): string {
  return JSON.stringify(entries, null, 2);
}
