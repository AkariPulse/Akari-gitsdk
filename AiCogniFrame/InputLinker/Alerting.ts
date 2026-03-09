import nodemailer, { Transporter } from "nodemailer"

export interface EmailConfig {
  host: string
  port: number
  user: string
  pass: string
  from: string
  to: string[]
}

export interface AlertConfig {
  email?: EmailConfig
  console?: boolean
}

export type AlertLevel = "info" | "warning" | "critical"

export interface AlertSignal {
  title: string
  message: string
  level: AlertLevel
}

export class AlertService {
  private transporter?: Transporter

  constructor(private readonly cfg: AlertConfig) {
    if (cfg.email) {
      const { host, port, user, pass } = cfg.email
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // auto-detect common TLS port
        auth: { user, pass },
      })
    }
  }

  private async sendEmail(signal: AlertSignal): Promise<void> {
    if (!this.cfg.email || !this.transporter) return

    const { from, to } = this.cfg.email
    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: `[${signal.level.toUpperCase()}] ${signal.title}`,
        text: signal.message,
      })
    } catch (err) {
      console.error("[AlertService][ERROR] Failed to send email:", err)
    }
  }

  private logConsole(signal: AlertSignal): void {
    if (!this.cfg.console) return

    const prefix = `[AlertService][${signal.level.toUpperCase()}]`
    const output = `${prefix} ${signal.title}\n${signal.message}`

    switch (signal.level) {
      case "info":
        console.info(output)
        break
      case "warning":
        console.warn(output)
        break
      case "critical":
        console.error(output)
        break
    }
  }

  async dispatch(signals: AlertSignal[]): Promise<void> {
    for (const sig of signals) {
      await this.sendEmail(sig)
      this.logConsole(sig)
    }
  }
}
