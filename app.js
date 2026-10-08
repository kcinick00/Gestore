// =========================================================
// app.js - Versión con Google Sheets + Bandejas + Lightbox
// =========================================================

const fmt = n => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const quantities = {};
let pantallaActual = "pantalla-inicio";
let cantidadTotalPanes = 1;
let panesArmados = [];
let ultimoPanArmado = null;
let ultimoPedido = null;
let panEnEdicion = null;

// =========================================================
// CONFIGURACIÓN: URL del menú (Google Sheets publicado como CSV)
// =========================================================
const MENU_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTecN7oPdkRiCCCUK-AjrKcPjODWFWPfzo_TSSVR0QansKwZW3bdFqwrNCqzdgqAkVXAYfygTJZug_G/pub?gid=0&single=true&output=csv";

let menuData = null;
let menuListo = false;

// =========================================================
// NORMALIZACIÓN DE CATEGORÍAS
// =========================================================
function normalizarCategoria(cat) {
  if (!cat) return "";
  const c = String(cat).trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (c === "pan" || c === "panes") return "pan";
  if (c === "salsa" || c === "salsas") return "salsas";
  if (c === "embutido" || c === "embutidos" || c === "frios") return "embutidos";
  if (c === "proteina" || c === "proteinas" || c === "carnes") return "proteinas";
  if (c === "verdura" || c === "verduras" || c === "vegetal" || c === "vegetales") return "vegetales";
  if (c === "delicatesen" || c === "delicatesenes" || c === "delicatessen" || c === "delicateses" || c === "delicatesses" || c === "delicatessens" || c === "delicatesse") return "delicateses";
  if (c === "salchichon" || c === "salchichones") return "salchichones";
  if (c === "queso" || c === "quesos") return "quesos";
  return c;
}

// Categorías de ingredientes de tipo "capa" (todas menos pan y salsas), en el orden en que se muestran
const CATS_EXTRA = [
  { key: "delicateses",  emoji: "🧆", label: "Delicateses" },
  { key: "embutidos",    emoji: "🥓", label: "Embutidos" },
  { key: "salchichones", emoji: "🌭", label: "Salchichones" },
  { key: "proteinas",    emoji: "🍖", label: "Proteínas" },
  { key: "quesos",       emoji: "🧀", label: "Quesos" },
  { key: "vegetales",    emoji: "🥬", label: "Vegetales" }
];
// Compat: algunos pedidos viejos guardaron "verduras"
function itemsDeCategoria(obj, key) {
  if (!obj) return [];
  if (key === "vegetales") return obj.vegetales || obj.verduras || [];
  return obj[key] || [];
}

// =========================================================
// DETECCIÓN DE MÓVIL
// =========================================================
const mqMovil = window.matchMedia("(max-width: 900px)");
function esMovil() { return mqMovil.matches; }

