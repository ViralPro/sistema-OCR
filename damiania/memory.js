
// Detección automática de entorno estático (file:// o GitHub Pages) para evitar errores de CORS con PHP
const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';
const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
const isStaticEnvironment = isFileProtocol || isGitHubPages;
const CONFIG = {
    itemsPerPage: 10,
    apiEndpoint2: 'sistema-OCR/welcome.php',
    apiEndpoint: 'welcome.php'
};

const dom = {
    menuToggle: document.getElementById('menuToggle'),
    menuDropdown: document.getElementById('menuDropdown'),
    homeBtn: document.getElementById('homeBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    searchInput: document.getElementById('searchInput'),
    invoicesBody: document.getElementById('invoicesBody'),
    prevPageBtn: document.getElementById('prevPageBtn'),
    nextPageBtn: document.getElementById('nextPageBtn'),
    pageInfo: document.getElementById('pageInfo'),
    deleteModal: document.getElementById('deleteModal'),
    deleteMessage: document.getElementById('deleteMessage'),
    detailModal: document.getElementById('detailModal'),
    detailContent: document.getElementById('detailContent'),
    editModal: document.getElementById('editModal'),
    editContent: document.getElementById('editContent'),
    altaProductoModal: document.getElementById('altaProductoModal'),
    closeAltaProducto: document.getElementById('closeAltaProducto'),
    cancelDelete: document.getElementById('cancelDelete'),
    confirmDelete: document.getElementById('confirmDelete'),
    closeDetail: document.getElementById('closeDetail'),
    closeEdit: document.getElementById('closeEdit')
};

let state = {
    invoices: [],
    filteredInvoices: [],
    currentPage: 1,
    totalPages: 1,
    currentSearch: '',
    isLoading: false,
    deleteId: null,
    editId: null,
    editingInvoice: null
};

// Variable para el alta de producto
let pendingAlta = {
    proveedor_id: null,
    codigo_proveedor: null,
    descripcion: null,
    itemIndex: null,
    row: null
};

document.addEventListener('DOMContentLoaded', init);

function init() {
    setupMenu();
    setupListeners();
    loadInvoices();
}

function setupMenu() {
    if (!dom.menuToggle) return;
    dom.menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        dom.menuDropdown.classList.toggle('hidden');
        dom.menuDropdown.classList.toggle('opacity-0');
        dom.menuDropdown.classList.toggle('-translate-y-2');
    });
    dom.homeBtn?.addEventListener('click', () => window.location.href = 'index.html');
    dom.refreshBtn?.addEventListener('click', loadInvoices);
    document.addEventListener('click', (e) => {
        if (!dom.menuToggle?.contains(e.target) && !dom.menuDropdown?.contains(e.target)) {
            dom.menuDropdown?.classList.add('hidden', 'opacity-0', '-translate-y-2');
        }
    });
}

function setupListeners() {
    dom.searchInput?.addEventListener('input', debounce(() => {
        state.currentSearch = dom.searchInput.value.toLowerCase();
        filterAndRender();
    }, 300));

    dom.prevPageBtn?.addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            renderTable();
        }
    });

    dom.nextPageBtn?.addEventListener('click', () => {
        if (state.currentPage < state.totalPages) {
            state.currentPage++;
            renderTable();
        }
    });

    dom.cancelDelete?.addEventListener('click', () => {
        dom.deleteModal.classList.add('hidden');
        state.deleteId = null;
    });

    dom.confirmDelete?.addEventListener('click', confirmDelete);
    dom.closeDetail?.addEventListener('click', () => dom.detailModal.classList.add('hidden'));
    dom.closeEdit?.addEventListener('click', () => dom.editModal.classList.add('hidden'));
    dom.closeAltaProducto?.addEventListener('click', cerrarAltaProducto);

    [dom.deleteModal, dom.detailModal, dom.editModal, dom.altaProductoModal].forEach(modal => {
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            dom.deleteModal.classList.add('hidden');
            dom.detailModal.classList.add('hidden');
            dom.editModal.classList.add('hidden');
            dom.altaProductoModal.classList.add('hidden');
        }
    });
}

async function loadInvoices() {
    if (state.isLoading) return;
    state.isLoading = true;
    showLoading(true);

    if (!isStaticEnvironment) {
        try {
            const url = new URL(CONFIG.apiEndpoint, window.location.href);
            url.searchParams.append('action', 'get_facturas');
            url.searchParams.append('page', state.currentPage);
            url.searchParams.append('perPage', CONFIG.itemsPerPage);
            if (state.currentSearch) url.searchParams.append('search', state.currentSearch);
            url.searchParams.append('_', Date.now());

            const response = await fetch(url, {
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            });

            if (response.ok) {
                const data = await response.json();
                if (data && data.success) {
                    state.invoices = data.data || [];
                    state.filteredInvoices = [...state.invoices];
                    state.totalPages = data.pagination?.totalPages || 1;
                    filterAndRender();
                    return;
                }
            }
        } catch (error) {
            console.warn('Cargando facturas de almacenamiento local:', error);
        } finally {
            state.isLoading = false;
            showLoading(false);
        }
    }

    state.isLoading = false;
    showLoading(false);

    // Modo local / GitHub Pages / file://
    const local = JSON.parse((localStorage.getItem('facturas_ocr') || localStorage.getItem('verdevoto_facturas')) || '[]');
    state.invoices = local;
    state.filteredInvoices = [...local];
    state.totalPages = Math.ceil(local.length / CONFIG.itemsPerPage) || 1;
    filterAndRender();
}

