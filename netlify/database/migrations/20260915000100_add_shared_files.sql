CREATE TABLE IF NOT EXISTS shared_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by_name TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  extracted_text TEXT NOT NULL DEFAULT '',
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS file_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES shared_files(id) ON DELETE CASCADE,
  asked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  asked_by_name TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS file_questions_file_id_idx ON file_questions (file_id);