// =========================================================
// TOAST
// =========================================================
function showToast(message, type = "success") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  const icon = type === "success" ? "✓" : type === "remove" ? "✕" : "ℹ";
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-visible"));
  setTimeout(() => {
    toast.classList.remove("toast-visible");
    toast.classList.add("toast-hiding");
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// =========================================================
// CAMBIAR VISTA EN MÓVIL
// =========================================================
function cambiarVistaMovil(vista, boton) {
  if (!esMovil()) return;
  document.querySelectorAll('.col-ingredientes, .col-resumen, .col-sandwich')
    .forEach(c => c.classList.remove('movil-activa'));
  const col = document.getElementById('col-' + vista);
  if (col) col.classList.add('movil-activa');
  document.querySelectorAll('.movil-tab').forEach(t => t.classList.remove('active'));
  if (boton) boton.classList.add('active');
}

// =========================================================
// SCROLL A CATEGORÍA
// =========================================================
function scrollToCategoria(cat) {
  const section = document.getElementById("section-" + cat);
  const contenido = document.getElementById("categorias-contenido");
  if (!section || !contenido) return;

  section.scrollIntoView({ behavior: "smooth", block: "start" });

  document.querySelectorAll(".categoria-tab").forEach(t => t.classList.remove("active"));
  const tab = document.querySelector(`.categoria-tab[data-cat="${cat}"]`);
  if (tab) tab.classList.add("active");
}

// =========================================================
// ACTUALIZAR PESTAÑA ACTIVA SEGÚN SCROLL
// =========================================================
function actualizarPestanaActiva() {
  const contenido = document.getElementById("categorias-contenido");
  if (!contenido) return;
  const sections = Array.from(document.querySelectorAll(".categoria-section")).filter(s => s.style.display !== "none");
  const contenidoRect = contenido.getBoundingClientRect();
  const puntoReferencia = contenidoRect.top + 80;
  let activeCat = "pan";
  let minDistancia = Infinity;
  sections.forEach(sec => {
    const secRect = sec.getBoundingClientRect();
    const distancia = Math.abs(secRect.top - puntoReferencia);
    if (secRect.top <= puntoReferencia && distancia < minDistancia) {
      minDistancia = distancia;
      activeCat = sec.dataset.cat;
    }
  });
  if (activeCat === "pan") {
    for (const sec of sections) {
      const secRect = sec.getBoundingClientRect();
      if (secRect.bottom > contenidoRect.top) {
        activeCat = sec.dataset.cat;
        break;
      }
    }
  }
  document.querySelectorAll(".categoria-tab").forEach(t => t.classList.remove("active"));
  const tab = document.querySelector(`.categoria-tab[data-cat="${activeCat}"]`);
  if (tab) tab.classList.add("active");
}

// =========================================================
// NAVEGACIÓN
// =========================================================
function mostrarPantalla(id) {
  document.querySelectorAll(".pantalla").forEach(p => p.classList.remove("activa"));
  const pantalla = document.getElementById(id);
  if (pantalla) pantalla.classList.add("activa");
  pantallaActual = id;
  actualizarBotonVolver();
  actualizarBotonConfirmar();
}

function actualizarBotonVolver() {
  const btn = document.getElementById("btn-volver");
  if (!btn) return;
  if (pantallaActual === "pantalla-combos" || pantallaActual === "pantalla-sandwich" || pantallaActual === "pantalla-bandejas" || pantallaActual === "pantalla-charcuteria") {
    btn.style.display = "flex";
    btn.innerHTML = "← Volver";
  } else if (pantallaActual === "pantalla-resumen") {
    btn.style.display = "flex";
    btn.innerHTML = "← Inicio";
  } else {
    btn.style.display = "none";
  }
}

function actualizarBotonConfirmar() {
  const btn = document.getElementById("btn-confirmar");
  if (!btn) return;
  if (pantallaActual === "pantalla-resumen") {
    btn.style.display = "block";
    if (panesArmados.length >= cantidadTotalPanes) {
      btn.disabled = false;
      btn.textContent = "CONFIRMAR Y PEDIR →";
      btn.style.background = "var(--accent)";
      btn.style.color = "#0F0F0F";
    } else {
      btn.disabled = true;
      btn.textContent = `FALTAN ${cantidadTotalPanes - panesArmados.length}`;
      btn.style.background = "var(--border)";
      btn.style.color = "#555";
    }
  } else {
    // Restaurar el estado normal del botón: en bandejas y charcutería el CSS lo
    // muestra aunque aquí lo ocultemos, y no debe quedar con "FALTAN N" / deshabilitado.
    btn.style.display = "none";
    btn.disabled = false;
    btn.textContent = "CONFIRMAR Y PEDIR →";
    btn.style.background = "";
    btn.style.color = "";
  }
}

function volverAtras() {
  if (pantallaActual === "pantalla-charcuteria") { salirCharcuteria(); return; }

  if (pantallaActual === "pantalla-bandejas") {
    mostrarPantalla("pantalla-inicio");
    document.getElementById("header-titulo").innerHTML = '¿QUÉ DESEA <span>HOY?</span>';
    document.getElementById("header-subtitulo").innerHTML = 'Elige el servicio que buscas <em>para empezar</em>';
    document.querySelector('.total-bar').style.display = 'flex';
    return;
  }

  if (pantallaActual === "pantalla-sandwich") {
    if (pasoActual > 0) { pasoAtras(); return; }
    cancelarPan();
    return;
  }
  if (pantallaActual === "pantalla-combos") {
    if (panesArmados.length === 0) { irAInicioSandwich(); return; }
    mostrarPantalla("pantalla-resumen");
    renderResumenGeneral();
    return;
  }
  if (pantallaActual === "pantalla-resumen") {
    if (panesArmados.length > 0 && !confirm("¿Volver al inicio? Se borrará el pedido actual.")) return;
    irAInicioSandwich();
    return;
  }
}

function irAInicioSandwich() {
  resetearPedidoSandwich();
  mostrarPantalla("pantalla-inicio");
  document.getElementById("header-titulo").innerHTML = '¿QUÉ DESEA <span>HOY?</span>';
  document.getElementById("header-subtitulo").innerHTML = 'Elige el servicio que buscas <em>para empezar</em>';
}

// Si ya se llenó la cantidad de panes, agrega un cupo más (en vez de bloquear)
function asegurarCupo() {
  if (panesArmados.length < cantidadTotalPanes) return true;
  if (cantidadTotalPanes >= 20) { showToast("Máximo 20 panes por pedido", "remove"); return false; }
  cantidadTotalPanes += 1;
  const d = document.getElementById("cantidad-inicial-display");
  if (d) d.textContent = cantidadTotalPanes;
  return true;
}

// Deja el pedido de sándwiches en blanco (1 pan, nada armado)
function resetearPedidoSandwich() {
  panesArmados = []; panEnEdicion = null; ultimoPanArmado = null;
  cantidadTotalPanes = 1;
  const d = document.getElementById("cantidad-inicial-display");
  if (d) d.textContent = "1";
  if (typeof limpiarEditor === "function") limpiarEditor();
}

// =========================================================
// PANTALLA 1: CANTIDAD
// =========================================================
function cambiarCantidadInicial(delta) {
  const nueva = cantidadTotalPanes + delta;
  if (nueva > 20) return;
  // No se puede bajar de los panes que ya están armados
  if (nueva < Math.max(1, panesArmados.length)) {
    if (nueva >= 1) showToast("Elimina un pan del pedido para bajar la cantidad", "info");
    return;
  }
  cantidadTotalPanes = nueva;
  document.getElementById("cantidad-inicial-display").textContent = cantidadTotalPanes;
  renderResumenGeneral();
}

// =========================================================
// PANTALLA 0: INICIO
// =========================================================
function elegirServicio(servicio) {
  if (servicio === "sandwich") {
    if (panesArmados.length === 0) {
      resetearPedidoSandwich();
      abrirCombos();            // primero "Los de la casa" (como Sweetgreen); desde ahí se puede armar uno desde cero
      return;
    }
    document.getElementById("cantidad-inicial-display").textContent = cantidadTotalPanes;
    mostrarPantalla("pantalla-resumen");
    renderResumenGeneral();
    document.getElementById("header-titulo").innerHTML = 'ARMA TU <span>SÁNDWICH</span>';
    document.getElementById("header-subtitulo").innerHTML = 'Elige tus ingredientes y mira el total <em>al instante</em>';
    return;
  }
  if (servicio === "eventos") {
    showToast("🎉 Bandeja para eventos: próximamente", "info");
    return;
  }
  if (servicio === "charcuteria") {
    abrirCharcuteria();
    return;
  }
}

// =========================================================
// BANDEJAS PARA EVENTOS - PANEL ÚNICO
// =========================================================

let cantidadPanel = 1;

function abrirBandejas() {
    mostrarPantalla('pantalla-bandejas');
    document.getElementById('header-titulo').innerHTML = 'BANDEJAS <span>PARA EVENTOS</span>';
    document.getElementById('header-subtitulo').innerHTML = 'Mira nuestras opciones y arma tu pedido <em>al final</em>';
    document.querySelector('.total-bar').style.display = 'flex';
    actualizarPanelPedido();
}

function cambiarCantidadPanel(delta) {
    const nueva = cantidadPanel + delta;
    if (nueva < 1 || nueva > 10) return;
    cantidadPanel = nueva;
    document.getElementById('qty-panel').textContent = nueva;
    actualizarPanelPedido();
}

function obtenerPrecioTamano() {
    const s = document.querySelector('input[name="tamano-bandeja"]:checked');
    return s ? parseFloat(s.getAttribute('data-price')) : 0;
}

function obtenerNombreTamano() {
    const s = document.querySelector('input[name="tamano-bandeja"]:checked');
    const map = { grande: 'Grande', mediana: 'Mediana', pequena: 'Pequeña' };
    return s ? (map[s.value] || '') : '';
}

function calcularTotalPanel() {
    if (!document.querySelector('input[name="tamano-bandeja"]:checked')) return 0;
    let unitario = obtenerPrecioTamano();
    document.querySelectorAll('.extra-panel:checked').forEach(e => { unitario += parseFloat(e.value); });
    return unitario * cantidadPanel;
}

// Click en una tarjeta de bandeja = elegir ese tamaño en el panel de abajo
function elegirTamanoBandeja(tam, ev) {
    // Las fotos abren el visor ampliado; no cuentan como elección
    if (ev && ev.target && ev.target.closest && ev.target.closest('.platter-gallery img')) return;
    const radio = document.querySelector('input[name="tamano-bandeja"][value="' + tam + '"]');
    if (!radio) return;
    if (radio.disabled) { if (typeof showToast === 'function') showToast('Esa bandeja no está disponible hoy', 'remove'); return; }
    radio.checked = true;
    actualizarPanelPedido();
    if (typeof showToast === 'function') showToast('✓ Bandeja ' + obtenerNombreTamano() + ' elegida · mira "Arma tu pedido" abajo', 'info');
}

// Marca visualmente la tarjeta del tamaño elegido
function sincronizarTarjetasBandeja() {
    const sel = document.querySelector('input[name="tamano-bandeja"]:checked');
    document.querySelectorAll('.platter-card[data-size]').forEach(c => {
        const activa = !!sel && c.getAttribute('data-size') === sel.value;
        c.classList.toggle('seleccionada', activa);
        const b = c.querySelector('.platter-elegir');
        if (b) b.textContent = c.classList.contains('agotada') ? 'No disponible' : (activa ? '✓ Bandeja elegida' : 'Elegir esta bandeja');
    });
}

function actualizarPanelPedido() {
    sincronizarTarjetasBandeja();
    const totalEl = document.getElementById('panel-total');
    if (totalEl) totalEl.textContent = `$${calcularTotalPanel().toFixed(2)}`;
    if (pantallaActual === 'pantalla-bandejas') {
        const barra = document.getElementById('total-out');
        if (barra) barra.textContent = `$${calcularTotalPanel().toFixed(2)}`;
    }
}

function pedirBandejaPanel() {
    if (!document.querySelector('input[name="tamano-bandeja"]:checked')) {
        alert('Elige primero el tamaño de la bandeja 👆');
        const t = document.querySelector('input[name="tamano-bandeja"]');
        if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }
    const tamano = obtenerNombreTamano();
    const base = document.querySelector('input[name="base-panel"]:checked').value;
    const extras = [];
    document.querySelectorAll('.extra-panel:checked').forEach(e => extras.push(e.parentElement.textContent.trim()));
    const total = calcularTotalPanel();

    let mensaje = `¡Hola! Quiero pedir *${cantidadPanel} Bandeja${cantidadPanel > 1 ? 's' : ''} ${tamano}*:\n`;
    mensaje += `- Base: ${base}\n`;
    mensaje += extras.length > 0 ? `- Extras: ${extras.join(', ')}\n` : `- Extras: Ninguno\n`;
    mensaje += `- Total: $${total.toFixed(2)}\n\n`;
    mensaje += `⏰ Recuerda que se requiere 1 día de anticipo.\n\n`;
    mensaje += `¿Me confirman disponibilidad?`;

    const telefono = "584146774332"; // ⚠️ CAMBIA POR TU NÚMERO
    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`, '_blank');
}

// =========================================================
// RESUMEN DESDE LA BARRA DE TOTAL (tocable)
// =========================================================
function _esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

function construirResumenBarra() {
    const r = { titulo: 'Resumen del pedido', html: '', total: '$0.00', accion: null };
    const pant = pantallaActual;

    if (pant === 'pantalla-bandejas') {
        r.titulo = 'Tu bandeja';
        if (!document.querySelector('input[name="tamano-bandeja"]:checked')) {
            r.html = '<div class="sheet-vacio">Elige el tamaño de la bandeja para ver tu pedido.</div>';
            return r;
        }
        const base = document.querySelector('input[name="base-panel"]:checked');
        const extras = [];
        document.querySelectorAll('.extra-panel:checked').forEach(e => extras.push(e.parentElement.textContent.trim()));
        r.html = `<div class="sheet-item">
            <div class="sheet-titulo-item"><span>${cantidadPanel}× Bandeja ${_esc(obtenerNombreTamano())}</span><span>$${(obtenerPrecioTamano()*cantidadPanel).toFixed(2)}</span></div>
            <div class="sheet-detalle">Base: ${_esc(base ? base.value : '—')}<br>Extras: ${extras.length ? _esc(extras.join(', ')) : 'Ninguno'}</div>
        </div>
        <div class="sheet-nota">⏰ Se requiere 1 día de anticipo.</div>`;
        r.total = '$' + calcularTotalPanel().toFixed(2);
        r.accion = { texto: 'Confirmar y pedir →', fn: () => { cerrarResumenBarra(); abrirPedidoWA(); } };
        return r;
    }

    if (pant === 'pantalla-charcuteria' && typeof vacResumenBarra === 'function') {
        return vacResumenBarra();
    }

    // Sándwiches (resumen, combos, armado...)
    r.titulo = 'Tu pedido';
    let html = '';
    let total = 0;
    panesArmados.forEach((pan, i) => {
        total += pan.precio || 0;
        const nom = (x) => x.nombre || x.name || 'Sin nombre';
        let det = '';
        if (pan.tipo === 'combo') {
            det = _esc(pan.descripcion || '');
        } else {
            const l = [];
            if (pan.pan) l.push('🥖 ' + _esc(nom(pan.pan)));
            [...CATS_EXTRA.map(c => [c.key, c.emoji]), ['salsas','🥫']].forEach(([k,e]) => {
                const a = itemsDeCategoria(pan, k);
                if (a && a.length) l.push(e + ' ' + a.map(x => (x.qty > 1 ? nom(x) + ' x' + x.qty : nom(x))).join(', ').replace(/[<>]/g,''));
            });
            det = l.join('<br>');
        }
        html += `<div class="sheet-item">
            <div class="sheet-titulo-item"><span>${i+1}. ${_esc(pan.tipo === 'combo' ? (pan.nombre || 'Combo') : 'Sándwich')}</span><span>$${(pan.precio||0).toFixed(2)}</span></div>
            <div class="sheet-detalle">${det}</div></div>`;
    });
    const lista = document.querySelectorAll('#summary-list li');
    if (lista.length && document.getElementById('pantalla-resumen').classList.contains('activa') === false) {
        // pan en armado (aún no agregado)
        let h = '';
        lista.forEach(li => {
            const n = li.querySelector('.item-name'), p = li.querySelector('.item-price');
            if (n) h += `<div class="sheet-linea"><span class="sheet-nombre">${_esc(n.textContent)}</span><span class="sheet-precio">${_esc(p ? p.textContent : '')}</span></div>`;
        });
        if (h) html += `<div class="sheet-cat">Pan en armado</div><div class="sheet-item">${h}</div>`;
    }
    r.html = html;
    const barra = document.getElementById('total-out');
    r.total = barra ? barra.textContent : '$' + total.toFixed(2);
    const btn = document.getElementById('btn-confirmar');
    if (btn && btn.style.display !== 'none' && panesArmados.length) {
        r.accion = { texto: 'Confirmar y pedir →', fn: () => { cerrarResumenBarra(); abrirPedidoWA(); } };
    }
    return r;
}

function abrirResumenBarra() {
    const r = construirResumenBarra();
    document.getElementById('sheet-titulo').textContent = r.titulo;
    document.getElementById('sheet-body').innerHTML = r.html || '<div class="sheet-vacio">Aún no has agregado nada a tu pedido.</div>';
    document.getElementById('sheet-total').textContent = r.total;
    const a = document.getElementById('sheet-accion');
    if (r.accion) { a.style.display = 'block'; a.textContent = r.accion.texto; a.onclick = r.accion.fn; }
    else { a.style.display = 'none'; a.onclick = null; }
    document.getElementById('resumen-sheet').classList.add('abierto');
}

function cerrarResumenBarra() {
    document.getElementById('resumen-sheet').classList.remove('abierto');
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarResumenBarra(); });

// =========================================================
// CONFIRMAR Y PEDIR (WhatsApp) — común a las tres secciones
// =========================================================
function _textoPanes() {
    const nom = (x) => x.nombre || x.name || 'Sin nombre';
    let t = '';
    panesArmados.forEach((pan, i) => {
        if (pan.tipo === 'combo') {
            t += `• ${i+1}. ${pan.nombre || 'Combo'} — $${(pan.precio||0).toFixed(2)}\n`;
            if (pan.descripcion) t += `   ${pan.descripcion}\n`;
        } else {
            t += `• ${i+1}. Sándwich — $${(pan.precio||0).toFixed(2)}\n`;
            if (pan.pan) t += `   Pan: ${nom(pan.pan)}\n`;
            [...CATS_EXTRA.map(c => [c.key, c.label]), ['salsas','Salsas']].forEach(([k,e]) => {
                const arr = itemsDeCategoria(pan, k);
                if (arr && arr.length) t += `   ${e}: ${arr.map(x => (x.qty > 1 ? nom(x) + ' x' + x.qty : nom(x))).join(', ')}\n`;
            });
        }
    });
    return t;
}

function abrirPedidoWA() {
    const r = construirResumenBarra();
    if (pantallaActual === 'pantalla-bandejas' && !document.querySelector('input[name="tamano-bandeja"]:checked')) {
        alert('Elige primero el tamaño de la bandeja 👆');
        return;
    }
    if (pantallaActual === 'pantalla-charcuteria' && typeof vacLineas === 'function' && !vacLineas().length) {
        alert('Agrega primero algún producto 👆');
        return;
    }
    if (pantallaActual !== 'pantalla-bandejas' && pantallaActual !== 'pantalla-charcuteria' && !panesArmados.length) {
        alert('Agrega primero tu sándwich o combo 👆');
        return;
    }
    document.getElementById('pedido-resumen').innerHTML = r.html;
    pedidoBase = parseFloat(String(r.total).replace(/[^0-9.]/g, '')) || 0;
    pedidoExtras = {};
    pedidoExtrasSimples = {};
    renderExtrasModal();
    const entr = document.querySelector('input[name="pedido-entrega"][value="retiro"]');
    if (entr) entr.checked = true;
    actualizarEntrega();
    actualizarTotalModal();
    document.getElementById('pedido-modal').classList.add('active');
}

// ----- Venta adicional (bebida / papitas) y entrega -----
let pedidoBase = 0;
let pedidoExtras = {};          // { id: cantidad } (extras con precio, del Sheets)
let pedidoExtrasSimples = {};   // { "Bebida": true } (si no hay lista en el Sheets)

function _esFlujoSandwich() {
    return pantallaActual !== 'pantalla-bandejas' && pantallaActual !== 'pantalla-charcuteria';
}

function totalExtrasModal() {
    return extrasMenu.reduce((s, e) => s + (pedidoExtras[e.id] || 0) * e.price, 0);
}

function actualizarTotalModal() {
    document.getElementById('pedido-total').textContent = '$' + (pedidoBase + totalExtrasModal()).toFixed(2);
}

function renderExtrasModal() {
    const box = document.getElementById('pedido-extras');
    if (!box) return;
    if (!_esFlujoSandwich()) { box.style.display = 'none'; return; }
    box.style.display = '';
    const cont = document.getElementById('pedido-extras-lista');
    const disp = extrasMenu.filter(e => !e._agotado);
    if (disp.length) {
        cont.innerHTML = disp.map(e => {
            const q = pedidoExtras[e.id] || 0;
            return `<div class="extra-card ${q ? 'sel' : ''}">
                ${e.image ? `<img src="${_esc(e.image)}" alt="${_esc(e.name)}" loading="lazy" onerror="this.style.display='none'">` : ''}
                <div class="extra-nombre">${_esc(e.name)}</div>
                <div class="extra-precio">+${fmt(e.price)}</div>
                <div class="extra-qty">
                    <button type="button" onclick="cambiarExtra('${_esc(e.id)}',-1)" ${q ? '' : 'disabled'} aria-label="Quitar">−</button>
                    <span>${q}</span>
                    <button type="button" onclick="cambiarExtra('${_esc(e.id)}',1)" aria-label="Agregar">+</button>
                </div>
            </div>`;
        }).join('');
    } else {
        cont.innerHTML = ['🥤 Bebida', '🍟 Papitas'].map(n =>
            `<button type="button" class="extra-chip ${pedidoExtrasSimples[n] ? 'sel' : ''}" onclick="toggleExtraSimple('${n}')">${n}</button>`
        ).join('') + '<div class="extra-nota">Te confirmamos opciones y precio por WhatsApp.</div>';
    }
}

function cambiarExtra(id, d) {
    const q = Math.max(0, Math.min(10, (pedidoExtras[id] || 0) + d));
    if (q) pedidoExtras[id] = q; else delete pedidoExtras[id];
    renderExtrasModal();
    actualizarTotalModal();
}

function toggleExtraSimple(n) {
    if (pedidoExtrasSimples[n]) delete pedidoExtrasSimples[n]; else pedidoExtrasSimples[n] = true;
    renderExtrasModal();
}

function actualizarEntrega() {
    const v = (document.querySelector('input[name="pedido-entrega"]:checked') || {}).value || 'retiro';
    document.getElementById('entrega-delivery').style.display = v === 'delivery' ? '' : 'none';
    document.getElementById('entrega-retiro').style.display = v === 'retiro' ? '' : 'none';
    document.querySelectorAll('.entrega-op').forEach(l => {
        const i = l.querySelector('input');
        l.classList.toggle('sel', !!(i && i.checked));
    });
}

function cerrarPedidoWA() {
    document.getElementById('pedido-modal').classList.remove('active');
}

function enviarPedidoWA() {
    const nombre = document.getElementById('pedido-nombre').value.trim();
    const pago = document.getElementById('pedido-pago').value;
    const total = document.getElementById('pedido-total').textContent;
    const entrega = (document.querySelector('input[name="pedido-entrega"]:checked') || {}).value || 'retiro';
    const dir = document.getElementById('pedido-direccion').value.trim();
    const hora = document.getElementById('pedido-hora').value.trim();
    if (entrega === 'delivery' && !dir) {
        alert('Escribe la dirección para el delivery 📍');
        document.getElementById('pedido-direccion').focus();
        return;
    }
    let cuerpo = '';
    if (pantallaActual === 'pantalla-bandejas') {
        const base = document.querySelector('input[name="base-panel"]:checked');
        const extras = [];
        document.querySelectorAll('.extra-panel:checked').forEach(e => extras.push(e.parentElement.textContent.trim()));
        cuerpo = `*Bandejas para eventos*\n• ${cantidadPanel} Bandeja${cantidadPanel > 1 ? 's' : ''} ${obtenerNombreTamano()}\n• Base: ${base ? base.value : '—'}\n• Extras: ${extras.length ? extras.join(', ') : 'Ninguno'}\n⏰ Se requiere 1 día de anticipo.\n`;
    } else if (pantallaActual === 'pantalla-charcuteria' && typeof vacTextoPedido === 'function') {
        cuerpo = vacTextoPedido();
    } else {
        cuerpo = `*Sándwiches*\n${_textoPanes()}`;
    }
    if (_esFlujoSandwich()) {
        const conPrecio = extrasMenu.filter(e => pedidoExtras[e.id]);
        const simples = Object.keys(pedidoExtrasSimples);
        if (conPrecio.length || simples.length) {
            cuerpo += '\n*Para acompañar*\n';
            conPrecio.forEach(e => { cuerpo += `• ${pedidoExtras[e.id]} x ${e.name} — $${(e.price * pedidoExtras[e.id]).toFixed(2)}\n`; });
            simples.forEach(n => { cuerpo += `• ${n} (me confirman opciones y precio)\n`; });
        }
    }
    let msg = '¡Hola Ricodélico! Quiero hacer este pedido:\n\n' + cuerpo + `\n*TOTAL: ${total}*\n`;
    msg += entrega === 'delivery'
        ? `🛵 *Delivery*\n📍 ${dir}\n(El costo del delivery me lo confirman)\n`
        : `🏪 *Retiro en tienda*${hora ? '\n🕒 Paso a las ' + hora : ''}\n`;
    if (pago) msg += `💳 Forma de pago: ${pago}\n`;
    if (nombre) msg += `👤 Nombre: ${nombre}\n`;
    msg += '\n¿Me confirman disponibilidad? ¡Gracias!';
    const tel = (typeof NEGOCIO !== 'undefined' && NEGOCIO.whatsapp) ? NEGOCIO.whatsapp : '584146774332';
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
    cerrarPedidoWA();
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarPedidoWA(); });

// =========================================================
// PANTALLA 5: RESUMEN GENERAL
// =========================================================
function renderResumenGeneral() {
  const items = document.getElementById("resumen-items");
  const cantidadEl = document.getElementById("resumen-cantidad");
  const combosEl = document.getElementById("resumen-combos-cantidad");
  const totalEl = document.getElementById("resumen-total");
  const progresoEl = document.getElementById("progreso-relleno");
  const contadorEl = document.getElementById("progreso-contador");
  const subtitulo = document.getElementById("resumen-subtitulo");
  const opcionRepetir = document.getElementById("opcion-repetir");

  items.innerHTML = "";
  let total = 0, cantidadPanes = 0, cantidadCombos = 0;
  const getNombre = (item) => item.nombre || item.name || "Sin nombre";

  panesArmados.forEach((pan, idx) => {
    total += pan.precio;
    const esCombo = pan.tipo === "combo";
    if (esCombo) cantidadCombos++; else cantidadPanes++;

    const div = document.createElement("div");
    div.className = "resumen-item";

    let detalleHTML = "";
    if (esCombo) {
      detalleHTML = `<div class="detalle">${pan.descripcion}</div>`;
    } else {
      const lineas = [];
      if (pan.pan) lineas.push(`<span style="color: var(--accent);">🥖 ${getNombre(pan.pan)}</span>`);
      const agregarLinea = (items, emoji) => {
        if (!items || !items.length) return;
        const texto = items.map(item => {
          const qty = item.qty || 1;
          return qty > 1 ? `${getNombre(item)} x${qty}` : getNombre(item);
        }).join(", ");
        lineas.push(`${emoji} ${texto}`);
      };
      CATS_EXTRA.forEach(c => agregarLinea(itemsDeCategoria(pan, c.key), c.emoji));
      agregarLinea(pan.salsas, "🥫");
      detalleHTML = `<div class="detalle" style="margin-top: 6px;">${lineas.join("<br>")}</div>`;
    }

    div.innerHTML = `
      <div class="info">
        <div class="titulo">${esCombo ? "🎁 " + pan.nombre : "🥪 Pan " + (idx + 1)}</div>
        ${detalleHTML}
      </div>
      <div class="precio">${fmt(pan.precio)}</div>
      <div class="acciones">
        ${!esCombo ? `<button class="btn-accion editar" onclick="editarPan(${idx})" title="Editar">✏️</button>` : ""}
        <button class="btn-accion eliminar" onclick="eliminarPan(${idx})" title="Eliminar">🗑</button>
      </div>
    `;
    items.appendChild(div);
  });

  if (panesArmados.length === 0) {
    items.innerHTML = `<div class="resumen-item" style="justify-content: center; color: var(--text-muted); font-style: italic; font-size: 14px;">Aún no has armado ningún pan</div>`;
  }

  cantidadEl.textContent = cantidadPanes;
  combosEl.textContent = cantidadCombos;
  totalEl.textContent = fmt(total);

  const totalActual = panesArmados.length;
  const porcentaje = (totalActual / cantidadTotalPanes) * 100;
  progresoEl.style.width = porcentaje + "%";
  contadorEl.textContent = `${totalActual} / ${cantidadTotalPanes}`;
  subtitulo.innerHTML = `Vas a pedir <em>${cantidadTotalPanes} sándwich${cantidadTotalPanes > 1 ? "es" : ""}</em>`;

  if (ultimoPanArmado && panesArmados.length < cantidadTotalPanes) opcionRepetir.classList.remove("disabled");
  else opcionRepetir.classList.add("disabled");

  document.getElementById("total-out").textContent = fmt(total);
  actualizarBotonConfirmar();
  actualizarBotonVolver();
}

// =========================================================
// ABRIR ARMA TU SÁNDWICH
// =========================================================
function abrirSandwich() {
  if (!asegurarCupo()) return;
  limpiarEditor();
  panEnEdicion = null;
  const btnGuardar = document.querySelector(".btn-guardar");
  if (btnGuardar) btnGuardar.innerHTML = "✓ Ordenar pan";

  const firstPan = document.querySelector('input[name="pan"]:not(:disabled)');
  if (firstPan) { firstPan.checked = true; quantities[firstPan.value] = 1; }
  mostrarPantalla("pantalla-sandwich");
  document.getElementById("header-titulo").innerHTML = 'ARMA TU <span>SÁNDWICH</span>';
  document.getElementById("header-subtitulo").innerHTML = `Pan ${panesArmados.length + 1} de ${cantidadTotalPanes}`;
  renderSandwich();
  startAnimation();
  actualizarResumenPan();
  irAPaso(0);

  if (esMovil()) {
    const tabIng = document.querySelector('.movil-tab');
    cambiarVistaMovil('ingredientes', tabIng);
  }

  setTimeout(() => {
    const contenido = document.getElementById("categorias-contenido");
    if (contenido) contenido.scrollTop = 0;
    document.querySelectorAll(".categoria-tab").forEach(t => t.classList.remove("active"));
    const tab = document.querySelector('.categoria-tab[data-cat="pan"]');
    if (tab) tab.classList.add("active");
  }, 100);
}

function abrirCombos() {
  if (!asegurarCupo()) return;
  mostrarPantalla("pantalla-combos");
  document.getElementById("header-titulo").innerHTML = 'LOS DE LA <span>CASA</span>';
  document.getElementById("header-subtitulo").innerHTML = `Pan ${panesArmados.length + 1} de ${cantidadTotalPanes}`;
  renderCombos();
}

function renderCombos() {
  const grid = document.getElementById("combos-grid");
  if (!grid) return;
  grid.innerHTML = "";
  combos.forEach(combo => {
    const sel = normalizarSeleccion(combo.ingredientes);
    const r = resolverSeleccion(sel);
    if (!r.ok) return;                       // algún ingrediente no está en el menú: no se muestra
    const card = document.createElement("div");
    card.className = "combo-card" + (r.agotado ? " agotado" : "");
    const casa = (sel.delicateses || []).length > 0;
    card.innerHTML = `
      <div class="combo-tags">
        ${casa ? '<span class="tag-casa">🏠 De la casa</span>' : ''}
        ${combo.masPedido ? '<span class="tag-pop">🔥 Más pedido</span>' : ''}
      </div>
      <div class="combo-emoji">${combo.emoji}</div>
      <div class="combo-nombre">${_esc(combo.nombre)}</div>
      <div class="combo-ingredientes">${_esc(r.nombres.join(" · "))}</div>
      ${r.agotado ? '<div class="combo-aviso">Hoy hay un ingrediente agotado</div>' : ''}
      <div class="combo-precio">${fmt(r.precio)}</div>
      <div class="combo-botones">
        <button class="combo-agregar" ${r.agotado ? "disabled" : ""} onclick="agregarComboAlPedido('${combo.id}')">Agregar</button>
        <button class="combo-personalizar" onclick="personalizarCombo('${combo.id}')">Personalizar</button>
      </div>
    `;
    grid.appendChild(card);
  });
  renderFavoritos();
}

function agregarComboAlPedido(comboId) {
  const combo = combos.find(c => c.id === comboId);
  if (!combo) return;
  const r = resolverSeleccion(normalizarSeleccion(combo.ingredientes));
  if (!r.ok || r.agotado) { showToast("Este combo no está disponible hoy", "remove"); return; }
  if (!asegurarCupo()) return;
  const panCombo = {
    tipo: "combo", id: combo.id, nombre: combo.nombre, emoji: combo.emoji,
    descripcion: r.nombres.join(", "), precio: r.precio
  };
  panesArmados.push(panCombo);
  ultimoPanArmado = JSON.parse(JSON.stringify(panCombo));
  showToast(`${combo.emoji} ${combo.nombre} agregado`, "success");
  mostrarPantalla("pantalla-resumen");
  renderResumenGeneral();
}

function personalizarCombo(comboId) {
  const combo = combos.find(c => c.id === comboId);
  if (!combo) return;
  if (!asegurarCupo()) return;
  cargarSeleccionEnEditor(normalizarSeleccion(combo.ingredientes), 'PERSONALIZA <span>TU COMBO</span>', combo.nombre);
}

// =========================================================
// GUARDAR PAN
// =========================================================
function guardarPan() {
  const panSel = document.querySelector('input[name="pan"]:checked');
  if (!panSel) { showToast("Selecciona un pan primero", "remove"); return; }
  const panItem = ingredientsData.pan.items.find(i => i.id === panSel.value);
  if (!panItem) return;

  const simplificar = (items) => items.map(i => ({
    id: i.id, nombre: i.name || i.nombre || "Sin nombre",
    price: i.price || 0, qty: quantities[i.id] || 1
  }));

  const salsas = simplificar(getSelectedItems("salsas"));
  const extras = {};
  CATS_EXTRA.forEach(c => {
    const key = (c.key === "vegetales" && !ingredientsData.vegetales && ingredientsData.verduras) ? "verduras" : c.key;
    extras[c.key] = simplificar(getSelectedItems(key));
  });

  let precio = panItem.price;
  [...Object.values(extras).flat(), ...salsas].forEach(item => {
    precio += item.price * item.qty;
  });

  const panData = {
    tipo: "personalizado",
    pan: { id: panItem.id, nombre: panItem.name || "Pan", price: panItem.price || 0, qty: 1 },
    ...extras, salsas, precio
  };

  if (typeof registrarFavoritoSiAplica === "function") registrarFavoritoSiAplica(panData);

  if (panEnEdicion !== null) {
    panesArmados[panEnEdicion] = panData;
    panEnEdicion = null;
    showToast("Pan actualizado", "success");
  } else {
    panesArmados.push(panData);
    showToast("Pan ordenado", "success");
  }

  const btnGuardar = document.querySelector(".btn-guardar");
  if (btnGuardar) btnGuardar.innerHTML = "✓ Ordenar pan";

  ultimoPanArmado = JSON.parse(JSON.stringify(panData));
  limpiarEditor();
  mostrarPantalla("pantalla-resumen");
  renderResumenGeneral();
}

function cancelarPan() {
  const eraEdicion = panEnEdicion !== null;
  if (eraEdicion) panEnEdicion = null;
  limpiarEditor();
  if (!eraEdicion && panesArmados.length === 0) { abrirCombos(); return; }
  mostrarPantalla("pantalla-resumen");
  renderResumenGeneral();
}

function limpiarEditor() {
  document.querySelectorAll('input[type="checkbox"]').forEach(inp => inp.checked = false);
  document.querySelectorAll('input[name="pan"]').forEach(inp => inp.checked = false);
  Object.keys(quantities).forEach(k => delete quantities[k]);
  document.querySelectorAll('.qty-controls').forEach(c => c.classList.remove('visible'));
  animState.layers = {};
  if (typeof reiniciarEstadoPasos === "function") reiniciarEstadoPasos();
  renderSandwich();
  actualizarResumenPan();
}

function eliminarPan(idx) {
  const pan = panesArmados[idx];
  if (!confirm(`¿Eliminar este ${pan.tipo === "combo" ? "combo" : "pan"}?`)) return;
  panesArmados.splice(idx, 1);
  showToast("Eliminado", "remove");
  renderResumenGeneral();
}

// =========================================================
// EDITAR PAN
// =========================================================
function editarPan(idx) {
  const pan = panesArmados[idx];
  if (!pan) return;
  if (pan.tipo === "combo") { showToast("Los combos no se pueden editar", "remove"); return; }

  panEnEdicion = idx;
  limpiarEditor();

  if (pan.pan) {
    const panInput = document.querySelector(`input[value="${pan.pan.id}"]`);
    if (panInput) {
      panInput.checked = true;
      quantities[pan.pan.id] = 1;
      updateCardControls(pan.pan.id, true);
    }
  }
  [...CATS_EXTRA.map(c => c.key), "salsas"].forEach(cat => {
    itemsDeCategoria(pan, cat).forEach(item => {
      const input = document.querySelector(`input[value="${item.id}"]`);
      if (input) {
        input.checked = true;
        quantities[item.id] = item.qty || 1;
        updateCardControls(item.id, true);
      }
    });
  });

  mostrarPantalla("pantalla-sandwich");
  document.getElementById("header-titulo").innerHTML = 'EDITAR <span>PAN</span>';
  document.getElementById("header-subtitulo").innerHTML = `Pan ${idx + 1} de ${cantidadTotalPanes}`;
  renderSandwich();
  startAnimation();
  actualizarResumenPan();
  irAPaso(0);

  if (esMovil()) {
    const tabIng = document.querySelector('.movil-tab');
    cambiarVistaMovil('ingredientes', tabIng);
  }
}

function repetirUltimoPan() {
  if (!ultimoPanArmado) { showToast("No hay pan para repetir", "remove"); return; }
  if (panesArmados.length >= cantidadTotalPanes) {
    showToast("Ya completaste todos los panes", "remove");
    return;
  }
  const copia = JSON.parse(JSON.stringify(ultimoPanArmado));
  panesArmados.push(copia);
  showToast("Pan repetido", "success");
  renderResumenGeneral();
}

// =========================================================
// CONSTRUIR GRUPOS
// =========================================================
function buildGroup(key, cfg) {
  const container = document.getElementById(key + "-group");
  if (!container) return;
  cfg.items.forEach((item, idx) => {
    const row = document.createElement("label");
    row.className = "option";
    if (item._agotado) row.classList.add("agotado");

    const input = document.createElement("input");
    input.type = cfg.type;
    input.name = key;
    input.value = item.id;
    if (item._agotado) input.disabled = true;

    input.addEventListener("change", () => {
      if (input.checked && cfg.type === "checkbox" && CARNE_KEYS.includes(key) && contarCarnesElegidas() > MAX_CARNES) {
        input.checked = false;
        showToast("Máximo " + MAX_CARNES + " carnes por pan", "remove");
        return;
      }
      if (input.checked && cfg.type === "checkbox" && LIMITES_CAT[key] &&
          document.querySelectorAll('input[name="' + key + '"]:checked').length > LIMITES_CAT[key].max) {
        input.checked = false;
        showToast("Máximo " + LIMITES_CAT[key].max + " " + LIMITES_CAT[key].txt + " por pan", "remove");
        return;
      }
      if (input.checked) {
        if (cfg.type === "radio") {
          document.querySelectorAll(`input[name="${key}"]`).forEach(other => {
            if (other !== input) {
              other.checked = false;
              delete quantities[other.value];
              updateCardControls(other.value, false);
            }
          });
          quantities[item.id] = 1;
        } else {
          quantities[item.id] = 1;
        }
      } else {
        if (cfg.type === "radio") return;
        delete quantities[item.id];
      }
      updateCardControls(item.id, input.checked);
      actualizarResumenPan();
      startAnimation();
    });
    row.appendChild(input);

    if (item.image) {
      const img = document.createElement("img");
      img.className = "option-img";
      img.src = item.image;
      img.alt = item.name;
      img.loading = "lazy";
      img.onerror = () => { img.style.display = "none"; };
      row.appendChild(img);
    }

    const label = document.createElement("span");
    label.className = "option-name";
    label.textContent = item.name;
    row.appendChild(label);

    const etq = String(item.etiqueta || "").toLowerCase();
    if (key === "delicateses" || /casa/.test(etq)) {
      const t = document.createElement("span");
      t.className = "tag-casa tag-carta";
      t.textContent = "🏠 De la casa";
      row.appendChild(t);
    } else if (/popular|pedido|top/.test(etq)) {
      const t = document.createElement("span");
      t.className = "tag-pop tag-carta";
      t.textContent = "🔥 Más pedido";
      row.appendChild(t);
    }

    const price = document.createElement("span");
    price.className = "price";
    price.textContent = item.price === 0 ? "Incluido" : "+" + fmt(item.price);
    row.appendChild(price);

    const qtyControls = document.createElement("div");
    qtyControls.className = "qty-controls";
    qtyControls.dataset.id = item.id;

    const btnMinus = document.createElement("button");
    btnMinus.type = "button";
    btnMinus.className = "qty-btn qty-minus";
    btnMinus.textContent = "−";
    btnMinus.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const current = quantities[item.id] || 1;
      if (current > 1) {
        quantities[item.id] = current - 1;
        updateQtyDisplay(item.id);
        actualizarResumenPan();
        startAnimation();
      } else {
        if (cfg.type === "checkbox") {
          input.checked = false;
          delete quantities[item.id];
          updateCardControls(item.id, false);
          actualizarResumenPan();
          startAnimation();
        }
      }
    });

    const qtyDisplay = document.createElement("span");
    qtyDisplay.className = "qty-display";
    qtyDisplay.textContent = "1";

    const btnPlus = document.createElement("button");
    btnPlus.type = "button";
    btnPlus.className = "qty-btn qty-plus";
    btnPlus.textContent = "+";
    btnPlus.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const current = quantities[item.id] || 1;
      if (current < 10) {
        quantities[item.id] = current + 1;
        updateQtyDisplay(item.id);
        actualizarResumenPan();
        startAnimation();
      }
    });

    qtyControls.appendChild(btnMinus);
    qtyControls.appendChild(qtyDisplay);
    qtyControls.appendChild(btnPlus);
    row.appendChild(qtyControls);

    if (item._agotado) {
      const badge = document.createElement("span");
      badge.className = "agotado-badge";
      badge.textContent = "AGOTADO";
      row.appendChild(badge);
    }

    container.appendChild(row);
  });
}

function updateQtyDisplay(id) {
  const display = document.querySelector(`.qty-controls[data-id="${id}"] .qty-display`);
  if (display) display.textContent = quantities[id] || 1;
}

function updateCardControls(id, isChecked) {
  const controls = document.querySelector(`.qty-controls[data-id="${id}"]`);
  if (!controls) return;
  const input = document.querySelector(`input[value="${id}"]`);
  const esRadio = input && input.type === "radio";
  if (esRadio) { controls.classList.remove("visible"); return; }
  if (isChecked) {
    controls.classList.add("visible");
    if (!quantities[id]) { quantities[id] = 1; updateQtyDisplay(id); }
  } else {
    controls.classList.remove("visible");
  }
}

function getSelectedItems(key) {
  if (key === "vegetales" && !ingredientsData.vegetales && ingredientsData.verduras) key = "verduras";
  const cfg = ingredientsData[key];
  if (!cfg) return [];
  const inputs = document.querySelectorAll('input[name="' + key + '"]:checked');
  return Array.from(inputs).map(inp => cfg.items.find(i => i.id === inp.value)).filter(Boolean);
}

function actualizarResumenPan() {
  const list = document.getElementById("summary-list");
  const subtotalOut = document.getElementById("subtotal-out");
  if (!list || !subtotalOut) return;
  list.innerHTML = "";
  let subtotal = 0, count = 0;

  const panSel = document.querySelector('input[name="pan"]:checked');
  if (panSel) {
    const panItem = ingredientsData.pan.items.find(i => i.id === panSel.value);
    if (panItem) {
      subtotal += panItem.price; count++;
      const li = document.createElement("li");
      li.innerHTML = `<span class="item-name">${panItem.name}</span><span class="item-price">+${fmt(panItem.price)}</span>`;
      list.appendChild(li);
    }
  }

  ["salsas", ...CATS_EXTRA.map(c => c.key)].forEach(key => {
    getSelectedItems(key).forEach(item => {
      const qty = quantities[item.id] || 1;
      const itemTotal = item.price * qty;
      subtotal += itemTotal; count++;
      const li = document.createElement("li");
      const suffix = qty > 1 ? ` x${qty}` : "";
      li.innerHTML = `<span class="item-name">${item.name}${suffix}</span><span class="item-price">+${fmt(itemTotal)}</span>`;
      list.appendChild(li);
    });
  });

  if (count === 0) {
    const li = document.createElement("li");
    li.className = "empty-msg";
    li.textContent = "Selecciona un pan para empezar";
    list.appendChild(li);
  }
  subtotalOut.textContent = fmt(subtotal);
  const barraSub = document.getElementById("barra-subtotal");
  if (barraSub) barraSub.textContent = fmt(subtotal);
}

// =========================================================
// ANIMACIÓN
// =========================================================
const animState = { layers: {}, requestId: null, isAnimating: false };

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = Math.min(255, Math.max(0, (n >> 16) + amt));
  let g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
  let b = Math.min(255, Math.max(0, (n & 0xff) + amt));
  return "rgb(" + r + "," + g + "," + b + ")";
}

const imageCache = {};
function loadImage(src) {
  if (!src) return null;
  if (imageCache[src]) return imageCache[src];
  const img = new Image();
  img.onload = () => { if (!animState.isAnimating) renderSandwich(); };
  img.onerror = () => { img.__failed = true; };
  img.src = src;
  imageCache[src] = img;
  return img;
}
function isReady(img) { return img && img.complete && img.naturalWidth > 0 && !img.__failed; }

function drawLayer(ctx, src, color, x, y, w, h, r, drawShadow = true) {
  const img = src ? loadImage(src) : null;
  if (drawShadow) {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    drawRoundedRect(ctx, x, y, w, h, r);
    ctx.fillStyle = "rgba(0,0,0,0.01)";
    ctx.fill();
    ctx.restore();
  }
  if (isReady(img)) {
    ctx.save();
    drawRoundedRect(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  } else {
    ctx.fillStyle = color || "#CCCCCC";
    drawRoundedRect(ctx, x, y, w, h, r);
    ctx.fill();
  }
}

function getDPR() { return Math.min(window.devicePixelRatio || 1, 1.5); }

function getLayersWithQuantities() {
  const baseLayers = CATS_EXTRA.flatMap(c => getSelectedItems(c.key));
  const expandedLayers = [];
  baseLayers.forEach(item => {
    const qty = quantities[item.id] || 1;
    for (let i = 0; i < qty; i++) expandedLayers.push({ ...item, _qtyIndex: i, _qtyTotal: qty });
  });
  return expandedLayers.slice(0, 12);
}

function calculateTargets() {
  const panSel = document.querySelector('input[name="pan"]:checked');
  const panItem = panSel ? ingredientsData.pan.items.find(i => i.id === panSel.value) : null;
  const layers = getLayersWithQuantities();
  const salsas = getSelectedItems("salsas");
  const canvas = document.getElementById("sandwich-canvas");
  const dpr = getDPR();
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;
  const cx = W / 2;
  const baseWidth = W * 0.85;
  const bunHeight = baseWidth * 0.18;
  const layerHeight = baseWidth * 0.10;
  const overlap = baseWidth * 0.03;
  const stepY = layerHeight - overlap;
  const totalHeight = bunHeight * 2 + layers.length * stepY + (salsas.length ? layerHeight * 0.6 : 0) + 30;
  let y = H - Math.max(20, (H - totalHeight) / 2) - bunHeight;
  const bottomY = y;
  y -= stepY;
  const layerTargets = {};
  layers.forEach((item, i) => {
    const variation = (i % 3 === 0) ? baseWidth * 0.02 : (i % 3 === 1) ? -baseWidth * 0.01 : 0;
    const w = baseWidth - baseWidth * 0.05 + variation;
    const key = item._qtyTotal > 1 ? `${item.id}_${item._qtyIndex}` : item.id;
    layerTargets[key] = { y, w, h: layerHeight, item, color: item.color, layerImage: item.layerImage, originalId: item.id };
    y -= stepY;
  });
  const salsaTargets = {};
  salsas.forEach((s, i) => {
    const w = baseWidth - baseWidth * 0.06 + (i % 2 === 0 ? baseWidth * 0.02 : -baseWidth * 0.02);
    const salsaHeight = layerHeight * 0.6;
    y -= (salsaHeight - 4);
    salsaTargets[s.id] = { y, w, h: salsaHeight, item: s, color: s.color, layerImage: s.layerImage };
    y -= 4;
  });
  const topY = y - 4;
  return { panItem, panColor: panItem ? panItem.color : "#E8C27A", baseWidth, bunHeight, layerHeight, cx, W, H, bottomY, topY, layerTargets, salsaTargets };
}

function renderSandwich() {
  return; // El sándwich dibujado se eliminó (ahora: fotos grandes de cada ingrediente)
  const canvas = document.getElementById("sandwich-canvas");
  if (!canvas) return;
  const dpr = getDPR();
  const displayWidth = canvas.clientWidth || 220;
  const displayHeight = Math.round(displayWidth * (440 / 220));
  if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.height = displayHeight + "px";
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;
  ctx.clearRect(0, 0, W, H);
  const targets = calculateTargets();
  const { panItem, panColor, baseWidth, bunHeight, cx, bottomY, topY } = targets;
  ctx.beginPath();
  ctx.ellipse(cx, bottomY + bunHeight + 6, baseWidth / 2 + 15, 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fill();
  drawBottomBun(ctx, panItem, panColor, cx - baseWidth / 2, bottomY, baseWidth, bunHeight);
  Object.keys(targets.layerTargets).forEach(key => {
    const t = targets.layerTargets[key];
    const state = animState.layers[key];
    const currentY = state ? state.currentY : t.y;
    drawLayer(ctx, t.layerImage, t.color, cx - t.w / 2, currentY, t.w, t.h, 10, true);
  });
  Object.keys(targets.salsaTargets).forEach(id => {
    const t = targets.salsaTargets[id];
    const state = animState.layers[id];
    const currentY = state ? state.currentY : t.y;
    drawSalsaWavy(ctx, t, cx, currentY);
  });
  drawTopBun(ctx, panItem, panColor, cx, topY, baseWidth, bunHeight);
}

function drawBottomBun(ctx, panItem, panColor, x, y, w, h) {
  const img = panItem && panItem.bottomImage ? loadImage(panItem.bottomImage) : null;
  const r = h * 0.45;
  const drawPath = () => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };
  if (isReady(img)) {
    ctx.save(); drawPath(); ctx.clip(); ctx.drawImage(img, x, y, w, h); ctx.restore();
  } else {
    drawPath(); ctx.fillStyle = panColor; ctx.fill();
  }
}

function drawTopBun(ctx, panItem, panColor, cx, y, baseWidth, bunHeight) {
  const img = panItem && panItem.topImage ? loadImage(panItem.topImage) : null;
  const domeWidth = baseWidth + 10;
  const domeHeight = domeWidth * 0.30;
  const startX = cx - domeWidth / 2;
  const startY = y - domeHeight;
  const drawDomePath = () => {
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(startX, startY + domeHeight * 0.6);
    ctx.quadraticCurveTo(startX, startY, cx, startY);
    ctx.quadraticCurveTo(startX + domeWidth, startY, startX + domeWidth, startY + domeHeight * 0.6);
    ctx.lineTo(startX + domeWidth, y);
    ctx.closePath();
  };
  if (isReady(img)) {
    ctx.save(); drawDomePath(); ctx.clip(); ctx.drawImage(img, startX, startY, domeWidth, domeHeight + 10); ctx.restore();
  } else {
    drawDomePath(); ctx.fillStyle = panColor; ctx.fill();
  }
}

function drawSalsaWavy(ctx, t, cx, currentY) {
  const { w, h, color, layerImage } = t;
  const img = layerImage ? loadImage(layerImage) : null;
  const startX = cx - w / 2;
  const startY = currentY;
  ctx.save();
  ctx.beginPath();
  const steps = 10, waveAmplitude = 4, waveFrequency = 3;
  for (let j = 0; j <= steps; j++) {
    const px = startX + (j * w) / steps;
    const py = startY + Math.sin((j / steps) * Math.PI * waveFrequency) * waveAmplitude;
    if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  for (let j = steps; j >= 0; j--) {
    const px = startX + (j * w) / steps;
    const py = startY + h + Math.sin((j / steps) * Math.PI * waveFrequency) * waveAmplitude;
    ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.clip();
  if (isReady(img)) ctx.drawImage(img, startX, startY - waveAmplitude, w, h + waveAmplitude * 2);
  else { ctx.fillStyle = color || "#CCCCCC"; ctx.fillRect(startX, startY - waveAmplitude, w, h + waveAmplitude * 2); }
  ctx.restore();
}

function startAnimation() {
  return; // sin dibujo animado
  const targets = calculateTargets();
  Object.keys(targets.layerTargets).forEach(key => {
    const t = targets.layerTargets[key];
    if (!animState.layers[key]) animState.layers[key] = { currentY: -100, targetY: t.y, velocity: 0 };
    else animState.layers[key].targetY = t.y;
  });
  Object.keys(targets.salsaTargets).forEach(id => {
    const t = targets.salsaTargets[id];
    if (!animState.layers[id]) animState.layers[id] = { currentY: -100, targetY: t.y, velocity: 0 };
    else animState.layers[id].targetY = t.y;
  });
  const activeIds = [...Object.keys(targets.layerTargets), ...Object.keys(targets.salsaTargets)];
  Object.keys(animState.layers).forEach(id => { if (!activeIds.includes(id)) delete animState.layers[id]; });
  if (!animState.isAnimating) { animState.isAnimating = true; animateLoop(); }
}

function animateLoop() {
  let allSettled = true;
  const damping = 0.75, tolerance = 2.0;
  Object.values(animState.layers).forEach(layer => {
    const distance = layer.targetY - layer.currentY;
    if (Math.abs(distance) > tolerance || Math.abs(layer.velocity) > tolerance) {
      allSettled = false;
      layer.velocity += distance * 0.08;
      layer.velocity *= damping;
      layer.currentY += layer.velocity;
    } else {
      layer.currentY = layer.targetY;
      layer.velocity = 0;
    }
  });
  if (!allSettled) renderSandwich();
  if (allSettled) { animState.isAnimating = false; renderSandwich(); return; }
  animState.requestId = requestAnimationFrame(animateLoop);
}

// =========================================================
// MODAL ORDENAR
// =========================================================
function openOrderModal() {
  if (panesArmados.length < cantidadTotalPanes) {
    showToast(`Faltan ${cantidadTotalPanes - panesArmados.length} panes por armar`, "remove");
    return;
  }
  const now = new Date();
  document.getElementById("order-date").value = now.toISOString().split("T")[0];
  document.getElementById("order-time").value = now.toTimeString().slice(0, 5);
  fillModalSummary();
  document.getElementById("order-modal").classList.add("active");
}

function closeOrderModal() {
  document.getElementById("order-modal").classList.remove("active");
}

function fillModalSummary() {
  const list = document.getElementById("modal-summary-list");
  const totalOut = document.getElementById("modal-total");
  if (!list || !totalOut) return;
  list.innerHTML = "";
  let subtotal = 0;
  panesArmados.forEach((pan, idx) => {
    subtotal += pan.precio;
    const li = document.createElement("li");
    const esCombo = pan.tipo === "combo";
    const nombre = esCombo ? `${pan.emoji} ${pan.nombre}` : `🥪 Pan ${idx + 1}`;
    li.innerHTML = `<span>${nombre}</span><span class="item-price">${fmt(pan.precio)}</span>`;
    list.appendChild(li);
  });
  totalOut.textContent = fmt(subtotal);
}

// =========================================================
// GENERAR HTML DE CADA PAN PARA EL TICKET
// =========================================================
function generarDetallePanHTML(pan, idx) {
  const esCombo = pan.tipo === "combo";
  let html = "";
  const getNombre = (item) => item.nombre || item.name || "Sin nombre";

  if (esCombo) {
    html += `<div class="pan-bloque">`;
    html += `<div class="pan-titulo"><span>🎁 PAN ${idx + 1} - COMBO ${pan.nombre.toUpperCase()}</span><span class="pan-precio">${fmt(pan.precio)}</span></div>`;
    html += `<div class="pan-detalle">${pan.descripcion}</div>`;
    html += `</div>`;
  } else {
    const partes = [];
    if (pan.pan) partes.push(getNombre(pan.pan));
    const agregarItems = (items) => {
      if (!items || !items.length) return;
      items.forEach(item => {
        const qty = item.qty || 1;
        partes.push(qty > 1 ? `${getNombre(item)} x${qty}` : getNombre(item));
      });
    };
    CATS_EXTRA.forEach(c => agregarItems(itemsDeCategoria(pan, c.key)));
    agregarItems(pan.salsas);
    const descripcion = partes.join(", ");
    html += `<div class="pan-bloque">`;
    html += `<div class="pan-titulo"><span>🥪 PAN ${idx + 1}</span><span class="pan-precio">${fmt(pan.precio)}</span></div>`;
    html += `<div class="pan-detalle">${descripcion}</div>`;
    html += `</div>`;
  }
  return html;
}

// =========================================================
// IMPRIMIR
// =========================================================
function printTicket() {
  const clientName = document.getElementById("client-name").value.trim();
  const paymentMethod = document.getElementById("payment-method").value;
  const date = document.getElementById("order-date").value;
  const time = document.getElementById("order-time").value;
  if (!clientName) { showToast("Escribe el nombre del cliente", "remove"); return; }
  if (!paymentMethod) { showToast("Selecciona un método de pago", "remove"); return; }
  const dateObj = new Date(date + "T" + time);
  const dateFormatted = dateObj.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });

  const folio = obtenerSiguienteFolio();

  const pedidoCompleto = { folio, clientName, paymentMethod, dateFormatted, time, panes: JSON.parse(JSON.stringify(panesArmados)) };
  ultimoPedido = JSON.parse(JSON.stringify(pedidoCompleto));

  guardarPedidoEnHistorial(pedidoCompleto);

  imprimirPedido(pedidoCompleto);
  document.getElementById("btn-reimprimir").style.display = "flex";
  setTimeout(() => { limpiarTodoDespuesDeImprimir(); }, 1500);
}

function imprimirPedido(pedido) {
  const { folio, clientName, paymentMethod, dateFormatted, time, panes } = pedido;
  let detalleHTML = "";
  let totalGeneral = 0;
  panes.forEach((pan, idx) => {
    detalleHTML += generarDetallePanHTML(pan, idx);
    totalGeneral += pan.precio;
  });
  const ticketHTML = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Ticket</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: 80mm auto; margin: 0; }
        html, body { width: 80mm; margin: 0; padding: 0; background: #fff; color: #000; font-family: 'Arial', 'Helvetica', sans-serif; font-size: 11pt; font-weight: bold; line-height: 1.3; }
        body { padding: 2mm 3mm; }
        .ticket { width: 100%; margin: 0 auto; }
        .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 2mm; margin-bottom: 2mm; }
        .header h1 { font-size: 15pt; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }
        .header p { font-size: 9pt; font-weight: bold; margin-top: 0.5mm; }
        .info { font-size: 10pt; font-weight: bold; margin-bottom: 2mm; }
        .info-row { display: flex; justify-content: space-between; padding: 0.3mm 0; }
        .info-row .label { font-weight: 900; }
        .info-row .value { text-align: right; }
        .separator { border-top: 1px dashed #000; margin: 2mm 0; }
        .pan-bloque { margin-bottom: 3mm; padding-bottom: 2mm; border-bottom: 1px dashed #999; }
        .pan-bloque:last-child { border-bottom: none; }
        .pan-titulo { display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #000; padding-bottom: 1mm; margin-bottom: 1.5mm; font-size: 11pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
        .pan-titulo .pan-precio { font-size: 12pt; font-weight: 900; }
        .pan-detalle { font-size: 9pt; padding: 0.5mm 0; line-height: 1.4; font-weight: bold; }
        .total-general { display: flex; justify-content: space-between; align-items: center; font-size: 16pt; font-weight: 900; padding: 3mm 0; margin-top: 3mm; border-top: 3px solid #000; border-bottom: 3px solid #000; }
        .total-general span:first-child { text-transform: uppercase; letter-spacing: 1px; }
        .footer { text-align: center; font-size: 9pt; font-weight: bold; margin-top: 4mm; padding-top: 2mm; border-top: 1px dashed #000; }
        .footer p { margin: 1mm 0; }
        .gracias { font-size: 12pt; font-weight: 900; margin-top: 1.5mm; letter-spacing: 1px; }
      </style>
    </head>
    <body>
      <div class="ticket">
        <div class="header"><h1>ARMA TU SÁNDWICH</h1><p>Ticket de pedido</p></div>
        <div class="info">
          <div class="info-row" style="font-size:13pt;border-bottom:1.5px solid #000;padding-bottom:1mm;margin-bottom:1mm;">
            <span class="label">FOLIO:</span><span class="value">${folio || "S/F"}</span>
          </div>
          <div class="info-row"><span class="label">Cliente:</span><span class="value">${clientName}</span></div>
          <div class="info-row"><span class="label">Fecha:</span><span class="value">${dateFormatted}</span></div>
          <div class="info-row"><span class="label">Hora:</span><span class="value">${time}</span></div>
          <div class="info-row"><span class="label">Pago:</span><span class="value">${paymentMethod}</span></div>
        </div>
        <div class="separator"></div>
        ${detalleHTML}
        <div class="total-general"><span>TOTAL GENERAL</span><span>${fmt(totalGeneral)}</span></div>
        <div class="footer">
          <p>¡Gracias por tu pedido!</p>
          <p class="gracias">*** VUELVE PRONTO ***</p>
          <p>Conserve este ticket</p>
        </div>
      </div>
    </body>
    </html>
  `;
  const oldIframe = document.getElementById("print-iframe");
  if (oldIframe) oldIframe.remove();
  const iframe = document.createElement("iframe");
  iframe.id = "print-iframe";
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(iframe);
  const iframeDoc = iframe.contentWindow.document;
  iframeDoc.open(); iframeDoc.write(ticketHTML); iframeDoc.close();
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  }, 500);
}

