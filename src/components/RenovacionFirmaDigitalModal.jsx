import React, { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import { renderTextoDocumental } from '../lib/variablesDocumentales.js';
import { ajustarRunsPdf, construirContextoRenovacion, extraerParrafosTipTap } from '../../supabase/functions/_shared/contratoFirma.js';
import { contratoFirmaService, filtrarPlantillasPorModalidad } from '../contratoFirmaService.js';
import * as personalDocumentosService from '../services/personalDocumentosService.js';
import FirmaEmpleadorModal from './FirmaEmpleadorModal.jsx';
import FirmantesContratoModal from './FirmantesContratoModal.jsx';
import { useApp } from '../context.jsx';

export { filtrarPlantillasPorModalidad };
const MODALIDADES_LEGALES = ['Indefinido', 'Necesidad de mercado', 'Inicio o incremento de actividad', 'Obra determinada o servicio específico', 'Suplencia', 'Ocasional', 'De temporada', 'De emergencia', 'Reconversión empresarial', 'Intermitente'];

const fechaLocalHoy = () => {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
};

const fechaInicioRenovacion = documento => {
  if (!documento?.fecha_vencimiento) return fechaLocalHoy();
  const fecha = new Date(`${documento.fecha_vencimiento}T00:00:00`);
  fecha.setDate(fecha.getDate() + 1);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
};

export default function RenovacionFirmaDigitalModal({ empresa, persona, documento, onClose, onComplete }) {
  const { role } = useApp();
  const [plantillas, setPlantillas] = useState([]);
  const [plantillaId, setPlantillaId] = useState('');
  const [fechaInicio, setFechaInicio] = useState(() => fechaInicioRenovacion(documento));
  const [fechaFin, setFechaFin] = useState('');
  const [sociedad, setSociedad] = useState(null);
  const [direccionEmpresa, setDireccionEmpresa] = useState('');
  const [cargo, setCargo] = useState(documento?.condiciones_laborales?.cargo_nombre || documento?.condiciones_laborales?.cargo || persona?.cargo || '');
  const [remuneracion, setRemuneracion] = useState(documento?.condiciones_laborales?.remuneracion_base ?? persona?.sueldo_base ?? '');
  const [modalidad, setModalidad] = useState(documento?.condiciones_laborales?.modalidad || persona?.modalidad_contrato || persona?.tipo_contrato || '');
  const [firmantes, setFirmantes] = useState([]); const [firmanteId, setFirmanteId] = useState('');
  const [modalidadLegal, setModalidadLegal] = useState(''); const [causaObjetiva, setCausaObjetiva] = useState(''); const [formaTrabajo, setFormaTrabajo] = useState('Presencial');
  const [firmaEmpresaId, setFirmaEmpresaId] = useState(''); const [firmaCreada, setFirmaCreada] = useState(null); const [mostrarFirmantes, setMostrarFirmantes] = useState(false);
  const [canales, setCanales] = useState({ whatsapp: true, email: true });
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const sb = await getSupabaseClient();
        const { data, error: queryError } = await sb.from('plantillas_documento_bloques')
          .select('id,nombre_interno,version,tipo_documento_id,sociedad_id,encabezado_texto_plano,pie_texto_plano,tipos_documento_electronico!inner(id,nombre,codigo,categoria_base,modalidad_contractual)')
          .eq('empresa_id', empresa.id).eq('estado', 'publicada').eq('tipos_documento_electronico.categoria_base', 'contrato_laboral').order('version', { ascending: false });
        if (queryError) throw queryError;
        const rows = filtrarPlantillasPorModalidad(data || [], persona?.modalidad_contrato);
        if (active) { setPlantillas(rows); setPlantillaId(rows[0]?.id || ''); }
      } catch (e) { if (active) setError(e.message || 'No se pudieron cargar las plantillas publicadas.'); }
      finally { if (active) setCargando(false); }
    })();
    return () => { active = false; };
  }, [empresa?.id, persona?.modalidad_contrato]);

  useEffect(() => { let active = true; (async () => { try { const rows = await contratoFirmaService.listarFirmantesActivos(empresa.id); const disponibles = rows.filter(f => !f.sociedad_id || f.sociedad_id === (documento?.sociedad_id || null)); if (active) { setFirmantes(disponibles); setFirmanteId(disponibles[0]?.id || ''); } } catch (e) { if (active) setError(e.message); } })(); return () => { active = false; }; }, [empresa?.id, documento?.sociedad_id]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const sb = await getSupabaseClient();
        const sociedadId = documento?.sociedad_id || plantillas.find(p => p.id === plantillaId)?.sociedad_id || null;
        let sociedadRow = null;
        if (sociedadId && empresa?.id) {
          const { data, error: queryError } = await sb.from('sociedades').select('id,razon_social,ruc,direccion_fiscal').eq('id', sociedadId).eq('empresa_id', empresa.id).maybeSingle();
          if (queryError) throw queryError;
          sociedadRow = data || null;
        }
        const { data: config, error: configError } = await sb.from('empresa_config').select('direccion').eq('empresa_id', empresa.id).maybeSingle();
        if (configError) throw configError;
        if (active) { setSociedad(sociedadRow); setDireccionEmpresa(config?.direccion || ''); }
      } catch { if (active) { setSociedad(null); setDireccionEmpresa(''); } }
    })();
    return () => { active = false; };
  }, [empresa?.id, documento?.sociedad_id, plantillaId, plantillas]);

  const generarPdf = async (plantilla, snapshot) => {
    const sb = await getSupabaseClient();
    const { data: blocks, error: blocksError } = await sb.from('documento_bloques').select('tipo_bloque,titulo,contenido_json,contenido_texto_plano,orden,activo').eq('plantilla_documento_id', plantilla.id).eq('activo', true).order('orden');
    if (blocksError) throw blocksError;
    const ctx = construirContextoRenovacion({ empresa: { ...empresa, direccion: direccionEmpresa || empresa?.direccion }, sociedad, persona, documento, snapshot, fechaInicio, fechaFin });
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 18; const maxY = 278; let y = 20;
    const addPlainText = (raw, bold = false) => {
      pdf.setFont('helvetica', bold ? 'bold' : 'normal');
      const resolved = renderTextoDocumental(raw || '', 'contrato_laboral', ctx);
      for (const line of pdf.splitTextToSize(resolved, 174)) {
        if (y > maxY) { pdf.addPage(); y = 20; }
        pdf.text(line, margin, y); y += 6;
      }
      y += 3;
    };
    const addRichParagraph = paragraph => {
      const runs = paragraph.runs.map(run => ({ ...run, text: renderTextoDocumental(run.text, 'contrato_laboral', ctx) }));
      const lines = ajustarRunsPdf(runs, 174, (text, bold) => { pdf.setFont('helvetica', bold ? 'bold' : 'normal'); return pdf.getTextWidth(text); });
      lines.forEach((line, lineIndex) => {
        if (y > maxY) { pdf.addPage(); y = 20; }
        const lineWidth = line.reduce((sum, run) => { pdf.setFont('helvetica', run.bold ? 'bold' : 'normal'); return sum + pdf.getTextWidth(run.text); }, 0);
        const spaces = line.reduce((sum, run) => sum + (run.text.match(/ /g) || []).length, 0);
        const justify = paragraph.align === 'justify' && lineIndex < lines.length - 1 && spaces > 0;
        const extraPerSpace = justify ? Math.max(0, (174 - lineWidth) / spaces) : 0;
        let x = margin;
        if (paragraph.align === 'center') x += Math.max(0, (174 - lineWidth) / 2);
        for (const run of line) {
          pdf.setFont('helvetica', run.bold ? 'bold' : 'normal');
          pdf.text(run.text, x, y);
          const width = pdf.getTextWidth(run.text);
          x += width + ((run.text.match(/ /g) || []).length * extraPerSpace);
        }
        y += 6;
      });
      y += 3;
    };
    if (plantilla.encabezado_texto_plano) addPlainText(plantilla.encabezado_texto_plano);
    for (const block of blocks || []) {
      const paragraphs = extraerParrafosTipTap(block.contenido_json);
      if (paragraphs.length) paragraphs.forEach(addRichParagraph);
      else addPlainText(block.contenido_texto_plano || block.titulo || '');
    }
    if (plantilla.pie_texto_plano) addPlainText(plantilla.pie_texto_plano);
    return new File([pdf.output('blob')], `Renovacion_${persona.nombre || persona.id}.pdf`, { type: 'application/pdf' });
  };

  const guardar = async () => {
    if (!plantillaId) { setError('No hay una plantilla publicada de contrato laboral. Publica una en el Constructor de Documentos para continuar.'); return; }
    if (!fechaInicio || !fechaFin || fechaFin < fechaInicio) { setError('Completa una fecha de fin igual o posterior a la fecha de inicio.'); return; }
    setGuardando(true); setError('');
    let created = null;
    try {
      const plantilla = plantillas.find(p => p.id === plantillaId);
      const firmante = firmantes.find(f => f.id === firmanteId);
      if (!firmante) throw new Error('Selecciona un firmante autorizado de la empresa.');
      const esHonorarios = persona?.modalidad_contrato === 'honorarios';
      if (!esHonorarios && !modalidadLegal) throw new Error('Selecciona la modalidad legal del contrato.');
      if (!esHonorarios && modalidadLegal !== 'Indefinido' && !causaObjetiva.trim()) throw new Error('Describe la causa objetiva del contrato temporal.');
      const snapshot = { ...(documento?.condiciones_laborales || {}), cargo, cargo_nombre: cargo, remuneracion_base: Number(remuneracion) || 0, modalidad, forma_trabajo: formaTrabajo, modalidad_legal: esHonorarios ? '' : modalidadLegal, causa_objetiva: esHonorarios ? '' : causaObjetiva.trim(), regimen_jornada: persona?.regimen_jornada || documento?.condiciones_laborales?.regimen_jornada || 'general', horas_diarias: persona?.horas_diarias_pactadas || persona?.horas_diarias || 8, representante: { nombre: firmante.nombre, documento: firmante.documento, cargo: firmante.cargo }, contrato_anterior: { fecha_inicio: documento?.periodo_fecha_inicio || documento?.fecha_emision || '', fecha_fin: documento?.periodo_fecha_fin || documento?.fecha_vencimiento || '' }, fecha_inicio: fechaInicio, fecha_fin: fechaFin };
      const file = await generarPdf(plantilla, snapshot);
      created = await personalDocumentosService.nuevoContrato({ empresaId: empresa.id, personalId: persona.id, personalTipo: documento.personal_tipo || 'administrativo', tipoDoc: documento.tipo_doc, tipoDocumentoId: documento.tipo_documento_id || plantilla.tipo_documento_id, file, fechaEmision: fechaInicio, fechaVencimiento: documento.es_indefinido ? null : fechaFin, notas: 'Renovación generada con plantilla documental publicada.', condicionesLaborales: snapshot, periodoIdAnterior: documento.contrato_periodo_id || documento.periodo_id || null, esIndefinido: Boolean(documento.es_indefinido), sociedadId: documento.sociedad_id || plantilla.sociedad_id || null });
      const channels = Object.entries(canales).filter(([, enabled]) => enabled).map(([name]) => name);
      const firma = await contratoFirmaService.crearFirmaEmpresa({ documentoId: created.id, firmanteId, canales: channels });
      if (firma.es_firmante) { setFirmaCreada(created); setFirmaEmpresaId(firma.id); return; }
      await onComplete?.(created, { ok: true, aviso: `Renovación creada. Pendiente de firma de ${firma.firmante}.` }); onClose(); return;
    } catch (e) { setError(e.message || 'No se pudo crear y enviar la renovación.'); }
    finally { setGuardando(false); }
  };

  if (firmaEmpresaId) return <FirmaEmpleadorModal firmaId={firmaEmpresaId} onClose={onClose} onComplete={async envio => { await onComplete?.(firmaCreada, envio?.ok === false ? envio : { ok: true, aviso: 'Contrato firmado por la empresa y enviado al trabajador.' }); }} />;

  return <div className="modal-backdrop" role="presentation" style={{ zIndex: 10000 }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="renovacion-firma-title" style={{ width: 'min(620px,100%)', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
      <div className="modal-head"><h2 id="renovacion-firma-title">Renovar con firma digital</h2></div>
      <div className="modal-body">
      {!cargando && persona?.modalidad_contrato === 'honorarios' && !plantillas.length && <div className="alert alert-warning">Este colaborador está por honorarios: no puede renovarse con un contrato de trabajo. Publica una plantilla de locación de servicios (tipo con modalidad Honorarios) en el Constructor de Documentos.</div>}
      {!cargando && persona?.modalidad_contrato !== 'honorarios' && !plantillas.length && <div className="alert alert-warning">No hay una plantilla publicada de contrato laboral. Publica una en el Constructor de Documentos; no se continuará con esta renovación.</div>}
      {plantillas.length > 0 && <div style={{ display: 'grid', gap: 12 }}>
        <label className="input-group">Plantilla publicada<select className="select" value={plantillaId} onChange={e => setPlantillaId(e.target.value)}>{plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre_interno} · v{p.version}</option>)}</select></label>
        <div className="grid-2"><label className="input-group">Fecha de inicio<input className="input" type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} /></label><label className="input-group">Fecha de fin<input className="input" type="date" min={fechaInicio} value={fechaFin} onChange={e => setFechaFin(e.target.value)} /></label></div>
        <label className="input-group">Cargo<input className="input" value={cargo} onChange={e => setCargo(e.target.value)} /></label>
        <div className="grid-2"><label className="input-group">Remuneración base<input className="input" type="number" min="0" value={remuneracion} onChange={e => setRemuneracion(e.target.value)} /></label><label className="input-group">Forma de trabajo<select className="select" value={formaTrabajo} onChange={e => setFormaTrabajo(e.target.value)}><option>Presencial</option><option>Remota</option><option>Mixta</option></select></label></div>
        {persona?.modalidad_contrato !== 'honorarios' && <><label className="input-group">Modalidad del contrato<select required className="select" value={modalidadLegal} onChange={e => setModalidadLegal(e.target.value)}><option value="">Selecciona una modalidad</option>{MODALIDADES_LEGALES.map(m => <option key={m}>{m}</option>)}</select></label>{modalidadLegal !== 'Indefinido' && <label className="input-group">Causa objetiva<textarea required className="input" rows={3} value={causaObjetiva} onChange={e => setCausaObjetiva(e.target.value)} placeholder="Describe la razón concreta y verificable de la contratación temporal." /></label>}</>}
        <label className="input-group">Firmante de la empresa<select required className="select" value={firmanteId} onChange={e => setFirmanteId(e.target.value)}><option value="">Selecciona un firmante</option>{firmantes.map(f => <option key={f.id} value={f.id}>{f.nombre} · {f.cargo}</option>)}</select></label>
        {!firmantes.length && <div className="alert alert-warning">No hay firmantes activos disponibles para esta sociedad. {Boolean(role?.es_admin_empresa || role?.permisos?.todo) && <button className="btn btn-secondary btn-sm" onClick={() => setMostrarFirmantes(true)}>Abrir Firmantes de contratos</button>}</div>}
        <div><strong>Enviar enlace por</strong>{['whatsapp', 'email'].map(ch => <label key={ch} style={{ display: 'flex', gap: 8, marginTop: 8 }}><input type="checkbox" checked={canales[ch]} onChange={e => setCanales(s => ({ ...s, [ch]: e.target.checked }))} />{ch === 'email' ? 'Correo electrónico' : 'WhatsApp'}</label>)}</div>
        {(() => {
          const direccionEmpleador = sociedad?.direccion_fiscal || direccionEmpresa || empresa?.direccion || empresa?.direccion_fiscal || '';
          const vacios = [
            !persona?.direccion && 'domicilio del trabajador',
            !direccionEmpleador && 'domicilio del empleador',
            !(persona?.documento || persona?.dni || persona?.numero_documento) && 'documento de identidad',
            !cargo && 'cargo', !firmanteId && 'firmante',
            persona?.modalidad_contrato !== 'honorarios' && modalidadLegal && modalidadLegal !== 'Indefinido' && !causaObjetiva.trim() && 'causa objetiva',
          ].filter(Boolean);
          return vacios.length ? <div className="alert alert-warning">Faltan estos datos: {vacios.join(', ')}. El contrato saldrá con esos espacios vacíos.</div> : null;
        })()}
      </div>}
      {cargando && <p>Cargando plantillas publicadas…</p>}
      {error && <div className="alert alert-danger" style={{ marginTop: 12 }}>{error}</div>}
      </div>
      <div className="modal-foot"><div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><button className="btn btn-ghost" onClick={onClose}>Cerrar</button><button className="btn btn-primary" disabled={cargando || !plantillas.length || guardando || !fechaFin || fechaFin < fechaInicio || !firmanteId || (persona?.modalidad_contrato !== 'honorarios' && (!modalidadLegal || (modalidadLegal !== 'Indefinido' && !causaObjetiva.trim()))) || !Object.values(canales).some(Boolean)} onClick={guardar}>{guardando ? 'Generando…' : 'Crear renovación'}</button></div></div>
    </section>
    {mostrarFirmantes && <FirmantesContratoModal onClose={async () => { setMostrarFirmantes(false); try { const rows = await contratoFirmaService.listarFirmantesActivos(empresa.id); const disponibles = rows.filter(f => !f.sociedad_id || f.sociedad_id === (documento?.sociedad_id || null)); setFirmantes(disponibles); setFirmanteId(disponibles[0]?.id || ''); } catch {} }} />}
  </div>;
}
