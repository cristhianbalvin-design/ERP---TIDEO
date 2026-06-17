import React, { useState, useEffect } from 'react';
import { I } from '../icons.jsx';
import { TIPO_CONTRATO_LABELS, MODALIDAD_TRABAJO_LABELS, REGIMEN_JORNADA_LABELS, labelOr } from '../utils/rrhhLabels.js';

const HAB_DOC_LABEL = {
  vigente: 'Vigente',
  por_vencer: 'Por vencer',
  vencido: 'Vencido',
  falta: 'Falta',
  en_revision: 'En revisión',
  rechazado: 'Rechazado',
  incompleto: 'Incompleto',
  anulado: 'Anulado',
};

const HAB_DOC_BADGE = {
  vigente: 'badge-green',
  por_vencer: 'badge-orange',
  vencido: 'badge-red',
  falta: 'badge-gray',
  en_revision: 'badge-cyan',
  rechazado: 'badge-red',
  incompleto: 'badge-orange',
  anulado: 'badge-gray',
};

const habMimeKind = (doc = {}, url = '') => {
  const raw = `${doc.nombre_archivo || ''} ${doc.mime_type || doc.content_type || ''} ${url || doc.archivo_url || ''}`.toLowerCase();
  if (raw.includes('application/pdf') || raw.includes('.pdf')) return 'pdf';
  if (raw.includes('image/') || /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(raw)) return 'image';
  return 'other';
};

const habDiasTexto = (dias) => {
  if (dias === null || dias === undefined || dias === '') return '';
  const n = Number(dias);
  if (!Number.isFinite(n)) return '';
  if (n === 0) return 'vence hoy';
  return n > 0 ? `quedan ${n} días` : `venció hace ${Math.abs(n)} días`;
};

const fmtUser = (id) => {
  if (!id) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id) ? id.slice(0, 8) + '…' : id;
};

