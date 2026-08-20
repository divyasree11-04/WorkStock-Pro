import { useState } from "react";
import { api } from "../utils/api";

export default function ProductCard({ product, refresh }) {
  const [showReturn, setShowReturn] = useState(false);
  const [returnQty, setReturnQty]   = useState(1);
  const [remarks, setRemarks]       = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [success, setSuccess]       = useState("");

  // net outstanding = total withdrawn - already returned (backend enforces this too)
  const outstanding = parseFloat(product.net_out ?? product.quantity ?? 0);

  const handleReturn = async () => {
    setError("");
    setSuccess("");

    const qty = parseFloat(returnQty);
    if (!qty || qty <= 0) { setError("Enter a valid quantity."); return; }
    if (qty > outstanding)  { setError(`You only have ${outstanding} units outstanding.`); return; }

    setLoading(true);
    try {
      await api.post("/return", {
        productId: product.id,
        quantity:  qty,
        remarks:   remarks.trim() || "Item returned",
      });
      setSuccess(`${qty} unit(s) returned successfully.`);
      setReturnQty(1);
      setRemarks("");
      setTimeout(() => {
        setSuccess("");
        setShowReturn(false);
        refresh();
      }, 1800);
    } catch (err) {
      setError(err.response?.data?.message || "Return failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
      padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10,
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
    }}>
      {/* Product Info */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>
            {product.item_name || product.name}
          </div>
          {product.item_code && (
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              {product.item_code}
            </div>
          )}
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20,
          background: outstanding > 0 ? "#fef9c3" : "#f0fdf4",
          color:      outstanding > 0 ? "#854d0e" : "#166534",
          border: `1px solid ${outstanding > 0 ? "#fde68a" : "#bbf7d0"}`
        }}>
          {outstanding > 0 ? `${outstanding} out` : "All returned"}
        </span>
      </div>

      <div style={{ fontSize: 13, color: "#64748b", display: "flex", gap: 16 }}>
        <span>Stock: <strong style={{ color: "#1e293b" }}>{product.quantity}</strong></span>
        {product.unit && <span>Unit: <strong>{product.unit}</strong></span>}
      </div>

      {/* Return button */}
      {outstanding > 0 && !showReturn && (
        <button
          onClick={() => setShowReturn(true)}
          style={{
            marginTop: 4, padding: "8px 0", borderRadius: 8, border: "1.5px solid #f59e0b",
            background: "#fffbeb", color: "#92400e", fontWeight: 700, fontSize: 13,
            cursor: "pointer"
          }}
        >
           Return Item
        </button>
      )}

      {/* Return form */}
      {showReturn && (
        <div style={{
          marginTop: 4, padding: "14px", background: "#f8fafc",
          borderRadius: 10, border: "1px solid #e2e8f0",
          display: "flex", flexDirection: "column", gap: 10
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
            Return — up to <span style={{ color: "#f59e0b" }}>{outstanding}</span> units
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>Qty</label>
            <input
              type="number" min={1} max={outstanding} value={returnQty}
              onChange={e => setReturnQty(e.target.value)}
              style={{
                width: 70, padding: "6px 10px", borderRadius: 7,
                border: "1px solid #cbd5e1", fontSize: 14, fontWeight: 600, textAlign: "center"
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>Remarks</label>
            <input
              type="text" placeholder="Optional reason…" value={remarks}
              onChange={e => setRemarks(e.target.value)}
              style={{
                flex: 1, padding: "6px 10px", borderRadius: 7,
                border: "1px solid #cbd5e1", fontSize: 13
              }}
            />
          </div>

          {error   && <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}> {error}</div>}
          {success && <div style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}> {success}</div>}

          <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
            <button
              onClick={handleReturn} disabled={loading}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                background: loading ? "#94a3b8" : "#10b981",
                color: "#fff", fontWeight: 700, fontSize: 13,
                cursor: loading ? "not-allowed" : "pointer"
              }}
            >
              {loading ? "Returning…" : "Confirm Return"}
            </button>
            <button
              onClick={() => { setShowReturn(false); setError(""); setRemarks(""); setReturnQty(1); }}
              style={{
                padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0",
                background: "#fff", color: "#64748b", fontWeight: 600, fontSize: 13, cursor: "pointer"
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
