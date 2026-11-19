import type {
  CallInterpretation,
  CallTrace,
  CompyConfig,
  DocType,
  DocValidationResult,
  ExecutionRecord,
  FormInputs,
  HistoryEntry,
  ParsedSafeWebResponse,
} from '@/src/types/compy';

export const CONFIG_STORAGE_KEY = 'safetitulo_compy_config_v1';
export const HISTORY_STORAGE_KEY = 'safetitulo_historico_v1';

export const DEFAULT_CONFIG: CompyConfig = {
  endpoint: 'https://erp.safeweb.com.br/compy/app/ws',
  domain: 'safeweb',
  license: '3',
  user: '1018132',
  timeoutSec: 30,
  confTentativas: 3,
  titTentativas: 3,
  intervaloSec: 5,
};

export const STEP_LABELS = [
  '1. Validação',
  '2. ws.Pedido (já existe?)',
  '3. ws.SavePedido',
  '4. ws.Pedido (conferência)',
  '5. ws.Titulo',
];

export function onlyDigits(str: unknown): string {
  return String(str ?? '').replace(/\D/g, '');
}

export function formatCpfCnpj(digits: unknown): string {
  const d = onlyDigits(digits).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function maskCpfCnpj(raw: unknown): string {
  const d = onlyDigits(raw);
  if (!d) return '--';
  if (d.length === 11) {
    return `${d.slice(0, 3)}.***.***-${d.slice(9, 11)}`;
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.***.***/${d.slice(8, 12)}-${d.slice(12, 14)}`;
  }
  if (d.length > 4) {
    return `${d.slice(0, 2)}${'*'.repeat(d.length - 4)}${d.slice(-2)}`;
  }
  return String(raw ?? '--');
}

export function isValidCPF(cpf: unknown): boolean {
  const d = onlyDigits(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev >= 10) rev = 0;
  if (rev !== Number(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev >= 10) rev = 0;
  return rev === Number(d[10]);
}

export function isValidCNPJ(cnpj: unknown): boolean {
  const d = onlyDigits(cnpj);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calcDigit = (slice: string, weights: number[]) => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) sum += Number(slice[i]) * weights[i];
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calcDigit(d.slice(0, 12), w1);
  if (d1 !== Number(d[12])) return false;
  const d2 = calcDigit(d.slice(0, 13), w2);
  return d2 === Number(d[13]);
}

export function validateCpfCnpj(raw: unknown): DocValidationResult {
  const d = onlyDigits(raw);
  if (d.length === 11) {
    const valid = isValidCPF(d);
    return {
      valid,
      type: 'cpf',
      digits: d,
      error: valid ? null : 'CPF inválido (dígito verificador incorreto).',
    };
  }
  if (d.length === 14) {
    const valid = isValidCNPJ(d);
    return {
      valid,
      type: 'cnpj',
      digits: d,
      error: valid ? null : 'CNPJ inválido (dígito verificador incorreto).',
    };
  }
  return {
    valid: false,
    type: null,
    digits: d,
    error: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.',
  };
}

export function parseValorBR(raw: unknown): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : NaN;
  }
  let s = String(raw ?? '')
    .trim()
    .replace(/^R\$\s*/i, '')
    .replace(/\s+/g, '');
  if (!s) return NaN;
  if (s.includes(',')) {
    if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(s)) return NaN;
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes('.')) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    } else if (!/^\d+(\.\d+)?$/.test(s)) {
      return NaN;
    }
  } else if (!/^\d+$/.test(s)) {
    return NaN;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function formatCurrencyBR(num: unknown): string {
  const n = Number(num);
  if (!Number.isFinite(n)) return '--';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDurationMs(ms?: number | null): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) return '--';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2).replace('.', ',')} s`;
}

export function getTodayLocalMidnight(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function formatDateYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateBR(ymd: string): string {
  const parts = String(ymd || '').split('-');
  if (parts.length !== 3) return '';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function parseYMDLocal(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

export function generateXPed(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `PED-${y}${m}${d}-${rand}`;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('USER_ABORT'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('USER_ABORT'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// =========================================================================
// CONFIG STORAGE (localStorage)
// =========================================================================
export function loadConfig(): CompyConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      endpoint: String(parsed.endpoint || DEFAULT_CONFIG.endpoint).trim(),
      domain: String(parsed.domain || DEFAULT_CONFIG.domain).trim(),
      license: String(parsed.license || DEFAULT_CONFIG.license).trim(),
      user: String(parsed.user || DEFAULT_CONFIG.user).trim(),
      timeoutSec: Math.max(2, Number(parsed.timeoutSec) || DEFAULT_CONFIG.timeoutSec),
      confTentativas: Math.max(1, Number(parsed.confTentativas) || DEFAULT_CONFIG.confTentativas),
      titTentativas: Math.max(1, Number(parsed.titTentativas) || DEFAULT_CONFIG.titTentativas),
      intervaloSec: Math.max(1, Number(parsed.intervaloSec) || DEFAULT_CONFIG.intervaloSec),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg: CompyConfig): void {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cfg));
}

export function extractConfigHost(cfg: CompyConfig): string {
  try {
    const u = new URL(cfg.endpoint);
    return u.host;
  } catch {
    return cfg.endpoint || 'erp.safeweb.com.br';
  }
}

// =========================================================================
// COMPY RESPONSE PARSING & INTERPRETATION
// =========================================================================
export function tryParse(val: unknown): unknown {
  let current = val;
  for (let i = 0; i < 2; i++) {
    if (typeof current === 'string') {
      const trimmed = current.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          current = JSON.parse(trimmed);
          continue;
        } catch {
          break;
        }
      }
    }
    break;
  }
  return current;
}

export function limparMsgCompy(msg: unknown): string {
  if (msg === null || msg === undefined) return '';
  let s = String(msg);
  s = s.replace(/<div[^>]*class=['"]dica['"][^>]*>[\s\S]*?<\/div>/gi, '');
  s = s.replace(/<li[^>]*>/gi, '\n• ');
  s = s.replace(/<\/li>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  const lines = s
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => {
      if (!line) return false;
      if (/\(\d+\)\s*$/.test(line)) return false;
      if (/Exception/i.test(line)) return false;
      if (/\b(api|comercial|offline|fiscal)\.[a-zA-Z]/.test(line)) return false;
      return true;
    });
  return lines.join(' · ').replace(/\s+/g, ' ').trim();
}

function extractNodeMessage(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;
  const raw = n.mensagem || n.message || n.error || n.msg || '';
  return typeof raw === 'string' ? raw : raw ? JSON.stringify(raw) : '';
}

export function findExplicitFailure(data: unknown): string | null {
  function walk(node: unknown, depth: number, siblingArray: unknown[] | null): string | null {
    if (depth > 4 || node === null || node === undefined) return null;
    const parsed = tryParse(node);
    if (Array.isArray(parsed)) {
      for (let i = 0; i < parsed.length; i++) {
        const found = walk(parsed[i], depth + 1, parsed);
        if (found !== null) return found;
      }
      return null;
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const statusUpper = typeof obj.status === 'string' ? obj.status.trim().toLowerCase() : '';
      const hasExplicitErrorField =
        obj.error !== undefined &&
        obj.error !== null &&
        (typeof obj.error !== 'string' || obj.error.trim() !== '') &&
        obj.error !== false;
      const isFailure =
        obj.success === false ||
        obj.success === 'false' ||
        obj.ok === false ||
        statusUpper === 'erro' ||
        statusUpper === 'error' ||
        statusUpper === 'fail' ||
        statusUpper === 'falha' ||
        hasExplicitErrorField;

      if (isFailure) {
        let msg = extractNodeMessage(obj);
        if (!msg && Array.isArray(siblingArray)) {
          for (let j = 0; j < siblingArray.length; j++) {
            const sib = tryParse(siblingArray[j]);
            if (sib === obj) continue;
            if (typeof sib === 'string' && sib.trim()) {
              msg = sib;
              break;
            }
            const sibMsg = extractNodeMessage(sib);
            if (sibMsg) {
              msg = sibMsg;
              break;
            }
          }
        }
        return limparMsgCompy(msg || 'Operação recusada pelo Compy');
      }

      const keys = Object.keys(obj);
      for (let k = 0; k < keys.length; k++) {
        const child = obj[keys[k]];
        if (child && (typeof child === 'object' || typeof child === 'string')) {
          const found = walk(child, depth + 1, null);
          if (found !== null) return found;
        }
      }
    }
    return null;
  }
  return walk(data, 0, null);
}

export function mergeArrayObjects(arr: unknown[]): Record<string, unknown> | null {
  const merged: Record<string, unknown> = {};
  let hasObj = false;
  for (let i = 0; i < arr.length; i++) {
    const item = tryParse(arr[i]);
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      hasObj = true;
      Object.assign(merged, item);
    }
  }
  return hasObj ? merged : null;
}

export function parseSafeWebResponse(raw: unknown): ParsedSafeWebResponse {
  if (raw === null || raw === undefined || raw === '') {
    return { success: false, errorMessage: 'Resposta vazia do Compy', dataObj: null, successMessage: '' };
  }
  const parsed = tryParse(raw);

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return { success: false, errorMessage: 'Resposta vazia do Compy', dataObj: null, successMessage: '' };
    }
    const el0 = tryParse(parsed[0]) as Record<string, unknown> | string | null;
    const el1 = parsed.length > 1 ? (tryParse(parsed[1]) as Record<string, unknown> | null) : null;
    const elLast = parsed.length > 2 ? (tryParse(parsed[parsed.length - 1]) as Record<string, unknown> | null) : null;
    const mergedObj = mergeArrayObjects(parsed);

    const isEl1Fail = el1 && typeof el1 === 'object' && !Array.isArray(el1) && el1.success === false;
    const isEl0Fail =
      el0 && typeof el0 === 'object' && !Array.isArray(el0) && (el0.success === false || Boolean(el0.error));
    if (isEl1Fail || isEl0Fail) {
      const msg =
        (el0 && typeof el0 === 'object' ? el0.mensagem || el0.message || el0.error : null) ||
        (typeof el0 === 'string' ? el0 : null) ||
        (el1 && typeof el1 === 'object' ? el1.mensagem || el1.message || el1.error : null) ||
        JSON.stringify(parsed[0]);
      return { success: false, errorMessage: String(msg), dataObj: mergedObj, successMessage: '' };
    }

    const hasSuccessEl1 =
      el1 &&
      typeof el1 === 'object' &&
      (el1.success === true || el1.ok === true || String(el1.status || '').toUpperCase() === 'OK');
    const hasSuccessElLast =
      elLast &&
      typeof elLast === 'object' &&
      (elLast.success === true || elLast.ok === true || String(elLast.status || '').toUpperCase() === 'OK');
    const hasSuccessEl0 = el0 && typeof el0 === 'object' && (el0.success === true || el0.ok === true);

    if (hasSuccessEl1 || hasSuccessElLast || hasSuccessEl0) {
      const successMsg =
        (el0 && typeof el0 === 'object' ? el0.mensagem || el0.message : null) ||
        (typeof el0 === 'string' ? el0 : '') ||
        '';
      return {
        success: true,
        successMessage: String(successMsg),
        dataObj: mergedObj || (typeof el0 === 'object' && el0 ? el0 : { mensagem: String(el0) }),
      };
    }

    if (el0 && typeof el0 === 'object' && !Array.isArray(el0)) {
      return {
        success: true,
        successMessage: String(el0.mensagem || el0.message || ''),
        dataObj: mergedObj || el0,
      };
    }

    return {
      success: false,
      errorMessage: typeof el0 === 'string' ? el0 : 'Formato de array inesperado do Compy',
      dataObj: mergedObj,
      successMessage: '',
    };
  }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const statusUp = String(obj.status || '').toUpperCase();
    if (obj.success === true || obj.ok === true || statusUp === 'SUCCESS') {
      return {
        success: true,
        successMessage: String(obj.mensagem || obj.message || ''),
        dataObj: obj,
      };
    }
    if (obj.success === false || obj.ok === false || obj.error) {
      return {
        success: false,
        errorMessage: String(obj.mensagem || obj.message || obj.error || 'Erro retornado pelo Compy'),
        dataObj: obj,
        successMessage: '',
      };
    }
    if (
      obj.xPed !== undefined ||
      obj.vTot !== undefined ||
      obj.VTot !== undefined ||
      obj.numero !== undefined ||
      obj.prodList !== undefined
    ) {
      return {
        success: true,
        successMessage: String(obj.mensagem || obj.message || ''),
        dataObj: obj,
      };
    }
    return {
      success: false,
      errorMessage: String(obj.mensagem || obj.message || 'Resposta não reconhecida do Compy'),
      dataObj: obj,
      successMessage: '',
    };
  }

  if (typeof parsed === 'string') {
    const hasOkWord = /\b(sucesso|pronto|ok)\b/i.test(parsed);
    const hasBadWord = /(erro|error|falha|inv[áa]lid|exception|n[ãa]o encontrad|nao encontrad|recusad)/i.test(parsed);
    if (hasOkWord && !hasBadWord) {
      return { success: true, successMessage: parsed, dataObj: { mensagem: parsed } };
    }
    return { success: false, errorMessage: parsed, dataObj: null, successMessage: '' };
  }

  return { success: false, errorMessage: 'Resposta não reconhecida do Compy', dataObj: null, successMessage: '' };
}

export function isHtmlBody(text: unknown): boolean {
  const t = String(text || '').trim().toLowerCase();
  return (
    t.startsWith('<!doctype html') ||
    t.startsWith('<html') ||
    t.startsWith('<head') ||
    t.startsWith('<body')
  );
}

export function extractHtmlTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html || ''));
  if (!m) return 'sem título';
  return m[1].replace(/\s+/g, ' ').trim() || 'sem título';
}