function filterAndRender() {
    let filtered = [...state.invoices];

    if (state.currentSearch) {
        filtered = filtered.filter(invoice => {
            const proveedorBD = invoice.proveedor_data?.nombre || '';
            return (invoice.numero_factura && invoice.numero_factura.toLowerCase().includes(state.currentSearch)) ||
                (invoice.proveedor && invoice.proveedor.toLowerCase().includes(state.currentSearch)) ||
                (proveedorBD.toLowerCase().includes(state.currentSearch));
        });
    }

    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    state.filteredInvoices = filtered;
    state.totalPages = Math.ceil(filtered.length / CONFIG.itemsPerPage);
    state.currentPage = Math.min(state.currentPage, state.totalPages || 1);
    renderTable();
}

function renderTable() {
    if (!dom.invoicesBody) return;

    const startIndex = (state.currentPage - 1) * CONFIG.itemsPerPage;
    const endIndex = startIndex + CONFIG.itemsPerPage;
    const pageInvoices = state.filteredInvoices.slice(startIndex, endIndex);

    updatePagination();

    if (pageInvoices.length === 0) {
        dom.invoicesBody.innerHTML = `<tr><td colspan="9" class="px-6 py-12 text-center text-gray-500">
            <span class="material-icons text-4xl mb-2">inbox</span>
            <p>${state.invoices.length === 0 ? 'No hay facturas procesadas' : 'No se encontraron resultados'}</p>
        </td></tr>`;
        return;
    }

    let html = '';
    pageInvoices.forEach((invoice) => {
        const fechaFactura = invoice.fecha_emision ? formatDate(invoice.fecha_emision) : '—';
        const fechaCarga = invoice.created_at ? formatDateTime(invoice.created_at) : '—';
        const monto = invoice.monto ? formatCurrency(invoice.monto) : '$0';
        const enrichedData = parseEnrichedData(invoice.extra);
        const itemsEncontrados = enrichedData?.items?.filter(i => i.encontrado).length || 0;
        const totalItems = enrichedData?.items?.length || 0;
        const proveedorMostrar = invoice.proveedor_data?.nombre || invoice.proveedor || '—';
        let estadoClass = getEstadoClass(invoice.estado);

        html += `<tr class="hover:bg-gray-50 transition-colors">
            <td class="px-6 py-4 text-sm text-gray-600">${invoice.id}</td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-2">
                    <span class="material-icons text-gray-400">receipt</span>
                    <span class="text-sm font-medium">${invoice.numero_factura || `Factura ${invoice.id}`}</span>
                </div>
            </td>
            <td class="px-6 py-4 text-sm">${proveedorMostrar}</td>
            <td class="px-6 py-4 text-sm text-gray-500">${fechaFactura}</td>
            <td class="px-6 py-4 text-sm text-gray-500">${fechaCarga}</td>
            <td class="px-6 py-4 text-sm font-medium">${monto}</td>
            <td class="px-6 py-4">
                <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${itemsEncontrados === totalItems ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                    ${itemsEncontrados}/${totalItems}
                </span>
            </td>
            <td class="px-6 py-4">
                <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${estadoClass}">${invoice.estado || 'pendiente'}</span>
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-2">
                    <button onclick="viewDetail(${invoice.id})" class="text-blue-600 hover:text-blue-800 p-1 rounded-full hover:bg-blue-50 transition" title="Ver detalle">
                        <span class="material-icons">visibility</span>
                    </button>
                    <button onclick="editInvoice(${invoice.id})" class="text-yellow-600 hover:text-yellow-800 p-1 rounded-full hover:bg-yellow-50 transition" title="Editar">
                        <span class="material-icons">edit</span>
                    </button>
                    <button onclick="askDelete(${invoice.id})" class="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-red-50 transition" title="Eliminar">
                        <span class="material-icons">delete</span>
                    </button>
                </div>
            </td>
        </tr>`;
    });

    dom.invoicesBody.innerHTML = html;
}

