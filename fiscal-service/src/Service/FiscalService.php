<?php

declare(strict_types=1);

namespace AnaGuimaraes\Fiscal\Service;

use AnaGuimaraes\Fiscal\Service\NFe\DanfeRenderer;
use AnaGuimaraes\Fiscal\Service\NFe\InvoiceXmlBuilder;
use AnaGuimaraes\Fiscal\Service\NFe\NFePhpGateway;
use InvalidArgumentException;

final class FiscalService
{
    public function __construct(
        private readonly PayloadValidator $validator,
        private readonly InvoiceXmlBuilder $xmlBuilder,
        private readonly ?NFePhpGateway $gateway,
        private readonly DanfeRenderer $danfeRenderer
    ) {
    }

    public static function fromEnvironment(): self
    {
        return new self(
            new PayloadValidator(),
            new InvoiceXmlBuilder(),
            NFePhpGateway::fromEnvironment(),
            new DanfeRenderer()
        );
    }

    public static function validationOnly(): self
    {
        return new self(
            new PayloadValidator(),
            new InvoiceXmlBuilder(),
            null,
            new DanfeRenderer()
        );
    }

    /**
     * @param array<string, mixed> $payload
     */
    public static function fromPayload(array $payload): self
    {
        return new self(
            new PayloadValidator(),
            new InvoiceXmlBuilder(),
            NFePhpGateway::fromPayload($payload),
            new DanfeRenderer()
        );
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function validate(array $payload): array
    {
        $errors = $this->validator->validateIssuePayload($payload);
        if ($errors !== []) {
            return ['ok' => false, 'errors' => $errors];
        }

        $xml = $this->xmlBuilder->build($payload);

        return [
            'ok' => true,
            'model' => (int)$payload['invoice']['model'],
            'series' => (int)$payload['invoice']['series'],
            'number' => (int)$payload['invoice']['number'],
            'xmlPreview' => $xml,
            'warnings' => $this->validator->warnings($payload)
        ];
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function issue(array $payload): array
    {
        $errors = $this->validator->validateIssuePayload($payload);
        if ($errors !== []) {
            throw new InvalidArgumentException(implode(' ', $errors));
        }

        $xml = $this->xmlBuilder->build($payload);
        $result = $this->gateway()->authorize($payload, $xml);

        if (($result['status'] ?? '') === 'authorized' && isset($result['authorizedXml'])) {
            $result['danfePdfBase64'] = base64_encode(
                $this->danfeRenderer->render((string)$result['authorizedXml'], (int)$payload['invoice']['model'])
            );
        }

        return $result;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function cancel(array $payload): array
    {
        foreach (['key', 'protocol', 'reason', 'model'] as $field) {
            if (!isset($payload[$field]) || $payload[$field] === '') {
                throw new InvalidArgumentException("Campo {$field} obrigatorio para cancelamento.");
            }
        }

        if (strlen((string)$payload['reason']) < 15) {
            throw new InvalidArgumentException('Justificativa de cancelamento deve ter ao menos 15 caracteres.');
        }

        return $this->gateway()->cancel(
            (int)$payload['model'],
            (string)$payload['key'],
            (string)$payload['protocol'],
            (string)$payload['reason']
        );
    }

    private function gateway(): NFePhpGateway
    {
        if ($this->gateway === null) {
            throw new InvalidArgumentException('Gateway fiscal indisponivel para esta rota.');
        }

        return $this->gateway;
    }
}
