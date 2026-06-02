<?php

declare(strict_types=1);

error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED);
ini_set('display_errors', '0');
ini_set('html_errors', '0');
ini_set('log_errors', '1');
ob_start();

use AnaGuimaraes\Fiscal\Http\JsonResponse;
use AnaGuimaraes\Fiscal\Security\RequestGuard;
use AnaGuimaraes\Fiscal\Service\FiscalService;

require dirname(__DIR__) . '/vendor/autoload.php';

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($path === '/healthz') {
    JsonResponse::send(['ok' => true, 'service' => 'ana-guimaraes-fiscal-service']);
}

if ($method !== 'POST') {
    JsonResponse::send(['error' => 'Method not allowed'], 405);
}

try {
    RequestGuard::assertAllowed($_SERVER);
    $body = file_get_contents('php://input') ?: '{}';
    $payload = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
    $service = $path === '/validate'
        ? FiscalService::validationOnly()
        : FiscalService::fromPayload($payload);

    $result = match ($path) {
        '/validate' => $service->validate($payload),
        '/issue' => $service->issue($payload),
        '/receipt' => $service->receipt($payload),
        '/cancel' => $service->cancel($payload),
        default => ['error' => 'Not found'],
    };

    JsonResponse::send($result, isset($result['error']) ? 404 : 200);
} catch (InvalidArgumentException $exception) {
    JsonResponse::send(['error' => $exception->getMessage()], 422);
} catch (RuntimeException $exception) {
    JsonResponse::send(['error' => $exception->getMessage()], 500);
} catch (Throwable $exception) {
    JsonResponse::send(['error' => 'Unexpected fiscal service failure', 'detail' => $exception->getMessage()], 500);
}
