import React, { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Code2,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Square,
} from 'lucide-react';
import type { CompyConfig, ExecutionRecord, FormInputs } from '@/src/types/compy';
import {
  extractConfigHost,
  formatCpfCnpj,
  formatDateYMD,
  getTodayLocalMidnight,
  onlyDigits,
  validateCpfCnpj,
  type FieldErrorMap,
} from '@/src/lib/compy';
import { ExecutionStepper } from '@/src/components/ExecutionStepper';
import { OperationResultSummary } from '@/src/components/OperationResultSummary';

export interface FormStateValues {
  xPed: string;
  clienteDoc: string;
  valorRaw: string;
  vencYmd: string;
  cProdRaw: string;
  qComRaw: string;
  codigoObjetivo: string;
  codigoClassificacao: string;
  codigoCobranca: string;
  faturar: boolean;
}

interface OrderOperationPageProps {
  mode: 'generate' | 'query';
  formValues: FormStateValues;
  fieldErrors: FieldErrorMap;
  config: CompyConfig;
  isRunning: boolean;
  currentExecution: ExecutionRecord | null;
  onChangeField: <K extends keyof FormStateValues>(key: K, value: FormStateValues[K]) => void;
  onRegenerateXPed: () => void;
  onSubmitGenerate: () => void;
  onSubmitQuery: () => void;
  onStopExecution: () => void;
  onOpenPayloadModal: (inputs: FormInputs) => void;
  onOpenDetails: (exec: ExecutionRecord) => void;
  onOpenBoleto: (link: string) => void;
  onDownloadBoleto: (link: string, xPed: string) => void;
  toFormInputs: (vals: FormStateValues) => FormInputs;
}

