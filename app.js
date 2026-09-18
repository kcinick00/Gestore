// ============================================
// GESTORE - Lógica principal
// ============================================

// ⚠️ CONFIGURACIÓN DE SUPABASE
// ⚠️ Verifica que estos valores sean EXACTAMENTE los de tu proyecto
const SUPABASE_URL = "https://kpsurjxypipxtjizlyon.supabase.co";
const SUPABASE_KEY = "sb_publishable_sA8BVuihO3RaIcZrqTPzyA_HkYahfV5";

// Verificación inicial
console.log("🔧 Configuración:");
console.log("  URL:", SUPABASE_URL);
console.log("  Key (primeros 30):", SUPABASE_KEY.substring(0, 30) + "...");

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
const DIAS_VENCIMIENTO = 30;
let datos = { facturas: [], pagos: [] };
let filtros = { facturas: { texto: '', estatus: 'todos' }, pagos: { texto: '' } };
let tasaActual = null;

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Gestore iniciado");
    configurarEventos();
    cargarTasa();
    cargarDatos();
});

function configurarEventos() {
    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => cambiarTab(tab.dataset.tab));
    });

    // Botón refresh
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

    // Chips de estatus
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filtros.facturas.estatus = chip.dataset.estatus;
            renderizarFacturas();
        });
    });

    // FAB nueva factura
    document.getElementById('fabNuevaFactura').addEventListener('click', () => abrirModalFactura());

    // Modal factura
    document.getElementById('btnCerrarModal').addEventListener('click', cerrarModalFactura);
    document.getElementById('btnCancelarFactura').addEventListener('click', cerrarModalFactura);
    document.getElementById('btnGuardarFactura').addEventListener('click', guardarFactura);

    // Modal detalle
    document.getElementById('btnCerrarDetalle').addEventListener('click', () => {
        document.getElementById('modalDetalle').classList.add('hidden');
    });

    // Form factura: sin número
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

    // Form factura: cálculo equivalente
    document.getElementById('formMontoUSD').addEventListener('input', actualizarEquivalente);

    // Cerrar modal al tocar overlay
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.add('hidden');
            }
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
// CARGAR DATOS DE SUPABASE
// ============================================
async function cargarDatos() {
    if (!supabaseClient) {
        console.error("❌ No hay cliente Supabase");
        mostrarToast('Error: cliente Supabase no inicializado', 'error');
        return;
    }

    try {
        console.log("📥 Cargando datos desde Supabase...");

        const facturasResp = await supabaseClient
            .from('facturas')
            .select('*')
            .order('fecha', { ascending: false });

        if (facturasResp.error) {
            console.error("❌ Error facturas:", JSON.stringify(facturasResp.error, null, 2));
            throw facturasResp.error;
        }

        const pagosResp = await supabaseClient
            .from('pagos')
            .select('*')
            .order('fecha', { ascending: false });

        if (pagosResp.error) {
            console.error("❌ Error pagos:", JSON.stringify(pagosResp.error, null, 2));
            throw pagosResp.error;
        }

        datos.facturas = (facturasResp.data || []).map(dbToFactura);
        datos.pagos = (pagosResp.data || []).map(dbToPago);

        console.log(`✅ Cargados: ${datos.facturas.length} facturas, ${datos.pagos.length} pagos`);

        renderizarFacturas();
        renderizarPagos();
        actualizarEstadisticas();
        actualizarBadge();
    } catch (error) {
        console.error('❌ Error al cargar:', error);
        mostrarToast('Error al cargar datos: ' + (error.message || 'desconocido'), 'error');
    }
}

// ============================================
// CONVERSIÓN DE DATOS
// ============================================
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

function facturaToDB(f) {
    return {
        fecha: f.fecha,
        proveedor: f.proveedor,
        numero_factura: f.numeroFactura || 'S/N',
        monto_usd: f.montoUSD ? parseFloat(f.montoUSD) : null,
        monto_bs: f.montoBs ? parseFloat(f.montoBs) : null,
        tasa_bcv: f.tasaBCV,
        estatus: f.estatus,
        notas: f.notas || '',
        updated_at: new Date().toISOString()
    };
}

