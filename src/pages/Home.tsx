import { Hero } from '@/components/Hero'
import { MarketTicker } from '@/components/MarketTicker'
import { MarketOverview } from '@/components/MarketOverview'
import { AIAnalystPreview } from '@/components/AIAnalystPreview'
import { IntelligenceGrid } from '@/components/IntelligenceGrid'
import { StockPreview } from '@/components/StockPreview'
import { GlobalMarkets } from '@/components/GlobalMarkets'
import { AlertPreview } from '@/components/AlertPreview'
import { Trust } from '@/components/Trust'
import { CTA } from '@/components/CTA'

export default function Home() {
  return (
    <>
      <Hero />
      <div id="pulse">
        <MarketTicker />
      </div>
      <MarketOverview />
      <AIAnalystPreview />
      <IntelligenceGrid />
      <StockPreview />
      <GlobalMarkets />
      <AlertPreview />
      <Trust />
      <CTA />
    </>
  )
}
