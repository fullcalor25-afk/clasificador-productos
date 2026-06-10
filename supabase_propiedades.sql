-- Agregar columnas de propiedades variables de Tienda Nube a analysis_products
-- Ejecutar en Supabase SQL Editor

ALTER TABLE analysis_products
  ADD COLUMN IF NOT EXISTS prop1_nombre TEXT,
  ADD COLUMN IF NOT EXISTS prop1_valor  TEXT,
  ADD COLUMN IF NOT EXISTS prop2_nombre TEXT,
  ADD COLUMN IF NOT EXISTS prop2_valor  TEXT,
  ADD COLUMN IF NOT EXISTS prop3_nombre TEXT,
  ADD COLUMN IF NOT EXISTS prop3_valor  TEXT;
