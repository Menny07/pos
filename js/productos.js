/** FASE 4 - productos.js : catalogo local (IndexedDB), busqueda, CRUD, importar/exportar CSV, codigos de barras. */
const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const money = n => Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function ean13() { const b = '200' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0'); let s = 0; for (let i = 0; i < 12; i++) s += +b[i] * (i % 2 ? 3 : 1); return b + ((10 - s % 10) % 10); }
function parseCSV(t, sep) {
  const rows = []; let r = [], c = '', q = false; t = t.replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { r.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; r.push(c); c = ''; rows.push(r); r = []; }
    else c += ch;
  }
  if (c !== '' || r.length) { r.push(c); rows.push(r); }
  return rows.filter(x => x.some(v => v.trim() !== ''));
}
const CSV_COLS = ['Codigo', 'CodigoBarras', 'SKU', 'Nombre', 'Descripcion', 'Categoria', 'Marca', 'Unidad', 'Costo', 'PrecioVenta', 'PrecioMayorista', 'PrecioMinimo', 'ImpuestoPorcentaje', 'StockMinimo', 'StockMaximo'];
const UNIDADES = ['Unidad', 'Libra', 'Kg', 'Litro', 'Caja', 'Paquete', 'Docena', 'Metro', 'Otro'];
const FORM = [['Nombre', 'Nombre *', 'text', 6], ['Codigo', 'Código interno', 'text', 3], ['SKU', 'SKU', 'text', 3], ['CodigoBarras', 'Código de barras', 'text', 5],
  ['CategoriaID', 'Categoría', 'cat', 4], ['Marca', 'Marca', 'text', 3], ['Unidad', 'Unidad', 'uni', 3],
  ['Costo', 'Costo', 'number', 3], ['PrecioVenta', 'Precio venta', 'number', 3], ['PrecioMayorista', 'Precio mayorista', 'number', 3], ['PrecioMinimo', 'Precio mínimo', 'number', 3],
  ['ImpuestoPct', 'Impuesto %', 'number', 3], ['StockMinimo', 'Stock mínimo', 'number', 3], ['StockMaximo', 'Stock máximo (0 = sin tope)', 'number', 3], ['Descripcion', 'Descripción', 'text', 12]];

