package io.github.adityaongit.pulse;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ServerStoreTest {

    private static final String SERVER = "https://pulse.example.com/";

    @Test
    public void originKeepsSchemeHostAndPortWithATrailingSlash() {
        assertEquals(SERVER, ServerStore.origin("https://Pulse.Example.com"));
        assertEquals(SERVER, ServerStore.origin("  https://pulse.example.com/settings?s=coach "));
        assertEquals(SERVER, ServerStore.origin("https://pulse.example.com:443"));
        assertEquals("https://pulse.example.com:8443/", ServerStore.origin("https://pulse.example.com:8443/x"));
    }

    @Test
    public void originRejectsAnythingButHttps() {
        assertNull(ServerStore.origin(null));
        assertNull(ServerStore.origin("http://pulse.example.com"));
        assertNull(ServerStore.origin("pulse.example.com"));
        assertNull(ServerStore.origin("javascript:alert(1)"));
        assertNull(ServerStore.origin("https://"));
        assertNull(ServerStore.origin("not a url"));
    }

    @Test
    public void onlyTheServerAndItsSignInProxyOpenInTheApp() {
        assertTrue(ServerStore.opensInApp(SERVER, "https://pulse.example.com/coach?c=1"));
        assertTrue(ServerStore.opensInApp(SERVER, "https://pulse.example.com"));
        assertTrue(ServerStore.opensInApp(SERVER, "https://team.cloudflareaccess.com/cdn-cgi/access/login"));
    }

    @Test
    public void lookalikeHostsPortsAndSchemesOpenInTheBrowser() {
        assertFalse(ServerStore.opensInApp(SERVER, "https://pulse.example.com.evil.test/"));
        assertFalse(ServerStore.opensInApp(SERVER, "https://evilpulse.example.com/"));
        assertFalse(ServerStore.opensInApp(SERVER, "https://pulse.example.com:8443/"));
        assertFalse(ServerStore.opensInApp(SERVER, "http://pulse.example.com/"));
        assertFalse(ServerStore.opensInApp(SERVER, "https://cloudflareaccess.com.evil.test/"));
        assertFalse(ServerStore.opensInApp(SERVER, "https://evilcloudflareaccess.com/"));
        assertFalse(ServerStore.opensInApp(SERVER, "https://accounts.google.com/o/oauth2/v2/auth"));
    }
}
