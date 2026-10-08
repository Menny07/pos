/** LocalDB (IndexedDB) + SyncQueue + Connectivity + SyncEngine. Fase 1. */
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzsTipPYOf4JXA1NufJCs52tDZPMUGLoRjEdOkSIWzh_qFXGoQv1fyhbV0KNDKxUwIfEA/exec';
const DB_NAME = 'pos_local', DB_VERSION = 1;
const STORES = {
  productos:'ProductoID', categorias:'CategoriaID', clientes:'ClienteID', proveedores:'ProveedorID',
  ventas:'VentaID', detalleVentas:'DetalleID', pagosVentas:'PagoID', creditos:'CreditoID',
  pagosCreditos:'PagoID', movimientosCaja:'MovCajaID', gastos:'GastoID', inventario:'ProductoID',
  usuarios:'UsuarioID', configuracion:'Clave', syncQueue:'OperacionID', syncLog:'id'
};

const LocalDB = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        for (const [name, key] of Object.entries(STORES)) {
          if (db.objectStoreNames.contains(name)) continue;
          const s = db.createObjectStore(name, key === 'id' ? { keyPath: 'id', autoIncrement: true } : { keyPath: key });
          if (name === 'syncQueue') { s.createIndex('Estado', 'Estado'); s.createIndex('FechaCreacion', 'FechaCreacion'); }
        }
      };
      r.onsuccess = () => { this._db = r.result; res(this._db); };
      r.onerror = () => rej(r.error);
    });
  },
  async _tx(store, mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode); const s = t.objectStore(store);
      const req = fn(s);
      t.oncomplete = () => res(req && req.result);
      t.onerror = t.onabort = () => rej(t.error);
    });
  },
  clear(store) { return this._tx(store, 'readwrite', s => s.clear()); },
  put(store, obj) { return this._tx(store, 'readwrite', s => s.put(obj)); },
  putMany(store, arr) { return this._tx(store, 'readwrite', s => { arr.forEach(o => s.put(o)); }); },
  get(store, key) { return this._tx(store, 'readonly', s => s.get(key)); },
  getAll(store) { return this._tx(store, 'readonly', s => s.getAll()); },
  delete(store, key) { return this._tx(store, 'readwrite', s => s.delete(key)); },
  /** Guarda entidad + operacion de cola en UNA transaccion atomica. */
  async saveWithOp(store, obj, op) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction([store, 'syncQueue'], 'readwrite');
      t.objectStore(store).put(obj); t.objectStore('syncQueue').put(op);
      t.oncomplete = () => res(op); t.onerror = t.onabort = () => rej(t.error);
    });
  }
};

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&3|8)).toString(16); }));

const SyncQueue = {
  build(tipo, entidad, entidadId, payload, ctx) {
    return { OperacionID: uuid(), TipoOperacion: tipo, Entidad: entidad, EntidadID: entidadId, Payload: payload,
      FechaCreacion: new Date().toISOString(), UsuarioID: ctx.UsuarioID, NegocioID: ctx.NegocioID,
      SucursalID: ctx.SucursalID, Estado: 'PENDIENTE', Intentos: 0, UltimoIntento: null, Error: '' };
  },
  /** Uso: SyncQueue.enqueue('CREAR_VENTA','Venta',venta.VentaID,venta,ctx,'ventas',venta) */
  enqueue(tipo, entidad, entidadId, payload, ctx, store, localObj) {
    const op = this.build(tipo, entidad, entidadId, payload, ctx);
    return store ? LocalDB.saveWithOp(store, localObj, op).then(() => { Connectivity.emit(); return op; })
                 : LocalDB.put('syncQueue', op).then(() => { Connectivity.emit(); return op; });
  },
  all() { return LocalDB.getAll('syncQueue'); },
  async counts() {
    const all = await this.all();
    const c = { PENDIENTE: 0, ERROR: 0, ENVIANDO: 0 };
    all.forEach(o => c[o.Estado] = (c[o.Estado] || 0) + 1);
    return c;
  }
};

/** Estado visible: 🟢 / 🔴 / 🟡 / ⚠️ */
const Connectivity = {
  syncing: false, lastSync: null, lastError: null,
  online() { return navigator.onLine; },
  async status() {
    const c = await SyncQueue.counts(); const pend = c.PENDIENTE + c.ERROR + c.ENVIANDO;
    if (!navigator.onLine) return { icon: '🔴', text: 'Sin conexión' + (pend ? ` · ${pend} pendientes` : ''), pend };
    if (this.syncing) return { icon: '🟡', text: `Sincronizando ${pend} operaciones...`, pend };
    if (pend) return { icon: '⚠️', text: `${pend} operaciones pendientes`, pend };
    return { icon: '🟢', text: 'Todo sincronizado', pend: 0 };
  },
  emit() { window.dispatchEvent(new CustomEvent('pos:status')); },
  init() {
    window.addEventListener('online', () => { this.emit(); SyncEngine.run(); });
    window.addEventListener('offline', () => this.emit());
    setInterval(() => navigator.onLine && SyncEngine.run(), 30000);
    this.emit();
  }
};

const SyncEngine = {
  BATCH: 10, MAX_BACKOFF_MS: 15 * 60 * 1000,
  _delay(o) { return Math.min(2 ** o.Intentos * 5000, this.MAX_BACKOFF_MS); },
  async run(force = false) {
    if (Connectivity.syncing || !navigator.onLine) return;
    Connectivity.syncing = true; Connectivity.emit();
    let ok = 0, fail = 0;
    try {
      const token = (await LocalDB.get('configuracion', 'session_token') || {}).Valor;
      const now = Date.now();
      const ops = (await SyncQueue.all())
        .filter(o => o.Estado !== 'ENVIANDO' && (force || o.Estado === 'PENDIENTE' || now - new Date(o.UltimoIntento) >= this._delay(o)))
        .sort((a, b) => a.FechaCreacion.localeCompare(b.FechaCreacion));
      for (let i = 0; i < ops.length; i += this.BATCH) {
        const lote = ops.slice(i, i + this.BATCH);
        for (const o of lote) { o.Estado = 'ENVIANDO'; o.Intentos++; o.UltimoIntento = new Date().toISOString(); await LocalDB.put('syncQueue', o); }
        let resp;
        try {
          const r = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'sincronizarOperaciones', token, operaciones: lote }) });
          resp = await r.json();
          if (!resp.ok) throw new Error(resp.error || 'Error de servidor');
        } catch (e) { // sin respuesta: NO se elimina; vuelve a PENDIENTE (el servidor evitara duplicados)
          for (const o of lote) { o.Estado = 'ERROR'; o.Error = String(e); await LocalDB.put('syncQueue', o); fail++; }
          Connectivity.lastError = String(e); break;
        }
        for (const res of resp.resultados) {
          const o = lote.find(x => x.OperacionID === res.OperacionID); if (!o) continue;
          if (res.estado === 'OK' || res.estado === 'YA_PROCESADA') {
            await LocalDB.delete('syncQueue', o.OperacionID); ok++; // borrar SOLO tras confirmacion
            await LocalDB.put('syncLog', { OperacionID: o.OperacionID, Tipo: o.TipoOperacion, Fecha: new Date().toISOString(), Estado: res.estado });
          } else { o.Estado = 'ERROR'; o.Error = res.error || ''; await LocalDB.put('syncQueue', o); fail++; Connectivity.lastError = o.Error; }
        }
      }
      if (ok) Connectivity.lastSync = new Date().toISOString();
    } finally { Connectivity.syncing = false; Connectivity.emit(); }
    return { ok, fail };
  }
};

if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(console.warn);
Connectivity.init();