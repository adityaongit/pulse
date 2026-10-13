package io.github.adityaongit.pulse;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PulseServer")
public class PulseServerPlugin extends Plugin {

    @PluginMethod
    public void get(PluginCall call) {
        JSObject result = new JSObject();
        result.put("url", ServerStore.url(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String origin = ServerStore.origin(call.getString("url"));
        if (origin == null) {
            call.reject("Use an https:// address.");
            return;
        }
        ServerStore.save(getContext(), origin);
        call.resolve();
        restart();
    }

    @PluginMethod
    public void pick(PluginCall call) {
        ServerStore.requestPicker(getContext());
        call.resolve();
        restart();
    }

    private void restart() {
        getActivity().runOnUiThread(() -> getActivity().recreate());
    }
}
