/**
 * Local (default) vs hosted (public URL / remote VM).
 * Public/ambiguous configuration takes precedence over a local-mode override.
 */

function trimSlash(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

export function getConfiguredBaseUrl() {
  return trimSlash(
    process.env.BASE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      ""
  );
}

export function isLoopbackHostname(hostname) {
  if (!hostname) return false;
  const host = String(hostname).toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function isLoopbackUrl(url) {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) && isLoopbackHostname(parsed.hostname);
  } catch {
    return false;
  }
}

/** Browser: public https origin that is not loopback. */
export function isHostedBrowser() {
  if (typeof window === "undefined" || !window?.location) return false;
  try {
    if (window.location.protocol !== "https:") return false;
    return !isLoopbackHostname(window.location.hostname);
  } catch {
    return false;
  }
}

/**
 * True when running as a public/remote deploy.
 * Public URLs, hosting markers and invalid modes cannot be overridden by local mode.
 */
export function isHosted() {
  if (typeof window !== "undefined") return isHostedBrowser();

  const mode = (process.env.DEPLOYMENT_MODE || "").trim().toLowerCase();
  if (mode && mode !== "local") return true;
  if (["RAILWAY_ENVIRONMENT_ID", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID", "RAILWAY_PUBLIC_DOMAIN"]
    .some((key) => Boolean(process.env[key]?.trim()))) return true;

  return [process.env.BASE_URL, process.env.NEXT_PUBLIC_BASE_URL]
    .some((base) => base?.trim() && !isLoopbackUrl(base.trim()));
}

/** Host credential reads need positive local configuration, not absence of hosted evidence. */
export function canReadLocalCredentials() {
  if (typeof window !== "undefined" || isHosted()) return false;
  return (process.env.DEPLOYMENT_MODE || "").trim().toLowerCase() === "local"
    || Boolean(getConfiguredBaseUrl());
}

export function getPublicOrigin() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return getConfiguredBaseUrl() || "http://localhost:20128";
}