export function DocumentoPreviewModal({
  req,
  persona,
  url,
  loadingUrl,
  canValidate,
  validatingId,
  onClose,
  onReplace,
  onCorregir,
  onNuevaVersion,
  onNuevoContrato,
  onValidate,
  onDownload,
}) {
  const [imgFit, setImgFit] = useState('fit');
  const [rejecting, setRejecting] = useState(false);
  const [motivo, setMotivo] = useState('');
  
  // Historical versions state
  const [grupos, setGrupos] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [esRenovable, setEsRenovable] = useState(false);

  const [viewingHistoryDoc, setViewingHistoryDoc] = useState(null);
  const [historyUrl, setHistoryUrl] = useState('');
  const [loadingHistoryUrl, setLoadingHistoryUrl] = useState(false);
  const [anulandoId, setAnulandoId] = useState(null);
  const [anularMotivo, setAnularMotivo] = useState('');
  const [sideTab, setSideTab] = useState('info');

  useEffect(() => {
    if (!req?.doc?.id || !req?.doc?.personal_id || !req?.doc?.tipo_doc || !req?.doc?.empresa_id) return;
    let mounted = true;
    const fetchDatos = async () => {
      setLoadingHistorial(true);
      try {
        const { getSupabaseClient, isSupabaseConfigured } = await import('../lib/supabaseClient.js');
        if (!isSupabaseConfigured()) {
          if (mounted) setGrupos([]);
          return;
        }
        const { getHistorialPorGrupo, getTiposDocumentoConfig } = await import('../services/personalDocumentosService.js');
        const [g, configs] = await Promise.all([
          getHistorialPorGrupo(req.doc.empresa_id, req.doc.personal_id, req.doc.tipo_doc),
          getTiposDocumentoConfig(req.doc.empresa_id)
        ]);
        if (mounted) {
          setGrupos(g);
          const conf = configs.find(c => c.tipo_doc === req.doc.tipo_doc);
          setEsRenovable(conf?.renovable || false);
        }
      } catch (err) {
        console.error('Error fetching historial/config:', err);
      } finally {
        if (mounted) setLoadingHistorial(false);
      }
    };
    fetchDatos();
    return () => { mounted = false; };
  }, [req?.doc?.id, req?.doc?.personal_id, req?.doc?.tipo_doc, req?.doc?.empresa_id]);

  if (!req?.doc) return null;
  
  // Buscar la versión fresca en el historial recién consultado
  const todasVersionesFrescas = grupos.flatMap(g => g.versiones);
  const docFresco = todasVersionesFrescas.find(v => v.id === req.doc.id) || req.doc;
  
  const doc = docFresco;
  const activeDoc = viewingHistoryDoc || doc;
  const activeUrl = viewingHistoryDoc ? historyUrl : url;
  const activeLoading = viewingHistoryDoc ? loadingHistoryUrl : loadingUrl;
  
  const kind = habMimeKind(activeDoc, activeUrl);
  const estado = viewingHistoryDoc ? activeDoc.estado_validacion : (req.estado || doc.estado);
  const dias = viewingHistoryDoc ? null : habDiasTexto(req.dias_restantes);
  const puedeValidar = Boolean(
    !viewingHistoryDoc &&
    canValidate &&
    doc.estado_validacion === 'pendiente' &&
    req.tipo?.requiere_validacion
  );

  const metaRow = (label, value, tone) => value ? (
    <div style={{display:'grid', gap:3}}>
      <div style={{fontSize:10, color:'var(--fg-muted)', textTransform:'uppercase', letterSpacing:'0.05em'}}>{label}</div>
      <div style={{fontSize:12, color:tone || 'var(--fg)', wordBreak:'break-word'}}>{value}</div>
    </div>
  ) : null;

  const confirmarRechazo = () => {
    if (!motivo.trim()) return;
    onValidate(doc.id, 'rechazado', motivo.trim());
    setRejecting(false);
    setMotivo('');
  };

  const handleVerHistorico = async (hDoc) => {
    setViewingHistoryDoc(hDoc);
    setHistoryUrl('');
    setLoadingHistoryUrl(true);
    try {
      const { renovarUrlDocumento } = await import('../services/personalDocumentosService.js');
      const renewedUrl = await renovarUrlDocumento(hDoc.storage_path || hDoc.archivo_url);
      setHistoryUrl(renewedUrl);
    } catch (e) {
      setHistoryUrl(hDoc.archivo_url || '');
    } finally {
      setLoadingHistoryUrl(false);
    }
  };

  const confirmarAnular = async (hDocId) => {
    if (!anularMotivo.trim()) return;
    try {
      const { getSupabaseClient } = await import('../lib/supabaseClient.js');
      const supabase = await getSupabaseClient();
      const { error } = await supabase
        .from('personal_documentos')
        .update({
          estado_validacion: 'anulado',
          motivo_rechazo: anularMotivo.trim(),
        })
        .eq('id', hDocId);
      if (error) throw error;
      setGrupos(prevGrupos => prevGrupos.map(g => ({
        ...g,
        versiones: g.versiones.map(h => h.id === hDocId ? { ...h, estado_validacion: 'anulado', motivo_rechazo: anularMotivo.trim() } : h)
      })));
      setAnulandoId(null);
      setAnularMotivo('');
    } catch (e) {
      console.error(e);
      alert('Error al anular: ' + e.message);
    }
  };

  const handleDownload = () => {
    if (viewingHistoryDoc && activeUrl) {
      window.open(activeUrl, '_blank', 'noopener,noreferrer');
    } else {
      if (onDownload) onDownload();
    }
  };

  const subidoPor = activeDoc.subido_por_nombre || fmtUser(activeDoc.subido_por);
  const validadoPor = activeDoc.revisado_por_nombre || fmtUser(activeDoc.revisado_por);

  const esContratoDoc = Boolean(req.tipo?.captura_snapshot_laboral && !req.tipo?.documento_padre_tipo_id);
  const btnNuevoPeriodoTexto = (() => {
    const t = (doc.tipo_doc || '').toLowerCase();
    if (t.includes('contrato')) return 'Nuevo contrato';
    if (t.includes('sctr')) return 'Renovar SCTR';
    if (t.includes('seguro')) return 'Renovar seguro';
    return 'Nueva renovación';
  })();

  const cond = doc.condiciones_laborales || {};
  const _condPropia = esContratoDoc && Object.values(cond).some(v => v !== null && v !== undefined && v !== '' && v !== 0);
  
  // Buscar docPadre en los grupos
  const todasVersiones = grupos.flatMap(g => g.versiones);
  const _docPadre = !_condPropia ? todasVersiones.find(h => Object.values(h.condiciones_laborales || {}).some(v => v !== null && v !== undefined && v !== '' && v !== 0)) : null;
  const tieneContrato = _condPropia || Boolean(_docPadre);
  const condEfectiva = _condPropia ? cond : (_docPadre?.condiciones_laborales || {});
  const condDesdeOriginal = !_condPropia && Boolean(_docPadre);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(1140px, 96vw)',
          maxWidth: '1140px',
          maxHeight: '93vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── Cabecera ── */}
        <div className="modal-head" style={{flexShrink:0}}>
          <div style={{minWidth:0}}>
            <h3 style={{marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
              {req.tipo?.nombre || req.tipo_documento_id}
              {viewingHistoryDoc && <span className="badge badge-orange" style={{marginLeft: 8, verticalAlign: 'middle'}}>Viendo versión anterior (v{viewingHistoryDoc.version})</span>}
            </h3>
            <div className="text-muted" style={{fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
              {persona?.nombre} · {activeDoc.nombre_archivo || 'Documento'}
            </div>
          </div>
          <button className="icon-btn" style={{flexShrink:0}} onClick={onClose}>{I.x}</button>
        </div>

        {/* ── Cuerpo ── */}
        <div
          className="modal-body"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) 300px',
            gap: 16,
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Panel izquierdo: visor */}
          <div style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 0,
          }}>
            {activeLoading ? (
              <div className="text-muted" style={{fontSize:13}}>Cargando documento...</div>
            ) : !activeUrl ? (
              <div style={{textAlign:'center', padding:24}}>
                <div style={{fontWeight:600, marginBottom:8}}>No se pudo generar el visor</div>
                <button className="btn btn-secondary btn-sm" onClick={handleDownload}>{I.download} Descargar</button>
              </div>
            ) : kind === 'pdf' ? (
              <iframe
                title={activeDoc.nombre_archivo || 'Documento PDF'}
                src={activeUrl}
                style={{border:0, width:'100%', height:'100%', minHeight:400}}
              />
            ) : kind === 'image' ? (
              <div style={{width:'100%', height:'100%', display:'flex', flexDirection:'column', minHeight:400}}>
                <div style={{padding:8, borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'flex-end', gap:6, flexShrink:0}}>
                  <button className={'btn btn-sm ' + (imgFit === 'fit' ? 'btn-primary' : 'btn-ghost')} onClick={() => setImgFit('fit')}>Ajustar</button>
                  <button className={'btn btn-sm ' + (imgFit === 'real' ? 'btn-primary' : 'btn-ghost')} onClick={() => setImgFit('real')}>100%</button>
                </div>
                <div style={{flex:1, overflow:'auto', display:'flex', alignItems:imgFit==='fit'?'center':'flex-start', justifyContent:imgFit==='fit'?'center':'flex-start', padding:16}}>
                  <img src={activeUrl} alt={activeDoc.nombre_archivo || 'Documento'} style={imgFit==='fit'?{maxWidth:'100%',maxHeight:'100%',objectFit:'contain'}:{maxWidth:'none'}} />
                </div>
              </div>
            ) : (
              <div style={{textAlign:'center', padding:24}}>
                <div style={{fontWeight:600, marginBottom:8}}>Formato no reconocido</div>
                <div className="text-muted" style={{fontSize:12, marginBottom:14}}>Usa la descarga como respaldo.</div>
                <button className="btn btn-secondary btn-sm" onClick={handleDownload}>{I.download} Descargar</button>
              </div>
            )}
          </div>

          {/* Panel derecho: tabs + acciones */}
          <aside style={{display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden'}}>

            {/* Tabs */}
            <div style={{display:'flex', gap:2, borderBottom:'1px solid var(--border)', marginBottom:14, flexShrink:0}}>
              {[['info','Información'],['versiones',`Versiones (${todasVersiones.length})`]].map(([k,l]) => (
                <button key={k} onClick={() => setSideTab(k)} style={{
                  padding:'6px 12px', fontSize:12, fontWeight: sideTab===k ? 700 : 400,
                  border:'none', background:'transparent', cursor:'pointer',
                  color: sideTab===k ? 'var(--primary)' : 'var(--fg-muted)',
                  borderBottom: sideTab===k ? '2px solid var(--primary)' : '2px solid transparent',
                  marginBottom:-1,
                }}>{l}</button>
              ))}
            </div>

            {/* Tab: Información */}
            {sideTab === 'info' && (
              <div style={{flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:0, paddingBottom:8, paddingRight:2}}>
                {/* Estado */}
                <span className={'badge ' + (HAB_DOC_BADGE[estado] || 'badge-gray')} style={{alignSelf:'flex-start', fontSize:12, marginBottom:12}}>
                  {HAB_DOC_LABEL[estado] || estado}
                </span>

                {/* Datos del documento */}
                <div style={{display:'flex', flexDirection:'column', gap:8, marginBottom:12}}>
                  {metaRow('Tipo', req.tipo?.nombre || req.tipo_documento_id)}
                  {metaRow('Emisión', activeDoc.fecha_emision)}
                  {metaRow('Vencimiento', [activeDoc.fecha_vencimiento, dias].filter(Boolean).join('  ·  '))}
                  {metaRow('Versión', `Versión ${activeDoc.version || 1}${activeDoc.creado_en ? ` · Subida el ${String(activeDoc.creado_en).slice(0,10)}` : ''}`)}
                </div>

                {/* Condiciones contractuales */}
                {tieneContrato && (
                  <div style={{borderTop:'1px solid var(--border)', paddingTop:12, marginBottom:12, display:'flex', flexDirection:'column', gap:8}}>
                    <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:2}}>
                      <div style={{fontSize:10, fontWeight:700, color:'var(--fg-subtle)', textTransform:'uppercase', letterSpacing:'0.07em'}}>
                        Condiciones contractuales
                      </div>
                      {condDesdeOriginal && (
                        <span style={{fontSize:10, color:'var(--fg-muted)', background:'var(--bg-subtle)', border:'1px solid var(--border)', borderRadius:4, padding:'1px 6px'}}>
                          del documento original
                        </span>
                      )}
                    </div>
                    {metaRow('Cargo', condEfectiva.cargo_nombre || condEfectiva.cargo)}
                    {condEfectiva.remuneracion_base ? metaRow('Sueldo base', `S/ ${Number(condEfectiva.remuneracion_base).toLocaleString('es-PE', {minimumFractionDigits:2})}`) : null}
                    {metaRow('Tipo contrato', labelOr(TIPO_CONTRATO_LABELS, condEfectiva.tipo_contrato))}
                    {metaRow('Modalidad', labelOr(MODALIDAD_TRABAJO_LABELS, condEfectiva.modalidad))}
                    {metaRow('Sede', condEfectiva.sede_nombre || condEfectiva.sede)}
                    {condEfectiva.area_nombre ? metaRow('Área', condEfectiva.area_nombre) : null}
                    {metaRow('Régimen', labelOr(REGIMEN_JORNADA_LABELS, condEfectiva.regimen_jornada))}
                    {(_docPadre?.fecha_vigencia_cambio || doc.fecha_vigencia_cambio) ? metaRow('Vigente desde', doc.fecha_vigencia_cambio || _docPadre?.fecha_vigencia_cambio) : null}
                    {condEfectiva.descripcion_cambio ? metaRow('Descripción del cambio', condEfectiva.descripcion_cambio) : null}
                  </div>
                )}

                {/* Auditoría y notas — al final */}
                <div style={{borderTop:'1px solid var(--border)', paddingTop:12, display:'flex', flexDirection:'column', gap:8}}>
                  {metaRow('Subido por', [subidoPor, activeDoc.creado_en ? String(activeDoc.creado_en).slice(0,16).replace('T',' ') : null].filter(Boolean).join('  ·  '))}
                  {activeDoc.revisado_en && metaRow('Validado por', [validadoPor, String(activeDoc.revisado_en).slice(0,16).replace('T',' ')].filter(Boolean).join('  ·  '))}
                  {activeDoc.motivo_rechazo && metaRow('Motivo de rechazo', activeDoc.motivo_rechazo, 'var(--danger)')}
                  {metaRow('Notas', activeDoc.notas)}
                </div>
              </div>
            )}

            {/* Tab: Versiones */}
            {sideTab === 'versiones' && (
              <div style={{flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:8, paddingBottom:8, paddingRight:2}}>
                {loadingHistorial && <div className="text-muted" style={{fontSize:12}}>Cargando historial...</div>}
                {!loadingHistorial && grupos.length === 0 && (
                  <div className="text-muted" style={{fontSize:12}}>No hay versiones registradas.</div>
                )}
                {!loadingHistorial && grupos.map((g, idx) => {
                  const isLegacy = g.isLegacy;
                  return (
                    <div key={g.periodoGrupoId || 'legacy'} style={{marginBottom: 16}}>
                      {/* Cabecera del Periodo */}
                      {isLegacy ? (
                        <div style={{fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', marginBottom: 8, textTransform: 'uppercase'}}>
                          {g.titulo}
                        </div>
                      ) : (
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                          <strong style={{fontSize: 13}}>
                            Período: {g.fechaEmision ? String(g.fechaEmision).slice(0, 10) : '?'} → {g.fechaVencimiento ? String(g.fechaVencimiento).slice(0, 10) : '?'}
                          </strong>
                          <span className={`badge ${g.badge_color || (g.activo ? 'badge-green' : 'badge-gray')}`} style={{fontSize: 10}}>
                            {g.badge_texto || (g.activo ? 'Período activo' : 'Archivado')}
                          </span>
                        </div>
                      )}

                      {/* Lista de Versiones del Grupo */}
                      <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                        {g.versiones.map((h, vIdx) => {
                          const isCurrentActive = (!viewingHistoryDoc && h.id === doc.id) || (viewingHistoryDoc?.id === h.id);
                          const bg = isCurrentActive ? 'var(--bg-subtle)' : 'transparent';
                          const borderLeft = h.activo && !isLegacy ? '3px solid #22c55e' : '1px solid var(--border)';
                          
                          return (
                            <div key={h.id} style={{border:'1px solid var(--border)', borderLeft, borderRadius:8, padding:'8px 12px', fontSize:12, background: bg}}>
                              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
                                <strong>Versión {h.version || (g.versiones.length - vIdx)} {h.activo ? '· activa' : ''}</strong>
                                <span className={'badge ' + (h.estado_validacion==='anulado'?'badge-gray': HAB_DOC_BADGE[h.estado_validacion] || 'badge-gray')} style={{fontSize:10}}>
                                  {HAB_DOC_LABEL[h.estado_validacion] || h.estado_validacion}
                                </span>
                              </div>
                              <div className="text-muted" style={{marginBottom:2}}>
                                Subida: {h.creado_en ? String(h.creado_en).slice(0,10) : 'N/A'}
                              </div>
                              <div className="text-muted" style={{marginBottom:6, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{h.nombre_archivo}</div>
                              {anulandoId === h.id ? (
                                <div style={{display:'grid', gap:6, marginTop:6}}>
                                  <input className="input" style={{fontSize:11, padding:'4px 8px'}} placeholder="Motivo obligatorio" value={anularMotivo} onChange={e => setAnularMotivo(e.target.value)} />
                                  <div className="row" style={{gap:6}}>
                                    <button className="btn btn-danger btn-sm" disabled={!anularMotivo.trim()} onClick={() => confirmarAnular(h.id)}>Confirmar</button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => { setAnulandoId(null); setAnularMotivo(''); }}>Cancelar</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="row" style={{gap:6, marginTop:6}}>
                                  {doc.id !== h.id && viewingHistoryDoc?.id !== h.id && (
                                    <button className="btn btn-secondary btn-sm" onClick={() => handleVerHistorico(h)}>Ver</button>
                                  )}
                                  {viewingHistoryDoc?.id === h.id && (
                                    <button className="btn btn-primary btn-sm" onClick={() => setViewingHistoryDoc(null)}>Volver a actual</button>
                                  )}
                                  {h.estado_validacion !== 'anulado' && !h.activo && (
                                    <button className="btn btn-ghost btn-sm" style={{color:'var(--danger)'}} onClick={() => setAnulandoId(h.id)}>Anular</button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Acciones — siempre visibles al fondo */}
            <div style={{flexShrink:0, borderTop:'1px solid var(--border)', paddingTop:12, display:'grid', gap:8}}>
              {viewingHistoryDoc ? (
                <>
                  <button className="btn btn-secondary" onClick={handleDownload}>{I.download} Descargar esta versión</button>
                  <button className="btn btn-ghost" onClick={() => setViewingHistoryDoc(null)}>Volver a la versión activa</button>
                </>
              ) : (
                <>
                  <button className="btn btn-secondary" onClick={handleDownload}>{I.download} Descargar</button>
                  {puedeValidar && (
                    <>
                      <button className="btn btn-primary" disabled={validatingId === doc.id} onClick={() => onValidate(doc.id, 'aprobado')}>
                        {validatingId === doc.id ? 'Procesando...' : 'Validar'}
                      </button>
                      {rejecting ? (
                        <div style={{display:'grid', gap:6}}>
                          <input className="input" style={{fontSize:12}} placeholder="Motivo de rechazo" value={motivo} onChange={e => setMotivo(e.target.value)} />
                          <div className="row" style={{gap:6}}>
                            <button className="btn btn-danger btn-sm" disabled={!motivo.trim() || validatingId === doc.id} onClick={confirmarRechazo}>Confirmar</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setRejecting(false); setMotivo(''); }}>Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <button className="btn btn-ghost" style={{color:'var(--danger)'}} disabled={validatingId === doc.id} onClick={() => setRejecting(true)}>
                          Rechazar con motivo
                        </button>
                      )}
                    </>
                  )}
                  {esContratoDoc || esRenovable ? (
                    <>
                      {onCorregir && (doc.estado_validacion === 'pendiente' || doc.estado_validacion === 'rechazado' || !onNuevaVersion) && (
                        <button className="btn btn-ghost" onClick={onCorregir}>
                          {I.edit || I.upload} Corregir este documento
                        </button>
                      )}
                      {onNuevaVersion && doc.estado_validacion === 'aprobado' && !esRenovable && (
                        <button className="btn btn-ghost" onClick={onNuevaVersion}>
                          {I.upload} Subir nueva versión
                        </button>
                      )}
                      {onNuevoContrato && doc.estado_validacion === 'aprobado' && esRenovable && (
                        <div style={{display:'grid', gap:4}}>
                          <button className="btn btn-ghost" style={{color:'var(--orange)'}} onClick={onNuevoContrato}>
                            + {btnNuevoPeriodoTexto}
                          </button>
                          <div style={{fontSize:10, color:'var(--fg-muted)', lineHeight:1.4}}>
                            El período anterior quedará archivado. Úsalo para crear una nueva renovación independiente.
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    onReplace && (
                      <button className="btn btn-ghost" onClick={onReplace}>{I.upload} Reemplazar</button>
                    )
                  )}
                </>
              )}
              <button className="btn btn-ghost" style={{color:'var(--fg-muted)'}} onClick={onClose}>Cerrar</button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

