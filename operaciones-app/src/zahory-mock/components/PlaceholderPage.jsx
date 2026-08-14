import { FooterBrand, Icon } from './shell.jsx';

export function PlaceholderPage({ title, subtitle }) {
  return (
    <div className="page">
      <div className="page-header"><div><h1>{title}</h1><div className="sub">{subtitle || 'Módulo en construcción'}</div></div></div>
      <div className="card"><div className="card-body muted" style={{ textAlign: 'center', padding: 60 }}>
        <Icon name="cog" size={32} />
        <div style={{ marginTop: 12, fontSize: 14 }}>Este módulo estará disponible próximamente.</div>
      </div></div>
      <FooterBrand />
    </div>
  );
}
