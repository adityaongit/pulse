// Only the MCP authorization flow may resume after sign-in; never accept an external return URL.
export function loginReturn(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/oauth/mcp/authorize?")) return "/";
  try {
    const url = new URL(value, "https://pulse.invalid");
    return url.origin === "https://pulse.invalid" && url.pathname === "/oauth/mcp/authorize" ? url.pathname + url.search : "/";
  } catch { return "/"; }
}
