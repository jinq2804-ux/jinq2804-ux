export type Role = 'teacher' | 'admin';
export interface User { id: string; email: string; name: string; role: Role; createdAt?: string; }
export interface ClassRoom { id: string; teacherId: string; name: string; gradeLevel: string; studentCount?: number; correctionCount?: number; avgScore?: number; createdAt?: string; }
export interface Student { id: string; classId: string; name: string; studentNo: string; createdAt?: string; avgScore?: number; correctionCount?: number; tags?: string[]; }
export interface Question { id: string; teacherId: string; title: string; materialText: string; requirementText: string; checklist: { item: string; score: number }[]; thinkingType: string; difficulty: string; province: string; grade: string; keyword?: string; traps: string[]; published: boolean; source: string; sourceNote?: string; bank?: 'gaokao' | 'mock'; year?: string; examCategory?: string; paperName?: string; styleOriginId?: string; styleNote?: string; createdAt: string; }
export interface Correction { id: string; questionId: string; studentId: string; teacherId: string; originalText: string; aiResponse: AIResponse; teacherModifiedComment?: string; finalScore: number; logicErrorTags: string[]; isVerified: boolean; confidenceAvg: number; createdAt: string; updatedAt: string; studentName?: string; studentNo?: string; className?: string; questionTitle?: string; questionMaterial?: string; }
export type PigaiMarkColor = 'red' | 'blue' | 'orange';
export interface PigaiEstimate {
  main: number;
  range: string;
  tier: string;
  blocks: { content: number; expression: number; development: number };
  floorReasons: string[];
  nextBandGaps: string[];
}
export interface PigaiMark { paragraph: number; original: string; color: PigaiMarkColor; note: string; }
export interface PigaiDimension {
  name: '审题与立意' | '内容与论据' | '结构与论证' | '语言与思辨性';
  strengths: string[];
  weaknesses: string[];
}
export interface PigaiReport { estimate: PigaiEstimate; marks: PigaiMark[]; dimensions: PigaiDimension[]; }

export interface AIResponse {
  scoring: { finalScore: number; grade: string };
  highlights: string[];
  pigai?: PigaiReport;
}
export interface Material {
  id: string; title: string; content: string; gradeLevels: string[];
  dims: { form: string; field: string; motif: string; era: string };
  debateDimension: string; source: string; sourceTitle?: string; sourceUrl?: string;
  sourcePublisher?: string; sourcePublishedAt?: string; sourceVerified: boolean;
  teacherComment?: string; applicableArguments?: string;
  status: 'draft' | 'pending' | 'published' | 'archived'; reviewedBy?: string; reviewedAt?: string;
  origin?: 'manual' | 'automatic'; collectionSourceId?: string; collectedAt?: string;
  createdBy: string; createdAt: string; updatedAt: string;
}
export interface Weakness { id: string; studentId: string; errorTag: string; correctionId: string; exampleSentence: string; createdAt: string; }
export interface LearningTask { id: string; studentId: string; questionId?: string; questionTitle?: string; taskType: string; status: string; note?: string; createdAt: string; }
export interface HighlightClip { id: string; correctionId: string; clipText: string; topicTags: string[]; classId: string; isPinned: boolean; createdAt: string; studentName?: string; questionTitle?: string; verified?: boolean; }


