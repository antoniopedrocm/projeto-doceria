<?php

declare(strict_types=1);

namespace AnaGuimaraes\Fiscal\Http;

final class JsonResponse
{
    /**
     * @param array<string, mixed> $payload
     */
    public static function send(array $payload, int $status = 200): never
    {
        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
            ?: '{"error":"Nao foi possivel serializar a resposta fiscal."}';
        exit;
    }
}
