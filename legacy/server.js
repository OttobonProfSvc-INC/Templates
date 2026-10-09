/**
 * Ottobon Templates Dashboard — Unified Local Server
 * Zero dependencies required. Uses native Node.js http and fs modules.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.mjs': 'text/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf'
};

const server = http.createServer((req, res) => {
  // Health check endpoint for Docker & reverse proxies
  if (req.url === '/health' || req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', uptime: process.uptime(), timestamp: new Date().toISOString() }));
    return;
  }

  // Parse URL & normalize path
  let decodedPath = decodeURIComponent(req.url.split('?')[0]);
  if (decodedPath === '/' || decodedPath === '') {
    decodedPath = '/index.html';
  }

  // Prevent directory traversal
  const safePath = path.normalize(decodedPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(ROOT_DIR, safePath);

  // If file does not exist directly at ROOT_DIR, check if requested from an iframe subfolder (via Referer header)
  if (!fs.existsSync(filePath) && req.headers.referer) {
    try {
      const refererUrl = new URL(req.headers.referer);
      let refererPath = decodeURIComponent(refererUrl.pathname);
      let refererDir = path.dirname(refererPath).replace(/^(\.\.[\/\\])+/, '').replace(/^[/\\]+/, '');
      
      // Try resolving relative to referer directory
      let candidate = path.join(ROOT_DIR, refererDir, safePath);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        filePath = candidate;
      } else {
        // Try parent directory of referer (e.g. if referer was in dist/)
        let parentDir = path.dirname(refererDir);
        let parentCandidate = path.join(ROOT_DIR, parentDir, safePath);
        if (fs.existsSync(parentCandidate) && fs.statSync(parentCandidate).isFile()) {
          filePath = parentCandidate;
        }
      }
    } catch (e) {
      // Ignore referer parsing errors
    }
  }

  // If path is a directory, look for index.html inside it
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>404 Not Found</title><style>body{font-family:sans-serif;padding:40px;text-align:center;}</style></head>
        <body>
          <h2>File Not Found</h2>
          <p>Requested path: <code>${decodedPath}</code></p>
          <a href="/">← Return to Templates Dashboard</a>
        </body>
        </html>
      `);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Handle video range streaming (for MP4 previews in templates)
    if (ext === '.mp4') {
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${stats.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
        };
        res.writeHead(206, head);
        file.pipe(res);
        return;
      }
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
  console.log(`\n============================================================`);
  console.log(`  🚀 OTTOBON TEMPLATES HUB IS LIVE`);
  console.log(`  👉 Listening on: http://${HOST}:${PORT}`);
  console.log(`  📂 Serving 28 templates from: ${ROOT_DIR}`);
  console.log(`============================================================\n`);

  // Open default browser on Windows development machines only
  if (process.platform === 'win32' && !process.env.DOCKER_CONTAINER) {
    exec(`start ${url}`);
  }
});

// Graceful shutdown handling for Docker containers and Linux signals
const shutdown = (signal) => {
  console.log(`\n[Server] Received ${signal}. Closing HTTP server gracefully...`);
  server.close(() => {
    console.log('[Server] HTTP connections closed. Process terminating cleanly.');
    process.exit(0);
  });

  // Force shutdown if connections do not close in 5 seconds
  setTimeout(() => {
    console.error('[Server] Forcefully shutting down after timeout.');
    process.exit(1);
  }, 5000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
