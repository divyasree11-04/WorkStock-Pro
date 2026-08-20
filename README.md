# UAV Store Management System (SMS)

A real-time stock visibility and traceability system for UAV parts and machine inventory.

## Features
- **Real-time Dashboard**: Overview of stock health, KPI cards, and low-stock alerts.
- **Stock Withdrawal (OUT)**: Issue items from store with QR scanning support.
- **Stock Return (IN)**: Return items back to store with QR scanning support.
- **QR Scanning**: Seamless inventory management using mobile/web cameras.
- **Admin Control Panel**: Manage products, categories, and audit trails.
- **Reporting**: Export stock history to CSV/PDF/Excel.
- **Role-based Access**: Separate dashboards for Admin and Staff.

## Tech Stack
- **Frontend**: React (Vite), React Router, Axios, QR Scanner.
- **Backend**: Node.js, Express, PostgreSQL.
- **Authentication**: JWT (JSON Web Tokens).

## Setup Instructions

### Backend
1. Navigate to the `backend` folder.
2. Install dependencies: `npm install`.
3. Create a `.env` file (see `.env.example`).
4. Initialize the database: `npm run db:init`.
5. Start the server: `npm run dev`.

### Frontend
1. Navigate to the `frontend` folder.
2. Install dependencies: `npm install`.
3. Start the development server: `npm run dev`.

## License
MIT
