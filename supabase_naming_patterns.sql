-- Patrones de nombre APRENDIDOS POR CATEGORIA.
--
-- Por que no va dentro de `corrections`: corrections aprende por CODIGO (un
-- producto concreto, prioridad maxima sobre IA y reglas). Esta tabla aprende
-- por CATEGORIA, para poder sugerirle un nombre a un producto que nunca se
-- vio antes pero que cae en una categoria ya trabajada.
--
-- Aplicado en Supabase el 2026-09-25.
create table if not exists naming_patterns (
  id bigserial primary key,

  -- Path nivel1..nivel4 tal cual figura en tiendanube_categories.
  categoria_tiendanube text not null,

  -- El mismo path normalizado (minusculas, sin acentos). Es la clave real de
  -- busqueda: "Calefaccion" y "Calefacción" son la MISMA categoria, igual que
  -- en el resto del sistema. La UNIQUE va sobre esta, no sobre la de arriba,
  -- para que no puedan convivir dos filas que solo difieren en tildes.
  categoria_norm text not null,

  patron_ejemplo text,
  estructura text,

  -- [{nombre_original, nombre_normalizado}] — los ejemplos que el usuario
  -- confirmo a mano. Es la memoria del patron: con menos de 3 no se sugiere
  -- nada (ver la REGLA DE ORO en api/naming-patterns.js).
  muestras_json jsonb not null default '[]'::jsonb,

  confianza_promedio numeric,
  veces_aplicado integer not null default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists naming_patterns_categoria_norm_uniq
  on naming_patterns (categoria_norm);

-- Mismo patron que el resto de las tablas: RLS con politica publica permisiva.
-- La seguridad real la aplican las Vercel Functions (api/*.js), no RLS; esto
-- solo evita que Supabase bloquee escrituras de la anon key por defecto.
alter table naming_patterns enable row level security;

drop policy if exists "naming_patterns publico" on naming_patterns;
create policy "naming_patterns publico" on naming_patterns
  for all using (true) with check (true);
