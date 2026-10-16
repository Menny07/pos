/** FASE 5 - inventario.js : stock por sucursal (cache local para la sucursal del dispositivo), ajustes, conteo, transferencias, kardex. */
const MOV_ETQ = { COMPRA: 'Compra', VENTA: 'Venta', DEVOLUCION_VENTA: 'Devolución venta', DEVOLUCION_COMPRA: 'Devolución compra', AJUSTE_ENTRADA: 'Ajuste entrada',
  AJUSTE_SALIDA: 'Ajuste salida', MERMA: 'Merma', TRANSFERENCIA_ENTRADA: 'Transf. entrada', TRANSFERENCIA_SALIDA: 'Transf. salida' };
const MOV_SIGNO = { COMPRA: 1, VENTA: -1, DEVOLUCION_VENTA: 1, DEVOLUCION_COMPRA: -1, AJUSTE_ENTRADA: 1, AJUSTE_SALIDA: -1, MERMA: -1, TRANSFERENCIA_ENTRADA: 1, TRANSFERENCIA_SALIDA: -1 };

const Inventario = {
  ses: null, sucs: [], sucSel: null, stock: {}, etq: {}, opAj: null, opTr: null,
  q: id => document.getElementById(id),
  can(c) { return Auth.tiene(this.ses, c); },
  msg(t, ok) { const m = this.q('iMsg'); m.className = 'small mt-2 ' + (ok ? 'text-success' : 'text-danger'); m.textContent = t || ''; },

  init() {
    this.q('vInv').innerHTML = `
    <div class="card shadow-sm mb-3"><div class="card-body">
      <div class="row g-2 mb-2">
        <div class="col-md-3"><select id="iSuc" class="form-select"></select></div>
        <div class="col-md-5"><input id="iBus" class="form-control" placeholder="Buscar producto o código"></div>
        <div class="col-md-2 d-flex align-items-center"><div class="form-check"><input id="iBajo" type="checkbox" class="form-check-input"><label class="form-check-label small" for="iBajo">Solo stock bajo</label></div></div>
        <div class="col-md-2 d-grid"><button id="iVer" class="btn btn-outline-secondary btn-sm">Verificar</button></div></div>
      <div id="iInfo" class="small text-muted mb-2"></div>
      <div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Producto</th><th class="text-end">Stock</th><th class="text-end">Mín.</th><th>Estado</th><th></th></tr></thead><tbody id="iTab"></tbody></table></div>
      <div id="iMsg" class="small mt-2"></div></div></div>
    <div id="iOps" class="row g-3">
      <div class="col-lg-6"><div class="card shadow-sm h-100"><div class="card-body"><h6>Ajuste / merma / conteo</h6><div class="row g-2">
        <div class="col-12"><input id="aProd" list="dlProd" class="form-control" placeholder="Producto"></div>
        <div class="col-md-6"><select id="aTipo" class="form-select"><option value="AJUSTE_ENTRADA">Entrada (+)</option><option value="AJUSTE_SALIDA">Salida (−)</option><option value="MERMA">Merma (−)</option><option value="CONTEO">Conteo físico (fijar stock)</option></select></div>
        <div class="col-md-3"><input id="aCant" type="number" step="any" min="0" class="form-control" placeholder="Cantidad"></div>
        <div class="col-md-3"><input id="aCosto" type="number" step="any" min="0" class="form-control" placeholder="Costo"></div>
        <div class="col-12"><input id="aNota" class="form-control" placeholder="Motivo (obligatorio)"></div>
        <div class="col-12 d-grid"><button id="aGo" class="btn btn-primary">Registrar</button></div></div></div></div></div>
      <div class="col-lg-6"><div class="card shadow-sm h-100"><div class="card-body"><h6>Transferir a otra sucursal</h6><div class="row g-2">
        <div class="col-12"><input id="tProd" list="dlProd" class="form-control" placeholder="Producto"></div>
        <div class="col-md-6"><select id="tDest" class="form-select"></select></div>
        <div class="col-md-6"><input id="tCant" type="number" step="any" min="0" class="form-control" placeholder="Cantidad"></div>
        <div class="col-12"><input id="tNota" class="form-control" placeholder="Notas (opcional)"></div>
        <div class="col-12 d-grid"><button id="tGo" class="btn btn-outline-primary">Transferir desde la sucursal seleccionada</button></div></div></div></div></div></div>
    <datalist id="dlProd"></datalist>
    <div id="kCard" class="card shadow-sm mt-3 d-none"><div class="card-body"><h6 id="kT"></h6><div class="table-responsive"><table class="table table-sm"><tbody id="kTab"></tbody></table></div></div></div>`;
    const on = (id, ev, f) => this.q(id).addEventListener(ev, f);
    const run = f => async e => { try { this.msg(''); await f(e); } catch (er) { this.msg(er.message); } };
    on('iSuc', 'change', run(async () => { this.sucSel = this.q('iSuc').value; await this.cargar(); this.pintar(); }));
    ['iBus', 'iBajo'].forEach(id => on(id, 'input', () => this.pintar()));
    on('iTab', 'click', run(async e => {
      const b = e.target.closest('button'); if (!b) return; const p = Productos.prods.find(x => x.ProductoID === b.dataset.id);
      if (b.dataset.a === 'aj') { this.q('aProd').value = this.etq2(p); this.q('aCant').focus(); } else await this.kardex(p);
    }));
    on('aGo', 'click', run(() => this.ajustar()));
    on('tGo', 'click', run(() => this.transferir()));
    on('iVer', 'click', run(() => this.verificar()));
    on('tabInv', 'click', () => Productos.tab('inv'));
  },
  etq2(p) { return `${p.Codigo} · ${p.Nombre}`; },
  prodDe(txt) { const id = this.etq[String(txt).trim()]; if (!id) throw new Error('Selecciona un producto de la lista'); return id; },

  async onSesion(s) {
    this.ses = s; const ok = !!s && Auth.tiene(s, 'inventario.ver');
    this.q('tabInv').classList.toggle('d-none', !ok); if (!ok) return;
    this.q('iOps').classList.toggle('d-none', !this.can('inventario.ajustar')); this.q('iVer').classList.toggle('d-none', !this.can('inventario.ajustar'));
    this.sucs = (await Admin.sucursales()).filter(x => x.Estado === 'Activo');
    const dev = await Admin.sucursalActiva();
    if (!this.sucs.some(x => x.SucursalID === this.sucSel)) this.sucSel = this.sucs.some(x => x.SucursalID === dev) ? dev : (this.sucs[0] || {}).SucursalID;
    this.q('iSuc').innerHTML = this.sucs.map(x => `<option value="${esc(x.SucursalID)}" ${x.SucursalID === this.sucSel ? 'selected' : ''}>${esc(x.Nombre)}</option>`).join('');
    try { await this.cargar(); } catch (e) { this.msg(e.message); }
    this.pintar();
  },
  /** Sucursal del dispositivo: cache local incremental (funciona offline). Otras sucursales: consulta en linea. */
  async cargar() {
    if (!this.sucSel) { this.stock = {}; return; }
    const dev = await Admin.sucursalActiva(); let filas;
    if (this.sucSel === dev) {
      const key = this.ses.NegocioID + '|' + dev, dm = await LocalDB.get('configuracion', 'datos_inventario');
      if (!dm || dm.Valor !== key) { await LocalDB.clear('inventario'); await LocalDB.delete('configuracion', 'sync_inventario'); await LocalDB.put('configuracion', { Clave: 'datos_inventario', Valor: key }); }
      if (navigator.onLine) {
        try {
          const m = await LocalDB.get('configuracion', 'sync_inventario');
          const r = await Admin.api('obtenerStock', { sucursalId: dev, desde: m ? m.Valor : null });
          if (r.stock.length) await LocalDB.putMany('inventario', r.stock);
          await LocalDB.put('configuracion', { Clave: 'sync_inventario', Valor: r.serverTime });
        } catch (e) { this.msg('No se pudo actualizar: ' + e.message); }
      }
      filas = await LocalDB.getAll('inventario');
    } else {
      if (!navigator.onLine) throw new Error('Sin conexión: solo se ve el stock de la sucursal de este dispositivo');
      filas = (await Admin.api('obtenerStock', { sucursalId: this.sucSel })).stock;
    }
    this.stock = Object.fromEntries(filas.map(r => [r.ProductoID, r.Stock]));
  },
  estado(p) { const s = this.stock[p.ProductoID] || 0; return s <= 0 ? ['Sin stock', 'danger'] : (p.StockMinimo > 0 && s <= p.StockMinimo) ? ['Bajo', 'warning'] : ['OK', 'success']; },
  pintar() {
    const t = norm(this.q('iBus').value), bajo = this.q('iBajo').checked;
    const act = Productos.prods.filter(p => p.Activo);
    this.etq = {}; act.forEach(p => { this.etq[this.etq2(p)] = p.ProductoID; });
    this.q('dlProd').innerHTML = act.map(p => `<option value="${esc(this.etq2(p))}">`).join('');
    const l = act.filter(p => (!t || [p.Nombre, p.Codigo, p.CodigoBarras, p.SKU].some(v => norm(v).includes(t))) && (!bajo || this.estado(p)[1] !== 'success')).sort((a, b) => a.Nombre.localeCompare(b.Nombre));
    const dest = this.sucs.filter(x => x.SucursalID !== this.sucSel); this.q('tDest').innerHTML = dest.map(x => `<option value="${esc(x.SucursalID)}">${esc(x.Nombre)}</option>`).join('');
    this.q('iInfo').textContent = `${l.length} productos` + (l.length > 100 ? ' (mostrando 100)' : '') + (navigator.onLine ? '' : ' · sin conexión: datos locales');
    this.q('iTab').innerHTML = l.slice(0, 100).map(p => { const [e, c] = this.estado(p); return `<tr><td>${esc(p.Nombre)}<div class="small text-muted">${esc(p.Codigo)}</div></td>
      <td class="text-end fw-bold">${this.stock[p.ProductoID] || 0} <span class="small text-muted">${esc(p.Unidad)}</span></td><td class="text-end">${p.StockMinimo}</td>
      <td><span class="badge text-bg-${c}">${e}</span></td><td class="text-end"><button class="btn btn-sm btn-outline-secondary" data-a="k" data-id="${esc(p.ProductoID)}">Kardex</button>
      ${this.can('inventario.ajustar') ? `<button class="btn btn-sm btn-outline-primary" data-a="aj" data-id="${esc(p.ProductoID)}">Ajustar</button>` : ''}</td></tr>`; }).join('');
  },

  async ajustar() {
    const tipo = this.q('aTipo').value, productoId = this.prodDe(this.q('aProd').value), nota = this.q('aNota').value;
    this.opAj = this.opAj || uuid(); const base = { operacionId: this.opAj, sucursalId: this.sucSel, productoId };
    if (tipo === 'CONTEO') await Admin.api('fijarStock', Object.assign(base, { contado: this.q('aCant').value, notas: nota }));
    else await Admin.api('ajustarInventario', Object.assign(base, { tipo, cantidad: this.q('aCant').value, costo: this.q('aCosto').value, notas: nota }));
    this.opAj = null; ['aProd', 'aCant', 'aCosto', 'aNota'].forEach(i => { this.q(i).value = ''; });
    await this.cargar(); this.pintar(); this.msg('Movimiento registrado', 1);
  },
  async transferir() {
    const productoId = this.prodDe(this.q('tProd').value); if (!this.q('tDest').value) throw new Error('Elige la sucursal destino');
    this.opTr = this.opTr || uuid();
    await Admin.api('transferirInventario', { operacionId: this.opTr, origenId: this.sucSel, destinoId: this.q('tDest').value, notas: this.q('tNota').value, lineas: [{ productoId, cantidad: this.q('tCant').value }] });
    this.opTr = null; ['tProd', 'tCant', 'tNota'].forEach(i => { this.q(i).value = ''; });
    await this.cargar(); this.pintar(); this.msg('Transferencia completada', 1);
  },
  async kardex(p) {
    const m = await Admin.api('listarMovimientos', { productoId: p.ProductoID, sucursalId: this.sucSel, limite: 50 });
    this.q('kT').textContent = 'Kardex: ' + p.Nombre; this.q('kCard').classList.remove('d-none');
    this.q('kTab').innerHTML = m.map(x => { const s = MOV_SIGNO[x.TipoMovimiento] * x.Cantidad;
      return `<tr><td class="small">${new Date(x.FechaHora).toLocaleString()}</td><td>${MOV_ETQ[x.TipoMovimiento] || x.TipoMovimiento}</td>
      <td class="text-end ${s < 0 ? 'text-danger' : 'text-success'}">${s > 0 ? '+' : ''}${s}</td><td class="small text-muted">${esc(x.Notas)}</td></tr>`; }).join('') || '<tr><td class="text-muted">Sin movimientos</td></tr>';
    this.q('kCard').scrollIntoView({ behavior: 'smooth' });
  },
  async verificar() {
    const r = await Admin.api('reconstruirInventario', { aplicar: false });
    if (!r.diferencias.length) return this.msg('Inventario consistente con los movimientos', 1);
    if (!confirm(`Hay ${r.diferencias.length} diferencias entre el stock guardado y los movimientos. ¿Corregir desde los movimientos?`)) return;
    await Admin.api('reconstruirInventario', { aplicar: true }); await this.cargar(); this.pintar(); this.msg('Inventario reconstruido', 1);
  }
};
Inventario.init();