import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import "../styles/EmployeeDashboard.css";

function parseJwt(token) {
  try { return JSON.parse(atob(token.split(".")[1])); } catch { return {}; }
}

export default function EmployeeDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("withdrawals");
  const [search, setSearch] = useState("");
  const [returning, setReturning] = useState({});

  const token = localStorage.getItem("token");
  const payload = parseJwt(token || "");
  const empName = payload.name || "Employee";
  const empCode = payload.code || "";
  const isAdmin = payload.role && (
    payload.role.toLowerCase() === "admin" ||
    payload.role.toLowerCase() === "super_admin" ||
    payload.role.toLowerCase() === "superadmin"
  );

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/my-dashboard");
      setData(res.data);
    } catch (err) {
      // Log full error so we can diagnose in browser console
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      console.error(`[EmployeeDashboard] API Error ${status}:`, msg, {
        token: localStorage.getItem("token") ? "present" : "MISSING",
        url: err.config?.url,
        fullError: err.response?.data,
      });
      if (status === 401) {
        setError("Session expired. You will be redirected to login...");
      } else if (status === 403) {
        setError("Access denied — your account role may not be set up in WorkStock.");
      } else {
        setError(`Failed to load dashboard. (Error ${status || "network"}: ${msg})`);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleReturn = (id) =>
    setReturning(prev => ({
      ...prev,
      [id]: prev[id]?.open
        ? { open: false, amount: "", submitting: false, msg: "" }
        : { open: true, amount: "", submitting: false, msg: "" }
    }));

  const handleReturn = async (item) => {
    const r = returning[item.id];
    const qty = parseFloat(r.amount);
    if (!qty || qty <= 0) {
      setReturning(prev => ({ ...prev, [item.id]: { ...prev[item.id], msg: "Enter a valid amount." } }));
      return;
    }
    const absQty = Math.abs(parseFloat(item.quantity));
    if (qty > absQty) {
      setReturning(prev => ({ ...prev, [item.id]: { ...prev[item.id], msg: `Max returnable: ${absQty} ${item.unit}` } }));
      return;
    }
    setReturning(prev => ({ ...prev, [item.id]: { ...prev[item.id], submitting: true, msg: "" } }));
    try {
      await api.post("/return", { productId: item.product_id, quantity: qty });
      setReturning(prev => ({ ...prev, [item.id]: { open: false, amount: "", submitting: false, msg: "" } }));
      fetchData();
    } catch (err) {
      setReturning(prev => ({
        ...prev,
        [item.id]: { ...prev[item.id], submitting: false, msg: err.response?.data?.message || err.message }
      }));
    }
  };

  if (loading) return <div className="ed-container ed-center"><div className="ed-spinner" /><p>Loading...</p></div>;
  if (error) return <div className="ed-container ed-center"><p className="ed-err">{error}</p></div>;
  if (!data) return <div className="ed-container ed-center"><p className="ed-err">Session expired. Please login.</p></div>;

  const withdrawals = Array.isArray(data?.withdrawals) ? data.withdrawals : [];
  const deposits = Array.isArray(data?.deposits) ? data.deposits : [];
  const items = tab === "withdrawals" ? withdrawals : deposits;
  const filtered = items.filter(w => w.item_name?.toLowerCase().includes(search.toLowerCase()));
  const totalValue = withdrawals.reduce(
    (s, w) => s + (parseFloat(w.quantity || 0) * parseFloat(w.unit_price || 0)), 0
  );

  return (
    <div className="ed-container">

      {/* Profile header */}
      <div className="ed-profile-hdr">
        <div className="ed-avatar">{empName[0]?.toUpperCase()}</div>
        <div className="ed-profile-info">
          <h2>{empName}</h2>
          <p>{empCode} - {isAdmin ? "Admin Access" : "Staff Member"}</p>
        </div>
        <div className="ed-stats-grid">
          {[
            { val: withdrawals.length, lbl: "Orders" },
            { val: data?.totalWithdrawn || 0, lbl: "Units" },
            { val: `₹${totalValue.toFixed(0)}`, lbl: "Value" },
          ].map(({ val, lbl }) => (
            <div key={lbl} className="ed-stat-card">
              <span className="ed-stat-val">{val}</span>
              <span className="ed-stat-lbl">{lbl}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        <button
          onClick={() => navigate("/withdraw")}
          style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 20px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          Withdraw Item
        </button>
        <button
          onClick={() => navigate("/return")}
          style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 20px", background: "#ea580c", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
          Return Item
        </button>
      </div>

      {/* Controls */}
      <div className="ed-controls">
        <div className="ed-tabs">
          <button className={`ed-tab-btn ${tab === "withdrawals" ? "active" : ""}`} onClick={() => setTab("withdrawals")}>
            Withdrawals ({data.withdrawals.length})
          </button>
          <button className={`ed-tab-btn ${tab === "deposits" ? "active" : ""}`} onClick={() => setTab("deposits")}>
            Deposits ({data.deposits.length})
          </button>
        </div>
        <input className="ed-search" type="text" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* List */}
      <div className="ed-list">
        {filtered.length === 0 && <p className="ed-no-records">No records found.</p>}

        {filtered.map(item => {
          const isWithdrawal = tab === "withdrawals";
          const isReturn = !isWithdrawal && item.type === "RETURN";
          const r = returning[item.id] || { open: false, amount: "", submitting: false, msg: "" };

          // Determine class suffixes for custom styling
          const suffix = isWithdrawal ? "out" : isReturn ? "ret" : "in";

          return (
            <div key={item.id} className={`ed-card ${r.open ? "open" : ""}`}>
              <div className="ed-row-main">
                <div className={`ed-icon-box ${suffix}`}>
                  {isWithdrawal ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                  ) : isReturn ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                  )}
                </div>

                <div className="ed-info-content">
                  <div className="ed-item-header">
                    <span className="ed-item-name">{item.item_name}</span>
                    <span className={`ed-badge ${suffix}`}>
                      {isWithdrawal ? "Stock Out" : isReturn ? "Stock Return" : "Stock In"}
                    </span>
                  </div>
                  <div className="ed-meta-text">
                    <span>Date: {new Date(item.created_at).toLocaleDateString()}</span>
                    {item.condition && (
                      <span style={{ marginLeft: "8px", paddingLeft: "8px", borderLeft: "1px solid #e2e8f0" }}>
                        Cond: {item.condition}
                      </span>
                    )}
                  </div>
                </div>

                <div className={`ed-qty-display ${suffix}`}>
                  <span className="ed-qty-num">{isWithdrawal ? "-" : "+"}{Math.abs(item.quantity)}</span>
                  <span className="ed-qty-unit">{item.unit}</span>
                </div>

                {isWithdrawal && (
                  <button className={`btn-toggle-return ${r.open ? "open" : "closed"}`} onClick={() => toggleReturn(item.id)}>
                    {r.open
                      ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
                    }
                  </button>
                )}
              </div>

              {r.open && (
                <div className="ed-return-form">
                  <div className="ed-return-row">
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <label className="ed-form-label">Return Qty ({item.unit})</label>
                      <input className="ed-form-input" type="number" value={r.amount}
                        placeholder={`Max: ${Math.abs(item.quantity)}`}
                        onChange={e => setReturning(prev => ({ ...prev, [item.id]: { ...prev[item.id], amount: e.target.value } }))}
                      />
                    </div>
                    <button className="btn-submit-return" disabled={r.submitting} onClick={() => handleReturn(item)}>
                      {r.submitting ? "Processing..." : "Confirm Return"}
                    </button>
                  </div>
                  {r.msg && <p className={`ed-return-msg ${r.msg.startsWith("Max") || r.msg.startsWith("Enter") ? "err" : "ok"}`}>{r.msg}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
