import React from 'react';
import type { PigaiMark, PigaiMarkColor } from '../types';

export const MARK_COLOR_CLS: Record<PigaiMarkColor, string> = {
  red: 'bg-red-100 text-red-600 underline decoration-red-400 decoration-wavy underline-offset-2',
  blue: 'bg-blue-100 text-blue-700 underline decoration-blue-400 decoration-wavy underline-offset-2',
  orange: 'bg-yellow-100 text-yellow-700 underline decoration-yellow-500 decoration-wavy underline-offset-2',
};
export const MARK_COLOR_LABEL: Record<PigaiMarkColor, string> = {
  red: '错别字/病句',
  blue: '逻辑错误',
  orange: '引用待核',
};

interface ColoredEssayProps { text: string; marks?: PigaiMark[]; }
export default function ColoredEssay({ text, marks = [] }: ColoredEssayProps) {
  const paras = text.split(/\n+/).filter((p) => p.trim());
  const list = marks.filter((m) => m.paragraph >= 1 && m.paragraph <= Math.max(paras.length, 1));
  const renderPara = (p: string, pi: number) => {
    const found = list.filter((m) => m.paragraph === pi);
    if (!found.length) return <span>{p}</span>;
    const ranges: { start: number; end: number; color: PigaiMarkColor }[] = [];
    for (const f of found) {
      const idx = p.indexOf(f.original);
      if (idx >= 0) ranges.push({ start: idx, end: idx + f.original.length, color: f.color });
    }
    ranges.sort((a, b) => a.start - b.start || (a.color === 'red' ? -1 : b.color === 'red' ? 1 : a.color === 'blue' ? -1 : 1));
    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    ranges.forEach((r, ri) => {
      if (r.end <= cursor) return; // 与已有标注重叠时跳过，避免波浪线叠加
      if (r.start > cursor) nodes.push(p.slice(cursor, r.start));
      nodes.push(
        <mark key={'m' + ri} className={'rounded px-0.5 ' + MARK_COLOR_CLS[r.color]}>
          {p.slice(r.start, r.end)}
        </mark>,
      );
      cursor = r.end;
    });
    if (cursor < p.length) nodes.push(p.slice(cursor));
    return <>{nodes}</>;
  };
  return (
    <div className="space-y-2.5 text-sm leading-7 text-slate-700">
      {paras.length === 0 ? <p className="text-slate-400 text-xs">（作文正文为空）</p> : paras.map((p, i) => <p key={i}>{renderPara(p, i + 1)}</p>)}
    </div>
  );
}

export function PigaiLegend() {
  return (
    <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500">
      {(Object.keys(MARK_COLOR_LABEL) as PigaiMarkColor[]).map((c) => (
        <span key={c} className="inline-flex items-center gap-1.5">
          <mark className={'rounded px-1 ' + MARK_COLOR_CLS[c]}>示例</mark>
          {MARK_COLOR_LABEL[c]}
        </span>
      ))}
    </div>
  );
}
