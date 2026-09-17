-- ═══════════════════════════════════════════════════════════
-- TABLA MARCAS — Ejecutar en Supabase > SQL Editor
--
-- Reemplaza las listas de marcas/proveedores hardcodeadas en el prompt de
-- api/enrich.js. De acá en más, sumar una marca nueva es un INSERT acá,
-- no una edición de código.
--
-- Dos usos además del prompt:
--   - categoria_forzada: regla de negocio determinística. Si el producto
--     menciona la marca, api/enrich.js pisa la categoría que devolvió la IA
--     con este path. Así el caso Goodman/furnace (que NUNCA va a Calderas)
--     no depende de que el LLM respete una instrucción de texto.
--   - alias: variantes de escritura que se normalizan al mismo slug, para
--     que no convivan "immergas" / "Immergas" / "inmergas" como cosas distintas.
-- ═══════════════════════════════════════════════════════════

create table if not exists marcas (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,              -- lo que se usa en tags, ej. "immergas"
  nombre text not null,                   -- para mostrar, ej. "Immergas"
  tipo text not null check (tipo in ('marca_equipo','fabricante_componente')),
  categoria_nivel3 text,                  -- nivel3 típico donde aparece (ayuda al matching)
  categoria_forzada text,                 -- path completo, opcional
  alias text[] default '{}',              -- variantes de escritura a normalizar a este slug
  activa boolean default true
);

alter table marcas enable row level security;
drop policy if exists "marcas acceso publico" on marcas;
create policy "marcas acceso publico"
on marcas for all using (true) with check (true);

-- Seed: lo identificado hasta ahora
insert into marcas (slug, nombre, tipo, categoria_nivel3, categoria_forzada, alias) values
('baxi', 'Baxi', 'marca_equipo', 'Calderas', null, '{}'),
('vaillant', 'Vaillant', 'marca_equipo', 'Calderas', null, '{}'),
('ferroli', 'Ferroli', 'marca_equipo', 'Calderas', null, '{}'),
('junkers', 'Junkers', 'marca_equipo', 'Calderas', null, '{}'),
('immergas', 'Immergas', 'marca_equipo', 'Calderas', null, '{}'),
('ariston', 'Ariston', 'marca_equipo', 'Calderas', null, '{}'),
('peisa', 'Peisa', 'marca_equipo', 'Calderas', null, '{}'),
('rehau', 'Rehau', 'marca_equipo', 'Calderas', null, '{}'),
('fondital', 'Fondital', 'marca_equipo', 'Calderas', null, '{}'),
('caldaia', 'Caldaia', 'marca_equipo', 'Calderas', null, '{}'),
('orbis', 'Orbis', 'marca_equipo', 'Calefones', null, '{}'),
('longvie', 'Longvie', 'marca_equipo', 'Calefones', null, '{}'),
('rheem', 'Rheem', 'marca_equipo', 'Calefones', null, '{}'),
('domec', 'Domec', 'marca_equipo', 'Calefones', null, '{}'),
('coppens', 'Coppens', 'marca_equipo', 'Calefones', null, '{}'),
('eskabe', 'Eskabe', 'marca_equipo', 'Calefones', null, '{}'),
('target', 'Target', 'marca_equipo', 'Calefones', null, '{}'),
('tromen', 'Tromen', 'marca_equipo', 'Estufas a Pellet', null, '{}'),
('nuke', 'Ñuke', 'marca_equipo', 'Estufas a Pellet', null, '{"ñuke"}'),
('bosca', 'Bosca', 'marca_equipo', 'Estufas a Pellet', null, '{}'),
('brago', 'Brago', 'marca_equipo', 'Estufas a Pellet', null, '{}'),
('grundfos', 'Grundfos', 'marca_equipo', 'Bombas y Presurizadoras', null, '{}'),
('pluvius', 'Pluvius', 'marca_equipo', 'Bombas y Presurizadoras', null, '{}'),
-- furnace / aire forzado: SIEMPRE fuerzan categoría Calefactores, nunca Calderas
('goodman', 'Goodman', 'marca_equipo', 'Calefactores', 'Repuestos y Accesorios > Calefacción > Calefactores > Repuestos Generales', '{}'),
('white-rodgers', 'White-Rodgers', 'fabricante_componente', 'Calefactores', 'Repuestos y Accesorios > Calefacción > Calefactores > Repuestos Generales', '{"white-sock","white sock"}'),
('carrier', 'Carrier', 'marca_equipo', 'Calefactores', 'Repuestos y Accesorios > Calefacción > Calefactores > Repuestos Generales', '{}'),
('lennox', 'Lennox', 'marca_equipo', 'Calefactores', 'Repuestos y Accesorios > Calefacción > Calefactores > Repuestos Generales', '{}'),
('trane', 'Trane', 'marca_equipo', 'Calefactores', 'Repuestos y Accesorios > Calefacción > Calefactores > Repuestos Generales', '{}'),
('york', 'York', 'marca_equipo', 'Calefactores', 'Repuestos y Accesorios > Calefacción > Calefactores > Repuestos Generales', '{}'),
('bryant', 'Bryant', 'marca_equipo', 'Calefactores', 'Repuestos y Accesorios > Calefacción > Calefactores > Repuestos Generales', '{}'),
-- fabricantes de placa/control universal (no son marca del equipo)
('surrey', 'Surrey', 'fabricante_componente', null, null, '{}'),
('honeywell', 'Honeywell', 'fabricante_componente', null, null, '{}'),
('zettler', 'Zettler', 'fabricante_componente', null, null, '{}')
on conflict (slug) do nothing;

-- Verificar
SELECT tipo, count(*) FROM marcas GROUP BY tipo;
SELECT slug, nombre, categoria_forzada FROM marcas WHERE categoria_forzada IS NOT NULL ORDER BY slug;
