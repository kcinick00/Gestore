// ============================================
// IMPORTAR PAGOS DESDE PDFs DE BANESCO - PWA v8.0
// Adaptado para PWA: sin chrome.runtime, usa Supabase directo
// Requiere: tasas-bcv.js (buscarTasaEnHistoricoLocal)
// Requiere: window.supabaseClient (creado en app.js)
// ============================================

// Configurar PDF.js worker (ruta local)
if (typeof pdfjsLib !== 'undefined') {
    try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = './libs/pdf.worker.min.js';
        console.log('✅ PDF.js worker configurado (local)');
    } catch (e) {
        console.warn('⚠️ No se pudo configurar PDF.js worker:', e.message);
    }
}

// ============================================
// ESTADO DEL IMPORTADOR
// ============================================
window.pagosParseadosPwa = [];

// ============================================
// GENERAR ID ÚNICO
// ============================================
function generarIdUnicoPwa() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return parseInt(`${timestamp}${random.toString().padStart(3, '0')}`);
}

// ============================================
// EXTRAER TEXTO DE UN PDF
// ============================================
async function extraerTextoDePDFPwa(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let textoCompleto = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const textoPagina = textContent.items.map(item => item.str).join(' ');
        textoCompleto += textoPagina + '\n';
    }
    
    return textoCompleto;
}

// ============================================
// PARSEAR PDF DE BANESCO
// ============================================
function parsearPDFBanescoPwa(texto, nombreArchivo) {
    const datos = {
        archivo: nombreArchivo,
        fecha: null,
        cuentaAfectada: null,
        cuentaBeneficiaria: null,
        montoBs: null,
        beneficiario: null,
        concepto: null,
        resultado: null,
        confianza: 'baja',
        error: null
    };
    
    try {
        const matchFecha = texto.match(/Fecha[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i);
        if (matchFecha) datos.fecha = matchFecha[1];
        
        const matchCuentaAfectada = texto.match(/Cuenta\s+Cliente\s+Afectada[:\s]+([\d\-\*]+)/i);
        if (matchCuentaAfectada) datos.cuentaAfectada = matchCuentaAfectada[1].trim();
        
        const matchCuentaBenef = texto.match(/Cuenta\s+Cliente\s+Beneficiaria[:\s]+([\d\-\*]+)/i);
        if (matchCuentaBenef) datos.cuentaBeneficiaria = matchCuentaBenef[1].trim();
        
        const matchMonto = texto.match(/Monto[:\s]+([\d.,]+)/i);
        if (matchMonto) {
            const montoStr = matchMonto[1].trim();
            datos.montoBs = parseFloat(montoStr.replace(/\./g, '').replace(',', '.'));
        }
        
        const matchBenef = texto.match(/Beneficiario[:\s]+([A-ZÁÉÍÓÚÑ0-9\s\.,&]+?)(?=\s+(?:Concepto|Resultado|Monto|Fecha|$))/i);
        if (matchBenef) datos.beneficiario = matchBenef[1].trim().replace(/\s+/g, ' ');
        
        const matchConcepto = texto.match(/Concepto[:\s]+([^\n]+?)(?=\s+(?:Resultado|Fecha|Monto|$))/i);
        if (matchConcepto) datos.concepto = matchConcepto[1].trim();
        
        const matchResultado = texto.match(/Resultado[:\s]+([^\n]+?)(?=\s+(?:$))/i);
        if (matchResultado) datos.resultado = matchResultado[1].trim();
        
        if (datos.fecha && datos.montoBs && datos.beneficiario) {
            datos.confianza = 'alta';
        } else if (datos.fecha && datos.montoBs) {
            datos.confianza = 'media';
        } else {
            datos.confianza = 'baja';
            datos.error = 'Faltan campos clave (fecha, monto o beneficiario)';
        }
        
    } catch (e) {
        console.error('Error al parsear PDF:', e);
        datos.error = 'Error al parsear: ' + e.message;
    }
    
    return datos;
}

// ============================================
// BUSCAR TASA BCV (usa histórico local + Supabase)
// ============================================
async function buscarTasaBCVPwa(fechaISO) {
    // 1. Buscar en histórico local (tasas-bcv.js)
    if (typeof buscarTasaEnHistoricoLocal === 'function') {
        const tasaLocal = buscarTasaEnHistoricoLocal(fechaISO);
        if (tasaLocal) {
            console.log(`✅ Tasa ${fechaISO} desde histórico local: ${tasaLocal}`);
            return { tasa: tasaLocal, fuente: 'histórico local' };
        }
    }

    // 2. Buscar en Supabase (tabla tasas_bcv_historico)
    try {
        const client = window.supabaseClient;
        if (client) {
            const { data, error } = await client
                .from('tasas_bcv_historico')
                .select('tasa')
                .eq('fecha', fechaISO)
                .maybeSingle();

            if (!error && data && data.tasa) {
                console.log(`✅ Tasa ${fechaISO} desde Supabase: ${data.tasa}`);
                return { tasa: parseFloat(data.tasa), fuente: 'Supabase' };
            }
        }
    } catch (e) {
        console.warn('⚠️ Error buscando tasa en Supabase:', e.message);
    }

    // 3. Fallback: buscar día anterior en histórico local
    if (typeof buscarTasaEnHistoricoLocal === 'function') {
        const date = new Date(fechaISO + 'T00:00:00');
        for (let i = 1; i <= 7; i++) {
            date.setDate(date.getDate() - 1);
            const key = date.toISOString().split('T')[0];
            const tasa = buscarTasaEnHistoricoLocal(key);
            if (tasa) {
                console.log(`⚠️ ${fechaISO} no tiene tasa, usando ${key}: ${tasa}`);
                return { tasa, fuente: `histórico (${key})` };
            }
        }
    }

    return { tasa: null, fuente: 'No disponible' };
}

// ============================================
// PROCESAR TODOS LOS PDFs SELECCIONADOS
// ============================================
async function procesarTodosLosPDFsPwa(files, callbackProgreso) {
    const resultados = [];
    const total = files.length;
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        if (callbackProgreso) {
            callbackProgreso({
                actual: i + 1,
                total: total,
                archivo: file.name,
                fase: 'Extrayendo texto'
            });
        }
        
        try {
            const texto = await extraerTextoDePDFPwa(file);
            const datos = parsearPDFBanescoPwa(texto, file.name);
            
            if (datos.fecha && datos.montoBs) {
                const fechaISO = fechaLatinaToISOPwa(datos.fecha);
                if (fechaISO) {
                    const { tasa, fuente } = await buscarTasaBCVPwa(fechaISO);
                    
                    datos.tasaBCV = tasa;
                    datos.fuenteTasa = fuente;
                    datos.fechaISO = fechaISO;
                    
                    if (tasa && datos.montoBs) {
                        datos.montoUSD = parseFloat((datos.montoBs / tasa).toFixed(2));
                    }
                }
            }
            
            resultados.push(datos);
            
        } catch (e) {
            console.error(`Error procesando ${file.name}:`, e);
            resultados.push({
                archivo: file.name,
                error: 'Error: ' + e.message,
                confianza: 'baja'
            });
        }
    }
    
    // Verificar duplicados contra Supabase
    await verificarDuplicadosPwa(resultados);

    window.pagosParseadosPwa = resultados;
    return resultados;
}

