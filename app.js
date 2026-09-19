// ============================================
// GESTORE PWA - Lógica principal
// ============================================

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

let productosDetectados = [];
let facturaTemporalParaProductos = null;
let productoEditando = null;
let pagoEditando = null;

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Gestore PWA iniciado");
    configurarEventos();
    cargarTasa();
    cargarDatos();
    configurarFotoFactura();
    document.getElementById('fabNuevaFactura').classList.remove('hidden');
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

    document.getElementById('filtroEstatusFacturas').addEventListener('change', (e) => {
        filtros.facturas.estatus = e.target.value;
        renderizarFacturas();
    });

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

    document.getElementById('fabNuevaFactura').addEventListener('click', () => abrirModalFactura());

    document.getElementById('btnCerrarModal').addEventListener('click', cerrarModalFactura);
    document.getElementById('btnCancelarFactura').addEventListener('click', cerrarModalFactura);
    document.getElementById('btnGuardarFactura').addEventListener('click', guardarFactura);

    document.getElementById('btnCerrarProductos').addEventListener('click', cerrarModalProductos);
    document.getElementById('btnCancelarProductos').addEventListener('click', cerrarModalProductos);
    document.getElementById('btnConfirmarProductos').addEventListener('click', confirmarProductos);
    document.getElementById('btnAplicarMargenGlobal').addEventListener('click', aplicarMargenGlobal);

    document.getElementById('btnCerrarDetalle').addEventListener('click', () => {
        document.getElementById('modalDetalle').classList.add('hidden');
    });

    // Modal editar producto
    document.getElementById('btnCerrarEditarProducto').addEventListener('click', cerrarModalEditarProducto);
    document.getElementById('btnCancelarEditarProducto').addEventListener('click', cerrarModalEditarProducto);
    document.getElementById('btnGuardarEditarProducto').addEventListener('click', guardarEditarProducto);
    document.getElementById('btnEliminarEditarProducto').addEventListener('click', eliminarProductoDesdeModal);

    // Cálculo automático del precio de venta
    document.getElementById('editPrecioCompra').addEventListener('input', recalcularPrecioVenta);
    document.getElementById('editPrecioCompra').addEventListener('change', recalcularPrecioVenta);
    document.getElementById('editMargen').addEventListener('input', recalcularPrecioVenta);
    document.getElementById('editMargen').addEventListener('change', recalcularPrecioVenta);
    document.getElementById('editUnidadesCaja').addEventListener('input', recalcularPrecioVenta);
    document.getElementById('editUnidadesCaja').addEventListener('change', recalcularPrecioVenta);
    
    document.getElementById('editPrecioCaja').addEventListener('input', () => {
        const precioCaja = parseFloat(document.getElementById('editPrecioCaja').value) || 0;
        if (precioCaja > 0) {
            document.getElementById('editPrecioCompra').value = precioCaja;
            recalcularPrecioVenta();
        }
    });

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

    // Convertir Bs a USD en el formulario de factura
    document.getElementById('formMontoBs').addEventListener('input', convertirBsAUSD);
    document.getElementById('formMontoUSD').addEventListener('input', actualizarEquivalente);

    // Captura de pago
    document.getElementById('btnSubirCapturaPago').addEventListener('click', () => {
        document.getElementById('inputFotoPago').click();
    });
    document.getElementById('inputFotoPago').addEventListener('change', procesarCapturaPago);
    
    // Modal de confirmar pago
    document.getElementById('btnCerrarConfirmarPago').addEventListener('click', cerrarModalConfirmarPago);
    document.getElementById('btnCancelarConfirmarPago').addEventListener('click', cerrarModalConfirmarPago);
    document.getElementById('btnGuardarPago').addEventListener('click', guardarPagoDesdeCaptura);
    document.getElementById('pagoMontoBs').addEventListener('input', actualizarEquivalentePago);

    // Modal editar pago
    document.getElementById('btnCerrarEditarPago').addEventListener('click', cerrarModalEditarPago);
    document.getElementById('btnCancelarEditarPago').addEventListener('click', cerrarModalEditarPago);
    document.getElementById('btnGuardarEditarPago').addEventListener('click', guardarEditarPago);
    document.getElementById('btnEliminarPagoDesdeModal').addEventListener('click', eliminarPagoDesdeModal);
    document.getElementById('editPagoMontoBs').addEventListener('input', actualizarEquivalenteEditPago);

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
        notas: row.notas || '',
        tipoPago: row.tipo_pago || 'transferencia',
        bancoReceptor: row.banco_receptor || '',
        cedulaReceptor: row.cedula_receptor || '',
        telefonoReceptor: row.telefono_receptor || '',
        nombreReceptor: row.nombre_receptor || ''
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
        unidadesCaja: parseFloat(row.unidades_caja) || 0,
        precioCajaUSD: parseFloat(row.precio_caja_usd) || 0,
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
// TASA BCV - PRIORIZA JUSTCARLUX, RESPALDO DOLARAPI
// ============================================
async function cargarTasa() {
    const info = document.getElementById('tasaInfo');
    info.textContent = 'Consultando tasa BCV...';

    const ultimaTasa = localStorage.getItem('ultimaTasaBCV');
    const ultimaFecha = localStorage.getItem('ultimaFechaBCV');
    
    if (ultimaTasa && ultimaFecha) {
        info.textContent = `💱 Tasa BCV: ${parseFloat(ultimaTasa).toFixed(2)} Bs/USD · ${ultimaFecha} (actualizando...)`;
        tasaActual = parseFloat(ultimaTasa);
    }

    // ==========================================
    // 1. Intentar JUSTCARLUX con timeout largo (15 seg)
    // ==========================================
    try {
        console.log('🌐 Consultando BCV Oficial (justcarlux)...');
        const url = 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://bcv.justcarlux.dev/api/v1/rates');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const resp = await fetch(url, { 
            signal: controller.signal,
            cache: 'no-cache'
        });
        clearTimeout(timeoutId);

        if (resp.ok) {
            const data = await resp.json();
            if (data && data.rates && data.rates.usd) {
                const tasa = parseFloat(data.rates.usd);
                const fecha = data.updatedAt ? new Date(data.updatedAt) : new Date();
                const fechaStr = fecha.toLocaleString('es-VE', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric',
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                
                console.log(`✅ justcarlux: ${tasa} (${fechaStr})`);
                
                const tasaAnterior = ultimaTasa ? parseFloat(ultimaTasa) : null;
                const cambio = tasaAnterior && Math.abs(tasaAnterior - tasa) > 0.01;

                tasaActual = tasa;
                localStorage.setItem('ultimaTasaBCV', tasaActual);
                localStorage.setItem('ultimaFechaBCV', fechaStr);
                localStorage.setItem('ultimaTasaTimestamp', Date.now().toString());
                
                info.textContent = `💱 Tasa BCV: ${tasaActual.toFixed(2)} Bs/USD · ${fechaStr}`;
                console.log(`✅ Tasa final: ${tasaActual} (${fechaStr})`);
                
                if (cambio) {
                    mostrarToast(`💱 Nueva tasa BCV: ${tasaActual.toFixed(2)} Bs/USD`, 'info');
                }
                return;
            }
        }
    } catch (e) {
        console.warn('⚠️ justcarlux falló:', e.message);
    }

    // ==========================================
    // 2. Respaldo: DolarAPI
    // ==========================================
    try {
        console.log('🌐 Consultando DolarAPI (respaldo)...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const resp = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { 
            signal: controller.signal,
            cache: 'no-cache'
        });
        clearTimeout(timeoutId);

        if (resp.ok) {
            const data = await resp.json();
            if (data && data.promedio) {
                const tasa = parseFloat(data.promedio);
                const fecha = data.fechaActualizacion ? new Date(data.fechaActualizacion) : new Date();
                const fechaStr = fecha.toLocaleString('es-VE', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric',
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                
                console.log(`✅ DolarAPI: ${tasa} (${fechaStr})`);
                
                tasaActual = tasa;
                localStorage.setItem('ultimaTasaBCV', tasaActual);
                localStorage.setItem('ultimaFechaBCV', fechaStr);
                
                info.textContent = `💱 Tasa BCV: ${tasaActual.toFixed(2)} Bs/USD · ${fechaStr}`;
                console.log(`✅ Tasa final: ${tasaActual} (${fechaStr})`);
                return;
            }
        }
    } catch (e) {
        console.warn('⚠️ DolarAPI falló:', e.message);
    }

    // ==========================================
    // 3. Último recurso: usar la guardada
    // ==========================================
    if (ultimaTasa && ultimaFecha) {
        info.textContent = `💱 Tasa BCV: ${parseFloat(ultimaTasa).toFixed(2)} Bs/USD · ${ultimaFecha} (guardada)`;
        tasaActual = parseFloat(ultimaTasa);
        console.warn("⚠️ Ninguna API respondió. Usando tasa guardada.");
    } else {
        info.textContent = '⚠️ Tasa BCV no disponible';
        console.error("❌ No hay tasa disponible");
    }
}

