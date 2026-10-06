'use strict';

const fs = require('node:fs');
const outputPath = process.argv[2];
const outputLines = [];
function emit(value, isError = false) {
  const line = typeof value === 'string' ? value : JSON.stringify(value);
  outputLines.push(line);
  (isError ? console.error : console.log)(line);
}
function persistOutput() {
  if (outputPath) fs.writeFileSync(outputPath, outputLines.join('\n') + '\n', { encoding: 'utf8' });
}
process.on('exit', persistOutput);
if (!outputPath) {
  emit('Falta el primer argumento: ruta de salida UTF-8', true);
  process.exit(2);
}

const { Client } = require('pg');
const assert = require('node:assert/strict');
const databaseUrl = process.env.DATABASE_URL_592;
if (!databaseUrl) {
  emit('DATABASE_URL_592=NOT_DEFINED');
  process.exit(2);
}

const EMPRESA = 'emp_2000000000';
const ROL_TECNICO = 'rol_emp_2000000000_ops_tecnico';
const config = {
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  application_name: '592_concurrencia_reversible'
};

function safeError(error) {
  return {
    code: error && error.code ? error.code : null,
    message: String(error && error.message ? error.message : error)
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]')
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function counts(client) {
  const states = await client.query(
    "WITH estados(estado) AS (VALUES ('borrador'),('emitido')) " +
    "SELECT e.estado,count(d.id)::bigint AS cantidad FROM estados e " +
    "LEFT JOIN public.diagnosticos_tecnicos d ON d.estado=e.estado AND d.empresa_id=$1 " +
    "GROUP BY e.estado ORDER BY e.estado",
    [EMPRESA]
  );
  const rows = await client.query(
    "SELECT (SELECT count(*)::bigint FROM public.diagnostico_tecnico_hallazgos) AS hallazgos," +
    "(SELECT count(*)::bigint FROM public.diagnostico_tecnico_hallazgo_mediciones) AS mediciones," +
    "(SELECT count(*)::bigint FROM public.diagnostico_tecnico_hallazgo_lineas) AS enlaces"
  );
  return {
    estados: Object.fromEntries(states.rows.map(row => [row.estado, Number(row.cantidad)])),
    hallazgos: Number(rows.rows[0].hallazgos),
    mediciones: Number(rows.rows[0].mediciones),
    enlaces: Number(rows.rows[0].enlaces)
  };
}

async function auth(client, userId) {
  await client.query('SET LOCAL ROLE authenticated');
  await client.query(
    "SELECT set_config('request.jwt.claims',$1,true)",
    [JSON.stringify({ sub: userId, role: 'authenticated' })]
  );
}

async function rollback(client) {
  try { await client.query('ROLLBACK'); } catch (_) {}
}

async function main() {
  const probe = new Client(config);
  const s1 = new Client(config);
  const s2 = new Client(config);
  let s1Open = false;
  let s2Open = false;
  let s2Promise = null;
  let s2Settled = false;

  try {
    await probe.connect();
    const fixture = await probe.query(
      "SELECT d.id AS diagnostico_id,l.familia_trabajo_id,ue.user_id " +
      "FROM public.diagnosticos_tecnicos d " +
      "JOIN public.diagnostico_tecnico_lineas l ON l.diagnostico_id=d.id AND l.empresa_id=d.empresa_id " +
      "JOIN public.usuarios_empresas ue ON ue.empresa_id=d.empresa_id AND ue.rol_id=$2 AND ue.estado='activo' " +
      "WHERE d.empresa_id=$1 AND d.estado='borrador' ORDER BY d.id,l.id,ue.user_id LIMIT 1",
      [EMPRESA, ROL_TECNICO]
    );
    assert.equal(fixture.rowCount, 1, 'No se encontró diagnóstico/línea/técnico de PRUEBA');
    const row = fixture.rows[0];
    const diag = row.diagnostico_id;
    const familia = row.familia_trabajo_id;
    const tecnico = row.user_id;

    const before = await counts(probe);
    emit(JSON.stringify({
      etapa: 'before', empresa: EMPRESA,
      diagnostico_borrador_seleccionado: true,
      usuario_tecnico_seleccionado: true,
      estados: before.estados, hallazgos: before.hallazgos,
      mediciones: before.mediciones, enlaces: before.enlaces
    }));
    assert.deepEqual(before.estados, { borrador: 10, emitido: 0 }, 'Estados previos no coinciden');
    assert.equal(before.hallazgos, 0, 'Hallazgos previos no coinciden');
    assert.equal(before.mediciones, 0, 'Mediciones previas no coinciden');
    assert.equal(before.enlaces, 0, 'Enlaces previos no coinciden');

    await s1.connect();
    await s2.connect();
    await s1.query('BEGIN');
    s1Open = true;
    await auth(s1, tecnico);
    const updated = await s1.query(
      "UPDATE public.diagnosticos_tecnicos SET estado='emitido' " +
      "WHERE id=$1 AND empresa_id=$2 AND estado='borrador'",
      [diag, EMPRESA]
    );
    emit(JSON.stringify({ sesion: 'S1', etapa: 'update_sin_commit', filas: updated.rowCount }));
    assert.equal(updated.rowCount, 1, 'S1 no pudo actualizar el diagnóstico');

    await s2.query('BEGIN');
    s2Open = true;
    await auth(s2, tecnico);
    await s2.query("SET LOCAL statement_timeout='30s'");
    const started = process.hrtime.bigint();
    s2Promise = (async () => {
      try {
        const inserted = await s2.query(
          "INSERT INTO public.diagnostico_tecnico_hallazgos " +
          "(empresa_id,diagnostico_id,familia_trabajo_id,componente_parte,tipo_dano_codigo," +
          "causa_probable_codigo,condicion,riesgo,accion_recomendada,atribuible_a) " +
          "VALUES ($1,$2,$3,'concurrencia','desgaste','desgaste_normal','conforme'," +
          "'monitorear','monitorear','desgaste_normal') RETURNING id",
          [EMPRESA, diag, familia]
        );
        return {
          ok: true,
          elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
          rowCount: inserted.rowCount
        };
      } catch (error) {
        return {
          ok: false,
          elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
          error: safeError(error)
        };
      } finally {
        s2Settled = true;
      }
    })();

    await sleep(2500);
    emit(JSON.stringify({
      sesion: 'S2', etapa: 'espera',
      esperando_mas_de_2s: !s2Settled, transcurrido_ms_minimo: 2500
    }));
    assert.equal(s2Settled, false, 'S2 no quedó esperando más de 2 segundos');

    await s1.query('ROLLBACK');
    s1Open = false;
    emit(JSON.stringify({ sesion: 'S1', etapa: 'rollback', confirmado: true }));

    const result = await s2Promise;
    emit(JSON.stringify({
      sesion: 'S2', etapa: 'insert_despues_de_rollback_s1',
      permitido: result.ok, tiempo_ms: Math.round(result.elapsedMs),
      filas: result.rowCount || 0, error: result.error || null
    }));
    assert.equal(result.ok, true, 'S2 no permitió el INSERT');
    assert.ok(result.elapsedMs > 2000, 'S2 no esperó más de 2 segundos');

    await s2.query('ROLLBACK');
    s2Open = false;
    emit(JSON.stringify({ sesion: 'S2', etapa: 'rollback', confirmado: true }));

    const after = await counts(probe);
    emit(JSON.stringify({
      etapa: 'after', estados: after.estados,
      hallazgos: after.hallazgos, mediciones: after.mediciones, enlaces: after.enlaces
    }));
    assert.deepEqual(after.estados, { borrador: 10, emitido: 0 }, 'Estados posteriores no coinciden');
    assert.equal(after.hallazgos, 0, 'Hallazgos posteriores no coinciden');
    assert.equal(after.mediciones, 0, 'Mediciones posteriores no coinciden');
    assert.equal(after.enlaces, 0, 'Enlaces posteriores no coinciden');
    emit(JSON.stringify({ resultado: 'PASS', variante: 'reversible' }));
  } catch (error) {
    emit(JSON.stringify({ resultado: 'FAIL', error: safeError(error) }));
    process.exitCode = 1;
  } finally {
    if (s1Open) await rollback(s1);
    if (s2Promise && !s2Settled) {
      try { await s2Promise; } catch (_) {}
    }
    if (s2Open) await rollback(s2);
    await Promise.allSettled([probe.end(), s1.end(), s2.end()]);
  }
}

main().catch(error => {
  emit(JSON.stringify({ resultado: 'FAIL', error: safeError(error) }));
  process.exitCode = 1;
});

