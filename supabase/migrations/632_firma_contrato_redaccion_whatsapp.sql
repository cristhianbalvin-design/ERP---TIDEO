-- 632_firma_contrato_redaccion_whatsapp.sql
-- El enlace de firma y el OTP viajan por la cola whatsapp_envios (columna variables).
-- Al despacharse (enviado / entregado / fallido) se borran de la fila para que no queden
-- en claro en la base. Cubre tambien la copia que el despachador simulado guarda en
-- proveedor_respuesta.variables.

create or replace function public.redactar_envio_whatsapp_firma()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.tipo_alerta in ('firma_contrato_enlace', 'firma_contrato_otp')
     and new.estado in ('enviado', 'entregado', 'fallido') then
    new.variables := jsonb_build_object('redactado', true);
    if new.proveedor_respuesta is not null then
      new.proveedor_respuesta := new.proveedor_respuesta - 'variables';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists aa_redactar_envio_whatsapp_firma on public.whatsapp_envios;
create trigger aa_redactar_envio_whatsapp_firma
  before update on public.whatsapp_envios
  for each row execute function public.redactar_envio_whatsapp_firma();

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'aa_redactar_envio_whatsapp_firma' and not tgisinternal) then
    raise exception 'falta trigger aa_redactar_envio_whatsapp_firma';
  end if;
end $$;
