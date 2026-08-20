import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: "abed33001@smtp-brevo.com",
    pass: "bskdU8GjRW2tcdq"
  }
});

const SENDER = '"WorkStock Pro" <divya.sree@uavtech.ai>';

export const sendProductNotification = async (product) => {
  try {
    const info = await transporter.sendMail({
      from: SENDER,
      to: "divya.sree@uavtech.ai",
      subject: `New Product Added: ${product.item_name}`,
      html: `<p>New item added: <strong>${product.item_name}</strong></p>`
    });
    console.log(" Notification email sent:", info.messageId);
  } catch (error) {
    console.error(" Failed to send notification email:", error.message);
  }
};

export const sendStockOutWarningEmail = async (product, daysRemaining, dailyRate) => {
  const estStockOutDate = new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000);
  const formattedDate = estStockOutDate.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  try {
    const info = await transporter.sendMail({
      from: SENDER,
      to: "divya.sree@uavtech.ai",
      subject: ` Stock depletion warning: ${product.item_name} (${daysRemaining.toFixed(1)} days remaining)`,
      html: `<p><strong>${product.item_name}</strong> will run out in <strong>${daysRemaining.toFixed(1)} days</strong> (Est. date: ${formattedDate}). Daily rate: ${dailyRate.toFixed(2)} units/day.</p>`
    });
    console.log(" Stock-out warning email sent:", info.messageId);
  } catch (error) {
    console.error(" Failed to send stock-out warning email:", error.message);
  }
};

export const sendLowStockAlertEmail = async (recipients, items) => {
  if (!recipients || recipients.length === 0) {
    console.log(" No recipients for low stock alert email");
    return;
  }

  const itemsTableRows = items.map(item => {
    const qty = parseFloat(item.quantity);
    const minStock = parseFloat(item.min_stock) || 5;
    const isCritical = qty <= 2;
    const badgeColor = isCritical ? "#dc2626" : "#d97706";
    const badgeBg = isCritical ? "#fee2e2" : "#fef3c7";
    return `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;font-weight:600;">${item.item_name}</td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:center;color:${badgeColor};font-weight:bold;">${qty} ${item.unit || ""}</td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:center;">${minStock}</td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:center;">
          <span style="background:${badgeBg};color:${badgeColor};padding:4px 10px;border-radius:12px;font-size:11px;font-weight:700;">
            ${isCritical ? "Critical" : "Low Stock"}
          </span>
        </td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;">${item.incharge || "N/A"}</td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:center;">${item.rack || "N/A"}</td>
      </tr>`;
  }).join("");

  try {
    const info = await transporter.sendMail({
      from: SENDER,
      to: recipients.join(", "),
      subject: ` Low Stock Alert: ${items.length} items require replenishment`,
      html: `
        <div style="font-family:'Segoe UI',sans-serif;max-width:800px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#ef4444,#b91c1c);color:white;padding:25px;text-align:center;">
            <h2 style="margin:0;"> Low Stock Alert Report</h2>
            <p style="margin:5px 0 0;opacity:0.9;">Immediate inventory replenishment required</p>
          </div>
          <div style="padding:24px;">
            <p>Hello Team,</p>
            <p>The following items have fallen below minimum stock thresholds:</p>
            <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:12px;text-align:left;">Item Name</th>
                  <th style="padding:12px;text-align:center;">Current Stock</th>
                  <th style="padding:12px;text-align:center;">Min Stock</th>
                  <th style="padding:12px;text-align:center;">Status</th>
                  <th style="padding:12px;text-align:left;">Incharge</th>
                  <th style="padding:12px;text-align:center;">Rack</th>
                </tr>
              </thead>
              <tbody>${itemsTableRows}</tbody>
            </table>
          </div>
          <div style="background:#f8fafc;padding:15px;text-align:center;font-size:12px;color:#94a3b8;">
            Automated alert by WorkStock Pro Inventory System
          </div>
        </div>`
    });
    console.log(" Low stock alert email sent:", info.messageId);
    return info;
  } catch (error) {
    console.error(" Failed to send low stock alert email:", error.message);
    throw error;
  }
};