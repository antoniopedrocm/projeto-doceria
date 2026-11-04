<?php
declare(strict_types=1);

namespace AnaGuimaraes\Fiscal\Service;

final class ItemCharges
{
    public static function cents(mixed $value): int
    {
        return is_numeric($value) && is_finite((float)$value) ? (int)round((float)$value * 100, 0, PHP_ROUND_HALF_UP) : 0;
    }

    /** Legacy order payloads have only header charges. Explicit item charges are never silently repaired. */
    public static function prepare(array $payload): array
    {
        $items = $payload['items'] ?? [];
        $weights = array_map(static fn(array $item): int => max(0, self::cents($item['total'] ?? 0)), $items);
        $total = array_sum($weights);
        $eligible = array_keys(array_filter($weights, static fn(int $weight): bool => $weight > 0));
        $last = $eligible === [] ? -1 : end($eligible);
        foreach (['freight', 'insurance', 'other'] as $field) {
            if (array_filter($items, static fn(array $item): bool => array_key_exists($field, $item))) continue;
            $amount = self::cents($payload['totals'][$field] ?? 0);
            $remainder = $amount;
            foreach ($weights as $index => $weight) {
                // bcmath is available in the pinned production runtime; avoid large integer multiplication overflow.
                $share = $index === $last ? $remainder : ($total > 0
                    ? (int)bcdiv(bcmul((string)$amount, (string)$weight, 0), (string)$total, 0) : 0);
                $items[$index][$field] = $share / 100;
                $remainder -= $share;
            }
        }
        $payload['items'] = $items;
        return $payload;
    }
}
