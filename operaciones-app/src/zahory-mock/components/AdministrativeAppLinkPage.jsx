import { FooterBrand } from './shell.jsx';

function getAdministrativeHref(adminRoute) {
  const baseUrl = (import.meta.env.VITE_ADMIN_APP_URL || '/').replace(/\/$/, '');
  const route = String(adminRoute || '').replace(/^#?\/?/, '');
  return `${baseUrl}/#${route}`;
}

export function AdministrativeAppLinkPage({ title, adminRoute }) {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{title}</h1>
          <div className="sub">Disponible en Administración</div>
        </div>
      </div>
      <div className="card">
        <div className="card-body muted" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 14, marginBottom: 16 }}>
            Esta funcionalidad está disponible en la aplicación administrativa.
          </div>
          <a className="btn btn-primary" href={getAdministrativeHref(adminRoute)}>
            Ir a Administración
          </a>
        </div>
      </div>
      <FooterBrand />
    </div>
  );
}
