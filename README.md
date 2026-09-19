# Clasificador HVAC Pro

Herramienta de gestión de catálogo HVAC para **Full Calor** (El Calafate, Argentina).
Clasifica productos industriales (repuestos, accesorios, equipos), los enriquece con
datos de e-commerce y los exporta en formato CSV para importar directamente a
**Tienda Nube**.

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite |
| Funciones serverless | Vercel Functions (Node.js ESM) |
| Base de datos | Supabase (PostgreSQL vía REST API) |
| IA clasificación / enriquecimiento | Groq API (`openai/gpt-oss-120b`, con fallback a `openai/gpt-oss-20b`) |
| Deploy | Vercel (auto-deploy desde GitHub) |

---

## Cómo funciona

1. **Cargar datos**: pegar desde Google Sheets (Ctrl+A → Ctrl+C → pegar) o subir un CSV/XLSX.
2. **Clasificación automática**: un motor de reglas locales (keywords + scoring sobre
   nombre, rubro y sub-rubro) clasifica cada producto al instante en `REPUESTO`,
   `ACCESORIO`, `PRODUCTO_COMPLETO`, `SERVICIO` u `OTRO`.
3. **Correcciones aprendidas**: cada corrección manual queda guardada en Supabase por
   código de producto y se aplica automáticamente en cargas futuras (prioridad máxima).
4. **Mejorar con IA** (opcional): botón "Activar IA" envía los productos a Groq para
   una clasificación más precisa en casos ambiguos.
5. **Revisar y corregir**: editar clasificaciones manualmente en la tabla; cada edición
   se aprende automáticamente.
6. **Exportar a Tienda Nube**: seleccionar productos, enriquecerlos con IA (descripción,
   categoría, marca, dimensiones estimadas) y descargar el CSV listo para importar.

Para el detalle completo de la lógica de clasificación, categorías de Tienda Nube,
esquema de Supabase y reglas de desarrollo, ver [`AGENTS.md`](./AGENTS.md).

---

## Deploy en Vercel

### 1. Variables de entorno

En Vercel → tu proyecto → **Settings** → **Environment Variables**, configurar:

| Variable | Descripción |
|----------|-------------|
| `GROQ_API_KEY` | API key de [Groq](https://console.groq.com/keys) (gratis) |
| `GEMINI_API_KEY` | API key de [Gemini](https://aistudio.google.com/apikey) — OCR de las fotos de placas |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_KEY` | anon public key de Supabase |
| `VITE_SUPABASE_URL` | igual que `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | igual que `SUPABASE_KEY` |

> Importante: las funciones serverless usan `SUPABASE_URL` y `SUPABASE_KEY`
> **sin** prefijo `VITE_`. El prefijo `VITE_` solo aplica a variables consumidas
> por el frontend de Vite.
>
> Las dos `VITE_*` son las únicas variables del frontend y existen para que el
> celular suba las fotos directo a Supabase Storage, sin pasar por una función
> serverless (el body de las Vercel Functions está limitado a ~4.5MB y una foto
> de iPhone sin comprimir lo supera). Es la misma anon key pública: la seguridad
> la da la policy del bucket.

### 2. Base de datos

Ejecutar los scripts SQL de la raíz del repo (`supabase_*.sql`) en el editor SQL
de Supabase para crear las tablas necesarias (`corrections`, `tn_corrections`,
`tiendanube_categories`, `analyses`, `analysis_products`, `rules`).

### 3. Deploy

El proyecto se despliega automáticamente en cada push a `main` vía la integración
de Vercel con GitHub (configuración en `vercel.json`). Para desarrollo local:

```bash
npm install
npm run dev
```

---

## Estructura del proyecto

```
clasificador-productos/
├── index.html
├── vite.config.js
├── vercel.json
├── package.json
├── AGENTS.md               ← Documentación técnica detallada
├── src/
│   ├── index.jsx
│   ├── App.jsx              ← Componente principal
│   ├── constants.js         ← Colores, reglas por defecto
│   ├── utils.js             ← classifyProduct(), export CSV, helpers
│   ├── components/
│   ├── hooks/
│   └── views/
├── api/                     ← Vercel Functions (ESM)
│   ├── classify.js          ← Clasificación IA con Groq
│   ├── corrections.js       ← CRUD correcciones aprendidas
│   ├── history.js           ← CRUD historial de análisis
│   ├── enrich.js            ← Enriquecimiento TN con Groq
│   ├── tn-categories.js     ← CRUD categorías Tienda Nube
│   ├── tn-corrections.js    ← CRUD correcciones de categoría TN
│   ├── rules.js             ← Reglas dinámicas de clasificación
│   └── _helpers.js          ← Helpers compartidos (logging, Supabase)
└── supabase_*.sql           ← Scripts de creación de tablas
```

---

## Seguridad

- Las API keys (Groq, Supabase) nunca se exponen al navegador del usuario.
- Todas las llamadas a Groq y Supabase se hacen 100% server-side a través de las
  funciones serverless en `api/`.

---

## Costo

| Servicio | Costo |
|----------|-------|
| Vercel hosting + Functions | Gratis en el plan Hobby |
| Groq API | Gratis (con límites de rate por minuto/día) |
| Supabase | Gratis en el plan Free |
| GitHub | Gratis |
