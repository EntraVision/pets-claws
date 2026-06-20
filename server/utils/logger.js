const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

function readBoolean(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return undefined;
}

function isLoggingEnabled(env = process.env) {
  const explicit = readBoolean(env.LOG_ENABLED);
  if (explicit !== undefined) return explicit;

  const nodeEnv = String(env.NODE_ENV || '').trim().toLowerCase();
  return nodeEnv === 'development' || nodeEnv === 'dev';
}

function createLogger({ env = process.env, console: target = console } = {}) {
  const shouldLog = () => isLoggingEnabled(env);
  const write = (method, args) => {
    if (!shouldLog()) return;
    target[method](...args);
  };

  return {
    isEnabled: shouldLog,
    debug: (...args) => write('debug', args),
    info: (...args) => write('log', args),
    warn: (...args) => write('warn', args),
    error: (...args) => write('error', args),
  };
}

module.exports = createLogger();
module.exports.createLogger = createLogger;
module.exports.isLoggingEnabled = isLoggingEnabled;
