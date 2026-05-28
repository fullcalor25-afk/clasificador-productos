import { useState, useEffect, useRef } from "react";
import { fetchWithTimeout } from "../utils";

export default function useCorrections() {
  const [corrections, setCorrections] = useState({});
  const [correctionsList, setCorrectionsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const correctionsRef = useRef({});

  const loadCorrections = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/corrections");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        const map = {};
        data.forEach(c => {
          if (c.codigo) map[c.codigo.toLowerCase()] = c.clasificacion_corregida;
        });
        correctionsRef.current = map;
        setCorrections(map);
        setCorrectionsList(data);
        setLoaded(true);
      }
    } catch (e) {
      console.error("Error cargando correcciones", e);
      setError("No se pudieron cargar las correcciones de la base de datos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCorrections();
  }, []);

  const saveCorrection = async (product, newClass) => {
    if (!product || !product.CODIGO) return;
    const key = product.CODIGO.toLowerCase();

    // Optimistic UI update
    correctionsRef.current[key] = newClass;
    setCorrections(prev => ({ ...prev, [key]: newClass }));

    // Find and update or add to correctionsList
    setCorrectionsList(prev => {
      const idx = prev.findIndex(c => c.codigo.toLowerCase() === key);
      const now = new Date().toISOString();
      if (idx > -1) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], clasificacion_corregida: newClass, updated_at: now };
        return updated;
      } else {
        return [...prev, {
          codigo: product.CODIGO,
          producto: product.PRODUCTO || "",
          rubro: product.RUBRO || "",
          sub_rubro: product["SUB RUBRO"] || "",
          clasificacion_corregida: newClass,
          updated_at: now
        }];
      }
    });

    try {
      const res = await fetchWithTimeout("/api/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: product.CODIGO,
          producto: product.PRODUCTO || "",
          rubro: product.RUBRO || "",
          sub_rubro: product["SUB RUBRO"] || "",
          clasificacion_corregida: newClass,
        }),
      });
      if (!res.ok) throw new Error("Error en backend");
      // Reload fully to keep backend and frontend in sync
      loadCorrections();
    } catch (e) {
      console.error("Error guardando correccion", e);
      setError("No se pudo persistir la corrección en la base de datos.");
    }
  };

  const deleteCorrection = async (id, codigo) => {
    if (!id && !codigo) return;
    
    // Optimistic update
    const key = (codigo || "").toLowerCase();
    if (key) {
      delete correctionsRef.current[key];
      setCorrections(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
    if (id) {
      setCorrectionsList(prev => prev.filter(c => c.id !== id));
    } else {
      setCorrectionsList(prev => prev.filter(c => c.codigo.toLowerCase() !== key));
    }

    try {
      const url = id 
        ? `/api/corrections?id=${id}`
        : `/api/corrections?codigo=${encodeURIComponent(codigo)}`;
      const res = await fetchWithTimeout(url, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar");
      loadCorrections();
    } catch (e) {
      console.error("Error eliminando corrección", e);
      setError("No se pudo eliminar la corrección de la base de datos.");
    }
  };

  const importBulkCorrections = async (csvRows) => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulk: csvRows }),
      });
      if (!res.ok) throw new Error("Importación fallida");
      await loadCorrections();
      return true;
    } catch (e) {
      console.error("Error importando correcciones", e);
      setError("Error al importar correcciones masivamente.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const clearAllCorrections = async () => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/corrections?all=true", { method: "DELETE" });
      if (!res.ok) throw new Error("Error al limpiar");
      setCorrections({});
      setCorrectionsList([]);
      correctionsRef.current = {};
      return true;
    } catch (e) {
      console.error("Error limpiando correcciones", e);
      setError("No se pudieron borrar todas las correcciones.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    corrections,
    correctionsList,
    correctionsRef,
    loading,
    loaded,
    error,
    loadCorrections,
    saveCorrection,
    deleteCorrection,
    importBulkCorrections,
    clearAllCorrections,
  };
}
