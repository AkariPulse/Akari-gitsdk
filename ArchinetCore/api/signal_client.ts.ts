export interface Signal {
  id: string
  type: string
  timestamp: number
  payload: Record<string, unknown>
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Client for interacting with ArchiNet signals API.
 */
export class SignalClient {
  constructor(private readonly baseUrl: string, private readonly apiKey?: string) {}

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`
    return headers
  }

  private async handleResponse<T>(res: Response): Promise<ApiResponse<T>> {
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ${res.statusText}` }
    }
    try {
      const data = (await res.json()) as T
      return { success: true, data }
    } catch (err: any) {
      return { success: false, error: `Failed to parse response: ${err.message}` }
    }
  }

  async getAllSignals(): Promise<ApiResponse<Signal[]>> {
    try {
      const res = await fetch(`${this.baseUrl}/signals`, {
        method: "GET",
        headers: this.buildHeaders(),
      })
      return this.handleResponse<Signal[]>(res)
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  async getSignalById(id: string): Promise<ApiResponse<Signal>> {
    try {
      const res = await fetch(`${this.baseUrl}/signals/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: this.buildHeaders(),
      })
      return this.handleResponse<Signal>(res)
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }
}
