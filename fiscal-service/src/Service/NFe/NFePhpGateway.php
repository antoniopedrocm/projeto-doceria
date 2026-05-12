<?php

declare(strict_types=1);

namespace AnaGuimaraes\Fiscal\Service\NFe;

use AnaGuimaraes\Fiscal\Service\Google\SecretManagerClient;
use NFePHP\Common\Certificate;
use NFePHP\NFe\Common\Standardize;
use NFePHP\NFe\Common\Complements;
use NFePHP\NFe\Tools;
use RuntimeException;

final class NFePhpGateway
{
    public function __construct(private readonly Tools $tools)
    {
    }

    public static function fromEnvironment(): self
    {
        $pfx = self::certificateBytes();
        $password = getenv('CERT_PASSWORD') ?: '';
        if ($pfx === '' || $password === '') {
            throw new RuntimeException('Certificado A1 nao configurado. Configure CERT_PFX_BASE64 ou CERT_PFX_PATH e CERT_PASSWORD.');
        }

        $config = [
            'atualizacao' => date('Y-m-d H:i:s'),
            'tpAmb' => (int)(getenv('NFE_TP_AMB') ?: 2),
            'razaosocial' => getenv('NFE_RAZAO_SOCIAL') ?: 'ANA GUIMARAES DOCERIA LTDA',
            'siglaUF' => getenv('NFE_UF') ?: 'GO',
            'cnpj' => getenv('NFE_CNPJ') ?: '37185245000140',
            'schemes' => getenv('NFE_SCHEMES') ?: 'PL_010_V1',
            'versao' => '4.00',
            'tokenIBPT' => getenv('NFE_TOKEN_IBPT') ?: '',
            'CSC' => getenv('NFCE_CSC') ?: '',
            'CSCid' => getenv('NFCE_CSC_ID') ?: '',
            'aProxyConf' => [
                'proxyIp' => getenv('NFE_PROXY_IP') ?: '',
                'proxyPort' => getenv('NFE_PROXY_PORT') ?: '',
                'proxyUser' => getenv('NFE_PROXY_USER') ?: '',
                'proxyPass' => getenv('NFE_PROXY_PASS') ?: '',
            ],
        ];

        $certificate = Certificate::readPfx($pfx, $password);
        return new self(new Tools(json_encode($config, JSON_UNESCAPED_SLASHES), $certificate));
    }

