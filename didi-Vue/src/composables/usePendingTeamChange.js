import { pendingTeamChangeCount, refreshPendingTeamChangeCount } from '../stores/adminSession'

export function usePendingTeamChange() {
  return { pendingTeamChangeCount, refresh: refreshPendingTeamChangeCount }
}
