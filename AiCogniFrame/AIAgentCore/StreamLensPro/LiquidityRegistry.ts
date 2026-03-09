import { toolkitBuilder } from "@/ai/core"
import { FETCH_POOL_DATA_KEY } from "@/ai/modules/liquidity/pool-fetcher/key"
import { ANALYZE_POOL_HEALTH_KEY } from "@/ai/modules/liquidity/health-checker/key"
import { FetchPoolDataAction } from "@/ai/modules/liquidity/pool-fetcher/action"
import { AnalyzePoolHealthAction } from "@/ai/modules/liquidity/health-checker/action"

type Toolkit = ReturnType<typeof toolkitBuilder>

// Prefix helpers for consistent key generation
const keyWithPrefix = {
  liquidity: (key: string) => `liquidityscan-${key}`,
  poolHealth: (key: string) => `poolhealth-${key}`,
} as const

export const LiquidityRegistry: Record<string, Toolkit> = Object.freeze({
  [keyWithPrefix.liquidity(FETCH_POOL_DATA_KEY)]: toolkitBuilder(new FetchPoolDataAction()),
  [keyWithPrefix.poolHealth(ANALYZE_POOL_HEALTH_KEY)]: toolkitBuilder(new AnalyzePoolHealthAction()),
})
