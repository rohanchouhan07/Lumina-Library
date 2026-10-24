import { Link } from 'react-router-dom'
import { Github, GraduationCap, Mail } from 'lucide-react'
import { Logo } from '@/components/layout/Logo'

const GROUPS = [
  {
    title: 'Product',
    links: [
      { label: 'Dashboard', to: '/app' },
      { label: 'Public catalogue', to: '/catalog' },
      { label: 'Analytics', to: '/app/reports' },
      { label: 'Reservations', to: '/app/reservations' },
    ],
  },
  {
    title: 'Demo roles',
    links: [
      { label: 'Administrator', to: '/login?role=admin' },
      { label: 'Librarian', to: '/login?role=librarian' },
      { label: 'Student', to: '/login?role=student' },
      { label: 'Switch role', to: '/login' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer id="about" className="relative border-t border-white/8 bg-ink-950">
      <div className="container-page py-12">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-fg-muted">
              A front-end prototype for college library operations — catalogue, circulation, reservations and
              analytics, wrapped in an interface built for daily use.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] text-fg-muted">
              <GraduationCap className="size-3.5" aria-hidden="true" />
              Student project · sample data only
            </p>
          </div>

          {GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-fg-faint uppercase">{group.title}</p>
              <ul className="mt-3 space-y-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="text-[13px] text-fg-muted transition-colors hover:text-fg"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-fg-faint uppercase">About this demo</p>
            <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">
              Lumina Library is a demonstration of a library management workflow. All books, members, loans and
              fines are fictional sample data stored in your browser — nothing is sent to a server.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <a
                href="mailto:library-demo@example.edu"
                className="grid size-8 place-items-center rounded-lg border border-white/10 text-fg-muted transition-colors hover:border-white/25 hover:text-fg"
                aria-label="Email the demo maintainer"
              >
                <Mail className="size-3.5" aria-hidden="true" />
              </a>
              <span
                className="grid size-8 place-items-center rounded-lg border border-white/10 text-fg-faint"
                title="Source code available in the project workspace"
                aria-hidden="true"
              >
                <Github className="size-3.5" />
              </span>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-white/6 pt-5 sm:flex-row sm:items-center">
          <p className="text-[11.5px] text-fg-faint">
            © {new Date().getFullYear()} Lumina Library · Demonstration project. Not affiliated with any institution.
          </p>
          <div className="flex items-center gap-4 text-[11.5px] text-fg-faint">
            <Link to="/catalog" className="transition-colors hover:text-fg-soft">
              Catalogue
            </Link>
            <Link to="/login" className="transition-colors hover:text-fg-soft">
              Demo access
            </Link>
            <span>Built with React & TypeScript</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
