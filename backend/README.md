# Backend Server - WAP_go2web

> [!IMPORTANT]
> ### Instruction for AI Assistants & LLMs
> * Ensure you have first read the root [`/README.md`](../README.md) for full-stack business context, 3-device FIFO session rules, and RBAC inheritance.
> * Follow the existing patterns: password hashing in Mongoose models (`pre("save")` hook), `select: false` on credentials, SHA-256 session token hashing in MongoDB, and `authorizeRoles` middleware.

Welcome to the backend documentation for the **WAP_go2web** platform. This server handles authentication, session management, multi-device limits, role-based permissions, and client management.

---

## 🚀 How to Run the Backend (Step-by-Step)

### Prerequisites
Make sure [Node.js](https://nodejs.org/) (version 18 or newer) is installed on your computer.

### Steps:
1. Open your terminal.
2. Navigate to the backend directory:
   ```bash
   cd backend
   ```
3. Install the dependencies:
   ```bash
   npm install
   ```
4. Verify your `.env` file exists inside `backend/.env` with your credentials:
   ```env
   MONGO_URI = mongodb+srv://...
   JWT_SECRET = your_jwt_secret_key_here
   CLIENT_URL = http://localhost:5173
   ```
5. Start the server:
   ```bash
   node server.js
   ```
   *(Or run `npm run dev` for automatic restarts when editing code).*
6. When successful, the terminal will display:
   ```text
   Server is running on port 3000
   Connected to MongoDB
   ```

---

## 📁 Folder Structure Explained

```text
backend/
├── src/
│   ├── config/             # System configuration
│   │   ├── config.js       # Reads and validates environment variables from .env
│   │   └── db.js           # Establishes the connection to MongoDB using Mongoose
│   │
│   ├── controllers/        # The code that runs when an API route is called
│   │   ├── auth.controller.js  # Registration, login, logout, 3-device eviction logic
│   │   └── user.controller.js  # Managing client users, account preview mode
│   │
│   ├── middlewares/        # Security checkpoints that check requests before they reach controllers
│   │   └── auth.middleware.js  # Verifies JWT, checks session in MongoDB, enforces RBAC
│   │
│   ├── models/             # Database blueprints
│   │   ├── user.model.js       # User document schema (roles, bcrypt password hashing)
│   │   └── session.model.js    # Active sessions schema (SHA-256 token hash, TTL expiry)
│   │
│   ├── routes/             # URL path definitions
│   │   ├── auth.routes.js      # Routes starting with /api/auth
│   │   └── user.routes.js      # Routes starting with /api/users
│   │
│   └── app.js              # Express app setup, CORS, Helmet, and middleware mounting
│
├── .env                    # Secrets and database connection string (kept out of Git)
├── .gitignore              # Files Git should ignore (node_modules, .env, logs)
├── package.json            # Package dependencies and startup scripts
└── server.js               # Starts the HTTP server on port 3000
```

---

## 📦 Packages Used and Why

| Package | Purpose & Why It Is Needed |
| :--- | :--- |
| **`express`** | The web server framework for Node.js. It handles incoming HTTP requests and routes them to our controllers. |
| **`mongoose`** | The database tool for MongoDB. It lets us define strict schemas (like `User` and `Session`) and query documents with ease. |
| **`dotenv`** | Loads secret environment variables from `.env` into `process.env` so passwords aren't hardcoded in files. |
| **`bcrypt`** | Industry-standard password hashing algorithm. It automatically hashes passwords before saving so plain text passwords are never stored. |
| **`jsonwebtoken` (JWT)** | Creates securely signed tokens that prove a user is logged in. |
| **`cookie-parser`** | Reads and sets HTTP-only cookies in the browser for automatic, secure session handling. |
| **`cors`** | Configures Cross-Origin Resource Sharing so our React frontend (`http://localhost:5173`) can communicate with our backend with cookies enabled. |
| **`helmet`** | Sets essential security HTTP headers to defend against clickjacking, cross-site scripting (XSS), and sniffing attacks. |
| **`morgan`** | Logger that prints clean logs in the terminal whenever an API request is made (e.g. `GET /api/auth/login 200`). |
| **`multer`** | Middleware ready to accept image and file uploads. |

---

## 🔒 Key Security Features

### 1. 3-Device Concurrent Session Limit (FIFO)
* Every time a user logs in, the server counts their active sessions in MongoDB.
* If there are already **3 devices logged in**, the oldest session (Device 1) is automatically deleted from MongoDB.
* When Device 1 attempts to make a request, the database check fails and it receives `401 Unauthorized`, logging it out automatically.

### 2. Role-Based Access Control (RBAC) with Inheritance
* **Super Admin (Level 3)**: Has universal access to everything.
* **Reseller (Level 2)**: Can access Reseller features and User features.
* **User (Level 1)**: Can access User features only.
* Routes use the `authorizeRoles("RoleName")` middleware.

### 3. Safe Account Preview Mode
* Super Admins and Resellers can access a client account in **Preview Mode**.
* Preview sessions are tagged with `isPreview: true` and link back to the manager's account.
* Sensitive destructive actions (like password changing or deleting accounts) are blocked during preview.
* `POST /api/users/exit-preview` instantly deletes the temporary preview session and restores the original admin session.

---

## 📋 API Endpoints Reference

### Authentication Routes (`/api/auth`)
* `POST /api/auth/register` - Create a new user account (Admin / Reseller only).
* `POST /api/auth/login` - Authenticate via email/username and password. Enforces 3-device limit.
* `POST /api/auth/logout` - Logs out the current device and deletes session from DB.
* `POST /api/auth/logout-all` - Logs out all active devices simultaneously.
* `GET /api/auth/me` - Returns current user's profile and active session info.
* `GET /api/auth/sessions` - Returns list of active devices (up to 3).

### Client Management Routes (`/api/users`)
* `GET /api/users` - Lists users (Super Admin sees all, Reseller sees their assigned users).
* `POST /api/users` - Creates a new client user under the reseller.
* `GET /api/users/:id` - Returns details of a specific user.
* `POST /api/users/:id/access` - Enters **Preview Mode** for that user account.
* `POST /api/users/exit-preview` - Exits Preview Mode and restores original manager account.

