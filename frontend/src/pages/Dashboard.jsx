import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { hasSmsPermission, hasSmsWritePermission } from "../utils/auth";
import "../styles/Dashboard.css";

function parseJwt(token) {
  try { return JSON.parse(atob(token.split(".")[1])); } catch { return {}; }
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState({
    totalItems: 0, totalQuantity: 0, totalValue: 0, lowStock: [], recentItems: [], machineAlerts: []
  });
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const token = localStorage.getItem("token");
  const payload = parseJwt(token || "");
  const empName = payload.name || "User";

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  useEffect(() => {
    Promise.all([
      api.get("/dashboard"),
      api.get("/products")
    ])
      .then(([dashRes, prodRes]) => {
        setData(dashRes.data);
        setAllProducts(Array.isArray(prodRes.data) ? prodRes.data : []);
        setLoading(false);
      })
      .catch(err => {
        setError("Failed to load dashboard data.");
        setLoading(false);
      });
  }, []);


  const warrantyAlerts = (Array.isArray(allProducts) ? allProducts : [])
    .filter(p => !!p.warranty_expiry)
    .map(p => {
      const diffDays = Math.ceil((new Date(p.warranty_expiry) - new Date()) / (1000 * 60 * 60 * 24));
      const absDays = Math.abs(diffDays);
      const timeStr = absDays < 60
        ? `${absDays} day${absDays !== 1 ? 's' : ''}`
        : `${Math.round(absDays / 30)} month${Math.round(absDays / 30) !== 1 ? 's' : ''}`;
      let pillColor, pillBg, pillLabel, message;
      if (diffDays < 0) {
        pillColor = '#ef4444'; pillBg = '#fef2f2'; pillLabel = 'Expired';
        message = `Expired ${timeStr} ago`;
      } else if (diffDays <= 30) {
        pillColor = '#ef4444'; pillBg = '#fef2f2'; pillLabel = 'Urgent';
        message = `Expires in ${timeStr} — renew immediately!`;
      } else if (diffDays <= 90) {
        pillColor = '#f59e0b'; pillBg = '#fffbeb'; pillLabel = 'Soon';
        message = `Expires in ${timeStr} — plan renewal`;
      } else if (diffDays <= 120) {
        pillColor = '#f59e0b'; pillBg = '#fffbeb'; pillLabel = '~4 Months';
        message = `Expires in ${timeStr}`;
      } else {
        pillColor = '#10b981'; pillBg = '#f0fdf4'; pillLabel = 'Active';
        message = `Valid for ${timeStr} more`;
      }
      return { ...p, days_left: diffDays, pillColor, pillBg, pillLabel, message };
    })
    .sort((a, b) => a.days_left - b.days_left);

  const criticalCount = (Array.isArray(data.lowStock) ? data.lowStock : []).filter(i => parseFloat(i.quantity) <= 2).length;
  const lowCount = (Array.isArray(data.lowStock) ? data.lowStock : []).filter(i => parseFloat(i.quantity) > 2).length;

  const [stockFilter, setStockFilter] = useState(null);
  const toggleFilter = (f) => setStockFilter(prev => prev === f ? null : f);
  const visibleStock = stockFilter === "critical"
    ? (Array.isArray(data.lowStock) ? data.lowStock : []).filter(i => parseFloat(i.quantity) <= 2)
    : stockFilter === "low"
      ? (Array.isArray(data.lowStock) ? data.lowStock : []).filter(i => parseFloat(i.quantity) > 2)
      : (Array.isArray(data.lowStock) ? data.lowStock : []);

  const [showAlertModal, setShowAlertModal] = useState(false);
  const [admins, setAdmins] = useState([]);
  const [selectedAdmins, setSelectedAdmins] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [customEmail, setCustomEmail] = useState("");
  const [sendingAlert, setSendingAlert] = useState(false);
  const [alertSuccessMsg, setAlertSuccessMsg] = useState("");
  const [alertErrorMsg, setAlertErrorMsg] = useState("");

  useEffect(() => {
    if (showAlertModal) {
      api.get("/admins")
        .then(res => {
          setAdmins(res.data);
          setSelectedAdmins(res.data.map(admin => admin.email));
        })
        .catch(err => {
          console.error("Failed to load admins:", err);
        });

      setSelectedItems((Array.isArray(data.lowStock) ? data.lowStock : []).map(item => item.id));
      setCustomEmail("");
      setAlertSuccessMsg("");
      setAlertErrorMsg("");
    }
  }, [showAlertModal, data.lowStock]);

  const handleSendAlert = async () => {
    if (!hasSmsWritePermission("workstockpro")) {
      alert("No permissions");
      return;
    }
    if (selectedAdmins.length === 0 && (!customEmail || customEmail.trim() === "")) {
      setAlertErrorMsg("Please select at least one admin or enter a custom email.");
      return;
    }
    if (selectedItems.length === 0) {
      setAlertErrorMsg("Please select at least one low stock item.");
      return;
    }

    setSendingAlert(true);
    setAlertSuccessMsg("");
    setAlertErrorMsg("");

    try {
      const res = await api.post("/send-low-stock-alert", {
        recipients: selectedAdmins,
        itemIds: selectedItems,
        customEmail: customEmail
      });
      if (res.data.success) {
        setAlertSuccessMsg("Alert emails sent successfully!");
        setTimeout(() => setShowAlertModal(false), 2000);
      } else {
        setAlertErrorMsg(res.data.message || "Failed to send alert.");
      }
    } catch (err) {
      setAlertErrorMsg(err.response?.data?.message || "Error sending alert emails.");
    } finally {
      setSendingAlert(false);
    }
  };


  const quickActions = [
    { icon: "IN", title: "Master List", sub: "Record incoming items", route: "/products", color: "#f0fdf4", accent: "#16a34a", feature: "sms_master_list" },
   /*Withdrw*/ { icon: "OUT", title: "Inventory Release", sub: "Issue items from store", route: "/withdraw", color: "#eff6ff", accent: "#1d4ed8", feature: "sms_withdrawal" },
    { icon: "RET", title: "Deposit", sub: "Return items to store", route: "/return", color: "#fff7ed", accent: "#ea580c", feature: "sms_withdrawal" },
    { icon: "ADD", title: "Stock In", sub: "Register new item", route: "/add-product", color: "#fffbeb", accent: "#b45309", feature: "sms_stock_in" },
    { icon: "LOG", title: "All History", sub: "View issue records", route: "/my-withdrawals", color: "#fff1f2", accent: "#be123c", feature: "sms_reports" },
    { icon: "RPT", title: "Export Report", sub: "Download CSV/Excel", route: "#reports", color: "#f0fdfa", accent: "#0d9488", feature: "sms_reports" },
  ];

  const actions = quickActions.filter(qa => !qa.route.startsWith("#") && (!qa.feature || hasSmsPermission(qa.feature)));
  const exportAction = quickActions.find(qa => qa.route === "#reports" && (!qa.feature || hasSmsPermission(qa.feature)));

  const [exporting, setExporting] = useState(false);

  const exportReport = async (type) => {
    try {
      setExporting(true);
      const response = await api.get(`/reports/export?type=${type}`, {
        responseType: 'blob'
      });

      const blob = new Blob([response.data], {
        type: response.headers['content-type']
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      const contentDisposition = response.headers['content-disposition'];
      let filename = `report_${new Date().toISOString().slice(0, 10)}.${type === 'excel' ? 'xls' : type}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename=(.+)/);
        if (match) filename = match[1];
      }

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export report. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  if (loading) return (
    <div className="db-loading">
      <div className="db-spinner" />
      <p>Loading dashboard...</p>
    </div>
  );

  if (error) return (
    <div className="db-error-screen">
      <div className="db-error-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="32" height="32">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <p>{error}</p>
      <button onClick={() => window.location.reload()}>Retry</button>
    </div>
  );

  return (
    <div className="db-root">

      {/* Hero */}
      <div className="db-hero">
        <div className="db-hero-left">
          <p className="db-hero-date">{today}</p>
          <h1 className="db-hero-title">Inventory Control</h1>

        </div>
      </div>

      <div className="db-kpi-strip">
        {[
          { icon: "box", val: data.totalItems || 0, lbl: "Total Products", badge: "Inventory", cls: "db-kpi-blue" },
          { icon: "chart", val: data.totalQuantity || 0, lbl: "Total Units", badge: "Quantity", cls: "db-kpi-green" },
          { icon: "money", val: `₹${Number(data.totalValue || 0).toLocaleString("en-IN")}`, lbl: "Total Value", badge: "Value", cls: "db-kpi-amber" },
          { icon: "warn", val: (Array.isArray(data.lowStock) ? data.lowStock : []).length, lbl: "Low Stock Items", badge: "Alerts", cls: "db-kpi-red" },
        ].map((k, i) => (
          <div key={i} className={`db-kpi-card ${k.cls}`}>
            <div className="db-kpi-icon">
              {k.icon === "box" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /></svg>}
              {k.icon === "chart" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>}
              {k.icon === "money" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24"><path d="M6 3h12M6 8h12M14.5 8c0 3.5-3 6-6.5 6h-.5l7 7" /></svg>}
              {k.icon === "warn" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>}
            </div>
            <div className="db-kpi-body">
              <div className="db-kpi-val">{k.val}</div>
              <div className="db-kpi-lbl">{k.lbl}</div>
            </div>
            <span className="db-kpi-badge">{k.badge}</span>
            {i < 3 && <div className="db-kpi-divider" />}
          </div>
        ))}
      </div>

      <div className="db-status-pills-bar">
        <span className="db-status-label">Stock Status:</span>
        <div className="db-health-pills">
          <span
            className={`db-pill db-pill-red${stockFilter === "critical" ? " db-pill-active" : ""}`}
            onClick={() => toggleFilter("critical")}
          >{criticalCount} Critical</span>
          <span
            className={`db-pill db-pill-amber${stockFilter === "low" ? " db-pill-active" : ""}`}
            onClick={() => toggleFilter("low")}
          >{lowCount} Low</span>

        </div>
      </div>

      {/* Out of Stock Alert */}
      {(Array.isArray(data.recentItems) ? data.recentItems : []).filter(i => parseFloat(i.quantity) <= 0).length > 0 && (
        <div className="db-oos-alert">
          <div className="db-oos-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div className="db-oos-body">
            <strong>Stock Alert:</strong> {(Array.isArray(data.recentItems) ? data.recentItems : []).filter(i => parseFloat(i.quantity) <= 0).length} items are currently Out of Stock.
          </div>
          <button className="db-btn-oos" onClick={() => navigate("/products", { state: { filter: "out" } })}>View Items</button>
        </div>
      )}

      {/* Main grid */}
      <div className="db-main-grid">

        {/* Low stock */}
        <div className="card db-panel">
          <div className="db-panel-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 className="db-panel-title">
                {stockFilter === "critical" ? "Critical Stock Alerts" : "Low Stock Alerts"}
              </h2>
              <p className="db-panel-sub">
                {stockFilter === "critical" ? "Items requiring immediate attention" : "Items requiring immediate restocking"}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {visibleStock.length > 0 && (
                <span className="db-alert-count">{visibleStock.length} items</span>
              )}
              {(Array.isArray(data.lowStock) ? data.lowStock : []).length > 0 && (
                <button
                  onClick={() => {
                    if (!hasSmsWritePermission("workstockpro")) {
                      alert("No permissions");
                      return;
                    }
                    setShowAlertModal(true);
                  }}
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  Send Alert
                </button>
              )}
            </div>
          </div>
          <div className="db-low-list">
            {visibleStock.length === 0 ? (
              <div className="db-empty-state"><p>{stockFilter ? "No items in this category" : "No low stock alerts"}</p></div>
            ) : (
              visibleStock.map((item, idx) => {
                const qty = parseFloat(item.quantity);
                const isCritical = qty <= 2;
                const isHealthy = qty >= 5;
                const statusColor = isHealthy ? "green" : isCritical ? "red" : "amber";
                const statusText = isHealthy ? "Available" : isCritical ? "Critical" : "Low";
                return (
                  <div key={item.id || idx} className="db-low-row" onClick={() => navigate(`/products/${item.id}`)}>
                    <div className="db-low-rank">#{idx + 1}</div>
                    <div className="db-low-info">
                      <div className="db-low-name">{item.item_name}</div>
                      <div className="db-low-meta">{item.category || "Uncategorised"}</div>
                    </div>
                    <div className="db-low-right">
                      <div className={`db-low-qty qty-${statusColor}`}>
                        {qty}<span>{item.unit || "units"}</span>
                      </div>
                      <span className={`db-status-dot dot-${statusColor}`}>
                        {statusText}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="card db-panel">
          <div className="db-panel-hdr">
            <div>
              <h2 className="db-panel-title">Quick Actions</h2>
              <p className="db-panel-sub">Frequently used operations</p>
            </div>
          </div>
          <div className="db-action-grid">
            {actions.map(qa => (
              <div
                key={qa.route}
                className="db-action-card"
                style={{ "--accent": qa.accent, "--bg": qa.color, display: 'flex', flexDirection: 'column' }}
              >
                <div onClick={() => navigate(qa.route)} style={{ flex: 1, cursor: 'pointer' }}>
                  <div className="db-action-ico-wrap" style={{ background: qa.color, border: `1px solid ${qa.accent}22` }}>
                    <span className="db-action-tag" style={{ color: qa.accent }}>{qa.icon}</span>
                  </div>
                  <div className="db-action-title">{qa.title}</div>
                  <div className="db-action-sub">{qa.sub}</div>
                </div>
                { }
              </div>
            ))}
          </div>

          {exportAction && (
            <div
              className="db-action-card db-export-card"
              style={{ "--accent": exportAction.accent, "--bg": exportAction.color }}
            >
              <div className="db-export-card-content">
                <div className="db-action-ico-wrap" style={{ background: exportAction.color, border: `1px solid ${exportAction.accent}22` }}>
                  <span className="db-action-tag" style={{ color: exportAction.accent }}>{exportAction.icon}</span>
                </div>
                <div className="db-export-card-text">
                  <div className="db-action-title">{exportAction.title}</div>
                  <div className="db-action-sub">{exportAction.sub}</div>
                </div>
              </div>

              <div className="db-export-row">
                <button className="db-export-btn" onClick={() => exportReport("csv")} disabled={exporting}>
                  {exporting ? "..." : "Export CSV"}
                </button>
                <button className="db-export-btn" onClick={() => exportReport("excel")} disabled={exporting}>
                  {exporting ? "..." : "Export Excel"}
                </button>
                <button className="db-export-btn" onClick={() => exportReport("pdf")} disabled={exporting}>
                  {exporting ? "..." : "Export PDF"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Machine warranty */}
        <div className="card db-panel">
          <div className="db-panel-hdr">
            <div>
              <h2 className="db-panel-title">Machine Warranty</h2>
              <p className="db-panel-sub">
                {warrantyAlerts.length > 0
                  ? `${warrantyAlerts.length} product${warrantyAlerts.length > 1 ? 's' : ''} tracked`
                  : 'No warranty data'}
              </p>
            </div>
            {warrantyAlerts.filter(m => m.days_left <= 120).length > 0 && (
              <span className="db-alert-count" style={{ background: '#fef2f2', color: '#ef4444' }}>
                {warrantyAlerts.filter(m => m.days_left <= 120).length} expiring soon
              </span>
            )}
          </div>
          <div className="db-low-list">
            {warrantyAlerts.length === 0 ? (
              <div className="db-empty-state"><p>No products with warranty data</p></div>
            ) : (
              warrantyAlerts.map((m, idx) => {
                let maintenanceText = '';
                if (m.maintenance_due) {
                  const md = Math.ceil((new Date(m.maintenance_due) - new Date()) / (1000 * 60 * 60 * 24));
                  const mdAbs = Math.abs(md);
                  const mdStr = mdAbs < 60
                    ? `${mdAbs} day${mdAbs !== 1 ? 's' : ''}`
                    : `${Math.round(mdAbs / 30)} month${Math.round(mdAbs / 30) !== 1 ? 's' : ''}`;
                  maintenanceText = md >= 0 ? `Maintenance due in ${mdStr}` : `Maintenance overdue by ${mdStr}`;
                }
                return (
                  <div
                    key={idx}
                    className="db-low-row"
                    onClick={() => navigate(`/products/${m.id}`)}
                    style={{ cursor: 'pointer', borderLeft: `3px solid ${m.pillColor}`, paddingLeft: '10px' }}
                    onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div className="db-low-info" style={{ flex: 1 }}>
                      <div className="db-low-name" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        {m.item_name}
                        <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" width="11" height="11">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                          <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '3px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: m.pillColor }}>{m.message}</span>
                        {maintenanceText && (
                          <span style={{ fontSize: '11px', color: '#f59e0b' }}> {maintenanceText}</span>
                        )}
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          Expiry: {new Date(m.warranty_expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    <div style={{
                      padding: '4px 10px', borderRadius: '12px', fontSize: '11px',
                      fontWeight: 700, color: m.pillColor, background: m.pillBg,
                      border: `1px solid ${m.pillColor}33`, whiteSpace: 'nowrap', flexShrink: 0
                    }}>
                      {m.pillLabel}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
      {showAlertModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15, 23, 42, 0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: "20px",
          fontFamily: "'DM Sans', sans-serif"
        }}>
          <div style={{
            background: "#ffffff",
            borderRadius: "16px",
            width: "100%",
            maxWidth: "600px",
            maxHeight: "90vh",
            overflowY: "auto",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            border: "1px solid #e2e8f0",
            display: "flex",
            flexDirection: "column"
          }}>
            {/* Modal Header */}
            <div style={{
              padding: "20px 24px",
              borderBottom: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>Send Low Stock Alerts</h3>
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#64748b" }}>Notify admins and team members about depleted items</p>
              </div>
              <button
                onClick={() => setShowAlertModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  color: "#94a3b8",
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: 0
                }}
              >&times;</button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Admins selection */}
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                  Select Administrators
                </label>
                {admins.length === 0 ? (
                  <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>No administrators found.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", maxHeight: "150px", overflowY: "auto" }}>
                    {admins.map(admin => (
                      <label key={admin.employee_id} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", color: "#334155", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={selectedAdmins.includes(admin.email)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedAdmins([...selectedAdmins, admin.email]);
                            } else {
                              setSelectedAdmins(selectedAdmins.filter(email => email !== admin.email));
                            }
                          }}
                        />
                        <div>
                          <strong>{admin.name}</strong> <span style={{ color: "#64748b", fontSize: "12px" }}>({admin.email})</span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Custom email */}
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                  Additional Email
                </label>
                <input
                  type="email"
                  placeholder="Enter custom email address (optional)"
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1.5px solid #e2e8f0",
                    fontSize: "14px",
                    outline: "none",
                    fontFamily: "inherit"
                  }}
                />
              </div>


              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                  Select Low Stock Items to Include
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", maxHeight: "150px", overflowY: "auto" }}>
                  {(Array.isArray(data.lowStock) ? data.lowStock : []).map(item => {
                    const qty = parseFloat(item.quantity);
                    const isCritical = qty <= 2;
                    return (
                      <label key={item.id} style={{ display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "space-between", fontSize: "14px", color: "#334155", cursor: "pointer" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <input
                            type="checkbox"
                            checked={selectedItems.includes(item.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedItems([...selectedItems, item.id]);
                              } else {
                                setSelectedItems(selectedItems.filter(id => id !== item.id));
                              }
                            }}
                          />
                          <span>{item.item_name}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "13px", fontWeight: 700, color: isCritical ? "#ef4444" : "#f59e0b" }}>
                            {qty} {item.unit}
                          </span>
                          <span style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "10px",
                            background: isCritical ? "#fee2e2" : "#fef3c7",
                            color: isCritical ? "#991b1b" : "#92400e"
                          }}>
                            {isCritical ? "Critical" : "Low"}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Error/Success Messages */}
              {alertErrorMsg && (
                <div style={{ color: "#ef4444", fontSize: "14px", fontWeight: 600, textAlign: "center", background: "#fef2f2", padding: "10px", borderRadius: "8px", border: "1px solid #fee2e2" }}>
                  {alertErrorMsg}
                </div>
              )}
              {alertSuccessMsg && (
                <div style={{ color: "#10b981", fontSize: "14px", fontWeight: 600, textAlign: "center", background: "#f0fdf4", padding: "10px", borderRadius: "8px", border: "1px solid #d1fae5" }}>
                  {alertSuccessMsg}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: "16px 24px",
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "flex-end",
              gap: "12px"
            }}>
              <button
                onClick={() => setShowAlertModal(false)}
                disabled={sendingAlert}
                style={{
                  background: "#fff",
                  border: "1px solid #cbd5e1",
                  color: "#475569",
                  padding: "10px 18px",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >Cancel</button>
              <button
                onClick={handleSendAlert}
                disabled={sendingAlert}
                style={{
                  background: sendingAlert ? "#94a3b8" : "#ef4444",
                  border: "none",
                  color: "#fff",
                  padding: "10px 18px",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: sendingAlert ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                {sendingAlert ? "Sending..." : "Send Notification"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
