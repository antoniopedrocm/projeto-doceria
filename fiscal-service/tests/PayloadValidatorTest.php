<?php
declare(strict_types=1);

require __DIR__ . '/../src/Service/PayloadValidator.php';
require __DIR__ . '/../src/Service/ItemCharges.php';
use AnaGuimaraes\Fiscal\Service\PayloadValidator;

$address = ['street' => 'Rua Teste', 'number' => '1', 'district' => 'Centro', 'city' => 'Goiania', 'cityCode' => '5208707', 'state' => 'GO', 'zip' => '74000000'];
$payload = [
    'environment' => 2,
    'invoice' => ['model' => 55, 'series' => 1, 'number' => 1, 'operationNature' => 'Teste', 'issueDate' => '2026-10-13'],
    'issuer' => ['cnpj' => '37185245000140', 'legalName' => 'Emitente de teste', 'stateRegistration' => '1', 'taxRegime' => 1, 'address' => $address],
    'customer' => ['name' => 'Destinatario de teste', 'document' => '52998224725', 'address' => $address],
    'items' => [['code' => 'T1', 'description' => 'Item de teste', 'ncm' => '19059090', 'cfop' => '5101', 'unit' => 'un', 'quantity' => 2, 'unitPrice' => 10, 'total' => 20, 'discount' => 0,
        'tax' => ['origin' => 0, 'csosn' => '102', 'pisCst' => '49', 'cofinsCst' => '49']]],
    'totals' => ['products' => 20, 'discount' => 0, 'freight' => 0, 'insurance' => 0, 'other' => 0, 'invoice' => 20],
];
$validator = new PayloadValidator();
foreach ([55, 65] as $model) {
    $valid = $payload;
    $valid['invoice']['model'] = $model;
    if ($validator->validateIssuePayload($valid) !== []) throw new RuntimeException('Documento valido rejeitado.');
}
$cases = [
    ['customer', 'document', '52998224726', 'CPF/CNPJ'],
    ['issuer', 'cnpj', '37185245000141', 'CNPJ'],
    ['invoice', 'model', 99, 'model'],
    ['invoice', 'number', 0, 'numero'],
    ['totals', 'invoice', 99, 'inconsistente'],
    ['totals', 'products', 99, 'subtotal'],
    ['totals', 'discount', 2, 'desconto'],
];
foreach ($cases as [$group, $field, $value, $message]) {
    $invalid = $payload;
    $invalid[$group][$field] = $value;
    if (!str_contains(implode(' ', $validator->validateIssuePayload($invalid)), $message)) throw new RuntimeException('Pendencia nao identificada: ' . $field);
}
$invalid = $payload;
$invalid['customer']['address']['zip'] = '74000';
if (!str_contains(implode(' ', $validator->validateIssuePayload($invalid)), '8 digitos')) throw new RuntimeException('CEP invalido aceito.');
$invalid = $payload;
$invalid['items'][0]['ncm'] = '';
if (!str_contains(implode(' ', $validator->validateIssuePayload($invalid)), 'ncm')) throw new RuntimeException('NCM vazio aceito.');
$invalid = $payload;
$invalid['items'][0]['tax']['origin'] = null;
if (!str_contains(implode(' ', $validator->validateIssuePayload($invalid)), 'origin')) throw new RuntimeException('Origem ausente aceita.');
echo "12 verificacoes PHP aprovadas, sem transmissao fiscal.\n";
