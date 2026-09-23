# AGENTS.md — Clasificador HVAC Pro

## Descripción del proyecto

Herramienta de gestión de catálogo HVAC para Full Calor (El Calafate, Argentina).
Clasifica productos industriales, los enriquece con datos de e-commerce y
los exporta en formato CSV para importar directamente a Tienda Nube.

**Usuario:** Maximiliano Chavez — empresa de calefacción y HVAC.
**Tienda:** Full Calor en Tienda Nube.
**Objetivo:** Publicar sección de repuestos HVAC clasificados, categorizados
y con ficha completa lista para importar.

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite |
| Funciones serverless | Vercel Functions (Node.js ESM) |
| Base de datos | Supabase (PostgreSQL via REST API) |
| IA clasificación | Groq API (openai/gpt-oss-120b / openai/gpt-oss-20b), con Gemini (`gemini-3.8-flash`) de respaldo si Groq se excede de cuota |
| IA enriquecimiento | Groq API (mismo modelo), con el mismo respaldo de Gemini |
| IA visión / OCR de fotos | Gemini (`gemini-3.8-flash`) por defecto, Groq (`qwen/qwen3.6-27b`) como modo rápido |
| Deploy | Vercel (auto-deploy desde GitHub) |
| Repo | GitHub (fullcalor25-afk/clasificador-productos) |

---

## Variables de entorno (Vercel)

```
GROQ_API_KEY              API key de Groq
GEMINI_API_KEY            API key de Gemini (OCR de fotos de placas)
SUPABASE_URL              URL del proyecto Supabase
SUPABASE_KEY              anon public key de Supabase

VITE_SUPABASE_URL         idem SUPABASE_URL, para el frontend
VITE_SUPABASE_ANON_KEY    idem SUPABASE_KEY, para el frontend
```

Las dos `VITE_*` son las únicas variables del frontend, y existen solo para
que el celular suba las fotos DIRECTO a Supabase Storage sin pasar por una
función serverless (el body de las Vercel Functions tiene un límite de ~4.5MB
y una foto de iPhone sin comprimir lo pasa). Es la misma anon key pública:
la seguridad la da la policy del bucket, no el secreto de la key.

IMPORTANTE: Las funciones serverless usan SUPABASE_URL y SUPABASE_KEY
(sin prefijo VITE_). El prefijo VITE_ solo aplica al frontend de Vite.

### Key personal de Groq (opcional)

Desde Configuración, un usuario puede guardar su propia Groq API key en
`localStorage("clasificador_groq_key")`. El frontend la manda en el header
`x-groq-key` en cada llamada a `/api/classify` y `/api/enrich`; ambas
funciones usan esa key si viene presente, y si no, caen a la
`GROQ_API_KEY` del servidor. Esto permite repartir la carga entre varias
cuotas de Groq en vez de que todos los usuarios compartan una sola. La key
viaja solo por header HTTPS server-side, nunca se loguea ni se devuelve al
cliente.

`GEMINI_API_KEY` NO sigue ese esquema a propósito: es solo server-side, sin
override por header ni campo en Ajustes. La key de Gemini nunca llega al
browser. El usuario puede elegir el proveedor de OCR (Gemini o Groq), no la
credencial con la que corre Gemini.

---

## Estructura de archivos

```
clasificador-productos/
├── index.html
├── vite.config.js
├── vercel.json
├── package.json
├── AGENTS.md
├── src/
│   ├── main.jsx
│   ├── App.jsx             ← Componente principal (estado global, vistas)
│   └── utils.js            ← classifyProduct() y helpers de export/CSV
├── api/                   ← Vercel Functions (ESM)
│   ├── classify.js        ← Clasificación IA con Groq
│   ├── corrections.js     ← CRUD correcciones aprendidas
│   ├── history.js         ← CRUD historial de análisis
│   ├── enrich.js          ← Enriquecimiento TN con Groq
│   ├── tn-categories.js   ← CRUD categorías Tienda Nube
│   ├── tn-corrections.js  ← CRUD correcciones de categoría TN
│   └── rules.js           ← Reglas dinámicas de clasificación
└── public/
```

---

## Tablas Supabase

