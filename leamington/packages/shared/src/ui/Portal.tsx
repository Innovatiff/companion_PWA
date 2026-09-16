/**
 * The portals' dashboard frame (docs/DESIGN.md section 9), shared by admin and
 * the affiliate portal: sidebar, header band, stat cards, cards and icons.
 * Server-rendered only; nothing here needs client JavaScript.
 */
import type { ReactNode } from "react";

// Stroke icons on a 24px grid, drawn for this project. Inline, so no request.
const PATHS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7"/><path d="M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>',
  userPlus: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c.8-3.6 3.3-5.5 6.5-5.5 1.6 0 3 .5 4.1 1.3"/><path d="M19 13v6M16 16h6"/>',
  refresh: '<path d="M20 11a8 8 0 00-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0014.3 4.9L20 16"/><path d="M20 21v-5h-5"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M3 10h18"/><path d="M16 15h2"/><path d="M6 6l9-3 1.5 3"/>',
  chart: '<path d="M4 20V11M10 20V5M16 20v-6M21 20H3"/>',
  store: '<path d="M3 21h18"/><path d="M5 21V10M19 21V10"/><path d="M3 10l2-6h14l2 6z"/><path d="M9 21v-5h6v5"/>',
  dollar: '<path d="M12 2v20"/><path d="M17 6.5c-.9-1.5-2.8-2.5-5-2.5-2.8 0-5 1.5-5 3.8C7 12.5 17 10.5 17 15.9 17 18.3 14.8 20 12 20c-2.4 0-4.4-1-5.3-2.7"/>',
  activity: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  bell: '<path d="M6 16v-5a6 6 0 0112 0v5l2 2H4z"/><path d="M10 21h4"/>',
  logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  phone: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
} as const;

export type IconName = keyof typeof PATHS;

export const Icon = ({ name }: { name: IconName }) => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: PATHS[name] }} />
);

export type Tone = "brand" | "good" | "warn" | "bad";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  current?: boolean;
  /** A count shown only when it is a real number from the database. */
  badge?: number | null;
  tone?: Tone;
};

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "·";

function NavLinks({ items, label }: { items: NavItem[]; label: string }) {
  return (
    <nav aria-label={label}>
      {items.map((it) => (
        <a key={it.href} href={it.href} aria-current={it.current ? "page" : undefined}>
          <Icon name={it.icon} />
          {it.label}
          {typeof it.badge === "number" && it.badge > 0 && (
            <span className={`badge ${it.tone && it.tone !== "brand" ? it.tone : ""}`}>{it.badge}</span>
          )}
        </a>
      ))}
    </nav>
  );
}

/** Sidebar + content. Signing out is a POST form, so no prefetch can sign anyone out. */
export function Shell({ brand, product, nav, secondary, person, signOutLabel, children }: {
  brand: string;
  product: string;
  nav: NavItem[];
  secondary?: NavItem[];
  person: { name: string; role: string; chip?: ReactNode };
  signOutLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="app">
      <aside className="side">
        <a className="brand" href="/">{brand}<small>{product}</small></a>
        <NavLinks items={nav} label={product} />
        {secondary && secondary.length > 0 && (<><hr /><NavLinks items={secondary} label={`${product} · 2`} /></>)}
        <div className="who">
          <span className="avatar" aria-hidden="true">{initials(person.name)}</span>
          <span className="name"><b>{person.name}</b><small>{person.role} {person.chip}</small></span>
          <form method="post" action="/api/logout">
            <button type="submit" className="icon-btn" aria-label={signOutLabel} title={signOutLabel}><Icon name="logout" /></button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

/** The gradient band: title, one line of context, the page's main action, and its stat cards. */
export function Hero({ title, subtitle, action, stats }: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  stats?: ReactNode;
}) {
  return (
    <>
      <header className={stats ? "hero" : "hero flat"}>
        <div className="top">
          <div>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action && <div className="actions">{action}</div>}
        </div>
      </header>
      {stats && <div className="stats">{stats}</div>}
    </>
  );
}

/** The white button in the band, e.g. "+ Registrar cliente". */
export const HeroAction = ({ href, icon = "plus", children }: { href: string; icon?: IconName; children: ReactNode }) => (
  <a className="btn-light" href={href}><Icon name={icon} />{children}</a>
);

/**
 * A number with its label and the period it covers (DESIGN.md: a number
 * without its period is not shown). `href` makes the number a link.
 */
export function StatCard({ icon, tone, label, value, note, href }: {
  icon: IconName;
  tone?: Tone;
  label: string;
  value: ReactNode;
  note: ReactNode;
  href?: string;
}) {
  return (
    <div className="stat">
      <div className="label"><span className={`ico ${tone && tone !== "brand" ? tone : ""}`}><Icon name={icon} /></span>{label}</div>
      {href ? <a className="value" href={href}>{value}</a> : <span className="value">{value}</span>}
      <div className="sub">{note}</div>
    </div>
  );
}

export function Card({ title, action, children, id, className }: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section className={className ? `card ${className}` : "card"} id={id}>
      {(title || action) && (
        <div className="card-h">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Sign-in and set-password pages: a single card, no sidebar. */
export const AuthLayout = ({ brand, product, children }: { brand: string; product: string; children: ReactNode }) => (
  <main className="auth">
    <div className="card">
      <div className="brand">{brand}<small>{product}</small></div>
      {children}
    </div>
  </main>
);
