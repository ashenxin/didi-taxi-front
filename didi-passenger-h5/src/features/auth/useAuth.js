import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { clearToken, getToken, postJson, setToken } from '../../api/http'

const PHONE_STORAGE_KEY = 'didi_passenger_last_phone'
/** 与后端发送间隔体验对齐，冷却内按钮置灰并倒计时 */
const SMS_RESEND_COOLDOWN_SEC = 60

export function useAuth() {
  const authed = ref(!!getToken())
  const authTab = ref('sms')

  const phone = ref(localStorage.getItem(PHONE_STORAGE_KEY) || '')
  const password = ref('')
  const smsCode = ref('')

  const authLoading = ref(false)
  const smsSending = ref(false)
  const smsHint = ref('')
  const authError = ref(null)
  const smsCooldownSec = ref(0)
  let smsCooldownTimer = null

  function stopSmsCooldown() {
    if (smsCooldownTimer != null) {
      clearInterval(smsCooldownTimer)
      smsCooldownTimer = null
    }
    smsCooldownSec.value = 0
  }

  function startSmsCooldown() {
    stopSmsCooldown()
    smsCooldownSec.value = SMS_RESEND_COOLDOWN_SEC
    smsCooldownTimer = setInterval(() => {
      if (smsCooldownSec.value <= 1) {
        stopSmsCooldown()
      } else {
        smsCooldownSec.value -= 1
      }
    }, 1000)
  }

  const smsSendDisabled = computed(() => smsSending.value || smsCooldownSec.value > 0)

  const smsSendButtonType = computed(() => {
    if (smsSending.value) return 'primary'
    if (smsCooldownSec.value > 0) return 'default'
    return 'primary'
  })

  const smsSendButtonText = computed(() => {
    if (smsSending.value) return '发送中'
    if (smsCooldownSec.value > 0) return `${smsCooldownSec.value}s后重发`
    return '发送验证码'
  })

  function resetInputs() {
    password.value = ''
    smsCode.value = ''
    smsHint.value = ''
    stopSmsCooldown()
  }

  onBeforeUnmount(() => {
    stopSmsCooldown()
  })

  function maybeDropToLogin(err) {
    if (err?.code === 401 || err?.httpStatus === 401) {
      authed.value = false
      resetInputs()
      return true
    }
    const msg = err?.message || String(err || '')
    if (msg.includes('未登录') || msg.includes('登录已失效') || msg.includes('未授权')) {
      authed.value = false
      resetInputs()
      return true
    }
    return false
  }

  async function sendSms() {
    smsHint.value = ''
    authError.value = null
    smsSending.value = true
    const startedAt = Date.now()
    try {
      await postJson('/app/api/v1/auth/sms/send', { phone: phone.value })
      smsHint.value = '验证码已发送（本地 mock 会在后端日志打印 code）'
      startSmsCooldown()
    } catch (e) {
      smsHint.value = e?.message || String(e)
      maybeDropToLogin(e)
    } finally {
      const elapsed = Date.now() - startedAt
      const remain = 1000 - elapsed
      if (remain > 0) await new Promise((r) => setTimeout(r, remain))
      smsSending.value = false
    }
  }

  async function loginSms() {
    authLoading.value = true
    authError.value = null
    try {
      const data = await postJson('/app/api/v1/auth/login-sms', { phone: phone.value, code: smsCode.value })
      if (data?.accessToken) {
        setToken(data.accessToken)
        authed.value = true
        resetInputs()
      }
    } catch (e) {
      authError.value = e?.message || String(e)
      smsCode.value = ''
      maybeDropToLogin(e)
    } finally {
      authLoading.value = false
    }
  }

  async function loginPassword() {
    authLoading.value = true
    authError.value = null
    try {
      const data = await postJson('/app/api/v1/auth/login-password', { phone: phone.value, password: password.value })
      if (data?.accessToken) {
        setToken(data.accessToken)
        authed.value = true
        resetInputs()
      }
    } catch (e) {
      authError.value = e?.message || String(e)
      password.value = ''
      maybeDropToLogin(e)
    } finally {
      authLoading.value = false
    }
  }

  /**
   * 调用服务端登出（到达前在途单会按 PRD 代取消），再清理本机 token。
   * @returns {Promise<string>} 可选提示文案（来自服务端 `data.hint`）
   */
  async function logout() {
    let hint = ''
    if (getToken()) {
      try {
        const data = await postJson('/app/api/v1/auth/logout', {})
        if (data && typeof data.hint === 'string' && data.hint.trim()) {
          hint = data.hint.trim()
        }
      } catch (e) {
        // 仍清理本机会话；网络/401 等不阻塞退出
      }
    }
    clearToken()
    authed.value = false
    authError.value = null
    resetInputs()
    return hint
  }

  /** 验证码 ↔ 密码登录切换（单次只展示一种方式） */
  function switchLoginMode(mode) {
    if (mode !== 'sms' && mode !== 'pwd') return
    authTab.value = mode
    authError.value = null
    smsHint.value = ''
    if (mode === 'pwd') {
      stopSmsCooldown()
    }
  }

  watch(authed, (v) => {
    if (!v) resetInputs()
  })

  watch(phone, (v) => {
    try {
      localStorage.setItem(PHONE_STORAGE_KEY, v || '')
    } catch {
      /* ignore */
    }
  })

  return {
    authed,
    authTab,
    phone,
    password,
    smsCode,
    smsSending,
    smsSendDisabled,
    smsSendButtonType,
    smsSendButtonText,
    smsHint,
    authLoading,
    authError,
    sendSms,
    loginSms,
    loginPassword,
    logout,
    maybeDropToLogin,
    switchLoginMode,
  }
}

