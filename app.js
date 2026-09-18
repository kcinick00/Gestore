// ============================================
// GESTORE PWA - Lógica principal
// ============================================

// ⚠️ CONFIGURACIÓN DE SUPABASE
const SUPABASE_URL = "https://kpsurjxypipxtjizlyon.supabase.co";
const SUPABASE_KEY = "sb_publishable_sA8BVuihO3RaIcZrqTPzyA_HkYahfV5";

let supabaseClient;
try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("✅ Cliente Supabase creado");
} catch (e) {
    console.error("❌ Error al crear cliente Supabase:", e);
}

// ============================================
// ESTADO GLOBAL
// ============================================
const DIAS_VENCIMIENTO = 10;

let datos = { facturas: [], pagos: [], productos: [] };
let filtros = { 
    facturas: { texto: '', estatus: 'activas', orden: 'fecha', direccion: 'asc' },
    pagos: { texto: '', orden: 'fecha', direccion: 'desc' },
    productos: { texto: '', orden: 'nombre', direccion: 'asc' }
};
let tasaActual = null;

// Estado temporal para productos detectados por OCR
let productosDetectados = [];
let facturaTemporalParaProductos = null;

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Gestore PWA iniciado");
    configurarEventos();
    cargarTasa();
    cargarDatos();
    configurarFotoFactura();
});

function configurarEventos() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => cambiarTab(tab.dataset.tab));
    });

    document.getElementById('btnRefresh').addEventListener('click', () => {
        mostrarToast('Actualizando...', 'info');
        cargarTasa();
        cargarDatos();
    });

    // Búsqueda
    document.getElementById('buscarFacturas').addEventListener('input', (e) => {
        filtros.facturas.texto = e.target.value.toLowerCase();
        renderizarFacturas();
    });
    document.getElementById('buscarPagos').addEventListener('input', (e) => {
        filtros.pagos.texto = e.target.value.toLowerCase();
        renderizarPagos();
    });
    document.getElementById('buscarProductos').addEventListener('input', (e) => {
        filtros.productos.texto = e.target.value.toLowerCase();
        renderizarProductos();
    });

    // Filtro de estatus
    document.getElementById('filtroEstatusFacturas').addEventListener('change', (e) => {
        filtros.facturas.estatus = e.target.value;
        renderizarFacturas();
    });

    // Chips de orden facturas
    document.querySelectorAll('#chipsOrdenFacturas .chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const campo = chip.dataset.orden;
            if (filtros.facturas.orden === campo) {
                filtros.facturas.direccion = filtros.facturas.direccion === 'asc' ? 'desc' : 'asc';
            } else {
                filtros.facturas.orden = campo;
                filtros.facturas.direccion = 'asc';
            }
            document.querySelectorAll('#chipsOrdenFacturas .chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            chip.textContent = chip.textContent.replace(/[↑↓]/g, '').trim() + (filtros.facturas.direccion === 'asc' ? ' ↑' : ' ↓');
            renderizarFacturas();
        });
    });

    // Chips de orden pagos
    document.querySelectorAll('#chipsOrdenPagos .chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const campo = chip.dataset.orden;
            if (filtros.pagos.orden === campo) {
                filtros.pagos.direccion = filtros.pagos.direccion === 'asc' ? 'desc' : 'asc';
            } else {
                filtros.pagos.orden = campo;
                filtros.pagos.direccion = 'desc';
            }
            document.querySelectorAll('#chipsOrdenPagos .chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            chip.textContent = chip.textContent.replace(/[↑↓]/g, '').trim() + (filtros.pagos.direccion === 'asc' ? ' ↑' : ' ↓');
            renderizarPagos();
        });
    });

    // Chips de orden productos
    document.querySelectorAll('#chipsOrdenProductos .chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const campo = chip.dataset.orden;
            if (filtros.productos.orden === campo) {
                filtros.productos.direccion = filtros.productos.direccion === 'asc' ? 'desc' : 'asc';
            } else {
                filtros.productos.orden = campo;
                filtros.productos.direccion = 'asc';
            }
            document.querySelectorAll('#chipsOrdenProductos .chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            chip.textContent = chip.textContent.replace(/[↑↓]/g, '').trim() + (filtros.productos.direccion === 'asc' ? ' ↑' : ' ↓');
            renderizarProductos();
        });
    });

    // FAB
    document.getElementById('fabNuevaFactura').addEventListener('click', () => abrirModalFactura());

    // Modal factura
    document.getElementById('btnCerrarModal').addEventListener('click', cerrarModalFactura);
    document.getElementById('btnCancelarFactura').addEventListener('click', cerrarModalFactura);
    document.getElementById('btnGuardarFactura').addEventListener('click', guardarFactura);

    // Modal productos
    document.getElementById('btnCerrarProductos').addEventListener('click', cerrarModalProductos);
    document.getElementById('btnCancelarProductos').addEventListener('click', cerrarModalProductos);
    document.getElementById('btnConfirmarProductos').addEventListener('click', confirmarProductos);
    document.getElementById('btnAplicarMargenGlobal').addEventListener('click', aplicarMargenGlobal);

    // Modal detalle
    document.getElementById('btnCerrarDetalle').addEventListener('click', () => {
        document.getElementById('modalDetalle').classList.add('hidden');
    });

    // Form factura
    document.getElementById('formSinNumero').addEventListener('change', (e) => {
        const input = document.getElementById('formNumeroFactura');
        if (e.target.checked) {
            input.value = 'S/N';
            input.disabled = true;
        } else {
            input.value = '';
            input.disabled = false;
        }
    });

    document.getElementById('formMontoUSD').addEventListener('input', actualizarEquivalente);

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.add('hidden');
        });
    });
}

function cambiarTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
    document.getElementById('seccionFacturas').classList.toggle('hidden', tab !== 'facturas');
    document.getElementById('seccionPagos').classList.toggle('hidden', tab !== 'pagos');
    document.getElementById('seccionInventario').classList.toggle('hidden', tab !== 'inventario');
    document.getElementById('fabNuevaFactura').classList.toggle('hidden', tab !== 'facturas');
}

// ============================================
// CARGAR DATOS
// ============================================
async function cargarDatos() {
    if (!supabaseClient) return;

    try {
        console.log("📥 Cargando datos desde Supabase...");

        const [facturasResp, pagosResp, productosResp] = await Promise.all([
            supabaseClient.from('facturas').select('*'),
            supabaseClient.from('pagos').select('*'),
            supabaseClient.from('productos').select('*')
        ]);

        if (facturasResp.error) throw facturasResp.error;
        if (pagosResp.error) throw pagosResp.error;
        if (productosResp.error) throw productosResp.error;

        datos.facturas = (facturasResp.data || []).map(dbToFactura);
        datos.pagos = (pagosResp.data || []).map(dbToPago);
        datos.productos = (productosResp.data || []).map(dbToProducto);

        console.log(`✅ Cargados: ${datos.facturas.length} facturas, ${datos.pagos.length} pagos, ${datos.productos.length} productos`);

        renderizarFacturas();
        renderizarPagos();
        renderizarProductos();
        actualizarEstadisticas();
        actualizarEstadisticasInventario();
        actualizarBadge();
    } catch (error) {
        console.error('❌ Error al cargar:', error);
        mostrarToast('Error al cargar datos', 'error');
    }
}

