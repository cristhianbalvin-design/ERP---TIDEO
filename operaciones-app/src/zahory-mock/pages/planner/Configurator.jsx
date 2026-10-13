import { useMemo, useState } from 'react';
import { EditarTallerModal } from './EditarTallerModal.jsx';
import { CatalogoMaquinas } from './CatalogoMaquinas.jsx';
import { DistribucionTaller } from './DistribucionTaller.jsx';

const CATEGORIAS = {
  general: 'General',
  pesada: 'Reparación pesada',
  sold: 'Soldadura',
  crom: 'Tratamientos',
  mec: 'Mecanizado',
  hidr: 'Hidráulica / banco',
};

export function Configurator({ datos, onSave, busy }) {
  const [bahia, setBahia] = useState({ codigo: '', nombre: '', categoria: 'general' });
  const [puesto, setPuesto] = useState({ bahia_id: '', codigo: '', nombre: '', capacidad: 1 });
  const [editBahia, setEditBahia] = useState(null);
  const [editPuesto, setEditPuesto] = useState(null);
  const [catalogo, setCatalogo] = useState(false);
  const [query, setQuery] = useState('');
  const [familia, setFamilia] = useState('todas');
  const [ubicacion, setUbicacion] = useState('');
  const [seleccion, setSeleccion] = useState(null);
  const puestos = useMemo(() => datos.puestos.map(item => ({
    ...item,
    bahia: datos.bahias.find(bahiaActual => bahiaActual.id === item.bahia_id),
  })), [datos]);

  function submit(event, action) {
    event.preventDefault();
    action();
  }

  function limpiarEdicion() {
    setEditBahia(null);
    setEditPuesto(null);
    setSeleccion(null);
  }

  function seleccionarMaquina(maquina) {
    setSeleccion(maquina);
    setUbicacion(`${maquina.bahia_id || ''}|${maquina.puesto_id || ''}`);
  }

  function seleccionarTipo(tipo) {
    if (seleccion?.id) {
      setSeleccion({ ...seleccion, tipo_clave: tipo.clave, nombre: tipo.nombre });
      setCatalogo(false);
      return;
    }
    const [bahiaId, puestoId] = ubicacion.split('|');
    onSave('maquina', { tipo, bahiaId, puestoId: puestoId || null, nombre: tipo.nombre });
    setCatalogo(false);
  }

  return (
    <div className="dx-planner-config">
      <FormularioTaller
        datos={datos}
        puestos={puestos}
        bahia={bahia}
        puesto={puesto}
        busy={busy}
        onSubmit={submit}
        onSave={onSave}
        onChangeBahia={setBahia}
        onChangePuesto={setPuesto}
        onOpenCatalog={() => {
          setUbicacion(`${datos.bahias[0]?.id || ''}|`);
          setCatalogo(true);
        }}
      />
      <DistribucionTaller
        datos={datos}
        puestos={puestos}
        onEditBahia={setEditBahia}
        onEditPuesto={setEditPuesto}
        onEditMaquina={seleccionarMaquina}
        onSave={onSave}
      />
      {(editBahia || editPuesto || seleccion) && (
        <EditarTallerModal
          datos={datos}
          puestos={puestos}
          editBahia={editBahia}
          editPuesto={editPuesto}
          seleccion={seleccion}
          ubicacion={ubicacion}
          busy={busy}
          onSetBahia={setEditBahia}
          onSetPuesto={setEditPuesto}
          onSetSeleccion={setSeleccion}
          onSetUbicacion={setUbicacion}
          onSave={onSave}
          onClose={limpiarEdicion}
          onOpenCatalog={() => setCatalogo(true)}
        />
      )}
      {catalogo && (
        <CatalogoMaquinas
          datos={datos}
          puestos={puestos}
          query={query}
          familia={familia}
          ubicacion={ubicacion}
          onSetQuery={setQuery}
          onSetFamilia={setFamilia}
          onSetUbicacion={setUbicacion}
          onChoose={seleccionarTipo}
          onClose={() => setCatalogo(false)}
        />
      )}
    </div>
  );
}

function FormularioTaller({
  datos,
  puestos,
  bahia,
  puesto,
  busy,
  onSubmit,
  onSave,
  onChangeBahia,
  onChangePuesto,
  onOpenCatalog,
}) {
  return (
    <section className="dx-ui-card">
      <div className="dx-ui-toolbar">
        <h2>Configurador de taller</h2>
        <span className="dx-ui-count">Bahías, puestos y máquinas</span>
      </div>
      <div className="dx-planner-config-body">
        <form onSubmit={event => onSubmit(event, () => {
          onSave('bahia', { ...bahia, orden: datos.bahias.length });
          onChangeBahia({ codigo: '', nombre: '', categoria: 'general' });
        })}>
          <h3>Nueva bahía</h3>
          <label>Código<input required value={bahia.codigo} onChange={event => (
            onChangeBahia({ ...bahia, codigo: event.target.value })
          )} /></label>
          <label>Nombre<input required value={bahia.nombre} onChange={event => (
            onChangeBahia({ ...bahia, nombre: event.target.value })
          )} /></label>
          <label>
            Categoría
            <select value={bahia.categoria} onChange={event => (
              onChangeBahia({ ...bahia, categoria: event.target.value })
            )}>
              {Object.entries(CATEGORIAS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>
          <button className="dx-btn primary" disabled={busy}>Agregar bahía</button>
        </form>
        <FormularioPuesto
          datos={datos}
          puestos={puestos}
          puesto={puesto}
          busy={busy}
          onSubmit={onSubmit}
          onSave={onSave}
          onChange={onChangePuesto}
        />
        <div className="dx-planner-catalog-launch">
          <h3>Máquinas del taller</h3>
          <p>Catálogo de tipos y ubicaciones actuales.</p>
          <button
            className="dx-btn primary"
            disabled={!datos.tipos?.length || !datos.bahias.length}
            onClick={onOpenCatalog}
          >
            Abrir catálogo · {datos.tipos?.length || 0} tipos
          </button>
        </div>
      </div>
    </section>
  );
}

function FormularioPuesto({ datos, puestos, puesto, busy, onSubmit, onSave, onChange }) {
  return (
    <form onSubmit={event => onSubmit(event, () => {
      onSave('puesto', {
        ...puesto,
        capacidad: Number(puesto.capacidad),
        orden: puestos.length,
      });
      onChange({ ...puesto, codigo: '', nombre: '' });
    })}>
      <h3>Nuevo puesto</h3>
      <label>
        Bahía
        <select required value={puesto.bahia_id} onChange={event => (
          onChange({ ...puesto, bahia_id: event.target.value })
        )}>
          <option value="">Elige bahía</option>
          {datos.bahias.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
        </select>
      </label>
      <label>Código<input required value={puesto.codigo} onChange={event => (
        onChange({ ...puesto, codigo: event.target.value })
      )} /></label>
      <label>Nombre<input value={puesto.nombre} onChange={event => (
        onChange({ ...puesto, nombre: event.target.value })
      )} /></label>
      <label>Capacidad (1–6)<input
        type="number"
        min="1"
        max="6"
        value={puesto.capacidad}
        onChange={event => onChange({ ...puesto, capacidad: event.target.value })}
      /></label>
      <button className="dx-btn primary" disabled={busy}>Agregar puesto</button>
    </form>
  );
}
