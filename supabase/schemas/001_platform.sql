-- TIDEO ERP - Plataforma global
-- Tablas sin empresa_id: gobiernan el SaaS completo.

create table if not exists public.planes (
  id text primary key,
  nombre text not null,
  descripcion text,
  usuarios_incluidos integer default 0,
  modulos jsonb default '[]'::jsonb,
  precio_mensual numeric(14,2) default 0,
  moneda text default 'PEN',
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.empresas (
  id text primary key,
  razon_social text not null,
  nombre_comercial text not null,
  ruc text,
  pais text default 'PE',
  moneda_base text default 'PEN',
  zona_horaria text default 'America/Lima',
  plan_id text references public.planes(id),
  estado text default 'activa' check (estado in ('activa','suspendida','cancelada','demo')),
  fecha_inicio date default current_date,
  fecha_cancelacion date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.monedas (
  codigo text primary key,
  nombre text not null,
  simbolo text not null,
  decimales integer default 2,
  activa boolean default true
);

create table if not exists public.paises (
  codigo text primary key,
  nombre text not null,
  moneda_default text references public.monedas(codigo),
  zona_horaria_default text default 'America/Lima'
);

create table if not exists public.versiones_plataforma (
  id text primary key,
  version text not null,
  descripcion text,
  fecha_release date default current_date,
  cambios jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

insert into public.monedas (codigo, nombre, simbolo)
values
  ('PEN', 'Sol peruano', 'S/'),
  ('USD', 'Dolar estadounidense', 'US$')
on conflict (codigo) do nothing;
