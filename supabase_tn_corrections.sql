CREATE TABLE IF NOT EXISTS tn_corrections (
  id          BIGSERIAL PRIMARY KEY,
  codigo      TEXT NOT NULL UNIQUE,
  producto    TEXT,
  categoria_tiendanube TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tn_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all tn_corrections" ON tn_corrections
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_tn_corrections_codigo ON tn_corrections(codigo);

CREATE OR REPLACE FUNCTION update_tn_corrections_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tn_corrections_updated_at
  BEFORE UPDATE ON tn_corrections
  FOR EACH ROW EXECUTE FUNCTION update_tn_corrections_updated_at();
