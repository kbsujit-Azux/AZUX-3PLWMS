// Node.js server wrapper for Firebase Hosting Cloud Run
import { createServer } from "node:http";

const port = process.env.PORT || 8080;
const host = process.env.HOST || "0.0.0.0";

// Import the server entry (Cloudflare Workers format)
const { default: server } = await import("./dist/server/server.js");

const httpServer = createServer(async (req, res) => {
  const url = `http://${host}:${port}${req.url || "/"}`;
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: req.method !== "GET" && req.method !== "HEAD" ? req : undefined,
  });

  try {
    const response = await server.fetch(request, {}, {});

    res.writeHead(response.status, Object.fromEntries(response.headers));
    const body = await response.text();
    res.end(body);
  } catch (error) {
    console.error("Server error:", error);
    res.writeHead(500, { "content-type": "text/html" });
    res.end(`<!doctype html>
<html lang="en">
  <head><title>Server Error</title></head>
  <body>
    <h1>Internal Server Error</h1>
    <p>Something went wrong on our end.</p>
  </body>
</html>`);
  }
});

httpServer.listen(port, host, () => {
  console.log(`Server listening on ${host}:${port}`);
});

httpServer.on("error", (err) => {
  console.error("Server error:", err);
  process.exit(1);
});