// ============================================
// TASA BCV (CON PROXY CORS)
// ============================================
async function cargarTasa() {
    const info = document.getElementById('tasaInfo');
    info.textContent = 'Consultando tasa BCV...';

    // Intentamos con el proxy CORS público (evita bloqueos del navegador)
    const urls = [
        // Proxy 1: AllOrigins
        'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://bcv.justcarlux.dev/api/v1/rates'),
        // Proxy 2: CorsProxy.io (fallback)
        'https://corsproxy.io/?' + encodeURIComponent('https://bcv.justcarlux.dev/api/v1/rates'),
        // Intento directo (fallback por si el servidor ya permite CORS)
        'https://bcv.justcarlux.dev/api/v1/rates'
    ];

    let exito = false;

    for (const url of urls) {
        try {
            console.log("🌐 Consultando tasa en:", url.substring(0, 60) + "...");
            const resp = await fetch(url);
            
            if (!resp.ok) {
                console.warn("⚠️ Respuesta no OK:", resp.status);
                continue;
            }

            const data = await resp.json();
            
            if (data && data.rates && data.rates.usd) {
                tasaActual = data.rates.usd;
                const fecha = new Date(data.updatedAt).toLocaleString('es-VE', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                });
                info.textContent = `💱 Tasa BCV: ${tasaActual.toFixed(2)} Bs/USD · ${fecha}`;
                console.log("✅ Tasa obtenida:", tasaActual);
                exito = true;
                break;
            }
        } catch (e) {
            console.warn("⚠️ Error con", url.substring(0, 40) + "...:", e.message);
        }
    }

    if (!exito) {
        info.textContent = '⚠️ Tasa BCV no disponible';
        console.error("❌ No se pudo obtener la tasa por ningún método");
    }
}

