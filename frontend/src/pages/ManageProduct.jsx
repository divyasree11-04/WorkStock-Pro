import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../utils/api";
import { isSmsReadOnly, hasSmsWritePermission } from "../utils/auth";
import "../styles/ManageProduct.css";

export default function ManageProduct() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!id || isNaN(id)) {
      console.warn("[ManageProduct] mounted with invalid id:", id);
      return;
    }
    fetchProduct();
    fetchHistory();
  }, [id]);

  const fetchProduct = () => {
    api.get(`/products/${id}`)
      .then(res => setProduct(res.data))
      .catch(() => alert("Product not found"));
  };

  const fetchHistory = () => {
  api.get(`/reports/transactions/${id}`) 
    .then(res => setHistory(res.data))
    .catch(err => console.log("History not available yet"));
};

  const handleAction = async (type) => {
    const feature = type === "IN" ? "sms_stock_in" : "sms_withdrawal";
    if (!hasSmsWritePermission(feature)) {
      alert("No permissions");
      return;
    }
    setLoading(true);
    const endpoint = type === "IN" ? "/stock-in" : "/stock-out";
    try {
      await api.post(endpoint, { productId: id, quantity });
      fetchProduct(); 
      fetchHistory();
      alert(`System Updated: ${type === "IN" ? "Deposit" : "Withdrawal"} successful.`);
    } catch (err) {
      alert(err.response?.data?.message || "Transaction Error");
    } finally {
      setLoading(false);
    }
  };

  if (!product) return <div className="loader">Initializing Secure Session...</div>;

  return (
  <div className="manage-container">
    <div className="glass-card">
      <header className="card-header">
        <button className="back-btn" onClick={() => navigate('/products')}>Back</button>
        <span className="badge">SKU: {id.padStart(4, '0')}</span>
      </header>

      <section className="product-info">
        
        <h1 className="item-title">{product.item_name}</h1>
        
        <div className="stock-display">
          <span className="stock-label">Current Inventory</span>
          <span className={`stock-value ${product.quantity < 5 ? 'low' : ''}`}>
            {product.quantity} <small>{product.unit || 'units'}</small>
          </span>
        </div>
      </section>

      <section className="transaction-zone">
        <div className="input-group">
          <label className="input-label">Transaction Amount</label>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            className="qty-input"
          />
        </div>

        <div className="activity-feed">
          <h3 className="feed-title">RECENT LOGS</h3>
                  {history.map((log, i) => (
          <div key={i} className="feed-item">
            
            <span><strong>{log.employee_id_code || (log.email ? log.email.split('@')[0] : 'Staff')}</strong></span>
            <span className={log.type === 'IN' ? 'text-green' : 'text-red'}>
              {log.type}: {log.quantity}
            </span>
          </div>
        ))}
        </div>

        <div className="action-buttons">
          <button className="btn btn-deposit" onClick={() => handleAction("IN")} disabled={loading}>
            Confirm Deposit (+)
          </button>
          <button 
            className="btn btn-withdraw" 
            onClick={() => handleAction("OUT")} 
            disabled={loading || product.quantity < quantity}
          >
            Confirm Withdrawal (-)
          </button>
        </div>
      </section>

      <footer className="card-footer">
        <p>EmpID & Name: <strong>{product.incharge || 'Staff'}</strong></p>
        <p className="timestamp">Last Updated: {new Date().toLocaleTimeString()}</p>
      </footer>
    </div>
  </div>
);
}