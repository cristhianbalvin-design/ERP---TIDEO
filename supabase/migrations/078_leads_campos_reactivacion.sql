-- Agrega campos de reactivación a la tabla leads.
-- Los tres campos son gestionados exclusivamente por trigger — el usuario no puede escribirlos.

-- ============================================================
-- Columnas
-- ============================================================

alter table public.leads
  add column if not exists reactivado_en   timestamptz,
  add column if not exists reactivado_por  uuid references auth.users(id),
  add column if not exists veces_reactivado integer not null default 0
    check (veces_reactivado >= 0);

-- ============================================================
-- Trigger: actualiza los campos solo al reactivar
-- (descartado → en_contacto) e impide que el usuario los
-- sobreescriba en cualquier otro UPDATE.
-- ============================================================

create or replace function public.leads_gestionar_reactivacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ignorar siempre los valores que el usuario haya intentado escribir
  NEW.reactivado_en      := OLD.reactivado_en;
  NEW.reactivado_por     := OLD.reactivado_por;
  NEW.veces_reactivado   := OLD.veces_reactivado;

  -- Actualizar solo en la transición descartado → en_contacto
  if OLD.estado = 'descartado' and NEW.estado = 'en_contacto' then
    NEW.reactivado_en    := now();
    NEW.reactivado_por   := auth.uid();
    NEW.veces_reactivado := OLD.veces_reactivado + 1;
  end if;

  return NEW;
end;
$$;

drop trigger if exists leads_reactivacion_guard on public.leads;
create trigger leads_reactivacion_guard
  before update on public.leads
  for each row execute function public.leads_gestionar_reactivacion();
