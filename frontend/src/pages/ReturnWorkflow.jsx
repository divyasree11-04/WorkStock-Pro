import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Scanner } from "@yudiel/react-qr-scanner";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../utils/api";
import { isSmsReadOnly, hasSmsWritePermission } from "../utils/auth";
import "../styles/WithdrawWorkflow.css";
import "../styles/ReturnWorkflow.css";

export default function ReturnWorkflow() {
  const { id: urlId } = useParams();
  const location = useLocation();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [manualId, setManualId] = useState("");  // ✅ THIS WAS MISSING

  const [panel, setPanel] = useState(null);
  const [panelHistory, setPanelHistory] = useState([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelForm, setPanelForm] = useState({ amount: "", condition: "Good", remarks: "" });
  const [panelMsg, setPanelMsg] = useState(null);
  const [panelSaving, setPanelSaving] = useState(false);

  const hasScanned = useRef(false);

  useEffect(() => { fetchProducts(); }, []);

  useEffect(() => {
    const isScan = new URLSearchParams(location.search).get("scan") === "true";
    if (isScan) setTimeout(startScanner, 100);
  }, [location.search]);

  useEffect(() => {
    if (urlId && !isNaN(parseInt(urlId))) openPanel(parseInt(urlId));
  }, [urlId]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await api.get("/products");
      // ✅ Guard against the API returning a non-array (e.g. an error object)
      setProducts(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setProducts([]);
    }
    finally { setLoading(false); }
  };

  const openPanel = async (id) => {
    if (!id || isNaN(id)) {
      console.warn("[ReturnWorkflow] openPanel called with invalid id:", id);
      return;
    }
    setPanelLoading(true); setPanel(null); setPanelHistory([]);
    setPanelMsg(null); setPanelForm({ amount: "", condition: "Good", remarks: "" });
    try {
      const [pR, hR] = await Promise.all([
        api.get(`/products/${id}`),
        api.get(`/reports/transactions/${id}`)
      ]);
      setPanel(pR.data);
      // ✅ Guard here too — panelHistory is used with .length and .slice() below
      setPanelHistory(Array.isArray(hR.data) ? hR.data : []);
    } catch { alert("Product not found."); }
    finally { setPanelLoading(false); }
  };

  const closePanel = () => {
    setPanel(null); setPanelHistory([]); setPanelMsg(null);
    hasScanned.current = false;
  };

  const startScanner = () => {
    setCameraError(""); hasScanned.current = false;
    setManualId(""); setScanning(true);
  };

  const handleScanResult = (results) => {
    if (hasScanned.current || !results?.[0]?.rawValue) return;
    const raw = results[0].rawValue;
    hasScanned.current = true; setScanning(false);
    let id = null;
    const parts = raw.split("/");
    const last = parseInt(parts[parts.length - 1]);
    if (!isNaN(last) && last > 0) id = last;
    if (id > 0) openPanel(id);
  };

  const handleScanError = (err) => {
    setScanning(false);
    setCameraError("Camera unavailable. Please enter Product ID manually below.");
  };

  const handleManualId = () => {
    const id = parseInt(manualId);
    if (!isNaN(id) && id > 0) {
      setScanning(false);
      setManualId("");
      openPanel(id);
    }
  };

  const handlePanelReturn = async () => {
    if (!hasSmsWritePermission("sms_withdrawal")) {
      alert("No permissions");
      return;
    }
    const qty = parseFloat(panelForm.amount);
    if (!qty || qty <= 0) { setPanelMsg({ type: "err", text: "Enter a valid amount." }); return; }
    if (qty > (panel.net_out || 0)) {
      setPanelMsg({ type: "err", text: `Cannot return more than outstanding: ${panel.net_out || 0} ${panel.unit}` });
      return;
    }
    setPanelSaving(true);
    try {
      await api.post("/return", {
        productId: panel.id,
        quantity: qty,
        remarks: panelForm.remarks || "Item returned to store"
      });
      setPanel(p => ({
        ...p,
        quantity: parseFloat(p.quantity) + qty,
        net_out: Math.max(0, parseFloat(p.net_out || 0) - qty)
      }));
      setPanelMsg({ type: "ok", text: "Return successful!" });
      setPanelForm(prev => ({ ...prev, amount: "" }));
      const h = await api.get(`/reports/transactions/${panel.id}`);
      // ✅ Guard here too — same reason as above
      setPanelHistory(Array.isArray(h.data) ? h.data : []);
      fetchProducts();
    } catch (err) {
      setPanelMsg({ type: "err", text: err.response?.data?.message || "Error processing return." });
    } finally { setPanelSaving(false); }
  };

  const filtered = (Array.isArray(products) ? products : []).filter(p =>
    p.item_name?.toLowerCase().includes(search.toLowerCase())
  );
  const scClass = (qty) => { const q = parseFloat(qty); if (q <= 0) return "r"; if (q <= 5) return "o"; return "g"; };
  const qrUrl = (p) => {
    const token = localStorage.getItem("token");
    return `${window.location.origin}/return/${p.id}?token=${token}`;
  };

  if (loading) return <div className="ww-container"><h3>Initializing Inventory...</h3></div>;

  return (
    <div className="ww-container">
      <div className="ww-hdr">
        <h2>Stock Return</h2>
        <div className="ww-hdr-right">
        
          <input
            className="ww-search"
            type="text"
            placeholder="Search inventory..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Detail Panel ── */}
      {(panel || panelLoading) && (
        <div className="ww-detail-backdrop" onClick={e => e.target === e.currentTarget && closePanel()}>
          <div className="ww-detail-panel" style={{ borderTop: '5px solid #ef6c00' }}>
            <button
              className="ww-panel-close"
              onClick={closePanel}
              style={{ position: 'absolute', right: 20, top: 20, background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: 20 }}
            >×</button>

            {panelLoading ? <p>Loading Data...</p> : (
              <>
                <div className="ww-sku">SKU #00{panel.id}</div>
                <h2 className="ww-panel-name">{panel.item_name}</h2>
                <p style={{ color: '#94a3b8', fontSize: 14 }}>{panel.description}</p>

                <div className="ww-grid2">
                  <div className="ww-field"><label>Make</label><strong>{panel.make || 'Generic'}</strong></div>
                  <div className="ww-field"><label>Location</label><strong>Rack {panel.rack || 'A1'}</strong></div>
                  <div className="ww-field"><label>Date Added</label><strong>{panel.created_at ? new Date(panel.created_at).toLocaleDateString() : 'N/A'}</strong></div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '20px' }}>
                  <div style={{ padding: '12px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ color: '#10b981', fontSize: '28px', fontWeight: '800', lineHeight: '1.2' }}>{panel.quantity}</div>
                    <div style={{ textTransform: 'uppercase', fontSize: '9px', letterSpacing: '1px', fontWeight: '700', color: '#64748b', marginTop: '4px' }}>Store Stock ({panel.unit})</div>
                  </div>
                  <div style={{ padding: '12px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ color: '#ef6c00', fontSize: '28px', fontWeight: '800', lineHeight: '1.2' }}>{panel.net_out || 0}</div>
                    <div style={{ textTransform: 'uppercase', fontSize: '9px', letterSpacing: '1px', fontWeight: '700', color: '#64748b', marginTop: '4px' }}>Your Outstanding ({panel.unit})</div>
                  </div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <label className="ww-form-label" style={{ color: 'var(--text-main)' }}>Amount to Return ({panel.unit})</label>
                  <input
                    type="number"
                    className="ww-pinput"
                    min="0.01" step="0.01"
                    value={panelForm.amount}
                    onChange={e => setPanelForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder={`Max: ${panel.net_out || 0}`}
                  />

                  <label className="ww-form-label" style={{ color: 'var(--text-main)', marginTop: 15 }}>Return Remarks</label>
                  <textarea
                    className="ww-pinput"
                    style={{ height: 60 }}
                    value={panelForm.remarks}
                    onChange={e => setPanelForm(f => ({ ...f, remarks: e.target.value }))}
                    placeholder="e.g. Returned after project completion..."
                  />

                  <button
                    className="btn-big-wd"
                    style={{ marginTop: 20, background: '#ef6c00' }}
                    onClick={handlePanelReturn}
                    disabled={panelSaving || !(panel.net_out > 0)}
                  >
                    {panelSaving ? "Processing..." : !(panel.net_out > 0) ? "NO OUTSTANDING UNITS" : "Confirm Return ↩"}
                  </button>

                  {panelMsg && (
                    <p style={{ color: panelMsg.type === 'ok' ? '#10b981' : '#ef4444', textAlign: 'center', marginTop: 15, fontWeight: 'bold' }}>
                      {panelMsg.text}
                    </p>
                  )}
                </div>

                <div style={{ marginTop: 24 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
                    Recent Activity
                  </h4>
                  {panelHistory.length === 0 ? (
                    <p style={{ color: '#94a3b8', fontSize: 13, margin: 0, textAlign: 'center', padding: 10 }}>No transaction history yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {panelHistory.slice(0, 3).map((h, i) => (
                        <div key={i} style={{
                          background: '#f8fafc', borderRadius: 10, padding: '12px 16px',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          border: '1px solid #e2e8f0',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4,
                              background: h.type === 'OUT' ? '#ffe4e6' : h.type === 'RETURN' ? '#fff3e0' : '#dcfce7',
                              color: h.type === 'OUT' ? '#e11d48' : h.type === 'RETURN' ? '#ef6c00' : '#16a34a',
                            }}>{h.type}</span>
                            <span style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>
                              {h.name || h.employee_id_code || 'User'}
                            </span>
                            {h.condition && <span style={{ fontSize: 12, color: '#94a3b8' }}>· {h.condition}</span>}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{
                              fontSize: 14, fontWeight: 700,
                              color: h.type === 'OUT' ? '#e11d48' : h.type === 'RETURN' ? '#ef6c00' : '#16a34a',
                            }}>
                              {h.type === 'OUT' ? '-' : '+'}{Math.abs(h.quantity)} {h.unit || panel.unit || 'pcs'}
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(h.created_at).toLocaleString()}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Scanner Modal ── */}
      {scanning && (
        <div className="ww-detail-backdrop">
          <div style={{ background: '#fff', padding: 24, borderRadius: 20, width: 400, maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Scan Product QR</h3>

            <Scanner onScan={handleScanResult} onError={handleScanError} />

            {cameraError && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 8,
                padding: '10px 14px', color: '#dc2626', fontSize: 13, fontWeight: 600,
                marginTop: 12, display: 'flex', alignItems: 'center', gap: 6
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {cameraError}
              </div>
            )}

            {/* Manual ID entry */}
            <div style={{ marginTop: 20, marginBottom: 16 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#64748b',
                textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8
              }}>
                OR ENTER PRODUCT ID MANUALLY
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="number"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  placeholder="Enter Product ID"
                  onKeyDown={(e) => { if (e.key === 'Enter' && manualId) handleManualId(); }}
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: 8,
                    border: '1.5px solid #e2e8f0', fontSize: 14,
                    outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <button
                  type="button"
                  onClick={handleManualId}
                  disabled={!manualId}
                  style={{
                    background: manualId ? '#ef6c00' : '#cbd5e1',
                    color: '#fff', border: 'none',
                    padding: '10px 18px', borderRadius: 8,
                    fontWeight: 700, fontSize: 14,
                    cursor: manualId ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit',
                    transition: 'background 0.15s',
                  }}
                >
                  Go
                </button>
              </div>
            </div>

            <button
              className="btn-big-wd"
              style={{ background: '#0f172a', marginTop: 4 }}
              onClick={() => setScanning(false)}
            >
              Close Scanner
            </button>
          </div>
        </div>
      )}

      {/* ── Product List ── */}
      <div className="ww-list">
        {filtered.map(p => (
          <div key={p.id} className={`ww-row ${scClass(p.quantity)}`}>
            <div className="ww-row-top">
              <div className="ww-info">
                <h3 className="ww-name">{p.item_name}</h3>
                <div className="ww-meta">Location: Rack {p.rack} | EmpID & Name: {p.incharge}</div>
                <div className={`ww-stock ${scClass(p.quantity)}`}>Stock: {p.quantity} {p.unit}</div>
                <button
                  className="btn-wd"
                  onClick={() => openPanel(p.id)}
                >
                  View & Return
                </button>
              </div>
              <div className="ww-qr-wrap" onClick={() => openPanel(p.id)} style={{ cursor: 'pointer' }}>
                <QRCodeSVG value={qrUrl(p)} size={80} />
                <p>Product ID: {p.id}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
