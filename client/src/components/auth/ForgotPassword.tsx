import React, { useState } from 'react';

const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) {
      setMessage('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      await res.json();
      setSent(true);
      setMessage('If the email exists, an OTP was sent.');
    } catch (err: any) {
      setMessage('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white shadow rounded p-6">
        <h1 className="text-2xl font-semibold mb-4">Forgot password</h1>
        {message && <div className="mb-3 text-sm">{message}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" required className="w-full border rounded px-3 py-2" />
          </div>
          <button disabled={loading} type="submit" className="w-full bg-blue-600 text-white py-2 rounded">
            {loading ? 'Sending...' : 'Send OTP'}
          </button>
        </form>
        {sent && (
          <p className="text-sm mt-3">Check your email for the 6-digit code, then proceed to reset.</p>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;


