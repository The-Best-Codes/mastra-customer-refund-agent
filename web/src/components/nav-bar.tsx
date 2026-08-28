import { NavLink } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LifeBuoy } from "lucide-react";

const links = [
  { to: "/", label: "Overview", end: true },
  { to: "/portal", label: "Customer portal" },
  { to: "/admin", label: "Support admin" },
  { to: "/monitoring", label: "Monitoring" },
];

export function NavBar() {
  return (
    <header className="sticky top-0 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2 font-semibold">
          <LifeBuoy className="text-primary" />
          <div className="flex flex-col">
            <span>Support Refund Agent</span>
            <span className="text-xs font-normal text-muted-foreground">
              Mastra demo
            </span>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  buttonVariants({
                    variant: isActive ? "secondary" : "ghost",
                    size: "sm",
                  }),
                  "justify-start",
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
