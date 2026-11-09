import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context.jsx';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';
import {
  cargarCatalogosCxcMasivo,
  descargarPlantillaCxcMasiva,
  ejecutarImportacionCxcMasiva,
  leerPlantillaCxcMasiva,
  validarFilasCxcMasiva,
} from '../services/cxcMassiveImportService.js';
import './CargaMasivaCxC.css';

export default function CargaMasivaCxC({ onClose }) {
  const { empresa, setFacturas, setCxc, setCobrosHistorial, setCuentas, setOsClientes } = useApp();
  const [filas, setFilas] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const ref = useRef(null);
  const dialogo = useRef(null);
  const [archivo, setArchivo] = useState('');
  const [fase, setFase] = useState('inicial');
  useEffect(() => {
    const anterior = document.activeElement;
    return () => anterior?.focus();
  }, []);
  useEffect(() => {
    dialogo.current?.focus();
  }, [fase]);
  useEffect(() => {
    const key = e => {
      if (e.key === 'Escape' && !ocupado) onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose, ocupado]);
  const conectar = async () => {
    if (!isSupabaseConfigured() || !empresa?.id) throw new Error('La carga masiva requiere conexión al tenant.');
    return getSupabaseClient();
  };
  const descargar = async () => {
    try {
      setError('');
      await descargarPlantillaCxcMasiva(await conectar(), empresa.id, empresa.nombre || empresa.razon_social || '');
    } catch (e) {
      setError(e.message);
    }
  };
  const leer = async file => {
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) {
      setError('Selecciona un archivo .xlsx o .xls.');
      return;
    }
    setOcupado(true);
    setError('');
    setResultado(null);
    setConfirmado(false);
    try {
      const sb = await conectar();
      const [rows, catalogos] = await Promise.all([
        leerPlantillaCxcMasiva(file),
        cargarCatalogosCxcMasivo(sb, empresa.id),
      ]);
      setFilas(validarFilasCxcMasiva(rows, catalogos, {
        multisociedadHabilitada: Boolean(empresa.multisociedad_habilitado),
      }));
      setArchivo(file.name);
      setFase('preview');
    } catch (err) {
      setFilas([]);
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  };
  const importar = async () => {
    setOcupado(true);
    setError('');
    try {
      const r = await ejecutarImportacionCxcMasiva({
        filas,
        empresaId: empresa.id,
        supabase: await conectar(),
        confirmarNumerosRepetidos: confirmado,
      });
      setFilas(r.filas);
      setResultado(r);
      setFase('resultado');
      if (r.registros.length) {
        setFacturas(prev => [...r.registros.map(item => item.factura), ...prev]);
        setCxc(prev => [...r.registros.map(item => item.cxc), ...prev]);
        const cobros = r.registros.map(item => item.cobro).filter(Boolean);
        if (cobros.length) setCobrosHistorial(prev => [...cobros, ...prev]);
        const clientes = r.registros.filter(item => item.cuenta_creada).map((item, index) => {
          const fila = r.filas.find(row => row._resultado?.factura?.id === item.factura?.id);
          return {
            id: item.cuenta_id,
            empresa_id: empresa.id,
            ruc: fila?.ruc_cliente || '',
            razon_social: fila?.razon_social || '',
            nombre_comercial: fila?.razon_social || `Cliente importado ${index + 1}`,
            estado: 'activo',
          };
        });
        if (clientes.length) {
          setCuentas(prev => [...clientes.filter(cliente => !prev.some(c => c.id === cliente.id)), ...prev]);
        }
        setOsClientes(prev => prev.map(os => r.filas.reduce((actual, row) => (
          row._estado === 'CREADA' && row.os_cliente_codigo === os.numero ? {
            ...actual,
            saldo_por_facturar: Math.max(0, Number(actual.saldo_por_facturar || 0) - Number(row.monto_total || 0)),
            monto_facturado: Number(actual.monto_facturado || 0) + Number(row.monto_total || 0),
          } : actual
        ), os)));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };
  const validas = filas.filter(f => f._estado === 'VALIDA').length;
  const advertencias = filas.filter(f => f._estado === 'VALIDA' && f._advertencias?.length).length;
  const listas = validas - advertencias;
  const rechazadas = filas.filter(f => f._estado === 'RECHAZADA' || f._errores?.length).length;
  const titulo = fase === 'inicial' ? 'Carga masiva de facturas'
    : fase === 'preview' ? 'Revisa antes de importar' : 'Carga terminada';
  const kpi = (valor, etiqueta) => (
    <div className="dx-ui-kpi"><strong>{valor}</strong><span>{etiqueta}</span></div>
  );
  return (
    <div className="dx-ui dx-carga">
      <div className="dx-ui-overlay" onClick={e => {
        if (e.target === e.currentTarget && fase === 'inicial' && !ocupado) onClose();
      }}>
        <div className="dx-ui-dialog dx-ui-dialog-wide" role="dialog" aria-modal="true"
          aria-labelledby="carga-titulo" tabIndex={-1} ref={dialogo}>
          <div className="dx-ui-dialog-head">
            <div>
              <h2 id="carga-titulo">{titulo}</h2>
              <p>{fase === 'inicial' ? 'Cada fila del Excel crea la factura y su cuenta por cobrar.'
                : fase === 'preview' ? `${archivo} · ${filas.length} filas leídas` : archivo}</p>
            </div>
            <button className="dx-carga-x" onClick={onClose} disabled={ocupado} aria-label="Cerrar">×</button>
          </div>
          {fase === 'inicial' && <>
            <div className="dx-carga-note">
              <b>Solo facturas con saldo pendiente.</b> Se aceptan facturas y boletas por cobrar o con cobro parcial.
              Las facturas ya cobradas al 100 % no se cargan aquí. Si el número ya existe para el mismo cliente y
              sociedad, la fila se rechaza: nunca se crea una segunda cuenta por cobrar.
            </div>
            <div className="dx-carga-steps">
              <div>
                <h3>1 · Descarga la plantilla</h3>
                <p>Completa la plantilla con los datos de tus facturas.</p>
                <button className="dx-btn" onClick={descargar} disabled={ocupado}>Descargar plantilla .xlsx</button>
              </div>
              <div>
                <h3>2 · Sube el archivo completado</h3>
                <input ref={ref} type="file" accept=".xlsx,.xls" hidden onChange={e => {
                  leer(e.target.files?.[0]);
                  e.target.value = '';
                }} />
                <button className="dx-carga-drop" disabled={ocupado} onClick={() => ref.current?.click()}
                  onDragOver={e => e.preventDefault()} onDrop={e => {
                    e.preventDefault();
                    if (!ocupado) leer(e.dataTransfer.files?.[0]);
                  }}>
                  <span aria-hidden="true">⇪</span>
                  <b>Arrastra el archivo o haz clic para elegirlo</b>
                  <span>Excel .xlsx o .xls · hoja «CxC»</span>
                </button>
              </div>
            </div>
          </>}
          {fase === 'preview' && <>
            <div className="dx-carga-summary">
              {kpi(listas, listas === 1 ? 'Lista para importar' : 'Listas para importar')}
              {kpi(advertencias, 'Con advertencia')}
              {kpi(rechazadas, rechazadas === 1 ? 'Rechazada' : 'Rechazadas')}
            </div>
            <div className="dx-carga-preview">
              <div className="dx-ui-head dx-carga-cols">
                <span>#</span><span>Número</span><span>Cliente</span><span>Total</span><span>Resultado</span>
              </div>
              {filas.map(row => {
                const errores = (row._errores || []).join(' · ');
                const avisos = (row._advertencias || []).join(' · ');
                const total = Number(row.monto_total || 0).toLocaleString('en-US', {
                  minimumFractionDigits: 2, maximumFractionDigits: 2,
                });
                return <div className="dx-ui-row dx-carga-cols" key={row._fila}>
                  <span>{row._fila}</span><strong>{row.numero}</strong><span>{row.razon_social}</span>
                  <span>{row.moneda === 'USD' ? 'US$' : 'S/'} {total}</span>
                  {errores || row._estado === 'RECHAZADA'
                    ? <span className="dx-carga-error-text">{errores || 'Rechazada'}</span>
                    : avisos ? <span className="dx-carga-warning-text">{avisos}</span>
                      : <span className="dx-ui-pill is-green">Lista</span>}
                </div>;
              })}
            </div>
            {advertencias > 0 && <label className="dx-carga-confirm">
              <input type="checkbox" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} />
              Confirmo la importación de filas con advertencias.
            </label>}
          </>}
          {fase === 'resultado' && resultado && <>
            <div className="dx-carga-summary">
              {kpi(resultado.creadas, resultado.creadas === 1
                ? 'Factura creada, con su CxC' : 'Facturas creadas, cada una con su CxC')}
              {kpi(resultado.clientesCreados, resultado.clientesCreados === 1 ? 'Cliente nuevo' : 'Clientes nuevos')}
              {kpi(resultado.rechazadas + resultado.fallidas, resultado.rechazadas + resultado.fallidas === 1
                ? 'Rechazada o fallida' : 'Rechazadas o fallidas')}
            </div>
            {resultado.cobrosRegistrados > 0 && <p className="dx-carga-cobros">
              {resultado.cobrosRegistrados} {resultado.cobrosRegistrados === 1
                ? 'cobro registrado' : 'cobros registrados'}
            </p>}
          </>}
          <div className="dx-ui-dialog-foot">
            {error && <p className="dx-carga-error" role="alert">{error}</p>}
            {fase === 'inicial' && <button className="dx-btn" onClick={onClose} disabled={ocupado}>Cancelar</button>}
            {fase === 'preview' && <>
              <button className="dx-btn" disabled={ocupado} onClick={() => {
                setFase('inicial');
                setError('');
                setFilas([]);
                setConfirmado(false);
              }}>Elegir otro archivo</button>
              <button className="dx-btn primary" onClick={importar}
                disabled={ocupado || !validas || (advertencias > 0 && !confirmado)}>
                {ocupado ? 'Procesando…' : `Importar ${validas} facturas`}
              </button>
            </>}
            {fase === 'resultado' && <button className="dx-btn primary" onClick={onClose}>Cerrar</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
