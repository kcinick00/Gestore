// ============================================
// BLOQUEO POR CLAVE - Gestore (extensión) y PWA
// v1.0
// - La clave se guarda como hash PBKDF2-SHA256 con sal (nunca en texto plano)
// - Se pide al abrir y tras 10 min de inactividad
// - Tras 5 intentos fallidos hay espera creciente
// Incluir en <head>:  <script src="bloqueo.js"></script>
// ============================================
(function () {
    'use strict';

    const MINUTOS_INACTIVIDAD = 10;
    const ITERACIONES = 200000;
    const MAX_INTENTOS_SIN_ESPERA = 5;
    const K_CLAVE = 'gestore_clave_v1';       // { salt, hash }
    const K_SESION = 'gestore_sesion_hasta';  // timestamp hasta el que está desbloqueado
    const K_INTENTOS = 'gestore_intentos';    // { n, hasta }

    const esExtension = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
    const sesionExt = esExtension ? (chrome.storage.session || chrome.storage.local) : null;

    // ---------- Almacenamiento (extensión: chrome.storage, PWA: localStorage) ----------
    async function leer(clave, sesion) {
        try {
            if (esExtension) {
                const area = sesion ? sesionExt : chrome.storage.local;
                const r = await area.get(clave);
                return r[clave] ?? null;
            }
            const v = localStorage.getItem(clave);
            return v ? JSON.parse(v) : null;
        } catch (e) { return null; }
    }
    async function escribir(clave, valor, sesion) {
        try {
            if (esExtension) {
                const area = sesion ? sesionExt : chrome.storage.local;
                if (valor === null) await area.remove(clave); else await area.set({ [clave]: valor });
            } else {
                if (valor === null) localStorage.removeItem(clave);
                else localStorage.setItem(clave, JSON.stringify(valor));
            }
        } catch (e) { console.error('Bloqueo: error de almacenamiento', e); }
    }

    // ---------- Criptografía ----------
    const aB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const deB64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

    async function derivar(clave, saltBytes) {
        const material = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt: saltBytes, iterations: ITERACIONES, hash: 'SHA-256' }, material, 256);
        return aB64(bits);
    }
    async function crearRegistro(clave) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        return { salt: aB64(salt), hash: await derivar(clave, salt) };
    }
    async function verificar(clave, registro) {
        const h = await derivar(clave, deB64(registro.salt));
        // comparación de longitud fija
        let diff = h.length ^ registro.hash.length;
        for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ (registro.hash.charCodeAt(i) || 0);
        return diff === 0;
    }

    // ---------- Estado de sesión ----------
    async function estaDesbloqueado() {
        const hasta = await leer(K_SESION, true);
        return typeof hasta === 'number' && Date.now() < hasta;
    }
    async function renovarSesion() {
        await escribir(K_SESION, Date.now() + MINUTOS_INACTIVIDAD * 60000, true);
    }
    async function cerrarSesion() { await escribir(K_SESION, null, true); }

    // ---------- Estilos ----------
    const css = `
    html.gb-bloqueado body > *:not(#gb-overlay) { display: none !important; }
    html.gb-bloqueado, html.gb-bloqueado body { background: #1f2937 !important; }
    #gb-overlay { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center;
        justify-content: center; background: linear-gradient(135deg, #1f2937, #374151);
        font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; padding: 16px; box-sizing: border-box; }
    #gb-overlay * { box-sizing: border-box; }
    .gb-caja { background: #fff; border-radius: 14px; padding: 26px 22px; width: 100%; max-width: 320px;
        text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,.4); }
    .gb-icono { font-size: 42px; margin-bottom: 6px; }
    .gb-caja h2 { margin: 0 0 4px; font-size: 18px; color: #1f2937; }
    .gb-caja p { margin: 0 0 14px; font-size: 13px; color: #6b7280; line-height: 1.4; }
    .gb-caja input { width: 100%; padding: 11px 12px; margin-bottom: 10px; border: 2px solid #d1d5db;
        border-radius: 8px; font-size: 15px; outline: none; }
    .gb-caja input:focus { border-color: #6f42c1; }
    .gb-caja button.gb-btn { width: 100%; padding: 11px; border: none; border-radius: 8px; background: #6f42c1;
        color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
    .gb-caja button.gb-btn:disabled { opacity: .6; cursor: default; }
    .gb-error { color: #dc3545; font-size: 13px; min-height: 18px; margin-bottom: 8px; }
    .gb-link { background: none; border: none; color: #6b7280; font-size: 12px; margin-top: 12px;
        cursor: pointer; text-decoration: underline; }
    #gb-flotante { position: fixed; right: 8px; bottom: 8px; z-index: 2147483000; }
    #gb-flotante > button { width: 34px; height: 34px; border-radius: 50%; border: none; background: #1f2937;
        color: #fff; font-size: 15px; cursor: pointer; opacity: .75; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
    #gb-flotante > button:hover { opacity: 1; }
    #gb-menu { position: absolute; right: 0; bottom: 40px; background: #fff; border-radius: 8px; overflow: hidden;
        box-shadow: 0 4px 16px rgba(0,0,0,.3); display: none; min-width: 150px; }
    #gb-menu.abierto { display: block; }
    #gb-menu button { display: block; width: 100%; padding: 10px 14px; border: none; background: #fff;
        text-align: left; font-size: 13px; color: #1f2937; cursor: pointer; }
    #gb-menu button:hover { background: #f3f4f6; }`;

    const style = document.createElement('style');
    style.textContent = css;
    document.documentElement.appendChild(style);
    // Ocultar todo desde el primer instante hasta confirmar la sesión
    document.documentElement.classList.add('gb-bloqueado');

    // ---------- Interfaz ----------
    let overlay = null;

    function cuandoBodyListo(fn) {
        if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn, { once: true });
    }
    function quitarOverlay() {
        if (overlay) { overlay.remove(); overlay = null; }
    }
    function mostrarPantalla(html) {
        return new Promise(resolve => cuandoBodyListo(() => {
            quitarOverlay();
            overlay = document.createElement('div');
            overlay.id = 'gb-overlay';
            overlay.innerHTML = `<div class="gb-caja">${html}</div>`;
            document.body.appendChild(overlay);
            document.documentElement.classList.add('gb-bloqueado');
            resolve(overlay);
        }));
    }

    async function pantallaCrearClave(titulo) {
        const o = await mostrarPantalla(`
            <div class="gb-icono">🔐</div>
            <h2>${titulo || 'Crea tu clave'}</h2>
            <p>Esta clave se pedirá cada vez que abras Gestore. Mínimo 6 caracteres. Anótala en un lugar seguro.</p>
            <input type="password" id="gb-c1" placeholder="Nueva clave" autocomplete="new-password">
            <input type="password" id="gb-c2" placeholder="Repite la clave" autocomplete="new-password">
            <div class="gb-error" id="gb-err"></div>
            <button class="gb-btn" id="gb-ok">Guardar clave</button>`);
        return new Promise(resolve => {
            const c1 = o.querySelector('#gb-c1'), c2 = o.querySelector('#gb-c2');
            const err = o.querySelector('#gb-err'), btn = o.querySelector('#gb-ok');
            c1.focus();
            async function guardar() {
                if (c1.value.length < 6) { err.textContent = 'Mínimo 6 caracteres.'; return; }
                if (c1.value !== c2.value) { err.textContent = 'Las claves no coinciden.'; return; }
                btn.disabled = true;
                await escribir(K_CLAVE, await crearRegistro(c1.value));
                await escribir(K_INTENTOS, null);
                resolve();
            }
            btn.addEventListener('click', guardar);
            [c1, c2].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') guardar(); }));
        });
    }

    async function pantallaIngresarClave(registro) {
        const o = await mostrarPantalla(`
            <div class="gb-icono">🔒</div>
            <h2>Gestore bloqueado</h2>
            <p>Ingresa tu clave para continuar.</p>
            <input type="password" id="gb-clave" placeholder="Clave" autocomplete="current-password">
            <div class="gb-error" id="gb-err"></div>
            <button class="gb-btn" id="gb-ok">Entrar</button>
            <button class="gb-link" id="gb-olvide">Olvidé mi clave</button>`);
        return new Promise(resolve => {
            const inp = o.querySelector('#gb-clave'), err = o.querySelector('#gb-err');
            const btn = o.querySelector('#gb-ok');
            inp.focus();

            o.querySelector('#gb-olvide').addEventListener('click', () => {
                err.style.color = '#6b7280';
                err.textContent = esExtension
                    ? 'Borra los datos de la extensión en chrome://extensions (Detalles → Borrar datos del sitio) y crea una clave nueva. Tus datos en la nube no se pierden.'
                    : 'Borra los datos del sitio en los ajustes del navegador y crea una clave nueva. Tus datos en la nube no se pierden.';
            });

            async function intentar() {
                const estado = (await leer(K_INTENTOS)) || { n: 0, hasta: 0 };
                if (Date.now() < estado.hasta) {
                    err.style.color = '#dc3545';
                    err.textContent = `Demasiados intentos. Espera ${Math.ceil((estado.hasta - Date.now()) / 1000)} s.`;
                    return;
                }
                if (!inp.value) return;
                btn.disabled = true;
                const ok = await verificar(inp.value, registro);
                btn.disabled = false;
                if (ok) {
                    await escribir(K_INTENTOS, null);
                    resolve();
                } else {
                    const n = (estado.n || 0) + 1;
                    const espera = n >= MAX_INTENTOS_SIN_ESPERA
                        ? Math.min(30 * 2 ** (n - MAX_INTENTOS_SIN_ESPERA), 900) : 0;
                    await escribir(K_INTENTOS, { n, hasta: espera ? Date.now() + espera * 1000 : 0 });
                    err.style.color = '#dc3545';
                    err.textContent = espera ? `Clave incorrecta. Espera ${espera} s.` : 'Clave incorrecta.';
                    inp.value = '';
                    inp.focus();
                }
            }
            btn.addEventListener('click', intentar);
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') intentar(); });
        });
    }

    async function pantallaCambiarClave() {
        const registro = await leer(K_CLAVE);
        const o = await mostrarPantalla(`
            <div class="gb-icono">🔑</div>
            <h2>Cambiar clave</h2>
            <p>Escribe tu clave actual y luego la nueva (mínimo 6 caracteres).</p>
            <input type="password" id="gb-act" placeholder="Clave actual" autocomplete="current-password">
            <input type="password" id="gb-n1" placeholder="Nueva clave" autocomplete="new-password">
            <input type="password" id="gb-n2" placeholder="Repite la nueva clave" autocomplete="new-password">
            <div class="gb-error" id="gb-err"></div>
            <button class="gb-btn" id="gb-ok">Cambiar clave</button>
            <button class="gb-link" id="gb-cancel">Cancelar</button>`);
        return new Promise(resolve => {
            const act = o.querySelector('#gb-act'), n1 = o.querySelector('#gb-n1'), n2 = o.querySelector('#gb-n2');
            const err = o.querySelector('#gb-err'), btn = o.querySelector('#gb-ok');
            act.focus();
            o.querySelector('#gb-cancel').addEventListener('click', () => {
                quitarOverlay();
                document.documentElement.classList.remove('gb-bloqueado');
                resolve(false);
            });
            btn.addEventListener('click', async () => {
                if (n1.value.length < 6) { err.textContent = 'La nueva clave debe tener mínimo 6 caracteres.'; return; }
                if (n1.value !== n2.value) { err.textContent = 'Las claves nuevas no coinciden.'; return; }
                btn.disabled = true;
                if (!(await verificar(act.value, registro))) {
                    err.textContent = 'La clave actual es incorrecta.';
                    btn.disabled = false;
                    return;
                }
                await escribir(K_CLAVE, await crearRegistro(n1.value));
                quitarOverlay();
                document.documentElement.classList.remove('gb-bloqueado');
                resolve(true);
            });
        });
    }

    // ---------- Botón flotante (bloquear / cambiar clave) ----------
    function crearBotonFlotante() {
        if (document.getElementById('gb-flotante')) return;
        const cont = document.createElement('div');
        cont.id = 'gb-flotante';
        cont.innerHTML = `
            <div id="gb-menu">
                <button id="gb-m-bloquear">🔒 Bloquear ahora</button>
                <button id="gb-m-cambiar">🔑 Cambiar clave</button>
            </div>
            <button id="gb-m-toggle" title="Seguridad">🔒</button>`;
        document.body.appendChild(cont);
        const menu = cont.querySelector('#gb-menu');
        cont.querySelector('#gb-m-toggle').addEventListener('click', () => menu.classList.toggle('abierto'));
        cont.querySelector('#gb-m-bloquear').addEventListener('click', () => bloquearAhora());
        cont.querySelector('#gb-m-cambiar').addEventListener('click', () => { menu.classList.remove('abierto'); cambiarClave(); });
    }
    function quitarBotonFlotante() {
        const c = document.getElementById('gb-flotante');
        if (c) c.remove();
    }

    // ---------- Inactividad ----------
    let temporizador = null, ultimaRenovacion = 0;
    function iniciarVigilancia() {
        const actividad = () => {
            const ahora = Date.now();
            if (ahora - ultimaRenovacion > 15000) { ultimaRenovacion = ahora; renovarSesion(); }
        };
        ['click', 'keydown', 'mousemove', 'touchstart'].forEach(ev =>
            document.addEventListener(ev, actividad, { passive: true }));
        temporizador = setInterval(async () => {
            if (!(await estaDesbloqueado())) { clearInterval(temporizador); bloquearAhora(); }
        }, 20000);
    }

    // ---------- Flujo principal ----------
    async function bloquearAhora() {
        await cerrarSesion();
        quitarBotonFlotante();
        // Recargar es lo más simple y seguro: vacía la pantalla y vuelve a pedir la clave
        location.reload();
    }
    async function cambiarClave() { return pantallaCambiarClave(); }

    async function iniciar() {
        if (!window.crypto || !crypto.subtle) {
            // Sin WebCrypto (p. ej. PWA por http no seguro) no se puede proteger: avisar y dejar entrar
            console.warn('Bloqueo: WebCrypto no disponible, bloqueo desactivado');
            document.documentElement.classList.remove('gb-bloqueado');
            return;
        }
        const registro = await leer(K_CLAVE);
        if (!registro) {
            await pantallaCrearClave('Crea tu clave');
        } else if (!(await estaDesbloqueado())) {
            await pantallaIngresarClave(registro);
        }
        await renovarSesion();
        quitarOverlay();
        document.documentElement.classList.remove('gb-bloqueado');
        cuandoBodyListo(crearBotonFlotante);
        iniciarVigilancia();
    }

    window.GestoreBloqueo = { bloquearAhora, cambiarClave };
    iniciar();
})();
