-- Ejecutar en Supabase > SQL Editor

-- Tabla de correcciones aprendidas
create table if not exists corrections (
  id bigint generated always as identity primary key,
  codigo text unique not null,
  producto text default '',
  rubro text default '',
  sub_rubro text default '',
  clasificacion_corregida text not null,
  updated_at timestamptz default now()
);

-- Tabla de análisis guardados
create table if not exists analyses (
  id bigint generated always as identity primary key,
  nombre text not null,
  total integer default 0,
  repuestos integer default 0,
  accesorios integer default 0,
  completos integer default 0,
  servicios integer default 0,
  otros integer default 0,
  aprendidos integer default 0,
  created_at timestamptz default now()
);

-- Tabla de productos por análisis (CASCADE delete)
create table if not exists analysis_products (
  id bigint generated always as identity primary key,
  analysis_id bigint not null references analyses(id) on delete cascade,
  codigo text default '',
  producto text default '',
  rubro text default '',
  sub_rubro text default '',
  clasificacion text not null,
  fuente text default 'REGLAS',
  confianza integer default 0
);

-- Índices para búsquedas rápidas
create index if not exists idx_analysis_products_analysis_id on analysis_products(analysis_id);
create index if not exists idx_corrections_codigo on corrections(codigo);

-- ─── Columnas para categorías (sesión 2) ────────────────────────────────────
-- Ejecutar si la tabla analysis_products no tiene estas columnas:
alter table analysis_products add column if not exists category_id bigint references categories(id) on delete set null;
alter table analysis_products add column if not exists subcategory_id bigint references subcategories(id) on delete set null;
alter table analysis_products add column if not exists tipo text;

-- ─── Columnas para datos enriquecidos de Tienda Nube (sesión 3) ─────────────
-- Ejecutar para habilitar la persistencia del enriquecimiento IA en el historial:
alter table analysis_products add column if not exists slug text;
alter table analysis_products add column if not exists nombre_limpio text;
alter table analysis_products add column if not exists marca text;
alter table analysis_products add column if not exists descripcion_html text;
alter table analysis_products add column if not exists tags text;
alter table analysis_products add column if not exists seo_titulo text;
alter table analysis_products add column if not exists seo_descripcion text;
alter table analysis_products add column if not exists peso_kg numeric;
alter table analysis_products add column if not exists alto_cm numeric;
alter table analysis_products add column if not exists ancho_cm numeric;
alter table analysis_products add column if not exists profundidad_cm numeric;
alter table analysis_products add column if not exists categoria_tiendanube text;
