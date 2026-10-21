const SAFE_FALLBACK = 'The request failed. Please try again.';

const safeText = (value) => {
  if (typeof value !== 'string') return '';
  // Keep accidental credentials out of UI error messages.
  return value
    .replace(/((?:access[_ -]?token|client[_ -]?secret|secret|password|api[_ -]?key)\s*[=:]\s*)[^\s&,;]+/gi, '$1[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]');
};

const messageFrom = (value, fallback) => {
  if (typeof value === 'string') return safeText(value) || fallback;
  if (!value || typeof value !== 'object') return fallback;
  if (typeof value.message === 'string' && value.message.trim()) return safeText(value.message);
  if (value.detail != null) return messageFrom(value.detail, fallback);
  if (value.error != null) return messageFrom(value.error, fallback);
  return fallback;
};

/** Convert API/Axios errors or detail values to a safe, renderable string. */
export const formatApiError = (value, fallback = SAFE_FALLBACK) => {
  const response = value?.response;
  const body = response?.data;
  const detail = body?.detail ?? body?.error ?? value?.detail;
  const message = detail != null
    ? messageFrom(detail, messageFrom(value?.message, fallback))
    : messageFrom(value?.message ?? value, fallback);

  const diagnostics = [];
  const code = detail && typeof detail === 'object'
    ? detail.meta_code ?? detail.code
    : body?.meta_code ?? body?.error?.code;
  const retrySeconds = detail && typeof detail === 'object'
    ? detail.retry_after_seconds
    : body?.retry_after_seconds;
  const source = detail && typeof detail === 'object'
    ? detail.rate_limit_source
    : value?.metaRateLimitSource;

  if (code != null && (typeof code === 'string' || Number.isFinite(Number(code)))) {
    diagnostics.push(`Meta code: ${safeText(String(code))}`);
  }
  if (retrySeconds != null && Number.isFinite(Number(retrySeconds)) && Number(retrySeconds) >= 0) {
    diagnostics.push(`Retry after: ${Number(retrySeconds)} seconds`);
  } else if (value?.retryAt && Number.isFinite(Number(value.retryAt))) {
    diagnostics.push(`Retry after: ${Math.max(0, Math.ceil((Number(value.retryAt) - Date.now()) / 1000))} seconds`);
  }
  if (typeof source === 'string' && source.trim()) {
    const readableSource = source === 'local_cooldown' ? 'Local cooldown' : source === 'meta_graph' ? 'Meta response' : safeText(source);
    diagnostics.push(`Rate-limit source: ${readableSource}`);
  }
  return diagnostics.length ? `${message} (${diagnostics.join(' · ')})` : message;
};

