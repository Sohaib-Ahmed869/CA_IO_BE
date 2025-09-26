// utils/logger.js
let pinoInstance = null;
try {
  const pino = require('pino');
  const transport = process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined;
  pinoInstance = pino({
    level: process.env.LOG_LEVEL || 'info',
    base: undefined,
    redact: {
      paths: ['req.headers.authorization', 'password', 'token', 'stripe*', '*.secret', '*.password'],
      remove: true,
    },
  }, transport);
} catch (_) {}

function safeSerialize(value) {
  if (value instanceof Error) {
    return { message: value.message, stack: value.stack, name: value.name };
  }
  try { return JSON.parse(JSON.stringify(value)); } catch (e) { return { detail: String(value) }; }
}

const fallback = (() => {
  const usePretty = process.env.NODE_ENV !== 'production';
  const colors = {
    reset: '\u001b[0m',
    dim: '\u001b[2m',
    gray: '\u001b[90m',
    cyan: '\u001b[36m',
    yellow: '\u001b[33m',
    red: '\u001b[31m',
    green: '\u001b[32m',
  };
  const levelColor = (level) => {
    if (level === 'error') return colors.red;
    if (level === 'warn') return colors.yellow;
    if (level === 'debug') return colors.cyan;
    return colors.green; // info
  };
  function formatLine(level, message, obj) {
    const ts = new Date().toISOString();
    if (!usePretty) {
      return JSON.stringify({ level, msg: message, time: ts, ...obj });
    }
    const color = levelColor(level);
    const kv = Object.entries(obj || {})
      .map(([k, v]) => `${colors.gray}${k}${colors.reset}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ');
    return `${colors.dim}[${ts}]${colors.reset} ${color}${level.toUpperCase()}${colors.reset} ${message}${kv ? ' ' + kv : ''}`;
  }
  function write(level, message, obj) {
    const line = formatLine(level, message, obj);
    try { process.stdout.write(`${line}\n`); } catch (_) { /* noop */ }
  }
  const api = {
    write,
    info: (msg, obj={}) => write('info', msg, obj),
    warn: (msg, obj={}) => write('warn', msg, obj),
    error: (msg, obj={}) => write('error', msg, obj),
    debug: (msg, obj={}) => write('debug', msg, obj),
    child(bindings) {
      return {
        info: (msg, obj={}) => write('info', msg, { ...bindings, ...obj }),
        warn: (msg, obj={}) => write('warn', msg, { ...bindings, ...obj }),
        error: (msg, obj={}) => write('error', msg, { ...bindings, ...obj }),
        debug: (msg, obj={}) => write('debug', msg, { ...bindings, ...obj }),
      };
    }
  };
  return api;
})();

const core = pinoInstance || fallback;

function logMe(tag, data, level='info') {
  const payload = safeSerialize(data);
  if (level === 'error') return core.error(tag, payload);
  if (level === 'warn') return core.warn(tag, payload);
  if (level === 'debug') return core.debug(tag, payload);
  return core.info(tag, payload);
}

function createRequestLogger(req) {
  const requestId = req?.id || req?.headers?.['x-request-id'];
  const userId = req?.user?._id || req?.user?.id;
  return core.child({ requestId, userId, path: req?.originalUrl, method: req?.method });
}

module.exports = { logger: core, logMe, createRequestLogger };


