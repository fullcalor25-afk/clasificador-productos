-- Fotos de placas / etiquetas de producto + OCR (spec v5, punto 3)
--
-- El celular sube la foto DIRECTO a Storage (evita el límite de ~4.5MB de body
-- de las Vercel Functions); la función serverless solo recibe la URL ya subida.
-- La seguridad la da la policy del bucket, no el secreto de la anon key.

-- 1) Bucket público, 25MB por archivo
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'producto-fotos',
  'producto-fotos',
  true,
  26214400,
  ARRAY['image/jpeg','image/png','image/heic','image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "producto-fotos insert publico" ON storage.objects;
CREATE POLICY "producto-fotos insert publico"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'producto-fotos');

DROP POLICY IF EXISTS "producto-fotos lectura publica" ON storage.objects;
CREATE POLICY "producto-fotos lectura publica"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'producto-fotos');

DROP POLICY IF EXISTS "producto-fotos borrado publico" ON storage.objects;
CREATE POLICY "producto-fotos borrado publico"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'producto-fotos');

-- 2) Tabla de imágenes + OCR
--    `codigo` es la misma clave que ya comparten corrections y analysis_products.
CREATE TABLE IF NOT EXISTS producto_imagenes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo            TEXT NOT NULL,
  url               TEXT NOT NULL,
  ocr_texto         TEXT,
  ocr_confirmado    BOOLEAN DEFAULT FALSE,
  codigo_confirmado TEXT,
  provider_usado    TEXT DEFAULT 'gemini',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE producto_imagenes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "producto_imagenes acceso publico" ON producto_imagenes;
CREATE POLICY "producto_imagenes acceso publico"
  ON producto_imagenes FOR ALL USING (true) WITH CHECK (true);

-- El listado por lote consulta por `codigo IN (...)`
CREATE INDEX IF NOT EXISTS idx_producto_imagenes_codigo ON producto_imagenes(codigo);
