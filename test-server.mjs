import { default: server } from './.output/server/server.js';
import http from 'http';

const port = process.env.PORT || 8080;

const httpServer = http.createServer(async (req, res) => {
  const request = new Request('http://localhost' + req.url, {
    method: req.method,
    headers: req.headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
  });
  const response = await server.fetch(request, {}, {});
  res.writeHead(response.status, Object.fromEntries(response.headers));
  const body = await response.text();
  res.end(body);
});

httpServer.listen(port, '0.0.0.0', () => {
  console.log('Server listening on port ' + port);
});