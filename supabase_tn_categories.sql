-- ═══════════════════════════════════════════════════════════
-- CATEGORÍAS TIENDA NUBE — Ejecutar en Supabase > SQL Editor
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tiendanube_categories (
  id          BIGSERIAL PRIMARY KEY,
  nivel1      TEXT NOT NULL,
  nivel2      TEXT,
  nivel3      TEXT,
  keywords    TEXT,
  activa      BOOLEAN DEFAULT true,
  orden       INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tiendanube_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all tn_categories" ON tiendanube_categories
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_tn_categories_nivel1 ON tiendanube_categories(nivel1);
CREATE INDEX IF NOT EXISTS idx_tn_categories_nivel2 ON tiendanube_categories(nivel2);

-- Estructura base según las categorías de tu Tienda Nube
INSERT INTO tiendanube_categories (nivel1, nivel2, nivel3, keywords, orden) VALUES
-- Calefacción
('Repuestos y Accesorios', 'Calefaccion', 'Calderas',
 'caldera,plaqueta,electrodo caldera,quemador,intercambiador caldera,presostato,caudalimetro,vaso expansion,bomba caldera,display caldera,divisor,conjunto quemador',
 1),
('Repuestos y Accesorios', 'Calefaccion', 'Radiadores',
 'radiador,elemento,bimetalico,llave radiador,union radiador,tapones,purgador,desfangador',
 2),
('Repuestos y Accesorios', 'Calefaccion', 'Piso Radiante',
 'piso radiante,colector,detentor,coverthor,tubo piso,manifold,actuador,curva tubo',
 3),
('Repuestos y Accesorios', 'Calefaccion', 'Calefactores',
 'calefactor,tiro balanceado,tiro natural,rejilla calefactor,termostato calefactor,termocupla calefactor,piloto calefactor',
 4),
('Repuestos y Accesorios', 'Calefaccion', 'Salamandras',
 'salamandra,conducto enlozado,curva enlozada,codo enlozado,visor salamandra,porta,bisagra salamandra',
 5),
('Repuestos y Accesorios', 'Calefaccion', 'Calefon',
 'calefon,calefón,diafragma,termocupla calefon,piloto calefon,membrana calefon,electrodo calefon,unidad magnetica,ficha calefon,intercambiador calefon,botonera',
 6),
-- Refrigeración
('Repuestos y Accesorios', 'Refrigeración', 'Gas Refrigerante',
 'gas refrigerante,r22,r410,r134,r404,r32,garrafa refrigerante,carga refrigerante',
 7),
('Repuestos y Accesorios', 'Refrigeración', 'Válvulas y filtros',
 'valvula,filtro deshidratador,filtro heladera,chicote,visor liquid,solenoide,filtro refrigeracion',
 8),
('Repuestos y Accesorios', 'Refrigeración', 'Herramientas',
 'manifold,vacuometro,pinza amperimetrica,detector fugas,soldadora refrigeracion,nitrogeno',
 9),
('Repuestos y Accesorios', 'Refrigeración', 'Insumos de instalación',
 'caño cobre,aislacion termoflex,cinta aislante,soporte split,grapa refrigeracion,funda',
 10),
('Repuestos y Accesorios', 'Refrigeración', 'Motores y componentes eléctricos',
 'motor ventilador,compresor,capacitor,relay,contactor,electrovalvula,motor split',
 11),
-- Gas y Agua
('Repuestos y Accesorios', 'Gas y Agua', 'Gas',
 'caño gas,union gas,niple gas,cupla gas,llave esfera gas,regulador,flexible gas,medidor gas',
 12),
('Repuestos y Accesorios', 'Gas y Agua', 'Agua',
 'caño agua,union agua,niple agua,cupla agua,llave agua,canilla,grifo,pico,flexible agua,caño hidro',
 13),
-- Agua Sanitaria
('Repuestos y Accesorios', 'Agua Sanitaria', 'Termotanque',
 'termotanque,resistencia electrica,anodo magnesio,termostato termotanque,valvula seguridad,aislacion termotanque',
 14),
('Repuestos y Accesorios', 'Agua Sanitaria', 'Calefon',
 'calefon agua sanitaria,diafragma calefon,membrana calefon,piloto,unidad magnetica calefon',
 15),
('Repuestos y Accesorios', 'Agua Sanitaria', 'Filtros',
 'filtro agua,cartucho,membrana osmosis,carbon activado,purificador,dispensador agua,vaso filtro,filtro antisarro',
 16);

-- Verificar
SELECT nivel1, nivel2, nivel3 FROM tiendanube_categories ORDER BY orden;
