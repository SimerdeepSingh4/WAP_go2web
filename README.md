# WhatsApp & Business Messaging Portal (WAP_go2web)

Welcome to the **WAP_go2web** project documentation! This guide explains what the project does, how everything works under the hood, how both frontend and backend are structured, what packages are used and why, and step-by-step instructions on how to run it.

---

## 📌 1. Project Overview

**WAP_go2web** is a web-based messaging platform designed for WhatsApp and SMS customer outreach. It features a multi-tier hierarchy:
* **Super Admin**: Controls the platform, oversees resellers, and sets system-wide rules.
* **Reseller**: Purchases messaging credits and manages their own client users.
* **User**: The client who creates contacts and runs messaging campaigns.

### Key Security & Account Highlights
* **3-Device Concurrent Session Limit**: A single user credential can only be logged in on a maximum of 3 devices at the same time. If a 4th device logs in, the 1st (oldest) device is automatically logged out (FIFO - First In, First Out).
* **Role-Based Access Control (RBAC)**: Super Admins and Resellers have elevated privileges, with Super Admins having global access.
* **Safe Account Preview Mode**: Resellers and Super Admins can safely preview client user accounts with sensitive actions blocked, and return to their dashboard anytime with one click.
* **Zero Password Leakage**: Passwords are automatically hashed with `bcrypt` in the database model and excluded by default (`select: false`) from all queries.

---

## 🚀 2. How to Run the Project (Step-by-Step)

