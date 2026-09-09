// 领域类型（与需求文档 ERD 对齐；JSON 文件存储层，可平滑切换 PostgreSQL）
export type Role = 'teacher' | 'admin';
export type ThinkingType = 'progressive' | 'dialectical' | 'metaphoric' | 'free';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: Role;
  createdAt: string;
}

export interface TeacherStyle {
  id: string;
  teacherId: string;
  aiRawComment: string;
  teacherModifiedComment: string;
  createdAt: string;
}

export interface ClassRoom {
  id: string;
  teacherId: string;
  name: string;
  gradeLevel: string;
  createdAt: string;
}

export interface Student {
  id: string;
  classId: string;
  name: string;
  studentNo: string;
  createdAt: string;
}

export interface ChecklistItem { item: string; score: number; }

// bank: 题库分类（高考真题 / 模拟卷考题）；空表示用户自建/AI 生成/导入
export type QuestionBank = 'gaokao' | 'mock';
export type QuestionSource = 'ai_generated' | 'manual' | 'imported' | 'gaokao' | 'mock';

export interface Question {
  id: string;
  teacherId: string;
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
  published: boolean;
  source: QuestionSource;
  // 题库元信息（真题/模拟卷）
  bank?: QuestionBank;
  year?: string;
  examCategory?: string;      // 模拟卷考试类别：名校协作体 / 八省联考 / T8联考 ...
  paperName?: string;         // 试卷名称，如 “2024年新高考Ⅰ卷语文”
  styleOriginId?: string;     // 自定义出题：模仿的原题 id
  createdAt: string;
}

export type PigaiMarkColor = 'red' | 'blue' | 'orange';

// 批改1.0 报告：估分 + 三色标注全文 + 四维优点与不足
export interface PigaiEstimate {
  main: number;               // 60 制主估（与路由字数扣分后的 finalScore 一致）
  range: string;              // 区间，如 “50—55”
  tier: string;               // 一类上/一类中/一类下/二类/三类
  blocks: { content: number; expression: number; development: number }; // 各 0–20，总和≈main
  floorReasons: string[];     // 够着本档下限的理由（引用原文）
  nextBandGaps: string[];     // 够不着上一档的差距（引用原文）
}
export interface PigaiMark {
  paragraph: number;          // 段号（从 1 起）
  original: string;           // 原文片段
  color: PigaiMarkColor;      // red=错别字/病句, blue=逻辑错误, orange=引用待核
  note: string;               // 提示/修改建议
}
export interface PigaiDimension {
  name: '审题与立意' | '内容与论据' | '结构与论证' | '语言与思辨性';
  strengths: string[];
  weaknesses: string[];
}
export interface PigaiReport {
  estimate: PigaiEstimate;
  marks: PigaiMark[];
  dimensions: PigaiDimension[];
}

export interface CorrectionAI {
  scoring: { finalScore: number; grade: string }; // 60 制；新记录与 pigai.estimate.main 一致
  highlights: string[];                           // 可上“优秀片段墙”的句子
  pigai?: PigaiReport;                            // 旧版数据（历史记录）可能缺失
}

export interface Correction {
  id: string;
  questionId: string;
  studentId: string;
  teacherId: string;
  originalText: string;
  aiResponse: CorrectionAI;
  teacherModifiedComment?: string;
  finalScore: number;
  logicErrorTags: string[];
  isVerified: boolean;
  confidenceAvg: number;
  createdAt: string;
  updatedAt: string;
}

export interface Material {
  id: string;
  title: string;
  content: string;
  gradeLevels?: string[];
  dims: { form: string; field: string; motif: string; era: string };
  debateDimension: string;
  source: string;
  sourceTitle?: string;
  sourceUrl?: string;
  sourcePublisher?: string;
  sourcePublishedAt?: string;
  sourceVerified: boolean;
  teacherComment?: string;
  applicableArguments?: string;
  status?: 'draft' | 'pending' | 'published' | 'archived';
  reviewedBy?: string;
  reviewedAt?: string;
  origin?: 'manual' | 'automatic';
  collectionSourceId?: string;
  collectedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface MyMaterial {
  id: string;
  userId: string;
  materialId: string;
  createdAt: string;
}

export interface HighlightClip {
  id: string;
  correctionId: string;
  clipText: string;
  topicTags: string[];
  classId: string;
  isPinned: boolean;
  createdAt: string;
}

export interface StudentWeakness {
  id: string;
  studentId: string;
  errorTag: string;
  correctionId: string;
  exampleSentence: string;
  createdAt: string;
}

export interface LearningTask {
  id: string;
  studentId: string;
  questionId: string;
  taskType: 'practice' | 'review' | 'read';
  status: 'pending' | 'completed';
  recommendedBy: string;
  createdAt: string;
}

export interface DatabaseShape {
  users: User[];
  teacherStyles: TeacherStyle[];
  classes: ClassRoom[];
  students: Student[];
  questions: Question[];
  corrections: Correction[];
  materials: Material[];
  highlightClips: HighlightClip[];
  myMaterials: MyMaterial[];
  studentWeakness: StudentWeakness[];
  learningTasks: LearningTask[];
}

