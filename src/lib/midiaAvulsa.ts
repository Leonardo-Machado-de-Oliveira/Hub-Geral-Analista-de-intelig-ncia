import type { CompyConfig, DocValidationResult } from '@/src/types/compy';
import {
  callCompy,
  formatDateBR,
  getTodayLocalMidnight,
  isNenhumPedidoEncontrado,
  parseYMDLocal,
} from '@/src/lib/compy';

// =========================================================================
// VENDA AVULSA DE MÍDIAS (TOKEN / CARTÃO / LEITORA)
// =========================================================================

export type MidiaProdutoId = 'TOKEN' | 'CARTAO' | 'LEITORA';

export interface MidiaComponente {
  nome: string;
  cProd: number;
  qCom: number;
}

export interface MidiaProduto {
  id: MidiaProdutoId;
  label: string;
  componentes: MidiaComponente[];
}

/** Composição definida pela regra de negócio. Quantidade sempre 1 UN por item. */
export const MIDIA_PRODUTOS: MidiaProduto[] = [
  {
    id: 'TOKEN',
    label: 'TOKEN',
    componentes: [
      { nome: 'Token', cProd: 5010231, qCom: 1 },
      { nome: 'Middleware Token', cProd: 5010302, qCom: 1 },
    ],
  },
  {
    id: 'CARTAO',
    label: 'CARTÃO',
    componentes: [
      { nome: 'Cartão', cProd: 3689, qCom: 1 },
      { nome: 'Middleware Cartão', cProd: 5010301, qCom: 1 },
    ],
  },
  {
    id: 'LEITORA',
    label: 'LEITORA',
    componentes: [{ nome: 'Leitora', cProd: 501022, qCom: 1 }],
  },
];

export function getMidiaProduto(id: MidiaProdutoId | ''): MidiaProduto | null {
  return MIDIA_PRODUTOS.find((p) => p.id === id) ?? null;
}

// -------------------------------------------------------------------------
// Numeração MIDIAAVULSA
// -------------------------------------------------------------------------
export const MIDIA_PREFIXO = 'MIDIAAVULSA';
/** Último número conhecido no ERP quando o módulo foi criado (MIDIAAVULSA35408). */
export const MIDIA_ULTIMO_CONHECIDO = 35408;
export const MIDIA_ULTIMO_STORAGE_KEY = 'safetitulo_midia_ultimo_v1';
export const MIDIA_PRECOS_STORAGE_KEY = 'safetitulo_midia_precos_v1';
export const MIDIA_PARAMS_STORAGE_KEY = 'safetitulo_midia_params_v1';
const MAX_SONDAGENS = 30;

export function formatMidiaXPed(numero: number): string {
  return `${MIDIA_PREFIXO}${numero}`;
}

export function loadUltimoMidia(): number {
  try {
    const n = Number(localStorage.getItem(MIDIA_ULTIMO_STORAGE_KEY));
    return Number.isInteger(n) && n > MIDIA_ULTIMO_CONHECIDO ? n : MIDIA_ULTIMO_CONHECIDO;
  } catch {
    return MIDIA_ULTIMO_CONHECIDO;
  }
}

export function saveUltimoMidia(numero: number): void {
  try {
    if (numero > loadUltimoMidia()) localStorage.setItem(MIDIA_ULTIMO_STORAGE_KEY, String(numero));
  } catch {
    // sem persistência local: a sondagem no ERP continua garantindo o próximo número livre
  }
}

/**
 * Procura o próximo MIDIAAVULSA livre consultando o ERP (ws.Pedido), a partir do
 * último número conhecido + 1. Números já existentes no Compy são pulados.
 * Observação: não impede que dois usuários peguem o mesmo número ao mesmo tempo;
 * por isso o fluxo de criação refaz a checagem imediatamente antes do ws.SavePedido.
 */
