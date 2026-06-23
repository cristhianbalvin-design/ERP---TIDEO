-- ============================================================================
-- 277 · Maestro de Tipos de Contrato
-- ============================================================================

create table if not exists public.tipos_contrato (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  nombre text not null,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_tipos_contrato_emp on public.tipos_contrato(empresa_id, estado);

-- Políticas RLS
alter table public.tipos_contrato enable row level security;
drop policy if exists tenant_tipos_contrato_isolation on public.tipos_contrato;
create policy tenant_tipos_contrato_isolation on public.tipos_contrato 
  for all using (public.usuario_tiene_empresa(empresa_id)) 
  with check (public.usuario_tiene_empresa(empresa_id));

-- Insertar contratos por defecto (SUNAT) para empresas existentes
DO $$
DECLARE
  emp record;
  sunat_contratos json := '[
    {"codigo": "1000", "nombre": "PLAZO INDETERMINADO"},
    {"codigo": "1001", "nombre": "PLAZO FIJO - POR INICIO O INCREMENTO DE ACTIVIDAD"},
    {"codigo": "1002", "nombre": "PLAZO FIJO - POR NECESIDAD DE MERCADO"},
    {"codigo": "1003", "nombre": "PLAZO FIJO - POR SUPLENCIA"},
    {"codigo": "1004", "nombre": "PLAZO FIJO - POR SERVICIO ESPECIFICO"},
    {"codigo": "1005", "nombre": "TIEMPO PARCIAL"}
  ]';
  contrato json;
BEGIN
  FOR emp IN SELECT id FROM public.empresas LOOP
    FOR contrato IN SELECT * FROM json_array_elements(sunat_contratos) LOOP
      INSERT INTO public.tipos_contrato (id, empresa_id, codigo, nombre)
      VALUES (
        'tcon_' || replace(gen_random_uuid()::text, '-', ''),
        emp.id,
        contrato->>'codigo',
        contrato->>'nombre'
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

SELECT pg_notify('pgrst', 'reload schema');
