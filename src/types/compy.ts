export type NavSection =
  | 'overview'
  | 'generate'
  | 'query'
  | 'midia_avulsa'
  | 'bulk_correcao'
  | 'history'
  | 'diagnostics';

export interface CompyConfig {
  endpoint: string;
  domain: string;
  license: string;
  user: string;
  timeoutSec: number;
  confTentativas: number;
  titTentativas: number;
  intervaloSec: number;
}

export type DocType = 'cpf' | 'cnpj' | null;

export interface DocValidationResult {
  valid: boolean;
  type: DocType;
  digits: string;
  error: string | null;
}

export interface FormInputs {
  xPed: string;
  docInfo: DocValidationResult;
  valorRaw: string;
  valorNum: number;
  vencYmd: string;
  cProd: number;
  cProdRaw: string;
  qCom: number;
  qComRaw: string;
  codigoObjetivo: string;
  codigoClassificacao: string;
  codigoCobranca: string;
  faturar: boolean;
}

export type StepState = 'pendente' | 'rodando' | 'ok' | 'erro' | 'aviso' | 'pulado';

export interface ExecutionStep {
  label: string;
  state: StepState;
  msg: string;
  updatedAt?: string;
}

export interface ParsedSafeWebResponse {
  success: boolean;
  errorMessage?: string;
  successMessage?: string;
  dataObj: Record<string, unknown> | null;
  rawJson?: unknown;
}

export interface CallInterpretation {
  tipo: 'transporte' | 'html' | 'negocio' | 'http' | 'ok';
  msg: string;
  parsed: ParsedSafeWebResponse | null;
}

export interface CallTrace {
  index: number;
  timestampIso: string;
  neuron: string;
  etapa: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBodyRaw: string;
  httpStatus: number | null;
  statusText: string;
  responseHeaders: Record<string, string>;
  responseBodyRaw: string;
  durationMs: number;
  timeoutSec: number;
  fetchError: string | null;
  isTimeout: boolean;
  isAborted: boolean;
  interpretacao: CallInterpretation;
}

export type OperationStatus = 'sucesso' | 'parcial' | 'erro';
export type OperationMode = 'criar_e_buscar' | 'so_consultar_titulo' | 'midia_avulsa';

export interface ExecutionResult {
  status: OperationStatus;
  title: string;
  message: string;
  warnings?: string[];
  xPed: string;
  cliente: string;
  vTotDisplay: string;
  pedidoConfirmado: boolean;
  tituloData?: Record<string, unknown> | null;
  boletoLink?: string | null;
}

export interface ExecutionRecord {
  id: string;
  mode: OperationMode;
  startedAt: string;
  finishedAt: string | null;
  durationMs?: number;
  xPed: string;
  docDigits?: string;
  vencYmd?: string;
  valorEnviado: number;
  /** Produto da venda avulsa de mídias (TOKEN, CARTÃO, LEITORA). */
  produto?: string;
  steps: ExecutionStep[];
  calls: CallTrace[];
  result: ExecutionResult | null;
}

export interface HistoryEntry {
  id?: string;
  when: string;
  xPed: string;
  mode?: OperationMode;
  docDigits?: string;
  clienteMasked?: string;
  vencYmd?: string;
  valorDisplay: string;
  produto?: string;
  durationMs?: number;
  status: OperationStatus;
  boletoLink: string | null;
  execution?: ExecutionRecord;
}

export interface BackendHealthState {
  status: 'checking' | 'online' | 'offline';
  service?: string;
  erpTransport?: string;
  checkedAt?: string;
  error?: string;
}

export interface CompyConnectionState {
  status: 'untested' | 'testing' | 'ok' | 'cors_error' | 'error';
  message: string;
  httpStatus?: number | null;
  durationMs?: number;
  checkedAt?: string;
  lastTrace?: CallTrace | null;
}

export interface ToastItem {
  id: string;
  message: string;
  variant: 'info' | 'success' | 'warning' | 'danger';
}
