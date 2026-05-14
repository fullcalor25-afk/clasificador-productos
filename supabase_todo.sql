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