### producto_imagenes — Fotos de placas/etiquetas + OCR
```sql
id (uuid), codigo, url, ocr_texto, ocr_confirmado,
codigo_confirmado, provider_usado, created_at
```
`codigo` es la misma clave que comparten `corrections` y `analysis_products`.
`provider_usado` guarda quién leyó esa foto (`gemini` o `groq`).
`ocr_texto` guarda el JSON crudo que devolvió el modelo de visión;
`codigo_confirmado` es lo que el usuario confirmó a mano — y es ese, nunca el
`ocr_texto` crudo, el que después alimenta el tag `oem:`. Las imágenes viven
en el bucket público `producto-fotos`.

### corrections — Correcciones aprendidas de clasificación Y enriquecimiento
```sql
id, codigo (UNIQUE), producto, rubro, sub_rubro,
clasificacion_corregida,
categoria_tiendanube, nombre_limpio, marca,
prop1_nombre, prop1_valor,
prop2_nombre, prop2_valor,
prop3_nombre, prop3_valor,
peso_kg, alto_cm, ancho_cm, profundidad_cm,
updated_at
```
Fuente de verdad: cada corrección manual del usuario se guarda aquí.
Al cargar productos, se aplican automáticamente por CODIGO.
Prioridad máxima sobre IA y reglas.

`POST /api/corrections` acepta dos modos: una corrección individual
(`{codigo, clasificacion_corregida, ...}`) o carga masiva
(`{bulk: [...]}`, chunks de 100). Ambos modos guardan tanto los campos de
clasificación como los enriquecidos (`nombre_limpio`, `marca`, `prop1..3`,
dimensiones, `categoria_tiendanube`) — solo se sobreescribe un campo si
viene no-vacío en el request, para no pisar datos ya cargados con `null`.

### marcas — Marcas y fabricantes (fuente de verdad, NO hardcodear en el prompt)
```sql
id, slug (UNIQUE), nombre, tipo, categoria_nivel3, categoria_forzada, alias[], activa
```
Ver `supabase_marcas.sql`. `tipo` es `marca_equipo` (marca del equipo al que
pertenece el repuesto) o `fabricante_componente` (quién fabrica la placa/
sensor/válvula, que puede ser distinto de la marca del equipo).

`api/enrich.js` lee esta tabla en cada request y arma con ella las listas de
marcas del prompt. **Sumar una marca nueva es un INSERT acá, no una edición
del prompt.** Si la tabla no está disponible se cae a `DEFAULT_MARCAS` dentro
de `api/enrich.js`, que es sólo un fallback mínimo, no la fuente de verdad.

- `categoria_forzada`: path completo. Si el producto menciona la marca,
  `api/enrich.js` pisa la categoría que devolvió la IA con este path, en
  código y antes de la validación de categorías — es una regla de negocio,
  no una sugerencia al modelo. Se usa para el caso furnace (Goodman y
  similares, que nunca van a Calderas). El resultado queda marcado con
  `categoria_forzada_por`. El path tiene que existir tal cual en
  `tiendanube_categories` o la función lo loguea como error.
- `alias`: variantes de escritura que se normalizan al mismo slug, para que
  no convivan "immergas"/"Immergas"/"inmergas" como marcas distintas.

### productos_publicados — Registro de lo ya importado a Tienda Nube
```sql
id, slug (UNIQUE), codigo, categoria_tiendanube, lote, fecha_publicado
```
Ver `supabase_productos_publicados.sql`. No hay API de Tienda Nube conectada:
esta tabla se llena desde la app con el botón "Marcar lote como publicado",
a mano y después de confirmar que la importación salió bien. Sirve para que
el chequeo de slugs duplicados alcance también a lotes anteriores, no sólo
al que se está exportando.

### tn_corrections — Correcciones de categoría Tienda Nube
```sql
id, codigo (UNIQUE), producto, categoria_tiendanube, updated_at
```

### tiendanube_categories — Categorías de la tienda (4 niveles)
```sql
id, nivel1, nivel2, nivel3, nivel4, keywords, activa, orden
```
nivel1 único: "Repuestos y Accesorios"

#### Estructura de categorías

