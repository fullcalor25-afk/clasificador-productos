# AGENTS.md — Clasificador HVAC Pro v2

## Descripción general
Aplicación web para clasificar productos industriales (repuestos, accesorios, productos completos, servicios) usando reglas dinámicas de Supabase, IA (Groq/Llama) y correcciones aprendidas persistidas. Usada por empresa HVAC en Patagonia para pre-procesar ~2700 productos antes de importar a Tienda Nube.

---

## Stack
| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite (sin CSS frameworks) |
| Estilos | CSS custom properties en `src/index.css` + objeto `C` en `constants.js` |
| Tema | Light por defecto; dark via `@media (prefers-color-scheme: dark)` |
| Backend | Netlify Functions (Node.js) |
| Base de datos | Supabase (PostgreSQL via REST API — sin supabase-js) |
| IA | Groq API (`llama-3.3-70b-versatile`, fallback `llama-3.1-8b-instant`) |
| Fuente | Outfit (Google Fonts) |

---

## Arquitectura del frontend

```
src/
├── index.jsx          — Entry point
├── index.css          — CSS variables + reset + animaciones
├── constants.js       — Objeto C (tema), CLS_COLORS, DEFAULT_RULES, PAGE_SIZE
├── utils.js           — Helpers puros (sin estado React)
├── App.jsx            — Componente raíz: estado global + orquestación
├── hooks/
│   ├── useClassification.js  — classifyProduct, processProductsChunked, runAI, loadRules
│   ├── useCorrections.js     — CRUD correcciones
│   └── useHistory.js         — Guardar/cargar historial
├── components/
│   ├── Sidebar.jsx    — Barra lateral fija 220px
│   └── Topbar.jsx     — Barra superior sticky 48px con breadcrumbs y acciones
└── views/
    ├── HomeView.jsx
    ├── UploadView.jsx
    ├── DashboardView.jsx
    ├── TableView.jsx
    ├── ExportView.jsx
    ├── HistoryView.jsx
    ├── HistoryDetailView.jsx
    ├── LearningView.jsx        (correcciones aprendidas)
    ├── CategoriesView.jsx
    ├── ClassificationView.jsx  (reglas dinámicas)
    └── SettingsView.jsx
```

### Layout
- **Sidebar** (220px fija, `position: fixed`): logo, secciones PRINCIPAL / ANÁLISIS ACTIVO / DATOS / CONFIGURACIÓN. Sección ANÁLISIS ACTIVO visible solo cuando hay sesión activa.
- **Topbar** (48px sticky, `position: sticky top: 0`): breadcrumb izquierda + acciones contextuales derecha.
- **Main** (`marginLeft: 220px`, `padding: 28px 32px`): área scrolleable con la vista activa.

### Sistema de temas (CSS variables)
Definido en `src/index.css`. El objeto `C` en `constants.js` referencia las variables:

| Variable | Uso |
|----------|-----|
| `--bg` | Fondo de página |
| `--surface` | Tarjetas / sidebar / topbar |
| `--surface2` | Superficies secundarias |
| `--border` | Bordes finos |
| `--border-md` | Bordes medios |
| `--text` | Texto principal |
| `--text-muted` | Texto secundario |
| `--text-dim` | Texto terciario / placeholders |
| `--accent` / `--accent-bg` | Azul info / fondo tenue |
| `--success` / `--success-bg` | Verde éxito |
| `--danger` / `--danger-bg` | Rojo peligro |
| `--warning` / `--warning-bg` | Amarillo advertencia |

### Persistencia de sesión
- `localStorage` key `hvac_session`: JSON con `{ classified, savedAt }`. Expira a 7 días.
- `localStorage` key `hvac_last_view`: última vista activa.
- `localStorage` key `clasificador_groq_key`: API key de Groq ingresada en Ajustes.
- `localStorage` key `tn_categories_cache`: cache de `tiendanube_categories` (única fuente de verdad).
- `localStorage` key `tn_corrections_cache`: mapa `{ [codigo.toLowerCase()]: categoria_tiendanube }`.
- `localStorage` keys `tn_default_stock`, `tn_show_no_price`, `tn_sku_prefix`: configuración de exportación TN.
- **Eliminado**: `categories_cache` (ya no se usa, se limpia en el mount del App).

---

## Archivos de utilidades

