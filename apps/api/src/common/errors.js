export function httpError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

export function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      message: err.message,
      requestId: req.requestId,
      stack: err.stack,
    }));
  }
  res.status(status).json({
    error: err.message || 'Sunucu hatası',
    requestId: req.requestId,
    ...(err.session ? { session: err.session } : {}),
  });
}
