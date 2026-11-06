-- 653: «Probar ahora» y la rutina diaria despachan correo y WhatsApp al instante.
-- Antes, los avisos generados esperaban al ciclo de despacho de 15 minutos.
-- Se parte de pg_get_functiondef de las versiones remotas vigentes.

create or replace function public.notif_ejecutar_ahora(p_empresa_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_res jsonb;
begin
  if not public.usuario_es_admin_empresa(p_empresa_id) then
    raise exception 'Se requiere ser administrador de la empresa.' using errcode = '42501';
  end if;
  v_res := public.notif_ejecutar_empresa(p_empresa_id);
  perform public.notif_disparar_dispatch();
  return v_res;
end;
$function$;

create or replace function public.notif_rutina_diaria()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_emp text;
begin
  for v_emp in
    select distinct r.empresa_id from public.notif_reglas_empresa r
    join public.empresas e on e.id = r.empresa_id
    where r.activo and coalesce(e.estado, 'activo') in ('activa','activo','demo')
  loop
    perform public.notif_ejecutar_empresa(v_emp);
  end loop;
  perform public.notif_disparar_dispatch();
end;
$function$;

do $chk$
begin
  if position('notif_disparar_dispatch' in pg_get_functiondef('public.notif_ejecutar_ahora(text)'::regprocedure)) = 0
     or position('usuario_es_admin_empresa' in pg_get_functiondef('public.notif_ejecutar_ahora(text)'::regprocedure)) = 0 then
    raise exception '653 chk: notif_ejecutar_ahora sin ajuste';
  end if;
  if position('notif_disparar_dispatch' in pg_get_functiondef('public.notif_rutina_diaria()'::regprocedure)) = 0 then
    raise exception '653 chk: notif_rutina_diaria sin ajuste';
  end if;
end
$chk$;
