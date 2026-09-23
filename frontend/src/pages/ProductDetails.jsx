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

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(false);
  const [editForm, setEditForm] = useState({});

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
      setHistory(Array.isArray(histRes.data) ? histRes.data : []);
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

  const handleOpenEdit = () => {
    setEditForm({
      item_name: product.item_name || "",
      description: product.description || "",
      make: product.make || "",
      rack: product.rack || product.storage_id || "",
      storage_id: product.storage_id || product.rack || "",
      lead_time: product.lead_time || "",
      unit: product.unit || "",
      unit_price: product.unit_price || "",
      category: product.category || "C",
      sde: product.sde || "S",
      fsn: product.fsn || "F",
      min_stock: product.min_stock ?? "",
      max_stock: product.max_stock ?? "",
      safety_stock: product.safety_stock ?? "",
      reorder_quantity: product.reorder_quantity ?? "",
      warranty_expiry: product.warranty_expiry ? new Date(product.warranty_expiry).toISOString().slice(0, 10) : "",
      is_machine: product.is_machine || false,
      service_days: product.service_days || "",
    });
    setShowEditModal(true);
  };

  const submitEdit = async () => {
    if (!hasSmsWritePermission("sms_master_list")) {
      alert("No permissions");
      return;
    }
    setEditingProduct(true);
    try {
      const payload = {
        ...editForm,
        storage_id: editForm.rack || editForm.storage_id || "",
        is_machine: editForm.is_machine,
      };
      await api.put(`/products/${id}`, payload);
      setShowEditModal(false);
      fetchData();
    } catch (err) {
      alert("Error updating product: " + (err.response?.data?.message || err.response?.data?.error || err.message));
    } finally {
      setEditingProduct(false);
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '15px' }}>
          <button
            className="btn-back"
            onClick={() => navigate('/products')}
            style={{ margin: 0, padding: "6px 12px", fontSize: "12px", borderRadius: "6px", background: "#f1f5f9", color: "#1e293b", border: "1px solid #cbd5e1", cursor: "pointer", fontWeight: "600" }}
          >
            ← Back
          </button>
          <button
            onClick={handleOpenEdit}
            style={{
              padding: "6px 14px", fontSize: "12px", borderRadius: "6px",
              background: "#0f172a", color: "#fff", border: "none",
              cursor: "pointer", fontWeight: "600", display: "inline-flex", alignItems: "center", gap: 6
            }}
          >
            ✏️ Edit Details
          </button>
        </div>
        <div className="pd-title-row">
          <h1>{product.item_name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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

      {/* Edit Details Modal */}
      {showEditModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{
            background: '#fff', padding: '28px', borderRadius: '16px',
            width: '90%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto',
            position: 'relative', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)'
          }}>
            <button
              style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              onClick={() => setShowEditModal(false)}
            >✕</button>
            <h2 style={{ marginTop: 0, marginBottom: '6px', fontSize: '20px', color: '#0f172a' }}>Edit Item Details</h2>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#64748b' }}>Update master data fields — stock quantity is unchanged</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

              {/* Item Name */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Item Name</label>
                <input
                  value={editForm.item_name}
                  onChange={e => setEditForm(f => ({ ...f, item_name: e.target.value }))}
                  style={inp}
                />
              </div>

              {/* Make */}
              <div>
                <label style={lbl}>Make / Brand</label>
                <input
                  value={editForm.make}
                  placeholder="e.g. Generic, Bosch"
                  onChange={e => setEditForm(f => ({ ...f, make: e.target.value }))}
                  style={inp}
                />
              </div>

              {/* Rack / Storage */}
              <div>
                <label style={lbl}>Rack / Storage ID</label>
                <input
                  value={editForm.rack}
                  placeholder="e.g. A-101"
                  onChange={e => setEditForm(f => ({ ...f, rack: e.target.value, storage_id: e.target.value }))}
                  style={inp}
                />
              </div>

              {/* Lead Time */}
              <div>
                <label style={lbl}>Lead Time (Days)</label>
                <input
                  type="number" min="0"
                  value={editForm.lead_time}
                  onChange={e => setEditForm(f => ({ ...f, lead_time: e.target.value }))}
                  style={inp}
                />
              </div>

              {/* Warranty Expiry */}
              <div>
                <label style={lbl}>Warranty Expiry Date</label>
                <input
                  type="date"
                  value={editForm.warranty_expiry}
                  onChange={e => setEditForm(f => ({ ...f, warranty_expiry: e.target.value }))}
                  style={inp}
                />
              </div>

              {/* ABC */}
              <div>
                <label style={lbl}>ABC Category</label>
                <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} style={inp}>
                  <option value="A">A – High Value</option>
                  <option value="B">B – Medium Value</option>
                  <option value="C">C – Low Value</option>
                </select>
              </div>

              {/* SDE */}
              <div>
                <label style={lbl}>SDE Category</label>
                <select value={editForm.sde} onChange={e => setEditForm(f => ({ ...f, sde: e.target.value }))} style={inp}>
                  <option value="S">S – Scarce</option>
                  <option value="D">D – Difficult</option>
                  <option value="E">E – Easy</option>
                </select>
              </div>

              {/* FSN */}
              <div>
                <label style={lbl}>FSN Category</label>
                <select value={editForm.fsn} onChange={e => setEditForm(f => ({ ...f, fsn: e.target.value }))} style={inp}>
                  <option value="F">F – Fast Moving</option>
                  <option value="S">S – Slow Moving</option>
                  <option value="N">N – Non Moving</option>
                </select>
              </div>

              {/* Unit */}
              <div>
                <label style={lbl}>Unit of Measure</label>
                <input
                  value={editForm.unit}
                  placeholder="e.g. nos, kg, m"
                  onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))}
                  style={inp}
                />
              </div>

              {/* Unit Price */}
              <div>
                <label style={lbl}>Unit Price (₹)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={editForm.unit_price}
                  onChange={e => setEditForm(f => ({ ...f, unit_price: e.target.value }))}
                  style={inp}
                />
              </div>

              {/* Min Stock */}
              <div>
                <label style={lbl}>Min Stock</label>
                <input
                  type="number" min="0"
                  value={editForm.min_stock}
                  onChange={e => setEditForm(f => ({ ...f, min_stock: e.target.value }))}
                  style={inp}
                />
              </div>

              {/* Max Stock */}
              <div>
                <label style={lbl}>Max Stock</label>
                <input
                  type="number" min="0"
                  value={editForm.max_stock}
                  onChange={e => setEditForm(f => ({ ...f, max_stock: e.target.value }))}
                  style={inp}
                />
              </div>

              {/* Safety Stock */}
              <div>
                <label style={lbl}>Safety Stock</label>
                <input
                  type="number" min="0"
                  value={editForm.safety_stock}
                  onChange={e => setEditForm(f => ({ ...f, safety_stock: e.target.value }))}
                  style={inp}
                />
              </div>

              {/* Reorder Qty */}
              <div>
                <label style={lbl}>Reorder Quantity</label>
                <input
                  type="number" min="0"
                  value={editForm.reorder_quantity}
                  onChange={e => setEditForm(f => ({ ...f, reorder_quantity: e.target.value }))}
                  style={inp}
                />
              </div>

              {/* Service Days */}
              <div>
                <label style={lbl}>Service Interval (Days)</label>
                <input
                  type="number" min="0"
                  value={editForm.service_days}
                  onChange={e => setEditForm(f => ({ ...f, service_days: e.target.value }))}
                  style={inp}
                />
              </div>

              {/* Is Machine */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <input
                  type="checkbox"
                  id="edit_is_machine"
                  checked={editForm.is_machine}
                  onChange={e => setEditForm(f => ({ ...f, is_machine: e.target.checked }))}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <label htmlFor="edit_is_machine" style={{ cursor: 'pointer', fontWeight: 600, color: '#1e293b', fontSize: '13px' }}>
                  This item is a Machine / Equipment
                </label>
              </div>

              {/* Description */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Description / Remarks</label>
                <textarea
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  style={{ ...inp, resize: 'vertical' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button
                onClick={submitEdit}
                disabled={editingProduct}
                style={{
                  flex: 1, padding: '13px', background: '#0f172a', color: '#fff',
                  border: 'none', borderRadius: '8px', fontWeight: 'bold',
                  cursor: editingProduct ? 'not-allowed' : 'pointer', transition: 'background 0.2s'
                }}
              >
                {editingProduct ? 'Saving…' : '✓ Save Changes'}
              </button>
              <button
                onClick={() => setShowEditModal(false)}
                style={{
                  padding: '13px 24px', background: '#f1f5f9', color: '#334155',
                  border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: '600', cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
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

// ─── Shared modal style constants ─────────────────────────────────────────────
const lbl = {
  display: 'block',
  fontSize: '11px',
  fontWeight: '700',
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '5px',
};

const inp = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  outline: 'none',
  boxSizing: 'border-box',
  fontSize: '14px',
  color: '#1e293b',
};
