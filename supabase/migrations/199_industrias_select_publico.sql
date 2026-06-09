-- El catálogo de industrias es datos de referencia que cualquier miembro
-- de la empresa necesita leer (formularios de leads, cuentas, etc.).
-- Antes requería permiso 'maestros.ver', lo que dejaba el dropdown vacío
-- para vendedores y usuarios móviles.

drop policy if exists mst_industrias_select on public.industrias;
create policy mst_industrias_select on public.industrias
  for select using (
    public.usuario_tiene_empresa(empresa_id)
  );
