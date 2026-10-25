/** 只有服务端已保存、且位于历史末尾的乘客消息才可能是活动轮次。 */
export function pendingRequestFromHistory(views) {
  if (!Array.isArray(views) || !views.length) return null
  const latest = views.at(-1)
  if (latest?.role !== 'USER' || !latest.requestNo || !latest.messageNo) return null
  return { requestNo: latest.requestNo, messageNo: latest.messageNo }
}

/** 状态与回复必须属于同一轮，才可停止自动对账。 */
export function terminalRecoveredReply(state, requestNo) {
  if (!['COMPLETED', 'FAILED'].includes(state?.status)) return null
  const reply = state.assistantReply
  return reply?.requestNo === requestNo && reply.messageNo ? reply : null
}
