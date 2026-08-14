import type { Dispute, ResolveDisputeInput } from "@fido/shared";
import { useCallback, useEffect, useState } from "react";
import { Badge, statusTone } from "../components/Badge";
import { apiFetch } from "../lib/api";

export function DisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    apiFetch<Dispute[]>("/admin/disputes")
      .then(setDisputes)
      .catch(() => setError("Impossibile caricare le dispute"));
  }, []);

  useEffect(load, [load]);

  async function handleResolve(id: string, status: ResolveDisputeInput["status"]) {
    setSubmitting(true);
    try {
      await apiFetch<Dispute>(`/admin/disputes/${id}/resolve`, {
        method: "PATCH",
        body: { status, resolution: resolution.trim() || undefined } satisfies ResolveDisputeInput,
      });
      setOpenId(null);
      setResolution("");
      load();
    } catch {
      alert("Impossibile completare l'azione");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Dispute</h1>
      <p className="page-subtitle">Contestazioni aperte da proprietari o sitter su una prenotazione</p>

      {error && <p className="error-text">{error}</p>}
      {disputes && disputes.length === 0 && <p className="empty-state">Nessuna dispute.</p>}

      {disputes && disputes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {disputes.map((d) => (
            <div key={d.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{d.reason}</div>
                  <div style={{ color: "var(--ink-faint)", fontSize: 12, marginTop: 2 }}>
                    Prenotazione {d.bookingId.slice(0, 8)} · {new Date(d.createdAt).toLocaleDateString("it-IT")}
                  </div>
                </div>
                <Badge label={d.status} tone={statusTone(d.status)} />
              </div>

              {d.description && <p style={{ marginTop: 12 }}>{d.description}</p>}
              {d.resolution && (
                <p style={{ marginTop: 12, color: "var(--ink-muted)" }}>
                  <strong>Risoluzione:</strong> {d.resolution}
                </p>
              )}

              {(d.status === "open" || d.status === "investigating") && (
                <div style={{ marginTop: 16 }}>
                  {openId === d.id ? (
                    <>
                      <div className="field">
                        <label htmlFor={`resolution-${d.id}`}>Nota di risoluzione</label>
                        <textarea
                          id={`resolution-${d.id}`}
                          rows={3}
                          value={resolution}
                          onChange={(e) => setResolution(e.target.value)}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {d.status === "open" && (
                          <button
                            className="btn btn-secondary btn-sm"
                            disabled={submitting}
                            onClick={() => handleResolve(d.id, "investigating")}
                          >
                            Segna in indagine
                          </button>
                        )}
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={submitting}
                          onClick={() => handleResolve(d.id, "resolved")}
                        >
                          Risolvi
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={submitting}
                          onClick={() => handleResolve(d.id, "closed")}
                        >
                          Chiudi senza risoluzione
                        </button>
                      </div>
                    </>
                  ) : (
                    <button className="btn btn-secondary btn-sm" onClick={() => setOpenId(d.id)}>
                      Gestisci
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
