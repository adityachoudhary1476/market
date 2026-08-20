// Centralized navigation config — used by Navbar, Footer and mobile menu.
export interface NavLink {
  label: string
  to: string
}

export const primaryNav: NavLink[] = [
  { label: 'Markets', to: '/markets' },
  { label: 'Research', to: '/research' },
  { label: 'Watchlist', to: '/watchlist' },
  { label: 'News', to: '/news' },
  { label: 'AI Analyst', to: '/analyst' },
]

export const companyNav: NavLink[] = [
  { label: 'About', to: '/about' },
  { label: 'Contact', to: '/contact' },
  { label: 'Privacy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
]
