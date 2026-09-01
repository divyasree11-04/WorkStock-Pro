import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { isSmsReadOnly, parseJwt, hasSmsWritePermission } from "../utils/auth";
import "../styles/AddProduct.css";


const UNIT_OPTIONS = [
  { label: "Nos / Pieces",     value: "nos",   symbol: "pcs" },
  { label: "Meter (m)",        value: "m",     symbol: "m"   },
  { label: "Kilogram (kg)",    value: "kg",    symbol: "kg"  },
  { label: "Litres (L)",       value: "litres",symbol: "L"   },
  { label: "Square Meter (m²)",value: "m2",    symbol: "m²"  },
  { label: "Square Feet (ft²)",value: "sq_ft", symbol: "ft²" },
  { label: "Milli Meters (mm)",value: "mm",    symbol: "mm"  },
];

const today = () => new Date().toISOString().slice(0, 10);

const formatINR = (n) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

const emptyForm = () => ({
  item_name:   "",
  category:    "C",
  sde:         "S",
  fsn:         "F",
  date:        today(),
  incharge:    "",
  description: "",
});


export default function AddProduct() {
  const navigate     = useNavigate();
  const debounceRef  = useRef(null);

  const [form,          setForm]          = useState(emptyForm);
  const [previewCode,   setPreviewCode]   = useState("UTPLE001");
  const [previewLoading,setPreviewLoading]= useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [submitted,     setSubmitted]     = useState(false);

  const fetchPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await api.get("/products/next-item-code");
      setPreviewCode(res.data?.item_code || "UTPLE001");
    } catch (err) {
      console.error("[AddProduct] next-item-code preview failed:", {
        status: err.response?.status,
        data: err.response?.data,
        url: err.config?.url,
        message: err.message,
      });
      setPreviewCode("UTPLE001");
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreview();
    const token = localStorage.getItem("token");
    if (token) {
      const decoded = parseJwt(token);
      if (decoded) {
        const { name, fullname, employee_id_code, username, employee_uav_id } = decoded;
        const empName = fullname || name;
        const empID = username || employee_uav_id || employee_id_code;
        const incharge = [empID, empName].filter(Boolean).join(" - ");
        if (incharge) setForm(f => ({ ...f, incharge }));
      }
    }
  }, [fetchPreview]);

  const set = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };


  const totalValue = null;

  
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!hasSmsWritePermission("sms_stock_in")) {
      alert("No permissions");
      return;
    }

    const { item_name } = form;

    if (!item_name.trim()) {
      alert("Item Name is required.");
      return;
    }

    
    let itemCode = previewCode;
    try {
      const res = await api.get("/products/next-item-code");
      itemCode = res.data?.item_code || previewCode;
    } catch (err) {
      console.error("[AddProduct] next-item-code (submit-time) failed:", {
        status: err.response?.status,
        data: err.response?.data,
        url: err.config?.url,
        message: err.message,
      });
      
    }

   
    if (itemCode.includes("?")) {
      const proceed = window.confirm(
        "Couldn't reach the item-code generator, so no real code could be " +
        "created (check the browser console for the error). Save anyway " +
        "with a placeholder code, or cancel and try again once the " +
        "connection issue is fixed?"
      );
      if (!proceed) return;
    }

    const payload = {
      ...form,
      item_code:   itemCode,
      quantity:    0,
      unit_price:  0,
      total_price: 0,
      uom:         "",
    };

    try {
      await api.post("/products", payload);
      setGeneratedCode(itemCode);
      setSubmitted(true);
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message;
      alert("Error saving item: " + msg);
    }
  };

  
  const handleReset = () => {
    const fresh = { ...emptyForm() };
    setForm(fresh);
    setGeneratedCode("");
    setSubmitted(false);
    fetchPreview();

    const token = localStorage.getItem("token");
    if (token) {
      const decoded = parseJwt(token);
      if (decoded) {
        const { name, fullname, employee_id_code, username, employee_uav_id } = decoded;
        const empName = fullname || name;
        const empID = username || employee_uav_id || employee_id_code;
        const incharge = [empID, empName].filter(Boolean).join(" - ");
        setForm(f => ({ ...f, incharge }));
      }
    }
  };

  
  return (
    <div className="ap-shell">
      <main className="ap-main">

       
        <div className="ap-page-head">
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              type="button"
              onClick={() => navigate(-1)}
              style={{
                background: "none", border: "none", padding: 8,
                cursor: "pointer", color: "#64748b", fontSize: 24, lineHeight: 1,
              }}
              title="Go back"
            >←</button>
            <div>
              <h1 className="ap-page-title">Item Registration</h1>
              <p className="ap-page-sub">
                Fields marked <span className="req">*</span> are required
              </p>
            </div>
          </div>
          <div className="ap-breadcrumb">
            Dashboard / Stock Entry / <strong>Item Registration</strong>
          </div>
        </div>

        
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          background: "linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)",
          borderRadius: 14, padding: "18px 24px", marginBottom: 24,
          boxShadow: "0 4px 20px rgba(15,23,42,0.25)",
        }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "1px", color: "#94a3b8" }}>
              Item Code Preview
            </p>
            <div style={{
              fontSize: 30, fontWeight: 800, letterSpacing: 4, marginTop: 6,
              color: previewLoading ? "#475569" : "#38bdf8",
              fontFamily: "'Roboto Mono', 'Courier New', monospace",
              transition: "color 0.2s",
            }}>
              {previewLoading ? "Loading…" : previewCode}
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>
              Updates live as you fill in the fields below
            </p>
          </div>
          <div style={{
            background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)",
            borderRadius: 10, padding: "10px 16px", textAlign: "center",
          }}>
            <p style={{ margin: 0, fontSize: 10, color: "#64748b",
              textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Entry Date</p>
            <p style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>
              {form.date}
            </p>
          </div>
        </div>

        <form className="ap-form" onSubmit={handleSubmit} noValidate>

         
          <div className="ap-card" style={{ padding: "32px", borderRadius: "16px" }}>
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a", letterSpacing: "0.5px" }}>Item Registration Details</h2>
              <div style={{ height: "2px", width: "60px", background: "#38bdf8", margin: "12px auto 0", borderRadius: "2px" }}></div>
            </div>

            <div className="ap-grid ap-grid-2">
              {/* Item Name */}
              <div className="ap-field" style={{ gridColumn: "1 / -1" }}>
                <label>Item Name <span className="req">*</span></label>
                <input
                  name="item_name"
                  value={form.item_name}
                  onChange={set}
                  placeholder="e.g. MS Angle 50×50×5 mm"
                  required
                  autoFocus
                />
                <span style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, display: "block" }}>
                  Item code is auto-generated based on user role (UTPLS for Super Admin, UTPLA for Admin, UTPLE for Employee)
                </span>
              </div>

              {/* ABC */}
              <div className="ap-field">
                <label>
                  <span style={{ fontWeight: 800, color: "#3b82f6" }}>ABC</span>
                  &nbsp;— Value Category <span className="req">*</span>
                </label>
                <select name="category" value={form.category} onChange={set} required>
                  <option value="A">A  High Value (Engines, Batteries, Frames…)</option>
                  <option value="B">B  Medium Value (Motors, Sensors, GPS…)</option>
                  <option value="C">C  Low Value (Screws, Zip ties, Consumables…)</option>
                </select>
              </div>

              {/* SDE */}
              <div className="ap-field">
                <label>
                  <span style={{ fontWeight: 800, color: "#8b5cf6" }}>SDE</span>
                  &nbsp;— Lead Time Category <span className="req">*</span>
                </label>
                <select name="sde" value={form.sde} onChange={set} required>
                  <option value="S">S - Scarce (long lead, hard to source)</option>
                  <option value="D">D - Difficult (moderate lead time)</option>
                  <option value="E">E - Easy (readily available, short lead)</option>
                </select>
              </div>

              {/* FSN */}
              <div className="ap-field">
                <label>
                  <span style={{ fontWeight: 800, color: "#10b981" }}>FSN</span>
                  &nbsp;— Usage Category <span className="req">*</span>
                </label>
                <select name="fsn" value={form.fsn} onChange={set} required>
                  <option value="F">F - Fast moving (high usage rate)</option>
                  <option value="S">S - Slow moving (moderate usage)</option>
                  <option value="N">N - Non-moving (rarely consumed)</option>
                </select>
              </div>

             
              <div className="ap-field">
                <label>Registered By (EmpID - Name)</label>
                <input
                  name="incharge"
                  value={form.incharge}
                  readOnly
                  style={{ backgroundColor: "#f1f5f9", cursor: "not-allowed" }}
                />
              </div>

              {/* The fields for Quantity, Unit, Price, Min/Critical Stock have been moved to Batch Creation */}
            </div>

          
            {totalValue !== null && (
              <div style={{
                marginTop: 24, padding: "16px 20px",
                background: "linear-gradient(90deg,#f0fdf4,#ecfdf5)",
                borderRadius: 12, border: "1.5px solid #bbf7d0",
                display: "flex", alignItems: "center", gap: 16,
              }}>
                <span style={{ fontSize: 24 }}></span>
                <div>
                  <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Total Stock Value
                  </span>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>
                    ₹{formatINR(totalValue)}
                  </div>
                </div>
                <div style={{ marginLeft: "auto", fontSize: 13, color: "#4ade80", fontWeight: 600 }}>
                  {form.quantity} × ₹{form.unit_price}
                </div>
              </div>
            )}
          </div>

          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 16 }}>
            <button
              type={submitted ? "button" : "submit"}
              onClick={submitted ? handleReset : undefined}
              style={{
                padding: "20px 24px", borderRadius: "16px",
                border: submitted ? "2px solid #10b981" : "2px solid #0f172a",
                background: submitted ? "#10b981" : "#fff",
                color: submitted ? "#fff" : "#0f172a",
                fontSize: "16px", fontWeight: "700",
                cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 6, transition: "all 0.2s",
                boxShadow: submitted ? "0 4px 14px rgba(16,185,129,0.3)" : "none",
              }}
            >
              {submitted ? "✓ Add Another Item" : "Register New Item"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/products")}
              style={{
                padding: "16px 24px", borderRadius: "16px",
                border: "2px solid #0f172a", background: "#fff",
                color: "#0f172a", fontSize: "16px", fontWeight: "700",
                cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 6, transition: "all 0.2s", textAlign: "center"
              }}
            >
              <span>Go To Master List to Add Batches</span>
              <span style={{ fontSize: "12px", color: "#475569", fontWeight: "500" }}></span>
            </button>
          </div>

          {/* ── Success: generated code banner ── */}
          {submitted && generatedCode && (
            <div style={{
              marginTop: 24, padding: "28px 24px", borderRadius: 16,
              background: "linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)",
              boxShadow: "0 8px 30px rgba(15,23,42,0.3)",
              textAlign: "center",
              animation: "fadeIn 0.4s ease",
            }}>
              <p style={{ margin: 0, fontSize: 12, color: "#94a3b8",
                letterSpacing: "2px", textTransform: "uppercase", fontWeight: 700 }}>
                 Item Registered — Generated Code
              </p>
              <div style={{
                fontSize: 38, fontWeight: 900, letterSpacing: 6, marginTop: 14,
                color: "#38bdf8",
                fontFamily: "'Roboto Mono','Courier New',monospace",
                textShadow: "0 0 30px rgba(56,189,248,0.4)",
              }}>
                {generatedCode}
              </div>
              <p style={{ margin: "12px 0 0", fontSize: 13, color: "#64748b" }}>
                This code is saved to the item. It will reset on page refresh or when you add a new item.
              </p>
            </div>
          )}

        </form>
      </main>
    </div>
  );
}