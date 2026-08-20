import { useEffect, useState } from "react";
import { api } from "../utils/api";
import "../styles/MyWithdrawals.css";

export default function MyWithdrawals() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [search, setSearch] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalTitle, setModalTitle] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get("/all-withdrawals");
      // ✅ Guard against the API returning a non-array (e.g. an error object)
      setHistory(Array.isArray(res.data) ? res.data : []);
      setIsAdmin(true);
    } catch {
      try {
        const res = await api.get("/my-withdrawals");
        setHistory(Array.isArray(res.data) ? res.data : []);
        setIsAdmin(false);
      } catch (err) {
        console.error(err);
        setHistory([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const openSummary = async (w) => {
    setModalOpen(true);
    setModalData(null);
    setModalLoading(true);
    setModalTitle(w.item_name || "Item Summary");
    try {
      const res = await api.get(`/reports/withdrawal-summary/${w.product_id}`);
      setModalData(res.data);
    } catch (err) {
      console.error(err);
      setModalData({ error: "Failed to load history." });
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalData(null);
  };

  const filtered = history.filter((w) =>
    [w.item_name, w.email, w.employee_id_code, w.condition, w.item_category]
      .some((v) => v?.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="withdrawals-container">
      <div className="withdrawals-header">
        <div>
          <h2>{isAdmin ? "All Withdrawals" : "My Withdrawals"}</h2>
          
        </div>
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
      </div>

      {filtered.length === 0 && (
        <div className="empty">No withdrawals found.</div>
      )}

      <div className="withdrawal-list">
        {filtered.map((w) => (
          <div key={w.id} className="withdrawal-card">
            <div className="card-left">
              <div className="icon"></div>

              <div className="card-content">
                {/* Top row: item name + badges */}
                <div className="top-row">
                  <strong>{w.item_name}</strong>
                  <span className="badge-out">OUT</span>
                  {w.item_category && (
                    <span className="badge blue">{w.item_category}</span>
                  )}
                  {w.condition && (
                    <span className="badge green">{w.condition}</span>
                  )}
                </div>

                {/* Info row: qty | employee id | name/email | date */}
                <div className="info-row">
                  <span className="info-chip">
                    <span className="info-label">Qty</span>
                    {w.quantity}
                  </span>

                  {w.employee_id_code && (
                    <span className="info-chip">
                      <span className="info-label">Emp ID</span>
                      {w.employee_id_code}
                    </span>
                  )}

                  {(w.name || w.email) && (
                    <span className="info-chip">
                      <span className="info-label">Name</span>
                      {w.name || w.email}
                    </span>
                  )}

                  <span className="info-chip">
                    <span className="info-label">Date</span>
                    {new Date(w.created_at).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* History button */}
            <button className="summary-btn" onClick={() => openSummary(w)}>
              History
            </button>
          </div>
        ))}
      </div>

      {/* ── MODAL ── */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{modalTitle}</h3>
                <p className="modal-sub">Full withdrawal history</p>
              </div>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>

            {modalLoading && (
              <div className="modal-loading">Loading history...</div>
            )}

            {!modalLoading && modalData?.error && (
              <div className="modal-error">{modalData.error}</div>
            )}

            {!modalLoading && Array.isArray(modalData) && modalData.length === 0 && (
              <div className="modal-loading">No withdrawal records found.</div>
            )}

            {!modalLoading && Array.isArray(modalData) && modalData.length > 0 && (
              <div className="modal-table-wrap">
                <table className="summary-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Item Name</th>
                      <th>Emp ID</th>
                      <th>Name</th>
                      <th>Date</th>
                      <th>Qty</th>
                      <th>Master List</th>
                      <th>Inv. Release</th>
                      <th>Deposit</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalData.map((row, i) => (
                      <tr key={i}>
                        <td className="row-num">{i + 1}</td>
                        <td>{row.item_name}</td>
                        <td><span className="empid-badge">{row.employee_id_code}</span></td>
                        <td>{row.name}</td>
                        <td className="date-cell">
                          {new Date(row.date).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td><strong>{row.qty}</strong></td>
                        <td>{row.master_list}</td>
                        <td className="release-cell">{row.inventory_release}</td>
                        <td className="deposit-cell">{row.deposit}</td>
                        <td
                          className="balance-cell"
                          style={{ color: row.balance <= 0 ? "#ef4444" : "#16a34a" }}
                        >
                          {row.balance}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
