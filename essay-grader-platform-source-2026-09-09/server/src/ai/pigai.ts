import type { CorrectionAI, PigaiDimension, PigaiMark, PigaiReport } from '../types.ts';

export const DIM_NAMES = ['审题与立意', '内容与论据', '结构与论证', '语言与思辨性'] as const;
export type DimName = (typeof DIM_NAMES)[number];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// 估分固定区间（批改1.0：不使用“一类/二类”等档位表述）
export function fixedIntervalOf(main: number): string {
  const s = clamp(Math.round(main), 0, 60);
  if (s >= 50) return '50分及以上';
  if (s >= 45) return '45—49分';
  if (s >= 40) return '40—44分';
  return '39分及以下';
}

export function splitBlocks(main: number): { content: number; expression: number; development: number } {
  const m = clamp(Math.round(main), 0, 60);
  const content = Math.round(m * 0.4);
  const expression = Math.round(m * 0.4);
  const development = Math.max(0, m - content - expression);
  return { content, expression, development };
}

function strArr(v: unknown, max = 5): string[] {
  return Array.isArray(v)
    ? v.map((x) => String(x || '').trim()).filter(Boolean).slice(0, max)
    : [];
}

// 从 DeepSeek/外部原始对象规范化 pigai（字段缺失时给默认）
export function normalizePigai(raw: unknown): PigaiReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, any>;
  const main = clamp(Math.round(Number(o.estimate?.main) || 0), 0, 60);
  if (!(main > 0)) return null;
  const range = fixedIntervalOf(main);
  const marks: PigaiMark[] = Array.isArray(o.marks)
    ? o.marks.map((m: any) => ({
        paragraph: Math.max(1, Number(m?.paragraph) || 1),
        original: String(m?.original || '').slice(0, 200),
        color: (['red', 'blue', 'orange'].includes(m?.color) ? m.color : 'red') as PigaiMark['color'],
        note: String(m?.note || '').slice(0, 300),
      })).filter((m: PigaiMark) => m.original).slice(0, 40)
    : [];
  const dimMap = new Map<string, { strengths: string[]; weaknesses: string[] }>();
  if (Array.isArray(o.dimensions)) {
    for (const d of o.dimensions) {
      const name = String(d?.name || '');
      if (!DIM_NAMES.includes(name as DimName)) continue;
      dimMap.set(name, { strengths: strArr(d?.strengths), weaknesses: strArr(d?.weaknesses) });
    }
  }
  const dimensions: PigaiDimension[] = DIM_NAMES.map((name) => {
    const d = dimMap.get(name);
    return { name, strengths: d?.strengths || [], weaknesses: d?.weaknesses || [] };
  });
  return {
    estimate: {
      main,
      range,
      tier: '',
      blocks: { ...splitBlocks(main) },
      floorReasons: strArr(o.estimate?.floorReasons, 4),
      nextBandGaps: strArr(o.estimate?.nextBandGaps, 4),
    },
    marks,
    dimensions,
  };
}

// 依据主估分生成“最小可用”报告（字段缺失时的兜底，标记/理由留空由前端显示“暂无”）
export function makePigai(main: number, partial?: { marks?: PigaiMark[]; dimensions?: PigaiDimension[]; floorReasons?: string[]; nextBandGaps?: string[] }): PigaiReport {
  const m = clamp(Math.round(main), 0, 60);
  const range = fixedIntervalOf(m);
  const marks = (partial?.marks || []).slice(0, 40);
  const dimMap = new Map<string, PigaiDimension>();
  for (const d of partial?.dimensions || []) if (DIM_NAMES.includes(d.name as DimName)) dimMap.set(d.name, d);
  const dimensions: PigaiDimension[] = DIM_NAMES.map((name) => dimMap.get(name) || { name, strengths: [], weaknesses: [] });
  return {
    estimate: {
      main: m,
      range,
      tier: '',
      blocks: splitBlocks(m),
      floorReasons: (partial?.floorReasons || []).slice(0, 4),
      nextBandGaps: (partial?.nextBandGaps || []).slice(0, 4),
    },
    marks,
    dimensions,
  };
}

