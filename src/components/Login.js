import React, { useState } from 'react';
import { useAppContext } from '../contexts/AppContext';

const Login = () => {
  const context = useAppContext();
  console.log('[Login] useAppContext() value:', context);
  const { login, apiError } = context;
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLocalError(null);

    if (!password) {
      console.warn('[Login] Submit blocked: empty password');
      return;
    }

    if (typeof login !== 'function') {
      console.error('[Login] login is not a function. Context value:', { login });
      setLocalError('Internal error: login function not available');
      return;
    }

    console.log('[Login] Submitting login with password length:', password.length);

    setSubmitting(true);
    try {
      await login(password);
      console.log('[Login] login() resolved successfully');
      setPassword('');
    } catch (error) {
      console.error('[Login] login() threw:', error);
      setLocalError(error && error.message ? error.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2>Kids Reading Manager</h2>
        <p style={styles.subtitle}>Enter the access password to continue.</p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            placeholder="Password"
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            autoFocus
          />

          <button
            type="submit"
            disabled={submitting || !password}
            style={styles.button}
          >
            {submitting ? 'Logging in...' : 'Login'}
          </button>
        </form>

        {(localError || apiError) && (
          <div style={styles.error}>{localError || apiError}</div>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f5f5f5',
  },
  card: {
    padding: '24px 28px',
    borderRadius: '8px',
    background: '#ffffff',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    maxWidth: '360px',
    width: '100%',
    textAlign: 'center',
  },
  subtitle: {
    color: '#555',
    fontSize: '0.9rem',
    marginBottom: '16px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    marginBottom: '12px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    fontSize: '0.95rem',
  },
  button: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '4px',
    border: 'none',
    background: '#1976d2',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: {
    marginTop: '10px',
    color: '#b00020',
    fontSize: '0.85rem',
  },
};

export default Login;