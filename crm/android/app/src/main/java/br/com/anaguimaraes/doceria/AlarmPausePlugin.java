package br.com.anaguimaraes.doceria;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AlarmPause")
public class AlarmPausePlugin extends Plugin {
    static final String PREFERENCES_NAME = "order_alarm_pause";
    static final String CURRENT_UID_KEY = "current_uid";
    static final String CURRENT_STORE_KEY = "current_store";

    static String pauseKey(String uid, String storeId) {
        return "paused_until::" + uid + "::" + storeId;
    }

    static long getPausedUntil(Context context, String uid, String storeId) {
        if (uid == null || uid.isEmpty() || storeId == null || storeId.isEmpty()) return 0L;
        SharedPreferences preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
        long pausedUntil = preferences.getLong(pauseKey(uid, storeId), 0L);
        if (pausedUntil > 0L && pausedUntil <= System.currentTimeMillis()) {
            clearPause(context, uid, storeId);
            return 0L;
        }
        return pausedUntil;
    }

    static void clearPause(Context context, String uid, String storeId) {
        if (uid == null || uid.isEmpty() || storeId == null || storeId.isEmpty()) return;
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
                .edit()
                .remove(pauseKey(uid, storeId))
                .apply();
    }

    private static String normalizedString(PluginCall call, String key) {
        String value = call.getString(key);
        return value == null ? "" : value.trim();
    }

    @PluginMethod
    public void syncContext(PluginCall call) {
        String uid = normalizedString(call, "uid");
        String storeId = normalizedString(call, "storeId");
        long pausedUntil = call.getLong("pausedUntil", 0L);

        if (uid.isEmpty() || storeId.isEmpty()) {
            call.reject("UID e loja são obrigatórios para sincronizar a pausa do alarme.");
            return;
        }

        SharedPreferences.Editor editor = getContext()
                .getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(CURRENT_UID_KEY, uid)
                .putString(CURRENT_STORE_KEY, storeId);

        if (pausedUntil > System.currentTimeMillis()) {
            editor.putLong(pauseKey(uid, storeId), pausedUntil);
        } else {
            editor.remove(pauseKey(uid, storeId));
        }
        editor.apply();

        JSObject result = new JSObject();
        result.put("pausedUntil", Math.max(pausedUntil, 0L));
        call.resolve(result);
    }

    @PluginMethod
    public void clearCurrentContext(PluginCall call) {
        getContext()
                .getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
                .edit()
                .remove(CURRENT_UID_KEY)
                .remove(CURRENT_STORE_KEY)
                .apply();
        call.resolve();
    }
}
