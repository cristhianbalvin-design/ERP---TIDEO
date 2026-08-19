function getAdministrativeHref(adminRoute) {
  const baseUrl = (import.meta.env.VITE_ADMIN_APP_URL || '/').replace(/\/$/, '');
  const route = String(adminRoute || '').replace(/^#?\/?/, '');
  return `${baseUrl}/#${route}`;
}

export function AdministrativeAppLinkPage({ title, adminRoute }) {
  return (
    <aside
      role="status"
      aria-label={`${title}: disponible también en Administración`}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        flexWrap: 'wrap', padding: '12px 20px', margin: '12px 20px 0',
        border: '1px solid #93c5fd', borderRadius: 10, background: '#eff6ff', color: '#1e3a8a',
      }}
    >
      <div style={{ fontSize: 13 }}>
        <strong>{title}</strong> también está disponible en la aplicación administrativa.
      </div>
      <a className="btn btn-primary" href={getAdministrativeHref(adminRoute)}>
        Ir a Administración
      </a>
    </aside>
  );
}