**La fuente de verdad es la tabla `tiendanube_categories` en Supabase — no este archivo.**
Este doc dejó de listar nivel4 a mano porque se desalineaba con la base real
cada vez que se agregaba una categoría (pasó con Pellet/Bombas en 2026-09).

Para ver el estado actual: `SELECT nivel1, nivel2, nivel3, nivel4, activa, orden
FROM tiendanube_categories ORDER BY orden;` en Supabase, o desde la vista
`categories` de la app (Categorías TN → paneles cascada).

nivel2 activos hoy: Calefacción, Agua Sanitaria, Refrigeración,
Materiales Eléctricos, Materiales de Instalación.

nivel3 conocidos bajo Calefacción: Calderas, Calefones, Calefactores,
Radiadores, Piso Radiante, Salamandras, Estufas a Pellet, Bombas y
Presurizadoras. Si se agrega un nivel3 o nivel4 nuevo, el único lugar
que hay que tocar además de Supabase es `ESTRUCTURA_REFERENCIA` dentro de
`buildSystemPrompt()` en `api/enrich.js` (es una guía de estilo para la IA,
no la lista completa — no hace falta que esté 100% sincronizada, pero sí
que no falte ningún nivel3 nuevo).

> **Nota:** La categoría "Componentes Eléctricos" fue eliminada.
> Sus subcategorías fueron redistribuidas:
> - Capacitores y Contactores → Refrigeración > Compresores y Motores
> - Dispositivos de Protección → Materiales de Instalación > Protección Eléctrica
> - Termostatos → Materiales de Instalación > Termostatos Ambiente

> **Nota sobre Hidráulicos (Calderas):** Vaso de Expansión y Vaso Hidroneumático
> van a la MISMA categoría (Calefacción > Calderas > Hidráulicos), pero se
> distinguen por tag para permitir búsqueda y clasificación diferenciada sin
> duplicar la categoría en Tienda Nube:
> - Vaso de Expansión: `pieza:vaso-expansion` — recipiente chico (5-50L), propósito único
> - Vaso Hidroneumático: `pieza:vaso-hidroneumatico` — recipiente grande (20-500L), multipropósito

Las keywords de cada categoría son usadas por la IA para asignar
productos automáticamente. Son la fuente de verdad para la IA.

### analyses — Historial de análisis guardados
```sql
id, nombre, total, repuestos, accesorios, completos,
servicios, otros, aprendidos, created_at
```

### analysis_products — Productos de cada análisis
```sql
id, analysis_id (FK CASCADE), codigo, producto, rubro, sub_rubro,
clasificacion, fuente, confianza,
category_id, subcategory_id, tipo,
slug, nombre_limpio, marca,
descripcion_html, tags, seo_titulo, seo_descripcion,
peso_kg, alto_cm, ancho_cm, profundidad_cm,
categoria_tiendanube, tn_manual,
prop1_nombre, prop1_valor,
prop2_nombre, prop2_valor,
prop3_nombre, prop3_valor
```

### Row Level Security (RLS)

`classification_rules`, `tiendanube_categories`, `tn_corrections`,
`corrections`, `analyses` y `analysis_products` tienen RLS habilitado con
una política pública permisiva (`FOR ALL USING (true) WITH CHECK (true)`) —
ver `supabase_rules.sql`, `supabase_tn_categories.sql`,
`supabase_tn_corrections.sql` y `supabase_rls_fix.sql`. La seguridad real
se aplica a nivel de las Vercel Functions (`api/*.js`), no de RLS; estas
políticas solo evitan que Supabase bloquee escrituras de la anon key por
defecto. Si se crea una tabla nueva, replicar el mismo patrón.

---

## Lógica de clasificación

### Prioridad (de mayor a menor):
1. **Correcciones aprendidas** (tabla corrections) — confianza 100%, fuente APRENDIDO
2. **IA Groq** (api/classify.js) — si confianza > reglas locales, fuente IA
3. **Reglas locales** (classifyProduct en src/utils.js) — keywords + scoring, fuente REGLAS

### Respaldo de Gemini cuando Groq corta

`api/classify.js` y `api/enrich.js` usan Groq como camino normal y caen a
Gemini (`llamarGemini()` en `api/_helpers.js`, modelo `GEMINI_MODEL`) sólo
cuando Groq no puede responder. El error decide el camino:

