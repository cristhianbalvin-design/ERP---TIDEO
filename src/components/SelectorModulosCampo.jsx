import React from 'react';

export const CAMPO_MODULE_OPTIONS = [
  { id: 'tecnico', label: 'Tecnico' },
  { id: 'logistica', label: 'Logistica' },
  { id: 'vendedor', label: 'Vendedor' },
  { id: 'compras', label: 'Compras' },
  { id: 'supervisor', label: 'Supervisor' },
  { id: 'gerencia', label: 'Gerencia' },
  { id: 'asistencia', label: 'Control de asistencia' },
  { id: 'mi_espacio', label: 'Mi espacio' },
];

export function SelectorModulosCampo({
  value = [],
  onChange,
  disabled = false,
  requiredModule = null,
  getRestriction,
  helpText = null,
}) {
  const selected = Array.isArray(value) ? value : [];
  const actualizar = (moduleId, checked) => {
    if (moduleId === requiredModule) return;
    const next = checked
      ? [...new Set([...selected, moduleId])]
      : selected.filter(id => id !== moduleId);
    onChange?.(requiredModule ? [...new Set([...next, requiredModule])] : next);
  };

  return (
    <div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, opacity: disabled ? 0.55 : 1}}>
        {CAMPO_MODULE_OPTIONS.map(module => {
          const restriction = getRestriction?.(module.id) || { disabled: false, tooltip: '' };
          const required = module.id === requiredModule;
          const moduleDisabled = Boolean(disabled || restriction.disabled);
          const checked = selected.includes(module.id) || (required && !disabled);
          return (
            <label
              key={module.id}
              className="row"
              title={required ? 'Incluido automáticamente' : (restriction.tooltip || '')}
              style={{
                gap:8,
                fontSize:13,
                padding:'8px 10px',
                border:'1px solid var(--border)',
                borderColor: required && !disabled ? 'var(--cyan)' : 'var(--border)',
                borderRadius:8,
                opacity: restriction.disabled ? 0.55 : 1,
                cursor: required ? 'default' : (moduleDisabled ? 'not-allowed' : 'pointer'),
                background: required && !disabled
                  ? 'rgba(20,184,166,0.10)'
                  : (restriction.disabled || disabled ? 'var(--bg-subtle)' : undefined),
              }}
            >
              <input
                type="checkbox"
                className="checkbox"
                disabled={moduleDisabled}
                aria-disabled={required || moduleDisabled}
                checked={checked}
                onChange={event => actualizar(module.id, event.target.checked)}
              />
              <span>{module.label}</span>
              {required && !disabled && <span style={{marginLeft:'auto', color:'var(--cyan)', fontSize:11, fontWeight:600}}>✓ Incluido automáticamente</span>}
            </label>
          );
        })}
      </div>
      {helpText && <div className="text-muted" style={{fontSize:12, marginTop:6}}>{helpText}</div>}
    </div>
  );
}
