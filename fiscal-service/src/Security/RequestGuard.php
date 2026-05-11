<?php

declare(strict_types=1);

namespace AnaGuimaraes\Fiscal\Security;

use RuntimeException;

final class RequestGuard
{
    /**
     * @param array<string, mixed> $server
     */
    public static function assertAllowed(array $server): void
    {
        $expected = getenv('FISCAL_SHARED_SECRET') ?: '';
        if ($expected === '') {
            return;
        }

        $provided = (string)($server['HTTP_X_FISCAL_SERVICE_TOKEN'] ?? '');
        if (!hash_equals($expected, $provided)) {
            throw new RuntimeException('Unauthorized fiscal service request.');
        }
    }
}

