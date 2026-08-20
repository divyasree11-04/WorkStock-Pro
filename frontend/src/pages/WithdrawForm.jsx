import { useState, useEffect } from "react";
import { api } from "../utils/api";
import { isSmsReadOnly, hasSmsWritePermission } from "../utils/auth";

export default function WithdrawForm({ scannedProductId, onBack }) {
  const [product, setProduct]     = useState(null);
  const [history, setHistory]     = useState([]);
  const [amount, setAmount]       = useState("");
  const [condition, setCondition] = useState("Good");
  const [category, setCategory]   = useState("Expendable");
  const [msg, setMsg]             = useState("");
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    if (!scannedProductId || isNaN(scannedProductId)) {
      console.warn("[WithdrawForm] invalid scannedProductId:", scannedProductId);
      return;
    }

    Promise.all([
      api.get(`/products/${scannedProductId}`),
      api.get(`/reports/transactions/${scannedProductId}`)
    ])
      .then(([prodRes, histRes]) => {
        setProduct(prodRes.data);
        setHistory(histRes.data);
      })
      .catch(err => console.error("Fetch error:", err));
  }, [scannedProductId]);

  const handleWithdraw = async () => {
    if (!hasSmsWritePermission("sms_withdrawal")) {
      alert("No permissions");
      return;
    }
    const qty = parseFloat(amount);
    if (!qty || qty <= 0) { setMsg(" Enter a valid amount."); return; }
    if (qty > parseFloat(product.quantity)) {
      setMsg(` Max available: ${product.quantity} ${product.unit}`); return;
    }
    if (product.is_machine && (product.net_out || 0) > 0) {
      setMsg(" Return existing tool first");
      return;
    }
    setSaving(true); setMsg("");
    try {
      await api.post("/stock-out", {
        productId: product.id, quantity: qty,
        condition, item_category: category,
      });
      setProduct(p => ({ 
        ...p, 
        quantity: parseFloat(p.quantity) - qty,
        net_out: parseFloat(p.net_out || 0) + qty
      }));
      setMsg(` ${qty} ${product.unit} withdrawn successfully!`);
      setAmount("");
      // Refresh history
      const h = await api.get(`/reports/transactions/${product.id}`);
      setHistory(h.data);
    } catch (err) {
      setMsg(" " + (err.response?.data?.message || err.response?.data?.error || err.message));
    } finally { setSaving(false); }
  };

  if (!product) return (
    <div style={{ padding: 40, textAlign: "center", color: "#aaa" }}> Loading product details...</div>
  );

  const stockColor = parseFloat(product.quantity) <= 0 ? "#dc2626"
    : parseFloat(product.quantity) <= 5 ? "#ea580c" : "#16a34a";

  const inputStyle = {
    background: '#f8fafc', border: '1.5px solid #e2e8f0', color: '#0f172a',
    borderRadius: 10, padding: '10px 14px', fontSize: 14, width: '100%',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const labelStyle = {
    fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase',
    letterSpacing: 1, display: 'block', marginBottom: 6,
  };

  return (
    <div style={{ maxWidth: 500, margin: "auto", padding: 20 }}>

      <button onClick={onBack || (() => window.history.back())}
        style={{ background: "#f1f5f9", color: "#64748b", border: "none", padding: "8px 16px", borderRadius: 8, cursor: "pointer", marginBottom: 20, fontWeight: 600 }}>
        ← Back to Scanner
      </button>

      <div style={{ background: "#ffffff", color: "#0f172a", padding: 28, borderRadius: 20, border: "1px solid #e2e8f0", boxShadow: "0 20px 40px -12px rgba(0,0,0,0.1)" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h1 style={{ margin: 0, textTransform: "uppercase", fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>{product.item_name}</h1>
          <div style={{ background: "#eff6ff", color: "#3b82f6", border: "1px solid #bfdbfe", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
            SKU: {String(product.id).padStart(4, "0")}
          </div>
        </div>
        {product.description && <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 20px" }}>{product.description}</p>}

        {/* Core Attributes Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0", marginBottom: 20 }}>
          {[
            { label: "MAKE",       value: product.make       || "N/A" },
            { label: "RACK NO.",   value: product.rack       || "N/A" },
            { label: "INCHARGE",   value: product.incharge   || "N/A" },
            { label: "UNIT PRICE", value: product.unit_price ? `₹${parseFloat(product.unit_price).toFixed(0)}` : "N/A" },
            { label: "LEAD TIME",  value: product.lead_time  ? `${product.lead_time} days` : "N/A" },
            { label: "UNIT",       value: product.unit       || "N/A" },
          ].map(({ label, value }) => (
            <div key={label}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 2 }}>{label}</span>
              <strong style={{ fontSize: 15, color: "#0f172a" }}>{value}</strong>
            </div>
          ))}
        </div>

        {/* Inventory Status */}
        <div style={{ textAlign: "center", marginBottom: 24, background: "#f8fafc", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Current Inventory</p>
          <h2 style={{ fontSize: 56, margin: "8px 0 0", color: stockColor, fontWeight: 800, lineHeight: 1 }}>
            {Math.abs(parseFloat(product.quantity))}
            <span style={{ fontSize: 18, marginLeft: 8, fontWeight: 400, color: "#64748b" }}>{product.unit}</span>
          </h2>
          {parseFloat(product.quantity) <= 0 && (
            <span style={{ background: "#fee2e2", color: "#dc2626", fontSize: 12, padding: "4px 12px", borderRadius: 8, fontWeight: 700, marginTop: 12, display: "inline-block", textTransform: "uppercase" }}>
              Out of Stock
            </span>
          )}
        </div>

        {/* Activity Feed */}
        <div style={{ marginBottom: 24 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>
             Recent Activity
          </h4>
          {history.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: 13, margin: 0, textAlign: "center", padding: 10 }}>No transaction history yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {history.slice(0, 3).map((h, i) => (
                <div key={i} style={{
                  background: "#f8fafc", borderRadius: 10, padding: "12px 16px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  border: "1px solid #e2e8f0"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 4,
                      background: h.type === "OUT" ? "#ffe4e6" : "#dcfce7",
                      color: h.type === "OUT" ? "#e11d48" : "#16a34a"
                    }}>{h.type}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>
                      {h.name || h.employee_id_code || "Employee"}
                    </span>
                    {h.condition && <span style={{ fontSize: 12, color: "#94a3b8" }}>· {h.condition}</span>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: h.type === "OUT" ? "#e11d48" : "#16a34a" }}>
                      {h.type === "OUT" ? "−" : "+"}{Math.abs(h.quantity)} {product.unit}
                    </span>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                      {new Date(h.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Transaction Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {product.is_machine && (product.net_out || 0) > 0 && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 10,
              padding: '12px 16px', color: '#dc2626', fontWeight: 600, fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 8
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Return existing tool first ({product.net_out} unit{(product.net_out > 1) ? 's' : ''} outstanding)
            </div>
          )}

          <div>
            <label style={labelStyle}>Withdrawal Amount ({product.unit})</label>
            <input type="number" step="0.01" min="0.01" value={amount}
              disabled={product.is_machine && (product.net_out || 0) > 0}
              onChange={e => setAmount(e.target.value)}
              placeholder={product.is_machine && (product.net_out || 0) > 0 ? "Withdrawal blocked" : `Max: ${product.quantity} ${product.unit}`}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Condition</label>
              <select value={condition} disabled={product.is_machine && (product.net_out || 0) > 0} onChange={e => setCondition(e.target.value)} style={inputStyle}>
                <option value="Good">Good Condition</option>
                <option value="Bad">Bad Condition</option>
                <option value="New">New</option>
                <option value="Used">Used</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={category} disabled={product.is_machine && (product.net_out || 0) > 0} onChange={e => setCategory(e.target.value)} style={inputStyle}>
                <option value="Expendable">Expendable</option>
                <option value="Returnable">Returnable</option>
                <option value="Deposited">Deposited</option>
              </select>
            </div>
          </div>

          {msg && (
            <p style={{ textAlign: "center", fontWeight: 700, fontSize: 14, margin: 0,
              color: msg.includes("successfully") ? "#16a34a" : "#dc2626" }}>
              {msg}
            </p>
          )}

          <button onClick={handleWithdraw}
            disabled={saving || parseFloat(product.quantity) <= 0 || (product.is_machine && (product.net_out || 0) > 0)}
            style={{
               width: "100%", padding: "14px", borderRadius: 12, border: "none",
               background: saving || parseFloat(product.quantity) <= 0 || (product.is_machine && (product.net_out || 0) > 0) ? "#cbd5e1" : "#e11d48",
               color: "white", fontWeight: 800, fontSize: 16,
               cursor: saving || parseFloat(product.quantity) <= 0 || (product.is_machine && (product.net_out || 0) > 0) ? "not-allowed" : "pointer",
               transition: "all 0.2s ease",
               marginTop: 8
            }}>
            {saving ? "Processing..." : parseFloat(product.quantity) <= 0 ? "OUT OF STOCK" : (product.is_machine && (product.net_out || 0) > 0) ? "WITHDRAWAL BLOCKED (RETURN TOOL)" : "✕ Confirm Withdrawal (-)"}
          </button>
        </div>
      </div>
    </div>
  );
}
