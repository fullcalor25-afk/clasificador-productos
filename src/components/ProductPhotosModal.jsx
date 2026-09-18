import React, { useState, useRef, useEffect } from "react";
import { C } from "../constants";
import Modal from "./Modal";
import { apiFetch } from "../utils";
import { subirFotoProducto, supabase, SUPABASE_NO_CONFIGURADO } from "../lib/supabaseClient";

const PROVIDER_KEY = "clasificador_ocr_provider";
const OCR_TIMEOUT = 90000; // un modelo de visión tarda bastante más que una llamada de texto

/** El ocr_texto se guarda como el JSON crudo que devolvió el modelo. */
export function parseOcr(row) {
  if (!row?.ocr_texto) return null;
  try {
    return JSON.parse(row.ocr_texto);
  } catch {
    return { texto_completo: row.ocr_texto, confianza: "baja", advertencia: null, codigo_principal: null };
  }
}

/** Una foto necesita atención si todavía no fue confirmada a mano. */
export function contarSinConfirmar(fotos = []) {
  return fotos.filter(f => !f.ocr_confirmado).length;
}

function headersDeIA(provider) {
  const h = {};
  const groq = localStorage.getItem("clasificador_groq_key");
  const anthropic = localStorage.getItem("clasificador_anthropic_key");
  if (provider === "groq" && groq) h["x-groq-key"] = groq;
  if (provider === "claude" && anthropic) h["x-anthropic-key"] = anthropic;
  return h;
}

