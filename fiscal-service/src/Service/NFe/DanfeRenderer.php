<?php

declare(strict_types=1);

namespace AnaGuimaraes\Fiscal\Service\NFe;

use NFePHP\DA\NFe\Danfe;

final class DanfeRenderer
{
    public function render(string $authorizedXml, int $model): string
    {
        if ($model === 65 && class_exists('NFePHP\\DA\\NFe\\Danfce')) {
            $class = 'NFePHP\\DA\\NFe\\Danfce';
            $danfce = new $class($authorizedXml);
            return $danfce->render();
        }

        $danfe = new Danfe($authorizedXml);
        $danfe->debugMode(false);
        return $danfe->render();
    }
}

