/**
 * 将各服务分页 JSON 规范为 { list, total, pageNo, pageSize }。
 * 兼容 MyBatis Page 风格 records、Spring Data content/totalElements，以及 snake_case。
 */
export function unwrapPage(data) {
  if (data == null || typeof data !== 'object') {
    return { list: [], total: 0, pageNo: 1, pageSize: 10 }
  }
  const list = data.list ?? data.records ?? data.content ?? []
  const total = data.total ?? data.totalElements ?? data.totalCount ?? 0
  return {
    list: Array.isArray(list) ? list : [],
    total: Number(total) || 0,
    pageNo: data.pageNo != null ? Number(data.pageNo) || 1 : 1,
    pageSize: data.pageSize != null ? Number(data.pageSize) || 10 : 10
  }
}
