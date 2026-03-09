import type { BaseAction, ActionResponse } from "./baseAction"

interface AgentContext {
  apiEndpoint: string
  apiKey: string
}

/**
 * Central Agent: routes calls to registered actions.
 */
export class Agent {
  private readonly actions = new Map<string, BaseAction<any, any, AgentContext>>()

  register<S, R>(action: BaseAction<S, R, AgentContext>): void {
    this.actions.set(action.id, action)
  }

  async invoke<S, R>(
    actionId: string,
    payload: S,
    ctx: AgentContext
  ): Promise<ActionResponse<R>> {
    const action = this.actions.get(actionId)
    if (!action) {
      throw new Error(`Unknown action "${actionId}"`)
    }
    return action.execute({ payload, context: ctx })
  }
}
