import { codeToText, provinceAndCityData } from 'element-china-area-data'

/** 直辖市省级 code 前缀（国标省级前两位） */
export const MUNICIPALITY_SHORT = new Set(['11', '12', '31', '50'])

/** 仅保留数字 */
export function normalizeGbDigits(code) {
  if (code == null || code === '') return ''
  return String(code).replace(/\D/g, '')
}

/**
 * 国标 6 位省码 -> element 省 value（一般为前 2 位，如 330000 -> 33）
 */
export function shortProvinceFromGb6(provinceGb) {
  const p = normalizeGbDigits(provinceGb)
  if (!p) return ''
  if (p.length >= 2) return p.slice(0, 2)
  return p
}

export function isMunicipalityProvinceGb(provinceGb) {
  return MUNICIPALITY_SHORT.has(shortProvinceFromGb6(provinceGb))
}

/**
 * 在省级节点下，为国标地市/区县码匹配 cascader 子节点的 value（可能 4 位或 6 位）
 */
export function matchChildCityValue(provNode, cityGb6) {
  if (!provNode?.children?.length) return null
  const c = normalizeGbDigits(cityGb6)
  if (!c) return null
  for (const ch of provNode.children) {
    const v = String(ch.value)
    if (v === c) return v
    if (c.length === 6 && v.length === 4 && c.slice(0, 4) === v) return v
    if (c.length === 6 && v.length === 4 && c.startsWith(v) && c.endsWith('00')) return v
  }
  return null
}

/**
 * 国标省、市码 -> el-cascader 的 value 路径（与 provinceAndCityData 一致）
 */
export function gbCodesToCascaderValue(provinceGb, cityGb) {
  const p = normalizeGbDigits(provinceGb)
  if (p.length < 6) return []
  const pShort = p.slice(0, 2)
  const provNode = provinceAndCityData.find((n) => n.value === pShort)
  if (!provNode) return []
  const c = normalizeGbDigits(cityGb)
  if (!c) return [pShort]
  const cVal = matchChildCityValue(provNode, c)
  if (cVal) return [pShort, cVal]
  return [pShort]
}

/**
 * cascader 选中值 -> 国标 6 位省码、市/区县码（与后端约定一致）
 */
export function toGb6ProvinceCode(shortOrLong) {
  const digits = normalizeGbDigits(shortOrLong)
  if (!digits) return ''
  if (digits.length >= 6) return digits.slice(0, 6)
  return `${digits.slice(0, 2).padStart(2, '0')}0000`.slice(0, 6)
}

export function cascaderValuesToGbPair(values) {
  if (!values?.length) return { provinceCode: '', cityCode: '' }
  const p = String(values[0])
  const provinceCode = toGb6ProvinceCode(p)

  if (values.length < 2) return { provinceCode, cityCode: '' }
  const c = String(values[1])
  const cd = normalizeGbDigits(c)
  let cityCode = ''
  if (cd.length === 4) cityCode = `${cd}00`
  else if (cd.length >= 6) cityCode = cd.slice(0, 6)
  else if (cd.length > 0) cityCode = `${cd.padEnd(6, '0')}`.slice(0, 6)
  return { provinceCode, cityCode }
}

/**
 * 展示用：省/市中文名。直辖市仅显示市名（如「上海市」），不拼市辖区编码或 / 310100。
 */
export function formatGbRegionTitle(provinceGb, cityGb) {
  const pShort = shortProvinceFromGb6(provinceGb)
  const provLabel = pShort ? codeToText[pShort] || '' : ''

  if (MUNICIPALITY_SHORT.has(pShort)) {
    return provLabel || (provinceGb ? String(provinceGb) : '') || '—'
  }

  const provNode = pShort ? provinceAndCityData.find((n) => n.value === pShort) : null
  const provFallback = pShort ? provLabel || provinceGb || '' : ''

  const cRaw = normalizeGbDigits(cityGb)
  let cityLabel = ''
  if (cRaw && provNode) {
    const cVal = matchChildCityValue(provNode, cRaw)
    if (cVal) cityLabel = codeToText[cVal] || ''
    else cityLabel = codeToText[cRaw] || ''
  } else if (cRaw) {
    cityLabel = codeToText[cRaw] || ''
  }

  if (provFallback && cityLabel) return `${provFallback} / ${cityLabel}`
  if (provFallback) return provFallback
  if (cityLabel) return cityLabel
  if (provinceGb || cityGb) {
    const a = provinceGb ? String(provinceGb) : ''
    const b = cityGb ? String(cityGb) : ''
    return [a, b].filter(Boolean).join(' / ') || '—'
  }
  return '—'
}

/** 详情页「区划编码」：直辖市只展示省级国标码，不展示市辖区码（如 310100） */
export function formatGbDivisionCodesDetail(provinceGb, cityGb) {
  if (isMunicipalityProvinceGb(provinceGb)) {
    const pc = normalizeGbDigits(provinceGb)
    if (pc.length >= 6) return pc.slice(0, 6)
    return toGb6ProvinceCode(provinceGb) || '—'
  }
  const a = provinceGb ? String(provinceGb) : ''
  const b = cityGb ? String(cityGb) : ''
  return [a, b].filter(Boolean).join(' / ') || '—'
}
