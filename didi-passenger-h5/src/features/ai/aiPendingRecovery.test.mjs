import assert from 'node:assert/strict'
import test from 'node:test'

import { pendingRequestFromHistory, terminalRecoveredReply } from './aiPendingRecovery.js'

test('刷新后只恢复历史末尾已落库且有请求号的用户轮次', () => {
  const user = { role: 'USER', messageNo: 'AIM-3', requestNo: 'REQ-2' }
  assert.deepEqual(pendingRequestFromHistory([{ role: 'ASSISTANT' }, user]),
    { requestNo: 'REQ-2', messageNo: 'AIM-3' })
  assert.equal(pendingRequestFromHistory([user, { role: 'ASSISTANT', requestNo: 'REQ-2' }]), null)
  assert.equal(pendingRequestFromHistory([{ role: 'USER', requestNo: 'REQ-2' }]), null)
})

test('仅同请求号的成功或失败回复结束恢复', () => {
  const reply = { messageNo: 'AIM-4', requestNo: 'REQ-2', status: 'FAILED' }
  assert.equal(terminalRecoveredReply({ status: 'PROCESSING', assistantReply: null }, 'REQ-2'), null)
  assert.equal(terminalRecoveredReply({ status: 'FAILED', assistantReply: reply }, 'REQ-other'), null)
  assert.equal(terminalRecoveredReply({ status: 'FAILED', assistantReply: reply }, 'REQ-2'), reply)
  assert.equal(terminalRecoveredReply({ status: 'COMPLETED', assistantReply: reply }, 'REQ-2'), reply)
})
