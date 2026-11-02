(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CanvasNodeTagRules = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const presets = ['#F9B902', '#F97316', '#EF4444', '#EC4899', '#A855F7', '#6366F1', '#3B82F6', '#22B8CF', '#44C466', '#36B5A6'];
  const defaults = ['人物', '场景', '道具', '风格参考', '分镜图', '参考图', '其他'].map((name, i) => ({ id: `default-${i + 1}`, name, color: presets[[0, 8, 6, 4, 3, 7, 9][i]] }));
  function validate(value) {
    if (!Array.isArray(value) || value.length > 200) throw new Error('标签库最多支持 200 个标签。');
    const ids = new Set(), names = new Set();
    return value.map(item => {
      const id = typeof item?.id === 'string' ? item.id : '';
      const name = typeof item?.name === 'string' ? item.name.trim() : '';
      const color = typeof item?.color === 'string' ? item.color.toUpperCase() : '';
      if (!/^[\w-]{1,80}$/.test(id) || ids.has(id)) throw new Error('标签标识无效或重复。');
      if (!name || [...name].length > 24 || /[\x00-\x1F\x7F]/.test(name)) throw new Error('标签名称需要 1–24 个字符。');
      if (names.has(name.toLocaleLowerCase())) throw new Error('标签名称已存在，请换一个名称。');
      if (!/^#[\dA-F]{6}$/.test(color)) throw new Error('标签颜色需要完整的六位十六进制颜色，例如 #44C466。');
      ids.add(id); names.add(name.toLocaleLowerCase()); return { id, name, color };
    });
  }
  function initialize(value) { return validate(value == null ? defaults : value); }
  function foreground(color) {
    const values = color.slice(1).match(/../g).map(x => { const v = parseInt(x, 16) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    return .2126 * values[0] + .7152 * values[1] + .0722 * values[2] > .179 ? '#080A0E' : '#FFFFFF';
  }
  return { validate, initialize, foreground, presets: [...presets] };
});
