-- Backfill supervisado de sociedad_id en hojas de costeo y presupuestos.
--
-- Este archivo NO es una migracion y NO debe ejecutarse automaticamente.
-- Ejecutarlo de forma supervisada, revisando primero los dos result sets del
-- manifiesto que se emiten antes de cualquier UPDATE.
--
-- Orden obligatorio:
--   1. hojas_costeo hereda de cotizaciones.
--   2. presupuestos hereda de CECO, con CEBE como fallback.
--   3. presupuesto_partidas dispara su trigger de herencia desde el padre.
--
-- Pendiente para un bloque posterior de endurecimiento (no corregido aqui):
--   - RPC legacy crear_hoja_costeo sin sociedad.
--   - persistirHojaCosteo permite sociedad_id NULL.
--   - presupuestosService.crearPresupuesto acepta cualquier payload.
--   - Los triggers de presupuesto y partidas no rechazan NULL en tenants con
--     multisociedad cuando no existe un origen societario resoluble.

BEGIN;

SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';

CREATE TEMP TABLE b0c_tenants_permitidos (
  empresa_id text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO b0c_tenants_permitidos (empresa_id)
VALUES
  ('emp_2000000000'),
  ('emp_20601829101'),
  ('emp_20606120487');

-- Evita que el universo verificado cambie entre el manifiesto y el COMMIT.
LOCK TABLE
  public.empresas,
  public.sociedades,
  public.cotizaciones,
  public.centros_costo,
  public.centros_beneficio,
  public.hojas_costeo,
  public.presupuestos,
  public.presupuesto_partidas
IN SHARE ROW EXCLUSIVE MODE;

DO $verificar_lista_blanca$
DECLARE
  v_total integer;
  v_invalidos jsonb;
BEGIN
  SELECT count(*) INTO v_total
  FROM b0c_tenants_permitidos;

  IF v_total <> 3 THEN
    RAISE EXCEPTION 'B0C_LISTA_BLANCA: se esperaban exactamente 3 tenants y se encontraron %', v_total;
  END IF;

  SELECT jsonb_agg(t.empresa_id ORDER BY t.empresa_id)
  INTO v_invalidos
  FROM b0c_tenants_permitidos t
  LEFT JOIN public.empresas e ON e.id = t.empresa_id
  WHERE e.id IS NULL
     OR e.multisociedad_habilitado IS DISTINCT FROM true;

  IF v_invalidos IS NOT NULL THEN
    RAISE EXCEPTION 'B0C_LISTA_BLANCA: tenants inexistentes o sin multisociedad activa: %', v_invalidos;
  END IF;
END
$verificar_lista_blanca$;

CREATE TEMP TABLE b0c_conteos_esperados (
  tabla text NOT NULL,
  empresa_id text NOT NULL,
  filas integer NOT NULL,
  PRIMARY KEY (tabla, empresa_id)
) ON COMMIT DROP;

INSERT INTO b0c_conteos_esperados (tabla, empresa_id, filas)
VALUES
  ('hojas_costeo', 'emp_2000000000', 8),
  ('hojas_costeo', 'emp_20601829101', 1),
  ('hojas_costeo', 'emp_20606120487', 3),
  ('presupuestos', 'emp_2000000000', 1),
  ('presupuestos', 'emp_20601829101', 1),
  ('presupuesto_partidas', 'emp_2000000000', 5),
  ('presupuesto_partidas', 'emp_20601829101', 4);

CREATE TEMP TABLE b0c_conteos_actuales ON COMMIT DROP AS
SELECT 'hojas_costeo'::text AS tabla, h.empresa_id, count(*)::integer AS filas
FROM public.hojas_costeo h
JOIN b0c_tenants_permitidos t ON t.empresa_id = h.empresa_id
WHERE h.sociedad_id IS NULL
GROUP BY h.empresa_id
UNION ALL
SELECT 'presupuestos', p.empresa_id, count(*)::integer
FROM public.presupuestos p
JOIN b0c_tenants_permitidos t ON t.empresa_id = p.empresa_id
WHERE p.sociedad_id IS NULL
GROUP BY p.empresa_id
UNION ALL
SELECT 'presupuesto_partidas', pp.empresa_id, count(*)::integer
FROM public.presupuesto_partidas pp
JOIN b0c_tenants_permitidos t ON t.empresa_id = pp.empresa_id
WHERE pp.sociedad_id IS NULL
GROUP BY pp.empresa_id;

DO $verificar_conteos$
DECLARE
  v_actual jsonb;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM b0c_conteos_esperados e
    FULL JOIN b0c_conteos_actuales a
      ON a.tabla = e.tabla
     AND a.empresa_id = e.empresa_id
    WHERE e.tabla IS NULL
       OR a.tabla IS NULL
       OR a.filas IS DISTINCT FROM e.filas
  ) THEN
    SELECT jsonb_agg(to_jsonb(a) ORDER BY a.tabla, a.empresa_id)
    INTO v_actual
    FROM b0c_conteos_actuales a;

    RAISE EXCEPTION 'B0C_CONTEOS: los NULL actuales no coinciden con el diagnostico aprobado: %', v_actual;
  END IF;

  IF (SELECT coalesce(sum(filas), 0) FROM b0c_conteos_actuales) <> 23 THEN
    RAISE EXCEPTION 'B0C_CONTEOS: se esperaban exactamente 23 filas objetivo';
  END IF;