### `src/constants.js`
- `C` — objeto de tema (mapeado a CSS variables)
- `CLS_COLORS` — colores por clasificación (`REPUESTO`, `ACCESORIO`, etc.)
- `DEFAULT_RULES` — ~175 reglas de clasificación de respaldo (se cargan si Supabase no responde)
- `PAGE_SIZE = 50`

### `src/utils.js`
- `classifyProduct(product, rules)` — scoring con reglas dinámicas; no modificar lógica core
- `processProductsChunked` — re-exportada desde hook (backwards compat)
- `exportCSV(products)` — CSV completo; CATEGORIA = `_tn_nivel2`, SUBCATEGORIA = `_tn_nivel3`
- `exportHistoryCSV(products, includeTN)` — CSV de historial; con `includeTN=true` incluye 12 columnas TN
- `exportHistoryTiendaNubeCSV(histProducts)` — adapta campos lowercase → exportTiendaNubeCSV
- `exportTiendaNubeCSV(products)` — CSV Tienda Nube (24 cols, `;`, UTF-8 BOM); usa `getCategoriaTN()`
- `getCategoriaTN(product, tnCategories)` — prioridad: `_tn_manual` > `_enriched` > keyword matching
- `getProductPrice(p)` — busca precio en variantes PRECIO/precio/Precio/PRICE/price
- `fetchWithTimeout(url, options, timeout=30000)` — AbortController con timeout 30s
- `apiFetch(url, options)` — wrapper sobre fetchWithTimeout con Content-Type JSON
- `slugify(text)`, `buildCategoriaTN(product)`, `fmtDate(iso)`, `parseTabular(text)`, `wait(ms)`

---

## Hooks

### `src/hooks/useClassification.js`
```js
// processProductsChunked(products, corrections, rules, chunkSize=200, progressCb)
//   → no bloquea el hilo principal; llama progressCb(procesados, total) cada chunk
// runAI(products, groqApiKeyOverride, onResultsReady)
//   → llama /api/classify en batches; classify.js carga tiendanube_categories de Supabase
//   → resultados incluyen categoria_tiendanube; App.jsx aplica _tn_nivel1/2/3/4 al producto
//   → 401 y 5 errores consecutivos abortan; llama onResultsReady(batchResults)
// loadRules()
//   → GET /api/rules; fallback a DEFAULT_RULES si 404
```

### `src/hooks/useCategories.js` ⚠️ DEPRECATED
No usar en código nuevo. Las categorías internas (tabla `categories`/`subcategories` de Supabase) ya no se cargan en la app. La única fuente de verdad para jerarquía de categorías es `tiendanube_categories` via `useTnCategories`.

### `src/hooks/useTnCategories.js`
```js
// Fuente de verdad única para categorías de la app.
// Cache localStorage key: 'tn_categories_cache'
// loadTnCategories(), saveTnCategory(formData), deleteTnCategory(id)
```

### `src/hooks/useCorrections.js`
```js
// importBulkCorrections(csvRows)   → POST { bulk: [...] }
// clearAllCorrections()            → DELETE ?all=true
// deleteCorrection(id, codigo)     → DELETE ?id=xxx  o  ?codigo=xxx
```

### `src/hooks/useHistory.js`
```js
// saveAnalysis(nombre, classifiedProducts)
//   → POST analyses + analysis_products (lotes 100); persiste 12 campos TN planos
// loadHistoryDetail(id)
//   → GET ?id=; reconstruye _enriched desde columnas planas; parsea tags JSON
// updateHistoryProduct(prodId, analysisId, patchData)
//   → PATCH history.js con { productId, clasificacion, fuente, confianza }
```

---

## Netlify Functions

### `classify.js`
- POST: clasifica hasta 15 productos con Groq; lee correcciones de `clasificaciones` (Supabase); **carga `tiendanube_categories` de Supabase** para enriquecer el prompt; devuelve `categoria_tiendanube` (path completo) en cada resultado.

### `enrich.js`
- POST: enriquece hasta 15 productos para Tienda Nube; genera slug, nombre_limpio, marca, descripcion_html, tags, seo_titulo, seo_descripcion, peso_kg, alto_cm, ancho_cm, profundidad_cm, categoria_tiendanube.

### `categories.js` ⚠️ DEPRECATED
- Archivo mantenido en disco pero ya no se usa desde el frontend. No eliminar (puede tener datos históricos).
- La jerarquía de categorías ahora vive en `tiendanube_categories` via `api/tn-categories.js`.