function limpiarTodoDespuesDeImprimir() {
  closeOrderModal();
  panesArmados = []; panEnEdicion = null; ultimoPanArmado = null;
  limpiarEditor();
  cantidadTotalPanes = 1;
  document.getElementById("cantidad-inicial-display").textContent = "1";
  showToast("Pedido completado y limpiado", "success");
  setTimeout(() => { mostrarPantalla("pantalla-resumen"); renderResumenGeneral(); }, 800);
}

function reimprimirUltimoPedido() {
  if (!ultimoPedido) { showToast("No hay pedido para reimprimir", "remove"); return; }
  showToast("Reimprimiendo...", "info");
  imprimirPedido(ultimoPedido);
}

// =========================================================
// CARGA DEL MENÚ DESDE GOOGLE SHEETS
// =========================================================
function parseCSV(texto) {
  const lineas = texto.split(/\r?\n/).filter(l => l.trim());
  if (!lineas.length) return [];
  const headers = lineas[0].split(",").map(h => h.trim());
  return lineas.slice(1).map(linea => {
    const valores = [];
    let actual = "", enComillas = false;
    for (let i = 0; i < linea.length; i++) {
      const ch = linea[i];
      if (ch === '"') {
        if (enComillas && linea[i + 1] === '"') { actual += '"'; i++; }
        else enComillas = !enComillas;
      } else if (ch === "," && !enComillas) {
        valores.push(actual); actual = "";
      } else {
        actual += ch;
      }
    }
    valores.push(actual);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (valores[i] || "").trim(); });
    return obj;
  });
}

function parseBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v || "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "si" || s === "sí" || s === "yes" || s === "x";
}

// Bebidas / papitas / adicionales para la venta final (categoría "extras" en el Sheets)
const EXTRAS_CATS = ["extras", "extra", "adicionales", "adicional", "bebidas", "bebida", "papitas", "acompanantes"];
const extrasMenu = [];

// Precios de bandejas (filas "bandejas" y "extras bandeja" del Sheets; si no hay, quedan los del HTML)
const bandejasPrecios = { tamanos: {}, extras: {}, agotado: {} };
function _esAgotadoFila(v) {
  const s = String(v == null ? "" : v).trim().toLowerCase();
  return s === "false" || s === "falso" || s === "0" || s === "no" || s === "agotado" || s === "no hay";
}
const _fmtP = n => "$" + (Number.isInteger(n) ? n : n.toFixed(2));
function aplicarPreciosBandejas() {
  Object.entries(bandejasPrecios.tamanos).forEach(([t, p]) => {
    if (!(p > 0)) return;
    const radio = document.querySelector('input[name="tamano-bandeja"][value="' + t + '"]');
    if (radio) radio.setAttribute("data-price", p);
    document.querySelectorAll('[data-bandeja-tag="' + t + '"],[data-bandeja-base="' + t + '"]').forEach(e => e.textContent = _fmtP(p));
    document.querySelectorAll('[data-bandeja-precio="' + t + '"]').forEach(e => e.textContent = "$" + p.toFixed(2));
  });
  Object.entries(bandejasPrecios.extras).forEach(([x, p]) => {
    if (!(p >= 0)) return;
    const chk = document.querySelector('.extra-panel[data-extra="' + x + '"]');
    if (chk) chk.value = p.toFixed(2);
    document.querySelectorAll('[data-extra-precio="' + x + '"]').forEach(e => e.textContent = "$" + p.toFixed(2));
  });
  // Disponibilidad: "No hay" si la fila dice disponible = FALSE
  ["grande", "mediana", "pequena"].forEach(t => {
    const sin = !!bandejasPrecios.agotado[t];
    const card = document.querySelector('.platter-card[data-size="' + t + '"]');
    const radio = document.querySelector('input[name="tamano-bandeja"][value="' + t + '"]');
    if (card) {
      card.classList.toggle("agotada", sin);
      const gal = card.querySelector(".platter-gallery");
      let tag = card.querySelector(".platter-agotado-tag");
      if (sin && gal && !tag) { tag = document.createElement("span"); tag.className = "platter-agotado-tag"; tag.textContent = "NO HAY HOY"; gal.appendChild(tag); }
      if (!sin && tag) tag.remove();
      const btn = card.querySelector(".platter-elegir");
      if (btn) { btn.disabled = sin; btn.textContent = sin ? "No disponible" : "Elegir esta bandeja"; }
    }
    if (radio) {
      radio.disabled = sin;
      if (sin && radio.checked) radio.checked = false;
      const lab = radio.closest(".size-option");
      if (lab) lab.classList.toggle("agotada", sin);
    }
  });
  Object.keys(bandejasPrecios.extras).forEach(x => {
    const sin = !!bandejasPrecios.agotado["extra:" + x];
    const chk = document.querySelector('.extra-panel[data-extra="' + x + '"]');
    if (!chk) return;
    chk.disabled = sin;
    if (sin) chk.checked = false;
    const lab = chk.closest("label");
    if (lab) lab.classList.toggle("agotada", sin);
    const sp = lab && lab.querySelector("[data-extra-precio]");
    if (sp) sp.textContent = sin ? "no hay" : "$" + bandejasPrecios.extras[x].toFixed(2);
  });
  if (typeof actualizarPanelPedido === "function") actualizarPanelPedido();
}