    /**
     * @param array<string, mixed> $payload
     */
    public static function fromPayload(array $payload): self
    {
        $secrets = is_array($payload['fiscalSecrets'] ?? null) ? $payload['fiscalSecrets'] : [];
        $secretClient = new SecretManagerClient();

        $pfxBase64 = self::valueFromSecretOrEnv($secretClient, $secrets['certPfxSecretVersion'] ?? '', 'CERT_PFX_BASE64');
        $password = self::valueFromSecretOrEnv($secretClient, $secrets['certPasswordSecretVersion'] ?? '', 'CERT_PASSWORD');
        if ($pfxBase64 === '' || $password === '') {
            throw new RuntimeException('Certificado A1 da loja nao configurado no Secret Manager.');
        }

        $pfx = self::certificateBytesFromBase64($pfxBase64);
        $issuer = is_array($payload['issuer'] ?? null) ? $payload['issuer'] : [];
        $address = is_array($issuer['address'] ?? null) ? $issuer['address'] : [];
        $nfceCsc = self::valueFromSecretOrEnv($secretClient, $secrets['nfceCscSecretVersion'] ?? '', 'NFCE_CSC');
        $nfceCscId = self::valueFromSecretOrEnv($secretClient, $secrets['nfceCscIdSecretVersion'] ?? '', 'NFCE_CSC_ID');

        $config = [
            'atualizacao' => date('Y-m-d H:i:s'),
            'tpAmb' => (int)($payload['environment'] ?? (getenv('NFE_TP_AMB') ?: 2)),
            'razaosocial' => (string)($issuer['legalName'] ?? (getenv('NFE_RAZAO_SOCIAL') ?: 'ANA GUIMARAES DOCERIA LTDA')),
            'siglaUF' => (string)($address['state'] ?? (getenv('NFE_UF') ?: 'GO')),
            'cnpj' => (string)($issuer['cnpj'] ?? (getenv('NFE_CNPJ') ?: '')),
            'schemes' => getenv('NFE_SCHEMES') ?: 'PL_010_V1',
            'versao' => '4.00',
            'tokenIBPT' => getenv('NFE_TOKEN_IBPT') ?: '',
            'CSC' => $nfceCsc,
            'CSCid' => $nfceCscId,
            'aProxyConf' => [
                'proxyIp' => getenv('NFE_PROXY_IP') ?: '',
                'proxyPort' => getenv('NFE_PROXY_PORT') ?: '',
                'proxyUser' => getenv('NFE_PROXY_USER') ?: '',
                'proxyPass' => getenv('NFE_PROXY_PASS') ?: '',
            ],
        ];

        $certificate = Certificate::readPfx($pfx, $password);
        return new self(new Tools(json_encode($config, JSON_UNESCAPED_SLASHES), $certificate));
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function authorize(array $payload, string $xml): array
    {
        $model = (int)$payload['invoice']['model'];
        $this->tools->model((string)$model);

        $signedXml = $this->tools->signNFe($xml);
        if ($model === 65 && method_exists($this->tools, 'sefazAddQRCode')) {
            $signedXml = $this->tools->sefazAddQRCode($signedXml);
        }
        $batchId = str_pad((string)random_int(1, 999999999999999), 15, '0', STR_PAD_LEFT);
        $rawResponse = $this->tools->sefazEnviaLote([$signedXml], $batchId, 1);
        $standardize = new Standardize($rawResponse);
        $response = $standardize->toStd();

        $authorized = $this->extractAuthorizedProtocol($response);
        if ($authorized !== null) {
            return [
                'status' => 'authorized',
                'key' => $authorized['key'],
                'protocol' => $authorized['protocol'],
                'cStat' => $authorized['cStat'],
                'xMotivo' => $authorized['xMotivo'],
                'signedXml' => $signedXml,
                'authorizedXml' => Complements::toAuthorize($signedXml, $rawResponse)
            ];
        }

        if (isset($response->cStat) && (int)$response->cStat === 103 && isset($response->infRec->nRec)) {
            $receiptResponse = $this->tools->sefazConsultaRecibo((string)$response->infRec->nRec);
            $receiptStd = (new Standardize($receiptResponse))->toStd();
            $authorized = $this->extractAuthorizedProtocol($receiptStd);
            if ($authorized !== null) {
                return [
                    'status' => 'authorized',
                    'key' => $authorized['key'],
                    'protocol' => $authorized['protocol'],
                    'cStat' => $authorized['cStat'],
                    'xMotivo' => $authorized['xMotivo'],
                    'signedXml' => $signedXml,
                    'authorizedXml' => Complements::toAuthorize($signedXml, $receiptResponse)
                ];
            }

            return [
                'status' => $this->statusFromCode((int)($receiptStd->cStat ?? 0)),
                'cStat' => isset($receiptStd->cStat) ? (int)$receiptStd->cStat : null,
                'xMotivo' => $receiptStd->xMotivo ?? 'Retorno de recibo sem autorizacao.',
                'signedXml' => $signedXml
            ];
        }

        return [
            'status' => $this->statusFromCode((int)($response->cStat ?? 0)),
            'cStat' => isset($response->cStat) ? (int)$response->cStat : null,
            'xMotivo' => $response->xMotivo ?? 'Retorno SEFAZ sem protocolo.',
            'signedXml' => $signedXml
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function cancel(int $model, string $key, string $protocol, string $reason): array
    {
        $this->tools->model((string)$model);
        $rawResponse = $this->tools->sefazCancela($key, $reason, $protocol);
        $response = (new Standardize($rawResponse))->toStd();
        $event = $response->retEvento->infEvento ?? $response->infEvento ?? null;
        $cStat = isset($event->cStat) ? (int)$event->cStat : (isset($response->cStat) ? (int)$response->cStat : null);
        $status = $cStat === 135 || $cStat === 155 ? 'cancelled' : 'rejected';

        return [
            'status' => $status,
            'key' => $key,
            'protocol' => $protocol,
            'cStat' => $cStat,
            'xMotivo' => $event->xMotivo ?? $response->xMotivo ?? null,
            'cancelXml' => $rawResponse
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function extractAuthorizedProtocol(object $response): ?array
    {
        $infProt = $response->protNFe->infProt ?? $response->protocolo->infProt ?? null;
        if ($infProt === null && isset($response->retConsReciNFe->protNFe->infProt)) {
            $infProt = $response->retConsReciNFe->protNFe->infProt;
        }

        if ($infProt !== null && (int)$infProt->cStat === 100) {
            return [
                'key' => (string)$infProt->chNFe,
                'protocol' => (string)$infProt->nProt,
                'cStat' => (int)$infProt->cStat,
                'xMotivo' => (string)$infProt->xMotivo
            ];
        }

        return null;
    }

    private function statusFromCode(int $code): string
    {
        return match ($code) {
            110, 301, 302, 303 => 'denied',
            103, 105 => 'pending_return',
            default => 'rejected',
        };
    }

    private static function certificateBytes(): string
    {
        $base64 = getenv('CERT_PFX_BASE64') ?: '';
        if ($base64 !== '') {
            return self::certificateBytesFromBase64($base64);
        }

        $path = getenv('CERT_PFX_PATH') ?: '';
        if ($path !== '' && is_readable($path)) {
            return (string)file_get_contents($path);
        }

        return '';
    }

    private static function certificateBytesFromBase64(string $base64): string
    {
        $decoded = base64_decode($base64, true);
        if ($decoded === false) {
            throw new RuntimeException('CERT_PFX_BASE64 invalido.');
        }
        return $decoded;
    }

    private static function valueFromSecretOrEnv(SecretManagerClient $secretClient, mixed $secretVersion, string $envName): string
    {
        $name = is_string($secretVersion) ? trim($secretVersion) : '';
        if ($name !== '') {
            return $secretClient->access($name);
        }

        return getenv($envName) ?: '';
    }
}