function dbToFactura(row) {
    return {
        id: row.id,
        fecha: row.fecha,
        proveedor: row.proveedor,
        numeroFactura: row.numero_factura || 'S/N',
        montoUSD: row.monto_usd != null ? String(row.monto_usd) : '',
        montoBs: row.monto_bs != null ? String(row.monto_bs) : '',
        tasaBCV: row.tasa_bcv,
        estatus: row.estatus || 'Pendiente',
        notas: row.notas || '',
        fechaPago: row.fecha_pago || '',
        montoPagoBs: row.monto_pago_bs,
        numeroReciboPago: row.numero_recibo_pago || '',
        productos: row.productos || []
    };
}

function dbToPago(row) {
    return {
        id: row.id,
        numeroRecibo: row.numero_recibo || 'N/A',
        fecha: row.fecha,
        beneficiario: row.beneficiario,
        cuentaAfectada: row.cuenta_afectada || '',
        cuentaBeneficiaria: row.cuenta_beneficiaria || '',
        monto: row.monto != null ? String(row.monto).replace('.', ',') : '0,00',
        montoUSD: row.monto_usd != null ? String(row.monto_usd) : '',
        tasaBCV: row.tasa_bcv,
        concepto: row.concepto || '',
        resultado: row.resultado || '',
        notas: row.notas || ''
    };
}

function dbToProducto(row) {
    return {
        id: row.id,
        nombre: row.nombre,
        nombreNormalizado: row.nombre_normalizado,
        codigoBarras: row.codigo_barras || '',
        stock: parseFloat(row.stock) || 0,
        unidad: row.unidad || 'UND',
        precioCompraUSD: parseFloat(row.precio_compra_usd) || 0,
        precioVentaUSD: parseFloat(row.precio_venta_usd) || 0,
        margen: parseFloat(row.margen) || 30,
        iva: parseFloat(row.iva) || 16,
        exento: row.exento || false,
        ultimoProveedor: row.ultimo_proveedor || '',
        ultimaFactura: row.ultima_factura || '',
        ultimaFecha: row.ultima_fecha || '',
        notas: row.notas || ''
    };
}

// ============================================
// TASA BCV
// ============================================
async function cargarTasa() {
    const info = document.getElementById('tasaInfo');
    info.textContent = 'Consultando tasa BCV...';

    const ultimaTasa = localStorage.getItem('ultimaTasaBCV');
    const ultimaFecha = localStorage.getItem('ultimaFechaBCV');
    if (ultimaTasa && ultimaFecha) {
        info.textContent = `💱 Tasa BCV: ${parseFloat(ultimaTasa).toFixed(2)} Bs/USD · ${ultimaFecha}`;
    }

    const apis = [
        { name: 'DolarAPI', url: 'https://ve.dolarapi.com/v1/dolares/oficial', parse: (d) => d && d.promedio ? { tasa: parseFloat(d.promedio), fecha: new Date() } : null },
        { name: 'Pydolarve', url: 'https://pydolarve.org/api/v1/dollar?page=bcv', parse: (d) => d && d.price ? { tasa: parseFloat(d.price), fecha: new Date() } : null },
        { name: 'CriptoYa', url: 'https://criptoya.com/api/dolaroficial', parse: (d) => d && d.bcv && d.bcv.price ? { tasa: parseFloat(d.bcv.price), fecha: new Date() } : null }
    ];

    for (const api of apis) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            const resp = await fetch(api.url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!resp.ok) continue;
            const data = await resp.json();
            const resultado = api.parse(data);

            if (resultado && resultado.tasa > 0) {
                tasaActual = resultado.tasa;
                const fechaStr = resultado.fecha.toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                localStorage.setItem('ultimaTasaBCV', tasaActual);
                localStorage.setItem('ultimaFechaBCV', fechaStr);
                info.textContent = `💱 Tasa BCV: ${tasaActual.toFixed(2)} Bs/USD · ${fechaStr}`;
                return;
            }
        } catch (e) { console.warn(`⚠️ ${api.name} falló`); }
    }

    if (ultimaTasa) {
        info.textContent = `💱 Tasa BCV: ${parseFloat(ultimaTasa).toFixed(2)} (guardada)`;
        tasaActual = parseFloat(ultimaTasa);
    } else {
        info.textContent = '⚠️ Tasa BCV no disponible';
    }
}

// ============================================
// CÁLCULO DE ESTATUS
// ============================================
function calcularEstatusReal(f) {
    if (f.estatus === 'Pagada') return 'Pagada';
    const [dia, mes, anio] = f.fecha.split('/').map(Number);
    const diff = Math.floor((new Date() - new Date(anio, mes - 1, dia)) / (1000 * 60 * 60 * 24));
    if (diff > DIAS_VENCIMIENTO) return 'Vencida';
    return 'Pendiente';
}

function diasDesdeFactura(f) {
    const [dia, mes, anio] = f.fecha.split('/').map(Number);
    return Math.floor((new Date() - new Date(anio, mes - 1, dia)) / (1000 * 60 * 60 * 24));
}

