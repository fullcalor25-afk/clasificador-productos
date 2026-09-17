-- ═══════════════════════════════════════════════════════════
-- TABLA PRODUCTOS_PUBLICADOS — Ejecutar en Supabase > SQL Editor
--
-- Registro propio de lo que ya se importó a Tienda Nube. Existe porque el
-- chequeo de slugs duplicados de exportTiendaNubeCSV() sólo compara contra
-- el lote que se está exportando en ese momento — no contra lo ya publicado
-- en lotes anteriores. Un slug repetido pisa el producto anterior al importar.
--
-- No hay API de Tienda Nube conectada: esta tabla se llena desde la app con
-- el botón "Marcar lote como publicado", DESPUÉS de confirmar manualmente
-- que la importación salió bien.
-- ═══════════════════════════════════════════════════════════

create table if not exists productos_publicados (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,           -- Identificador de URL
  codigo text,
  categoria_tiendanube text,
  lote text,                           -- ej. "calderas-placas-2026-09"
  fecha_publicado timestamptz default now()
);

alter table productos_publicados enable row level security;
drop policy if exists "productos_publicados acceso publico" on productos_publicados;
create policy "productos_publicados acceso publico"
on productos_publicados for all using (true) with check (true);

create index if not exists idx_productos_publicados_slug on productos_publicados(slug);
create index if not exists idx_productos_publicados_lote on productos_publicados(lote);

-- Verificar
SELECT lote, count(*) FROM productos_publicados GROUP BY lote ORDER BY lote;