// Función para editar factura
window.editInvoice = async (id) => {
    if (!dom.detailModal.classList.contains('hidden')) {
        dom.detailModal.classList.add('hidden');
    }
    
    const invoice = state.invoices.find(i => i.id == id);
    if (!invoice || !dom.editContent) return;

    state.editId = id;
    state.editingInvoice = JSON.parse(JSON.stringify(invoice)); // Clonar

    const enrichedData = parseEnrichedData(invoice.extra) || {};
    const items = parseItems(invoice.items);
    const itemsProcesados = enrichedData?.items || [];

    // Obtener proveedor_id de diferentes fuentes
    let proveedorId = enrichedData?.proveedor_id;
    if (!proveedorId && invoice.proveedor_data?.id) {
        proveedorId = invoice.proveedor_data.id;
    }

    let html = `
        <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
            <div class="flex">
                <span class="material-icons text-yellow-400 mr-3">info</span>
                <p class="text-sm text-yellow-700">
                    Corrige los códigos de producto y haz clic en "Revalidar" para buscar nuevamente coincidencias en la base de datos.
                    Si un producto no se encuentra, puedes darlo de alta usando el botón verde.
                </p>
            </div>
        </div>
        
        <div class="space-y-6">
            <div class="bg-gray-50 p-4 rounded-lg">
                <div class="flex justify-between items-center mb-4">
                    <h4 class="font-bold">Datos de la Factura</h4>
                    ${proveedorId ? `<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Proveedor ID: ${proveedorId}</span>` : ''}
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label class="block text-xs text-gray-500 uppercase mb-1">Número Factura</label>
                        <input type="text" id="edit_numero" value="${escapeHtml(invoice.numero_factura || '')}" 
                               class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-yellow-500">
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 uppercase mb-1">Fecha Emisión</label>
                        <input type="date" id="edit_fecha" value="${invoice.fecha_emision || ''}" 
                               class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-yellow-500">
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 uppercase mb-1">Proveedor</label>
                        <input type="text" id="edit_proveedor" value="${escapeHtml(invoice.proveedor || '')}" 
                               class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-yellow-500">
                    </div>
                </div>
                <!-- Campo oculto con proveedor_id -->
                <input type="hidden" id="edit_proveedor_id" value="${proveedorId || ''}">
            </div>
            
            <div>
<div class="flex justify-between items-center mb-4">
    <h4 class="font-bold">Productos</h4>
    <div class="flex items-center gap-3">
        <button onclick="agregarItem()" 
                class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition">
            <span class="material-icons text-sm">add</span>
            Agregar Producto
        </button>
        <span id="items-counter" class="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
            ${itemsProcesados.filter(i => i.encontrado).length || 0}/${items.length} encontrados
        </span>
        <button onclick="revalidateItems(${id})" 
                class="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition">
            <span class="material-icons text-sm">sync</span>
            Revalidar Productos
        </button>
    </div>
</div>
                
                <div class="overflow-x-auto border rounded-lg">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-3 text-left">Producto</th>
                                <th class="px-4 py-3 text-left">Código Proveedor</th>
                                <th class="px-4 py-3 text-left">Código Interno</th>
                                <th class="px-4 py-3 text-right">Cantidad</th>
                                <th class="px-4 py-3 text-right">P.Unit</th>
                                <th class="px-4 py-3 text-right">Subtotal</th>
                                <th class="px-4 py-3 text-center">Estado</th>
                                <th class="px-4 py-3 text-center">Acciones</th> <!-- NUEVA COLUMNA -->
                            </tr>
                        </thead>
                        <tbody class="divide-y" id="edit-items-table">`;

    // Generar filas editables
    items.forEach((item, index) => {
        const proc = itemsProcesados[index] || {};
        const bgClass = proc.encontrado ? 'bg-green-50' : '';
        const codigoInterno = proc.codigo_interno || '—';
        const encontrado = proc.encontrado ? 'Encontrado' : 'No encontrado';
        const estadoClass = proc.encontrado ? 'text-green-600' : 'text-red-600';

        // Escapar valores para HTML
        const producto = escapeHtml(item.producto || '');
        const codigo = escapeHtml(item.codigo_producto || '');
        const cantidad = item.cantidad || 0;
        const precio = item.precio_unitario || 0;
        const subtotal = item.subtotal || 0;

        html += `
            <tr class="${bgClass}" data-item-index="${index}">
                <td class="px-4 py-3">
                    <input type="text" value="${producto}" 
                           data-field="producto" class="w-full px-2 py-1 border rounded edit-item-input">
                </td>
                <td class="px-4 py-3">
                    <input type="text" value="${codigo}" 
                           data-field="codigo_producto" class="w-full px-2 py-1 border rounded edit-item-input font-mono">
                </td>
                <td class="px-4 py-3 font-mono font-medium ${proc.encontrado ? 'text-green-600' : 'text-gray-400'}">
                    ${codigoInterno}
                </td>
                <td class="px-4 py-3">
                    <input type="number" value="${cantidad}" step="0.01" min="0"
                           data-field="cantidad" class="w-full px-2 py-1 border rounded edit-item-input text-right">
                </td>
                <td class="px-4 py-3">
                    <input type="number" value="${precio}" step="0.01" min="0"
                           data-field="precio_unitario" class="w-full px-2 py-1 border rounded edit-item-input text-right">
                </td>
                <td class="px-4 py-3 text-right font-medium">
                    ${formatCurrency(subtotal)}
                </td>
                <td class="px-4 py-3 text-center ${estadoClass} text-xs font-medium">
                    ${encontrado}
                </td>
                <td class="px-4 py-3 text-center">
                    <button onclick="eliminarItem(${index})" 
                            class="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-red-50 transition" 
                            title="Eliminar producto">
                        <span class="material-icons text-lg">delete</span>
                    </button>
                </td>
            </tr>`;
    });

    html += `           </tbody>
                    </table>
                </div>
            </div>
            
            <div class="flex justify-end gap-3 pt-4 border-t sticky bottom-0 bg-white">
                <button onclick="saveEdit()" 
                        class="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg flex items-center gap-2 transition">
                    <span class="material-icons text-sm">save</span>
                    Guardar Cambios
                </button>
                <button onclick="dom.editModal.classList.add('hidden')" 
                        class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg transition">
                    Cancelar
                </button>
            </div>
        </div>`;

    dom.editContent.innerHTML = html;
    dom.editModal.classList.remove('hidden');
};

