-- Alarma de claves: destinatarios adicionales además del Super Administrador TIDEO
-- (por ejemplo, la cuenta de uso diario de Cristhian). Cada uno recibe la campana en la empresa indicada.
-- Reemplaza plataforma_admins() y usuario_es_admin_plataforma() de 20261109233000; único cambio: el UNION con esta tabla.

create table if not exists public.plataforma_destinatarios_extra (
  user_id uuid primary key,
  empresa_id text not null,
  nota text,
  creado_en timestamptz not null default now()
);

alter table public.plataforma_destinatarios_extra enable row level security;
revoke all on public.plataforma_destinatarios_extra from anon, authenticated;

create or replace function public.plataforma_admins()
returns table (user_id uuid, empresa_id text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select distinct ue.user_id, ue.empresa_id
  from public.usuarios_empresas ue
  join public.roles r on r.id = ue.rol_id
  join public.empresas e on e.id = ue.empresa_id
  where ue.estado = 'activo' and r.es_superadmin and e.es_plataforma
  union
  select d.user_id, d.empresa_id
  from public.plataforma_destinatarios_extra d
  join public.usuarios_empresas ue on ue.user_id = d.user_id and ue.empresa_id = d.empresa_id and ue.estado = 'activo';
$$;

create or replace function public.usuario_es_admin_plataforma()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    join public.empresas e on e.id = ue.empresa_id
    where ue.user_id = auth.uid() and ue.estado = 'activo' and r.es_superadmin and e.es_plataforma
  ) or exists (
    select 1 from public.plataforma_destinatarios_extra d where d.user_id = auth.uid()
  );
$$;

revoke all on function public.plataforma_admins() from public, anon, authenticated;

-- Cuenta de uso diario de Cristhian, con la campana en TIDEO SAC.
insert into public.plataforma_destinatarios_extra (user_id, empresa_id, nota)
select h.user_id, 'emp_20609996464', 'Cuenta de uso diario de Cristhian (pedido 2026-11-09)'
from public.asistente_historial h
where h.empresa_id = 'emp_2000000000' and h.modelo = 'claude-haiku-5-5'
order by h.created_at desc
limit 1
on conflict (user_id) do nothing;

do $$
begin
  if (select count(*) from public.plataforma_admins()) < 2 then
    raise exception 'La alarma debería tener al menos 2 destinatarios';
  end if;
end;
$$;
