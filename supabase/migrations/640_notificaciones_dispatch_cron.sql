-- 640: Habilita pg_net y programa el despacho de correos del motor de notificaciones.
-- El cron llama cada 15 minutos a la edge function notificaciones-dispatch solo si hay correos pendientes
-- y si existe en Vault el secreto 'notif_dispatch_key' (la clave secreta del proyecto). Sin secreto no hace nada.

create extension if not exists pg_net with schema extensions;

create or replace function public.notif_disparar_dispatch()
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_key text;
begin
  if not exists (
    select 1 from public.notif_envios
    where canal = 'correo' and estado = 'pendiente' and proximo_intento_en <= now()
  ) then
    return;
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'notif_dispatch_key' limit 1;
  if nullif(v_key, '') is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://atqwyjfidfoepthygfoo.supabase.co/functions/v1/notificaciones-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('limit', 50),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function public.notif_disparar_dispatch() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'notificaciones-dispatch-correo';
select cron.schedule('notificaciones-dispatch-correo', '*/15 * * * *', 'select public.notif_disparar_dispatch();');

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception '640: pg_net no quedó habilitada';
  end if;
  if not exists (select 1 from cron.job where jobname = 'notificaciones-dispatch-correo') then
    raise exception '640: falta el cron notificaciones-dispatch-correo';
  end if;
  if to_regprocedure('public.notif_reclamar_correos(integer)') is null then
    raise exception '640: aplica primero la migración 639';
  end if;
end $$;
