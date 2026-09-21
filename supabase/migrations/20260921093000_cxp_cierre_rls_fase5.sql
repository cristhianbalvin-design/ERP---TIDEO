-- Fase 5: ningun INSERT/UPDATE directo autenticado sobre cxp.
-- Las funciones SECURITY DEFINER del mecanismo centralizado ejecutan como
-- owner (postgres) y no quedan bloqueadas por estas politicas.

drop policy if exists cxp_insert on public.cxp;
create policy cxp_insert
  on public.cxp
  for insert
  to public
  with check (false);

drop policy if exists cxp_update on public.cxp;
create policy cxp_update
  on public.cxp
  for update
  to public
  using (false)
  with check (false);
