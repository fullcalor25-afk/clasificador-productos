-- Ejecutar en Supabase > SQL Editor
--
-- Corrige dos problemas relacionados con "no se están guardando los procesos":
--
-- 1) corrections, analyses y analysis_products (definidas en supabase_todo.sql)
--    nunca tuvieron una política RLS explícita, a diferencia de
--    classification_rules, tiendanube_categories y tn_corrections que sí la
--    tienen (ver supabase_rules.sql, supabase_tn_categories.sql,
--    supabase_tn_corrections.sql). Si en algún momento se activó RLS para
--    estas tablas desde el dashboard de Supabase sin agregar una política,
--    todo INSERT/UPDATE hecho con la anon key queda bloqueado en silencio.
--    Este script habilita RLS explícitamente con una política pública
--    permisiva, igual que en las otras tablas (la app ya protege el acceso
--    a nivel de Vercel Functions, no depende de RLS para seguridad).
--
-- 2) Agrega la columna tn_manual a analysis_products, que el frontend ya
--    envía (useHistory.js) pero no existía en el schema.

-- ─── RLS: corrections ────────────────────────────────────────────────────
ALTER TABLE corrections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all corrections" ON corrections;
CREATE POLICY "Allow all corrections" ON corrections FOR ALL USING (true) WITH CHECK (true);

-- ─── RLS: analyses ───────────────────────────────────────────────────────
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all analyses" ON analyses;
CREATE POLICY "Allow all analyses" ON analyses FOR ALL USING (true) WITH CHECK (true);

-- ─── RLS: analysis_products ──────────────────────────────────────────────
ALTER TABLE analysis_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all analysis_products" ON analysis_products;
CREATE POLICY "Allow all analysis_products" ON analysis_products FOR ALL USING (true) WITH CHECK (true);

-- ─── Columna faltante: tn_manual ─────────────────────────────────────────
ALTER TABLE analysis_products ADD COLUMN IF NOT EXISTS tn_manual boolean DEFAULT false;