async function cargarMenuDesdeSheets() {
  if (!MENU_CSV_URL || MENU_CSV_URL.includes("PEGA_AQUÍ")) {
    console.warn("[Menu] No hay URL configurada. Usando ingredients.js local.");
    return false;
  }
  try {
    const resp = await fetch(MENU_CSV_URL, { cache: "no-store" });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const texto = await resp.text();
    const filas = parseCSV(texto);
    if (!filas.length) throw new Error("CSV vacío");

    const agrupado = {};
    extrasMenu.length = 0;
    bandejasPrecios.tamanos = {};
    bandejasPrecios.extras = {};
    bandejasPrecios.agotado = {};
    filas.forEach(fila => {
      const cat = normalizarCategoria(fila.categoria);
      const id = (fila.id || "").trim();
      if (!cat || !id) return;
      const disponible = parseBool(fila.disponible);
      const catPlano = String(fila.categoria || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s_-]+/g, "");
      if (catPlano === "bandejas" || catPlano === "bandeja") {
        bandejasPrecios.tamanos[id.toLowerCase()] = parseFloat(String(fila.precio).replace(",", "."));
        bandejasPrecios.agotado[id.toLowerCase()] = _esAgotadoFila(fila.disponible);
        return;
      }
      if (catPlano === "extrasbandeja" || catPlano === "extrasbandejas") {
        bandejasPrecios.extras[id.toLowerCase()] = parseFloat(String(fila.precio).replace(",", "."));
        bandejasPrecios.agotado["extra:" + id.toLowerCase()] = _esAgotadoFila(fila.disponible);
        return;
      }
      if (EXTRAS_CATS.includes(cat)) {
        extrasMenu.push({ id, name: fila.nombre || id, price: parseFloat(fila.precio) || 0,
          image: fila.image || "", _agotado: !disponible });
        return;
      }
      if (!agrupado[cat]) {
        agrupado[cat] = { type: cat === "pan" ? "radio" : "checkbox", items: [] };
      }
      agrupado[cat].items.push({
        id,
        name: fila.nombre || id,
        price: parseFloat(fila.precio) || 0,
        color: fila.color || "#CCCCCC",
        image: fila.image || "",
        layerImage: fila.layerImage || "",
        bottomImage: fila.bottomImage || "",
        topImage: fila.topImage || "",
        etiqueta: fila.etiqueta || "",
        _agotado: !disponible
      });
    });

    menuData = agrupado;
    menuListo = true;
    try { localStorage.setItem("bandejas_cache", JSON.stringify(bandejasPrecios)); } catch (e) { /* ignorar */ }
    aplicarPreciosBandejas();

    try {
      localStorage.setItem("menu_cache", JSON.stringify({ ts: Date.now(), data: agrupado }));
    } catch (e) { /* ignorar */ }

    if (typeof buildAllGroups === "function") buildAllGroups();
    return true;
  } catch (err) {
    console.error("[Menu] Error cargando Sheets:", err);
    try {
      const cache = JSON.parse(localStorage.getItem("menu_cache") || "null");
      if (cache && cache.data) {
        menuData = cache.data;
        menuListo = true;
        try {
          const bc = JSON.parse(localStorage.getItem("bandejas_cache") || "null");
          if (bc) { bandejasPrecios.tamanos = bc.tamanos || {}; bandejasPrecios.extras = bc.extras || {}; bandejasPrecios.agotado = bc.agotado || {}; aplicarPreciosBandejas(); }
        } catch (e2) { /* ignorar */ }
        if (typeof buildAllGroups === "function") buildAllGroups();
        showToast("Usando menú guardado (sin conexión)", "info");
        return true;
      }
    } catch (e) { /* ignorar */ }
    showToast("No se pudo cargar el menú. Revisa tu conexión.", "remove");
    return false;
  }
}

