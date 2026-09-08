const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3001;

const MIME = {
  'html': 'text/html',
  'css': 'text/css',
  'js': 'application/javascript',
  'json': 'application/json',
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'svg': 'image/svg+xml',
  'ico': 'image/x-icon',
  'webp': 'image/webp',
};

const server = http.createServer((req, res) => {
  // Proxy: Bilibili API
  if (req.url.startsWith('/api/bilibili/')) {
    const bvid = req.url.split('/api/bilibili/')[1].split('?')[0];
    https.get(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.bilibili.com/' } },
      (apiRes) => {
        let data = '';
        apiRes.on('data', c => data += c);
        apiRes.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(data);
        });
      }
    ).on('error', () => { res.writeHead(502); res.end('{}'); });
    return;
  }

  // Proxy: Bilibili CDN images (avoids 403 referer block)
  if (req.url.startsWith('/imgproxy/')) {
    const targetUrl = decodeURIComponent(req.url.replace('/imgproxy/', ''));
    if (!/^https?:\/\/i\d?\.hdslb\.com\//.test(targetUrl)) {
      res.writeHead(403);
      res.end('Blocked');
      return;
    }
    https.get(
      targetUrl,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.bilibili.com/' } },
      (imgRes) => {
        res.writeHead(200, {
          'Content-Type': imgRes.headers['content-type'] || 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
        });
        imgRes.pipe(res);
      }
    ).on('error', () => { res.writeHead(502); res.end(); });
    return;
  }

  // Static files
  let fp = req.url === '/' ? '/index.html' : req.url;
  fp = path.join(__dirname, fp.split('?')[0]);
  const ext = path.extname(fp).slice(1);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log('http://localhost:' + PORT));
