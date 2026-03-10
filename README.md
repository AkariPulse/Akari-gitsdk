<p align="center">
<img width="400" height="400" alt="hf_20260309_045718_0a075c8b-05d0-4610-8f94-1dfe0136d849" src="https://github.com/user-attachments/assets/02314c23-648e-4532-a004-79c0b6cb2e83" />

</p>
<h1 align="center">Akari Pulse</h1>

<p align="center">
  <strong>AI trading & on‑chain analytics for degen traders.</strong><br/>
  Analyze tokens and wallets, run AI agents, and swap via Solana — all in one place.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-experimental-orange?style=flat-square" alt="Project Status" />
  <img src="https://img.shields.io/badge/platform-solana-black?style=flat-square" alt="Solana" />
  <img src="https://img.shields.io/badge/ai-agents-blueviolet?style=flat-square" alt="AI Agents" />
</p>

---

## See It In Action

<div align="center">
<table>
  <tr>
    <td align="center" width="50%">
      <img src="docs/gifs/token-analytics.gif" alt="Token Analytics" width="240"/><br/><br/>
      <strong>Token Analytics</strong><br/>
      <sub>Liquidity, volume, holders, risk flags</sub>
    </td>
    <td width="40"></td>
    <td align="center" width="50%">
      <img src="docs/gifs/wallet-analytics.gif" alt="Wallet Analytics" width="240"/><br/><br/>
      <strong>Wallet Analytics</strong><br/>
      <sub>PnL, behavior, smart‑money tracking</sub>
    </td>
  </tr>
  <tr><td colspan="3" height="30"></td></tr>
  <tr>
    <td align="center" width="50%">
      <img src="docs/gifs/ai-agent.gif" alt="AI Agent" width="240"/><br/><br/>
      <strong>AI Analytics Agent</strong><br/>
      <sub>Explain any token or wallet in chat</sub>
    </td>
    <td width="40"></td>
    <td align="center" width="50%">
      <img src="docs/gifs/jupiter-swap.gif" alt="Jupiter Swap" width="240"/><br/><br/>
      <strong>Swaps via Jupiter</strong><br/>
      <sub>From signal to manual swap in one click</sub>
    </td>
  </tr>
</table>
</div>

---

## What is Akari Pulse?

Akari Pulse is an AI‑powered trading and on‑chain analytics platform built around Solana (with more chains planned).  
It lets you:

- Scan tokens before entry, with liquidity, volume and risk overlays  
- Analyze wallets: PnL, behavior patterns, degen level, smart‑money flows  
- Use AI agents to get human‑readable breakdowns and news digests  
- Go from signal to swap via integrated Jupiter swaps

No spreadsheets. No ten tabs. One pulse for your trading decisions.

---

## Core Features

- **Token analytics** – liquidity, volume, volatility, holders, on‑chain flows, risk scores  
- **Wallet analytics** – PnL, winrate, behavior tags, exposure, “whale / smart‑money” tracking  
- **AI analytics agent** – chat interface for token & wallet breakdowns  
- **AI research agent** – on‑demand news summaries and project digests  
- **Jupiter swaps (Solana)** – swap any supported tokens right from the terminal  
- **Multi‑platform** – web app, Telegram mini app, browser extension with shared account and state  

---

## Credits, Plans & Token

Akari Pulse uses a credits model:

- Every account gets a **free tier** with a small amount of credits  
- Paid plans give more credits and unlock advanced features  
- Credits are spent on:
  - Token analysis
  - Wallet analysis
  - News / research digests
- Credits are purchased using the on‑chain utility token **$AKARI**  
- A share of each purchase is burned, the rest goes to the treasury (transparent dashboards planned)

Exact numbers for tiers and per‑action costs are work in progress and will be documented as they stabilize.

---

## Platforms

| Client            | Status        | Notes                                  |
|-------------------|--------------|----------------------------------------|
| Web App           | In development | Main interface for analytics & swaps  |
| Telegram Mini App | In development | Fast AI agents in chat                 |
| Browser Extension | In design      | Inline token & wallet stats on any site |

---

## Repository

This repository is currently focused on:

- Prototyping core analytics flows (tokens & wallets)  
- Experimenting with AI agents and job processing  
- Drafting UI/UX for the web terminal  

Expect breaking changes and incomplete features while the project is in active design & exploration.

---

## Getting Started (Dev)

> Dev setup will change quickly while the architecture evolves.

1. Clone the repository:
   ```bash
   git clone https://github.com/<your-org>/akari-pulse.git
   cd akari-pulse
   ```
Check apps/ and packages/ for available services and frontends.

Follow the local README in each app/package for setup and environment variables.

MIT License

Copyright (c) 2026 AkariPulse

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