export function interpretar(trace: Omit<CallTrace, 'interpretacao'>): CallInterpretation {
  if (trace.fetchError) {
    if (trace.isTimeout) {
      return {
        tipo: 'transporte',
        msg: `O Compy não respondeu em ${trace.timeoutSec}s`,
        parsed: null,
      };
    }
    if (trace.isAborted) {
      return {
        tipo: 'transporte',
        msg: 'Execução interrompida pelo usuário',
        parsed: null,
      };
    }
    return {
      tipo: 'transporte',
      msg: 'O navegador não conseguiu falar com o Compy. Ligue a extensão de CORS e confirme que está na rede da empresa.',
      parsed: null,
    };
  }

  const raw = trace.responseBodyRaw || '';
  const status = trace.httpStatus ?? 0;
  const httpOk = status >= 200 && status < 300;

  if (isHtmlBody(raw)) {
    const title = extractHtmlTitle(raw);
    return {
      tipo: 'html',
      msg: `O Compy devolveu uma página HTML (HTTP ${status} · "${title}") em vez de JSON. Confira domain/license/user nas Configurações.`,
      parsed: null,
    };
  }

  let jsonBody: unknown = null;
  let isJson = false;
  try {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) {
      jsonBody = tryParse(trimmed);
      isJson = typeof jsonBody === 'object' && jsonBody !== null;
    }
  } catch {
    isJson = false;
  }

  if (isJson) {
    const explicitFail = findExplicitFailure(jsonBody);
    if (explicitFail !== null) {
      return {
        tipo: 'negocio',
        msg: explicitFail,
        parsed: {
          success: false,
          errorMessage: explicitFail,
          dataObj: Array.isArray(jsonBody)
            ? mergeArrayObjects(jsonBody)
            : (jsonBody as Record<string, unknown>),
          rawJson: jsonBody,
        },
      };
    }
  }

  const parsed = parseSafeWebResponse(isJson ? jsonBody : raw);
  if (isJson) parsed.rawJson = jsonBody;

  if (!parsed.success) {
    const cleanErr = limparMsgCompy(parsed.errorMessage) || 'Erro retornado pelo Compy';
    if (httpOk) {
      return { tipo: 'negocio', msg: cleanErr, parsed };
    }
    return {
      tipo: 'http',
      msg: `HTTP ${status}${cleanErr ? ` · ${cleanErr}` : ''}`,
      parsed,
    };
  }

  if (!httpOk) {
    return {
      tipo: 'http',
      msg: `HTTP ${status}${parsed.successMessage ? ` · ${limparMsgCompy(parsed.successMessage)}` : ''}`,
      parsed,
    };
  }

  return {
    tipo: 'ok',
    msg: limparMsgCompy(parsed.successMessage) || 'OK',
    parsed,
  };
}

