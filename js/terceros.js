/** FASE 6 - terceros.js : clientes (con alta OFFLINE por cola de sincronizacion) y proveedores (en linea). Catalogo local en IndexedDB. */
class Terceros {
  constructor(c) { this.c = c; this.ses = null; this.lista = []; this.editId = null; this.init(); }
  q(id) { return document.getElementById(this.c.p + id); }
  can(a) { return Auth.tiene(this.ses, this.c.perm + '.' + a); }
  msg(t, ok) { const m = this.q('Msg'); m.className = t ? 'alert py-2 small mb-2 alert-' + (ok ? 'success' : 'danger') : 'd-none'; m.textContent = t || ''; }
  init() {
    const c = this.c;
    document.getElementById(c.view).innerHTML = `
    <div class="card shadow-sm mb-3"><div class="card-body">
      <div id="${c.p}Msg" class="d-none"></div>
      <div class="row g-2 mb-2"><div class="col-md-6"><input id="${c.p}Bus" class="form-control" placeholder="Buscar nombre, documento o teléfono"></div>
        <div class="col-md-3"><select id="${c.p}Est" class="form-select"><option value="Activo">Activos</option><option value="Inactivo">Inactivos</option><option value="*">Todos</option></select></div>
        <div class="col-md-3 d-grid"><button id="${c.p}Nuevo" class="btn btn-primary">+ ${c.etq}</button></div></div>
      <div id="${c.p}Info" class="small text-muted mb-2"></div>
      <div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Nombre</th><th>Documento</th><th>Teléfono</th>${c.limite ? '<th class="text-end">Límite</th>' : ''}<th class="text-end">Saldo</th><th></th></tr></thead><tbody id="${c.p}Tab"></tbody></table></div></div></div>
    <div id="${c.p}Form" class="card shadow-sm mb-3 d-none"><div class="card-body"><h6 id="${c.p}FormT"></h6><div class="row g-2">
      ${c.campos.map(([k, l, t, w]) => `<div class="col-md-${w}"><label class="form-label small mb-0">${l}</label><input id="${c.p}_${k}" type="${t}" ${t === 'number' ? 'step="any" min="0"' : ''} class="form-control"></div>`).join('')}
      <div class="col-12 d-flex gap-2"><button id="${c.p}Guardar" class="btn btn-primary">Guardar</button><button id="${c.p}Cancelar" class="btn btn-outline-secondary">Cancelar</button></div></div></div></div>
    <div id="${c.p}Res" class="card shadow-sm d-none"><div class="card-body"><h6 id="${c.p}ResT"></h6><div id="${c.p}Kpis" class="row g-2 mb-2"></div><div class="table-responsive"><table class="table table-sm"><tbody id="${c.p}ResTab"></tbody></table></div></div></div>`;
    const on = (id, ev, f) => this.q(id).addEventListener(ev, f);
    const run = f => async e => { try { this.msg(''); await f(e); } catch (er) { this.msg(er.message); } };
    ['Bus', 'Est'].forEach(id => on(id, 'input', () => this.pintar()));
    on('Nuevo', 'click', () => this.abrirForm(null));
    on('Cancelar', 'click', () => this.q('Form').classList.add('d-none'));
    on('Guardar', 'click', run(async () => { const b = this.q('Guardar'); b.disabled = true; try { await this.guardar(); } finally { b.disabled = false; } }));
    on('Tab', 'click', run(async e => {
      const b = e.target.closest('button'); if (!b) return; const it = this.lista.find(x => x[c.id] === b.dataset.id);
      if (b.dataset.a === 'edit') this.abrirForm(it);
      else if (b.dataset.a === 'res') await this.resumen(it);
      else { const r = await Admin.api(c.apiAct, { [c.idParam]: it[c.id], cambios: { Estado: it.Estado === 'Activo' ? 'Inactivo' : 'Activo' } }); await LocalDB.put(c.store, r); await this.recargar(); }
    }));
    document.getElementById(c.tab).addEventListener('click', () => Productos.tab(c.tabName));
    window.addEventListener('online', async () => {   // tras reconectar: esperar a que termine la cola y bajar lo nuevo
      if (!this.ses) return; for (let i = 0; i < 60 && (Connectivity.syncing || i < 2); i++) await new Promise(r => setTimeout(r, 500));
      try { await this.sync(); await this.recargar(); } catch (e) {}
    });
  }
  async onSesion(s) {
    this.ses = s; const ok = !!s && this.can('ver'), c = this.c;
    document.getElementById(c.tab).classList.toggle('d-none', !ok); if (!ok) return;
    this.q('Nuevo').classList.toggle('d-none', !this.can('crear'));
    await this.recargar();
    if (navigator.onLine) { try { await this.sync(); await this.recargar(); } catch (e) { this.msg('No se pudo actualizar: ' + e.message); } }
  }
  async recargar() {
    const dn = await LocalDB.get('configuracion', 'datos_terceros');
    if (!dn || dn.Valor !== this.ses.NegocioID) {   // otro negocio en el dispositivo: no mezclar
      for (const s of ['clientes', 'proveedores']) await LocalDB.clear(s);
      for (const m of ['sync_clientes', 'sync_proveedores']) await LocalDB.delete('configuracion', m);
      await LocalDB.put('configuracion', { Clave: 'datos_terceros', Valor: this.ses.NegocioID });
    }
    this.lista = (await LocalDB.getAll(this.c.store)).filter(x => x.NegocioID === this.ses.NegocioID); this.pintar();
  }
  async sync() {
    const m = await LocalDB.get('configuracion', this.c.marker), r = await Admin.api(this.c.apiList, { desde: m ? m.Valor : null });
    if (r[this.c.clave].length) await LocalDB.putMany(this.c.store, r[this.c.clave]);   // sobrescribe y quita la marca "pendiente"
    await LocalDB.put('configuracion', { Clave: this.c.marker, Valor: r.serverTime });
  }
  filtrar() {
    const t = norm(this.q('Bus').value), e = this.q('Est').value;
    return this.lista.filter(x => (e === '*' || x.Estado === e) && (!t || [x.Nombre, x.Documento, x.Telefono].some(v => norm(v).includes(t)))).sort((a, b) => a.Nombre.localeCompare(b.Nombre));
  }
  pintar() {
    const c = this.c, l = this.filtrar(), edit = this.can('editar');
    this.q('Info').textContent = `${l.length} de ${this.lista.length}` + (l.length > 100 ? ' (mostrando 100)' : '') + (navigator.onLine ? '' : ' · sin conexión');
    this.q('Tab').innerHTML = l.slice(0, 100).map(x => `<tr class="${x.Estado === 'Activo' ? '' : 'text-muted'}"><td>${esc(x.Nombre)}${x.pendiente ? ' <span class="badge text-bg-warning">Pendiente de sincronizar</span>' : ''}<div class="small text-muted">${esc(x.Email)}</div></td>
      <td>${esc(x.Documento)}</td><td>${esc(x.Telefono)}</td>${c.limite ? `<td class="text-end">${money(x.LimiteCredito)}</td>` : ''}<td class="text-end">${money(x.SaldoPendiente)}</td>
      <td class="text-end"><button class="btn btn-sm btn-outline-secondary" data-a="res" data-id="${esc(x[c.id])}">Historial</button>
      ${edit && !x.pendiente ? `<button class="btn btn-sm btn-outline-secondary" data-a="edit" data-id="${esc(x[c.id])}">Editar</button>
      <button class="btn btn-sm btn-outline-${x.Estado === 'Activo' ? 'danger' : 'success'}" data-a="est" data-id="${esc(x[c.id])}">${x.Estado === 'Activo' ? 'Desactivar' : 'Activar'}</button>` : ''}</td></tr>`).join('');
  }
  abrirForm(it) {
    this.editId = it ? it[this.c.id] : null; if (this.editId ? !this.can('editar') : !this.can('crear')) return;
    this.q('FormT').textContent = (it ? 'Editar ' : 'Nuevo ') + this.c.etq.toLowerCase();
    this.c.campos.forEach(([k]) => { this.q('_' + k).value = it && it[k] != null ? it[k] : ''; });
    this.q('Form').classList.remove('d-none'); this.q('_Nombre').focus();
  }
  leer() { const o = {}; this.c.campos.forEach(([k]) => { o[k] = this.q('_' + k).value; }); return o; }
  async guardar() {
    const c = this.c, o = this.leer(); let r;
    if (this.editId) r = await Admin.api(c.apiAct, { [c.idParam]: this.editId, cambios: o });
    else if (c.offline) r = await this.crearCliente(o);
    else r = await Admin.api(c.apiCrear, { [c.idCrear]: o });
    await LocalDB.put(c.store, r); this.q('Form').classList.add('d-none'); await this.recargar();
    this.msg(r.pendiente ? 'Guardado en este dispositivo. Se sincronizará al volver la conexión.' : 'Guardado', 1);
  }
  /** Alta idempotente: ID propio + operacion CREAR_CLIENTE. En linea se envia al instante; si no hay red queda en la cola. */
  async crearCliente(o) {
    const ses = this.ses, id = 'CLI-' + uuid().replace(/-/g, '').slice(0, 10).toUpperCase();
    const reg = Object.assign({ ClienteID: id, NegocioID: ses.NegocioID, SaldoPendiente: 0, Estado: 'Activo', FechaActualizacion: new Date().toISOString() }, o, { LimiteCredito: Number(o.LimiteCredito) || 0 });
    const ctx = { UsuarioID: ses.UsuarioID, NegocioID: ses.NegocioID, SucursalID: (await Admin.sucursalActiva()) || '' };
    const op = SyncQueue.build('CREAR_CLIENTE', 'Cliente', id, reg, ctx);
    if (navigator.onLine) {
      let res;
      try {
        const tok = await LocalDB.get('configuracion', 'session_token');
        const r = await Auth.api('sincronizarOperaciones', { token: tok && tok.Valor, operaciones: [op] });
        if (!r.ok) throw Object.assign(new Error(r.error), { servidor: true });
        res = r.resultados[0];
      } catch (e) { if (e.servidor) throw e; res = null; }   // sin respuesta => se encola (reintento seguro: mismo ID)
      if (res) { if (res.estado === 'ERROR') throw new Error(res.error); return Object.assign(reg, res.resultado || {}); }
    }
    const local = Object.assign({}, reg, { pendiente: true });
    await LocalDB.saveWithOp('clientes', local, op); Connectivity.emit(); return local;
  }
  async resumen(it) {
    const c = this.c, r = await Admin.api(c.apiRes, { [c.idParam]: it[c.id] });
    this.q('ResT').textContent = 'Historial: ' + it.Nombre; this.q('Res').classList.remove('d-none');
    const f = k => k.tipo === 'money' ? money(k.valor) : k.tipo === 'fecha' ? (k.valor ? new Date(k.valor).toLocaleDateString() : '—') : k.valor;
    this.q('Kpis').innerHTML = r.kpis.map(k => `<div class="col-6 col-md-3"><div class="border rounded p-2"><div class="small text-muted">${k.etq}</div><div class="fw-bold">${f(k)}</div></div></div>`).join('');
    this.q('ResTab').innerHTML = r.movimientos.map(m => `<tr><td class="small">${new Date(m.fecha).toLocaleString()}</td><td>${esc(m.ref)}</td><td class="text-end">${money(m.total)}</td><td>${esc(m.estado)}</td></tr>`).join('') || '<tr><td class="text-muted">Sin movimientos todavía</td></tr>';
    this.q('Res').scrollIntoView({ behavior: 'smooth' });
  }
}
const CAMPOS_BASE = [['Nombre', 'Nombre *', 'text', 6], ['Documento', 'Documento (cédula / RNC)', 'text', 3], ['Telefono', 'Teléfono', 'text', 3], ['Email', 'Email', 'email', 4], ['Direccion', 'Dirección', 'text', 5]];
const Clientes = new Terceros({ p: 'cl', view: 'vCli', tab: 'tabCli', tabName: 'cli', perm: 'clientes', etq: 'Cliente', id: 'ClienteID', idParam: 'clienteId', store: 'clientes', marker: 'sync_clientes',
  clave: 'clientes', apiList: 'listarClientes', apiAct: 'actualizarCliente', apiRes: 'obtenerResumenCliente', limite: true, offline: true, campos: CAMPOS_BASE.concat([['LimiteCredito', 'Límite de crédito', 'number', 3]]) });
const Proveedores = new Terceros({ p: 'pv', view: 'vPrv', tab: 'tabPrv', tabName: 'prv', perm: 'proveedores', etq: 'Proveedor', id: 'ProveedorID', idParam: 'proveedorId', idCrear: 'proveedor', store: 'proveedores', marker: 'sync_proveedores',
  clave: 'proveedores', apiList: 'listarProveedores', apiCrear: 'crearProveedor', apiAct: 'actualizarProveedor', apiRes: 'obtenerResumenProveedor', limite: false, offline: false, campos: CAMPOS_BASE });