function menuToIngredientsData() {
  if (!menuData) return null;
  const out = {};
  Object.entries(menuData).forEach(([cat, cfg]) => {
    const key = normalizarCategoria(cat);
    out[key] = {
      type: cfg.type,
      items: cfg.items.map(i => ({
        id: i.id, name: i.name, price: i.price, color: i.color,
        image: i.image, layerImage: i.layerImage,
        bottomImage: i.bottomImage, topImage: i.topImage,
        etiqueta: i.etiqueta || "",
        _agotado: i._agotado
      }))
    };
  });
  return out;
}

function buildAllGroups() {
  Object.keys(ingredientsData).forEach(key => {
    const cont = document.getElementById(key + "-group");
    if (cont) cont.innerHTML = "";
  });

  const dataFinal = menuListo && menuData ? menuToIngredientsData() : ingredientsData;

  Object.keys(ingredientsData).forEach(k => delete ingredientsData[k]);
  Object.assign(ingredientsData, dataFinal);

  Object.entries(ingredientsData).forEach(([key, cfg]) => buildGroup(key, cfg));
  ocultarCategoriasVacias();
  if (pantallaActual === "pantalla-combos") renderCombos();
}

// Oculta pestañas/secciones de categorías que aún no tienen productos en el menú
function ocultarCategoriasVacias() {
  document.querySelectorAll(".categoria-section").forEach(sec => {
    const cat = sec.dataset.cat;
    const cfg = ingredientsData[cat] || (cat === "vegetales" ? ingredientsData.verduras : null);
    const vacia = !cfg || !cfg.items || !cfg.items.length;
    sec.style.display = vacia ? "none" : "";
    const tab = document.querySelector(`.categoria-tab[data-cat="${cat}"]`);
    if (tab) tab.style.display = vacia ? "none" : "";
  });
  if (typeof renderPasos === "function") renderPasos();
}

// =========================================================
// CONSTRUCTOR GUIADO POR PASOS (estilo Sweetgreen)
// Pan → Carnes → Quesos → Vegetales → Salsas
// =========================================================
const PASOS = [
  { id: "pan",       emoji: "🥖", titulo: "Pan",       cats: ["pan"],
    ayuda: "Empieza por el pan: elige uno." },
  { id: "delicateses", emoji: "🏠", titulo: "Delicateses", cats: ["delicateses", "salchichones"],
    ayuda: "Nuestras carnes curadas y ahumadas “De la casa”, y salchichones. Máximo 3 carnes en total por pan." },
  { id: "carnes",    emoji: "🥓", titulo: "Carnes",    cats: ["proteinas", "embutidos"],
    ayuda: "Proteínas y embutidos. Máximo 3 carnes en total por pan (contando las delicateses)." },
  { id: "quesos",    emoji: "🧀", titulo: "Quesos",    cats: ["quesos"],
    ayuda: "Elige hasta 2 quesos." },
  { id: "vegetales", emoji: "🥬", titulo: "Vegetales", cats: ["vegetales"],
    ayuda: "Frescos y al gusto. Elige hasta 5 vegetales." },
  { id: "salsas",    emoji: "🥫", titulo: "Salsas",    cats: ["salsas"],
    ayuda: "El toque final. Elige hasta 3 salsas." }
];
const CARNE_KEYS = ["delicateses", "salchichones", "proteinas", "embutidos"];
const MAX_CARNES = 3;
const LIMITES_CAT = { quesos: { max: 2, txt: "quesos" }, salsas: { max: 3, txt: "salsas" },
  vegetales: { max: 5, txt: "vegetales" }, verduras: { max: 5, txt: "vegetales" } };
const NOMBRE_CAT = { delicateses: "Delicateses · de la casa", embutidos: "Embutidos", salchichones: "Salchichones", proteinas: "Proteínas" };

let pasoActual = 0;
let favoritoPendiente = false;
let nudgesOmitidos = {};

