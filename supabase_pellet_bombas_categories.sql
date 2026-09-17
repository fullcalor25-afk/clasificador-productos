-- ═══════════════════════════════════════════════════════════
-- CATEGORÍAS PELLET / LEÑA Y BOMBAS — Ejecutar en Supabase > SQL Editor
-- Cierra la brecha encontrada: el árbol de categorías no tenía
-- ningún nivel3/nivel4 para estufas a pellet, salamandras a leña
-- ni bombas/presurizadoras — solo cubría calefón/caldera a gas.
-- Mismo estilo que las categorías existentes (sustantivos, no verbos,
-- en español, coherentes con el nivel3 al que pertenecen).
-- ═══════════════════════════════════════════════════════════

INSERT INTO tiendanube_categories (nivel1, nivel2, nivel3, nivel4, keywords, activa, orden) VALUES

-- Calefacción > Estufas a Pellet (nivel3 nuevo)
('Repuestos y Accesorios', 'Calefaccion', 'Estufas a Pellet', 'Resistencias de Encendido',
 'resistencia encendido,resistencia pellet,bujia encendido pellet', true, 20),
('Repuestos y Accesorios', 'Calefaccion', 'Estufas a Pellet', 'Motores y Forzadores',
 'motoreductor,sinfin,extractor humos pellet,turbina pellet,ventilador pellet,motor forzador pellet', true, 21),
('Repuestos y Accesorios', 'Calefaccion', 'Estufas a Pellet', 'Sensores y Placas',
 'sonda ntc pellet,presostato pellet,placa pellet,display pellet,sensor temperatura pellet', true, 22),
('Repuestos y Accesorios', 'Calefaccion', 'Estufas a Pellet', 'Vidrios y Juntas',
 'vidrio pellet,vitroceramica,junta puerta pellet,cordon ceramico,brasero,crisol', true, 23),

-- Calefacción > Salamandras — sumar Pellet/Leña a lo que ya existe (mismo nivel3, nuevos nivel4)
('Repuestos y Accesorios', 'Calefaccion', 'Salamandras', 'Vidrios y Juntas',
 'vidrio salamandra,vitroceramica salamandra,junta puerta salamandra,cordon ceramico salamandra', true, 24),
('Repuestos y Accesorios', 'Calefaccion', 'Salamandras', 'Refractarios y Deflectores',
 'ladrillo refractario,vermiculita,deflector,parrilla salamandra,cajon cenicero', true, 25),

-- Calefacción > Bombas y Presurizadoras (nivel3 nuevo)
('Repuestos y Accesorios', 'Calefaccion', 'Bombas y Presurizadoras', 'Sellos y Capacitores',
 'sello mecanico bomba,capacitor bomba,condensador arranque bomba', true, 26),
('Repuestos y Accesorios', 'Calefaccion', 'Bombas y Presurizadoras', 'Presostatos y Membranas',
 'presostato presurizadora,membrana tanque hidroneumatico,membrana presurizadora', true, 27),
('Repuestos y Accesorios', 'Calefaccion', 'Bombas y Presurizadoras', 'Impulsores y Kits',
 'impulsor bomba,turbina bomba,kit reparacion bomba', true, 28)

ON CONFLICT DO NOTHING;

-- Verificar
SELECT nivel1, nivel2, nivel3, nivel4 FROM tiendanube_categories
WHERE nivel3 IN ('Estufas a Pellet', 'Bombas y Presurizadoras')
   OR (nivel3 = 'Salamandras' AND nivel4 IN ('Vidrios y Juntas', 'Refractarios y Deflectores'))
ORDER BY orden;
