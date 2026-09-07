import { getJson } from '../../api/http'

export function fetchTrips(params) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value != null) query.set(key, String(value))
  }
  return getJson(`/driver/api/v1/profile/orders?${query}`)
}
export function fetchTrip(id) {
  return getJson(`/driver/api/v1/profile/orders/${encodeURIComponent(id)}`)
}
export function fetchToday() {
  return getJson('/driver/api/v1/dashboard/today')
}
