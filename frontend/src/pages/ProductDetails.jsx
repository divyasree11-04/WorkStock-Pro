import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { QRCodeSVG } from "qrcode.react";
import { isSmsReadOnly, hasSmsWritePermission } from "../utils/auth";
import "../styles/ProductDetails.css";

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAddQty, setShowAddQty] = useState(false);
  const [addingQty, setAddingQty] = useState(false);
  const [qtyForm, setQtyForm] = useState({
    quantity: "", entry_date: "", unit_price: "", make: "", incharge: "", 
    rack: "", lead_time: "", min_stock: "", safety_stock: "", 
    reorder_quantity: "", warranty_expiry: "", service_days: "", remarks: ""
  });

  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [addingMaintenance, setAddingMaintenance] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState({ quantity: 1, remarks: "" });

  useEffect(() => {
    if (!id || isNaN(id)) {
      console.warn("[ProductDetails] fetchData called with invalid id:", id);
      setLoading(false);
      return;
    }
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const [prodRes, histRes] = await Promise.all([
        api.get(`/products/${id}`),
        api.get(`/reports/transactions/${id}`)
      ]);
      setProduct(prodRes.data);
      setHistory(histRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddQty = () => {
    setQtyForm({
      quantity: "",
      entry_date: new Date().toISOString().slice(0, 10),
      unit_price: product.unit_price || "",
      make: product.make || "",
      incharge: product.incharge || "",
      rack: product.rack || "",
      lead_time: product.lead_time || "",
      min_stock: product.min_stock || "",
      safety_stock: product.safety_stock || "",
      reorder_quantity: product.reorder_quantity || "",
      warranty_expiry: product.warranty_expiry ? new Date(product.warranty_expiry).toISOString().slice(0, 10) : "",
      service_days: product.service_days || "",
      remarks: ""
    });
    setShowAddQty(true);
  };

  const submitAddQty = async () => {
    if (!hasSmsWritePermission("sms_stock_in")) {
      alert("No permissions");
      return;
    }
    if (!qtyForm.quantity || parseFloat(qtyForm.quantity) <= 0) {
      alert("Please enter a valid quantity to add.");
      return;
    }
    setAddingQty(true);
    try {
      await api.post(`/products/${id}/add-quantity`, qtyForm);
      setShowAddQty(false);
      fetchData(); // reload product and history
    } catch (err) {
      alert("Error adding quantity: " + (err.response?.data?.message || err.message));
    } finally {
      setAddingQty(false);
    }
  };

  const submitMaintenance = async () => {
    if (!hasSmsWritePermission("sms_master_list")) {
      alert("No permissions");
      return;
    }
    const qty = parseFloat(maintenanceForm.quantity);
    if (!qty || qty <= 0) {
      alert("Please enter a valid quantity maintained.");
      return;
    }
    setAddingMaintenance(true);
    try {
      await api.post("/maintenance", { 
        productId: product.id, 
        remarks: maintenanceForm.remarks, 
        quantity: qty 
      });
      setShowMaintenanceModal(false);
      setMaintenanceForm({ quantity: 1, remarks: "" });
      fetchData();
    } catch (err) {
      alert("Error logging maintenance: " + (err.response?.data?.message || err.message));
    } finally {
      setAddingMaintenance(false);
    }
  };

  if (loading) return <div className="pd-loading">Loading Item Details...</div>;
  if (!product) return <div className="pd-error">Item not found.</div>;

  const getWarrantyStatus = () => {
    if (!product.warranty_expiry) return { label: "N/A", class: "none" };
    const expiry = new Date(product.warranty_expiry);
    const today = new Date();
    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const diffMonths = diffDays / 30;

    if (diffDays < 0) return { label: "Expired", class: "red" };
    if (diffMonths <= 6) return { label: "Expiring Soon (≤6m)", class: "orange" };
    return { label: "Active (>1y)", class: "green" };
  };

  const warranty = getWarrantyStatus();

  return (
    <div className="pd-container">
      <div className="pd-header">
        <button 
          className="btn-back" 
          onClick={() => navigate('/products')}
          style={{ padding: "6px 12px", fontSize: "12px", borderRadius: "6px", background: "#f1f5f9", color: "#1e293b", border: "1px solid #cbd5e1", cursor: "pointer", fontWeight: "600" }}
        >
          ← Back
        </button>
        <div className="pd-title-row">
          <h1>{product.item_name}</h1>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span className={`pd-category-badge cat-${product.category}`} title="ABC Category (Value)">Category {product.category}</span>
            <span className="pd-category-badge" style={{ background: '#ede9fe', color: '#8b5cf6', border: '1px solid #ddd6fe' }} title="SDE Category (Lead Time)">SDE: {product.sde || 'N/A'}</span>
            <span className="pd-category-badge" style={{ background: '#d1fae5', color: '#10b981', border: '1px solid #a7f3d0' }} title="FSN Category (Usage)">FSN: {product.fsn || 'N/A'}</span>
          </div>
        </div>
        <p className="pd-id">Internal ID: #00{product.id} | MRN: {product.item_code || 'N/A'}</p>
      </div>

      <div className="pd-grid">
        {/* Left Col: Core Data */}
        <div className="pd-main-card">
          <div className="pd-section">
            <h3>Master Data</h3>
            <div className="pd-data-grid">
              <div className="pd-data-item">
                <label>Current Stock</label>
                <div className={`pd-value stock-${product.status?.replace(' ', '-').toLowerCase()}`}>
                  {product.quantity} {product.uom || product.unit}
                </div>
              </div>
              <div className="pd-data-item">
                <label>Unit Price</label>
                <div className="pd-value">₹{parseFloat(product.unit_price).toFixed(2)}</div>
              </div>
              <div className="pd-data-item">
                <label>Total Value</label>
                <div className="pd-value">₹{(parseFloat(product.quantity) * parseFloat(product.unit_price)).toFixed(2)}</div>
              </div>
              <div className="pd-data-item">
                <label>Status</label>
                <div className={`pd-status-pill status-${product.status?.replace(' ', '-').toLowerCase()}`}>
                  {product.status || 'Available'}
                </div>
              </div>
            </div>
          </div>

          <div className="pd-section">
            <h3>Control Levels</h3>
            <div className="pd-data-grid">
              <div className="pd-data-item"><label>Min Stock</label><span>{product.min_stock}</span></div>
              <div className="pd-data-item"><label>Max Stock</label><span>{product.max_stock}</span></div>
              <div className="pd-data-item"><label>Safety Stock</label><span>{product.safety_stock}</span></div>
              <div className="pd-data-item"><label>Reorder Qty</label><span>{product.reorder_quantity}</span></div>
            </div>
          </div>

          <div className="pd-section">
            <h3>Logistics & Storage</h3>
            <div className="pd-data-grid">
              <div className="pd-data-item"><label>EmpID: and Name</label><span>{product.incharge || 'N/A'}</span></div>
              <div className="pd-data-item"><label>Rack / Storage ID</label><span>{product.storage_id || product.rack || 'N/A'}</span></div>
              <div className="pd-data-item"><label>Lead Time</label><span>{product.lead_time} Days</span></div>
              <div className="pd-data-item"><label>Make / Brand</label><span>{product.make || 'Generic'}</span></div>
              <div className="pd-data-item"><label>Date Added</label><span>{product.created_at ? new Date(product.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A'}</span></div>
            </div>
          </div>
        </div>

        {/* Right Col: QR & Tools */}
        <div className="pd-side-col">
          <div className="pd-card pd-qr-card">
            <h3>QR Reference</h3>
            <QRCodeSVG value={`${window.location.origin}/withdraw/${product.id}`} size={150} />
            <p>Scan to Stock-In/Out</p>
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
                <button 
                  onClick={() => {
                    if (!hasSmsWritePermission("sms_stock_in")) {
                      alert("No permissions");
                      return;
                    }
                    handleOpenAddQty();
                  }}
                  style={{
                    padding: '6px 16px', 
                    background: '#10b981', color: '#fff', border: 'none', 
                    borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '13px',
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    transition: 'background 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#059669'}
                  onMouseOut={(e) => e.currentTarget.style.background = '#10b981'}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Add Quantity
                </button>
              </div>
          </div>

          <div className={`pd-card pd-warranty-card war-${warranty.class}`}>
  <h3>Machine Warranty</h3>
  <div className="pd-war-label">{warranty.label}</div>
  <p style={{ fontSize: '0.9rem', color: '#64748b', margin: '4px 0' }}>
    Expires: <strong style={{ color: '#1e293b' }}>{product.warranty_expiry ? new Date(product.warranty_expiry).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</strong>
  </p>
  <div className="pd-maintenance">
    <label>Last Maintenance: </label>
    <span style={{ display: 'block', marginTop: '4px', fontSize: '0.95rem', color: '#334155' }}>
      {product.last_maintenance ? new Date(product.last_maintenance).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : 'Never'}
    </span>
  </div>
  <button 
    className="btn-maintenance" 
    onClick={() => {
      if (!hasSmsWritePermission("sms_master_list")) {
        alert("No permissions");
        return;
      }
      setShowMaintenanceModal(true);
    }}
  >
     Log Maintenance
  </button>
</div>
        </div>
      </div>

      {showMaintenanceModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{
            background: '#fff', padding: '24px', borderRadius: '16px',
            width: '90%', maxWidth: '400px', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            <button 
              style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }} 
              onClick={() => setShowMaintenanceModal(false)}
            >✕</button>
            <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '20px' }}>Log Maintenance</h2>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>
                Quantity Maintained *
              </label>
              <input 
                type="number" min="1" value={maintenanceForm.quantity} 
                onChange={e => setMaintenanceForm(f => ({ ...f, quantity: e.target.value }))}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }} 
              />
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>
                Maintenance Details/Remarks
              </label>
              <textarea 
                value={maintenanceForm.remarks} 
                onChange={e => setMaintenanceForm(f => ({ ...f, remarks: e.target.value }))}
                rows="3"
                placeholder="Describe maintenance performed..."
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', resize: 'none' }} 
              />
            </div>

            <button 
              onClick={submitMaintenance} disabled={addingMaintenance}
              style={{
                width: '100%', padding: '14px', 
                background: '#0ea5e9', color: '#fff', border: 'none', 
                borderRadius: '8px', fontWeight: 'bold', cursor: addingMaintenance ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s'
              }}>
              {addingMaintenance ? "Logging..." : "Save Maintenance Log"}
            </button>
          </div>
        </div>
      )}

      <div className="pd-history-section">
        <h3>Transaction History (Audit Trail)</h3>
        <table className="pd-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Qty</th>
              <th>User &amp; ID</th>
              <th>Remarks</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={i}>
                <td>{h.created_at && !isNaN(new Date(h.created_at)) ? new Date(h.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : 'N/A'}</td>
                <td><span className={`type-tag tag-${h.type}`}>{h.type}</span></td>
                <td>{h.quantity}</td>
                <td>
                  <div style={{ fontWeight: 500, color: '#1e293b' }}>{h.name || h.employee_id_code || 'System / Staff'}</div>
                  {h.employee_id_code && h.name && (
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                      {h.employee_uav_id || h.employee_id_code}
                    </div>
                  )}
                </td>
                <td>{h.remarks || '-'}</td>
                <td>{h.condition || 'Good'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ padding: "20px", display: "flex", justifyContent: "center" }}>
        
      </div>

      {showAddQty && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{
            background: '#fff', padding: '24px', borderRadius: '16px',
            width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto',
            position: 'relative', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            <button 
              style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }} 
              onClick={() => setShowAddQty(false)}
            >✕</button>
            <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '20px' }}>Add Quantity & Update Item</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Quantity to Add *
                </label>
                <input 
                  type="number" min="0.01" step="0.01" value={qtyForm.quantity} 
                  onChange={e => setQtyForm(f => ({ ...f, quantity: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '2px solid #10b981', background: '#f0fdf4', outline: 'none', boxSizing: 'border-box' }} 
                />
              </div>

              {[
                { key: 'entry_date', label: 'Entry Date', type: 'date' },
                { key: 'unit_price', label: 'Unit Price (₹)', type: 'number' },
                { key: 'make', label: 'Make / Brand', type: 'text' },
                { key: 'incharge', label: 'EmpID & Name', type: 'text' },
                { key: 'rack', label: 'Rack', type: 'text' },
                { key: 'lead_time', label: 'Lead Time (Days)', type: 'text' },
                { key: 'min_stock', label: 'Min Stock', type: 'number' },
                { key: 'safety_stock', label: 'Safety Stock', type: 'number' },
                { key: 'reorder_quantity', label: 'Reorder Qty', type: 'number' },
                { key: 'warranty_expiry', label: 'Warranty Expiry', type: 'date' },
                { key: 'service_days', label: 'Service Info (Days)', type: 'number' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>
                    {f.label}
                  </label>
                  <input 
                    type={f.type} value={qtyForm[f.key]} 
                    onChange={e => setQtyForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }} 
                  />
                </div>
              ))}

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Remarks (Vendor/Ref)
                </label>

                <input 
                  type="text" value={qtyForm.remarks} 
                  onChange={e => setQtyForm(f => ({ ...f, remarks: e.target.value }))}
                  placeholder="Vendor name, batch no..."
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }} 
                />
              </div>
            </div>

            <button 
              onClick={submitAddQty} disabled={addingQty}
              style={{
                marginTop: '20px', width: '100%', padding: '14px', 
                background: '#0f172a', color: '#fff', border: 'none', 
                borderRadius: '8px', fontWeight: 'bold', cursor: addingQty ? 'not-allowed' : 'pointer'
              }}>
              {addingQty ? "Processing..." : "Confirm & Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
