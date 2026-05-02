-- Permite que cualquier usuario autenticado lea roles.
-- Sin esto, el JOIN en loadMembresia devuelve 0 filas via RLS (INNER JOIN con roles falla).
create policy access_roles_authenticated on public.roles
  for select using (auth.uid() is not null);
