import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { DisputesPage } from "./pages/DisputesPage";
import { LoginPage } from "./pages/LoginPage";
import { ReviewsPage } from "./pages/ReviewsPage";
import { SittersPage } from "./pages/SittersPage";
import { useAuthStore } from "./store/auth-store";

export default function App() {
  const status = useAuthStore((s) => s.status);
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (status === "loading") return <div className="centered">Caricamento…</div>;
  if (status === "signedOut") return <LoginPage />;
  if (status === "forbidden") return <ForbiddenScreen />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/sitters" element={<SittersPage />} />
        <Route path="/reviews" element={<ReviewsPage />} />
        <Route path="/disputes" element={<DisputesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

function ForbiddenScreen() {
  const signOut = useAuthStore((s) => s.signOut);
  return (
    <div className="centered">
      <p>Il tuo account non ha i permessi di amministratore.</p>
      <button className="btn btn-secondary" onClick={() => signOut()}>
        Esci
      </button>
    </div>
  );
}
