-- B0-b BIS - Backfill societario del tenant PRUEBA.
--
-- PROCEDIMIENTO SUPERVISADO. NO ES UNA MIGRACION.
-- Antes de ejecutar:
--   1. Confirmar que el destino es emp_2000000000.
--   2. Ejecutar el archivo completo en una sola sesion.
--   3. Copiar y guardar fuera de la base los dos resultados de MANIFIESTO.
--
-- El script hace COMMIT si todas las verificaciones pasan. Cualquier excepcion
-- aborta la transaccion completa.

BEGIN;

SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';

SELECT set_config(
  'tideo.b0b_empresa_id',
  'emp_2000000000',
  true
) AS empresa_id_parametrizada;

-- Valida el parametro antes de intentar tomar locks amplios.
DO $$
DECLARE
  v_empresa_id text := current_setting('tideo.b0b_empresa_id');
BEGIN
  IF v_empresa_id <> 'emp_2000000000' THEN
    RAISE EXCEPTION
      'B0B_PARAMETRO: empresa_id no permitido o parametro sin reemplazar: %',
      v_empresa_id;
  END IF;
END;
$$;

-- Impide escrituras concurrentes que puedan crear filas NULL durante el corte.
-- El bloqueo es global sobre estas tablas y debe ejecutarse en ventana supervisada.
LOCK TABLE
  public.empresas,
  public.sociedades,
  public.empresa_config,
  public.facturas,
  public.cotizaciones,
  public.cxc,
  public.cxp,
  public.ordenes_venta,
  public.financiamientos,
  public.correlativos_documentos,
  public.ordenes_compra,
  public.ordenes_servicio_interna,
  public.compras_gastos,
  public.caja_chica,
  public.cuentas_bancarias,
  public.centros_costo,
  public.centros_beneficio,
  public.stock,
  public.inventario_conteos,
  public.kardex,
  public.personal_documentos,
  public.periodos_nomina,
  public.nomina_detalle,
  public.os_clientes,
  public.ordenes_trabajo,
  public.valorizaciones,
  public.devoluciones_proveedor,
  public.devoluciones_proveedor_lineas,
  public.personal_operativo,
  public.personal_administrativo
IN SHARE ROW EXCLUSIVE MODE;

-- B1. PRECHECKS
DO $$
DECLARE
  v_empresa_id text := current_setting('tideo.b0b_empresa_id');
  v_habilitado boolean;
  v_sociedad_id uuid;
  v_principales_activas bigint;
  v_asignadas bigint;
  v_tabla text;
  v_tablas constant text[] := ARRAY[
    'facturas','cotizaciones','cxc','cxp','ordenes_venta','financiamientos',
    'correlativos_documentos','ordenes_compra','ordenes_servicio_interna',
    'compras_gastos','caja_chica','cuentas_bancarias','centros_costo',
    'centros_beneficio','stock','inventario_conteos','kardex',
    'personal_documentos','periodos_nomina','nomina_detalle','os_clientes',
    'ordenes_trabajo','valorizaciones','devoluciones_proveedor',
    'devoluciones_proveedor_lineas'
  ];
BEGIN
  IF v_empresa_id <> 'emp_2000000000' THEN
    RAISE EXCEPTION
      'B0B_PRECHECK: empresa_id no permitido o parametro sin reemplazar: %',
      v_empresa_id;
  END IF;

  SELECT e.multisociedad_habilitado
    INTO v_habilitado
  FROM public.empresas e
  WHERE e.id = v_empresa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'B0B_PRECHECK: tenant inexistente: %', v_empresa_id;
  END IF;

  IF v_habilitado IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'B0B_PRECHECK: el tenant % debe tener multisociedad_habilitado=true y tiene %',
      v_empresa_id,
      v_habilitado;
  END IF;

  SELECT count(*) INTO v_principales_activas
  FROM public.sociedades
  WHERE empresa_id = v_empresa_id
    AND es_principal = true
    AND activa = true;

  IF v_principales_activas <> 1 THEN
    RAISE EXCEPTION
      'B0B_PRECHECK: el tenant % debe tener exactamente una sociedad principal activa y tiene %',
      v_empresa_id,
      v_principales_activas;
  END IF;

  SELECT s.id INTO STRICT v_sociedad_id
  FROM public.sociedades s
  WHERE s.empresa_id = v_empresa_id
    AND s.es_principal = true
    AND s.activa = true;

  IF v_sociedad_id <> '609a2f33-d057-411f-a001-4e3e83f700d0'::uuid THEN
    RAISE EXCEPTION
      'B0B_PRECHECK: sociedad principal inesperada para %: %',
      v_empresa_id,
      v_sociedad_id;
  END IF;

  PERFORM set_config('tideo.b0b_sociedad_id', v_sociedad_id::text, true);

  FOREACH v_tabla IN ARRAY v_tablas LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE empresa_id = $1 AND sociedad_id IS NOT NULL',
      v_tabla
    ) INTO v_asignadas USING v_empresa_id;

    IF v_asignadas <> 0 THEN
      RAISE EXCEPTION
        'B0B_PRECHECK_ASIGNADAS: %.% tiene % fila(s) con sociedad_id no nulo',
        v_empresa_id,
        v_tabla,
        v_asignadas;
    END IF;
  END LOOP;