function catConItems(c) {
  const cfg = ingredientsData[c] || (c === "vegetales" ? ingredientsData.verduras : null);
  return !!(cfg && cfg.items && cfg.items.length);
}
function pasosVisibles() { return PASOS.filter(p => p.cats.some(catConItems)); }
function indicePaso(id) { return Math.max(0, pasosVisibles().findIndex(p => p.id === id)); }

function contarCarnesElegidas() {
  return CARNE_KEYS.reduce((n, k) => n + document.querySelectorAll('input[name="' + k + '"]:checked').length, 0);
}

function reiniciarEstadoPasos() {
  pasoActual = 0;
  favoritoPendiente = false;
  nudgesOmitidos = {};
  ocultarNudge();
}

function renderPasos() {
  const pasos = pasosVisibles();
  const tabs = document.getElementById("pasos-tabs");
  if (!pasos.length || !tabs) return;
  if (pasoActual > pasos.length - 1) pasoActual = pasos.length - 1;
  if (pasoActual < 0) pasoActual = 0;
  const actual = pasos[pasoActual];
  const ultimo = pasoActual === pasos.length - 1;

  tabs.innerHTML = pasos.map((p, i) =>
    `<button type="button" class="categoria-tab paso-tab${i === pasoActual ? " active" : ""}${i < pasoActual ? " hecho" : ""}" onclick="irAPaso(${i})">` +
    `<span class="paso-num">${i < pasoActual ? "✓" : i + 1}</span>${p.emoji} ${p.titulo}</button>`
  ).join("");
  const act = tabs.querySelector(".paso-tab.active");
  if (act) tabs.scrollLeft = Math.max(0, act.offsetLeft - 24);

  const txt = document.getElementById("paso-texto");
  if (txt) txt.textContent = `Paso ${pasoActual + 1} de ${pasos.length} · ${actual.titulo}`;
  const rel = document.getElementById("pasos-relleno");
  if (rel) rel.style.width = ((pasoActual + 1) / pasos.length * 100) + "%";
  const ayuda = document.getElementById("paso-ayuda");
  if (ayuda) ayuda.textContent = actual.ayuda;

  const contenido = document.getElementById("categorias-contenido");
  if (contenido) contenido.dataset.paso = actual.id;
  document.querySelectorAll(".categoria-section").forEach(sec => {
    sec.classList.toggle("fuera-de-paso", !actual.cats.includes(sec.dataset.cat));
  });

  const chips = document.getElementById("carnes-chips");
  if (chips) {
    const cats = actual.cats.filter(catConItems);
    chips.style.display = cats.length > 1 ? "flex" : "none";
    chips.innerHTML = cats.map(c => `<button type="button" class="carne-chip" onclick="scrollToCategoria('${c}')">${NOMBRE_CAT[c] || c}</button>`).join("");
  }

  const atras = document.getElementById("btn-paso-atras");
  if (atras) atras.textContent = pasoActual === 0 ? "Cancelar" : "← Atrás";
  const sig = document.getElementById("btn-paso-siguiente");
  if (sig) sig.textContent = ultimo ? (panEnEdicion !== null ? "✓ Actualizar pan" : "✓ Ordenar pan") : "Siguiente →";
  const favRow = document.getElementById("fav-row");
  if (favRow) favRow.style.display = ultimo ? "flex" : "none";
  actualizarBtnFavorito();
}

function irAPaso(i) {
  pasoActual = i;
  ocultarNudge();
  renderPasos();
  const contenido = document.getElementById("categorias-contenido");
  if (contenido) contenido.scrollTop = 0;
}

function pasoAtras() {
  if (pasoActual === 0) { cancelarPan(); return; }
  irAPaso(pasoActual - 1);
}

function pasoSiguiente() {
  const pasos = pasosVisibles();
  if (pasos[pasoActual] && pasos[pasoActual].id === "pan" && !document.querySelector('input[name="pan"]:checked')) {
    showToast("Elige un pan para continuar", "remove");
    return;
  }
  if (pasoActual < pasos.length - 1) { irAPaso(pasoActual + 1); return; }
  if (!validarAntesDeGuardar()) return;
  guardarPan();
}

// ----- Avisos suaves (no bloquean, solo preguntan) -----
function mostrarNudge(mensaje, txtA, fnA, txtB, fnB) {
  const n = document.getElementById("nudge");
  if (!n) { fnB(); return; }
  n.innerHTML = "";
  const m = document.createElement("span");
  m.className = "nudge-texto";
  m.textContent = mensaje;
  const a = document.createElement("button");
  a.type = "button"; a.className = "nudge-btn nudge-principal"; a.textContent = txtA;
  a.onclick = () => { ocultarNudge(); fnA(); };
  const b = document.createElement("button");
  b.type = "button"; b.className = "nudge-btn"; b.textContent = txtB;
  b.onclick = () => { ocultarNudge(); fnB(); };
  n.appendChild(m); n.appendChild(a); n.appendChild(b);
  n.classList.add("visible");
}
function ocultarNudge() {
  const n = document.getElementById("nudge");
  if (n) { n.classList.remove("visible"); n.innerHTML = ""; }
}
function validarAntesDeGuardar() {
  const hayCarne = contarCarnesElegidas() > 0;
  const hayQueso = document.querySelectorAll('input[name="quesos"]:checked').length > 0;
  if (!hayCarne && !hayQueso && !nudgesOmitidos.vacio) {
    mostrarNudge("Tu sándwich no lleva carne ni queso. ¿Quieres agregar algo?",
      "Agregar carnes", () => irAPaso(indicePaso("delicateses")),
      "Así está bien", () => { nudgesOmitidos.vacio = true; pasoSiguiente(); });
    return false;
  }
  const hayQuesoSalsas = catConItems("salsas");
  const haySalsa = document.querySelectorAll('input[name="salsas"]:checked').length > 0;
  if (hayQuesoSalsas && !haySalsa && !nudgesOmitidos.salsa) {
    mostrarNudge("¿Sin salsa? Se ve seco 😅 Una salsa lo cambia todo.",
      "Elegir salsa", () => { /* ya estás en el paso de salsas */ },
      "Así está bien", () => { nudgesOmitidos.salsa = true; pasoSiguiente(); });
    return false;
  }
  return true;
}

// ----- Selecciones (combos y favoritos) -----
function limpiarNombre(n) {
  return String(n || "").replace(/\s*\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();
}
function itemEnMenu(cat, id) {
  const cfg = ingredientsData[cat] || (cat === "vegetales" ? ingredientsData.verduras : null);
  return cfg ? (cfg.items.find(i => i.id === id) || null) : null;
}
// ingredientes de un combo { pan:"id", quesos:["a","b"] }  →  { pan:"id", quesos:[{id,qty}] }
function normalizarSeleccion(ing) {
  const sel = { pan: ing.pan };
  [...CATS_EXTRA.map(c => c.key), "salsas"].forEach(cat => {
    sel[cat] = (ing[cat] || []).map(x => typeof x === "string" ? { id: x, qty: 1 } : { id: x.id, qty: x.qty || 1 });
  });
  return sel;
}
function resolverSeleccion(sel) {
  const r = { ok: true, agotado: false, precio: 0, nombres: [] };
  const pan = itemEnMenu("pan", sel.pan);
  if (!pan) { r.ok = false; return r; }
  r.precio += pan.price;
  if (pan._agotado) r.agotado = true;
  r.nombres.push(limpiarNombre(pan.name));
  [...CATS_EXTRA.map(c => c.key), "salsas"].forEach(cat => {
    (sel[cat] || []).forEach(x => {
      const it = itemEnMenu(cat, x.id);
      if (!it) { r.ok = false; return; }
      if (it._agotado) r.agotado = true;
      const q = x.qty || 1;
      r.precio += it.price * q;
      r.nombres.push(limpiarNombre(it.name) + (q > 1 ? " x" + q : ""));
    });
  });
  return r;
}
function construirPanDesdeSeleccion(sel) {
  const pan = itemEnMenu("pan", sel.pan);
  const simple = (cat) => (sel[cat] || []).map(x => {
    const it = itemEnMenu(cat, x.id);
    return it ? { id: it.id, nombre: it.name, price: it.price || 0, qty: x.qty || 1 } : null;
  }).filter(Boolean);
  const data = { tipo: "personalizado", pan: { id: pan.id, nombre: pan.name, price: pan.price || 0, qty: 1 } };
  CATS_EXTRA.forEach(c => { data[c.key] = simple(c.key); });
  data.salsas = simple("salsas");
  data.precio = pan.price + [...CATS_EXTRA.map(c => c.key), "salsas"].reduce((t, cat) => t + data[cat].reduce((a, i) => a + i.price * i.qty, 0), 0);
  return data;
}
function seleccionDesdePan(pan) {
  const sel = { pan: pan.pan && pan.pan.id };
  [...CATS_EXTRA.map(c => c.key), "salsas"].forEach(cat => {
    sel[cat] = itemsDeCategoria(pan, cat).map(i => ({ id: i.id, qty: i.qty || 1 }));
  });
  return sel;
}
// Carga una selección en el editor y abre el constructor (en el paso de carnes)
function cargarSeleccionEnEditor(sel, tituloHTML, subtitulo) {
  panEnEdicion = null;
  limpiarEditor();
  const marcar = (cat, id, qty) => {
    let input = document.querySelector('input[name="' + cat + '"][value="' + id + '"]');
    if (!input && cat === "vegetales") input = document.querySelector('input[name="verduras"][value="' + id + '"]');
    if (!input || input.disabled) return;
    input.checked = true;
    quantities[id] = qty || 1;
    updateCardControls(id, true);
    updateQtyDisplay(id);
  };
  marcar("pan", sel.pan, 1);
  [...CATS_EXTRA.map(c => c.key), "salsas"].forEach(cat => (sel[cat] || []).forEach(x => marcar(cat, x.id, x.qty)));

  mostrarPantalla("pantalla-sandwich");
  document.getElementById("header-titulo").innerHTML = tituloHTML;
  document.getElementById("header-subtitulo").innerHTML = subtitulo ? _esc(subtitulo) : `Pan ${panesArmados.length + 1} de ${cantidadTotalPanes}`;
  renderSandwich();
  startAnimation();
  actualizarResumenPan();
  irAPaso(indicePaso("delicateses"));
  if (esMovil()) {
    const tabIng = document.querySelector('.movil-tab');
    cambiarVistaMovil('ingredientes', tabIng);
  }
}

// ----- Favoritos (guardados en el teléfono del cliente) -----
const FAV_KEY = "ricodelico_favoritos";
function leerFavoritos() {
  try { const a = JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}
function escribirFavoritos(arr) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(arr.slice(0, 12))); } catch (e) { /* ignorar */ }
}
function toggleFavoritoPendiente() {
  favoritoPendiente = !favoritoPendiente;
  actualizarBtnFavorito();
}
function actualizarBtnFavorito() {
  const b = document.getElementById("btn-fav");
  if (!b) return;
  b.classList.toggle("activo", favoritoPendiente);
  b.textContent = favoritoPendiente ? "⭐ Se guardará en tus favoritos" : "☆ Guardar como mi favorito";
}
function registrarFavoritoSiAplica(panData) {
  if (!favoritoPendiente) return;
  const sel = seleccionDesdePan(panData);
  const clave = JSON.stringify(sel);
  const favs = leerFavoritos().filter(f => JSON.stringify(f.sel) !== clave);
  let base = panData.pan ? limpiarNombre(panData.pan.nombre) : "Mi pan";
  for (const c of CARNE_KEYS) { const it = itemsDeCategoria(panData, c)[0]; if (it) { base = limpiarNombre(it.nombre); break; } }
  favs.unshift({ id: "fav_" + Date.now(), nombre: "Mi favorito · " + base, sel });
  escribirFavoritos(favs);
  favoritoPendiente = false;
  showToast("⭐ Guardado en tus favoritos", "success");
}
function renderFavoritos() {
  const bloque = document.getElementById("favoritos-bloque");
  const grid = document.getElementById("favoritos-grid");
  if (!bloque || !grid) return;
  const lista = leerFavoritos().map(f => ({ f, r: resolverSeleccion(f.sel) })).filter(x => x.r.ok);
  bloque.style.display = lista.length ? "" : "none";
  grid.innerHTML = lista.map(({ f, r }) => `
    <div class="combo-card combo-fav${r.agotado ? " agotado" : ""}">
      <button type="button" class="fav-borrar" aria-label="Quitar de favoritos" onclick="borrarFavorito('${f.id}')">✕</button>
      <div class="combo-emoji">⭐</div>
      <div class="combo-nombre">${_esc(f.nombre)}</div>
      <div class="combo-ingredientes">${_esc(r.nombres.join(" · "))}</div>
      ${r.agotado ? '<div class="combo-aviso">Hoy hay un ingrediente agotado</div>' : ''}
      <div class="combo-precio">${fmt(r.precio)}</div>
      <div class="combo-botones">
        <button class="combo-agregar" ${r.agotado ? "disabled" : ""} onclick="agregarFavorito('${f.id}')">Agregar</button>
        <button class="combo-personalizar" onclick="personalizarFavorito('${f.id}')">Personalizar</button>
      </div>
    </div>`).join("");
}
function buscarFavorito(id) { return leerFavoritos().find(f => f.id === id); }
function agregarFavorito(id) {
  const f = buscarFavorito(id);
  if (!f) return;
  const r = resolverSeleccion(f.sel);
  if (!r.ok || r.agotado) { showToast("Este favorito no está disponible hoy", "remove"); return; }
  if (!asegurarCupo()) return;
  const panData = construirPanDesdeSeleccion(f.sel);
  panesArmados.push(panData);
  ultimoPanArmado = JSON.parse(JSON.stringify(panData));
  showToast("⭐ Favorito agregado", "success");
  mostrarPantalla("pantalla-resumen");
  renderResumenGeneral();
}
function personalizarFavorito(id) {
  const f = buscarFavorito(id);
  if (!f) return;
  if (!asegurarCupo()) return;
  cargarSeleccionEnEditor(f.sel, 'PERSONALIZA <span>TU FAVORITO</span>', f.nombre);
}
function borrarFavorito(id) {
  escribirFavoritos(leerFavoritos().filter(f => f.id !== id));
  renderFavoritos();
}

