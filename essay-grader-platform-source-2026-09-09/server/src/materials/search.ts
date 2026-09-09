import { db } from '../db/store.ts';
import type { Material } from '../types.ts';
import type { KnowledgeMaterial } from '../ai/types.ts';

const STOP_WORDS = new Set(['我们','他们','一个','一种','如何','什么','可以','应该','进行','这个','那个','以及','对于','材料','作文']);
function tokens(text: string): string[] {
  const chunks = text.toLowerCase().match(/[\p{Script=Han}]{2,8}|[a-z0-9]{3,}/gu) || [];
  const expanded = chunks.flatMap((chunk) => {
    if (!/[\p{Script=Han}]/u.test(chunk) || chunk.length <= 4) return [chunk];
    const pairs: string[] = [];
    for (let i = 0; i < chunk.length - 1; i += 1) pairs.push(chunk.slice(i, i + 2));
    return [chunk, ...pairs];
  });
  return [...new Set(expanded.filter((token) => !STOP_WORDS.has(token)))];
}
export function findKnowledgeMaterials(input: { title?: string; materialText?: string; keyword?: string; grade?: string; limit?: number }): KnowledgeMaterial[] {
  const query = [input.title, input.materialText, input.keyword].filter(Boolean).join(' ');
  const queryTokens = tokens(query);
  const candidates = db.data.materials.filter((m) => m.status === 'published' && m.sourceVerified && (!input.grade || m.gradeLevels!.includes('通用') || m.gradeLevels!.includes(input.grade)));
  return candidates.map((m) => {
    const text = [m.title, m.content, m.dims?.form, m.dims?.field, m.dims?.motif, m.dims?.era, m.debateDimension, m.teacherComment, m.applicableArguments].filter(Boolean).join(' ').toLowerCase();
    let score = 0;
    for (const token of queryTokens) {
      if (m.dims && [m.dims.form, m.dims.field, m.dims.motif].some((x) => x.includes(token) || token.includes(x))) score += 8;
      if (text.includes(token)) score += 1;
    }
    return { m, score };
  }).sort((a, b) => b.score - a.score || (b.m.updatedAt || '').localeCompare(a.m.updatedAt || ''))
    .slice(0, Math.max(1, Math.min(12, input.limit || 8)))
    .map(({ m }) => ({
      id: m.id, title: m.title, content: m.content,
      dims: m.dims || { form: '', field: '', motif: '', era: '' },
      source: m.sourceTitle || m.source, sourceUrl: m.sourceUrl,
      teacherComment: m.teacherComment, applicableArguments: m.applicableArguments,
    }));
}
