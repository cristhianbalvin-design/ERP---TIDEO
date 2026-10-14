import React, { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import { renderTextoDocumental } from '../lib/variablesDocumentales.js';
import { ajustarRunsPdf, construirContextoRenovacion, extraerParrafosTipTap } from '../../supabase/functions/_shared/contratoFirma.js';
import { contratoFirmaService } from '../contratoFirmaService.js';
import * as personalDocumentosService from '../services/personalDocumentosService.js';

export default function RenovacionFirmaDigitalModal({ empresa, persona, documento, onClose, onComplete }) {
  const [plantillas, setPlantillas] = useState([]);
  const [plantillaId, setPlantillaId] = useState('');
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().slice(0, 10));
  const [fechaFin, setFechaFin] = useState(documento?.fecha_vencimiento || '');
  const [cargo, setCargo] = useState(documento?.condiciones_laborales?.cargo_nombre || documento?.condiciones_laborales?.cargo || persona?.cargo || '');
  const [remuneracion, setRemuneracion] = useState(documento?.condiciones_laborales?.remuneracion_base ?? persona?.sueldo_base ?? '');
  const [modalidad, setModalidad] = useState(documento?.condiciones_laborales?.modalidad || persona?.modalidad_contrato || persona?.tipo_contrato || '');
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
          .select('id,nombre_interno,version,tipo_documento_id,sociedad_id,encabezado_texto_plano,pie_texto_plano,tipos_documento_electronico!inner(id,nombre,codigo,categoria_base)')
          .eq('empresa_id', empresa.id).eq('estado', 'publicada').eq('tipos_documento_electronico.categoria_base', 'contrato_laboral').order('version', { ascending: false });
        if (queryError) throw queryError;
        const rows = data || [];
        if (active) { setPlantillas(rows); setPlantillaId(rows[0]?.id || ''); }
      } catch (e) { if (active) setError(e.message || 'No se pudieron cargar las plantillas publicadas.'); }
      finally { if (active) setCargando(false); }
    })();
    return () => { active = false; };
  }, [empresa?.id]);

  const generarPdf = async (plantilla, snapshot) => {
    const sb = await getSupabaseClient();
    const { data: blocks, error: blocksError } = await sb.from('documento_bloques').select('tipo_bloque,titulo,contenido_json,contenido_texto_plano,orden,activo').eq('plantilla_documento_id', plantilla.id).eq('activo', true).order('orden');
    if (blocksError) throw blocksError;
    const ctx = construirContextoRenovacion({ empresa, persona, documento, snapshot, fechaInicio, fechaFin });
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
    if (!fechaInicio || (!documento?.es_indefinido && !fechaFin)) { setError('Completa las fechas del nuevo período contractual.'); return; }
    setGuardando(true); setError('');
    let created = null;
    try {
      const plantilla = plantillas.find(p => p.id === plantillaId);
      const snapshot = { ...(documento?.condiciones_laborales || {}), cargo, cargo_nombre: cargo, remuneracion_base: Number(remuneracion) || 0, modalidad, tipo_contrato: documento?.condiciones_laborales?.tipo_contrato || persona.tipo_contrato, fecha_inicio: fechaInicio, fecha_fin: fechaFin };
      const file = await generarPdf(plantilla, snapshot);
      created = await personalDocumentosService.nuevoContrato({ empresaId: empresa.id, personalId: persona.id, personalTipo: documento.personal_tipo || 'administrativo', tipoDoc: documento.tipo_doc, tipoDocumentoId: documento.tipo_documento_id || plantilla.tipo_documento_id, file, fechaEmision: fechaInicio, fechaVencimiento: documento.es_indefinido ? null : fechaFin, notas: 'Renovación generada con plantilla documental publicada.', condicionesLaborales: snapshot, periodoIdAnterior: documento.contrato_periodo_id || documento.periodo_id || null, esIndefinido: Boolean(documento.es_indefinido), sociedadId: documento.sociedad_id || plantilla.sociedad_id || null });
      const channels = Object.entries(canales).filter(([, enabled]) => enabled).map(([name]) => name);
      let envio;
      try { envio = await contratoFirmaService.crearSolicitud({ documentoId: created.id, empresaId: empresa.id, canales: channels }); }
      catch (e) {
        const aviso = `La renovación se creó pero el envío del enlace falló: ${e.message || 'error desconocido'}. Usa «Enviar a firma digital» en el contrato.`;
        await onComplete?.(created, { ok: false, aviso, error: e.message || 'No se pudo enviar el enlace.' });
        onClose();
        return;
      }
      await onComplete?.(created, envio);
      onClose();
    } catch (e) { setError(e.message || 'No se pudo crear y enviar la renovación.'); }
    finally { setGuardando(false); }
  };

  return <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.48)', display: 'grid', placeItems: 'center', padding: 14 }}>
    <section role="dialog" aria-modal="true" aria-labelledby="renovacion-firma-title" style={{ width: 'min(620px,100%)', maxHeight: '90vh', overflow: 'auto', background: 'var(--bg-panel)', color: 'var(--fg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
      <h2 id="renovacion-firma-title" style={{ marginTop: 0 }}>Renovar con firma digital</h2>
      {!cargando && !plantillas.length && <div className="alert alert-warning">No hay una plantilla publicada de categoría contrato laboral. Publica una en el Constructor de Documentos; no se continuará con esta renovación.</div>}
      {plantillas.length > 0 && <div style={{ display: 'grid', gap: 12 }}>
        <label className="input-group">Plantilla publicada<select className="select" value={plantillaId} onChange={e => setPlantillaId(e.target.value)}>{plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre_interno} · v{p.version}</option>)}</select></label>
        <div className="grid-2"><label className="input-group">Fecha de inicio<input className="input" type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} /></label><label className="input-group">Fecha de fin<input className="input" type="date" min={fechaInicio} value={fechaFin} onChange={e => setFechaFin(e.target.value)} /></label></div>
        <label className="input-group">Cargo<input className="input" value={cargo} onChange={e => setCargo(e.target.value)} /></label>
        <div className="grid-2"><label className="input-group">Remuneración base<input className="input" type="number" min="0" value={remuneracion} onChange={e => setRemuneracion(e.target.value)} /></label><label className="input-group">Modalidad<input className="input" value={modalidad} onChange={e => setModalidad(e.target.value)} /></label></div>
        <div><strong>Enviar enlace por</strong>{['whatsapp', 'email'].map(ch => <label key={ch} style={{ display: 'flex', gap: 8, marginTop: 8 }}><input type="checkbox" checked={canales[ch]} onChange={e => setCanales(s => ({ ...s, [ch]: e.target.checked }))} />{ch === 'email' ? 'Correo electrónico' : 'WhatsApp'}</label>)}</div>
      </div>}
      {cargando && <p>Cargando plantillas publicadas…</p>}
      {error && <div className="alert alert-danger" style={{ marginTop: 12 }}>{error}</div>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 18 }}><button className="btn btn-ghost" onClick={onClose}>Cerrar</button><button className="btn btn-primary" disabled={cargando || !plantillas.length || guardando || !Object.values(canales).some(Boolean)} onClick={guardar}>{guardando ? 'Generando y enviando…' : 'Crear renovación y enviar enlace'}</button></div>
    </section>
  </div>;
}
