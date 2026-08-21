import { Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { WatchlistPage } from "./pages/WatchlistPage.js";
import { GaragePage } from "./pages/GaragePage.js";
import { TasksPage } from "./pages/TasksPage.js";
import { ProfilePage } from "./pages/ProfilePage.js";
import { AssistantPage } from "./pages/AssistantPage.js";

export default function App() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/garage" element={<GaragePage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </main>
    </div>
  );
}
