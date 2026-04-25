# grabber — 買票系統

A ticket-grabbing system backed by MySQL.

## Prerequisites

- Node.js 18+
- MySQL 8.0+

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your MySQL credentials
```

### 3. Initialize the database

```bash
npm run db:init
```

This runs `db/schema.sql` against your MySQL server and creates all tables.

### 4. Start the app

```bash
npm start
```

---

## Database Schema

| Table     | Description                              |
|-----------|------------------------------------------|
| `events`  | Concert / event listings                 |
| `users`   | Registered buyers                        |
| `tickets` | Individual seats per event               |
| `orders`  | Purchase records linking users ↔ tickets |

See [`db/schema.sql`](db/schema.sql) for the full DDL.

---

## Environment Variables

| Variable      | Default     | Description              |
|---------------|-------------|--------------------------|
| `DB_HOST`     | `localhost` | MySQL host               |
| `DB_PORT`     | `3306`      | MySQL port               |
| `DB_USER`     | `root`      | MySQL username           |
| `DB_PASSWORD` | —           | MySQL password           |
| `DB_NAME`     | `grabber`   | Database name            |

---

## File Structure

```
grabber/
├── db/
│   └── schema.sql          # DDL — run once to init the DB
├── src/
│   ├── db/
│   │   ├── connection.js   # mysql2 connection pool
│   │   └── migrate.js      # DB initialisation script
│   └── index.js            # App entry point
├── .env.example
├── .gitignore
└── package.json
```
