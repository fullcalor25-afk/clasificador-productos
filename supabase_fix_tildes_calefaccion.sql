-- ═══════════════════════════════════════════════════════════
-- UNIFICAR "Calefaccion" → "Calefacción" — Ejecutar en Supabase > SQL Editor
--
-- Problema: el árbol de categorías quedó partido en dos ramas que la app
-- muestra como distintas:
--   - "Calefacción" (con tilde): 17 filas — Calderas, Calefones, Calefactores,
--     Radiadores, Piso Radiante, Salamandras
--   - "Calefaccion" (sin tilde):  9 filas — Estufas a Pellet, Bombas y
--     Presurizadoras y 2 nivel4 de Salamandras (cargadas después)
--
-- Además, 544 paths YA guardados en otras tablas usan la escritura sin tilde
-- (tn_corrections 279, analysis_products 260, corrections 5). Esos paths hoy
-- no matchean ninguna categoría real: "Calefaccion > Calderas > ..." nunca
-- existió, porque Calderas sólo vive bajo la rama con tilde.
--
-- IMPORTANTE: los dos pasos van juntos. Arreglar sólo el árbol (paso 1)
-- dejaría esas 544 referencias apuntando a una escritura que ya no existiría
-- en ninguna fila — sería peor que el estado actual.
--
-- Verificado antes de escribir esto: unificar NO genera filas duplicadas
-- (ningún nivel3+nivel4 de la rama sin tilde existe ya bajo la rama con tilde).
--
-- replace() es idempotente acá: 'Calefacción' no contiene la cadena
-- 'Calefaccion' (la ó rompe el match), así que correrlo dos veces no duplica
-- la corrección.
-- ═══════════════════════════════════════════════════════════

begin;

-- ── Paso 1: unificar el árbol de categorías ────────────────────────────────
update tiendanube_categories
set nivel2 = 'Calefacción'
where nivel2 = 'Calefaccion';

-- ── Paso 2: realinear los paths ya guardados ───────────────────────────────
update tn_corrections
set categoria_tiendanube = replace(categoria_tiendanube, 'Calefaccion', 'Calefacción')
where categoria_tiendanube like '%Calefaccion%';

update analysis_products
set categoria_tiendanube = replace(categoria_tiendanube, 'Calefaccion', 'Calefacción')
where categoria_tiendanube like '%Calefaccion%';

update corrections
set categoria_tiendanube = replace(categoria_tiendanube, 'Calefaccion', 'Calefacción')
where categoria_tiendanube like '%Calefaccion%';

commit;

-- ── Verificar: las cuatro deben dar 0 ──────────────────────────────────────
select 'tiendanube_categories' as tabla, count(*) as sin_tilde from tiendanube_categories where nivel2 = 'Calefaccion'
union all select 'tn_corrections',    count(*) from tn_corrections    where categoria_tiendanube like '%Calefaccion%'
union all select 'analysis_products', count(*) from analysis_products where categoria_tiendanube like '%Calefaccion%'
union all select 'corrections',       count(*) from corrections       where categoria_tiendanube like '%Calefaccion%';

-- ── NOTA: esto arregla la tilde, no todo ───────────────────────────────────
-- Quedan paths guardados que apuntan a nivel4 que no existen, por motivos
-- ajenos a la tilde. Ej.: "Calderas > Accesorios" (26 filas) y
-- "Calderas > Repuestos Generales" (20) — Calderas no tiene esos nivel4;
-- "Calderas > Plaquetas" (3), que debería ser "Plaquetas y Electrónica".
-- Son correcciones aprendidas de corridas viejas de la IA. No rompen nada
-- (la validación de api/enrich.js las recategoriza por keywords), pero si se
-- quieren limpiar es un trabajo aparte, producto por producto.
select categoria_tiendanube, count(*) as filas
from tn_corrections
where categoria_tiendanube is not null
  and categoria_tiendanube <> ''
  and not exists (
    select 1 from tiendanube_categories c
    where tn_corrections.categoria_tiendanube =
          c.nivel1 || ' > ' || c.nivel2 || ' > ' || c.nivel3 || ' > ' || c.nivel4
  )
group by categoria_tiendanube
order by filas desc
limit 15;