// Función para eliminar un item de la factura - HECHA GLOBAL
window.eliminarItem = function (index) {
    if (confirm('¿Estás seguro de eliminar este producto de la factura?')) {
        const row = document.querySelector(`#edit-items-table tr[data-item-index="${index}"]`);
        if (row) {
            row.remove();

            // Reindexar las filas restantes
            reindexarFilas();

            notify('Producto eliminado', 'info');
        }
    }
};

// Función para reindexar filas después de eliminar
function reindexarFilas() {
    const rows = document.querySelectorAll('#edit-items-table tr');
    let encontrados = 0;

    rows.forEach((row, newIndex) => {
        // Actualizar el índice en el atributo data
        row.setAttribute('data-item-index', newIndex);

        // Actualizar el índice en el botón de eliminar
        const deleteBtn = row.querySelector('button[onclick^="eliminarItem"]');
        if (deleteBtn) {
            deleteBtn.setAttribute('onclick', `eliminarItem(${newIndex})`);
        }

        // Actualizar el índice en el botón de alta si existe
        const altaBtn = row.querySelector('button[onclick^="abrirAltaProducto"]');
        if (altaBtn) {
            const onclick = altaBtn.getAttribute('onclick');
            // Extraer los parámetros manteniendo el nuevo índice
            const match = onclick.match(/abrirAltaProducto\(\d+, (\d+), '([^']*)', '([^']*)'\)/);
            if (match) {
                const proveedorId = match[1];
                const codigo = match[2];
                const descripcion = match[3];
                altaBtn.setAttribute('onclick', `abrirAltaProducto(${newIndex}, ${proveedorId}, '${codigo}', '${descripcion}')`);
            }
        }

        // Contar filas con fondo verde (encontradas)
        if (row.classList.contains('bg-green-50')) {
            encontrados++;
        }
    });

    // Actualizar el contador de items
    const totalItems = rows.length;
    const counter = document.getElementById('items-counter');
    if (counter) {
        counter.className = encontrados === totalItems ?
            'px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800' :
            'px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800';
        counter.textContent = `${encontrados}/${totalItems} encontrados`;
    }
}

// Función para agregar un item vacío - HECHA GLOBAL
window.agregarItem = function () {
    const tbody = document.getElementById('edit-items-table');
    const rows = tbody.querySelectorAll('tr');
    const newIndex = rows.length;

    const newRow = document.createElement('tr');
    newRow.setAttribute('data-item-index', newIndex);
    newRow.className = '';

    newRow.innerHTML = `
        <td class="px-4 py-3">
            <input type="text" value="" 
                   data-field="producto" class="w-full px-2 py-1 border rounded edit-item-input" placeholder="Nuevo producto">
        </td>
        <td class="px-4 py-3">
            <input type="text" value="" 
                   data-field="codigo_producto" class="w-full px-2 py-1 border rounded edit-item-input font-mono" placeholder="Código">
        </td>
        <td class="px-4 py-3 font-mono font-medium text-gray-400">
            —
        </td>
        <td class="px-4 py-3">
            <input type="number" value="0" step="0.01" min="0"
                   data-field="cantidad" class="w-full px-2 py-1 border rounded edit-item-input text-right">
        </td>
        <td class="px-4 py-3">
            <input type="number" value="0" step="0.01" min="0"
                   data-field="precio_unitario" class="w-full px-2 py-1 border rounded edit-item-input text-right">
        </td>
        <td class="px-4 py-3 text-right font-medium">
            $0,00
        </td>
        <td class="px-4 py-3 text-center text-red-600 text-xs font-medium">
            No encontrado
        </td>
        <td class="px-4 py-3 text-center">
            <button onclick="eliminarItem(${newIndex})" 
                    class="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-red-50 transition" 
                    title="Eliminar producto">
                <span class="material-icons text-lg">delete</span>
            </button>
        </td>
    `;

    tbody.appendChild(newRow);

    // Actualizar contador
    const totalItems = rows.length + 1;
    const encontrados = document.querySelectorAll('#edit-items-table tr.bg-green-50').length;
    const counter = document.getElementById('items-counter');
    if (counter) {
        counter.textContent = `${encontrados}/${totalItems} encontrados`;
    }

    notify('Producto agregado', 'info');
};

// Función para agregar un item vacío
window.agregarItem = () => {
    const tbody = document.getElementById('edit-items-table');
    const rows = tbody.querySelectorAll('tr');
    const newIndex = rows.length;

    const newRow = document.createElement('tr');
    newRow.setAttribute('data-item-index', newIndex);
    newRow.className = '';

    newRow.innerHTML = `
        <td class="px-4 py-3">
            <input type="text" value="" 
                   data-field="producto" class="w-full px-2 py-1 border rounded edit-item-input" placeholder="Nuevo producto">
        </td>
        <td class="px-4 py-3">
            <input type="text" value="" 
                   data-field="codigo_producto" class="w-full px-2 py-1 border rounded edit-item-input font-mono" placeholder="Código">
        </td>
        <td class="px-4 py-3 font-mono font-medium text-gray-400">
            —
        </td>
        <td class="px-4 py-3">
            <input type="number" value="0" step="0.01" min="0"
                   data-field="cantidad" class="w-full px-2 py-1 border rounded edit-item-input text-right">
        </td>
        <td class="px-4 py-3">
            <input type="number" value="0" step="0.01" min="0"
                   data-field="precio_unitario" class="w-full px-2 py-1 border rounded edit-item-input text-right">
        </td>
        <td class="px-4 py-3 text-right font-medium">
            $0,00
        </td>
        <td class="px-4 py-3 text-center text-red-600 text-xs font-medium">
            No encontrado
        </td>
        <td class="px-4 py-3 text-center">
            <button onclick="eliminarItem(${newIndex})" 
                    class="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-red-50 transition" 
                    title="Eliminar producto">
                <span class="material-icons text-lg">delete</span>
            </button>
        </td>
    `;

    tbody.appendChild(newRow);

    // Actualizar contador
    const totalItems = rows.length + 1;
    const encontrados = document.querySelectorAll('#edit-items-table tr.bg-green-50').length;
    const counter = document.getElementById('items-counter');
    if (counter) {
        counter.textContent = `${encontrados}/${totalItems} encontrados`;
    }
};

