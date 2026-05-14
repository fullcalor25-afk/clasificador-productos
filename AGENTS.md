# AGENTS.md — Clasificador de Productos

## Descripción general
Aplicación web para clasificar productos industriales (repuestos, accesorios, productos completos, servicios) usando reglas locales, IA (Groq/Llama) y correcciones aprendidas persistidas en Supabase.

## Stack
- **Frontend**: React 18 + Vite (sin CSS frameworks, todo inline styles con objeto de tema `C`)
- **Backend serverless**: Netlify Functions (Node.js)
- **Base de datos**: Supabase (PostgreSQL via REST API)
- **IA**: Groq API (Llama 3.3-70b / Llama 3.1-8b)

## Archivos principales

### Frontend
- `src/App.jsx` — Componente principal. Contiene toda la lógica de UI, clasificación local, estado global y llamadas a funciones serverless.
- `src/index.jsx` — Entry point de React.

### Netlify Functions
- `netlify/functions/classify.js` — Clasificación con IA via Groq. Lee correcciones de Supabase para inyectarlas en el prompt. Lee de tabla `clasificaciones`.
- `netlify/functions/corrections.js` — GET/POST correcciones aprendidas. Tabla `corrections` (codigo UNIQUE).
- `netlify/functions/history.js` — CRUD completo de historial de análisis. GET lista/detalle, POST crea, PUT renombra, DELETE elimina. Tablas `analyses` + `analysis_products`.
- `netlify/functions/update-correction.js` — Legacy: guarda correcciones en tabla `clasificaciones` (usada por classify.js para el prompt de IA).

## Variables de entorno (Netlify)
- `GROQ_API_KEY` — API key de Groq para clasificación con IA
- `VITE_SUPABASE_URL` — URL del proyecto Supabase
- `VITE_SUPABASE_ANON_KEY` — Anon key de Supabase

## Tablas Supabase

### `clasificaciones` (legacy, usada por classify.js)
- `codigo` (unique), `producto`, `rubro`, `sub_rubro`, `clasificacion_ia`, `clasificacion_manual`, `updated_at`

### `corrections` (nueva)
- `id`, `codigo` (UNIQUE), `producto`, `rubro`, `sub_rubro`, `clasificacion_corregida`, `updated_at`

### `analyses` (nueva)
- `id`, `nombre`, `total`, `repuestos`, `accesorios`, `completos`, `servicios`, `otros`, `aprendidos`, `created_at`

### `analysis_products` (nueva)
- `id`, `analysis_id` (FK → analyses, CASCADE), `codigo`, `producto`, `rubro`, `sub_rubro`, `clasificacion`, `fuente`, `confianza`

> SQL de creación en `supabase_todo.sql`

## Lógica de clasificación (prioridad)
1. **Correcciones aprendidas** (Supabase `corrections`) — confianza 100%, marcados con 📚 y fuente `APRENDIDO`
2. **IA Groq** — si confianza IA > confianza reglas, se aplica con fuente `IA`
3. **Reglas locales** (`classifyProduct`) — palabras clave, patrones, score — fuente `REGLAS`

## Vistas de la app
- `upload` — carga de datos (paste o CSV)
- `dashboard` — estadísticas, cards (Total/Repuestos/Accesorios/Completos/Aprendidos), distribución, top rubros
- `table` — tabla paginada con filtros y edición manual (✏️)
- `history` — lista de análisis guardados con acciones Ver/Renombrar/Eliminar
- `historyDetail` — detalle de un análisis: tabla de productos con filtros, paginación, exportar CSV, eliminar

## Funcionalidades del header
- **📋 Historial** — siempre visible, abre lista de análisis guardados
- **💾 Guardar** — visible cuando hay productos clasificados, abre modal de nombre y guarda en Supabase
- **Dashboard / Tabla** — navegación entre vistas del análisis actual
- **📥 Exportar** — dropdown para exportar CSV (todos o por categoría), incluye columna FUENTE
- **Nueva carga** — resetea toda la app

## Reglas de desarrollo
- No modificar `classifyProduct()` ni sus keywords
- No modificar `classify.js` (función Groq)
- No instalar librerías de UI — solo inline styles con el objeto `C` (tema oscuro)
- Todas las funciones serverless usan CORS headers en todas las respuestas
- CSV exportado incluye columna FUENTE: `APRENDIDO` / `IA` / `REGLAS`
