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

/**
 * Fotos guardadas cuyo OCR nunca llegó a completarse. Se deduce de ocr_texto
 * vacío — no hay columna "ocr_fallo" y no hace falta: la foto se guarda antes
 * de intentar el OCR, así que una fila sin ocr_texto es exactamente eso.
 */
export function contarSinOcr(fotos = []) {
  return fotos.filter(f => !f.ocr_texto).length;
}

// Solo Groq acepta key personal desde el browser. La de Gemini es server-side:
// nunca se guarda en el cliente ni viaja en un header.
function headersDeIA(provider) {
  const h = {};
  const groq = localStorage.getItem("clasificador_groq_key");
  if (provider === "groq" && groq) h["x-groq-key"] = groq;
  return h;
}

const NOMBRE_PROVIDER = { gemini: "Gemini", groq: "Groq" };

export default function ProductPhotosModal({ isOpen, producto, fotosIniciales = [], onClose, onFotosChange, toast }) {
  const codigo = producto?.codigo || producto?.CODIGO || "";

  const [fotos, setFotos] = useState(fotosIniciales);
  const [provider, setProvider] = useState(() => {
    // "claude" es el valor que guardaba la v5; quien lo tenga pasa a Gemini.
    const guardado = localStorage.getItem(PROVIDER_KEY);
    return guardado === "groq" ? "groq" : "gemini";
  });
  const [estado, setEstado] = useState("idle"); // idle | uploading | ocr | error
  const [errorMsg, setErrorMsg] = useState(null);
  const [errorOtro, setErrorOtro] = useState(null); // proveedor a ofrecer si falló uno
  const [preview, setPreview] = useState(null);
  const [borradores, setBorradores] = useState({}); // id → texto editado del código
  const [ocupadoId, setOcupadoId] = useState(null);

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

  const otroProveedor = p => (p === "groq" ? "gemini" : "groq");

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
    setErrorOtro(null);
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

      // La foto queda en la lista pase lo que pase con el OCR: el server la
      // guarda antes de transcribir, justamente para que un modelo caído no
      // haga perder una foto que ya está sacada y subida.
      actualizar([...fotos, data.row]);
      limpiarPreview();

      if (data.ocr_fallo) {
        setEstado("aviso");
        setErrorMsg(`${data.error}. La foto quedó guardada — escribí el código a mano o reintentá.`);
        setErrorOtro(data.otro_proveedor || null);
        toast?.error("Foto guardada, pero el OCR falló.");
      } else {
        setEstado("idle");
        toast?.success("Foto transcripta. Revisá el código antes de confirmar.");
      }
    } catch (err) {
      setErrorMsg(err.message);
      setErrorOtro(err.payload?.otro_proveedor || null);
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
      // Se manda el id: el server vuelve a leer SOBRE la misma fila. Antes esto
      // insertaba una fila nueva y borraba la vieja, y ese DELETE se llevaba el
      // archivo de Storage que la fila nueva seguía usando: reintentar dejaba la
      // foto rota. Ahora un reintento no puede borrar nada.
      const data = await apiFetch("/api/product-images", {
        method: "POST",
        headers: headersDeIA(conProvider),
        body: JSON.stringify({ id: foto.id, codigo, url: foto.url, provider: conProvider }),
        timeout: OCR_TIMEOUT,
      });
      actualizar(fotos.map(f => (f.id === foto.id ? data.row : f)));
      setBorradores(b => { const n = { ...b }; delete n[foto.id]; return n; });
      if (data.ocr_fallo) toast?.error(`${data.error}. La foto sigue guardada.`);
      else toast?.success("Foto vuelta a transcribir.");
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
      {/* Un solo contenedor con scroll: el del card de Modal. Anidar scrollers
          acá adentro hacía que en iOS el scroll se trabe entre capas. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          title={producto?.producto || producto?.PRODUCTO || ""}
          style={{ fontSize: 12, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {producto?.producto || producto?.PRODUCTO || ""}
        </div>

        {/* Captura.
            El input NO se dispara por JavaScript ni se delega en un <label>:
            va estirado por encima del botón con opacidad 0, así el dedo toca
            el input de verdad. Es el camino con menos intermediarios, y el
            único que no depende de cómo cada navegador reenvía el toque.

            Dos vías a propósito: con capture va directo a la cámara trasera;
            sin capture, iOS ofrece el menú (cámara o fototeca). Si una falla
            y la otra no, el problema es el atributo capture. */}
        <BotonCaptura
          etiqueta={estado === "uploading" ? "Subiendo foto..." : estado === "ocr" ? "Leyendo el código..." : "📷 Sacar foto"}
          conCamara
          onArchivo={handleArchivo}
          ocupado={ocupado}
          destacado
        />
        <BotonCaptura
          etiqueta="🖼️ Elegir una foto ya sacada"
          onArchivo={handleArchivo}
          ocupado={ocupado}
        />

        {/* La preferencia de proveedor va DESPUÉS de la acción principal: se
            toca una vez cada tanto, y arriba empujaba los botones fuera de
            pantalla en un iPhone. */}
        <label
          title="Gemini lee mejor las placas gastadas; Groq responde más rápido."
          style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: C.textMuted, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={provider === "groq"}
            onChange={e => cambiarProvider(e.target.checked ? "groq" : "gemini")}
            style={{ width: 18, height: 18, flexShrink: 0 }}
          />
          <span>Modo rápido (Groq) — por defecto lee Gemini</span>
        </label>

        {preview && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src={preview} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10, opacity: 0.6 }} />
            <span className="pulse" style={{ fontSize: 12, color: C.textMuted }}>
              {estado === "uploading" ? "Subiendo..." : "Transcribiendo..."}
            </span>
          </div>
        )}

        {/* "aviso" es distinto de "error": la foto SÍ se guardó y lo único que
            falló fue la transcripción. Va en ámbar, no en rojo, porque no hay
            nada que rehacer — solo leer el código a mano o reintentar. */}
        {(estado === "error" || estado === "aviso") && errorMsg && (() => {
          const parcial = estado === "aviso";
          const color = parcial ? C.warning : C.danger;
          return (
            <div style={{ padding: 12, borderRadius: 10, background: parcial ? `${C.warning}18` : C.dangerBg, border: `1px solid ${color}40`, color, fontSize: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <span>{errorMsg}</span>
              {errorOtro && NOMBRE_PROVIDER[errorOtro] && (
                <button
                  onClick={() => { cambiarProvider(errorOtro); setErrorMsg(null); setErrorOtro(null); setEstado("idle"); }}
                  style={btn(C.accent, true)}
                >
                  {parcial
                    ? `Usar ${NOMBRE_PROVIDER[errorOtro]} de ahora en más`
                    : `Cambiar a ${NOMBRE_PROVIDER[errorOtro]} y sacar la foto de nuevo`}
                </button>
              )}
            </div>
          );
        })()}

        {/* Fotos ya cargadas */}
        {fotos.length === 0 && estado !== "uploading" && estado !== "ocr" && (
          <div style={{ fontSize: 12, color: C.textDim, textAlign: "center", padding: "16px 0" }}>
            Todavía no hay fotos para este producto.
          </div>
        )}

        {fotos.map(foto => {
          const ocr = parseOcr(foto);
          // Sin ocr_texto: la foto se guardó pero el OCR nunca completó.
          const sinOcr = !foto.ocr_texto;
          const dudosa = sinOcr || (ocr && (ocr.confianza === "baja" || !!ocr.advertencia));
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
                border: `1px solid ${foto.ocr_confirmado ? C.success : sinOcr ? C.warning : C.border}`,
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

                {sinOcr && (
                  <div style={{ fontSize: 11, color: C.warning, lineHeight: 1.4, fontWeight: 600 }}>
                    ⚠️ Pendiente OCR — la foto está guardada, pero no se pudo leer.
                    Escribí el código a mano y confirmá, o reintentá.
                  </div>
                )}
                {ocr?.advertencia && (
                  <div style={{ fontSize: 11, color: C.warning, lineHeight: 1.4 }}>⚠️ {ocr.advertencia}</div>
                )}
                {ocr?.confianza && (
                  <div style={{ fontSize: 11, color: C.textDim }}>
                    Confianza: {ocr.confianza} · leído por {NOMBRE_PROVIDER[foto.provider_usado] || foto.provider_usado}
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
                  {dudosa && (
                    <button
                      onClick={() => reintentar(foto, otroProveedor(foto.provider_usado))}
                      disabled={trabajando}
                      style={btn(C.accent, false)}
                    >
                      ✨ Reintentar con {NOMBRE_PROVIDER[otroProveedor(foto.provider_usado)]}
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

/**
 * Botón de captura. El <input type="file"> se estira encima con opacidad 0,
 * así el toque cae sobre el input y no hay que reenviarlo desde nada.
 */
function BotonCaptura({ etiqueta, onArchivo, ocupado, conCamara = false, destacado = false }) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: destacado ? 52 : 46,
        borderRadius: 12,
        background: ocupado ? C.surface2 : destacado ? C.accent : "transparent",
        border: destacado ? "none" : `1px solid ${C.border}`,
        color: ocupado ? C.textMuted : destacado ? "#fff" : C.textMuted,
        fontSize: destacado ? 15 : 13,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <span style={{ pointerEvents: "none" }}>{etiqueta}</span>
      <input
        type="file"
        accept="image/*"
        {...(conCamara ? { capture: "environment" } : {})}
        onChange={onArchivo}
        disabled={ocupado}
        aria-label={etiqueta}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          cursor: ocupado ? "default" : "pointer",
        }}
      />
    </div>
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