Make sure you have [Node.js](https://nodejs.org/) installed on your computer.

### Step 1: Start the Backend Server

1. Open your terminal or command prompt.
2. Navigate to the `backend` folder:
   ```bash
   cd backend
   ```
3. Install the dependencies (only needed the first time):
   ```bash
   npm install
   ```
4. Verify your `.env` file exists inside `backend/.env` with your settings:
   ```env
   MONGO_URI = mongodb+srv://...
   JWT_SECRET = your_secret_key_here
   CLIENT_URL = http://localhost:5173
   ```
5. Start the backend server:
   ```bash
   node server.js
   ```
   *(Or run `npm run dev` if you want automatic restarts when code changes).*
6. You will see:
   ```text
   Server is running on port 3000
   Connected to MongoDB
   ```

---

### Step 2: Start the Frontend Application

1. Open a **second** terminal window.
2. Navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```
3. Install the dependencies (only needed the first time):
   ```bash
   npm install
   ```
4. Start the Vite development server:
   ```bash
   npm run dev
   ```
5. Vite will display a local link:
   ```text
   ➜  Local:   http://localhost:5173/
   ```
6. Open your browser and go to `http://localhost:5173`. You will see the login page ready to use!

---

## ⚙️ 3. How the Whole Project Works

Here is a simple breakdown of how data travels between the browser and the server:

```
┌─────────────────────────────────┐
│     React Frontend (Vite)       │
│   • Login Page (Login.jsx)      │
│   • Dashboard & Active Devices  │
│   • Preview Mode Banner         │
└────────────────┬────────────────┘
                 │ HTTP Requests (withCredentials: true)
                 ▼
┌─────────────────────────────────┐
│     Express Backend Server      │
│   • Helmet & CORS Protection    │
│   • Authentication Middleware   │
│   • FIFO 3-Device Eviction      │
│   • Role-Based Access Control   │
└────────────────┬────────────────┘
                 │ Mongoose ODM
                 ▼
┌─────────────────────────────────┐
│       MongoDB Atlas Cloud       │
│   • Users (passwords hashed)    │
│   • Sessions (SHA-256 tokens)   │
└─────────────────────────────────┘
```

1. **User Enters Email/Username & Password**: The login form sends credentials to `POST /api/auth/login`.
2. **Password Verification**: The backend retrieves the user from MongoDB, checks the bcrypt hash, and verifies the password.
3. **3-Device Check (FIFO)**: The backend counts how many active sessions exist for this user:
   * If there are already 3 active sessions, the oldest session document is deleted from MongoDB.
4. **Session Token Created**: A signed JWT is generated, hashed with SHA-256, and saved into the `sessions` collection with an expiration date.
5. **Cookie & Response**: The token is stored in an `httpOnly` secure cookie and returned to the frontend.
6. **Live Verification**: Every time the user opens a page or fetches data, the auth middleware verifies that the session still exists in MongoDB. If that device was evicted, it receives a `401 Unauthorized` and is logged out immediately.

---

## 🗄️ 4. Backend Architecture & Packages (`/backend`)

### Folder Structure
```text
backend/
├── src/
│   ├── config/             # Database connection & environment configuration
│   │   ├── config.js       # Validates and exports process.env keys
│   │   └── db.js           # Connects Mongoose to MongoDB
│   │
│   ├── controllers/        # Business logic for requests
│   │   ├── auth.controller.js  # Register, login, logout, device eviction logic
│   │   └── user.controller.js  # User list, client creation, preview mode switching
│   │
│   ├── middlewares/        # Security & authorization filters
│   │   └── auth.middleware.js  # Token check, DB session check, role authorization
│   │
│   ├── models/             # MongoDB database schemas
│   │   ├── user.model.js       # User schema (roles, pre-save bcrypt hash)
│   │   └── session.model.js    # Session schema (SHA-256 token hash, TTL index)
│   │
│   ├── routes/             # API endpoint definitions
│   │   ├── auth.routes.js      # /api/auth routes
│   │   └── user.routes.js      # /api/users routes
│   │
│   └── app.js              # Express app setup, CORS, Helmet, and route registration
├── .env                    # Secret keys and database URI
├── package.json            # Backend packages and scripts
└── server.js               # Entry point listening on port 3000
```

### Backend Packages Explained
| Package | Why We Use It |
| :--- | :--- |
| **`express`** | The web framework used to create the server, listen for requests, and organize routes. |
| **`mongoose`** | The tool that lets us define schemas and models to store and query data in MongoDB. |
| **`dotenv`** | Reads the secret keys (database URL, JWT secret) from the `.env` file into Node.js. |
| **`bcrypt`** | Cryptographic algorithm used to hash passwords so plain text passwords are never stored. |
| **`jsonwebtoken`** | Creates and verifies signed tokens (JWTs) that represent an active login session. |
| **`cookie-parser`** | Reads and writes cookies in HTTP requests so authentication works automatically. |
| **`cors`** | Allows our React frontend on port `5173` to talk to our backend on port `3000` securely. |
| **`helmet`** | Adds standard HTTP security headers to protect against common web attacks. |
| **`morgan`** | Prints clean request logs in your terminal for debugging (e.g., `POST /api/auth/login 200`). |
| **`multer`** | Middleware ready for handling future file and image uploads. |

### Core API Endpoints
| Method | Route | Access | What It Does |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Registers a new account and creates a session. |
| `POST` | `/api/auth/login` | Public | Logs in via email or username, evicts 4th device if needed. |
| `POST` | `/api/auth/logout` | Logged In | Logs out the current device and deletes session from DB. |
| `POST` | `/api/auth/logout-all`| Logged In | Logs out from **all** devices simultaneously. |
| `GET` | `/api/auth/me` | Logged In | Returns the current user's profile and session details. |
| `GET` | `/api/auth/sessions` | Logged In | Lists all active logged-in devices (up to 3). |
| `GET` | `/api/users` | Admin / Reseller | Lists client user accounts. |
| `POST` | `/api/users` | Admin / Reseller | Creates a new client account under a reseller. |
| `POST` | `/api/users/:id/access`| Admin / Reseller | Enters safe **Preview Mode** for that client account. |
| `POST` | `/api/users/exit-preview`| Admin / Reseller | Exits Preview Mode and restores original admin session. |

---

## 💻 5. Frontend Architecture & Packages (`/frontend`)

The frontend follows the **4-Layer Architecture** so network calls, business logic, state, and UI components remain neat and separated.

### Folder Structure
```text
frontend/
├── src/
│   ├── api/                           # [Layer 4: Network Client]
│   │   └── client.js                  # Axios instance with credentials & 401 interceptor
│   │
│   ├── components/                    # [Layer 1: Shared UI & Guards]
│   │   ├── PreviewBanner.jsx          # Sticky banner shown when previewing an account
│   │   └── RoleRoute.jsx              # Guard that restricts pages by user role
│   │
│   ├── features/                      # Feature modules
│   │   ├── auth/                      # Authentication Feature
│   │   │   ├── auth.context.jsx       # [Layer 2: Application State] TanStack Query cache
│   │   │   ├── components/            # [Layer 1: UI] ActiveDevices live tracker
│   │   │   ├── hooks/                 # [Layer 2: Hook] useAuth hook
│   │   │   ├── pages/                 # [Layer 1: UI] Full-screen Login.jsx
│   │   │   └── services/              # [Layer 4: Data] auth.api.js network calls
│   │   │
│   │   └── dashboard/                 # Dashboard Feature
│   │       ├── pages/                 # ResellerDashboard.jsx
│   │       └── services/              # users.api.js
│   │
│   ├── app.routes.jsx                 # Central router definitions (/login, /, /reseller, /admin)
│   ├── App.jsx                        # Root React component
│   └── main.jsx                       # Entry point with QueryClientProvider
├── package.json                       # Frontend packages and scripts
└── vite.config.js                     # Vite build configuration
```

### Frontend Packages Explained
| Package | Why We Use It |
| :--- | :--- |
| **`react` & `react-dom`** | The core library used to build the interactive user interface. |
| **`react-router`** | Handles navigation and page switching without refreshing the web browser. |
| **`@tanstack/react-query`** | Manages server data caching, background re-fetching, and instant UI updates. |
| **`axios`** | Makes API requests to the backend with automatic cookies and error formatting. |
| **`tailwindcss`** | Fast, responsive CSS utility classes used for styling the entire portal. |
| **`lucide-react`** | High-quality, modern SVG icons for buttons, locks, and badges. |
| **`zustand`** | Minimal client-side state store (available for local UI preferences). |
| **`vite`** | Fast developer server that bundles and runs the React app instantly. |

---

## ✅ 6. What We Have Completed Till Now

- [x] **Backend Authentication**:
  - Registration and Login supporting email or username.
  - Password hashing in `user.model.js` with `pre("save")` hook and `select: false`.
  - SHA-256 session token hashing in MongoDB with TTL auto-expiration.
- [x] **3-Device Concurrent Session Limit**:
  - Strict FIFO eviction policy: 4th device login immediately removes the 1st device.
  - Evicted devices receive a `401 Unauthorized` and are logged out automatically.
- [x] **Role-Based Access Control (RBAC)**:
  - Role inheritance: `Super Admin > Reseller > User`.
  - Backend route protection middleware (`authorizeRoles`).
  - Frontend route protection guard (`<RoleRoute>`).
- [x] **Safe Account Preview Mode**:
  - Resellers and Super Admins can preview user accounts safely.
  - Sticky warning banner with one-click exit to restore manager accounts without lockouts.
- [x] **Full-Screen White-Label Login UI**:
  - Responsive, centered layout that fits desktop screens without scrollbars.
  - Professional, customer-facing campaign workflow copy.
- [x] **Active Devices Live Tracker**:
  - Displays currently logged-in devices with an active pulse indicator and live polling.
- [x] **Multi-Device Logout**:
  - Option to log out of the current device or terminate all active sessions at once.

---

## 🔮 7. Further Steps & Future Roadmap

Here are the logical next features to build:

1. **Individual Device Termination**:
   - Add a "Log out this device" button next to each session in the Active Devices card.
2. **Registration Screen (`Register.jsx`)**:
   - Provide a customer-facing sign-up page matching the login design.
3. **Messaging Campaign Engine**:
   - Template creation and message broadcaster for WhatsApp and SMS.
4. **Contacts & Audience Management**:
   - CSV / Excel contact import and audience list segmentation.
5. **Credit Wallet System**:
   - Enable Resellers to allocate messaging credits to their client users with balance deduction per message.

