-- Agregar campos enriquecidos a la tabla corrections
-- Ejecutar en Supabase SQL Editor

ALTER TABLE corrections
  ADD COLUMN IF NOT EXISTS prop1_nombre       TEXT,
  ADD COLUMN IF NOT EXISTS prop1_valor        TEXT,
  ADD COLUMN IF NOT EXISTS prop2_nombre       TEXT,
  ADD COLUMN IF NOT EXISTS prop2_valor        TEXT,
  ADD COLUMN IF NOT EXISTS prop3_nombre       TEXT,
  ADD COLUMN IF NOT EXISTS prop3_valor        TEXT,
  ADD COLUMN IF NOT EXISTS nombre_limpio      TEXT,
  ADD COLUMN IF NOT EXISTS marca              TEXT,
  ADD COLUMN IF NOT EXISTS peso_kg            NUMERIC,
  ADD COLUMN IF NOT EXISTS alto_cm            NUMERIC,
  ADD COLUMN IF NOT EXISTS ancho_cm           NUMERIC,
  ADD COLUMN IF NOT EXISTS profundidad_cm     NUMERIC,
  ADD COLUMN IF NOT EXISTS categoria_tiendanube TEXT;
