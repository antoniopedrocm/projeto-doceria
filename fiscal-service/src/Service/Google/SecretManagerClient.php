<?php

declare(strict_types=1);

namespace AnaGuimaraes\Fiscal\Service\Google;

use RuntimeException;

final class SecretManagerClient
{
    public function access(string $versionName): string
    {
        $name = trim($versionName);
        if ($name === '') {
            return '';
        }

        if (!str_contains($name, '/versions/')) {
            $name .= '/versions/latest';
        }

        $url = 'https://secretmanager.googleapis.com/v1/' . $name . ':access';
        $response = $this->request($url, [
            'Authorization: Bearer ' . $this->accessToken(),
            'Accept: application/json',
        ]);
        $payload = json_decode($response, true);
        $encoded = $payload['payload']['data'] ?? null;

        if (!is_string($encoded) || $encoded === '') {
            throw new RuntimeException('Secret Manager retornou um segredo vazio.');
        }

        $decoded = base64_decode($encoded, true);
        if ($decoded === false) {
            throw new RuntimeException('Secret Manager retornou um segredo inválido.');
        }

        return $decoded;
    }

    private function accessToken(): string
    {
        $response = $this->request(
            'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
            ['Metadata-Flavor: Google']
        );
        $payload = json_decode($response, true);
        $token = $payload['access_token'] ?? null;

        if (!is_string($token) || $token === '') {
            throw new RuntimeException('Não foi possível obter token para acessar o Secret Manager.');
        }

        return $token;
    }

    /**
     * @param array<int, string> $headers
     */
    private function request(string $url, array $headers): string
    {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => implode("\r\n", $headers),
                'timeout' => 20,
                'ignore_errors' => true,
            ],
        ]);
        $response = file_get_contents($url, false, $context);
        $statusLine = $http_response_header[0] ?? '';

        if ($response === false || !preg_match('/\s2\d\d\s/', $statusLine)) {
            throw new RuntimeException('Falha ao acessar Secret Manager: ' . ($statusLine ?: 'sem resposta HTTP'));
        }

        return $response;
    }
}