### `tn-categories.js`
- GET/POST/PUT/DELETE sobre `tiendanube_categories` (nivel1–nivel4, keywords, activa, orden)

### `tn-corrections.js`
- GET/POST/DELETE sobre `tn_corrections` (codigo UNIQUE, categoria_tiendanube, producto)
- Se aplican al cargar productos: si `codigo` match → asigna `_tn_nivel1/2/3/4` + `_tn_manual=true`

### `corrections.js`
- **GET** `?page=N&limit=N&search=term` — lista paginada con búsqueda por código/producto
- **POST** `{ codigo, producto, rubro, sub_rubro, clasificacion_corregida }` — upsert individual
- **POST** `{ bulk: [{...}] }` — importación masiva (chunks 100, upsert por código)
- **DELETE** `?all=true` — borra todas las correcciones
- **DELETE** `?id=N` — borra por id
- **DELETE** `?codigo=XXX` — borra por código

### `history.js`
- **GET** (lista) `?from=YYYY-MM&to=YYYY-MM` — filtra por mes; anota `has_enriched` en cada análisis
- **GET** `?id=N` — detalle con array `products`
- **POST** — crea análisis + productos (lotes 100)
- **PUT** `?id=N` — renombra
- **DELETE** `?id=N` — elimina
- **PATCH** `?id=N` + `{ productId, clasificacion, fuente, confianza }` — actualiza producto individual

### `rules.js`
- **GET** — lista todas las reglas activas/inactivas ordenadas por id
- **POST** `{ tipo, nivel, valor, peso, activa }` — crea regla individual
- **POST** `{ reset: true, defaults: [...] }` — borra todo y re-inserta las reglas por defecto
- **DELETE** `?id=N` — elimina regla

---

## Variables de entorno (Netlify)
| Variable | Uso |
|----------|-----|
| `GROQ_API_KEY` | API key de Groq |
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Anon key de Supabase |

---

## Tablas Supabase

### `corrections`
`id`, `codigo` (UNIQUE), `producto`, `rubro`, `sub_rubro`, `clasificacion_corregida`, `updated_at`

### `analyses`
`id`, `nombre`, `total`, `repuestos`, `accesorios`, `completos`, `servicios`, `otros`, `aprendidos`, `created_at`

### `analysis_products`
`id`, `analysis_id` (FK → analyses CASCADE), `codigo`, `producto`, `rubro`, `sub_rubro`, `clasificacion`, `fuente`, `confianza`, `category_id`, `subcategory_id`, `tipo`
— Columnas TN (nullable): `slug`, `nombre_limpio`, `marca`, `descripcion_html`, `tags` (JSON string), `seo_titulo`, `seo_descripcion`, `peso_kg`, `alto_cm`, `ancho_cm`, `profundidad_cm`, `categoria_tiendanube`
— SQL de migración: `supabase_todo.sql`

### `categories` + `subcategories` ⚠️ DEPRECATED
Tablas mantenidas en Supabase pero ya no usadas por el frontend. No eliminar.

### `tiendanube_categories`
`id`, `nivel1`, `nivel2`, `nivel3`, `nivel4` (TEXT, max 4 niveles), `keywords`, `activa`, `orden`, `created_at`
— **Única fuente de verdad para jerarquía de categorías**
— Usada en: `TnCategoriesView`, `useTnCategories`, `classify.js` (prompt), `enrich.js` (prompt), `ExportView`

### `tn_corrections`
`id`, `codigo` (UNIQUE), `producto`, `categoria_tiendanube` (path completo), `created_at`, `updated_at`
— Correcciones manuales de categoría TN; se aplican al cargar productos via `handleProductsLoaded`
— SQL: `supabase_tn_corrections.sql`

### `classification_rules`
`id`, `tipo` (REPUESTO|ACCESORIO|PRODUCTO_COMPLETO|SERVICIO), `nivel` (keyword|rubro_pattern|subrubro_pattern), `valor`, `peso`, `activa`, `created_at`
— SQL de creación: `supabase_rules.sql`

### `clasificaciones` (legacy)
`codigo`, `producto`, `rubro`, `sub_rubro`, `clasificacion_ia`, `clasificacion_manual`, `updated_at`
— Usada solo por `classify.js` para contexto del prompt de IA.

---

