import type { AdminReview, ModerateReviewInput } from "@fido/shared";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { apiFetch } from "../lib/api";

export function ReviewsPage() {
  const [reviews, setReviews] = useState<AdminReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<AdminReview[]>("/admin/reviews")
      .then(setReviews)
      .catch(() => setError("Impossibile caricare le recensioni"));
  }, []);

  useEffect(load, [load]);

  async function handleToggle(review: AdminReview) {
    setActingOn(review.id);
    try {
      await apiFetch<void>(`/admin/reviews/${review.id}/moderate`, {
        method: "PATCH",
        body: { isHidden: !review.isHidden } satisfies ModerateReviewInput,
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
      <h1 className="page-title">Recensioni</h1>
      <p className="page-subtitle">Nascondere una recensione non la cancella e ricalcola subito la valutazione del sitter</p>

      {error && <p className="error-text">{error}</p>}
      {reviews && reviews.length === 0 && <p className="empty-state">Nessuna recensione ancora.</p>}

      {reviews && reviews.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Autore</th>
                <th>Direzione</th>
                <th>Voto</th>
                <th>Commento</th>
                <th>Data</th>
                <th>Stato</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id}>
                  <td>{r.reviewerFirstName}</td>
                  <td>{r.direction === "owner_to_sitter" ? "Owner → Sitter" : "Sitter → Owner"}</td>
                  <td>{"★".repeat(r.rating)}</td>
                  <td style={{ maxWidth: 320 }}>{r.comment ?? "—"}</td>
                  <td>{new Date(r.createdAt).toLocaleDateString("it-IT")}</td>
                  <td>
                    <Badge label={r.isHidden ? "Nascosta" : "Visibile"} tone={r.isHidden ? "negative" : "positive"} />
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm" disabled={actingOn === r.id} onClick={() => handleToggle(r)}>
                      {r.isHidden ? "Ripristina" : "Nascondi"}
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
