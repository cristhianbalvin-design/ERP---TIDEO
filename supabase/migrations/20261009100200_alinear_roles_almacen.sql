-- Alinea al estándar (inventario y recepciones: ver/crear/editar) dos roles manuales de
-- almacén que diferían. Solo toca ver/crear/editar; el resto de permisos se conserva.
-- APLICADA EN PRODUCCIÓN el 2026-10-09 desde el SQL Editor; registrar con
-- `supabase migration repair --status applied <versión>`.

-- 2) Alineación (upsert solo de ver/crear/editar)
INSERT INTO public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar,
                                   puede_anular, puede_aprobar, puede_exportar,
                                   puede_ver_costos, puede_ver_finanzas)
SELECT r.id, x.pantalla, true, true, true, false, false, false, false, false
FROM public.roles r
CROSS JOIN (VALUES ('inventario'), ('recepciones')) AS x(pantalla)
WHERE r.id IN ('rol_emp_20541435833_32lzu', 'rol_emp_20606120487_iux26')
ON CONFLICT (rol_id, pantalla) DO UPDATE
SET puede_ver = true, puede_crear = true, puede_editar = true;
