// ============================================
// INICIO DE SESIÓN (Supabase Auth) - Gestore
// v1.0 - Extensión (vía background.js) y PWA (directo)
// Incluir en <head> DESPUÉS de bloqueo.js:
//   <script src="auth-ui.js"></script>
// En la PWA, app.js espera a window.GestoreAuth.listo antes de cargar datos.
// ============================================
(function () {
    'use strict';

    const esExt = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;

    // ---------- Backends ----------
    function mensajeBG(msg) {
        return new Promise(resolve => {
            try {
                chrome.runtime.sendMessage(msg, r => {
                    if (chrome.runtime.lastError) resolve({ success: false, error: chrome.runtime.lastError.message });
                    else resolve(r || { success: false, error: 'Sin respuesta' });
                });
            } catch (e) { resolve({ success: false, error: e.message }); }
        });
    }

    async function esperarCliente() {
        for (let i = 0; i < 100; i++) {
            if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
            await new Promise(r => setTimeout(r, 100));
        }
        return null;
    }

    async function haySesion() {
        if (esExt) {
            const r = await mensajeBG({ action: 'authEstado' });
            return !!(r.success && r.sesion);
        }
        const c = await esperarCliente();
        if (!c) return false;
        const { data } = await c.auth.getSession();
        return !!(data && data.session);
    }

    async function iniciarSesion(email, password) {
        if (esExt) {
            const r = await mensajeBG({ action: 'authLogin', email, password });
            return r.success ? { ok: true } : { ok: false, error: r.error || 'No se pudo iniciar sesión' };
        }
        const c = await esperarCliente();
        if (!c) return { ok: false, error: 'No se pudo conectar con Supabase' };
        const { error } = await c.auth.signInWithPassword({ email, password });
        return error ? { ok: false, error: error.message } : { ok: true };
    }

    async function cerrarSesion() {
        if (esExt) await mensajeBG({ action: 'authLogout' });
        else {
            const c = await esperarCliente();
            if (c) await c.auth.signOut();
        }
        location.reload();
    }

    // ---------- Estilos ----------
    const css = `
    html.ga-bloqueado body > *:not(#ga-overlay):not(#gb-overlay) { display: none !important; }
    html.ga-bloqueado, html.ga-bloqueado body { background: #1f2937 !important; }
    #ga-overlay { position: fixed; inset: 0; z-index: 2147482000; display: flex; align-items: center;
        justify-content: center; background: linear-gradient(135deg, #1f2937, #374151);
        font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; padding: 16px; box-sizing: border-box; }
    #ga-overlay * { box-sizing: border-box; }
    #ga-overlay .ga-caja { background: #fff; border-radius: 14px; padding: 26px 22px; width: 100%; max-width: 320px;
        text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,.4); }
    #ga-overlay .ga-icono { font-size: 42px; margin-bottom: 6px; }
    #ga-overlay h2 { margin: 0 0 4px; font-size: 18px; color: #1f2937; }
    #ga-overlay p { margin: 0 0 14px; font-size: 13px; color: #6b7280; line-height: 1.4; }
    #ga-overlay input { width: 100%; padding: 11px 12px; margin-bottom: 10px; border: 2px solid #d1d5db;
        border-radius: 8px; font-size: 15px; outline: none; color: #1f2937; background: #fff; }
    #ga-overlay input:focus { border-color: #6f42c1; }
    #ga-overlay button { width: 100%; padding: 11px; border: none; border-radius: 8px; background: #6f42c1;
        color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
    #ga-overlay button:disabled { opacity: .6; cursor: default; }
    #ga-overlay .ga-error { color: #dc3545; font-size: 13px; min-height: 18px; margin-bottom: 8px; }`;
    const style = document.createElement('style');
    style.textContent = css;
    document.documentElement.appendChild(style);
    document.documentElement.classList.add('ga-bloqueado');

    // ---------- Pantalla de login ----------
    function cuandoBodyListo(fn) {
        if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn, { once: true });
    }

    function pedirLogin() {
        return new Promise(resolve => cuandoBodyListo(() => {
            const o = document.createElement('div');
            o.id = 'ga-overlay';
            o.innerHTML = `
                <div class="ga-caja">
                    <div class="ga-icono">🧀</div>
                    <h2>Iniciar sesión</h2>
                    <p>Ingresa con tu correo y contraseña de Gestore.</p>
                    <input type="email" id="ga-email" placeholder="Correo" autocomplete="username">
                    <input type="password" id="ga-pass" placeholder="Contraseña" autocomplete="current-password">
                    <div class="ga-error" id="ga-err"></div>
                    <button id="ga-ok">Entrar</button>
                </div>`;
            document.body.appendChild(o);
            const email = o.querySelector('#ga-email'), pass = o.querySelector('#ga-pass');
            const err = o.querySelector('#ga-err'), btn = o.querySelector('#ga-ok');
            email.focus();

            async function entrar() {
                if (!email.value.trim() || !pass.value) { err.textContent = 'Escribe correo y contraseña.'; return; }
                btn.disabled = true;
                err.textContent = '';
                const r = await iniciarSesion(email.value.trim(), pass.value);
                if (r.ok) {
                    o.remove();
                    resolve();
                } else {
                    btn.disabled = false;
                    err.textContent = /invalid login/i.test(r.error) ? 'Correo o contraseña incorrectos.' : r.error;
                    pass.value = '';
                    pass.focus();
                }
            }
            btn.addEventListener('click', entrar);
            [email, pass].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); }));
        }));
    }

    // ---------- Flujo ----------
    const listo = (async () => {
        if (!(await haySesion())) {
            await pedirLogin();
            // Recargar para que todo el código arranque ya con sesión activa
            location.reload();
            await new Promise(() => {});  // no continuar mientras recarga
        }
        document.documentElement.classList.remove('ga-bloqueado');
    })();

    window.GestoreAuth = { listo, cerrarSesion };
})();