export function isNenhumPedidoEncontrado(interp?: CallInterpretation | null): boolean {
  if (!interp || !interp.msg) return false;
  return (interp.tipo === 'negocio' || interp.tipo === 'http') && /nenhum\s+pedido\s+encontrado/i.test(interp.msg);
}

export function isNenhumTituloEncontrado(interp?: CallInterpretation | null): boolean {
  if (!interp || !interp.msg) return false;
  return (interp.tipo === 'negocio' || interp.tipo === 'http') && /nenhum\s+t[ií]tulo\s+encontrado/i.test(interp.msg);
}

// =========================================================================
// DIRECT BROWSER FETCH TO COMPY
// =========================================================================
export function buildCompyUrl(config: CompyConfig, neuron: string): string {
  const url = new URL(config.endpoint.trim());
  url.searchParams.set('domain', config.domain.trim());
  url.searchParams.set('license', config.license.trim());
  url.searchParams.set('neuron', neuron);
  url.searchParams.set('user', config.user.trim());
  return url.toString();
}

export async function callCompy(
  config: CompyConfig,
  neuron: string,
  etapa: string,
  payloadObj: unknown,
  parentAbortSignal?: AbortSignal | null
): Promise<CallTrace> {
  const url = buildCompyUrl(config, neuron);
  const requestBodyRaw = JSON.stringify(payloadObj);
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
  };

  const callController = new AbortController();
  let isTimeout = false;
  let isAborted = false;

  const onParentAbort = () => {
    isAborted = true;
    callController.abort();
  };
  if (parentAbortSignal) {
    if (parentAbortSignal.aborted) {
      isAborted = true;
      callController.abort();
    } else {
      parentAbortSignal.addEventListener('abort', onParentAbort, { once: true });
    }
  }

  const timeoutSec = Number(config.timeoutSec) || 30;
  const timeoutMs = timeoutSec * 1000;
  const timeoutTimer = setTimeout(() => {
    isTimeout = true;
    callController.abort();
  }, timeoutMs);

  const startedAt = performance.now();
  const baseTrace: Omit<CallTrace, 'interpretacao'> = {
    index: 0,
    timestampIso: new Date().toISOString(),
    neuron,
    etapa,
    url,
    requestHeaders,
    requestBodyRaw,
    httpStatus: null,
    statusText: '',
    responseHeaders: {},
    responseBodyRaw: '',
    durationMs: 0,
    timeoutSec,
    fetchError: null,
    isTimeout: false,
    isAborted: false,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: requestHeaders,
      body: requestBodyRaw,
      signal: callController.signal,
    });
    baseTrace.httpStatus = res.status;
    baseTrace.statusText = res.statusText || '';
    const respHeaders: Record<string, string> = {};
    res.headers.forEach((val, key) => {
      respHeaders[key] = val;
    });
    baseTrace.responseHeaders = respHeaders;
    baseTrace.responseBodyRaw = await res.text();
  } catch (err: unknown) {
    const e = err as { message?: string } | null;
    baseTrace.fetchError = e?.message ? String(e.message) : String(err || 'Erro de rede');
    baseTrace.isTimeout = isTimeout;
    baseTrace.isAborted = isAborted;
  } finally {
    clearTimeout(timeoutTimer);
    if (parentAbortSignal) {
      parentAbortSignal.removeEventListener('abort', onParentAbort);
    }
    baseTrace.durationMs = Math.round(performance.now() - startedAt);
  }

  return {
    ...baseTrace,
    interpretacao: interpretar(baseTrace),
  };
}

