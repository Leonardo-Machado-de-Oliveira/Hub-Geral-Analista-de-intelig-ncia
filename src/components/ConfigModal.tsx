import React, { useEffect, useState } from 'react';
import { RotateCcw, Save, Sliders, X } from 'lucide-react';
import type { CompyConfig } from '@/src/types/compy';
import { DEFAULT_CONFIG } from '@/src/lib/compy';

interface ConfigModalProps {
  open: boolean;
  config: CompyConfig;
  onClose: () => void;
  onSave: (nextConfig: CompyConfig) => void;
  onNotify: (msg: string, variant?: 'info' | 'success' | 'warning' | 'danger') => void;
}

export function ConfigModal({
  open,
  config,
  onClose,
  onSave,
  onNotify,
}: ConfigModalProps) {
  const [draft, setDraft] = useState<CompyConfig>(config);

  useEffect(() => {
    if (open) {
      setDraft(config);
    }
  }, [open, config]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      endpoint: draft.endpoint.trim(),
      domain: draft.domain.trim(),
      license: draft.license.trim(),
      user: draft.user.trim(),
      timeoutSec: Math.max(2, Number(draft.timeoutSec) || 30),
      confTentativas: Math.max(1, Number(draft.confTentativas) || 3),
      titTentativas: Math.max(1, Number(draft.titTentativas) || 3),
      intervaloSec: Math.max(1, Number(draft.intervaloSec) || 5),
    });
    onClose();
  };

  const handleRestoreDefaults = () => {
    setDraft({ ...DEFAULT_CONFIG });
    onNotify('Padrões restaurados no formulário (clique em Salvar para confirmar).', 'info');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="configModalTitle"
    >
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Sliders className="h-5 w-5 text-[#004b93]" />
            <h2 id="configModalTitle" className="font-display text-base font-bold text-slate-900">
              Configurações do Compy (Navegador)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-5">
            <div className="rounded-lg border border-sky-200 bg-sky-50/70 px-4 py-3 text-xs text-sky-900">
              As configurações são salvas localmente no navegador (<code className="font-mono">localStorage</code>) e enviadas diretamente nas chamadas CORS para o Compy.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-3">
                <label htmlFor="cfgEndpoint" className="block text-xs font-semibold text-slate-700 mb-1">
                  Endpoint do Compy
                </label>
                <input
                  id="cfgEndpoint"
                  type="url"
                  required
                  value={draft.endpoint}
                  onChange={(e) => setDraft({ ...draft, endpoint: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#004b93] focus:outline-none focus:ring-2 focus:ring-[#004b93]/20"
                />
              </div>

              <div>
                <label htmlFor="cfgDomain" className="block text-xs font-semibold text-slate-700 mb-1">
                  domain
                </label>
                <input
                  id="cfgDomain"
                  type="text"
                  required
                  value={draft.domain}
                  onChange={(e) => setDraft({ ...draft, domain: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#004b93] focus:outline-none focus:ring-2 focus:ring-[#004b93]/20"
                />
              </div>

              <div>
                <label htmlFor="cfgLicense" className="block text-xs font-semibold text-slate-700 mb-1">
                  license
                </label>
                <input
                  id="cfgLicense"
                  type="text"
                  required
                  value={draft.license}
                  onChange={(e) => setDraft({ ...draft, license: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#004b93] focus:outline-none focus:ring-2 focus:ring-[#004b93]/20"
                />
              </div>

              <div>
                <label htmlFor="cfgUser" className="block text-xs font-semibold text-slate-700 mb-1">
                  user
                </label>
                <input
                  id="cfgUser"
                  type="text"
                  required
                  value={draft.user}
                  onChange={(e) => setDraft({ ...draft, user: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#004b93] focus:outline-none focus:ring-2 focus:ring-[#004b93]/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
              <div>
                <label htmlFor="cfgTimeoutSec" className="block text-xs font-semibold text-slate-700 mb-1">
                  Timeout (s)
                </label>
                <input
                  id="cfgTimeoutSec"
                  type="number"
                  min={2}
                  max={300}
                  required
                  value={draft.timeoutSec}
                  onChange={(e) => setDraft({ ...draft, timeoutSec: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-[#004b93] focus:outline-none focus:ring-2 focus:ring-[#004b93]/20"
                />
              </div>

              <div>
                <label htmlFor="cfgConfTentativas" className="block text-xs font-semibold text-slate-700 mb-1">
                  Tentativas ws.Pedido
                </label>
                <input
                  id="cfgConfTentativas"
                  type="number"
                  min={1}
                  max={10}
                  required
                  value={draft.confTentativas}
                  onChange={(e) => setDraft({ ...draft, confTentativas: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-[#004b93] focus:outline-none focus:ring-2 focus:ring-[#004b93]/20"
                />
              </div>

              <div>
                <label htmlFor="cfgTitTentativas" className="block text-xs font-semibold text-slate-700 mb-1">
                  Tentativas ws.Titulo
                </label>
                <input
                  id="cfgTitTentativas"
                  type="number"
                  min={1}
                  max={15}
                  required
                  value={draft.titTentativas}
                  onChange={(e) => setDraft({ ...draft, titTentativas: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-[#004b93] focus:outline-none focus:ring-2 focus:ring-[#004b93]/20"
                />
              </div>

              <div>
                <label htmlFor="cfgIntervaloSec" className="block text-xs font-semibold text-slate-700 mb-1">
                  Intervalo título (s)
                </label>
                <input
                  id="cfgIntervaloSec"
                  type="number"
                  min={1}
                  max={60}
                  required
                  value={draft.intervaloSec}
                  onChange={(e) => setDraft({ ...draft, intervaloSec: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-[#004b93] focus:outline-none focus:ring-2 focus:ring-[#004b93]/20"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3.5">
            <button
              type="button"
              onClick={handleRestoreDefaults}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar padrão
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#004b93] px-4 py-2 text-xs font-semibold text-white hover:bg-[#003366] cursor-pointer"
              >
                <Save className="h-3.5 w-3.5" />
                Salvar
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
