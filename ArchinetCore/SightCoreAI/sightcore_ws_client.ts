export interface SightCoreConfig {
  url: string
  protocols?: string[]
  reconnectIntervalMs?: number
  maxReconnectAttempts?: number
  autoReconnect?: boolean
  heartbeatMs?: number
  parseMessages?: boolean
}

export type SightCoreMessage = {
  topic: string
  payload: unknown
  timestamp: number
}

type Listener = (msg: SightCoreMessage) => void

export class SightCoreWebSocket {
  private socket?: WebSocket
  private readonly url: string
  private readonly protocols?: string[]
  private readonly baseReconnectInterval: number
  private readonly maxReconnectAttempts: number
  private readonly autoReconnect: boolean
  private readonly heartbeatMs: number
  private readonly parseMessages: boolean

  private reconnectAttempts = 0
  private heartbeatTimer?: number
  private listeners: Map<string, Set<Listener>> = new Map()
  private pendingQueue: Array<{ topic: string; payload: unknown }> = []
  private isManuallyClosed = false

  constructor(config: SightCoreConfig) {
    this.url = config.url
    this.protocols = config.protocols
    this.baseReconnectInterval = config.reconnectIntervalMs ?? 5000
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? Infinity
    this.autoReconnect = config.autoReconnect ?? true
    this.heartbeatMs = config.heartbeatMs ?? 0
    this.parseMessages = config.parseMessages ?? true
  }

  connect(onOpen?: () => void, onClose?: (ev?: CloseEvent) => void): void {
    this.isManuallyClosed = false
    this.socket = this.protocols ? new WebSocket(this.url, this.protocols) : new WebSocket(this.url)

    this.socket.onopen = () => {
      this.reconnectAttempts = 0
      this.flushQueue()
      if (this.heartbeatMs > 0) this.startHeartbeat()
      onOpen?.()
    }

    this.socket.onmessage = (event: MessageEvent) => {
      const raw = event.data
      let msg: SightCoreMessage | null = null

      if (this.parseMessages) {
        try {
          msg = JSON.parse(raw) as SightCoreMessage
        } catch {
          return
        }
      } else {
        // If parsing is off, wrap raw data in a minimal structure
        msg = { topic: "message", payload: raw, timestamp: Date.now() }
      }

      if (!msg || typeof msg.topic !== "string") return
      this.emit(msg.topic, msg)
      this.emit("*", msg)
    }

    this.socket.onclose = (ev: CloseEvent) => {
      this.stopHeartbeat()
      onClose?.(ev)
      if (this.autoReconnect && !this.isManuallyClosed) this.scheduleReconnect()
    }

    this.socket.onerror = () => {
      // Let close handler drive reconnection
      try { this.socket?.close() } catch {}
    }
  }

  send(topic: string, payload: unknown): void {
    const message = JSON.stringify({ topic, payload, timestamp: Date.now() })
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(message)
    } else {
      this.pendingQueue.push({ topic, payload })
    }
  }

  subscribe(topic: string, listener: Listener): () => void {
    if (!this.listeners.has(topic)) this.listeners.set(topic, new Set())
    this.listeners.get(topic)!.add(listener)
    return () => this.listeners.get(topic)?.delete(listener)
  }

  unsubscribeAll(topic?: string): void {
    if (topic) this.listeners.delete(topic)
    else this.listeners.clear()
  }

  disconnect(code?: number, reason?: string): void {
    this.isManuallyClosed = true
    this.stopHeartbeat()
    try { this.socket?.close(code, reason) } catch {}
  }

  private emit(topic: string, msg: SightCoreMessage): void {
    const set = this.listeners.get(topic)
    if (!set || set.size === 0) return
    for (const l of set) {
      try { l(msg) } catch {}
    }
  }

  private flushQueue(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    while (this.pendingQueue.length) {
      const { topic, payload } = this.pendingQueue.shift()!
      this.send(topic, payload)
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return
    this.reconnectAttempts += 1
    const delay = this.backoffDelay(this.reconnectAttempts)
    setTimeout(() => this.connect(), delay)
  }

  private backoffDelay(attempt: number): number {
    const jitter = Math.floor(Math.random() * 300)
    const factor = Math.min(6, attempt) // cap the growth
    return this.baseReconnectInterval * factor + jitter
  }

  private startHeartbeat(): void {
    if (this.heartbeatMs <= 0) return
    this.stopHeartbeat()
    this.heartbeatTimer = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.send("heartbeat", { t: Date.now() })
      }
    }, this.heartbeatMs)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }
  }
}
