import { Fragment } from 'react';
import {
  Activity,
  Building2,
  FilePlus2,
  History,
  Package,
  LayoutDashboard,
  PencilLine,
  Search,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { CompyConfig, CompyConnectionState, NavSection } from '@/src/types/compy';
import { extractConfigHost } from '@/src/lib/compy';

interface SidebarProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  config: CompyConfig;
  connectionState: CompyConnectionState;
  onOpenConfig: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

type NavGroup = 'monitor' | 'solucoes';

const GROUP_LABELS: Record<NavGroup, string> = {
  monitor: 'Operações e Monitoramento',
  solucoes: 'Soluções via API',
};

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  icon: typeof LayoutDashboard;
  group: NavGroup;
}> = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard, group: 'monitor' },
  { id: 'generate', label: 'Gerar boleto', icon: FilePlus2, group: 'monitor' },
  { id: 'query', label: 'Consultar título', icon: Search, group: 'monitor' },
  { id: 'history', label: 'Histórico de operações', icon: History, group: 'monitor' },
  { id: 'diagnostics', label: 'Diagnósticos e logs', icon: Activity, group: 'monitor' },
  { id: 'midia_avulsa', label: 'Venda avulsa de mídias', icon: Package, group: 'solucoes' },
  { id: 'bulk_valor', label: 'Alterar valores em massa', icon: PencilLine, group: 'solucoes' },
  { id: 'bulk_cnpj', label: 'Alterar CNPJ em massa', icon: Building2, group: 'solucoes' },
];

export function Sidebar({
  activeSection,
  onNavigate,
  config,
  connectionState,
  onOpenConfig,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const host = extractConfigHost(config);

  const navContent = (
    <div className="flex h-full flex-col bg-[#002855] text-slate-100 select-none">
      {/* Brand Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#003366] shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-sm font-bold tracking-tight text-white truncate">
              Safeweb ERP
            </div>
            <div className="text-[11px] text-sky-200/80 truncate">
              Hub de Soluções via API
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Fechar menu"
          className="lg:hidden rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto" aria-label="Menu principal">
        {NAV_ITEMS.map((item, idx) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          const showGroupHeading = idx === 0 || NAV_ITEMS[idx - 1].group !== item.group;
          return (
            <Fragment key={item.id}>
            {showGroupHeading && (
              <div className={`px-3 pb-2 text-[11px] font-medium text-sky-200/60 ${idx === 0 ? '' : 'pt-4'}`}>
                {GROUP_LABELS[item.group]}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                onNavigate(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-[#004b93] text-white shadow-sm ring-1 ring-white/15'
                  : 'text-slate-200/85 hover:bg-white/8 hover:text-white'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  active ? 'text-[#00a4e4]' : 'text-slate-300/80'
                }`}
              />
              <span className="truncate">{item.label}</span>
            </button>
            </Fragment>
          );
        })}
      </nav>

      {/* Bottom ERP Context & Settings */}
      <div className="border-t border-white/10 p-3 space-y-2.5">
        <div className="rounded-lg bg-white/5 px-3 py-2.5 border border-white/10">
          <div className="flex items-center justify-between gap-2 text-[11px] text-sky-200/75">
            <span>Ambiente Compy (CORS)</span>
            <span
              className={`font-medium ${
                connectionState.status === 'ok'
                  ? 'text-emerald-300'
                  : connectionState.status === 'error' || connectionState.status === 'cors_error'
                    ? 'text-red-300'
                    : 'text-slate-300'
              }`}
            >
              {connectionState.status === 'ok'
                ? 'Conectado'
                : connectionState.status === 'testing'
                  ? 'Testando'
                  : connectionState.status === 'cors_error' || connectionState.status === 'error'
                    ? 'Atenção'
                    : 'Aguardando'}
            </span>
          </div>
          <div className="mt-1 font-mono text-xs text-white truncate" title={config.endpoint}>
            {host}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-300/80 truncate">
            {config.domain} · licença {config.license} · usuário {config.user}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            onOpenConfig();
            onCloseMobile();
          }}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 transition-colors whitespace-nowrap cursor-pointer"
        >
          <Settings className="h-3.5 w-3.5 shrink-0" />
          Configurações do ERP
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col border-r border-slate-200">
        <div className="sticky top-0 h-screen w-64">{navContent}</div>
      </aside>

      {/* Mobile / Tablet Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[85vw] h-full shadow-xl">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
