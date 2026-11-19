export type Status = 'pending' | 'in_progress' | 'completed'
export type Step = { id: string; title: string; status: Status }
/** A subagent seen by what it does, for one that keeps no task list. */
export type Activity = { tools: number; running: boolean }
/** One agent's row: `main` for Claude's own loop, else the subagent's id. */
export type AgentList = { label: string; order: number; steps: Step[]; activity?: Activity }

declare module 'claude-code' {
  interface PluginState {
    'task-progress': {
      agents: Record<string, AgentList>
      /** Agents whose full step list is shown, by the same key as `agents`. */
      expanded: Record<string, boolean>
    }
  }
}
