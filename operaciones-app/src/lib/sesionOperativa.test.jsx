import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ client: null }));

vi.mock('./supabaseClient.js', () => ({
  getSupabaseClient: () => mocks.client,
  isSupabaseConfigured: () => true,
}));

let SOCIEDAD_TODAS_ID;
let useSesionOperativa;
let getSesionCompartidaListenerCount;

const empresa = {
  id: 'empresa-1',
  estado: 'activa',
  multisociedad_habilitado: true,
};

const usuario = { id: 'usuario-1' };
const sociedades = [
  { id: 'sociedad-1', empresa_id: empresa.id, nombre: 'Sociedad Uno', activa: true },
  { id: 'sociedad-2', empresa_id: empresa.id, nombre: 'Sociedad Dos', activa: true },
];

const waitForReact = () => new Promise(resolve => setTimeout(resolve, 0));

function query(data) {
  const chain = {
    select: vi.fn(() => chain),
    in: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    then: (resolve, reject) => Promise.resolve({ data, error: null }).then(resolve, reject),
  };
  return chain;
}

function createClient() {
  const authEvents = [];
  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: usuario } }, error: null })),
      onAuthStateChange: vi.fn((callback) => {
        authEvents.push(callback);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    rpc: vi.fn(async () => ({
      data: [{ empresa_id: empresa.id, rol_id: 'rol-1' }],
      error: null,
    })),
    from: vi.fn((table) => {
      if (table === 'empresas') return query([empresa]);
      if (table === 'roles') return query([{ id: 'rol-1', nombre: 'Administrador', es_admin_empresa: true, es_superadmin: false }]);
      if (table === 'permisos_roles') return query([]);
      if (table === 'usuarios_asignaciones') return query([{ alcance_tipo: 'grupo', sociedades_ids: null, principal: true, activo: true }]);
      if (table === 'sociedades') return query(sociedades);
      throw new Error(`Tabla inesperada: ${table}`);
    }),
  };
  client.authEvents = authEvents;
  return client;
}

function SessionConsumer({ label, control = false, onMount }) {
  const mountCountRef = React.useRef(0);
  const sesion = useSesionOperativa();
  React.useEffect(() => {
    mountCountRef.current += 1;
    onMount?.(mountCountRef.current);
  }, []);
  return (
    <section data-label={label}>
      <span data-permite={label}>{String(sesion.permiteEscritura)}</span>
      {control && <>
        <button type="button" data-action="concreta" onClick={() => sesion.seleccionarSociedad('sociedad-1')}>Concreta</button>
        <button type="button" data-action="todas" onClick={() => sesion.seleccionarSociedad(SOCIEDAD_TODAS_ID)}>Todas</button>
        <button type="button" data-action="recargar" onClick={() => sesion.recargar()}>Recargar</button>
      </>}
    </section>
  );
}

function Harness({ showSecondary = true, onPageMount }) {
  return <main><SessionConsumer label="cabecera" control />{showSecondary && <SessionConsumer label="pagina" onMount={onPageMount} />}</main>;
}

const permite = (renderer, label) => renderer.root.findByProps({ 'data-permite': label }).children[0];

describe('useSesionOperativa - sincronización entre instancias', () => {
  beforeEach(async () => {
    vi.resetModules();
    const storage = new Map();
    globalThis.localStorage = {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    };
    mocks.client = createClient();
    const modulo = await import('./sesionOperativa.js');
    SOCIEDAD_TODAS_ID = modulo.SOCIEDAD_TODAS_ID;
    useSesionOperativa = modulo.useSesionOperativa;
    getSesionCompartidaListenerCount = modulo.__getSesionCompartidaListenerCount;
  });

  it('propaga sociedad concreta y el regreso a Todas sin remontar la segunda instancia', async () => {
    let paginaMontajes = 0;
    let renderer;
    await act(async () => {
      renderer = create(<Harness onPageMount={count => { paginaMontajes = count; }} />);
      await waitForReact();
    });
    expect(permite(renderer, 'cabecera')).toBe('false');
    expect(permite(renderer, 'pagina')).toBe('false');

    await act(async () => { await renderer.root.findByProps({ 'data-action': 'concreta' }).props.onClick(); });
    expect(permite(renderer, 'cabecera')).toBe('true');
    expect(permite(renderer, 'pagina')).toBe('true');
    const concreta = permite(renderer, 'pagina');

    await act(async () => { await renderer.root.findByProps({ 'data-action': 'todas' }).props.onClick(); });
    expect(permite(renderer, 'cabecera')).toBe('false');
    expect(permite(renderer, 'pagina')).toBe('false');
    const todas = permite(renderer, 'pagina');
    expect(paginaMontajes).toBe(1);
    console.log('SESSION_SYNC_RESULT', JSON.stringify({ concreta, paginaMontajes, todas }));
    await act(async () => { renderer.unmount(); });
  });

  it('desuscribe todas las instancias desmontadas y permite suscribirlas de nuevo', async () => {
    let renderer;
    await act(async () => { renderer = create(<Harness />); await waitForReact(); });
    const durante = getSesionCompartidaListenerCount();
    await act(async () => { renderer.unmount(); });
    const despuesDeDesmontar = getSesionCompartidaListenerCount();

    await act(async () => { renderer = create(<Harness />); await waitForReact(); });
    const despuesDeMontar = getSesionCompartidaListenerCount();
    expect(durante).toBe(2);
    expect(despuesDeDesmontar).toBe(0);
    expect(despuesDeMontar).toBe(2);
    console.log('SESSION_LISTENERS_RESULT', JSON.stringify({ durante, despuesDeDesmontar, despuesDeMontar }));
    await act(async () => { renderer.unmount(); });
  });
});