// =========================================================================
// PAYLOAD BUILDERS (ORIGINAL CONTRACT PRESERVED)
// =========================================================================
export function buildSavePedidoPayload(inp: FormInputs) {
  const pedido: Record<string, unknown> = {};
  if (inp.docInfo.type === 'cnpj') {
    pedido.cnpj = inp.docInfo.digits;
    pedido.cnpjFaturamento = inp.docInfo.digits;
  } else {
    pedido.cpf = inp.docInfo.digits;
    pedido.cpfFaturamento = inp.docInfo.digits;
  }
  pedido.xPed = inp.xPed;
  pedido.codigoObjetivo = inp.codigoObjetivo;
  if (inp.codigoClassificacao !== '') {
    pedido.codigoClassificacao = inp.codigoClassificacao;
  }
  pedido.faturar = Boolean(inp.faturar);
  pedido.prodList = [
    {
      cProd: Number(inp.cProd),
      qCom: Number(inp.qCom),
      vProd: Number(inp.valorNum.toFixed(2)),
    },
  ];
  pedido.dupList = [
    {
      dVenc: formatDateBR(inp.vencYmd),
      codigoCobranca: String(inp.codigoCobranca),
      podeEnviarImediatamente: true,
    },
  ];

  return {
    pedidoList: [pedido],
    sincrono: true,
  };
}