export async function encontrarProximoMidiaLivre(
  config: CompyConfig,
  signal?: AbortSignal,
  onProbe?: (xPed: string) => void
): Promise<{ numero: number; xPed: string }> {
  let numero = loadUltimoMidia() + 1;

  for (let i = 0; i < MAX_SONDAGENS; i++, numero++) {
    const xPed = formatMidiaXPed(numero);
    onProbe?.(xPed);
    const trace = await callCompy(config, 'ws.Pedido', 'Sondagem numeração', { xPed }, signal);
    if (trace.isAborted) throw new Error('USER_ABORT');

    if (isNenhumPedidoEncontrado(trace.interpretacao)) {
      return { numero, xPed };
    }
    if (trace.interpretacao.tipo === 'ok') {
      saveUltimoMidia(numero); // já existe no ERP: avança a referência local
      continue;
    }
    throw new Error(`Não foi possível consultar o Compy: ${trace.interpretacao.msg}`);
  }
  throw new Error(
    `Nenhum número livre encontrado após ${MAX_SONDAGENS} tentativas a partir de ${formatMidiaXPed(loadUltimoMidia() + 1)}.`
  );
}

// -------------------------------------------------------------------------
// Preços (opcional): só usados se o Compy não precificar sozinho via API
// -------------------------------------------------------------------------
export type MidiaPrecos = Record<string, number>; // chave = cProd

export function loadMidiaPrecos(): MidiaPrecos {
  try {
    const raw = localStorage.getItem(MIDIA_PRECOS_STORAGE_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    const out: MidiaPrecos = {};
    for (const [k, v] of Object.entries(obj ?? {})) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out[k] = Number(n.toFixed(2));
    }
    return out;
  } catch {
    return {};
  }
}

export function saveMidiaPrecos(precos: MidiaPrecos): void {
  try {
    localStorage.setItem(MIDIA_PRECOS_STORAGE_KEY, JSON.stringify(precos));
  } catch {
    // ignore
  }
}

export interface MidiaParams {
  codigoObjetivo: string;
  codigoCobranca: string;
}

/**
 * Padrões da venda avulsa de mídias. Via API o Compy não aplica objetivo/cobrança
 * sozinho (erro "O objetivo para serviço não foi encontrado").
 * - Objetivo "Prestação de Serviço e-commerce": C18 (EM TESTE; o Compy lista o ID 18,
 *   código segue o padrão C15 da emissão).
 * - Cobrança: 1 (boleto Safe2Pay, o mesmo da emissão de títulos).
 */
export const MIDIA_PARAMS_PADRAO: MidiaParams = {
  codigoObjetivo: 'C18',
  codigoCobranca: '1',
};

