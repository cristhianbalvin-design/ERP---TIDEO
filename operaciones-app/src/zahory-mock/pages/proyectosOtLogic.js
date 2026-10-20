export function filtrarProyectosPorCliente(proyectos = [], clienteId = '') {
  if (!clienteId) return [];
  return proyectos.filter(proyecto => proyecto.cuenta_id === clienteId);
}