// ============================================
// FECHA DD/MM/YYYY → YYYY-MM-DD
// ============================================
function fechaLatinaToISOPwa(fecha) {
    if (!fecha) return null;
    const partes = fecha.split('/');
    if (partes.length !== 3) return null;
    const [d, m, y] = partes;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// ============================================
// VERIFICAR DUPLICADOS
// ============================================
async function verificarDuplicadosPwa(pagos) {
    try {
        const client = window.supabaseClient;
        if (!client) return pagos;

        const { data, error } = await client
            .from('pagos')
            .select('fecha, monto, beneficiario');

        if (error || !data) {
            console.warn('⚠️ No se pudieron cargar pagos para verificar duplicados');
            return pagos;
        }

        const existentes = new Set(
            data.map(p => {
                const montoStr = p.monto != null ? parseFloat(p.monto) : 0;
                return `${p.fecha}|${montoStr}|${(p.beneficiario || '').toLowerCase().trim()}`;
            })
        );

        pagos.forEach(p => {
            if (p.fecha && p.montoBs && p.beneficiario) {
                const clave = `${p.fecha}|${p.montoBs}|${p.beneficiario.toLowerCase().trim()}`;
                p.esDuplicado = existentes.has(clave);
            } else {
                p.esDuplicado = false;
            }
        });

        return pagos;
    } catch (e) {
        console.error('Error verificando duplicados:', e);
        return pagos;
    }
}

// ============================================
// GUARDAR PAGOS IMPORTADOS
// ============================================
async function guardarPagosImportadosPwa(pagos) {
    const client = window.supabaseClient;
    if (!client) {
        return { success: false, error: 'Supabase no inicializado', insertados: 0, errores: 0 };
    }

    const pagosAInsertar = pagos
        .filter(p => !p.error && !p.esDuplicado && p.confianza !== 'baja')
        .map(p => ({
            id: generarIdUnicoPwa(),
            numero_recibo: 'PDF-' + (p.archivo || '').replace(/\.pdf$/i, '').substring(0, 20),
            fecha: p.fecha,
            beneficiario: p.beneficiario || 'Sin nombre',
            monto: p.montoBs,
            monto_usd: p.montoUSD || null,
            tasa_bcv: p.tasaBCV || null,
            concepto: p.concepto || 'Transferencia',
            resultado: p.resultado || 'Operación Exitosa',
            notas: `Importado desde PDF: ${p.archivo}`,
            tipo_pago: 'transferencia',
            banco_receptor: 'Banesco',
            cuenta_afectada: p.cuentaAfectada || null,
            cuenta_beneficiaria: p.cuentaBeneficiaria || null,
            created_at: new Date().toISOString()
        }));

    if (pagosAInsertar.length === 0) {
        return { success: true, insertados: 0, errores: 0 };
    }

    try {
        const { error } = await client.from('pagos').insert(pagosAInsertar);

        if (error) {
            console.error('Error insertando pagos:', error);
            return { success: false, error: error.message, insertados: 0, errores: pagosAInsertar.length };
        }

        return { success: true, insertados: pagosAInsertar.length, errores: 0 };
    } catch (e) {
        console.error('Error inesperado:', e);
        return { success: false, error: e.message, insertados: 0, errores: pagosAInsertar.length };
    }
}

// Exponer al window para app.js
window.procesarTodosLosPDFsPwa = procesarTodosLosPDFsPwa;
window.guardarPagosImportadosPwa = guardarPagosImportadosPwa;
