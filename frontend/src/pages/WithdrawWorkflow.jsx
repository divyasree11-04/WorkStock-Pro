
import { useState, useEffect, useRef } from "react";

import { useParams, useLocation } from "react-router-dom";

import { Scanner } from "@yudiel/react-qr-scanner";

import { QRCodeSVG } from "qrcode.react";

import { api } from "../utils/api";
import { isSmsReadOnly, hasSmsWritePermission } from "../utils/auth";
import "../styles/WithdrawWorkflow.css";

// Strip the raw ISO suffix (T00:00:00.000Z) from PostgreSQL DATE fields
const formatDate = (val) => {
  if (!val) return '—';
  const d = val.includes('T') ? val.split('T')[0] : val; // "2026-09-12"
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`; // "12-09-2026"
};


export default function WithdrawWorkflow() {

  const { id: urlId } = useParams();
  const location = useLocation();

  const [products, setProducts] = useState([]);

  const [employees, setEmployees] = useState([]);

  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");

  const [scanning, setScanning] = useState(false);

  const [cameraError, setCameraError] = useState("");

  const [manualId, setManualId] = useState("");



  const [panel, setPanel] = useState(null);

  const [panelHistory, setPanelHistory] = useState([]);
  const [panelBatches, setPanelBatches] = useState([]);

  const [panelLoading, setPanelLoading] = useState(false);

  const [panelForm, setPanelForm] = useState({ amount: "", condition: "Good", category: "Expendable", remarks: "", autoBatch: true, batch_id: "", employee_display: "", employee_user_id: "", employee_uav_id: "", employee_name: "" });

  const [panelMsg, setPanelMsg] = useState(null);

  const [panelSaving, setPanelSaving] = useState(false);



  const [expanded, setExpanded] = useState({});

  const [rowForm, setRowForm] = useState({});

  const hasScanned = useRef(false);



  useEffect(() => { fetchProducts(); fetchEmployees(); }, []);

  useEffect(() => {
    const isScan = new URLSearchParams(location.search).get("scan") === "true";
    if (isScan) {
      setTimeout(startScanner, 100);
    }
  }, [location.search]);



  useEffect(() => {

    if (urlId && !isNaN(parseInt(urlId))) openPanel(parseInt(urlId));

  }, [urlId]);



  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await api.get("/products");
      const dataList = Array.isArray(res.data) ? res.data : [];
      setProducts(dataList);
      const init = {};
      dataList.forEach(p => { init[p.id] = { amount: "", condition: "Good", category: "Expendable", msg: null, saving: false }; });
      setRowForm(init);
    } catch (err) { console.error(err); setProducts([]); }
    finally { setLoading(false); }
  };



  const fetchEmployees = async () => {

    try {

      const res = await api.get("/employees/list");

      if (Array.isArray(res.data)) setEmployees(res.data);

    } catch (err) { console.error("Error loading employees:", err); }

  };



  const openPanel = async (id) => {

    if (!id || isNaN(id)) {
      console.warn("[WithdrawWorkflow] openPanel called with invalid id:", id);
      return;
    }

    setPanelLoading(true); setPanel(null); setPanelHistory([]);

    setPanelMsg(null); setPanelForm({ amount: "", condition: "Good", category: "Expendable", remarks: "", autoBatch: true, batch_id: "", employee_display: "", employee_user_id: "", employee_uav_id: "", employee_name: "" });

    try {

      const [pR, hR, bR] = await Promise.all([

        api.get(`/products/${id}`),

        api.get(`/reports/transactions/${id}`),

        api.get(`/stock/${id}/batches`)

      ]);

      setPanel(pR.data);
      setPanelHistory(Array.isArray(hR.data) ? hR.data : []);
      setPanelBatches(Array.isArray(bR.data) ? bR.data : []);

    } catch { alert("Product not found."); }

    finally { setPanelLoading(false); }

  };



  const closePanel = () => { setPanel(null); setPanelHistory([]); setPanelBatches([]); setPanelMsg(null); hasScanned.current = false; };



  const startScanner = () => { setCameraError(""); hasScanned.current = false; setScanning(true); };



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

    setCameraError("Camera unavailable. Please enter ID manually.");

  };

  const handleManualId = () => {
    const id = parseInt(manualId);
    if (!isNaN(id) && id > 0) {
      setScanning(false);
      openPanel(id);
    }
  };



  const handlePanelWithdraw = async () => {

    const qty = parseFloat(panelForm.amount);

    if (!hasSmsWritePermission("sms_withdrawal")) {
      alert("No permissions");
      return;
    }

    if (!qty || qty <= 0) { setPanelMsg({ type: "err", text: "Enter a valid amount." }); return; }

    if (panel.is_machine && (panel.net_out || 0) > 0) {

      setPanelMsg({ type: "err", text: "Return existing tool first" });

      return;

    }

    if (!panelForm.showFifo && !panelForm.batch_id) {

      setPanelMsg({ type: "err", text: "Select a batch to withdraw from." });

      return;

    }

    if (!panelForm.employee_user_id) {

      setPanelMsg({ type: "err", text: "Select who this stock is being released to." });

      return;

    }

    setPanelSaving(true);

    try {

      await api.post("/stock-out", {

        productId: panel.id,

        quantity: qty,

        condition: panelForm.condition,

        item_category: panelForm.category,

        remarks: panelForm.remarks,

        batch_id: panelForm.showFifo ? null : panelForm.batch_id,

        employee_user_id: panelForm.employee_user_id,

        employee_uav_id: panelForm.employee_uav_id,

        employee_name: panelForm.employee_name,

      });

      setPanel(p => ({

        ...p,

        quantity: parseFloat(p.quantity) - qty,

        net_out: parseFloat(p.net_out || 0) + qty

      }));

      setPanelMsg({ type: "ok", text: "Withdrawal successful!" });

      setPanelForm(prev => ({ ...prev, amount: "" }));

      const h = await api.get(`/reports/transactions/${panel.id}`);
      setPanelHistory(Array.isArray(h.data) ? h.data : []); fetchProducts();
    } catch (err) { setPanelMsg({ type: "err", text: err.response?.data?.message || "Error processing withdrawal." }); }
    finally { setPanelSaving(false); }
  };

  const toggleRow = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  const setRF = (id, f, v) => setRowForm(prev => ({ ...prev, [id]: { ...prev[id], [f]: v } }));

  const handleRowWithdraw = async (product) => {
    const f = rowForm[product.id];
    const qty = parseFloat(f.amount);
    if (!qty || qty <= 0) return;
    setRF(product.id, "saving", true);
    try {
      await api.post("/stock-out", { productId: product.id, quantity: qty, condition: f.condition, item_category: f.category });
      setProducts(prev => (Array.isArray(prev) ? prev : []).map(p => p.id === product.id ? { ...p, quantity: parseFloat(p.quantity) - qty } : p));
      setRF(product.id, "msg", { type: "ok", text: "Withdrawn!" });
      setTimeout(() => { setExpanded(prev => ({ ...prev, [product.id]: false })); fetchProducts(); }, 1500);
    } catch (err) { setRF(product.id, "msg", { type: "err", text: err.response?.data?.message || "Failed" }); }
    finally { setRF(product.id, "saving", false); }
  };

  const filtered = (Array.isArray(products) ? products : []).filter(p => p.item_name?.toLowerCase().includes(search.toLowerCase()));

  const scClass = (qty) => { const q = parseFloat(qty); if (q <= 0) return "r"; if (q <= 5) return "o"; return "g"; };

  const qrUrl = (p) => {

    const token = localStorage.getItem("token");

    return `${window.location.origin}/withdraw/${p.id}?token=${token}`;

  };



  const inputStyle = {

    background: '#f8fafc', border: '1.5px solid #e2e8f0', color: '#0f172a',

    borderRadius: 10, padding: '10px 14px', fontSize: 14, width: '100%',

    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',

  };

  const labelStyle = {

    fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase',

    letterSpacing: 1, display: 'block', marginBottom: 6,

  };



  if (loading) return <div className="ww-container"><h3>Initializing Inventory...</h3></div>;



  return (

    <div className="ww-container">

      <div className="ww-hdr">

        <h2>Stock Withdrawal</h2>

        <div className="ww-hdr-right">



          <input className="ww-search" type="text" placeholder="Search inventory..." value={search} onChange={e => setSearch(e.target.value)} />

        </div>

      </div>



      {/* ── Light-themed detail panel ── */}

      {(panel || panelLoading) && (

        <div className="ww-detail-backdrop" onClick={e => e.target === e.currentTarget && closePanel()}>

          <div style={{

            background: '#ffffff', color: '#0f172a', borderRadius: 20, padding: 28,

            width: 440, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',

            boxShadow: '0 25px 60px -12px rgba(0,0,0,0.18)', border: '1px solid #e2e8f0',

            position: 'relative',

          }}>

            <button onClick={closePanel} style={{

              position: 'absolute', top: 16, right: 16,

              background: '#f1f5f9', border: 'none', borderRadius: 8,

              width: 32, height: 32, cursor: 'pointer', fontWeight: 700,

              color: '#64748b', fontSize: 18, display: 'flex',

              alignItems: 'center', justifyContent: 'center', lineHeight: 1,

            }}>×</button>



            {panelLoading ? (

              <p style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>Loading Data...</p>

            ) : (

              <>

                <div style={{

                  display: 'inline-block', fontSize: 11, fontWeight: 700,

                  color: '#3b82f6', background: '#eff6ff', border: '1px solid #bfdbfe',

                  borderRadius: 6, padding: '3px 10px', marginBottom: 10, letterSpacing: 1,

                }}>SKU: #00{panel.id}</div>



                <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0f172a', paddingRight: 36 }}>

                  {panel.item_name}

                </h2>

                <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 20px' }}>

                  {panel.description || 'Initial stock item'}

                </p>



                {/* Details grid */}

                <div style={{

                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,

                  background: '#f8fafc', borderRadius: 12, padding: 16,

                  border: '1px solid #e2e8f0', marginBottom: 16,

                }}>

                  {[

                    { label: 'MAKE', val: panel.make || 'N/A' },

                    { label: 'RACK NO.', val: panel.rack || 'N/A' },

                    { label: 'INCHARGE', val: panel.incharge || 'N/A' },

                    { label: 'UNIT PRICE', val: `₹${parseFloat(panel.unit_price || 0).toFixed(0)}` },

                    { label: 'LEAD TIME', val: panel.lead_time ? `${panel.lead_time} days` : 'N/A' },

                    { label: 'UNIT', val: panel.unit || panel.uom || 'pcs' },

                    { label: 'DATE ADDED', val: panel.created_at ? new Date(panel.created_at).toLocaleDateString() : 'N/A' },

                  ].map(({ label, val }) => (

                    <div key={label}>

                      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>{label}</div>

                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{val}</div>

                    </div>

                  ))}

                </div>



                {/* Current inventory */}

                <div style={{

                  background: '#f8fafc', borderRadius: 12, padding: '14px 16px',

                  textAlign: 'center', marginBottom: 16, border: '1px solid #e2e8f0',

                }}>

                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Current Inventory</div>

                  <div style={{

                    fontSize: 52, fontWeight: 800, lineHeight: 1,

                    color: parseFloat(panel.quantity) > 5 ? '#16a34a' : '#dc2626',

                  }}>{Math.abs(parseFloat(panel.quantity))}</div>

                  <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>{panel.unit || panel.uom || 'pcs'}</div>

                </div>



                {/* Item history */}

                {panelHistory.length > 0 && (

                  <div style={{ marginBottom: 20 }}>

                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>

                      Item History

                    </div>

                    {panelHistory.slice(0, 3).map((h, i) => (

                      <div key={i} style={{

                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',

                        padding: '10px 14px', borderRadius: 10, marginBottom: 6,

                        background: '#f8fafc', border: '1px solid #e2e8f0',

                      }}>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

                          <span style={{

                            fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4,

                            background: h.type === 'OUT' ? '#ffe4e6' : '#dcfce7',

                            color: h.type === 'OUT' ? '#e11d48' : '#16a34a',

                          }}>{h.type}</span>

                          <span style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>

                            {h.name || h.employee_id_code || 'User'}

                          </span>

                          {h.condition && <span style={{ fontSize: 12, color: '#94a3b8' }}>· {h.condition}</span>}

                        </div>

                        <div style={{ textAlign: 'right' }}>

                          <div style={{

                            fontSize: 14, fontWeight: 700,

                            color: h.type === 'OUT' ? '#e11d48' : '#16a34a',

                          }}>

                            {h.type === 'OUT' ? '-' : '+'}{Math.abs(h.quantity)} {h.unit || panel.unit || 'pcs'}

                          </div>

                          <div style={{ fontSize: 11, color: '#94a3b8' }}>

                            {new Date(h.created_at).toLocaleString()}

                          </div>

                        </div>

                      </div>

                    ))}

                  </div>

                )}



                {/* Form fields */}

                {panel.is_machine && (panel.net_out || 0) > 0 && (

                  <div style={{

                    background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 10,

                    padding: '12px 16px', color: '#dc2626', fontWeight: 600, fontSize: 13,

                    marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8

                  }}>

                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>

                    Return existing tool first ({panel.net_out} unit{(panel.net_out > 1) ? 's' : ''} outstanding)

                  </div>

                )}



                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', padding: '8px 12px', borderRadius: 8, border: '1px solid #bbf7d0', cursor: 'pointer' }}
                    onClick={() => setPanelForm(f => ({ ...f, showFifo: !f.showFifo, batch_id: "" }))}>
                    <input
                      type="checkbox"
                      id="showFifoBatches"
                      checked={!!panelForm.showFifo}
                      onChange={() => { }}
                      style={{ cursor: 'pointer', width: 15, height: 15, accentColor: '#15803d' }}
                    />
                    <label htmlFor="showFifoBatches" style={{ fontSize: 13, fontWeight: 600, color: '#15803d', cursor: 'pointer', margin: 0 }}>
                      Auto-select Batch
                    </label>
                  </div>

                  {!panelForm.showFifo && (() => {
                    const activeBatches = [...panelBatches]
                      .filter(b => parseFloat(b.remaining_qty) > 0)
                      .sort((a, b) => new Date(a.in_date) - new Date(b.in_date));
                    return (
                      <div style={{ marginTop: 8 }}>
                        <label style={labelStyle}>Select Batch</label>
                        {activeBatches.length === 0 ? (
                          <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 0 4px' }}>No active batches found.</p>
                        ) : (
                          <select
                            value={panelForm.batch_id}
                            disabled={panel.is_machine && (panel.net_out || 0) > 0}
                            onChange={e => setPanelForm(f => ({ ...f, batch_id: e.target.value }))}
                            style={inputStyle}
                          >
                            <option value="">-- Choose a batch --</option>
                            {activeBatches.map(b => (
                              <option key={b.id} value={b.id}>
                                {(b.batch_no || `#${b.id}`)} — In: {formatDate(b.in_date)} — Available: {b.remaining_qty} {panel.unit || panel.uom || 'pcs'}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })()}

                  {panelForm.showFifo && (() => {
                    const fifoSorted = [...panelBatches]
                      .filter(b => parseFloat(b.remaining_qty) > 0)
                      .sort((a, b) => new Date(a.in_date) - new Date(b.in_date));
                    return fifoSorted.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#94a3b8', margin: '8px 0 0 4px' }}>No active batches found.</p>
                    ) : (
                      <div style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', border: '1px solid #d1fae5' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: '#d1fae5', color: '#065f46' }}>
                              <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700 }}>#</th>
                              <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700 }}>Batch</th>
                              <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700 }}>In Date</th>
                              <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>Available</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fifoSorted.map((b, i) => (
                              <tr key={b.id} style={{ background: i === 0 ? '#f0fdf4' : '#fff', borderTop: '1px solid #d1fae5' }}>
                                <td style={{ padding: '6px 10px', color: i === 0 ? '#15803d' : '#64748b', fontWeight: i === 0 ? 700 : 400 }}>
                                  {i === 0 ? '▶' : i + 1}
                                </td>
                                <td style={{ padding: '6px 10px', fontWeight: i === 0 ? 700 : 400, color: i === 0 ? '#15803d' : '#334155' }}>
                                  {b.batch_no || `#${b.id}`}{i === 0 && <span style={{ marginLeft: 6, fontSize: 10, background: '#15803d', color: '#fff', borderRadius: 4, padding: '1px 5px' }}>NEXT</span>}
                                </td>
                                <td style={{ padding: '6px 10px', color: '#64748b' }}>{formatDate(b.in_date)}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: i === 0 ? '#15803d' : '#334155' }}>
                                  {b.remaining_qty} {panel.unit || panel.uom || 'pcs'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>



                <div style={{ marginBottom: 12 }}>

                  <label style={labelStyle}>Release To (Employee)</label>

                  <input
                    list="ww-employee-options"
                    value={panelForm.employee_display}
                    disabled={panel.is_machine && (panel.net_out || 0) > 0}
                    onChange={e => {
                      const val = e.target.value;
                      const match = employees.find(
                        emp => `${emp.employee_uav_id} — ${emp.fullname}` === val
                      );
                      setPanelForm(f => ({
                        ...f,
                        employee_display: val,
                        employee_user_id: match ? (match.id || match.user_id) : "",
                        employee_uav_id: match ? match.employee_uav_id : "",
                        employee_name: match ? match.fullname : "",
                      }));
                    }}
                    placeholder="Search employee ID or name…"
                    style={inputStyle}
                  />
                  <datalist id="ww-employee-options">
                    {employees.map(emp => (
                      <option key={emp.id || emp.user_id} value={`${emp.employee_uav_id} — ${emp.fullname}`} />
                    ))}
                  </datalist>
                  {panelForm.employee_user_id && (
                    <p style={{ fontSize: 12, color: '#16a34a', marginTop: 6, marginBottom: 0 }}>
                      ✓ {panelForm.employee_uav_id} — {panelForm.employee_name}
                    </p>
                  )}
                </div>



                <div style={{ marginBottom: 12 }}>

                  <label style={labelStyle}>Withdrawal Amount ({panel.unit || 'pcs'})</label>

                  <input

                    type="number"

                    min="0.01"

                    step="0.01"

                    value={panelForm.amount}

                    disabled={panel.is_machine && (panel.net_out || 0) > 0}

                    onChange={e => setPanelForm(f => ({ ...f, amount: e.target.value }))}

                    placeholder={panel.is_machine && (panel.net_out || 0) > 0 ? "Withdrawal blocked" : `Max: ${Math.abs(parseFloat(panel.quantity))} ${panel.unit || 'pcs'}`}

                    style={inputStyle}

                  />

                </div>



                <div style={{ marginBottom: 12 }}>

                  <label style={labelStyle}>Remarks</label>

                  <textarea

                    value={panelForm.remarks}

                    disabled={panel.is_machine && (panel.net_out || 0) > 0}

                    onChange={e => setPanelForm(f => ({ ...f, remarks: e.target.value }))}

                    placeholder="e.g: Broken during use, Emergency request..."

                    style={{ ...inputStyle, height: 60, resize: 'none' }}

                  />

                </div>



                <div style={{ marginBottom: 12 }}>

                  <label style={labelStyle}>Condition</label>

                  <select value={panelForm.condition} disabled={panel.is_machine && (panel.net_out || 0) > 0} onChange={e => setPanelForm(f => ({ ...f, condition: e.target.value }))} style={inputStyle}>

                    <option value="Good">Good Condition</option>

                    <option value="Damaged">Damaged</option>

                    <option value="Wear & Tear">Wear &amp; Tear</option>

                    <option value="Requires Maintenance">Requires Maintenance</option>

                    <option value="End of Life">End of Life</option>

                  </select>

                </div>



                <div style={{ marginBottom: 20 }}>

                  <label style={labelStyle}>Category</label>

                  <select value={panelForm.category} disabled={panel.is_machine && (panel.net_out || 0) > 0} onChange={e => setPanelForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>

                    <option value="Expendable">Expendable</option>

                    <option value="Non-Expendable">Non-Expendable</option>

                    <option value="Semi-Expendable">Semi-Expendable</option>

                  </select>

                  <button

                    onClick={handlePanelWithdraw}

                    disabled={panelSaving || (panel.is_machine && (panel.net_out || 0) > 0)}

                    style={{

                      width: '100%', padding: '13px', borderRadius: 12, border: 'none',

                      background: panelSaving || (panel.is_machine && (panel.net_out || 0) > 0) ? '#cbd5e1' : '#e11d48',

                      color: '#fff', fontSize: 15, fontWeight: 700,

                      cursor: panelSaving || (panel.is_machine && (panel.net_out || 0) > 0) ? 'not-allowed' : 'pointer',

                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,

                      transition: 'opacity 0.2s',

                    }}

                  >

                    {panelSaving ? "Processing..." : (panel.is_machine && (panel.net_out || 0) > 0) ? "WITHDRAWAL BLOCKED (RETURN TOOL)" : "✕ Confirm Withdrawal (-)"}

                  </button>

                </div>



                {panelMsg && (

                  <p style={{

                    color: panelMsg.type === 'ok' ? '#16a34a' : '#dc2626',

                    textAlign: 'center', marginTop: 12, fontWeight: 700, fontSize: 14,

                  }}>{panelMsg.text}</p>

                )}

              </>

            )}

          </div>

        </div>

      )}



      {scanning && (

        <div className="ww-detail-backdrop">

          <div style={{ background: '#fff', padding: 20, borderRadius: 20, width: 400 }}>

            <Scanner onScan={handleScanResult} onError={handleScanError} />

            <div style={{ marginTop: 16, marginBottom: 16, display: 'flex', gap: 8, flexDirection: 'column' }}>

              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>OR ENTER ID MANUALLY</div>

              <div style={{ display: 'flex', gap: 8 }}>

                <input

                  type="number"

                  value={manualId}

                  onChange={(e) => setManualId(e.target.value)}

                  placeholder="Enter Product ID"

                  onKeyPress={(e) => {

                    if (e.key === 'Enter' && manualId) {

                      handleManualId();

                    }

                  }}

                  style={{

                    flex: 1,

                    padding: '8px 12px',

                    borderRadius: 8,

                    border: '1.5px solid #e2e8f0',

                    fontSize: 14,

                    outline: 'none',

                    fontFamily: 'inherit',

                  }}

                />

                <button

                  type="button"

                  onClick={handleManualId}

                  disabled={!manualId}

                  style={{

                    background: manualId ? '#0f172a' : '#cbd5e1',

                    color: '#fff',

                    border: 'none',

                    padding: '8px 16px',

                    borderRadius: 8,

                    fontWeight: 700,

                    cursor: manualId ? 'pointer' : 'not-allowed',

                  }}

                >

                  Go

                </button>

              </div>

              {cameraError && (

                <p style={{ color: '#dc2626', fontSize: 12, margin: 0, fontWeight: 600 }}>{cameraError}</p>

              )}

            </div>

            <button className="btn-big-wd" style={{ background: '#0f172a' }} onClick={() => setScanning(false)}>

              Close Scanner

            </button>

          </div>

        </div>

      )}



      <div className="ww-list">

        {filtered.map(p => {

          const f = rowForm[p.id] || {};

          return (

            <div key={p.id} className={`ww-row ${scClass(p.quantity)}`}>

              <div className="ww-row-top">

                <div className="ww-info">

                  <h3 className="ww-name">{p.item_name}</h3>

                  <div className="ww-meta">Location: Rack {p.rack} | EmpID & Name: {p.incharge}</div>

                  <div className={`ww-stock ${scClass(p.quantity)}`}>Stock: {Math.abs(parseFloat(p.quantity))} {p.unit}</div>

                  <button className="btn-wd" onClick={() => openPanel(p.id)}>View & Withdraw</button>

                </div>

                <div className="ww-qr-wrap" onClick={() => openPanel(p.id)} style={{ cursor: 'pointer' }}>

                  <QRCodeSVG value={qrUrl(p)} size={80} />

                  <p>Product ID: {p.id}</p>

                </div>

              </div>

            </div>

          );

        })}

      </div>

    </div>

  );

}