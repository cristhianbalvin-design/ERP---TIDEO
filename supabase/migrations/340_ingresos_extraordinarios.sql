-- TIDEO ERP - Tabla ingresos_extraordinarios (Enfoque A)
-- Espejo de descuentos_extraordinarios (migracion 225), corrigiendo sus dos defectos
-- ya detectados: periodo_id NOT NULL (aca no puede "flotar" indefinidamente sin
-- periodo) y transicion a 'aplicado' realmente disparada (ver cerrarPeriodo).
-- es_remunerativo se snapshotea al aprobar, no se deriva en cada lectura -- si la
-- clasificacion de un sub_tipo cambia en el futuro, los registros ya aprobados en
-- periodos cerrados no deben cambiar de clasificacion retroactivamente.
-- 'reembolso' queda explicitamente excluido de sub_tipo -- se gestiona por
-- Compras y Gastos, fuera de este modulo (decision de negocio ya confirmada).

create table if not exists public.ingresos_extraordinarios (
  id                    text primary key,
  empresa_id            text not null references public.empresas(id) on delete cascade,
  personal_id           text not null,
  personal_nombre       text,
  personal_tipo         text check (personal_tipo in ('operativo','administrativo','admin')),

  sub_tipo              text not null check (sub_tipo in (
                          'bono_desempeño','gratificacion_extraordinaria','utilidades',
                          'alimentacion_indispensable','condicion_trabajo','otro'
                        )),
  es_remunerativo       boolean not null,

  descripcion           text not null,
  monto                 numeric(10,2) not null check (monto > 0),
  evidencia_url         text,

  estado                text not null default 'pendiente'
                          check (estado in ('pendiente','aprobado','rechazado','aplicado')),
  periodo_id            text not null references public.periodos_nomina(id) on delete cascade,

  registrado_por        text not null default 'sistema',
  registrado_en         timestamptz default now(),
  resuelto_por          text,
  resuelto_en           timestamptz,
  comentario_resolucion text,
  aplicado_en           timestamptz,

  creado_en             timestamptz default now()
);

create index if not exists idx_ingresos_extraordinarios_periodo
  on public.ingresos_extraordinarios (periodo_id);
create index if not exists idx_ingresos_extraordinarios_personal
  on public.ingresos_extraordinarios (empresa_id, personal_id);

alter table public.ingresos_extraordinarios enable row level security;

drop policy if exists ingresos_ext_select on public.ingresos_extraordinarios;
create policy ingresos_ext_select on public.ingresos_extraordinarios
  for select using (public.usuario_tiene_empresa(empresa_id));

drop policy if exists ingresos_ext_insert on public.ingresos_extraordinarios;
create policy ingresos_ext_insert on public.ingresos_extraordinarios
  for insert with check (public.usuario_tiene_empresa(empresa_id));

drop policy if exists ingresos_ext_update on public.ingresos_extraordinarios;
create policy ingresos_ext_update on public.ingresos_extraordinarios
  for update using (public.usuario_tiene_empresa(empresa_id));

select pg_notify('pgrst', 'reload schema');
