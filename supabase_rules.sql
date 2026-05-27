-- Ejecutar en Supabase > SQL Editor para habilitar reglas de clasificación dinámicas

CREATE TABLE IF NOT EXISTS classification_rules (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL,           -- 'REPUESTO', 'ACCESORIO', 'PRODUCTO_COMPLETO', 'SERVICIO', etc.
  nivel TEXT NOT NULL,          -- 'keyword', 'rubro_pattern', 'subrubro_pattern'
  valor TEXT NOT NULL,
  activa BOOLEAN DEFAULT true,
  peso INTEGER DEFAULT 10,      -- peso en el scoring
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE classification_rules ENABLE ROW LEVEL SECURITY;

-- Crear política de acceso público (permitir lectura y escritura a todo el público)
CREATE POLICY "Allow all rules" ON classification_rules FOR ALL USING (true) WITH CHECK (true);

-- Crear índices de búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_rules_tipo   ON classification_rules(tipo);
CREATE INDEX IF NOT EXISTS idx_rules_nivel  ON classification_rules(nivel);
CREATE INDEX IF NOT EXISTS idx_rules_activa ON classification_rules(activa);
