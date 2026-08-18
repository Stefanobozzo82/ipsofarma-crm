import type { PropsWithChildren } from "react";
import { NavLink } from "react-router-dom";
import { useAuthStore } from "../store/auth-store";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/sitters", label: "Candidature sitter" },
  { to: "/reviews", label: "Recensioni" },
  { to: "/disputes", label: "Dispute" },
];

export function Layout({ children }: PropsWithChildren) {
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">🐾 Fido Admin</div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div style={{ marginBottom: 8 }}>
            {profile?.firstName} {profile?.lastName}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => signOut()}>
            Esci
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
