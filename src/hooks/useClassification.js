import { useState, useEffect, useRef } from "react";
import { fetchWithTimeout, classifyProduct, wait } from "../utils";
import { DEFAULT_RULES } from "../constants";

export default function useClassification() {
  const [rules, setRules] = useState([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [aiError, setAiError] = useState(null);
  const [aiProcessed, setAiProcessed] = useState(0);
  const aiAbortRef = useRef(false);

  const loadRules = async () => {
    setLoadingRules(true);
    try {
      const res = await fetchWithTimeout("/api/rules");
      if (!res.ok) throw new Error("Rules load failed");
      const data = await res.json();
      // Si la tabla existe pero está vacía, no dejar el clasificador sin reglas:
      // usar los defaults igual que si la tabla no existiera o el fetch fallara.
      setRules(Array.isArray(data) && data.length > 0 ? data : DEFAULT_RULES);
    } catch (e) {
      console.error("Error loading rules, using defaults", e);
      // Use defaults if fetch fails or table doesn't exist yet
      setRules(DEFAULT_RULES);
    } finally {
      setLoadingRules(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const saveRule = async (ruleData) => {
    try {
      const res = await fetchWithTimeout("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ruleData),
      });
      if (!res.ok) throw new Error("Failed to save rule");
      await loadRules();
      return { success: true };
    } catch (e) {
      console.error("Error saving rule", e);
      return { success: false, error: e.message };
    }
  };

  const deleteRule = async (id) => {
    try {
      const res = await fetchWithTimeout(`/api/rules?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete rule");
      await loadRules();
      return { success: true };
    } catch (e) {
      console.error("Error deleting rule", e);
      return { success: false, error: e.message };
    }
  };

  const resetRulesToDefault = async () => {
    setLoadingRules(true);
    try {
      const res = await fetchWithTimeout("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true, defaults: DEFAULT_RULES }),
      });
      if (!res.ok) throw new Error("Failed to reset rules");
      await loadRules();
      return { success: true };
    } catch (e) {
      console.error("Error resetting rules", e);
      setRules(DEFAULT_RULES);
      return { success: false, error: e.message };
    } finally {
      setLoadingRules(false);
    }
  };

  // Performance Improvement 1: Large product processing in non-blocking chunks
  const processProductsChunked = async (products, corrections, activeRules, chunkSize = 200, progressCallback) => {
    const results = [];
    const total = products.length;
    
    for (let i = 0; i < total; i += chunkSize) {
      const chunk = products.slice(i, i + chunkSize);
      
      const processedChunk = chunk.map((p, idx) => {
        const globalIdx = i + idx;
        const corrKey = (p.CODIGO || "").toLowerCase();
        
        // Priority 1: Learned corrections
        if (corrKey && corrections[corrKey]) {
          return {
            ...p,
            _id: globalIdx,
            _class: {
              classification: corrections[corrKey],
              confidence: 100,
              reasons: ["Corrección aprendida 📚"],
              score: 100
            },
            _source: "APRENDIDO",
          };
        }
        
        // Priority 2: Local dynamic rules engine
        const result = classifyProduct(p, activeRules);
        return {
          ...p,
          _id: globalIdx,
          _class: result,
          _source: "REGLAS"
        };
      });

      results.push(...processedChunk);
      
      if (progressCallback) {
        progressCallback(Math.min(i + chunkSize, total), total);
      }
      
      // Yield to the browser main thread
      await wait(0);
    }

    return results;
  };

  // AI groq batch classify with rate limiting, timeouts, and optional key overrides
  const runAI = async (products, groqApiKeyOverride = null, onResultsReady) => {
    setAiLoading(true);
    setAiError(null);
    setAiProcessed(0);
    setAiStatus("Iniciando clasificación con IA...");
    aiAbortRef.current = false;

    const allResults = [];
    // 30 y no 50: el plan gratis de Cerebras limita el contexto a 8K tokens
    // (entrada + salida) y con 50 productos no entra. Como los lotes alternan
    // entre Groq y Cerebras, todos tienen que caber en el más chico de los dos.
    const batchSize = 30;
    const totalBatches = Math.ceil(products.length / batchSize);
    let consecutiveErrors = 0;
    // Lotes que terminó contestando Gemini porque Groq estaba saturado.
    // Se avisa: Gemini consume del plan pago, no de la cuota gratis de Groq.
    const lotesGemini = [];
    // Cuántos lotes contestó cada proveedor. Sirve para confirmar de un vistazo
    // que la rotación Groq/Cerebras está funcionando de verdad.
    const porProveedor = {};
    // Avisos de configuración del server (ej. CEREBRAS_API_KEY mal cargada).
    // Se muestran una sola vez y no cortan el análisis.
    const avisosVistos = new Set();
    const BASE_DELAY = 6000;

    for (let i = 0; i < totalBatches; i++) {
      if (aiAbortRef.current) {
        setAiStatus("Cancelado por el usuario.");
        break;
      }

      const batch = products.slice(i * batchSize, (i + 1) * batchSize);
      const batchNum = i + 1;
      setAiStatus(`Lote ${batchNum} de ${totalBatches} — Enviando datos...`);

      if (i > 0) {
        const delayTime = BASE_DELAY + (consecutiveErrors * 15000);
        setAiStatus(`Lote ${batchNum} de ${totalBatches} — Esperando cooldown de ${Math.round(delayTime / 1000)}s...`);
        await wait(delayTime);
      }

      try {
        const headers = { "Content-Type": "application/json" };
        if (groqApiKeyOverride) {
          headers["x-groq-key"] = groqApiKeyOverride;
        }

        const res = await fetchWithTimeout("/api/classify", {
          method: "POST",
          headers,
          // El número de lote decide qué proveedor arranca en el server, para
          // que la carga se reparta entre las cuotas de Groq y de Cerebras.
          body: JSON.stringify({ products: batch, lote: i }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          consecutiveErrors++;
          const status = res.status;
          
          if (status === 429 || status === 503) {
            const retryWait = Math.min(consecutiveErrors * 20000, 120000);
            // Un 503 del server ya significa que fallaron todos los proveedores
            // (Groq, Cerebras y Gemini), así que acá solo queda esperar.
            setAiStatus(`⏳ Todos los proveedores de IA están saturados. Esperando ${Math.round(retryWait / 1000)}s antes de reintentar lote ${batchNum}...`);
            await wait(retryWait);
            i--; // Retry same batch
            continue;
          }
          
          if (status === 401) {
            setAiError("La API Key de Groq es inválida o no está configurada.");
            break;
          }

          if (consecutiveErrors >= 5) {
            setAiError(`Error persistente: ${data.error || "Fallo en el servicio"}. Clasificación detenida.`);
            break;
          }

          setAiStatus(`⚠️ Error en lote ${batchNum}. Reintentando en 15s...`);
          await wait(15000);
          i--; // Retry same batch
          continue;
        }

        consecutiveErrors = 0;
        if (data.results && Array.isArray(data.results)) {
          allResults.push(...data.results);
          setAiProcessed(allResults.length);
          if (data.aviso && !avisosVistos.has(data.aviso)) {
            avisosVistos.add(data.aviso);
            // DashboardView ya le pone el ⚠️ y el fondo rojo. No corta nada:
            // el lote se clasificó igual, pero la key hay que arreglarla.
            setAiError(data.aviso);
          }
          const prov = data.provider || "groq";
          porProveedor[prov] = (porProveedor[prov] || 0) + 1;
          if (prov === "gemini") {
            lotesGemini.push(batchNum);
            setAiStatus(`✓ Lote ${batchNum}/${totalBatches} clasificado — Groq saturado, respondió Gemini`);
          } else {
            setAiStatus(`✓ Lote ${batchNum}/${totalBatches} clasificado con éxito`);
          }
          
          if (onResultsReady) {
            onResultsReady(allResults);
          }
        }
      } catch (e) {
        consecutiveErrors++;
        console.error("Excepción en llamada de IA", e);
        if (consecutiveErrors >= 5) {
          setAiError("Error de red o de timeout persistente. Revisa tu conexión.");
          break;
        }
        setAiStatus("⚠️ Conexión perdida. Reintentando en 15s...");
        await wait(15000);
        i--;
      }
    }

    setAiLoading(false);
    if (allResults.length > 0 && !aiAbortRef.current) {
      const avisoGemini = lotesGemini.length
        ? ` · ${lotesGemini.length} ${lotesGemini.length === 1 ? "lote" : "lotes"} con Gemini (Groq saturado): ${lotesGemini.join(", ")}`
        : "";
      const reparto = Object.entries(porProveedor)
        .map(([p, n]) => `${p} ${n}`)
        .join(" · ");
      setAiStatus(`✅ Clasificación de IA finalizada. ${allResults.length} productos procesados. Lotes por proveedor: ${reparto}.${avisoGemini}`);
      return allResults;
    }
    return null;
  };

  const stopAI = () => {
    aiAbortRef.current = true;
    setAiStatus("Cancelando proceso...");
  };

  return {
    rules,
    loadingRules,
    aiLoading,
    aiStatus,
    aiError,
    aiProcessed,
    loadRules,
    saveRule,
    deleteRule,
    resetRulesToDefault,
    processProductsChunked,
    runAI,
    stopAI,
  };
}
