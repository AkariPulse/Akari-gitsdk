import React, { Suspense } from "react"

// Lazy-load heavy widgets so each card can stream in independently
const SentimentGauge = React.lazy(() => import("./SentimentGauge"))
const AssetOverviewPanel = React.lazy(() => import("./AssetOverviewPanel"))
const WhaleTrackerCard = React.lazy(() => import("./WhaleTrackerCard"))

type DashboardProps = {
  /** Ticker used by SentimentGauge */
  symbol?: string
  /** Asset id used by AssetOverviewPanel */
  assetId?: string
  /** Optional wrapper class */
  className?: string
  /** Optional grid override class */
  gridClassName?: string
  /** Optional page title */
  title?: string
}

export const Dashboard: React.FC<DashboardProps> = ({
  symbol = "SYM",
  assetId = "ASSET-01",
  className = "",
  gridClassName = "grid grid-cols-1 lg:grid-cols-3 gap-6",
  title = "Analytics Dashboard",
}) => {
  return (
    <main className={`p-8 bg-gray-100 min-h-screen ${className}`} aria-labelledby="dashboard-title">
      <h1 id="dashboard-title" className="text-4xl font-bold mb-6">
        {title}
      </h1>

      <section className={gridClassName}>
        <CardBoundary title="Sentiment">
          <Suspense fallback={<CardSkeleton title="Sentiment" />}>
            <SentimentGauge symbol={symbol} />
          </Suspense>
        </CardBoundary>

        <CardBoundary title="Asset Overview">
          <Suspense fallback={<CardSkeleton title="Asset Overview" />}>
            <AssetOverviewPanel assetId={assetId} />
          </Suspense>
        </CardBoundary>

        <CardBoundary title="Whale Tracker">
          <Suspense fallback={<CardSkeleton title="Whale Tracker" />}>
            <WhaleTrackerCard />
          </Suspense>
        </CardBoundary>
      </section>
    </main>
  )
}

/* ---------------------------- helpers ---------------------------- */

const CardBoundary: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-2">{title}</h2>
          <p className="text-sm text-red-600">Failed to load this card.</p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}

const CardSkeleton: React.FC<{ title: string }> = ({ title }) => (
  <div
    role="status"
    aria-live="polite"
    className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100 animate-pulse"
  >
    <h2 className="text-lg font-semibold mb-3">{title}</h2>
    <div className="space-y-2">
      <div className="h-4 bg-gray-200 rounded w-1/2" />
      <div className="h-4 bg-gray-200 rounded w-2/3" />
      <div className="h-4 bg-gray-200 rounded w-1/3" />
      <div className="h-4 bg-gray-200 rounded w-1/4" />
    </div>
  </div>
)

/**
 * Minimal error boundary to prevent one card failure from breaking the page.
 */
class ErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(err: unknown) {
    // You can integrate your logger here
    // console.error("Card error:", err)
  }
  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children as React.ReactElement
  }
}

export default Dashboard
