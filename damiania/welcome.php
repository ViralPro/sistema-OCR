<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$server = 'localhost:3306';
$username = 'root';
$password = '';
$database = 'verdevotoia';

try {
    $con = new PDO("mysql:host=$server;dbname=$database;charset=utf8mb4", $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);

    $action = $_GET['action'] ?? ($_POST['action'] ?? '');

    switch ($action) {
        case 'test':
            sendResponse(200, ['success' => true]);
            break;
        case 'get_facturas':
            getFacturas($con);
            break;
        case 'insert_factura':
            insertFactura($con);
            break;
        case 'delete_factura':
            deleteFactura($con);
            break;
        case 'validar_productos':  // NUEVO CASE AQUÍ
            validarProductos($con);
            break;
        case 'update_factura':      // NUEVO CASE AQUÍ
            updateFactura($con);
            break;
        case 'alta_producto_proveedor':
            altaProductoProveedor($con);
            break;
        default:
            sendResponse(404, ['success' => false, 'error' => 'Acción no válida']);
    }
} catch (PDOException $e) {
    sendResponse(500, ['success' => false, 'error' => 'Error de conexión: ' . $e->getMessage()]);
}

// Función para dar de alta producto en producto_proveedor
function altaProductoProveedor($con)
{
    try {
        $proveedor_id = intval($_POST['proveedor_id'] ?? 0);
        $codigo_proveedor = trim($_POST['codigo_proveedor'] ?? '');
        $descripcion_proveedor = trim($_POST['descripcion_proveedor'] ?? '');
        $producto_id = intval($_POST['producto_id'] ?? 0);
        $factor_conversion = floatval($_POST['factor_conversion'] ?? 1);

        // Validaciones
        if (!$proveedor_id) {
            sendResponse(400, ['success' => false, 'error' => 'Proveedor ID requerido']);
        }

        if (empty($codigo_proveedor)) {
            sendResponse(400, ['success' => false, 'error' => 'Código de proveedor requerido']);
        }

        if (!$producto_id) {
            sendResponse(400, ['success' => false, 'error' => 'Producto ID requerido']);
        }

        // Verificar si ya existe (para evitar duplicados)
        $stmt = $con->prepare("
            SELECT id FROM producto_proveedor 
            WHERE proveedor_id = ? AND codigo_proveedor = ?
        ");
        $stmt->execute([$proveedor_id, $codigo_proveedor]);

        if ($stmt->fetch()) {
            sendResponse(400, [
                'success' => false,
                'error' => 'Ya existe un producto con ese código para este proveedor'
            ]);
        }

        // Insertar nuevo registro
        $sql = "INSERT INTO producto_proveedor 
                (proveedor_id, codigo_proveedor, descripcion_proveedor, producto_id, factor_conversion, created_at) 
                VALUES (?, ?, ?, ?, ?, NOW())";

        $stmt = $con->prepare($sql);
        $stmt->execute([
            $proveedor_id,
            $codigo_proveedor,
            $descripcion_proveedor,
            $producto_id,
            $factor_conversion
        ]);

        $nuevo_id = $con->lastInsertId();

        // Registrar en log
        error_log("Nuevo producto_proveedor creado: ID $nuevo_id - Proveedor: $proveedor_id - Código: $codigo_proveedor");

        sendResponse(201, [
            'success' => true,
            'id' => $nuevo_id,
            'message' => 'Producto dado de alta correctamente'
        ]);

    } catch (Exception $e) {
        sendResponse(500, [
            'success' => false,
            'error' => 'Error al dar de alta producto: ' . $e->getMessage()
        ]);
    }
}

function getFacturas($con)
{
    try {
        $page = max(1, intval($_GET['page'] ?? 1));
        $perPage = max(1, intval($_GET['perPage'] ?? 10));
        $offset = ($page - 1) * $perPage;
        $search = $_GET['search'] ?? '';

        // Obtener total
        $sqlCount = "SELECT COUNT(*) as total FROM facturas";
        $params = [];
        if (!empty($search)) {
            $sqlCount .= " WHERE numero_factura LIKE ? OR proveedor LIKE ?";
            $params = ["%$search%", "%$search%"];
        }
        $stmt = $con->prepare($sqlCount);
        $stmt->execute($params);
        $total = $stmt->fetch()['total'];

        // Obtener facturas
        $sql = "SELECT * FROM facturas";
        if (!empty($search))
            $sql .= " WHERE numero_factura LIKE ? OR proveedor LIKE ?";
        $sql .= " ORDER BY created_at DESC LIMIT ? OFFSET ?";

        $stmt = $con->prepare($sql);
        $paramIndex = 0;
        if (!empty($search)) {
            $stmt->bindValue(++$paramIndex, "%$search%");
            $stmt->bindValue(++$paramIndex, "%$search%");
        }
        $stmt->bindValue(++$paramIndex, $perPage, PDO::PARAM_INT);
        $stmt->bindValue(++$paramIndex, $offset, PDO::PARAM_INT);
        $stmt->execute();
        $facturas = $stmt->fetchAll();

        // Enriquecer con datos de proveedores
        foreach ($facturas as &$factura) {
            $factura['proveedor_data'] = null;
            $factura['items_count'] = 0;
            $factura['items_encontrados'] = 0;

            if (!empty($factura['extra'])) {
                $extra = json_decode($factura['extra'], true);

                if (!empty($extra['proveedor_id'])) {
                    $stmt2 = $con->prepare("SELECT id, nombre FROM proveedores WHERE id = ?");
                    $stmt2->execute([$extra['proveedor_id']]);
                    $factura['proveedor_data'] = $stmt2->fetch();
                }

                if (!empty($extra['items'])) {
                    $factura['items_count'] = count($extra['items']);
                    $factura['items_encontrados'] = count(array_filter($extra['items'], function ($i) {
                        return !empty($i['encontrado']);
                    }));
                }
            }
        }

        sendResponse(200, [
            'success' => true,
            'data' => $facturas,
            'pagination' => [
                'page' => $page,
                'perPage' => $perPage,
                'total' => (int) $total,
                'totalPages' => ceil($total / $perPage)
            ]
        ]);
    } catch (Exception $e) {
        sendResponse(500, ['success' => false, 'error' => 'Error al cargar facturas: ' . $e->getMessage()]);
    }
}

function insertFactura($con)
{
    try {
        $numero_factura = trim($_POST['numero_factura'] ?? '');
        $fecha_emision = $_POST['fecha_emision'] ?? date('Y-m-d');
        $proveedor_nombre = $_POST['proveedor'] ?? '';
        $items_json = $_POST['items'] ?? '[]';
        $extra_json = $_POST['extra'] ?? '{}';
        $monto = floatval($_POST['monto'] ?? 0);
        $imagen_ruta = $_POST['imagen_ruta'] ?? '';

        if (empty($numero_factura))
            sendResponse(400, ['success' => false, 'error' => 'Número de factura requerido']);

        // NUEVO: Convertir fecha si viene en formato DD/MM/YYYY
        if (!empty($fecha_emision) && strpos($fecha_emision, '/') !== false) {
            $partes = explode('/', $fecha_emision);
            if (count($partes) == 3) {
                // Asumimos formato DD/MM/YYYY
                $fecha_emision = $partes[2] . '-' . $partes[1] . '-' . $partes[0];
            }
        }

        error_log("Buscando proveedor: '$proveedor_nombre'");
        
        $proveedor_id = buscarProveedor($con, $proveedor_nombre);
        
        error_log("Resultado búsqueda proveedor: " . ($proveedor_id ? "ENCONTRADO ID $proveedor_id" : "NO ENCONTRADO"));
        
        $items = json_decode($items_json, true) ?: [];
        $items_procesados = [];

        foreach ($items as $item) {
            $item_proc = [
                'producto' => $item['producto'] ?? '',
                'codigo' => $item['codigo_producto'] ?? '',
                'cantidad' => floatval($item['cantidad'] ?? 0),
                'precio' => floatval($item['precio_unitario'] ?? 0),
                'subtotal' => floatval($item['subtotal'] ?? 0),
                'encontrado' => false,
                'codigo_interno' => null
            ];

            if ($proveedor_id && !empty($item['codigo_producto'])) {
                $producto = buscarProducto($con, $proveedor_id, $item['codigo_producto']);
                if ($producto && isset($producto['producto_id'])) {
                    $item_proc['encontrado'] = true;
                    $item_proc['codigo_interno'] = $producto['producto_id'];
                }
            }
            $items_procesados[] = $item_proc;
        }

        $datos_enriquecidos = [
            'proveedor_id' => $proveedor_id,
            'items' => $items_procesados,
            'timestamp' => date('Y-m-d H:i:s')
        ];

        $extra_completo = array_merge(json_decode($extra_json, true) ?: [], $datos_enriquecidos);

        $sql = "INSERT INTO facturas (numero_factura, fecha_emision, proveedor, items, extra, monto, imagen_ruta, created_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())";
        $stmt = $con->prepare($sql);
        $stmt->execute([
            $numero_factura,
            $fecha_emision,
            $proveedor_nombre,
            $items_json,
            json_encode($extra_completo, JSON_UNESCAPED_UNICODE),
            $monto,
            $imagen_ruta
        ]);

        sendResponse(201, [
            'success' => true,
            'id' => $con->lastInsertId(),
            'proveedor_encontrado' => !is_null($proveedor_id),
            'items_procesados' => count($items_procesados)
        ]);
    } catch (Exception $e) {
        sendResponse(500, ['success' => false, 'error' => 'Error al guardar factura: ' . $e->getMessage()]);
    }
}

function deleteFactura($con)
{
    try {
        $id = intval($_POST['id'] ?? 0);
        if (!$id)
            sendResponse(400, ['success' => false, 'error' => 'ID requerido']);
        $stmt = $con->prepare("DELETE FROM facturas WHERE id = ?");
        $stmt->execute([$id]);
        sendResponse(200, ['success' => true]);
    } catch (Exception $e) {
        sendResponse(500, ['success' => false, 'error' => 'Error al eliminar: ' . $e->getMessage()]);
    }
}

function buscarProveedor($con, $nombre)
{
    if (empty($nombre))
        return null;

    $nombre = trim($nombre);
    $nombre_upper = strtoupper($nombre);

    // 1. BÚSQUEDA EXACTA (prioridad máxima)
    $stmt = $con->prepare("SELECT id, nombre FROM proveedores WHERE nombre = ? OR UPPER(nombre) = ? LIMIT 1");
    $stmt->execute([$nombre, $nombre_upper]);
    $res = $stmt->fetch();
    if ($res) {
        error_log("Proveedor encontrado (exacto): " . $res['id']);
        return (int) $res['id'];
    }

    // 2. BÚSQUEDA POR COINCIDENCIA DIRECTA (el nombre contiene al proveedor o viceversa)
    $stmt = $con->prepare("
        SELECT id, nombre 
        FROM proveedores 
        WHERE UPPER(nombre) LIKE ? OR ? LIKE CONCAT('%', UPPER(nombre), '%')
        LIMIT 5
    ");
    $stmt->execute(["%$nombre_upper%", $nombre_upper]);
    $res = $stmt->fetchAll();

    if (count($res) == 1) {
        error_log("Proveedor encontrado (coincidencia directa): " . $res[0]['id']);
        return (int) $res[0]['id'];
    }

    // 3. LIMPIAR EL NOMBRE PARA BÚSQUEDA MÁS EFECTIVA
    // Eliminar caracteres especiales y términos comunes
    $nombre_limpio = preg_replace('/[^\w\s]/u', ' ', $nombre_upper);
    $nombre_limpio = preg_replace('/\b(DISTRIBUCIONES|DISTRIBUIDORA|COMERCIAL|INDUSTRIAL|SRL|SA|LTDA|EIRL|SAC|SAA|S A|LIMITADA|Y|CIA|COMPAÑIA|DE|DEL|LA|LOS|LAS|E H|H IJO|HIJOS|HERMANOS)\b/u', ' ', $nombre_limpio);
    $nombre_limpio = preg_replace('/\s+/', ' ', $nombre_limpio);
    $nombre_limpio = trim($nombre_limpio);

    // Dividir en palabras (tomamos las de 3+ caracteres)
    $palabras = array_filter(explode(' ', $nombre_limpio), function ($p) {
        return strlen($p) >= 3;
    });

    if (empty($palabras)) {
        $palabras = [$nombre_upper];
    }

    // 4. BÚSQUEDA CON TODAS LAS PALABRAS (AND)
    $condiciones_and = [];
    $params_and = [];
    foreach ($palabras as $p) {
        $condiciones_and[] = "UPPER(nombre) LIKE ?";
        $params_and[] = "%$p%";
    }

    $sql_and = "SELECT id, nombre FROM proveedores WHERE " . implode(' AND ', $condiciones_and) . " LIMIT 1";
    $stmt = $con->prepare($sql_and);
    $stmt->execute($params_and);
    $res = $stmt->fetch();
    if ($res) {
        error_log("Proveedor encontrado (AND): " . $res['id']);
        return (int) $res['id'];
    }

    // 5. BÚSQUEDA CON CUALQUIER PALABRA (OR) pero ordenada por relevancia
    if (count($palabras) > 1) {
        $condiciones_or = [];
        $params_or = [];
        foreach ($palabras as $p) {
            $condiciones_or[] = "UPPER(nombre) LIKE ?";
            $params_or[] = "%$p%";
        }

        // Calcular relevancia (cuantas más palabras coincidan, mejor)
        $sql_or = "
            SELECT id, nombre, 
                   ( " . implode(' + ', array_fill(0, count($palabras), 'CASE WHEN UPPER(nombre) LIKE ? THEN 1 ELSE 0 END')) . " ) as relevancia
            FROM proveedores 
            WHERE " . implode(' OR ', $condiciones_or) . "
            ORDER BY relevancia DESC, LENGTH(nombre) ASC
            LIMIT 1
        ";

        // Duplicamos parámetros para el CASE
        $params_case = [];
        foreach ($palabras as $p) {
            $params_case[] = "%$p%";
        }
        $params_or = array_merge($params_case, $params_or);

        $stmt = $con->prepare($sql_or);
        $stmt->execute($params_or);
        $res = $stmt->fetch();
        if ($res && $res['relevancia'] > 0) {
            error_log("Proveedor encontrado (OR con relevancia {$res['relevancia']}): " . $res['id']);
            return (int) $res['id'];
        }
    }

    // 6. BÚSQUEDA POR PALABRA MÁS SIGNIFICATIVA (la más larga)
    usort($palabras, function ($a, $b) {
        return strlen($b) - strlen($a);
    });
    $palabra_principal = $palabras[0];

    $stmt = $con->prepare("SELECT id FROM proveedores WHERE UPPER(nombre) LIKE ? LIMIT 1");
    $stmt->execute(["%$palabra_principal%"]);
    $res = $stmt->fetch();
    if ($res) {
        error_log("Proveedor encontrado (palabra principal '$palabra_principal'): " . $res['id']);
        return (int) $res['id'];
    }

    error_log("Proveedor NO encontrado para: " . $nombre);
    return null;
}

function buscarProducto($con, $proveedorId, $codigo, $descripcion = '')
{
    if (!$proveedorId) return null;
    
    $codigo = trim($codigo);
    $descripcion = trim($descripcion);
    
    // 1. BÚSQUEDA EXACTA POR CÓDIGO (prioridad máxima)
    if (!empty($codigo)) {
        $codigo_sin_ceros = ltrim($codigo, '0');
        
        $stmt = $con->prepare("
            SELECT producto_id, codigo_proveedor, descripcion_proveedor 
            FROM producto_proveedor 
            WHERE proveedor_id = ? AND (
                codigo_proveedor = ? OR 
                codigo_proveedor = ?
            )
            LIMIT 1
        ");
        $stmt->execute([$proveedorId, $codigo, $codigo_sin_ceros]);
        $res = $stmt->fetch();
        
        if ($res) {
            error_log("Producto encontrado por código exacto: {$res['codigo_proveedor']}");
            return ['producto_id' => $res['producto_id']];
        }
    }
    
    // 2. BÚSQUEDA POR DESCRIPCIÓN (si tenemos descripción)
    if (!empty($descripcion)) {
        // Limpiar descripción para búsqueda
        $desc_limpia = preg_replace('/[^\w\s]/u', ' ', $descripcion);
        $desc_limpia = preg_replace('/\s+/', ' ', $desc_limpia);
        $desc_limpia = trim($desc_limpia);
        
        // Extraer palabras clave (ignorar palabras muy cortas)
        $palabras = array_filter(explode(' ', $desc_limpia), function($p) {
            return strlen($p) >= 4; // Palabras de 4+ caracteres
        });
        
        if (!empty($palabras)) {
            // Buscar productos que coincidan con al menos 2 palabras clave
            $condiciones = [];
            $params = [$proveedorId];
            
            foreach ($palabras as $p) {
                $condiciones[] = "descripcion_proveedor LIKE ?";
                $params[] = "%$p%";
            }
            
            // Si hay muchas palabras, usamos las primeras 3
            if (count($condiciones) > 3) {
                $condiciones = array_slice($condiciones, 0, 3);
                $params = array_slice($params, 0, 4);
            }
            
            $sql = "
                SELECT producto_id, codigo_proveedor, descripcion_proveedor,
                       ( " . implode(' + ', array_fill(0, count($condiciones), 'CASE WHEN descripcion_proveedor LIKE ? THEN 1 ELSE 0 END')) . " ) as relevancia
                FROM producto_proveedor 
                WHERE proveedor_id = ? AND (" . implode(' OR ', $condiciones) . ")
                ORDER BY relevancia DESC, LENGTH(descripcion_proveedor) ASC
                LIMIT 5
            ";
            
            // Duplicar params para el CASE
            $params_case = [];
            foreach ($palabras as $p) {
                if (count($params_case) < 3) {
                    $params_case[] = "%$p%";
                }
            }
            $params = array_merge($params_case, $params);
            
            $stmt = $con->prepare($sql);
            $stmt->execute($params);
            $candidatos = $stmt->fetchAll();
            
            if (count($candidatos) == 1) {
                error_log("Producto encontrado por descripción: {$candidatos[0]['codigo_proveedor']}");
                return ['producto_id' => $candidatos[0]['producto_id']];
            }
            
            // Si hay múltiples candidatos, guardar para debug
            if (count($candidatos) > 1) {
                error_log("⚠️ Múltiples candidatos para descripción: " . json_encode($candidatos));
            }
        }
    }
    
    // 3. BÚSQUEDA POR DISTANCIA LEVENSHTEIN (si tenemos código)
    if (!empty($codigo) && strlen($codigo) >= 4) {
        try {
            // Buscar códigos similares
            $stmt = $con->prepare("
                SELECT producto_id, codigo_proveedor, descripcion_proveedor
                FROM producto_proveedor 
                WHERE proveedor_id = ? 
                AND LENGTH(codigo_proveedor) BETWEEN ? AND ?
                ORDER BY ABS(LENGTH(codigo_proveedor) - LENGTH(?)) 
                LIMIT 20
            ");
            $longitud = strlen($codigo);
            $stmt->execute([$proveedorId, $longitud - 2, $longitud + 2, $codigo]);
            $candidatos = $stmt->fetchAll();
            
            $mejor_candidato = null;
            $mejor_distancia = 999;
            
            foreach ($candidatos as $cand) {
                $distancia = levenshtein($codigo, $cand['codigo_proveedor']);
                
                // Bonus si la descripción también coincide parcialmente
                if (!empty($descripcion) && $cand['descripcion_proveedor']) {
                    $similitud_desc = similar_text($descripcion, $cand['descripcion_proveedor']);
                    if ($similitud_desc > 50) { // Más de 50% de similitud
                        $distancia -= 2; // Reducir distancia (mejor puntaje)
                    }
                }
                
                if ($distancia < $mejor_distancia) {
                    $mejor_distancia = $distancia;
                    $mejor_candidato = $cand;
                }
            }
            
            // Si encontramos un candidato con distancia aceptable
            if ($mejor_candidato && $mejor_distancia <= 2) {
                error_log("Producto encontrado por similitud: {$mejor_candidato['codigo_proveedor']} (distancia: $mejor_distancia)");
                return ['producto_id' => $mejor_candidato['producto_id']];
            }
        } catch (Exception $e) {
            error_log("Error en Levenshtein: " . $e->getMessage());
        }
    }
    
    // 4. BÚSQUEDA POR CÓDIGO PARCIAL (último recurso)
    if (!empty($codigo) && strlen($codigo) >= 4) {
        $codigo_parcial = substr($codigo, 0, 4); // Primeros 4 dígitos
        
        $stmt = $con->prepare("
            SELECT producto_id, codigo_proveedor 
            FROM producto_proveedor 
            WHERE proveedor_id = ? AND codigo_proveedor LIKE ?
            LIMIT 1
        ");
        $stmt->execute([$proveedorId, "$codigo_parcial%"]);
        $res = $stmt->fetch();
        
        if ($res) {
            error_log("Producto encontrado por código parcial: {$res['codigo_proveedor']}");
            return ['producto_id' => $res['producto_id']];
        }
    }
    
    error_log("Producto NO encontrado - Código: $codigo, Desc: $descripcion");
    return null;
}

function validarProductos($con)
{
    try {
        $proveedor_id = intval($_POST['proveedor_id'] ?? 0);
        $items_json = $_POST['items'] ?? '[]';
        $items = json_decode($items_json, true) ?: [];

        if (!$proveedor_id) {
            sendResponse(400, ['success' => false, 'error' => 'Proveedor ID requerido']);
        }

        $resultados = [];
        foreach ($items as $item) {
            $codigo = trim($item['codigo_producto'] ?? '');
            $descripcion = trim($item['producto'] ?? '');
            
            $resultado = [
                'codigo_original' => $codigo,
                'descripcion_original' => $descripcion,
                'encontrado' => false,
                'codigo_interno' => null,
                'metodo' => null
            ];

            // Usar la nueva función que combina código + descripción
            $producto = buscarProducto($con, $proveedor_id, $codigo, $descripcion);
            
            if ($producto && isset($producto['producto_id'])) {
                $resultado['encontrado'] = true;
                $resultado['codigo_interno'] = $producto['producto_id'];
                $resultado['metodo'] = $producto['metodo'] ?? 'desconocido';
            }

            $resultados[] = $resultado;
        }

        sendResponse(200, [
            'success' => true,
            'resultados' => $resultados
        ]);

    } catch (Exception $e) {
        sendResponse(500, ['success' => false, 'error' => 'Error al validar productos: ' . $e->getMessage()]);
    }
}

// Implementación de updateFactura (corregida)
function updateFactura($con)
{
    try {
        $id = intval($_POST['id'] ?? 0);
        $numero_factura = trim($_POST['numero_factura'] ?? '');
        $fecha_emision = $_POST['fecha_emision'] ?? '';
        $proveedor_nombre = $_POST['proveedor'] ?? '';
        $items_json = $_POST['items'] ?? '[]';
        $extra_json = $_POST['extra'] ?? '{}';
        $monto = floatval($_POST['monto'] ?? 0); // NUEVO: recibir monto calculado

        if (!$id) {
            sendResponse(400, ['success' => false, 'error' => 'ID requerido']);
        }

        // NUEVO: Convertir fecha si viene en formato DD/MM/YYYY
        if (!empty($fecha_emision)) {
            // Si la fecha tiene barras (formato argentino)
            if (strpos($fecha_emision, '/') !== false) {
                $partes = explode('/', $fecha_emision);
                if (count($partes) == 3) {
                    // Asumimos formato DD/MM/YYYY
                    $fecha_emision = $partes[2] . '-' . $partes[1] . '-' . $partes[0];
                }
            }
            // Si ya viene en formato YYYY-MM-DD, la dejamos como está
        }

        // Buscar proveedor actualizado
        $proveedor_id = buscarProveedor($con, $proveedor_nombre);

        // Actualizar extra con nuevo proveedor_id
        $extra = json_decode($extra_json, true) ?: [];
        $extra['proveedor_id'] = $proveedor_id;
        $extra['ultima_modificacion'] = date('Y-m-d H:i:s');

        // Normalizar items en extra
        if (isset($extra['items']) && is_array($extra['items'])) {
            foreach ($extra['items'] as &$item) {
                if (!isset($item['encontrado']))
                    $item['encontrado'] = false;
                if (!isset($item['codigo_interno']))
                    $item['codigo_interno'] = null;
            }
        }

        $sql = "UPDATE facturas 
                SET numero_factura = ?, fecha_emision = ?, proveedor = ?, 
                    items = ?, extra = ?, monto = ?
                WHERE id = ?";

        $stmt = $con->prepare($sql);
        $stmt->execute([
            $numero_factura,
            $fecha_emision,
            $proveedor_nombre,
            $items_json,
            json_encode($extra, JSON_UNESCAPED_UNICODE),
            $monto,
            $id
        ]);

        sendResponse(200, [
            'success' => true,
            'message' => 'Factura actualizada correctamente',
            'items_encontrados' => contarItemsEncontrados($extra)
        ]);

    } catch (Exception $e) {
        sendResponse(500, ['success' => false, 'error' => 'Error al actualizar factura: ' . $e->getMessage()]);
    }
}

// Función auxiliar para contar items encontrados
function contarItemsEncontrados($extra)
{
    if (!isset($extra['items']) || !is_array($extra['items'])) {
        return 0;
    }

    $count = 0;
    foreach ($extra['items'] as $item) {
        if (isset($item['encontrado']) && $item['encontrado'] === true) {
            $count++;
        }
    }
    return $count;
}

function sendResponse($code, $data)
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit();
}
?>