-- 250 — GAP-12: Bloqueo automático de acceso al sistema por cese
-- Este trigger respalda la aplicación frontend asegurando que
-- siempre que un empleado sea cesado, su acceso se bloquee.

create or replace function public.procesar_bloqueo_cese_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Si el estado_laboral cambia a 'cesado'
  if new.estado_laboral = 'cesado' and (old.estado_laboral is null or old.estado_laboral <> 'cesado') then
    -- Bloquear al usuario vinculado si existe
    if new.auth_user_id is not null then
      update public.usuarios_empresas
         set activo = false
       where user_id = new.auth_user_id
         and empresa_id = new.empresa_id;
    end if;

    -- Asignar campos de bloqueo
    if new.usuario_bloqueado_en is null or new.usuario_bloqueado_en = old.usuario_bloqueado_en then
      new.usuario_bloqueado_en := now();
      new.usuario_bloqueado_por := coalesce(auth.uid(), new.usuario_bloqueado_por);
    end if;
  end if;

  -- Si el cese se anula y el estado_laboral regresa a 'activo' (o distinto de cesado)
  if coalesce(new.estado_laboral, '') <> 'cesado' and old.estado_laboral = 'cesado' then
    -- Reactivar al usuario vinculado si existe
    if new.auth_user_id is not null then
      update public.usuarios_empresas
         set activo = true
       where user_id = new.auth_user_id
         and empresa_id = new.empresa_id;
    end if;

    -- Limpiar campos de bloqueo
    new.usuario_bloqueado_en := null;
    new.usuario_bloqueado_por := null;
  end if;

  return new;
end;
$$;

-- Instalar trigger en personal_operativo
drop trigger if exists trg_bloqueo_cese_operativo on public.personal_operativo;
create trigger trg_bloqueo_cese_operativo
before update on public.personal_operativo
for each row execute function public.procesar_bloqueo_cese_trigger();

-- Instalar trigger en personal_administrativo
drop trigger if exists trg_bloqueo_cese_administrativo on public.personal_administrativo;
create trigger trg_bloqueo_cese_administrativo
before update on public.personal_administrativo
for each row execute function public.procesar_bloqueo_cese_trigger();

select pg_notify('pgrst', 'reload schema');
