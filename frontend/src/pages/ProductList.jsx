import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from '../utils/api';
import { isSmsReadOnly, parseJwt, hasSmsWritePermission } from "../utils/auth";
import { QRCodeSVG } from 'qrcode.react';
import "../styles/ProductList.css";

const formatINR = (n) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

// PostgreSQL DATE fields arrive as "2026-07-22T00:00:00.000Z" — extract YYYY-MM-DD and reformat.
const formatDate = (val) => {
  if (!val) return '—';
  const d = val.includes('T') ? val.split('T')[0] : val; // "2026-07-22"
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`; // "22-07-2026"
};


export default function ProductList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refillProduct, setRefillProduct] = useState(null); // product currently being refilled
  const [batchProduct, setBatchProduct] = useState(null);   // product whose batch history is open

  useEffect(() => { fetchProducts(); }, []);

  // Auto-apply filter from Dashboard navigation state
  useEffect(() => {
    if (location.state?.filter) {
      setFilter(location.state.filter); // "all", "low", or "out"
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const fetchProducts = async () => {
    try {
      const res = await api.get("/products");
     
      setProducts(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error fetching products:", err);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const counts = {
    all: products.length,
    low: products.filter(p => p.status === 'Low Stock').length,
    out: products.filter(p => p.status === 'Out of Stock').length,
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch =
      p.item_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.item_code?.toLowerCase().includes(search.toLowerCase());
    if (filter === "low") return matchesSearch && p.status === 'Low Stock';
    if (filter === "out") return matchesSearch && p.status === 'Out of Stock';
    return matchesSearch;
  });

  const statusKey = (s) => s?.replace(/ /g, '-').toLowerCase();

  const handleBatchSaved = () => {
    setRefillProduct(null);
    fetchProducts(); // refresh quantities/status/values after the new batch is recorded
  };

  if (loading) return (
    <div className="pl-loading-screen">
      <div className="pl-spinner" />
      <p>Loading Inventory…</p>
    </div>
  );

  return (
    <div className="pl-shell">
      {/* Top bar */}
      <div className="pl-topbar">
        <div className="pl-topbar-left">
          <h1 className="pl-title">Inventory Master List</h1>
          <p className="pl-subtitle">{counts.all} items total - {counts.low} low - {counts.out} out of stock</p>
        </div>
        <div className="pl-search">
          <svg className="pl-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search by name or item code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="pl-filters">
        {[
          { key: "all",  label: "All Items",    count: counts.all },
          { key: "low",  label: "Low Stock",    count: counts.low },
          { key: "out",  label: "Out of Stock", count: counts.out },
        ].map(({ key, label, count }) => (
          <button
            key={key}
            className={`pl-filter-btn ${filter === key ? "active" : ""} filter-${key}`}
            onClick={() => setFilter(key)}
          >
            <span className="pl-filter-label">{label}</span>
            <span className="pl-filter-count">{count}</span>
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="pl-grid">
        {filteredProducts.length === 0 ? (
          <div className="pl-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
              <path d="M21 10V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l2-1.14"/>
              <circle cx="18.5" cy="15.5" r="2.5"/><path d="M20.27 17.27L22 19"/>
            </svg>
            <p>No items match your criteria</p>
          </div>
        ) : (
          filteredProducts.map((p, i) => (
            <div
              key={p.id}
              className={`pl-card sk-${statusKey(p.status)}`}
              style={{ animationDelay: `${i * 40}ms` }}
              onClick={() => navigate(`/products/${p.id}`)}
            >
              <div className="pl-card-accent" />

              <div className="pl-card-body">
                <div className="pl-badge-row">
                  <span className={`pl-cat cat-${p.category}`}>{p.category}</span>
                  <span className={`pl-status sk-badge-${statusKey(p.status)}`}>
                    <span className="pl-status-dot" />
                    {p.status}
                  </span>
                </div>

                <h3 className="pl-item-name">{p.item_name}</h3>
                <p className="pl-item-code">Item Code: {p.item_code || 'N/A'}</p>

                <div className="pl-stats">
                  <div className="pl-stat">
                    <span className="pl-stat-label">Stock Value</span>
                    <span className="pl-stat-value">₹{formatINR(p.stock_value)}</span>
                  </div>
                  <div className="pl-stat-divider" />
                  <div className="pl-stat">
                    <span className="pl-stat-label">Current Value</span>
                    <span className="pl-stat-value">₹{formatINR(p.current_stock_value)}</span>
                  </div>
                </div>
              </div>

              <div className="pl-qr">
                <div className="pl-qr-frame">
                  <QRCodeSVG
                    value={`${window.location.origin}/withdraw/${p.id}`}
                    size={70}
                    bgColor="transparent"
                    fgColor="#1e293b"
                  />
                </div>
                <p className="pl-qr-id">#{String(p.id).padStart(4, '0')}</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="pl-add-qty-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!hasSmsWritePermission("sms_stock_in")) {
                        alert("No permissions");
                        return;
                      }
                      setRefillProduct(p);
                    }}
                  >
                    + Batch
                  </button>
                  <button
                    className="pl-add-qty-btn"
                    title="View batch history"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBatchProduct(p);
                    }}
                    style={{ padding: "4px 8px", fontSize: 12, minWidth: 0 }}
                  >
                    →
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {refillProduct && (
        <RefillBatchModal
          item={refillProduct}
          onClose={() => setRefillProduct(null)}
          onSaved={handleBatchSaved}
        />
      )}

      {batchProduct && (
        <BatchListModal
          item={batchProduct}
          onClose={() => setBatchProduct(null)}
        />
      )}
    </div>
  );
}


function BatchListModal({ item, onClose }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/stock/${item.id}/batches`);
        if (!cancelled) setBatches(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error("Error loading batch history:", err);
        if (!cancelled) setBatches([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [item.id]);

  // FIFO display order: oldest in_date first, matching withdrawal sequencing.
  const sorted = [...batches].sort((a, b) => new Date(a.in_date) - new Date(b.in_date));

  return (
    <div style={overlay}>
      <div style={{ ...modal, maxWidth: 820 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Batch history — {item.item_name}</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              Oldest batch first (FIFO withdrawal order)
            </p>
          </div>
          <button type="button" onClick={onClose} style={closeBtn}>✕</button>
        </div>

        {loading && <p style={{ color: "#64748b" }}>Loading…</p>}
        {!loading && sorted.length === 0 && <p style={{ color: "#64748b" }}>No batches recorded yet.</p>}

        {!loading && sorted.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                <th style={thSm}>Batch</th>
                <th style={thSm}>Vendor</th>
                <th style={thSm}>In Date</th>
                <th style={thSm}>Expire</th>
                <th style={thSm}>Condition</th>
                <th style={thSm}>Total / Accepted / Rejected</th>
                <th style={thSm}>Unit Price</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((b) => (
                <tr key={b.batch_no} style={{ borderBottom: "1px solid #eef2f7" }}>
                  <td style={tdSm}>{item.item_code}-{b.batch_no}</td>
                  <td style={tdSm}>{b.vendor}</td>
                  <td style={tdSm}>{formatDate(b.in_date)}</td>
                  <td style={tdSm}>{formatDate(b.expire_date)}</td>
                  <td style={tdSm}>{b.condition || '—'}</td>
                  <td style={tdSm}>{b.total_qty} / {b.accepted_qty} / {b.rejected_qty}</td>
                  <td style={tdSm}>₹{formatINR(b.unit_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const thSm = { textAlign: "left", padding: "8px 12px", fontSize: 11, textTransform: "uppercase", color: "#64748b" };
const tdSm = { padding: "8px 12px", fontSize: 13, color: "#334155" };


const today = () => new Date().toISOString().slice(0, 10);


const UNIT_OPTIONS = [
  { label: "Nos / Pieces",     value: "nos",   symbol: "pcs" },
  { label: "Meter (m)",        value: "m",     symbol: "m"   },
  { label: "Kilogram (kg)",    value: "kg",    symbol: "kg"  },
  { label: "Litres (L)",       value: "litres",symbol: "L"   },
  { label: "Square Meter (m²)",value: "m2",    symbol: "m²"  },
  { label: "Square Feet (ft²)",value: "sq_ft", symbol: "ft²" },
  { label: "Milli Meters (mm)",value: "mm",    symbol: "mm"  },
];

// generateGRN removed, now using API
const emptyBatchForm = {
  vendor: "",
  make: "",
  model: "",
  in_date: today(),
  expire_date: "",
  grn: "",
  invoice_number: "",
  delivery_challan: "",
  project: "",
  inspected_by: "",
  inspection_doc_no: "",
  service_period: "",
  unit_price: "",
  lead_time: "",
  employee_id: "",
  description: "",
  storage_location: "",
  total_qty: "",
  accepted_qty: "",
  rejected_qty: "",
  unit: "",
  min_stock: "0",
  danger_level: "0",
};

function RefillBatchModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState(emptyBatchForm);
  const [document, setDocument] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [grnSaved, setGrnSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedBatchCode, setSavedBatchCode] = useState("");
  const [grnLoading, setGrnLoading] = useState(false);
  const [grnError, setGrnError] = useState("");
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [showGrnForm, setShowGrnForm] = useState(false);

  
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      const decoded = parseJwt(token);
      if (decoded) {
        const { employee_id_code, name, fullname, username, employee_uav_id } = decoded;
        const empName = fullname || name;
        const empID = username || employee_uav_id || employee_id_code;
        setForm((f) => ({
          ...f,
          employee_id: empID || "",
          employee_display: empID && empName ? `${empID} — ${empName}` : (empID || empName || ""),
        }));
      }
    }
    loadVendors();

    if (item) {
      setForm((f) => ({
        ...f,
        unit: item.unit || "",
        min_stock: item.min_stock || "0",
        danger_level: item.danger_level || "0",
        unit_price: item.unit_price || "0.00",
      }));
    }
  }, [item]);

  
  const loadVendors = async () => {
    try {
      const res = await api.get("/vendors");
      if (Array.isArray(res.data)) setVendors(res.data);
    } catch (err) {
      console.error("Error loading vendors:", err);
    }
  };

  const set = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  // Rejected Quantity is derived, not entered: RQ = TQ - AC.
  // Recomputed whenever the GRN-sourced total or the accepted qty changes.
  useEffect(() => {
    const tq = parseFloat(form.total_qty);
    if (isNaN(tq)) {
      if (form.rejected_qty !== "") setForm((f) => ({ ...f, rejected_qty: "" }));
      return;
    }
    // If Accepted Quantity hasn't been entered yet, treat it as equal to the
    // total (mirrors the backend default), so rejected comes out to 0.
    const ac = form.accepted_qty === "" ? tq : parseFloat(form.accepted_qty);
    const rq = isNaN(ac) ? 0 : Math.max(tq - ac, 0);
    const rqStr = String(rq);
    if (form.rejected_qty !== rqStr) {
      setForm((f) => ({ ...f, rejected_qty: rqStr }));
    }
  }, [form.total_qty, form.accepted_qty]);

  const handleVendorChange = (e) => {
    const name = e.target.value;
    setForm((f) => ({ ...f, vendor: name }));
    const known = vendors.find((v) => v.name.toLowerCase() === name.toLowerCase());
    if (known) {
      setForm((f) => ({ ...f, vendor: name, make: known.make || f.make, model: known.model || f.model }));
    }
  };

  const handleGenerateGRN = async (grnFields) => {
    setGrnLoading(true);
    setGrnError("");
    try {
      const res = await api.get("/next-grn");
      if (!res.data?.grn) throw new Error("Server responded but sent no GRN value");
      setForm((f) => ({ ...f, ...grnFields, grn: res.data.grn }));
      setGrnSaved(true);
      setShowGrnForm(false);
    } catch (e) {
      console.error("[RefillBatchModal] GRN generation failed:", {
        status: e.response?.status,
        data: e.response?.data,
        requestedUrl: (e.config?.baseURL || "") + (e.config?.url || ""),
        message: e.message,
      });
      setGrnError(
        e.response?.status === 404
          ? "GRN endpoint not found (404) — check that /next-grn is mounted on the server."
          : e.response?.status === 401
          ? "Session expired — please log in again."
          : "Couldn't generate GRN — check your connection and try again."
      );
    } finally {
      setGrnLoading(false);
    }
  };

   const handleSubmit = async (e) => {
    e.preventDefault();

    if (!hasSmsWritePermission("sms_stock_in")) {
      alert("No permissions");
      return;
    }

    if (!form.grn) {
      alert("Generate the GRN first — click 'Open Form' next to the GRN field.");
      return;
    }
    if (!form.vendor || form.total_qty === "") {
      alert("Vendor is required, and Total Quantity must be set via the GRN form.");
      return;
    }

    setSaving(true);

    try {
      const batch = {
        ...form,
        item_code: item.item_code,
      };
      // Remove display-only field before sending to backend
      delete batch.employee_display;

      const fd = new FormData();
      Object.entries(batch).forEach(([k, v]) => fd.append(k, v));
      if (document) fd.append("document", document);

      const res = await api.post(`/stock/${item.id}/batches`, fd);
      const batchNo = res.data?.batch_no || "BA??";
      const fullCode = `${item.item_code}-${batchNo}`;

      // Save vendor for future autosuggest if it's new.
      const known = vendors.find((v) => v.name.toLowerCase() === form.vendor.toLowerCase());
      if (!known) {
        await api.post("/vendors", { name: form.vendor, make: form.make, model: form.model }).catch((err) =>
          console.error("Error saving new vendor:", err)
        );
      }

      setSavedBatchCode(fullCode);
      onSaved({ ...batch, batch_no: batchNo });
    } catch (err) {
      console.error("Error saving batch:", err);
      const msg = err.response?.data?.message || err.response?.data?.error || err.message;
      alert("Error saving batch: " + msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Refill Stock — {item.item_name}</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b", fontFamily: "monospace" }}>
              {item.item_code} — batch number auto-generated on save
            </p>
          </div>
          <button type="button" onClick={onClose} style={closeBtn}>✕</button>
        </div>

        {savedBatchCode && (
          <div style={{ padding: "12px 16px", borderRadius: 10, background: "#f0fdf4", border: "1.5px solid #10b981", marginBottom: 16 }}>
            <span style={{ color: "#10b981", fontWeight: 700 }}>Saved as {savedBatchCode}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>

          <div style={grid2}>
            <Field label="Vendor" required>
              <input list="vendor-list" name="vendor" value={form.vendor} onChange={handleVendorChange} required style={inputStyle} />
              <datalist id="vendor-list">
                {vendors.map((v) => <option key={v.name} value={v.name} />)}
              </datalist>
            </Field>
            <Field label="Make">
              <input name="make" value={form.make} onChange={set} style={inputStyle} />
            </Field>
            <Field label="Model">
              <input name="model" value={form.model} onChange={set} style={inputStyle} />
            </Field>
            <Field label="In Date">
              <input
                type="date"
                name="in_date"
                value={form.in_date}
                readOnly
                disabled
                style={{ ...inputStyle, background: "#f1f5f9", cursor: "not-allowed", color: "#334155", fontWeight: 500 }}
              />
            </Field>
            <Field label="Expire Date">
              <input type="date" name="expire_date" value={form.expire_date} onChange={set} style={inputStyle} />
            </Field>
            <Field label="">
              <div style={{ display: 'flex', gap: 8 }}>
                <div
                  style={{
                    ...inputStyle,
                    flex: 1,
                    textAlign: "left",
                    background: grnSaved ? "#f0fdf4" : "#f8fafc",
                    border: grnError
                      ? "1.5px solid #dc2626"
                      : grnSaved ? "1.5px solid #10b981" : "1.5px solid #cbd5e1",
                    color: grnSaved ? "#10b981" : "#94a3b8",
                    fontWeight: grnSaved ? 700 : 400,
                  }}
                >
                  {form.grn || "Not generated yet"}
                </div>
                {grnSaved ? (
                  <button
                    type="button"
                    onClick={() => setShowPrintPreview(true)}
                    title="View & Print GRN Form"
                    style={{
                      padding: "0 16px",
                      background: "#e0f2fe",
                      color: "#0369a1",
                      border: "1px solid #bae6fd",
                      borderRadius: 8,
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap"
                    }}
                  >
                    📄 View Form
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowGrnForm(true)}
                    title="Open form to generate the GRN number"
                    style={{
                      padding: "0 16px",
                      background: "#0f172a",
                      color: "#fff",
                      border: "1px solid #0f172a",
                      borderRadius: 8,
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap"
                    }}
                  >
                    Open Form
                  </button>
                )}
              </div>
              {grnError && (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#dc2626" }}>
                  {grnError}
                </p>
              )}
            </Field>
            <Field label="Invoice Number">
              <input name="invoice_number" value={form.invoice_number} onChange={set} style={inputStyle} />
            </Field>
            <Field label="Delivery Challan">
              <input name="delivery_challan" value={form.delivery_challan} onChange={set} style={inputStyle} />
            </Field>
            <Field label="Project">
              <input name="project" value={form.project} onChange={set} style={inputStyle} />
            </Field>
            <Field label="Service Period">
              <input name="service_period" value={form.service_period} onChange={set} style={inputStyle} placeholder="e.g. 12 months" />
            </Field>

            <Field label="Lead Time (Days)">
              <input type="number" min="0" name="lead_time" value={form.lead_time} onChange={set} style={inputStyle} />
            </Field>
            <Field label="Inspected By">
              <input name="inspected_by" value={form.inspected_by} onChange={set} style={inputStyle} />
            </Field>
            <Field label="Inspection Document No">
              <input name="inspection_doc_no" value={form.inspection_doc_no} onChange={set} style={inputStyle} />
            </Field>
            <Field label="Employee ID / Name">
              <input
                name="employee_display"
                value={form.employee_display || form.employee_id || ""}
                readOnly
                title={form.employee_id}
                style={{ ...inputStyle, background: "#f1f5f9", cursor: "not-allowed", color: "#334155", fontWeight: 500 }}
              />
            </Field>
            <Field label="Storage Location">
              <input name="storage_location" value={form.storage_location} onChange={set} style={inputStyle} placeholder="e.g. TRAY-101" />
            </Field>
            <Field label="Unit / Metric *" required>
              <select name="unit" value={form.unit} onChange={set} required style={inputStyle}>
                <option value="">— Select —</option>
                {UNIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Unit Price (₹) *" required>
              <input type="number" min="0" step="0.01" name="unit_price" value={form.unit_price} onChange={set} required style={inputStyle} />
            </Field>
            <Field label="Minimum Stock Quantity *" required>
              <input type="number" min="0" step="1" name="min_stock" value={form.min_stock} onChange={set} required style={inputStyle} />
            </Field>
            <Field label="Critical Quantity *" required>
              <input type="number" min="0" step="1" name="danger_level" value={form.danger_level} onChange={set} required style={inputStyle} />
            </Field>
            <Field label="Total Quantity">
              <input
                type="number"
                value={form.total_qty}
                readOnly
                title="Set from the GRN — click 'Open Form' next to the GRN field to change it"
                style={{ ...inputStyle, background: "#f1f5f9", cursor: "not-allowed", color: "#334155", fontWeight: 500 }}
                placeholder="0.0000"
              />
            </Field>
            <Field label="Accepted Quantity">
              <input type="number" min="0" name="accepted_qty" value={form.accepted_qty} onChange={set} style={inputStyle} />
            </Field>
            <Field label="Rejected Quantity">
              <input
                type="number"
                value={form.rejected_qty}
                readOnly
                title="Auto-calculated: Rejected = Total - Accepted"
                style={{ ...inputStyle, background: "#f1f5f9", cursor: "not-allowed", color: "#334155", fontWeight: 500 }}
                placeholder="0.0000"
              />
            </Field>
            <Field label="Document" full>
              <input type="file" onChange={(e) => setDocument(e.target.files?.[0] || null)} style={inputStyle} />
            </Field>
            <Field label="Item Description" full>
              <textarea name="description" value={form.description} onChange={set} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            </Field>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            <button type="submit" disabled={saving} style={saveBtn}>
              {saving ? "Saving…" : "Save Batch"}
            </button>
            <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          </div>
        </form>

        {showPrintPreview && (
          <GRNPrintPreview form={form} item={item} onClose={() => setShowPrintPreview(false)} />
        )}

        {showGrnForm && (
          <GRNGenerateModal
            item={item}
            initial={form}
            loading={grnLoading}
            error={grnError}
            onGenerate={handleGenerateGRN}
            onClose={() => setShowGrnForm(false)}
          />
        )}
      </div>
    </div>
  );
}

function Field({ label, required, full, children }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : "auto", marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#334155" }}>
        {label} {required && <span style={{ color: "#dc2626" }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const overlay = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20,
};
const modal = {
  background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 720,
  maxHeight: "90vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
};
const grid2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" };
const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #cbd5e1",
  fontSize: 14, outline: "none", boxSizing: "border-box",
};
const closeBtn = { border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "#64748b" };
const saveBtn = {
  flex: 1, padding: "12px", borderRadius: 10, border: "none", background: "#10b981",
  color: "#fff", fontWeight: 700, cursor: "pointer",
};
const cancelBtn = {
  padding: "12px 20px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff",
  color: "#0f172a", fontWeight: 600, cursor: "pointer",
};

function GRNGenerateModal({ item, initial, loading, error, onGenerate, onClose }) {
  const [f, setF] = useState({
    in_date: today(),
    vendor: initial.vendor || "",
    invoice_number: initial.invoice_number || "",
    delivery_challan: initial.delivery_challan || "",
    total_qty: initial.total_qty || "",
    project: initial.project || "",
    remarks: initial.remarks || "",
    inspected_by: initial.inspected_by || "",
    inspection_doc_no: initial.inspection_doc_no || "",
  });
  const set = (e) => {
    const { name, value } = e.target;
    setF((prev) => ({ ...prev, [name]: value }));
  };

  const line = { border: "none", borderBottom: "1px solid #94a3b8", outline: "none", fontFamily: "monospace", fontSize: 13, padding: "2px 4px", background: "transparent", width: "100%" };
  const cell = { border: "1px solid #000" };
  const cellInput = { ...line, borderBottom: "none", padding: "6px 8px" };

  const handleSave = () => {
    if (!f.vendor) { alert("Supplier Name is required."); return; }
    onGenerate(f);
  };

  return (
    <div style={{ ...overlay, zIndex: 1100 }}>
      <div style={{ ...modal, maxWidth: 780 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Goods Receipt Note</h3>
          <button type="button" onClick={onClose} style={closeBtn}>✕</button>
        </div>

        <div style={{ fontFamily: "monospace", color: "#000" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 26, fontWeight: "bold", color: "#0ea5e9" }}>▲ UAV</div>
            <strong>UAV TECH Private Limited.</strong><br />
            <span style={{ fontSize: 12 }}>CIN: U32109TG2021PTC154927.</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, gap: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flex: 1 }}>
              <strong style={{ whiteSpace: "nowrap" }}>Goods Receipt Number:</strong>
              <span style={{ ...line, color: "#94a3b8" }}>Generated on save</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              <strong>Date:</strong>
              <span style={{ ...line, minWidth: 140, color: "#0f172a", fontWeight: 600 }}>{today()}</span>
            </div>
          </div>
          <p style={{ fontSize: 11, color: "#94a3b8", margin: "-12px 0 16px" }}>Date is fixed to today, the day stock is received.</p>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 16 }}>
            <strong style={{ whiteSpace: "nowrap" }}>Supplier Name: *</strong>
            <input name="vendor" value={f.vendor} onChange={set} style={line} placeholder="Supplier / Vendor name" />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, gap: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flex: 1 }}>
              <strong style={{ whiteSpace: "nowrap" }}>Invoice Number:</strong>
              <input name="invoice_number" value={f.invoice_number} onChange={set} style={line} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flex: 1 }}>
              <strong style={{ whiteSpace: "nowrap" }}>Delivery Challan:</strong>
              <input name="delivery_challan" value={f.delivery_challan} onChange={set} style={line} />
            </div>
          </div>

          <h4 style={{ textAlign: "center", marginBottom: 12 }}>Material Details</h4>
          <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 20 }}>
            <thead>
              <tr>
                <th style={{ ...cell, padding: 8, width: 50 }}>Sl No</th>
                <th style={{ ...cell, padding: 8 }}>Item Name</th>
                <th style={{ ...cell, padding: 8, width: 130 }}>Quantity</th>
                <th style={{ ...cell, padding: 8, width: 150 }}>Project</th>
                <th style={{ ...cell, padding: 8 }}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...cell, textAlign: "center", padding: 8 }}>1</td>
                <td style={{ ...cell, padding: 8 }}>{item.item_name}</td>
                <td style={cell}>
                  <input type="number" min="0" step="0.0001" name="total_qty" value={f.total_qty} onChange={set} style={cellInput} placeholder="0.0000" />
                </td>
                <td style={cell}>
                  <input name="project" value={f.project} onChange={set} style={cellInput} />
                </td>
                <td style={cell}>
                  <input name="remarks" value={f.remarks} onChange={set} style={cellInput} />
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <strong>Inspected by:</strong>
              <input name="inspected_by" value={f.inspected_by} onChange={set} style={{ ...line, display: "block", marginTop: 6 }} />
            </div>
            <div style={{ flex: 1 }}>
              <strong>Inspection Document No:</strong>
              <input name="inspection_doc_no" value={f.inspection_doc_no} onChange={set} style={{ ...line, display: "block", marginTop: 6 }} />
            </div>
            <div style={{ flex: 1 }}>
              <strong>Entry Done by:</strong>
              <div style={{ marginTop: 6, fontSize: 13, color: "#334155" }}>{initial.employee_display || initial.employee_id || "—"}</div>
            </div>
          </div>
        </div>

        {error && (
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#dc2626" }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" onClick={handleSave} disabled={loading} style={{ ...saveBtn, cursor: loading ? "wait" : "pointer" }}>
            {loading ? "Generating…" : "Save & Generate GRN"}
          </button>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function GRNPrintPreview({ form, item, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 9999, overflow: 'auto', padding: '40px' }} className="grn-print-modal">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .grn-print-modal { padding: 0 !important; }
        }
        .grn-doc {
          max-width: 800px;
          margin: 0 auto;
          font-family: inherit;
          color: #000;
        }
        .grn-doc table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        .grn-doc th, .grn-doc td { border: 1px solid #000; padding: 10px; text-align: left; }
        .grn-header { text-align: center; margin-bottom: 40px; }
        .grn-row { display: flex; justify-content: space-between; margin-bottom: 20px; }
        .grn-field { display: flex; gap: 10px; align-items: flex-end; }
        .grn-line { border-bottom: 1px solid #000; min-width: 200px; flex: 1; min-height: 20px; font-weight: 500; }
        .grn-doc td { height: 35px; }
      `}</style>

      <div className="no-print" style={{ textAlign: 'right', marginBottom: 20, maxWidth: 800, margin: '0 auto 20px' }}>
        <button onClick={() => window.print()} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 10, fontWeight: 600 }}>Print Form</button>
        <button onClick={onClose} style={{ padding: '8px 16px', background: '#e2e8f0', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Close Wrapper</button>
      </div>

      <div className="grn-doc" style={{ fontFamily: 'monospace' }}>
        <div className="grn-header">
           <div style={{ fontSize: 32, fontWeight: 'bold', color: '#0ea5e9' }}>▲ UAV</div>
           <strong>UAV TECH Private Limited.</strong><br/>
           CIN: U32109TG2021PTC154927.
        </div>

        <div className="grn-row">
           <div className="grn-field">
             <strong>Goods Receipt Number:</strong>
             <div className="grn-line">{form.grn || ''}</div>
           </div>
           <div className="grn-field">
             <strong>Date:</strong>
             <div className="grn-line">{form.in_date || ''}</div>
           </div>
        </div>

        <div className="grn-row">
           <div className="grn-field" style={{ width: '100%' }}>
             <strong>Supplier Name:</strong>
             <div className="grn-line">{form.vendor || ''}</div>
           </div>
        </div>

        <div className="grn-row">
           <div className="grn-field" style={{ width: '50%' }}>
             <strong>Invoice Number:</strong>
             <div className="grn-line">{form.invoice_number || ''}</div>
           </div>
           <div className="grn-field" style={{ width: '50%' }}>
             <strong>Delivery Challan:</strong>
             <div className="grn-line">{form.delivery_challan || ''}</div>
           </div>
        </div>

        <h3 style={{ textAlign: 'center', marginTop: 30, marginBottom: 15 }}>Material Details</h3>

        <table>
           <thead>
             <tr>
               <th style={{ width: '60px' }}>Sl No</th>
               <th style={{ width: '25%' }}>Item Code</th>
               <th>Item Name</th>
               <th>Quantity</th>
               <th>Project</th>
               <th>Remarks</th>
             </tr>
           </thead>
           <tbody>
             <tr>
               <td>1</td>
               <td>{item.item_code}</td>
               <td>{item.item_name}</td>
               <td>{form.total_qty || ''}</td>
               <td>{form.project || ''}</td>
               <td></td>
             </tr>
             {[2,3,4,5].map((num) => (
               <tr key={num}>
                 <td style={{textAlign: 'center'}}>{num}</td>
                 <td></td>
                 <td></td>
                 <td></td>
                 <td></td>
                 <td></td>
               </tr>
             ))}
             <tr>
                <td colSpan={2}>
                  <strong>Inspected by:</strong><br/><br/><br/>
                  <span style={{fontWeight: 500}}>{form.inspected_by || ''}</span>
                </td>
                <td colSpan={2}>
                  <strong>Inspection Document No:</strong><br/><br/><br/>
                  <span style={{fontWeight: 500}}>{form.inspection_doc_no || ''}</span>
                </td>
                <td colSpan={2}>
                  <strong>Entry Done by:</strong><br/><br/><br/>
                  <span style={{fontWeight: 500}}>{form.employee_display || ''}</span>
                </td>
             </tr>
           </tbody>
        </table>
      </div>
    </div>
  );
}