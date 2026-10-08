export function downloadBytes(bytes: Uint8Array | string, filename: string, type: string): void {
  const blob = bytes instanceof Uint8Array ? new Blob([bytes.slice().buffer], { type }) : new Blob([bytes], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function bytesToObjectUrl(bytes: Uint8Array, type: string): string {
  return URL.createObjectURL(new Blob([bytes.slice().buffer], { type }))
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}