export default function ProductPhotosModal({ isOpen, producto, fotosIniciales = [], onClose, onFotosChange, toast }) {
  const codigo = producto?.codigo || producto?.CODIGO || "";

  const [fotos, setFotos] = useState(fotosIniciales);
  const [provider, setProvider] = useState(() => localStorage.getItem(PROVIDER_KEY) || "claude");
  const [estado, setEstado] = useState("idle"); // idle | uploading | ocr | error
  const [errorMsg, setErrorMsg] = useState(null);
  const [preview, setPreview] = useState(null);
  const [borradores, setBorradores] = useState({}); // id → texto editado del código
  const [ocupadoId, setOcupadoId] = useState(null);

  const inputRef = useRef(null);
  const previewRef = useRef(null);

  useEffect(() => {
    if (isOpen) setFotos(fotosIniciales);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, producto?.id]);

  // La object URL del preview se libera siempre, también al desmontar
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  const actualizar = next => {
    setFotos(next);
    if (onFotosChange) onFotosChange(codigo, next);
  };

  const limpiarPreview = () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setPreview(null);
  };

  const cambiarProvider = p => {
    setProvider(p);
    localStorage.setItem(PROVIDER_KEY, p);
  };

  // ── Captura ────────────────────────────────────────────────────────────────
  const handleArchivo = async e => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir la misma foto
    if (!file) return;

    // iOS entrega JPEG cuando la foto sale de la cámara; solo llega HEIC si se
    // elige un archivo viejo de la fototeca, y los modelos de visión no lo
    // soportan de forma confiable.
    if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name || "")) {
      toast?.error("Esa foto está en formato HEIC. Sacala con el botón de cámara en vez de elegirla de la fototeca.");
      return;
    }
    if (!supabase) {
      setErrorMsg(SUPABASE_NO_CONFIGURADO);
      setEstado("error");
      return;
    }

    setErrorMsg(null);
    previewRef.current = URL.createObjectURL(file);
    setPreview(previewRef.current);

    try {
      setEstado("uploading");
      const url = await subirFotoProducto(codigo, file);

      setEstado("ocr");
      const data = await apiFetch("/api/product-images", {
        method: "POST",
        headers: headersDeIA(provider),
        body: JSON.stringify({ codigo, url, provider }),
        timeout: OCR_TIMEOUT,
      });

      actualizar([...fotos, data.row]);
      setEstado("idle");
      limpiarPreview();
      toast?.success("Foto transcripta. Revisá el código antes de confirmar.");
    } catch (err) {
      setErrorMsg(err.message);
      setEstado("error");
      limpiarPreview();
    }
  };

  // ── Acciones por foto ──────────────────────────────────────────────────────
  const confirmar = async foto => {
    const ocr = parseOcr(foto);
    const valor = (borradores[foto.id] ?? foto.codigo_confirmado ?? ocr?.codigo_principal ?? "").trim();
    if (!valor) {
      toast?.error("Escribí el código antes de confirmar.");
      return;
    }
    setOcupadoId(foto.id);
    try {
      const row = await apiFetch("/api/product-images", {
        method: "PATCH",
        body: JSON.stringify({ id: foto.id, codigo_confirmado: valor }),
      });
      actualizar(fotos.map(f => (f.id === foto.id ? row : f)));
      toast?.success("Código confirmado.");
    } catch (err) {
      toast?.error(err.message);
    } finally {
      setOcupadoId(null);
    }
  };

  const reintentar = async (foto, conProvider) => {
    setOcupadoId(foto.id);
    try {
      const data = await apiFetch("/api/product-images", {
        method: "POST",
        headers: headersDeIA(conProvider),
        body: JSON.stringify({ codigo, url: foto.url, provider: conProvider }),
        timeout: OCR_TIMEOUT,
      });
      // El re-OCR crea una fila nueva; la anterior se descarta para no duplicar la foto
      await apiFetch(`/api/product-images?id=${encodeURIComponent(foto.id)}`, { method: "DELETE" });
      actualizar(fotos.map(f => (f.id === foto.id ? data.row : f)));
      setBorradores(b => { const n = { ...b }; delete n[foto.id]; return n; });
      toast?.success("Foto vuelta a transcribir.");
    } catch (err) {
      toast?.error(err.message);
    } finally {
      setOcupadoId(null);
    }
  };

  const descartar = async foto => {
    setOcupadoId(foto.id);
    try {
      const r = await apiFetch(`/api/product-images?id=${encodeURIComponent(foto.id)}`, { method: "DELETE" });
      actualizar(fotos.filter(f => f.id !== foto.id));
      if (r?.warning) toast?.error(r.warning);
      else toast?.success("Foto descartada.");
    } catch (err) {
      toast?.error(err.message);
    } finally {
      setOcupadoId(null);
    }
  };

  if (!isOpen) return null;

  const ocupado = estado === "uploading" || estado === "ocr";

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { limpiarPreview(); onClose(); }}
      title={`📷 Fotos · ${codigo || "sin código"}`}
      maxWidth={560}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: "70vh", overflowY: "auto" }}>
        <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
          {producto?.producto || producto?.PRODUCTO || ""}
        </div>

        {/* Selector de proveedor */}
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: C.textMuted, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={provider === "groq"}
            onChange={e => cambiarProvider(e.target.checked ? "groq" : "claude")}
            style={{ width: 18, height: 18 }}
          />
          <span>
            Modo rápido (Groq) — por defecto transcribe <strong>Claude</strong>, que lee mejor las placas gastadas.
          </span>
        </label>

        {/* Captura */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleArchivo}
          style={{ display: "none" }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={ocupado}
          style={{
            width: "100%",
            minHeight: 52,
            borderRadius: 12,
            border: "none",
            background: ocupado ? C.surface2 : C.accent,
            color: ocupado ? C.textMuted : "#fff",
            fontSize: 15,
            fontWeight: 700,
            cursor: ocupado ? "default" : "pointer",
          }}
        >
          {estado === "uploading" ? "Subiendo foto..." : estado === "ocr" ? "Leyendo el código..." : "📷 Agregar foto"}
        </button>

        {preview && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src={preview} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10, opacity: 0.6 }} />
            <span className="pulse" style={{ fontSize: 12, color: C.textMuted }}>
              {estado === "uploading" ? "Subiendo..." : "Transcribiendo..."}
            </span>
          </div>
        )}

        {estado === "error" && errorMsg && (
          <div style={{ padding: 12, borderRadius: 10, background: C.dangerBg, border: `1px solid ${C.danger}40`, color: C.danger, fontSize: 12 }}>
            {errorMsg}
          </div>
        )}

        {/* Fotos ya cargadas */}
        {fotos.length === 0 && estado !== "uploading" && estado !== "ocr" && (
          <div style={{ fontSize: 12, color: C.textDim, textAlign: "center", padding: "16px 0" }}>
            Todavía no hay fotos para este producto.
          </div>
        )}

        {fotos.map(foto => {
          const ocr = parseOcr(foto);
          const dudosa = ocr && (ocr.confianza === "baja" || !!ocr.advertencia);
          const valor = borradores[foto.id] ?? foto.codigo_confirmado ?? ocr?.codigo_principal ?? "";
          const trabajando = ocupadoId === foto.id;

          return (
            <div
              key={foto.id}
              style={{
                display: "flex",
                gap: 12,
                padding: 12,
                borderRadius: 12,
                background: C.bg,
                border: `1px solid ${foto.ocr_confirmado ? C.success : C.border}`,
              }}
            >
              <a href={foto.url} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
                <img src={foto.url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10, display: "block" }} />
              </a>

              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {foto.ocr_confirmado ? (
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.success, fontFamily: "'JetBrains Mono', monospace" }}>
                    ✓ {foto.codigo_confirmado}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={valor}
                    placeholder="Código leído"
                    onChange={e => setBorradores(b => ({ ...b, [foto.id]: e.target.value }))}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      background: C.surface,
                      color: C.text,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                )}

                {ocr?.advertencia && (
                  <div style={{ fontSize: 11, color: C.warning, lineHeight: 1.4 }}>⚠️ {ocr.advertencia}</div>
                )}
                {ocr?.confianza && (
                  <div style={{ fontSize: 11, color: C.textDim }}>
                    Confianza: {ocr.confianza} · leído por {foto.provider_usado === "groq" ? "Groq" : "Claude"}
                  </div>
                )}

                {ocr?.texto_completo && (
                  <details>
                    <summary style={{ fontSize: 11, color: C.textMuted, cursor: "pointer" }}>Ver todo el texto leído</summary>
                    <pre style={{ fontSize: 11, color: C.textMuted, whiteSpace: "pre-wrap", marginTop: 6, fontFamily: "'JetBrains Mono', monospace" }}>
                      {ocr.texto_completo}
                    </pre>
                    {ocr.otros_codigos?.length > 0 && (
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                        Otros códigos: {ocr.otros_codigos.join(", ")}
                      </div>
                    )}
                  </details>
                )}

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {!foto.ocr_confirmado && (
                    <button
                      onClick={() => confirmar(foto)}
                      disabled={trabajando}
                      style={btn(C.success, true)}
                    >
                      ✓ Confirmar
                    </button>
                  )}
                  <button onClick={() => reintentar(foto, provider)} disabled={trabajando} style={btn(C.textMuted, false)}>
                    ↻ Reintentar
                  </button>
                  {dudosa && foto.provider_usado === "groq" && (
                    <button onClick={() => reintentar(foto, "claude")} disabled={trabajando} style={btn(C.accent, false)}>
                      ✨ Reintentar con Claude
                    </button>
                  )}
                  <button onClick={() => descartar(foto)} disabled={trabajando} style={btn(C.danger, false)}>
                    ✕ Descartar
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function btn(color, solido) {
  return {
    minHeight: 44,
    padding: "0 14px",
    borderRadius: 8,
    border: solido ? "none" : `1px solid ${color}40`,
    background: solido ? color : "transparent",
    color: solido ? "#fff" : color,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };
}
