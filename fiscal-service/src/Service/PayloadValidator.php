<?php

declare(strict_types=1);

namespace AnaGuimaraes\Fiscal\Service;

final class PayloadValidator
{
    /**
     * @param array<string, mixed> $payload
     * @return list<string>
     */
    public function validateIssuePayload(array $payload): array
    {
        $errors = [];
        foreach (['environment', 'invoice', 'issuer', 'customer', 'items', 'totals'] as $field) {
            if (!isset($payload[$field])) {
                $errors[] = "Campo {$field} obrigatorio.";
            }
        }

        if ($errors !== []) {
            return $errors;
        }

        $invoice = $payload['invoice'];
        $issuer = $payload['issuer'];
        $customer = $payload['customer'];
        $items = $payload['items'];
        $totals = $payload['totals'];

        foreach (['model', 'series', 'number', 'operationNature', 'issueDate'] as $field) {
            if (!isset($invoice[$field]) || $invoice[$field] === '') {
                $errors[] = "invoice.{$field} obrigatorio.";
            }
        }

        if (!in_array((int)($invoice['model'] ?? 0), [55, 65], true)) {
            $errors[] = 'invoice.model deve ser 55 ou 65.';
        }

        foreach (['cnpj', 'legalName', 'stateRegistration', 'taxRegime', 'address'] as $field) {
            if (!isset($issuer[$field]) || $issuer[$field] === '') {
                $errors[] = "issuer.{$field} obrigatorio.";
            }
        }

        foreach (['name', 'document', 'address'] as $field) {
            if (!isset($customer[$field]) || $customer[$field] === '') {
                $errors[] = "customer.{$field} obrigatorio.";
            }
        }

        $this->validateAddress($issuer['address'] ?? [], 'issuer.address', $errors);
        $this->validateAddress($customer['address'] ?? [], 'customer.address', $errors);

        if (!is_array($items) || count($items) === 0) {
            $errors[] = 'items precisa ter ao menos um item.';
        } else {
            foreach ($items as $index => $item) {
                $prefix = 'items[' . $index . ']';
                foreach (['code', 'description', 'ncm', 'cfop', 'unit', 'quantity', 'unitPrice', 'total', 'tax'] as $field) {
                    if (!isset($item[$field]) || $item[$field] === '') {
                        $errors[] = "{$prefix}.{$field} obrigatorio.";
                    }
                }
                if (isset($item['ncm']) && !preg_match('/^\d{8}$/', (string)$item['ncm'])) {
                    $errors[] = "{$prefix}.ncm deve ter 8 digitos.";
                }
                if (isset($item['cfop']) && !preg_match('/^\d{4}$/', (string)$item['cfop'])) {
                    $errors[] = "{$prefix}.cfop deve ter 4 digitos.";
                }
                if (!isset($item['tax']['csosn']) && !isset($item['tax']['cst'])) {
                    $errors[] = "{$prefix}.tax precisa ter CSOSN ou CST.";
                }
            }
        }

        foreach (['products', 'discount', 'freight', 'insurance', 'other', 'invoice'] as $field) {
            if (!isset($totals[$field]) || !is_numeric($totals[$field])) {
                $errors[] = "totals.{$field} numerico obrigatorio.";
            }
        }

        $payment = $invoice['payment'] ?? [];
        if (($payment['methodCode'] ?? '') === '90' && (float)($payment['amount'] ?? 0) > 0) {
            $errors[] = 'Forma de pagamento 90 (sem pagamento) nao pode ter valor pago maior que zero.';
        }

        return $errors;
    }

    /**
     * @param mixed $address
     * @param list<string> $errors
     */
    private function validateAddress(mixed $address, string $prefix, array &$errors): void
    {
        if (!is_array($address)) {
            $errors[] = "{$prefix} invalido.";
            return;
        }

        foreach (['street', 'number', 'district', 'city', 'cityCode', 'state', 'zip'] as $field) {
            if (!isset($address[$field]) || $address[$field] === '') {
                $errors[] = "{$prefix}.{$field} obrigatorio.";
            }
        }
    }

    /**
     * @param array<string, mixed> $payload
     * @return list<string>
     */
    public function warnings(array $payload): array
    {
        $warnings = [];
        if ((int)($payload['invoice']['model'] ?? 0) === 65 && empty(getenv('NFCE_CSC')) && empty(getenv('NFCE_CSC_ID'))) {
            $warnings[] = 'NFC-e pode exigir CSC conforme leiaute/ambiente; configure NFCE_CSC_ID e NFCE_CSC se necessario.';
        }

        if ((int)($payload['environment'] ?? 2) === 1) {
            $warnings[] = 'Ambiente de producao: confirme serie e numeracao com o contador antes de emitir.';
        }

        return $warnings;
    }
}
