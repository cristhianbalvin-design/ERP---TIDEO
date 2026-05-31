-- Soporte y Tickets: hilo de resolución QC y reapertura formal

-- ──────────────────────────────────────────────────
-- 1. Nuevos campos en tickets
-- ──────────────────────────────────────────────────
alter table public.tickets
  add column if not exists qc_estado text
    check (qc_estado is null or qc_estado in ('en_revision', 'observado', 'aprobado')),
  add column if not exists veces_reabierto integer not null default 0,
  add column if not exists reabierto_en timestamptz;

-- ──────────────────────────────────────────────────
-- 2. Tabla ticket_comentarios (append-only)
-- ──────────────────────────────────────────────────
create table if not exists public.ticket_comentarios (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     text not null references public.empresas(id) on delete cascade,
  ticket_id      uuid not null references public.tickets(id) on delete cascade,
  tipo           text not null check (tipo in ('observacion', 'evidencia', 'aprobacion', 'reapertura')),
  contenido      text not null,
  imagen_url     text,
  usuario_id     uuid references auth.users(id) on delete set null,
  usuario_nombre text not null,
  creado_en      timestamptz not null default now()
);

create index if not exists idx_ticket_comentarios_ticket
  on public.ticket_comentarios(ticket_id, creado_en asc);

alter table public.ticket_comentarios enable row level security;

drop policy if exists ticket_comentarios_select on public.ticket_comentarios;
drop policy if exists ticket_comentarios_insert on public.ticket_comentarios;

create policy ticket_comentarios_select on public.ticket_comentarios
  for select using (public.usuario_tiene_empresa(empresa_id));

create policy ticket_comentarios_insert on public.ticket_comentarios
  for insert with check (public.usuario_tiene_empresa(empresa_id));
-- No UPDATE ni DELETE: tabla append-only

-- ──────────────────────────────────────────────────
-- 3. Actualizar trigger para transiciones de estado QC
-- ──────────────────────────────────────────────────
create or replace function public.set_ticket_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.creado_en := coalesce(new.creado_en, now());
    new.creado_por := coalesce(new.creado_por, auth.uid());
    if new.numero is null or btrim(new.numero) = '' then
      new.numero := public.siguiente_numero_ticket(new.empresa_id);
    end if;
    new.fecha_limite_sla := coalesce(
      new.fecha_limite_sla,
      public.ticket_fecha_limite_sla(new.prioridad, new.creado_en)
    );
  end if;

  if new.cuenta_id is not null and (new.cuenta_nombre is null or btrim(new.cuenta_nombre) = '') then
    select coalesce(c.nombre_comercial, c.razon_social, c.id)
      into new.cuenta_nombre
    from public.cuentas c
    where c.id = new.cuenta_id
      and c.empresa_id = new.empresa_id
    limit 1;
  end if;

  if new.responsable_id is not null and (new.responsable_nombre is null or btrim(new.responsable_nombre) = '') then
    select coalesce(u.nombre, u.email, u.id)
      into new.responsable_nombre
    from public.usuarios u
    where u.id = new.responsable_id
      and u.empresa_id = new.empresa_id
    limit 1;
  end if;

  if tg_op = 'UPDATE' then
    -- Manejo de fecha_resolucion por transición de estado
    if new.estado in ('resuelto', 'cerrado') and old.estado is distinct from new.estado then
      new.fecha_resolucion := coalesce(new.fecha_resolucion, now());
    elsif new.estado in ('abierto', 'en_proceso', 'qc') and old.estado in ('resuelto', 'cerrado') then
      new.fecha_resolucion := null;
    end if;

    -- Al entrar a QC: inicializar qc_estado si no viene definido
    if new.estado = 'qc' and old.estado is distinct from new.estado and new.qc_estado is null then
      new.qc_estado := 'en_revision';
    end if;

    -- Al salir de QC: limpiar qc_estado
    if old.estado = 'qc' and new.estado != 'qc' then
      new.qc_estado := null;
    end if;
  end if;

  new.actualizado_en := now();
  return new;
end;
$$;

select pg_notify('pgrst', 'reload schema');
