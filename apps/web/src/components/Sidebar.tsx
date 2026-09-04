import { Bike, BookOpen, Eye, Home, MessageCircle, NotebookPen, User } from "lucide-react";
import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", icon: Home, label: "Dashboard" },
  { to: "/watchlist", icon: Eye, label: "Watchlist" },
  { to: "/garage", icon: Bike, label: "Garage" },
  { to: "/assistant", icon: MessageCircle, label: "Assistant" },
  { to: "/profile", icon: User, label: "Profile" },
  { to: "/handbook", icon: BookOpen, label: "Handbook" },
  { to: "/notes", icon: NotebookPen, label: "Field Notes" },
];

export function Sidebar() {
  return (
    <nav className="flex h-screen w-16 flex-col items-center gap-2 border-r border-neutral-800 bg-neutral-950 py-4">
      <img
        src="/FramerIcon.png"
        alt="Framer"
        title="Framer"
        className="mb-4 h-8 w-8 rounded-lg object-cover"
      />
      {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          title={label}
          className={({ isActive }) =>
            `flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
              isActive
                ? "bg-brand-purple/15 text-brand-blue"
                : "text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-200"
            }`
          }
        >
          <Icon size={20} strokeWidth={1.75} />
        </NavLink>
      ))}
    </nav>
  );
}
