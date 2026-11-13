# Frontend Application - WAP_go2web

> [!IMPORTANT]
> ### Instruction for AI Assistants & LLMs
> * Ensure you have first read the root [`/README.md`](../README.md) for full-stack business context, 3-device FIFO session rules, and RBAC inheritance.
> * Maintain the **4-Layer Architecture** strictly: UI (`components/pages`) $\rightarrow$ State (`hooks/context`) $\rightarrow$ Domain Guards (`RoleRoute/PreviewBanner`) $\rightarrow$ Network (`api/services`).
> * State Management: Use **TanStack Query** for server state (fetching, caching, mutations) and **Zustand** for client-only UI state (sidebar, modals, filters, local toggles). Do not introduce redundant `useEffect` or manual `fetch` calls in UI components.

Welcome to the frontend documentation for the **WAP_go2web** platform. This application is a React single-page app built with Vite, Tailwind CSS, and TanStack Query, following the **4-Layer Architecture**.

---

## 🚀 How to Run the Frontend (Step-by-Step)

### Prerequisites
Make sure [Node.js](https://nodejs.org/) (version 18 or newer) is installed and your backend server is running on `http://localhost:3000`.

### Steps:
1. Open your terminal.
2. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the Vite development server:
   ```bash
   npm run dev
   ```
5. Open your web browser and navigate to:
   ```text
   http://localhost:5173
   ```
6. You will see the login page ready to use!

---

## 📁 4-Layer Architecture Explained

The frontend is organized into 4 distinct layers to keep the code clean, modular, and easy to maintain:

```text
┌────────────────────────────────────────────────────────┐
│ 1. Presentation Layer (Pages & Components)             │
│    Login.jsx, ResellerDashboard.jsx, ActiveDevices.jsx │
└──────────────────────────┬─────────────────────────────┘
                           │ uses
┌──────────────────────────▼─────────────────────────────┐
│ 2. Application / State Layer (Hooks & Context)         │
│    context/auth.context.jsx, useAuth.js                        │
└──────────────────────────┬─────────────────────────────┘
                           │ calls
┌──────────────────────────▼─────────────────────────────┐
│ 3. Domain Rules Layer (Guards & Helpers)               │
│    RoleRoute.jsx, PreviewBanner.jsx                    │
└──────────────────────────┬─────────────────────────────┘
                           │ triggers
┌──────────────────────────▼─────────────────────────────┐
│ 4. Infrastructure / Data Layer (API Clients)           │
│    api/client.js, auth.api.js, users.api.js            │
└────────────────────────────────────────────────────────┘
```

### Folder Breakdown
```text
frontend/
├── src/
│   ├── api/                           # [Layer 4: Shared Network Client]
│   │   └── client.js                  # Axios instance with credentials: true & 401 interceptor
│   │
│   ├── components/                    # [Layer 1 & 3: Shared Components & Guards]
│   │   ├── PreviewBanner.jsx          # Sticky banner shown when previewing another account
│   │   └── RoleRoute.jsx              # Route guard that protects pages based on user role
│   │
│   ├── features/                      # Feature modules
│   │   ├── auth/                      # Authentication Feature
│   │   │   ├── context/auth.context.jsx       # [Layer 2] TanStack Query authentication cache
│   │   │   ├── components/            # [Layer 1] ActiveDevices.jsx live device monitor
│   │   │   ├── hooks/                 # [Layer 2] useAuth.js custom hook
│   │   │   ├── pages/                 # [Layer 1] Login.jsx full-screen white-label login
│   │   │   └── services/              # [Layer 4] auth.api.js API calls
│   │   │
│   │   └── dashboard/                 # Dashboard Feature
│   │       ├── pages/                 # ResellerDashboard.jsx client management console
│   │       └── services/              # users.api.js API calls
│   │
│   ├── app.routes.jsx                 # Central router definitions (/login, /, /reseller, /admin)
│   ├── App.jsx                        # Root React component
│   ├── index.css                      # Global styles and Tailwind imports
│   └── main.jsx                       # Entry point wrapped with QueryClientProvider
│
├── package.json                       # Dependencies and build scripts
└── vite.config.js                     # Vite configuration
```

---

## 📦 Packages Used and Why

| Package | Purpose & Why It Is Needed |
| :--- | :--- |
| **`react` & `react-dom`** | The UI library used to build reusable components, manage state, and render views. |
| **`react-router`** | The client-side router that switches between pages (`/login`, `/`, `/reseller`, `/admin`) without refreshing the browser. |
| **`@tanstack/react-query`** | Handles server data fetching, automatic caching, background re-fetching, and mutation loading states. |
| **`axios`** | Makes HTTP requests to the backend server with `withCredentials: true` so session cookies are automatically sent. |
| **`tailwindcss`** | Utility-first CSS framework for fast, responsive, and maintainable styling. |
| **`shadcn`** | Accessible, customizable component system that provides pre-styled UI building blocks (buttons, dialogs, inputs) directly inside our project. |
| **`lucide-react`** | High-quality icons for UI buttons, badges, status indicators, and security locks. |
| **`zustand`** | Minimal client-side store (available for local UI preferences). |
| **`vite`** | The lightning-fast build tool and local dev server that powers instant hot-reloading. |

---

## 🛡️ Key Frontend Features & Route Guards

### 1. Route Protection (`ProtectedRoute` & `PublicRoute`)
* **`ProtectedRoute`**: Only logged-in users can view the dashboard. If not logged in, redirects to `/login`.
* **`PublicRoute`**: Keeps logged-in users from seeing the `/login` page again, redirecting them straight to the dashboard.

### 2. Role-Based Route Guard (`<RoleRoute allowedRoles={[...]} />`)
* Protects administrative and reseller routes.
* Follows role inheritance: `Super Admin > Reseller > User`.
* If a regular user tries to open `/admin` or `/reseller`, it displays an **Access Restricted (403)** screen with a button to return to their dashboard.

### 3. Account Preview Mode & Banner (`<PreviewBanner />`)
* When a Super Admin or Reseller accesses a client user account, a prominent sticky banner appears at the very top of the screen:
  ```text
  PREVIEW MODE: Viewing client account: client_name. Actions are limited. [Exit Preview Mode ✕]
  ```
* Clicking **`[Exit Preview Mode ✕]`** immediately restores the manager's original session and redirects back to the reseller/admin panel without getting locked out.

### 4. Active Devices Live Tracker (`<ActiveDevices />`)
* Polls `GET /api/auth/sessions` every 3 seconds.
* Displays all active devices (up to 3) with a green live pulse indicator and highlights **"This Device"**.
* Allows users to test multi-device login in real-time across different browsers or incognito tabs.
