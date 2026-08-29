package br.com.anaguimaraes.doceria;

import android.app.ActivityManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.List;
import java.util.Map;

public class DoceriaFirebaseMessagingService extends FirebaseMessagingService {
    private static final String TAG = "DoceriaMessaging";

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        Log.d(TAG, "Novo token FCM gerado: " + token);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        RemoteMessage.Notification notification = remoteMessage.getNotification();

        String title = notification != null ? notification.getTitle() : null;
        String body = notification != null ? notification.getBody() : null;
        String url = null;

        if (data != null) {
            if (title == null) {
                title = data.get("title");
            }
            if (body == null) {
                body = data.get("body");
            }
            url = data.get("url");
        }

        if (title == null || title.isEmpty()) {
            title = getString(R.string.app_name);
        }
        if (body == null || body.isEmpty()) {
            body = getString(R.string.notification_order_body);
        }

        Log.d(TAG, "Mensagem recebida: " + body);

        String storeId = data != null ? data.get("storeId") : null;
        SharedPreferences alarmPreferences = getSharedPreferences(
                AlarmPausePlugin.PREFERENCES_NAME,
                Context.MODE_PRIVATE
        );
        String currentUid = alarmPreferences.getString(AlarmPausePlugin.CURRENT_UID_KEY, "");
        long pausedUntil = AlarmPausePlugin.getPausedUntil(this, currentUid, storeId);
        if (pausedUntil > System.currentTimeMillis()) {
            Log.d(TAG, "Alarme FCM silenciado para o usuário e loja atuais até " + pausedUntil + ".");
            return;
        }

        boolean isForeground = isAppInForeground();
        if (isForeground) {
            Log.d(TAG, "Aplicativo em primeiro plano - notificando camada web para tratar o pedido.");
        } else {
            Log.d(TAG, "Aplicativo em segundo plano - iniciando serviço de alarme.");
            MediaPlaybackService.startAlarm(this, title, body, url);
        }
    }

    private boolean isAppInForeground() {
        ActivityManager activityManager = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (activityManager == null) {
            return false;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            List<ActivityManager.AppTask> tasks = activityManager.getAppTasks();
            if (tasks == null) {
                return false;
            }
            for (ActivityManager.AppTask task : tasks) {
                ActivityManager.RecentTaskInfo info = task.getTaskInfo();
                if (info != null && info.topActivity != null && getPackageName().equals(info.topActivity.getPackageName())) {
                    return true;
                }
            }
            return false;
        } else {
            @SuppressWarnings("deprecation")
            List<ActivityManager.RunningTaskInfo> runningTasks = activityManager.getRunningTasks(1);
            if (runningTasks == null || runningTasks.isEmpty()) {
                return false;
            }
            ActivityManager.RunningTaskInfo taskInfo = runningTasks.get(0);
            return taskInfo.topActivity != null && getPackageName().equals(taskInfo.topActivity.getPackageName());
        }
    }
}
