<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

// Manejar peticiones preflight de CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(200);
    exit();
}

// Solo permitir peticiones POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendResponse(405, ['success' => false, 'error' => 'Método no permitido']);
}

$uploadDir = 'uploads/';
$maxSize = 12 * 1024 * 1024; // 12 MB

// Mapear tipos MIME permitidos a sus extensiones
$allowedMimeTypes = [
    'image/jpeg' => 'jpg',
    'image/jpg'  => 'jpg',
    'image/png'  => 'png',
    'application/pdf' => 'pdf'
];

// Crear directorio con permisos más seguros (0755 en lugar de 0777)
if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

if (!isset($_FILES['file'])) {
    sendResponse(400, ['success' => false, 'error' => 'No se recibió ningún archivo']);
}

$file = $_FILES['file'];

// Comprobar errores de subida de PHP
if ($file['error'] !== UPLOAD_ERR_OK) {
    $uploadErrors = [
        UPLOAD_ERR_INI_SIZE   => 'El archivo excede el tamaño máximo permitido por el servidor',
        UPLOAD_ERR_FORM_SIZE  => 'El archivo excede el tamaño máximo permitido por el formulario',
        UPLOAD_ERR_PARTIAL    => 'El archivo se subió parcialmente',
        UPLOAD_ERR_NO_FILE    => 'No se subió ningún archivo',
        UPLOAD_ERR_NO_TMP_DIR => 'Falta la carpeta temporal',
        UPLOAD_ERR_CANT_WRITE => 'Error al escribir el archivo en el disco',
        UPLOAD_ERR_EXTENSION  => 'Una extensión de PHP detuvo la subida del archivo',
    ];
    $errorMessage = $uploadErrors[$file['error']] ?? 'Error desconocido al subir el archivo';
    sendResponse(400, ['success' => false, 'error' => $errorMessage]);
}

// Validar tamaño
if ($file['size'] > $maxSize) {
    sendResponse(400, ['success' => false, 'error' => 'El archivo es demasiado grande (Máximo 12MB)']);
}

// Validar tipo MIME de forma segura usando finfo (no confiar en $_FILES['type'])
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mimeType = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

if (!array_key_exists($mimeType, $allowedMimeTypes)) {
    sendResponse(400, ['success' => false, 'error' => 'Tipo de archivo no permitido']);
}

// Generar un nombre seguro e impredecible y usar la extensión real
$ext = $allowedMimeTypes[$mimeType];
$name = bin2hex(random_bytes(16)) . '.' . $ext;
$path = $uploadDir . $name;

if (move_uploaded_file($file['tmp_name'], $path)) {
    sendResponse(200, [
        'success' => true,
        'file_path' => $path,
        'message' => 'Archivo subido correctamente'
    ]);
} else {
    sendResponse(500, ['success' => false, 'error' => 'Error interno al guardar el archivo']);
}

function sendResponse($code, $data) {
    http_response_code($code);
    echo json_encode($data);
    exit();
}
?  >