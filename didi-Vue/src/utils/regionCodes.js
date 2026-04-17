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
 * 仅知市/区县国标码时推断 6 位省级码，便于 {@link gbProvinceCityNames} 在直辖市下解析「区」而非只显示直辖市名。
 * 例：310115 → 310000；330100 → 330000。
 */
export function inferGbProvince6FromCityOrDistrictCode(code) {
  const d = normalizeGbDigits(code)
  if (d.length < 2) return ''
  const p2 = d.slice(0, 2)
  if (MUNICIPALITY_SHORT.has(p2)) {
    return `${p2}0000`.slice(0, 6)
  }
  if (d.length >= 4) {
    return `${d.slice(0, 2)}0000`.slice(0, 6)
  }
  return ''
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
 * 在省级节点子树中匹配国标市/区县码（支持直辖市「市辖区 → 区县」等多级）。
 */
export function matchChildCityValueDeep(provNode, cityGb6) {
  const c = normalizeGbDigits(cityGb6)
  if (!c || !provNode?.children?.length) return null
  for (const ch of provNode.children) {
    const v = String(ch.value)
    if (v === c) return v
    if (c.length === 6 && v.length === 4 && c.slice(0, 4) === v) return v
    if (c.length === 6 && v.length === 4 && c.startsWith(v) && c.endsWith('00')) return v
    const sub = matchChildCityValueDeep(ch, cityGb6)
    if (sub) return sub
  }
  return null
}

/**
 * 在省级子树中查找从省到目标区划的 cascader 路径（含直辖市多级「市辖区→区县」）。
 */
function findCascaderPathUnderProvince(provNode, cityGb6) {
  const target = normalizeGbDigits(cityGb6)
  if (!target || !provNode?.children?.length) return null
  const pShort = String(provNode.value)

  function matchesNode(nodeValue, gb6) {
    const v = String(nodeValue)
    const t = normalizeGbDigits(gb6)
    if (!t) return false
    if (v === t) return true
    const vn = normalizeGbDigits(v)
    if (vn === t) return true
    if (t.length === 6 && v.length === 4 && t.slice(0, 4) === v) {
      // 区县码（末两位非 00）不能只匹配到「市辖区」等 4 位父节点，须继续下钻到区县
      if (!t.endsWith('00')) return false
      return true
    }
    if (t.length === 6 && v.length === 4 && t.startsWith(v) && t.endsWith('00')) return true
    return false
  }

  function dfs(node, pathPrefix) {
    const path = [...pathPrefix, node.value]
    if (matchesNode(node.value, target)) return path
    if (!node.children?.length) return null
    for (const ch of node.children) {
      const r = dfs(ch, path)
      if (r) return r
    }
    return null
  }

  for (const ch of provNode.children) {
    const r = dfs(ch, [pShort])
    if (r) return r
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
  const deep = findCascaderPathUnderProvince(provNode, c)
  if (deep?.length) return deep
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
  // 省 / 市 / 区县 三级（如北京→市辖区→东城区）时，取路径最后一级作为市或区县国标码
  const c = String(values[values.length - 1])
  const cd = normalizeGbDigits(c)
  let cityCode = ''
  if (cd.length === 4) cityCode = `${cd}00`
  else if (cd.length >= 6) cityCode = cd.slice(0, 6)
  else if (cd.length > 0) cityCode = `${cd.padEnd(6, '0')}`.slice(0, 6)
  return { provinceCode, cityCode }
}

/**
 * 管理端列表推荐：省/市（或直辖市+区县）中文展示。
 * 与计价规则、司机列表一致：直辖市在落 **区县码**（如 310104）时显示「上海市/徐汇区」，不会只显示直辖市名。
 */
export function formatGbRegionDisplayName(provinceGb, cityGb) {
  const cc = normalizeGbDigits(cityGb)
  const pRaw = provinceGb != null && String(provinceGb).trim() !== '' ? String(provinceGb).trim() : ''
  const p = pRaw || inferGbProvince6FromCityOrDistrictCode(cc)
  if (!cc && !p) return '—'
  const { provinceName, cityName } = gbProvinceCityNames(p, cc)
  if (provinceName && cityName && provinceName !== cityName) {
    return `${provinceName}/${cityName}`
  }
  if (provinceName) return provinceName
  if (cityName) return cityName
  return '—'
}

/**
 * 展示用：省/市中文名。直辖市仅显示市名（如「上海市」），不拼市辖区编码或 / 310100。
 * 若需展示区县（订单、计价等），请用 {@link formatGbRegionDisplayName}。
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

/**
 * 由国标省码、市码解析省名、市名（创建运力公司等提交用）。
 * 直辖市：省名为直辖市全称；若选了区县，市名（展示/落库 city_name）为区县名（如「东城区」），未选到区县时市名与省名相同。
 */
export function gbProvinceCityNames(provinceGb, cityGb) {
  const pShort = shortProvinceFromGb6(provinceGb)
  const provLabel = pShort ? codeToText[pShort] || '' : ''
  const provinceName = provLabel || ''
  const cRaw = normalizeGbDigits(cityGb)
  const provNode = pShort ? provinceAndCityData.find((n) => n.value === pShort) : null

  if (MUNICIPALITY_SHORT.has(pShort)) {
    if (!cRaw) {
      return { provinceName, cityName: provinceName }
    }
    let cityName = codeToText[cRaw] || ''
    if (!cityName && provNode) {
      const cVal = matchChildCityValueDeep(provNode, cRaw)
      if (cVal) cityName = codeToText[cVal] || ''
    }
    if (!cityName) cityName = provinceName
    return { provinceName, cityName }
  }

  let cityName = ''
  if (cRaw && provNode) {
    const cVal = matchChildCityValue(provNode, cRaw)
    if (cVal) cityName = codeToText[cVal] || ''
    else cityName = codeToText[cRaw] || ''
  } else if (cRaw) {
    cityName = codeToText[cRaw] || ''
  }

  return { provinceName, cityName }
}

function strTrim(v) {
  if (v == null || v === '') return ''
  return String(v).trim()
}

/**
 * 运力公司列表：库表省名+市名齐全时优先用；否则用国标码解析出省/市中文（避免仅有 cityName 时把省丢掉）。
 * 直辖市省名与市名相同时只显示一次。
 */
export function formatCompanyProvinceCity(row) {
  try {
    if (!row || typeof row !== 'object') return '—'
    const pn = strTrim(row.provinceName ?? row.province_name)
    const cn = strTrim(row.cityName ?? row.city_name)
    const pc = row.provinceCode ?? row.province_code
    const cc = row.cityCode ?? row.city_code

    if (pn && cn) {
      if (pn === cn) return pn
      return `${pn} / ${cn}`
    }
    if (pn && !cn) return pn

    const fromCodes = formatGbRegionDisplayName(pc, cc)
    if (fromCodes && fromCodes !== '—') return fromCodes
    if (cn) return cn
    if (pn) return pn
    return '—'
  } catch (e) {
    console.warn('formatCompanyProvinceCity', e)
    return '—'
  }
}

/** 列表单元格 title：优先中文名，否则市码 */
export function formatCompanyRegionHint(row) {
  try {
    if (!row || typeof row !== 'object') return ''
    const pn = strTrim(row.provinceName ?? row.province_name)
    const cn = strTrim(row.cityName ?? row.city_name)
    const hint = [pn, cn].filter(Boolean).join(' ')
    if (hint) return hint
    const cc = row.cityCode ?? row.city_code
    return cc != null && String(cc).trim() !== '' ? String(cc) : ''
  } catch (e) {
    console.warn('formatCompanyRegionHint', e)
    return ''
  }
}

/** 详情页「区划编码」：普通省展示 省码/市码；直辖市同时展示 **省级码与区县码**（如 310000 / 310104） */
export function formatGbDivisionCodesDetail(provinceGb, cityGb) {
  if (isMunicipalityProvinceGb(provinceGb)) {
    const pc = normalizeGbDigits(provinceGb)
    const cc = normalizeGbDigits(cityGb)
    const p6 = pc.length >= 6 ? pc.slice(0, 6) : toGb6ProvinceCode(provinceGb)
    if (cc.length >= 6) {
      const c6 = cc.slice(0, 6)
      if (p6 && c6 && c6 !== p6) {
        return `${p6} / ${c6}`
      }
    }
    return p6 || '—'
  }
  const a = provinceGb ? String(provinceGb) : ''
  const b = cityGb ? String(cityGb) : ''
  return [a, b].filter(Boolean).join(' / ') || '—'
}
