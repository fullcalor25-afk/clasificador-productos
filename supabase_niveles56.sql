-- Agregar nivel5 y nivel6 a la tabla tiendanube_categories
-- Ejecutar en Supabase SQL Editor

ALTER TABLE tiendanube_categories ADD COLUMN IF NOT EXISTS nivel5 TEXT;
ALTER TABLE tiendanube_categories ADD COLUMN IF NOT EXISTS nivel6 TEXT;

-- Índice parcial para acelerar queries de nivel5 (solo filas con valor)
CREATE INDEX IF NOT EXISTS idx_tn_categories_nivel5
  ON tiendanube_categories (nivel5)
  WHERE nivel5 IS NOT NULL;

-- Índice parcial para nivel6
CREATE INDEX IF NOT EXISTS idx_tn_categories_nivel6
  ON tiendanube_categories (nivel6)
  WHERE nivel6 IS NOT NULL;