export function buildPedidoPayload(xPed: string) {
  return { xPed: String(xPed) };
}

export function buildTituloPayload(xPed: string, docType: DocType, docDigits: string) {
  const obj: Record<string, string> = { numero: String(xPed) };
  if (docType === 'cnpj') {
    obj.cnpj = docDigits;
  } else {
    obj.cpf = docDigits;
  }
  return obj;
}

// =========================================================================
// LOCAL VALIDATION
// =========================================================================
export interface FieldErrorMap {
  xPed?: string;
  clienteDoc?: string;
  valorProd?: string;
  tituloVencimento?: string;
  cProd?: string;
  qCom?: string;
  codigoObjetivo?: string;
  codigoCobranca?: string;
  general?: string;
}

export function validateFormForCreate(inp: FormInputs): { ok: boolean; errors: string[]; fieldErrors: FieldErrorMap } {
  const errors: string[] = [];
  const fieldErrors: FieldErrorMap = {};

  if (!inp.xPed || !/^[A-Za-z0-9_\-.+]+$/.test(inp.xPed)) {
    const msg = 'xPed obrigatório e deve conter apenas [A-Za-z0-9_\\-.+].';
    fieldErrors.xPed = msg;
    errors.push(msg);
  }

  if (!inp.docInfo.valid) {
    const msg = inp.docInfo.error || 'CPF/CNPJ inválido.';
    fieldErrors.clienteDoc = msg;
    errors.push(msg);
  }

  if (!Number.isFinite(inp.valorNum) || inp.valorNum <= 0) {
    const msg = 'Informe um valor maior que zero (ex: 150,00 ou 1.234,56).';
    fieldErrors.valorProd = msg;
    errors.push(msg);
  }

  const vencDate = parseYMDLocal(inp.vencYmd);
  const today = getTodayLocalMidnight();
  if (!vencDate) {
    const msg = 'Informe uma data de vencimento válida.';
    fieldErrors.tituloVencimento = msg;
    errors.push(msg);
  } else {
    const diffDays = Math.round((vencDate.getTime() - today.getTime()) / 86400000);
    if (diffDays < 0 || diffDays > 10) {
      const msg = `Vencimento deve estar entre hoje e +10 dias (atual: ${diffDays >= 0 ? `+${diffDays}` : diffDays} dias).`;
      fieldErrors.tituloVencimento = msg;
      errors.push(msg);
    }
  }

  if (!Number.isInteger(inp.cProd) || inp.cProd <= 0) {
    const msg = 'cProd deve ser um número inteiro maior que zero.';
    fieldErrors.cProd = msg;
    errors.push(msg);
  }

  if (!Number.isFinite(inp.qCom) || inp.qCom <= 0) {
    const msg = 'qCom deve ser maior que zero.';
    fieldErrors.qCom = msg;
    errors.push(msg);
  }

  if (!inp.codigoObjetivo) {
    const msg = 'codigoObjetivo é obrigatório.';
    fieldErrors.codigoObjetivo = msg;
    errors.push(msg);
  }

  if (!inp.codigoCobranca) {
    const msg = 'codigoCobranca é obrigatório.';
    fieldErrors.codigoCobranca = msg;
    errors.push(msg);
  }

  if (errors.length > 0) {
    fieldErrors.general = `Corrija os campos inválidos antes de prosseguir: ${errors[0]}`;
    return { ok: false, errors, fieldErrors };
  }
  return { ok: true, errors: [], fieldErrors };
}

