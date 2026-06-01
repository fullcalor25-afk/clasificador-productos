-- Agregar columna nivel4 a tiendanube_categories
-- Ejecutar en Supabase > SQL Editor

ALTER TABLE tiendanube_categories ADD COLUMN IF NOT EXISTS nivel4 TEXT;