// Función para revalidar items después de correcciones
window.revalidateItems = async (id) => {
    if (!state.editingInvoice) return;

    // Recoger los valores editados
    const rows = document.querySelectorAll('#edit-items-table tr');
    const items = [];

    rows.forEach(row => {
        const inputs = row.querySelectorAll('.edit-item-input');
        const item = {};
        inputs.forEach(input => {
            const field = input.dataset.field;
            if (field === 'cantidad' || field === 'precio_unitario') {
                item[field] = parseFloat(input.value) || 0;
            } else {
                item[field] = input.value || '';
            }
        });
        items.push(item);
    });

    // Mostrar loading
    const revalidateBtn = document.querySelector('[onclick="revalidateItems(' + id + ')"]');
    const originalText = revalidateBtn.innerHTML;
    revalidateBtn.innerHTML = '<span class="material-icons text-sm animate-spin">refresh</span> Validando...';
    revalidateBtn.disabled = true;

    try {
        // Obtener proveedor_id de diferentes fuentes
        const enrichedData = parseEnrichedData(state.editingInvoice.extra) || {};
        let proveedorId = enrichedData?.proveedor_id;

        // Intentar obtener del campo oculto
        if (!proveedorId) {
            proveedorId = document.getElementById('edit_proveedor_id')?.value;
        }

        // Intentar obtener de proveedor_data
        if (!proveedorId && state.editingInvoice.proveedor_data?.id) {
            proveedorId = state.editingInvoice.proveedor_data.id;
        }

        if (!proveedorId) {
            alert('No hay proveedor asociado para validar productos. Por favor, guarda el proveedor primero.');
            return;
        }

        // Validar cada producto contra la BD
        const formData = new FormData();
        formData.append('action', 'validar_productos');
        formData.append('proveedor_id', proveedorId);
        formData.append('items', JSON.stringify(items));

        const response = await fetch(CONFIG.apiEndpoint, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            let totalEncontrados = 0;

            // Actualizar visualización con resultados
            result.resultados.forEach((res, index) => {
                const row = document.querySelector(`#edit-items-table tr[data-item-index="${index}"]`);
                if (row) {
                    const codigoInternoCell = row.cells[2];
                    const estadoCell = row.cells[6];

                    // Limpiar sugerencias anteriores si existen
                    const oldSuggestions = row.querySelector('.suggestions-container');
                    if (oldSuggestions) oldSuggestions.remove();

                    if (res.encontrado) {
                        row.classList.add('bg-green-50');
                        row.classList.remove('bg-red-50');
                        codigoInternoCell.innerHTML = `<span class="font-mono font-medium text-green-600">${res.codigo_interno}</span>`;
                        estadoCell.innerHTML = '<span class="text-green-600 text-xs font-medium">Encontrado</span>';
                        totalEncontrados++;
                    } else {
                        row.classList.add('bg-red-50');
                        row.classList.remove('bg-green-50');
                        codigoInternoCell.innerHTML = '<span class="text-gray-400">—</span>';
                        estadoCell.innerHTML = '<span class="text-red-600 text-xs font-medium">No encontrado</span>';

                        // Obtener el código actual
                        const codigoInput = row.querySelector('input[data-field="codigo_producto"]');
                        const productoInput = row.querySelector('input[data-field="producto"]');
                        const codigoActual = codigoInput?.value || '';
                        const descripcionActual = productoInput?.value || '';

                        // SOLO el botón verde, sin sugerencias
                        const sugerencias = document.createElement('div');
                        sugerencias.className = 'suggestions-container mt-2';
                        sugerencias.innerHTML = `
        <button onclick="abrirAltaProducto(${index}, ${proveedorId}, '${escapeHtml(codigoActual)}', '${escapeHtml(descripcionActual)}')" 
                class="w-full bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1.5 rounded flex items-center justify-center gap-1 transition text-xs">
            <span class="material-icons text-sm">add</span>
            Dar de alta "${codigoActual || 'nuevo código'}"
        </button>
    `;

                        estadoCell.appendChild(sugerencias);
                    }
                }
            });

            // Actualizar el contador de items encontrados
            const counter = document.getElementById('items-counter');
            if (counter) {
                counter.className = totalEncontrados === items.length ?
                    'px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800' :
                    'px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800';
                counter.textContent = `${totalEncontrados}/${items.length} encontrados`;
            }

            notify(`Productos revalidados: ${totalEncontrados}/${items.length} encontrados`, 'success');
        } else {
            notify('Error en la validación: ' + (result.error || 'desconocido'), 'error');
        }
    } catch (error) {
        console.error('Error al revalidar:', error);
        notify('Error al revalidar productos: ' + error.message, 'error');
    } finally {
        revalidateBtn.innerHTML = originalText;
        revalidateBtn.disabled = false;
    }
};

