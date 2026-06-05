-- Parametros AFP: la prima de seguro depende de la AFP, no de empresa_config.

create table if not exists public.afp_parametros (
  empresa_id          text not null references public.empresas(id) on delete cascade,
  afp_nombre          text not null check (afp_nombre in ('Integra', 'Prima', 'Profuturo', 'Habitat')),
  pct_prima_seguro    numeric(5,2) not null default 1.37 check (pct_prima_seguro >= 0),
  vigente_desde       date not null default date '2026-01-01',
  creado_en           timestamptz not null default now(),
  primary key (empresa_id, afp_nombre, vigente_desde)
);

create index if not exists afp_parametros_empresa_afp_vigencia_idx
  on public.afp_parametros (empresa_id, afp_nombre, vigente_desde desc);

alter table public.afp_parametros enable row level security;

drop policy if exists afp_parametros_select on public.afp_parametros;
drop policy if exists afp_parametros_insert on public.afp_parametros;
drop policy if exists afp_parametros_update on public.afp_parametros;

create policy afp_parametros_select on public.afp_parametros
  for select using (public.usuario_tiene_empresa(empresa_id));

create policy afp_parametros_insert on public.afp_parametros
  for insert with check (public.usuario_tiene_empresa(empresa_id));

create policy afp_parametros_update on public.afp_parametros
  for update using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

insert into public.afp_parametros (empresa_id, afp_nombre, pct_prima_seguro, vigente_desde)
select e.id, afp.afp_nombre, 1.37, date '2026-01-01'
from public.empresas e
cross join (values
  ('Integra'),
  ('Prima'),
  ('Profuturo'),
  ('Habitat')
) as afp(afp_nombre)
on conflict (empresa_id, afp_nombre, vigente_desde) do update
set pct_prima_seguro = excluded.pct_prima_seguro;

alter table public.empresa_config
  drop column if exists pct_prima_seguro;

select pg_notify('pgrst', 'reload schema');
