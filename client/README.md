# Pets&Claws MVP 1

Pets&Claws is an admin-only animal store platform for stock control, barcode POS, supplier purchase payment tracking, expenses, and dashboard reporting.

## Stack

- React 18, Vite, Tailwind CSS, React Router
- Node.js, Express, PostgreSQL
- Local username/password auth with backend-issued bearer tokens

## MVP Features

- Dashboard with sales, expenses, margin estimate, low stock, out-of-stock, and unpaid supplier purchase totals
- Stock catalog with barcode, kg/piece units, decimal quantities, warning thresholds, cost and sale prices
- Red/yellow/green stock health:
  - Red: quantity is 0 or below
  - Yellow: quantity is above 0 and at/below warning threshold
  - Green: quantity is above warning threshold
- POS barcode entry with cart quantities, per-line discount, total discount, and transactional stock deduction
- Supplier purchases that increase stock and track paid/unpaid status
- Expenses with categories
- Admin setup for categories, suppliers, expense categories, and local admin users

## Setup

Create and migrate the PostgreSQL database:

```bash
psql -U postgres -c "CREATE DATABASE pets_claws;"
psql -U postgres -d pets_claws -f server/db/schema.sql
```

Create `server/.env`:

```env
DATABASE_URL=postgresql://user:password@host:5432/pets_claws
CLIENT_URL=http://localhost:5173
AUTH_SECRET=change-this-in-production
PORT=4000
```

Create `client/.env`:

```env
VITE_API_URL=http://localhost:4000
```

Seed starter animal-store data and admin users:

```bash
cd server
node db/seed-items.js
```

Seeded admin logins:

- `mahound / 1234`
- `labib / 1234`

Run the app:

```bash
cd server
npm run dev
```

```bash
cd client
npm run dev
```

Open `http://localhost:5173`.