| Error de Groq | Qué pasa |
|---|---|
| **429** (cuota excedida) | Salta a Gemini **de inmediato**, sin gastar el ladder. Una cuota por minuto no se libera en 6s: reintentar es tiempo tirado (~24s por lote). |
| **500 / 503** (modelo sobrecargado) | Se mantiene el ladder de 2 modelos × 2 intentos; Gemini es el último recurso. Son fallas transitorias donde reintentar sirve. |
| **401** (key inválida) | Devuelve 401 y **no** toca Gemini. Es un error de configuración que hay que ver, no tapar gastando cuota paga. |

La respuesta de ambos endpoints incluye `provider: 'groq' | 'gemini'`. El
frontend (`useClassification.runAI` y `ExportView.runEnrich`) avisa qué lotes
contestó Gemini, porque eso consume del plan pago de Gemini y no de la cuota
de Groq. Si fallan los dos, `enrich` devuelve **503** (no 500) para que
`enrichBatchWithRetry` reintente en vez de descartar el lote.

### Categorías de clasificación:
- REPUESTO — pieza que reemplaza parte dañada de un equipo
- ACCESORIO — pieza complementaria para instalaciones
- PRODUCTO_COMPLETO — equipo autónomo
- SERVICIO — mano de obra o instalación
- OTRO — no encaja claramente

### NUNCA modificar:
- La función classifyProduct() en src/utils.js
- El array DEFAULT_RULES en src/constants.js (reglas por defecto del motor de scoring)
- El orden de prioridad correcciones > IA > reglas

---

## Lógica de enriquecimiento (api/enrich.js)

Al enriquecer productos para Tienda Nube, Groq genera:
- slug, nombre_limpio, marca
- descripcion_html (formato HTML con especificaciones técnicas)
- tags, seo_titulo, seo_descripcion
- peso_kg, alto_cm, ancho_cm, profundidad_cm (estimados)
- categoria_tiendanube (path completo 4 niveles)
- es_categoria_nueva + keywords_sugeridas (si sugiere nivel4 nuevo)

Las listas de marcas y fabricantes del prompt se arman en cada request desde
la tabla `marcas` (ver arriba), no están escritas en el código. Después de
la respuesta de la IA, `api/enrich.js` aplica dos pasos determinísticos:
normaliza `marca` al slug canónico (`marca_slug`) y pisa la categoría si
alguna marca mencionada tiene `categoria_forzada`.

### Categorías TN — REGLAS ESTRICTAS para la IA:
La IA DEBE elegir de la lista exacta cargada desde tiendanube_categories.
- Siempre devolver el path completo: "Nivel1 > Nivel2 > Nivel3 > Nivel4"
- Nunca inventar nivel1, nivel2 ni nivel3
- Puede sugerir nivel4 nuevo SOLO si:
  * Es genérico (aplica a múltiples productos)
  * Máximo 3 palabras en español
  * nivel1+nivel2+nivel3 ya existen
  * 2+ productos lo sugieren (para creación automática)
  * Tiene coherencia con las categorías existentes del mismo nivel3

### Coherencia de nivel4:
Antes de sugerir un nivel4, verificar que sea consistente con los
nivel4 ya existentes bajo el mismo nivel3.
Ejemplo: si Calderas ya tiene "Plaquetas y Electrónica", "Hidráulicos",
"Quemadores y Encendido" → un nuevo nivel4 debe seguir ese estilo
(sustantivos + adjetivo, no verbos, en español).

### Tags de compatibilidad estructurados

Además de las palabras libres, el array `tags` de cada producto enriquecido
puede incluir tags con prefijo fijo, generados por la IA cuando hay
información suficiente en el nombre del producto:

| Prefijo | Qué indica | Ejemplo |
|---------|-----------|---------|
| `equipo:` | Tipo de equipo compatible | `equipo:caldera` |
| `marca:` | Marca del EQUIPO (no del repuesto) | `marca:immergas` |
| `modelo:` | Modelo compatible, uno por tag, repetible | `modelo:eolo-star` |
| `fabricante:` | Fabricante del repuesto en sí (placa/sensor/válvula), SOLO si es distinto de la marca del equipo | `fabricante:surrey` |
| `pieza:` | Tipo de pieza | `pieza:placa-electronica`, `pieza:vaso-hidroneumatico` |
| `medida:` | Medida física relevante para búsqueda | `medida:3-4` |
| `oem:` | Código de fabricante/OEM tal cual figura en el producto | `oem:btg12` |

