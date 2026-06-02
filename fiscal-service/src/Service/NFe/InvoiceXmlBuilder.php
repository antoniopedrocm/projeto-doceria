<?php

declare(strict_types=1);

namespace AnaGuimaraes\Fiscal\Service\NFe;

use InvalidArgumentException;
use NFePHP\NFe\Make;
use stdClass;

final class InvoiceXmlBuilder
{
    /**
     * @param array<string, mixed> $payload
     */
    public function build(array $payload): string
    {
        $nfe = new Make();
        $invoice = $payload['invoice'];
        $issuer = $payload['issuer'];
        $customer = $payload['customer'];

        $this->tagInfNFe($nfe);
        $this->tagIde($nfe, $payload);
        $this->tagIssuer($nfe, $issuer);
        $this->tagCustomer($nfe, $customer);
        $this->tagItems($nfe, $payload);
        $this->tagTotals($nfe, $payload);
        $this->tagTransport($nfe);
        $this->tagPayment($nfe, $payload);
        $this->tagAdditionalInfo($nfe, $payload);

        if (!$nfe->montaNFe()) {
            throw new InvalidArgumentException(implode('; ', $nfe->getErrors()));
        }

        return $nfe->getXML();
    }

    private function tagInfNFe(Make $nfe): void
    {
        $std = new stdClass();
        $std->versao = '4.00';
        $std->Id = null;
        $std->pk_nItem = null;
        $nfe->taginfNFe($std);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function tagIde(Make $nfe, array $payload): void
    {
        $invoice = $payload['invoice'];
        $issuer = $payload['issuer'];

        $std = new stdClass();
        $std->cUF = 52;
        $hash = crc32('nfe-' . (string)$invoice['number']);
        $cNF = (abs($hash) % 99999998) + 1;
        $std->cNF = str_pad((string)$cNF, 8, '0', STR_PAD_LEFT);
        $std->natOp = $invoice['operationNature'];
        $std->mod = (int)$invoice['model'];
        $std->serie = (int)$invoice['series'];
        $std->nNF = (int)$invoice['number'];
        $std->dhEmi = $this->nfeDate((string)$invoice['issueDate']);
        $std->dhSaiEnt = $std->dhEmi;
        $std->tpNF = 1;
        $std->idDest = (int)$invoice['destinationType'];
        $std->cMunFG = (int)$issuer['address']['cityCode'];
        $std->tpImp = (int)$invoice['model'] === 65 ? 4 : 1;
        $std->tpEmis = 1;
        $std->cDV = 0;
        $std->tpAmb = (int)$payload['environment'];
        $std->finNFe = 1;
        $std->indFinal = !empty($invoice['finalConsumer']) ? 1 : 0;
        $std->indPres = (int)$invoice['model'] === 65
            ? 1
            : (int)($invoice['presence'] ?? 1);
        $std->procEmi = 0;
        $std->verProc = $this->processVersion($invoice['processVersion'] ?? '');
        $std->indIntermed = (int)($invoice['intermediary'] ?? 0);
        $nfe->tagide($std);
    }

    /**
     * @param array<string, mixed> $issuer
     */
    private function tagIssuer(Make $nfe, array $issuer): void
    {
        $std = new stdClass();
        $std->xNome = $issuer['legalName'];
        $std->xFant = $issuer['tradeName'] ?? $issuer['legalName'];
        $std->IE = $issuer['stateRegistration'];
        $std->CRT = (int)$issuer['taxRegime'];
        $std->CNPJ = $issuer['cnpj'];
        $nfe->tagemit($std);

        $address = $issuer['address'];
        $std = new stdClass();
        $std->xLgr = $address['street'];
        $std->nro = $address['number'];
        $std->xBairro = $address['district'];
        $std->cMun = (int)$address['cityCode'];
        $std->xMun = $address['city'];
        $std->UF = $address['state'];
        $std->CEP = $address['zip'];
        $std->cPais = 1058;
        $std->xPais = 'BRASIL';
        $std->fone = (string)($address['phone'] ?? '');
        $this->setOptional($std, 'xCpl', $address['complement'] ?? '');
        $nfe->tagenderEmit($std);
    }

    /**
     * @param array<string, mixed> $customer
     */
    private function tagCustomer(Make $nfe, array $customer): void
    {
        $document = preg_replace('/\D/', '', (string)$customer['document']);

        $std = new stdClass();
        $std->xNome = $customer['name'];
        if (strlen($document) > 11) {
            $std->CNPJ = $document;
        } else {
            $std->CPF = $document;
        }
        $std->indIEDest = empty($customer['stateRegistration']) ? 9 : 1;
        $this->setOptional($std, 'IE', $customer['stateRegistration'] ?? '');
        $this->setOptional($std, 'email', $customer['email'] ?? '');
        $nfe->tagdest($std);

        $address = $customer['address'];
        $std = new stdClass();
        $std->xLgr = $address['street'];
        $std->nro = $address['number'];
        $std->xBairro = $address['district'];
        $std->cMun = (int)$address['cityCode'];
        $std->xMun = $address['city'];
        $std->UF = $address['state'];
        $std->CEP = $address['zip'];
        $std->cPais = 1058;
        $std->xPais = 'BRASIL';
        $std->fone = (string)($address['phone'] ?? $customer['phone'] ?? '');
        $this->setOptional($std, 'xCpl', $address['complement'] ?? '');
        $nfe->tagenderDest($std);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function tagItems(Make $nfe, array $payload): void
    {
        foreach ($payload['items'] as $index => $item) {
            $nItem = $index + 1;

            $std = new stdClass();
            $std->item = $nItem;
            $std->cProd = $item['code'];
            $std->cEAN = 'SEM GTIN';
            $std->xProd = $item['description'];
            $std->NCM = $item['ncm'];
            $std->CFOP = $item['cfop'];
            $std->uCom = $item['unit'];
            $std->qCom = $this->decimal($item['quantity'], 4);
            $std->vUnCom = $this->decimal($item['unitPrice'], 10);
            $std->vProd = $this->decimal($item['total'], 2);
            $std->cEANTrib = 'SEM GTIN';
            $std->uTrib = $item['unit'];
            $std->qTrib = $this->decimal($item['quantity'], 4);
            $std->vUnTrib = $this->decimal($item['unitPrice'], 10);
            if ((float)$item['discount'] > 0) {
                $std->vDesc = $this->decimal($item['discount'], 2);
            }
            $std->indTot = 1;
            $nfe->tagprod($std);

            $std = new stdClass();
            $std->item = $nItem;
            $nfe->tagimposto($std);

            $tax = $item['tax'];
            $std = new stdClass();
            $std->item = $nItem;
            $std->orig = (int)$tax['origin'];
            if (!empty($tax['csosn'])) {
                $std->CSOSN = $tax['csosn'];
                $nfe->tagICMSSN($std);
            } else {
                $std->CST = $tax['cst'];
                $std->modBC = 3;
                $std->vBC = '0.00';
                $std->pICMS = '0.00';
                $std->vICMS = '0.00';
                $nfe->tagICMS($std);
            }

            $this->tagPisCofins($nfe, $nItem, (string)$tax['pisCst'], (string)$tax['cofinsCst']);
        }
    }

    private function tagPisCofins(Make $nfe, int $nItem, string $pisCst, string $cofinsCst): void
    {
        $std = new stdClass();
        $std->item = $nItem;
        $std->CST = $pisCst;
        $std->vBC = '0.00';
        $std->pPIS = '0.00';
        $std->vPIS = '0.00';
        $nfe->tagPIS($std);

        $std = new stdClass();
        $std->item = $nItem;
        $std->CST = $cofinsCst;
        $std->vBC = '0.00';
        $std->pCOFINS = '0.00';
        $std->vCOFINS = '0.00';
        $nfe->tagCOFINS($std);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function tagTotals(Make $nfe, array $payload): void
    {
        $totals = $payload['totals'];
        $std = new stdClass();
        $std->vBC = '0.00';
        $std->vICMS = '0.00';
        $std->vICMSDeson = '0.00';
        $std->vFCP = '0.00';
        $std->vBCST = '0.00';
        $std->vST = '0.00';
        $std->vFCPST = '0.00';
        $std->vFCPSTRet = '0.00';
        $std->vProd = $this->decimal($totals['products'], 2);
        $std->vFrete = $this->decimal($totals['freight'], 2);
        $std->vSeg = $this->decimal($totals['insurance'], 2);
        $std->vDesc = $this->decimal($totals['discount'], 2);
        $std->vII = '0.00';
        $std->vIPI = '0.00';
        $std->vIPIDevol = '0.00';
        $std->vPIS = '0.00';
        $std->vCOFINS = '0.00';
        $std->vOutro = $this->decimal($totals['other'], 2);
        $std->vNF = $this->decimal($totals['invoice'], 2);
        $nfe->tagICMSTot($std);
    }

    private function tagTransport(Make $nfe): void
    {
        $std = new stdClass();
        $std->modFrete = 9;
        $nfe->tagtransp($std);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function tagPayment(Make $nfe, array $payload): void
    {
        $payment = $payload['invoice']['payment'];

        $std = new stdClass();
        $nfe->tagpag($std);

        $std = new stdClass();
        $std->indPag = isset($payment['dueDate']) ? 1 : 0;
        $std->tPag = $payment['methodCode'];
        $std->vPag = $this->decimal($payment['amount'], 2);

        // Cartão de crédito (03) e débito (04) exigem dados do cartão.
        if (in_array((string)$payment['methodCode'], ['03', '04'], true)) {
            $std->tpIntegra = (int)($payment['integrationType'] ?? 2);
            $std->tBand = $payment['cardBrand'] ?? '99';
            $std->cAut = $payment['cardAuth'] ?? '0';
        }

        $nfe->tagdetPag($std);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function tagAdditionalInfo(Make $nfe, array $payload): void
    {
        if (empty($payload['additionalInfo'])) {
            return;
        }
        $std = new stdClass();
        $std->infCpl = $payload['additionalInfo'];
        $nfe->taginfAdic($std);
    }

    private function decimal(mixed $value, int $scale): string
    {
        return number_format((float)$value, $scale, '.', '');
    }

    private function setOptional(stdClass $std, string $field, mixed $value): void
    {
        if ($value === null) {
            return;
        }

        if (is_string($value)) {
            $value = trim($value);
            if ($value === '') {
                return;
            }
        }

        $std->{$field} = $value;
    }

    private function processVersion(mixed $value): string
    {
        $text = trim((string)$value);
        if ($text === '') {
            $text = 'ana-doceria-1.0';
        }

        return substr($text, 0, 20);
    }

    private function nfeDate(string $value): string
    {
        $tz = new \DateTimeZone('America/Fortaleza');
        $now = new \DateTimeImmutable('now', $tz);

        try {
            $dt = new \DateTimeImmutable($value);
        } catch (\Exception $e) {
            $dt = $now;
        }

        $dt = $dt->setTimezone($tz);
        $latestSafeEmission = $now->sub(new \DateInterval('PT2M'));
        if ($dt > $latestSafeEmission) {
            $dt = $latestSafeEmission;
        }

        return $dt->format('Y-m-d\TH:i:sP');
    }
}
