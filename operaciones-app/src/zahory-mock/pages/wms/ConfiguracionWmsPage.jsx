import { useEffect, useMemo, useState } from 'react';
import { guardarConfiguracionWms } from '../../../services/wmsMultipropositoService.js';
import { AvisoSoloLectura, Encabezado, PaginaPrevia } from './WmsComun.jsx';
import { invalidarModulosWms } from './useModulosWms.js';
import { estadoPrevio, mensajeError, useWmsBase } from './useWmsBase.js';
import { MODULOS, MODULOS_PROXIMOS, PROPOSITOS } from './wmsMultiLogic.js';

export function ConfiguracionWmsPage() {
  const base = useWmsBase();
  const { empresaId, puede, almacenes, config, sesion, recargarBase } = base;
  const [modulos, setModulos] = useState(config.modulos);
  const [umbral, setUmbral] = useState(String(config.umbral_aprobacion_ajuste));
  const [propositos, setPropositos] = useState({});
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => { setModulos(config.modulos); setUmbral(String(config.umbral_aprobacion_ajuste)); }, [config]);
  useEffect(() => { setPropositos(Object.fromEntries(almacenes.map(a => [a.id, a.proposito || 'consumo_interno']))); }, [almacenes]);

  const cambios = useMemo(() => almacenes.filter(a => (propositos[a.id] || 'consumo_interno') !== (a.proposito || 'consumo_interno')), [almacenes, propositos]);
  const sucio = cambios.length > 0 || String(config.umbral_aprobacion_ajuste) !== umbral || MODULOS.some(m => Boolean(modulos[m.id]) !== Boolean(config.modulos[m.id]));
  const usados = new Set(Object.values(propositos));
  const advertencias = [
    (usados.has('venta') || usados.has('mixto')) && !modulos.venta ? 'Tienes almacenes de venta o mixtos pero el módulo de venta está apagado.' : '',
    usados.has('custodia') && !modulos.custodia ? 'Tienes almacenes de custodia pero el módulo de custodia está apagado.' : '',
    modulos.venta && !usados.has('venta') && !usados.has('mixto') ? 'Para vender necesitas al menos un almacén de venta o mixto.' : '',
    modulos.custodia && !usados.has('custodia') ? 'Para custodia necesitas al menos un almacén con propósito «Custodia de terceros».' : '',
  ].filter(Boolean);

  const guardar = async () => {
    const valorUmbral = Number(String(umbral).replace(',', '.'));
    if (!(valorUmbral >= 0)) { setError('El umbral de aprobación debe ser cero o mayor.'); return; }
    setOcupado(true); setError(''); setAviso('');
    try {
      await guardarConfiguracionWms({
        empresa_id: empresaId, modulos, umbral: valorUmbral,
        almacenes: cambios.map(a => ({ id: a.id, proposito: propositos[a.id] })),
      });
      invalidarModulosWms(empresaId);
      setAviso('Configuración guardada. El menú de Almacén se actualiza al recargar la página.');
      recargarBase();
    } catch (e) { setError(mensajeError(e)); }
    finally { setOcupado(false); }
  };

  const previo = estadoPrevio(base, { clase: 'dx-wcfg', nombre: 'la configuración del almacén' });
  if (previo) return <PaginaPrevia previo={previo} onReintentar={recargarBase} />;

  return <section className="dx-ui dx-wms dx-wcfg">
    <Encabezado titulo="Configuración del WMS" sub="Define para qué usa cada almacén tu empresa: consumo propio, venta, ambos o guarda de mercadería de clientes.">
      {puede.editar && <button type="button" className="dx-btn primary" disabled={!sucio || ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar cambios'}</button>}
    </Encabezado>
    <AvisoSoloLectura sesion={sesion} />
    {!puede.editar && <div className="dx-w-note" role="status">Solo quien tiene permiso de edición de inventario puede cambiar esta configuración.</div>}
    {aviso && <div className="dx-w-note green" role="status">{aviso}</div>}
    {error && <div className="dx-w-note red" role="alert">{error}</div>}
    {advertencias.map(a => <div key={a} className="dx-w-note amber" role="status">{a}</div>)}
    <div className="dx-w-grid2">
      <div className="dx-ui-card"><div className="dx-w-sec">
        <h3>Módulos activos</h3><p className="sub">Enciende solo lo que tu empresa usa; el menú muestra lo activo.</p>
        {MODULOS.map(m => {
          const proximo = MODULOS_PROXIMOS.includes(m.id);
          return <div className="dx-w-mod" key={m.id}>
            <span><b id={`dx-wcfg-m-${m.id}`}>{m.label}{proximo && <> <span className="dx-ui-pill is-gray"><i />Próximamente</span></>}</b><small>{m.ayuda}</small></span>
            <button type="button" className={`dx-w-sw${modulos[m.id] ? ' on' : ''}`} role="switch" aria-checked={Boolean(modulos[m.id])} aria-labelledby={`dx-wcfg-m-${m.id}`} disabled={!puede.editar || proximo} onClick={() => setModulos({ ...modulos, [m.id]: !modulos[m.id] })} />
          </div>;
        })}
        <div className="dx-ui-field dx-w-gap"><label htmlFor="dx-wcfg-umbral">Umbral de aprobación de ajustes (S/)<span className="dx-ui-required" aria-hidden="true">*</span></label><input id="dx-wcfg-umbral" inputMode="decimal" disabled={!puede.editar} value={umbral} onChange={e => setUmbral(e.target.value)} /><small className="dx-ui-field-hint">Si las diferencias de un conteo superan este monto, otra persona debe aprobar los ajustes.</small></div>
      </div></div>

      <div className="dx-ui-card"><div className="dx-w-sec">
        <h3>Propósito de cada almacén</h3><p className="sub">Las OT solo reservan de almacenes de consumo interno o mixtos; las ventas, de almacenes de venta o mixtos.</p>
        {!almacenes.length ? <div className="dx-ui-empty">No hay almacenes activos.</div> : almacenes.map(a => {
          const prop = PROPOSITOS.find(p => p.id === propositos[a.id]) || PROPOSITOS[0];
          return <div className="dx-w-mod" key={a.id}>
            <span><b>{a.codigo} · {a.nombre}</b><small>{a.clase === 'periferico' ? 'Periférico · ' : ''}{prop.ayuda}</small></span>
            <select className="dx-ui-select" aria-label={`Propósito de ${a.codigo}`} disabled={!puede.editar} value={propositos[a.id] || 'consumo_interno'} onChange={e => setPropositos({ ...propositos, [a.id]: e.target.value })}>
              {PROPOSITOS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>;
        })}
      </div></div>
    </div>
  </section>;
}
