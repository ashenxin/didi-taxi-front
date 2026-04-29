import { onBeforeUnmount, reactive, ref, watch } from 'vue'
import { showToast } from 'vant'

const STORAGE_KEY = 'didi_driver_active_order_no'
const POLL_MS = 2500

/**
 * 接单后跟单：轮询 GET /driver/api/v1/orders/{orderNo}，推进 arrive / start / finish。
 */
export function useDriverActiveTrip(driverId, { getJson, postJson, maybeDropToLogin, authed }) {
  const activeTripOrderNo = ref('')
  const activeTrip = ref(null)
  const tripLoading = ref(false)
  const tripError = ref('')
  const tripActionLoading = ref(false)
  const finishFinalAmount = ref('')

  let pollTimer = null

  function stopPollTimer() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function clearActiveTrip() {
    stopPollTimer()
    activeTripOrderNo.value = ''
    activeTrip.value = null
    tripError.value = ''
    finishFinalAmount.value = ''
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  async function fetchTripOnce() {
    const no = activeTripOrderNo.value
    const id = driverId.value
    if (!no || !id) return
    tripLoading.value = true
    tripError.value = ''
    try {
      const row = await getJson('/driver/api/v1/orders/' + encodeURIComponent(no))
      activeTrip.value = row
      const st = row?.status
      if (st === 5 || st === 6) {
        stopPollTimer()
        showToast({
          type: st === 5 ? 'success' : 'fail',
          message: st === 5 ? '订单已完成' : '订单已取消',
        })
        clearActiveTrip()
      }
    } catch (e) {
      tripError.value = e?.message || String(e)
      const code = e?.code ?? e?.httpStatus
      if (code === 404) {
        clearActiveTrip()
      }
      maybeDropToLogin(e)
    } finally {
      tripLoading.value = false
    }
  }

  function beginFollowingOrder(orderNo) {
    if (!orderNo) return
    stopPollTimer()
    tripError.value = ''
    finishFinalAmount.value = ''
    activeTripOrderNo.value = orderNo
    try {
      sessionStorage.setItem(STORAGE_KEY, orderNo)
    } catch {
      /* ignore */
    }
    fetchTripOnce()
    pollTimer = setInterval(fetchTripOnce, POLL_MS)
  }

  function dismissTripPanel() {
    clearActiveTrip()
  }

  async function postTripAction(pathSuffix, body) {
    const id = driverId.value
    const no = activeTripOrderNo.value
    if (!id || !no) return
    tripActionLoading.value = true
    tripError.value = ''
    try {
      await postJson(`/driver/api/v1/orders/${encodeURIComponent(no)}${pathSuffix}`, body)
      await fetchTripOnce()
      const st = activeTrip.value?.status
      if (st != null && st !== 5 && st !== 6 && !pollTimer) {
        pollTimer = setInterval(fetchTripOnce, POLL_MS)
      }
    } catch (e) {
      tripError.value = e?.message || String(e)
      maybeDropToLogin(e)
    } finally {
      tripActionLoading.value = false
    }
  }

  async function arrive() {
    const id = driverId.value
    await postTripAction('/arrive', { driverId: id })
  }

  async function startTrip() {
    const id = driverId.value
    await postTripAction('/start', { driverId: id })
  }

  async function finishTrip() {
    const id = driverId.value
    const body = { driverId: id }
    const raw = finishFinalAmount.value?.trim()
    if (raw) {
      const n = Number(raw)
      if (!Number.isNaN(n)) body.finalAmount = n
    }
    await postTripAction('/finish', body)
  }

  /**
   * 已接单、到达前取消：订单收回重新派单；本端停止跟单。
   */
  async function cancelBeforeArrive(reasonCode) {
    const id = driverId.value
    const no = activeTripOrderNo.value
    if (!id || !no || !reasonCode) return
    tripActionLoading.value = true
    tripError.value = ''
    try {
      await postJson(`/driver/api/v1/orders/${encodeURIComponent(no)}/cancel`, {
        driverId: id,
        reasonCode,
      })
      showToast({ type: 'success', message: '已取消，订单已收回重新派单' })
      clearActiveTrip()
    } catch (e) {
      tripError.value = e?.message || String(e)
      const code = e?.code ?? e?.httpStatus
      if (code === 409) {
        showToast({ type: 'fail', message: e?.message || '操作冲突' })
      }
      maybeDropToLogin(e)
    } finally {
      tripActionLoading.value = false
    }
  }

  watch(
    authed,
    (v, wasAuthed) => {
      if (!v) {
        stopPollTimer()
        activeTripOrderNo.value = ''
        activeTrip.value = null
        tripError.value = ''
        if (wasAuthed) {
          try {
            sessionStorage.removeItem(STORAGE_KEY)
          } catch {
            /* ignore */
          }
        }
        return
      }
      try {
        const saved = sessionStorage.getItem(STORAGE_KEY)
        if (saved) beginFollowingOrder(saved)
      } catch {
        /* ignore */
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    stopPollTimer()
  })

  return reactive({
    activeTripOrderNo,
    activeTrip,
    tripLoading,
    tripError,
    tripActionLoading,
    finishFinalAmount,
    POLL_MS,
    beginFollowingOrder,
    dismissTripPanel,
    fetchTripOnce,
    clearActiveTrip,
    arrive,
    startTrip,
    finishTrip,
    cancelBeforeArrive,
  })
}
