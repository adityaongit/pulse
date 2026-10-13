import UIKit
import WebKit
import Capacitor

enum ServerStore {
    private static let urlKey = "pulse.serverURL"
    private static let pickKey = "pulse.showPicker"
    // Sign-in hosts a Pulse server may sit behind; every other host opens in the browser.
    static let authHosts = ["*.cloudflareaccess.com"]
    static let changeServerShortcut = "io.github.adityaongit.pulse.change-server"

    static var url: String? { origin(UserDefaults.standard.string(forKey: urlKey)) }

    static func save(_ origin: String) {
        UserDefaults.standard.set(origin, forKey: urlKey)
        UserDefaults.standard.removeObject(forKey: pickKey)
    }

    static func requestPicker() {
        UserDefaults.standard.set(true, forKey: pickKey)
    }

    static func consumePicker() -> Bool {
        let pick = UserDefaults.standard.bool(forKey: pickKey)
        if pick { UserDefaults.standard.removeObject(forKey: pickKey) }
        return pick
    }

    // scheme://host[:port]/ — the trailing slash matters: Capacitor treats any URL starting with the server URL as the app.
    static func origin(_ raw: String?) -> String? {
        guard let raw, let components = URLComponents(string: raw.trimmingCharacters(in: .whitespaces)),
              components.scheme?.lowercased() == "https", let host = components.host, !host.isEmpty else { return nil }
        let port = components.port.flatMap { $0 == 443 ? nil : ":\($0)" } ?? ""
        return "https://\(host.lowercased())\(port)/"
    }
}

class MainViewController: CAPBridgeViewController {
    override open func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        if !ServerStore.consumePicker(), let url = ServerStore.url {
            descriptor.serverURL = url
            descriptor.allowedNavigationHostnames = ServerStore.authHosts
        }
        return descriptor
    }

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PulseServerPlugin())
        // Capacitor answers plugin calls from any page in this WebView, the server and its sign-in proxy included.
        // Only the bundled pages (picker, error page) need native access, so calls from anywhere else are dropped.
        guard let bridge = bridge as? CapacitorBridge, let controller = bridge.webView?.configuration.userContentController else { return }
        controller.removeScriptMessageHandler(forName: "bridge")
        controller.add(BundledPagesOnly(bridge.webViewDelegationHandler, local: bridge.config.localURL), name: "bridge")
    }

    static func reload(in window: UIWindow?) {
        window?.rootViewController = MainViewController()
    }
}

final class BundledPagesOnly: NSObject, WKScriptMessageHandler {
    private weak var handler: WebViewDelegationHandler?
    private let local: URL

    init(_ handler: WebViewDelegationHandler, local: URL) {
        self.handler = handler
        self.local = local
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame, origin.protocol == local.scheme, origin.host == local.host else { return }
        handler?.userContentController(controller, didReceive: message)
    }
}

@objc(PulseServerPlugin)
public class PulseServerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PulseServerPlugin"
    public let jsName = "PulseServer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise)
    ]

    @objc func get(_ call: CAPPluginCall) {
        var result: [String: Any] = [:]
        if let url = ServerStore.url { result["url"] = url }
        call.resolve(result)
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let origin = ServerStore.origin(call.getString("url")) else {
            call.reject("Use an https:// address.")
            return
        }
        ServerStore.save(origin)
        call.resolve()
        restart()
    }

    @objc func pick(_ call: CAPPluginCall) {
        ServerStore.requestPicker()
        call.resolve()
        restart()
    }

    private func restart() {
        DispatchQueue.main.async { [weak self] in
            MainViewController.reload(in: self?.bridge?.viewController?.view.window)
        }
    }
}
