package io.github.adityaongit.pulse;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.Nullable;
import java.net.URI;
import java.util.Locale;

final class ServerStore {

    private static final String PREFS = "pulse_shell";
    private static final String KEY_URL = "server_url";
    private static final String KEY_PICK = "show_picker";
    // Sign-in hosts a Pulse server may sit behind (Cloudflare Access); every other host opens in the browser.
    private static final String AUTH_HOST_SUFFIX = ".cloudflareaccess.com";

    private ServerStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @Nullable
    static String url(Context context) {
        return origin(prefs(context).getString(KEY_URL, null));
    }

    static void save(Context context, String origin) {
        prefs(context).edit().putString(KEY_URL, origin).remove(KEY_PICK).apply();
    }

    static void requestPicker(Context context) {
        prefs(context).edit().putBoolean(KEY_PICK, true).apply();
    }

    /** The server to open at launch, or null for the bundled picker (none saved, or one was asked for). */
    @Nullable
    static String launchUrl(Context context) {
        SharedPreferences prefs = prefs(context);
        if (prefs.getBoolean(KEY_PICK, false)) {
            prefs.edit().remove(KEY_PICK).apply();
            return null;
        }
        return url(context);
    }

    /** The https origin of `raw` as scheme://host[:port]/, or null. The trailing slash keeps prefix checks to this host. */
    @Nullable
    static String origin(@Nullable String raw) {
        if (raw == null) return null;
        URI uri;
        try {
            uri = new URI(raw.trim());
        } catch (Exception ex) {
            return null;
        }
        String host = uri.getHost();
        if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || host.isEmpty()) return null;
        int port = uri.getPort();
        return "https://" + host.toLowerCase(Locale.ROOT) + (port == -1 || port == 443 ? "" : ":" + port) + "/";
    }

    /** Whether `url` loads in the app's WebView: the server itself (same scheme, host and port) or its sign-in proxy. */
    static boolean opensInApp(String server, String url) {
        String origin = origin(url);
        if (origin == null) return false;
        if (origin.equals(server)) return true;
        String host = URI.create(origin).getHost();
        return host.endsWith(AUTH_HOST_SUFFIX);
    }
}