const Productos = {
  ses: null, prods: [], cats: [], editId: null,
  q: id => document.getElementById(id),
  msg(t, ok) { const m = this.q('pMsg'); m.className = 'small mt-2 ' + (ok ? 'text-success' : 'text-danger'); m.textContent = t || ''; },
  can(c) { return Auth.tiene(this.ses, c); },

  init() {
    this.q('vProd').innerHTML = `
    <div class="card shadow-sm mb-3"><div class="card-body">
      <div class="row g-2 mb-2">
        <div class="col-md-5"><input id="pBus" class="form-control" placeholder="Buscar nombre, código, barras, SKU (Enter al escanear)"></div>
        <div class="col-md-3"><select id="pCat" class="form-select"></select></div>
        <div class="col-md-2"><select id="pEst" class="form-select"><option value="1">Activos</option><option value="0">Inactivos</option><option value="*">Todos</option></select></div>
        <div class="col-md-2 d-grid"><button id="pNuevo" class="btn btn-primary">+ Producto</button></div></div>
      <div id="pInfo" class="small text-muted mb-2"></div>
      <div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Código</th><th>Nombre</th><th>Categoría</th><th class="text-end">Costo</th><th class="text-end">Precio</th><th>Imp.</th><th></th></tr></thead><tbody id="pTab"></tbody></table></div>
      <div class="d-flex gap-2 flex-wrap"><button id="pExp" class="btn btn-sm btn-outline-secondary">Exportar CSV</button>
        <button id="pPlan" class="btn btn-sm btn-outline-secondary">Plantilla CSV</button>
        <label class="btn btn-sm btn-outline-secondary mb-0">Importar CSV<input id="pImp" type="file" accept=".csv,text/csv" hidden></label></div>
      <div id="pMsg" class="small mt-2"></div></div></div>
    <div id="pForm" class="card shadow-sm mb-3 d-none"><div class="card-body"><h6 id="pFormT"></h6><div class="row g-2">
      ${FORM.map(([k, l, t, w]) => `<div class="col-md-${w}"><label class="form-label small mb-0">${l}</label>${
        t === 'cat' ? `<select id="f_${k}" class="form-select"></select>` :
        t === 'uni' ? `<select id="f_${k}" class="form-select">${UNIDADES.map(u => `<option>${u}</option>`).join('')}</select>` :
        k === 'CodigoBarras' ? `<div class="input-group"><input id="f_${k}" class="form-control"><button id="pGen" type="button" class="btn btn-outline-secondary">Generar</button></div>` :
        `<input id="f_${k}" type="${t}" ${t === 'number' ? 'step="any" min="0"' : ''} class="form-control">`}</div>`).join('')}
      <div class="col-12 d-flex gap-2"><button id="pGuardar" class="btn btn-primary">Guardar</button><button id="pCancelar" class="btn btn-outline-secondary">Cancelar</button></div></div></div></div>
    <div class="card shadow-sm"><div class="card-body"><h6>Categorías</h6><div id="cList" class="mb-2"></div>
      <div id="cNueva" class="input-group"><input id="cNom" class="form-control" placeholder="Nueva categoría"><button id="cAdd" class="btn btn-outline-primary">Agregar</button></div></div></div>`;
    const on = (id, ev, f) => this.q(id).addEventListener(ev, f);
    const run = f => async e => { try { this.msg(''); await f(e); } catch (er) { this.msg(er.message); } };
    ['pBus', 'pCat', 'pEst'].forEach(id => on(id, 'input', () => this.pintar()));
    on('pBus', 'keydown', e => { if (e.key === 'Enter') { const l = this.filtrar(); if (l.length === 1) this.abrirForm(l[0]); } });
    on('pNuevo', 'click', () => this.abrirForm(null));
    on('pCancelar', 'click', () => this.q('pForm').classList.add('d-none'));
    on('pGen', 'click', () => { this.q('f_CodigoBarras').value = ean13(); });
    on('pGuardar', 'click', run(() => this.guardar()));
    on('pTab', 'click', run(async e => {
      const b = e.target.closest('button'); if (!b) return; const p = this.prods.find(x => x.ProductoID === b.dataset.id);
      if (b.dataset.a === 'edit') this.abrirForm(p); else await this.actualizar(p.ProductoID, { Activo: !p.Activo });
    }));
    on('cAdd', 'click', run(async () => { const c = await Admin.api('crearCategoria', { nombre: this.q('cNom').value }); this.q('cNom').value = ''; await LocalDB.put('categorias', c); await this.recargar(); }));
    on('cList', 'click', run(async e => {
      const b = e.target.closest('button'); if (!b) return;
      const c = await Admin.api('actualizarCategoria', { categoriaId: b.dataset.id, estado: b.dataset.e }); await LocalDB.put('categorias', c); await this.recargar();
    }));
    on('pExp', 'click', () => this.exportar());
    on('pPlan', 'click', () => this.descargar('plantilla_productos.csv', CSV_COLS.join(';') + '\n;7501234567890;;Coca Cola 600ml;;Bebidas;Coca Cola;Unidad;30;50;45;40;18;10;0\n'));
    on('pImp', 'change', run(e => this.importar(e.target.files[0]).finally(() => { e.target.value = ''; })));
    const tabs = { tabInicio: 'inicio', tabProd: 'prod' };
    Object.keys(tabs).forEach(id => on(id, 'click', () => this.tab(tabs[id])));
  },
  tab(n) {
    const v = { inicio: ['vInicio', 'tabInicio'], prod: ['vProd', 'tabProd'], inv: ['vInv', 'tabInv'] };
    Object.keys(v).forEach(k => { this.q(v[k][0]).classList.toggle('d-none', k !== n); this.q(v[k][1]).classList.toggle('active', k === n); });
  },

  async onSesion(s) {
    this.ses = s; const ok = !!s && Auth.tiene(s, 'productos.ver');
    this.q('tabProd').classList.toggle('d-none', !ok); if (!ok) { this.tab('inicio'); return; }
    this.q('pNuevo').classList.toggle('d-none', !this.can('productos.crear'));
    this.q('cNueva').classList.toggle('d-none', !this.can('productos.crear'));
    await this.recargar();
    if (navigator.onLine) { try { await this.sync(); await this.recargar(); } catch (e) { this.msg('No se pudo actualizar el catálogo: ' + e.message); } }
  },
  async recargar() {
    const dn = await LocalDB.get('configuracion', 'datos_negocio');
    if (!dn || dn.Valor !== this.ses.NegocioID) {   // otro negocio en este dispositivo: no mezclar catalogos
      await LocalDB.clear('productos'); await LocalDB.clear('categorias'); await LocalDB.delete('configuracion', 'sync_productos');
      await LocalDB.put('configuracion', { Clave: 'datos_negocio', Valor: this.ses.NegocioID });
    }
    this.prods = (await LocalDB.getAll('productos')).filter(p => p.NegocioID === this.ses.NegocioID);
    this.cats = (await LocalDB.getAll('categorias')).filter(c => c.NegocioID === this.ses.NegocioID);
    this.pintar();
  },
  /** Sincronizacion incremental: solo lo modificado desde la ultima vez. */
  async sync() {
    const m = await LocalDB.get('configuracion', 'sync_productos');
    const r = await Admin.api('listarProductos', { desde: m ? m.Valor : null });
    if (r.productos.length) await LocalDB.putMany('productos', r.productos);
    const c = await Admin.api('listarCategorias', {}); await LocalDB.clear('categorias'); if (c.length) await LocalDB.putMany('categorias', c);
    await LocalDB.put('configuracion', { Clave: 'sync_productos', Valor: r.serverTime });
  },

  catNombre(id) { const c = this.cats.find(x => x.CategoriaID === id); return c ? c.Nombre : ''; },
  filtrar() {
    const t = norm(this.q('pBus').value), cat = this.q('pCat').value, est = this.q('pEst').value;
    return this.prods.filter(p => (est === '*' || p.Activo === (est === '1')) && (!cat || p.CategoriaID === cat) &&
      (!t || [p.Nombre, p.Codigo, p.CodigoBarras, p.SKU, p.Marca].some(v => norm(v).includes(t))))
      .sort((a, b) => a.Nombre.localeCompare(b.Nombre));
  },
  pintar() {
    const sel = this.q('pCat').value;
    this.q('pCat').innerHTML = '<option value="">Todas las categorías</option>' + this.cats.map(c => `<option value="${esc(c.CategoriaID)}">${esc(c.Nombre)}${c.Estado === 'Activo' ? '' : ' (inactiva)'}</option>`).join('');
    this.q('pCat').value = sel;
    const l = this.filtrar(), edit = this.can('productos.editar');
    this.q('pInfo').textContent = `${l.length} de ${this.prods.length} productos` + (l.length > 100 ? ' (mostrando 100)' : '') + (navigator.onLine ? '' : ' · sin conexión: solo lectura');
    this.q('pTab').innerHTML = l.slice(0, 100).map(p => `<tr class="${p.Activo ? '' : 'text-muted'}"><td>${esc(p.Codigo)}<div class="small text-muted">${esc(p.CodigoBarras)}</div></td>
      <td>${esc(p.Nombre)}<div class="small text-muted">${esc(p.Marca)}</div></td><td>${esc(this.catNombre(p.CategoriaID))}</td>
      <td class="text-end">${money(p.Costo)}</td><td class="text-end">${money(p.PrecioVenta)}</td><td>${Math.round(p.Impuesto * 10000) / 100}%</td>
      <td class="text-end">${edit ? `<button class="btn btn-sm btn-outline-secondary" data-a="edit" data-id="${esc(p.ProductoID)}">Editar</button>
      <button class="btn btn-sm btn-outline-${p.Activo ? 'danger' : 'success'}" data-a="act" data-id="${esc(p.ProductoID)}">${p.Activo ? 'Desactivar' : 'Activar'}</button>` : ''}</td></tr>`).join('');
    this.q('cList').innerHTML = this.cats.map(c => `<span class="badge text-bg-${c.Estado === 'Activo' ? 'light border' : 'secondary'} me-1">${esc(c.Nombre)}
      ${this.can('productos.editar') ? `<button class="btn btn-link btn-sm p-0 ms-1" data-id="${esc(c.CategoriaID)}" data-e="${c.Estado === 'Activo' ? 'Inactivo' : 'Activo'}">${c.Estado === 'Activo' ? '✕' : '↺'}</button>` : ''}</span>`).join('') || '<span class="text-muted small">Sin categorías</span>';
  },

  abrirForm(p) {
    this.editId = p ? p.ProductoID : null;
    if (!this.editId && !this.can('productos.crear') || this.editId && !this.can('productos.editar')) return;
    this.q('pFormT').textContent = p ? 'Editar producto' : 'Nuevo producto';
    this.q('f_CategoriaID').innerHTML = '<option value="">Sin categoría</option>' + this.cats.filter(c => c.Estado === 'Activo' || (p && c.CategoriaID === p.CategoriaID)).map(c => `<option value="${esc(c.CategoriaID)}">${esc(c.Nombre)}</option>`).join('');
    const v = p ? Object.assign({}, p, { ImpuestoPct: Math.round(p.Impuesto * 10000) / 100 }) : { Unidad: 'Unidad', ImpuestoPct: 0 };
    FORM.forEach(([k]) => { this.q('f_' + k).value = v[k] == null ? '' : v[k]; });
    this.q('pForm').classList.remove('d-none'); this.q('f_Nombre').focus();
  },
  leerForm() {
    const o = {}; FORM.forEach(([k]) => { o[k] = this.q('f_' + k).value; });
    o.Impuesto = (Number(o.ImpuestoPct) || 0) / 100; delete o.ImpuestoPct; return o;
  },
  async guardar() {
    const o = this.leerForm();
    const r = this.editId ? await Admin.api('actualizarProducto', { productoId: this.editId, cambios: o }) : await Admin.api('crearProducto', { producto: o });
    await LocalDB.put('productos', r); this.q('pForm').classList.add('d-none'); await this.recargar(); this.msg('Guardado', 1);
  },
  async actualizar(id, cambios) { const r = await Admin.api('actualizarProducto', { productoId: id, cambios }); await LocalDB.put('productos', r); await this.recargar(); },

  descargar(nombre, texto) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + texto], { type: 'text/csv;charset=utf-8' }));
    a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  exportar() {
    const cell = v => { v = String(v == null ? '' : v).replace('.', ','); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const txt = v => { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const rows = this.filtrar().map(p => [txt(p.Codigo), txt(p.CodigoBarras), txt(p.SKU), txt(p.Nombre), txt(p.Descripcion), txt(this.catNombre(p.CategoriaID)), txt(p.Marca), txt(p.Unidad),
      cell(p.Costo), cell(p.PrecioVenta), cell(p.PrecioMayorista), cell(p.PrecioMinimo), cell(Math.round(p.Impuesto * 10000) / 100), cell(p.StockMinimo), cell(p.StockMaximo)].join(';'));
    this.descargar('productos.csv', CSV_COLS.join(';') + '\n' + rows.join('\n') + '\n');
  },
  async importar(file) {
    if (!file) return;
    const t = await file.text(), sep = (t.split('\n')[0].match(/;/g) || []).length >= (t.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const rows = parseCSV(t, sep); if (rows.length < 2) throw new Error('El archivo no tiene filas');
    const head = rows[0].map(h => norm(h)), idx = {}; CSV_COLS.forEach(c => { idx[c] = head.indexOf(norm(c)); });
    if (idx.Nombre < 0) throw new Error('Falta la columna Nombre (usa la plantilla)');
    const dec = v => { v = String(v || '').trim().replace(/\s/g, ''); return sep === ';' ? v.replace(',', '.') : v; };
    const filas = rows.slice(1).map((r, i) => { const g = c => idx[c] < 0 ? '' : (r[idx[c]] || '').trim(); const o = { _fila: i + 2 };
      ['Codigo', 'CodigoBarras', 'SKU', 'Nombre', 'Descripcion', 'Categoria', 'Marca', 'Unidad'].forEach(c => { o[c] = g(c); }); if (!o.Unidad) delete o.Unidad;
      ['Costo', 'PrecioVenta', 'PrecioMayorista', 'PrecioMinimo', 'StockMinimo', 'StockMaximo'].forEach(c => { o[c] = dec(g(c)); });
      o.Impuesto = idx.ImpuestoPorcentaje < 0 ? 0 : (Number(dec(g('ImpuestoPorcentaje'))) || 0) / 100; return o; });
    if (!confirm(`¿Importar ${filas.length} filas?`)) return;
    let creados = 0; const errores = [];
    for (let i = 0; i < filas.length; i += 200) {
      this.msg(`Importando ${Math.min(i + 200, filas.length)} de ${filas.length}...`, 1);
      const r = await Admin.api('importarProductos', { filas: filas.slice(i, i + 200) }); creados += r.creados; errores.push(...r.errores);
    }
    await this.sync(); await this.recargar();
    this.msg(`Creados: ${creados}. Con error: ${errores.length}.` + errores.slice(0, 15).map(e => ` [fila ${e.fila}: ${e.error}]`).join(''), errores.length === 0);
  }
};
Productos.init();