export function loadMidiaParams(): MidiaParams {
  try {
    const raw = localStorage.getItem(MIDIA_PARAMS_STORAGE_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    const pick = (v: unknown, padrao: string) =>
      typeof v === 'string' && v.trim() !== '' ? v.trim() : padrao;
    return {
      codigoObjetivo: pick(obj?.codigoObjetivo, MIDIA_PARAMS_PADRAO.codigoObjetivo),
      codigoCobranca: pick(obj?.codigoCobranca, MIDIA_PARAMS_PADRAO.codigoCobranca),
    };
  } catch {
    return { ...MIDIA_PARAMS_PADRAO };
  }
}

export function saveMidiaParams(params: MidiaParams): void {
  try {
    localStorage.setItem(MIDIA_PARAMS_STORAGE_KEY, JSON.stringify(params));
  } catch {
    // ignore
  }
}

export interface MidiaItemCalculado extends MidiaComponente {
  vUnCom: number | null;
  vProd: number | null;
}

export interface MidiaComposicao {
  itens: MidiaItemCalculado[];
  /** Total só é conhecido se todos os itens tiverem preço configurado. */
  total: number | null;
  precoPeloErp: boolean;
}

export function calcularComposicao(produto: MidiaProduto, precos: MidiaPrecos): MidiaComposicao {
  const itens = produto.componentes.map((c) => {
    const p = precos[String(c.cProd)];
    const vUnCom = Number.isFinite(p) ? p : null;
    return {
      ...c,
      vUnCom,
      vProd: vUnCom === null ? null : Number((vUnCom * c.qCom).toFixed(2)),
    };
  });
  const todosComPreco = itens.every((i) => i.vProd !== null);
  const total = todosComPreco
    ? Number(itens.reduce((acc, i) => acc + (i.vProd as number), 0).toFixed(2))
    : null;
  return { itens, total, precoPeloErp: !todosComPreco };
}

// -------------------------------------------------------------------------
// Payload ws.SavePedido
// -------------------------------------------------------------------------
export interface MidiaPedidoInput {
  xPed: string;
  docInfo: DocValidationResult;
  composicao: MidiaComposicao;
  vencYmd: string;
  params: MidiaParams;
}

export function buildMidiaSavePedidoPayload(inp: MidiaPedidoInput) {
  const pedido: Record<string, unknown> = {};
  if (inp.docInfo.type === 'cnpj') {
    pedido.cnpj = inp.docInfo.digits;
    pedido.cnpjFaturamento = inp.docInfo.digits;
  } else {
    pedido.cpf = inp.docInfo.digits;
    pedido.cpfFaturamento = inp.docInfo.digits;
  }
  pedido.xPed = inp.xPed;
  pedido.codigoObjetivo = inp.params.codigoObjetivo.trim() || MIDIA_PARAMS_PADRAO.codigoObjetivo;
  pedido.faturar = false;

  // Sem preço configurado, vai só código + quantidade: o Compy aplica a tabela de preços dele.
  // Com preço configurado em todos os itens, envia vUnCom/vProd.
  pedido.prodList = inp.composicao.itens.map((i) => {
    const item: Record<string, unknown> = { cProd: i.cProd, qCom: i.qCom };
    if (!inp.composicao.precoPeloErp && i.vUnCom !== null && i.vProd !== null) {
      item.vUnCom = i.vUnCom;
      item.vProd = i.vProd;
    }
    return item;
  });

  const dup: Record<string, unknown> = {
    dVenc: formatDateBR(inp.vencYmd),
    podeEnviarImediatamente: true,
  };
  dup.codigoCobranca = inp.params.codigoCobranca.trim() || MIDIA_PARAMS_PADRAO.codigoCobranca;
  pedido.dupList = [dup];

  return { pedidoList: [pedido], sincrono: true };
}

// -------------------------------------------------------------------------
// Validação (mesmas regras de vencimento da emissão de títulos)
// -------------------------------------------------------------------------
export function validateMidiaPedido(inp: {
  xPed: string;
  docInfo: DocValidationResult;
  produto: MidiaProduto | null;
  composicao: MidiaComposicao | null;
  vencYmd: string;
}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!/^MIDIAAVULSA\d+$/.test(inp.xPed)) {
    errors.push('Número do pedido não gerado. Clique em "Gerar número".');
  }
  if (!inp.docInfo.valid) {
    errors.push(inp.docInfo.error || 'CPF/CNPJ do cliente inválido.');
  }
  if (!inp.produto) {
    errors.push('Selecione o produto (TOKEN, CARTÃO ou LEITORA).');
  } else if (!inp.composicao || inp.composicao.itens.length !== inp.produto.componentes.length) {
    errors.push('Composição do produto não carregada.');
  } else {
    for (const i of inp.composicao.itens) {
      if (!Number.isInteger(i.cProd) || i.cProd <= 0) errors.push(`Código de produto inválido: ${i.cProd}.`);
      if (i.qCom !== 1) errors.push(`Quantidade inválida para ${i.nome}.`);
    }
  }

  const venc = parseYMDLocal(inp.vencYmd);
  if (!venc) {
    errors.push('Informe uma data de vencimento válida.');
  } else {
    const diff = Math.round((venc.getTime() - getTodayLocalMidnight().getTime()) / 86400000);
    if (diff < 0 || diff > 10) {
      errors.push(`Vencimento deve estar entre hoje e +10 dias (atual: ${diff >= 0 ? `+${diff}` : diff} dias).`);
    }
  }

  return { ok: errors.length === 0, errors };
}
