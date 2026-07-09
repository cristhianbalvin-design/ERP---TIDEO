import os

path = 'src/pages_admin.jsx'
with open(path, 'r', encoding='utf-8') as f:
    code = f.read()

# Fix table header
old_thead = '<thead><tr><th>Cargo</th><th>Estado</th><th>Ocupante(s)</th><th>Reporta a</th><th style={{ textAlign: \'right\' }}>Acciones</th></tr></thead>'
new_thead = '<thead><tr><th>Unidad</th><th>Cargo</th><th>Estado</th><th>Ocupante(s)</th><th>Reporta a</th><th style={{ textAlign: \'right\' }}>Acciones</th></tr></thead>'
code = code.replace(old_thead, new_thead)

# Fix empty state colSpan
old_empty = '<td colSpan={5} style={{ textAlign: \'center\', color: \'var(--fg-muted)\', padding: 24 }}>'
new_empty = '<td colSpan={6} style={{ textAlign: \'center\', color: \'var(--fg-muted)\', padding: 24 }}>'
code = code.replace(old_empty, new_empty)

# Fix group header row
old_group = '''<tr style={{ backgroundColor: 'var(--bg-hover)' }}>
                    <td colSpan={5} style={{ fontWeight: 600, fontSize: 13, paddingTop: 12, paddingBottom: 12 }}>
                      {g.nombre} <span style={{ fontWeight: 400, color: 'var(--fg-muted)', marginLeft: 8 }}>({g.cubiertas} cubiertas · {g.vacantes} vacantes)</span>
                    </td>
                  </tr>'''
new_group = '''<tr style={{ backgroundColor: 'var(--surface-1)' }}>
                    <td colSpan={6} style={{ borderTop: '2px solid var(--border-color)', fontWeight: 600, fontSize: 13, paddingTop: 16, paddingBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{g.nombre}</span>
                        <span style={{ fontWeight: 400, color: 'var(--fg-muted)', fontSize: 12 }}>{g.cubiertas} cubiertas · {g.vacantes} vacantes</span>
                      </div>
                    </td>
                  </tr>'''
code = code.replace(old_group, new_group)

# Add Unidad td in rows
old_row_td = '<td className="text-muted" style={{ fontSize: 12 }}>{cargoNombrePorId.get(p.cargo_id) || <span className="text-subtle">Sin cargo</span>}</td>'
new_row_td = '''<td className="text-muted" style={{ fontSize: 12 }}>{g.nombre}</td>
                        <td className="text-muted" style={{ fontSize: 12 }}>{cargoNombrePorId.get(p.cargo_id) || <span className="text-subtle">Sin cargo</span>}</td>'''
code = code.replace(old_row_td, new_row_td)

with open(path, 'w', encoding='utf-8') as f:
    f.write(code)

print('Updated src/pages_admin.jsx table layout')
