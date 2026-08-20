import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Navbar from "./components/Navbar";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AddProduct from "./pages/AddProduct";
import ProductList from "./pages/ProductList";
import QRScanner from "./pages/QRScanner";
import ProductDetails from "./pages/ProductDetails";
import MyWithdrawals from "./pages/MyWithdrawals";
import ManageProduct from "./pages/ManageProduct";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import WithdrawWorkflow from "./pages/WithdrawWorkflow";
import ReturnWorkflow from "./pages/ReturnWorkflow";
import { initAuth, logout, hasSmsPermission, getEmsUrl } from "./utils/auth";

// Protected Route for feature permissions
function SmsProtectedRoute({ feature, children }) {
  if (!hasSmsPermission(feature)) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#64748b", fontFamily: "'DM Sans', sans-serif" }}>
        <h2 style={{ color: "#0f172a", marginBottom: 12 }}>Access Denied</h2>
        <p>You do not have permission to access this section.</p>
      </div>
    );
  }
  return children;
}

// Helper to decode JWT
function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch (e) {
    return null;
  }
}

function App() {
  const [token, setToken] = useState(initAuth());

  // 1. Check for token expiration and handle EMS sync
  useEffect(() => {
    if (token) {
      const payload = parseJwt(token);
      if (!payload || (payload.exp * 1000 < Date.now())) {
        handleLogout();
      }
    } else {
      // If no token, redirect to EMS Login (example URL)
      window.location.href = getEmsUrl();
    }
  }, [token]);

  const handleLogout = () => {
    logout(getEmsUrl());
  };

  const payload = token ? parseJwt(token) : {};
  const isAdmin = payload?.role && (
    payload.role.toLowerCase() === "admin" || 
    payload.role.toLowerCase() === "super_admin" || 
    payload.role.toLowerCase() === "superadmin"
  );

  return (
    <Router>
      <div className="app-main-wrapper">
        {/* 2. Only show Navbar if logged in */}
        {token && <Navbar isAdmin={isAdmin} onLogout={handleLogout} />}

        <div className="content-area">
          <Routes>
            {!token ? (
              // 3. While waiting for redirect
              <Route path="*" element={<div>Redirecting to EMS...</div>} />
            ) : (
              <>
                {/* Home Logic: Admin goes to Dashboard, Employee to their Dashboard */}
                <Route
                  path="/"
                  element={isAdmin ? <SmsProtectedRoute feature="workstockpro"><Dashboard /></SmsProtectedRoute> : <EmployeeDashboard />}
                />

                {/* Admin Only */}
                {isAdmin && (
                  <>
                    <Route path="/admin-dashboard" element={<SmsProtectedRoute feature="workstockpro"><Dashboard /></SmsProtectedRoute>} />
                    <Route path="/add-product" element={<SmsProtectedRoute feature="sms_stock_in"><AddProduct /></SmsProtectedRoute>} />
                    <Route path="/manage/:id" element={<ManageProduct />} />
                  </>
                )}

                {/* Shared Routes */}
                <Route path="/my-dashboard" element={<EmployeeDashboard />} />
                <Route path="/products" element={<SmsProtectedRoute feature="sms_master_list"><ProductList /></SmsProtectedRoute>} />
                <Route path="/scan" element={<QRScanner />} />
                <Route path="/products/:id" element={<SmsProtectedRoute feature="sms_master_list"><ProductDetails /></SmsProtectedRoute>} />
                <Route path="/withdraw" element={<SmsProtectedRoute feature="sms_withdrawal"><WithdrawWorkflow /></SmsProtectedRoute>} />
                <Route path="/withdraw/:id" element={<SmsProtectedRoute feature="sms_withdrawal"><WithdrawWorkflow /></SmsProtectedRoute>} />
                <Route path="/return" element={<SmsProtectedRoute feature="sms_withdrawal"><ReturnWorkflow /></SmsProtectedRoute>} />
                <Route path="/return/:id" element={<SmsProtectedRoute feature="sms_withdrawal"><ReturnWorkflow /></SmsProtectedRoute>} />
                <Route path="/my-withdrawals" element={<SmsProtectedRoute feature="sms_reports"><MyWithdrawals /></SmsProtectedRoute>} />

                {/* Catch-all for logged in users */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </>
            )}
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;