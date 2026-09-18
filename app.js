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

let datos = { facturas: [], pagos: [] };
let filtros = { 
    facturas: { texto: '', estatus: 'activas', orden: 'fecha', direccion: 'asc' },
    pagos: { texto: '', orden: 'fecha', direccion: 'desc' }
};
let tasaActual = null;

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
    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => cambiarTab(tab.dataset.tab));
    });

    // Refresh
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

    // Filtro de estatus (facturas)
    document.getElementById('filtroEstatusFacturas').addEventListener('change', (e) => {
        filtros.facturas.estatus = e.target.value;
        renderizarFacturas();
    });

    // Chips de orden (facturas)
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

    // Chips de orden (pagos)
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

    // FAB
    document.getElementById('fabNuevaFactura').addEventListener('click', () => abrirModalFactura());

    // Modal factura
    document.getElementById('btnCerrarModal').addEventListener('click', cerrarModalFactura);
    document.getElementById('btnCancelarFactura').addEventListener('click', cerrarModalFactura);
    document.getElementById('btnGuardarFactura').addEventListener('click', guardarFactura);

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

    // Cerrar modal al tocar overlay
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
    document.getElementById('fabNuevaFactura').classList.toggle('hidden', tab !== 'facturas');
}

// ============================================
// CARGAR DATOS
// ============================================
async function cargarDatos() {
    if (!supabaseClient) return;

    try {
        console.log("📥 Cargando datos desde Supabase...");

        const facturasResp = await supabaseClient.from('facturas').select('*');
        if (facturasResp.error) throw facturasResp.error;

        const pagosResp = await supabaseClient.from('pagos').select('*');
        if (pagosResp.error) throw pagosResp.error;

        datos.facturas = (facturasResp.data || []).map(dbToFactura);
        datos.pagos = (pagosResp.data || []).map(dbToPago);

        console.log(`✅ Cargados: ${datos.facturas.length} facturas, ${datos.pagos.length} pagos`);

        renderizarFacturas();
        renderizarPagos();
        actualizarEstadisticas();
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
        numeroReciboPago: row.numero_recibo_pago || ''
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
        {
            name: 'DolarAPI',
            url: 'https://ve.dolarapi.com/v1/dolares/oficial',
            parse: (data) => data && data.promedio ? { tasa: parseFloat(data.promedio), fecha: new Date() } : null
        },
        {
            name: 'Pydolarve',
            url: 'https://pydolarve.org/api/v1/dollar?page=bcv',
            parse: (data) => data && data.price ? { tasa: parseFloat(data.price), fecha: new Date() } : null
        },
        {
            name: 'CriptoYa',
            url: 'https://criptoya.com/api/dolaroficial',
            parse: (data) => data && data.bcv && data.bcv.price ? { tasa: parseFloat(data.bcv.price), fecha: new Date() } : null
        }
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
                const fechaStr = resultado.fecha.toLocaleString('es-VE', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                });
                localStorage.setItem('ultimaTasaBCV', tasaActual);
                localStorage.setItem('ultimaFechaBCV', fechaStr);
                info.textContent = `💱 Tasa BCV: ${tasaActual.toFixed(2)} Bs/USD · ${fechaStr}`;
                console.log(`✅ Tasa obtenida de ${api.name}:`, tasaActual);
                return;
            }
        } catch (e) {
            console.warn(`⚠️ ${api.name} falló: ${e.message}`);
        }
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
    const fechaFactura = new Date(anio, mes - 1, dia);
    const diffDias = Math.floor((new Date() - fechaFactura) / (1000 * 60 * 60 * 24));
    
    if (diffDias > DIAS_VENCIMIENTO) return 'Vencida';
    return 'Pendiente';
}

function diasDesdeFactura(f) {
    const [dia, mes, anio] = f.fecha.split('/').map(Number);
    const fechaFactura = new Date(anio, mes - 1, dia);
    return Math.floor((new Date() - fechaFactura) / (1000 * 60 * 60 * 24));
}

