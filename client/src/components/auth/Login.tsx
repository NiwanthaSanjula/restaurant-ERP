import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const Login: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      navigate('/dashboard');
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!validateEmail(username)) {
      setFieldErrors({ email: 'Please provide a valid email' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: username, password })
      });
      const data = await res.json();
      
      if (!res.ok) {
        if (data.errors && Array.isArray(data.errors)) {
          const newFieldErrors: { email?: string; password?: string } = {};
          data.errors.forEach((err: any) => {
            if (err.path === 'email' || err.param === 'email') newFieldErrors.email = err.msg;
            if (err.path === 'password' || err.param === 'password') newFieldErrors.password = err.msg;
          });
          setFieldErrors(newFieldErrors);
          throw new Error('Validation failed');
        }
        throw new Error(data?.message || 'Login failed');
      }
      localStorage.setItem('token', data.data.token);
      localStorage.setItem('user', JSON.stringify(data.data.user));
      // Clear any legacy systemType
      localStorage.removeItem('systemType');

      // Always redirect to prefix settings first after login
      navigate('/PrefixSettings');
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Validation failed') return;
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#001F54] via-[#0a2744] to-[#001a33] relative overflow-hidden">
      {/* Curved decorative lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="curveGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
          </linearGradient>
          <linearGradient id="curveGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.01)" />
          </linearGradient>
        </defs>
        <path fill="url(#curveGrad1)" d="M0 120 Q350 80 600 150 T1200 100 L1200 0 L0 0 Z" />
        <path fill="url(#curveGrad2)" d="M0 780 Q400 880 600 820 T1200 860 L1200 900 L0 900 Z" />
        <path fill="rgba(255,255,255,0.04)" d="M0 0 Q250 450 0 900 L0 0 Z" />
        <path fill="rgba(255,255,255,0.04)" d="M1200 0 Q950 400 1200 900 L1200 0 Z" />
      </svg>

      <div className={`relative z-10 w-full max-w-xl mx-4 transition-all duration-500 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <div className="bg-white/98 backdrop-blur-md rounded-[2rem] shadow-2xl shadow-[#001F54]/20 p-10 md:p-12 min-h-[520px] md:min-h-[56vh] border border-white/30 ring-1 ring-black/5">
          <div className="flex flex-col items-center justify-center mb-8">
            <div className="flex flex-col items-center justify-center mb-4">
              <div className="w-12 h-12 rounded-lg bg-[#001F54] flex items-center justify-center shadow-lg shadow-[#001F54]/30 transition-transform duration-300 hover:scale-105 opacity-0 animate-login-fade-in-up mb-3" style={{ animationDelay: '0.1s' }}>
                <span className="text-white font-bold text-lg">SS</span>
              </div>
              <div className="text-center opacity-0 animate-login-fade-in-up" style={{ animationDelay: '0.2s' }}>
                <div className="text-2xl font-semibold text-[#001F54]">ServeSmart</div>
                <div className="text-sm text-[#7E7F83]">Restaurant POS</div>
              </div>
            </div>
            <p className="text-[#7E7F83] text-lg text-center opacity-0 animate-login-fade-in-up" style={{ animationDelay: '0.3s' }}>Sign in to your account to continue</p>
          </div>

          {error && (
            <div key={error} className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-2 animate-login-shake">
              <svg className="w-4 h-4 flex-shrink-0 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="opacity-0 animate-login-fade-in-up" style={{ animationDelay: '0.35s' }}>
              <label htmlFor="username" className="block text-sm font-semibold text-[#001F54] mb-2">
                Email
              </label>
              <div className="relative">
                <input
                  id="username"
                  type="email"
                  placeholder="Enter your email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className={`w-full px-4 py-3 pl-12 border-2 rounded-xl text-[#001F54] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4A90E2]/50 focus:border-[#4A90E2] transition-all duration-200 ${fieldErrors.email ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' : 'border-gray-200 hover:border-gray-300'}`}
                />
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className={`w-5 h-5 ${fieldErrors.email ? 'text-red-500' : 'text-[#7E7F83]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
              {fieldErrors.email && (
                <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1 animate-login-fade-in-up">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div className="opacity-0 animate-login-fade-in-up" style={{ animationDelay: '0.45s' }}>
              <label htmlFor="password" className="block text-sm font-semibold text-[#001F54] mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={`w-full px-4 py-3 pl-12 pr-12 border-2 rounded-xl text-[#001F54] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4A90E2]/50 focus:border-[#4A90E2] transition-all duration-200 ${fieldErrors.password ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' : 'border-gray-200 hover:border-gray-300'}`}
                />
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className={`w-5 h-5 ${fieldErrors.password ? 'text-red-500' : 'text-[#7E7F83]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute inset-y-0 right-0 pr-4 flex items-center transition-colors ${fieldErrors.password ? 'text-red-500 hover:text-red-600' : 'text-[#7E7F83] hover:text-[#4A90E2]'}`}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <span className={`inline-block transition-transform duration-300 ${showPassword ? 'rotate-180' : ''}`}>
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </span>
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1 animate-login-fade-in-up">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <div className="opacity-0 animate-login-fade-in-up flex items-center justify-between" style={{ animationDelay: '0.55s' }}>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-[#4A90E2] bg-gray-100 border-gray-300 rounded focus:ring-[#4A90E2] focus:ring-2 transition-transform duration-150 checked:scale-110"
                />
                <span className="ml-2 text-sm text-[#7E7F83]">Remember me</span>
              </label>
              <Link to="/forgot-password" className="text-sm text-[#4A90E2] hover:text-[#003366] hover:underline font-medium transition-colors">
                Forgot password?
              </Link>
            </div>

            <div className="opacity-0 animate-login-fade-in-up" style={{ animationDelay: '0.65s' }}>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-[#001F54] to-[#003366] text-white font-semibold py-3.5 px-4 rounded-xl shadow-lg shadow-[#001F54]/25 hover:shadow-xl hover:shadow-[#001F54]/30 hover:from-[#002147] hover:to-[#004080] focus:outline-none focus:ring-2 focus:ring-[#4A90E2] focus:ring-offset-2 transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="w-5 h-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Signing in...</span>
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
};

export default Login;