`marca:` y `fabricante:` son conceptos distintos y no se pisan: una
plaqueta Immergas con componente Surrey lleva `marca:immergas` +
`fabricante:surrey`. Si un dato no se puede inferir con confianza, la IA
lo omite — nunca inventa marca, modelo u OEM.

---

## Exportación a Tienda Nube

### Formato CSV — 24 columnas, separador punto y coma (;):
```
"Identificador de URL";Nombre;Categorías;Precio;"Precio promocional";
"Peso (kg)";"Alto (cm)";"Ancho (cm)";"Profundidad (cm)";Stock;SKU;
"Código de barras";"Mostrar en tienda";"Envío sin cargo";Descripción;
Tags;"Título para SEO";"Descripción para SEO";Marca;"Producto Físico";
"MPN (Número de pieza del fabricante)";Sexo;"Rango de edad";Costo
```

### Valores fijos:
- Stock: 1
- Envío sin cargo: NO
- Producto Físico: SI
- Precio promocional, Código de barras, Sexo, Rango de edad, Costo: vacíos
- Mostrar en tienda: SI si precio > 0, NO si precio = 0

### Validación antes de exportar:
`exportTiendaNubeCSV()` chequea que "Identificador de URL" (el slug) no se
repita entre los productos seleccionados. Si hay duplicados, loguea el
detalle en consola y muestra un alert — no bloquea la descarga, es
responsabilidad de quien exporta revisar antes de importar en Tienda Nube
(un slug repetido pisa el producto anterior al importar).

### Precio formato: 1,615,050.00 (coma para miles, punto para decimales)
### Encoding: UTF-8 con BOM (﻿)

---

## Vistas de la app

| Vista | Ruta estado | Descripción |
|-------|-------------|-------------|
| upload | view='upload' | Carga por paste o CSV/XLSX |
| dashboard | view='dashboard' | Stats, distribución, IA |
| table | view='table' | Tabla con filtros, edición, selección/borrado |
| exportTN | view='exportTN' | 3 pasos: selección → enriquecer → CSV |
| history | view='history' | Lista de análisis guardados |
| historyDetail | view='historyDetail' | Detalle de un análisis |
| categories | view='tnCategories' | Gestión de categorías TN (paneles cascada) |
| learning | view='learning' | Gestión de correcciones aprendidas |
| settings | view='settings' | Ajustes generales |

---

## Funciones API (Vercel)

| Función | Métodos | Descripción |
|---------|---------|-------------|
| api/classify.js | POST | Clasificación IA con Groq + correcciones Supabase |
| api/corrections.js | GET, POST, DELETE | Correcciones aprendidas (clasificación + enriquecimiento) |
| api/history.js | GET, POST, PUT, DELETE, PATCH | Historial de análisis |
| api/enrich.js | POST | Enriquecimiento para TN con Groq |
| api/tn-categories.js | GET, POST, PUT, DELETE | Categorías Tienda Nube |
| api/tn-corrections.js | GET, POST, DELETE | Correcciones de categoría TN |
| api/rules.js | GET, POST, DELETE | Reglas dinámicas de clasificación |
| api/published.js | GET, POST | Registro de lo ya publicado en TN (`check` / `mark`) |
| api/product-images.js | GET, POST, PATCH, DELETE | Fotos de producto + OCR con modelo de visión (Gemini / Groq) |

### Patrón estándar de cada función:
```js
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Variables de Supabase no configuradas' });
  }
  // ... lógica
}
```

---

## Reglas de desarrollo

### SIEMPRE:
- Usar SUPABASE_URL y SUPABASE_KEY (sin prefijo VITE_)
- CORS headers en todas las respuestas de funciones API
- Manejar OPTIONS para preflight
- Validar body antes de operar
- Toast de éxito/error para cada acción del usuario
- npm run build sin errores antes de cada commit
- Para responsive, usar el hook `useIsNarrow()` y ramificar los objetos style
  inline. `index.css` es solo para lo estructural (shell, canvas, drawer):
  una media query no puede pisar un estilo inline.

