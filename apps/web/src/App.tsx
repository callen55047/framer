import { Navigate, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { WatchlistPage } from "./pages/WatchlistPage.js";
import { GaragePage } from "./pages/GaragePage.js";
import { ProfilePage } from "./pages/ProfilePage.js";
import { AssistantPage } from "./pages/AssistantPage.js";
import { HandbookPage } from "./pages/HandbookPage.js";
import { HandbookEntryPage } from "./pages/HandbookEntryPage.js";
import { FieldNotesPage } from "./pages/FieldNotesPage.js";
import { FieldNotePage } from "./pages/FieldNotePage.js";

export default function App() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/garage" element={<GaragePage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/handbook" element={<HandbookPage />} />
          <Route path="/handbook/:slug" element={<HandbookEntryPage />} />
          <Route path="/notes" element={<FieldNotesPage />} />
          <Route path="/notes/:id" element={<FieldNotePage />} />
          <Route path="/tasks" element={<Navigate to="/profile" replace />} />
        </Routes>
      </main>
    </div>
  );
}
