import { Scanner } from "@yudiel/react-qr-scanner";
import { useState } from "react";
import "../styles/QRScanner.css";
import WithdrawForm from "./WithdrawForm"; 

export default function QRScanner() {
  const [scannedId, setScannedId]   = useState(null); 
  const [scanned, setScanned]       = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [manualId, setManualId]     = useState("");

  const handleScan = (results) => {
    if (scanned) return;
    if (!Array.isArray(results) || results.length === 0) return;
    const rawValue = results[0]?.rawValue;
    if (!rawValue) return;


    let id = null;
    try {
      const parsed = JSON.parse(rawValue);
      if (parsed.id) id = parsed.id;
    } catch {
      const parts = rawValue.split("/");
      id = parseInt(parts[parts.length - 1]);
    }

    if (id && !isNaN(id) && id > 0) {
      setScanned(true);
      setScannedId(id); 
    }
  };

  const handleError = (err) => {
   if (err?.name === "NotFoundError")
  setCameraError("No camera found on this device.");
else if (err?.name === "NotAllowedError")
  setCameraError("Camera permission denied...");
else if (err?.name === "NotReadableError")
  setCameraError("Camera is in use by another app...");
else
  setCameraError("Camera unavailable: " + err?.message);
  };

  const handleBack = () => {
    setScannedId(null);
    setScanned(false);
    setCameraError("");
    setManualId("");
  };

  
  if (scannedId) {
    return <WithdrawForm scannedProductId={scannedId} onBack={handleBack} />;
  }

  
  return (
    <div className="qr-container">
      <h2 className="qr-title">Scan Product QR</h2>

      {cameraError ? (
        <div style={{ background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, padding: 16, textAlign: "center" }}>
          <p style={{ color: "#856404", margin: "0 0 12px" }}> {cameraError}</p>

          
          <div style={{ display: "flex", gap: 8, marginBottom: 12, justifyContent: "center" }}>
            <input
              type="number" placeholder="Enter Product ID" min="1"
              value={manualId}
              onChange={e => { if (e.target.value === "" || parseInt(e.target.value) > 0) setManualId(e.target.value); }}
              onKeyDown={e => { if (e.key === "Enter" && manualId) { setScannedId(parseInt(manualId)); setScanned(true); } }}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14, width: 180 }}
            />
            <button
              onClick={() => { if (manualId) { setScannedId(parseInt(manualId)); setScanned(true); } }}
              style={{ padding: "8px 16px", background: "#1976d2", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700 }}>
              Load
            </button>
          </div>

          <button onClick={() => setCameraError("")}
            style={{ padding: "6px 16px", background: "#555", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
            Retry Camera
          </button>
        </div>
      ) : (
        <Scanner
          onScan={handleScan}
          onError={handleError}
          constraints={{ facingMode: "environment" }}
          styles={{ container: { width: "100%", height: "300px" } }}
        />
      )}
    </div>
  );
}
