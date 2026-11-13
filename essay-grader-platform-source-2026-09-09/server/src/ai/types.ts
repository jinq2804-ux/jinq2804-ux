import type { ChecklistItem, CorrectionAI, ThinkingType, Difficulty } from '../types.ts';

export interface QuestionInput {
  province: string;
  grade: string;
  keyword?: string;
  thinkingType: ThinkingType;
  useWeb?: boolean;
}

export interface QuestionDraft {
  title: string;
  materialText: string;
  requirementText: string;
  checklist: ChecklistItem[];
  thinkingType: ThinkingType;
  difficulty: Difficulty;
  province: string;
  grade: string;
  keyword?: string;
  traps: string[];
  sourceNote: string;
  year?: string;
  examCategory?: string;
  paperName?: string;
  styleNote?: string;
}

export interface CorrectInput {
  question?: { id?: string; title?: string; materialText?: string } | null;
  essay: string;
  scoreAnchors?: ScoreAnchor[];
}

export interface ScoreAnchor {
  id: string;
  band: string;
  score: number;
  title: string;
  excerpt: string;
  similarity: number;
}

export interface ScaffoldInput {
  questionId?: string;
  title: string;
  materialText: string;
  keyword?: string;
  thinkingType?: ThinkingType;
}

export interface ScaffoldInsight { level: string; title: string; description: string; }
export interface ScaffoldPoint { title: string; type: '并列' | '递进' | '对比'; detail: string; }
export interface ScaffoldMaterial { name: string; trait: string; appliesTo: string; source: string; }
export interface ScaffoldOutput {
  insights: ScaffoldInsight[];
  outline: { intro: string; points: ScaffoldPoint[]; conclusion: string };
  materials: ScaffoldMaterial[];
  traps: string[];
}

export interface LectureSegment { phase: string; minutes: number; content: string; examples: string[]; }
export interface LectureOutlineOutput {
  title: string;
  totalMinutes: number;
  segments: LectureSegment[];
}

export interface RecommendationTask { questionId?: string; questionTitle?: string; taskType: 'practice' | 'review' | 'read'; note: string; }
export interface RecommendationOutput {
  studentId: string;
  studentName: string;
  focus: string;
  reason: string;
  tasks: RecommendationTask[];
}

export interface CustomGenerateInput {
  mode: 'imitate' | 'idea' | 'raw';
  styleQuestionId?: string;
  style?: { title?: string; province?: string; year?: string; examCategory?: string; paperName?: string; materialText?: string; requirementText?: string; keyword?: string; thinkingType?: string; grade?: string } | null;
  keyword?: string;
  thinkingType?: ThinkingType;
  province?: string;
  grade?: string;
  rawTitle?: string;
  rawMaterial?: string;
  inspiration?: string;
}

export interface AIProvider {
  readonly mode: string;
  generateQuestion(input: QuestionInput): Promise<QuestionDraft>;
  generateCustomQuestion(input: CustomGenerateInput): Promise<QuestionDraft>;
  correctEssay(input: CorrectInput): Promise<CorrectionAI>;
  generateScaffold(input: ScaffoldInput): Promise<ScaffoldOutput>;
  generateLectureOutline(className: string, weaknesses: { tag: string; ratio: number }[], avgScore: number): Promise<LectureOutlineOutput>;
  generateRecommendations(profile: { studentId: string; studentName: string; tags: string[]; avg: number }[]): Promise<RecommendationOutput[]>;
}

export interface KnowledgeMaterial {
  id: string;
  title: string;
  content: string;
  dims: { form: string; field: string; motif: string; era: string };
  source?: string;
  sourceUrl?: string;
  teacherComment?: string;
  applicableArguments?: string;
}
