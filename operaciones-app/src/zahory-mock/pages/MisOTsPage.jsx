import { useEffect, useState } from 'react';
import { Icon, FooterBrand } from '../components/shell.jsx';
import { getSupabaseClient } from '../../lib/supabaseClient.js';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';

const ESTADOS_OT_ASIGNADAS = ['programada', 'ejecucion'];

const etiquetaEstado = (estado) => ({
  programada: 'Programada',
  ejecucion: 'En ejecución',
}[estado] || estado || 'Sin estado');

export default function MisOTsPage({ onNavigate }) {
  const sesionOperativa = useSesionOperativa();
  const [tecnico, setTecnico] = useState(null);
  const [ots, setOts] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [sinPerfilOperativo, setSinPerfilOperativo] = useState(false);

  useEffect(() => {
    let vigente = true;

    const cargarMisOTs = async () => {
      if (
        sesionOperativa.cargando
        || sesionOperativa.estado !== 'listo'
        || !sesionOperativa.empresaId
        || !sesionOperativa.usuario?.id
      ) {
        if (vigente && !sesionOperativa.cargando) {
          setTecnico(null);
          setOts([]);
          setSinPerfilOperativo(false);
          setCargando(false);
        }
        return;
      }

      setCargando(true);
      setError('');
      setSinPerfilOperativo(false);

      try {
        const { data: perfil, error: perfilError } = await getSupabaseClient()
          .from('personal_operativo')
          .select('id,nombre,especialidad,supervisor,auth_user_id')
          .eq('empresa_id', sesionOperativa.empresaId)
          .eq('auth_user_id', sesionOperativa.usuario.id)
          .maybeSingle();

        if (perfilError) throw perfilError;
        if (!perfil) {
          if (vigente) {
            setTecnico(null);
            setOts([]);
            setSinPerfilOperativo(true);
          }
          return;
        }

        let consulta = getSupabaseClient()
          .from('ordenes_trabajo')
          .select('id,numero,descripcion,servicio,estado,avance_pct,fecha_programada,sociedad_id')
          .eq('empresa_id', sesionOperativa.empresaId)
          .eq('tecnico_responsable_id', perfil.id)
          .in('estado', ESTADOS_OT_ASIGNADAS)
          .order('fecha_programada', { ascending: true, nullsFirst: false })
          .order('numero');

        if (sesionOperativa.sociedadId && !sesionOperativa.vistaConsolidada) {
          consulta = consulta.eq('sociedad_id', sesionOperativa.sociedadId);
        } else if (
          sesionOperativa.vistaConsolidada
          && Array.isArray(sesionOperativa.sociedadesIdsAlcance)
          && sesionOperativa.sociedadesIdsAlcance.length
        ) {
          consulta = consulta.in('sociedad_id', sesionOperativa.sociedadesIdsAlcance);
        }

        const { data, error: otsError } = await consulta;
        if (otsError) throw otsError;

        if (vigente) {
          setTecnico(perfil);
          setOts(data || []);
        }
      } catch (cargaError) {
        if (vigente) {
          setTecnico(null);
          setOts([]);
          setError(cargaError?.message || 'No se pudieron cargar tus OTs asignadas.');
        }
      } finally {
        if (vigente) setCargando(false);
      }
    };

    cargarMisOTs();
    return () => { vigente = false; };
  }, [
    sesionOperativa.cargando,
    sesionOperativa.estado,
    sesionOperativa.empresaId,
    sesionOperativa.usuario?.id,
    sesionOperativa.sociedadId,
    sesionOperativa.vistaConsolidada,
    sesionOperativa.sociedadesIdsAlcance,
  ]);

  const puedeRegistrarParte = sesionOperativa.permiteEscritura;
  const sesionNoDisponible = !sesionOperativa.cargando && sesionOperativa.estado !== 'listo';

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">Operaciones <span>/</span> Mis OTs del día</div>
          <h1>Mis OTs del día</h1>
          <p>{tecnico?.nombre || 'Órdenes de trabajo asignadas al técnico de la sesión actual.'}</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => onNavigate('taller')}>
            <Icon name="report" size={15} /> Registrar parte sin OT preseleccionada
          </button>
        </div>
      </div>

      <div className="content-grid one-col">
        {tecnico && (
          <div className="card" style={{ padding: '14px 18px', display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
            <div><span className="eyebrow">Técnico</span><strong>{tecnico.nombre}</strong></div>
            {tecnico.especialidad && <div><span className="eyebrow">Especialidad</span><span>{tecnico.especialidad}</span></div>}
            {tecnico.supervisor && <div><span className="eyebrow">Supervisor</span><span>{tecnico.supervisor}</span></div>}
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <div><h2>OTs asignadas</h2><span>{ots.length} activas</span></div>
          </div>

          {cargando && <div className="empty-state">Cargando tus OTs asignadas…</div>}
          {!cargando && sesionNoDisponible && <div className="empty-state">Inicia sesión operativa para consultar tus OTs asignadas.</div>}
          {!cargando && !sesionNoDisponible && error && <div className="empty-state danger">{error}</div>}
          {!cargando && !sesionNoDisponible && !error && sinPerfilOperativo && (
            <div className="empty-state">No se encontró un perfil de personal operativo vinculado a tu sesión.</div>
          )}
          {!cargando && !sesionNoDisponible && !error && !sinPerfilOperativo && ots.length === 0 && (
            <div className="empty-state">No tienes OTs asignadas para hoy.</div>
          )}
          {!cargando && !error && !sinPerfilOperativo && ots.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>OT</th><th>Servicio</th><th>Estado</th><th>Avance</th><th>Programada</th><th /></tr></thead>
                <tbody>
                  {ots.map(ot => (
                    <tr key={ot.id}>
                      <td><strong>{ot.numero || ot.id}</strong></td>
                      <td>{ot.servicio || ot.descripcion || 'Sin descripción'}</td>
                      <td><span className={`badge ${ot.estado === 'ejecucion' ? 'cyan' : 'slate'}`}>{etiquetaEstado(ot.estado)}</span></td>
                      <td>{Number(ot.avance_pct || 0)}%</td>
                      <td>{ot.fecha_programada ? new Date(`${ot.fecha_programada}T00:00:00`).toLocaleDateString('es-PE') : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={!puedeRegistrarParte}
                          title={puedeRegistrarParte ? 'Registrar parte para esta OT' : 'No tienes permiso de escritura en Operaciones'}
                          onClick={() => onNavigate('taller', { ot: ot.id })}
                        >
                          <Icon name="report" size={14} /> Registrar parte
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <FooterBrand />
    </>
  );
}
