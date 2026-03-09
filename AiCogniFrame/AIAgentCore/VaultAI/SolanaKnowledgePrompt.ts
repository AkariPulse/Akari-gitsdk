import { SOLANA_GET_KNOWLEDGE_NAME } from "@/ai/solana-knowledge/actions/get-knowledge/name"

type AgentPromptOptions = {
  includeExample?: boolean
  requireExactInvocation?: boolean
  noAdditionalCommentary?: boolean
}

function dedent(input: string): string {
  const lines = input.replace(/\t/g, "  ").split("\n")
  while (lines.length && lines[0].trim() === "") lines.shift()
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop()
  const minIndent = lines.reduce((min, line) => {
    if (!line.trim()) return min
    const indent = (line.match(/^ */) ?? [""])[0].length
    return Math.min(min, indent)
  }, Infinity)
  if (!isFinite(minIndent)) return lines.join("\n").trim()
  return lines.map(line => line.slice(minIndent)).join("\n")
}

export const formatInvocation = (toolName: string, queryPlaceholder = "<user question as-is>") =>
  dedent(`{
    "tool": "${toolName}",
    "query": "${queryPlaceholder}"
  }`)

export function createSolanaKnowledgeAgentPrompt(
  toolName: string,
  opts: AgentPromptOptions = {}
): string {
  if (!toolName) throw new Error("toolName is required")

  const {
    includeExample = true,
    requireExactInvocation = true,
    noAdditionalCommentary = true,
  } = opts

  const exampleSection = includeExample
    ? `

Example:
\`\`\`json
${formatInvocation(toolName, "How does Solana's Proof-of-History work?")}
\`\`\`
`
    : ""

  return dedent(`
    You are the Solana Knowledge Agent.

    Responsibilities:
    - Provide authoritative answers on Solana protocols, tokens, developer tools, RPCs, validators, and ecosystem news.
    - For any Solana-related question, invoke the tool ${toolName} with the user's exact wording.

    Invocation Rules:
    1. Detect Solana topics (protocol, DEX, token, wallet, staking, on-chain mechanics).
    2. Call:
       ${formatInvocation(toolName)}
    3. ${requireExactInvocation ? "Use the user's exact question text as the \"query\" field." : "Prefer to use the user's original wording for the \"query\" field."}
    4. ${noAdditionalCommentary ? "Do not add extra commentary, formatting, or apologies." : "Keep commentary minimal."}
    5. For non-Solana questions, yield control without responding.
    ${exampleSection}
  `).trim()
}

export const SOLANA_KNOWLEDGE_AGENT_PROMPT = createSolanaKnowledgeAgentPrompt(
  SOLANA_GET_KNOWLEDGE_NAME
)
