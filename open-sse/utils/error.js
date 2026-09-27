import { ERROR_TYPES, DEFAULT_ERROR_MESSAGES } from "../config/errorConfig.js";

/**
 * Strip secrets (API keys, Bearer tokens, cookies, passwords, sensitive env vars)
 * from error messages destined for client responses, logs, or error frames.
 *
 * @param {string} text - Message or error string to sanitize
 * @param {object} [credentials] - Optional credentials object containing specific secrets
 * @returns {string} Sanitized string
 */
export function sanitizeSecrets(text, credentials = null) {
  if (!text) return text;
  let out = String(text);

  // 1. Redact Authorization Bearer headers/tokens
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, "Bearer [redacted]");

  // 2. Redact standard API key patterns (OpenAI sk-..., Anthropic sk-ant-..., Google AIza...)
  out = out.replace(/\b(sk-[a-zA-Z0-9_-]{12,})\b/g, "[redacted-key]");
  out = out.replace(/\b(sk-ant-[a-zA-Z0-9_-]{12,})\b/g, "[redacted-key]");
  out = out.replace(/\b(AIza[0-9A-Za-z-_]{35})\b/g, "[redacted-key]");

  // 3. Redact query params carrying secrets (key=..., api_key=..., token=..., secret=...)
  out = out.replace(/([?&](?:api[_-]?key|key|token|access_token|secret)=)[^&\s"']+/gi, "$1[redacted]");

  // 4. Redact Cookie / Set-Cookie headers or session cookies
  out = out.replace(/(?:cookie|set-cookie):\s*[^;\r\n]+/gi, "cookie: [redacted]");
  out = out.replace(/(?:session|jwt|auth)[_-]?(?:token|id|key)=[^;\s&"']+/gi, "[redacted-session]");

  // 5. Redact specific credentials passed in
  if (credentials && typeof credentials === "object") {
    for (const key of ["apiKey", "accessToken", "refreshToken", "clientSecret", "password", "token"]) {
      const secret = credentials[key];
      if (typeof secret === "string" && secret.length >= 6) {
        out = out.split(secret).join("[redacted]");
      }
    }
  }

  // 6. Redact sensitive environment variables if present
  const sensitiveEnvVars = ["JWT_SECRET", "API_KEY_SECRET", "MACHINE_ID_SALT", "INITIAL_PASSWORD"];
  for (const envVar of sensitiveEnvVars) {
    const val = process.env[envVar];
    if (typeof val === "string" && val.length >= 6) {
      out = out.split(val).join("[redacted]");
    }
  }

  return out;
}

/**
 * Build OpenAI-compatible error response body
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {object} [credentials] - Optional credentials to sanitize
 * @returns {object} Error response object
 */
export function buildErrorBody(statusCode, message, credentials = null) {
  const errorInfo = ERROR_TYPES[statusCode] || 
    (statusCode >= 500 
      ? { type: "server_error", code: "internal_server_error" }
      : { type: "invalid_request_error", code: "" });

  const rawMsg = message || DEFAULT_ERROR_MESSAGES[statusCode] || "An error occurred";
  const sanitizedMsg = sanitizeSecrets(rawMsg, credentials);

  return {
    error: {
      message: sanitizedMsg,
      type: errorInfo.type,
      code: errorInfo.code
    }
  };
}

/**
 * Create error Response object (for non-streaming)
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @returns {Response} HTTP Response object
 */
export function errorResponse(statusCode, message) {
  return new Response(JSON.stringify(buildErrorBody(statusCode, message)), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

/**
 * Write error to SSE stream (for streaming)
 * @param {WritableStreamDefaultWriter} writer - Stream writer
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 */
export async function writeStreamError(writer, statusCode, message) {
  const errorBody = buildErrorBody(statusCode, message);
  const encoder = new TextEncoder();
  await writer.write(encoder.encode(`data: ${JSON.stringify(errorBody)}\n\n`));
}

/**
 * Parse upstream provider error response
 * @param {Response} response - Fetch response from provider
 * @param {object} [executor] - Optional executor with parseError() override for provider-specific parsing
 * @returns {Promise<{statusCode: number, message: string, resetsAtMs?: number}>}
 */
export async function parseUpstreamError(response, executor = null) {
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    bodyText = "";
  }

  // Let executor-specific parser extract provider-specific fields (e.g. codex resetsAtMs)
  if (executor && typeof executor.parseError === "function") {
    try {
      const parsed = executor.parseError(response, bodyText);
      if (parsed && typeof parsed === "object") {
        const msg = parsed.message || DEFAULT_ERROR_MESSAGES[response.status] || `Upstream error: ${response.status}`;
        return { statusCode: parsed.status || response.status, message: msg, resetsAtMs: parsed.resetsAtMs };
      }
    } catch { /* fall through to default parsing */ }
  }

  let message = "";
  try {
    const json = JSON.parse(bodyText);
    message = json.error?.message || json.message || json.error || bodyText;
  } catch {
    message = bodyText;
  }

  const messageStr = typeof message === "string" ? message : JSON.stringify(message);
  const finalMessage = messageStr || DEFAULT_ERROR_MESSAGES[response.status] || `Upstream error: ${response.status}`;

  return { statusCode: response.status, message: finalMessage };
}

/**
 * Create error result for chatCore handler
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {number} [resetsAtMs] - Optional precise cooldown expiry (ms epoch) for provider-specific quota errors
 * @returns {{ success: false, status: number, error: string, response: Response, resetsAtMs?: number }}
 */
export function createErrorResult(statusCode, message, resetsAtMs) {
  return {
    success: false,
    status: statusCode,
    error: message,
    resetsAtMs,
    response: errorResponse(statusCode, message)
  };
}

/**
 * Create unavailable response when all accounts are rate limited
 * @param {number} statusCode - Original error status code
 * @param {string} message - Error message (without retry info)
 * @param {string} retryAfter - ISO timestamp when earliest account becomes available
 * @param {string} retryAfterHuman - Human-readable retry info e.g. "reset after 30s"
 * @returns {Response}
 */
export function unavailableResponse(statusCode, message, retryAfter, retryAfterHuman) {
  const retryAfterSec = Math.max(Math.ceil((new Date(retryAfter).getTime() - Date.now()) / 1000), 1);
  const msg = `${message} (${retryAfterHuman})`;
  return new Response(
    JSON.stringify({ error: { message: msg } }),
    {
      status: statusCode,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec)
      }
    }
  );
}

/**
 * Format provider error with context
 * @param {Error} error - Original error
 * @param {string} provider - Provider name
 * @param {string} model - Model name
 * @param {number|string} statusCode - HTTP status code or error code
 * @param {object} [credentials] - Optional credentials to sanitize
 * @returns {string} Formatted error message
 */
export function formatProviderError(error, provider, model, statusCode, credentials = null) {
  const code = statusCode || error.code || "FETCH_FAILED";
  const rawMsg = error.message || "Unknown error";
  const message = sanitizeSecrets(rawMsg, credentials);
  // Expose low-level cause (e.g. UND_ERR_SOCKET, ECONNRESET, ETIMEDOUT) for diagnosing fetch failures
  const causeCode = error.cause?.code;
  const rawCauseMsg = error.cause?.message;
  const causeMsg = rawCauseMsg ? sanitizeSecrets(rawCauseMsg, credentials) : null;
  const causeStr = causeCode || causeMsg ? ` (cause: ${[causeCode, causeMsg].filter(Boolean).join(": ")})` : "";
  return `[${code}]: ${message}${causeStr}`;
}
