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
        if (!in_array((int)$payload['environment'], [1, 2], true)) {
            $errors[] = 'Ambiente fiscal invalido.';
        }
        if ((int)($invoice['series'] ?? -1) < 0 || (int)($invoice['number'] ?? 0) < 1) {
            $errors[] = 'Serie ou numero fiscal invalido.';
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
        if (!$this->validDocument((string)($issuer['cnpj'] ?? ''))) $errors[] = 'Emitente: CNPJ invalido.';
        if (!$this->validDocument((string)($customer['document'] ?? ''))) $errors[] = 'Cliente: CPF/CNPJ invalido.';

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
                if (empty($item['tax']['csosn']) && empty($item['tax']['cst'])) {
                    $errors[] = "{$prefix}.tax precisa ter CSOSN ou CST.";
                }
                foreach (['origin', 'pisCst', 'cofinsCst'] as $taxField) {
                    if (!isset($item['tax'][$taxField]) || $item['tax'][$taxField] === '') {
                        $errors[] = "{$prefix}.tax.{$taxField} obrigatorio.";
                    }
                }
                if ((float)($item['quantity'] ?? 0) <= 0 || (float)($item['unitPrice'] ?? -1) < 0) {
                    $errors[] = "{$prefix}: quantidade ou valor unitario invalido.";
                }
                if (round((float)($item['quantity'] ?? 0) * (float)($item['unitPrice'] ?? 0), 2) !== round((float)($item['total'] ?? 0), 2)) {
                    $errors[] = "{$prefix}: total diverge de quantidade x valor unitario.";
                }
            }
        }

        foreach (['products', 'discount', 'freight', 'insurance', 'other', 'invoice'] as $field) {
            if (!isset($totals[$field]) || !is_numeric($totals[$field])) {
                $errors[] = "totals.{$field} numerico obrigatorio.";
            }
        }
        if (is_array($items) && is_numeric($totals['products'] ?? null)) {
            $itemProducts = round(array_sum(array_map(static fn (array $item): float => (float)($item['total'] ?? 0), $items)), 2);
            if ($itemProducts !== round((float)$totals['products'], 2)) $errors[] = 'Totais: subtotal diverge dos itens.';
            $itemDiscount = round(array_sum(array_map(static fn (array $item): float => (float)($item['discount'] ?? 0), $items)), 2);
            if ($itemDiscount !== round((float)($totals['discount'] ?? 0), 2)) $errors[] = 'Totais: desconto diverge dos itens.';
            $calculatedTotal = round((float)$totals['products'] - (float)$totals['discount'] + (float)($totals['freight'] ?? 0) + (float)($totals['insurance'] ?? 0) + (float)($totals['other'] ?? 0), 2);
            if ($calculatedTotal !== round((float)($totals['invoice'] ?? 0), 2)) $errors[] = 'Totais: valor da nota inconsistente.';
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
        if (!preg_match('/^\d{8}$/', (string)($address['zip'] ?? ''))) $errors[] = "{$prefix}.zip deve ter 8 digitos.";
    }

    private function validDocument(string $value): bool
    {
        $digits = preg_replace('/\D/', '', $value) ?? '';
        $length = strlen($digits);
        if (!in_array($length, [11, 14], true) || preg_match('/^(\d)\1+$/', $digits)) return false;
        $weights = $length === 11
            ? [[10, 9, 8, 7, 6, 5, 4, 3, 2], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]]
            : [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]];
        foreach ($weights as $index => $weightSet) {
            $sum = 0;
            foreach ($weightSet as $position => $weight) $sum += (int)$digits[$position] * $weight;
            $remainder = $sum % 11;
            $expected = $remainder < 2 ? 0 : 11 - $remainder;
            $digitIndex = $length === 11 ? 9 + $index : 12 + $index;
            if ($expected !== (int)$digits[$digitIndex]) return false;
        }
        return true;
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