// Función para guardar edición
window.saveEdit = async () => {
    if (!state.editingInvoice) return;

    // Recoger datos editados
    const numero = document.getElementById('edit_numero')?.value;
    const fecha = document.getElementById('edit_fecha')?.value;
    const proveedor = document.getElementById('edit_proveedor')?.value;

    // Recoger items editados y recalcular subtotales
    const rows = document.querySelectorAll('#edit-items-table tr');
    const items = [];
    const itemsProcesados = [];
    let montoTotal = 0;

    rows.forEach((row, index) => {
        const inputs = row.querySelectorAll('.edit-item-input');
        const item = {};

        inputs.forEach(input => {
            const field = input.dataset.field;
            item[field] = field === 'cantidad' || field === 'precio_unitario' ?
                parseFloat(input.value) || 0 :
                input.value;
        });

        const cantidad = item.cantidad || 0;
        const precio = item.precio_unitario || 0;
        item.subtotal = cantidad * precio;

        montoTotal += item.subtotal;
        items.push(item);

        const codigoInternoCell = row.cells[2];
        const estadoCell = row.cells[6];

        const encontrado = estadoCell.innerText.includes('✅');
        let codigo_interno = null;

        if (encontrado) {
            const span = codigoInternoCell.querySelector('span');
            if (span) {
                codigo_interno = span.innerText;
            } else {
                codigo_interno = codigoInternoCell.innerText.trim();
            }
        }

        itemsProcesados.push({
            producto: item.producto || '',
            codigo: item.codigo_producto || '',
            cantidad: cantidad,
            precio: precio,
            subtotal: item.subtotal,
            encontrado: encontrado,
            codigo_interno: codigo_interno !== '—' ? codigo_interno : null
        });
    });

    try {
        const enrichedData = parseEnrichedData(state.editingInvoice.extra) || {};

        enrichedData.items = itemsProcesados;
        enrichedData.ultima_modificacion = new Date().toISOString();

        if (!enrichedData.proveedor_id && state.editingInvoice.proveedor_data?.id) {
            enrichedData.proveedor_id = state.editingInvoice.proveedor_data.id;
        }

        const formData = new FormData();
        formData.append('action', 'update_factura');
        formData.append('id', state.editId);
        formData.append('numero_factura', numero);
        formData.append('fecha_emision', fecha);
        formData.append('proveedor', proveedor);
        formData.append('items', JSON.stringify(items));
        formData.append('extra', JSON.stringify(enrichedData));
        formData.append('monto', montoTotal);

        const response = await fetch(CONFIG.apiEndpoint, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            dom.editModal.classList.add('hidden');
            await loadInvoices(); // Recargar lista
            
            // NUEVO: Si el modal de detalle estaba abierto, actualizarlo
            if (!dom.detailModal.classList.contains('hidden') && state.editId) {
                // Esperar un momento para que se actualice el state
                setTimeout(() => {
                    viewDetail(state.editId);
                }, 100);
            }
            
            notify('Factura actualizada correctamente', 'success');
        } else {
            notify('Error al actualizar: ' + (result.error || 'desconocido'), 'error');
        }
    } catch (error) {
        console.error('Error al guardar:', error);
        notify('Error al guardar cambios', 'error');
    }
};

// Función para abrir modal de alta de producto
window.abrirAltaProducto = (itemIndex, proveedorId, codigo, descripcion) => {
    // Guardar datos pendientes
    pendingAlta = {
        proveedor_id: proveedorId,
        codigo_proveedor: codigo,
        descripcion: descripcion,
        itemIndex: itemIndex,
        row: document.querySelector(`#edit-items-table tr[data-item-index="${itemIndex}"]`)
    };

    // Llenar el modal
    document.getElementById('alta_proveedor_id').value = proveedorId || '';
    document.getElementById('alta_codigo_proveedor').value = codigo || '';
    document.getElementById('alta_descripcion').value = descripcion || '';
    document.getElementById('alta_producto_id').value = '';
    document.getElementById('alta_factor').value = '1';

    // Mostrar modal
    dom.altaProductoModal.classList.remove('hidden');
};

// Función para cerrar modal
window.cerrarAltaProducto = () => {
    dom.altaProductoModal.classList.add('hidden');
    pendingAlta = {
        proveedor_id: null,
        codigo_proveedor: null,
        descripcion: null,
        itemIndex: null,
        row: null
    };
};

