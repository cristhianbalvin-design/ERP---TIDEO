import fs from 'fs';

const url = 'https://atqwyjfidfoepthygfoo.supabase.co';
const key = 'sb_publishable_35UtWziQKySS628xjkiyKA_4cCFp3Wv';

async function query() {
  const res = await fetch(`${url}/rest/v1/personal_operativo?nombre=ilike.*ROBLES%20ESPINOZA%20EMERSON*&select=id,empresa_id,nombre`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const data = await res.json();
  console.log("Trabajador:", JSON.stringify(data, null, 2));

  if (data.length > 0) {
    const pId = data[0].id;
    const marcRes = await fetch(`${url}/rest/v1/asistencia_marcaciones?personal_id=eq.${pId}&fecha=gte.2026-07-01&fecha=lte.2026-07-21&select=id,fecha,sociedad_id,empresa_id`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    console.log("asistencia_marcaciones:", JSON.stringify(await marcRes.json(), null, 2));

    const regRes = await fetch(`${url}/rest/v1/registros_asistencia?trabajador_id=eq.${pId}&fecha=gte.2026-07-01&fecha=lte.2026-07-21&select=id,fecha,sociedad_id,empresa_id,estado,es_falta`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    console.log("registros_asistencia:", JSON.stringify(await regRes.json(), null, 2));
    
    const asigRes = await fetch(`${url}/rest/v1/personal_asignaciones_jornada?personal_id=eq.${pId}&select=*`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    console.log("asignaciones_jornada:", JSON.stringify(await asigRes.json(), null, 2));

    const datosNomina = await fetch(`${url}/rest/v1/personal_datos_nomina?personal_id=eq.${pId}&select=*`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    console.log("datos_nomina:", JSON.stringify(await datosNomina.json(), null, 2));
  }
}

query().catch(console.error);
