import puppeteer from "puppeteer"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const htmlPath = path.join(__dirname, "..", "docs", "relatorio-sistema-ia-15052026.html")
const pdfPath  = path.join(__dirname, "..", "docs", "relatorio-sistema-ia-15052026.pdf")

console.log("Gerando PDF...")

const browser = await puppeteer.launch({ headless: true })
const page    = await browser.newPage()

await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle0" })

await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  margin: { top: "0", right: "0", bottom: "0", left: "0" },
})

await browser.close()

console.log(`PDF gerado: ${pdfPath}`)
