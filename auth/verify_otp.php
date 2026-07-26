<?php

header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit();
}

$date_ = date("Y-m-d h:i:sa");

$user_otp = isset($_POST['Otp']) ? trim($_POST['Otp']) : '';
$referenceNo = isset($_POST['referenceNo']) ? trim($_POST['referenceNo']) : '';

if (empty($user_otp) || empty($referenceNo)) {
    echo json_encode(array(
        'statusCode' => 'FAILED',
        'message' => 'Missing OTP or referenceNo',
        'statusDetail' => 'OTP and reference number are required'
    ));
    exit;
}

// Log OTP verification attempt
try {
    $myfile = @fopen("OTP+RefNo.txt", "a+");
    if ($myfile) {
        fwrite($myfile, "OTP:" . $user_otp . " RefNo:" . $referenceNo . " Date:" . $date_ . "\n");
        fclose($myfile);
    }
} catch (Exception $e) {
    // Continue even if logging fails
}

$config = include 'config.php';

$requestData = array(
    "applicationId" => $config['applicationId'],
    // Password is removed; proxy server will inject it from DB
    "referenceNo" => $referenceNo,
    "otp" => $user_otp
);

$requestJson = json_encode($requestData);

// Update this to your main server domain/IP where the proxy is hosted.
// E.g., https://your-main-server.com/api/bdapps/proxy
$url = "https://portal.rtsquad.com/api/bdapps/proxy"; // You will need to change this to the real server domain/IP
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $requestJson);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, array(
    "Content-Type: application/json",
    "Content-Length: " . strlen($requestJson),
    "X-Target-URL: https://developer.bdapps.com/subscription/otp/verify"
));
curl_setopt($ch, CURLOPT_TIMEOUT, 15);

$responseJson = curl_exec($ch);

if ($responseJson === false) {
    $error = curl_error($ch);
    curl_close($ch);
    echo json_encode(array(
        'statusCode' => 'FAILED',
        'message' => 'Connection error: ' . $error,
        'statusDetail' => 'Unable to connect to BDApps server'
    ));
    exit;
}

curl_close($ch);

$response = json_decode($responseJson, true);

if ($response === null) {
    echo json_encode(array(
        'statusCode' => 'FAILED',
        'message' => 'Invalid API response',
        'statusDetail' => 'Failed to parse BDApps response',
        'rawResponse' => $responseJson
    ));
    exit;
}

// Return the response from BDApps
echo json_encode(array(
    'statusCode' => isset($response['statusCode']) ? $response['statusCode'] : 'FAILED',
    'statusDetail' => isset($response['statusDetail']) ? $response['statusDetail'] : '',
    'subscriptionStatus' => isset($response['subscriptionStatus']) ? $response['subscriptionStatus'] : '',
    'subscriberId' => isset($response['subscriberId']) ? $response['subscriberId'] : '',
    'version' => isset($response['version']) ? $response['version'] : ''
));

?>