// =========================================================================
// BOLETO & DOWNLOAD HELPERS
// =========================================================================
export function findBoletoLink(obj: unknown): string | null {
  const priorityKeys = ['boleto', 'Boleto', 'urlBoleto', 'linkBoleto', 'url', 'Url', 'link', 'pdfUrl'];

  function searchTop(target: unknown): string | null {
    if (!target || typeof target !== 'object') return null;
    const rec = target as Record<string, unknown>;
    for (let i = 0; i < priorityKeys.length; i++) {
      const k = priorityKeys[i];
      if (Object.prototype.hasOwnProperty.call(rec, k)) {
        const val = rec[k];
        if (typeof val === 'string') {
          const trimmed = val.trim();
          if (trimmed && trimmed.toLowerCase() !== 'null' && trimmed.toLowerCase() !== 'undefined') {
            return trimmed;
          }
        }
      }
    }
    return null;
  }

  function walk(node: unknown, depth: number): string | null {
    if (depth > 5 || !node || typeof node !== 'object') return null;
    const direct = searchTop(node);
    if (direct) return direct;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const found = walk(tryParse(node[i]), depth + 1);
        if (found) return found;
      }
    } else {
      const rec = node as Record<string, unknown>;
      const keys = Object.keys(rec);
      for (let j = 0; j < keys.length; j++) {
        const child = tryParse(rec[keys[j]]);
        if (child && typeof child === 'object') {
          const found = walk(child, depth + 1);
          if (found) return found;
        }
      }
    }
    return null;
  }

  return walk(obj, 0);
}

