<?php

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit();
}


ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED);

function callBdapps(string $url, array $requestData): array {
    $requestJson = json_encode($requestData);
    if ($requestJson === false) {
        return ['ok' => false, 'error' => 'Failed to encode request'];
    }

    $ch = curl_init();
    if ($ch === false) {
        return ['ok' => false, 'error' => 'Unable to initialize cURL'];
    }

    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $requestJson);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, array(
        "Content-Type: application/json",
        "Content-Length: " . strlen($requestJson),
        "X-Target-URL: https://developer.bdapps.com/subscription/send"
    ));
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);

    $responseJson = curl_exec($ch);
    $curlError = curl_error($ch);

    if ($responseJson === false) {
        return ['ok' => false, 'error' => "cURL failed: $curlError"];
    }

    $response = json_decode($responseJson, true);
    if (!is_array($response)) {
        return ['ok' => false, 'error' => 'Invalid response', 'raw' => $responseJson];
    }

    return ['ok' => true, 'data' => $response, 'raw' => $responseJson];
}

$rawMobile = trim($_POST['user_mobile'] ?? $_POST['subscriberId'] ?? '');
if ($rawMobile === '') {
    echo json_encode(['error' => 'Mobile number required']);
    exit;
}

$digits = preg_replace('/\D+/', '', $rawMobile);
if (strlen($digits) === 13 && substr($digits, 0, 2) === '88') {
    $digits = substr($digits, 2);
}

if (strlen($digits) !== 11 || $digits[0] !== '0') {
    echo json_encode(['error' => 'Invalid mobile format']);
    exit;
}

$config = include 'config.php';
$subscriberId = 'tel:88' . $digits;
$appId = $config['applicationId'];
$password = $config['password'];

$requestData = array(
    'applicationId' => $appId,
    // password removed; injected by proxy
    'subscriberId' => $subscriberId,
    'version' => '1.0',
    'action' => '0',
);

// Update this to your main server domain/IP where the proxy is hosted.
// E.g., http://your-main-server.com/api/bdapps/proxy
$url = 'https://portal.rtsquad.com/api/bdapps/proxy'; // You will need to change this to the real server domain/IP
$result = callBdapps($url, $requestData);

if (!$result['ok']) {
    echo json_encode([
        'success' => false,
        'error' => $result['error'],
        'subscriberId' => $subscriberId,
        'action' => '0',
    ]);
    exit;
}

$response = $result['data'];
$statusCode = strtoupper((string)($response['statusCode'] ?? ''));
$subscriptionStatus = $response['subscriptionStatus'] ?? 'UNKNOWN';

$success =
    $statusCode === 'S1000' ||
    strtoupper((string)$subscriptionStatus) === 'UNREGISTERED';

echo json_encode([
    'success' => $success,
    'subscriberId' => $subscriberId,
    'action' => '0',
    'version' => '1.0',
    'statusCode' => $response['statusCode'] ?? null,
    'statusDetail' => $response['statusDetail'] ?? null,
    'subscriptionStatus' => $subscriptionStatus,
    'rawResponse' => $result['raw'] ?? null,
]);

?>