-- =============================================================
-- 议论文智能批改与教学辅助系统 · PostgreSQL 结构（含 pgvector 说明）
-- 说明：P0 MVP 本地演示默认使用 JSON 文件存储（server/data/db.json），
-- 存储层已按“表”抽象，切换为本 schema 只需替换 server/src/db 的实现。
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- 语义检索（作文查重/素材检索）需 pgvector：
-- CREATE EXTENSION IF NOT EXISTS vector;

-- 用户表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(20) DEFAULT 'teacher', -- teacher / admin
  created_at TIMESTAMP DEFAULT NOW()
);

-- 教师评语风格模板表（风格学习）
CREATE TABLE teacher_styles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES users(id),
  ai_raw_comment TEXT,
  teacher_modified_comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 班级表
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES users(id),
  name VARCHAR(100) NOT NULL,
  grade_level VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 学生表
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES classes(id),
  name VARCHAR(50) NOT NULL,
  student_no VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 题库表
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES users(id),
  title VARCHAR(200) NOT NULL,
  material_text TEXT NOT NULL,
  requirement_text TEXT NOT NULL,
  checklist JSONB,
  thinking_type VARCHAR(20), -- causal / dialectical / analogy / critical
  difficulty VARCHAR(10),
  province VARCHAR(50),
  grade VARCHAR(10),
  keyword VARCHAR(100),
  traps JSONB,
  published BOOLEAN DEFAULT false,
  source VARCHAR(20) DEFAULT 'ai_generated',
  created_at TIMESTAMP DEFAULT NOW()
);

-- 批改记录表（核心）
CREATE TABLE corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID REFERENCES questions(id),
  student_id UUID REFERENCES students(id),
  teacher_id UUID REFERENCES users(id),
  original_text TEXT NOT NULL,
  ai_response JSONB NOT NULL,
  teacher_modified_comment TEXT,
  final_score DECIMAL(5,2),
  logic_error_tags TEXT[],
  is_verified BOOLEAN DEFAULT false,
  confidence_avg DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_corrections_class ON corrections (student_id, created_at DESC);
-- 如需语义查重：ALTER TABLE corrections ADD COLUMN embedding vector(1024);

-- 素材库（白名单知识库）
CREATE TABLE materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  category VARCHAR(50),
  content TEXT NOT NULL,
  tags TEXT[],
  debate_dimension VARCHAR(50),
  source VARCHAR(100),
  source_verified BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 优秀片段表
CREATE TABLE highlight_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correction_id UUID REFERENCES corrections(id),
  clip_text TEXT NOT NULL,
  topic_tags TEXT[],
  class_id UUID REFERENCES classes(id),
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 学生错题本
CREATE TABLE student_weakness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  error_tag VARCHAR(50),
  correction_id UUID REFERENCES corrections(id),
  example_sentence TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 个性化学习任务表
CREATE TABLE learning_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  question_id UUID REFERENCES questions(id),
  task_type VARCHAR(20), -- practice / review / read
  status VARCHAR(20) DEFAULT 'pending',
  recommended_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