export function isSafeWebUrl(str: string): boolean {
  return /^https?:\/\//i.test(str) || /^data:/i.test(str);
}

export function isPureBase64(str: string): boolean {
  const cleaned = str.replace(/\s+/g, '');
  return cleaned.length > 200 && !/^https?:\/\//i.test(cleaned) && /^[A-Za-z0-9+/=]+$/.test(cleaned);
}

export function base64ToPdfBlob(b64: string): Blob {
  const cleaned = b64.replace(/\s+/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'application/pdf' });
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 4000);
}

export function triggerNewTabAnchor(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function openBoletoLink(
  link: string,
  notify: (msg: string, variant?: 'info' | 'success' | 'warning' | 'danger') => void
): void {
  if (!link) return;
  if (isPureBase64(link)) {
    try {
      const blob = base64ToPdfBlob(link);
      const url = URL.createObjectURL(blob);
      triggerNewTabAnchor(url);
      return;
    } catch {
      notify('Não foi possível abrir o PDF base64.', 'danger');
      return;
    }
  }
  if (isSafeWebUrl(link)) {
    triggerNewTabAnchor(link);
  } else {
    notify('Link de boleto em formato não suportado para abertura.', 'warning');
  }
}

export async function downloadBoletoPdf(
  link: string,
  xPed: string,
  notify: (msg: string, variant?: 'info' | 'success' | 'warning' | 'danger') => void
): Promise<void> {
  if (!link) return;
  const safeName = `boleto-${(xPed || 'titulo').replace(/[^A-Za-z0-9_\-.]/g, '_')}.pdf`;

  if (/^data:/i.test(link)) {
    const a = document.createElement('a');
    a.href = link;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  if (isPureBase64(link)) {
    try {
      const blob = base64ToPdfBlob(link);
      triggerBlobDownload(blob, safeName);
      return;
    } catch {
      notify('Falha ao converter base64 para PDF.', 'danger');
      return;
    }
  }

  if (/^https?:\/\//i.test(link)) {
    try {
      const res = await fetch(link);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      triggerBlobDownload(blob, safeName);
    } catch {
      notify('Não foi possível baixar direto por CORS; abrindo boleto em outra aba.', 'warning');
      triggerNewTabAnchor(link);
    }
    return;
  }

  notify('Formato de link do boleto não reconhecido para download.', 'warning');
}

// =========================================================================
// HISTORY STORAGE (localStorage safetitulo_historico_v1)
// =========================================================================
export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveHistoryEntry(entry: HistoryEntry): HistoryEntry[] {
  const list = loadHistory();
  list.unshift(entry);
  const trimmed = list.slice(0, 50);
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Fallback if localStorage quota is exceeded by large raw payloads: trim stored execution bodies on older entries
    const compact = trimmed.map((item, idx) =>
      idx === 0 ? item : { ...item, execution: undefined }
    );
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(compact));
    } catch {
      const minimal = trimmed.slice(0, 20).map((item) => ({
        when: item.when,
        xPed: item.xPed,
        valorDisplay: item.valorDisplay,
        status: item.status,
        boletoLink: item.boletoLink,
        mode: item.mode,
        clienteMasked: item.clienteMasked,
        durationMs: item.durationMs,
        vencYmd: item.vencYmd,
      }));
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(minimal));
    }
  }
  return loadHistory();
}

export function clearHistoryStorage(): void {
  localStorage.removeItem(HISTORY_STORAGE_KEY);
}

// =========================================================================
// TECHNICAL LOG, CORRELATION ID, CURL & NUMERIC PARSING
// =========================================================================
export function parseNumericField(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : NaN;
  if (typeof val === 'string') return parseValorBR(val);
  return NaN;
}

export function extractPedidoDoc(pedidoObj: unknown): { type: 'cpf' | 'cnpj'; digits: string } | null {
  if (!pedidoObj || typeof pedidoObj !== 'object') return null;
  const rec = pedidoObj as Record<string, unknown>;
  const cnpj = onlyDigits(rec.cnpj || rec.cnpjFaturamento || '');
  if (cnpj.length === 14) return { type: 'cnpj', digits: cnpj };
  const cpf = onlyDigits(rec.cpf || rec.cpfFaturamento || '');
  if (cpf.length === 11) return { type: 'cpf', digits: cpf };
  return null;
}

