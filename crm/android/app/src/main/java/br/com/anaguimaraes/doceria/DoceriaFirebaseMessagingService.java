package br.com.anaguimaraes.doceria;

import android.Manifest;
import android.app.ActivityManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.List;
import java.util.Map;

public class DoceriaFirebaseMessagingService extends FirebaseMessagingService {
    private static final String TAG = "DoceriaMessaging";
    private static final String MESSAGE_TYPE_NEW_ORDER = "new_order";

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        getSharedPreferences("order_push", Context.MODE_PRIVATE)
                .edit()
                .putString("latest_fcm_token", token)
                .apply();
        Log.d(TAG, "Novo token FCM armazenado para sincronização no próximo login.");
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        String type = value(data, "type");
        String orderId = value(data, "orderId");
        String storeId = value(data, "storeId");
        if (!MESSAGE_TYPE_NEW_ORDER.equals(type) || orderId.isEmpty() || storeId.isEmpty()) {
            Log.d(TAG, "Mensagem ignorada porque não representa um novo pedido válido.");
            return;
        }

        SharedPreferences alarmPreferences = getSharedPreferences(
                AlarmPausePlugin.PREFERENCES_NAME,
                Context.MODE_PRIVATE
        );
        String currentUid = alarmPreferences.getString(AlarmPausePlugin.CURRENT_UID_KEY, "");
        if (currentUid == null || currentUid.trim().isEmpty()) {
            Log.d(TAG, "Mensagem ignorada porque não há usuário autenticado no aplicativo.");
            return;
        }
        currentUid = currentUid.trim();

        String currentStoreId = alarmPreferences.getString(AlarmPausePlugin.CURRENT_STORE_KEY, "");
        if (currentStoreId == null || !storeId.equals(currentStoreId.trim())) {
            Log.d(TAG, "Mensagem ignorada porque a loja não está ativa neste dispositivo.");
            return;
        }

        boolean appInForeground = isAppInForeground();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            Log.d(TAG, appInForeground
                    ? "Permissão de notificação ausente; alerta em primeiro plano ficará com a WebView."
                    : "Notificação ignorada porque a permissão do Android não foi concedida.");
            return;
        }

        if (!OrderAlertDedupeStore.claim(this, currentUid, storeId, orderId)) {
            Log.d(TAG, "Alerta duplicado ignorado para o pedido " + orderId + ".");
            return;
        }

        long pausedUntil = AlarmPausePlugin.getPausedUntil(this, currentUid, storeId);
        if (pausedUntil > System.currentTimeMillis()) {
            Log.d(TAG, "Alarme silenciado para o usuário e loja até " + pausedUntil + ".");
            return;
        }

        RemoteMessage.Notification notification = remoteMessage.getNotification();
        String title = notification != null ? notification.getTitle() : value(data, "title");
        String body = notification != null ? notification.getBody() : value(data, "body");
        String url = value(data, "url");

        if (title == null || title.isEmpty()) title = getString(R.string.app_name);
        if (body == null || body.isEmpty()) body = getString(R.string.notification_order_body);

        MediaPlaybackService.startAlarm(this, title, body, url, orderId, storeId);
    }

    private static String value(Map<String, String> data, String key) {
        if (data == null) return "";
        String result = data.get(key);
        return result == null ? "" : result.trim();
    }

    private boolean isAppInForeground() {
        ActivityManager activityManager = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (activityManager == null) return false;

        List<ActivityManager.RunningAppProcessInfo> processes = activityManager.getRunningAppProcesses();
        if (processes == null) return false;

        for (ActivityManager.RunningAppProcessInfo process : processes) {
            if (process.uid == getApplicationInfo().uid) {
                return process.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
                        || process.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE;
            }
        }
        return false;
    }
}