// ============================================
// RENDERIZAR FACTURAS
// ============================================
function renderizarFacturas() {
    const lista = document.getElementById('listaFacturas');
    const filtradas = filtrarFacturas(datos.facturas);

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

function filtrarFacturas(lista) {
    return lista.filter(f => {
        if (filtros.facturas.texto) {
            const t = filtros.facturas.texto;
            const coincide = 
                (f.proveedor || '').toLowerCase().includes(t) ||
                (f.numeroFactura || '').toLowerCase().includes(t) ||
                (f.notas || '').toLowerCase().includes(t) ||
                (f.montoUSD || '').includes(t) ||
                (f.fecha || '').includes(t);
            if (!coincide) return false;
        }
        if (filtros.facturas.estatus !== 'todos') {
            if (calcularEstatusReal(f) !== filtros.facturas.estatus) return false;
        }
        return true;
    });
}

// ============================================
// RENDERIZAR PAGOS
// ============================================
function renderizarPagos() {
    const lista = document.getElementById('listaPagos');
    const filtrados = filtrarPagos(datos.pagos);

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

function filtrarPagos(lista) {
    return lista.filter(p => {
        if (filtros.pagos.texto) {
            const t = filtros.pagos.texto;
            return (p.beneficiario || '').toLowerCase().includes(t) ||
                   (p.numeroRecibo || '').toLowerCase().includes(t) ||
                   (p.notas || '').toLowerCase().includes(t) ||
                   (p.monto || '').includes(t) ||
                   (p.fecha || '').includes(t);
        }
        return true;
    });
}

// ============================================
// DETALLE
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

    let acciones = `
        <button class="btn btn-secondary" id="btnEditarDetalle">✏️ Editar</button>
    `;
    if (estatusReal !== 'Pagada') {
        acciones += `<button class="btn btn-primary" id="btnMarcarPagada">✅ Marcar Pagada</button>`;
    }
    acciones += `<button class="btn btn-danger" id="btnEliminarDetalle">🗑️ Eliminar</button>`;

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
// MODAL FACTURA (Nueva / Editar)
// ============================================
let facturaEditando = null;

function abrirModalFactura(factura = null) {
    facturaEditando = factura;
    const modal = document.getElementById('modalFactura');
    const titulo = document.getElementById('modalTitulo');

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
        const { error } = await supabaseClient
            .from('facturas')
            .update({ 
                estatus: 'Pagada', 
                fecha_pago: new Date().toLocaleDateString('es-VE'),
                updated_at: new Date().toISOString()
            })
            .eq('id', factura.id);
        if (error) throw error;
        mostrarToast('✅ Factura marcada como pagada', 'success');
        document.getElementById('modalDetalle').classList.add('hidden');
        cargarDatos();
    } catch (error) {
        mostrarToast('Error: ' + error.message, 'error');
    }
}

async function eliminarFactura(factura) {
    if (!confirm(`¿Eliminar la factura de ${factura.proveedor}?\n\nEsta acción no se puede deshacer.`)) return;

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
    if (!confirm(`¿Eliminar el pago a ${pago.beneficiario}?\n\nEsta acción no se puede deshacer.`)) return;

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
// ESTADÍSTICAS
// ============================================
function actualizarEstadisticas() {
    let pendUSD = 0, pendBs = 0, vencUSD = 0, vencBs = 0, pagUSD = 0, pagBs = 0;

    datos.facturas.forEach(f => {
        const usd = parseFloat(f.montoUSD) || 0;
        const bs = parseFloat(f.montoBs) || 0;
        const est = calcularEstatusReal(f);
        if (est === 'Pagada') { pagUSD += usd; pagBs += bs; }
        else if (est === 'Vencida') { vencUSD += usd; vencBs += bs; }
        else { pendUSD += usd; pendBs += bs; }
    });

    document.getElementById('statPendientes').textContent = '$' + pendUSD.toFixed(2);
    document.getElementById('statPendientesBs').textContent = formatearMontoBs(pendBs) + ' Bs';
    document.getElementById('statVencidas').textContent = '$' + vencUSD.toFixed(2);
    document.getElementById('statVencidasBs').textContent = formatearMontoBs(vencBs) + ' Bs';
    document.getElementById('statPagadas').textContent = '$' + pagUSD.toFixed(2);
    document.getElementById('statPagadasBs').textContent = formatearMontoBs(pagBs) + ' Bs';

    let totalBs = 0, totalUSD = 0;
    const hoy = new Date();
    let pagosMes = 0, pagosMesBs = 0;

    datos.pagos.forEach(p => {
        const bs = parseFloat(String(p.monto).replace(/\./g, '').replace(',', '.')) || 0;
        totalBs += bs;
        totalUSD += parseFloat(p.montoUSD) || 0;

        const [d, m, y] = p.fecha.split('/').map(Number);
        if (m - 1 === hoy.getMonth() && y === hoy.getFullYear()) {
            pagosMes++;
            pagosMesBs += bs;
        }
    });

    document.getElementById('statTotalPagos').textContent = formatearMontoBs(totalBs) + ' Bs';
    document.getElementById('statTotalPagosUSD').textContent = '$' + totalUSD.toFixed(2);
    document.getElementById('statPagosMes').textContent = pagosMes;
    document.getElementById('statPagosMesBs').textContent = formatearMontoBs(pagosMesBs) + ' Bs';
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
// UTILIDADES
// ============================================
function calcularEstatusReal(f) {
    if (f.estatus === 'Pagada') return 'Pagada';
    const [d, m, y] = f.fecha.split('/').map(Number);
    const fechaF = new Date(y, m - 1, d);
    const diff = Math.floor((new Date() - fechaF) / (1000 * 60 * 60 * 24));
    if (diff > DIAS_VENCIMIENTO) return 'Vencida';
    return 'Pendiente';
}

function diasDesdeFactura(f) {
    const [d, m, y] = f.fecha.split('/').map(Number);
    const fechaF = new Date(y, m - 1, d);
    return Math.floor((new Date() - fechaF) / (1000 * 60 * 60 * 24));
}

function getIconoEstatus(est) {
    if (est === 'Pagada') return '🟢';
    if (est === 'Vencida') return '🔴';
    return '🟡';
}

function formatearMontoBs(monto) {
    if (!monto) return '0,00';
    let num = typeof monto === 'number' ? monto : parseFloat(String(monto).replace(',', '.'));
    if (isNaN(num)) return '0,00';
    let str = num.toFixed(2);
    let [ent, dec] = str.split('.');
    ent = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${ent},${dec}`;
}

function escapeHtml(texto) {
    if (!texto) return '';
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}

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
