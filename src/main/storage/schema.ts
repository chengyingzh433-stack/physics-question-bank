export const SCHEMA_V1 = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS papers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL,
  source_pdf_path TEXT, original_filename TEXT, page_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'importing', year INTEGER, source TEXT,
  kind TEXT NOT NULL DEFAULT 'paper',
  parent_paper_id INTEGER REFERENCES papers(id) ON DELETE CASCADE,
  created_at TEXT, updated_at TEXT);

CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY,
  paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  page_index INTEGER NOT NULL, width_pt REAL, height_pt REAL,
  column_mode INTEGER DEFAULT 1, rotation INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS column_dividers (
  id INTEGER PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  x_ratio REAL NOT NULL);

CREATE TABLE IF NOT EXISTS cut_lines (
  id INTEGER PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  col_index INTEGER NOT NULL DEFAULT 0, y_ratio REAL NOT NULL, created_seq INTEGER);

CREATE TABLE IF NOT EXISTS manual_boxes (
  id INTEGER PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  x_start_ratio REAL NOT NULL,
  x_end_ratio REAL NOT NULL,
  y_start_ratio REAL NOT NULL,
  y_end_ratio REAL NOT NULL,
  is_excluded INTEGER NOT NULL DEFAULT 0,
  created_seq INTEGER);

CREATE TABLE IF NOT EXISTS segments (
  id INTEGER PRIMARY KEY,
  paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  col_index INTEGER NOT NULL DEFAULT 0,
  x_start_ratio REAL, x_end_ratio REAL, y_start_ratio REAL, y_end_ratio REAL,
  order_index INTEGER, is_deleted INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS question_types (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_builtin INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS chapters (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL,
  parent_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
  template_key TEXT, node_key TEXT);
CREATE TABLE IF NOT EXISTS knowledge_points (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL,
  chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS difficulties (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY,
  paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  order_in_paper INTEGER,
  type_id INTEGER REFERENCES question_types(id) ON DELETE SET NULL,
  chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
  difficulty_id INTEGER REFERENCES difficulties(id) ON DELETE SET NULL,
  is_merged INTEGER DEFAULT 0, image_path TEXT, width_px INTEGER, height_px INTEGER,
  year_override INTEGER, source_override TEXT,
  answer_image_path TEXT, answer_width_px INTEGER, answer_height_px INTEGER,
  created_at TEXT, updated_at TEXT);

CREATE TABLE IF NOT EXISTS question_segments (
  id INTEGER PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  segment_id INTEGER NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  merge_order INTEGER DEFAULT 0);

-- 显式空数组表示用户已确认“无答案”，与尚未保存的自动配对区分。
CREATE TABLE IF NOT EXISTS answer_pairings (
  question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  answer_paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  segment_ids TEXT NOT NULL CHECK(json_valid(segment_ids)));

-- 重裁会复用 SQLite 行号，必须在删除来源片段前作废整组关联与旧答案图。
CREATE TRIGGER IF NOT EXISTS invalidate_answer_before_segment_delete
BEFORE DELETE ON segments BEGIN
  UPDATE questions SET answer_image_path = NULL, answer_width_px = NULL, answer_height_px = NULL
    WHERE id IN (SELECT question_id FROM answer_pairings, json_each(segment_ids) WHERE value = OLD.id);
  UPDATE answer_pairings SET segment_ids = '[]'
    WHERE question_id IN (SELECT question_id FROM answer_pairings, json_each(segment_ids) WHERE value = OLD.id);
END;
CREATE TRIGGER IF NOT EXISTS invalidate_answer_before_segment_hide
BEFORE UPDATE OF is_deleted ON segments WHEN NEW.is_deleted = 1 AND OLD.is_deleted = 0 BEGIN
  UPDATE questions SET answer_image_path = NULL, answer_width_px = NULL, answer_height_px = NULL
    WHERE id IN (SELECT question_id FROM answer_pairings, json_each(segment_ids) WHERE value = OLD.id);
  UPDATE answer_pairings SET segment_ids = '[]'
    WHERE question_id IN (SELECT question_id FROM answer_pairings, json_each(segment_ids) WHERE value = OLD.id);
END;
CREATE TRIGGER IF NOT EXISTS clear_answer_before_paper_delete
BEFORE DELETE ON papers WHEN OLD.kind = 'answer' BEGIN
  UPDATE questions SET answer_image_path = NULL, answer_width_px = NULL, answer_height_px = NULL
    WHERE paper_id = OLD.parent_paper_id;
END;

CREATE TABLE IF NOT EXISTS question_knowledge_points (
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  kp_id INTEGER NOT NULL REFERENCES knowledge_points(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, kp_id));

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT);
CREATE TABLE IF NOT EXISTS template_rules (
  id INTEGER PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  from_no INTEGER, to_no INTEGER,
  type_id INTEGER REFERENCES question_types(id) ON DELETE SET NULL, rule_order INTEGER);

CREATE TABLE IF NOT EXISTS paper_sets (
  id INTEGER PRIMARY KEY, name TEXT, title TEXT,
  status TEXT DEFAULT 'draft', created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS paper_set_items (
  id INTEGER PRIMARY KEY,
  set_id INTEGER NOT NULL REFERENCES paper_sets(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  order_index INTEGER, group_header TEXT, display_number TEXT);

CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS question_folders (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS question_folder_items (
  folder_id INTEGER NOT NULL REFERENCES question_folders(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  PRIMARY KEY (folder_id, question_id));
CREATE INDEX IF NOT EXISTS idx_question_folder_items_question
  ON question_folder_items(question_id);
`;

export const BUILTIN_TYPES = ['单选题','多选题','填空题','实验题','计算题'];
export const BUILTIN_DIFFICULTIES = ['简单','中等','较难','压轴'];