// =========================================================
// FOLIO SECUENCIAL
// =========================================================
const FOLIO_KEY = "folio_counter";
const FOLIO_PREFIX = "A-";
const FOLIO_PAD = 4;

function obtenerSiguienteFolio() {
  let actual = parseInt(localStorage.getItem(FOLIO_KEY) || "0", 10);
  if (isNaN(actual)) actual = 0;
  actual += 1;
  localStorage.setItem(FOLIO_KEY, String(actual));
  return FOLIO_PREFIX + String(actual).padStart(FOLIO_PAD, "0");
}

function verFolioActual() {
  const actual = parseInt(localStorage.getItem(FOLIO_KEY) || "0", 10);
  return FOLIO_PREFIX + String(actual).padStart(FOLIO_PAD, "0");
}

function resetearFolio() {
  if (!confirm("¿Reiniciar el contador de folios a A-0001?\nEsto NO borra el historial.")) return;
  localStorage.setItem(FOLIO_KEY, "0");
  showToast("Folio reiniciado a " + verFolioActual(), "info");
  renderHistorial();
}

// =========================================================
// HISTORIAL DE PEDIDOS
// =========================================================
const HISTORIAL_KEY = "historial_pedidos";
const HISTORIAL_MAX = 50;

function leerHistorial() {
  try {
    const raw = localStorage.getItem(HISTORIAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.warn("[Historial] Error leyendo:", e);
    return [];
  }
}

function escribirHistorial(arr) {
  try {
    localStorage.setItem(HISTORIAL_KEY, JSON.stringify(arr.slice(0, HISTORIAL_MAX)));
  } catch (e) {
    console.warn("[Historial] Error escribiendo:", e);
    showToast("No se pudo guardar el historial", "remove");
  }
}

function guardarPedidoEnHistorial(pedido) {
  const arr = leerHistorial();
  arr.unshift(pedido);
  escribirHistorial(arr);
}

function eliminarPedidoHistorial(folio) {
  if (!confirm(`¿Eliminar el pedido ${folio} del historial?`)) return;
  const arr = leerHistorial().filter(p => p.folio !== folio);
  escribirHistorial(arr);
  renderHistorial();
  showToast("Pedido eliminado del historial", "remove");
}

function borrarTodoHistorial() {
  if (!confirm("¿Borrar TODO el historial de pedidos?\nEsta acción no se puede deshacer.")) return;
  localStorage.removeItem(HISTORIAL_KEY);
  renderHistorial();
  showToast("Historial borrado", "remove");
}

function abrirHistorial() {
  const modal = document.getElementById("historial-modal");
  if (!modal) return;
  renderHistorial();
  modal.classList.add("active");
}

function cerrarHistorial() {
  const modal = document.getElementById("historial-modal");
  if (modal) modal.classList.remove("active");
}

function renderHistorial() {
  const cont = document.getElementById("historial-lista");
  const vacio = document.getElementById("historial-vacio");
  const infoFolio = document.getElementById("historial-folio-actual");
  if (!cont) return;

  if (infoFolio) infoFolio.textContent = "Próximo folio: " + verFolioActual();

  const arr = leerHistorial();
  cont.innerHTML = "";

  if (!arr.length) {
    if (vacio) vacio.style.display = "block";
    return;
  }
  if (vacio) vacio.style.display = "none";

  arr.forEach(pedido => {
    const card = document.createElement("div");
    card.className = "historial-item";

    const total = (pedido.panes || []).reduce((s, p) => s + (p.precio || 0), 0);
    const numPanes = (pedido.panes || []).length;

    card.innerHTML = `
      <div class="historial-item-header">
        <span class="historial-folio">${pedido.folio || "S/F"}</span>
        <span class="historial-total">${fmt(total)}</span>
      </div>
      <div class="historial-item-info">
        <span>👤 ${pedido.clientName || "Sin nombre"}</span>
        <span>💳 ${pedido.paymentMethod || "-"}</span>
      </div>
      <div class="historial-item-info">
        <span>📅 ${pedido.dateFormatted || "-"} ${pedido.time || ""}</span>
        <span>🥪 ${numPanes} pan${numPanes > 1 ? "es" : ""}</span>
      </div>
      <div class="historial-item-acciones">
        <button class="btn-hist-accion btn-hist-reimprimir" data-folio="${pedido.folio}">🖨 Reimprimir</button>
        <button class="btn-hist-accion btn-hist-eliminar" data-folio="${pedido.folio}">🗑 Eliminar</button>
      </div>
    `;
    cont.appendChild(card);
  });

  cont.querySelectorAll(".btn-hist-reimprimir").forEach(btn => {
    btn.addEventListener("click", () => {
      const folio = btn.dataset.folio;
      const pedido = leerHistorial().find(p => p.folio === folio);
      if (!pedido) { showToast("Pedido no encontrado", "remove"); return; }
      showToast("Reimprimiendo " + folio + "...", "info");
      imprimirPedido(pedido);
    });
  });
  cont.querySelectorAll(".btn-hist-eliminar").forEach(btn => {
    btn.addEventListener("click", () => eliminarPedidoHistorial(btn.dataset.folio));
  });
}

// =========================================================
// LIGHTBOX - VISOR DE IMÁGENES EN GRANDE
// =========================================================

let lightboxImages = [];
let lightboxIndex = 0;

function abrirLightbox(imgElement) {
    // Aceptar tanto un elemento img como una URL (por retrocompatibilidad)
    let img;
    if (typeof imgElement === 'string') {
        // Buscar por src absoluto o relativo
        img = Array.from(document.querySelectorAll('.platter-gallery img'))
                  .find(i => i.src === imgElement || i.getAttribute('src') === imgElement);
    } else {
        img = imgElement;
    }
    
    if (!img) {
        console.warn('[Lightbox] Imagen no encontrada:', imgElement);
        return;
    }
    
    const gallery = img.closest('.platter-gallery');
    if (!gallery) {
        console.warn('[Lightbox] No está dentro de .platter-gallery');
        return;
    }
    
    // Recolectar todas las imágenes del mismo panel
    lightboxImages = Array.from(gallery.querySelectorAll('img')).map(i => i.src);
    lightboxIndex = lightboxImages.indexOf(img.src);
    if (lightboxIndex === -1) lightboxIndex = 0;
    
    // Actualizar y mostrar
    actualizarLightbox();
    const lightbox = document.getElementById('lightbox');
    if (lightbox) {
        lightbox.classList.add('active');
        document.body.classList.add('lightbox-open');
    } else {
        console.warn('[Lightbox] No se encontró el elemento #lightbox en el DOM');
    }
}

function actualizarLightbox() {
    const img = document.getElementById('lightbox-img');
    const current = document.getElementById('lightbox-current');
    const total = document.getElementById('lightbox-total');
    if (!img) return;
    
    img.style.opacity = '0';
    setTimeout(() => {
        img.src = lightboxImages[lightboxIndex];
        img.style.opacity = '1';
    }, 150);
    
    if (current) current.textContent = lightboxIndex + 1;
    if (total) total.textContent = lightboxImages.length;
}

function navegarLightbox(direccion) {
    if (lightboxImages.length === 0) return;
    lightboxIndex = (lightboxIndex + direccion + lightboxImages.length) % lightboxImages.length;
    actualizarLightbox();
}

function cerrarLightbox() {
    const lightbox = document.getElementById('lightbox');
    if (lightbox) {
        lightbox.classList.remove('active');
        document.body.classList.remove('lightbox-open');
    }
}

// =========================================================
// INICIALIZACIÓN
// =========================================================
async function iniciarApp() {
  if (typeof ingredientsData === "undefined") {
    document.querySelector("main").innerHTML = "<p style='color:#993C1D'>No se encontró ingredients.js.</p>";
    return;
  }

  Object.entries(ingredientsData).forEach(([key, cfg]) => buildGroup(key, cfg));
  ocultarCategoriasVacias();

  cargarMenuDesdeSheets().then(ok => {
    if (ok) console.log("[Menu] Actualizado desde Google Sheets");
  });

  document.getElementById("total-out").textContent = "$0.00";
  const clearBtn = document.getElementById("clear-btn");
  if (clearBtn) clearBtn.addEventListener("click", () => {
    limpiarEditor();
    const firstPan = document.querySelector('input[name="pan"]:not(:disabled)');
    if (firstPan) { firstPan.checked = true; quantities[firstPan.value] = 1; }
    actualizarResumenPan();
    renderSandwich();
    showToast("Lista limpiada", "info");
  });

  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      renderSandwich();
      if (!esMovil()) {
        document.querySelectorAll('.col-ingredientes, .col-resumen, .col-sandwich')
          .forEach(c => c.classList.remove('movil-activa'));
      } else {
        if (!document.querySelector('.movil-activa')) {
          const tabIng = document.querySelector('.movil-tab');
          cambiarVistaMovil('ingredientes', tabIng);
        }
      }
    }, 250);
  });
}

iniciarApp();

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("order-modal");
  const closeBtn = document.getElementById("modal-close");
  const cancelBtn = document.getElementById("btn-cancel");
  const printBtn = document.getElementById("btn-print");
  const reprintBtn = document.getElementById("btn-reimprimir");
  if (closeBtn) closeBtn.addEventListener("click", closeOrderModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeOrderModal);
  if (printBtn) printBtn.addEventListener("click", printTicket);
  if (reprintBtn) reprintBtn.addEventListener("click", reimprimirUltimoPedido);
  if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) closeOrderModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && modal.classList.contains("active")) closeOrderModal();
  });

  // Historial
  const historialModal = document.getElementById("historial-modal");
  const btnAbrirHistorial = document.getElementById("btn-abrir-historial");
  const btnCerrarHistorial = document.getElementById("historial-close");
  const btnBorrarHistorial = document.getElementById("btn-borrar-historial");
  const btnResetFolio = document.getElementById("btn-reset-folio");

  const CLAVE_HISTORIAL = "ricokeso";

  function pedirClaveYAbrirHistorial() {
    const clave = prompt("🔒 Clave de administrador:");
    if (clave === null) return;
    if (clave.trim().toLowerCase() === CLAVE_HISTORIAL) {
      abrirHistorial();
    } else {
      showToast("Clave incorrecta", "remove");
    }
  }

  if (btnAbrirHistorial) btnAbrirHistorial.addEventListener("click", pedirClaveYAbrirHistorial);
  if (btnCerrarHistorial) btnCerrarHistorial.addEventListener("click", cerrarHistorial);
  if (btnBorrarHistorial) btnBorrarHistorial.addEventListener("click", borrarTodoHistorial);
  if (btnResetFolio) btnResetFolio.addEventListener("click", resetearFolio);
  if (historialModal) {
    historialModal.addEventListener("click", (e) => {
      if (e.target === historialModal) cerrarHistorial();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && historialModal && historialModal.classList.contains("active")) {
      cerrarHistorial();
    }
  });
  const contenido = document.getElementById("categorias-contenido");
  if (contenido) contenido.addEventListener("scroll", actualizarPestanaActiva);

  if (esMovil()) {
    const tabIng = document.querySelector('.movil-tab');
    cambiarVistaMovil('ingredientes', tabIng);
  }

  if (mqMovil.addEventListener) {
    mqMovil.addEventListener("change", (e) => {
      renderSandwich();
      if (!e.matches) {
        document.querySelectorAll('.col-ingredientes, .col-resumen, .col-sandwich')
          .forEach(c => c.classList.remove('movil-activa'));
      } else {
        const tabIng = document.querySelector('.movil-tab');
        cambiarVistaMovil('ingredientes', tabIng);
      }
    });
  }

  // ===== LIGHTBOX =====
  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox || e.target.classList.contains('lightbox-content')) {
        cerrarLightbox();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!lightbox.classList.contains('active')) return;
      if (e.key === 'Escape') cerrarLightbox();
      if (e.key === 'ArrowLeft') navegarLightbox(-1);
      if (e.key === 'ArrowRight') navegarLightbox(1);
    });

    let touchStartX = 0;
    lightbox.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    lightbox.addEventListener('touchend', (e) => {
      const diff = touchStartX - e.changedTouches[0].screenX;
      if (Math.abs(diff) > 50) {
        navegarLightbox(diff > 0 ? 1 : -1);
      }
    }, { passive: true });
  }

  // Delegación de eventos - funciona para imágenes cargadas dinámicamente
  document.addEventListener('click', function(e) {
    if (e.target.matches('.platter-gallery img')) {
      e.preventDefault();
      e.stopPropagation();
      abrirLightbox(e.target);
    }
  });
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
