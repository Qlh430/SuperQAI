(function installCanvasFileImport(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CanvasFileImport = api;
})(typeof window === 'object' ? window : globalThis, function(root) {
  'use strict';
  let host, readerLoading;
  const extensions = {
    png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', bmp: 'image', avif: 'image', svg: 'image',
    mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', wmv: 'video', mkv: 'video', avi: 'video',
    mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio', ogg: 'audio', opus: 'audio',
    txt: 'txt', md: 'md', docx: 'docx', pdf: 'pdf',
  };
  function kind(file) {
    const extension = String(file?.name || '').split('.').at(-1).toLowerCase();
    if (extensions[extension]) return extensions[extension];
    const type = String(file?.type || '');
    return /^(image|video|audio)\//.test(type) ? type.split('/')[0] : type === 'application/pdf' ? 'pdf'
      : type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? 'docx' : type === 'text/markdown' ? 'md' : type === 'text/plain' ? 'txt' : '';
  }
  function files(transfer) {
    const listed = Array.from(transfer?.files || []);
    return listed.length ? listed : Array.from(transfer?.items || []).filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(Boolean);
  }
  function withMime(file, type) {
    if (/^(image|video|audio)\//.test(file.type || '')) return file;
    const extension = String(file.name || '').split('.').at(-1).toLowerCase();
    const subtypes = { jpg: 'jpeg', svg: 'svg+xml', mp3: 'mpeg', m4a: 'mp4', mov: 'quicktime', wmv: 'x-ms-wmv', mkv: 'x-matroska', avi: 'x-msvideo' };
    return new File([file], file.name, { type: `${type}/${subtypes[extension] || extension}`, lastModified: file.lastModified });
  }
  async function reader() {
    if (root.CanvasDocumentReader) return root.CanvasDocumentReader;
    if (!readerLoading) readerLoading = import('/canvas-document-reader.js?v=20261008-text-tools-import')
      .then(api => { root.CanvasDocumentReader = api; return api; })
      .catch(() => { readerLoading = null; throw new Error('文档解析组件加载失败，请刷新重试。'); });
    return readerLoading;
  }
  async function readDocument(file, type) {
    if (type === 'txt' || type === 'md') {
      if (file.size > 50 * 1024 * 1024) throw new Error('文档不能超过 50 MB。');
      const bytes = new Uint8Array(await file.arrayBuffer()); let text;
      const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
      try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
      catch { text = new TextDecoder('gb18030').decode(bytes); }
      text = text.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
      if (text.length > 2000000) throw new Error('文档正文过长，请拆分后导入。');
      return { text, markdown: type === 'md' };
    }
    return (await reader()).read(file, type);
  }
  async function importFiles(entries, point) {
    if (!host) throw new Error('画布文件导入尚未准备好，请刷新后重试。');
    const scope = host.scope(), active = () => host.scope() === scope;
    await host.prepare();
    if (!active()) return [];
    const created = [], failures = [];
    let x = point.x, y = point.y, rowHeight = 0, column = 0;
    for (const file of entries) {
      if (!active()) break;
      const type = kind(file);
      if (!type) { failures.push(`${file.name || '文件'}：不支持此格式`); continue; }
      const media = ['image', 'video', 'audio'].includes(type);
      const node = host.create(file, media, { x, y }); created.push(node);
      host.nodeStatus(node, media ? '正在上传素材…' : '正在读取文档…');
      try {
        if (media) await host.fillMedia(node, withMime(file, type), type);
        else {
          const value = await readDocument(file, type);
          if (!active() || !node.isConnected) break;
          host.fillText(node, value);
        }
        if (!active() || !node.isConnected) break;
        host.nodeStatus(node, '');
      } catch (error) {
        if (!active()) break;
        const message = `${file.name || '文件'}：${error.message || '导入失败，请重试'}`;
        host.nodeStatus(node, `导入失败：${error.message || '请重试'}`); failures.push(message);
      }
      const size = host.size(node); rowHeight = Math.max(rowHeight, size.height);
      column++; x += size.width + 72;
      if (column === 4) { column = 0; x = point.x; y += rowHeight + 72; rowHeight = 0; }
    }
    if (active()) {
      host.finish(created);
      host.status(failures.length ? `部分文件未成功导入：${failures.join('；')}` : `已导入 ${created.length} 个节点。`);
    }
    return created;
  }
  return Object.freeze({ kind, files, readDocument, importFiles, setHost(value) { host = value; } });
});
