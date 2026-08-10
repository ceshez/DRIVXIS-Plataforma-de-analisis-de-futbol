export function isTransientUploadError(error) {
  if (!error) return false;
  const candidate = error;
  const code = String(candidate?.code || candidate?.Code || "").toUpperCase();
  const name = String(candidate?.name || "").toUpperCase();
  const message = String(candidate?.message || error).toLowerCase();
  const status = Number(candidate?.$metadata?.httpStatusCode || 0);

  if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "EPIPE" || code === "ECONNABORTED") return true;
  if (
    code === "ERR_SSL_BAD_RECORD_MAC" ||
    code === "ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC" ||
    code === "ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR" ||
    code === "ERR_SSL_UNEXPECTED_EOF_WHILE_READING"
  ) return true;
  if (name === "TIMEOUTERROR" || name === "NETWORKINGERROR" || name === "REQUESTTIMEOUT") return true;
  if (status >= 500 && status <= 599) return true;
  return /socket hang up|connection reset|connection aborted|broken pipe|timed out|timeout|bad record mac|ssl\/tls alert|ssl3_read_bytes|unexpected eof while reading|tlsv1 alert internal error/.test(message);
}
