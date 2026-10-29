/** FASE 7 - pos.js : punto de venta offline-first (venta al contado, un metodo de pago) + consulta de ventas + ticket. */
const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
function calcLinea(cant, precio, dpct, tasa) { const bruto = r2(cant * precio), d = r2(bruto * dpct / 100), t = r2(bruto - d); return { bruto, desc: d, total: t, imp: r2(t - t / (1 + tasa)) }; }

const Pos = {
  ses: null, prods: [], clientes: [], metodos: [], stock: {}, carrito: [], cliente: null, suc: null, sucNombre: '', negNombre: '', busy: false,
  q: id => document.getElementById(id),
  msg(t, ok) { const m = this.q('poMsg'); m.className = t ? 'alert py-2 small mb-2 alert-' + (ok ? 'success' : 'danger') : 'd-none'; m.textContent = t || ''; },
  visible() { return !this.q('vPos').classList.contains('d-none'); },

  init() {
    this.q('vPos').innerHTML = `
    <div class="row g-3"><div class="col-lg-8"><div class="card shadow-sm"><div class="card-body">
      <div id="poMsg" class="d-none"></div>
      <div class="row g-2 mb-2">
        <div class="col-md-7 position-relative"><input id="poBus" class="form-control form-control-lg" placeholder="Buscar o escanear (F2)" autocomplete="off">
          <div id="poSug" class="list-group position-absolute w-100 shadow d-none" style="z-index:20"></div></div>
        <div class="col-md-5"><input id="poCli" list="poDlCli" class="form-control form-control-lg" placeholder="Cliente (F4) · Consumidor final"></div></div>
      <div class="form-check mb-2"><input id="poMay" type="checkbox" class="form-check-input"><label for="poMay" class="form-check-label small">Precio mayorista</label></div>
      <div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Producto</th><th style="width:90px">Cant.</th><th class="text-end">Precio</th><th style="width:80px">Desc. %</th><th class="text-end">Total</th><th></th></tr></thead><tbody id="poCart"></tbody></table></div>
      <input id="poNota" class="form-control" placeholder="Notas de la venta"></div></div></div>
    <div class="col-lg-4"><div class="card shadow-sm"><div class="card-body">
      <div class="d-flex justify-content-between small"><span>Subtotal</span><span id="poSub"></span></div>
      <div class="d-flex justify-content-between small"><span>Descuento</span><span id="poDesc"></span></div>
      <div class="d-flex justify-content-between small text-muted"><span>Impuesto incluido</span><span id="poImp"></span></div>
      <div class="d-flex justify-content-between fs-3 fw-bold border-top mt-2 pt-2"><span>Total</span><span id="poTot">0.00</span></div>
      <div class="d-grid gap-2 mt-2"><button id="poCobrar" class="btn btn-success btn-lg">Cobrar (F6)</button>
        <div class="d-flex gap-2"><button id="poSuspBtn" class="btn btn-outline-secondary flex-fill">Suspender (F8)</button><button id="poVaciar" class="btn btn-outline-danger">Vaciar</button></div></div>
      <div id="poPago" class="border rounded p-2 mt-3 d-none">
        <select id="poMet" class="form-select mb-2"></select>
        <input id="poRef" class="form-control mb-2 d-none" placeholder="Referencia (opcional)">
        <div id="poRecW"><input id="poRec" type="number" step="any" min="0" class="form-control mb-1" placeholder="Monto recibido"><div class="small">Cambio: <b id="poCambio">0.00</b></div></div>
        <div class="d-flex gap-2 mt-2"><button id="poOk" class="btn btn-primary flex-fill">Confirmar venta</button><button id="poNo" class="btn btn-outline-secondary">Cancelar</button></div></div>
      <div id="poSusp" class="mt-3 small"></div></div></div></div></div><datalist id="poDlCli"></datalist>`;
    const on = (id, ev, f) => this.q(id).addEventListener(ev, f), run = f => async e => { try { this.msg(''); await f(e); } catch (er) { this.msg(er.message); } };
    on('poBus', 'input', () => this.sugerir());
    on('poBus', 'keydown', e => { if (e.key !== 'Enter') return; e.preventDefault(); const l = this.buscar(this.q('poBus').value); if (l.length) this.agregar(l[0]); });
    on('poSug', 'click', e => { const b = e.target.closest('[data-id]'); if (b) this.agregar(this.prods.find(p => p.ProductoID === b.dataset.id)); });
    on('poCli', 'change', () => { const v = this.q('poCli').value.trim(); this.cliente = null;
      if (v) { this.cliente = this.clientes.find(c => this.etqCli(c) === v) || null; if (!this.cliente) this.msg('Selecciona un cliente de la lista'); } });
    on('poMay', 'change', () => { this.carrito.forEach(l => { const p = this.prods.find(x => x.ProductoID === l.ProductoID); l.Precio = this.precioDe(p); l.DescuentoPct = 0; }); this.pintar(); });
    on('poCart', 'change', run(e => { const t = e.target, l = this.carrito[+t.dataset.i]; if (!l) return;
      if (t.dataset.f === 'c') { const v = Number(t.value); if (!(v > 0)) this.carrito.splice(+t.dataset.i, 1); else l.Cantidad = Math.round(v * 10000) / 10000; }
      else { let d = Math.min(100, Math.max(0, Number(t.value) || 0)); const max = l.PrecioMinimo > 0 && l.Precio > 0 ? Math.floor((1 - l.PrecioMinimo / l.Precio) * 10000) / 100 : 100;
        if (d > max) { d = Math.max(max, 0); this.msg(`Descuento máximo ${d}% (precio mínimo ${money(l.PrecioMinimo)})`); } l.DescuentoPct = d; }
      this.pintar(); }));
    on('poCart', 'click', e => { const b = e.target.closest('button'); if (b) { this.carrito.splice(+b.dataset.i, 1); this.pintar(); } });
    on('poCobrar', 'click', run(() => this.abrirPago()));
    on('poNo', 'click', () => this.q('poPago').classList.add('d-none'));
    on('poOk', 'click', run(() => this.confirmar()));
    on('poMet', 'change', () => this.metodoCambio());
    on('poRec', 'input', () => this.cambio());
    on('poRec', 'keydown', e => { if (e.key === 'Enter') this.q('poOk').click(); });
    on('poSuspBtn', 'click', run(() => this.suspender()));
    on('poVaciar', 'click', () => { if (this.carrito.length && confirm('¿Vaciar la venta actual?')) { this.carrito = []; this.pintar(); } });
    on('poSusp', 'click', run(e => this.accionSusp(e)));
    document.addEventListener('keydown', e => {
      if (!this.visible()) return;
      const f = { F2: () => this.q('poBus').focus(), F4: () => this.q('poCli').focus(), F6: () => this.q('poCobrar').click(), F8: () => this.q('poSuspBtn').click() };
      if (f[e.key]) { e.preventDefault(); f[e.key](); } else if (e.key === 'Escape') { this.q('poPago').classList.add('d-none'); this.q('poSug').classList.add('d-none'); }
    });
    this.q('tabPos').addEventListener('click', async () => { Productos.tab('pos'); try { await this.cargarDatos(); } catch (e) { this.msg(e.message); } this.q('poBus').focus(); });
  },
  etqCli(c) { return c.Nombre + (c.Documento ? ' · ' + c.Documento : ''); },
  precioDe(p) { return this.q('poMay').checked && p.PrecioMayorista > 0 ? p.PrecioMayorista : p.PrecioVenta; },

  async onSesion(s) {
    this.ses = s; const ok = !!s && Auth.tiene(s, 'ventas.crear'); this.q('tabPos').classList.toggle('d-none', !ok);
    if (!ok) return; this.suspendidas = ((await LocalDB.get('configuracion', 'suspendidas')) || {}).Valor || []; this.pintarSusp();
  },
  async cargarDatos() {
    const neg = this.ses.NegocioID, dev = await Admin.sucursalActiva(); this.suc = dev;
    this.prods = (await LocalDB.getAll('productos')).filter(p => p.NegocioID === neg && p.Activo);
    this.clientes = (await LocalDB.getAll('clientes')).filter(c => c.NegocioID === neg && c.Estado === 'Activo');
    const dm = await LocalDB.get('configuracion', 'datos_inventario'); this.stock = {};
    if (dm && dm.Valor === neg + '|' + dev) (await LocalDB.getAll('inventario')).forEach(r => { this.stock[r.ProductoID] = r.Stock; });
    if (navigator.onLine) {
      try { await LocalDB.put('configuracion', { Clave: 'metodos_pago', Valor: await Admin.api('listarMetodosPago', {}) }); } catch (e) {}
      try { const n = (await Admin.api('listarNegocios', {})).find(x => x.activo); if (n) await LocalDB.put('configuracion', { Clave: 'negocio_nombre', Valor: n.Nombre }); } catch (e) {}
    }
    this.metodos = (((await LocalDB.get('configuracion', 'metodos_pago')) || {}).Valor || []).filter(m => m.Tipo !== 'Crédito');
    this.negNombre = ((await LocalDB.get('configuracion', 'negocio_nombre')) || {}).Valor || '';
    const sc = (await Admin.sucursales()).find(x => x.SucursalID === dev); this.sucNombre = sc ? sc.Nombre : '';
    this.q('poDlCli').innerHTML = this.clientes.map(c => `<option value="${esc(this.etqCli(c))}">`).join('');
    if (!dev) this.msg('Selecciona la sucursal de este dispositivo en la pestaña Inicio.');
    else if (!this.metodos.length) this.msg('No hay métodos de pago guardados: conéctate a Internet una vez para descargarlos.');
    else if (!this.prods.length) this.msg('No hay productos en este dispositivo: abre la pestaña Productos con Internet para descargarlos.');
    this.pintar();
  },
  buscar(t) {
    t = norm(t); if (!t) return [];
    const ex = this.prods.filter(p => [p.CodigoBarras, p.Codigo, p.SKU].some(v => v && norm(v) === t)); if (ex.length) return ex;
    return this.prods.filter(p => [p.Nombre, p.Marca, p.Codigo].some(v => norm(v).includes(t))).slice(0, 8);
  },
  sugerir() {
    const l = this.q('poBus').value.trim().length >= 2 ? this.buscar(this.q('poBus').value) : [], s = this.q('poSug');
    s.classList.toggle('d-none', !l.length);
    s.innerHTML = l.map(p => `<button type="button" class="list-group-item list-group-item-action d-flex justify-content-between" data-id="${esc(p.ProductoID)}"><span>${esc(p.Nombre)} <small class="text-muted">${esc(p.Codigo)}</small></span><b>${money(this.precioDe(p))}</b></button>`).join('');
  },
  agregar(p) {
    if (!p) return; const l = this.carrito.find(x => x.ProductoID === p.ProductoID);
    if (l) l.Cantidad = Math.round((l.Cantidad + 1) * 10000) / 10000;
    else this.carrito.push({ ProductoID: p.ProductoID, Nombre: p.Nombre, Codigo: p.Codigo, Cantidad: 1, Precio: this.precioDe(p), DescuentoPct: 0, Impuesto: p.Impuesto, PrecioMinimo: p.PrecioMinimo });
    this.q('poBus').value = ''; this.q('poSug').classList.add('d-none'); this.pintar(); this.q('poBus').focus();
  },
  totales() {
    let sub = 0, desc = 0, imp = 0, tot = 0;
    this.carrito.forEach(l => { const c = calcLinea(l.Cantidad, l.Precio, l.DescuentoPct, l.Impuesto); sub += c.bruto; desc += c.desc; imp += c.imp; tot += c.total; });
    return { sub: r2(sub), desc: r2(desc), imp: r2(imp), tot: r2(tot) };
  },
  pintar() {
    this.q('poCart').innerHTML = this.carrito.map((l, i) => { const c = calcLinea(l.Cantidad, l.Precio, l.DescuentoPct, l.Impuesto), st = this.stock[l.ProductoID];
      return `<tr><td>${esc(l.Nombre)}${st !== undefined && l.Cantidad > st ? ` <span class="badge text-bg-warning">stock ${st}</span>` : ''}</td>
      <td><input data-i="${i}" data-f="c" type="number" step="any" min="0" value="${l.Cantidad}" class="form-control form-control-sm"></td><td class="text-end">${money(l.Precio)}</td>
      <td><input data-i="${i}" data-f="d" type="number" step="any" min="0" max="100" value="${l.DescuentoPct}" class="form-control form-control-sm"></td>
      <td class="text-end">${money(c.total)}</td><td><button class="btn btn-sm btn-outline-danger" data-i="${i}">✕</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="text-muted text-center">Escanea o busca un producto</td></tr>';
    const t = this.totales(); this.q('poSub').textContent = money(t.sub); this.q('poDesc').textContent = money(t.desc); this.q('poImp').textContent = money(t.imp); this.q('poTot').textContent = money(t.tot);
  },

  abrirPago() {
    if (!this.carrito.length) throw new Error('La venta está vacía');
    if (!this.suc) throw new Error('Selecciona la sucursal de este dispositivo en la pestaña Inicio');
    if (!this.metodos.length) throw new Error('No hay métodos de pago disponibles');
    this.q('poMet').innerHTML = this.metodos.map(m => `<option value="${esc(m.MetodoPagoID)}">${esc(m.Nombre)}</option>`).join('');
    this.q('poPago').classList.remove('d-none'); this.metodoCambio();
  },
  metodo() { return this.metodos.find(m => m.MetodoPagoID === this.q('poMet').value); },
  metodoCambio() { const ef = this.metodo().Tipo === 'Efectivo'; this.q('poRecW').classList.toggle('d-none', !ef); this.q('poRef').classList.toggle('d-none', ef);
    this.q('poRec').value = this.totales().tot; this.cambio(); (ef ? this.q('poRec') : this.q('poOk')).focus(); if (ef) this.q('poRec').select(); },
  cambio() { this.q('poCambio').textContent = money(Math.max(0, r2(Number(this.q('poRec').value) - this.totales().tot))); },

  async siguienteNumero() {
    let d = (await LocalDB.get('configuracion', 'dispositivo_id')); if (!d) { d = { Clave: 'dispositivo_id', Valor: uuid().replace(/-/g, '').slice(0, 3).toUpperCase() }; await LocalDB.put('configuracion', d); }
    const s = (await LocalDB.get('configuracion', 'venta_seq')), n = ((s && s.Valor) || 0) + 1; await LocalDB.put('configuracion', { Clave: 'venta_seq', Valor: n });
    return `${d.Valor}-${String(n).padStart(5, '0')}`;
  },
  async confirmar() {
    if (this.busy) return; this.busy = true; this.q('poOk').disabled = true;
    try {
      const t = this.totales(), m = this.metodo(), ef = m.Tipo === 'Efectivo', rec = ef ? Number(this.q('poRec').value) : t.tot;
      if (!(t.tot >= 0) || !this.carrito.length) throw new Error('La venta está vacía'); if (ef && rec + 0.001 < t.tot) throw new Error('El monto recibido es menor que el total');
      const id = 'VEN-' + uuid().replace(/-/g, '').slice(0, 10).toUpperCase(), numero = await this.siguienteNumero(), notas = this.q('poNota').value.trim();
      const payload = { VentaID: id, Numero: numero, ClienteID: this.cliente ? this.cliente.ClienteID : '', Notas: notas,
        lineas: this.carrito.map(l => ({ ProductoID: l.ProductoID, Cantidad: l.Cantidad, Precio: l.Precio, DescuentoPct: l.DescuentoPct })), pagos: [{ MetodoPagoID: m.MetodoPagoID, Monto: t.tot, Referencia: this.q('poRef').value.trim() }] };
      const ctx = { UsuarioID: this.ses.UsuarioID, NegocioID: this.ses.NegocioID, SucursalID: this.suc }, op = SyncQueue.build('CREAR_VENTA', 'Venta', id, payload, ctx);
      const v = { VentaID: id, Numero: numero, NegocioID: this.ses.NegocioID, SucursalID: this.suc, NegocioNombre: this.negNombre, SucursalNombre: this.sucNombre, UsuarioNombre: this.ses.Nombre,
        ClienteNombre: this.cliente ? this.cliente.Nombre : '', Fecha: op.FechaCreacion, Notas: notas, Subtotal: t.sub, Descuento: t.desc, Impuesto: t.imp, Total: t.tot, Estado: 'Completada', Recibido: rec, Cambio: r2(rec - t.tot),
        lineas: this.carrito.map(l => ({ Nombre: l.Nombre, Cantidad: l.Cantidad, Precio: l.Precio, Descuento: calcLinea(l.Cantidad, l.Precio, l.DescuentoPct, l.Impuesto).desc, Total: calcLinea(l.Cantidad, l.Precio, l.DescuentoPct, l.Impuesto).total })), pagos: [{ Metodo: m.Nombre, Monto: t.tot }] };
      await LocalDB.saveWithOp('ventas', v, op);   // venta + cola en UNA transaccion: no se pierde ni se duplica
      for (const l of this.carrito) { const r = await LocalDB.get('inventario', l.ProductoID); if (r && this.stock[l.ProductoID] !== undefined) await LocalDB.put('inventario', Object.assign({}, r, { Stock: r2(r.Stock - l.Cantidad) })); }
      Connectivity.emit(); this.carrito.forEach(l => { if (this.stock[l.ProductoID] !== undefined) this.stock[l.ProductoID] = r2(this.stock[l.ProductoID] - l.Cantidad); });
      this.carrito = []; this.cliente = null; this.q('poCli').value = ''; this.q('poNota').value = ''; this.q('poRef').value = ''; this.q('poPago').classList.add('d-none'); this.pintar();
      this.msg(`Venta ${numero} registrada${ef && v.Cambio > 0 ? ' · Cambio: ' + money(v.Cambio) : ''}`, 1); this.imprimir(v); SyncEngine.run();
    } finally { this.busy = false; this.q('poOk').disabled = false; }
  },

  // ---------- ventas suspendidas (solo en este dispositivo) ----------
  async guardarSusp() { await LocalDB.put('configuracion', { Clave: 'suspendidas', Valor: this.suspendidas }); this.pintarSusp(); },
  async suspender() {
    if (!this.carrito.length) throw new Error('No hay nada que suspender');
    this.suspendidas.push({ id: uuid(), fecha: new Date().toISOString(), carrito: this.carrito, clienteId: this.cliente ? this.cliente.ClienteID : '', nota: this.q('poNota').value });
    this.carrito = []; this.cliente = null; this.q('poCli').value = ''; this.q('poNota').value = ''; await this.guardarSusp(); this.pintar(); this.msg('Venta suspendida', 1);
  },
  pintarSusp() {
    this.q('poSusp').innerHTML = this.suspendidas.length ? '<div class="fw-bold mb-1">Ventas suspendidas</div>' + this.suspendidas.map(s => `<div class="d-flex justify-content-between align-items-center border-bottom py-1">
      <span>${new Date(s.fecha).toLocaleTimeString()} · ${s.carrito.length} prod.</span><span><button class="btn btn-sm btn-outline-primary" data-a="r" data-id="${s.id}">Recuperar</button>
      <button class="btn btn-sm btn-outline-danger" data-a="d" data-id="${s.id}">✕</button></span></div>`).join('') : '';
  },
  async accionSusp(e) {
    const b = e.target.closest('button'); if (!b) return; const i = this.suspendidas.findIndex(s => s.id === b.dataset.id), s = this.suspendidas[i]; if (!s) return;
    if (b.dataset.a === 'r') {
      if (this.carrito.length && !confirm('La venta actual se reemplazará. ¿Continuar?')) return;
      this.carrito = s.carrito; this.cliente = this.clientes.find(c => c.ClienteID === s.clienteId) || null; this.q('poCli').value = this.cliente ? this.etqCli(this.cliente) : ''; this.q('poNota').value = s.nota || '';
    } else if (!confirm('¿Eliminar la venta suspendida?')) return;
    this.suspendidas.splice(i, 1); await this.guardarSusp(); this.pintar();
  },

  // ---------- ticket (80 mm) ----------
  imprimir(v) {
    const f = n => money(n), L = v.lineas.map(l => `<tr><td colspan="3">${esc(l.Nombre)}</td></tr><tr><td>${l.Cantidad} x ${f(l.Precio)}</td><td>${l.Descuento > 0 ? '-' + f(l.Descuento) : ''}</td><td class="r">${f(l.Total)}</td></tr>`).join('');
    const html = `<html><head><meta charset="utf-8"><style>@page{size:80mm auto;margin:3mm}body{font:12px monospace;width:74mm;margin:0}table{width:100%;border-collapse:collapse}td{padding:1px 0}.r{text-align:right}.c{text-align:center}hr{border:0;border-top:1px dashed #000}</style></head><body>
      <div class="c"><b>${esc(v.NegocioNombre)}</b><br>${esc(v.SucursalNombre)}</div><hr>Venta: ${esc(v.Numero)}<br>Fecha: ${new Date(v.Fecha).toLocaleString()}<br>Atendió: ${esc(v.UsuarioNombre)}<br>Cliente: ${esc(v.ClienteNombre || 'Consumidor final')}<hr>
      <table>${L}</table><hr><table><tr><td>Subtotal</td><td class="r">${f(v.Subtotal)}</td></tr><tr><td>Descuento</td><td class="r">${f(v.Descuento)}</td></tr><tr><td>Impuesto incl.</td><td class="r">${f(v.Impuesto)}</td></tr>
      <tr><td><b>TOTAL</b></td><td class="r"><b>${f(v.Total)}</b></td></tr>${v.pagos.map(p => `<tr><td>${esc(p.Metodo)}</td><td class="r">${f(p.Monto)}</td></tr>`).join('')}
      ${v.Recibido ? `<tr><td>Recibido</td><td class="r">${f(v.Recibido)}</td></tr><tr><td>Cambio</td><td class="r">${f(v.Cambio)}</td></tr>` : ''}<tr><td>Saldo pendiente</td><td class="r">0.00</td></tr></table>
      ${v.Notas ? `<hr>${esc(v.Notas)}` : ''}<hr><div class="c">¡Gracias por su compra!</div></body></html>`;
    const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;width:0;height:0;border:0'; document.body.appendChild(fr);
    fr.contentDocument.open(); fr.contentDocument.write(html); fr.contentDocument.close();
    setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); setTimeout(() => fr.remove(), 2000); }, 300);
  }
};

/** Consulta de ventas: este dispositivo (offline) y servidor (ultimos 7 dias). */
const Ventas = {
  ses: null, fuente: 'hoy',
  q: id => document.getElementById(id),
  init() {
    this.q('vVen').innerHTML = `<div class="card shadow-sm"><div class="card-body"><div id="veMsg" class="d-none"></div>
      <div class="row g-2 mb-2"><div class="col-md-4"><select id="veFuente" class="form-select"><option value="hoy">Hoy · este dispositivo</option><option value="todo">Todas · este dispositivo</option><option value="srv">Servidor · últimos 7 días</option></select></div>
        <div class="col-md-5"><input id="veBus" class="form-control" placeholder="Buscar número o cliente"></div></div>
      <div id="veInfo" class="small text-muted mb-2"></div>
      <div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Número</th><th>Fecha</th><th>Cliente</th><th class="text-end">Total</th><th>Estado</th><th></th></tr></thead><tbody id="veTab"></tbody></table></div></div></div>`;
    this.q('veFuente').onchange = () => this.cargar(); this.q('veBus').oninput = () => this.pintar();
    this.q('tabVen').onclick = () => { Productos.tab('ven'); this.cargar(); };
    this.q('veTab').onclick = async e => { const b = e.target.closest('button'); if (!b) return; const v = this.filas.find(x => x.VentaID === b.dataset.id);
      try { Pos.imprimir(v.origen === 'srv' ? await Admin.api('obtenerVenta', { ventaId: v.VentaID }) : v); } catch (er) { this.msg(er.message); } };
  },
  msg(t) { const m = this.q('veMsg'); m.className = t ? 'alert alert-danger py-2 small mb-2' : 'd-none'; m.textContent = t || ''; },
  async onSesion(s) { this.ses = s; this.q('tabVen').classList.toggle('d-none', !(s && Auth.tiene(s, 'ventas.ver'))); },
  async cargar() {
    this.fuente = this.q('veFuente').value; const neg = this.ses.NegocioID, dev = await Admin.sucursalActiva(); this.msg('');
    this.pend = {}; (await SyncQueue.all()).forEach(o => { if (o.TipoOperacion === 'CREAR_VENTA') this.pend[o.EntidadID] = o; });
    const mapa = {}; (await LocalDB.getAll('ventas')).filter(v => v.NegocioID === neg).forEach(v => { mapa[v.VentaID] = Object.assign({ origen: 'local' }, v); });
    if (this.fuente === 'srv') {
      if (!navigator.onLine) this.msg('Sin conexión: se muestran solo las ventas de este dispositivo');
      else try { (await Admin.api('listarVentas', { dias: 7, sucursalId: dev })).forEach(s => { if (!mapa[s.VentaID]) mapa[s.VentaID] = Object.assign({ origen: 'srv' }, s); }); } catch (e) { this.msg(e.message); }
    }
    this.filas = Object.values(mapa).sort((a, b) => a.Fecha < b.Fecha ? 1 : -1); this.pintar();
  },
  pintar() {
    const t = norm(this.q('veBus').value), hoy = new Date().toDateString();
    const l = this.filas.filter(v => (this.fuente !== 'hoy' || new Date(v.Fecha).toDateString() === hoy) && (!t || norm(v.Numero).includes(t) || norm(v.ClienteNombre).includes(t)));
    this.q('veInfo').textContent = `${l.length} ventas · Total: ${money(l.reduce((s, v) => s + v.Total, 0))}`;
    this.q('veTab').innerHTML = l.slice(0, 200).map(v => { const o = this.pend[v.VentaID];
      const est = o ? (o.Estado === 'ERROR' ? `<span class="badge text-bg-danger" title="${esc(o.Error)}">Error de sincronización</span>` : '<span class="badge text-bg-warning">Pendiente</span>') : '<span class="badge text-bg-success">Sincronizada</span>';
      return `<tr><td>${esc(v.Numero)}</td><td class="small">${new Date(v.Fecha).toLocaleString()}</td><td>${esc(v.ClienteNombre || 'Consumidor final')}</td><td class="text-end">${money(v.Total)}</td><td>${est}</td>
      <td class="text-end"><button class="btn btn-sm btn-outline-secondary" data-id="${esc(v.VentaID)}">Ticket</button></td></tr>`; }).join('') || '<tr><td class="text-muted">Sin ventas</td></tr>';
  }
};
Pos.init(); Ventas.init();