export function OrderOperationPage({
  mode,
  formValues,
  fieldErrors,
  config,
  isRunning,
  currentExecution,
  onChangeField,
  onRegenerateXPed,
  onSubmitGenerate,
  onSubmitQuery,
  onStopExecution,
  onOpenPayloadModal,
  onOpenDetails,
  onOpenBoleto,
  onDownloadBoleto,
  toFormInputs,
}: OrderOperationPageProps) {
  const [paramsExpanded, setParamsExpanded] = useState(false);

  const docDigits = onlyDigits(formValues.clienteDoc);
  const docValidation = docDigits ? validateCpfCnpj(docDigits) : null;
  const host = extractConfigHost(config);

  const handleSetVencOffset = (days: number) => {
    const d = getTodayLocalMidnight();
    d.setDate(d.getDate() + days);
    onChangeField('vencYmd', formatDateYMD(d));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'generate') {
      onSubmitGenerate();
    } else {
      onSubmitQuery();
    }
  };

  const isGenerate = mode === 'generate';

  return (
    <div className="space-y-6">
      {/* Subtle Network/CORS Notice */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-900">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span>
            Chamadas diretas do navegador para o Compy (<strong className="font-mono">{host}</strong>). Necessário estar na rede corporativa com extensão de CORS habilitada.
          </span>
        </div>
      </div>

      {/* Main Operation Form Card */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50/60 px-6 py-4">
          <h2 className="font-display text-base font-bold text-slate-900">
            {isGenerate ? 'Dados do Pedido e Título' : 'Consulta Direta de Título no Compy'}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {isGenerate
              ? 'Preencha os campos para validar, criar o pedido (ws.SavePedido) e buscar o título/boleto (ws.Titulo).'
              : 'Informe o identificador do pedido (xPed) para consultar o pedido e obter os dados do título/boleto diretamente no Compy.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-6">
          {/* Group 1: Identificação e Cliente */}
          <div className="space-y-4">
            <div className="text-xs font-semibold text-slate-500 border-b border-slate-100 pb-1.5">
              Identificação e Cliente
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* xPed */}
              <div>
                <label htmlFor="xPedInput" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Identificador do Pedido (xPed) <span className="text-red-600">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    id="xPedInput"
                    type="text"
                    required
                    value={formValues.xPed}
                    onChange={(e) => onChangeField('xPed', e.target.value)}
                    placeholder="PED-20261113-1234"
                    className={`flex-1 rounded-lg border px-3 py-2 font-mono text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 ${
                      fieldErrors.xPed
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                        : 'border-slate-300 focus:border-[#004b93] focus:ring-[#004b93]/20'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={onRegenerateXPed}
                    title="Gerar novo xPed"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Gerar outro
                  </button>
                </div>
                {fieldErrors.xPed && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.xPed}</p>
                )}
              </div>

              {/* CPF / CNPJ */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="clienteDoc" className="block text-xs font-semibold text-slate-700">
                    CPF ou CNPJ do Cliente {isGenerate && <span className="text-red-600">*</span>}
                  </label>
                  <span
                    className={`text-[11px] font-medium ${
                      !docValidation
                        ? 'text-slate-400'
                        : docValidation.valid
                          ? 'text-emerald-700'
                          : 'text-red-600'
                    }`}
                  >
                    {!docValidation
                      ? isGenerate
                        ? 'CPF (11) ou CNPJ (14)'
                        : 'Opcional se já constar no pedido'
                      : docValidation.valid
                        ? docValidation.type === 'cnpj'
                          ? 'CNPJ válido'
                          : 'CPF válido'
                        : docDigits.length > 11
                          ? 'CNPJ incompleto/inválido'
                          : 'CPF incompleto/inválido'}
                  </span>
                </div>
                <input
                  id="clienteDoc"
                  type="text"
                  maxLength={18}
                  required={isGenerate}
                  value={formValues.clienteDoc}
                  onChange={(e) => onChangeField('clienteDoc', formatCpfCnpj(e.target.value))}
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  className={`w-full rounded-lg border px-3 py-2 font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                    fieldErrors.clienteDoc || (docValidation && !docValidation.valid)
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                      : docValidation && docValidation.valid
                        ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-200'
                        : 'border-slate-300 focus:border-[#004b93] focus:ring-[#004b93]/20'
                  }`}
                />
                {(fieldErrors.clienteDoc || (docValidation && !docValidation.valid)) && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.clienteDoc || docValidation?.error}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Group 2 & 3 only for Generate Boleto */}
          {isGenerate && (
            <>
              <div className="space-y-4">
                <div className="text-xs font-semibold text-slate-500 border-b border-slate-100 pb-1.5">
                  Valores e Vencimento
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  {/* Valor */}
                  <div>
                    <label htmlFor="valorProd" className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Valor (R$) <span className="text-red-600">*</span>
                    </label>
                    <div className="flex rounded-lg border border-slate-300 overflow-hidden focus-within:border-[#004b93] focus-within:ring-2 focus-within:ring-[#004b93]/20">
                      <span className="inline-flex items-center border-r border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
                        R$
                      </span>
                      <input
                        id="valorProd"
                        type="text"
                        inputMode="decimal"
                        required
                        value={formValues.valorRaw}
                        onChange={(e) => onChangeField('valorRaw', e.target.value)}
                        placeholder="150,00"
                        className="flex-1 px-3 py-2 font-mono text-sm font-bold text-slate-900 focus:outline-none tabular-nums"
                      />
                    </div>
                    {fieldErrors.valorProd && (
                      <p className="mt-1 text-xs text-red-600">{fieldErrors.valorProd}</p>
                    )}
                  </div>

                  {/* Vencimento + Quick buttons */}
                  <div>
                    <label htmlFor="tituloVencimento" className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Vencimento (máx +10 dias) <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="tituloVencimento"
                      type="date"
                      required
                      value={formValues.vencYmd}
                      onChange={(e) => onChangeField('vencYmd', e.target.value)}
                      className={`w-full rounded-lg border px-3 py-2 font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                        fieldErrors.tituloVencimento
                          ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                          : 'border-slate-300 focus:border-[#004b93] focus:ring-[#004b93]/20'
                      }`}
                    />
                    {fieldErrors.tituloVencimento && (
                      <p className="mt-1 text-xs text-red-600">{fieldErrors.tituloVencimento}</p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 mr-1">Atalhos:</span>
                      {[
                        { label: 'Hoje', days: 0 },
                        { label: '+1', days: 1 },
                        { label: '+3', days: 3 },
                        { label: '+5', days: 5 },
                        { label: '+7', days: 7 },
                        { label: '+10 (máx)', days: 10 },
                      ].map((btn) => (
                        <button
                          key={btn.days}
                          type="button"
                          onClick={() => handleSetVencOffset(btn.days)}
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                            btn.days === 10
                              ? 'border-[#004b93]/30 bg-sky-50/70 text-[#004b93] hover:bg-sky-100'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Group 3: Parâmetros do pedido (ws.SavePedido) */}
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setParamsExpanded((prev) => !prev)}
                  className="w-full flex items-center justify-between bg-slate-50 px-4 py-3 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100/80 transition-colors cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-[#004b93]" />
                    Parâmetros do pedido (ws.SavePedido)
                    <span className="font-mono font-normal text-slate-500">
                      · cProd {formValues.cProdRaw} · Objetivo {formValues.codigoObjetivo} · Cobrança {formValues.codigoCobranca}
                    </span>
                  </span>
                  {paramsExpanded ? (
                    <ChevronUp className="h-4 w-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  )}
                </button>

                {paramsExpanded && (
                  <div className="border-t border-slate-200 bg-white p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="cProd" className="block text-xs font-semibold text-slate-700 mb-1">
                        cProd <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="cProd"
                        type="number"
                        min={1}
                        step={1}
                        required
                        value={formValues.cProdRaw}
                        onChange={(e) => onChangeField('cProdRaw', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm text-slate-900 focus:border-[#004b93] focus:outline-none"
                      />
                      {fieldErrors.cProd && (
                        <p className="mt-1 text-xs text-red-600">{fieldErrors.cProd}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="qCom" className="block text-xs font-semibold text-slate-700 mb-1">
                        qCom <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="qCom"
                        type="number"
                        min={1}
                        step="any"
                        required
                        value={formValues.qComRaw}
                        onChange={(e) => onChangeField('qComRaw', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm text-slate-900 focus:border-[#004b93] focus:outline-none"
                      />
                      {fieldErrors.qCom && (
                        <p className="mt-1 text-xs text-red-600">{fieldErrors.qCom}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="codigoObjetivo" className="block text-xs font-semibold text-slate-700 mb-1">
                        codigoObjetivo <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="codigoObjetivo"
                        type="text"
                        required
                        value={formValues.codigoObjetivo}
                        onChange={(e) => onChangeField('codigoObjetivo', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm text-slate-900 focus:border-[#004b93] focus:outline-none"
                      />
                      {fieldErrors.codigoObjetivo && (
                        <p className="mt-1 text-xs text-red-600">{fieldErrors.codigoObjetivo}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="codigoClassificacao" className="block text-xs font-semibold text-slate-700 mb-1">
                        codigoClassificacao <span className="font-normal text-slate-400">(opcional)</span>
                      </label>
                      <input
                        id="codigoClassificacao"
                        type="text"
                        placeholder="Opcional"
                        value={formValues.codigoClassificacao}
                        onChange={(e) => onChangeField('codigoClassificacao', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm text-slate-900 focus:border-[#004b93] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label htmlFor="codigoCobranca" className="block text-xs font-semibold text-slate-700 mb-1">
                        codigoCobranca <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="codigoCobranca"
                        type="text"
                        required
                        value={formValues.codigoCobranca}
                        onChange={(e) => onChangeField('codigoCobranca', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm text-slate-900 focus:border-[#004b93] focus:outline-none"
                      />
                      {fieldErrors.codigoCobranca && (
                        <p className="mt-1 text-xs text-red-600">{fieldErrors.codigoCobranca}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="faturar" className="block text-xs font-semibold text-slate-700 mb-1">
                        faturar
                      </label>
                      <select
                        id="faturar"
                        value={formValues.faturar ? 'true' : 'false'}
                        onChange={(e) => onChangeField('faturar', e.target.value === 'true')}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-sm text-slate-900 focus:border-[#004b93] focus:outline-none"
                      >
                        <option value="false">false</option>
                        <option value="true">true</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* General Form Error */}
          {fieldErrors.general && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-800">
              {fieldErrors.general}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-2.5">
              {isGenerate ? (
                <button
                  type="submit"
                  disabled={isRunning}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#004b93] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#003366] disabled:opacity-60 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {isRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {isRunning ? 'Executando no Compy...' : 'Criar pedido no Compy e buscar título'}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isRunning}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#004b93] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#003366] disabled:opacity-60 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {isRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  {isRunning ? 'Consultando no Compy...' : 'Só consultar título'}
                </button>
              )}

              {isGenerate && (
                <button
                  type="button"
                  onClick={() => onOpenPayloadModal(toFormInputs(formValues))}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Code2 className="h-4 w-4 text-[#004b93]" />
                  Ver payload
                </button>
              )}
            </div>

            {isRunning && (
              <button
                type="button"
                onClick={onStopExecution}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                Parar
              </button>
            )}
          </div>
        </form>
      </section>

      {/* Clean Execution Progress & Result Summary (no raw logs dumped here) */}
      {currentExecution && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900">
                Acompanhamento da Execução
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                {currentExecution.xPed || '--'} · {currentExecution.calls.length}{' '}
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
              onOpenDetails={(exec) => onOpenDetails(exec)}
              onOpenBoleto={onOpenBoleto}
              onDownloadBoleto={onDownloadBoleto}
            />
          )}
        </section>
      )}
    </div>
  );
}
