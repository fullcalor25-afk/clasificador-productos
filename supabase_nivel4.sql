-- Índice para acelerar consultas de nivel4
CREATE INDEX IF NOT EXISTS idx_tn_categories_nivel4
  ON tiendanube_categories(nivel4);

-- Ver qué nivel3 tienen más productos sin nivel4
SELECT nivel2, nivel3, COUNT(*) as sin_nivel4
FROM tiendanube_categories
WHERE nivel4 IS NULL
GROUP BY nivel2, nivel3
ORDER BY nivel2, nivel3;
