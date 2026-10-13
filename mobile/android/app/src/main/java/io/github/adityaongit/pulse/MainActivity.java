package io.github.adityaongit.pulse;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    static final String ACTION_CHANGE_SERVER = "io.github.adityaongit.pulse.CHANGE_SERVER";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(PulseServerPlugin.class);
        // BridgeActivity replays the launch intent through onNewIntent, so the shortcut's action is consumed here first.
        if (ACTION_CHANGE_SERVER.equals(getIntent().getAction())) {
            ServerStore.requestPicker(this);
            setIntent(new Intent(Intent.ACTION_MAIN).setClass(this, MainActivity.class));
        }
        String server = ServerStore.launchUrl(this);
        super.onCreate(savedInstanceState);
        if (bridge == null) return;
        ShellWebViewClient client = new ShellWebViewClient(bridge, server);
        bridge.setWebViewClient(client);
        WebView webView = bridge.getWebView();
        if (server != null) {
            // Without the origin-scoped message listener, Capacitor falls back to a JavaScript interface every page
            // can call, so the server would reach native plugins. Refuse rather than load it.
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) webView.loadUrl(server);
            else webView.loadUrl(bridge.getLocalUrl() + "/error.html?reason=webview");
        }
        // Back walks the server's history like the browser; at its start, or on a bundled page, the app goes to the background.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack() && !client.isLocal(webView.getUrl())) webView.goBack();
                else moveTaskToBack(true);
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (ACTION_CHANGE_SERVER.equals(intent.getAction())) {
            ServerStore.requestPicker(this);
            recreate();
        }
    }
}
