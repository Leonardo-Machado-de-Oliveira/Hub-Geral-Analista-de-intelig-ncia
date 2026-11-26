import { Loader2, Menu, PlugZap, Settings } from 'lucide-react';
import type { CompyConnectionState, NavSection } from '@/src/types/compy';

interface TopBarProps {
  activeSection: NavSection;
  connectionState: CompyConnectionState;
  onTestConnection: () => void;
  onOpenConfig: () => void;
  onOpenMobileMenu: () => void;
}

const SECTION_TITLES: Record<NavSection, string> = {
  overview: 'Visão geral',
  generate: 'Gerar boleto',
  query: 'Consultar título',
  midia_avulsa: 'Venda avulsa de mídias',
  bulk_valor: 'Alterar valores em massa',
  bulk_cnpj: 'Alterar CNPJ em massa',
  history: 'Histórico de operações',
  diagnostics: 'Diagnósticos e logs',
};

export function TopBar({
  activeSection,
  connectionState,
  onTestConnection,
  onOpenConfig,
  onOpenMobileMenu,
}: TopBarProps) {
  const isTesting = connectionState.status === 'testing';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Menu toggle (mobile) + Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Abrir menu lateral"
            className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="hidden sm:inline text-slate-400 whitespace-nowrap">Safeweb ERP</span>
            <span className="hidden sm:inline text-slate-300" aria-hidden="true">
              /
            </span>
            <h1 className="font-display text-base font-bold text-slate-900 truncate">
              {SECTION_TITLES[activeSection]}
            </h1>
          </div>
        </div>

        {/* Zone 2/3: Real connection test + Settings action */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-600 mr-1">
            <span>Compy:</span>
            <span
              className={`font-medium whitespace-nowrap ${
                connectionState.status === 'ok'
                  ? 'text-emerald-700'
                  : connectionState.status === 'error' || connectionState.status === 'cors_error'
                    ? 'text-red-700'
                    : connectionState.status === 'testing'
                      ? 'text-[#004b93]'
                      : 'text-slate-500'
              }`}
            >
              {connectionState.message}
            </span>
          </div>

          <button
            type="button"
            onClick={onTestConnection}
            disabled={isTesting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isTesting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#004b93]" />
            ) : (
              <PlugZap className="h-3.5 w-3.5 text-[#004b93]" />
            )}
            {isTesting ? 'Testando...' : 'Testar conexão'}
          </button>

          <button
            type="button"
            onClick={onOpenConfig}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#004b93] px-3 py-2 text-xs font-semibold text-white hover:bg-[#003366] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Configurações</span>
          </button>
        </div>
      </div>
    </header>
  );
}
