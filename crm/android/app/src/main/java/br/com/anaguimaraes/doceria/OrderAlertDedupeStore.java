package br.com.anaguimaraes.doceria;

import android.content.Context;
import android.content.SharedPreferences;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Map;

final class OrderAlertDedupeStore {
    private static final String PREFERENCES_NAME = "new_order_alert_dedupe";
    private static final long RETENTION_MS = 7L * 24L * 60L * 60L * 1000L;

    private OrderAlertDedupeStore() {
    }

    static synchronized boolean claim(Context context, String uid, String storeId, String orderId) {
        if (uid == null || uid.isEmpty() || storeId == null || storeId.isEmpty()
                || orderId == null || orderId.isEmpty()) {
            return false;
        }

        SharedPreferences preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        long minimumTimestamp = now - RETENTION_MS;
        SharedPreferences.Editor editor = preferences.edit();

        for (Map.Entry<String, ?> entry : preferences.getAll().entrySet()) {
            Object value = entry.getValue();
            if (!(value instanceof Long) || (Long) value < minimumTimestamp) {
                editor.remove(entry.getKey());
            }
        }

        String key = hash(uid + ":" + storeId + ":" + orderId);
        long previousTimestamp = preferences.getLong(key, 0L);
        if (previousTimestamp >= minimumTimestamp) {
            editor.apply();
            return false;
        }

        editor.putLong(key, now).apply();
        return true;
    }

    private static String hash(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(bytes.length * 2);
            for (byte current : bytes) {
                result.append(String.format("%02x", current));
            }
            return result.toString();
        } catch (NoSuchAlgorithmException error) {
            return Integer.toHexString(value.hashCode());
        }
    }
}
