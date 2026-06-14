import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/home", label: "Home" },
  { to: "/profile", label: "Profile" },
  { to: "/settings", label: "Settings" },
] as const;

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <div
        className="mx-auto flex max-w-lg items-stretch px-2 pt-2"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
      >
        {TABS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 items-center justify-center rounded-2xl px-3 py-3 text-sm font-bold transition-all ${
                isActive ? "bottom-nav-tab-active" : "bottom-nav-tab-inactive"
              }`
            }
          >
            {({ isActive }) => (
              <span className={isActive ? "text-peach" : ""}>{label}</span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
