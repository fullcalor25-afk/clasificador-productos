import { createClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase para el browser — se usa SOLO para subir fotos a Storage.
 *
 * El celular sube la imagen directo al bucket y después le pasa la URL ya
 * subida a /api/product-images. Eso evita el límite de ~4.5MB de body de las
 * Vercel Functions contra fotos de iPhone sin comprimir.
 *
 * La anon key es la misma clave pública que ya usan las funciones serverless
 * como SUPABASE_KEY: la seguridad la da la policy del bucket, no el secreto.
 */
const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const BUCKET_FOTOS = "producto-fotos";

export const supabase = URL && ANON_KEY ? createClient(URL, ANON_KEY) : null;

/** Mensaje único para cuando faltan las env vars del frontend. */
export const SUPABASE_NO_CONFIGURADO =
  "Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para poder subir fotos.";

/**
 * Sube un archivo tal cual sale de la cámara — sin comprimir ni redimensionar,
 * que es lo que pide la spec para no perder legibilidad del código impreso.
 * Devuelve la URL pública.
 */
export async function subirFotoProducto(codigo, file) {
  if (!supabase) throw new Error(SUPABASE_NO_CONFIGURADO);

  const ext = (file.name?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const base = (codigo || "sin-codigo")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "sin-codigo";

  const path = `${base}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET_FOTOS)
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });

  if (error) throw new Error(error.message || "No se pudo subir la foto");

  const { data } = supabase.storage.from(BUCKET_FOTOS).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("No se pudo obtener la URL pública de la foto");
  return data.publicUrl;
}
