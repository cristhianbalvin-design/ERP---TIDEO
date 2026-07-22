import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://atqwyjfidfoepthygfoo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0cXd5amZpZGZvZXB0aHlnZm9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzMyNjEyMSwiZXhwIjoyMDkyOTAyMTIxfQ.2yVuwyDD2cyYTW-vV1MUGOF1yZ7bKXVIQy2kAEFV5kk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('--- PREGUNTA 1 ---');
  
  // 1. ¿Cuántas filas existen en posiciones para la unidad organizacional "operaciones" 
  // (y en total, para todas las unidades), separadas por: cargo_id IS NULL vs cargo_id IS NOT NULL?
  
  // Primero, necesitamos obtener los IDs de las unidades organizacionales para 'operaciones' (y el resto)
  const { data: unidades, error: errUnidades } = await supabase
    .from('unidades_organizacionales')
    .select('*');
    
  if (errUnidades) {
    console.error('Error fetching unidades:', errUnidades);
    return;
  }
  
  const operacionesUnidades = unidades.filter(u => u.nombre.toLowerCase().includes('operacion') || u.nombre.toLowerCase().includes('operaciones'));
  console.log('Todas las unidades:', unidades.map(u => u.nombre).join(', '));
  console.log('Unidades de operaciones encontradas:', operacionesUnidades.map(u => u.nombre).join(', '));
  
  const opIds = operacionesUnidades.map(u => u.id);
  
  // Total con cargo nulo vs no nulo
  const { data: allPosiciones, error: errPos } = await supabase
    .from('posiciones')
    .select('*');
    
  if (errPos) {
    console.error('Error fetching posiciones:', errPos);
    return;
  }
  
  const totalConCargo = allPosiciones.filter(p => p.cargo_id !== null).length;
  const totalSinCargo = allPosiciones.filter(p => p.cargo_id === null).length;
  console.log(`\nTOTAL TODAS LAS UNIDADES:`);
  console.log(`- con cargo_id IS NOT NULL: ${totalConCargo}`);
  console.log(`- con cargo_id IS NULL: ${totalSinCargo}`);
  
  const opPosiciones = allPosiciones.filter(p => opIds.includes(p.unidad_organizacional_id));
  const opConCargo = opPosiciones.filter(p => p.cargo_id !== null).length;
  const opSinCargo = opPosiciones.filter(p => p.cargo_id === null).length;
  console.log(`\nUNIDAD 'OPERACIONES':`);
  console.log(`- con cargo_id IS NOT NULL: ${opConCargo}`);
  console.log(`- con cargo_id IS NULL: ${opSinCargo}`);
  
  console.log('\n--- PREGUNTA 2 ---');
  // 2. De esas posiciones de "operaciones", ¿cuántas ya tienen un usuario asignado 
  // en posiciones_usuarios (ocupada) vs cuántas están vacantes?
  
  const opPosIds = opPosiciones.map(p => p.id);
  
  const { data: posicionesUsuarios, error: errPu } = await supabase
    .from('posiciones_usuarios')
    .select('posicion_id, user_id')
    .in('posicion_id', opPosIds);
    
  if (errPu) {
    console.error('Error fetching posiciones_usuarios:', errPu);
    return;
  }
  
  // Asumiendo que una posición está ocupada si tiene un registro (posiblemente hay que filtrar por vigente/estado, pero contamos los que tienen al menos un usuario asignado)
  const occupiedIds = new Set(posicionesUsuarios.map(pu => pu.posicion_id));
  
  const opOcupadas = opPosiciones.filter(p => occupiedIds.has(p.id)).length;
  const opVacantes = opPosiciones.filter(p => !occupiedIds.has(p.id)).length;
  
  console.log(`En la unidad 'operaciones' (Total: ${opPosiciones.length}):`);
  console.log(`- Ocupadas (en posiciones_usuarios): ${opOcupadas}`);
  console.log(`- Vacantes (sin registros): ${opVacantes}`);
  
  console.log('\n--- PREGUNTA 4 (Ejemplo Posición con cargo) ---');
  // Mostrar los detalles de una posición con cargo para ver cómo se renderiza el combo
  const posConCargo = opPosiciones.find(p => p.cargo_id !== null);
  if (posConCargo) {
    const unidad = unidades.find(u => u.id === posConCargo.unidad_organizacional_id)?.nombre;
    const label = `${unidad || 'Sin unidad'} — ${posConCargo.codigo || posConCargo.id.slice(0,8)}`;
    console.log(`Posición con cargo encontrada:`);
    console.log(`ID: ${posConCargo.id}`);
    console.log(`Cargo ID: ${posConCargo.cargo_id}`);
    console.log(`Código: ${posConCargo.codigo}`);
    console.log(`Label en el combo será: "${label}"`);
  } else {
    console.log('No se encontraron posiciones con cargo en operaciones.');
  }

}

run();