// ============================================
// FORMATOS
// ============================================
function formatearMontoBs(montoBs) {
    if (!montoBs) return "0,00";
    let str = String(montoBs).trim();
    let numero;
    if (str.includes(',') && str.includes('.')) {
        numero = parseFloat(str.replace(/\./g, '').replace(',', '.'));
    } else if (str.includes(',')) {
        numero = parseFloat(str.replace(',', '.'));
    } else {
        numero = parseFloat(str);
    }
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
    if (str.includes(',') && str.includes('.')) {
        numero = parseFloat(str.replace(/\./g, '').replace(',', '.'));
    } else if (str.includes(',')) {
        numero = parseFloat(str.replace(',', '.'));
    } else {
        numero = parseFloat(str);
    }
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

// ============================================
// ORDENAR LISTA (genérico)
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
        } else if (campo === 'montoUSD') {
            valA = parseFloat(a.montoUSD) || 0;
            valB = parseFloat(b.montoUSD) || 0;
        } else if (campo === 'dias') {
            valA = diasDesdeFactura(a);
            valB = diasDesdeFactura(b);
        } else if (campo === 'proveedor' || campo === 'beneficiario') {
            valA = (a[campo] || '').toLowerCase();
            valB = (b[campo] || '').toLowerCase();
            return valA.localeCompare(valB) * mult;
        }

        if (valA < valB) return -1 * mult;
        if (valA > valB) return 1 * mult;
        return 0;
    });
}

