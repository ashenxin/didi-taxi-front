import { ref, watch } from 'vue'

import { clearToken, getToken, postJson, setToken } from '../../api/http'

const PHONE_STORAGE_KEY = 'didi_passenger_last_phone'

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

  function resetInputs() {
    password.value = ''
    smsCode.value = ''
    smsHint.value = ''
  }

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

  function logout() {
    clearToken()
    authed.value = false
    authError.value = null
    resetInputs()
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
    smsHint,
    authLoading,
    authError,
    sendSms,
    loginSms,
    loginPassword,
    logout,
    maybeDropToLogin
  }
}

