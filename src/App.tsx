import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { SearchProvider } from '@/components/SearchProvider'
import Home from '@/pages/Home'
import Markets from '@/pages/Markets'
import Analyst from '@/pages/Analyst'
import Placeholder from '@/pages/Placeholder'
import ResearchSymbol from '@/pages/ResearchSymbol'
import SectorPage from '@/pages/SectorPage'
import { useReveal } from '@/hooks/useReveal'

function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      const el = document.querySelector(hash)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname, hash])
  return null
}

function AppShell() {
  // Activate reveal-on-scroll for any .reveal elements present on the page.
  useReveal()

  return (
    <div className="flex min-h-screen flex-col bg-ivory-100">
      <Navbar />
      <main id="main" className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/markets" element={<Markets />} />
          <Route path="/markets/sector/:sectorId" element={<SectorPage />} />
          <Route path="/research" element={
            <Placeholder
              title="Stock Research"
              description="Deep company research across financials, technicals, news and AI analysis. Search for a stock or open one from the Markets terminal."
            />
          } />
          <Route path="/research/:symbol" element={<ResearchSymbol />} />
          <Route
            path="/watchlist"
            element={
              <Placeholder
                title="Watchlist"
                description="Track the instruments that matter to you with smart alerts and signals."
              />
            }
          />
          <Route
            path="/news"
            element={
              <Placeholder
                title="News Intelligence"
                description="Hundreds of headlines distilled into the few that move the market."
              />
            }
          />
          <Route path="/analyst" element={<Analyst />} />
          <Route
            path="*"
            element={
              <Placeholder
                title="Page not found"
                description="The page you're looking for doesn't exist yet."
              />
            }
          />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <SearchProvider>
        <ScrollToTop />
        <AppShell />
      </SearchProvider>
    </BrowserRouter>
  )
}
