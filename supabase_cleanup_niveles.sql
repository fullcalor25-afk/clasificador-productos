-- Migración: deprecar nivel5 y nivel6 (max 4 niveles)
-- Ejecutar en Supabase SQL Editor ANTES de desplegar la versión con cap 4 niveles.
-- Los datos existentes en nivel5/nivel6 se migran a nivel4 cuando nivel4 está vacío.

-- 1. Promover nivel5 → nivel4 donde nivel4 está vacío
UPDATE tiendanube_categories
SET nivel4 = nivel5
WHERE nivel4 IS NULL AND nivel5 IS NOT NULL;

-- 2. Promover nivel6 → nivel4 donde nivel4 sigue vacío
UPDATE tiendanube_categories
SET nivel4 = nivel6
WHERE nivel4 IS NULL AND nivel6 IS NOT NULL;

-- 3. Limpiar nivel5 y nivel6 (quedan como columnas pero siempre NULL)
UPDATE tiendanube_categories
SET nivel5 = NULL, nivel6 = NULL;

-- Verificación: no deben quedar filas con nivel5/nivel6 no-NULL
-- SELECT COUNT(*) FROM tiendanube_categories WHERE nivel5 IS NOT NULL OR nivel6 IS NOT NULL;
-- Resultado esperado: 0
