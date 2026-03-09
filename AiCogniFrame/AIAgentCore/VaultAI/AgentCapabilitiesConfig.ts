export interface AgentCapabilities {
  canAnswerProtocolQuestions: boolean
  canAnswerTokenQuestions: boolean
  canDescribeTooling: boolean
  canReportEcosystemNews: boolean
}

export interface AgentFlags {
  requiresExactInvocation: boolean
  noAdditionalCommentary: boolean
}

export const SOLANA_AGENT_CAPABILITIES: Readonly<AgentCapabilities> = Object.freeze({
  canAnswerProtocolQuestions: true,
  canAnswerTokenQuestions: true,
  canDescribeTooling: true,
  canReportEcosystemNews: true,
})

export const SOLANA_AGENT_FLAGS: Readonly<AgentFlags> = Object.freeze({
  requiresExactInvocation: true,
  noAdditionalCommentary: true,
})
