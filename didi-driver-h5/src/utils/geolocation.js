/**
 * 浏览器定位（WGS84），供上线听单写入 Redis 司机池 GEO。
 * @returns {Promise<{ lat: number, lng: number }>}
 */
export function getCurrentLatLng() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('当前环境不支持定位'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
      },
      (err) => {
        const msg =
          err?.code === 1
            ? '用户拒绝定位权限'
            : err?.code === 2
              ? '位置不可用'
              : err?.code === 3
                ? '定位超时'
                : err?.message || '定位失败'
        reject(new Error(msg))
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    )
  })
}