// 保证 aiResponse 一定有 pigai（旧结构/解析失败时兜底）
export function ensurePigai(ai: Pick<CorrectionAI, 'scoring' | 'pigai'>): PigaiReport {
  const main = Math.round(Number(ai.scoring?.finalScore) || 0);
  if (ai.pigai) return normalizePigai(ai.pigai) || makePigai(main);
  return makePigai(main);
}

const PUNCT_SET = new Set(' ，。、；：？！“”‘’（）《》〈〉…—·,.;:?!\'"()[]{}~`@#$%^&*_+=|/\\-'.split(''));

// 生成“核心字符→原文下标”映射（跳过空白与标点），用于容错定位
function coreOf(s: string): { core: string; map: number[] } {
  let core = '';
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (!/\s/.test(ch) && !PUNCT_SET.has(ch)) {
      core += ch;
      map.push(i);
    }
  }
  return { core, map };
}

// 忽略 AI 提供的段落号，直接在作文原文中定位每处标注，并改写为真实段号/精确原文片段。
// 找不到（AI 改写、非原文摘录）的标注将被剔除，避免页面无法着色或错误着色。
export function alignMarksToEssay(ai: { pigai?: PigaiReport | null }, essay: string): void {
  const marks = ai.pigai?.marks;
  if (!marks || !marks.length) return;
  const paras: string[] = [];
  for (const raw of String(essay || '').split(/\r?\n/)) {
    const t = raw.trim();
    if (t) paras.push(t);
  }
  const cores = paras.map(coreOf);
  const locate = (needleRaw: string): { paragraph: number; original: string } | null => {
    const needle = needleRaw.trim();
    if (!needle) return null;
    // 1) 精确子串优先
    for (let i = 0; i < paras.length; i++) {
      if (paras[i].includes(needle)) return { paragraph: i + 1, original: needle };
    }
    // 2) 去空白/去标点后的“核心串”容错匹配，并还原为原文精确片段
    const nk = coreOf(needle).core;
    if (nk.length < 4) return null;
    for (let i = 0; i < paras.length; i++) {
      const k = cores[i].core.indexOf(nk);
      if (k < 0) continue;
      const map = cores[i].map;
      const start = map[k];
      const end = k + nk.length - 1 < map.length ? map[k + nk.length - 1] + 1 : paras[i].length;
      if (end > start) return { paragraph: i + 1, original: paras[i].slice(start, end) };
    }
    return null;
  };

  const kept = [];
  const drop: string[] = [];
  for (const m of marks) {
    const hit = locate(m.original);
    if (hit) kept.push({ ...m, paragraph: hit.paragraph, original: hit.original });
    else drop.push(m.original.slice(0, 40));
  }
  if (drop.length) console.warn(`[pigai] 丢弃无法在原文定位的标注 ${drop.length} 处: ${drop.join(' | ')}`);
  ai.pigai!.marks = kept.slice(0, 40);
}


// 路由在字数扣分后调用：主估恒等于 finalScore，并让 blocks/区间与主估一致
export function syncEstimateToScore(ai: CorrectionAI): void {
  if (!ai.pigai) ai.pigai = makePigai(ai.scoring.finalScore);
  const est = ai.pigai.estimate;
  const main = clamp(Math.round(ai.scoring.finalScore), 0, 60);
  const old = est.blocks && est.blocks.content + est.blocks.expression + est.blocks.development > 0
    ? est.blocks
    : splitBlocks(main);
  const sum = old.content + old.expression + old.development;
  const scale = sum > 0 ? main / sum : 1;
  const content = Math.round(old.content * scale);
  const expression = Math.round(old.expression * scale);
  est.blocks = { content, expression, development: Math.max(0, main - content - expression) };
  est.main = main;
  est.tier = '';
  est.range = fixedIntervalOf(main);
}
