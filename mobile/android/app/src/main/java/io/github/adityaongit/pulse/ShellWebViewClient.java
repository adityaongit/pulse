package io.github.adityaongit.pulse;

import android.net.Uri;
import android.webkit.WebBackForwardList;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.annotation.Nullable;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Loads the Pulse server as a plain web page. The app's origin stays the bundled https://localhost, so the
 * Capacitor bridge (injected only there) never reaches the server or its sign-in proxy; they load here because
 * this client lets them, not through allowNavigation. Everything else goes to Capacitor (system browser).
 */
class ShellWebViewClient extends BridgeWebViewClient {

    private final Bridge bridge;
    @Nullable
    private final String server;

    ShellWebViewClient(Bridge bridge, @Nullable String server) {
        super(bridge);
        this.bridge = bridge;
        this.server = server;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        // Frames stay where the server put them; only top-level navigation decides app or browser.
        if (server != null && (!request.isForMainFrame() || ServerStore.opensInApp(server, request.getUrl().toString()))) return false;
        return super.shouldOverrideUrlLoading(view, request);
    }

    /** The bundled page the WebView started on must not stay behind the server in Back's history. */
    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        if (isLocal(url)) return;
        WebBackForwardList history = view.copyBackForwardList();
        if (history.getSize() > 1 && isLocal(history.getItemAtIndex(0).getUrl())) view.clearHistory();
    }

    /** The bundled error page only when the server is down (5xx), so its own 404 and other 4xx pages stay visible. */
    @Override
    public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
        if (request.isForMainFrame() && response.getStatusCode() < 500) return;
        super.onReceivedHttpError(view, request, response);
    }

    boolean isLocal(@Nullable String url) {
        return url != null && Uri.parse(url).getHost() != null && Uri.parse(url).getHost().equals(Uri.parse(bridge.getLocalUrl()).getHost());
    }
}
