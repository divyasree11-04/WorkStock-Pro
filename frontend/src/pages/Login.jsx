import React, { useState } from 'react';
import { api } from '../utils/api';
import '../styles/Login.css';

export default function Login({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const email = e.target.email.value;
    const password = e.target.password.value;
    try {
      const res = await api.post("/login", { email, password });
      onLogin(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="login-brand">
          <div className="login-brand-icon">
            {import.meta.env.VITE_LOGO_URL ? (
              <img 
                src={import.meta.env.VITE_LOGO_URL} 
                alt="Logo" 
                style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'contain' }} 
              />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="28" height="28">
                <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
                <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>
              </svg>
            )}
          </div>
          <div>
            <h1 className="login-brand-name">WorkStock Pro</h1>
            <p className="login-brand-sub">Inventory Management System</p>
          </div>
        </div>

        <div className="login-divider" />


        {error && (
          <div className="login-error">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label>Email</label>
            <input name="email" type="email" placeholder="name@company.com" required autoComplete="email" />
          </div>
          <div className="login-field">
            <label>Password</label>
            <input name="password" type="password" placeholder="Enter your password" required autoComplete="current-password" />
          </div>
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? (
              <span className="login-spinner" />
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                  <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/>
                </svg>
                Sign In
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