// ============================================
// FORMATOS
// ============================================
function formatearMontoBs(montoBs) {
    if (!montoBs) return "0,00";
    let str = String(montoBs).trim();
    let numero;
    if (str.includes(',') && str.includes('.')) numero = parseFloat(str.replace(/\./g, '').replace(',', '.'));
    else if (str.includes(',')) numero = parseFloat(str.replace(',', '.'));
    else numero = parseFloat(str);
    if (isNaN(numero)) return "0,00";
    let formateado = numero.toFixed(2);
    let [entero, decimal] = formateado.split('.');
    entero = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${entero},${decimal}`;
}

function parsearMontoBs(montoStr) {
    if (!montoStr) return 0;
    let str = String(montoStr).trim();
    let numero;
    if (str.includes(',') && str.includes('.')) numero = parseFloat(str.replace(/\./g, '').replace(',', '.'));
    else if (str.includes(',')) numero = parseFloat(str.replace(',', '.'));
    else numero = parseFloat(str);
    return isNaN(numero) ? 0 : numero;
}

function parsearFecha(fechaStr) {
    if (!fechaStr) return new Date(0);
    const [d, m, y] = fechaStr.split('/').map(Number);
    return new Date(y, m - 1, d);
}

function escapeHtml(texto) {
    if (!texto) return '';
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}

function getIconoEstatus(est) {
    if (est === 'Pagada') return '🟢';
    if (est === 'Vencida') return '🔴';
    return '🟡';
}

function normalizarNombre(nombre) {
    return String(nombre)
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quitar acentos
        .replace(/[^a-z0-9\s]/g, '') // Quitar símbolos
        .replace(/\s+/g, ' ')
        .trim();
}

// ============================================
// ORDENAR LISTA
// ============================================
function ordenarLista(lista, campo, direccion) {
    if (!direccion) return lista;
    const mult = direccion === 'asc' ? 1 : -1;

    return [...lista].sort((a, b) => {
        let valA, valB;

        if (campo === 'fecha') {
            valA = parsearFecha(a.fecha).getTime();
            valB = parsearFecha(b.fecha).getTime();
        } else if (campo === 'monto') {
            valA = parsearMontoBs(a.monto || a.montoBs);
            valB = parsearMontoBs(b.monto || b.montoBs);
        } else if (campo === 'montoUSD' || campo === 'precio_compra_usd' || campo === 'precio_venta_usd' || campo === 'margen' || campo === 'stock') {
            valA = parseFloat(a[campo]) || 0;
            valB = parseFloat(b[campo]) || 0;
        } else if (campo === 'dias') {
            valA = diasDesdeFactura(a);
            valB = diasDesdeFactura(b);
        } else if (campo === 'nombre' || campo === 'proveedor' || campo === 'beneficiario') {
            valA = (a[campo] || '').toLowerCase();
            valB = (b[campo] || '').toLowerCase();
            return valA.localeCompare(valB) * mult;
        }

        if (valA < valB) return -1 * mult;
        if (valA > valB) return 1 * mult;
        return 0;
    });
}

function ordenarFacturas(lista, campo, direccion) {
    const ordenadas = ordenarLista(lista, campo, direccion);
    if (filtros.facturas.estatus === 'activas') {
        const vencidas = ordenadas.filter(f => calcularEstatusReal(f) === 'Vencida');
        const pendientes = ordenadas.filter(f => calcularEstatusReal(f) === 'Pendiente');
        return [...vencidas, ...pendientes];
    }
    return ordenadas;
}

// ============================================
// RENDERIZAR FACTURAS
// ============================================
function renderizarFacturas() {
    const lista = document.getElementById('listaFacturas');
    let filtradas = [...datos.facturas];

    if (filtros.facturas.estatus === 'activas') {
        filtradas = filtradas.filter(f => {
            const est = calcularEstatusReal(f);
            return est === 'Vencida' || est === 'Pendiente';
        });
    } else if (filtros.facturas.estatus === 'vencidas') {
        filtradas = filtradas.filter(f => calcularEstatusReal(f) === 'Vencida');
    } else if (filtros.facturas.estatus === 'pendientes') {
        filtradas = filtradas.filter(f => calcularEstatusReal(f) === 'Pendiente');
    } else if (filtros.facturas.estatus === 'pagadas') {
        filtradas = filtradas.filter(f => calcularEstatusReal(f) === 'Pagada');
    }

    if (filtros.facturas.texto) {
        const t = filtros.facturas.texto;
        filtradas = filtradas.filter(f => 
            (f.proveedor || '').toLowerCase().includes(t) ||
            (f.numeroFactura || '').toLowerCase().includes(t) ||
            (f.notas || '').toLowerCase().includes(t)
        );
    }

    filtradas = ordenarFacturas(filtradas, filtros.facturas.orden, filtros.facturas.direccion);

    if (filtradas.length === 0) {
        lista.innerHTML = `<div class="vacio"><span class="vacio-icon">📋</span>No hay facturas que coincidan</div>`;
        return;
    }

    lista.innerHTML = filtradas.map(f => {
        const estatusReal = calcularEstatusReal(f);
        const dias = diasDesdeFactura(f);
        let diasInfo = '';
        if (estatusReal === 'Vencida') diasInfo = `${dias - DIAS_VENCIMIENTO}d vencida`;
        else if (estatusReal === 'Pendiente') diasInfo = `${DIAS_VENCIMIENTO - dias}d restantes`;
        else diasInfo = 'Pagada';
        
        const cantProductos = f.productos && f.productos.length > 0 ? `<span class="card-fecha">📦 ${f.productos.length} prod.</span>` : '';
        
        return `
            <div class="card-item estatus-${estatusReal}" data-id="${f.id}">
                <div class="card-header">
                    <div class="card-titulo">${escapeHtml(f.proveedor)}</div>
                    <span class="card-estatus estatus-tag-${estatusReal}">
                        ${getIconoEstatus(estatusReal)} ${estatusReal}
                    </span>
                </div>
                <div class="card-info">
                    <span class="card-fecha">📅 ${f.fecha} · Fact. ${f.numeroFactura}</span>
                    <span class="card-fecha">⏰ ${diasInfo}</span>
                </div>
                <div class="card-info">
                    <span class="card-monto">$${f.montoUSD || '0.00'}</span>
                    <span class="card-monto-bs">${formatearMontoBs(f.montoBs)} Bs</span>
                    ${cantProductos}
                </div>
                ${f.notas ? `<div class="card-notas">📝 ${escapeHtml(f.notas)}</div>` : ''}
            </div>
        `;
    }).join('');

    lista.querySelectorAll('.card-item').forEach(card => {
        card.addEventListener('click', () => {
            const id = parseInt(card.dataset.id);
            const factura = datos.facturas.find(f => f.id === id);
            if (factura) abrirDetalleFactura(factura);
        });
    });
}

// ============================================
// RENDERIZAR PAGOS
// ============================================
function renderizarPagos() {
    const lista = document.getElementById('listaPagos');
    let filtrados = [...datos.pagos];

    if (filtros.pagos.texto) {
        const t = filtros.pagos.texto;
        filtrados = filtrados.filter(p => 
            (p.beneficiario || '').toLowerCase().includes(t) ||
            (p.numeroRecibo || '').toLowerCase().includes(t) ||
            (p.notas || '').toLowerCase().includes(t)
        );
    }

    filtrados = ordenarLista(filtrados, filtros.pagos.orden, filtros.pagos.direccion);

    if (filtrados.length === 0) {
        lista.innerHTML = `<div class="vacio"><span class="vacio-icon">💸</span>No hay pagos que coincidan</div>`;
        return;
    }

    lista.innerHTML = filtrados.map(p => `
        <div class="card-item" data-id="${p.id}">
            <div class="card-header">
                <div class="card-titulo">${escapeHtml(p.beneficiario)}</div>
                <span class="card-fecha">${p.fecha}</span>
            </div>
            <div class="card-info">
                <span class="card-monto">${p.monto} Bs</span>
                <span class="card-monto-bs">$${p.montoUSD || '0.00'}</span>
            </div>
            ${p.numeroRecibo && p.numeroRecibo !== 'N/A' ? `<div class="card-info"><span class="card-fecha">Recibo: ${p.numeroRecibo}</span></div>` : ''}
            ${p.notas ? `<div class="card-notas">📝 ${escapeHtml(p.notas)}</div>` : ''}
        </div>
    `).join('');

    lista.querySelectorAll('.card-item').forEach(card => {
        card.addEventListener('click', () => {
            const id = parseInt(card.dataset.id);
            const pago = datos.pagos.find(p => p.id === id);
            if (pago) abrirDetallePago(pago);
        });
    });
}

// ============================================
// RENDERIZAR PRODUCTOS
// ============================================
function renderizarProductos() {
    const lista = document.getElementById('listaProductos');
    let filtrados = [...datos.productos];

    if (filtros.productos.texto) {
        const t = filtros.productos.texto;
        filtrados = filtrados.filter(p => 
            (p.nombre || '').toLowerCase().includes(t) ||
            (p.codigoBarras || '').toLowerCase().includes(t)
        );
    }

    filtrados = ordenarLista(filtrados, filtros.productos.orden, filtros.productos.direccion);

    if (filtrados.length === 0) {
        lista.innerHTML = `<div class="vacio"><span class="vacio-icon">📦</span>No hay productos en el inventario</div>`;
        return;
    }

    lista.innerHTML = filtrados.map(p => `
        <div class="card-item" data-id="${p.id}">
            <div class="card-header">
                <div class="card-titulo">${escapeHtml(p.nombre)}</div>
                <span class="card-estatus" style="background:#e7f3ff; color:#0056b3;">${p.stock} ${p.unidad}</span>
            </div>
            <div class="card-info">
                <span class="card-fecha">💵 Compra: $${p.precioCompraUSD.toFixed(2)}</span>
                <span class="card-fecha" style="color:#28a745; font-weight:700;">💰 Venta: $${p.precioVentaUSD.toFixed(2)}</span>
            </div>
            <div class="card-info">
                <span class="card-fecha">📊 Margen: ${p.margen}%</span>
                <span class="card-fecha">${p.exento ? '🚫 Exento' : `IVA: ${p.iva}%`}</span>
            </div>
            ${p.ultimoProveedor ? `<div class="card-info"><span class="card-fecha">🏢 ${escapeHtml(p.ultimoProveedor)}</span></div>` : ''}
        </div>
    `).join('');

    lista.querySelectorAll('.card-item').forEach(card => {
        card.addEventListener('click', () => {
            const id = parseInt(card.dataset.id);
            const producto = datos.productos.find(p => p.id === id);
            if (producto) abrirDetalleProducto(producto);
        });
    });
}

// ============================================
// ESTADÍSTICAS
// ============================================
function actualizarEstadisticas() {
    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();

    let pend = 0, venc = 0, pag = 0;
    let pendUSD = 0, pendBs = 0, vencUSD = 0, vencBs = 0, pagUSD = 0, pagBs = 0;

    datos.facturas.forEach(f => {
        const est = calcularEstatusReal(f);
        const usd = parseFloat(f.montoUSD) || 0;
        const bs = parsearMontoBs(f.montoBs);

        if (est === 'Pagada') { pag++; pagUSD += usd; pagBs += bs; }
        else if (est === 'Vencida') { venc++; vencUSD += usd; vencBs += bs; }
        else { pend++; pendUSD += usd; pendBs += bs; }
    });

    document.getElementById('statPendientes').textContent = pend;
    document.getElementById('statPendientesUSD').textContent = '$' + pendUSD.toFixed(2);
    document.getElementById('statPendientesBs').textContent = formatearMontoBs(pendBs) + ' Bs';

    document.getElementById('statVencidas').textContent = venc;
    document.getElementById('statVencidasUSD').textContent = '$' + vencUSD.toFixed(2);
    document.getElementById('statVencidasBs').textContent = formatearMontoBs(vencBs) + ' Bs';

    document.getElementById('statPagadas').textContent = pag;
    document.getElementById('statPagadasUSD').textContent = '$' + pagUSD.toFixed(2);
    document.getElementById('statPagadasBs').textContent = formatearMontoBs(pagBs) + ' Bs';

    let totalBs = 0, totalUSD = 0, mes = 0, mesBs = 0, mesUSD = 0;
    datos.pagos.forEach(p => {
        const bs = parsearMontoBs(p.monto);
        const usd = parseFloat(p.montoUSD) || 0;
        totalBs += bs; totalUSD += usd;
        const [d, m, y] = p.fecha.split('/').map(Number);
        if (m - 1 === mesActual && y === anioActual) { mes++; mesBs += bs; mesUSD += usd; }
    });

    document.getElementById('statTotalPagos').textContent = formatearMontoBs(totalBs) + ' Bs';
    document.getElementById('statTotalPagosUSD').textContent = '$' + totalUSD.toFixed(2);
    document.getElementById('statPagosMes').textContent = mes;
    document.getElementById('statPagosMesUSD').textContent = '$' + mesUSD.toFixed(2);
    document.getElementById('statPagosMesBs').textContent = formatearMontoBs(mesBs) + ' Bs';
}

function actualizarEstadisticasInventario() {
    let totalProductos = datos.productos.length;
    let valorTotal = 0;

    datos.productos.forEach(p => {
        valorTotal += (p.stock * p.precioCompraUSD);
    });

    document.getElementById('statTotalProductos').textContent = totalProductos;
    document.getElementById('statValorInventario').textContent = '$' + valorTotal.toFixed(2);
    document.getElementById('statValorInventarioBs').textContent = formatearMontoBs(valorTotal * (tasaActual || 0)) + ' Bs';
}

function actualizarBadge() {
    const vencidas = datos.facturas.filter(f => calcularEstatusReal(f) === 'Vencida').length;
    const badge = document.getElementById('badgeFacturas');
    if (vencidas > 0) {
        badge.textContent = vencidas;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// ============================================
// DETALLE FACTURA
// ============================================
function abrirDetalleFactura(f) {
    const estatusReal = calcularEstatusReal(f);
    const dias = diasDesdeFactura(f);

    let productosHtml = '';
    if (f.productos && f.productos.length > 0) {
        productosHtml = `
            <div class="detalle-row">
                <div class="detalle-label">Productos (${f.productos.length})</div>
                <div class="detalle-valor" style="font-size: 12px; margin-top: 6px;">
                    ${f.productos.map(p => `
                        <div style="padding: 6px 8px; background:#f8f9fa; border-radius:4px; margin-bottom:4px; display:flex; justify-content:space-between;">
                            <span>${escapeHtml(p.nombre)}</span>
                            <span style="color:#6c757d;">${p.cantidad} × $${parseFloat(p.precio_unitario || 0).toFixed(2)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    const html = `
        <div class="detalle-grid">
            <div class="detalle-row">
                <div class="detalle-label">Proveedor</div>
                <div class="detalle-valor">${escapeHtml(f.proveedor)}</div>
            </div>
            <div class="detalle-row">
                <div class="detalle-label">Monto USD</div>
                <div class="detalle-valor destacado">$${f.montoUSD || '0.00'}</div>
            </div>
            <div class="detalle-row">
                <div class="detalle-label">Monto en Bs</div>
                <div class="detalle-valor">${formatearMontoBs(f.montoBs)} Bs</div>
            </div>
            <div class="detalle-row">
                <div class="detalle-label">Fecha</div>
                <div class="detalle-valor">${f.fecha} (hace ${dias} días)</div>
            </div>
            <div class="detalle-row">
                <div class="detalle-label">N° Factura</div>
                <div class="detalle-valor">${f.numeroFactura || 'S/N'}</div>
            </div>
            <div class="detalle-row">
                <div class="detalle-label">Estatus</div>
                <div class="detalle-valor">${getIconoEstatus(estatusReal)} ${estatusReal}</div>
            </div>
            <div class="detalle-row">
                <div class="detalle-label">Tasa BCV usada</div>
                <div class="detalle-valor">${f.tasaBCV ? f.tasaBCV.toFixed(2) + ' Bs/USD' : 'N/A'}</div>
            </div>
            ${f.notas ? `
                <div class="detalle-row">
                    <div class="detalle-label">Notas</div>
                    <div class="detalle-notas">${escapeHtml(f.notas)}</div>
                </div>
            ` : ''}
            ${productosHtml}
        </div>
    `;

    document.getElementById('detalleTitulo').textContent = 'Detalle de Factura';
    document.getElementById('detalleContenido').innerHTML = html;

    let acciones = `<button class="btn btn-secondary" id="btnEditarDetalle">✏️ Editar</button>`;
    if (estatusReal !== 'Pagada') {
        acciones += `<button class="btn btn-primary" id="btnMarcarPagada">✅ Marcar Pagada</button>`;
    }
    acciones += `<button class="btn btn-danger" id="btnEliminarDetalle">🗑️</button>`;

    document.getElementById('detalleAcciones').innerHTML = acciones;

    document.getElementById('btnEditarDetalle').addEventListener('click', () => {
        document.getElementById('modalDetalle').classList.add('hidden');
        abrirModalFactura(f);
    });
    document.getElementById('btnEliminarDetalle').addEventListener('click', () => eliminarFactura(f));
    const btnPagar = document.getElementById('btnMarcarPagada');
    if (btnPagar) btnPagar.addEventListener('click', () => marcarPagada(f));

    document.getElementById('modalDetalle').classList.remove('hidden');
}

// ============================================
// DETALLE PAGO
// ============================================
function abrirDetallePago(p) {
    const html = `
        <div class="detalle-grid">
            <div class="detalle-row"><div class="detalle-label">Beneficiario</div><div class="detalle-valor">${escapeHtml(p.beneficiario)}</div></div>
            <div class="detalle-row"><div class="detalle-label">Monto</div><div class="detalle-valor destacado">${p.monto} Bs</div></div>
            <div class="detalle-row"><div class="detalle-label">Equivalente USD</div><div class="detalle-valor">$${p.montoUSD || '0.00'}</div></div>
            <div class="detalle-row"><div class="detalle-label">Fecha</div><div class="detalle-valor">${p.fecha}</div></div>
            <div class="detalle-row"><div class="detalle-label">N° Recibo</div><div class="detalle-valor">${p.numeroRecibo || 'N/A'}</div></div>
            <div class="detalle-row"><div class="detalle-label">Concepto</div><div class="detalle-valor">${p.concepto || 'N/A'}</div></div>
            <div class="detalle-row"><div class="detalle-label">Tasa BCV</div><div class="detalle-valor">${p.tasaBCV ? p.tasaBCV.toFixed(2) + ' Bs/USD' : 'N/A'}</div></div>
            ${p.notas ? `<div class="detalle-row"><div class="detalle-label">Notas</div><div class="detalle-notas">${escapeHtml(p.notas)}</div></div>` : ''}
        </div>
    `;

    document.getElementById('detalleTitulo').textContent = 'Detalle de Pago';
    document.getElementById('detalleContenido').innerHTML = html;
    document.getElementById('detalleAcciones').innerHTML = `<button class="btn btn-danger" id="btnEliminarPago">🗑️ Eliminar</button>`;
    document.getElementById('btnEliminarPago').addEventListener('click', () => eliminarPago(p));
    document.getElementById('modalDetalle').classList.remove('hidden');
}

// ============================================
// DETALLE PRODUCTO
// ============================================
function abrirDetalleProducto(p) {
    const html = `
        <div class="detalle-grid">
            <div class="detalle-row"><div class="detalle-label">Nombre</div><div class="detalle-valor">${escapeHtml(p.nombre)}</div></div>
            <div class="detalle-row"><div class="detalle-label">Stock</div><div class="detalle-valor destacado">${p.stock} ${p.unidad}</div></div>
            <div class="detalle-row"><div class="detalle-label">Precio Compra USD</div><div class="detalle-valor">$${p.precioCompraUSD.toFixed(2)}</div></div>
            <div class="detalle-row"><div class="detalle-label">Precio Venta USD</div><div class="detalle-valor destacado">$${p.precioVentaUSD.toFixed(2)}</div></div>
            <div class="detalle-row"><div class="detalle-label">Margen</div><div class="detalle-valor">${p.margen}%</div></div>
            <div class="detalle-row"><div class="detalle-label">IVA</div><div class="detalle-valor">${p.exento ? '🚫 Exento' : p.iva + '%'}</div></div>
            ${p.ultimoProveedor ? `<div class="detalle-row"><div class="detalle-label">Último Proveedor</div><div class="detalle-valor">${escapeHtml(p.ultimoProveedor)}</div></div>` : ''}
            ${p.ultimaFactura ? `<div class="detalle-row"><div class="detalle-label">Última Factura</div><div class="detalle-valor">${p.ultimaFactura}</div></div>` : ''}
        </div>
    `;

    document.getElementById('detalleTitulo').textContent = 'Detalle de Producto';
    document.getElementById('detalleContenido').innerHTML = html;
    document.getElementById('detalleAcciones').innerHTML = `
        <button class="btn btn-secondary" id="btnEditarProducto">✏️ Editar</button>
        <button class="btn btn-danger" id="btnEliminarProducto">🗑️</button>
    `;
    document.getElementById('btnEditarProducto').addEventListener('click', () => editarProducto(p));
    document.getElementById('btnEliminarProducto').addEventListener('click', () => eliminarProducto(p));
    document.getElementById('modalDetalle').classList.remove('hidden');
}

function editarProducto(p) {
    const nuevoNombre = prompt(`Nombre del producto:`, p.nombre);
    if (nuevoNombre === null) return;
    const nuevoStock = prompt(`Stock (${p.unidad}):`, p.stock);
    if (nuevoStock === null) return;
    const nuevoPrecioCompra = prompt(`Precio Compra USD:`, p.precioCompraUSD);
    if (nuevoPrecioCompra === null) return;
    const nuevoMargen = prompt(`Margen (%):`, p.margen);
    if (nuevoMargen === null) return;

    const margenNum = parseFloat(nuevoMargen) || 30;
    const precioCompraNum = parseFloat(nuevoPrecioCompra) || 0;
    const precioVenta = precioCompraNum * (1 + margenNum / 100);

    supabaseClient.from('productos').update({
        nombre: nuevoNombre,
        nombre_normalizado: normalizarNombre(nuevoNombre),
        stock: parseFloat(nuevoStock) || 0,
        precio_compra_usd: precioCompraNum,
        margen: margenNum,
        precio_venta_usd: parseFloat(precioVenta.toFixed(4)),
        updated_at: new Date().toISOString()
    }).eq('id', p.id).then(({ error }) => {
        if (error) {
            mostrarToast('Error al actualizar', 'error');
        } else {
            mostrarToast('✅ Producto actualizado', 'success');
            document.getElementById('modalDetalle').classList.add('hidden');
            cargarDatos();
        }
    });
}

async function eliminarProducto(p) {
    if (!confirm(`¿Eliminar "${p.nombre}" del inventario?`)) return;
    const { error } = await supabaseClient.from('productos').delete().eq('id', p.id);
    if (error) {
        mostrarToast('Error al eliminar', 'error');
    } else {
        mostrarToast('✅ Producto eliminado', 'success');
        document.getElementById('modalDetalle').classList.add('hidden');
        cargarDatos();
    }
}

// ============================================
// MODAL FACTURA
// ============================================
let facturaEditando = null;

function abrirModalFactura(factura = null) {
    facturaEditando = factura;
    const modal = document.getElementById('modalFactura');
    const titulo = document.getElementById('modalTitulo');

    const estadoFoto = document.getElementById('estadoFoto');
    const previewFoto = document.getElementById('previewFoto');
    if (estadoFoto) estadoFoto.style.display = 'none';
    if (previewFoto) previewFoto.style.display = 'none';
    // Reset productos detectados
    productosDetectados = [];
    facturaTemporalParaProductos = null;
    document.getElementById('previewProductos').classList.add('hidden');

    if (factura) {
        titulo.textContent = '✏️ Editar Factura';
        const [d, m, y] = factura.fecha.split('/');
        document.getElementById('formFecha').value = `${y}-${m}-${d}`;
        document.getElementById('formProveedor').value = factura.proveedor || '';
        document.getElementById('formNumeroFactura').value = factura.numeroFactura === 'S/N' ? '' : (factura.numeroFactura || '');
        document.getElementById('formSinNumero').checked = factura.numeroFactura === 'S/N';
        document.getElementById('formNumeroFactura').disabled = factura.numeroFactura === 'S/N';
        document.getElementById('formMontoUSD').value = factura.montoUSD || '';
        document.getElementById('formEstatus').value = factura.estatus || 'Pendiente';
        document.getElementById('formNotas').value = factura.notas || '';
    } else {
        titulo.textContent = '➕ Nueva Factura';
        document.getElementById('formFecha').valueAsDate = new Date();
        document.getElementById('formProveedor').value = '';
        document.getElementById('formNumeroFactura').value = '';
        document.getElementById('formSinNumero').checked = false;
        document.getElementById('formNumeroFactura').disabled = false;
        document.getElementById('formMontoUSD').value = '';
        document.getElementById('formEstatus').value = 'Pendiente';
        document.getElementById('formNotas').value = '';
    }

    actualizarEquivalente();
    modal.classList.remove('hidden');
}

function cerrarModalFactura() {
    document.getElementById('modalFactura').classList.add('hidden');
    facturaEditando = null;
}

function actualizarEquivalente() {
    const monto = parseFloat(document.getElementById('formMontoUSD').value);
    const equival = document.getElementById('equivalenteBs');
    if (!isNaN(monto) && tasaActual) {
        const bs = monto * tasaActual;
        equival.innerHTML = `💱 Equivalente en Bs: <strong>${formatearMontoBs(bs)} Bs</strong> (Tasa: ${tasaActual.toFixed(2)})`;
    } else {
        equival.textContent = '💱 Equivalente en Bs: --';
    }
}

async function guardarFactura() {
    const fecha = document.getElementById('formFecha').value;
    const proveedor = document.getElementById('formProveedor').value.trim();
    const numeroFactura = document.getElementById('formNumeroFactura').value.trim();
    const montoUSD = document.getElementById('formMontoUSD').value.trim();
    const estatus = document.getElementById('formEstatus').value;
    const notas = document.getElementById('formNotas').value.trim();

    if (!fecha || !proveedor || !montoUSD) {
        mostrarToast('Fecha, Proveedor y Monto son obligatorios', 'error');
        return;
    }

    const montoNum = parseFloat(montoUSD);
    if (isNaN(montoNum)) {
        mostrarToast('Monto inválido', 'error');
        return;
    }

    const montoBs = tasaActual ? (montoNum * tasaActual).toFixed(2) : null;
    const fechaFormato = fecha.split('-').reverse().join('/');

    const datosDB = {
        fecha: fechaFormato,
        proveedor: proveedor,
        numero_factura: numeroFactura || 'S/N',
        monto_usd: montoNum,
        monto_bs: montoBs ? parseFloat(montoBs) : null,
        tasa_bcv: tasaActual,
        estatus: estatus,
        notas: notas,
        productos: facturaEditando && facturaEditando.productos ? facturaEditando.productos : [],
        updated_at: new Date().toISOString()
    };

    try {
        if (facturaEditando) {
            const { error } = await supabaseClient.from('facturas').update(datosDB).eq('id', facturaEditando.id);
            if (error) throw error;
            mostrarToast('✅ Factura actualizada', 'success');
        } else {
            datosDB.id = Date.now();
            datosDB.created_at = new Date().toISOString();
            const { error } = await supabaseClient.from('facturas').insert([datosDB]);
            if (error) throw error;
            mostrarToast('✅ Factura creada', 'success');
        }
        cerrarModalFactura();
        cargarDatos();
    } catch (error) {
        console.error(error);
        mostrarToast('Error al guardar: ' + error.message, 'error');
    }
}

// ============================================
// ACCIONES
// ============================================
async function marcarPagada(factura) {
    if (!confirm(`¿Marcar como PAGADA la factura de ${factura.proveedor}?`)) return;
    try {
        const { error } = await supabaseClient.from('facturas').update({
            estatus: 'Pagada',
            fecha_pago: new Date().toLocaleDateString('es-VE'),
            updated_at: new Date().toISOString()
        }).eq('id', factura.id);
        if (error) throw error;
        mostrarToast('✅ Factura marcada como pagada', 'success');
        document.getElementById('modalDetalle').classList.add('hidden');
        cargarDatos();
    } catch (error) {
        mostrarToast('Error: ' + error.message, 'error');
    }
}

async function eliminarFactura(factura) {
    if (!confirm(`¿Eliminar la factura de ${factura.proveedor}?`)) return;
    try {
        const { error } = await supabaseClient.from('facturas').delete().eq('id', factura.id);
        if (error) throw error;
        mostrarToast('✅ Factura eliminada', 'success');
        document.getElementById('modalDetalle').classList.add('hidden');
        cargarDatos();
    } catch (error) {
        mostrarToast('Error: ' + error.message, 'error');
    }
}

async function eliminarPago(pago) {
    if (!confirm(`¿Eliminar el pago a ${pago.beneficiario}?`)) return;
    try {
        const { error } = await supabaseClient.from('pagos').delete().eq('id', pago.id);
        if (error) throw error;
        mostrarToast('✅ Pago eliminado', 'success');
        document.getElementById('modalDetalle').classList.add('hidden');
        cargarDatos();
    } catch (error) {
        mostrarToast('Error: ' + error.message, 'error');
    }
}

// ============================================
// OCR CON DEEPSEEK - FOTO DE FACTURA
// ============================================
function obtenerApiKeyDeepSeek() {
    let key = localStorage.getItem('deepseek_api_key');
    if (!key) {
        key = prompt(
            '🔑 CONFIGURACIÓN INICIAL\n\n' +
            'Para usar la función de foto con OCR, necesitas una API Key de DeepSeek.\n\n' +
            'Obtén una gratis en:\n' +
            'https://platform.deepseek.com\n\n' +
            'Pega tu API Key aquí (empieza con "sk-"):'
        );
        if (key && key.trim().startsWith('sk-')) {
            localStorage.setItem('deepseek_api_key', key.trim());
            return key.trim();
        } else if (key) {
            alert('⚠️ La API Key no parece válida. Debe empezar con "sk-".');
            return null;
        }
        return null;
    }
    return key;
}

function archivoABase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function extraerDatosConDeepSeek(base64Image) {
    const apiKey = obtenerApiKeyDeepSeek();
    if (!apiKey) throw new Error('API Key no configurada');

    const prompt = `Analiza esta imagen de una factura venezolana y extrae:
1. El nombre del proveedor (empresa emisora).
2. El monto total de la factura en dólares.
3. El número de factura.
4. La LISTA COMPLETA DE PRODUCTOS con: nombre, cantidad, unidad, precio unitario, IVA (16 o "E" si es exento).

Responde EXACTAMENTE en este formato JSON (sin texto adicional, sin markdown):

{
  "proveedor": "NOMBRE DEL PROVEEDOR",
  "monto_usd": 123.45,
  "numero_factura": "00123",
  "productos": [
    {
      "nombre": "LECHE ENTERA 1L",
      "cantidad": 24,
      "unidad": "UND",
      "precio_unitario": 2.50,
      "iva": 16,
      "exento": false
    },
    {
      "nombre": "QUESO BLANCO 500G",
      "cantidad": 12,
      "unidad": "KG",
      "precio_unitario": 4.20,
      "iva": "E",
      "exento": true
    }
  ],
  "confianza": "alta|media|baja"
}

Reglas:
- "proveedor": nombre de la empresa que emite la factura (no el cliente).
- "monto_usd": número sin comas, sin puntos de miles, con punto decimal.
- "numero_factura": número o código de la factura. Si no existe, null.
- "productos": array con TODOS los productos de la factura. Si no puedes leer los productos, devuelve array vacío [].
  - "nombre": descripción del producto en MAYÚSCULAS.
  - "cantidad": número decimal (ej: 24, 1.5).
  - "unidad": "UND" (unidad), "KG" (kilogramo), "LT" (litro), "CAJ" (caja), "PAQ" (paquete), "DOC" (docena), etc.
  - "precio_unitario": precio unitario en USD (sin IVA).
  - "iva": 16 si tiene IVA, "E" si es exento.
  - "exento": true si el producto está exento de IVA, false si no.
- Si NO puedes leer algún campo, usa null.
- Si la imagen no es una factura, devuelve {"proveedor": null, "monto_usd": null, "numero_factura": null, "productos": [], "confianza": "baja"}.`;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: base64Image } }
                ]
            }],
            max_tokens: 2500,
            temperature: 0.1
        })
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('Error DeepSeek:', error);
        throw new Error(`Error API (${response.status}). Verifica tu API Key y saldo.`);
    }

    const data = await response.json();
    const contenido = data.choices?.[0]?.message?.content || '';
    console.log('📝 Respuesta DeepSeek:', contenido);

    try {
        const match = contenido.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error('No se encontró JSON en la respuesta');
    } catch (e) {
        console.error('Error al parsear:', contenido);
        throw new Error('Respuesta inesperada de la IA');
    }
}

function configurarFotoFactura() {
    const btn = document.getElementById('btnTomarFoto');
    const input = document.getElementById('inputFoto');
    const estado = document.getElementById('estadoFoto');
    const previewDiv = document.getElementById('previewFoto');
    const imgPreview = document.getElementById('imgPreview');

    if (!btn) return;

    btn.addEventListener('click', () => input.click());

    input.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const urlImagen = URL.createObjectURL(file);
        imgPreview.src = urlImagen;
        previewDiv.style.display = 'block';

        estado.style.display = 'block';
        estado.textContent = '⏳ Procesando imagen con IA...';
        estado.style.color = '#17a2b8';

        try {
            const base64 = await archivoABase64(file);
            const datos = await extraerDatosConDeepSeek(base64);

            console.log('📦 Datos extraídos:', datos);

            // Rellenar campos básicos
            if (datos.proveedor) document.getElementById('formProveedor').value = datos.proveedor;
            if (datos.monto_usd) {
                document.getElementById('formMontoUSD').value = parseFloat(datos.monto_usd).toFixed(2);
                actualizarEquivalente();
            }
            if (datos.numero_factura) {
                const inputNum = document.getElementById('formNumeroFactura');
                const check = document.getElementById('formSinNumero');
                inputNum.value = datos.numero_factura;
                inputNum.disabled = false;
                check.checked = false;
            }

            // Guardar productos detectados
            productosDetectados = (datos.productos || []).map(p => ({
                nombre: p.nombre || '',
                cantidad: parseFloat(p.cantidad) || 1,
                unidad: p.unidad || 'UND',
                precio_unitario: parseFloat(p.precio_unitario) || 0,
                iva: p.iva === 'E' ? 'E' : (parseFloat(p.iva) || 16),
                exento: p.exento || p.iva === 'E' || false,
                margen: 30
            }));

            // Mostrar preview de productos en el modal de factura
            if (productosDetectados.length > 0) {
                const previewProd = document.getElementById('previewProductos');
                const listaPrev = document.getElementById('listaProductosPreview');
                listaPrev.innerHTML = productosDetectados.map(p => 
                    `<div style="padding:4px 0; border-bottom:1px solid #e0e0e0; display:flex; justify-content:space-between;">
                        <span>${escapeHtml(p.nombre)}</span>
                        <span style="color:#666;">${p.cantidad} × $${p.precio_unitario.toFixed(2)}</span>
                    </div>`
                ).join('');
                previewProd.classList.remove('hidden');
            }

            const confianza = datos.confianza || 'media';
            if (confianza === 'alta') {
                estado.textContent = `✅ ${productosDetectados.length} productos extraídos correctamente.`;
                estado.style.color = '#28a745';
            } else if (confianza === 'media') {
                estado.textContent = `⚠️ ${productosDetectados.length} productos extraídos. Verifica con cuidado.`;
                estado.style.color = '#ffc107';
            } else {
                estado.textContent = `⚠️ Confianza baja. Revisa todos los datos.`;
                estado.style.color = '#dc3545';
            }

            setTimeout(() => { estado.style.display = 'none'; }, 5000);
        } catch (error) {
            console.error('Error:', error);
            estado.textContent = `❌ ${error.message}`;
            estado.style.color = '#dc3545';
            setTimeout(() => { estado.style.display = 'none'; }, 8000);
        }

        event.target.value = '';
    });
}

// ============================================
// MODAL PRODUCTOS (Revisión antes de guardar)
// ============================================
function abrirModalProductos() {
    if (productosDetectados.length === 0) return;

    const container = document.getElementById('tablaProductosEdit');
    container.innerHTML = `
        <table class="tabla-productos-edit">
            <thead>
                <tr>
                    <th style="width: 35%;">Producto</th>
                    <th style="width: 12%;">Cant.</th>
                    <th style="width: 12%;">Unid.</th>
                    <th style="width: 13%;">P.Compra</th>
                    <th style="width: 10%;">IVA</th>
                    <th style="width: 13%;">P.Venta</th>
                    <th style="width: 5%;"></th>
                </tr>
            </thead>
            <tbody id="tbodyProductosEdit">
                ${productosDetectados.map((p, i) => filaProductoEditable(p, i)).join('')}
            </tbody>
        </table>
    `;

    adjuntarEventosProductos();
    document.getElementById('modalProductos').classList.remove('hidden');
}

function filaProductoEditable(p, index) {
    const precioVenta = p.precio_unitario * (1 + (p.margen || 30) / 100);
    return `
        <tr data-index="${index}">
            <td class="celda-nombre"><input type="text" data-field="nombre" value="${escapeHtml(p.nombre)}"></td>
            <td><input type="number" class="input-corto" data-field="cantidad" value="${p.cantidad}" step="0.01" min="0"></td>
            <td><input type="text" class="input-corto" data-field="unidad" value="${p.unidad}"></td>
            <td><input type="number" class="input-corto" data-field="precio_unitario" value="${p.precio_unitario}" step="0.01" min="0"></td>
            <td><input type="text" class="input-corto" data-field="iva" value="${p.iva}" style="text-align:center;"></td>
            <td><input type="number" class="input-corto precio-venta" data-field="precio_venta" value="${precioVenta.toFixed(2)}" step="0.01" min="0" readonly></td>
            <td style="text-align:center;"><button class="btn-eliminar-prod" data-eliminar="${index}">✕</button></td>
        </tr>
    `;
}

function adjuntarEventosProductos() {
    const tbody = document.getElementById('tbodyProductosEdit');

    tbody.querySelectorAll('tr').forEach(tr => {
        const index = parseInt(tr.dataset.index);

        tr.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', (e) => {
                const field = e.target.dataset.field;
                let valor = e.target.value;

                if (field === 'cantidad' || field === 'precio_unitario') {
                    valor = parseFloat(valor) || 0;
                } else if (field === 'iva') {
                    if (valor.toUpperCase() === 'E') {
                        productosDetectados[index].exento = true;
                        productosDetectados[index].iva = 'E';
                    } else {
                        productosDetectados[index].exento = false;
                        productosDetectados[index].iva = parseFloat(valor) || 16;
                    }
                }

                productosDetectados[index][field] = valor;

                // Recalcular precio de venta
                if (field === 'precio_unitario') {
                    const margen = productosDetectados[index].margen || 30;
                    const pv = productosDetectados[index].precio_unitario * (1 + margen / 100);
                    tr.querySelector('[data-field="precio_venta"]').value = pv.toFixed(2);
                }
            });
        });
    });

    tbody.querySelectorAll('[data-eliminar]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.eliminar);
            productosDetectados.splice(index, 1);
            abrirModalProductos(); // Re-render
        });
    });
}

function aplicarMargenGlobal() {
    const margen = parseFloat(document.getElementById('margenGlobal').value) || 30;

    productosDetectados.forEach(p => {
        p.margen = margen;
    });

    // Re-render
    const tbody = document.getElementById('tbodyProductosEdit');
    tbody.innerHTML = productosDetectados.map((p, i) => filaProductoEditable(p, i)).join('');
    adjuntarEventosProductos();
    mostrarToast(`✅ Margen ${margen}% aplicado a ${productosDetectados.length} productos`, 'success');
}

function cerrarModalProductos() {
    document.getElementById('modalProductos').classList.add('hidden');
}

async function confirmarProductos() {
    if (productosDetectados.length === 0) {
        mostrarToast('No hay productos para guardar', 'error');
        return;
    }

    const proveedor = document.getElementById('formProveedor').value.trim();
    const numeroFactura = document.getElementById('formNumeroFactura').value.trim();

    mostrarToast('⏳ Guardando productos...', 'info');

    let agregados = 0, actualizados = 0;

    for (const prod of productosDetectados) {
        if (!prod.nombre || prod.nombre.trim() === '') continue;

        const nombreNorm = normalizarNombre(prod.nombre);

        // Buscar producto existente
        const { data: existentes } = await supabaseClient
            .from('productos')
            .select('*')
            .eq('nombre_normalizado', nombreNorm)
            .limit(1);

        const precioVenta = prod.precio_unitario * (1 + (prod.margen || 30) / 100);

        if (existentes && existentes.length > 0) {
            // Sumar al stock existente
            const existente = existentes[0];
            const nuevoStock = parseFloat(existente.stock || 0) + parseFloat(prod.cantidad || 0);

            await supabaseClient.from('productos').update({
                stock: nuevoStock,
                precio_compra_usd: prod.precio_unitario,
                precio_venta_usd: parseFloat(precioVenta.toFixed(4)),
                margen: prod.margen || 30,
                iva: prod.exento ? 0 : (parseFloat(prod.iva) || 16),
                exento: prod.exento || false,
                ultimo_proveedor: proveedor,
                ultima_factura: numeroFactura,
                ultima_fecha: new Date().toLocaleDateString('es-VE'),
                updated_at: new Date().toISOString()
            }).eq('id', existente.id);

            actualizados++;
        } else {
            // Crear nuevo producto
            await supabaseClient.from('productos').insert([{
                id: Date.now() + Math.floor(Math.random() * 1000),
                nombre: prod.nombre,
                nombre_normalizado: nombreNorm,
                stock: prod.cantidad,
                unidad: prod.unidad || 'UND',
                precio_compra_usd: prod.precio_unitario,
                precio_venta_usd: parseFloat(precioVenta.toFixed(4)),
                margen: prod.margen || 30,
                iva: prod.exento ? 0 : (parseFloat(prod.iva) || 16),
                exento: prod.exento || false,
                ultimo_proveedor: proveedor,
                ultima_factura: numeroFactura,
                ultima_fecha: new Date().toLocaleDateString('es-VE'),
                created_at: new Date().toISOString()
            }]);

            agregados++;
        }
    }

    // Guardar los productos en la factura (si estamos editando o guardando)
    facturaTemporalParaProductos = productosDetectados.map(p => ({
        nombre: p.nombre,
        cantidad: p.cantidad,
        unidad: p.unidad,
        precio_unitario: p.precio_unitario,
        iva: p.iva,
        exento: p.exento,
        margen: p.margen,
        precio_venta: p.precio_unitario * (1 + (p.margen || 30) / 100)
    }));

    mostrarToast(`✅ ${agregados} nuevos, ${actualizados} actualizados`, 'success');
    cerrarModalProductos();

    // Recargar datos
    await cargarDatos();

    // Guardar los productos en la factura actual
    if (facturaEditando) {
        // Si estamos editando, actualizar los productos en la factura
        await supabaseClient.from('facturas').update({
            productos: facturaTemporalParaProductos
        }).eq('id', facturaEditando.id);
        cargarDatos();
    } else {
        // Si es nueva, los guardamos cuando se guarde la factura (en guardarFactura)
        // Solo mostramos aviso
        mostrarToast(`ℹ️ Ahora guarda la factura para vincular los productos`, 'info');
    }
}

// ============================================
// TOAST
// ============================================
function mostrarToast(mensaje, tipo = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = mensaje;
    toast.className = 'toast ' + tipo;
    toast.classList.remove('hidden');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}
