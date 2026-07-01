/**
 * lib/document-chunker.ts
 *
 * Chunking de documentos (PDF/MD/TXT/DOCX) reaproveitado por:
 * - app/api/knowledge/upload (upload direto pro RAG bruto, admin)
 * - app/api/manager/curation/import (upload governado pela Curadoria — vira rascunho)
 *
 * Markdown: quebra por cabeçalho (## / ###), cada seção vira um chunk (ou mais,
 * se a seção passar do tamanho máximo). Texto puro: quebra por parágrafo.
 */

const MAX_CHUNK_CHARS = 3200

export interface DocChunk {
  titulo: string
  conteudo: string
  texto_original: string
}

export function chunkMarkdown(text: string, source: string): DocChunk[] {
  const lines = text.split("\n")
  const chunks: DocChunk[] = []
  let currentTitle = source
  let currentLines: string[] = []
  let partIdx = 0

  function flush() {
    const body = currentLines.join("\n").trim()
    if (body.length < 50) return

    if (body.length > MAX_CHUNK_CHARS) {
      const paragraphs = body.split(/\n{2,}/)
      let buf: string[] = []
      let bufLen = 0
      function flushBuf() {
        const part = buf.join("\n\n").trim()
        if (part.length < 50) return
        partIdx++
        const titulo = `${currentTitle} (parte ${partIdx})`
        chunks.push({ titulo, conteudo: part, texto_original: `[${titulo}]\n\n${part}` })
        buf = []
        bufLen = 0
      }
      for (const para of paragraphs) {
        if (bufLen + para.length > MAX_CHUNK_CHARS && buf.length > 0) flushBuf()
        buf.push(para)
        bufLen += para.length + 2
      }
      flushBuf()
    } else {
      partIdx++
      const titulo = chunks.length === 0 && partIdx === 1
        ? currentTitle
        : `${currentTitle} (parte ${partIdx})`
      chunks.push({ titulo, conteudo: body, texto_original: `[${titulo}]\n\n${body}` })
    }
    currentLines = []
  }

  for (const line of lines) {
    const h2 = line.match(/^## (.+)/)
    const h3 = line.match(/^### (.+)/)
    if (h2 || h3) {
      flush()
      currentTitle = (h2 || h3)![1].trim()
      partIdx = 0
    } else if (line.trim() !== "---") {
      currentLines.push(line)
    }
  }
  flush()
  return chunks
}

export function chunkPlainText(text: string, source: string): DocChunk[] {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 80)
  const chunks: DocChunk[] = []
  let buf: string[] = []
  let bufLen = 0
  let idx = 0

  function flush() {
    const body = buf.join("\n\n").trim()
    if (body.length < 50) return
    idx++
    const titulo = `${source} (parte ${idx})`
    chunks.push({ titulo, conteudo: body, texto_original: `[${titulo}]\n\n${body}` })
    buf = []
    bufLen = 0
  }

  for (const para of paragraphs) {
    if (bufLen + para.length > MAX_CHUNK_CHARS && buf.length > 0) flush()
    buf.push(para)
    bufLen += para.length + 2
  }
  flush()
  return chunks
}

/**
 * Converte o HTML simples do mammoth (h1-h6, p, br, ul/li) num pseudo-markdown
 * com headings "## " — assim o DOCX ganha a mesma quebra por seção que o MD já
 * tem em `chunkMarkdown`, em vez de virar um único parágrafo gigante sem títulos.
 */
function htmlParaMarkdownSimples(html: string): string {
  return html
    .replace(/<h[1-6][^>]*>/gi, "\n\n## ")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/?(ul|ol)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Extrai o texto bruto de um arquivo (PDF/DOCX/MD/TXT) a partir do buffer + nome. */
export async function extrairTextoDeArquivo(fileName: string, buffer: Buffer): Promise<string> {
  const nome = fileName.toLowerCase()
  if (nome.endsWith(".pdf")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse/lib/pdf-parse")
    const parsed = await pdfParse(buffer)
    return parsed.text as string
  }
  if (nome.endsWith(".docx")) {
    const mammoth = await import("mammoth")
    const result = await mammoth.convertToHtml({ buffer })
    return htmlParaMarkdownSimples(result.value)
  }
  return buffer.toString("utf-8")
}

/** Escolhe o chunker certo pela extensão do arquivo — DOCX vira pseudo-markdown (ver acima), então usa o mesmo chunker por heading do MD. */
export function chunkPorExtensao(fileName: string, text: string, source: string): DocChunk[] {
  const nome = fileName.toLowerCase()
  return nome.endsWith(".md") || nome.endsWith(".docx") ? chunkMarkdown(text, source) : chunkPlainText(text, source)
}