END;
$$;

-- B2. MANIFIESTO DE ROLLBACK
CREATE TEMP TABLE b0b_manifest (
  empresa_id text NOT NULL,
  multisociedad_habilitado_previo boolean NOT NULL,
  tabla text NOT NULL,
  filas_totales bigint NOT NULL,
  filas_afectadas bigint NOT NULL,
  ids jsonb NOT NULL,
  ids_totales jsonb NOT NULL,
  PRIMARY KEY (empresa_id, tabla)
) ON COMMIT DROP;

CREATE TEMP TABLE b0b_correlativos_manifest (
  id text PRIMARY KEY,
  empresa_id text NOT NULL,
  tipo_documento text NOT NULL,
  serie text NOT NULL,
  ultimo_numero bigint NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE b0b_otros_tenants_fingerprint (
  tabla text PRIMARY KEY,
  filas bigint NOT NULL,
  huella_xmin text NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  v_empresa_id text := current_setting('tideo.b0b_empresa_id');
  v_tabla text;
  v_tablas constant text[] := ARRAY[
    'facturas','cotizaciones','cxc','cxp','ordenes_venta','financiamientos',
    'correlativos_documentos','ordenes_compra','ordenes_servicio_interna',
    'compras_gastos','caja_chica','cuentas_bancarias','centros_costo',
    'centros_beneficio','stock','inventario_conteos','kardex',
    'personal_documentos','periodos_nomina','nomina_detalle','os_clientes',
    'ordenes_trabajo','valorizaciones','devoluciones_proveedor',
    'devoluciones_proveedor_lineas'
  ];
BEGIN
  FOREACH v_tabla IN ARRAY v_tablas LOOP
    EXECUTE format(
      $sql$
        INSERT INTO pg_temp.b0b_manifest (
          empresa_id,
          multisociedad_habilitado_previo,
          tabla,
          filas_totales,
          filas_afectadas,
          ids,
          ids_totales
        )
        SELECT
          $1,
          (
            SELECT e.multisociedad_habilitado
            FROM public.empresas e
            WHERE e.id = $1
          ),
          %L,
          count(*),
          count(*) FILTER (WHERE sociedad_id IS NULL),
          coalesce(
            jsonb_agg(id::text ORDER BY id::text)
              FILTER (WHERE sociedad_id IS NULL),
            '[]'::jsonb
          ),
          coalesce(jsonb_agg(id::text ORDER BY id::text), '[]'::jsonb)
        FROM public.%I
        WHERE empresa_id = $1
      $sql$,
      v_tabla,
      v_tabla
    ) USING v_empresa_id;

    EXECUTE format(
      $sql$
        INSERT INTO pg_temp.b0b_otros_tenants_fingerprint (
          tabla,
          filas,
          huella_xmin
        )
        SELECT
          %L,
          count(*),
          md5(coalesce(
            string_agg(
              id::text || '|' || xmin::text,
              E'\n' ORDER BY id::text
            ),
            ''
          ))
        FROM public.%I
        WHERE empresa_id <> $1
      $sql$,
      v_tabla,
      v_tabla
    ) USING v_empresa_id;
  END LOOP;
END;
$$;

INSERT INTO b0b_correlativos_manifest (
  id,
  empresa_id,
  tipo_documento,
  serie,
  ultimo_numero
)
SELECT
  id::text,
  empresa_id,
  tipo_documento,
  serie,
  ultimo_numero
FROM public.correlativos_documentos
WHERE empresa_id = current_setting('tideo.b0b_empresa_id')
ORDER BY tipo_documento, serie, id;

INSERT INTO b0b_otros_tenants_fingerprint (tabla, filas, huella_xmin)
SELECT
  '__empresas__',
  count(*),
  md5(coalesce(string_agg(id || '|' || xmin::text, E'\n' ORDER BY id), ''))
FROM public.empresas
WHERE id <> current_setting('tideo.b0b_empresa_id');

INSERT INTO b0b_otros_tenants_fingerprint (tabla, filas, huella_xmin)
SELECT
  '__sociedades__',
  count(*),
  md5(coalesce(
    string_agg(id::text || '|' || xmin::text, E'\n' ORDER BY id::text),
    ''
  ))
FROM public.sociedades
WHERE empresa_id <> current_setting('tideo.b0b_empresa_id');

-- RESULTADO 1: copiar y guardar antes de continuar con una ejecucion supervisada.
SELECT
  empresa_id,
  multisociedad_habilitado_previo,
  tabla,
  filas_totales,
  filas_afectadas,
  ids,
  ids_totales
FROM b0b_manifest
ORDER BY tabla;

-- RESULTADO 2: snapshot exacto de numeracion que debe preservarse.
SELECT
  id,
  empresa_id,
  tipo_documento,
  serie,
  ultimo_numero
FROM b0b_correlativos_manifest
ORDER BY tipo_documento, serie, id;

-- B4. COMPLETADO DE IDENTIDAD DE LA SOCIEDAD PRINCIPAL
UPDATE public.sociedades s
SET direccion_fiscal = coalesce(
      s.direccion_fiscal,
      nullif(btrim(ec.direccion), '')
    ),
    logo_url = coalesce(
      s.logo_url,
      nullif(btrim(ec.logo_url), '')
    ),
    firma_url = coalesce(
      s.firma_url,
      nullif(btrim(ec.firma_url), '')
    ),
    regimen_laboral = coalesce(
      s.regimen_laboral,
      nullif(btrim(ec.regimen_laboral_empresa), ''),
      'general'
    ),
    pct_quincena_1 = coalesce(
      s.pct_quincena_1,
      ec.pct_quincena_1,
      50
    ),
    updated_at = now()
FROM public.empresas e
LEFT JOIN public.empresa_config ec ON ec.empresa_id = e.id
WHERE s.id = '609a2f33-d057-411f-a001-4e3e83f700d0'::uuid
  AND s.id = current_setting('tideo.b0b_sociedad_id')::uuid
  AND s.empresa_id = current_setting('tideo.b0b_empresa_id')
  AND e.id = s.empresa_id
  AND (
    s.direccion_fiscal IS NULL
    OR s.logo_url IS NULL
    OR s.firma_url IS NULL
    OR s.regimen_laboral IS NULL
    OR s.pct_quincena_1 IS NULL
  );

-- B5. BACKFILL: fuentes de la cadena comercial.
UPDATE public.cotizaciones
SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id')
  AND sociedad_id IS NULL;

UPDATE public.centros_costo
SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id')
  AND sociedad_id IS NULL;

UPDATE public.centros_beneficio
SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id')
  AND sociedad_id IS NULL;

-- El SET aparentemente neutro dispara los triggers de derivacion de la 396.
UPDATE public.os_clientes
SET sociedad_id = sociedad_id
WHERE empresa_id = current_setting('tideo.b0b_empresa_id')
  AND sociedad_id IS NULL;

UPDATE public.ordenes_trabajo
SET sociedad_id = sociedad_id
WHERE empresa_id = current_setting('tideo.b0b_empresa_id')
  AND sociedad_id IS NULL;

UPDATE public.valorizaciones
SET sociedad_id = sociedad_id
WHERE empresa_id = current_setting('tideo.b0b_empresa_id')
  AND sociedad_id IS NULL;

UPDATE public.facturas
SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id')
  AND sociedad_id IS NULL;

-- Tablas independientes. Correlativos queda dentro de la misma transaccion.
UPDATE public.cxc SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id') AND sociedad_id IS NULL;

UPDATE public.cxp SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id') AND sociedad_id IS NULL;

UPDATE public.ordenes_venta SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id') AND sociedad_id IS NULL;

UPDATE public.financiamientos SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id') AND sociedad_id IS NULL;

UPDATE public.correlativos_documentos SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id') AND sociedad_id IS NULL;

UPDATE public.ordenes_compra SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id') AND sociedad_id IS NULL;

UPDATE public.ordenes_servicio_interna SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id') AND sociedad_id IS NULL;

UPDATE public.compras_gastos SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id') AND sociedad_id IS NULL;

UPDATE public.caja_chica SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id') AND sociedad_id IS NULL;

UPDATE public.cuentas_bancarias SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id') AND sociedad_id IS NULL;

UPDATE public.stock SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id') AND sociedad_id IS NULL;

UPDATE public.inventario_conteos SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id') AND sociedad_id IS NULL;

UPDATE public.kardex SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id') AND sociedad_id IS NULL;

UPDATE public.devoluciones_proveedor SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id') AND sociedad_id IS NULL;

UPDATE public.devoluciones_proveedor_lineas SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id') AND sociedad_id IS NULL;

-- Nomina: periodo antes que detalle para satisfacer el trigger de coherencia.
UPDATE public.periodos_nomina
SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id')
  AND sociedad_id IS NULL;

UPDATE public.nomina_detalle
SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id')
  AND sociedad_id IS NULL;

-- Aislamiento acotado del trigger desbloquear_asistencia_por_contrato.
SET LOCAL session_replication_role = replica;

UPDATE public.personal_documentos
SET sociedad_id = current_setting('tideo.b0b_sociedad_id')::uuid
WHERE empresa_id = current_setting('tideo.b0b_empresa_id')
  AND sociedad_id IS NULL;

SET LOCAL session_replication_role = origin;

-- B6. VERIFICACIONES FINALES
DO $$
DECLARE
  v_empresa_id text := current_setting('tideo.b0b_empresa_id');
  v_sociedad_id uuid := current_setting('tideo.b0b_sociedad_id')::uuid;
  v_tabla text;
  v_nulos bigint;
  v_filas bigint;
  v_ids jsonb;
  v_manifest record;
  v_total_sociedades bigint;
  v_activas bigint;
  v_principales bigint;
  v_activas_principales bigint;
  v_ot_incoherentes bigint;
  v_tablas constant text[] := ARRAY[
    'facturas','cotizaciones','cxc','cxp','ordenes_venta','financiamientos',
    'correlativos_documentos','ordenes_compra','ordenes_servicio_interna',
    'compras_gastos','caja_chica','cuentas_bancarias','centros_costo',
    'centros_beneficio','stock','inventario_conteos','kardex',
    'personal_documentos','periodos_nomina','nomina_detalle','os_clientes',
    'ordenes_trabajo','valorizaciones','devoluciones_proveedor',
    'devoluciones_proveedor_lineas'
  ];
BEGIN
  FOREACH v_tabla IN ARRAY v_tablas LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE empresa_id = $1 AND sociedad_id IS NULL',
      v_tabla
    ) INTO v_nulos USING v_empresa_id;

    IF v_nulos <> 0 THEN
      RAISE EXCEPTION
        'B0B_VERIFY_NULL: %.% conserva % fila(s) con sociedad_id NULL',
        v_empresa_id,
        v_tabla,
        v_nulos;
    END IF;

    EXECUTE format(
      $sql$
        SELECT
          count(*),
          coalesce(jsonb_agg(id::text ORDER BY id::text), '[]'::jsonb)
        FROM public.%I
        WHERE empresa_id = $1
      $sql$,
      v_tabla
    ) INTO v_filas, v_ids USING v_empresa_id;

    SELECT * INTO STRICT v_manifest
    FROM pg_temp.b0b_manifest
    WHERE empresa_id = v_empresa_id
      AND tabla = v_tabla;

    IF v_filas <> v_manifest.filas_totales OR v_ids <> v_manifest.ids_totales THEN
      RAISE EXCEPTION
        'B0B_VERIFY_MANIFEST: cambiaron filas o IDs de %.%',
        v_empresa_id,
        v_tabla;
    END IF;
  END LOOP;

  SELECT
    count(*),
    count(*) FILTER (WHERE activa),
    count(*) FILTER (WHERE es_principal),
    count(*) FILTER (WHERE activa AND es_principal)
  INTO
    v_total_sociedades,
    v_activas,
    v_principales,
    v_activas_principales
  FROM public.sociedades
  WHERE empresa_id = v_empresa_id;

  IF v_principales <> 1
     OR v_activas_principales <> 1 THEN
    RAISE EXCEPTION
      'B0B_VERIFY_SOCIEDAD: total=%, activas=%, principales=%, activas_principales=%',
      v_total_sociedades,
      v_activas,
      v_principales,
      v_activas_principales;
  END IF;

  IF v_sociedad_id <> '609a2f33-d057-411f-a001-4e3e83f700d0'::uuid THEN
    RAISE EXCEPTION
      'B0B_VERIFY_SOCIEDAD_DESTINO: sociedad principal inesperada para %: %',
      v_empresa_id,
      v_sociedad_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.empresas
    WHERE id = v_empresa_id
      AND multisociedad_habilitado = true
  ) THEN
    RAISE EXCEPTION 'B0B_VERIFY_FLAG: el tenant no quedo activado';
  END IF;

  SELECT count(*) INTO v_ot_incoherentes
  FROM public.ordenes_trabajo ot
  JOIN public.os_clientes os
    ON os.id = ot.os_cliente_id
   AND os.empresa_id = ot.empresa_id
  WHERE ot.empresa_id = v_empresa_id
    AND ot.sociedad_id IS DISTINCT FROM os.sociedad_id;

  IF v_ot_incoherentes <> 0 THEN
    RAISE EXCEPTION
      'B0B_VERIFY_OT_OS: existen % OT con sociedad distinta de su OS Cliente',
      v_ot_incoherentes;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.os_clientes os
    JOIN public.cotizaciones c
      ON c.id = os.cotizacion_id
     AND c.empresa_id = os.empresa_id
    WHERE os.empresa_id = v_empresa_id
      AND os.sociedad_id IS DISTINCT FROM c.sociedad_id
  ) THEN
    RAISE EXCEPTION 'B0B_VERIFY_OS_COTIZACION: sociedad incoherente';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.valorizaciones v
    JOIN public.os_clientes os
      ON os.id = v.os_cliente_id
     AND os.empresa_id = v.empresa_id
    WHERE v.empresa_id = v_empresa_id
      AND v.sociedad_id IS DISTINCT FROM os.sociedad_id
  ) THEN
    RAISE EXCEPTION 'B0B_VERIFY_VALORIZACION_OS: sociedad incoherente';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.nomina_detalle nd
    JOIN public.periodos_nomina pn
      ON pn.id::text = nd.periodo_id
     AND pn.empresa_id = nd.empresa_id
    WHERE nd.empresa_id = v_empresa_id
      AND nd.sociedad_id IS DISTINCT FROM pn.sociedad_id
  ) THEN
    RAISE EXCEPTION 'B0B_VERIFY_NOMINA: detalle y periodo tienen distinta sociedad';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sociedades s
    WHERE s.id = v_sociedad_id
      AND (
        s.regimen_laboral IS NULL
        OR s.pct_quincena_1 IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'B0B_VERIFY_IDENTIDAD: faltan parametros de nomina de la sociedad';
  END IF;
END;
$$;

-- Los correlativos deben conservar exactamente ID, tipo, serie y ultimo_numero.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_temp.b0b_correlativos_manifest m
    FULL JOIN (
      SELECT id, tipo_documento, serie, ultimo_numero
      FROM public.correlativos_documentos
      WHERE empresa_id = current_setting('tideo.b0b_empresa_id')
    ) c ON c.id::text = m.id
    WHERE m.id IS NULL
       OR c.id IS NULL
       OR c.tipo_documento IS DISTINCT FROM m.tipo_documento
       OR c.serie IS DISTINCT FROM m.serie
       OR c.ultimo_numero IS DISTINCT FROM m.ultimo_numero
  ) THEN
    RAISE EXCEPTION 'B0B_VERIFY_CORRELATIVOS: la numeracion cambio respecto del manifiesto';
  END IF;
