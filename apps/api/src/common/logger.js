function line(level, message, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  const text = JSON.stringify(entry);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}

export const logger = {
  info: (message, meta) => line('info', message, meta),
  warn: (message, meta) => line('warn', message, meta),
  error: (message, meta) => line('error', message, meta),
};
