-- Restringe la ejecución de funciones internas a los roles requeridos.

-- Funciones disponibles para sesiones autenticadas y service_role.
revoke execute on function public.registrar_gasto_pagado_auto(jsonb) from public;
revoke execute on function public.registrar_gasto_pagado_auto(jsonb) from anon;
grant execute on function public.registrar_gasto_pagado_auto(jsonb) to authenticated, service_role;

revoke execute on function public.revertir_gasto_pagado_auto(text) from public;
revoke execute on function public.revertir_gasto_pagado_auto(text) from anon;
grant execute on function public.revertir_gasto_pagado_auto(text) to authenticated, service_role;

revoke execute on function public.reasignar_padre_posicion(uuid, uuid) from public;
revoke execute on function public.reasignar_padre_posicion(uuid, uuid) from anon;
grant execute on function public.reasignar_padre_posicion(uuid, uuid) to authenticated, service_role;

revoke execute on function public.evaluar_sar_no_llegada(text, date) from public;
revoke execute on function public.evaluar_sar_no_llegada(text, date) from anon;
grant execute on function public.evaluar_sar_no_llegada(text, date) to authenticated, service_role;

revoke execute on function public.fusionar_cargos(text, text) from public;
revoke execute on function public.fusionar_cargos(text, text) from anon;
grant execute on function public.fusionar_cargos(text, text) to authenticated, service_role;

revoke execute on function public.sincronizar_jornada_derivados(text) from public;
revoke execute on function public.sincronizar_jornada_derivados(text) from anon;
grant execute on function public.sincronizar_jornada_derivados(text) to authenticated, service_role;

revoke execute on function public.eliminar_asignacion_jornada(text, boolean, text) from public;
revoke execute on function public.eliminar_asignacion_jornada(text, boolean, text) from anon;
grant execute on function public.eliminar_asignacion_jornada(text, boolean, text) to authenticated, service_role;

revoke execute on function public.eliminar_tenant_completo(text) from public;
revoke execute on function public.eliminar_tenant_completo(text) from anon;
grant execute on function public.eliminar_tenant_completo(text) to authenticated, service_role;

revoke execute on function public.crear_tenant_con_admin(text, text, text, text, text, text, text, text, text) from public;
revoke execute on function public.crear_tenant_con_admin(text, text, text, text, text, text, text, text, text) from anon;
grant execute on function public.crear_tenant_con_admin(text, text, text, text, text, text, text, text, text) to authenticated, service_role;

revoke execute on function public.activar_multisociedad_legacy(text) from public;
revoke execute on function public.activar_multisociedad_legacy(text) from anon;
grant execute on function public.activar_multisociedad_legacy(text) to authenticated, service_role;

-- Funciones disponibles únicamente para service_role.
revoke execute on function public.asignar_permisos_default_a_rol(text, text) from public;
revoke execute on function public.asignar_permisos_default_a_rol(text, text) from anon;
revoke execute on function public.asignar_permisos_default_a_rol(text, text) from authenticated;
grant execute on function public.asignar_permisos_default_a_rol(text, text) to service_role;

revoke execute on function public.posicion_asignar_usuario(text, uuid, uuid, uuid, uuid) from public;
revoke execute on function public.posicion_asignar_usuario(text, uuid, uuid, uuid, uuid) from anon;
revoke execute on function public.posicion_asignar_usuario(text, uuid, uuid, uuid, uuid) from authenticated;
grant execute on function public.posicion_asignar_usuario(text, uuid, uuid, uuid, uuid) to service_role;

revoke execute on function public.posicion_detach_origen(uuid) from public;
revoke execute on function public.posicion_detach_origen(uuid) from anon;
revoke execute on function public.posicion_detach_origen(uuid) from authenticated;
grant execute on function public.posicion_detach_origen(uuid) to service_role;

revoke execute on function public.posicion_guardar_asignacion_principal(uuid, text, uuid, text, text, text, uuid) from public;
revoke execute on function public.posicion_guardar_asignacion_principal(uuid, text, uuid, text, text, text, uuid) from anon;
revoke execute on function public.posicion_guardar_asignacion_principal(uuid, text, uuid, text, text, text, uuid) from authenticated;
grant execute on function public.posicion_guardar_asignacion_principal(uuid, text, uuid, text, text, text, uuid) to service_role;

revoke execute on function public.posicion_guardar_asignaciones_extra(text, uuid, jsonb) from public;
revoke execute on function public.posicion_guardar_asignaciones_extra(text, uuid, jsonb) from anon;
revoke execute on function public.posicion_guardar_asignaciones_extra(text, uuid, jsonb) from authenticated;
grant execute on function public.posicion_guardar_asignaciones_extra(text, uuid, jsonb) to service_role;

revoke execute on function public._consolidar_posiciones_mover(uuid, uuid) from public;
revoke execute on function public._consolidar_posiciones_mover(uuid, uuid) from anon;
revoke execute on function public._consolidar_posiciones_mover(uuid, uuid) from authenticated;
grant execute on function public._consolidar_posiciones_mover(uuid, uuid) to service_role;