END
$verificar_conteos$;

CREATE TEMP TABLE b0c_manifiesto (
  tabla text NOT NULL,
  id text NOT NULL,
  empresa_id text NOT NULL,
  sociedad_id_previa uuid,
  sociedad_id_esperada uuid,
  origen_tipo text NOT NULL,
  origen_id text,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tabla, id)
) ON COMMIT DROP;

INSERT INTO b0c_manifiesto (
  tabla,
  id,
  empresa_id,
  sociedad_id_previa,
  sociedad_id_esperada,
  origen_tipo,
  origen_id,
  detalle
)
SELECT
  'hojas_costeo',
  h.id::text,
  h.empresa_id,
  h.sociedad_id,
  c.sociedad_id,
  'cotizacion',
  h.cotizacion_id::text,
  jsonb_build_object(
    'cotizacion_empresa_id', c.empresa_id,
    'cotizacion_sociedad_id', c.sociedad_id
  )
FROM public.hojas_costeo h
JOIN b0c_tenants_permitidos t ON t.empresa_id = h.empresa_id
LEFT JOIN public.cotizaciones c
  ON c.id = h.cotizacion_id
 AND c.empresa_id = h.empresa_id
WHERE h.sociedad_id IS NULL;

INSERT INTO b0c_manifiesto (
  tabla,
  id,
  empresa_id,
  sociedad_id_previa,
  sociedad_id_esperada,
  origen_tipo,
  origen_id,
  detalle
)
SELECT
  'presupuestos',
  p.id::text,
  p.empresa_id,
  p.sociedad_id,
  coalesce(cc.sociedad_id, cb.sociedad_id),
  'ceco_cebe',
  coalesce(p.centro_costo_id::text, p.cebe_id::text),
  jsonb_build_object(
    'centro_costo_id', p.centro_costo_id,
    'ceco_sociedad_id', cc.sociedad_id,
    'cebe_id', p.cebe_id,
    'cebe_sociedad_id', cb.sociedad_id
  )
FROM public.presupuestos p
JOIN b0c_tenants_permitidos t ON t.empresa_id = p.empresa_id
LEFT JOIN public.centros_costo cc
  ON cc.id = p.centro_costo_id
 AND cc.empresa_id = p.empresa_id
LEFT JOIN public.centros_beneficio cb
  ON cb.id = p.cebe_id
 AND cb.empresa_id = p.empresa_id
WHERE p.sociedad_id IS NULL;

INSERT INTO b0c_manifiesto (
  tabla,
  id,
  empresa_id,
  sociedad_id_previa,
  sociedad_id_esperada,
  origen_tipo,
  origen_id,
  detalle
)
SELECT
  'presupuesto_partidas',
  pp.id::text,
  pp.empresa_id,
  pp.sociedad_id,
  coalesce(p.sociedad_id, mp.sociedad_id_esperada),
  'presupuesto_padre',
  pp.presupuesto_id::text,
  jsonb_build_object(
    'presupuesto_empresa_id', p.empresa_id,
    'presupuesto_sociedad_id_previa', p.sociedad_id,
    'presupuesto_en_manifiesto', (mp.id IS NOT NULL),
    'presupuesto_sociedad_esperada', mp.sociedad_id_esperada
  )
