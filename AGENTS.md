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
| IA clasificación | Groq API (llama-3.3-70b-versatile / llama-3.1-8b-instant) |
| IA enriquecimiento | Groq API (mismo modelo) |
| Deploy | Vercel (auto-deploy desde GitHub) |
| Repo | GitHub (fullcalor25-afk/clasificador-productos) |

---

## Variables de entorno (Vercel)

```
GROQ_API_KEY        API key de Groq
SUPABASE_URL        URL del proyecto Supabase
SUPABASE_KEY        anon public key de Supabase
```

IMPORTANTE: Las funciones serverless usan SUPABASE_URL y SUPABASE_KEY
(sin prefijo VITE_). El prefijo VITE_ solo aplica al frontend de Vite.

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
│   └── App.jsx            ← Componente principal con toda la lógica
├── api/                   ← Vercel Functions (ESM)
│   ├── classify.js        ← Clasificación IA con Groq
│   ├── corrections.js     ← CRUD correcciones aprendidas
│   ├── history.js         ← CRUD historial de análisis
│   ├── categories.js      ← CRUD categorías internas (deprecated, no usar)
│   ├── enrich.js          ← Enriquecimiento TN con Groq
│   ├── tn-categories.js   ← CRUD categorías Tienda Nube
│   ├── tn-corrections.js  ← CRUD correcciones de categoría TN
│   └── rules.js           ← Reglas dinámicas de clasificación
└── public/
```

---

## Tablas Supabase

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

### tn_corrections — Correcciones de categoría Tienda Nube
```sql
id, codigo (UNIQUE), producto, categoria_tiendanube, updated_at
```

### tiendanube_categories — Categorías de la tienda (4 niveles)
```sql
id, nivel1, nivel2, nivel3, nivel4, keywords, activa, orden
```
nivel1 único: "Repuestos y Accesorios"

#### Estructura de categorías (47 entradas)

| nivel2 | nivel3 | nivel4 disponibles |
|--------|--------|-------------------|
| Calefacción | Calderas | Plaquetas y Electrónica · Hidráulicos · Quemadores y Encendido · Sensores y Presostatos · Válvulas y Gas |
| Calefacción | Calefones | Diafragmas y Membranas · Termocuplas y Pilotos · Unidades Magnéticas |
| Calefacción | Calefactores | Termocuplas y Pilotos · Válvulas y Gas · Repuestos Generales |
| Calefacción | Radiadores | Válvulas y Detentores · Accesorios |
| Calefacción | Piso Radiante | Membranas y Tubería |
| Calefacción | Salamandras | Conductos Enlozados · Repuestos Generales |
| Agua Sanitaria | Termotanques | Resistencias y Ánodos · Termostatos y Válvulas |
| Agua Sanitaria | Calefones | Diafragmas y Membranas · Termocuplas y Pilotos · Unidades Magnéticas |
| Agua Sanitaria | Filtros de Agua | Cartuchos y Membranas · Vasos y Filtros Completos |
| Refrigeración | Válvulas y Filtros | Filtros Deshidratadores · Válvulas Solenoides · Accesorios Refrigeración |
| Refrigeración | Gas Refrigerante | R22 / R134 / R410 / R404 |
| Refrigeración | Compresores y Motores | Motores Forzadores · Comandos y Controles · Capacitores y Contactores |
| Materiales Eléctricos | Cables | Cables Calefactor · Cables Encendido |
| Materiales Eléctricos | Fichas y Conectores | Fichas y Enchufes · Conectores Específicos |
| Materiales Eléctricos | Sensores | Sensores de Llama · Sensores de Temperatura |
| Materiales de Instalación | Manómetros | Manómetros de Gas · Manómetros de Refrigeración |
| Materiales de Instalación | Válvulas de Gas | Llaves y Válvulas Esféricas · Electroválvulas |
| Materiales de Instalación | Válvulas de Agua | Válvulas de Retención · Válvulas de Alivio · Detentores |
| Materiales de Instalación | Protección Eléctrica | Interruptores y Térmicas · Guardamotores · Relays de Protección |
| Materiales de Instalación | Termostatos Ambiente | *(sin nivel4)* |

> **Nota:** La categoría "Componentes Eléctricos" fue eliminada.
> Sus subcategorías fueron redistribuidas:
> - Capacitores y Contactores → Refrigeración > Compresores y Motores
> - Dispositivos de Protección → Materiales de Instalación > Protección Eléctrica
> - Termostatos → Materiales de Instalación > Termostatos Ambiente

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
categoria_tiendanube,
prop1_nombre, prop1_valor,
prop2_nombre, prop2_valor,
prop3_nombre, prop3_valor
```

---

## Lógica de clasificación

### Prioridad (de mayor a menor):
1. **Correcciones aprendidas** (tabla corrections) — confianza 100%, fuente APRENDIDO
2. **IA Groq** (api/classify.js) — si confianza > reglas locales, fuente IA
3. **Reglas locales** (classifyProduct en App.jsx) — keywords + scoring, fuente REGLAS

### Categorías de clasificación:
- REPUESTO — pieza que reemplaza parte dañada de un equipo
- ACCESORIO — pieza complementaria para instalaciones
- PRODUCTO_COMPLETO — equipo autónomo
- SERVICIO — mano de obra o instalación
- OTRO — no encaja claramente

### NUNCA modificar:
- La función classifyProduct() en App.jsx
- Los arrays REPUESTO_KEYWORDS, ACCESORIO_KEYWORDS, PRODUCTO_COMPLETO_KEYWORDS
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
| api/categories.js | — | DEPRECATED, no usar |

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
