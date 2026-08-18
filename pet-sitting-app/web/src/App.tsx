import { lazy, Suspense, useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { useAuthStore } from "@/store/auth-store";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { HomePage } from "@/pages/HomePage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { AccountPage } from "@/pages/AccountPage";
import { BecomeSitterPage } from "@/pages/BecomeSitterPage";
import { SitterServicesPage } from "@/pages/SitterServicesPage";
import { SitterProfilePage } from "@/pages/SitterProfilePage";
import { BookingNewPage } from "@/pages/BookingNewPage";
import { MessagesPage } from "@/pages/MessagesPage";
import { ChatPage } from "@/pages/ChatPage";
import { LoadingView } from "@/components/ui/LoadingView";
import { NotificationsWatcher } from "@/components/notifications/NotificationsWatcher";

// Solo questa pagina importa @stripe/stripe-js (~150kB gzip) — lazy così
// chi visita solo la homepage o la scheda sitter non lo scarica mai. Le
// altre pagine sono leggere e restano importate staticamente, come prima.
const BookingStatusPage = lazy(() =>
  import("@/pages/BookingStatusPage").then((m) => ({ default: m.BookingStatusPage })),
);

export function App() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div className="flex min-h-screen flex-col">
      <NotificationsWatcher />
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/accedi" element={<LoginPage />} />
          <Route path="/registrati" element={<RegisterPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/diventa-sitter" element={<BecomeSitterPage />} />
          <Route path="/diventa-sitter/servizi" element={<SitterServicesPage />} />
          <Route path="/sitters/:id" element={<SitterProfilePage />} />
          <Route path="/sitters/:id/prenota" element={<BookingNewPage />} />
          <Route
            path="/prenotazioni/:id"
            element={
              <Suspense fallback={<LoadingView />}>
                <BookingStatusPage />
              </Suspense>
            }
          />
          <Route path="/messaggi" element={<MessagesPage />} />
          <Route path="/messaggi/:id" element={<ChatPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