FROM public.presupuesto_partidas pp
JOIN b0c_tenants_permitidos t ON t.empresa_id = pp.empresa_id
LEFT JOIN public.presupuestos p
  ON p.id = pp.presupuesto_id
 AND p.empresa_id = pp.empresa_id
LEFT JOIN b0c_manifiesto mp
  ON mp.tabla = 'presupuestos'
 AND mp.id = p.id::text
WHERE pp.sociedad_id IS NULL;

DO $verificar_origenes$
DECLARE
  v_total integer;
  v_invalidos jsonb;
BEGIN
  SELECT count(*) INTO v_total FROM b0c_manifiesto;
  IF v_total <> 23 THEN
    RAISE EXCEPTION 'B0C_MANIFIESTO: se esperaban 23 filas y se encontraron %', v_total;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM b0c_manifiesto m
    WHERE m.sociedad_id_previa IS NOT NULL
       OR m.sociedad_id_esperada IS NULL
  ) THEN
    SELECT jsonb_agg(jsonb_build_object(
      'tabla', m.tabla,
      'id', m.id,
      'empresa_id', m.empresa_id,
      'sociedad_previa', m.sociedad_id_previa,
      'sociedad_esperada', m.sociedad_id_esperada,
      'detalle', m.detalle
    ) ORDER BY m.tabla, m.empresa_id, m.id)
    INTO v_invalidos
    FROM b0c_manifiesto m
    WHERE m.sociedad_id_previa IS NOT NULL
       OR m.sociedad_id_esperada IS NULL;

    RAISE EXCEPTION 'B0C_MANIFIESTO: filas no derivables o fuera del estado esperado: %', v_invalidos;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM b0c_manifiesto m
    LEFT JOIN public.sociedades s
      ON s.id = m.sociedad_id_esperada
     AND s.empresa_id = m.empresa_id
    WHERE s.id IS NULL
  ) THEN
    RAISE EXCEPTION 'B0C_MANIFIESTO: una sociedad derivada no pertenece al tenant de la fila';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.hojas_costeo h
    JOIN b0c_tenants_permitidos t ON t.empresa_id = h.empresa_id
    LEFT JOIN public.cotizaciones c
      ON c.id = h.cotizacion_id
     AND c.empresa_id = h.empresa_id
    WHERE h.sociedad_id IS NULL
      AND (
        h.cotizacion_id IS NULL
        OR c.id IS NULL
        OR c.sociedad_id IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'B0C_HOJAS_ORIGEN: existe una hoja sin cotizacion valida o con cotizacion sin sociedad';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.presupuestos p
    JOIN b0c_tenants_permitidos t ON t.empresa_id = p.empresa_id
    LEFT JOIN public.centros_costo cc
      ON cc.id = p.centro_costo_id
     AND cc.empresa_id = p.empresa_id
    LEFT JOIN public.centros_beneficio cb
      ON cb.id = p.cebe_id
     AND cb.empresa_id = p.empresa_id
    WHERE p.sociedad_id IS NULL
      AND (
        p.centro_costo_id IS NULL
        OR cc.id IS NULL
        OR cc.sociedad_id IS NULL
        OR (p.cebe_id IS NOT NULL AND cb.id IS NULL)
        OR (p.cebe_id IS NOT NULL AND cb.sociedad_id IS NULL)
        OR (cc.sociedad_id IS DISTINCT FROM cb.sociedad_id AND p.cebe_id IS NOT NULL)
      )
  ) THEN
    RAISE EXCEPTION 'B0C_PRESUPUESTOS_ORIGEN: CECO ausente/sin sociedad o conflicto entre CECO y CEBE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.presupuesto_partidas pp
    JOIN b0c_tenants_permitidos t ON t.empresa_id = pp.empresa_id
    LEFT JOIN public.presupuestos p
      ON p.id = pp.presupuesto_id
     AND p.empresa_id = pp.empresa_id
    LEFT JOIN b0c_manifiesto mp
      ON mp.tabla = 'presupuestos'
     AND mp.id = p.id::text
    WHERE pp.sociedad_id IS NULL
      AND (
        p.id IS NULL
        OR mp.id IS NULL
        OR mp.sociedad_id_esperada IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'B0C_PARTIDAS_ORIGEN: una partida no cuelga de uno de los presupuestos objetivo derivables';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger tg
    WHERE tg.tgrelid = 'public.presupuesto_partidas'::regclass
      AND tg.tgname = 'trg_presupuesto_partidas_heredar_sociedad'
      AND NOT tg.tgisinternal
      AND tg.tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'B0C_TRIGGER: trg_presupuesto_partidas_heredar_sociedad no existe o esta deshabilitado';
  END IF;
END
$verificar_origenes$;

-- Snapshot de filas ya societarias dentro de la lista blanca. Permite probar
-- al final que ninguna fue tocada, incluso si conservara el mismo UUID.
CREATE TEMP TABLE b0c_sociedad_preexistente ON COMMIT DROP AS
SELECT 'hojas_costeo'::text AS tabla,
       h.id::text AS id,
       h.empresa_id,
       h.sociedad_id,
       h.xmin::text AS xmin_previo
FROM public.hojas_costeo h
JOIN b0c_tenants_permitidos t ON t.empresa_id = h.empresa_id
WHERE h.sociedad_id IS NOT NULL
UNION ALL
SELECT 'presupuestos', p.id::text, p.empresa_id, p.sociedad_id, p.xmin::text
FROM public.presupuestos p
JOIN b0c_tenants_permitidos t ON t.empresa_id = p.empresa_id
WHERE p.sociedad_id IS NOT NULL
UNION ALL
SELECT 'presupuesto_partidas', pp.id::text, pp.empresa_id, pp.sociedad_id, pp.xmin::text
FROM public.presupuesto_partidas pp
JOIN b0c_tenants_permitidos t ON t.empresa_id = pp.empresa_id
WHERE pp.sociedad_id IS NOT NULL;

-- Fingerprint de las tres tablas fuera de la lista blanca. xmin hace visible
-- tambien un UPDATE que dejara todos los valores de negocio iguales.
CREATE TEMP TABLE b0c_otros_tenants_previo ON COMMIT DROP AS
SELECT
  'hojas_costeo'::text AS tabla,
  count(*)::bigint AS filas,
  md5(coalesce(string_agg(
    concat_ws('|', h.id::text, h.empresa_id, coalesce(h.sociedad_id::text, 'NULL'), h.xmin::text),
    '||' ORDER BY h.id::text, h.empresa_id
  ), '')) AS fingerprint
FROM public.hojas_costeo h
WHERE NOT EXISTS (
  SELECT 1 FROM b0c_tenants_permitidos t WHERE t.empresa_id = h.empresa_id
)
UNION ALL
SELECT
  'presupuestos',
  count(*)::bigint,
  md5(coalesce(string_agg(
    concat_ws('|', p.id::text, p.empresa_id, coalesce(p.sociedad_id::text, 'NULL'), p.xmin::text),
    '||' ORDER BY p.id::text, p.empresa_id
  ), ''))
FROM public.presupuestos p
WHERE NOT EXISTS (
  SELECT 1 FROM b0c_tenants_permitidos t WHERE t.empresa_id = p.empresa_id
)
UNION ALL
SELECT
  'presupuesto_partidas',
  count(*)::bigint,
  md5(coalesce(string_agg(
    concat_ws('|', pp.id::text, pp.empresa_id, coalesce(pp.sociedad_id::text, 'NULL'), pp.xmin::text),
    '||' ORDER BY pp.id::text, pp.empresa_id
  ), ''))
FROM public.presupuesto_partidas pp
WHERE NOT EXISTS (
  SELECT 1 FROM b0c_tenants_permitidos t WHERE t.empresa_id = pp.empresa_id
);

-- RESULTADO 1: resumen del manifiesto. Se emite ANTES de modificar datos.
SELECT
  tabla,
  empresa_id,
  count(*) AS filas,
  jsonb_agg(id ORDER BY id) AS ids
FROM b0c_manifiesto
GROUP BY tabla, empresa_id
ORDER BY tabla, empresa_id;

-- RESULTADO 2: detalle de las 23 filas. Se emite ANTES de modificar datos.
SELECT
  tabla,
  id,
  empresa_id,
  sociedad_id_previa,
  sociedad_id_esperada,
  origen_tipo,
  origen_id,
  detalle
FROM b0c_manifiesto
ORDER BY tabla, empresa_id, id;

-- 1. Hojas de costeo: asignacion directa desde la cotizacion validada.
DO $actualizar_hojas$
DECLARE
  v_afectadas integer;
BEGIN
  UPDATE public.hojas_costeo h
  SET sociedad_id = m.sociedad_id_esperada
  FROM b0c_manifiesto m
  WHERE m.tabla = 'hojas_costeo'
    AND m.id = h.id::text
    AND m.empresa_id = h.empresa_id
    AND h.sociedad_id IS NULL;

  GET DIAGNOSTICS v_afectadas = ROW_COUNT;
  IF v_afectadas <> 12 THEN
    RAISE EXCEPTION 'B0C_UPDATE_HOJAS: se esperaban 12 filas y se actualizaron %', v_afectadas;
  END IF;
END
$actualizar_hojas$;

-- 2. Presupuestos: el manifiesto contiene coalesce(CECO, CEBE). El trigger
-- existente vuelve a validar origen y conflicto durante el UPDATE.
DO $actualizar_presupuestos$
DECLARE
  v_afectadas integer;
BEGIN
  UPDATE public.presupuestos p
  SET sociedad_id = m.sociedad_id_esperada
  FROM b0c_manifiesto m
  WHERE m.tabla = 'presupuestos'
    AND m.id = p.id::text
    AND m.empresa_id = p.empresa_id
    AND p.sociedad_id IS NULL;

  GET DIAGNOSTICS v_afectadas = ROW_COUNT;
  IF v_afectadas <> 2 THEN
    RAISE EXCEPTION 'B0C_UPDATE_PRESUPUESTOS: se esperaban 2 filas y se actualizaron %', v_afectadas;
  END IF;
END
$actualizar_presupuestos$;

-- 3. Partidas: NO se asigna la sociedad. Este UPDATE neutro incluye
-- sociedad_id en SET y dispara trg_presupuesto_partidas_heredar_sociedad, que
-- sustituye NULL por la sociedad del presupuesto padre ya actualizado.
DO $actualizar_partidas$
DECLARE
  v_afectadas integer;
BEGIN
  UPDATE public.presupuesto_partidas pp
  SET sociedad_id = pp.sociedad_id
  FROM b0c_manifiesto m
  WHERE m.tabla = 'presupuesto_partidas'
    AND m.id = pp.id::text
    AND m.empresa_id = pp.empresa_id
    AND pp.sociedad_id IS NULL;

  GET DIAGNOSTICS v_afectadas = ROW_COUNT;
  IF v_afectadas <> 9 THEN
    RAISE EXCEPTION 'B0C_UPDATE_PARTIDAS: se esperaban 9 filas y se actualizaron %', v_afectadas;
  END IF;
END
$actualizar_partidas$;

DO $verificaciones_finales$
DECLARE
  v_nulos integer;
BEGIN
  SELECT count(*) INTO v_nulos
  FROM (
    SELECT h.id
    FROM public.hojas_costeo h
    JOIN b0c_tenants_permitidos t ON t.empresa_id = h.empresa_id
    WHERE h.sociedad_id IS NULL
    UNION ALL
    SELECT p.id
    FROM public.presupuestos p
    JOIN b0c_tenants_permitidos t ON t.empresa_id = p.empresa_id
    WHERE p.sociedad_id IS NULL
    UNION ALL
    SELECT pp.id
    FROM public.presupuesto_partidas pp
    JOIN b0c_tenants_permitidos t ON t.empresa_id = pp.empresa_id
    WHERE pp.sociedad_id IS NULL
  ) pendientes;

  IF v_nulos <> 0 THEN
    RAISE EXCEPTION 'B0C_VERIFY_NULLS: quedaron % filas con sociedad_id NULL en la lista blanca', v_nulos;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM b0c_manifiesto m
    JOIN public.hojas_costeo h
      ON m.tabla = 'hojas_costeo'
     AND h.id::text = m.id
     AND h.empresa_id = m.empresa_id
    JOIN public.cotizaciones c
      ON c.id = h.cotizacion_id
     AND c.empresa_id = h.empresa_id
    WHERE h.sociedad_id IS DISTINCT FROM c.sociedad_id
       OR h.sociedad_id IS DISTINCT FROM m.sociedad_id_esperada
  ) THEN
    RAISE EXCEPTION 'B0C_VERIFY_HOJAS: una hoja no coincide con la sociedad de su cotizacion';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM b0c_manifiesto m
    JOIN public.presupuestos p
      ON m.tabla = 'presupuestos'
     AND p.id::text = m.id
     AND p.empresa_id = m.empresa_id
    JOIN public.centros_costo cc
      ON cc.id = p.centro_costo_id
     AND cc.empresa_id = p.empresa_id
    LEFT JOIN public.centros_beneficio cb
      ON cb.id = p.cebe_id
     AND cb.empresa_id = p.empresa_id
    WHERE p.sociedad_id IS DISTINCT FROM cc.sociedad_id
       OR p.sociedad_id IS DISTINCT FROM coalesce(cc.sociedad_id, cb.sociedad_id)
       OR p.sociedad_id IS DISTINCT FROM m.sociedad_id_esperada
       OR (p.cebe_id IS NOT NULL AND cc.sociedad_id IS DISTINCT FROM cb.sociedad_id)
  ) THEN
    RAISE EXCEPTION 'B0C_VERIFY_PRESUPUESTOS: un presupuesto no coincide con su CECO o presenta conflicto con su CEBE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM b0c_manifiesto m
    JOIN public.presupuesto_partidas pp
      ON m.tabla = 'presupuesto_partidas'
     AND pp.id::text = m.id
     AND pp.empresa_id = m.empresa_id
    JOIN public.presupuestos p
      ON p.id = pp.presupuesto_id
     AND p.empresa_id = pp.empresa_id
    WHERE pp.sociedad_id IS DISTINCT FROM p.sociedad_id
       OR pp.sociedad_id IS DISTINCT FROM m.sociedad_id_esperada
  ) THEN
    RAISE EXCEPTION 'B0C_VERIFY_PARTIDAS: una partida no coincide con la sociedad de su presupuesto padre';
  END IF;

  IF EXISTS (
    WITH actuales AS (
      SELECT
        'hojas_costeo'::text AS tabla,
        count(*)::bigint AS filas,
        md5(coalesce(string_agg(
          concat_ws('|', h.id::text, h.empresa_id, coalesce(h.sociedad_id::text, 'NULL'), h.xmin::text),
          '||' ORDER BY h.id::text, h.empresa_id
        ), '')) AS fingerprint
      FROM public.hojas_costeo h
      WHERE NOT EXISTS (
        SELECT 1 FROM b0c_tenants_permitidos t WHERE t.empresa_id = h.empresa_id
      )
      UNION ALL
      SELECT
        'presupuestos',
        count(*)::bigint,
        md5(coalesce(string_agg(
          concat_ws('|', p.id::text, p.empresa_id, coalesce(p.sociedad_id::text, 'NULL'), p.xmin::text),
          '||' ORDER BY p.id::text, p.empresa_id
        ), ''))
      FROM public.presupuestos p
      WHERE NOT EXISTS (
        SELECT 1 FROM b0c_tenants_permitidos t WHERE t.empresa_id = p.empresa_id
      )
      UNION ALL
      SELECT
        'presupuesto_partidas',
        count(*)::bigint,
        md5(coalesce(string_agg(
          concat_ws('|', pp.id::text, pp.empresa_id, coalesce(pp.sociedad_id::text, 'NULL'), pp.xmin::text),
          '||' ORDER BY pp.id::text, pp.empresa_id
        ), ''))
      FROM public.presupuesto_partidas pp
      WHERE NOT EXISTS (
        SELECT 1 FROM b0c_tenants_permitidos t WHERE t.empresa_id = pp.empresa_id
      )
    )
    SELECT 1
    FROM b0c_otros_tenants_previo b
    FULL JOIN actuales a USING (tabla)
    WHERE b.tabla IS NULL
       OR a.tabla IS NULL
       OR b.filas IS DISTINCT FROM a.filas
       OR b.fingerprint IS DISTINCT FROM a.fingerprint
  ) THEN
    RAISE EXCEPTION 'B0C_VERIFY_OTROS_TENANTS: se modifico una fila fuera de la lista blanca';
  END IF;

  IF EXISTS (
    WITH actuales AS (
      SELECT 'hojas_costeo'::text AS tabla,
             h.id::text AS id,
             h.empresa_id,
             h.sociedad_id,
             h.xmin::text AS xmin_actual
      FROM public.hojas_costeo h
      UNION ALL
      SELECT 'presupuestos', p.id::text, p.empresa_id, p.sociedad_id, p.xmin::text
      FROM public.presupuestos p
      UNION ALL
      SELECT 'presupuesto_partidas', pp.id::text, pp.empresa_id, pp.sociedad_id, pp.xmin::text
      FROM public.presupuesto_partidas pp
    )
    SELECT 1
    FROM b0c_sociedad_preexistente b
    LEFT JOIN actuales a
      ON a.tabla = b.tabla
     AND a.id = b.id
     AND a.empresa_id = b.empresa_id
    WHERE a.id IS NULL
       OR a.sociedad_id IS DISTINCT FROM b.sociedad_id
       OR a.xmin_actual IS DISTINCT FROM b.xmin_previo
  ) THEN
    RAISE EXCEPTION 'B0C_VERIFY_PREEXISTENTES: se altero una fila que ya tenia sociedad_id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM b0c_manifiesto m
    LEFT JOIN (
      SELECT 'hojas_costeo'::text AS tabla, h.id::text AS id, h.empresa_id, h.sociedad_id
      FROM public.hojas_costeo h
      UNION ALL
      SELECT 'presupuestos', p.id::text, p.empresa_id, p.sociedad_id
      FROM public.presupuestos p
      UNION ALL
      SELECT 'presupuesto_partidas', pp.id::text, pp.empresa_id, pp.sociedad_id
      FROM public.presupuesto_partidas pp
    ) actual
      ON actual.tabla = m.tabla
     AND actual.id = m.id
     AND actual.empresa_id = m.empresa_id
    WHERE actual.id IS NULL
       OR actual.sociedad_id IS DISTINCT FROM m.sociedad_id_esperada
  ) THEN
    RAISE EXCEPTION 'B0C_VERIFY_MANIFIESTO: el resultado final no coincide con las 23 asignaciones manifestadas';
  END IF;
END
$verificaciones_finales$;

-- RESULTADO 3: resumen final, emitido solo si todas las verificaciones pasaron.
SELECT
  m.tabla,
  m.empresa_id,
  count(*) AS filas_actualizadas,
  bool_and(actual.sociedad_id = m.sociedad_id_esperada) AS coincide_con_manifiesto
FROM b0c_manifiesto m
JOIN (
  SELECT 'hojas_costeo'::text AS tabla, h.id::text AS id, h.empresa_id, h.sociedad_id
  FROM public.hojas_costeo h
  UNION ALL
  SELECT 'presupuestos', p.id::text, p.empresa_id, p.sociedad_id
  FROM public.presupuestos p
  UNION ALL
  SELECT 'presupuesto_partidas', pp.id::text, pp.empresa_id, pp.sociedad_id
  FROM public.presupuesto_partidas pp
) actual
  ON actual.tabla = m.tabla
 AND actual.id = m.id
 AND actual.empresa_id = m.empresa_id
GROUP BY m.tabla, m.empresa_id
ORDER BY m.tabla, m.empresa_id;

COMMIT;
