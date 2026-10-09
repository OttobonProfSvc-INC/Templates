const crypto = require('crypto');
const fs = require('fs');
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

fs.writeFileSync('apps/frontend/.env.local', `INTERNAL_API_PRIVATE_KEY="${privateKey.replace(/\n/g, '\\n')}"\nBACKEND_INTERNAL_URL=http://localhost:3001\n`);
fs.writeFileSync('apps/backend/.env', `INTERNAL_API_PUBLIC_KEY="${publicKey.replace(/\n/g, '\\n')}"\nINTERNAL_JWT_ISSUER=sbloom-bff\nINTERNAL_JWT_AUDIENCE=sbloom-backend\n`);
