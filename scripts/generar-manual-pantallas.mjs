import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = path.join(root, 'docs/manual-pantallas');
export const migrationPath = path.join(root, 'supabase/migrations/617_asistente_erp_manual_pantallas.sql');

export async function readFichas(dir = docsDir) {
  const names = (await readdir(dir)).filter(name => name.endsWith('.txt')).sort();
  return Promise.all(names.map(async name => parseFicha(await readFile(path.join(dir, name), 'utf8'), name)));
}

export function parseFicha(source, file = 'ficha.txt') {
  const fields = {};
  const steps = [];
  for (const line of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const step = line.match(/^paso:\s*(\d+)\s*\|\s*pantalla=([a-z0-9_]+)\s*\|\s*permiso=([^|]+)\s*\|\s*(.+)$/);
    if (step) {
      const permission = step[3].trim();
      const [permisoPantalla, permisoAccion] = permission === 'ninguno' ? [null, null] : permission.split(':');
      steps.push({ orden: Number(step[1]), pantalla: step[2], permisoPantalla, permiso: permisoAccion, texto: step[4].trim() });
      continue;
    }
    const pair = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!pair) throw new Error(`${file}: línea no reconocida: ${line}`);
    if (fields[pair[1]] !== undefined) throw new Error(`${file}: campo duplicado ${pair[1]}`);
    fields[pair[1]] = pair[2];
  }
  for (const required of ['clave', 'tipo', 'pantalla', 'titulo', 'resumen', 'fuentes', 'revision']) {
    if (!fields[required]) throw new Error(`${file}: falta ${required}`);
  }
  if (!/^[a-z][a-z0-9_]*$/.test(fields.clave) || !['pantalla', 'proceso'].includes(fields.tipo)) throw new Error(`${file}: clave o tipo inválido`);
  if (!/^[0-9a-f]{7,40}$/i.test(fields.revision)) throw new Error(`${file}: revisión debe ser un hash git`);
  if (!steps.length || steps.some((step, index) => step.orden !== index + 1 || !step.texto || step.texto.length > 1000)) throw new Error(`${file}: pasos inválidos`);
  for (const step of steps) {
    if (step.permiso && (!/^[a-z][a-z0-9_]*$/.test(step.permisoPantalla) || !['ver','crear','editar','aprobar','anular','exportar'].includes(step.permiso))) throw new Error(`${file}: permiso inválido ${step.permisoPantalla}:${step.permiso}`);
  }
  if (fields.tipo === 'pantalla' && fields.pantalla === 'ninguna') throw new Error(`${file}: ficha de pantalla sin pantalla`);
  return { ...fields, pantalla: fields.pantalla === 'ninguna' ? null : fields.pantalla, fuentes: fields.fuentes.split(',').map(x => x.trim()), pasos: steps };
}

const q = value => `'${String(value).replaceAll("'", "''")}'`;
const nullable = value => value == null ? 'NULL' : q(value);

export function renderMigration(fichas) {
  const inserts = fichas.flatMap(ficha => {
    const header = `INSERT INTO public.asistente_manual_fichas (clave,tipo,pantalla_key,titulo,resumen,fuentes,revision) VALUES (${q(ficha.clave)},${q(ficha.tipo)},${nullable(ficha.pantalla)},${q(ficha.titulo)},${q(ficha.resumen)},${q(JSON.stringify(ficha.fuentes))}::jsonb,${q(ficha.revision)});`;
    const steps = ficha.pasos.map(step => `INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES (${q(ficha.clave)},${step.orden},${q(step.pantalla)},${nullable(step.permisoPantalla)},${nullable(step.permiso)},${q(step.texto)});`);
    return [header, ...steps];
  }).join('\n');
  return migrationTemplate.replace('/* MANUAL_SEED_START */\n/* MANUAL_SEED_END */', `/* MANUAL_SEED_START */\n${inserts}\n/* MANUAL_SEED_END */`);
}

