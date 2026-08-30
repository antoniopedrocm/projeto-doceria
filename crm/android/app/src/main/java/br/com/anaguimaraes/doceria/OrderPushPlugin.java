package br.com.anaguimaraes.doceria;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.messaging.FirebaseMessaging;

@CapacitorPlugin(
        name = "OrderPush",
        permissions = {
                @Permission(
                        alias = "notifications",
                        strings = { Manifest.permission.POST_NOTIFICATIONS }
                )
        }
)
public class OrderPushPlugin extends Plugin {
    private static String normalizedString(PluginCall call, String key) {
        String value = call.getString(key);
        return value == null ? "" : value.trim();
    }

    @Override
    @PluginMethod
    @PermissionCallback
    public void checkPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            resolveNotificationsGranted(call);
            return;
        }
        super.checkPermissions(call);
    }

    @Override
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            resolveNotificationsGranted(call);
            return;
        }
        super.requestPermissions(call);
    }

    @PluginMethod
    public void claimAlert(PluginCall call) {
        String uid = normalizedString(call, "uid");
        String storeId = normalizedString(call, "storeId");
        String orderId = normalizedString(call, "orderId");
        if (uid.isEmpty() || storeId.isEmpty() || orderId.isEmpty()) {
            call.reject("UID, loja e pedido são obrigatórios para deduplicar o alerta.");
            return;
        }

        JSObject result = new JSObject();
        result.put("claimed", OrderAlertDedupeStore.claim(getContext(), uid, storeId, orderId));
        call.resolve(result);
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful()) {
                call.reject("Não foi possível obter o token FCM do Android.", task.getException());
                return;
            }

            String token = task.getResult();
            if (token == null || token.trim().isEmpty()) {
                call.reject("O Firebase não retornou um token FCM válido.");
                return;
            }

            JSObject result = new JSObject();
            result.put("token", token.trim());
            call.resolve(result);
        });
    }

    private void resolveNotificationsGranted(PluginCall call) {
        JSObject result = new JSObject();
        result.put("notifications", "granted");
        call.resolve(result);
    }
}
