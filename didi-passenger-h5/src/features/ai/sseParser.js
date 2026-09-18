/** POST 流按 SSE 行边界解析；兼容任意网络分片和多行 data。 */
export function createSseParser(onEvent) {
  let buffer = ''
  let eventName = 'message'
  let dataLines = []

  function dispatch() {
    if (dataLines.length) {
      const raw = dataLines.join('\n')
      let data
      try {
        data = JSON.parse(raw)
      } catch (cause) {
        throw new Error('客服流式响应解析失败', { cause })
      }
      onEvent(eventName, data)
    }
    eventName = 'message'
    dataLines = []
  }

  function line(value) {
    if (!value) {
      dispatch()
    } else if (!value.startsWith(':')) {
      const colon = value.indexOf(':')
      const field = colon < 0 ? value : value.slice(0, colon)
      let content = colon < 0 ? '' : value.slice(colon + 1)
      if (content.startsWith(' ')) content = content.slice(1)
      if (field === 'event') eventName = content || 'message'
      if (field === 'data') dataLines.push(content)
    }
  }

  return {
    feed(chunk) {
      buffer += chunk
      let newline
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const value = buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)
        line(value)
      }
    },
    finish() {
      if (buffer) line(buffer.replace(/\r$/, ''))
      dispatch()
    },
  }
}
