// ============================================================
// ETIQUETAS DE PRECIO - RICODELICO
// Genera la etiqueta (nombre arriba, precio grande abajo, tamaño en una
// esquina) y permite imprimirla, compartirla a la app de la impresora o
// guardarla como PNG. Se usa igual en la PWA y en la extensión.
//
//   RicoEtiqueta.abrir({ nombre, precioUSD, tamano, tasa })
// ============================================================
(function () {
    'use strict';

    const CFG_KEY = 'ricoetiqueta_cfg';
    const DEF = { ancho: 100, alto: 80, dpi: 203, marca: 'RICODELICO', moneda: 'USD', girar180: false };
    let cfg = Object.assign({}, DEF);
    try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); } catch (e) {}
    function guardarCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} }

    let estado = { nombre: '', tamano: '', precioUSD: 0, tasa: 0, copias: 1 };
    let overlay = null;

    // ---------- Utilidades ----------
    // Saca el tamaño del nombre: "AIKAS PAN SAND AVE 420 G" -> "420 G"
    function adivinarTamano(nombre) {
        const n = String(nombre || '').toUpperCase();
        const m = n.match(/(\d+(?:[.,]\d+)?)\s*(KG|GRS?|G|ML|LTS?|L|CC|OZ|UND|UNDS|U)\b(?:\s*X\s*\d+)?/);
        if (!m) return '';
        const u = { GR: 'G', GRS: 'G', LT: 'L', LTS: 'L', UNDS: 'UND', U: 'UND' }[m[2]] || m[2];
        return m[1].replace(',', '.') + ' ' + u;
    }

    function formatoPrecio(usd, tasa, moneda) {
        if (moneda === 'BS' && tasa > 0) {
            return (usd * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Bs';
        }
        return '$' + (parseFloat(usd) || 0).toFixed(2);
    }

    function ajustarFuente(ctx, texto, anchoMax, fuenteMax, fuenteMin, familia, peso) {
        let f = fuenteMax;
        while (f > fuenteMin) {
            ctx.font = `${peso} ${f}px ${familia}`;
            if (ctx.measureText(texto).width <= anchoMax) break;
            f -= 2;
        }
        return f;
    }

    function partirEnLineas(ctx, texto, anchoMax, maxLineas) {
        const palabras = texto.split(/\s+/).filter(Boolean);
        const lineas = [];
        let actual = '';
        palabras.forEach(p => {
            const prueba = actual ? actual + ' ' + p : p;
            if (ctx.measureText(prueba).width <= anchoMax || !actual) actual = prueba;
            else { lineas.push(actual); actual = p; }
        });
        if (actual) lineas.push(actual);
        return lineas.length > maxLineas ? null : lineas;
    }

    function cajaRedondeada(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    // ---------- Dibujo ----------
    // Siempre se diseña en horizontal (lado largo = ancho) y luego se gira si hace falta
    function dibujarDiseno(W, H) {
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        const FAM = '"Arial Black", "Helvetica Neue", Arial, sans-serif';

        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, H);

        // Marco negro
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);

        const pad = Math.round(H * 0.025);
        const banda = Math.round(W * 0.15);

        // Marca girada en la banda izquierda
        ctx.save();
        ctx.translate(banda / 2 + pad * 0.3, H / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const fm = ajustarFuente(ctx, cfg.marca, H - pad * 4, banda * 0.78, 10, FAM, '900');
        ctx.font = `900 ${fm}px ${FAM}`;
        ctx.fillText(cfg.marca, 0, 0);
        ctx.restore();

        const x0 = banda + pad;
        const ancho = W - x0 - pad;
        const hNombre = Math.round(H * 0.25);
        const gap = pad;
        const yPrecio = pad + hNombre + gap;
        const hPrecio = H - yPrecio - pad;
        const radio = Math.round(H * 0.035);

        // Caja del nombre
        ctx.fillStyle = '#fff';
        cajaRedondeada(ctx, x0, pad, ancho, hNombre, radio); ctx.fill();
        // Caja del precio
        cajaRedondeada(ctx, x0, yPrecio, ancho, hPrecio, radio); ctx.fill();

        // Nombre (hasta 2 líneas, se achica para que quepa)
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const nombre = (estado.nombre || '').toUpperCase().trim();
        const anchoTxt = ancho - pad * 3;
        let fN = Math.round(hNombre * 0.52), lineas = null;
        while (fN >= 12) {
            ctx.font = `800 ${fN}px ${FAM}`;
            lineas = partirEnLineas(ctx, nombre, anchoTxt, 2);
            if (lineas && lineas.length * fN * 1.1 <= hNombre - pad * 1.2) break;
            fN -= 2;
        }
        if (!lineas) lineas = [nombre];
        ctx.font = `800 ${fN}px ${FAM}`;
        const altoBloque = lineas.length * fN * 1.1;
        lineas.forEach((l, i) => {
            ctx.fillText(l, x0 + ancho / 2, pad + (hNombre - altoBloque) / 2 + fN * 1.1 * (i + 0.5));
        });

        // Tamaño en la esquina inferior derecha de la caja del precio
        const tam = (estado.tamano || '').toUpperCase().trim();
        let reservaAbajo = 0;
        if (tam) {
            const fT = Math.round(hPrecio * 0.12);
            ctx.font = `800 ${fT}px ${FAM}`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(tam, x0 + ancho - pad * 1.2, yPrecio + hPrecio - pad * 1.1);
            reservaAbajo = fT + pad * 1.5;
        }

        // Precio grande centrado
        const precio = formatoPrecio(estado.precioUSD, estado.tasa, cfg.moneda);
        const areaH = hPrecio - reservaAbajo;
        const fP = ajustarFuente(ctx, precio, ancho - pad * 3, Math.round(areaH * 0.85), 20, FAM, '900');
        ctx.font = `900 ${fP}px ${FAM}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(precio, x0 + ancho / 2, yPrecio + areaH / 2 + fP * 0.03);

        return c;
    }

    function generarCanvas() {
        const pxW = Math.round(cfg.ancho / 25.4 * cfg.dpi);
        const pxH = Math.round(cfg.alto / 25.4 * cfg.dpi);
        const vertical = pxH > pxW;
        const dW = vertical ? pxH : pxW;
        const dH = vertical ? pxW : pxH;
        const diseno = dibujarDiseno(dW, dH);

        const out = document.createElement('canvas');
        out.width = pxW; out.height = pxH;
        const ctx = out.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, pxW, pxH);
        ctx.save();
        ctx.translate(pxW / 2, pxH / 2);
        let ang = vertical ? Math.PI / 2 : 0;
        if (cfg.girar180) ang += Math.PI;
        ctx.rotate(ang);
        ctx.drawImage(diseno, -dW / 2, -dH / 2);
        ctx.restore();
        return out;
    }

    // ---------- Acciones ----------
    function canvasABlob(c) {
        return new Promise(res => c.toBlob(res, 'image/png'));
    }

    function nombreArchivo() {
        const base = (estado.nombre || 'etiqueta').replace(/[^\w\-]+/g, '_').slice(0, 40);
        return `etiqueta_${base}.png`;
    }

    function imprimir() {
        const url = generarCanvas().toDataURL('image/png');
        const w = cfg.ancho, h = cfg.alto;
        const copias = Math.max(1, Math.min(200, parseInt(estado.copias) || 1));
        let imgs = '';
        for (let i = 0; i < copias; i++) imgs += `<img src="${url}">`;
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta</title><style>
            @page { size: ${w}mm ${h}mm; margin: 0; }
            html, body { margin: 0; padding: 0; background: #fff; }
            img { width: ${w}mm; height: ${h}mm; display: block; page-break-after: always; break-after: page; }
            img:last-child { page-break-after: auto; break-after: auto; }
        </style></head><body>${imgs}</body></html>`;

        const vieja = document.getElementById('ricoEtiquetaFrame');
        if (vieja) vieja.remove();
        const iframe = document.createElement('iframe');
        iframe.id = 'ricoEtiquetaFrame';
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
        iframe.srcdoc = html;
        iframe.onload = () => {
            const imgsEl = iframe.contentDocument.images;
            const lista = Array.from(imgsEl);
            Promise.all(lista.map(im => im.complete ? 1 : new Promise(r => { im.onload = r; im.onerror = r; })))
                .then(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); });
        };
        document.body.appendChild(iframe);
    }

    async function descargar() {
        const blob = await canvasABlob(generarCanvas());
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = nombreArchivo();
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    async function compartir() {
        const blob = await canvasABlob(generarCanvas());
        const file = new File([blob], nombreArchivo(), { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try { await navigator.share({ files: [file], title: 'Etiqueta' }); } catch (e) { /* cancelado */ }
        } else {
            descargar();
        }
    }

    // ---------- Interfaz ----------
    function css() {
        if (document.getElementById('ricoEtiquetaCss')) return;
        const s = document.createElement('style');
        s.id = 'ricoEtiquetaCss';
        s.textContent = `
        #ricoEtiquetaOverlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:12px;font-family:system-ui,Arial,sans-serif}
        #ricoEtiquetaOverlay .re-box{background:#fff;color:#222;border-radius:12px;width:100%;max-width:520px;max-height:96vh;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,.35)}
        #ricoEtiquetaOverlay .re-head{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#111;color:#fff;border-radius:12px 12px 0 0;font-weight:800}
        #ricoEtiquetaOverlay .re-head button{background:transparent;border:none;color:#fff;font-size:20px;cursor:pointer}
        #ricoEtiquetaOverlay .re-body{padding:14px 16px}
        #ricoEtiquetaOverlay canvas{width:100%;height:auto;border:1px solid #ccc;border-radius:6px;background:#eee;display:block}
        #ricoEtiquetaOverlay label{display:block;font-size:12px;font-weight:700;margin:10px 0 3px;color:#555}
        #ricoEtiquetaOverlay input[type=text],#ricoEtiquetaOverlay input[type=number],#ricoEtiquetaOverlay select{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px;font-size:14px}
        #ricoEtiquetaOverlay .re-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        #ricoEtiquetaOverlay .re-row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
        #ricoEtiquetaOverlay .re-acciones{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
        #ricoEtiquetaOverlay .re-acciones button{flex:1;min-width:120px;padding:11px 10px;border:none;border-radius:8px;font-weight:800;font-size:14px;cursor:pointer;background:#e9ecef;color:#222}
        #ricoEtiquetaOverlay .re-acciones button.re-primario{background:#111;color:#fff}
        #ricoEtiquetaOverlay details{margin-top:12px;font-size:13px}
        #ricoEtiquetaOverlay summary{cursor:pointer;font-weight:700;color:#555}
        #ricoEtiquetaOverlay .re-nota{font-size:11px;color:#777;margin-top:6px}
        `;
        document.head.appendChild(s);
    }

    function refrescar() {
        const cv = overlay.querySelector('#reCanvas');
        const gen = generarCanvas();
        cv.width = gen.width; cv.height = gen.height;
        cv.getContext('2d').drawImage(gen, 0, 0);
    }

    function cerrar() {
        if (overlay) { overlay.remove(); overlay = null; }
    }

    function abrir(opts) {
        opts = opts || {};
        css();
        cerrar();
        estado = {
            nombre: opts.nombre || '',
            tamano: opts.tamano !== undefined && opts.tamano !== null && opts.tamano !== '' ? opts.tamano : adivinarTamano(opts.nombre),
            precioUSD: parseFloat(opts.precioUSD) || 0,
            tasa: parseFloat(opts.tasa) || 0,
            copias: 1
        };

        overlay = document.createElement('div');
        overlay.id = 'ricoEtiquetaOverlay';
        overlay.innerHTML = `
          <div class="re-box">
            <div class="re-head"><span>🏷️ Etiqueta de precio</span><button type="button" id="reCerrar">✕</button></div>
            <div class="re-body">
              <canvas id="reCanvas"></canvas>

              <label>Nombre (arriba)</label>
              <input type="text" id="reNombre">
              <div class="re-row">
                <div><label>Tamaño (esquina)</label><input type="text" id="reTamano" placeholder="Ej: 420 G"></div>
                <div><label>Copias</label><input type="number" id="reCopias" min="1" max="200" value="1"></div>
              </div>
              <div class="re-row">
                <div><label>Precio (USD)</label><input type="number" id="rePrecio" step="0.01" min="0"></div>
                <div><label>Mostrar precio en</label>
                  <select id="reMoneda"><option value="USD">$ Dólares</option><option value="BS">Bs (con tasa BCV)</option></select>
                </div>
              </div>

              <details>
                <summary>⚙️ Tamaño del papel y ajustes</summary>
                <div class="re-row3">
                  <div><label>Ancho (mm)</label><input type="number" id="reAncho" min="15" max="120" step="1"></div>
                  <div><label>Alto (mm)</label><input type="number" id="reAlto" min="15" max="300" step="1"></div>
                  <div><label>DPI</label><select id="reDpi"><option value="203">203</option><option value="300">300</option></select></div>
                </div>
                <label>Texto de la marca (banda izquierda)</label>
                <input type="text" id="reMarca">
                <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="reGirar"> Girar 180° (si sale al revés)</label>
                <div class="re-nota">Pon aquí las medidas exactas de tu rollo de etiquetas. Se recuerdan para la próxima vez.</div>
              </details>

              <div class="re-acciones">
                <button type="button" class="re-primario" id="reImprimir">🖨️ Imprimir</button>
                <button type="button" id="reCompartir">📤 Compartir a la app</button>
                <button type="button" id="reDescargar">⬇️ Guardar PNG</button>
              </div>
              <div class="re-nota">En el celular: "Compartir a la app" y elige <b>Shipping Printer</b>. En la PC: "Imprimir" y elige la impresora BEEPRT (tamaño de papel = el de la etiqueta, márgenes ninguno).</div>
            </div>
          </div>`;
        document.body.appendChild(overlay);

        const $ = id => overlay.querySelector('#' + id);
        $('reNombre').value = estado.nombre;
        $('reTamano').value = estado.tamano;
        $('rePrecio').value = estado.precioUSD.toFixed(2);
        $('reMoneda').value = cfg.moneda;
        $('reAncho').value = cfg.ancho;
        $('reAlto').value = cfg.alto;
        $('reDpi').value = String(cfg.dpi);
        $('reMarca').value = cfg.marca;
        $('reGirar').checked = !!cfg.girar180;
        if (!estado.tasa) {
            const opt = $('reMoneda').querySelector('option[value="BS"]');
            opt.disabled = true; opt.textContent = 'Bs (sin tasa disponible)';
            if (cfg.moneda === 'BS') { cfg.moneda = 'USD'; $('reMoneda').value = 'USD'; }
        }

        const leer = () => {
            estado.nombre = $('reNombre').value;
            estado.tamano = $('reTamano').value;
            estado.precioUSD = parseFloat($('rePrecio').value) || 0;
            estado.copias = parseInt($('reCopias').value) || 1;
            cfg.moneda = $('reMoneda').value;
            cfg.ancho = Math.max(15, parseFloat($('reAncho').value) || DEF.ancho);
            cfg.alto = Math.max(15, parseFloat($('reAlto').value) || DEF.alto);
            cfg.dpi = parseInt($('reDpi').value) || 203;
            cfg.marca = $('reMarca').value || DEF.marca;
            cfg.girar180 = $('reGirar').checked;
            guardarCfg();
            refrescar();
        };
        overlay.querySelectorAll('input,select').forEach(el => {
            el.addEventListener('input', leer);
            el.addEventListener('change', leer);
        });
        $('reCerrar').addEventListener('click', cerrar);
        overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });
        $('reImprimir').addEventListener('click', () => { leer(); imprimir(); });
        $('reDescargar').addEventListener('click', () => { leer(); descargar(); });
        $('reCompartir').addEventListener('click', () => { leer(); compartir(); });

        leer();
        // Reintento tras cargar fuentes del sistema
        setTimeout(refrescar, 150);
    }

    window.RicoEtiqueta = { abrir, adivinarTamano, _generarCanvas: generarCanvas, _estado: () => estado };
})();
