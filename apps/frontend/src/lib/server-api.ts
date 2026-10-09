import { SignJWT, importPKCS8 } from 'jose';

export async function generateInternalToken(userId: string) {
  const privateKey = process.env.INTERNAL_API_PRIVATE_KEY;
  if (!privateKey) throw new Error('Missing INTERNAL_API_PRIVATE_KEY');

  const alg = 'RS256';
  const pkcs8 = await importPKCS8(privateKey, alg);

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setIssuer('sbloom-bff')
    .setAudience('sbloom-backend')
    .setExpirationTime('15s')
    .setSubject(userId)
    .setJti(crypto.randomUUID())
    .sign(pkcs8);

  return jwt;
}

export async function callInternalApi(path: string, userId: string) {
  const token = await generateInternalToken(userId);
  const baseUrl = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001';
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Internal API error: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