export function extractCorrelationId(exec: ExecutionRecord): string {
  for (const c of exec.calls) {
    const headerKeys = Object.keys(c.responseHeaders || {});
    for (const k of headerKeys) {
      if (/correlation|request-id|trace/i.test(k)) {
        return `${c.responseHeaders[k]} (${k})`;
      }
    }
    const parsedData = c.interpretacao?.parsed?.dataObj;
    if (parsedData && typeof parsedData === 'object') {
      const cid =
        parsedData.correlationId ||
        parsedData.CorrelationId ||
        parsedData.requestId ||
        parsedData.traceId;
      if (typeof cid === 'string' && cid.trim()) return cid.trim();
    }
  }
  return exec.id;
}

export function buildCurlCommand(trace: CallTrace): string {
  const escapedBody = trace.requestBodyRaw.replace(/'/g, "'\\''");
  return (
    `curl -X POST '${trace.url}' \\\n` +
    `  -H 'Content-Type: application/json' \\\n` +
    `  -H 'Accept: application/json, text/plain, */*' \\\n` +
    `  --data-raw '${escapedBody}'`
  );
}

export function formatLogText(exec: ExecutionRecord | null): string {
  if (!exec) return '';
  const lines: string[] = [];
  lines.push('=== EXECUÇÃO SAFETITULO V2 ===');
  lines.push(`ID / Correlation: ${extractCorrelationId(exec)}`);
  lines.push(`Modo: ${exec.mode}`);
  lines.push(`xPed: ${exec.xPed || '--'}`);
  lines.push(`Início: ${exec.startedAt}`);
  lines.push(`Fim: ${exec.finishedAt || '--'}`);
  if (exec.durationMs !== undefined) {
    lines.push(`Duração total: ${exec.durationMs} ms`);
  }
  lines.push('');
  lines.push('--- ETAPAS ---');
  exec.steps.forEach((s) => {
    lines.push(`${s.label} [${s.state}] -> ${s.msg}`);
  });
  if (exec.result) {
    lines.push('');
    lines.push(`--- RESULTADO (${exec.result.status}) ---`);
    lines.push(`${exec.result.title}: ${exec.result.message}`);
    if (exec.result.warnings && exec.result.warnings.length) {
      lines.push(`Avisos: ${exec.result.warnings.join(' | ')}`);
    }
  }
  lines.push('');
  lines.push(`--- CHAMADAS AO COMPY (${exec.calls.length}) ---`);
  exec.calls.forEach((c, i) => {
    lines.push('');
    const st = c.fetchError
      ? c.isTimeout
        ? 'TIMEOUT'
        : c.isAborted
          ? 'ABORTADO'
          : 'CORS_OU_REDE'
      : `HTTP ${c.httpStatus}`;
    lines.push(`[${i + 1}] ${c.neuron} (${c.etapa}) - ${st} - ${c.durationMs}ms`);
    lines.push(`Timestamp: ${c.timestampIso}`);
    lines.push(`URL: ${c.url}`);
    lines.push(`Leitura: [${c.interpretacao.tipo}] ${c.interpretacao.msg}`);
    lines.push(`Request Headers: ${JSON.stringify(c.requestHeaders)}`);
    lines.push(`Response Headers: ${JSON.stringify(c.responseHeaders)}`);
    lines.push(`Request Body: ${c.requestBodyRaw}`);
    lines.push(`Response Body: ${c.fetchError ? c.fetchError : c.responseBodyRaw}`);
  });
  return lines.join('\n');
}

export async function copyToClipboard(
  text: string,
  label: string,
  notify: (msg: string, variant?: 'info' | 'success' | 'warning' | 'danger') => void
): Promise<void> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    notify(`${label || 'Texto'} copiado para a área de transferência.`, 'info');
  } catch {
    notify('Não foi possível copiar automaticamente.', 'warning');
  }
}

export async function downloadStandaloneHtml(
  notify: (msg: string, variant?: 'info' | 'success' | 'warning' | 'danger') => void
): Promise<void> {
  try {
    const res = await fetch('/download');
    if (res.ok) {
      const htmlText = await res.text();
      const blob = new Blob([htmlText], { type: 'text/html;charset=utf-8' });
      triggerBlobDownload(blob, 'gerador-titulos-safetitulo.html');
      return;
    }
  } catch {
    // Fallback below
  }
  const htmlText = `<!DOCTYPE html>\n${document.documentElement.outerHTML}`;
  const blob = new Blob([htmlText], { type: 'text/html;charset=utf-8' });
  triggerBlobDownload(blob, 'gerador-titulos-safetitulo.html');
  notify('Arquivo HTML exportado.', 'info');
}