// Función para guardar alta de producto
window.guardarAltaProducto = async () => {
    const productoId = document.getElementById('alta_producto_id')?.value;
    const factor = parseFloat(document.getElementById('alta_factor')?.value) || 1;

    if (!productoId) {
        alert('Debes ingresar el Producto ID (código interno)');
        return;
    }

    if (!pendingAlta.proveedor_id || !pendingAlta.codigo_proveedor) {
        alert('Faltan datos del proveedor');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('action', 'alta_producto_proveedor');
        formData.append('proveedor_id', pendingAlta.proveedor_id);
        formData.append('codigo_proveedor', pendingAlta.codigo_proveedor);
        formData.append('descripcion_proveedor', pendingAlta.descripcion || '');
        formData.append('producto_id', productoId);
        formData.append('factor_conversion', factor);

        const response = await fetch(CONFIG.apiEndpoint, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            notify('Producto dado de alta correctamente', 'success');

            // Actualizar la fila en la tabla de edición
            if (pendingAlta.row) {
                const codigoInternoCell = pendingAlta.row.cells[2];
                const estadoCell = pendingAlta.row.cells[6];

                pendingAlta.row.classList.add('bg-green-50');
                pendingAlta.row.classList.remove('bg-red-50');
                codigoInternoCell.innerHTML = `<span class="font-mono font-medium text-green-600">${productoId}</span>`;
                estadoCell.innerHTML = '<span class="text-green-600 text-xs font-medium">Encontrado</span>';

                const suggestions = pendingAlta.row.querySelector('.suggestions-container');
                if (suggestions) suggestions.remove();
            }

            cerrarAltaProducto();

            // Actualizar contador
            const rows = document.querySelectorAll('#edit-items-table tr');
            let encontrados = 0;
            rows.forEach(row => {
                if (row.classList.contains('bg-green-50')) encontrados++;
            });

            const counter = document.getElementById('items-counter');
            if (counter) {
                counter.className = encontrados === rows.length ?
                    'px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800' :
                    'px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800';
                counter.textContent = `${encontrados}/${rows.length} encontrados`;
            }

            // NUEVO: Si el modal de detalle estaba abierto, actualizarlo
            if (!dom.detailModal.classList.contains('hidden') && state.editId) {
                // Recargar facturas primero
                await loadInvoices();
                setTimeout(() => {
                    viewDetail(state.editId);
                }, 100);
            } else {
                // Solo recargar la lista
                loadInvoices();
            }

        } else {
            notify('Error al dar de alta: ' + (result.error || 'desconocido'), 'error');
        }
    } catch (error) {
        console.error('Error al dar de alta producto:', error);
        notify('Error al conectar con el servidor', 'error');
    }
};

// Función para ver detalle
window.viewDetail = (id) => {
    const invoice = state.invoices.find(i => i.id == id);
    if (!invoice || !dom.detailContent) return;

    const enrichedData = parseEnrichedData(invoice.extra);
    let items = parseItems(invoice.items);
    const proveedorMostrar = invoice.proveedor_data?.nombre || invoice.proveedor || '—';
    const proveedorId = enrichedData?.proveedor_id;

    let html = `
        <div class="space-y-6">
            <div class="bg-gray-50 p-4 rounded-lg">
                <div class="flex justify-between items-center mb-4">
                    <h4 class="text-xl font-bold">Factura ${invoice.numero_factura || 'N/A'}</h4>
                    <div class="flex gap-2">
                        <button onclick="editInvoice(${id})" 
                                class="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded-lg flex items-center gap-1 text-sm transition">
                            <span class="material-icons text-sm">edit</span>
                            Editar
                        </button>
                        <span class="px-3 py-1 rounded-full text-xs font-medium ${getEstadoClass(invoice.estado)}">${invoice.estado || 'pendiente'}</span>
                    </div>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <p class="text-xs text-gray-500 uppercase">Fecha Factura</p>
                        <p class="font-medium">${formatDate(invoice.fecha_emision)}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-500 uppercase">Fecha Carga</p>
                        <p class="font-medium">${formatDateTime(invoice.created_at)}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-500 uppercase">Monto</p>
                        <p class="font-medium text-green-600">${formatCurrency(invoice.monto)}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-500 uppercase">Proveedor</p>
                        <p class="font-medium">${proveedorMostrar}</p>
                        ${proveedorId ? `<p class="text-xs text-gray-500">ID: ${proveedorId}</p>` : ''}
                    </div>
                </div>
            </div>`;

    if (items.length > 0) {
        html += `<div>
            <h5 class="font-medium mb-3">Productos</h5>
            <div class="overflow-x-auto border rounded-lg">
                <table class="w-full text-sm">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-3 text-left">Producto</th>
                            <th class="px-4 py-3 text-left">Código Proveedor</th>
                            <th class="px-4 py-3 text-left">Código Interno</th>
                            <th class="px-4 py-3 text-right">Cantidad</th>
                            <th class="px-4 py-3 text-right">P.Unit</th>
                            <th class="px-4 py-3 text-right">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">`;

        const itemsProcesados = enrichedData?.items || [];
        items.forEach((item, index) => {
            const proc = itemsProcesados[index] || {};
            const bgClass = proc.encontrado ? 'bg-green-50' : '';
            const codigoInterno = proc.codigo_interno || '—';

            html += `<tr class="${bgClass}">
                <td class="px-4 py-3">${escapeHtml(item.producto || '—')}</td>
                <td class="px-4 py-3 font-mono">${escapeHtml(item.codigo_producto || '—')}</td>
                <td class="px-4 py-3 font-mono font-medium text-blue-600">${codigoInterno}</td>
                <td class="px-4 py-3 text-right">${item.cantidad || 0}</td>
                <td class="px-4 py-3 text-right">${formatCurrency(item.precio_unitario)}</td>
                <td class="px-4 py-3 text-right font-medium">${formatCurrency(item.subtotal)}</td>
            </tr>`;
        });

        html += '</tbody></table></div></div>';
    }

    // Agregar imagen si existe
    if (invoice.imagen_ruta) {
        html += `<div>
            <h5 class="font-medium mb-3">Imagen de Factura</h5>
            <img src="${invoice.imagen_ruta}" alt="Factura" class="max-w-full h-auto rounded-lg border max-h-96">
        </div>`;
    }

    html += '</div>';
    dom.detailContent.innerHTML = html;
    dom.detailModal.classList.remove('hidden');
};

