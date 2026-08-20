import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "../styles/Navbar.css";

function parseJwt(token) {
  try { return JSON.parse(atob(token.split(".")[1])); } catch { return {}; }
}

export default function Navbar({ onLogout, isAdmin }) {
  const location = useLocation();
  const token = localStorage.getItem("token");
  const payload = parseJwt(token || "");
  const userName = payload?.name || "User";
  const userRole = payload?.role || "employee";
  const [imgError, setImgError] = useState(false);

  const isActive = (path) => location.pathname === path;

  return (
    <header className="navbar">
      <div className="navbar-inner">
        {/* Left side: Brand + Nav links */}
        <div className="navbar-left">
          <Link to="/" className="navbar-brand">
            <div className="navbar-brand-icon">
              {import.meta.env.VITE_LOGO_URL && !imgError ? (
                <img 
                  src={import.meta.env.VITE_LOGO_URL} 
                  alt="Logo" 
                  onError={() => setImgError(true)}
                  style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'contain' }} 
                />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
                  <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>
                </svg>
              )}
            </div>
            <span className="navbar-brand-text">WorkStock Pro</span>
          </Link>
          <nav className="navbar-links">
            <Link to="/" className={`navbar-link ${isActive("/") ? "active" : ""}`}>Dashboard</Link>
          </nav>
        </div>

        
        <div className="navbar-right">
          <div className="navbar-user">
            <div className="navbar-avatar">{userName[0]?.toUpperCase()}</div>
            <div className="navbar-user-info">
              <span className="navbar-user-name">{userName}</span>
              <span className="navbar-user-role">{userRole}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