function convertirBsAUSD() {
    const montoBsInput = document.getElementById('formMontoBs');
    const montoBs = parseFloat(montoBsInput.value) || 0;

    if (montoBs > 0 && tasaActual) {
        const montoUSD = montoBs / tasaActual;
        document.getElementById('formMontoUSD').value = montoUSD.toFixed(2);
        actualizarEquivalente();
        mostrarToast(`💱 Convertido: ${formatearMontoBs(montoBs)} Bs → $${montoUSD.toFixed(2)}`, 'info');
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
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
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

    lista.innerHTML = filtrados.map(p => {
        const tipoIcon = p.tipoPago === 'pago_movil' ? '📱' : '🏦';
        return `
        <div class="card-item" data-id="${p.id}">
            <div class="card-header">
                <div class="card-titulo">${tipoIcon} ${escapeHtml(p.beneficiario)}</div>
                <span class="card-fecha">${p.fecha}</span>
            </div>
            <div class="card-info">
                <span class="card-monto">${p.monto} Bs</span>
                <span class="card-monto-bs">$${p.montoUSD || '0.00'}</span>
            </div>
            ${p.numeroRecibo && p.numeroRecibo !== 'N/A' ? `<div class="card-info"><span class="card-fecha">Ref: ${p.numeroRecibo}</span></div>` : ''}
            ${p.bancoReceptor ? `<div class="card-info"><span class="card-fecha">🏦 ${escapeHtml(p.bancoReceptor)}</span>${p.telefonoReceptor ? `<span class="card-fecha">📱 ${escapeHtml(p.telefonoReceptor)}</span>` : ''}</div>` : ''}
            ${p.notas ? `<div class="card-notas">📝 ${escapeHtml(p.notas)}</div>` : ''}
        </div>
        `;
    }).join('');

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

    lista.innerHTML = filtrados.map(p => {
        const infoCaja = p.unidadesCaja > 0 && p.precioCajaUSD > 0 
            ? `<span class="card-fecha">📦 Caja: $${p.precioCajaUSD.toFixed(2)} (${p.unidadesCaja} und)</span>` 
            : '';
        
        return `
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
                ${infoCaja ? `<div class="card-info">${infoCaja}</div>` : ''}
                ${p.ultimoProveedor ? `<div class="card-info"><span class="card-fecha">🏢 ${escapeHtml(p.ultimoProveedor)}</span></div>` : ''}
            </div>
        `;
    }).join('');

    lista.querySelectorAll('.card-item').forEach(card => {
        card.addEventListener('click', () => {
            const id = parseInt(card.dataset.id);
            const producto = datos.productos.find(p => p.id === id);
            if (producto) abrirModalEditarProducto(producto);
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
            <div class="detalle-row"><div class="detalle-label">Proveedor</div><div class="detalle-valor">${escapeHtml(f.proveedor)}</div></div>
            <div class="detalle-row"><div class="detalle-label">Monto USD</div><div class="detalle-valor destacado">$${f.montoUSD || '0.00'}</div></div>
            <div class="detalle-row"><div class="detalle-label">Monto en Bs</div><div class="detalle-valor">${formatearMontoBs(f.montoBs)} Bs</div></div>
            <div class="detalle-row"><div class="detalle-label">Fecha</div><div class="detalle-valor">${f.fecha} (hace ${dias} días)</div></div>
            <div class="detalle-row"><div class="detalle-label">N° Factura</div><div class="detalle-valor">${f.numeroFactura || 'S/N'}</div></div>
            <div class="detalle-row"><div class="detalle-label">Estatus</div><div class="detalle-valor">${getIconoEstatus(estatusReal)} ${estatusReal}</div></div>
            <div class="detalle-row"><div class="detalle-label">Tasa BCV usada</div><div class="detalle-valor">${f.tasaBCV ? f.tasaBCV.toFixed(2) + ' Bs/USD' : 'N/A'}</div></div>
            ${f.notas ? `<div class="detalle-row"><div class="detalle-label">Notas</div><div class="detalle-notas">${escapeHtml(f.notas)}</div></div>` : ''}
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
    let extraInfo = '';
    
    if (p.tipoPago === 'pago_movil') {
        extraInfo = `
            <div class="detalle-row"><div class="detalle-label">Tipo</div><div class="detalle-valor">📱 Pago Móvil</div></div>
            ${p.bancoReceptor ? `<div class="detalle-row"><div class="detalle-label">Banco Receptor</div><div class="detalle-valor">${escapeHtml(p.bancoReceptor)}</div></div>` : ''}
            ${p.telefonoReceptor ? `<div class="detalle-row"><div class="detalle-label">Teléfono Receptor</div><div class="detalle-valor">${escapeHtml(p.telefonoReceptor)}</div></div>` : ''}
            ${p.cedulaReceptor ? `<div class="detalle-row"><div class="detalle-label">Cédula Receptor</div><div class="detalle-valor">${escapeHtml(p.cedulaReceptor)}</div></div>` : ''}
            ${p.nombreReceptor ? `<div class="detalle-row"><div class="detalle-label">Nombre Receptor</div><div class="detalle-valor">${escapeHtml(p.nombreReceptor)}</div></div>` : ''}
        `;
    } else if (p.bancoReceptor || p.cedulaReceptor || p.nombreReceptor) {
        extraInfo = `
            <div class="detalle-row"><div class="detalle-label">Tipo</div><div class="detalle-valor">🏦 Transferencia</div></div>
            ${p.bancoReceptor ? `<div class="detalle-row"><div class="detalle-label">Banco Receptor</div><div class="detalle-valor">${escapeHtml(p.bancoReceptor)}</div></div>` : ''}
            ${p.nombreReceptor ? `<div class="detalle-row"><div class="detalle-label">Nombre Receptor</div><div class="detalle-valor">${escapeHtml(p.nombreReceptor)}</div></div>` : ''}
            ${p.cedulaReceptor ? `<div class="detalle-row"><div class="detalle-label">Cédula/RIF Receptor</div><div class="detalle-valor">${escapeHtml(p.cedulaReceptor)}</div></div>` : ''}
        `;
    }

    const html = `
        <div class="detalle-grid">
            <div class="detalle-row"><div class="detalle-label">Beneficiario</div><div class="detalle-valor">${escapeHtml(p.beneficiario)}</div></div>
            <div class="detalle-row"><div class="detalle-label">Monto</div><div class="detalle-valor destacado">${p.monto} Bs</div></div>
            <div class="detalle-row"><div class="detalle-label">Equivalente USD</div><div class="detalle-valor">$${p.montoUSD || '0.00'}</div></div>
            <div class="detalle-row"><div class="detalle-label">Fecha</div><div class="detalle-valor">${p.fecha}</div></div>
            <div class="detalle-row"><div class="detalle-label">Referencia</div><div class="detalle-valor">${p.numeroRecibo || 'N/A'}</div></div>
            ${extraInfo}
            <div class="detalle-row"><div class="detalle-label">Tasa BCV</div><div class="detalle-valor">${p.tasaBCV ? p.tasaBCV.toFixed(2) + ' Bs/USD' : 'N/A'}</div></div>
            ${p.notas ? `<div class="detalle-row"><div class="detalle-label">Observaciones</div><div class="detalle-notas">${escapeHtml(p.notas)}</div></div>` : ''}
        </div>
    `;

    document.getElementById('detalleTitulo').textContent = 'Detalle de Pago';
    document.getElementById('detalleContenido').innerHTML = html;
    document.getElementById('detalleAcciones').innerHTML = `
        <button class="btn btn-secondary" id="btnEditarPagoDetalle">✏️ Editar</button>
        <button class="btn btn-danger" id="btnEliminarPagoDetalle">🗑️ Eliminar</button>
    `;
    
    document.getElementById('btnEditarPagoDetalle').addEventListener('click', () => {
        document.getElementById('modalDetalle').classList.add('hidden');
        abrirModalEditarPago(p);
    });
    document.getElementById('btnEliminarPagoDetalle').addEventListener('click', () => eliminarPago(p));
    
    document.getElementById('modalDetalle').classList.remove('hidden');
}

// ============================================
// MODAL EDITAR PRODUCTO
// ============================================
function abrirModalEditarProducto(p) {
    productoEditando = p;
    console.log("📝 Editando producto:", p.nombre);

    document.getElementById('editNombre').value = p.nombre || '';
    document.getElementById('editUnidad').value = p.unidad || 'UND';
    document.getElementById('editStock').value = p.stock || 0;
    document.getElementById('editPrecioCompra').value = p.precioCompraUSD || 0;
    document.getElementById('editMargen').value = p.margen || 30;
    document.getElementById('editIva').value = p.exento ? 'E' : (p.iva || 16);
    document.getElementById('editUnidadesCaja').value = p.unidadesCaja || 0;
    document.getElementById('editPrecioCaja').value = p.precioCajaUSD || 0;
    document.getElementById('editNotas').value = p.notas || '';

    setTimeout(() => {
        recalcularPrecioVenta();
    }, 50);

    document.getElementById('modalEditarProducto').classList.remove('hidden');
}

function cerrarModalEditarProducto() {
    document.getElementById('modalEditarProducto').classList.add('hidden');
    productoEditando = null;
}

function recalcularPrecioVenta() {
    const precioCompraInput = document.getElementById('editPrecioCompra');
    const margenInput = document.getElementById('editMargen');
    const unidadesCajaInput = document.getElementById('editUnidadesCaja');
    const precioVentaInput = document.getElementById('editPrecioVenta');
    const info = document.getElementById('infoCalculo');

    if (!precioCompraInput || !margenInput || !unidadesCajaInput || !precioVentaInput) return;

    const precioCompra = parseFloat(precioCompraInput.value) || 0;
    const margen = parseFloat(margenInput.value) || 0;
    const unidadesCaja = parseFloat(unidadesCajaInput.value) || 0;

    let precioCompraPorUnidad = precioCompra;
    let esPorCaja = false;

    if (unidadesCaja > 1) {
        precioCompraPorUnidad = precioCompra / unidadesCaja;
        esPorCaja = true;
    }

    const precioVenta = precioCompraPorUnidad * (1 + margen / 100);

    precioVentaInput.value = precioVenta.toFixed(2);

    if (esPorCaja) {
        info.innerHTML = `
            📦 <strong>Compra por CAJA</strong> de ${unidadesCaja} unidades<br>
            💵 Precio caja: $${precioCompra.toFixed(2)}<br>
            💵 Precio por unidad: $${precioCompraPorUnidad.toFixed(4)}<br>
            📊 Margen: ${margen}%<br>
            💰 <strong>Venta por unidad: $${precioVenta.toFixed(2)}</strong>
        `;
        info.style.display = 'block';
    } else {
        info.innerHTML = `
            📦 <strong>Venta por UNIDAD</strong><br>
            💵 Precio compra: $${precioCompra.toFixed(2)}<br>
            📊 Margen: ${margen}%<br>
            💰 <strong>Venta: $${precioVenta.toFixed(2)}</strong>
        `;
        info.style.display = 'block';
    }
}

async function guardarEditarProducto() {
    if (!productoEditando) return;

    const nombre = document.getElementById('editNombre').value.trim();
    if (!nombre) {
        mostrarToast('El nombre es obligatorio', 'error');
        return;
    }

    const unidad = document.getElementById('editUnidad').value.trim() || 'UND';
    const stock = parseFloat(document.getElementById('editStock').value) || 0;
    const precioCompra = parseFloat(document.getElementById('editPrecioCompra').value) || 0;
    const margen = parseFloat(document.getElementById('editMargen').value) || 30;
    const ivaInput = document.getElementById('editIva').value.toUpperCase();
    const exento = ivaInput === 'E';
    const iva = exento ? 0 : (parseFloat(ivaInput) || 16);
    const unidadesCaja = parseFloat(document.getElementById('editUnidadesCaja').value) || 0;
    const precioCaja = parseFloat(document.getElementById('editPrecioCaja').value) || 0;
    const notas = document.getElementById('editNotas').value.trim();

    let precioCompraPorUnidad = precioCompra;
    if (unidadesCaja > 1) {
        precioCompraPorUnidad = precioCompra / unidadesCaja;
    }
    const precioVenta = precioCompraPorUnidad * (1 + margen / 100);

    try {
        const { error } = await supabaseClient.from('productos').update({
            nombre: nombre,
            nombre_normalizado: normalizarNombre(nombre),
            unidad: unidad,
            stock: stock,
            precio_compra_usd: precioCompra,
            margen: margen,
            precio_venta_usd: parseFloat(precioVenta.toFixed(4)),
            iva: iva,
            exento: exento,
            unidades_caja: unidadesCaja,
            precio_caja_usd: precioCaja,
            notas: notas,
            updated_at: new Date().toISOString()
        }).eq('id', productoEditando.id);

        if (error) throw error;

        mostrarToast('✅ Producto actualizado', 'success');
        cerrarModalEditarProducto();
        cargarDatos();
    } catch (error) {
        console.error('Error al guardar producto:', error);
        mostrarToast('Error al guardar: ' + error.message, 'error');
    }
}

async function eliminarProductoDesdeModal() {
    if (!productoEditando) return;
    const nombre = productoEditando.nombre;
    
    if (!confirm(`¿Eliminar el producto "${nombre}" del inventario?\n\nEsta acción no se puede deshacer.`)) {
        return;
    }

    try {
        const { error } = await supabaseClient.from('productos').delete().eq('id', productoEditando.id);
        if (error) throw error;
        
        mostrarToast('✅ Producto eliminado', 'success');
        cerrarModalEditarProducto();
        cargarDatos();
    } catch (error) {
        console.error('Error al eliminar producto:', error);
        mostrarToast('Error al eliminar: ' + error.message, 'error');
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
        document.getElementById('formMontoBs').value = factura.montoBs || '';
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
        document.getElementById('formMontoBs').value = '';
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

    const productosParaGuardar = facturaTemporalParaProductos 
        ? facturaTemporalParaProductos 
        : (facturaEditando && facturaEditando.productos ? facturaEditando.productos : []);

    const datosDB = {
        fecha: fechaFormato,
        proveedor: proveedor,
        numero_factura: numeroFactura || 'S/N',
        monto_usd: montoNum,
        monto_bs: montoBs ? parseFloat(montoBs) : null,
        tasa_bcv: tasaActual,
        estatus: estatus,
        notas: notas,
        productos: productosParaGuardar,
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
// OCR CON DEEPSEEK - FACTURAS
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
2. El monto total de la factura (en USD o Bs).
3. El número de factura.
4. La LISTA de productos REALMENTE COMPRADOS en esta factura.

⚠️ REGLA CRÍTICA PARA PRODUCTOS:
Muchas facturas venezolanas tienen un CATÁLOGO IMPRESO con TODOS los productos que vende el proveedor.
PERO solo unos pocos tienen datos rellenados (cantidad, precio, total escritos a mano o impresos en las columnas de la derecha).
Debes extraer ÚNICAMENTE los productos que tengan CANTIDAD mayor a cero Y PRECIO escrito.
IGNORA las filas del catálogo que estén vacías (sin cantidad, sin precio).
Si una fila del catálogo tiene código, descripción pero NO tiene cantidad ni precio, NO la incluyas.

⚠️ SOBRE EL MONTO Y LA TASA:
La factura puede tener una sección "MONTO EXPRESADO EN USD SEGÚN TASA DE CAMBIO" con:
- TASA Bs/USD (ejemplo: 848,55)
- TOTAL MONTO USD (ejemplo: 98,04)
Si está disponible, USA ESOS VALORES para el monto total en USD.
Si no, convierte el total en Bs a USD usando la tasa que aparezca en la factura.

Responde EXACTAMENTE en este formato JSON (sin texto adicional, sin markdown):

{
  "proveedor": "NOMBRE DEL PROVEEDOR",
  "monto_total": 98.04,
  "monto_es_bs": false,
  "numero_factura": "081161",
  "tasa_bcv": 848.55,
  "productos": [
    {
      "nombre": "PACOMELLA PALMITA",
      "cantidad": 1,
      "unidad": "UND",
      "precio_unitario": 10.22,
      "iva": "E",
      "exento": true
    }
  ],
  "confianza": "alta|media|baja"
}

Reglas ESPECÍFICAS:
- "monto_total": número decimal. Si la factura tiene "TOTAL MONTO USD", usa ese valor.
- "monto_es_bs": true si el monto_total está en Bs, false si está en USD.
- "tasa_bcv": si la factura menciona la tasa, inclúyela. Si no, null.
- "productos": SOLO los productos con cantidad > 0 Y precio.
  - "precio_unitario": precio por unidad EN USD. Si está en Bs, conviértelo usando la tasa de la factura.

Si NO puedes leer algún campo, usa null.`;

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
            max_tokens: 4000,
            temperature: 0.1
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Error API (${response.status}). Verifica tu API Key y saldo.`);
    }

    const data = await response.json();
    const contenido = data.choices?.[0]?.message?.content || '';
    console.log('📝 Respuesta DeepSeek (Factura):', contenido);

    try {
        const match = contenido.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error('No se encontró JSON en la respuesta');
    } catch (e) {
        console.error('Error al parsear:', contenido);
        throw new Error('Respuesta inesperada de la IA');
    }
}

// CONFIGURAR 2 BOTONES: Tomar Foto + Subir Imagen
function configurarFotoFactura() {
    const btnTomar = document.getElementById('btnTomarFoto');
    const btnGaleria = document.getElementById('btnSubirGaleria');
    const inputCamara = document.getElementById('inputFoto');
    const inputGaleria = document.getElementById('inputFotoGaleria');
    const estado = document.getElementById('estadoFoto');
    const previewDiv = document.getElementById('previewFoto');
    const imgPreview = document.getElementById('imgPreview');

    if (!btnTomar || !btnGaleria) {
        console.warn("⚠️ Botones de foto no encontrados");
        return;
    }

    btnTomar.addEventListener('click', () => inputCamara.click());
    btnGaleria.addEventListener('click', () => inputGaleria.click());

    const procesarImagen = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const urlImagen = URL.createObjectURL(file);
        imgPreview.src = urlImagen;
        previewDiv.style.display = 'block';

        estado.style.display = 'block';
        estado.textContent = '⏳ Procesando imagen con IA... (puede tardar 5-15 seg)';
        estado.style.color = '#17a2b8';

        try {
            const base64 = await archivoABase64(file);
            const datos = await extraerDatosConDeepSeek(base64);

            if (datos.proveedor) document.getElementById('formProveedor').value = datos.proveedor;
            
            if (datos.monto_total) {
                if (datos.monto_es_bs === true) {
                    document.getElementById('formMontoBs').value = datos.monto_total;
                    const tasaU = datos.tasa_bcv || tasaActual;
                    if (tasaU) {
                        const usd = datos.monto_total / tasaU;
                        document.getElementById('formMontoUSD').value = usd.toFixed(2);
                        estado.textContent = `💱 Monto en Bs detectado: ${formatearMontoBs(datos.monto_total)} → $${usd.toFixed(2)}`;
                        estado.style.color = '#ffc107';
                    }
                } else {
                    document.getElementById('formMontoUSD').value = parseFloat(datos.monto_total).toFixed(2);
                }
                actualizarEquivalente();
            }
            
            if (datos.numero_factura) {
                const inputNum = document.getElementById('formNumeroFactura');
                const check = document.getElementById('formSinNumero');
                inputNum.value = datos.numero_factura;
                inputNum.disabled = false;
                check.checked = false;
            }

            productosDetectados = (datos.productos || []).map(p => {
                const unidad = (p.unidad || 'UND').toUpperCase();
                const precioUnitario = parseFloat(p.precio_unitario) || 0;
                let unidadesCaja = 0;
                let precioCaja = 0;

                if (unidad.includes('CAJ') || unidad.includes('BOX')) {
                    const match = (p.nombre || '').match(/[xX]\s*(\d+)/);
                    if (match) {
                        unidadesCaja = parseInt(match[1]);
                        precioCaja = precioUnitario;
                    }
                }

                return {
                    nombre: p.nombre || '',
                    cantidad: parseFloat(p.cantidad) || 1,
                    unidad: unidad.includes('CAJ') ? 'CAJA' : (unidad.includes('KG') ? 'KG' : (unidad.includes('LT') ? 'LT' : 'UND')),
                    precio_unitario: precioUnitario,
                    unidades_caja: unidadesCaja,
                    precio_caja: precioCaja,
                    iva: p.iva === 'E' ? 'E' : (parseFloat(p.iva) || 16),
                    exento: p.exento || p.iva === 'E' || false,
                    margen: 30
                };
            });

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

            if (productosDetectados.length > 0) {
                setTimeout(() => { abrirModalProductos(); }, 1000);
            } else {
                setTimeout(() => { estado.style.display = 'none'; }, 5000);
            }
        } catch (error) {
            console.error('❌ Error completo:', error);
            estado.textContent = `❌ ${error.message}`;
            estado.style.color = '#dc3545';
            setTimeout(() => { estado.style.display = 'none'; }, 8000);
        }

        event.target.value = '';
    };

    inputCamara.addEventListener('change', procesarImagen);
    inputGaleria.addEventListener('change', procesarImagen);
}

// ============================================
// OCR CON DEEPSEEK - PAGOS
// ============================================
async function procesarCapturaPago(event) {
    const file = event.target.files[0];
    if (!file) return;

    const estado = document.getElementById('estadoFotoPago');
    const previewDiv = document.getElementById('previewFotoPago');
    const imgPreview = document.getElementById('imgPreviewPago');

    const urlImagen = URL.createObjectURL(file);
    imgPreview.src = urlImagen;
    previewDiv.style.display = 'block';

    estado.style.display = 'block';
    estado.textContent = '⏳ Procesando captura con IA... (5-10 seg)';
    estado.style.color = '#28a745';

    try {
        const base64 = await archivoABase64(file);
        const datos = await extraerPagoConDeepSeek(base64);

        console.log('💸 Datos del pago extraídos:', datos);

        if (datos.error) {
            throw new Error(datos.error);
        }

        document.getElementById('pagoTipo').value = datos.tipo_pago === 'pago_movil' ? '📱 Pago Móvil' : '🏦 Transferencia';
        document.getElementById('pagoMontoBs').value = datos.monto_bs || '';
        document.getElementById('pagoReferencia').value = datos.referencia || '';
        
        if (datos.fecha) {
            const [d, m, y] = datos.fecha.split('/');
            document.getElementById('pagoFecha').value = `${y}-${m}-${d}`;
        } else {
            document.getElementById('pagoFecha').valueAsDate = new Date();
        }
        
        document.getElementById('pagoBanco').value = datos.banco_receptor || '';
        document.getElementById('pagoNombreReceptor').value = datos.nombre_receptor || '';
        document.getElementById('pagoCedulaReceptor').value = datos.cedula_receptor || '';
        document.getElementById('pagoTelefonoReceptor').value = datos.telefono_receptor || '';
        document.getElementById('pagoNotas').value = '';

        actualizarEquivalentePago();

        const resumen = document.getElementById('datosPagoExtraidos');
        let html = `<strong>Datos detectados:</strong><br>`;
        html += `📋 Tipo: ${datos.tipo_pago === 'pago_movil' ? 'Pago Móvil' : 'Transferencia'}<br>`;
        if (datos.monto_bs) html += `💵 Monto: ${formatearMontoBs(datos.monto_bs)} Bs<br>`;
        if (datos.referencia) html += `🔖 Referencia: ${datos.referencia}<br>`;
        if (datos.banco_receptor) html += `🏦 Banco: ${datos.banco_receptor}<br>`;
        if (datos.nombre_receptor) html += `👤 Receptor: ${datos.nombre_receptor}<br>`;
        if (datos.cedula_receptor) html += `🆔 Cédula/RIF: ${datos.cedula_receptor}<br>`;
        if (datos.telefono_receptor) html += `📱 Teléfono: ${datos.telefono_receptor}<br>`;
        html += `<br><em style="color:#28a745;">✅ Revisa y guarda</em>`;
        resumen.innerHTML = html;

        document.getElementById('modalConfirmarPago').classList.remove('hidden');
        estado.textContent = '✅ Captura procesada. Revisa y guarda.';
        estado.style.color = '#28a745';
        setTimeout(() => { estado.style.display = 'none'; }, 3000);

    } catch (error) {
        console.error('❌ Error al procesar pago:', error);
        estado.textContent = `❌ ${error.message}`;
        estado.style.color = '#dc3545';
        setTimeout(() => { estado.style.display = 'none'; }, 8000);
    }

    event.target.value = '';
}

async function extraerPagoConDeepSeek(base64Image) {
    const apiKey = obtenerApiKeyDeepSeek();
    if (!apiKey) throw new Error('API Key no configurada');

    const prompt = `Analiza esta imagen de un PAGO realizado desde un banco venezolano.

Puede ser:
1. **PAGO MÓVIL** (desde una app bancaria): suele tener "Pago Móvil" o "PagoMóvil" en el título, y muestra: banco, cédula del receptor, teléfono del receptor, monto en Bs, referencia.
2. **TRANSFERENCIA** bancaria: suele mostrar: banco receptor, nombre del receptor, cédula o RIF del receptor, monto en Bs, referencia, fecha.

Extrae TODOS los datos visibles. Responde EXACTAMENTE en este formato JSON (sin texto adicional, sin markdown):

{
  "tipo_pago": "pago_movil" | "transferencia",
  "monto_bs": 1500.50,
  "referencia": "123456789",
  "fecha": "15/09/2026",
  "banco_receptor": "Banesco",
  "nombre_receptor": "Juan Pérez",
  "cedula_receptor": "V-12345678",
  "telefono_receptor": "04141234567",
  "confianza": "alta|media|baja",
  "error": null
}

REGLAS:
- "tipo_pago": "pago_movil" si dice "Pago Móvil", "PagoMóvil", o muestra teléfono del receptor. "transferencia" en caso contrario.
- "monto_bs": SOLO el número, sin comas de miles, sin símbolos Bs. Ejemplo: 1500.50
- "referencia": el número de referencia u operación. Es un número largo de 8-15 dígitos.
- "fecha": en formato DD/MM/YYYY.
- "banco_receptor": nombre del banco destino.
- "nombre_receptor": nombre completo de quien recibe el pago.
- "cedula_receptor": cédula o RIF con formato (V-12345678 o J-123456789).
- "telefono_receptor": número de teléfono (solo Pago Móvil). Formato 04XXXXXXXXX.
- "confianza": alta si lees todo claro, media si algo está borroso, baja si es ilegible.
- "error": si la imagen NO es un pago, escribe el motivo aquí.

Si un campo no aparece, pon null.`;

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
            max_tokens: 1500,
            temperature: 0.1
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Error API (${response.status}). Verifica tu API Key.`);
    }

    const data = await response.json();
    const contenido = data.choices?.[0]?.message?.content || '';
    console.log('📝 Respuesta Pago:', contenido);

    try {
        const match = contenido.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error('No se encontró JSON');
    } catch (e) {
        console.error('Error al parsear:', contenido);
        throw new Error('Respuesta inesperada de la IA');
    }
}

function actualizarEquivalentePago() {
    const montoBs = parseFloat(document.getElementById('pagoMontoBs').value) || 0;
    const equival = document.getElementById('pagoEquivalenteUSD');
    
    if (montoBs > 0 && tasaActual) {
        const usd = montoBs / tasaActual;
        equival.innerHTML = `💵 Equivalente: <strong>$${usd.toFixed(2)}</strong> (Tasa: ${tasaActual.toFixed(2)} Bs/USD)`;
    } else if (montoBs > 0 && !tasaActual) {
        equival.innerHTML = `⚠️ Monto en Bs ingresado pero no hay tasa BCV`;
    } else {
        equival.innerHTML = `💵 Equivalente USD: --`;
    }
}

function cerrarModalConfirmarPago() {
    document.getElementById('modalConfirmarPago').classList.add('hidden');
    document.getElementById('previewFotoPago').style.display = 'none';
}

async function guardarPagoDesdeCaptura() {
    const tipoPagoRaw = document.getElementById('pagoTipo').value;
    const tipoPago = tipoPagoRaw.includes('Pago Móvil') ? 'pago_movil' : 'transferencia';
    const montoBs = parseFloat(document.getElementById('pagoMontoBs').value) || 0;
    const referencia = document.getElementById('pagoReferencia').value.trim();
    const fecha = document.getElementById('pagoFecha').value;
    const banco = document.getElementById('pagoBanco').value.trim();
    const nombreReceptor = document.getElementById('pagoNombreReceptor').value.trim();
    const cedulaReceptor = document.getElementById('pagoCedulaReceptor').value.trim();
    const telefonoReceptor = document.getElementById('pagoTelefonoReceptor').value.trim();
    const notas = document.getElementById('pagoNotas').value.trim();

    if (montoBs <= 0) {
        mostrarToast('El monto es obligatorio', 'error');
        return;
    }

    if (!fecha) {
        mostrarToast('La fecha es obligatoria', 'error');
        return;
    }

    const montoUSD = tasaActual ? (montoBs / tasaActual).toFixed(2) : null;
    const fechaFormato = fecha.split('-').reverse().join('/');
    const beneficiario = nombreReceptor || (tipoPago === 'pago_movil' ? `Pago Móvil a ${telefonoReceptor || cedulaReceptor || banco}` : `Transferencia a ${banco}`);

    const pagoDB = {
        id: Date.now(),
        numero_recibo: referencia || 'N/A',
        fecha: fechaFormato,
        beneficiario: beneficiario,
        monto: montoBs,
        monto_usd: montoUSD ? parseFloat(montoUSD) : null,
        tasa_bcv: tasaActual,
        concepto: tipoPago === 'pago_movil' ? 'Pago Móvil' : 'Transferencia',
        resultado: 'Operación Exitosa',
        notas: notas,
        tipo_pago: tipoPago,
        banco_receptor: banco || null,
        cedula_receptor: cedulaReceptor || null,
        telefono_receptor: telefonoReceptor || null,
        nombre_receptor: nombreReceptor || null,
        created_at: new Date().toISOString()
    };

    try {
        const { error } = await supabaseClient.from('pagos').insert([pagoDB]);
        if (error) throw error;

        mostrarToast('✅ Pago guardado correctamente', 'success');
        cerrarModalConfirmarPago();
        cargarDatos();
    } catch (error) {
        console.error('Error al guardar pago:', error);
        mostrarToast('Error: ' + error.message, 'error');
    }
}

// ============================================
// MODAL EDITAR PAGO
// ============================================
function abrirModalEditarPago(p) {
    pagoEditando = p;
    console.log("📝 Editando pago:", p.beneficiario);

    document.getElementById('editPagoBeneficiario').value = p.beneficiario || '';
    document.getElementById('editPagoMontoBs').value = parsearMontoBs(p.monto) || 0;
    document.getElementById('editPagoReferencia').value = p.numeroRecibo || '';
    
    if (p.fecha) {
        const [d, m, y] = p.fecha.split('/');
        document.getElementById('editPagoFecha').value = `${y}-${m}-${d}`;
    } else {
        document.getElementById('editPagoFecha').valueAsDate = new Date();
    }
    
    document.getElementById('editPagoBanco').value = p.bancoReceptor || '';
    document.getElementById('editPagoNombreReceptor').value = p.nombreReceptor || '';
    document.getElementById('editPagoCedulaReceptor').value = p.cedulaReceptor || '';
    document.getElementById('editPagoTelefonoReceptor').value = p.telefonoReceptor || '';
    document.getElementById('editPagoConcepto').value = p.concepto || '';
    document.getElementById('editPagoNotas').value = p.notas || '';

    setTimeout(() => {
        actualizarEquivalenteEditPago();
    }, 50);

    document.getElementById('modalEditarPago').classList.remove('hidden');
}

function cerrarModalEditarPago() {
    document.getElementById('modalEditarPago').classList.add('hidden');
    pagoEditando = null;
}

function actualizarEquivalenteEditPago() {
    const montoBs = parseFloat(document.getElementById('editPagoMontoBs').value) || 0;
    const equival = document.getElementById('editPagoEquivalente');
    
    if (montoBs > 0 && tasaActual) {
        const usd = montoBs / tasaActual;
        equival.innerHTML = `💵 Equivalente: <strong>$${usd.toFixed(2)}</strong> (Tasa: ${tasaActual.toFixed(2)} Bs/USD)`;
    } else if (montoBs > 0 && !tasaActual) {
        equival.innerHTML = `⚠️ Monto en Bs ingresado pero no hay tasa BCV`;
    } else {
        equival.innerHTML = `💵 Equivalente USD: --`;
    }
}

async function guardarEditarPago() {
    if (!pagoEditando) return;

    const beneficiario = document.getElementById('editPagoBeneficiario').value.trim();
    if (!beneficiario) {
        mostrarToast('El beneficiario es obligatorio', 'error');
        return;
    }

    const montoBs = parseFloat(document.getElementById('editPagoMontoBs').value) || 0;
    if (montoBs <= 0) {
        mostrarToast('El monto debe ser mayor a 0', 'error');
        return;
    }

    const referencia = document.getElementById('editPagoReferencia').value.trim();
    const fecha = document.getElementById('editPagoFecha').value;
    const banco = document.getElementById('editPagoBanco').value.trim();
    const nombreReceptor = document.getElementById('editPagoNombreReceptor').value.trim();
    const cedulaReceptor = document.getElementById('editPagoCedulaReceptor').value.trim();
    const telefonoReceptor = document.getElementById('editPagoTelefonoReceptor').value.trim();
    const concepto = document.getElementById('editPagoConcepto').value.trim();
    const notas = document.getElementById('editPagoNotas').value.trim();

    const tasaOriginal = pagoEditando.tasaBCV || tasaActual;
    const montoUSD = tasaOriginal ? (montoBs / tasaOriginal).toFixed(2) : null;
    const fechaFormato = fecha ? fecha.split('-').reverse().join('/') : pagoEditando.fecha;

    const pagoActualizado = {
        numero_recibo: referencia || 'N/A',
        fecha: fechaFormato,
        beneficiario: beneficiario,
        monto: montoBs,
        monto_usd: montoUSD ? parseFloat(montoUSD) : null,
        tasa_bcv: tasaOriginal,
        concepto: concepto || pagoEditando.concepto,
        notas: notas,
        banco_receptor: banco || null,
        cedula_receptor: cedulaReceptor || null,
        telefono_receptor: telefonoReceptor || null,
        nombre_receptor: nombreReceptor || null,
        updated_at: new Date().toISOString()
    };

    console.log("💾 Guardando cambios del pago:", pagoActualizado);

    try {
        const { error } = await supabaseClient
            .from('pagos')
            .update(pagoActualizado)
            .eq('id', pagoEditando.id);

        if (error) throw error;

        mostrarToast('✅ Pago actualizado correctamente', 'success');
        cerrarModalEditarPago();
        cargarDatos();
    } catch (error) {
        console.error('Error al guardar pago:', error);
        mostrarToast('Error al guardar: ' + error.message, 'error');
    }
}

async function eliminarPagoDesdeModal() {
    if (!pagoEditando) return;
    
    if (!confirm(`¿Eliminar el pago a "${pagoEditando.beneficiario}"?\n\nEsta acción no se puede deshacer.`)) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('pagos')
            .delete()
            .eq('id', pagoEditando.id);

        if (error) throw error;

        mostrarToast('✅ Pago eliminado', 'success');
        cerrarModalEditarPago();
        cargarDatos();
    } catch (error) {
        console.error('Error al eliminar pago:', error);
        mostrarToast('Error al eliminar: ' + error.message, 'error');
    }
}

// ============================================
// MODAL PRODUCTOS
// ============================================
function abrirModalProductos() {
    if (productosDetectados.length === 0) return;

    const container = document.getElementById('tablaProductosEdit');
    container.innerHTML = `
        <table class="tabla-productos-edit">
            <thead>
                <tr>
                    <th style="width: 30%;">Producto</th>
                    <th style="width: 10%;">Cant.</th>
                    <th style="width: 10%;">Unid.</th>
                    <th style="width: 12%;">P.Compra</th>
                    <th style="width: 10%;">Unid/Caja</th>
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
            <td><input type="number" class="input-corto" data-field="unidades_caja" value="${p.unidades_caja || 0}" step="1" min="0" placeholder="0"></td>
            <td><input type="text" class="input-corto" data-field="iva" value="${p.iva}" style="text-align:center;"></td>
            <td><input type="number" class="input-corto precio-venta" data-field="precio_venta" value="${precioVenta.toFixed(2)}" step="0.01" min="0" readonly></td>
            <td style="text-align:center;"><button class="btn-eliminar-prod" data-eliminar="${index}">✕</button></td>
        </tr>
    `;
}

function adjuntarEventosProductos() {
    const tbody = document.getElementById('tbodyProductosEdit');
    if (!tbody) return;

    tbody.querySelectorAll('tr').forEach(tr => {
        const index = parseInt(tr.dataset.index);

        tr.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', (e) => {
                const field = e.target.dataset.field;
                let valor = e.target.value;

                if (field === 'cantidad' || field === 'precio_unitario' || field === 'unidades_caja') {
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

                if (field === 'precio_unitario' || field === 'unidades_caja') {
                    const precioCompra = productosDetectados[index].precio_unitario || 0;
                    const unidadesCaja = productosDetectados[index].unidades_caja || 0;
                    const margen = productosDetectados[index].margen || 30;

                    let precioPorUnidad = precioCompra;
                    if (unidadesCaja > 1) {
                        precioPorUnidad = precioCompra / unidadesCaja;
                    }
                    const pv = precioPorUnidad * (1 + margen / 100);
                    tr.querySelector('[data-field="precio_venta"]').value = pv.toFixed(2);
                }
            });
        });
    });

    tbody.querySelectorAll('[data-eliminar]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.eliminar);
            productosDetectados.splice(index, 1);
            abrirModalProductos();
        });
    });
}

function aplicarMargenGlobal() {
    const margen = parseFloat(document.getElementById('margenGlobal').value) || 30;
    productosDetectados.forEach(p => { p.margen = margen; });
    
    const tbody = document.getElementById('tbodyProductosEdit');
    tbody.innerHTML = productosDetectados.map((p, i) => filaProductoEditable(p, i)).join('');
    adjuntarEventosProductos();
    mostrarToast(`✅ Margen ${margen}% aplicado`, 'success');
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

    let agregados = 0, actualizados = 0, errores = 0;

    for (const prod of productosDetectados) {
        if (!prod.nombre || prod.nombre.trim() === '') continue;

        const nombreNorm = normalizarNombre(prod.nombre);
        
        let precioUnitarioReal = prod.precio_unitario;
        if (prod.unidades_caja > 1) {
            precioUnitarioReal = prod.precio_unitario / prod.unidades_caja;
        }
        
        const precioVenta = precioUnitarioReal * (1 + (prod.margen || 30) / 100);

        try {
            const { data: existentes, error: errBuscar } = await supabaseClient
                .from('productos')
                .select('*')
                .eq('nombre_normalizado', nombreNorm)
                .limit(1);

            if (errBuscar) { errores++; continue; }

            if (existentes && existentes.length > 0) {
                const existente = existentes[0];
                const nuevoStock = parseFloat(existente.stock || 0) + parseFloat(prod.cantidad || 0);

                const { error: errUpdate } = await supabaseClient.from('productos').update({
                    stock: nuevoStock,
                    precio_compra_usd: precioUnitarioReal,
                    precio_venta_usd: parseFloat(precioVenta.toFixed(4)),
                    margen: prod.margen || 30,
                    iva: prod.exento ? 0 : (parseFloat(prod.iva) || 16),
                    exento: prod.exento || false,
                    unidades_caja: prod.unidades_caja || 0,
                    precio_caja_usd: prod.precio_caja || 0,
                    ultimo_proveedor: proveedor,
                    ultima_factura: numeroFactura,
                    ultima_fecha: new Date().toLocaleDateString('es-VE'),
                    updated_at: new Date().toISOString()
                }).eq('id', existente.id);

                if (errUpdate) { errores++; }
                else actualizados++;
            } else {
                const { error: errInsert } = await supabaseClient.from('productos').insert([{
                    id: Date.now() + Math.floor(Math.random() * 100000),
                    nombre: prod.nombre,
                    nombre_normalizado: nombreNorm,
                    stock: prod.cantidad,
                    unidad: prod.unidad || 'UND',
                    precio_compra_usd: precioUnitarioReal,
                    precio_venta_usd: parseFloat(precioVenta.toFixed(4)),
                    margen: prod.margen || 30,
                    iva: prod.exento ? 0 : (parseFloat(prod.iva) || 16),
                    exento: prod.exento || false,
                    unidades_caja: prod.unidades_caja || 0,
                    precio_caja_usd: prod.precio_caja || 0,
                    ultimo_proveedor: proveedor,
                    ultima_factura: numeroFactura,
                    ultima_fecha: new Date().toLocaleDateString('es-VE'),
                    created_at: new Date().toISOString()
                }]);

                if (errInsert) { errores++; }
                else agregados++;
            }
        } catch (e) {
            console.error("Error en producto:", e);
            errores++;
        }
    }

    facturaTemporalParaProductos = productosDetectados.map(p => {
        let precioReal = p.precio_unitario;
        if (p.unidades_caja > 1) precioReal = p.precio_unitario / p.unidades_caja;
        return {
            nombre: p.nombre,
            cantidad: p.cantidad,
            unidad: p.unidad,
            precio_unitario: precioReal,
            iva: p.iva,
            exento: p.exento,
            margen: p.margen,
            precio_venta: precioReal * (1 + (p.margen || 30) / 100)
        };
    });

    if (errores > 0) {
        mostrarToast(`⚠️ ${agregados} nuevos, ${actualizados} actualizados, ${errores} errores`, 'error');
    } else {
        mostrarToast(`✅ ${agregados} nuevos, ${actualizados} actualizados`, 'success');
    }

    cerrarModalProductos();
    await cargarDatos();
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