## Lógica de clasificación (prioridad)
1. **Correcciones aprendidas** (`corrections`) — confianza 100%, fuente `APRENDIDO`
2. **IA Groq** (`classify.js`) — si confianza IA ≥ confianza reglas, fuente `IA`
3. **Reglas dinámicas** (`classification_rules`) — scoring con keywords + regex; fuente `REGLAS`

### `classifyProduct(product, rules)`
- Carga reglas desde Supabase al montar; fallback a `DEFAULT_RULES` de `constants.js`
- Niveles de regla: `rubro_pattern` (peso 40) → `subrubro_pattern` (peso 30) → `keyword` (peso variable)
- Score ≥ 30 → REPUESTO; ≥ 10 → ACCESORIO; ≤ -20 → SERVICIO; con keyword completo → PRODUCTO_COMPLETO; else OTRO
- **NO modificar esta función sin revisar los DEFAULT_RULES de `constants.js`**

### Procesamiento en chunks
- `processProductsChunked(products, corrections, rules, chunkSize=200, progressCb)`
- Cada 200 items llama `await wait(0)` para liberar el hilo principal (evita freeze en lotes grandes)

---

## Vistas

| Vista | Ruta interna | Descripción |
|-------|-------------|-------------|
| `home` | Inicio | Banner sesión activa · stats de sesión · últimos 5 del historial · bienvenida si vacío |
| `upload` | Nuevo análisis | Paste de texto o carga CSV/Excel tabular |
| `dashboard` | Dashboard | Stats cards · distribución · top rubros · top categorías · progreso IA |
| `table` | Tabla | Tabla paginada 50/página con filtros, búsqueda, edición inline, selección masiva |
| `exportTN` | Tienda Nube | 3 pasos: selección → enriquecimiento IA → preview + descarga CSV |
| `history` | Historial | Lista con filtros de fecha · badges `has_enriched` · acciones ver/renombrar/eliminar |
| `historyDetail` | Historial · [nombre] | Tabla de productos · exportar CSV · exportar CSV TN (si enriquecido) · eliminar |
| `learning` | Aprendizaje | Tabla paginada de correcciones de clasificación · búsqueda · eliminar · importar CSV · borrar todo |
| `tnLearning` | Aprendizaje TN | Tabla de correcciones de categoría Tienda Nube · edición en cascada · eliminar · exportar CSV |
| `tnCategories` | Categorías TN 🛍 | Árbol jerárquico de `tiendanube_categories` (nivel1–nivel4) · CRUD inline · keywords chips |
| `classificationRules` | Reglas | CRUD de reglas dinámicas en Supabase · toggle activa/inactiva · reset a defaults |
| `settings` | Ajustes | API key Groq · opciones CSV Tienda Nube (stock, SKU prefix) · limpiar sesión |

---

## Módulo Tienda Nube

### Formato CSV
- Separador: `;` (punto y coma)
- Encoding: UTF-8 con BOM (`﻿`)
- **24 columnas** en orden exacto (no modificar sin testear importación)
- Nombre de archivo: `tiendanube_repuestos.csv`

### Campo `_enriched`
- En sesión activa: vive en memoria en el objeto del producto
- Al guardar: `saveAnalysis` mapea `_enriched` a 12 columnas planas en `analysis_products`
- Al cargar historial: `loadHistoryDetail` reconstruye `_enriched` desde columnas planas (`tags` se parsea de JSON)
- Sin enriquecimiento: CSV usa `slugify(PRODUCTO)` + `buildCategoriaTN(p)` como fallback

---

## Reglas de desarrollo
- **NO** modificar `classifyProduct()` sin revisar DEFAULT_RULES y tests manuales
- **NO** instalar librerías de UI (Tailwind, MUI, Chakra, etc.) — solo inline styles con `C`
- **NO** instalar React Router — navegación con `activeView` en `App.jsx`
- **NO** cambiar formato del CSV de Tienda Nube (24 columnas, separador `;`) — está probado en producción
- **NO** romper las integraciones Supabase existentes
- Usar `GROQ_API_KEY` (no Gemini, no OpenAI directo)
- Todas las funciones serverless: `OPTIONS` handler + CORS headers en toda respuesta
- Nuevos campos en `analysis_products` → agregar migración en `supabase_todo.sql`
- Nuevas tablas de clasificación → SQL en `supabase_rules.sql`
