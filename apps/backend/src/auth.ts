import express, { Request, Response, NextFunction } from 'express';
import { jwtVerify, importSPKI } from 'jose';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

export const requireInternalAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const publicKey = process.env.INTERNAL_API_PUBLIC_KEY;
    if (!publicKey) {
      console.error('Server misconfiguration: Missing INTERNAL_API_PUBLIC_KEY');
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }
    
    const alg = 'RS256';
    const spki = await importSPKI(publicKey, alg);
    
    const { payload } = await jwtVerify(token, spki, {
      issuer: process.env.INTERNAL_JWT_ISSUER || 'sbloom-bff',
      audience: process.env.INTERNAL_JWT_AUDIENCE || 'sbloom-backend',
      algorithms: ['RS256'],
      maxTokenAge: '15s',
    });

    if (!payload.sub) {
       res.status(401).json({ error: 'Missing subject in token' });
       return;
    }
    if (!payload.jti) {
       res.status(401).json({ error: 'Missing jti in token' });
       return;
    }

    req.user = { id: payload.sub };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
  }
};
