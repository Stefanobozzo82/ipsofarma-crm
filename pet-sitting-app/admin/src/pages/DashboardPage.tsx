import type { AdminStats } from "@fido/shared";
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export function DashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<AdminStats>("/admin/stats")
      .then(setStats)
      .catch(() => setError("Impossibile caricare le statistiche"));
  }, []);

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Panoramica della piattaforma</p>

      {error && <p className="error-text">{error}</p>}

      {stats && (
        <div className="stat-grid">
          <StatTile label="Utenti totali" value={stats.totalUsers} />
          <StatTile label="Sitter approvati" value={stats.totalSitters} />
          <StatTile label="Candidature in coda" value={stats.pendingSitterApplications} highlight={stats.pendingSitterApplications > 0} />
          <StatTile label="Prenotazioni totali" value={stats.totalBookings} />
          <StatTile label="Servizi completati" value={stats.completedBookings} />
          <StatTile label="GMV (incassato)" value={`${stats.grossMerchandiseValue.toFixed(2)}€`} />
          <StatTile label="Dispute aperte" value={stats.openDisputes} highlight={stats.openDisputes > 0} />
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="card">
      <div className="stat-value" style={{ color: highlight ? "var(--amber)" : "var(--ink)" }}>
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
