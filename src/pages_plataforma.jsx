import React, { useEffect, useState } from 'react';
import { useApp } from './context.jsx';
import { getSupabaseClient } from './lib/supabaseClient.js';
import { SaludImplementacionPanel } from './components/SaludImplementacionPanel.jsx';

export function SaludImplementacion() {
  const { isSuperadmin } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState('');

  useEffect(() => {
    if (!isSuperadmin) {
      setLoading(false);
      return;
    }

    let vigente = true;

    const cargarTenants = async () => {
      setLoading(true);
      setError('');

      try {
        const supabase = await getSupabaseClient();
        const { data, error: queryError } = await supabase
          .from('empresas')
          .select('id, nombre_comercial, razon_social')
          .eq('es_plataforma', false)
          .eq('estado', 'activa')
          .neq('id', 'emp_2000000000')
          .order('nombre_comercial', { ascending: true });

        if (queryError) throw queryError;
        if (!vigente) return;

        const operativos = data || [];
        setTenants(operativos);
        setTenantId((actual) => (
          operativos.some((tenant) => tenant.id === actual)
            ? actual
            : operativos[0]?.id || ''
        ));
      } catch (err) {
        if (vigente) setError(err.message || String(err));
      } finally {
        if (vigente) setLoading(false);
      }
    };

    cargarTenants();
    return () => {
      vigente = false;
    };
  }, [isSuperadmin]);

  if (!isSuperadmin) return <div style={{ padding: 40 }}>Acceso denegado. Solo Superadmin.</div>;
  if (loading) return <div style={{ padding: 40 }}>Cargando tenants operativos...</div>;
  if (error) return <div style={{ padding: 40, color: 'var(--danger)' }}>{error}</div>;
  if (!tenantId) return <div style={{ padding: 40 }}>No hay tenants operativos.</div>;

  const tenant = tenants.find((item) => item.id === tenantId);

  return (
    <SaludImplementacionPanel
      esSuperadmin
      tenantId={tenantId}
      tenants={tenants}
      onTenantChange={setTenantId}
      titulo="Salud de Implementación"
      subtitulo={`Auditoría en vivo de ${tenant?.nombre_comercial || tenant?.razon_social || tenantId}.`}
    />
  );
}
