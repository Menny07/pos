/** FASE 2 - auth.js : login, sesion local limitada, permisos (solo para UX; el backend decide). */
const OFFLINE_MAX_DIAS = 3;
const Auth = {
  async api(action, body) {
    const r = await fetch(APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action }, body)) });
    return r.json();
  },
  async login(usuario, password) {
    const r = await this.api('login', { usuario, password, dispositivo: navigator.userAgent });
    if (!r.ok) throw new Error(r.error);
    const s = Object.assign({}, r.sesion, { validadaEn: new Date().toISOString() });
    await LocalDB.putMany('configuracion', [{ Clave: 'session_token', Valor: r.token }, { Clave: 'session', Valor: s }]);
    SyncEngine.run(true);
    return s;
  },
  /** Sesion vigente: online se revalida en servidor (revocacion); offline vale hasta OFFLINE_MAX_DIAS. */
  async current() {
    const rec = await LocalDB.get('configuracion', 'session'); const tok = await LocalDB.get('configuracion', 'session_token');
    if (!rec || !tok) return null;
    const s = rec.Valor;
    if (navigator.onLine) {
      try {
        const r = await this.api('obtenerSesion', { token: tok.Valor });
        if (!r.ok) { await this.clear(); return null; }              // revocada/expirada/usuario inactivo
        const n = Object.assign({}, r.sesion, { validadaEn: new Date().toISOString() });
        await LocalDB.put('configuracion', { Clave: 'session', Valor: n }); return n;
      } catch (e) { /* sin red real: cae al modo offline */ }
    }
    const dias = (Date.now() - new Date(s.validadaEn)) / 864e5;
    if (dias > OFFLINE_MAX_DIAS || new Date(s.expira) < new Date()) { await this.clear(); return null; }
    return s;
  },
  async logout() {
    const tok = await LocalDB.get('configuracion', 'session_token');
    if (tok && navigator.onLine) { try { await this.api('logout', { token: tok.Valor }); } catch (e) {} }
    await this.clear();   // la cola syncQueue se conserva y se envia en el siguiente login
  },
  async clear() { await LocalDB.delete('configuracion', 'session'); await LocalDB.delete('configuracion', 'session_token'); },
  tiene(s, codigo) { return !!s && s.permisos.indexOf(codigo) > -1; }
};