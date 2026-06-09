import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://atqwyjfidfoepthygfoo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0cXd5amZpZGZvZXB0aHlnZm9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMjYxMjEsImV4cCI6MjA5MjkwMjEyMX0.IeJEAwujNSHX5cOUG8-8wheTfajABins4sMf2f4WGHg';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function calcularDiasComputables(anio, mes, regimen_jornada, fecha_inicio_ciclo, trabajador = {}) {
  if (!fecha_inicio_ciclo || regimen_jornada === 'general') return null;
  const cicloMap = { minero_14x7: { trabajo: 14, descanso: 7 }, minero_20x10: { trabajo: 20, descanso: 10 }, minero_28x14: { trabajo: 28, descanso: 14 } };
  const ciclo = regimen_jornada === 'ciclo_acumulativo'
    ? { trabajo: Number(trabajador.dias_ciclo_trabajo || 14) || 14, descanso: Number(trabajador.dias_ciclo_descanso || 7) || 7 }
    : cicloMap[regimen_jornada];
  if (!ciclo) return null;
  const duracionCiclo = ciclo.trabajo + ciclo.descanso;
  const inicioMes = new Date(anio, mes - 1, 1);
  const finMes = new Date(anio, mes, 0);
  const inicio = new Date(fecha_inicio_ciclo);
  let diasTrabajo = 0;
  for (let d = new Date(inicioMes); d <= finMes; d.setDate(d.getDate() + 1)) {
    const diffDias = Math.floor((d - inicio) / 86400000);
    const posEnCiclo = ((diffDias % duracionCiclo) + duracionCiclo) % duracionCiclo;
    if (posEnCiclo < ciclo.trabajo) diasTrabajo++;
  }
  return diasTrabajo;
}

function calcularNominaTrabajador(trabajador, periodo) {
  const sueldoBase = Number(trabajador.sueldo_base || 3000);
  const regimenJornada = trabajador.regimen_jornada || 'general';
  const esMinero = regimenJornada !== 'general';
  
  const diasComputables = esMinero
    ? (calcularDiasComputables(periodo.anio, periodo.mes, regimenJornada, trabajador.fecha_inicio_ciclo, trabajador) || 22)
    : null;
  
  const diasBase = esMinero ? (diasComputables || 22) : 30;
  
  const bonifAltitud = (Number(trabajador.bonif_altitud) || 0) * (esMinero ? (diasBase / 30) : 1);
  const sueldoProporcional = esMinero ? sueldoBase * (diasBase / 30) : sueldoBase;
  const remuneracionBruta = sueldoProporcional + bonifAltitud;

  return {
    dias_computables: diasComputables,
    remuneracion_bruta: remuneracionBruta,
    bonif_altitud: bonifAltitud,
    regimen_jornada_snap: regimenJornada
  };
}

async function run() {
  console.log('Iniciando diagnostico minero...');
  const { data: empresas } = await supabase.from('empresas').select('id').limit(1);
  if (!empresas || empresas.length === 0) throw new Error('No hay empresas');
  const empresaId = empresas[0].id;

  const idPersonal = 'per_diag_' + Date.now();
  const { error: err1 } = await supabase.from('personal_operativo').insert([{
    id: idPersonal,
    empresa_id: empresaId,
    nombre: 'TEST MINERO DIAGNOSTICO',
    regimen_jornada: 'minero_20x10',
    dias_ciclo_trabajo: 20,
    dias_ciclo_descanso: 10,
    fecha_inicio_ciclo: '2026-05-01',
    horas_diarias_pactadas: 12,
    sueldo_base: 3000,
    bonif_altitud: 300,
    cargo: 'Operario',
    estado: 'activo'
  }]);
  if (err1) throw err1;
  console.log('Trabajador insertado:', idPersonal);

  const { data: trabajador } = await supabase.from('personal_operativo').select('*').eq('id', idPersonal).single();

  const idCiclo = 'ciclo_diag_' + Date.now();
  const { error: err2 } = await supabase.from('asistencia_ciclos_mineros').insert([{
    id: idCiclo,
    empresa_id: empresaId,
    personal_id: idPersonal,
    regimen_jornada: 'minero_20x10',
    fecha_inicio_ciclo: '2026-05-01',
    fecha_fin_ciclo: '2026-05-30',
    dias_ciclo_trabajo: 20,
    dias_ciclo_descanso: 10,
    estado_ciclo: 'completo',
    horas_extra_ciclo: 0
  }]);
  if (err2) throw err2;
  console.log('Ciclo minero creado:', idCiclo);

  const periodo = { anio: 2026, mes: 5 };
  const calc = calcularNominaTrabajador(trabajador, periodo);
  console.log('Resultado del calculo (motor frontend react local):');
  console.log(calc);

  const idPeriodo = 'nom_diag_' + Date.now();
  const { error: err3 } = await supabase.from('periodos_nomina').insert([{
    id: idPeriodo,
    empresa_id: empresaId,
    anio: 2026,
    mes: 5,
    estado: 'abierto',
    tipo: 'mensual'
  }]);
  if (err3) throw err3;

  const { error: err4 } = await supabase.from('nomina_detalle').insert([{
    id: 'det_diag_' + Date.now(),
    empresa_id: empresaId,
    periodo_id: idPeriodo,
    trabajador_id: idPersonal,
    trabajador_tipo: 'operativo',
    sueldo_base: 3000,
    dias_computables: calc.dias_computables,
    remuneracion_bruta: calc.remuneracion_bruta,
    bonif_altitud: calc.bonif_altitud,
    regimen_jornada_snap: calc.regimen_jornada_snap,
    neto: calc.remuneracion_bruta
  }]);
  if (err4) throw err4;
  console.log('Nomina_detalle guardado en Supabase.');

  const { data: row } = await supabase.from('nomina_detalle').select('*').eq('trabajador_id', idPersonal).single();
  console.log('Verificacion final desde DB:');
  console.log(row);
}

run().catch(console.error);
