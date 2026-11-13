import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CorrectionAI } from '../types.ts';
import type { ScoreAnchor } from './types.ts';

interface StoredAnchor {
  id: string;
  class: string;
  band: string;
  score: number;
  title: string;
  essay: string;
  prompt: string;
}

interface CalibrationDataset {
  essays?: StoredAnchor[];
}

export interface CalibrationSelection {
  applied: boolean;
  reason: string;
  anchors: ScoreAnchor[];
  datasetSize: number;
}

export interface CalibrationResult {
  applied: boolean;
  reason: string;
  rawScore: number;
  calibratedScore: number;
  confidence?: 'high' | 'medium' | 'reference';
  anchors: { id: string; band: string; score: number; similarity: number }[];
}

const datasetPath = fileURLToPath(new URL('../../data/calibration/essay_score_anchors.json', import.meta.url));
let cached: StoredAnchor[] | null = null;

function loadAnchors(): StoredAnchor[] {
  if (cached) return cached;
  try {
    const parsed = JSON.parse(fs.readFileSync(datasetPath, 'utf8')) as CalibrationDataset;
    cached = Array.isArray(parsed.essays)
      ? parsed.essays.filter((item) => item && item.id && item.essay && Number.isFinite(item.score))
      : [];
  } catch (error) {
    console.warn('[calibration] unable to load human-scored anchors:', error);
    cached = [];
  }
  return cached;
}

function compact(value: string): string {
  return String(value || '')
    .replace(/[\s\u3000，。！？；：、“”‘’（）《》〈〉【】—…,.!?;:'"()\[\]-]/g, '')
    .toLowerCase();
}

function bigrams(value: string): Set<string> {
  const text = compact(value);
  const result = new Set<string>();
  for (let index = 0; index < text.length - 1; index += 1) result.add(text.slice(index, index + 2));
  return result;
}

function similarity(a: string, b: string): number {
  const left = bigrams(a);
  const right = bigrams(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / Math.max(1, left.size + right.size - intersection);
}

function matchesCalibrationPrompt(questionText: string, essay: string): boolean {
  const question = compact(questionText);
  const body = compact(essay);
  const questionMatch = question.includes('突围')
    && (question.includes('成长') || question.includes('史铁生') || question.includes('张连钢') || question.includes('苏轼'));
  const essayMatch = body.includes('突围') && body.includes('成长');
  return questionMatch || essayMatch;
}

const bandOrder = ['一类文', '二类文', '三类文', '四类文'];

export function selectScoreAnchors(questionText: string, essay: string): CalibrationSelection {
  const stored = loadAnchors();
  if (!stored.length) return { applied: false, reason: '人工评分样本库未加载', anchors: [], datasetSize: 0 };
  if (!matchesCalibrationPrompt(questionText, essay)) {
    return { applied: false, reason: '当前作文与“突围与成长”样本题不匹配，未跨题套用样本', anchors: [], datasetSize: stored.length };
  }

  const ranked = stored
    .map((anchor) => ({ anchor, similarity: similarity(essay, anchor.essay) }))
    .sort((a, b) => b.similarity - a.similarity);
  const picked = new Map<string, { anchor: StoredAnchor; similarity: number }>();
  for (const band of bandOrder) {
    const item = ranked.find((candidate) => candidate.anchor.band === band);
    if (item) picked.set(item.anchor.id, item);
  }
  for (const item of ranked.slice(0, 2)) picked.set(item.anchor.id, item);

  const anchors = [...picked.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 6)
    .map(({ anchor, similarity: score }) => ({
      id: anchor.id,
      band: anchor.band,
      score: anchor.score,
      title: anchor.title,
      excerpt: anchor.essay.slice(0, 1400),
      similarity: Number(score.toFixed(4)),
    }));
  return {
    applied: true,
    reason: `已匹配“突围与成长”人工核定样本库（${stored.length}篇）`,
    anchors,
    datasetSize: stored.length,
  };
}

function scoreBounds(score: number): [number, number] {
  if (score >= 50) return [50, 60];
  if (score >= 45) return [45, 49];
  if (score >= 40) return [40, 44];
  return [0, 39];
}

function updateScore(ai: CorrectionAI, score: number): void {
  ai.scoring.finalScore = score;
  ai.scoring.grade = score >= 54 ? 'A' : score >= 45 ? 'B' : score >= 36 ? 'C' : 'D';
  if (ai.pigai?.estimate) ai.pigai.estimate.main = score;
}

export function calibrateScore(ai: CorrectionAI, selection: CalibrationSelection): CalibrationResult {
  const rawScore = Math.max(0, Math.min(60, Math.round(Number(ai.scoring?.finalScore) || 0)));
  const base = {
    reason: selection.reason,
    rawScore,
    calibratedScore: rawScore,
    anchors: selection.anchors.map(({ id, band, score, similarity: value }) => ({ id, band, score, similarity: value })),
  };
  if (!selection.applied || !selection.anchors.length || rawScore <= 0) return { applied: false, ...base };

  const closestOverall = [...selection.anchors].sort((a, b) => b.similarity - a.similarity)[0];
  if (closestOverall.similarity >= 0.52) {
    // 与人工核定原文（或轻微 OCR 差异版本）高度重合时，人工分优先于模型误判的区间。
    const calibrated = Math.max(0, Math.min(60, closestOverall.score));
    updateScore(ai, calibrated);
    return {
      applied: true,
      ...base,
      reason: `${selection.reason}；与样本 ${closestOverall.id} 高度匹配，采用教师核定分`,
      calibratedScore: calibrated,
      confidence: 'high',
    };
  }

  const [lower, upper] = scoreBounds(rawScore);
  const sameBand = selection.anchors.filter((anchor) => anchor.score >= lower && anchor.score <= upper);
  if (!sameBand.length) return { applied: false, ...base, reason: `${selection.reason}，但当前区间没有可用参照` };

  const closest = [...sameBand].sort((a, b) => b.similarity - a.similarity)[0];
  let calibrated = rawScore;
  let confidence: CalibrationResult['confidence'] = 'reference';
  const totalWeight = sameBand.reduce((sum, anchor) => sum + Math.max(0.05, anchor.similarity), 0);
  const target = sameBand.reduce((sum, anchor) => sum + anchor.score * Math.max(0.05, anchor.similarity), 0) / totalWeight;
  calibrated = Math.round(rawScore * 0.72 + target * 0.28);
  confidence = closest.similarity >= 0.18 ? 'medium' : 'reference';
  calibrated = Math.max(lower, Math.min(upper, Math.max(rawScore - 3, Math.min(rawScore + 3, calibrated))));
  updateScore(ai, calibrated);
  return {
    applied: true,
    ...base,
    reason: `${selection.reason}；先判区间，再参考同区间人工样本微调`,
    calibratedScore: calibrated,
    confidence,
  };
}
