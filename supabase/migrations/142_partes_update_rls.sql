-- La política UPDATE de partes_diarios requería 'partes:editar'.
-- Un usuario con solo 'partes:crear' podía insertar pero no actualizar sus propios partes.
-- Ahora se permite UPDATE si el usuario tiene 'crear' O 'editar' sobre partes.

drop policy if exists ops_partes_update on public.partes_diarios;

create policy ops_partes_update on public.partes_diarios
  for update
  using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'partes', 'editar')
      or public.usuario_puede(empresa_id, 'partes', 'crear')
    )
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'partes', 'editar')
      or public.usuario_puede(empresa_id, 'partes', 'crear')
    )
  );
