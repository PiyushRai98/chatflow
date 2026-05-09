import { useState } from 'react';
import api from '../../services/api';
import useStore from '../../hooks/useStore';

export default function LoginPage() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({
    email: '',
    password: '',
    username: '',
    displayName: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setUser = useStore((s) => s.setUser);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let result;
      if (mode === 'login') {
        result = await api.login(form.email, form.password);
      } else {
        result = await api.register({
          email: form.email,
          password: form.password,
          username: form.username,
          displayName: form.displayName || form.username,
        });
      }

      api.setTokens(result.accessToken, result.refreshToken);
      setUser(result.user);
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent mb-4">
            <svg className="w-8 h-8 text-bg-base" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-text-primary">ChatFlow</h1>
          <p className="text-text-secondary mt-2 text-sm">
            {mode === 'login' ? 'Sign in to continue' : 'Create your account'}
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-bg-surface rounded-2xl p-8 shadow-2xl border border-border"
        >
          {mode === 'register' && (
            <>
              <div className="mb-4">
                <label className="block text-xs uppercase tracking-wider text-text-secondary mb-2 font-semibold">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full bg-bg-elevated text-text-primary px-4 py-3 rounded-lg border border-border focus:border-accent focus:outline-none transition-colors"
                  placeholder="johndoe"
                  pattern="[a-zA-Z0-9_]+"
                  minLength={3}
                  maxLength={50}
                />
              </div>
              <div className="mb-4">
                <label className="block text-xs uppercase tracking-wider text-text-secondary mb-2 font-semibold">
                  Display Name
                </label>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  className="w-full bg-bg-elevated text-text-primary px-4 py-3 rounded-lg border border-border focus:border-accent focus:outline-none transition-colors"
                  placeholder="John Doe"
                />
              </div>
            </>
          )}

          <div className="mb-4">
            <label className="block text-xs uppercase tracking-wider text-text-secondary mb-2 font-semibold">
              Email
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-bg-elevated text-text-primary px-4 py-3 rounded-lg border border-border focus:border-accent focus:outline-none transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <div className="mb-6">
            <label className="block text-xs uppercase tracking-wider text-text-secondary mb-2 font-semibold">
              Password
            </label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-bg-elevated text-text-primary px-4 py-3 rounded-lg border border-border focus:border-accent focus:outline-none transition-colors"
              placeholder="••••••••"
              minLength={8}
            />
            {mode === 'register' && (
              <p className="mt-2 text-xs text-text-muted">
                8+ characters with uppercase, lowercase, and number
              </p>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-bg-base font-bold py-3 px-6 rounded-full uppercase tracking-wider text-sm transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>

          <div className="mt-6 text-center text-sm text-text-secondary">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-accent hover:underline font-semibold"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
