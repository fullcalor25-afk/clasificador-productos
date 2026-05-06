# Clasificador de Productos con IA

Sistema inteligente para clasificar productos de inventario.  
Detecta automáticamente repuestos usando algoritmos de reglas + **Google Gemini AI (GRATIS)**.

---

## Costo: $0 USD

| Servicio | Costo | Límite gratuito |
|----------|-------|-----------------|
| Netlify hosting | Gratis | 100 GB bandwidth/mes |
| Netlify Functions | Gratis | 125,000 invocaciones/mes |
| Google Gemini API | **Gratis** | **1,500 requests/día** |
| GitHub | Gratis | Repos ilimitados |

Con 1,500 req/día y 50 productos por request, podés clasificar **75,000 productos por día gratis**.

---

## Deploy paso a paso

### 1. Obtener API Key de Gemini (gratis, 2 minutos)

1. Ir a **https://aistudio.google.com/apikey**
2. Iniciar sesión con tu cuenta de Google
3. Click en **"Create API Key"**
4. Copiar la key (empieza con `AIza...`)
5. **No se necesita tarjeta de crédito**

### 2. Subir a GitHub

```bash
# Descomprimir el ZIP y entrar a la carpeta
cd clasificador-app

# Crear repositorio
git init
git add .
git commit -m "Clasificador de productos con IA"
git branch -M main

# Crear repo en github.com y luego:
git remote add origin https://github.com/TU_USUARIO/clasificador-productos.git
git push -u origin main
```

### 3. Deploy en Netlify

1. Ir a **https://app.netlify.com** (crear cuenta gratis si no tenés)
2. **"Add new site"** → **"Import an existing project"**
3. Conectar con GitHub → elegir el repo `clasificador-productos`
4. La configuración de build ya está en `netlify.toml`, no tocar nada
5. Click en **"Deploy site"**

### 4. Configurar la API Key

1. En Netlify → tu sitio → **Site configuration** → **Environment variables**
2. **"Add a variable"**:
   - Key: `GEMINI_API_KEY`
   - Value: tu key de Gemini (`AIza...`)
3. Ir a **Deploys** → **"Trigger deploy"** → **"Deploy site"**

### 5. ¡Listo!

Tu sitio estará en `https://nombre-random.netlify.app`  
(podés cambiar el nombre en Site configuration → Domain management)

---

## Cómo usar

1. **Cargar datos**: Abrir Google Sheets → Ctrl+A → Ctrl+C → pegar en la app
2. **Clasificación automática**: el algoritmo analiza nombre, rubro y sub-rubro al instante
3. **Mejorar con IA** (opcional): botón "Activar IA" envía productos a Gemini para análisis más profundo
4. **Revisar y corregir**: editar clasificaciones manualmente con ✏️
5. **Exportar**: descargar CSV con toda la clasificación

---

## Seguridad

- La API key **NUNCA** se expone al navegador del usuario
- Se usa una función serverless de Netlify como proxy
- Las llamadas a Gemini se hacen 100% server-side

---

## Estructura del proyecto

```
clasificador-app/
├── public/
│   └── index.html
├── src/
│   ├── index.js
│   └── App.js              ← Aplicación principal
├── netlify/
│   └── functions/
│       └── classify.js      ← Proxy seguro para Gemini API
├── netlify.toml             ← Config de build y redirects
├── package.json
├── .gitignore
└── README.md
```

---

## Alternativas si necesitás más capacidad

| Proveedor | Gratis | Velocidad | Calidad |
|-----------|--------|-----------|---------|
| **Google Gemini** (actual) | 1,500 req/día | Media | ⭐⭐⭐⭐⭐ |
| Groq (Llama 70B) | ~1,000 req/día | Muy rápida | ⭐⭐⭐⭐ |
| OpenRouter | ~200 req/día | Variable | ⭐⭐⭐ |

Podés combinar varios proveedores para tener más capacidad diaria.
