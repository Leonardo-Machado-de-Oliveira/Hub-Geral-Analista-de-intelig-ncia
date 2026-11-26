import type { CompyConfig } from '@/src/types/compy';
import { callCompy, isNenhumPedidoEncontrado } from '@/src/lib/compy';

// =========================================================================
// NUMERAÇÃO SEQUENCIAL DE PEDIDOS (prefixo + número), verificada no Compy
// Usada por: BoletoExterna01, 02, ... e MIDIAAVULSA35409, ...
// =========================================================================

export interface SequenciaDef {
  /** Texto fixo antes do número (ex.: "BoletoExterna"). */
  prefixo: string;
  /** Chave do localStorage com o último número usado neste navegador. */
  storageKey: string;
  /** Último número já usado conhecido (a busca começa em ultimoConhecido + 1). */
  ultimoConhecido: number;
  /** Quantidade mínima de dígitos (2 → 01, 02, ... 99, 100). */
  digitos: number;
}

const MAX_SONDAGENS = 30;

export function formatSequencia(def: SequenciaDef, numero: number): string {
  return `${def.prefixo}${String(numero).padStart(def.digitos, '0')}`;
}

/** Extrai o número de um xPed desta sequência (null se não pertencer a ela). */
export function parseSequencia(def: SequenciaDef, xPed: string): number | null {
  if (!xPed.startsWith(def.prefixo)) return null;
  const resto = xPed.slice(def.prefixo.length);
  return /^\d+$/.test(resto) ? Number(resto) : null;
}

export function loadUltimo(def: SequenciaDef): number {
  try {
    const n = Number(localStorage.getItem(def.storageKey));
    return Number.isInteger(n) && n > def.ultimoConhecido ? n : def.ultimoConhecido;
  } catch {
    return def.ultimoConhecido;
  }
}

export function saveUltimo(def: SequenciaDef, numero: number): void {
  try {
    if (numero > loadUltimo(def)) localStorage.setItem(def.storageKey, String(numero));
  } catch {
    // sem persistência local: a sondagem no ERP continua garantindo o próximo número livre
  }
}

/**
 * Procura o próximo número livre consultando o ERP (ws.Pedido), a partir do último
 * número conhecido + 1. Números que já existem no Compy são pulados.
 * Não impede que dois usuários peguem o mesmo número ao mesmo tempo; por isso o
 * fluxo de criação refaz a checagem imediatamente antes do ws.SavePedido.
 */
export async function encontrarProximoLivre(
  def: SequenciaDef,
  config: CompyConfig,
  signal?: AbortSignal,
  onProbe?: (xPed: string) => void
): Promise<{ numero: number; xPed: string }> {
  let numero = loadUltimo(def) + 1;

  for (let i = 0; i < MAX_SONDAGENS; i++, numero++) {
    const xPed = formatSequencia(def, numero);
    onProbe?.(xPed);
    const trace = await callCompy(config, 'ws.Pedido', 'Sondagem numeração', { xPed }, signal);
    if (trace.isAborted) throw new Error('USER_ABORT');

    if (isNenhumPedidoEncontrado(trace.interpretacao)) {
      return { numero, xPed };
    }
    if (trace.interpretacao.tipo === 'ok') {
      saveUltimo(def, numero); // já existe no ERP: avança a referência local
      continue;
    }
    throw new Error(`Não foi possível consultar o Compy: ${trace.interpretacao.msg}`);
  }
  throw new Error(
    `Nenhum número livre encontrado após ${MAX_SONDAGENS} tentativas a partir de ${formatSequencia(def, loadUltimo(def) + 1)}.`
  );
}

/** Sequência dos pedidos da emissão de boleto externa: BoletoExterna01, 02, ... */
export const SEQ_BOLETO_EXTERNA: SequenciaDef = {
  prefixo: 'BoletoExterna',
  storageKey: 'safetitulo_externa_ultimo_v1',
  ultimoConhecido: 0,
  digitos: 2,
};
