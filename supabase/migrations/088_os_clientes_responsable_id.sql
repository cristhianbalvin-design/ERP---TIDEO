-- 088 — OS Clientes: responsable_comercial_id como FK a usuarios

alter table public.os_clientes
  add column if not exists responsable_comercial_id text references public.usuarios(id) on delete set null;

select pg_notify('pgrst', 'reload schema');
