import { Link } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'
import { primaryNav, companyNav } from '@/config/nav'

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="relative bg-obsidian-900 text-ivory-100/80">
      <div className="container-page py-16 md:py-20">
        <div className="grid gap-12 md:grid-cols-12">
          {/* Brand */}
          <div className="md:col-span-5">
            <Logo variant="light" withTagline />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-ivory-100/65">
              AI-powered market intelligence for modern investors. Data, context
              and analysis in one calm workspace.
            </p>
            <p className="mt-6 text-xs text-ivory-100/45">
              Market data and analysis are provided for informational and
              educational purposes. Nothing on Finova Markets constitutes
              investment advice.
            </p>
          </div>

          {/* Product links */}
          <div className="md:col-span-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest2 text-ivory-100/50">
              Product
            </h2>
            <ul className="mt-5 space-y-3">
              {primaryNav.map((l) => (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    className="text-sm text-ivory-100/80 transition-colors hover:text-ivory-50 link-underline"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company links */}
          <div className="md:col-span-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest2 text-ivory-100/50">
              Company
            </h2>
            <ul className="mt-5 space-y-3">
              {companyNav.map((l) => (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    className="text-sm text-ivory-100/80 transition-colors hover:text-ivory-50 link-underline"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Status */}
          <div className="md:col-span-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest2 text-ivory-100/50">
              Status
            </h2>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-ivory-100/10 bg-ivory-100/[0.04] px-3 py-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gain opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-gain" />
              </span>
              <span className="text-xs text-ivory-100/75">All systems normal</span>
            </div>
            <p className="mt-4 text-xs text-ivory-100/45">Phase 0 · Foundation</p>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-ivory-100/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ivory-100/45">
            © {year} Finova. All rights reserved.
          </p>
          <p className="text-xs text-ivory-100/45">
            Designed for serious investors. Built responsibly.
          </p>
        </div>
      </div>
    </footer>
  )
}