END;
$$;

-- Compara xmin e IDs de todas las filas fuera del tenant mientras los locks
-- siguen vigentes. Cualquier UPDATE/INSERT/DELETE ajeno aborta la transaccion.
DO $$
DECLARE
  v_empresa_id text := current_setting('tideo.b0b_empresa_id');
  v_tabla text;
  v_filas bigint;
  v_huella text;
  v_esperada record;
  v_tablas constant text[] := ARRAY[
    'facturas','cotizaciones','cxc','cxp','ordenes_venta','financiamientos',
    'correlativos_documentos','ordenes_compra','ordenes_servicio_interna',
    'compras_gastos','caja_chica','cuentas_bancarias','centros_costo',
    'centros_beneficio','stock','inventario_conteos','kardex',
    'personal_documentos','periodos_nomina','nomina_detalle','os_clientes',
    'ordenes_trabajo','valorizaciones','devoluciones_proveedor',
    'devoluciones_proveedor_lineas'
  ];
BEGIN
  FOREACH v_tabla IN ARRAY v_tablas LOOP
    EXECUTE format(
      $sql$
        SELECT
          count(*),
          md5(coalesce(
            string_agg(
              id::text || '|' || xmin::text,
              E'\n' ORDER BY id::text
            ),
            ''
          ))
        FROM public.%I
        WHERE empresa_id <> $1
      $sql$,
      v_tabla
    ) INTO v_filas, v_huella USING v_empresa_id;

    SELECT * INTO STRICT v_esperada
    FROM pg_temp.b0b_otros_tenants_fingerprint
    WHERE tabla = v_tabla;

    IF v_filas <> v_esperada.filas OR v_huella <> v_esperada.huella_xmin THEN
      RAISE EXCEPTION
        'B0B_VERIFY_OTROS_TENANTS: cambio detectado en %',
        v_tabla;
    END IF;
  END LOOP;

  SELECT
    count(*),
    md5(coalesce(string_agg(id || '|' || xmin::text, E'\n' ORDER BY id), ''))
  INTO v_filas, v_huella
  FROM public.empresas
  WHERE id <> v_empresa_id;

  SELECT * INTO STRICT v_esperada
  FROM pg_temp.b0b_otros_tenants_fingerprint
  WHERE tabla = '__empresas__';

  IF v_filas <> v_esperada.filas OR v_huella <> v_esperada.huella_xmin THEN
    RAISE EXCEPTION 'B0B_VERIFY_OTROS_TENANTS: cambio detectado en empresas';
  END IF;

  SELECT
    count(*),
    md5(coalesce(
      string_agg(id::text || '|' || xmin::text, E'\n' ORDER BY id::text),
      ''
    ))
  INTO v_filas, v_huella
  FROM public.sociedades
  WHERE empresa_id <> v_empresa_id;

  SELECT * INTO STRICT v_esperada
  FROM pg_temp.b0b_otros_tenants_fingerprint
  WHERE tabla = '__sociedades__';

  IF v_filas <> v_esperada.filas OR v_huella <> v_esperada.huella_xmin THEN
    RAISE EXCEPTION 'B0B_VERIFY_OTROS_TENANTS: cambio detectado en sociedades';
  END IF;
END;
$$;

-- RESULTADO FINAL. Solo se alcanza si todas las verificaciones pasaron.
SELECT
  e.id AS empresa_id,
  e.multisociedad_habilitado,
  s.id AS sociedad_id,
  s.codigo,
  s.nombre,
  s.activa,
  s.es_principal,
  s.regimen_laboral,
  s.pct_quincena_1,
  (SELECT count(*) FROM pg_temp.b0b_manifest) AS tablas_manifestadas,
  (SELECT sum(filas_afectadas) FROM pg_temp.b0b_manifest) AS filas_backfilleadas
FROM public.empresas e
JOIN public.sociedades s
  ON s.empresa_id = e.id
 AND s.activa = true
 AND s.es_principal = true
WHERE e.id = current_setting('tideo.b0b_empresa_id');

COMMIT;