export async function writeMigration(sql, target = migrationPath) {
  let output = sql;
  try {
    const existing = await readFile(target, 'utf8');
    if (/(?:^|\r?\n)COMMIT;[ \t]*(?:\r?\n)*$/.test(existing)) {
      output = output.replace(/(^|\r?\n)ROLLBACK;([ \t]*\r?\n*)$/, '$1COMMIT;$2');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await writeFile(target, output, 'utf8');
}

const migrationTemplate = `-- 617: Manual de pantallas global de Aria. Revisar protocolo; termina en ROLLBACK.
BEGIN;

CREATE TABLE public.asistente_manual_fichas (
  clave text PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('pantalla','proceso')),
  pantalla_key text,
  titulo text NOT NULL,
  resumen text NOT NULL,
  fuentes jsonb NOT NULL,
  revision text NOT NULL,
  busqueda tsvector GENERATED ALWAYS AS (to_tsvector('spanish'::regconfig, coalesce(titulo,'') || ' ' || coalesce(resumen,''))) STORED,
  CHECK ((tipo='pantalla' AND pantalla_key IS NOT NULL) OR (tipo='proceso' AND pantalla_key IS NULL))
);
CREATE TABLE public.asistente_manual_pasos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ficha_clave text NOT NULL REFERENCES public.asistente_manual_fichas(clave) ON DELETE CASCADE,
  orden integer NOT NULL CHECK (orden > 0),
  pantalla_key text NOT NULL,
  permiso_pantalla text,
  permiso_accion text CHECK (permiso_accion IN ('crear','editar','aprobar','anular','exportar')),
  texto text NOT NULL,
  busqueda tsvector GENERATED ALWAYS AS (to_tsvector('spanish'::regconfig, coalesce(texto,''))) STORED,
  UNIQUE (ficha_clave,orden)
);
CREATE INDEX asistente_manual_fichas_busqueda_idx ON public.asistente_manual_fichas USING gin(busqueda);
CREATE INDEX asistente_manual_pasos_busqueda_idx ON public.asistente_manual_pasos USING gin(busqueda);
ALTER TABLE public.asistente_manual_fichas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asistente_manual_pasos ENABLE ROW LEVEL SECURITY;
-- La RPC fija un contexto local a la transacción; SELECT directo no recibe empresa y no expone fichas.
CREATE POLICY asistente_manual_fichas_lectura ON public.asistente_manual_fichas FOR SELECT TO authenticated USING (
  CASE WHEN tipo='pantalla' THEN public.usuario_puede(current_setting('aria.manual_empresa_id',true), pantalla_key, 'ver')
    ELSE EXISTS (SELECT 1 FROM public.asistente_manual_pasos p WHERE p.ficha_clave=clave) END
);
CREATE POLICY asistente_manual_pasos_lectura ON public.asistente_manual_pasos FOR SELECT TO authenticated USING (
  public.usuario_puede(current_setting('aria.manual_empresa_id',true), pantalla_key, 'ver')
  AND (permiso_accion IS NULL OR public.usuario_puede(current_setting('aria.manual_empresa_id',true), coalesce(permiso_pantalla,pantalla_key), permiso_accion))
);
REVOKE ALL ON public.asistente_manual_fichas, public.asistente_manual_pasos FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.asistente_manual_fichas, public.asistente_manual_pasos FROM authenticated;
GRANT SELECT ON public.asistente_manual_fichas, public.asistente_manual_pasos TO authenticated;

CREATE OR REPLACE FUNCTION public.asistente_consultar_manual(
  p_empresa_id text, p_texto text DEFAULT NULL, p_pantalla text DEFAULT NULL, p_limite integer DEFAULT 5
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=public AS $$
DECLARE
  v_q tsquery; v_fichas jsonb := '[]'::jsonb; v_item jsonb; v_steps jsonb;
  v_truncado boolean := false; v_count integer := 0; v_limit integer := least(greatest(coalesce(p_limite,5),1),10);
  r record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'Empresa no autorizada'; END IF;
  PERFORM set_config('aria.manual_empresa_id', p_empresa_id, true);
  v_q := CASE WHEN nullif(trim(p_texto),'') IS NULL THEN NULL ELSE nullif(replace(plainto_tsquery('spanish'::regconfig, left(trim(p_texto),300))::text, ' & ', ' | '),'')::tsquery END;
  FOR r IN
    SELECT f.clave,f.tipo,f.pantalla_key,f.titulo,f.resumen,
      CASE WHEN v_q IS NULL THEN 0 ELSE ts_rank(f.busqueda,v_q) + coalesce(max(ts_rank(p.busqueda,v_q)),0) END AS relevancia
    FROM public.asistente_manual_fichas f
    LEFT JOIN public.asistente_manual_pasos p ON p.ficha_clave=f.clave
    WHERE (p_pantalla IS NULL OR f.pantalla_key=p_pantalla OR p.pantalla_key=p_pantalla)
      AND (v_q IS NULL OR f.busqueda @@ v_q OR EXISTS (SELECT 1 FROM public.asistente_manual_pasos px WHERE px.ficha_clave=f.clave AND px.busqueda @@ v_q))
    GROUP BY f.clave,f.tipo,f.pantalla_key,f.titulo,f.resumen,f.busqueda
    ORDER BY relevancia DESC, f.clave
    LIMIT v_limit + 1
  LOOP
    IF v_count >= v_limit THEN v_truncado := true; EXIT; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('orden',p.orden,'texto',p.texto) ORDER BY p.orden),'[]'::jsonb)
      INTO v_steps FROM public.asistente_manual_pasos p WHERE p.ficha_clave=r.clave
        AND (p_pantalla IS NULL OR p.pantalla_key=p_pantalla)
        AND public.usuario_puede(p_empresa_id,p.pantalla_key,'ver')
        AND (p.permiso_accion IS NULL OR public.usuario_puede(p_empresa_id,coalesce(p.permiso_pantalla,p.pantalla_key),p.permiso_accion));
    IF jsonb_array_length(v_steps)=0 THEN CONTINUE; END IF;
    v_item:=jsonb_build_object('clave',r.clave,'tipo',r.tipo,'titulo',r.titulo,'resumen',r.resumen,'pasos',v_steps);
    IF octet_length((jsonb_build_object('respuesta','ok','fichas',v_fichas || jsonb_build_array(v_item),'truncado',v_truncado))::text) > 9800 THEN
      v_truncado:=true; EXIT;
    END IF;
    v_fichas:=v_fichas || jsonb_build_array(v_item); v_count:=v_count+1;
  END LOOP;
  IF jsonb_array_length(v_fichas)=0 THEN RETURN jsonb_build_object('respuesta','sin resultados','fichas','[]'::jsonb,'truncado',false); END IF;
  RETURN jsonb_build_object('respuesta','ok','fichas',v_fichas,'truncado',v_truncado);
END; $$;
REVOKE ALL ON FUNCTION public.asistente_consultar_manual(text,text,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistente_consultar_manual(text,text,text,integer) TO authenticated;

/* MANUAL_SEED_START */
/* MANUAL_SEED_END */

-- Verificación manual (ejecutar con roles/sesiones de prueba; solo SELECT).
-- SELECT count(*) AS fichas FROM public.asistente_manual_fichas;
-- SELECT count(*) AS pasos FROM public.asistente_manual_pasos;
-- SELECT public.asistente_consultar_manual('<empresa_con_permiso>', 'rendición', 'caja', 5);
-- SELECT public.asistente_consultar_manual('<empresa_sin_permiso>', 'rendición', 'caja', 5); -- respuesta: sin resultados
-- SET ROLE authenticated; SELECT * FROM public.asistente_manual_fichas; -- RLS solo muestra pantallas autorizadas
-- SET ROLE authenticated; INSERT INTO public.asistente_manual_fichas(clave,tipo,pantalla_key,titulo,resumen,fuentes,revision) VALUES ('prueba','pantalla','caja','x','x','[]','x'); -- debe fallar

ROLLBACK;
`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sql = renderMigration(await readFichas());
  await writeMigration(sql);
  process.stdout.write(`Generada ${path.relative(root, migrationPath)}\n`);
}
