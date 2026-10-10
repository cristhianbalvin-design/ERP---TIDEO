-- 617: Manual de pantallas global de Aria. Revisar protocolo; termina en ROLLBACK.
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
INSERT INTO public.asistente_manual_fichas (clave,tipo,pantalla_key,titulo,resumen,fuentes,revision) VALUES ('caja','pantalla','caja','Caja Chica','Administra fondos, egresos, rendiciones, reposiciones y arqueos de caja chica.','["src/pages_fin.jsx","src/services/cajaChicaService.js"]'::jsonb,'dd85e0e');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('caja',1,'caja','caja','crear','Crea un fondo indicando su responsable, importe y origen. Revisa los datos antes de confirmar.');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('caja',2,'caja',NULL,NULL,'Registra un egreso desde el fondo correspondiente e ingresa el concepto y su sustento.');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('caja',3,'caja',NULL,NULL,'Presenta la rendición del fondo indicando el periodo y el importe solicitado. La solicitud queda disponible para revisión.');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('caja',4,'caja','caja','aprobar','Revisa una rendición y registra el importe aprobado para continuar con la reposición.');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('caja',5,'caja',NULL,NULL,'Registra el arqueo con el efectivo contado y los comprobantes pendientes. Luego revisa las diferencias antes de cerrar el fondo.');
INSERT INTO public.asistente_manual_fichas (clave,tipo,pantalla_key,titulo,resumen,fuentes,revision) VALUES ('compras_gastos','pantalla','compras_gastos','Compras / Gastos','Registra y consulta compras y gastos con sus documentos de sustento.','["src/pages_ops.jsx","src/data.js"]'::jsonb,'dd85e0e');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('compras_gastos',1,'compras_gastos',NULL,NULL,'Revisa los gastos y compras registrados, y usa los filtros para localizar un documento o proveedor.');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('compras_gastos',2,'compras_gastos','caja','editar','Para editar un registro, ábrelo y guarda los cambios permitidos en el formulario. En esta pantalla la edición efectiva exige el permiso de edición de Caja.');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('compras_gastos',3,'compras_gastos',NULL,NULL,'Registra una compra o gasto con sus datos y adjunta el sustento correspondiente.');
INSERT INTO public.asistente_manual_fichas (clave,tipo,pantalla_key,titulo,resumen,fuentes,revision) VALUES ('proceso_caja_chica','proceso',NULL,'Ciclo del fondo de Caja Chica','Controla un fondo desde su asignación hasta el arqueo y cierre.','["src/pages_fin.jsx","src/services/cajaChicaService.js"]'::jsonb,'dd85e0e');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('proceso_caja_chica',1,'caja','caja','crear','Crea el fondo e indica su responsable, importe y origen. Revisa los datos antes de confirmar.');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('proceso_caja_chica',2,'caja',NULL,NULL,'Registra cada egreso contra el fondo y adjunta el sustento disponible.');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('proceso_caja_chica',3,'caja',NULL,NULL,'Presenta la rendición indicando el periodo y el importe solicitado.');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('proceso_caja_chica',4,'caja','caja','aprobar','Revisa y aprueba el importe de la rendición para gestionar la reposición del fondo.');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('proceso_caja_chica',5,'caja',NULL,NULL,'Realiza el arqueo informando el efectivo contado y los comprobantes pendientes; revisa diferencias y cierra el fondo.');
INSERT INTO public.asistente_manual_fichas (clave,tipo,pantalla_key,titulo,resumen,fuentes,revision) VALUES ('proceso_solpe_pago','proceso',NULL,'De la SOLPE al pago conciliado','Sigue una compra desde la solicitud interna hasta su pago y conciliación bancaria.','["src/pages_ops.jsx","src/pages_fin.jsx","src/data.js"]'::jsonb,'dd85e0e');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('proceso_solpe_pago',1,'solpe',NULL,NULL,'Registra o revisa la solicitud de compra y su estado. La solicitud inicia el recorrido de compra.');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('proceso_solpe_pago',2,'ordenes_compra',NULL,NULL,'Continúa con la orden de compra vinculada a la solicitud. Revisa sus datos y el estado de atención.');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('proceso_solpe_pago',3,'recepciones',NULL,NULL,'Registra o consulta la recepción de los bienes o servicios de la orden.');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('proceso_solpe_pago',4,'cxp',NULL,NULL,'Revisa el documento por pagar asociado y su vencimiento antes de programar el pago.');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('proceso_solpe_pago',5,'tesoreria',NULL,NULL,'Registra el movimiento de pago y relaciónalo con el movimiento bancario correspondiente.');
INSERT INTO public.asistente_manual_fichas (clave,tipo,pantalla_key,titulo,resumen,fuentes,revision) VALUES ('tesoreria','pantalla','tesoreria','Tesorería y match bancario','Consulta saldos y movimientos bancarios, y relaciona movimientos con operaciones registradas.','["src/pages_fin.jsx","src/services/tesoreriaService.js"]'::jsonb,'dd85e0e');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('tesoreria',1,'tesoreria',NULL,NULL,'Revisa las cuentas bancarias y sus saldos por moneda. El resumen también muestra ingresos y egresos del mes.');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('tesoreria',2,'tesoreria',NULL,NULL,'Abre los movimientos para revisar ingresos, egresos y referencias. Usa los filtros disponibles para acotar la lista.');
INSERT INTO public.asistente_manual_pasos (ficha_clave,orden,pantalla_key,permiso_pantalla,permiso_accion,texto) VALUES ('tesoreria',3,'tesoreria',NULL,NULL,'Enlaza un movimiento bancario con el registro correspondiente mediante la conciliación. Verifica la cuenta, fecha e importe antes de guardar.');
/* MANUAL_SEED_END */

-- Verificación manual (ejecutar con roles/sesiones de prueba; solo SELECT).
-- SELECT count(*) AS fichas FROM public.asistente_manual_fichas;
-- SELECT count(*) AS pasos FROM public.asistente_manual_pasos;
-- SELECT public.asistente_consultar_manual('<empresa_con_permiso>', 'rendición', 'caja', 5);
-- SELECT public.asistente_consultar_manual('<empresa_sin_permiso>', 'rendición', 'caja', 5); -- respuesta: sin resultados
-- SET ROLE authenticated; SELECT * FROM public.asistente_manual_fichas; -- RLS solo muestra pantallas autorizadas
-- SET ROLE authenticated; INSERT INTO public.asistente_manual_fichas(clave,tipo,pantalla_key,titulo,resumen,fuentes,revision) VALUES ('prueba','pantalla','caja','x','x','[]','x'); -- debe fallar

ROLLBACK;
