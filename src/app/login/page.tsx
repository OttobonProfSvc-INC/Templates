'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await signIn('credentials', {
      redirect: false,
      email,
      password,
    });

    if (res?.error) {
      setError('Invalid email or password');
      setLoading(false);
    } else {
      let from = searchParams.get('from') || '/library';
      
      // Robust return URL security
      // Only permit explicit internal paths to prevent open redirects via ///, /\, javascript:, etc.
      const safePaths = ['/library', '/my-work', '/add'];
      const isSafe = safePaths.some(p => from === p || from.startsWith(`${p}?`) || from.startsWith(`${p}/`));
      
      if (!isSafe) {
        from = '/library';
      }
      
      router.push(from);
      router.refresh();
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 text-sm text-destructive-foreground bg-destructive/90 rounded-md">
            {error}
          </div>
        )}
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-ring"
            placeholder="admin@sbloom.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-ring"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
      </CardContent>
      <CardFooter className="flex flex-col space-y-4">
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign In'}
        </Button>
        <div className="text-xs text-center text-slate-500 space-y-1">
          <p>Development Credentials:</p>
          <p>admin@sbloom.com (Admin)</p>
          <p>contributor@sbloom.com (Contributor)</p>
          <p>viewer@sbloom.com (Viewer)</p>
          <p>Password: password123</p>
        </div>
      </CardFooter>
    </form>
  );
}

export default function LoginPage() {

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh]">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary mx-auto mb-4"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">sBLOOM Hub</h1>
          <p className="text-slate-500 mt-2">Sign in to access your creative assets</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Login</CardTitle>
          </CardHeader>
          <Suspense fallback={<div className="p-6 text-center text-sm text-slate-500">Loading form...</div>}>
            <LoginForm />
          </Suspense>
        </Card>
      </div>
    </div>
  );
}
