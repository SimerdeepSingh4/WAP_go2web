import { getGreeting } from "@/lib/greeting";

export default function DashboardGreeting({ username, description, action }) {
  const greeting = getGreeting();

  return <header className="portal-greeting">
    <div className="portal-greeting-copy">
      <div className="portal-greeting-text">
        <p className="portal-greeting-label">Overview</p>
        <h1>{greeting}, <span>{username}.</span></h1>
        <p className="portal-greeting-description">{description}</p>
      </div>
    </div>
    <div className="portal-page-actions">{action}</div>
  </header>;
}
