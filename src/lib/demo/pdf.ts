/** 手写最小 PDF：N 页，每页若干行 ASCII 文本（基础字体 Helvetica 不支持中文）。页数检查依赖 /Type /Page 对象与 /Count。 */
function escapePdfText(text: string): string {
  return text.replace(/[\\()]/g, char => `\\${char}`).replace(/[^\x20-\x7E]/g, "?")
}

export function tinyPdf(pages: string[][]): Uint8Array {
  const objects: string[] = []
  const add = (body: string): number => {
    objects.push(body)
    return objects.length
  }
  const catalog = add("")
  const pagesObj = add("")
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
  const kids: number[] = []
  for (const lines of pages) {
    const content = ["BT", "/F1 14 Tf", "50 790 Td", "18 TL", ...lines.map(line => `(${escapePdfText(line)}) Tj T*`), "ET"].join("\n")
    const stream = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`))
  }
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map(id => `${id} 0 R`).join(" ")}] /Count ${kids.length} >>`
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`
  let body = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(body.length)
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`
  body += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const out = new Uint8Array(body.length)
  for (let index = 0; index < body.length; index += 1) out[index] = body.charCodeAt(index) & 0xFF
  return out
}
