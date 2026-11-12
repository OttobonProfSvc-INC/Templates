const http = require('http');

function check(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log(url, '-> Status:', res.statusCode, 'Count:', json.length);
          resolve(json);
        } catch (e) {
          console.error(url, 'Parse error:', e.message);
          resolve(null);
        }
      });
    }).on('error', (e) => {
      console.error(url, 'Request error:', e.message);
      resolve(null);
    });
  });
}

async function main() {
  await check('http://localhost:3001/api/templates');
  await check('http://localhost:3000/api/bff/templates');
}

main();
