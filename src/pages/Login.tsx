import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ShoppingBag, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { session, refreshProfile } = useAuth();

  // Redirect if already authenticated
  React.useEffect(() => {
    if (session) navigate('/', { replace: true });
  }, [session, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      await refreshProfile();
      toast.success('Welcome back!');
      navigate('/');
    } catch (err: any) {
      if (err.message?.includes('Database error querying schema')) {
        toast.error('Supabase setup required: Please run fix_accounts.sql in your Supabase SQL Editor once to activate all team logins.', { duration: 9000 });
      } else if (err.message?.includes('Invalid login credentials')) {
        toast.error('Invalid email or password. Please verify your credentials.');
      } else {
        toast.error(err.message || 'Login failed. Please check credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      padding: '1.5rem',
      position: 'relative'
    }}>
      <div className="card shadow-lg" style={{ width: '100%', maxWidth: 420, border: '1px solid var(--border-color)' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            width: 52,
            height: 52,
            background: 'linear-gradient(135deg, var(--primary), #6366f1)',
            borderRadius: 'var(--radius-lg)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            marginBottom: '0.75rem',
            boxShadow: '0 4px 14px 0 rgba(59, 130, 246, 0.4)'
          }}>
            <ShoppingBag size={26} />
          </div>
          <h1 style={{ fontSize: '1.625rem', fontWeight: 700, letterSpacing: '-0.025em' }}>Ecom WorkSheet</h1>
          <p className="text-muted text-sm mt-1">Sign in to your team workspace</p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              className="form-control"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@ecomworksheet.com"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPass ? 'text' : 'password'}
                className="form-control"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                style={{ paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)'
                }}
                title={showPass ? 'Hide password' : 'Show password'}
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={loading}
            style={{ marginTop: '0.75rem', height: 42, fontSize: '0.9375rem' }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};
