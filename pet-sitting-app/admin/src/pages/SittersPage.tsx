import type { ApproveSitterInput, PendingSitterApplication } from "@fido/shared";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export function SittersPage() {
  const [applications, setApplications] = useState<PendingSitterApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<PendingSitterApplication[]>("/admin/sitters/pending")
      .then(setApplications)
      .catch(() => setError("Impossibile caricare le candidature"));
  }, []);

  useEffect(load, [load]);

  async function handleDecision(userId: string, approve: boolean) {
    if (!approve && !confirm("Rifiutare questa candidatura?")) return;
    setActingOn(userId);
    try {
      await apiFetch<void>(`/admin/sitters/${userId}/approve`, {
        method: "PATCH",
        body: { approve } satisfies ApproveSitterInput,
      });
      load();
    } catch {
      alert("Impossibile completare l'azione");
    } finally {
      setActingOn(null);
    }
  }

  return (
    <div>
      <h1 className="page-title">Candidature sitter</h1>
      <p className="page-subtitle">Accettazione selettiva — vedi docs/PHASE1-PROPOSAL.md</p>

      {error && <p className="error-text">{error}</p>}

      {applications && applications.length === 0 && <p className="empty-state">Nessuna candidatura in attesa.</p>}

      {applications && applications.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Bio</th>
                <th>Esperienza</th>
                <th>Zona</th>
                <th>Candidatura</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app.userId}>
                  <td>
                    {app.firstName} {app.lastName}
                  </td>
                  <td>{app.email}</td>
                  <td style={{ maxWidth: 280 }}>{app.bio}</td>
                  <td>{app.experienceYears} anni</td>
                  <td>
                    {app.address} ({app.serviceRadiusKm} km)
                  </td>
                  <td>{new Date(app.createdAt).toLocaleDateString("it-IT")}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ marginRight: 8 }}
                      disabled={actingOn === app.userId}
                      onClick={() => handleDecision(app.userId, false)}
                    >
                      Rifiuta
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={actingOn === app.userId}
                      onClick={() => handleDecision(app.userId, true)}
                    >
                      Approva
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
