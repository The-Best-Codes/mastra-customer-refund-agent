import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LifeBuoy } from 'lucide-react';

const links = [
  { to: '/', label: 'Overview', end: true },
  { to: '/portal', label: 'Customer portal' },
  { to: '/admin', label: 'Support admin' },
];

export function NavBar() {
  return (
    <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <LifeBuoy className="size-5 text-primary" />
          <span>Support &amp; Refund Agent</span>
          <span className="hidden text-xs font-normal text-muted-foreground sm:inline">— Mastra template</span>
        </div>
        <nav className="flex items-center gap-1">
          {links.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
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
