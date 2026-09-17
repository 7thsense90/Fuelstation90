// Keep local development isolated; hosted mode must specify one HTTPS origin.
function configuration(env = process.env) {
  const production = env.NODE_ENV === 'production';
  let origin = null;
  if (env.PUBLIC_ORIGIN) {
    const url = new URL(env.PUBLIC_ORIGIN);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw Error('PUBLIC_ORIGIN must be an HTTPS origin without a path or credentials.');
    }
    origin = url.origin;
  }
  if (production && !origin) throw Error('Production requires PUBLIC_ORIGIN.');
  if (production && !env.SUPABASE_URL && !env.FUEL_DATA_DIR) throw Error('Production requires a persistent FUEL_DATA_DIR.');
  const port = Number(env.PORT || 4310);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid PORT.');
  return {
    production, origin, port,
    bind: env.BIND_ADDRESS || '127.0.0.1',
    cookieSuffix: origin ? '; Secure' : '',
    acceptsHost(host) {
      return origin ? host === new URL(origin).host : /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host || '');
    },
    acceptsOrigin(value, host) { return !value || value === (origin || `http://${host}`); }
  };
}
module.exports = { configuration };
