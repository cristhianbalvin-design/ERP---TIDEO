import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { I } from '../icons.jsx';
import {
  cargarReferenciasProveedorFamilia,
  prepararPreviewProveedorFamilia,
  confirmarImportacionProveedorFamilia,
} from '../services/proveedorFamiliaImportService.js';

const estadoBadge = {
  LISTO: 'badge-green',
  ERROR: 'badge-red',
  DUPLICADO: 'badge-orange',
};

const hoy = () => new Date().toISOString().slice(0, 10);

const descargarPlantilla = (referencias) => {
  const providerRows = referencias.proveedores.map(provider => ({
    codigo_proveedor: provider.codigo || provider.id,
    ruc: provider.ruc || '',
    razon_social: provider.razon_social || '',
    nombre_comercial: provider.nombre_comercial || '',
  }));
  const familyRows = referencias.familias.map(family => ({
    codigo_familia: family.codigo_familia,
    nombre_familia: family.nombre_familia,
    grupo: family.grupo,
  }));
  const exampleProvider = providerRows[0];
  const exampleFamily = familyRows[0];
  const instructions = [
    ['INSTRUCCIONES — EMPAREJAR PROVEEDORES Y FAMILIAS'],
    [''],
    ['1. Hoja Asignaciones', 'Llena solo las columnas ruc_proveedor y codigo_familia.'],
    ['2. ruc_proveedor', 'Copia exactamente el RUC de la hoja Proveedores del tenant.'],
    ['3. codigo_familia', 'Copia exactamente el codigo_familia de la hoja Familias del tenant. Es una referencia única grupo-familia, por ejemplo 03-01.'],
    ['4. Tenant', 'El archivo no debe incluir empresa_id. El sistema usa el tenant de la sesión autenticada.'],
    ['5. Proveedores y familias', 'Son hojas de referencia reales cargadas al momento de descargar esta plantilla.'],
    ['6. Validaciones', 'No se crean proveedores ni familias. Las referencias inexistentes quedan como ERROR.'],
    ['7. Duplicados', 'Una relación ya existente queda como DUPLICADO y no se reinserta. La segunda repetición dentro del archivo queda como ERROR.'],
    ['8. Ejemplo', 'La primera fila de Asignaciones es un ejemplo real. Reemplázala o elimínala antes de confirmar si no quieres asignarla.'],
    [''],
    ['Tenant de la descarga', referencias.empresaId],
    ['Fecha de descarga', hoy()],
  ];
  const assignmentRows = [{
    ruc_proveedor: exampleProvider?.ruc || '',
    codigo_familia: exampleFamily?.codigo_familia || '',
  }];

  const workbook = XLSX.utils.book_new();
  const sheetInstructions = XLSX.utils.aoa_to_sheet(instructions);
  const sheetProviders = XLSX.utils.json_to_sheet(providerRows);
  const sheetFamilies = XLSX.utils.json_to_sheet(familyRows);
  const sheetAssignments = XLSX.utils.json_to_sheet(assignmentRows, {
    header: ['ruc_proveedor', 'codigo_familia'],
  });
  sheetInstructions['!cols'] = [{ wch: 28 }, { wch: 105 }];
  sheetProviders['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 42 }, { wch: 34 }];
  sheetFamilies['!cols'] = [{ wch: 20 }, { wch: 38 }, { wch: 34 }];
  sheetAssignments['!cols'] = [{ wch: 20 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(workbook, sheetInstructions, 'Instrucciones');
  XLSX.utils.book_append_sheet(workbook, sheetProviders, 'Proveedores del tenant');
  XLSX.utils.book_append_sheet(workbook, sheetFamilies, 'Familias del tenant');
  XLSX.utils.book_append_sheet(workbook, sheetAssignments, 'Asignaciones');
  XLSX.writeFile(workbook, `plantilla_proveedor_familia_${hoy()}.xlsx`);
};

export function ImportarProveedorFamiliasModal({ empresaId, onClose, addNotificacion }) {
  const [referencias, setReferencias] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [items, setItems] = useState(null);
  const [archivo, setArchivo] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setErrorCarga('');
    cargarReferenciasProveedorFamilia(empresaId)
      .then(data => { if (activo) setReferencias(data); })
      .catch(error => { if (activo) setErrorCarga(error?.message || 'No se pudieron cargar las referencias del tenant.'); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [empresaId]);

  const counts = useMemo(() => {
    const rows = items || [];
    return {
      total: rows.length,
      listos: rows.filter(row => row.status === 'LISTO').length,
      errores: rows.filter(row => row.status === 'ERROR').length,
      duplicados: rows.filter(row => row.status === 'DUPLICADO').length,
    };
  }, [items]);

  const handleFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !referencias || procesando || resultado) return;
    setArchivo(file.name);
    setResultado(null);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheetName = workbook.SheetNames.find(name => name.trim().toLocaleLowerCase('es-PE') === 'asignaciones');
      if (!sheetName) throw new Error('El archivo debe contener una hoja llamada Asignaciones.');
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false });
      setItems(prepararPreviewProveedorFamilia(rows, referencias));
    } catch (error) {
      setItems([{ id: 'pf_file_error', fila: '-', ruc_proveedor: '', codigo_familia: '', status: 'ERROR', errorMsg: error?.message || 'No se pudo leer el archivo.' }]);
    }
  };

  const confirmar = async () => {
    if (!items?.some(item => item.status === 'LISTO') || procesando || resultado) return;
    setProcesando(true);
    try {
      const data = await confirmarImportacionProveedorFamilia(empresaId, items);
      setItems(data.filas);
      setResultado(data);
      addNotificacion?.(`${data.insertados} relaciones proveedor-familia insertadas.`, 'success');
    } catch (error) {
      const filas = items.map(item => item.status === 'LISTO'
        ? { ...item, status: 'ERROR', errorMsg: error?.message || 'No se pudo procesar esta fila.' }
        : { ...item });
      const data = {
        insertados: 0,
        duplicados: filas.filter(item => item.status === 'DUPLICADO').length,
        errores: filas.filter(item => item.status === 'ERROR').length,
        filas,
      };
      setItems(filas);
      setResultado(data);
      addNotificacion?.(`La importación terminó con errores: ${error?.message || error}`, 'error');
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 1200 }} onClick={onClose}>
      <div className="modal" style={{ maxWidth: 1180, width: '96vw' }} onClick={event => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Emparejar Proveedores y Familias</h2>
            <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
              Carga independiente para proveedor_familia · tenant de sesión: {empresaId || '—'}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} disabled={procesando}>{I.x}</button>
        </div>
        <div className="modal-body">
          {cargando && <p className="text-muted">Cargando proveedores, familias y relaciones existentes…</p>}
          {errorCarga && <div className="alert alert-danger">{errorCarga}</div>}
          {referencias && (
            <>
              <div className="card" style={{ padding: 14, marginBottom: 14 }}>
                <div className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>Referencias reales del tenant</strong>
                    <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {referencias.proveedores.length} proveedores · {referencias.familias.length} familias
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn btn-secondary" onClick={() => descargarPlantilla(referencias)} disabled={!referencias.proveedores.length || !referencias.familias.length}>
                      {I.download} Descargar plantilla
                    </button>
                    {resultado ? (
                      <button className="btn btn-secondary" type="button" disabled>{I.download} Lote procesado</button>
                    ) : (
                      <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                        {I.download} Importar Asignaciones
                        <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} disabled={procesando} />
                      </label>
                    )}
                  </div>
                </div>
                {archivo && <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>Archivo: {archivo}</div>}
              </div>

              {resultado && (
                <div className="alert alert-success" style={{ marginBottom: 14 }}>
                  Importación procesada: {resultado.insertados} insertadas · {resultado.duplicados} duplicadas · {resultado.errores} con error.
                </div>
              )}

              {items && (
                <>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    <span><strong>{counts.total}</strong> filas</span>
                    <span className="badge badge-green">{counts.listos} LISTO</span>
                    <span className="badge badge-red">{counts.errores} ERROR</span>
                    <span className="badge badge-orange">{counts.duplicados} DUPLICADO</span>
                  </div>
                  <div className="table-wrap" style={{ maxHeight: '52vh', overflowY: 'auto' }}>
                    <table className="tbl">
                      <thead>
                        <tr><th>Fila</th><th>Estado</th><th>RUC proveedor</th><th>Proveedor</th><th>Código familia</th><th>Familia</th><th>Grupo</th><th>Detalle</th></tr>
                      </thead>
                      <tbody>
                        {items.map(item => (
                          <tr key={item.id} style={{ background: item.status === 'ERROR' ? 'var(--danger-lt)' : item.status === 'DUPLICADO' ? 'var(--warning-lt)' : 'transparent' }}>
                            <td>{item.fila}</td>
                            <td><span className={`badge ${estadoBadge[item.status] || 'badge-gray'}`}>{item.status}</span></td>
                            <td className="mono">{item.ruc_proveedor || '—'}</td>
                            <td>{item.proveedor_nombre || '—'}</td>
                            <td className="mono">{item.codigo_familia || '—'}</td>
                            <td>{item.familia_nombre || '—'}</td>
                            <td>{item.grupo || '—'}</td>
                            <td style={{ color: item.status === 'ERROR' ? 'var(--danger)' : 'var(--fg-muted)' }}>{item.errorMsg || 'Lista para importar.'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={procesando}>{resultado ? 'Aceptar' : 'Cerrar'}</button>
          {items && !resultado && <button className="btn btn-primary" onClick={confirmar} disabled={procesando || counts.listos === 0}>
            {procesando ? 'Importando…' : `Confirmar ${counts.listos} filas LISTO`}
          </button>}
        </div>
      </div>
    </div>
  );
}
