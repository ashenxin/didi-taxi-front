import { getJson, postJson, requestJson } from '../../../api/http'

const BASE = '/admin/api/v1/vehicle-ai'

export function fetchVehicleModels(params = {}) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, v)
  })
  return getJson(`${BASE}/models?${q.toString()}`)
}

export function fetchVehicleModel(id) {
  return getJson(`${BASE}/models/${id}`)
}

export function createVehicleModel(body) {
  return postJson(`${BASE}/models`, body)
}

export function importVehicleImages({ modelId, shotAngle, tags, files }) {
  const form = new FormData()
  form.append('modelId', String(modelId))
  form.append('shotAngle', String(shotAngle))
  if (tags) form.append('tags', tags)
  Array.from(files || []).forEach((f) => form.append('files', f))
  return requestJson(`${BASE}/images/import`, { method: 'POST', body: form, timeoutMs: 60_000 })
}

export function reindexVehicleImage(imageId) {
  return requestJson(`${BASE}/images/${imageId}/reindex`, { method: 'POST' })
}

export function searchVehicle({ file, brandCode, energyType, bodyType, priceBand, topN = 5 }) {
  const form = new FormData()
  form.append('file', file)
  if (brandCode) form.append('brandCode', brandCode)
  if (energyType) form.append('energyType', String(energyType))
  if (bodyType) form.append('bodyType', String(bodyType))
  if (priceBand) form.append('priceBand', String(priceBand))
  form.append('topN', String(topN))
  return requestJson(`${BASE}/search`, { method: 'POST', body: form, timeoutMs: 20_000 })
}

export function sendVehicleFeedback(logId, feedback, correctModelId) {
  return postJson(`${BASE}/search/${logId}/feedback`, { feedback, correctModelId })
}

export function fetchVehicleStats() {
  return getJson(`${BASE}/images/stats`)
}

export function fetchVehicleOptions() {
  return getJson(`${BASE}/options`)
}
