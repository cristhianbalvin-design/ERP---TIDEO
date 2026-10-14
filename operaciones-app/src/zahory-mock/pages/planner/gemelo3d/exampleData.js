const addDays = (date, days) => {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
};

const CATEGORIES = ['general', 'pesada', 'sold', 'crom', 'mec', 'hidr', 'general', 'pesada', 'sold', 'mec'];
const TYPES = ['lathe', 'cnc', 'mill', 'drill', 'grind', 'saw', 'plasma', 'press', 'roll', 'weld', 'oven', 'booth', 'chrome', 'wash', 'crane', 'jib', 'hoist', 'fork', 'stand', 'bench', 'cmm', 'compr', 'lathe', 'cnc', 'mill', 'press', 'weld', 'chrome', 'fork', 'bench'];
const NAMES = ['Ana Ruiz', 'Luis Soto', 'María León', 'Carlos Vega', 'Rosa Díaz', 'Joel Paz', 'Elena Ríos', 'Marco Gil', 'Inés Cruz', 'Pablo Rey', 'Sara Mora', 'Diego Sol', 'Eva Luna', 'Hugo Paz', 'Noelia Roca', 'Raúl Vera'];

export function generarDatosEjemplo(anchorDate = new Date().toISOString().slice(0, 10)) {
  const bahias = CATEGORIES.map((categoria, index) => ({ id: `demo-b${index + 1}`, nombre: `Bahía ${index + 1} · ${categoria}`, categoria, activa: true }));
  const puestos = bahias.flatMap((bahia, index) => Array.from({ length: index % 3 === 0 ? 3 : 2 }, (_, slot) => ({
    id: `demo-p${index + 1}-${slot + 1}`, bahia_id: bahia.id, capacidad: 1, activo: true, nombre: `Puesto ${slot + 1}`,
  })));
  const ots = Array.from({ length: 24 }, (_, index) => ({ id: `demo-ot${index + 1}`, numero: `OT-${String(4100 + index).padStart(5, '0')}`, descripcion: `Orden de trabajo ${index + 1}` }));
  const personas = NAMES.map((nombre, index) => ({ id: `demo-t${index + 1}`, nombre, cargo: ['Mecánica', 'Soldadura', 'Hidráulica', 'Operación'][index % 4] }));
  const maquinas = TYPES.map((tipo_clave, index) => {
    const puesto = puestos[index % puestos.length];
    return { id: `demo-m${index + 1}`, nombre: `${tipo_clave.toUpperCase()} ${String(index + 1).padStart(2, '0')}`, tipo_clave, puesto_id: puesto.id, estado: index % 6 === 0 ? 'mantenimiento' : 'disponible' };
  });
  const tipos = [...new Set(TYPES)].map(clave => ({ clave, nombre: clave.toUpperCase(), base_3d: clave, familia: clave }));
  const equipos = [];
  const asignaciones = [];
  for (let day = 0; day < 10; day++) {
    bahias.forEach((bahia, bayIndex) => {
      const ownPosts = puestos.filter(puesto => puesto.bahia_id === bahia.id);
      const mode = (bayIndex + day) % 3;
      const hours = mode === 0 ? 4 : mode === 1 ? 12 : 16;
      asignaciones.push({ id: `demo-a${day}-${bayIndex}`, fecha: addDays(anchorDate, day), estado: 'programado', puesto_id: ownPosts[0].id, tecnico_id: personas[(bayIndex + day) % personas.length].id, ot_id: ots[(bayIndex * 2 + day) % ots.length].id, horas_estimadas: hours });
    });
    maquinas.filter((_, index) => (index + day) % 3 === 0).forEach((maquina, index) => equipos.push({
      id: `demo-e${day}-${maquina.id}`, maquina_id: maquina.id, fecha: addDays(anchorDate, day), estado: 'programado',
      ot_id: ots[(index + day) % ots.length].id, horas_estimadas: 2 + (index % 4) * 2,
    }));
  }
  return { bahias, puestos, personas, maquinas, tipos, asignaciones, equipos, ots };
}
