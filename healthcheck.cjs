const http = require('node:http');
const { configuration } = require('./runtime.cjs');
const config = configuration();
const request = http.get({host:'127.0.0.1', port:config.port, path:'/api/health', headers:{Host:new URL(config.origin).host}}, response => {
  response.resume();
  process.exitCode = response.statusCode === 200 ? 0 : 1;
});
request.setTimeout(4000, () => request.destroy(Error('Health check timed out.')));
request.on('error', () => { process.exitCode = 1; });
