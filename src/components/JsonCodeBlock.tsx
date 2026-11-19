import React from 'react';
import { Copy } from 'lucide-react';

interface JsonCodeBlockProps {
  value: unknown;
  rawText?: string;
  label?: string;
  maxHeightClass?: string;
  onCopy?: (text: string, label: string) => void;
  extraAction?: React.ReactNode;
}

function renderHighlightedTokens(pretty: string): React.ReactNode[] {
  const tokenRegex =
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRegex.exec(pretty)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(pretty.slice(lastIndex, match.index));
    }
    const token = match[0];
    let cls = 'text-amber-300';
    if (token.startsWith('"')) {
      cls = token.endsWith(':') ? 'text-sky-300' : 'text-lime-300';
    } else if (/^(true|false)$/.test(token)) {
      cls = 'text-pink-300';
    } else if (token === 'null') {
      cls = 'text-slate-400';
    }
    nodes.push(
      <span key={keyIdx++} className={cls}>
        {token}
      </span>
    );
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < pretty.length) {
    nodes.push(pretty.slice(lastIndex));
  }
  return nodes;
}

export function JsonCodeBlock({
  value,
  rawText,
  label,
  maxHeightClass = 'max-h-64',
  onCopy,
  extraAction,
}: JsonCodeBlockProps) {
  const isJsonValue = value !== undefined && value !== null;
  const displayText =
    rawText !== undefined
      ? rawText
      : typeof value === 'string'
        ? value
        : JSON.stringify(value, null, 2);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-950 overflow-hidden">
      {(label || onCopy || extraAction) && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-3 py-1.5">
          <span className="text-xs font-medium text-slate-300 truncate">{label || 'Dados'}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {extraAction}
            {onCopy && (
              <button
                type="button"
                onClick={() => onCopy(displayText, label || 'Conteúdo')}
                className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Copy className="h-3 w-3" />
                Copiar
              </button>
            )}
          </div>
        </div>
      )}
      <pre
        className={`wire-scroll overflow-auto p-3 font-mono text-xs leading-relaxed text-slate-200 whitespace-pre-wrap break-all m-0 ${maxHeightClass}`}
      >
        {isJsonValue && rawText === undefined
          ? renderHighlightedTokens(displayText)
          : displayText}
      </pre>
    </div>
  );
}