// ✅ Ordenamiento específico para FACTURAS: vencidas primero
function ordenarFacturas(lista, campo, direccion) {
    const ordenadas = ordenarLista(lista, campo, direccion);
    
    // Si el filtro es "activas" (vencidas + pendientes), las vencidas van primero
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

    // Filtro de estatus
    if (filtros.facturas.estatus === 'activas') {
        // Vencidas + Pendientes (excluye Pagadas)
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
    // Si es 'todas', no filtra

    // Filtro de texto
    if (filtros.facturas.texto) {
        const t = filtros.facturas.texto;
        filtradas = filtradas.filter(f => 
            (f.proveedor || '').toLowerCase().includes(t) ||
            (f.numeroFactura || '').toLowerCase().includes(t) ||
            (f.notas || '').toLowerCase().includes(t)
        );
    }

    // Ordenar (vencidas primero cuando aplica)
    filtradas = ordenarFacturas(filtradas, filtros.facturas.orden, filtros.facturas.direccion);

    if (filtradas.length === 0) {
        lista.innerHTML = `
            <div class="vacio">
                <span class="vacio-icon">📋</span>
                No hay facturas que coincidan
            </div>`;
        return;
    }

    lista.innerHTML = filtradas.map(f => {
        const estatusReal = calcularEstatusReal(f);
        const dias = diasDesdeFactura(f);
        
        let diasInfo = '';
        if (estatusReal === 'Vencida') {
            diasInfo = `${dias - DIAS_VENCIMIENTO}d vencida`;
        } else if (estatusReal === 'Pendiente') {
            diasInfo = `${DIAS_VENCIMIENTO - dias}d restantes`;
        } else {
            diasInfo = 'Pagada';
        }
        
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

    // Búsqueda
    if (filtros.pagos.texto) {
        const t = filtros.pagos.texto;
        filtrados = filtrados.filter(p => 
            (p.beneficiario || '').toLowerCase().includes(t) ||
            (p.numeroRecibo || '').toLowerCase().includes(t) ||
            (p.notas || '').toLowerCase().includes(t)
        );
    }

    // Ordenar
    filtrados = ordenarLista(filtrados, filtros.pagos.orden, filtros.pagos.direccion);

    if (filtrados.length === 0) {
        lista.innerHTML = `
            <div class="vacio">
                <span class="vacio-icon">💸</span>
                No hay pagos que coincidan
            </div>`;
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
// ESTADÍSTICAS
// ============================================
function actualizarEstadisticas() {
    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();

    // Facturas
    let pend = 0, venc = 0, pag = 0;
    let pendUSD = 0, pendBs = 0;
    let vencUSD = 0, vencBs = 0;
    let pagUSD = 0, pagBs = 0;

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

    // Pagos
    let totalBs = 0, totalUSD = 0;
    let mes = 0, mesBs = 0, mesUSD = 0;

    datos.pagos.forEach(p => {
        const bs = parsearMontoBs(p.monto);
        const usd = parseFloat(p.montoUSD) || 0;
        totalBs += bs;
        totalUSD += usd;

        const [d, m, y] = p.fecha.split('/').map(Number);
        if (m - 1 === mesActual && y === anioActual) {
            mes++;
            mesBs += bs;
            mesUSD += usd;
        }
    });

    document.getElementById('statTotalPagos').textContent = formatearMontoBs(totalBs) + ' Bs';
    document.getElementById('statTotalPagosUSD').textContent = '$' + totalUSD.toFixed(2);

    document.getElementById('statPagosMes').textContent = mes;
    document.getElementById('statPagosMesUSD').textContent = '$' + mesUSD.toFixed(2);
    document.getElementById('statPagosMesBs').textContent = formatearMontoBs(mesBs) + ' Bs';
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
                <div class="detalle-label">Fecha de factura</div>
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
            <div class="detalle-row">
                <div class="detalle-label">Beneficiario</div>
                <div class="detalle-valor">${escapeHtml(p.beneficiario)}</div>
            </div>
            <div class="detalle-row">
                <div class="detalle-label">Monto</div>
                <div class="detalle-valor destacado">${p.monto} Bs</div>
            </div>
            <div class="detalle-row">
                <div class="detalle-label">Equivalente USD</div>
                <div class="detalle-valor">$${p.montoUSD || '0.00'}</div>
            </div>
            <div class="detalle-row">
                <div class="detalle-label">Fecha</div>
                <div class="detalle-valor">${p.fecha}</div>
            </div>
            <div class="detalle-row">
                <div class="detalle-label">N° Recibo</div>
                <div class="detalle-valor">${p.numeroRecibo || 'N/A'}</div>
            </div>
            <div class="detalle-row">
                <div class="detalle-label">Concepto</div>
                <div class="detalle-valor">${p.concepto || 'N/A'}</div>
            </div>
            <div class="detalle-row">
                <div class="detalle-label">Tasa BCV</div>
                <div class="detalle-valor">${p.tasaBCV ? p.tasaBCV.toFixed(2) + ' Bs/USD' : 'N/A'}</div>
            </div>
            ${p.notas ? `
                <div class="detalle-row">
                    <div class="detalle-label">Notas</div>
                    <div class="detalle-notas">${escapeHtml(p.notas)}</div>
                </div>
            ` : ''}
        </div>
    `;

    document.getElementById('detalleTitulo').textContent = 'Detalle de Pago';
    document.getElementById('detalleContenido').innerHTML = html;
    document.getElementById('detalleAcciones').innerHTML = `
        <button class="btn btn-danger" id="btnEliminarPago">🗑️ Eliminar</button>
    `;

    document.getElementById('btnEliminarPago').addEventListener('click', () => eliminarPago(p));

    document.getElementById('modalDetalle').classList.remove('hidden');
}

// ============================================
// MODAL FACTURA
// ============================================
let facturaEditando = null;

function abrirModalFactura(factura = null) {
    facturaEditando = factura;
    const modal = document.getElementById('modalFactura');
    const titulo = document.getElementById('modalTitulo');

    // Reset del estado de la foto
    const estadoFoto = document.getElementById('estadoFoto');
    const previewFoto = document.getElementById('previewFoto');
    if (estadoFoto) estadoFoto.style.display = 'none';
    if (previewFoto) previewFoto.style.display = 'none';

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
// FOTO DE FACTURA CON OCR (DeepSeek Vision)
// ============================================

// Obtener/guardar API Key en localStorage
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

// Convertir archivo de imagen a base64
function archivoABase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Extraer datos con DeepSeek Vision
async function extraerDatosConDeepSeek(base64Image) {
    const apiKey = obtenerApiKeyDeepSeek();
    if (!apiKey) {
        throw new Error('API Key no configurada');
    }

    const prompt = `Analiza esta imagen de una factura venezolana y extrae el nombre del proveedor (empresa emisora), el monto total y el número de factura.

Responde EXACTAMENTE en este formato JSON (sin texto adicional, sin markdown, sin comentarios):

{
  "proveedor": "NOMBRE DEL PROVEEDOR",
  "monto_usd": 123.45,
  "numero_factura": "00123",
  "confianza": "alta|media|baja"
}

Reglas:
- "proveedor" debe ser el nombre de la empresa que emite la factura (no el cliente).
- "monto_usd" debe ser un número sin comas, sin puntos de miles, con punto decimal. Si el monto está en bolívares, conviértelo a USD usando la tasa que aparezca en la factura; si no aparece, devuelve el monto en bolívares como número decimal.
- "numero_factura" debe ser el número, código o referencia de la factura (puede contener letras y números). Busca etiquetas como "Factura N°", "Nro.", "Invoice", "N°", "Control", "Recibo" o simplemente un número destacado en la parte superior. Si no hay número visible, devuelve null.
- Si NO puedes leer algún campo, usa null.
- Si el campo está borroso o ilegible, márcalo como null y pon "confianza": "baja".
- Si la imagen no es una factura, devuelve {"proveedor": null, "monto_usd": null, "numero_factura": null, "confianza": "baja"}.`;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: base64Image } }
                    ]
                }
            ],
            max_tokens: 300,
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
        if (match) {
            const parsed = JSON.parse(match[0]);
            return parsed;
        }
        throw new Error('No se encontró JSON en la respuesta');
    } catch (e) {
        console.error('Error al parsear respuesta:', contenido);
        throw new Error('Respuesta inesperada de la IA');
    }
}

// Configurar el botón de foto
function configurarFotoFactura() {
    const btn = document.getElementById('btnTomarFoto');
    const input = document.getElementById('inputFoto');
    const estado = document.getElementById('estadoFoto');
    const previewDiv = document.getElementById('previewFoto');
    const imgPreview = document.getElementById('imgPreview');

    if (!btn) return;

    btn.addEventListener('click', () => {
        input.click();
    });

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

            // Rellenar el formulario
            if (datos.proveedor) {
                document.getElementById('formProveedor').value = datos.proveedor;
            }
            if (datos.monto_usd) {
                document.getElementById('formMontoUSD').value = parseFloat(datos.monto_usd).toFixed(2);
                actualizarEquivalente();
            }
            if (datos.numero_factura) {
                const inputNumero = document.getElementById('formNumeroFactura');
                const checkSinNumero = document.getElementById('formSinNumero');
                inputNumero.value = datos.numero_factura;
                inputNumero.disabled = false;
                checkSinNumero.checked = false;
            }

            const confianza = datos.confianza || 'media';
            if (confianza === 'alta') {
                estado.textContent = '✅ Datos extraídos correctamente. Revisa y ajusta si es necesario.';
                estado.style.color = '#28a745';
            } else if (confianza === 'media') {
                estado.textContent = '⚠️ Datos extraídos con confianza media. Verifica con cuidado.';
                estado.style.color = '#ffc107';
            } else {
                estado.textContent = '⚠️ Confianza baja. Revisa y completa los datos manualmente.';
                estado.style.color = '#dc3545';
            }

            setTimeout(() => {
                estado.style.display = 'none';
            }, 5000);

        } catch (error) {
            console.error('Error al procesar foto:', error);
            estado.textContent = `❌ ${error.message}`;
            estado.style.color = '#dc3545';
            setTimeout(() => {
                estado.style.display = 'none';
            }, 8000);
        }

        event.target.value = '';
    });
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
