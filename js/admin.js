/** FASE 3 - admin.js : negocio activo, sucursales, asignaciones, sucursal del dispositivo. */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const Admin = {
  async api(action, body) {
    if (!navigator.onLine) throw new Error('Se necesita Internet para esta acción');
    const tok = await LocalDB.get('configuracion', 'session_token');
    const r = await Auth.api(action, Object.assign({ token: tok && tok.Valor }, body));
    if (!r.ok) throw new Error(r.error);
    return r.data;
  },
  /** Sucursales: online se refrescan y se cachean; offline se usa la copia local. */
  async sucursales() {
    if (navigator.onLine) {
      try { const l = await this.api('listarSucursales', {}); await LocalDB.put('configuracion', { Clave: 'sucursales', Valor: l }); return l; } catch (e) {}
    }
    const c = await LocalDB.get('configuracion', 'sucursales'); return c ? c.Valor : [];
  },
  async sucursalActiva() { const c = await LocalDB.get('configuracion', 'sucursal_activa'); return c ? c.Valor : null; },
  setSucursalActiva(id) { return LocalDB.put('configuracion', { Clave: 'sucursal_activa', Valor: id }); },
  async cambiarNegocio(id) {
    const s = await this.api('cambiarNegocio', { negocioId: id });
    await LocalDB.put('configuracion', { Clave: 'session', Valor: Object.assign({}, s, { validadaEn: new Date().toISOString() }) });
    await LocalDB.delete('configuracion', 'sucursal_activa'); await LocalDB.delete('configuracion', 'sucursales');
    return s;
  }
};