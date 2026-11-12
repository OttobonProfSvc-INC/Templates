/**
 * Safe Public Key Extractor
 * 
 * Reads the existing RSA private key from `apps/frontend/.env.local`,
 * derives the matching SPKI RSA public key, and prints the exact line
 * to paste into `apps/backend/.env`.
 * 
 * This script does NOT modify any files.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const frontendEnvPath = path.resolve(__dirname, 'apps/frontend/.env.local');

if (!fs.existsSync(frontendEnvPath)) {
  console.error(`Error: Could not find ${frontendEnvPath}`);
  process.exit(1);
}

const content = fs.readFileSync(frontendEnvPath, 'utf8');

// Extract INTERNAL_API_PRIVATE_KEY
const match = content.match(/INTERNAL_API_PRIVATE_KEY="?([\s\S]+?)"?\s*(?:\r?\n[A-Z_]+|\s*$)/);

if (!match || !match[1]) {
  console.error('Error: Could not find INTERNAL_API_PRIVATE_KEY in apps/frontend/.env.local');
  process.exit(1);
}

try {
  const rawKey = match[1].replace(/\\n/g, '\n').trim();
  const publicKeyPem = crypto.createPublicKey(rawKey).export({ type: 'spki', format: 'pem' });
  const singleLinePem = publicKeyPem.replace(/\r?\n/g, '\\n');

  console.log('\n================ COPY THE LINE BELOW ================');
  console.log(`INTERNAL_API_PUBLIC_KEY="${singleLinePem}"`);
  console.log('=====================================================\n');
} catch (err) {
  console.error('Error parsing private key:', err.message);
  process.exit(1);
}
