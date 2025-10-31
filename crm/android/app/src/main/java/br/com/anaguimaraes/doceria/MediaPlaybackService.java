package br.com.anaguimaraes.doceria;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

public class MediaPlaybackService extends Service {
    public static final String ACTION_START_ALARM = "br.com.anaguimaraes.doceria.action.START_ALARM";
    public static final String ACTION_STOP_ALARM = "br.com.anaguimaraes.doceria.action.STOP_ALARM";
    public static final String EXTRA_TITLE = "extra_title";
    public static final String EXTRA_BODY = "extra_body";
    public static final String EXTRA_URL = "extra_url";

    private static final String CHANNEL_ID = "doceria-orders-channel";
    private static final int NOTIFICATION_ID = 2024;
    private static final long AUTO_STOP_DELAY_MS = 120_000L;

    private MediaPlayer mediaPlayer;
    private Handler handler;
    private Runnable stopRunnable;

    public static void startAlarm(Context context, String title, String body, String url) {
        Intent intent = new Intent(context, MediaPlaybackService.class);
        intent.setAction(ACTION_START_ALARM);
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_BODY, body);
        intent.putExtra(EXTRA_URL, url);
        ContextCompat.startForegroundService(context, intent);
    }

    public static void stopAlarm(Context context) {
        Intent intent = new Intent(context, MediaPlaybackService.class);
        context.stopService(intent);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) {
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_START_ALARM.equals(action)) {
            String title = intent.getStringExtra(EXTRA_TITLE);
            String body = intent.getStringExtra(EXTRA_BODY);
            String url = intent.getStringExtra(EXTRA_URL);
            startForegroundAlarm(title, body, url);
        } else if (ACTION_STOP_ALARM.equals(action)) {
            stopForegroundAlarm();
        }

        return START_STICKY;
    }

    private void startForegroundAlarm(String title, String body, String url) {
        createNotificationChannel();
        startMediaPlayer();
        Notification notification = buildNotification(title, body, url);
        startForeground(NOTIFICATION_ID, notification);
        scheduleAutoStop();
    }

    private void scheduleAutoStop() {
        if (handler == null) {
            handler = new Handler(Looper.getMainLooper());
        }
        if (stopRunnable != null) {
            handler.removeCallbacks(stopRunnable);
        }
        stopRunnable = this::stopForegroundAlarm;
        handler.postDelayed(stopRunnable, AUTO_STOP_DELAY_MS);
    }

    private void stopForegroundAlarm() {
        stopMediaPlayer();
        if (handler != null && stopRunnable != null) {
            handler.removeCallbacks(stopRunnable);
        }
        stopForeground(true);
        NotificationManagerCompat.from(this).cancel(NOTIFICATION_ID);
        stopSelf();
    }

    private void startMediaPlayer() {
        stopMediaPlayer();
        mediaPlayer = MediaPlayer.create(this, R.raw.mixkit_vintage_warning_alarm_990);
        if (mediaPlayer != null) {
            mediaPlayer.setLooping(true);
            mediaPlayer.start();
        }
    }

    private void stopMediaPlayer() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                }
            } catch (IllegalStateException ignored) {
            }
            mediaPlayer.release();
            mediaPlayer = null;
        }
    }

    private Notification buildNotification(String title, String body, String url) {
        if (title == null || title.isEmpty()) {
            title = getString(R.string.app_name);
        }
        if (body == null || body.isEmpty()) {
            body = getString(R.string.notification_order_body);
        }

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (url != null) {
            openIntent.putExtra("notification_url", url);
        }

        int immutableFlag = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;

        PendingIntent contentIntent = PendingIntent.getActivity(
                this,
                0,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | immutableFlag
        );

        Intent stopIntent = new Intent(this, MediaPlaybackService.class);
        stopIntent.setAction(ACTION_STOP_ALARM);

        PendingIntent stopPendingIntent = PendingIntent.getService(
                this,
                1,
                stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | immutableFlag
        );

        NotificationCompat.Action stopAction = new NotificationCompat.Action.Builder(
                android.R.drawable.ic_lock_silent_mode_off,
                getString(R.string.stop),
                stopPendingIntent
        ).build();

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setFullScreenIntent(contentIntent, true)
                .setContentIntent(contentIntent)
                .setOngoing(true)
                .setAutoCancel(false)
                .addAction(stopAction)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager notificationManager = getSystemService(NotificationManager.class);
        if (notificationManager == null) {
            return;
        }

        NotificationChannel channel = notificationManager.getNotificationChannel(CHANNEL_ID);
        if (channel != null) {
            return;
        }

        channel = new NotificationChannel(
                CHANNEL_ID,
                "Pedidos da Doceria",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.enableVibration(true);
        channel.enableLights(true);
        channel.setDescription("Alertas de pedidos com alarme sonoro.");

        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.mixkit_vintage_warning_alarm_990);
        channel.setSound(soundUri, audioAttributes);

        notificationManager.createNotificationChannel(channel);
    }

    @Override
    public void onDestroy() {
        stopMediaPlayer();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}