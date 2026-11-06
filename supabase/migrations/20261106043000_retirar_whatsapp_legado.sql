-- Retira el WhatsApp legado (migración 234), reemplazado por el motor de notificaciones (notif_envios).
-- Se mantienen whatsapp_plantillas, whatsapp_matriz_destinatarios y whatsapp_envios porque la firma de
-- contratos las consulta (firma_contrato_enlace / firma_contrato_otp). Solo se borran las filas de los avisos legados.
drop trigger if exists trg_whatsapp_enqueue_notificacion on public.notificaciones_sistema;
drop function if exists public.whatsapp_enqueue_from_notificacion();
drop function if exists public.whatsapp_tipo_alerta_desde_notificacion(text, jsonb);

delete from public.whatsapp_matriz_destinatarios
where tipo_alerta in ('contrato_por_vencer','doc_dni_por_vencer','doc_licencia_por_vencer','doc_sctr_por_vencer','sar_no_llegada');
delete from public.whatsapp_plantillas
where tipo_alerta in ('contrato_por_vencer','doc_dni_por_vencer','doc_licencia_por_vencer','doc_sctr_por_vencer','sar_no_llegada');

comment on table public.whatsapp_plantillas is 'Solo firma de contratos (firma_contrato_enlace, firma_contrato_otp). Las notificaciones usan notif_envios y la plantilla Meta opera_alerta.';
comment on table public.whatsapp_matriz_destinatarios is 'Solo firma de contratos (firma_contrato_enlace, firma_contrato_otp). Las notificaciones usan notif_reglas_empresa.';
comment on table public.whatsapp_envios is 'Solo firma de contratos. Las notificaciones (correo y WhatsApp) usan notif_envios.';

do $chk$
begin
  if exists (select 1 from pg_trigger where tgname = 'trg_whatsapp_enqueue_notificacion') then
    raise exception '665 chk: el trigger sigue';
  end if;
  if exists (select 1 from pg_proc where proname in ('whatsapp_enqueue_from_notificacion','whatsapp_tipo_alerta_desde_notificacion')) then
    raise exception '665 chk: las funciones siguen';
  end if;
  if exists (select 1 from public.whatsapp_plantillas where tipo_alerta not like 'firma_contrato%')
     or exists (select 1 from public.whatsapp_matriz_destinatarios where tipo_alerta not like 'firma_contrato%') then
    raise exception '665 chk: quedan filas legadas';
  end if;
end
$chk$;