### NUNCA:
- Modificar classifyProduct() ni sus keywords arrays
- Instalar librerías de UI (Tailwind, MUI, etc.)
- Usar React Router
- Hardcodear categorías TN (siempre leer de Supabase)
- Inventar nivel1, nivel2 ni nivel3 en categorías TN
- Usar prefijo VITE_ en funciones serverless

### Commits:
Un commit por funcionalidad. Mensaje descriptivo en inglés.
Verificar npm run build antes de cada push.

---

## Flujo completo de trabajo

1. Cargar productos (paste desde Google Sheets o CSV/XLSX)
2. Clasificación automática (reglas locales + correcciones aprendidas)
3. Activar IA para mejorar clasificación ambigua
4. Revisar y corregir manualmente en la tabla (se aprende automáticamente)
5. Ir a Exportar → Tienda Nube
6. Seleccionar productos (por defecto: REPUESTO + ACCESORIO)
7. Enriquecer con IA (descripción, categoría, marca, dimensiones)
8. La IA crea nivel4 si falta y tiene sentido
9. Revisar y editar campos si es necesario
10. Descargar CSV y guardar análisis en historial
11. Importar CSV en Tienda Nube → Productos → Importar

---

## Flujo al sumar una familia de productos

Checklist reproducible — son los mismos pasos que se hicieron a mano con el
lote de placas de Calderas. La idea es que sumar una familia sea cargar
datos, no editar código.

1. **Categorías nuevas** → `INSERT` en `tiendanube_categories`
   (ej. `supabase_pellet_bombas_categories.sql`).
2. **Marcas nuevas** → `INSERT` en `marcas`. Nunca editar el prompt de
   `api/enrich.js` a mano para agregar una marca. Si la familia tiene un
   caso tipo furnace (una marca que siempre va a una categoría concreta,
   sin importar lo que infiera la IA), cargarla con `categoria_forzada`.
3. Cargar el lote en la app → clasificar → enriquecer con IA.
4. Revisar las filas marcadas para revisión: confianza baja, sin marca
   identificable, o con `categoria_forzada_por` (conviene confirmar que la
   regla aplicó donde correspondía).
5. Exportar → el chequeo de duplicados corre solo, intra-lote
   (`exportTiendaNubeCSV`) y contra `productos_publicados`.
6. Importar el CSV en Tienda Nube, a mano.
7. Confirmado el import → botón "Marcar lote como publicado".
8. Si el lote fue grande → "Exportar todas las correcciones" desde Ajustes,
   como respaldo offline.

### Fotos de placas (opcional, en paralelo)

Se entra por `historyDetail`, no por una pantalla aparte: se vuelve al análisis
guardado en distintos días, a medida que cada placa está físicamente a mano.

1. "Agregar fotos" en la fila del producto → cámara nativa del celular.
2. El modelo de visión transcribe; el usuario **confirma o corrige** el código.
   Nada cuenta como dato final sin ese paso. Por defecto lee Gemini; el switch
   "Modo rápido (Groq)" cambia de proveedor y se recuerda en `localStorage`.
   Si un proveedor falla, la respuesta trae `provider_fallo` y la UI ofrece el
   otro — Groq ya deprecó sus modelos de visión dos veces en un año.
3. Al enriquecer para exportar, los `codigo_confirmado` viajan como
   `codigos_oem` y salen como tags `oem:`.
4. En Exportar → "Exportar imágenes del lote (.zip)": el CSV va por un lado
   (Tienda Nube no acepta imágenes por URL adentro del CSV) y las fotos por
   otro, nombradas por SKU, para la app de carga masiva del marketplace.

> El único lugar que sigue teniendo estructura de categorías escrita a mano
> es `ESTRUCTURA_REFERENCIA` en `buildSystemPrompt()` (`api/enrich.js`), y es
> a propósito: es una guía de estilo para la IA, no una fuente de datos. No
> necesita estar 100% sincronizada, pero conviene que no le falte ningún
> nivel3 nuevo.