revoke execute on function public.consolidar_posiciones_duplicadas(text, boolean) from public;
revoke execute on function public.consolidar_posiciones_duplicadas(text, boolean) from anon;
revoke execute on function public.consolidar_posiciones_duplicadas(text, boolean) from authenticated;
grant execute on function public.consolidar_posiciones_duplicadas(text, boolean) to service_role;

revoke execute on function public.consolidar_posiciones_duplicadas_todos_tenants(boolean) from public;
revoke execute on function public.consolidar_posiciones_duplicadas_todos_tenants(boolean) from anon;
revoke execute on function public.consolidar_posiciones_duplicadas_todos_tenants(boolean) from authenticated;
grant execute on function public.consolidar_posiciones_duplicadas_todos_tenants(boolean) to service_role;

revoke execute on function public.recalcular_estado_posicion(uuid) from public;
revoke execute on function public.recalcular_estado_posicion(uuid) from anon;
revoke execute on function public.recalcular_estado_posicion(uuid) from authenticated;
grant execute on function public.recalcular_estado_posicion(uuid) to service_role;

revoke execute on function public.sincronizar_cargo_posicion(uuid) from public;
revoke execute on function public.sincronizar_cargo_posicion(uuid) from anon;
revoke execute on function public.sincronizar_cargo_posicion(uuid) from authenticated;
grant execute on function public.sincronizar_cargo_posicion(uuid) to service_role;

revoke execute on function public.procesar_contratos_vencimiento(text) from public;
revoke execute on function public.procesar_contratos_vencimiento(text) from anon;
revoke execute on function public.procesar_contratos_vencimiento(text) from authenticated;
grant execute on function public.procesar_contratos_vencimiento(text) to service_role;

revoke execute on function public.procesar_sin_contrato_digital(text, boolean) from public;
revoke execute on function public.procesar_sin_contrato_digital(text, boolean) from anon;
revoke execute on function public.procesar_sin_contrato_digital(text, boolean) from authenticated;
grant execute on function public.procesar_sin_contrato_digital(text, boolean) to service_role;

revoke execute on function public.procesar_rutina_diaria_contratos() from public;
revoke execute on function public.procesar_rutina_diaria_contratos() from anon;
revoke execute on function public.procesar_rutina_diaria_contratos() from authenticated;
grant execute on function public.procesar_rutina_diaria_contratos() to service_role;

revoke execute on function public.generar_notificaciones_oc_vencidas(text) from public;
revoke execute on function public.generar_notificaciones_oc_vencidas(text) from anon;
revoke execute on function public.generar_notificaciones_oc_vencidas(text) from authenticated;
grant execute on function public.generar_notificaciones_oc_vencidas(text) to service_role;

revoke execute on function public.generar_notificaciones_documentarias(text) from public;
revoke execute on function public.generar_notificaciones_documentarias(text) from anon;
revoke execute on function public.generar_notificaciones_documentarias(text) from authenticated;
grant execute on function public.generar_notificaciones_documentarias(text) to service_role;

revoke execute on function public.generar_notificaciones_documentarias_base_213(text) from public;
revoke execute on function public.generar_notificaciones_documentarias_base_213(text) from anon;
revoke execute on function public.generar_notificaciones_documentarias_base_213(text) from authenticated;
grant execute on function public.generar_notificaciones_documentarias_base_213(text) to service_role;

revoke execute on function public.generar_solpes_reorden(text) from public;
revoke execute on function public.generar_solpes_reorden(text) from anon;
revoke execute on function public.generar_solpes_reorden(text) from authenticated;
grant execute on function public.generar_solpes_reorden(text) to service_role;

revoke execute on function public.resolver_unidad_organizacional(text, text) from public;
revoke execute on function public.resolver_unidad_organizacional(text, text) from anon;
revoke execute on function public.resolver_unidad_organizacional(text, text) from authenticated;
grant execute on function public.resolver_unidad_organizacional(text, text) to service_role;

revoke execute on function public.crear_categorias_base(text) from public;
revoke execute on function public.crear_categorias_base(text) from anon;
revoke execute on function public.crear_categorias_base(text) from authenticated;
grant execute on function public.crear_categorias_base(text) to service_role;

revoke execute on function public.vincular_usuario_a_empresa(text, text, text, boolean, text) from public;
revoke execute on function public.vincular_usuario_a_empresa(text, text, text, boolean, text) from anon;
revoke execute on function public.vincular_usuario_a_empresa(text, text, text, boolean, text) from authenticated;
grant execute on function public.vincular_usuario_a_empresa(text, text, text, boolean, text) to service_role;

revoke execute on function public.notificar_rrhh_ola2_once(text, uuid, text, text, text, text, text, text) from public;
revoke execute on function public.notificar_rrhh_ola2_once(text, uuid, text, text, text, text, text, text) from anon;
revoke execute on function public.notificar_rrhh_ola2_once(text, uuid, text, text, text, text, text, text) from authenticated;
grant execute on function public.notificar_rrhh_ola2_once(text, uuid, text, text, text, text, text, text) to service_role;
