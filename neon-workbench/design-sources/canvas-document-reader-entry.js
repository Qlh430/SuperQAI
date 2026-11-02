import mammoth from 'mammoth/mammoth.browser.js';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.mjs';

const MAX_TEXT = 2000000;
export function decodeText(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('gb18030').decode(bytes); }
}
function pageText(items) {
  let value = '', previous;
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const y = item.transform?.[5], x = item.transform?.[4];
    if (previous && !value.endsWith('\n')) {
      if (Math.abs(y - previous.y) > Math.max(2, (item.height || 10) * .35)) value += '\n';
      else if (x - previous.end > 2 && !/\s$/.test(value)) value += ' ';
    }
    value += item.str;
    if (item.hasEOL) value += '\n';
    previous = { y, end: x + (item.width || 0) };
  }
  return value.trim();
}
export async function read(file, kind) {
  if (!file || file.size > 50 * 1024 * 1024) throw new Error('文档不能超过 50 MB。');
  const buffer = await file.arrayBuffer();
  let text = '';
  if (kind === 'txt' || kind === 'md') text = decodeText(buffer);
  else if (kind === 'docx') {
    try { text = (await mammoth.extractRawText({ arrayBuffer: buffer })).value; }
    catch { throw new Error('DOCX 解析失败，请确认文件完整且未加密。'); }
  } else if (kind === 'pdf') {
    GlobalWorkerOptions.workerSrc = new URL('/canvas-pdf-worker.js?v=20261008-text-tools-import', location.href).href;
    const task = getDocument({ data: new Uint8Array(buffer), cMapUrl: '/canvas-pdf-cmaps/', cMapPacked: true,
      standardFontDataUrl: '/canvas-pdf-fonts/', isEvalSupported: false, stopAtErrors: true, verbosity: 0 });
    let pdf;
    try {
      pdf = await task.promise;
      if (pdf.numPages > 300) throw new Error('PDF 最多支持 300 页，请拆分后导入。');
      const pages = [];
      let length = 0;
      for (let index = 1; index <= pdf.numPages; index++) {
        const page = await pdf.getPage(index);
        const value = pageText((await page.getTextContent()).items);
        length += value.length;
        if (length > MAX_TEXT) throw new Error('文档正文过长，请拆分后导入。');
        pages.push(value); page.cleanup();
      }
      text = pages.join('\n\n');
      if (!text.trim()) throw new Error('PDF 没有可提取的正文，扫描件请先转换为文字。');
    } catch (error) {
      if (error.name === 'PasswordException') throw new Error('PDF 已加密，请解锁后再导入。');
      if (/^PDF (最多|没有)|^文档/.test(error.message)) throw error;
      throw new Error('PDF 解析失败，请确认文件完整且未加密。');
    } finally { await task.destroy(); }
  } else throw new Error('不支持此文档格式。');
  text = text.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
  if (text.length > MAX_TEXT) throw new Error('文档正文过长，请拆分后导入。');
  return { text, markdown: kind === 'md' };
}
