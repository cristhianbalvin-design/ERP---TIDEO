-- TIDEO ERP - Fix FK constraint ordenes_trabajo.os_cliente_id
-- El constraint puede haberse vuelto stale si os_clientes fue recreada.
-- Elimina y recrea el FK correctamente.

alter table public.ordenes_trabajo
  drop constraint if exists ordenes_trabajo_os_cliente_id_fkey;

alter table public.ordenes_trabajo
  add constraint ordenes_trabajo_os_cliente_id_fkey
  foreign key (os_cliente_id)
  references public.os_clientes(id)
  on delete set null;

-- Mismo fix para backlog.os_cliente_id por si acaso
alter table public.backlog
  drop constraint if exists backlog_os_cliente_id_fkey;

alter table public.backlog
  add constraint backlog_os_cliente_id_fkey
  foreign key (os_cliente_id)
  references public.os_clientes(id)
  on delete set null;
