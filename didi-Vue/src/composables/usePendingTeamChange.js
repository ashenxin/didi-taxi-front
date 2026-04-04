import { ref } from 'vue'
import { fetchTeamChangePendingCount } from '../api/capacityApi'

/** 待审核换队申请数（菜单角标与列表预警共用数据源） */
const pendingTeamChangeCount = ref(0)

export function usePendingTeamChange() {
  async function refresh() {
    try {
      const n = await fetchTeamChangePendingCount()
      pendingTeamChangeCount.value = typeof n === 'number' ? n : Number(n) || 0
    } catch {
      pendingTeamChangeCount.value = 0
    }
  }
  return { pendingTeamChangeCount, refresh }
}
