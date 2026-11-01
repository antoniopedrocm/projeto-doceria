<?php
declare(strict_types=1);
require __DIR__ . '/../vendor/autoload.php';

use AnaGuimaraes\Fiscal\Service\ItemCharges;
use AnaGuimaraes\Fiscal\Service\PayloadValidator;
use AnaGuimaraes\Fiscal\Service\NFe\InvoiceXmlBuilder;
use AnaGuimaraes\Fiscal\Service\NFe\DanfeRenderer;
use NFePHP\Common\Certificate;
use NFePHP\NFe\Tools;

function check(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
$address = ['street'=>'Rua Teste','number'=>'1','district'=>'Centro','city'=>'Goiania','cityCode'=>'5208707','state'=>'GO','zip'=>'74000000'];
$item = ['code'=>'T1','description'=>'Produto teste','ncm'=>'19059090','cfop'=>'5101','unit'=>'un','quantity'=>1,'unitPrice'=>2025,'total'=>2025,'discount'=>0,
    'tax'=>['origin'=>0,'csosn'=>'102','pisCst'=>'49','cofinsCst'=>'49']];
$payload = ['environment'=>2,'origin'=>'manual','manualInvoice'=>true,
    'invoice'=>['model'=>55,'series'=>1,'number'=>1,'operationNature'=>'Venda teste','issueDate'=>date('c'),'destinationType'=>1,'finalConsumer'=>true,'presence'=>1,'payment'=>['methodCode'=>'01','amount'=>2325]],
    'issuer'=>['cnpj'=>'37185245000140','legalName'=>'EMITENTE TESTE','stateRegistration'=>'108911454','taxRegime'=>1,'address'=>$address],
    'customer'=>['name'=>'DESTINATARIO TESTE','document'=>'52998224725','address'=>$address],
    'items'=>[$item],'transport'=>['freightMode'=>'0'],
    'totals'=>['products'=>2025,'discount'=>0,'freight'=>300,'insurance'=>0,'other'=>0,'invoice'=>2325]];
$validator = new PayloadValidator();
$builder = new InvoiceXmlBuilder();
$xml = $builder->build($payload);
$dom = new DOMDocument(); $dom->loadXML($xml);
$xp = new DOMXPath($dom); $xp->registerNamespace('n','http://www.portalfiscal.inf.br/nfe');
check($xp->evaluate('string(//n:det/n:prod/n:vFrete)') === '300.00', 'Item vFrete must equal 300.00');
check($xp->evaluate('string(//n:ICMSTot/n:vFrete)') === '300.00', 'Header vFrete must equal 300.00');
check($xp->evaluate('string(//n:ICMSTot/n:vNF)') === '2325.00', 'Freight counted once');
check($xp->evaluate('string(//n:transp/n:modFrete)') === '0', 'Selected freight mode retained');
check($xp->query('//n:det')->length === 1, 'No fictitious freight item');

foreach ([[1,1,1,0], [10.01,20.03,0,30.07]] as $weights) {
    $many = $payload; $many['items'] = [];
    foreach ($weights as $index=>$weight) $many['items'][] = array_replace($item,['code'=>'T'.$index,'unitPrice'=>$weight,'total'=>$weight]);
    $many['totals']['products'] = round(array_sum($weights),2);
    $many['totals']['freight'] = .02; $many['totals']['invoice'] = round(array_sum($weights)+.02,2);
    $prepared = ItemCharges::prepare($many);
    check(array_sum(array_map(fn($i)=>ItemCharges::cents($i['freight']),$prepared['items']))===2,'Exact residual cents');
    check($prepared['items'][array_search(0,$weights,true)]['freight']===0,'Zero product never receives freight');
    $builder->build($prepared);
}
$zero = $payload; $zero['totals']['freight']=0; $zero['totals']['invoice']=2025;
$zeroXml = $builder->build($zero); check(!str_contains($zeroXml,'<vFrete>300.00</vFrete>'),'Zero freight preserved');
$bad = ItemCharges::prepare($payload); $bad['items'][0]['freight']=299.99;
check(str_contains(implode(' ',$validator->validateIssuePayload($bad)),'freight da nota difere'),'Mismatch blocked');
try { $builder->build($bad); throw new RuntimeException('Invalid payload built'); } catch (InvalidArgumentException $expected) {}
$negative = $payload; $negative['totals']['freight']=-1;
check(str_contains(implode(' ',$validator->validateIssuePayload($negative)),'nao negativo'),'Negative freight blocked');
$badMode = $payload; $badMode['transport']['freightMode']='7';
check(str_contains(implode(' ',$validator->validateIssuePayload($badMode)),'modalidade'),'Invalid mode blocked');

// Ephemeral local certificate, no SEFAZ call, no real certificate or secret used.
$private = openssl_pkey_new(['private_key_bits'=>2048]);
$csr = openssl_csr_new(['countryName'=>'BR','stateOrProvinceName'=>'GO','localityName'=>'Goiania','organizationName'=>'TEST ONLY','commonName'=>'TEST ONLY:37185245000140'],$private,['config'=>'/etc/ssl/openssl.cnf','digest_alg'=>'sha256']);
$cert = openssl_csr_sign($csr,null,$private,1);
openssl_pkcs12_export($cert,$pfx,$private,'test-only');
$tools = new Tools(json_encode(['tpAmb'=>2,'razaosocial'=>'TESTE','siglaUF'=>'GO','cnpj'=>'37185245000140','schemes'=>'PL_010_V1','versao'=>'4.00','atualizacao'=>date('Y-m-d H:i:s')]), Certificate::readPfx($pfx,'test-only'));
$signed = $tools->signNFe($xml);
// signNFe uses the installed NFePHP local XSD validation.
check(str_contains($signed,'Signature'),'Local test signature and schema passed');
$pdf = (new DanfeRenderer())->render($signed,55);
check(str_starts_with($pdf,'%PDF-'),'DANFE generated locally from test XML');
preg_match_all('/stream\r?\n(.*?)endstream/s',$pdf,$streams);
$content=''; foreach($streams[1] as $stream) $content .= @gzuncompress(rtrim($stream,"\r\n")) ?: $stream;
check(str_contains($content,'300,00') && str_contains($content,'2.325,00'),'DANFE displays freight and total');
$order=$payload; unset($order['manualInvoice']); $order['origin']='order'; $builder->build($order);
$nfce=$zero; $nfce['invoice']['model']=65; $nfce['transport']['freightMode']='9'; $builder->build($nfce);
echo "Freight XML, local schema/signature, totals, cents, DANFE, legacy order and NFC-e: passed (tpAmb=2; no transmission).\n";