window.askDelete = (id) => {
    state.deleteId = id;
    const invoice = state.invoices.find(i => i.id == id);
    if (invoice && dom.deleteMessage) {
        dom.deleteMessage.textContent = `¿Eliminar factura ${invoice.numero_factura || id}?`;
    }
    dom.deleteModal.classList.remove('hidden');
};

async function confirmDelete() {
    if (!state.deleteId) return;

    try {
        const formData = new FormData();
        formData.append('action', 'delete_factura');
        formData.append('id', state.deleteId);

        const response = await fetch(CONFIG.apiEndpoint, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            dom.deleteModal.classList.add('hidden');
            loadInvoices();
            notify('Factura eliminada correctamente', 'success');
        } else {
            notify('Error al eliminar: ' + (result.error || 'desconocido'), 'error');
        }
    } catch (error) {
        console.error('Error al eliminar:', error);
        notify('Error al eliminar la factura', 'error');
    } finally {
        state.deleteId = null;
    }
}

// Funciones auxiliares
function parseItems(itemsJson) {
    if (!itemsJson) return [];
    try {
        return typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson;
    } catch (e) {
        return [];
    }
}

function parseEnrichedData(extraField) {
    if (!extraField) return null;
    try {
        return typeof extraField === 'string' ? JSON.parse(extraField) : extraField;
    } catch (e) {
        return null;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(show) {
    if (!dom.invoicesBody) return;

    if (show) {
        dom.invoicesBody.innerHTML = `<tr><td colspan="9" class="px-6 py-12 text-center text-gray-500">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600 mb-2"></div>
            <p>Cargando facturas...</p>
        </td></tr>`;

        if (dom.refreshBtn) {
            dom.refreshBtn.innerHTML = '<span class="material-icons spin mr-2">refresh</span> Cargando...';
            dom.refreshBtn.disabled = true;
        }
    } else {
        if (dom.refreshBtn) {
            dom.refreshBtn.innerHTML = '<span class="material-icons mr-2">refresh</span> Actualizar';
            dom.refreshBtn.disabled = false;
        }
    }
}

function updatePagination() {
    if (!dom.pageInfo) return;
    dom.pageInfo.textContent = `Página ${state.currentPage} de ${state.totalPages || 1}`;
    dom.prevPageBtn.disabled = state.currentPage <= 1;
    dom.nextPageBtn.disabled = state.currentPage >= state.totalPages;
}

function formatDate(d) {
    if (!d) return '—';
    if (d === '0000-00-00' || d === '0000-00-00 00:00:00') return '—';

    if (typeof d === 'string' && d.includes('-')) {
        const partes = d.split(' ');
        const fechaPartes = partes[0].split('-');
        if (fechaPartes.length === 3) {
            const [year, month, day] = fechaPartes;
            if (year && month && day && year.length === 4 && parseInt(year) > 0) {
                return `${day}/${month}/${year}`;
            }
        }
    }
    return '—';
}

function formatDateTime(d) {
    if (!d) return '—';
    try {
        const date = new Date(d);
        if (isNaN(date.getTime()) || d.includes('0000-00-00')) return '—';
        return date.toLocaleDateString('es-AR') + ' ' +
            date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '—';
    }
}

function formatCurrency(n) {
    if (!n && n !== 0) return '—';
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2
    }).format(n);
}

function getEstadoClass(e) {
    const classes = {
        pendiente: 'bg-yellow-100 text-yellow-800 uppercase',
        procesada: 'uppercase bg-green-100 text-green-800',
        pagada: 'bg-blue-100 text-blue-800 uppercase',
        cancelada: 'bg-red-100 uppercase text-red-800'
    };
    return classes[e] || 'bg-gray-100 text-gray-800 uppercase';
}

function notify(msg, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500'
    };

    const notif = document.createElement('div');
    notif.className = `${colors[type]} text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 transform transition-all duration-300 opacity-0 translate-x-full`;
    notif.innerHTML = `<span class="material-icons text-sm">${type === 'success' ? 'check' : 'info'}</span>
                      <span class="text-sm font-medium">${msg}</span>`;

    container.appendChild(notif);

    setTimeout(() => notif.classList.remove('opacity-0', 'translate-x-full'), 10);
    setTimeout(() => {
        notif.classList.add('opacity-0', 'translate-x-full');
        setTimeout(() => notif.remove(), 300);
    }, 4000);
}

function debounce(fn, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), wait);
    };
}

// Agregar estilos de animación
const style = document.createElement('style');
style.textContent = `
    .material-icons.spin {
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    .animate-spin {
        animation: spin 1s linear infinite;
    }
`;
document.head.appendChild(style);
