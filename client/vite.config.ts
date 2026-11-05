import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const hosted = process.env.VERCEL === '1' || process.env.PORTFOLIO_HOSTED_MODE === '1';
  if (process.env.VERCEL === '1') {
    const value = process.env.VITE_API_URL || loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL;
    let valid = false;
    try {
      const url = new URL(value || '');
      valid = url.protocol === 'https:' && url.pathname === '/api' && !url.username && !url.password && !url.search && !url.hash && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    } catch { /* A missing or invalid public URL must fail the hosted build. */ }
    if (!valid) throw new Error('Vercel requires VITE_API_URL=https://<api-host>/api without a trailing slash or credentials.');
  }
  return { plugins: [react()], define: { 'import.meta.env.VITE_HOSTED_MODE': JSON.stringify(String(hosted)) } };
})
