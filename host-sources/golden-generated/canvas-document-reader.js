//#region \0rolldown/runtime.js
var e = Object.create, t = Object.defineProperty, n = Object.getOwnPropertyDescriptor, r = Object.getOwnPropertyNames, i = Object.getPrototypeOf, a = Object.prototype.hasOwnProperty, o = (e, t) => () => (t || (e((t = { exports: {} }).exports, t), e = null), t.exports), s = (e, i, o, s) => {
	if (i && typeof i == "object" || typeof i == "function") for (var c = r(i), l = 0, u = c.length, d; l < u; l++) d = c[l], !a.call(e, d) && d !== o && t(e, d, {
		get: ((e) => i[e]).bind(null, d),
		enumerable: !(s = n(i, d)) || s.enumerable
	});
	return e;
}, c = (n, r, o) => (o = n == null ? {} : e(i(n)), s(r || !n || !n.__esModule || !a.call(n, "default") ? t(o, "default", {
	value: n,
	enumerable: !0
}) : o, n)), l = /* @__PURE__ */ ((e) => typeof require < "u" ? require : typeof Proxy < "u" ? new Proxy(e, { get: (e, t) => (typeof require < "u" ? require : e)[t] }) : e)(function(e) {
	if (typeof require < "u") return require.apply(this, arguments);
	throw Error("Calling `require` for \"" + e + "\" in an environment that doesn't expose the `require` function. See https://rolldown.rs/in-depth/bundling-cjs#require-external-modules for more details.");
}), u = /* @__PURE__ */ c((/* @__PURE__ */ o(((e, t) => {
	(function(n) {
		if (typeof e == "object" && t !== void 0) t.exports = n();
		else if (typeof define == "function" && define.amd) define([], n);
		else {
			var r = typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : this;
			r.mammoth = n();
		}
	})(function() {
		var e;
		return (function e(t, n, r) {
			function i(o, s) {
				if (!n[o]) {
					if (!t[o]) {
						var c = typeof l == "function" && l;
						if (!s && c) return c(o, !0);
						if (a) return a(o, !0);
						var u = /* @__PURE__ */ Error("Cannot find module '" + o + "'");
						throw u.code = "MODULE_NOT_FOUND", u;
					}
					var d = n[o] = { exports: {} };
					t[o][0].call(d.exports, function(e) {
						var n = t[o][1][e];
						return i(n || e);
					}, d, d.exports, e, t, n, r);
				}
				return n[o].exports;
			}
			for (var a = typeof l == "function" && l, o = 0; o < r.length; o++) i(r[o]);
			return i;
		})({
			1: [function(e, t, n) {
				var r = e("../../lib/promises");
				n.Files = i;
				function i() {
					function e(e) {
						return r.reject(/* @__PURE__ */ Error("could not open external image: '" + e + "'\ncannot open linked files from a web browser"));
					}
					return { read: e };
				}
			}, { "../../lib/promises": 23 }],
			2: [function(e, t, n) {
				var r = e("../lib/promises"), i = e("../lib/zipfile");
				n.openZip = a;
				function a(e) {
					return e.arrayBuffer ? r.resolve(i.openArrayBuffer(e.arrayBuffer)) : r.reject(/* @__PURE__ */ Error("Could not find file in options"));
				}
			}, {
				"../lib/promises": 23,
				"../lib/zipfile": 40
			}],
			3: [function(e, t, n) {
				var r = e("underscore"), i = e("./promises"), a = e("./documents"), o = e("./styles/html-paths"), s = e("./results"), c = e("./images"), l = e("./html"), u = e("./writers");
				n.DocumentConverter = d;
				function d(e) {
					return { convertToHtml: function(t) {
						return new f(e, r.indexBy(t.type === a.types.document ? t.comments : [], "commentId")).convertToHtml(t);
					} };
				}
				function f(e, t) {
					var n = 1, d = [], f = [];
					e = r.extend({ ignoreEmptyParagraphs: !0 }, e);
					var p = e.idPrefix === void 0 ? "" : e.idPrefix, y = e.ignoreEmptyParagraphs, b = o.topLevelElement("p"), x = e.styleMap || [];
					function S(t) {
						var n = [], a = w(t, n, Object.create(null)), o = [];
						_(a, function(e) {
							e.type === "deferred" && o.push(e);
						});
						var c = Object.create(null);
						return i.forEachSeries(o, function(e) {
							return e.value().then(function(t) {
								c[e.id] = t;
							});
						}).then(function() {
							function t(e) {
								return g(e, function(e) {
									return e.type === "deferred" ? c[e.id] : e.children ? [r.extend({}, e, { children: t(e.children) })] : [e];
								});
							}
							var i = u.writer({
								prettyPrint: e.prettyPrint,
								outputFormat: e.outputFormat
							});
							return l.write(i, l.simplify(t(a))), new s.Result(i.asString(), n);
						});
					}
					function C(e, t, n) {
						return g(e, function(e) {
							return w(e, t, n);
						});
					}
					function w(e, t, n) {
						if (!n) throw Error("context not set");
						var r = te[e.type];
						return r ? r(e, t, n) : [];
					}
					function T(e, t, n) {
						return E(e, t).wrap(function() {
							var r = C(e.children, t, n);
							return y ? r : [l.forceWrite].concat(r);
						});
					}
					function E(e, t) {
						var n = A(e);
						return n ? n.to : (e.styleId && t.push(h("paragraph", e)), b);
					}
					function D(e, t, n) {
						var r = function() {
							return C(e.children, t, n);
						}, i = [];
						if (e.highlight !== null) {
							var s = k({
								type: "highlight",
								color: e.highlight
							});
							s && i.push(s);
						}
						e.isSmallCaps && i.push(O("smallCaps")), e.isAllCaps && i.push(O("allCaps")), e.isStrikethrough && i.push(O("strikethrough", "s")), e.isUnderline && i.push(O("underline")), e.verticalAlignment === a.verticalAlignment.subscript && i.push(o.element("sub", {}, { fresh: !1 })), e.verticalAlignment === a.verticalAlignment.superscript && i.push(o.element("sup", {}, { fresh: !1 })), e.isItalic && i.push(O("italic", "em")), e.isBold && i.push(O("bold", "strong"));
						var c = o.empty, l = A(e);
						return l ? c = l.to : e.styleId && t.push(h("run", e)), i.push(c), i.forEach(function(e) {
							r = e.wrap.bind(e, r);
						}), r();
					}
					function O(e, t) {
						return k({ type: e }) || (t ? o.element(t, {}, { fresh: !1 }) : o.empty);
					}
					function k(e, t) {
						var n = A(e);
						return n ? n.to : t;
					}
					function A(e) {
						for (var t = 0; t < x.length; t++) if (x[t].from.matches(e)) return x[t];
					}
					function j(e) {
						return function(t, n) {
							return i.try(function() {
								return e(t, n);
							}).catch(function(e) {
								return n.push(s.error(e)), [];
							});
						};
					}
					function M(e) {
						return P(e.noteType, e.noteId);
					}
					function N(e) {
						return F(e.noteType, e.noteId);
					}
					function P(e, t) {
						return I(e + "-" + t);
					}
					function F(e, t) {
						return I(e + "-ref-" + t);
					}
					function I(e) {
						return p + e;
					}
					var L = o.elements([o.element("table", {}, { fresh: !0 })]);
					function R(e, t, n) {
						return k(e, L).wrap(function() {
							return z(e, t, n);
						});
					}
					function z(e, t, n) {
						var i = r.findIndex(e.children, function(e) {
							return !e.type === a.types.tableRow || !e.isHeader;
						});
						i === -1 && (i = e.children.length);
						var o;
						if (i === 0) o = C(e.children, t, r.extend({}, n, { isTableHeader: !1 }));
						else {
							var s = C(e.children.slice(0, i), t, r.extend({}, n, { isTableHeader: !0 })), c = C(e.children.slice(i), t, r.extend({}, n, { isTableHeader: !1 }));
							o = [l.freshElement("thead", {}, s), l.freshElement("tbody", {}, c)];
						}
						return [l.forceWrite].concat(o);
					}
					function B(e, t, n) {
						var r = C(e.children, t, n);
						return [l.freshElement("tr", {}, [l.forceWrite].concat(r))];
					}
					function V(e, t, n) {
						var r = n.isTableHeader ? "th" : "td", i = C(e.children, t, n), a = {};
						return e.colSpan !== 1 && (a.colspan = e.colSpan.toString()), e.rowSpan !== 1 && (a.rowspan = e.rowSpan.toString()), [l.freshElement(r, a, [l.forceWrite].concat(i))];
					}
					function H(e, n, r) {
						return k(e, o.ignore).wrap(function() {
							var n = t[e.commentId], r = f.length + 1, i = "[" + v(n) + r + "]";
							return f.push({
								label: i,
								comment: n
							}), [l.freshElement("a", {
								href: "#" + P("comment", e.commentId),
								id: F("comment", e.commentId)
							}, [l.text(i)])];
						});
					}
					function U(e, t, n) {
						var r = e.label, i = e.comment, a = C(i.body, t, n).concat([l.nonFreshElement("p", {}, [l.text(" "), l.freshElement("a", { href: "#" + F("comment", i.commentId) }, [l.text("↑")])])]);
						return [l.freshElement("dt", { id: P("comment", i.commentId) }, [l.text("Comment " + r)]), l.freshElement("dd", {}, a)];
					}
					function ee(e, t, n) {
						return W(e).wrap(function() {
							return [];
						});
					}
					function W(e) {
						var t = A(e);
						return t ? t.to : e.breakType === "line" ? o.topLevelElement("br") : o.empty;
					}
					var te = {
						document: function(e, t, n) {
							var r = C(e.children, t, n), i = C(d.map(function(t) {
								return e.notes.resolve(t);
							}), t, n);
							return r.concat([l.freshElement("ol", {}, i), l.freshElement("dl", {}, g(f, function(e) {
								return U(e, t, n);
							}))]);
						},
						paragraph: T,
						run: D,
						text: function(e, t, n) {
							return [l.text(e.value)];
						},
						tab: function(e, t, n) {
							return [l.text("	")];
						},
						hyperlink: function(e, t, n) {
							var r = { href: e.anchor ? "#" + I(e.anchor) : e.href };
							e.targetFrame != null && (r.target = e.targetFrame);
							var i = C(e.children, t, n);
							return [l.nonFreshElement("a", r, i)];
						},
						checkbox: function(e) {
							var t = { type: "checkbox" };
							return e.checked && (t.checked = "checked"), [l.freshElement("input", t)];
						},
						bookmarkStart: function(e, t, n) {
							return [l.freshElement("a", { id: I(e.name) }, [l.forceWrite])];
						},
						noteReference: function(e, t, r) {
							d.push(e);
							var i = l.freshElement("a", {
								href: "#" + M(e),
								id: N(e)
							}, [l.text("[" + n++ + "]")]);
							return [l.freshElement("sup", {}, [i])];
						},
						note: function(e, t, n) {
							var r = C(e.body, t, n), i = l.elementWithTag(o.element("p", {}, { fresh: !1 }), [l.text(" "), l.freshElement("a", { href: "#" + N(e) }, [l.text("↑")])]), a = r.concat([i]);
							return l.freshElement("li", { id: M(e) }, a);
						},
						commentReference: H,
						comment: U,
						image: m(j(e.convertImage || c.dataUri)),
						table: R,
						tableRow: B,
						tableCell: V,
						break: ee
					};
					return { convertToHtml: S };
				}
				var p = 1;
				function m(e) {
					return function(t, n, r) {
						return [{
							type: "deferred",
							id: p++,
							value: function() {
								return e(t, n, r);
							}
						}];
					};
				}
				function h(e, t) {
					return s.warning("Unrecognised " + e + " style: '" + t.styleName + "' (Style ID: " + t.styleId + ")");
				}
				function g(e, t) {
					return r.flatten(e.map(t), !0);
				}
				function _(e, t) {
					e.forEach(function(e) {
						t(e), e.children && _(e.children, t);
					});
				}
				var v = n.commentAuthorLabel = function(e) {
					return e.authorInitials || "";
				};
			}, {
				"./documents": 4,
				"./html": 18,
				"./images": 20,
				"./promises": 23,
				"./results": 25,
				"./styles/html-paths": 28,
				"./writers": 33,
				underscore: 67
			}],
			4: [function(e, t, n) {
				(function(t) {
					var r = e("underscore"), i = n.types = {
						document: "document",
						paragraph: "paragraph",
						run: "run",
						text: "text",
						tab: "tab",
						checkbox: "checkbox",
						hyperlink: "hyperlink",
						noteReference: "noteReference",
						image: "image",
						note: "note",
						commentReference: "commentReference",
						comment: "comment",
						table: "table",
						tableRow: "tableRow",
						tableCell: "tableCell",
						break: "break",
						bookmarkStart: "bookmarkStart"
					};
					function a(e, t) {
						return t ||= {}, {
							type: i.document,
							children: e,
							notes: t.notes || new m({}),
							comments: t.comments || []
						};
					}
					function o(e, t) {
						t ||= {};
						var n = t.indent || {};
						return {
							type: i.paragraph,
							children: e,
							styleId: t.styleId || null,
							styleName: t.styleName || null,
							numbering: t.numbering || null,
							alignment: t.alignment || null,
							indent: {
								start: n.start || null,
								end: n.end || null,
								firstLine: n.firstLine || null,
								hanging: n.hanging || null
							}
						};
					}
					function s(e, t) {
						return t ||= {}, {
							type: i.run,
							children: e,
							styleId: t.styleId || null,
							styleName: t.styleName || null,
							isBold: !!t.isBold,
							isUnderline: !!t.isUnderline,
							isItalic: !!t.isItalic,
							isStrikethrough: !!t.isStrikethrough,
							isAllCaps: !!t.isAllCaps,
							isSmallCaps: !!t.isSmallCaps,
							verticalAlignment: t.verticalAlignment || c.baseline,
							font: t.font || null,
							fontSize: t.fontSize || null,
							highlight: t.highlight || null
						};
					}
					var c = {
						baseline: "baseline",
						superscript: "superscript",
						subscript: "subscript"
					};
					function l(e) {
						return {
							type: i.text,
							value: e
						};
					}
					function u() {
						return { type: i.tab };
					}
					function d(e) {
						return {
							type: i.checkbox,
							checked: e.checked
						};
					}
					function f(e, t) {
						return {
							type: i.hyperlink,
							children: e,
							href: t.href,
							anchor: t.anchor,
							targetFrame: t.targetFrame
						};
					}
					function p(e) {
						return {
							type: i.noteReference,
							noteType: e.noteType,
							noteId: e.noteId
						};
					}
					function m(e) {
						this._notes = r.indexBy(e, function(e) {
							return v(e.noteType, e.noteId);
						});
					}
					m.prototype.resolve = function(e) {
						return this.findNoteByKey(v(e.noteType, e.noteId));
					}, m.prototype.findNoteByKey = function(e) {
						return this._notes[e] || null;
					};
					function h(e) {
						return {
							type: i.note,
							noteType: e.noteType,
							noteId: e.noteId,
							body: e.body
						};
					}
					function g(e) {
						return {
							type: i.commentReference,
							commentId: e.commentId
						};
					}
					function _(e) {
						return {
							type: i.comment,
							commentId: e.commentId,
							body: e.body,
							authorName: e.authorName,
							authorInitials: e.authorInitials
						};
					}
					function v(e, t) {
						return e + "-" + t;
					}
					function y(e) {
						return {
							type: i.image,
							read: function(n) {
								return n ? e.readImage(n) : e.readImage().then(function(e) {
									return t.from(e);
								});
							},
							readAsArrayBuffer: function() {
								return e.readImage();
							},
							readAsBase64String: function() {
								return e.readImage("base64");
							},
							readAsBuffer: function() {
								return e.readImage().then(function(e) {
									return t.from(e);
								});
							},
							altText: e.altText,
							contentType: e.contentType
						};
					}
					function b(e, t) {
						return t ||= {}, {
							type: i.table,
							children: e,
							styleId: t.styleId || null,
							styleName: t.styleName || null
						};
					}
					function x(e, t) {
						return t ||= {}, {
							type: i.tableRow,
							children: e,
							isHeader: t.isHeader || !1
						};
					}
					function S(e, t) {
						return t ||= {}, {
							type: i.tableCell,
							children: e,
							colSpan: t.colSpan == null ? 1 : t.colSpan,
							rowSpan: t.rowSpan == null ? 1 : t.rowSpan
						};
					}
					function C(e) {
						return {
							type: i.break,
							breakType: e
						};
					}
					function w(e) {
						return {
							type: i.bookmarkStart,
							name: e.name
						};
					}
					n.document = n.Document = a, n.paragraph = n.Paragraph = o, n.run = n.Run = s, n.text = n.Text = l, n.tab = n.Tab = u, n.checkbox = n.Checkbox = d, n.Hyperlink = f, n.noteReference = n.NoteReference = p, n.Notes = m, n.Note = h, n.commentReference = g, n.comment = _, n.Image = y, n.Table = b, n.TableRow = x, n.TableCell = S, n.lineBreak = C("line"), n.pageBreak = C("page"), n.columnBreak = C("column"), n.BookmarkStart = w, n.verticalAlignment = c;
				}).call(this, e("buffer").Buffer);
			}, {
				buffer: 48,
				underscore: 67
			}],
			5: [function(e, t, n) {
				n.createBodyReader = d, n._readNumberingProperties = p;
				var r = e("dingbat-to-unicode"), i = e("underscore"), a = e("../documents"), o = e("../results").Result, s = e("../results").warning, c = e("../xml"), l = e("../transforms"), u = e("./uris");
				function d(e) {
					return {
						readXmlElement: function(t) {
							return new f(e).readXmlElement(t);
						},
						readXmlElements: function(t) {
							return new f(e).readXmlElements(t);
						}
					};
				}
				function f(e) {
					var t = [], n = [], o = [], d = e.relationships, f = e.contentTypes, S = e.docxFile, C = e.files, w = e.numbering, T = e.styles;
					function E(e) {
						return x(e.map(D));
					}
					function D(e) {
						if (e.type === "element") {
							var t = ne[e.name];
							if (t) return t(e);
							if (!Object.prototype.hasOwnProperty.call(h, e.name)) return g([s("An unrecognised element was ignored: " + e.name)]);
						}
						return _();
					}
					function O(e) {
						return F(e).map(function(t) {
							return {
								type: "paragraphProperties",
								styleId: t.styleId,
								styleName: t.name,
								alignment: e.firstOrEmpty("w:jc").attributes["w:val"],
								numbering: p(t.styleId, e.firstOrEmpty("w:numPr"), w),
								indent: k(e.firstOrEmpty("w:ind"))
							};
						});
					}
					function k(e) {
						return {
							start: e.attributes["w:start"] || e.attributes["w:left"],
							end: e.attributes["w:end"] || e.attributes["w:right"],
							firstLine: e.attributes["w:firstLine"],
							hanging: e.attributes["w:hanging"]
						};
					}
					function A(e) {
						return I(e).map(function(t) {
							var n = e.firstOrEmpty("w:sz").attributes["w:val"], r = /^[0-9]+$/.test(n) ? parseInt(n, 10) / 2 : null;
							return {
								type: "runProperties",
								styleId: t.styleId,
								styleName: t.name,
								verticalAlignment: e.firstOrEmpty("w:vertAlign").attributes["w:val"],
								font: e.firstOrEmpty("w:rFonts").attributes["w:ascii"],
								fontSize: r,
								isBold: M(e.first("w:b")),
								isUnderline: j(e.first("w:u")),
								isItalic: M(e.first("w:i")),
								isStrikethrough: M(e.first("w:strike")),
								isAllCaps: M(e.first("w:caps")),
								isSmallCaps: M(e.first("w:smallCaps")),
								highlight: P(e.firstOrEmpty("w:highlight").attributes["w:val"])
							};
						});
					}
					function j(e) {
						if (e) {
							var t = e.attributes["w:val"];
							return t !== void 0 && t !== "false" && t !== "0" && t !== "none";
						}
						return !1;
					}
					function M(e) {
						if (e) {
							var t = e.attributes["w:val"];
							return t !== "false" && t !== "0";
						}
						return !1;
					}
					function N(e) {
						return e !== "false" && e !== "0";
					}
					function P(e) {
						return !e || e === "none" ? null : e;
					}
					function F(e) {
						return R(e, "w:pStyle", "Paragraph", T.findParagraphStyleById);
					}
					function I(e) {
						return R(e, "w:rStyle", "Run", T.findCharacterStyleById);
					}
					function L(e) {
						return R(e, "w:tblStyle", "Table", T.findTableStyleById);
					}
					function R(e, t, n, r) {
						var i = [], a = e.first(t), o = null, s = null;
						if (a && (o = a.attributes["w:val"], o)) {
							var c = r(o);
							c ? s = c.name : i.push(me(n, o));
						}
						return y({
							styleId: o,
							name: s
						}, i);
					}
					function z(e) {
						var r = e.attributes["w:fldCharType"];
						if (r === "begin") t.push({
							type: "begin",
							fldChar: e
						}), n = [];
						else if (r === "end") {
							if (t.length === 0) return g([s("Ignoring complex field end character without corresponding start character")]);
							var i = t.pop();
							if (i.type === "begin" && (i = V(i)), i.type === "checkbox") return v(a.checkbox({ checked: i.checked }));
						} else if (r === "separate") {
							if (t.length === 0) return g([s("Ignoring complex field separator character without corresponding start character")]);
							var o = V(t.pop());
							t.push(o);
						}
						return _();
					}
					function B() {
						var e = i.last(t.filter(function(e) {
							return e.type === "hyperlink";
						}));
						return e ? e.options : null;
					}
					function V(e) {
						return H(n.join(""), e.type === "begin" ? e.fldChar : c.emptyElement);
					}
					function H(e, t) {
						var n = /^\s*HYPERLINK\s+(\\l\s+)?(?:"(.*)"|([^\\]\S*))/.exec(e);
						if (n) {
							var r = n[2] === void 0 ? n[3] : n[2];
							return {
								type: "hyperlink",
								options: n[1] === void 0 ? { href: r } : { anchor: r }
							};
						}
						if (/\s*FORMCHECKBOX\s*/.exec(e)) {
							var i = t.firstOrEmpty("w:ffData").firstOrEmpty("w:checkBox");
							return {
								type: "checkbox",
								checked: M(i.first("w:checked") ?? i.first("w:default"))
							};
						}
						return { type: "unknown" };
					}
					function U(e) {
						return n.push(e.text()), _();
					}
					function ee(e) {
						var t = e.attributes["w:font"], n = e.attributes["w:char"], i = r.hex(t, n);
						return i == null && /^F0..$/.test(n) && (i = r.hex(t, n.substring(2))), i == null ? g([s("A w:sym element with an unsupported character was ignored: char " + n + " in font " + t)]) : v(new a.Text(i.string));
					}
					function W(e) {
						return function(t) {
							var n = t.attributes["w:id"];
							return v(new a.NoteReference({
								noteType: e,
								noteId: n
							}));
						};
					}
					function te(e) {
						return v(a.commentReference({ commentId: e.attributes["w:id"] }));
					}
					function G(e) {
						return E(e.children);
					}
					var ne = {
						"w:p": function(e) {
							var t = e.firstOrEmpty("w:pPr");
							if (t.firstOrEmpty("w:rPr").first("w:del")) return e.children.forEach(function(e) {
								o.push(e);
							}), _();
							var n = e.children;
							return o.length > 0 && (n = o.concat(n), o = []), b.map(O(t), E(n), function(e, t) {
								return new a.Paragraph(t, e);
							}).insertExtra();
						},
						"w:r": function(e) {
							return b.map(A(e.firstOrEmpty("w:rPr")), E(e.children), function(e, t) {
								var n = B();
								return n !== null && (t = [new a.Hyperlink(t, n)]), new a.Run(t, e);
							});
						},
						"w:fldChar": z,
						"w:instrText": U,
						"w:t": function(e) {
							return v(new a.Text(e.text()));
						},
						"w:tab": function(e) {
							return v(new a.Tab());
						},
						"w:noBreakHyphen": function() {
							return v(new a.Text("‑"));
						},
						"w:softHyphen": function(e) {
							return v(new a.Text("­"));
						},
						"w:sym": ee,
						"w:hyperlink": function(e) {
							var t = e.attributes["r:id"], n = e.attributes["w:anchor"];
							return E(e.children).map(function(r) {
								function o(t) {
									var n = e.attributes["w:tgtFrame"] || null;
									return new a.Hyperlink(r, i.extend({ targetFrame: n }, t));
								}
								if (t) {
									var s = d.findTargetByRelationshipId(t);
									return n && (s = u.replaceFragment(s, n)), o({ href: s });
								}
								return n ? o({ anchor: n }) : r;
							});
						},
						"w:tbl": re,
						"w:tr": ae,
						"w:tc": K,
						"w:footnoteReference": W("footnote"),
						"w:endnoteReference": W("endnote"),
						"w:commentReference": te,
						"w:br": function(e) {
							var t = e.attributes["w:type"];
							return t == null || t === "textWrapping" ? v(a.lineBreak) : t === "page" ? v(a.pageBreak) : t === "column" ? v(a.columnBreak) : g([s("Unsupported break type: " + t)]);
						},
						"w:bookmarkStart": function(e) {
							var t = e.attributes["w:name"];
							return t === "_GoBack" ? _() : v(new a.BookmarkStart({ name: t }));
						},
						"mc:AlternateContent": function(e) {
							return G(e.firstOrEmpty("mc:Fallback"));
						},
						"w:sdt": function(e) {
							return E(e.firstOrEmpty("w:sdtContent").children).map(function(t) {
								var n = e.firstOrEmpty("w:sdtPr").first("wordml:checkbox");
								if (n) {
									var r = n.first("wordml:checked"), i = !!r && N(r.attributes["wordml:val"]), o = a.checkbox({ checked: i }), s = !1, c = t.map(l._elementsOfType(a.types.text, function(e) {
										return e.value.length > 0 && !s ? (s = !0, o) : e;
									}));
									return s ? c : o;
								}
								return t;
							});
						},
						"w:customXml": G,
						"w:ins": G,
						"w:moveFromRangeEnd": G,
						"w:moveFromRangeStart": G,
						"w:moveTo": G,
						"w:moveToRangeEnd": G,
						"w:moveToRangeStart": G,
						"w:object": G,
						"w:smartTag": G,
						"w:drawing": G,
						"w:pict": function(e) {
							return G(e).toExtra();
						},
						"v:roundrect": G,
						"v:shape": G,
						"v:textbox": G,
						"w:txbxContent": G,
						"wp:inline": ce,
						"wp:anchor": ce,
						"v:imagedata": fe,
						"v:group": G,
						"v:rect": G
					};
					return {
						readXmlElement: D,
						readXmlElements: E
					};
					function re(e) {
						var t = ie(e.firstOrEmpty("w:tblPr"));
						return E(e.children).flatMap(oe).flatMap(function(e) {
							return t.map(function(t) {
								return a.Table(e, t);
							});
						});
					}
					function ie(e) {
						return L(e).map(function(e) {
							return {
								styleId: e.styleId,
								styleName: e.name
							};
						});
					}
					function ae(e) {
						var t = e.firstOrEmpty("w:trPr");
						if (t.first("w:del")) return _();
						var n = !!t.first("w:tblHeader");
						return E(e.children).map(function(e) {
							return a.TableRow(e, { isHeader: n });
						});
					}
					function K(e) {
						return E(e.children).map(function(t) {
							var n = e.firstOrEmpty("w:tcPr"), r = n.firstOrEmpty("w:gridSpan").attributes["w:val"], i = r ? parseInt(r, 10) : 1, o = a.TableCell(t, { colSpan: i });
							return o._vMerge = q(n), o;
						});
					}
					function q(e) {
						var t = e.first("w:vMerge");
						if (t) {
							var n = t.attributes["w:val"];
							return n === "continue" || !n;
						}
						return null;
					}
					function oe(e) {
						if (i.any(e, function(e) {
							return e.type !== a.types.tableRow;
						})) return se(e), y(e, [s("unexpected non-row element in table, cell merging may be incorrect")]);
						if (i.any(e, function(e) {
							return i.any(e.children, function(e) {
								return e.type !== a.types.tableCell;
							});
						})) return se(e), y(e, [s("unexpected non-cell element in table row, cell merging may be incorrect")]);
						var t = {};
						return e.forEach(function(e) {
							var n = 0;
							e.children.forEach(function(e) {
								e._vMerge && t[n] ? t[n].rowSpan++ : (t[n] = e, e._vMerge = !1), n += e.colSpan;
							});
						}), e.forEach(function(e) {
							e.children = e.children.filter(function(e) {
								return !e._vMerge;
							}), e.children.forEach(function(e) {
								delete e._vMerge;
							});
						}), v(e);
					}
					function se(e) {
						e.forEach(function(e) {
							l.getDescendantsOfType(e, a.types.tableCell).forEach(function(e) {
								delete e._vMerge;
							});
						});
					}
					function ce(e) {
						return x(e.getElementsByTagName("a:graphic").getElementsByTagName("a:graphicData").getElementsByTagName("pic:pic").getElementsByTagName("pic:blipFill").getElementsByTagName("a:blip").map(le.bind(null, e)));
					}
					function le(e, t) {
						var n = e.firstOrEmpty("wp:docPr"), r = n.attributes, i = ue(r.descr) ? r.title : r.descr, o = de(t);
						return o === null ? g([s("Could not find image file for a:blip element")]) : pe(o, i).map(function(e) {
							var t = n.firstOrEmpty("a:hlinkClick").attributes["r:id"];
							if (t) {
								var r = d.findTargetByRelationshipId(t);
								return new a.Hyperlink([e], { href: r });
							}
							return e;
						});
					}
					function ue(e) {
						return e == null || /^\s*$/.test(e);
					}
					function de(e) {
						var t = e.attributes["r:embed"], n = e.attributes["r:link"];
						if (t) return J(t);
						if (n) {
							var r = d.findTargetByRelationshipId(n);
							return {
								path: r,
								read: C.read.bind(C, r)
							};
						}
						return null;
					}
					function fe(e) {
						var t = e.attributes["r:id"];
						return t ? pe(J(t), e.attributes["o:title"]) : g([s("A v:imagedata element without a relationship ID was ignored")]);
					}
					function J(e) {
						var t = u.uriToZipEntryName("word", d.findTargetByRelationshipId(e));
						return {
							path: t,
							read: S.read.bind(S, t)
						};
					}
					function pe(e, t) {
						var n = f.findContentType(e.path);
						return y(a.Image({
							readImage: e.read,
							altText: t,
							contentType: n
						}), m[n] ? [] : s("Image of type " + n + " is unlikely to display in web browsers"));
					}
					function me(e, t) {
						return s(e + " style with ID " + t + " was referenced but not defined in the document");
					}
				}
				function p(e, t, n) {
					var r = t.firstOrEmpty("w:ilvl").attributes["w:val"], i = t.firstOrEmpty("w:numId").attributes["w:val"];
					if (r !== void 0 && i !== void 0) return n.findLevel(i, r);
					if (e != null) {
						var a = n.findLevelByParagraphStyleId(e);
						if (a != null) return a;
					}
					return i === void 0 ? null : n.findLevel(i, "0");
				}
				var m = {
					"image/png": !0,
					"image/gif": !0,
					"image/jpeg": !0,
					"image/svg+xml": !0,
					"image/tiff": !0
				}, h = {
					"office-word:wrap": !0,
					"v:shadow": !0,
					"v:shapetype": !0,
					"w:annotationRef": !0,
					"w:bookmarkEnd": !0,
					"w:sectPr": !0,
					"w:proofErr": !0,
					"w:lastRenderedPageBreak": !0,
					"w:commentRangeStart": !0,
					"w:commentRangeEnd": !0,
					"w:del": !0,
					"w:footnoteRef": !0,
					"w:endnoteRef": !0,
					"w:moveFrom": !0,
					"w:pPr": !0,
					"w:rPr": !0,
					"w:tblPr": !0,
					"w:tblGrid": !0,
					"w:trPr": !0,
					"w:tcPr": !0
				};
				function g(e) {
					return new b(null, null, e);
				}
				function _() {
					return new b(null);
				}
				function v(e) {
					return new b(e);
				}
				function y(e, t) {
					return new b(e, null, t);
				}
				function b(e, t, n) {
					this.value = e || [], this.extra = t || [], this._result = new o({
						element: this.value,
						extra: t
					}, n), this.messages = this._result.messages;
				}
				b.prototype.toExtra = function() {
					return new b(null, S(this.extra, this.value), this.messages);
				}, b.prototype.insertExtra = function() {
					var e = this.extra;
					return e && e.length ? new b(S(this.value, e), null, this.messages) : this;
				}, b.prototype.map = function(e) {
					var t = this._result.map(function(t) {
						return e(t.element);
					});
					return new b(t.value, this.extra, t.messages);
				}, b.prototype.flatMap = function(e) {
					var t = this._result.flatMap(function(t) {
						return e(t.element)._result;
					});
					return new b(t.value.element, S(this.extra, t.value.extra), t.messages);
				}, b.map = function(e, t, n) {
					return new b(n(e.value, t.value), S(e.extra, t.extra), e.messages.concat(t.messages));
				};
				function x(e) {
					var t = o.combine(i.pluck(e, "_result"));
					return new b(i.flatten(i.pluck(t.value, "element")), i.filter(i.flatten(i.pluck(t.value, "extra")), C), t.messages);
				}
				function S(e, t) {
					return i.flatten([e, t]);
				}
				function C(e) {
					return e;
				}
			}, {
				"../documents": 4,
				"../results": 25,
				"../transforms": 30,
				"../xml": 35,
				"./uris": 16,
				"dingbat-to-unicode": 50,
				underscore: 67
			}],
			6: [function(e, t, n) {
				var r = e("../documents"), i = e("../results").Result;
				function a(e) {
					function t(e) {
						return i.combine(e.getElementsByTagName("w:comment").map(n));
					}
					function n(t) {
						var n = t.attributes["w:id"];
						function i(e) {
							return (t.attributes[e] || "").trim() || null;
						}
						return e.readXmlElements(t.children).map(function(e) {
							return r.comment({
								commentId: n,
								body: e,
								authorName: i("w:author"),
								authorInitials: i("w:initials")
							});
						});
					}
					return t;
				}
				n.createCommentsReader = a;
			}, {
				"../documents": 4,
				"../results": 25
			}],
			7: [function(e, t, n) {
				n.readContentTypesFromXml = i;
				var r = {
					png: "png",
					gif: "gif",
					jpeg: "jpeg",
					jpg: "jpeg",
					tif: "tiff",
					tiff: "tiff",
					bmp: "bmp"
				};
				n.defaultContentTypes = a({}, {});
				function i(e) {
					var t = Object.create(null), n = Object.create(null);
					return e.children.forEach(function(e) {
						if (e.name === "content-types:Default" && (t[e.attributes.Extension] = e.attributes.ContentType), e.name === "content-types:Override") {
							var r = e.attributes.PartName;
							r.charAt(0) === "/" && (r = r.substring(1)), n[r] = e.attributes.ContentType;
						}
					}), a(n, t);
				}
				function a(e, t) {
					return { findContentType: function(n) {
						var i = e[n];
						if (i) return i;
						var a = n.split("."), o = a[a.length - 1];
						if (Object.prototype.hasOwnProperty.call(t, o)) return t[o];
						var s = r[o.toLowerCase()];
						return s ? "image/" + s : null;
					} };
				}
			}, {}],
			8: [function(e, t, n) {
				n.DocumentXmlReader = a;
				var r = e("../documents"), i = e("../results").Result;
				function a(e) {
					var t = e.bodyReader;
					function n(n) {
						var a = n.first("w:body");
						if (a == null) throw Error("Could not find the body element: are you sure this is a docx file?");
						var o = t.readXmlElements(a.children).map(function(t) {
							return new r.Document(t, {
								notes: e.notes,
								comments: e.comments
							});
						});
						return new i(o.value, o.messages);
					}
					return { convertXmlToDocument: n };
				}
			}, {
				"../documents": 4,
				"../results": 25
			}],
			9: [function(e, t, n) {
				n.read = _, n._findPartPaths = v;
				var r = e("../promises"), i = e("../documents"), a = e("../results").Result, o = e("../zipfile"), s = e("./office-xml-reader").readXmlFromZipFile, c = e("./body-reader").createBodyReader, l = e("./document-xml-reader").DocumentXmlReader, u = e("./relationships-reader"), d = e("./content-types-reader"), f = e("./numbering-xml"), p = e("./styles-reader"), m = e("./notes-reader"), h = e("./comments-reader"), g = e("./files").Files;
				function _(e, t, n) {
					t ||= {}, n ||= {};
					var o = new g({
						externalFileAccess: n.externalFileAccess,
						relativeToFile: t.path
					});
					return r.props({
						contentTypes: w(e),
						partPaths: v(e),
						docxFile: e,
						files: o
					}).also(function(t) {
						return { styles: E(e, t.partPaths.styles) };
					}).also(function(t) {
						return { numbering: T(e, t.partPaths.numbering, t.styles) };
					}).also(function(e) {
						return {
							footnotes: S(e.partPaths.footnotes, e, function(e, t) {
								return t ? m.createFootnotesReader(e)(t) : new a([]);
							}),
							endnotes: S(e.partPaths.endnotes, e, function(e, t) {
								return t ? m.createEndnotesReader(e)(t) : new a([]);
							}),
							comments: S(e.partPaths.comments, e, function(e, t) {
								return t ? h.createCommentsReader(e)(t) : new a([]);
							})
						};
					}).also(function(e) {
						return { notes: e.footnotes.flatMap(function(t) {
							return e.endnotes.map(function(e) {
								return new i.Notes(t.concat(e));
							});
						}) };
					}).then(function(e) {
						return S(e.partPaths.mainDocument, e, function(t, n) {
							return e.notes.flatMap(function(r) {
								return e.comments.flatMap(function(e) {
									return new l({
										bodyReader: t,
										notes: r,
										comments: e
									}).convertXmlToDocument(n);
								});
							});
						});
					});
				}
				function v(e) {
					return D(e).then(function(t) {
						var n = y({
							docxFile: e,
							relationships: t,
							relationshipType: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
							basePath: "",
							fallbackPath: "word/document.xml"
						});
						if (!e.exists(n)) throw Error("Could not find main document part. Are you sure this is a valid .docx file?");
						return x({
							filename: C(n),
							readElement: u.readRelationships,
							defaultValue: u.defaultValue
						})(e).then(function(t) {
							function r(r) {
								return y({
									docxFile: e,
									relationships: t,
									relationshipType: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/" + r,
									basePath: o.splitPath(n).dirname,
									fallbackPath: "word/" + r + ".xml"
								});
							}
							return {
								mainDocument: n,
								comments: r("comments"),
								endnotes: r("endnotes"),
								footnotes: r("footnotes"),
								numbering: r("numbering"),
								styles: r("styles")
							};
						});
					});
				}
				function y(e) {
					var t = e.docxFile, n = e.relationships, r = e.relationshipType, i = e.basePath, a = e.fallbackPath, s = n.findTargetsByType(r).map(function(e) {
						return b(o.joinPath(i, e), "/");
					}).filter(function(e) {
						return t.exists(e);
					});
					return s.length === 0 ? a : s[0];
				}
				function b(e, t) {
					return e.substring(0, t.length) === t ? e.substring(t.length) : e;
				}
				function x(e) {
					return function(t) {
						return s(t, e.filename).then(function(t) {
							return t ? e.readElement(t) : e.defaultValue;
						});
					};
				}
				function S(e, t, n) {
					return x({
						filename: C(e),
						readElement: u.readRelationships,
						defaultValue: u.defaultValue
					})(t.docxFile).then(function(r) {
						var i = new c({
							relationships: r,
							contentTypes: t.contentTypes,
							docxFile: t.docxFile,
							numbering: t.numbering,
							styles: t.styles,
							files: t.files
						});
						return s(t.docxFile, e).then(function(e) {
							return n(i, e);
						});
					});
				}
				function C(e) {
					var t = o.splitPath(e);
					return o.joinPath(t.dirname, "_rels", t.basename + ".rels");
				}
				var w = x({
					filename: "[Content_Types].xml",
					readElement: d.readContentTypesFromXml,
					defaultValue: d.defaultContentTypes
				});
				function T(e, t, n) {
					return x({
						filename: t,
						readElement: function(e) {
							return f.readNumberingXml(e, { styles: n });
						},
						defaultValue: f.defaultNumbering
					})(e);
				}
				function E(e, t) {
					return x({
						filename: t,
						readElement: p.readStylesXml,
						defaultValue: p.defaultStyles
					})(e);
				}
				var D = x({
					filename: "_rels/.rels",
					readElement: u.readRelationships,
					defaultValue: u.defaultValue
				});
			}, {
				"../documents": 4,
				"../promises": 23,
				"../results": 25,
				"../zipfile": 40,
				"./body-reader": 5,
				"./comments-reader": 6,
				"./content-types-reader": 7,
				"./document-xml-reader": 8,
				"./files": 1,
				"./notes-reader": 10,
				"./numbering-xml": 11,
				"./office-xml-reader": 12,
				"./relationships-reader": 13,
				"./styles-reader": 15
			}],
			10: [function(e, t, n) {
				var r = e("../documents"), i = e("../results").Result;
				n.createFootnotesReader = a.bind(this, "footnote"), n.createEndnotesReader = a.bind(this, "endnote");
				function a(e, t) {
					function n(t) {
						return i.combine(t.getElementsByTagName("w:" + e).filter(a).map(o));
					}
					function a(e) {
						var t = e.attributes["w:type"];
						return t !== "continuationSeparator" && t !== "separator";
					}
					function o(n) {
						var i = n.attributes["w:id"];
						return t.readXmlElements(n.children).map(function(t) {
							return r.Note({
								noteType: e,
								noteId: i,
								body: t
							});
						});
					}
					return n;
				}
			}, {
				"../documents": 4,
				"../results": 25
			}],
			11: [function(e, t, n) {
				var r = e("underscore");
				n.readNumberingXml = a, n.Numbering = i, n.defaultNumbering = new i({}, {});
				function i(e, t, n) {
					var i = r.flatten(r.values(t).map(function(e) {
						return r.values(e.levels);
					})), a = r.indexBy(i.filter(function(e) {
						return e.paragraphStyleId != null;
					}), "paragraphStyleId");
					function o(e, t) {
						return s(e, t, Object.create(null));
					}
					function s(r, i, a) {
						if (a[r]) return null;
						a[r] = !0;
						var o = e[r];
						if (!o) return null;
						var c = t[o.abstractNumId];
						return c ? c.numStyleLink == null ? t[o.abstractNumId].levels[i] : s(n.findNumberingStyleById(c.numStyleLink).numId, i, a) : null;
					}
					function c(e) {
						return a[e] || null;
					}
					return {
						findLevel: o,
						findLevelByParagraphStyleId: c
					};
				}
				function a(e, t) {
					if (!t || !t.styles) throw Error("styles is missing");
					var n = o(e);
					return new i(c(e, n), n, t.styles);
				}
				function o(e) {
					var t = Object.create(null);
					return e.getElementsByTagName("w:abstractNum").forEach(function(e) {
						var n = e.attributes["w:abstractNumId"];
						t[n] = s(e);
					}), t;
				}
				function s(e) {
					var t = Object.create(null), n = null;
					return e.getElementsByTagName("w:lvl").forEach(function(e) {
						var r = e.attributes["w:ilvl"], i = e.firstOrEmpty("w:numFmt").attributes["w:val"] !== "bullet", a = e.firstOrEmpty("w:pStyle").attributes["w:val"];
						r === void 0 ? n = {
							isOrdered: i,
							level: "0",
							paragraphStyleId: a
						} : t[r] = {
							isOrdered: i,
							level: r,
							paragraphStyleId: a
						};
					}), n !== null && t[n.level] === void 0 && (t[n.level] = n), {
						levels: t,
						numStyleLink: e.firstOrEmpty("w:numStyleLink").attributes["w:val"]
					};
				}
				function c(e) {
					var t = Object.create(null);
					return e.getElementsByTagName("w:num").forEach(function(e) {
						var n = e.attributes["w:numId"];
						t[n] = { abstractNumId: e.first("w:abstractNumId").attributes["w:val"] };
					}), t;
				}
			}, { underscore: 67 }],
			12: [function(e, t, n) {
				var r = e("underscore"), i = e("../promises"), a = e("../xml");
				n.read = s, n.readXmlFromZipFile = c;
				var o = {
					"http://schemas.openxmlformats.org/wordprocessingml/2006/main": "w",
					"http://schemas.openxmlformats.org/officeDocument/2006/relationships": "r",
					"http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing": "wp",
					"http://schemas.openxmlformats.org/drawingml/2006/main": "a",
					"http://schemas.openxmlformats.org/drawingml/2006/picture": "pic",
					"http://purl.oclc.org/ooxml/wordprocessingml/main": "w",
					"http://purl.oclc.org/ooxml/officeDocument/relationships": "r",
					"http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing": "wp",
					"http://purl.oclc.org/ooxml/drawingml/main": "a",
					"http://purl.oclc.org/ooxml/drawingml/picture": "pic",
					"http://schemas.openxmlformats.org/package/2006/content-types": "content-types",
					"http://schemas.openxmlformats.org/package/2006/relationships": "relationships",
					"http://schemas.openxmlformats.org/markup-compatibility/2006": "mc",
					"urn:schemas-microsoft-com:vml": "v",
					"urn:schemas-microsoft-com:office:word": "office-word",
					"http://schemas.microsoft.com/office/word/2010/wordml": "wordml"
				};
				function s(e) {
					return a.readString(e, o).then(function(e) {
						return u(e)[0];
					});
				}
				function c(e, t) {
					return e.exists(t) ? e.read(t, "utf-8").then(l).then(s) : i.resolve(null);
				}
				function l(e) {
					return e.replace(/^\uFEFF/g, "");
				}
				function u(e) {
					return e.type === "element" ? e.name === "mc:AlternateContent" ? e.firstOrEmpty("mc:Fallback").children : (e.children = r.flatten(e.children.map(u, !0)), [e]) : [e];
				}
			}, {
				"../promises": 23,
				"../xml": 35,
				underscore: 67
			}],
			13: [function(e, t, n) {
				n.readRelationships = r, n.defaultValue = new i([]), n.Relationships = i;
				function r(e) {
					var t = [];
					return e.children.forEach(function(e) {
						if (e.name === "relationships:Relationship") {
							var n = {
								relationshipId: e.attributes.Id,
								target: e.attributes.Target,
								type: e.attributes.Type
							};
							t.push(n);
						}
					}), new i(t);
				}
				function i(e) {
					var t = Object.create(null);
					e.forEach(function(e) {
						t[e.relationshipId] = e.target;
					});
					var n = Object.create(null);
					return e.forEach(function(e) {
						n[e.type] || (n[e.type] = []), n[e.type].push(e.target);
					}), {
						findTargetByRelationshipId: function(e) {
							return t[e];
						},
						findTargetsByType: function(e) {
							return n[e] || [];
						}
					};
				}
			}, {}],
			14: [function(e, t, n) {
				var r = e("underscore"), i = e("../promises"), a = e("../xml");
				n.writeStyleMap = l, n.readStyleMap = p;
				var o = "http://schemas.zwobble.org/mammoth/style-map", s = "mammoth/style-map", c = "/" + s;
				function l(e, t) {
					return e.write(s, t), u(e).then(function() {
						return d(e);
					});
				}
				function u(e) {
					var t = "word/_rels/document.xml.rels", n = "http://schemas.openxmlformats.org/package/2006/relationships", r = "{" + n + "}Relationship";
					return e.read(t, "utf8").then(a.readString).then(function(i) {
						var s = i.children;
						f(s, r, "Id", {
							Id: "rMammothStyleMap",
							Type: o,
							Target: c
						});
						var l = { "": n };
						return e.write(t, a.writeString(i, l));
					});
				}
				function d(e) {
					var t = "[Content_Types].xml", n = "http://schemas.openxmlformats.org/package/2006/content-types", r = "{" + n + "}Override";
					return e.read(t, "utf8").then(a.readString).then(function(i) {
						var o = i.children;
						f(o, r, "PartName", {
							PartName: c,
							ContentType: "text/prs.mammoth.style-map"
						});
						var s = { "": n };
						return e.write(t, a.writeString(i, s));
					});
				}
				function f(e, t, n, i) {
					var o = r.find(e, function(e) {
						return e.name === t && e.attributes[n] === i[n];
					});
					o ? o.attributes = i : e.push(a.element(t, i));
				}
				function p(e) {
					return e.exists(s) ? e.read(s, "utf8") : i.resolve(null);
				}
			}, {
				"../promises": 23,
				"../xml": 35,
				underscore: 67
			}],
			15: [function(e, t, n) {
				n.readStylesXml = i, n.Styles = r, n.defaultStyles = new r({}, {});
				function r(e, t, n, r) {
					return {
						findParagraphStyleById: function(t) {
							return e[t];
						},
						findCharacterStyleById: function(e) {
							return t[e];
						},
						findTableStyleById: function(e) {
							return n[e];
						},
						findNumberingStyleById: function(e) {
							return r[e];
						}
					};
				}
				r.EMPTY = new r({}, {}, {}, {});
				function i(e) {
					var t = Object.create(null), n = Object.create(null), i = Object.create(null), o = Object.create(null);
					return e.getElementsByTagName("w:style").forEach(function(e) {
						var r = a(e), s;
						switch (r.type) {
							case "paragraph":
								s = t;
								break;
							case "character":
								s = n;
								break;
							case "table":
								s = i;
								break;
							case "numbering": s = o;
						}
						s && s[r.styleId] === void 0 && (s[r.styleId] = r);
					}), new r(t, n, i, o);
				}
				function a(e) {
					var t = e.attributes["w:type"];
					return t === "numbering" ? s(t, e) : {
						type: t,
						styleId: c(e),
						name: o(e)
					};
				}
				function o(e) {
					var t = e.first("w:name");
					return t ? t.attributes["w:val"] : null;
				}
				function s(e, t) {
					var n = c(t);
					return {
						type: e,
						numId: t.firstOrEmpty("w:pPr").firstOrEmpty("w:numPr").firstOrEmpty("w:numId").attributes["w:val"],
						styleId: n
					};
				}
				function c(e) {
					return e.attributes["w:styleId"];
				}
			}, {}],
			16: [function(e, t, n) {
				n.uriToZipEntryName = r, n.replaceFragment = i;
				function r(e, t) {
					return t.charAt(0) === "/" ? t.substr(1) : e + "/" + t;
				}
				function i(e, t) {
					var n = e.indexOf("#");
					return n !== -1 && (e = e.substring(0, n)), e + "#" + t;
				}
			}, {}],
			17: [function(e, t, n) {
				var r = e("../styles/html-paths");
				function i(e, t, n) {
					return o(r.element(e, t, { fresh: !1 }), n);
				}
				function a(e, t, n) {
					return o(r.element(e, t, { fresh: !0 }), n);
				}
				function o(e, t) {
					return {
						type: "element",
						tag: e,
						children: t || []
					};
				}
				function s(e) {
					return {
						type: "text",
						value: e
					};
				}
				n.freshElement = a, n.nonFreshElement = i, n.elementWithTag = o, n.text = s, n.forceWrite = { type: "forceWrite" };
				var c = {
					br: !0,
					hr: !0,
					img: !0,
					input: !0
				};
				function l(e) {
					return e.children.length === 0 && c[e.tag.tagName];
				}
				n.isVoidElement = l;
			}, { "../styles/html-paths": 28 }],
			18: [function(e, t, n) {
				var r = e("./ast");
				n.freshElement = r.freshElement, n.nonFreshElement = r.nonFreshElement, n.elementWithTag = r.elementWithTag, n.text = r.text, n.forceWrite = r.forceWrite, n.simplify = e("./simplify");
				function i(e, t) {
					t.forEach(function(t) {
						a(e, t);
					});
				}
				function a(e, t) {
					o[t.type](e, t);
				}
				var o = {
					element: s,
					text: c,
					forceWrite: function() {}
				};
				function s(e, t) {
					r.isVoidElement(t) ? e.selfClosing(t.tag.tagName, t.tag.attributes) : (e.open(t.tag.tagName, t.tag.attributes), i(e, t.children), e.close(t.tag.tagName));
				}
				function c(e, t) {
					e.text(t.value);
				}
				n.write = i;
			}, {
				"./ast": 17,
				"./simplify": 19
			}],
			19: [function(e, t, n) {
				var r = e("underscore"), i = e("./ast");
				function a(e) {
					return o(f(e));
				}
				function o(e) {
					var t = [];
					return e.map(s).forEach(function(e) {
						d(t, e);
					}), t;
				}
				function s(e) {
					return c[e.type](e);
				}
				var c = {
					element: l,
					text: u,
					forceWrite: u
				};
				function l(e) {
					return i.elementWithTag(e.tag, o(e.children));
				}
				function u(e) {
					return e;
				}
				function d(e, t) {
					var n = e[e.length - 1];
					t.type === "element" && !t.tag.fresh && n && n.type === "element" && t.tag.matchesElement(n.tag) ? (t.tag.separator && d(n.children, i.text(t.tag.separator)), t.children.forEach(function(e) {
						d(n.children, e);
					})) : e.push(t);
				}
				function f(e) {
					return p(e, function(e) {
						return m[e.type](e);
					});
				}
				function p(e, t) {
					return r.flatten(r.map(e, t), !0);
				}
				var m = {
					element: g,
					text: _,
					forceWrite: h
				};
				function h(e) {
					return [e];
				}
				function g(e) {
					var t = f(e.children);
					return t.length === 0 && !i.isVoidElement(e) ? [] : [i.elementWithTag(e.tag, t)];
				}
				function _(e) {
					return e.value.length === 0 ? [] : [e];
				}
				t.exports = a;
			}, {
				"./ast": 17,
				underscore: 67
			}],
			20: [function(e, t, n) {
				var r = e("underscore"), i = e("./promises"), a = e("./html");
				n.imgElement = o;
				function o(e) {
					return function(t, n) {
						return i.resolve(e(t)).then(function(e) {
							var n = {};
							return t.altText && (n.alt = t.altText), r.extend(n, e), [a.freshElement("img", n)];
						});
					};
				}
				n.inline = n.imgElement, n.dataUri = o(function(e) {
					return e.readAsBase64String().then(function(t) {
						return { src: "data:" + e.contentType + ";base64," + t };
					});
				});
				function s(e) {
					return e.contentType.split(/\/|\\/)[1];
				}
				n.imageFilenameExtension = s;
			}, {
				"./html": 18,
				"./promises": 23,
				underscore: 67
			}],
			21: [function(e, t, n) {
				(function(t) {
					var r = e("underscore"), i = e("./docx/docx-reader"), a = e("./docx/style-map"), o = e("./document-to-html").DocumentConverter, s = e("./raw-text").convertElementToRawText, c = e("./style-reader").readStyle, l = e("./options-reader").readOptions, u = e("./promises"), d = e("./unzip"), f = e("./results").Result;
					n.convertToHtml = p, n.convertToMarkdown = m, n.convert = h, n.extractRawText = y, n.images = e("./images"), n.transforms = e("./transforms"), n.underline = e("./underline"), n.embedStyleMap = b, n.readEmbeddedStyleMap = g;
					function p(e, t) {
						return h(e, t);
					}
					function m(e, t) {
						var n = Object.create(t || {});
						return n.outputFormat = "markdown", h(e, n);
					}
					function h(e, t) {
						t = l(t);
						var n = d.openZip(e).then(function(e) {
							return a.readStyleMap(e).then(function(n) {
								return t.embeddedStyleMap = n, e;
							});
						}).then(function(n) {
							return i.read(n, e, t).then(function(e) {
								return e.map(t.transformDocument);
							}).then(function(e) {
								return _(e, t);
							});
						});
						return u.toExternalPromise(n);
					}
					function g(e) {
						var t = d.openZip(e).then(a.readStyleMap);
						return u.toExternalPromise(t);
					}
					function _(e, t) {
						var n = v(t.readStyleMap()), i = new o(r.extend({}, t, { styleMap: n.value }));
						return e.flatMapThen(function(e) {
							return n.flatMapThen(function(t) {
								return i.convertToHtml(e);
							});
						});
					}
					function v(e) {
						return f.combine((e || []).map(c)).map(function(e) {
							return e.filter(function(e) {
								return !!e;
							});
						});
					}
					function y(e) {
						var t = d.openZip(e).then(i.read).then(function(e) {
							return e.map(s);
						});
						return u.toExternalPromise(t);
					}
					function b(e, n) {
						var r = d.openZip(e).then(function(e) {
							return a.writeStyleMap(e, n).then(function() {
								return e;
							});
						}).then(function(e) {
							return e.toArrayBuffer();
						}).then(function(e) {
							return {
								toArrayBuffer: function() {
									return e;
								},
								toBuffer: function() {
									return t.from(e);
								}
							};
						});
						return u.toExternalPromise(r);
					}
					n.styleMapping = function() {
						throw Error("Use a raw string instead of mammoth.styleMapping e.g. \"p[style-name='Title'] => h1\" instead of mammoth.styleMapping(\"p[style-name='Title'] => h1\")");
					};
				}).call(this, e("buffer").Buffer);
			}, {
				"./document-to-html": 3,
				"./docx/docx-reader": 9,
				"./docx/style-map": 14,
				"./images": 20,
				"./options-reader": 22,
				"./promises": 23,
				"./raw-text": 24,
				"./results": 25,
				"./style-reader": 26,
				"./transforms": 30,
				"./underline": 31,
				"./unzip": 2,
				buffer: 48,
				underscore: 67
			}],
			22: [function(e, t, n) {
				n.readOptions = o;
				var r = e("underscore"), i = n._defaultStyleMap = /* @__PURE__ */ "p.Heading1 => h1:fresh,p.Heading2 => h2:fresh,p.Heading3 => h3:fresh,p.Heading4 => h4:fresh,p.Heading5 => h5:fresh,p.Heading6 => h6:fresh,p[style-name='Heading 1'] => h1:fresh,p[style-name='Heading 2'] => h2:fresh,p[style-name='Heading 3'] => h3:fresh,p[style-name='Heading 4'] => h4:fresh,p[style-name='Heading 5'] => h5:fresh,p[style-name='Heading 6'] => h6:fresh,p[style-name='heading 1'] => h1:fresh,p[style-name='heading 2'] => h2:fresh,p[style-name='heading 3'] => h3:fresh,p[style-name='heading 4'] => h4:fresh,p[style-name='heading 5'] => h5:fresh,p[style-name='heading 6'] => h6:fresh,p.Heading => h1:fresh,p[style-name='Heading'] => h1:fresh,r[style-name='Strong'] => strong,p[style-name='footnote text'] => p:fresh,r[style-name='footnote reference'] =>,p[style-name='endnote text'] => p:fresh,r[style-name='endnote reference'] =>,p[style-name='annotation text'] => p:fresh,r[style-name='annotation reference'] =>,p[style-name='Footnote'] => p:fresh,r[style-name='Footnote anchor'] =>,p[style-name='Endnote'] => p:fresh,r[style-name='Endnote anchor'] =>,p:unordered-list(1) => ul > li:fresh,p:unordered-list(2) => ul|ol > li > ul > li:fresh,p:unordered-list(3) => ul|ol > li > ul|ol > li > ul > li:fresh,p:unordered-list(4) => ul|ol > li > ul|ol > li > ul|ol > li > ul > li:fresh,p:unordered-list(5) => ul|ol > li > ul|ol > li > ul|ol > li > ul|ol > li > ul > li:fresh,p:ordered-list(1) => ol > li:fresh,p:ordered-list(2) => ul|ol > li > ol > li:fresh,p:ordered-list(3) => ul|ol > li > ul|ol > li > ol > li:fresh,p:ordered-list(4) => ul|ol > li > ul|ol > li > ul|ol > li > ol > li:fresh,p:ordered-list(5) => ul|ol > li > ul|ol > li > ul|ol > li > ul|ol > li > ol > li:fresh,r[style-name='Hyperlink'] =>,p[style-name='Normal'] => p:fresh,p.Body => p:fresh,p[style-name='Body'] => p:fresh".split(","), a = n._standardOptions = {
					externalFileAccess: !1,
					transformDocument: c,
					includeDefaultStyleMap: !0,
					includeEmbeddedStyleMap: !0
				};
				function o(e) {
					return e ||= {}, r.extend({}, a, e, {
						customStyleMap: s(e.styleMap),
						readStyleMap: function() {
							var e = this.customStyleMap;
							return this.includeEmbeddedStyleMap && (e = e.concat(s(this.embeddedStyleMap))), this.includeDefaultStyleMap && (e = e.concat(i)), e;
						}
					});
				}
				function s(e) {
					return e ? r.isString(e) ? e.split("\n").map(function(e) {
						return e.trim();
					}).filter(function(e) {
						return e !== "" && e.charAt(0) !== "#";
					}) : e : [];
				}
				function c(e) {
					return e;
				}
			}, { underscore: 67 }],
			23: [function(e, t, n) {
				(function(t) {
					var r = e("underscore");
					n.defer = s, n.Promise = Promise, n.resolve = Promise.resolve.bind(Promise), n.reject = Promise.reject.bind(Promise), n.forEachSeries = function(e, t) {
						var n = 0, r = s(), i = function() {
							if (n < e.length) {
								var a = e[n];
								n++, t(a).then(i, r.reject);
							} else r.resolve();
						};
						return i(), r.promise;
					};
					var i = n.props = function(e) {
						var t = Object.keys(e), n = Object.values(e);
						return o(Promise.all(n).then(function(e) {
							for (var n = {}, r = 0; r < t.length; r++) n[t[r]] = e[r];
							return n;
						}));
					}, a = function(e) {
						return o(this.then(function(t) {
							return i(r.extend({}, t, e(t)));
						}));
					};
					function o(e) {
						return e.also = a, e;
					}
					n.try = function(e) {
						try {
							return Promise.resolve(e());
						} catch (e) {
							return Promise.reject(e);
						}
					};
					function s() {
						var e, t, n = new Promise(function(n, r) {
							e = n, t = r;
						});
						return {
							resolve: e,
							reject: t,
							promise: n
						};
					}
					function c(e) {
						var t = new Promise(e);
						return t.__proto__ = c.prototype, t;
					}
					c.__proto__ = Promise, c.prototype.__proto__ = Promise.prototype, c.prototype.done = function(e, n) {
						return this.then(e, n).catch(function(e) {
							if (u()) {
								var n = e instanceof Error ? e.stack : e;
								t.stderr.write("Fatal " + n + "\n"), t.exit(2);
							} else setTimeout(function() {
								throw e;
							}, 0);
						});
					};
					function l(e) {
						return c.resolve(e);
					}
					n.toExternalPromise = l;
					function u() {
						return t !== void 0 && {}.toString.call(t).toLowerCase() === "[object process]";
					}
				}).call(this, e("_process"));
			}, {
				_process: 66,
				underscore: 67
			}],
			24: [function(e, t, n) {
				var r = e("./documents");
				function i(e) {
					if (e.type === "text") return e.value;
					if (e.type === r.types.tab) return "	";
					var t = e.type === "paragraph" ? "\n\n" : "";
					return (e.children || []).map(i).join("") + t;
				}
				n.convertElementToRawText = i;
			}, { "./documents": 4 }],
			25: [function(e, t, n) {
				var r = e("underscore");
				n.Result = i, n.success = a, n.warning = o, n.error = s;
				function i(e, t) {
					this.value = e, this.messages = t || [];
				}
				i.prototype.map = function(e) {
					return new i(e(this.value), this.messages);
				}, i.prototype.flatMap = function(e) {
					var t = e(this.value);
					return new i(t.value, c([this, t]));
				}, i.prototype.flatMapThen = function(e) {
					var t = this;
					return e(this.value).then(function(e) {
						return new i(e.value, c([t, e]));
					});
				}, i.combine = function(e) {
					return new i(r.flatten(r.pluck(e, "value")), c(e));
				};
				function a(e) {
					return new i(e, []);
				}
				function o(e) {
					return {
						type: "warning",
						message: e
					};
				}
				function s(e) {
					return {
						type: "error",
						message: e.message,
						error: e
					};
				}
				function c(e) {
					var t = [];
					return r.flatten(r.pluck(e, "messages"), !0).forEach(function(e) {
						l(t, e) || t.push(e);
					}), t;
				}
				function l(e, t) {
					return r.find(e, u.bind(null, t)) !== void 0;
				}
				function u(e, t) {
					return e.type === t.type && e.message === t.message;
				}
			}, { underscore: 67 }],
			26: [function(e, t, n) {
				var r = e("underscore"), i = e("lop"), a = e("./styles/document-matchers"), o = e("./styles/html-paths"), s = e("./styles/parser/tokeniser").tokenise, c = e("./results");
				n.readHtmlPath = p, n.readDocumentMatcher = d, n.readStyle = l;
				function l(e) {
					return C(E, e);
				}
				function u() {
					return i.rules.sequence(i.rules.sequence.capture(f()), i.rules.tokenOfType("whitespace"), i.rules.tokenOfType("arrow"), i.rules.sequence.capture(i.rules.optional(i.rules.sequence(i.rules.tokenOfType("whitespace"), i.rules.sequence.capture(m())).head())), i.rules.tokenOfType("end")).map(function(e, t) {
						return {
							from: e,
							to: t.valueOrElse(o.empty)
						};
					});
				}
				function d(e) {
					return C(f(), e);
				}
				function f() {
					var e = i.rules.sequence, t = function(e, t) {
						return i.rules.then(i.rules.token("identifier", e), function() {
							return t;
						});
					}, n = t("p", a.paragraph), o = t("r", a.run), s = i.rules.firstOf("p or r or table", n, o), c = i.rules.sequence(i.rules.tokenOfType("dot"), i.rules.sequence.cut(), i.rules.sequence.capture(h)).map(function(e) {
						return { styleId: e };
					}), l = i.rules.firstOf("style name matcher", i.rules.then(i.rules.sequence(i.rules.tokenOfType("equals"), i.rules.sequence.cut(), i.rules.sequence.capture(_)).head(), function(e) {
						return { styleName: a.equalTo(e) };
					}), i.rules.then(i.rules.sequence(i.rules.tokenOfType("startsWith"), i.rules.sequence.cut(), i.rules.sequence.capture(_)).head(), function(e) {
						return { styleName: a.startsWith(e) };
					})), u = i.rules.sequence(i.rules.tokenOfType("open-square-bracket"), i.rules.sequence.cut(), i.rules.token("identifier", "style-name"), i.rules.sequence.capture(l), i.rules.tokenOfType("close-square-bracket")).head(), d = i.rules.firstOf("list type", t("ordered-list", { isOrdered: !0 }), t("unordered-list", { isOrdered: !1 })), f = e(i.rules.tokenOfType("colon"), e.capture(d), e.cut(), i.rules.tokenOfType("open-paren"), e.capture(g), i.rules.tokenOfType("close-paren")).map(function(e, t) {
						return { list: {
							isOrdered: e.isOrdered,
							levelIndex: t - 1
						} };
					});
					function p(e) {
						var t = i.rules.firstOf.apply(i.rules.firstOf, ["matcher suffix"].concat(e)), n = i.rules.zeroOrMore(t);
						return i.rules.then(n, function(e) {
							var t = {};
							return e.forEach(function(e) {
								r.extend(t, e);
							}), t;
						});
					}
					var m = e(e.capture(s), e.capture(p([
						c,
						u,
						f
					]))).map(function(e, t) {
						return e(t);
					}), v = e(i.rules.token("identifier", "table"), e.capture(p([c, u]))).map(function(e) {
						return a.table(e);
					}), y = t("b", a.bold), b = t("i", a.italic), x = t("u", a.underline), S = t("strike", a.strikethrough), C = t("all-caps", a.allCaps), w = t("small-caps", a.smallCaps), T = e(i.rules.token("identifier", "highlight"), i.rules.sequence.capture(i.rules.optional(i.rules.sequence(i.rules.tokenOfType("open-square-bracket"), i.rules.sequence.cut(), i.rules.token("identifier", "color"), i.rules.tokenOfType("equals"), i.rules.sequence.capture(_), i.rules.tokenOfType("close-square-bracket")).head()))).map(function(e) {
						return a.highlight({ color: e.valueOrElse(void 0) });
					}), E = t("comment-reference", a.commentReference), D = e(i.rules.token("identifier", "br"), e.cut(), i.rules.tokenOfType("open-square-bracket"), i.rules.token("identifier", "type"), i.rules.tokenOfType("equals"), e.capture(_), i.rules.tokenOfType("close-square-bracket")).map(function(e) {
						switch (e) {
							case "line": return a.lineBreak;
							case "page": return a.pageBreak;
							case "column": return a.columnBreak;
						}
					});
					return i.rules.firstOf("element type", m, v, y, b, x, S, C, w, T, E, D);
				}
				function p(e) {
					return C(m(), e);
				}
				function m() {
					var e = i.rules.sequence.capture, t = i.rules.tokenOfType("whitespace"), n = i.rules.then(i.rules.optional(i.rules.sequence(i.rules.tokenOfType("colon"), i.rules.token("identifier", "fresh"))), function(e) {
						return e.map(function() {
							return !0;
						}).valueOrElse(!1);
					}), r = i.rules.then(i.rules.optional(i.rules.sequence(i.rules.tokenOfType("colon"), i.rules.token("identifier", "separator"), i.rules.tokenOfType("open-paren"), e(_), i.rules.tokenOfType("close-paren")).head()), function(e) {
						return e.valueOrElse("");
					}), a = i.rules.oneOrMoreWithSeparator(h, i.rules.tokenOfType("choice")), s = i.rules.sequence(e(a), e(i.rules.zeroOrMore(S)), e(n), e(r)).map(function(e, t, n, r) {
						var i = Object.create(null), a = {};
						return t.forEach(function(e) {
							e.append && i[e.name] ? i[e.name] += " " + e.value : i[e.name] = e.value;
						}), n && (a.fresh = !0), r && (a.separator = r), o.element(e, i, a);
					});
					return i.rules.firstOf("html path", i.rules.then(i.rules.tokenOfType("bang"), function() {
						return o.ignore;
					}), i.rules.then(i.rules.zeroOrMoreWithSeparator(s, i.rules.sequence(t, i.rules.tokenOfType("gt"), t)), o.elements));
				}
				var h = i.rules.then(i.rules.tokenOfType("identifier"), y), g = i.rules.tokenOfType("integer"), _ = i.rules.then(i.rules.tokenOfType("string"), y), v = {
					n: "\n",
					r: "\r",
					t: "	"
				};
				function y(e) {
					return e.replace(/\\(.)/g, function(e, t) {
						return v[t] || t;
					});
				}
				var b = i.rules.sequence(i.rules.tokenOfType("open-square-bracket"), i.rules.sequence.cut(), i.rules.sequence.capture(h), i.rules.tokenOfType("equals"), i.rules.sequence.capture(_), i.rules.tokenOfType("close-square-bracket")).map(function(e, t) {
					return {
						name: e,
						value: t,
						append: !1
					};
				}), x = i.rules.sequence(i.rules.tokenOfType("dot"), i.rules.sequence.cut(), i.rules.sequence.capture(h)).map(function(e) {
					return {
						name: "class",
						value: e,
						append: !0
					};
				}), S = i.rules.firstOf("attribute or class", b, x);
				function C(e, t) {
					var n = s(t), r = i.Parser().parseTokens(e, n);
					return r.isSuccess() ? c.success(r.value()) : new c.Result(null, [c.warning(w(t, r))]);
				}
				function w(e, t) {
					return "Did not understand this style mapping, so ignored it: " + e + "\n" + t.errors().map(T).join("\n");
				}
				function T(e) {
					return "Error was at character number " + e.characterNumber() + ": Expected " + e.expected + " but got " + e.actual;
				}
				var E = u();
			}, {
				"./results": 25,
				"./styles/document-matchers": 27,
				"./styles/html-paths": 28,
				"./styles/parser/tokeniser": 29,
				lop: 54,
				underscore: 67
			}],
			27: [function(e, t, n) {
				n.paragraph = r, n.run = i, n.table = a, n.bold = new s("bold"), n.italic = new s("italic"), n.underline = new s("underline"), n.strikethrough = new s("strikethrough"), n.allCaps = new s("allCaps"), n.smallCaps = new s("smallCaps"), n.highlight = o, n.commentReference = new s("commentReference"), n.lineBreak = new l({ breakType: "line" }), n.pageBreak = new l({ breakType: "page" }), n.columnBreak = new l({ breakType: "column" }), n.equalTo = d, n.startsWith = f;
				function r(e) {
					return new s("paragraph", e);
				}
				function i(e) {
					return new s("run", e);
				}
				function a(e) {
					return new s("table", e);
				}
				function o(e) {
					return new c(e);
				}
				function s(e, t) {
					t ||= {}, this._elementType = e, this._styleId = t.styleId, this._styleName = t.styleName, t.list && (this._listIndex = t.list.levelIndex, this._listIsOrdered = t.list.isOrdered);
				}
				s.prototype.matches = function(e) {
					return e.type === this._elementType && (this._styleId === void 0 || e.styleId === this._styleId) && (this._styleName === void 0 || e.styleName && this._styleName.operator(this._styleName.operand, e.styleName)) && (this._listIndex === void 0 || u(e, this._listIndex, this._listIsOrdered)) && (this._breakType === void 0 || this._breakType === e.breakType);
				};
				function c(e) {
					e ||= {}, this._color = e.color;
				}
				c.prototype.matches = function(e) {
					return e.type === "highlight" && (this._color === void 0 || e.color === this._color);
				};
				function l(e) {
					e ||= {}, this._breakType = e.breakType;
				}
				l.prototype.matches = function(e) {
					return e.type === "break" && (this._breakType === void 0 || e.breakType === this._breakType);
				};
				function u(e, t, n) {
					return e.numbering && e.numbering.level == t && e.numbering.isOrdered == n;
				}
				function d(e) {
					return {
						operator: p,
						operand: e
					};
				}
				function f(e) {
					return {
						operator: m,
						operand: e
					};
				}
				function p(e, t) {
					return e.toUpperCase() === t.toUpperCase();
				}
				function m(e, t) {
					return t.toUpperCase().indexOf(e.toUpperCase()) === 0;
				}
			}, {}],
			28: [function(e, t, n) {
				var r = e("underscore"), i = e("../html");
				n.topLevelElement = a, n.elements = o, n.element = c;
				function a(e, t) {
					return o([c(e, t, { fresh: !0 })]);
				}
				function o(e) {
					return new s(e.map(function(e) {
						return r.isString(e) ? c(e) : e;
					}));
				}
				function s(e) {
					this._elements = e;
				}
				s.prototype.wrap = function(e) {
					for (var t = e(), n = this._elements.length - 1; n >= 0; n--) t = this._elements[n].wrapNodes(t);
					return t;
				};
				function c(e, t, n) {
					return n ||= {}, new l(e, t, n);
				}
				function l(e, t, n) {
					var i = Object.create(null);
					r.isArray(e) ? (e.forEach(function(e) {
						i[e] = !0;
					}), e = e[0]) : i[e] = !0, this.tagName = e, this.tagNames = i, this.attributes = t || {}, this.fresh = n.fresh, this.separator = n.separator;
				}
				l.prototype.matchesElement = function(e) {
					return this.tagNames[e.tagName] && r.isEqual(this.attributes || {}, e.attributes || {});
				}, l.prototype.wrap = function(e) {
					return this.wrapNodes(e());
				}, l.prototype.wrapNodes = function(e) {
					return [i.elementWithTag(this, e)];
				}, n.empty = o([]), n.ignore = { wrap: function() {
					return [];
				} };
			}, {
				"../html": 18,
				underscore: 67
			}],
			29: [function(e, t, n) {
				var r = e("lop").RegexTokeniser;
				n.tokenise = a;
				var i = "'((?:\\\\(?:.|$)|[^'\\\\])*)";
				function a(e) {
					var t = "(?:[a-zA-Z\\-_]|\\\\.)";
					return new r([
						{
							name: "identifier",
							regex: RegExp("(" + t + "(?:" + t + "|[0-9])*)")
						},
						{
							name: "dot",
							regex: /\./
						},
						{
							name: "colon",
							regex: /:/
						},
						{
							name: "gt",
							regex: />/
						},
						{
							name: "whitespace",
							regex: /\s+/
						},
						{
							name: "arrow",
							regex: /=>/
						},
						{
							name: "equals",
							regex: /=/
						},
						{
							name: "startsWith",
							regex: /\^=/
						},
						{
							name: "open-paren",
							regex: /\(/
						},
						{
							name: "close-paren",
							regex: /\)/
						},
						{
							name: "open-square-bracket",
							regex: /\[/
						},
						{
							name: "close-square-bracket",
							regex: /\]/
						},
						{
							name: "string",
							regex: RegExp(i + "'")
						},
						{
							name: "unterminated-string",
							regex: new RegExp(i)
						},
						{
							name: "integer",
							regex: /([0-9]+)/
						},
						{
							name: "choice",
							regex: /\|/
						},
						{
							name: "bang",
							regex: /(!)/
						}
					]).tokenise(e);
				}
			}, { lop: 54 }],
			30: [function(e, t, n) {
				var r = e("underscore");
				n.paragraph = i, n.run = a, n._elements = s, n._elementsOfType = o, n.getDescendantsOfType = c, n.getDescendants = l;
				function i(e) {
					return o("paragraph", e);
				}
				function a(e) {
					return o("run", e);
				}
				function o(e, t) {
					return s(function(n) {
						return n.type === e ? t(n) : n;
					});
				}
				function s(e) {
					return function t(n) {
						if (n.children) {
							var i = r.map(n.children, t);
							n = r.extend(n, { children: i });
						}
						return e(n);
					};
				}
				function c(e, t) {
					return l(e).filter(function(e) {
						return e.type === t;
					});
				}
				function l(e) {
					var t = [];
					return u(e, function(e) {
						t.push(e);
					}), t;
				}
				function u(e, t) {
					e.children && e.children.forEach(function(e) {
						u(e, t), t(e);
					});
				}
			}, { underscore: 67 }],
			31: [function(e, t, n) {
				var r = e("./styles/html-paths"), i = e("./html");
				n.element = a;
				function a(e) {
					return function(t) {
						return i.elementWithTag(r.element(e), [t]);
					};
				}
			}, {
				"./html": 18,
				"./styles/html-paths": 28
			}],
			32: [function(e, t, n) {
				var r = e("underscore");
				n.writer = i;
				function i(e) {
					return e ||= {}, e.prettyPrint ? o() : s();
				}
				var a = {
					div: !0,
					p: !0,
					ul: !0,
					li: !0
				};
				function o() {
					var e = 0, t = [], n = !0, i = !1, o = s();
					function c(r, i) {
						a[r] && m(), t.push(r), o.open(r, i), a[r] && e++, n = !1;
					}
					function l(n) {
						a[n] && (e--, m()), t.pop(), o.close(n);
					}
					function u(e) {
						p();
						var t = h() ? e : e.replace("\n", "\n  ");
						o.text(t);
					}
					function d(e, t) {
						m(), o.selfClosing(e, t);
					}
					function f() {
						return t.length === 0 || a[t[t.length - 1]];
					}
					function p() {
						i ||= (m(), !0);
					}
					function m() {
						if (i = !1, !n && f() && !h()) {
							o._append("\n");
							for (var t = 0; t < e; t++) o._append("  ");
						}
					}
					function h() {
						return r.some(t, function(e) {
							return e === "pre";
						});
					}
					return {
						asString: o.asString,
						open: c,
						close: l,
						text: u,
						selfClosing: d
					};
				}
				function s() {
					var e = [];
					function t(t, n) {
						var r = a(n);
						e.push("<" + t + r + ">");
					}
					function n(t) {
						e.push("</" + t + ">");
					}
					function i(t, n) {
						var r = a(n);
						e.push("<" + t + r + " />");
					}
					function a(e) {
						return r.map(e, function(e, t) {
							return " " + t + "=\"" + l(e) + "\"";
						}).join("");
					}
					function o(t) {
						e.push(c(t));
					}
					function s(t) {
						e.push(t);
					}
					function u() {
						return e.join("");
					}
					return {
						asString: u,
						open: t,
						close: n,
						text: o,
						selfClosing: i,
						_append: s
					};
				}
				function c(e) {
					return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
				}
				function l(e) {
					return e.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
				}
			}, { underscore: 67 }],
			33: [function(e, t, n) {
				var r = e("./html-writer"), i = e("./markdown-writer");
				n.writer = a;
				function a(e) {
					return e ||= {}, e.outputFormat === "markdown" ? i.writer() : r.writer(e);
				}
			}, {
				"./html-writer": 32,
				"./markdown-writer": 34
			}],
			34: [function(e, t, n) {
				var r = e("underscore"), i = e("./html-writer");
				function a(e) {
					return o(e, e);
				}
				function o(e, t) {
					return function() {
						return {
							start: e,
							end: t
						};
					};
				}
				function s(e) {
					var t = e.href || "";
					return t ? {
						start: "[",
						end: "](" + m(t) + ")",
						anchorPosition: "before"
					} : {};
				}
				function c(e) {
					var t = e.src || "", n = e.alt || "";
					return t || n ? { start: "![" + m(n) + "](" + m(t) + ")" } : {};
				}
				function l(e) {
					return function(t, n) {
						return {
							start: n ? "\n" : "",
							end: n ? "" : "\n",
							list: {
								isOrdered: e.isOrdered,
								indent: n ? n.indent + 1 : 0,
								count: 0
							}
						};
					};
				}
				function u(e, t, n) {
					t ||= {
						indent: 0,
						isOrdered: !1,
						count: 0
					}, t.count++, n.hasClosed = !1;
					var r = t.isOrdered ? t.count + "." : "-";
					return {
						start: f("	", t.indent) + r + " ",
						end: function() {
							if (!n.hasClosed) return n.hasClosed = !0, "\n";
						}
					};
				}
				var d = {
					p: o("", "\n\n"),
					br: o("", "  \n"),
					ul: l({ isOrdered: !1 }),
					ol: l({ isOrdered: !0 }),
					li: u,
					strong: a("__"),
					em: a("*"),
					a: s,
					img: c
				};
				(function() {
					for (var e = 1; e <= 6; e++) d["h" + e] = o(f("#", e) + " ", "\n\n");
				})();
				function f(e, t) {
					return Array(t + 1).join(e);
				}
				function p() {
					var e = [], t = [], n = null, a = {};
					function o(r, i) {
						i ||= {};
						var o = (d[r] || function() {
							return {};
						})(i, n, a);
						t.push({
							end: o.end,
							list: n
						}), o.list && (n = o.list);
						var c = o.anchorPosition === "before";
						c && s(i), e.push(o.start || ""), c || s(i);
					}
					function s(t) {
						if (t.id) {
							var n = i.writer();
							n.open("a", { id: t.id }), n.close("a"), e.push(n.asString());
						}
					}
					function c(i) {
						var a = t.pop();
						n = a.list;
						var o = r.isFunction(a.end) ? a.end() : a.end;
						e.push(o || "");
					}
					function l(e, t) {
						o(e, t), c(e);
					}
					function u(t) {
						e.push(m(t));
					}
					function f() {
						return e.join("");
					}
					return {
						asString: f,
						open: o,
						close: c,
						text: u,
						selfClosing: l
					};
				}
				n.writer = p;
				function m(e) {
					return e.replace(/\\/g, "\\\\").replace(/([\`\*_\{\}\[\]\(\)\#\+\-\.\!])/g, "\\$1");
				}
			}, {
				"./html-writer": 32,
				underscore: 67
			}],
			35: [function(e, t, n) {
				var r = e("./nodes");
				n.Element = r.Element, n.element = r.element, n.emptyElement = r.emptyElement, n.text = r.text, n.readString = e("./reader").readString, n.writeString = e("./writer").writeString;
			}, {
				"./nodes": 36,
				"./reader": 37,
				"./writer": 38
			}],
			36: [function(e, t, n) {
				var r = e("underscore");
				n.Element = a, n.element = function(e, t, n) {
					return new a(e, t, n);
				}, n.text = function(e) {
					return {
						type: "text",
						value: e
					};
				};
				var i = n.emptyElement = {
					first: function() {
						return null;
					},
					firstOrEmpty: function() {
						return i;
					},
					attributes: {},
					children: []
				};
				function a(e, t, n) {
					this.type = "element", this.name = e, this.attributes = t || {}, this.children = n || [];
				}
				a.prototype.first = function(e) {
					return r.find(this.children, function(t) {
						return t.name === e;
					});
				}, a.prototype.firstOrEmpty = function(e) {
					return this.first(e) || i;
				}, a.prototype.getElementsByTagName = function(e) {
					return s(r.filter(this.children, function(t) {
						return t.name === e;
					}));
				}, a.prototype.text = function() {
					if (this.children.length === 0) return "";
					if (this.children.length !== 1 || this.children[0].type !== "text") throw Error("Not implemented");
					return this.children[0].value;
				};
				var o = { getElementsByTagName: function(e) {
					return s(r.flatten(this.map(function(t) {
						return t.getElementsByTagName(e);
					}, !0)));
				} };
				function s(e) {
					return r.extend(e, o);
				}
			}, { underscore: 67 }],
			37: [function(e, t, n) {
				var r = e("../promises"), i = e("underscore"), a = e("./xmldom"), o = e("./nodes"), s = o.Element;
				n.readString = l;
				var c = a.Node;
				function l(e, t) {
					t ||= {};
					try {
						var n = a.parseFromString(e, "text/xml");
					} catch (e) {
						return r.reject(e);
					}
					if (n.documentElement.tagName === "parsererror") return r.resolve(Error(n.documentElement.textContent));
					function l(e) {
						switch (e.nodeType) {
							case c.ELEMENT_NODE: return u(e);
							case c.TEXT_NODE: return o.text(e.nodeValue);
						}
					}
					function u(e) {
						var t = d(e), n = [];
						i.forEach(e.childNodes, function(e) {
							var t = l(e);
							t && n.push(t);
						});
						var r = Object.create(null);
						return i.forEach(e.attributes, function(e) {
							r[d(e)] = e.value;
						}), new s(t, r, n);
					}
					function d(e) {
						if (e.namespaceURI) {
							var n = t[e.namespaceURI];
							return (n ? n + ":" : "{" + e.namespaceURI + "}") + e.localName;
						}
						return e.localName;
					}
					return r.resolve(l(n.documentElement));
				}
			}, {
				"../promises": 23,
				"./nodes": 36,
				"./xmldom": 39,
				underscore: 67
			}],
			38: [function(e, t, n) {
				var r = e("underscore"), i = e("xmlbuilder");
				n.writeString = a;
				function a(e, t) {
					var n = r.invert(t), a = {
						element: c,
						text: o
					};
					function s(e, t) {
						return a[t.type](e, t);
					}
					function c(e, t) {
						var n = e.element(l(t.name), t.attributes);
						t.children.forEach(function(e) {
							s(n, e);
						});
					}
					function l(e) {
						var t = /^\{(.*)\}(.*)$/.exec(e);
						if (t) {
							var r = n[t[1]];
							return r + (r === "" ? "" : ":") + t[2];
						}
						return e;
					}
					function u(e) {
						var n = i.create(l(e.name), {
							version: "1.0",
							encoding: "UTF-8",
							standalone: !0
						});
						return r.forEach(t, function(e, t) {
							var r = "xmlns" + (t === "" ? "" : ":" + t);
							n.attribute(r, e);
						}), e.children.forEach(function(e) {
							s(n, e);
						}), n.end();
					}
					return u(e);
				}
				function o(e, t) {
					e.text(t.value);
				}
			}, {
				underscore: 67,
				xmlbuilder: 89
			}],
			39: [function(e, t, n) {
				var r = e("@xmldom/xmldom"), i = e("@xmldom/xmldom/lib/dom");
				function a(e) {
					var t = null, n = new r.DOMParser({ errorHandler: function(e, n) {
						t = {
							level: e,
							message: n
						};
					} }).parseFromString(e);
					if (t === null) return n;
					throw Error(t.level + ": " + t.message);
				}
				n.parseFromString = a, n.Node = i.Node;
			}, {
				"@xmldom/xmldom": 45,
				"@xmldom/xmldom/lib/dom": 43
			}],
			40: [function(e, t, n) {
				var r = e("base64-js"), i = e("jszip");
				n.openArrayBuffer = a, n.splitPath = o, n.joinPath = s;
				function a(e) {
					return i.loadAsync(e).then(function(e) {
						function t(t) {
							return e.file(t) !== null;
						}
						function n(t, n) {
							return e.file(t).async("uint8array").then(function(e) {
								return n === "base64" ? r.fromByteArray(e) : n ? new TextDecoder(n).decode(e) : e;
							});
						}
						function i(t, n) {
							e.file(t, n);
						}
						function a() {
							return e.generateAsync({ type: "arraybuffer" });
						}
						return {
							exists: t,
							read: n,
							write: i,
							toArrayBuffer: a
						};
					});
				}
				function o(e) {
					var t = e.lastIndexOf("/");
					return t === -1 ? {
						dirname: "",
						basename: e
					} : {
						dirname: e.substring(0, t),
						basename: e.substring(t + 1)
					};
				}
				function s() {
					var e = Array.prototype.filter.call(arguments, function(e) {
						return e;
					}), t = [];
					return e.forEach(function(e) {
						/^\//.test(e) ? t = [e] : t.push(e);
					}), t.join("/");
				}
			}, {
				"base64-js": 47,
				jszip: 53
			}],
			41: [function(e, t, n) {
				function r(e, t, n) {
					if (n === void 0 && (n = Array.prototype), e && typeof n.find == "function") return n.find.call(e, t);
					for (var r = 0; r < e.length; r++) if (Object.prototype.hasOwnProperty.call(e, r)) {
						var i = e[r];
						if (t.call(void 0, i, r, e)) return i;
					}
				}
				function i(e, t) {
					return t === void 0 && (t = Object), t && typeof t.freeze == "function" ? t.freeze(e) : e;
				}
				function a(e, t) {
					if (typeof e != "object" || !e) throw TypeError("target is not an object");
					for (var n in t) Object.prototype.hasOwnProperty.call(t, n) && (e[n] = t[n]);
					return e;
				}
				var o = i({
					HTML: "text/html",
					isHTML: function(e) {
						return e === o.HTML;
					},
					XML_APPLICATION: "application/xml",
					XML_TEXT: "text/xml",
					XML_XHTML_APPLICATION: "application/xhtml+xml",
					XML_SVG_IMAGE: "image/svg+xml"
				}), s = i({
					HTML: "http://www.w3.org/1999/xhtml",
					isHTML: function(e) {
						return e === s.HTML;
					},
					SVG: "http://www.w3.org/2000/svg",
					XML: "http://www.w3.org/XML/1998/namespace",
					XMLNS: "http://www.w3.org/2000/xmlns/"
				});
				n.assign = a, n.find = r, n.freeze = i, n.MIME_TYPE = o, n.NAMESPACE = s;
			}, {}],
			42: [function(e, t, n) {
				var r = e("./conventions"), i = e("./dom"), a = e("./entities"), o = e("./sax"), s = i.DOMImplementation, c = r.NAMESPACE, l = o.ParseError, u = o.XMLReader;
				function d(e) {
					return e.replace(/\r[\n\u0085]/g, "\n").replace(/[\r\u0085\u2028]/g, "\n");
				}
				function f(e) {
					this.options = e || { locator: {} };
				}
				f.prototype.parseFromString = function(e, t) {
					var n = this.options, r = new u(), i = n.domBuilder || new m(), o = n.errorHandler, s = n.locator, l = n.xmlns || {}, f = /\/x?html?$/.test(t), h = f ? a.HTML_ENTITIES : a.XML_ENTITIES;
					s && i.setDocumentLocator(s), r.errorHandler = p(o, i, s), r.domBuilder = n.domBuilder || i, f && (l[""] = c.HTML), l.xml = l.xml || c.XML;
					var g = n.normalizeLineEndings || d;
					return e && typeof e == "string" ? r.parse(g(e), l, h) : r.errorHandler.error("invalid doc source"), i.doc;
				};
				function p(e, t, n) {
					if (!e) {
						if (t instanceof m) return t;
						e = t;
					}
					var r = {}, i = e instanceof Function;
					n ||= {};
					function a(t) {
						var a = e[t];
						!a && i && (a = e.length == 2 ? function(n) {
							e(t, n);
						} : e), r[t] = a && function(e) {
							a("[xmldom " + t + "]	" + e + g(n));
						} || function() {};
					}
					return a("warning"), a("error"), a("fatalError"), r;
				}
				function m() {
					this.cdata = !1;
				}
				function h(e, t) {
					t.lineNumber = e.lineNumber, t.columnNumber = e.columnNumber;
				}
				m.prototype = {
					startDocument: function() {
						this.doc = new s().createDocument(null, null, null), this.locator && (this.doc.documentURI = this.locator.systemId);
					},
					startElement: function(e, t, n, r) {
						var i = this.doc, a = i.createElementNS(e, n || t), o = r.length;
						v(this, a), this.currentElement = a, this.locator && h(this.locator, a);
						for (var s = 0; s < o; s++) {
							var e = r.getURI(s), c = r.getValue(s), n = r.getQName(s), l = i.createAttributeNS(e, n);
							this.locator && h(r.getLocator(s), l), l.value = l.nodeValue = c, a.setAttributeNode(l);
						}
					},
					endElement: function(e, t, n) {
						var r = this.currentElement;
						r.tagName, this.currentElement = r.parentNode;
					},
					startPrefixMapping: function(e, t) {},
					endPrefixMapping: function(e) {},
					processingInstruction: function(e, t) {
						var n = this.doc.createProcessingInstruction(e, t);
						this.locator && h(this.locator, n), v(this, n);
					},
					ignorableWhitespace: function(e, t, n) {},
					characters: function(e, t, n) {
						if (e = _.apply(this, arguments), e) {
							if (this.cdata) var r = this.doc.createCDATASection(e);
							else var r = this.doc.createTextNode(e);
							this.currentElement ? this.currentElement.appendChild(r) : /^\s*$/.test(e) && this.doc.appendChild(r), this.locator && h(this.locator, r);
						}
					},
					skippedEntity: function(e) {},
					endDocument: function() {
						this.doc.normalize();
					},
					setDocumentLocator: function(e) {
						(this.locator = e) && (e.lineNumber = 0);
					},
					comment: function(e, t, n) {
						e = _.apply(this, arguments);
						var r = this.doc.createComment(e);
						this.locator && h(this.locator, r), v(this, r);
					},
					startCDATA: function() {
						this.cdata = !0;
					},
					endCDATA: function() {
						this.cdata = !1;
					},
					startDTD: function(e, t, n) {
						var r = this.doc.implementation;
						if (r && r.createDocumentType) {
							var i = r.createDocumentType(e, t, n);
							this.locator && h(this.locator, i), v(this, i), this.doc.doctype = i;
						}
					},
					warning: function(e) {
						console.warn("[xmldom warning]	" + e, g(this.locator));
					},
					error: function(e) {
						console.error("[xmldom error]	" + e, g(this.locator));
					},
					fatalError: function(e) {
						throw new l(e, this.locator);
					}
				};
				function g(e) {
					if (e) return "\n@" + (e.systemId || "") + "#[line:" + e.lineNumber + ",col:" + e.columnNumber + "]";
				}
				function _(e, t, n) {
					return typeof e == "string" ? e.substr(t, n) : e.length >= t + n || t ? new java.lang.String(e, t, n) + "" : e;
				}
				"endDTD,startEntity,endEntity,attributeDecl,elementDecl,externalEntityDecl,internalEntityDecl,resolveEntity,getExternalSubset,notationDecl,unparsedEntityDecl".replace(/\w+/g, function(e) {
					m.prototype[e] = function() {
						return null;
					};
				});
				function v(e, t) {
					e.currentElement ? e.currentElement.appendChild(t) : e.doc.appendChild(t);
				}
				n.__DOMHandler = m, n.normalizeLineEndings = d, n.DOMParser = f;
			}, {
				"./conventions": 41,
				"./dom": 43,
				"./entities": 44,
				"./sax": 46
			}],
			43: [function(e, t, n) {
				var r = e("./conventions"), i = r.find, a = r.NAMESPACE;
				function o(e) {
					return e !== "";
				}
				function s(e) {
					return e ? e.split(/[\t\n\f\r ]+/).filter(o) : [];
				}
				function c(e, t) {
					return e.hasOwnProperty(t) || (e[t] = !0), e;
				}
				function l(e) {
					if (!e) return [];
					var t = s(e);
					return Object.keys(t.reduce(c, {}));
				}
				function u(e) {
					return function(t) {
						return e && e.indexOf(t) !== -1;
					};
				}
				function d(e, t) {
					for (var n in e) Object.prototype.hasOwnProperty.call(e, n) && (t[n] = e[n]);
				}
				function f(e, t) {
					var n = e.prototype;
					if (!(n instanceof t)) {
						function r() {}
						r.prototype = t.prototype, r = new r(), d(n, r), e.prototype = n = r;
					}
					n.constructor != e && (typeof e != "function" && console.error("unknown Class:" + e), n.constructor = e);
				}
				var p = {}, m = p.ELEMENT_NODE = 1, h = p.ATTRIBUTE_NODE = 2, g = p.TEXT_NODE = 3, _ = p.CDATA_SECTION_NODE = 4, v = p.ENTITY_REFERENCE_NODE = 5, y = p.ENTITY_NODE = 6, b = p.PROCESSING_INSTRUCTION_NODE = 7, x = p.COMMENT_NODE = 8, S = p.DOCUMENT_NODE = 9, C = p.DOCUMENT_TYPE_NODE = 10, w = p.DOCUMENT_FRAGMENT_NODE = 11, T = p.NOTATION_NODE = 12, E = {}, D = {};
				E.INDEX_SIZE_ERR = (D[1] = "Index size error", 1), E.DOMSTRING_SIZE_ERR = (D[2] = "DOMString size error", 2);
				var O = E.HIERARCHY_REQUEST_ERR = (D[3] = "Hierarchy request error", 3);
				E.WRONG_DOCUMENT_ERR = (D[4] = "Wrong document", 4), E.INVALID_CHARACTER_ERR = (D[5] = "Invalid character", 5), E.NO_DATA_ALLOWED_ERR = (D[6] = "No data allowed", 6), E.NO_MODIFICATION_ALLOWED_ERR = (D[7] = "No modification allowed", 7);
				var k = E.NOT_FOUND_ERR = (D[8] = "Not found", 8);
				E.NOT_SUPPORTED_ERR = (D[9] = "Not supported", 9);
				var A = E.INUSE_ATTRIBUTE_ERR = (D[10] = "Attribute in use", 10);
				E.INVALID_STATE_ERR = (D[11] = "Invalid state", 11), E.SYNTAX_ERR = (D[12] = "Syntax error", 12), E.INVALID_MODIFICATION_ERR = (D[13] = "Invalid modification", 13), E.NAMESPACE_ERR = (D[14] = "Invalid namespace", 14), E.INVALID_ACCESS_ERR = (D[15] = "Invalid access", 15);
				function j(e, t) {
					if (t instanceof Error) var n = t;
					else n = this, Error.call(this, D[e]), this.message = D[e], Error.captureStackTrace && Error.captureStackTrace(this, j);
					return n.code = e, t && (this.message = this.message + ": " + t), n;
				}
				j.prototype = Error.prototype, d(E, j);
				function M() {}
				M.prototype = {
					length: 0,
					item: function(e) {
						return this[e] || null;
					},
					toString: function(e, t) {
						for (var n = [], r = 0; r < this.length; r++) Ee(this[r], n, e, t);
						return n.join("");
					},
					filter: function(e) {
						return Array.prototype.filter.call(this, e);
					},
					indexOf: function(e) {
						return Array.prototype.indexOf.call(this, e);
					}
				};
				function N(e, t) {
					this._node = e, this._refresh = t, P(this);
				}
				function P(e) {
					var t = e._node._inc || e._node.ownerDocument._inc;
					if (e._inc != t) {
						var n = e._refresh(e._node);
						ke(e, "length", n.length), d(n, e), e._inc = t;
					}
				}
				N.prototype.item = function(e) {
					return P(this), this[e];
				}, f(N, M);
				function F() {}
				function I(e, t) {
					for (var n = e.length; n--;) if (e[n] === t) return n;
				}
				function L(e, t, n, r) {
					if (r ? t[I(t, r)] = n : t[t.length++] = n, e) {
						n.ownerElement = e;
						var i = e.ownerDocument;
						i && (r && W(i, e, r), ee(i, e, n));
					}
				}
				function R(e, t, n) {
					var r = I(t, n);
					if (r >= 0) {
						for (var i = t.length - 1; r < i;) t[r] = t[++r];
						if (t.length = i, e) {
							var a = e.ownerDocument;
							a && (W(a, e, n), n.ownerElement = null);
						}
					} else throw new j(k, /* @__PURE__ */ Error(e.tagName + "@" + n));
				}
				F.prototype = {
					length: 0,
					item: M.prototype.item,
					getNamedItem: function(e) {
						for (var t = this.length; t--;) {
							var n = this[t];
							if (n.nodeName == e) return n;
						}
					},
					setNamedItem: function(e) {
						var t = e.ownerElement;
						if (t && t != this._ownerElement) throw new j(A);
						var n = this.getNamedItem(e.nodeName);
						return L(this._ownerElement, this, e, n), n;
					},
					setNamedItemNS: function(e) {
						var t = e.ownerElement, n;
						if (t && t != this._ownerElement) throw new j(A);
						return n = this.getNamedItemNS(e.namespaceURI, e.localName), L(this._ownerElement, this, e, n), n;
					},
					removeNamedItem: function(e) {
						var t = this.getNamedItem(e);
						return R(this._ownerElement, this, t), t;
					},
					removeNamedItemNS: function(e, t) {
						var n = this.getNamedItemNS(e, t);
						return R(this._ownerElement, this, n), n;
					},
					getNamedItemNS: function(e, t) {
						for (var n = this.length; n--;) {
							var r = this[n];
							if (r.localName == t && r.namespaceURI == e) return r;
						}
						return null;
					}
				};
				function z() {}
				z.prototype = {
					hasFeature: function(e, t) {
						return !0;
					},
					createDocument: function(e, t, n) {
						var r = new U();
						if (r.implementation = this, r.childNodes = new M(), r.doctype = n || null, n && r.appendChild(n), t) {
							var i = r.createElementNS(e, t);
							r.appendChild(i);
						}
						return r;
					},
					createDocumentType: function(e, t, n) {
						var r = new ge();
						return r.name = e, r.nodeName = e, r.publicId = t || "", r.systemId = n || "", r;
					}
				};
				function B() {}
				B.prototype = {
					firstChild: null,
					lastChild: null,
					previousSibling: null,
					nextSibling: null,
					attributes: null,
					parentNode: null,
					childNodes: null,
					ownerDocument: null,
					nodeValue: null,
					namespaceURI: null,
					prefix: null,
					localName: null,
					insertBefore: function(e, t) {
						return ue(this, e, t);
					},
					replaceChild: function(e, t) {
						ue(this, e, t, le), t && this.removeChild(t);
					},
					removeChild: function(e) {
						return G(this, e);
					},
					appendChild: function(e) {
						return this.insertBefore(e, null);
					},
					hasChildNodes: function() {
						return this.firstChild != null;
					},
					cloneNode: function(e) {
						return Oe(this.ownerDocument || this, this, e);
					},
					normalize: function() {
						for (var e = this.firstChild; e;) {
							var t = e.nextSibling;
							t && t.nodeType == g && e.nodeType == g ? (this.removeChild(t), e.appendData(t.data)) : (e.normalize(), e = t);
						}
					},
					isSupported: function(e, t) {
						return this.ownerDocument.implementation.hasFeature(e, t);
					},
					hasAttributes: function() {
						return this.attributes.length > 0;
					},
					lookupPrefix: function(e) {
						for (var t = this; t;) {
							var n = t._nsMap;
							if (n) {
								for (var r in n) if (Object.prototype.hasOwnProperty.call(n, r) && n[r] === e) return r;
							}
							t = t.nodeType == h ? t.ownerDocument : t.parentNode;
						}
						return null;
					},
					lookupNamespaceURI: function(e) {
						for (var t = this; t;) {
							var n = t._nsMap;
							if (n && Object.prototype.hasOwnProperty.call(n, e)) return n[e];
							t = t.nodeType == h ? t.ownerDocument : t.parentNode;
						}
						return null;
					},
					isDefaultNamespace: function(e) {
						return this.lookupPrefix(e) == null;
					}
				};
				function V(e) {
					return e == "<" && "&lt;" || e == ">" && "&gt;" || e == "&" && "&amp;" || e == "\"" && "&quot;" || "&#" + e.charCodeAt() + ";";
				}
				d(p, B), d(p, B.prototype);
				function H(e, t) {
					if (t(e)) return !0;
					if (e = e.firstChild) do
						if (H(e, t)) return !0;
					while (e = e.nextSibling);
				}
				function U() {
					this.ownerDocument = this;
				}
				function ee(e, t, n) {
					e && e._inc++, n.namespaceURI === a.XMLNS && (t._nsMap[n.prefix ? n.localName : ""] = n.value);
				}
				function W(e, t, n, r) {
					e && e._inc++, n.namespaceURI === a.XMLNS && delete t._nsMap[n.prefix ? n.localName : ""];
				}
				function te(e, t, n) {
					if (e && e._inc) {
						e._inc++;
						var r = t.childNodes;
						if (n) r[r.length++] = n;
						else {
							for (var i = t.firstChild, a = 0; i;) r[a++] = i, i = i.nextSibling;
							r.length = a, delete r[r.length];
						}
					}
				}
				function G(e, t) {
					var n = t.previousSibling, r = t.nextSibling;
					return n ? n.nextSibling = r : e.firstChild = r, r ? r.previousSibling = n : e.lastChild = n, t.parentNode = null, t.previousSibling = null, t.nextSibling = null, te(e.ownerDocument, e), t;
				}
				function ne(e) {
					return e && (e.nodeType === B.DOCUMENT_NODE || e.nodeType === B.DOCUMENT_FRAGMENT_NODE || e.nodeType === B.ELEMENT_NODE);
				}
				function re(e) {
					return e && (ae(e) || K(e) || ie(e) || e.nodeType === B.DOCUMENT_FRAGMENT_NODE || e.nodeType === B.COMMENT_NODE || e.nodeType === B.PROCESSING_INSTRUCTION_NODE);
				}
				function ie(e) {
					return e && e.nodeType === B.DOCUMENT_TYPE_NODE;
				}
				function ae(e) {
					return e && e.nodeType === B.ELEMENT_NODE;
				}
				function K(e) {
					return e && e.nodeType === B.TEXT_NODE;
				}
				function q(e, t) {
					var n = e.childNodes || [];
					if (i(n, ae) || ie(t)) return !1;
					var r = i(n, ie);
					return !(t && r && n.indexOf(r) > n.indexOf(t));
				}
				function oe(e, t) {
					var n = e.childNodes || [];
					function r(e) {
						return ae(e) && e !== t;
					}
					if (i(n, r)) return !1;
					var a = i(n, ie);
					return !(t && a && n.indexOf(a) > n.indexOf(t));
				}
				function se(e, t, n) {
					if (!ne(e)) throw new j(O, "Unexpected parent node type " + e.nodeType);
					if (n && n.parentNode !== e) throw new j(k, "child not in parent");
					if (!re(t) || ie(t) && e.nodeType !== B.DOCUMENT_NODE) throw new j(O, "Unexpected node type " + t.nodeType + " for parent node type " + e.nodeType);
				}
				function ce(e, t, n) {
					var r = e.childNodes || [], a = t.childNodes || [];
					if (t.nodeType === B.DOCUMENT_FRAGMENT_NODE) {
						var o = a.filter(ae);
						if (o.length > 1 || i(a, K)) throw new j(O, "More than one element or text in fragment");
						if (o.length === 1 && !q(e, n)) throw new j(O, "Element in fragment can not be inserted before doctype");
					}
					if (ae(t) && !q(e, n)) throw new j(O, "Only one element can be added and only after doctype");
					if (ie(t)) {
						if (i(r, ie)) throw new j(O, "Only one doctype is allowed");
						var s = i(r, ae);
						if (n && r.indexOf(s) < r.indexOf(n)) throw new j(O, "Doctype can only be inserted before an element");
						if (!n && s) throw new j(O, "Doctype can not be appended since element is present");
					}
				}
				function le(e, t, n) {
					var r = e.childNodes || [], a = t.childNodes || [];
					if (t.nodeType === B.DOCUMENT_FRAGMENT_NODE) {
						var o = a.filter(ae);
						if (o.length > 1 || i(a, K)) throw new j(O, "More than one element or text in fragment");
						if (o.length === 1 && !oe(e, n)) throw new j(O, "Element in fragment can not be inserted before doctype");
					}
					if (ae(t) && !oe(e, n)) throw new j(O, "Only one element can be added and only after doctype");
					if (ie(t)) {
						function e(e) {
							return ie(e) && e !== n;
						}
						if (i(r, e)) throw new j(O, "Only one doctype is allowed");
						var s = i(r, ae);
						if (n && r.indexOf(s) < r.indexOf(n)) throw new j(O, "Doctype can only be inserted before an element");
					}
				}
				function ue(e, t, n, r) {
					se(e, t, n), e.nodeType === B.DOCUMENT_NODE && (r || ce)(e, t, n);
					var i = t.parentNode;
					if (i && i.removeChild(t), t.nodeType === w) {
						var a = t.firstChild;
						if (a == null) return t;
						var o = t.lastChild;
					} else a = o = t;
					var s = n ? n.previousSibling : e.lastChild;
					a.previousSibling = s, o.nextSibling = n, s ? s.nextSibling = a : e.firstChild = a, n == null ? e.lastChild = o : n.previousSibling = o;
					do
						a.parentNode = e;
					while (a !== o && (a = a.nextSibling));
					return te(e.ownerDocument || e, e), t.nodeType == w && (t.firstChild = t.lastChild = null), t;
				}
				function de(e, t) {
					return t.parentNode && t.parentNode.removeChild(t), t.parentNode = e, t.previousSibling = e.lastChild, t.nextSibling = null, t.previousSibling ? t.previousSibling.nextSibling = t : e.firstChild = t, e.lastChild = t, te(e.ownerDocument, e, t), t;
				}
				U.prototype = {
					nodeName: "#document",
					nodeType: S,
					doctype: null,
					documentElement: null,
					_inc: 1,
					insertBefore: function(e, t) {
						if (e.nodeType == w) {
							for (var n = e.firstChild; n;) {
								var r = n.nextSibling;
								this.insertBefore(n, t), n = r;
							}
							return e;
						}
						return ue(this, e, t), e.ownerDocument = this, this.documentElement === null && e.nodeType === m && (this.documentElement = e), e;
					},
					removeChild: function(e) {
						return this.documentElement == e && (this.documentElement = null), G(this, e);
					},
					replaceChild: function(e, t) {
						ue(this, e, t, le), e.ownerDocument = this, t && this.removeChild(t), ae(e) && (this.documentElement = e);
					},
					importNode: function(e, t) {
						return De(this, e, t);
					},
					getElementById: function(e) {
						var t = null;
						return H(this.documentElement, function(n) {
							if (n.nodeType == m && n.getAttribute("id") == e) return t = n, !0;
						}), t;
					},
					getElementsByClassName: function(e) {
						var t = l(e);
						return new N(this, function(n) {
							var r = [];
							return t.length > 0 && H(n.documentElement, function(i) {
								if (i !== n && i.nodeType === m) {
									var a = i.getAttribute("class");
									if (a) {
										var o = e === a;
										if (!o) {
											var s = l(a);
											o = t.every(u(s));
										}
										o && r.push(i);
									}
								}
							}), r;
						});
					},
					createElement: function(e) {
						var t = new fe();
						t.ownerDocument = this, t.nodeName = e, t.tagName = e, t.localName = e, t.childNodes = new M();
						var n = t.attributes = new F();
						return n._ownerElement = t, t;
					},
					createDocumentFragment: function() {
						var e = new be();
						return e.ownerDocument = this, e.childNodes = new M(), e;
					},
					createTextNode: function(e) {
						var t = new me();
						return t.ownerDocument = this, t.appendData(e), t;
					},
					createComment: function(e) {
						var t = new Y();
						return t.ownerDocument = this, t.appendData(e), t;
					},
					createCDATASection: function(e) {
						var t = new he();
						return t.ownerDocument = this, t.appendData(e), t;
					},
					createProcessingInstruction: function(e, t) {
						var n = new xe();
						return n.ownerDocument = this, n.tagName = n.target = e, n.nodeValue = n.data = t, n;
					},
					createAttribute: function(e) {
						var t = new J();
						return t.ownerDocument = this, t.name = e, t.nodeName = e, t.localName = e, t.specified = !0, t;
					},
					createEntityReference: function(e) {
						var t = new ye();
						return t.ownerDocument = this, t.nodeName = e, t;
					},
					createElementNS: function(e, t) {
						var n = new fe(), r = t.split(":"), i = n.attributes = new F();
						return n.childNodes = new M(), n.ownerDocument = this, n.nodeName = t, n.tagName = t, n.namespaceURI = e, r.length == 2 ? (n.prefix = r[0], n.localName = r[1]) : n.localName = t, i._ownerElement = n, n;
					},
					createAttributeNS: function(e, t) {
						var n = new J(), r = t.split(":");
						return n.ownerDocument = this, n.nodeName = t, n.name = t, n.namespaceURI = e, n.specified = !0, r.length == 2 ? (n.prefix = r[0], n.localName = r[1]) : n.localName = t, n;
					}
				}, f(U, B);
				function fe() {
					this._nsMap = {};
				}
				fe.prototype = {
					nodeType: m,
					hasAttribute: function(e) {
						return this.getAttributeNode(e) != null;
					},
					getAttribute: function(e) {
						var t = this.getAttributeNode(e);
						return t && t.value || "";
					},
					getAttributeNode: function(e) {
						return this.attributes.getNamedItem(e);
					},
					setAttribute: function(e, t) {
						var n = this.ownerDocument.createAttribute(e);
						n.value = n.nodeValue = "" + t, this.setAttributeNode(n);
					},
					removeAttribute: function(e) {
						var t = this.getAttributeNode(e);
						t && this.removeAttributeNode(t);
					},
					appendChild: function(e) {
						return e.nodeType === w ? this.insertBefore(e, null) : de(this, e);
					},
					setAttributeNode: function(e) {
						return this.attributes.setNamedItem(e);
					},
					setAttributeNodeNS: function(e) {
						return this.attributes.setNamedItemNS(e);
					},
					removeAttributeNode: function(e) {
						return this.attributes.removeNamedItem(e.nodeName);
					},
					removeAttributeNS: function(e, t) {
						var n = this.getAttributeNodeNS(e, t);
						n && this.removeAttributeNode(n);
					},
					hasAttributeNS: function(e, t) {
						return this.getAttributeNodeNS(e, t) != null;
					},
					getAttributeNS: function(e, t) {
						var n = this.getAttributeNodeNS(e, t);
						return n && n.value || "";
					},
					setAttributeNS: function(e, t, n) {
						var r = this.ownerDocument.createAttributeNS(e, t);
						r.value = r.nodeValue = "" + n, this.setAttributeNode(r);
					},
					getAttributeNodeNS: function(e, t) {
						return this.attributes.getNamedItemNS(e, t);
					},
					getElementsByTagName: function(e) {
						return new N(this, function(t) {
							var n = [];
							return H(t, function(r) {
								r !== t && r.nodeType == m && (e === "*" || r.tagName == e) && n.push(r);
							}), n;
						});
					},
					getElementsByTagNameNS: function(e, t) {
						return new N(this, function(n) {
							var r = [];
							return H(n, function(i) {
								i !== n && i.nodeType === m && (e === "*" || i.namespaceURI === e) && (t === "*" || i.localName == t) && r.push(i);
							}), r;
						});
					}
				}, U.prototype.getElementsByTagName = fe.prototype.getElementsByTagName, U.prototype.getElementsByTagNameNS = fe.prototype.getElementsByTagNameNS, f(fe, B);
				function J() {}
				J.prototype.nodeType = h, f(J, B);
				function pe() {}
				pe.prototype = {
					data: "",
					substringData: function(e, t) {
						return this.data.substring(e, e + t);
					},
					appendData: function(e) {
						e = this.data + e, this.nodeValue = this.data = e, this.length = e.length;
					},
					insertData: function(e, t) {
						this.replaceData(e, 0, t);
					},
					appendChild: function(e) {
						throw Error(D[O]);
					},
					deleteData: function(e, t) {
						this.replaceData(e, t, "");
					},
					replaceData: function(e, t, n) {
						var r = this.data.substring(0, e), i = this.data.substring(e + t);
						n = r + n + i, this.nodeValue = this.data = n, this.length = n.length;
					}
				}, f(pe, B);
				function me() {}
				me.prototype = {
					nodeName: "#text",
					nodeType: g,
					splitText: function(e) {
						var t = this.data, n = t.substring(e);
						t = t.substring(0, e), this.data = this.nodeValue = t, this.length = t.length;
						var r = this.ownerDocument.createTextNode(n);
						return this.parentNode && this.parentNode.insertBefore(r, this.nextSibling), r;
					}
				}, f(me, pe);
				function Y() {}
				Y.prototype = {
					nodeName: "#comment",
					nodeType: x
				}, f(Y, pe);
				function he() {}
				he.prototype = {
					nodeName: "#cdata-section",
					nodeType: _
				}, f(he, pe);
				function ge() {}
				ge.prototype.nodeType = C, f(ge, B);
				function _e() {}
				_e.prototype.nodeType = T, f(_e, B);
				function ve() {}
				ve.prototype.nodeType = y, f(ve, B);
				function ye() {}
				ye.prototype.nodeType = v, f(ye, B);
				function be() {}
				be.prototype.nodeName = "#document-fragment", be.prototype.nodeType = w, f(be, B);
				function xe() {}
				xe.prototype.nodeType = b, f(xe, B);
				function Se() {}
				Se.prototype.serializeToString = function(e, t, n) {
					return Ce.call(e, t, n);
				}, B.prototype.toString = Ce;
				function Ce(e, t) {
					var n = [], r = this.nodeType == 9 && this.documentElement || this, i = r.prefix, a = r.namespaceURI;
					if (a && i == null) {
						var i = r.lookupPrefix(a);
						if (i == null) var o = [{
							namespace: a,
							prefix: null
						}];
					}
					return Ee(this, n, e, t, o), n.join("");
				}
				function we(e, t, n) {
					var r = e.prefix || "", i = e.namespaceURI;
					if (!i || r === "xml" && i === a.XML || i === a.XMLNS) return !1;
					for (var o = n.length; o--;) {
						var s = n[o];
						if (s.prefix === r) return s.namespace !== i;
					}
					return !0;
				}
				function Te(e, t, n) {
					e.push(" ", t, "=\"", n.replace(/[<>&"\t\n\r]/g, V), "\"");
				}
				function Ee(e, t, n, r, i) {
					if (i ||= [], r) {
						if (e = r(e), e) {
							if (typeof e == "string") {
								t.push(e);
								return;
							}
						} else return;
					}
					switch (e.nodeType) {
						case m:
							var o = e.attributes, s = o.length, c = e.firstChild, l = e.tagName;
							n = a.isHTML(e.namespaceURI) || n;
							var u = l;
							if (!n && !e.prefix && e.namespaceURI) {
								for (var d, f = 0; f < o.length; f++) if (o.item(f).name === "xmlns") {
									d = o.item(f).value;
									break;
								}
								if (!d) for (var p = i.length - 1; p >= 0; p--) {
									var y = i[p];
									if (y.prefix === "" && y.namespace === e.namespaceURI) {
										d = y.namespace;
										break;
									}
								}
								if (d !== e.namespaceURI) for (var p = i.length - 1; p >= 0; p--) {
									var y = i[p];
									if (y.namespace === e.namespaceURI) {
										y.prefix && (u = y.prefix + ":" + l);
										break;
									}
								}
							}
							t.push("<", u);
							for (var T = 0; T < s; T++) {
								var E = o.item(T);
								E.prefix == "xmlns" ? i.push({
									prefix: E.localName,
									namespace: E.value
								}) : E.nodeName == "xmlns" && i.push({
									prefix: "",
									namespace: E.value
								});
							}
							for (var T = 0; T < s; T++) {
								var E = o.item(T);
								if (we(E, n, i)) {
									var D = E.prefix || "", O = E.namespaceURI;
									Te(t, D ? "xmlns:" + D : "xmlns", O), i.push({
										prefix: D,
										namespace: O
									});
								}
								Ee(E, t, n, r, i);
							}
							if (l === u && we(e, n, i)) {
								var D = e.prefix || "", O = e.namespaceURI;
								Te(t, D ? "xmlns:" + D : "xmlns", O), i.push({
									prefix: D,
									namespace: O
								});
							}
							if (c || n && !/^(?:meta|link|img|br|hr|input)$/i.test(l)) {
								if (t.push(">"), n && /^script$/i.test(l)) for (; c;) c.data ? t.push(c.data) : Ee(c, t, n, r, i.slice()), c = c.nextSibling;
								else for (; c;) Ee(c, t, n, r, i.slice()), c = c.nextSibling;
								t.push("</", u, ">");
							} else t.push("/>");
							return;
						case S:
						case w:
							for (var c = e.firstChild; c;) Ee(c, t, n, r, i.slice()), c = c.nextSibling;
							return;
						case h: return Te(t, e.name, e.value);
						case g: return t.push(e.data.replace(/[<&>]/g, V));
						case _: return t.push("<![CDATA[", e.data, "]]>");
						case x: return t.push("<!--", e.data, "-->");
						case C:
							var k = e.publicId, A = e.systemId;
							if (t.push("<!DOCTYPE ", e.name), k) t.push(" PUBLIC ", k), A && A != "." && t.push(" ", A), t.push(">");
							else if (A && A != ".") t.push(" SYSTEM ", A, ">");
							else {
								var j = e.internalSubset;
								j && t.push(" [", j, "]"), t.push(">");
							}
							return;
						case b: return t.push("<?", e.target, " ", e.data, "?>");
						case v: return t.push("&", e.nodeName, ";");
						default: t.push("??", e.nodeName);
					}
				}
				function De(e, t, n) {
					var r;
					switch (t.nodeType) {
						case m: r = t.cloneNode(!1), r.ownerDocument = e;
						case w: break;
						case h: n = !0;
					}
					if (r ||= t.cloneNode(!1), r.ownerDocument = e, r.parentNode = null, n) for (var i = t.firstChild; i;) r.appendChild(De(e, i, n)), i = i.nextSibling;
					return r;
				}
				function Oe(e, t, n) {
					var r = new t.constructor();
					for (var i in t) if (Object.prototype.hasOwnProperty.call(t, i)) {
						var a = t[i];
						typeof a != "object" && a != r[i] && (r[i] = a);
					}
					switch (t.childNodes && (r.childNodes = new M()), r.ownerDocument = e, r.nodeType) {
						case m:
							var o = t.attributes, s = r.attributes = new F(), c = o.length;
							s._ownerElement = r;
							for (var l = 0; l < c; l++) r.setAttributeNode(Oe(e, o.item(l), !0));
							break;
						case h: n = !0;
					}
					if (n) for (var u = t.firstChild; u;) r.appendChild(Oe(e, u, n)), u = u.nextSibling;
					return r;
				}
				function ke(e, t, n) {
					e[t] = n;
				}
				try {
					if (Object.defineProperty) {
						Object.defineProperty(N.prototype, "length", { get: function() {
							return P(this), this.$$length;
						} }), Object.defineProperty(B.prototype, "textContent", {
							get: function() {
								return e(this);
							},
							set: function(e) {
								switch (this.nodeType) {
									case m:
									case w:
										for (; this.firstChild;) this.removeChild(this.firstChild);
										(e || String(e)) && this.appendChild(this.ownerDocument.createTextNode(e));
										break;
									default: this.data = e, this.value = e, this.nodeValue = e;
								}
							}
						});
						function e(t) {
							switch (t.nodeType) {
								case m:
								case w:
									var n = [];
									for (t = t.firstChild; t;) t.nodeType !== 7 && t.nodeType !== 8 && n.push(e(t)), t = t.nextSibling;
									return n.join("");
								default: return t.nodeValue;
							}
						}
						ke = function(e, t, n) {
							e["$$" + t] = n;
						};
					}
				} catch {}
				n.DocumentType = ge, n.DOMException = j, n.DOMImplementation = z, n.Element = fe, n.Node = B, n.NodeList = M, n.XMLSerializer = Se;
			}, { "./conventions": 41 }],
			44: [function(e, t, n) {
				var r = e("./conventions").freeze;
				n.XML_ENTITIES = r({
					amp: "&",
					apos: "'",
					gt: ">",
					lt: "<",
					quot: "\""
				}), n.HTML_ENTITIES = r({
					lt: "<",
					gt: ">",
					amp: "&",
					quot: "\"",
					apos: "'",
					Agrave: "À",
					Aacute: "Á",
					Acirc: "Â",
					Atilde: "Ã",
					Auml: "Ä",
					Aring: "Å",
					AElig: "Æ",
					Ccedil: "Ç",
					Egrave: "È",
					Eacute: "É",
					Ecirc: "Ê",
					Euml: "Ë",
					Igrave: "Ì",
					Iacute: "Í",
					Icirc: "Î",
					Iuml: "Ï",
					ETH: "Ð",
					Ntilde: "Ñ",
					Ograve: "Ò",
					Oacute: "Ó",
					Ocirc: "Ô",
					Otilde: "Õ",
					Ouml: "Ö",
					Oslash: "Ø",
					Ugrave: "Ù",
					Uacute: "Ú",
					Ucirc: "Û",
					Uuml: "Ü",
					Yacute: "Ý",
					THORN: "Þ",
					szlig: "ß",
					agrave: "à",
					aacute: "á",
					acirc: "â",
					atilde: "ã",
					auml: "ä",
					aring: "å",
					aelig: "æ",
					ccedil: "ç",
					egrave: "è",
					eacute: "é",
					ecirc: "ê",
					euml: "ë",
					igrave: "ì",
					iacute: "í",
					icirc: "î",
					iuml: "ï",
					eth: "ð",
					ntilde: "ñ",
					ograve: "ò",
					oacute: "ó",
					ocirc: "ô",
					otilde: "õ",
					ouml: "ö",
					oslash: "ø",
					ugrave: "ù",
					uacute: "ú",
					ucirc: "û",
					uuml: "ü",
					yacute: "ý",
					thorn: "þ",
					yuml: "ÿ",
					nbsp: "\xA0",
					iexcl: "¡",
					cent: "¢",
					pound: "£",
					curren: "¤",
					yen: "¥",
					brvbar: "¦",
					sect: "§",
					uml: "¨",
					copy: "©",
					ordf: "ª",
					laquo: "«",
					not: "¬",
					shy: "­­",
					reg: "®",
					macr: "¯",
					deg: "°",
					plusmn: "±",
					sup2: "²",
					sup3: "³",
					acute: "´",
					micro: "µ",
					para: "¶",
					middot: "·",
					cedil: "¸",
					sup1: "¹",
					ordm: "º",
					raquo: "»",
					frac14: "¼",
					frac12: "½",
					frac34: "¾",
					iquest: "¿",
					times: "×",
					divide: "÷",
					forall: "∀",
					part: "∂",
					exist: "∃",
					empty: "∅",
					nabla: "∇",
					isin: "∈",
					notin: "∉",
					ni: "∋",
					prod: "∏",
					sum: "∑",
					minus: "−",
					lowast: "∗",
					radic: "√",
					prop: "∝",
					infin: "∞",
					ang: "∠",
					and: "∧",
					or: "∨",
					cap: "∩",
					cup: "∪",
					int: "∫",
					there4: "∴",
					sim: "∼",
					cong: "≅",
					asymp: "≈",
					ne: "≠",
					equiv: "≡",
					le: "≤",
					ge: "≥",
					sub: "⊂",
					sup: "⊃",
					nsub: "⊄",
					sube: "⊆",
					supe: "⊇",
					oplus: "⊕",
					otimes: "⊗",
					perp: "⊥",
					sdot: "⋅",
					Alpha: "Α",
					Beta: "Β",
					Gamma: "Γ",
					Delta: "Δ",
					Epsilon: "Ε",
					Zeta: "Ζ",
					Eta: "Η",
					Theta: "Θ",
					Iota: "Ι",
					Kappa: "Κ",
					Lambda: "Λ",
					Mu: "Μ",
					Nu: "Ν",
					Xi: "Ξ",
					Omicron: "Ο",
					Pi: "Π",
					Rho: "Ρ",
					Sigma: "Σ",
					Tau: "Τ",
					Upsilon: "Υ",
					Phi: "Φ",
					Chi: "Χ",
					Psi: "Ψ",
					Omega: "Ω",
					alpha: "α",
					beta: "β",
					gamma: "γ",
					delta: "δ",
					epsilon: "ε",
					zeta: "ζ",
					eta: "η",
					theta: "θ",
					iota: "ι",
					kappa: "κ",
					lambda: "λ",
					mu: "μ",
					nu: "ν",
					xi: "ξ",
					omicron: "ο",
					pi: "π",
					rho: "ρ",
					sigmaf: "ς",
					sigma: "σ",
					tau: "τ",
					upsilon: "υ",
					phi: "φ",
					chi: "χ",
					psi: "ψ",
					omega: "ω",
					thetasym: "ϑ",
					upsih: "ϒ",
					piv: "ϖ",
					OElig: "Œ",
					oelig: "œ",
					Scaron: "Š",
					scaron: "š",
					Yuml: "Ÿ",
					fnof: "ƒ",
					circ: "ˆ",
					tilde: "˜",
					ensp: " ",
					emsp: " ",
					thinsp: " ",
					zwnj: "‌",
					zwj: "‍",
					lrm: "‎",
					rlm: "‏",
					ndash: "–",
					mdash: "—",
					lsquo: "‘",
					rsquo: "’",
					sbquo: "‚",
					ldquo: "“",
					rdquo: "”",
					bdquo: "„",
					dagger: "†",
					Dagger: "‡",
					bull: "•",
					hellip: "…",
					permil: "‰",
					prime: "′",
					Prime: "″",
					lsaquo: "‹",
					rsaquo: "›",
					oline: "‾",
					euro: "€",
					trade: "™",
					larr: "←",
					uarr: "↑",
					rarr: "→",
					darr: "↓",
					harr: "↔",
					crarr: "↵",
					lceil: "⌈",
					rceil: "⌉",
					lfloor: "⌊",
					rfloor: "⌋",
					loz: "◊",
					spades: "♠",
					clubs: "♣",
					hearts: "♥",
					diams: "♦"
				}), n.entityMap = n.HTML_ENTITIES;
			}, { "./conventions": 41 }],
			45: [function(e, t, n) {
				var r = e("./dom");
				n.DOMImplementation = r.DOMImplementation, n.XMLSerializer = r.XMLSerializer, n.DOMParser = e("./dom-parser").DOMParser;
			}, {
				"./dom": 43,
				"./dom-parser": 42
			}],
			46: [function(e, t, n) {
				var r = e("./conventions").NAMESPACE, i = /[A-Z_a-z\xC0-\xD6\xD8-\xF6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/, a = RegExp("[\\-\\.0-9" + i.source.slice(1, -1) + "\\u00B7\\u0300-\\u036F\\u203F-\\u2040]"), o = RegExp("^" + i.source + a.source + "*(?::" + i.source + a.source + "*)?$"), s = 0, c = 1, l = 2, u = 3, d = 4, f = 5, p = 6, m = 7;
				function h(e, t) {
					this.message = e, this.locator = t, Error.captureStackTrace && Error.captureStackTrace(this, h);
				}
				h.prototype = /* @__PURE__ */ Error(), h.prototype.name = h.name;
				function g() {}
				g.prototype = { parse: function(e, t, n) {
					var r = this.domBuilder;
					r.startDocument(), C(t, t = {}), _(e, t, n, r, this.errorHandler), r.endDocument();
				} };
				function _(e, t, n, i, a) {
					function o(e) {
						if (e > 65535) {
							e -= 65536;
							var t = 55296 + (e >> 10), n = 56320 + (e & 1023);
							return String.fromCharCode(t, n);
						}
						return String.fromCharCode(e);
					}
					function s(e) {
						var t = e.slice(1, -1);
						return Object.hasOwnProperty.call(n, t) ? n[t] : t.charAt(0) === "#" ? o(parseInt(t.substr(1).replace("x", "0x"))) : (a.error("entity not found:" + e), e);
					}
					function c(t) {
						if (t > _) {
							var n = e.substring(_, t).replace(/&#?\w+;/g, s);
							p && l(_), i.characters(n, 0, t - _), _ = t;
						}
					}
					function l(t, n) {
						for (; t >= d && (n = f.exec(e));) u = n.index, d = u + n[0].length, p.lineNumber++;
						p.columnNumber = t - u + 1;
					}
					for (var u = 0, d = 0, f = /.*(?:\r\n?|\n)|.*$/g, p = i.locator, m = [{ currentNSMap: t }], g = {}, _ = 0;;) {
						try {
							var C = e.indexOf("<", _);
							if (C < 0) {
								if (!e.substr(_).match(/^\s*$/)) {
									var D = i.doc, O = D.createTextNode(e.substr(_));
									D.appendChild(O), i.currentElement = O;
								}
								return;
							}
							switch (C > _ && c(C), e.charAt(C + 1)) {
								case "/":
									var k = e.indexOf(">", C + 3), A = e.substring(C + 2, k).replace(/[ \t\n\r]+$/g, ""), j = m.pop();
									k < 0 ? (A = e.substring(C + 2).replace(/[\s<].*/, ""), a.error("end tag name: " + A + " is not complete:" + j.tagName), k = C + 1 + A.length) : A.match(/\s</) && (A = A.replace(/[\s<].*/, ""), a.error("end tag name: " + A + " maybe not complete"), k = C + 1 + A.length);
									var M = j.localNSMap, N = j.tagName == A;
									if (N || j.tagName && j.tagName.toLowerCase() == A.toLowerCase()) {
										if (i.endElement(j.uri, j.localName, A), M) for (var P in M) Object.prototype.hasOwnProperty.call(M, P) && i.endPrefixMapping(P);
										N || a.fatalError("end tag name: " + A + " is not match the current start tagName:" + j.tagName);
									} else m.push(j);
									k++;
									break;
								case "?":
									p && l(C), k = T(e, C, i);
									break;
								case "!":
									p && l(C), k = w(e, C, i, a);
									break;
								default:
									p && l(C);
									var F = new E(), I = m[m.length - 1].currentNSMap, k = y(e, C, F, I, s, a), L = F.length;
									if (!F.closed && S(e, k, F.tagName, g) && (F.closed = !0, n.nbsp || a.warning("unclosed xml attribute")), p && L) {
										for (var R = v(p, {}), z = 0; z < L; z++) {
											var B = F[z];
											l(B.offset), B.locator = v(p, {});
										}
										i.locator = R, b(F, i, I) && m.push(F), i.locator = p;
									} else b(F, i, I) && m.push(F);
									r.isHTML(F.uri) && !F.closed ? k = x(e, k, F.tagName, s, i) : k++;
							}
						} catch (e) {
							if (e instanceof h) throw e;
							a.error("element parse error: " + e), k = -1;
						}
						k > _ ? _ = k : c(Math.max(C, _) + 1);
					}
				}
				function v(e, t) {
					return t.lineNumber = e.lineNumber, t.columnNumber = e.columnNumber, t;
				}
				function y(e, t, n, i, a, o) {
					function h(e, t, r) {
						n.attributeNames.hasOwnProperty(e) && o.fatalError("Attribute " + e + " redefined"), n.addValue(e, t.replace(/[\t\n\r]/g, " ").replace(/&#?\w+;/g, a), r);
					}
					for (var g, _, v = ++t, y = s;;) {
						var b = e.charAt(v);
						switch (b) {
							case "=":
								if (y === c) g = e.slice(t, v), y = u;
								else if (y === l) y = u;
								else throw Error("attribute equal must after attrName");
								break;
							case "'":
							case "\"":
								if (y === u || y === c) {
									if (y === c && (o.warning("attribute value must after \"=\""), g = e.slice(t, v)), t = v + 1, v = e.indexOf(b, t), v > 0) _ = e.slice(t, v), h(g, _, t - 1), y = f;
									else throw Error("attribute value no end '" + b + "' match");
								} else if (y == d) _ = e.slice(t, v), h(g, _, t), o.warning("attribute \"" + g + "\" missed start quot(" + b + ")!!"), t = v + 1, y = f;
								else throw Error("attribute value must after \"=\"");
								break;
							case "/":
								switch (y) {
									case s: n.setTagName(e.slice(t, v));
									case f:
									case p:
									case m: y = m, n.closed = !0;
									case d:
									case c:
									case l: break;
									default: throw Error("attribute invalid close char('/')");
								}
								break;
							case "": return o.error("unexpected end of input"), y == s && n.setTagName(e.slice(t, v)), v;
							case ">":
								switch (y) {
									case s: n.setTagName(e.slice(t, v));
									case f:
									case p:
									case m: break;
									case d:
									case c: _ = e.slice(t, v), _.slice(-1) === "/" && (n.closed = !0, _ = _.slice(0, -1));
									case l:
										y === l && (_ = g), y == d ? (o.warning("attribute \"" + _ + "\" missed quot(\")!"), h(g, _, t)) : ((!r.isHTML(i[""]) || !_.match(/^(?:disabled|checked|selected)$/i)) && o.warning("attribute \"" + _ + "\" missed value!! \"" + _ + "\" instead!!"), h(_, _, t));
										break;
									case u: throw Error("attribute value missed!!");
								}
								return v;
							case "": b = " ";
							default: if (b <= " ") switch (y) {
								case s:
									n.setTagName(e.slice(t, v)), y = p;
									break;
								case c:
									g = e.slice(t, v), y = l;
									break;
								case d:
									var _ = e.slice(t, v);
									o.warning("attribute \"" + _ + "\" missed quot(\")!!"), h(g, _, t);
								case f: y = p;
							}
							else switch (y) {
								case l:
									n.tagName, (!r.isHTML(i[""]) || !g.match(/^(?:disabled|checked|selected)$/i)) && o.warning("attribute \"" + g + "\" missed value!! \"" + g + "\" instead2!!"), h(g, g, t), t = v, y = c;
									break;
								case f: o.warning("attribute space is required\"" + g + "\"!!");
								case p:
									y = c, t = v;
									break;
								case u:
									y = d, t = v;
									break;
								case m: throw Error("elements closed character '/' and '>' must be connected to");
							}
						}
						v++;
					}
				}
				function b(e, t, n) {
					for (var i = e.tagName, a = null, o = e.length; o--;) {
						var s = e[o], c = s.qName, l = s.value, u = c.indexOf(":");
						if (u > 0) var d = s.prefix = c.slice(0, u), f = c.slice(u + 1), p = d === "xmlns" && f;
						else f = c, d = null, p = c === "xmlns" && "";
						s.localName = f, p !== !1 && (a ?? (a = {}, C(n, n = {})), n[p] = a[p] = l, s.uri = r.XMLNS, t.startPrefixMapping(p, l));
					}
					for (var o = e.length; o--;) {
						s = e[o];
						var d = s.prefix;
						d && (d === "xml" && (s.uri = r.XML), d !== "xmlns" && (s.uri = n[d || ""]));
					}
					var u = i.indexOf(":");
					u > 0 ? (d = e.prefix = i.slice(0, u), f = e.localName = i.slice(u + 1)) : (d = null, f = e.localName = i);
					var m = e.uri = n[d || ""];
					if (t.startElement(m, f, i, e), e.closed) {
						if (t.endElement(m, f, i), a) for (d in a) Object.prototype.hasOwnProperty.call(a, d) && t.endPrefixMapping(d);
					} else return e.currentNSMap = n, e.localNSMap = a, !0;
				}
				function x(e, t, n, r, i) {
					if (/^(?:script|textarea)$/i.test(n)) {
						var a = e.indexOf("</" + n + ">", t), o = e.substring(t + 1, a);
						if (/[&<]/.test(o)) return /^script$/i.test(n) ? (i.characters(o, 0, o.length), a) : (o = o.replace(/&#?\w+;/g, r), i.characters(o, 0, o.length), a);
					}
					return t + 1;
				}
				function S(e, t, n, r) {
					var i = r[n];
					return i ?? (i = e.lastIndexOf("</" + n + ">"), i < t && (i = e.lastIndexOf("</" + n)), r[n] = i), i < t;
				}
				function C(e, t) {
					for (var n in e) Object.prototype.hasOwnProperty.call(e, n) && (t[n] = e[n]);
				}
				function w(e, t, n, r) {
					switch (e.charAt(t + 2)) {
						case "-":
							if (e.charAt(t + 3) === "-") {
								var i = e.indexOf("-->", t + 4);
								return i > t ? (n.comment(e, t + 4, i - t - 4), i + 3) : (r.error("Unclosed comment"), -1);
							}
							return -1;
						default:
							if (e.substr(t + 3, 6) == "CDATA[") {
								var i = e.indexOf("]]>", t + 9);
								return n.startCDATA(), n.characters(e, t + 9, i - t - 9), n.endCDATA(), i + 3;
							}
							var a = D(e, t), o = a.length;
							if (o > 1 && /!doctype/i.test(a[0][0])) {
								var s = a[1][0], c = !1, l = !1;
								o > 3 && (/^public$/i.test(a[2][0]) ? (c = a[3][0], l = o > 4 && a[4][0]) : /^system$/i.test(a[2][0]) && (l = a[3][0]));
								var u = a[o - 1];
								return n.startDTD(s, c, l), n.endDTD(), u.index + u[0].length;
							}
					}
					return -1;
				}
				function T(e, t, n) {
					var r = e.indexOf("?>", t);
					if (r) {
						var i = e.substring(t, r).match(/^<\?(\S*)\s*([\s\S]*?)\s*$/);
						return i ? (i[0].length, n.processingInstruction(i[1], i[2]), r + 2) : -1;
					}
					return -1;
				}
				function E() {
					this.attributeNames = {};
				}
				E.prototype = {
					setTagName: function(e) {
						if (!o.test(e)) throw Error("invalid tagName:" + e);
						this.tagName = e;
					},
					addValue: function(e, t, n) {
						if (!o.test(e)) throw Error("invalid attribute:" + e);
						this.attributeNames[e] = this.length, this[this.length++] = {
							qName: e,
							value: t,
							offset: n
						};
					},
					length: 0,
					getLocalName: function(e) {
						return this[e].localName;
					},
					getLocator: function(e) {
						return this[e].locator;
					},
					getQName: function(e) {
						return this[e].qName;
					},
					getURI: function(e) {
						return this[e].uri;
					},
					getValue: function(e) {
						return this[e].value;
					}
				};
				function D(e, t) {
					var n, r = [], i = /'[^']+'|"[^"]+"|[^\s<>\/=]+=?|(\/?\s*>|<)/g;
					for (i.lastIndex = t, i.exec(e); n = i.exec(e);) if (r.push(n), n[1]) return r;
				}
				n.XMLReader = g, n.ParseError = h;
			}, { "./conventions": 41 }],
			47: [function(e, t, n) {
				n.byteLength = u, n.toByteArray = f, n.fromByteArray = h;
				for (var r = [], i = [], a = typeof Uint8Array < "u" ? Uint8Array : Array, o = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", s = 0, c = o.length; s < c; ++s) r[s] = o[s], i[o.charCodeAt(s)] = s;
				i[45] = 62, i[95] = 63;
				function l(e) {
					var t = e.length;
					if (t % 4 > 0) throw Error("Invalid string. Length must be a multiple of 4");
					var n = e.indexOf("=");
					n === -1 && (n = t);
					var r = n === t ? 0 : 4 - n % 4;
					return [n, r];
				}
				function u(e) {
					var t = l(e), n = t[0], r = t[1];
					return (n + r) * 3 / 4 - r;
				}
				function d(e, t, n) {
					return (t + n) * 3 / 4 - n;
				}
				function f(e) {
					for (var t, n = l(e), r = n[0], o = n[1], s = new a(d(e, r, o)), c = 0, u = o > 0 ? r - 4 : r, f = 0; f < u; f += 4) t = i[e.charCodeAt(f)] << 18 | i[e.charCodeAt(f + 1)] << 12 | i[e.charCodeAt(f + 2)] << 6 | i[e.charCodeAt(f + 3)], s[c++] = t >> 16 & 255, s[c++] = t >> 8 & 255, s[c++] = t & 255;
					return o === 2 && (t = i[e.charCodeAt(f)] << 2 | i[e.charCodeAt(f + 1)] >> 4, s[c++] = t & 255), o === 1 && (t = i[e.charCodeAt(f)] << 10 | i[e.charCodeAt(f + 1)] << 4 | i[e.charCodeAt(f + 2)] >> 2, s[c++] = t >> 8 & 255, s[c++] = t & 255), s;
				}
				function p(e) {
					return r[e >> 18 & 63] + r[e >> 12 & 63] + r[e >> 6 & 63] + r[e & 63];
				}
				function m(e, t, n) {
					for (var r, i = [], a = t; a < n; a += 3) r = (e[a] << 16 & 16711680) + (e[a + 1] << 8 & 65280) + (e[a + 2] & 255), i.push(p(r));
					return i.join("");
				}
				function h(e) {
					for (var t, n = e.length, i = n % 3, a = [], o = 16383, s = 0, c = n - i; s < c; s += o) a.push(m(e, s, s + o > c ? c : s + o));
					return i === 1 ? (t = e[n - 1], a.push(r[t >> 2] + r[t << 4 & 63] + "==")) : i === 2 && (t = (e[n - 2] << 8) + e[n - 1], a.push(r[t >> 10] + r[t >> 4 & 63] + r[t << 2 & 63] + "=")), a.join("");
				}
			}, {}],
			48: [function(e, t, n) {
				(function(t) {
					var r = e("base64-js"), i = e("ieee754"), a = e("isarray");
					n.Buffer = l, n.SlowBuffer = y, n.INSPECT_MAX_BYTES = 50, l.TYPED_ARRAY_SUPPORT = t.TYPED_ARRAY_SUPPORT === void 0 ? o() : t.TYPED_ARRAY_SUPPORT, n.kMaxLength = s();
					function o() {
						try {
							var e = /* @__PURE__ */ new Uint8Array(1);
							return e.__proto__ = {
								__proto__: Uint8Array.prototype,
								foo: function() {
									return 42;
								}
							}, e.foo() === 42 && typeof e.subarray == "function" && e.subarray(1, 1).byteLength === 0;
						} catch {
							return !1;
						}
					}
					function s() {
						return l.TYPED_ARRAY_SUPPORT ? 2147483647 : 1073741823;
					}
					function c(e, t) {
						if (s() < t) throw RangeError("Invalid typed array length");
						return l.TYPED_ARRAY_SUPPORT ? (e = new Uint8Array(t), e.__proto__ = l.prototype) : (e === null && (e = new l(t)), e.length = t), e;
					}
					function l(e, t, n) {
						if (!l.TYPED_ARRAY_SUPPORT && !(this instanceof l)) return new l(e, t, n);
						if (typeof e == "number") {
							if (typeof t == "string") throw Error("If encoding is specified then the first argument must be a string");
							return p(this, e);
						}
						return u(this, e, t, n);
					}
					l.poolSize = 8192, l._augment = function(e) {
						return e.__proto__ = l.prototype, e;
					};
					function u(e, t, n, r) {
						if (typeof t == "number") throw TypeError("\"value\" argument must not be a number");
						return typeof ArrayBuffer < "u" && t instanceof ArrayBuffer ? g(e, t, n, r) : typeof t == "string" ? m(e, t, n) : _(e, t);
					}
					l.from = function(e, t, n) {
						return u(null, e, t, n);
					}, l.TYPED_ARRAY_SUPPORT && (l.prototype.__proto__ = Uint8Array.prototype, l.__proto__ = Uint8Array, typeof Symbol < "u" && Symbol.species && l[Symbol.species] === l && Object.defineProperty(l, Symbol.species, {
						value: null,
						configurable: !0
					}));
					function d(e) {
						if (typeof e != "number") throw TypeError("\"size\" argument must be a number");
						if (e < 0) throw RangeError("\"size\" argument must not be negative");
					}
					function f(e, t, n, r) {
						return d(t), t <= 0 || n === void 0 ? c(e, t) : typeof r == "string" ? c(e, t).fill(n, r) : c(e, t).fill(n);
					}
					l.alloc = function(e, t, n) {
						return f(null, e, t, n);
					};
					function p(e, t) {
						if (d(t), e = c(e, t < 0 ? 0 : v(t) | 0), !l.TYPED_ARRAY_SUPPORT) for (var n = 0; n < t; ++n) e[n] = 0;
						return e;
					}
					l.allocUnsafe = function(e) {
						return p(null, e);
					}, l.allocUnsafeSlow = function(e) {
						return p(null, e);
					};
					function m(e, t, n) {
						if ((typeof n != "string" || n === "") && (n = "utf8"), !l.isEncoding(n)) throw TypeError("\"encoding\" must be a valid string encoding");
						var r = b(t, n) | 0;
						e = c(e, r);
						var i = e.write(t, n);
						return i !== r && (e = e.slice(0, i)), e;
					}
					function h(e, t) {
						var n = t.length < 0 ? 0 : v(t.length) | 0;
						e = c(e, n);
						for (var r = 0; r < n; r += 1) e[r] = t[r] & 255;
						return e;
					}
					function g(e, t, n, r) {
						if (t.byteLength, n < 0 || t.byteLength < n) throw RangeError("'offset' is out of bounds");
						if (t.byteLength < n + (r || 0)) throw RangeError("'length' is out of bounds");
						return t = n === void 0 && r === void 0 ? new Uint8Array(t) : r === void 0 ? new Uint8Array(t, n) : new Uint8Array(t, n, r), l.TYPED_ARRAY_SUPPORT ? (e = t, e.__proto__ = l.prototype) : e = h(e, t), e;
					}
					function _(e, t) {
						if (l.isBuffer(t)) {
							var n = v(t.length) | 0;
							return e = c(e, n), e.length === 0 || t.copy(e, 0, 0, n), e;
						}
						if (t) {
							if (typeof ArrayBuffer < "u" && t.buffer instanceof ArrayBuffer || "length" in t) return typeof t.length != "number" || se(t.length) ? c(e, 0) : h(e, t);
							if (t.type === "Buffer" && a(t.data)) return h(e, t.data);
						}
						throw TypeError("First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.");
					}
					function v(e) {
						if (e >= s()) throw RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + s().toString(16) + " bytes");
						return e | 0;
					}
					function y(e) {
						return +e != e && (e = 0), l.alloc(+e);
					}
					l.isBuffer = function(e) {
						return !!(e != null && e._isBuffer);
					}, l.compare = function(e, t) {
						if (!l.isBuffer(e) || !l.isBuffer(t)) throw TypeError("Arguments must be Buffers");
						if (e === t) return 0;
						for (var n = e.length, r = t.length, i = 0, a = Math.min(n, r); i < a; ++i) if (e[i] !== t[i]) {
							n = e[i], r = t[i];
							break;
						}
						return n < r ? -1 : +(r < n);
					}, l.isEncoding = function(e) {
						switch (String(e).toLowerCase()) {
							case "hex":
							case "utf8":
							case "utf-8":
							case "ascii":
							case "latin1":
							case "binary":
							case "base64":
							case "ucs2":
							case "ucs-2":
							case "utf16le":
							case "utf-16le": return !0;
							default: return !1;
						}
					}, l.concat = function(e, t) {
						if (!a(e)) throw TypeError("\"list\" argument must be an Array of Buffers");
						if (e.length === 0) return l.alloc(0);
						var n;
						if (t === void 0) for (t = 0, n = 0; n < e.length; ++n) t += e[n].length;
						var r = l.allocUnsafe(t), i = 0;
						for (n = 0; n < e.length; ++n) {
							var o = e[n];
							if (!l.isBuffer(o)) throw TypeError("\"list\" argument must be an Array of Buffers");
							o.copy(r, i), i += o.length;
						}
						return r;
					};
					function b(e, t) {
						if (l.isBuffer(e)) return e.length;
						if (typeof ArrayBuffer < "u" && typeof ArrayBuffer.isView == "function" && (ArrayBuffer.isView(e) || e instanceof ArrayBuffer)) return e.byteLength;
						typeof e != "string" && (e = "" + e);
						var n = e.length;
						if (n === 0) return 0;
						for (var r = !1;;) switch (t) {
							case "ascii":
							case "latin1":
							case "binary": return n;
							case "utf8":
							case "utf-8":
							case void 0: return ie(e).length;
							case "ucs2":
							case "ucs-2":
							case "utf16le":
							case "utf-16le": return n * 2;
							case "hex": return n >>> 1;
							case "base64": return q(e).length;
							default:
								if (r) return ie(e).length;
								t = ("" + t).toLowerCase(), r = !0;
						}
					}
					l.byteLength = b;
					function x(e, t, n) {
						var r = !1;
						if ((t === void 0 || t < 0) && (t = 0), t > this.length || ((n === void 0 || n > this.length) && (n = this.length), n <= 0) || (n >>>= 0, t >>>= 0, n <= t)) return "";
						for (e ||= "utf8";;) switch (e) {
							case "hex": return L(this, t, n);
							case "utf8":
							case "utf-8": return M(this, t, n);
							case "ascii": return F(this, t, n);
							case "latin1":
							case "binary": return I(this, t, n);
							case "base64": return j(this, t, n);
							case "ucs2":
							case "ucs-2":
							case "utf16le":
							case "utf-16le": return R(this, t, n);
							default:
								if (r) throw TypeError("Unknown encoding: " + e);
								e = (e + "").toLowerCase(), r = !0;
						}
					}
					l.prototype._isBuffer = !0;
					function S(e, t, n) {
						var r = e[t];
						e[t] = e[n], e[n] = r;
					}
					l.prototype.swap16 = function() {
						var e = this.length;
						if (e % 2 != 0) throw RangeError("Buffer size must be a multiple of 16-bits");
						for (var t = 0; t < e; t += 2) S(this, t, t + 1);
						return this;
					}, l.prototype.swap32 = function() {
						var e = this.length;
						if (e % 4 != 0) throw RangeError("Buffer size must be a multiple of 32-bits");
						for (var t = 0; t < e; t += 4) S(this, t, t + 3), S(this, t + 1, t + 2);
						return this;
					}, l.prototype.swap64 = function() {
						var e = this.length;
						if (e % 8 != 0) throw RangeError("Buffer size must be a multiple of 64-bits");
						for (var t = 0; t < e; t += 8) S(this, t, t + 7), S(this, t + 1, t + 6), S(this, t + 2, t + 5), S(this, t + 3, t + 4);
						return this;
					}, l.prototype.toString = function() {
						var e = this.length | 0;
						return e === 0 ? "" : arguments.length === 0 ? M(this, 0, e) : x.apply(this, arguments);
					}, l.prototype.equals = function(e) {
						if (!l.isBuffer(e)) throw TypeError("Argument must be a Buffer");
						return this === e || l.compare(this, e) === 0;
					}, l.prototype.inspect = function() {
						var e = "", t = n.INSPECT_MAX_BYTES;
						return this.length > 0 && (e = this.toString("hex", 0, t).match(/.{2}/g).join(" "), this.length > t && (e += " ... ")), "<Buffer " + e + ">";
					}, l.prototype.compare = function(e, t, n, r, i) {
						if (!l.isBuffer(e)) throw TypeError("Argument must be a Buffer");
						if (t === void 0 && (t = 0), n === void 0 && (n = e ? e.length : 0), r === void 0 && (r = 0), i === void 0 && (i = this.length), t < 0 || n > e.length || r < 0 || i > this.length) throw RangeError("out of range index");
						if (r >= i && t >= n) return 0;
						if (r >= i) return -1;
						if (t >= n) return 1;
						if (t >>>= 0, n >>>= 0, r >>>= 0, i >>>= 0, this === e) return 0;
						for (var a = i - r, o = n - t, s = Math.min(a, o), c = this.slice(r, i), u = e.slice(t, n), d = 0; d < s; ++d) if (c[d] !== u[d]) {
							a = c[d], o = u[d];
							break;
						}
						return a < o ? -1 : +(o < a);
					};
					function C(e, t, n, r, i) {
						if (e.length === 0) return -1;
						if (typeof n == "string" ? (r = n, n = 0) : n > 2147483647 ? n = 2147483647 : n < -2147483648 && (n = -2147483648), n = +n, isNaN(n) && (n = i ? 0 : e.length - 1), n < 0 && (n = e.length + n), n >= e.length) {
							if (i) return -1;
							n = e.length - 1;
						} else if (n < 0) {
							if (i) n = 0;
							else return -1;
						}
						if (typeof t == "string" && (t = l.from(t, r)), l.isBuffer(t)) return t.length === 0 ? -1 : w(e, t, n, r, i);
						if (typeof t == "number") return t &= 255, l.TYPED_ARRAY_SUPPORT && typeof Uint8Array.prototype.indexOf == "function" ? i ? Uint8Array.prototype.indexOf.call(e, t, n) : Uint8Array.prototype.lastIndexOf.call(e, t, n) : w(e, [t], n, r, i);
						throw TypeError("val must be string, number or Buffer");
					}
					function w(e, t, n, r, i) {
						var a = 1, o = e.length, s = t.length;
						if (r !== void 0 && (r = String(r).toLowerCase(), r === "ucs2" || r === "ucs-2" || r === "utf16le" || r === "utf-16le")) {
							if (e.length < 2 || t.length < 2) return -1;
							a = 2, o /= 2, s /= 2, n /= 2;
						}
						function c(e, t) {
							return a === 1 ? e[t] : e.readUInt16BE(t * a);
						}
						var l;
						if (i) {
							var u = -1;
							for (l = n; l < o; l++) if (c(e, l) === c(t, u === -1 ? 0 : l - u)) {
								if (u === -1 && (u = l), l - u + 1 === s) return u * a;
							} else u !== -1 && (l -= l - u), u = -1;
						} else for (n + s > o && (n = o - s), l = n; l >= 0; l--) {
							for (var d = !0, f = 0; f < s; f++) if (c(e, l + f) !== c(t, f)) {
								d = !1;
								break;
							}
							if (d) return l;
						}
						return -1;
					}
					l.prototype.includes = function(e, t, n) {
						return this.indexOf(e, t, n) !== -1;
					}, l.prototype.indexOf = function(e, t, n) {
						return C(this, e, t, n, !0);
					}, l.prototype.lastIndexOf = function(e, t, n) {
						return C(this, e, t, n, !1);
					};
					function T(e, t, n, r) {
						n = Number(n) || 0;
						var i = e.length - n;
						r ? (r = Number(r), r > i && (r = i)) : r = i;
						var a = t.length;
						if (a % 2 != 0) throw TypeError("Invalid hex string");
						r > a / 2 && (r = a / 2);
						for (var o = 0; o < r; ++o) {
							var s = parseInt(t.substr(o * 2, 2), 16);
							if (isNaN(s)) return o;
							e[n + o] = s;
						}
						return o;
					}
					function E(e, t, n, r) {
						return oe(ie(t, e.length - n), e, n, r);
					}
					function D(e, t, n, r) {
						return oe(ae(t), e, n, r);
					}
					function O(e, t, n, r) {
						return D(e, t, n, r);
					}
					function k(e, t, n, r) {
						return oe(q(t), e, n, r);
					}
					function A(e, t, n, r) {
						return oe(K(t, e.length - n), e, n, r);
					}
					l.prototype.write = function(e, t, n, r) {
						if (t === void 0) r = "utf8", n = this.length, t = 0;
						else if (n === void 0 && typeof t == "string") r = t, n = this.length, t = 0;
						else if (isFinite(t)) t |= 0, isFinite(n) ? (n |= 0, r === void 0 && (r = "utf8")) : (r = n, n = void 0);
						else throw Error("Buffer.write(string, encoding, offset[, length]) is no longer supported");
						var i = this.length - t;
						if ((n === void 0 || n > i) && (n = i), e.length > 0 && (n < 0 || t < 0) || t > this.length) throw RangeError("Attempt to write outside buffer bounds");
						r ||= "utf8";
						for (var a = !1;;) switch (r) {
							case "hex": return T(this, e, t, n);
							case "utf8":
							case "utf-8": return E(this, e, t, n);
							case "ascii": return D(this, e, t, n);
							case "latin1":
							case "binary": return O(this, e, t, n);
							case "base64": return k(this, e, t, n);
							case "ucs2":
							case "ucs-2":
							case "utf16le":
							case "utf-16le": return A(this, e, t, n);
							default:
								if (a) throw TypeError("Unknown encoding: " + r);
								r = ("" + r).toLowerCase(), a = !0;
						}
					}, l.prototype.toJSON = function() {
						return {
							type: "Buffer",
							data: Array.prototype.slice.call(this._arr || this, 0)
						};
					};
					function j(e, t, n) {
						return t === 0 && n === e.length ? r.fromByteArray(e) : r.fromByteArray(e.slice(t, n));
					}
					function M(e, t, n) {
						n = Math.min(e.length, n);
						for (var r = [], i = t; i < n;) {
							var a = e[i], o = null, s = a > 239 ? 4 : a > 223 ? 3 : a > 191 ? 2 : 1;
							if (i + s <= n) {
								var c, l, u, d;
								switch (s) {
									case 1:
										a < 128 && (o = a);
										break;
									case 2:
										c = e[i + 1], (c & 192) == 128 && (d = (a & 31) << 6 | c & 63, d > 127 && (o = d));
										break;
									case 3:
										c = e[i + 1], l = e[i + 2], (c & 192) == 128 && (l & 192) == 128 && (d = (a & 15) << 12 | (c & 63) << 6 | l & 63, d > 2047 && (d < 55296 || d > 57343) && (o = d));
										break;
									case 4: c = e[i + 1], l = e[i + 2], u = e[i + 3], (c & 192) == 128 && (l & 192) == 128 && (u & 192) == 128 && (d = (a & 15) << 18 | (c & 63) << 12 | (l & 63) << 6 | u & 63, d > 65535 && d < 1114112 && (o = d));
								}
							}
							o === null ? (o = 65533, s = 1) : o > 65535 && (o -= 65536, r.push(o >>> 10 & 1023 | 55296), o = 56320 | o & 1023), r.push(o), i += s;
						}
						return P(r);
					}
					var N = 4096;
					function P(e) {
						var t = e.length;
						if (t <= N) return String.fromCharCode.apply(String, e);
						for (var n = "", r = 0; r < t;) n += String.fromCharCode.apply(String, e.slice(r, r += N));
						return n;
					}
					function F(e, t, n) {
						var r = "";
						n = Math.min(e.length, n);
						for (var i = t; i < n; ++i) r += String.fromCharCode(e[i] & 127);
						return r;
					}
					function I(e, t, n) {
						var r = "";
						n = Math.min(e.length, n);
						for (var i = t; i < n; ++i) r += String.fromCharCode(e[i]);
						return r;
					}
					function L(e, t, n) {
						var r = e.length;
						(!t || t < 0) && (t = 0), (!n || n < 0 || n > r) && (n = r);
						for (var i = "", a = t; a < n; ++a) i += re(e[a]);
						return i;
					}
					function R(e, t, n) {
						for (var r = e.slice(t, n), i = "", a = 0; a < r.length; a += 2) i += String.fromCharCode(r[a] + r[a + 1] * 256);
						return i;
					}
					l.prototype.slice = function(e, t) {
						var n = this.length;
						e = ~~e, t = t === void 0 ? n : ~~t, e < 0 ? (e += n, e < 0 && (e = 0)) : e > n && (e = n), t < 0 ? (t += n, t < 0 && (t = 0)) : t > n && (t = n), t < e && (t = e);
						var r;
						if (l.TYPED_ARRAY_SUPPORT) r = this.subarray(e, t), r.__proto__ = l.prototype;
						else {
							var i = t - e;
							r = new l(i, void 0);
							for (var a = 0; a < i; ++a) r[a] = this[a + e];
						}
						return r;
					};
					function z(e, t, n) {
						if (e % 1 != 0 || e < 0) throw RangeError("offset is not uint");
						if (e + t > n) throw RangeError("Trying to access beyond buffer length");
					}
					l.prototype.readUIntLE = function(e, t, n) {
						e |= 0, t |= 0, n || z(e, t, this.length);
						for (var r = this[e], i = 1, a = 0; ++a < t && (i *= 256);) r += this[e + a] * i;
						return r;
					}, l.prototype.readUIntBE = function(e, t, n) {
						e |= 0, t |= 0, n || z(e, t, this.length);
						for (var r = this[e + --t], i = 1; t > 0 && (i *= 256);) r += this[e + --t] * i;
						return r;
					}, l.prototype.readUInt8 = function(e, t) {
						return t || z(e, 1, this.length), this[e];
					}, l.prototype.readUInt16LE = function(e, t) {
						return t || z(e, 2, this.length), this[e] | this[e + 1] << 8;
					}, l.prototype.readUInt16BE = function(e, t) {
						return t || z(e, 2, this.length), this[e] << 8 | this[e + 1];
					}, l.prototype.readUInt32LE = function(e, t) {
						return t || z(e, 4, this.length), (this[e] | this[e + 1] << 8 | this[e + 2] << 16) + this[e + 3] * 16777216;
					}, l.prototype.readUInt32BE = function(e, t) {
						return t || z(e, 4, this.length), this[e] * 16777216 + (this[e + 1] << 16 | this[e + 2] << 8 | this[e + 3]);
					}, l.prototype.readIntLE = function(e, t, n) {
						e |= 0, t |= 0, n || z(e, t, this.length);
						for (var r = this[e], i = 1, a = 0; ++a < t && (i *= 256);) r += this[e + a] * i;
						return i *= 128, r >= i && (r -= 2 ** (8 * t)), r;
					}, l.prototype.readIntBE = function(e, t, n) {
						e |= 0, t |= 0, n || z(e, t, this.length);
						for (var r = t, i = 1, a = this[e + --r]; r > 0 && (i *= 256);) a += this[e + --r] * i;
						return i *= 128, a >= i && (a -= 2 ** (8 * t)), a;
					}, l.prototype.readInt8 = function(e, t) {
						return t || z(e, 1, this.length), this[e] & 128 ? (255 - this[e] + 1) * -1 : this[e];
					}, l.prototype.readInt16LE = function(e, t) {
						t || z(e, 2, this.length);
						var n = this[e] | this[e + 1] << 8;
						return n & 32768 ? n | 4294901760 : n;
					}, l.prototype.readInt16BE = function(e, t) {
						t || z(e, 2, this.length);
						var n = this[e + 1] | this[e] << 8;
						return n & 32768 ? n | 4294901760 : n;
					}, l.prototype.readInt32LE = function(e, t) {
						return t || z(e, 4, this.length), this[e] | this[e + 1] << 8 | this[e + 2] << 16 | this[e + 3] << 24;
					}, l.prototype.readInt32BE = function(e, t) {
						return t || z(e, 4, this.length), this[e] << 24 | this[e + 1] << 16 | this[e + 2] << 8 | this[e + 3];
					}, l.prototype.readFloatLE = function(e, t) {
						return t || z(e, 4, this.length), i.read(this, e, !0, 23, 4);
					}, l.prototype.readFloatBE = function(e, t) {
						return t || z(e, 4, this.length), i.read(this, e, !1, 23, 4);
					}, l.prototype.readDoubleLE = function(e, t) {
						return t || z(e, 8, this.length), i.read(this, e, !0, 52, 8);
					}, l.prototype.readDoubleBE = function(e, t) {
						return t || z(e, 8, this.length), i.read(this, e, !1, 52, 8);
					};
					function B(e, t, n, r, i, a) {
						if (!l.isBuffer(e)) throw TypeError("\"buffer\" argument must be a Buffer instance");
						if (t > i || t < a) throw RangeError("\"value\" argument is out of bounds");
						if (n + r > e.length) throw RangeError("Index out of range");
					}
					l.prototype.writeUIntLE = function(e, t, n, r) {
						if (e = +e, t |= 0, n |= 0, !r) {
							var i = 2 ** (8 * n) - 1;
							B(this, e, t, n, i, 0);
						}
						var a = 1, o = 0;
						for (this[t] = e & 255; ++o < n && (a *= 256);) this[t + o] = e / a & 255;
						return t + n;
					}, l.prototype.writeUIntBE = function(e, t, n, r) {
						if (e = +e, t |= 0, n |= 0, !r) {
							var i = 2 ** (8 * n) - 1;
							B(this, e, t, n, i, 0);
						}
						var a = n - 1, o = 1;
						for (this[t + a] = e & 255; --a >= 0 && (o *= 256);) this[t + a] = e / o & 255;
						return t + n;
					}, l.prototype.writeUInt8 = function(e, t, n) {
						return e = +e, t |= 0, n || B(this, e, t, 1, 255, 0), l.TYPED_ARRAY_SUPPORT || (e = Math.floor(e)), this[t] = e & 255, t + 1;
					};
					function V(e, t, n, r) {
						t < 0 && (t = 65535 + t + 1);
						for (var i = 0, a = Math.min(e.length - n, 2); i < a; ++i) e[n + i] = (t & 255 << 8 * (r ? i : 1 - i)) >>> (r ? i : 1 - i) * 8;
					}
					l.prototype.writeUInt16LE = function(e, t, n) {
						return e = +e, t |= 0, n || B(this, e, t, 2, 65535, 0), l.TYPED_ARRAY_SUPPORT ? (this[t] = e & 255, this[t + 1] = e >>> 8) : V(this, e, t, !0), t + 2;
					}, l.prototype.writeUInt16BE = function(e, t, n) {
						return e = +e, t |= 0, n || B(this, e, t, 2, 65535, 0), l.TYPED_ARRAY_SUPPORT ? (this[t] = e >>> 8, this[t + 1] = e & 255) : V(this, e, t, !1), t + 2;
					};
					function H(e, t, n, r) {
						t < 0 && (t = 4294967295 + t + 1);
						for (var i = 0, a = Math.min(e.length - n, 4); i < a; ++i) e[n + i] = t >>> (r ? i : 3 - i) * 8 & 255;
					}
					l.prototype.writeUInt32LE = function(e, t, n) {
						return e = +e, t |= 0, n || B(this, e, t, 4, 4294967295, 0), l.TYPED_ARRAY_SUPPORT ? (this[t + 3] = e >>> 24, this[t + 2] = e >>> 16, this[t + 1] = e >>> 8, this[t] = e & 255) : H(this, e, t, !0), t + 4;
					}, l.prototype.writeUInt32BE = function(e, t, n) {
						return e = +e, t |= 0, n || B(this, e, t, 4, 4294967295, 0), l.TYPED_ARRAY_SUPPORT ? (this[t] = e >>> 24, this[t + 1] = e >>> 16, this[t + 2] = e >>> 8, this[t + 3] = e & 255) : H(this, e, t, !1), t + 4;
					}, l.prototype.writeIntLE = function(e, t, n, r) {
						if (e = +e, t |= 0, !r) {
							var i = 2 ** (8 * n - 1);
							B(this, e, t, n, i - 1, -i);
						}
						var a = 0, o = 1, s = 0;
						for (this[t] = e & 255; ++a < n && (o *= 256);) e < 0 && s === 0 && this[t + a - 1] !== 0 && (s = 1), this[t + a] = (e / o >> 0) - s & 255;
						return t + n;
					}, l.prototype.writeIntBE = function(e, t, n, r) {
						if (e = +e, t |= 0, !r) {
							var i = 2 ** (8 * n - 1);
							B(this, e, t, n, i - 1, -i);
						}
						var a = n - 1, o = 1, s = 0;
						for (this[t + a] = e & 255; --a >= 0 && (o *= 256);) e < 0 && s === 0 && this[t + a + 1] !== 0 && (s = 1), this[t + a] = (e / o >> 0) - s & 255;
						return t + n;
					}, l.prototype.writeInt8 = function(e, t, n) {
						return e = +e, t |= 0, n || B(this, e, t, 1, 127, -128), l.TYPED_ARRAY_SUPPORT || (e = Math.floor(e)), e < 0 && (e = 255 + e + 1), this[t] = e & 255, t + 1;
					}, l.prototype.writeInt16LE = function(e, t, n) {
						return e = +e, t |= 0, n || B(this, e, t, 2, 32767, -32768), l.TYPED_ARRAY_SUPPORT ? (this[t] = e & 255, this[t + 1] = e >>> 8) : V(this, e, t, !0), t + 2;
					}, l.prototype.writeInt16BE = function(e, t, n) {
						return e = +e, t |= 0, n || B(this, e, t, 2, 32767, -32768), l.TYPED_ARRAY_SUPPORT ? (this[t] = e >>> 8, this[t + 1] = e & 255) : V(this, e, t, !1), t + 2;
					}, l.prototype.writeInt32LE = function(e, t, n) {
						return e = +e, t |= 0, n || B(this, e, t, 4, 2147483647, -2147483648), l.TYPED_ARRAY_SUPPORT ? (this[t] = e & 255, this[t + 1] = e >>> 8, this[t + 2] = e >>> 16, this[t + 3] = e >>> 24) : H(this, e, t, !0), t + 4;
					}, l.prototype.writeInt32BE = function(e, t, n) {
						return e = +e, t |= 0, n || B(this, e, t, 4, 2147483647, -2147483648), e < 0 && (e = 4294967295 + e + 1), l.TYPED_ARRAY_SUPPORT ? (this[t] = e >>> 24, this[t + 1] = e >>> 16, this[t + 2] = e >>> 8, this[t + 3] = e & 255) : H(this, e, t, !1), t + 4;
					};
					function U(e, t, n, r, i, a) {
						if (n + r > e.length || n < 0) throw RangeError("Index out of range");
					}
					function ee(e, t, n, r, a) {
						return a || U(e, t, n, 4, 34028234663852886e22, -34028234663852886e22), i.write(e, t, n, r, 23, 4), n + 4;
					}
					l.prototype.writeFloatLE = function(e, t, n) {
						return ee(this, e, t, !0, n);
					}, l.prototype.writeFloatBE = function(e, t, n) {
						return ee(this, e, t, !1, n);
					};
					function W(e, t, n, r, a) {
						return a || U(e, t, n, 8, 17976931348623157e292, -17976931348623157e292), i.write(e, t, n, r, 52, 8), n + 8;
					}
					l.prototype.writeDoubleLE = function(e, t, n) {
						return W(this, e, t, !0, n);
					}, l.prototype.writeDoubleBE = function(e, t, n) {
						return W(this, e, t, !1, n);
					}, l.prototype.copy = function(e, t, n, r) {
						if (n ||= 0, !r && r !== 0 && (r = this.length), t >= e.length && (t = e.length), t ||= 0, r > 0 && r < n && (r = n), r === n || e.length === 0 || this.length === 0) return 0;
						if (t < 0) throw RangeError("targetStart out of bounds");
						if (n < 0 || n >= this.length) throw RangeError("sourceStart out of bounds");
						if (r < 0) throw RangeError("sourceEnd out of bounds");
						r > this.length && (r = this.length), e.length - t < r - n && (r = e.length - t + n);
						var i = r - n, a;
						if (this === e && n < t && t < r) for (a = i - 1; a >= 0; --a) e[a + t] = this[a + n];
						else if (i < 1e3 || !l.TYPED_ARRAY_SUPPORT) for (a = 0; a < i; ++a) e[a + t] = this[a + n];
						else Uint8Array.prototype.set.call(e, this.subarray(n, n + i), t);
						return i;
					}, l.prototype.fill = function(e, t, n, r) {
						if (typeof e == "string") {
							if (typeof t == "string" ? (r = t, t = 0, n = this.length) : typeof n == "string" && (r = n, n = this.length), e.length === 1) {
								var i = e.charCodeAt(0);
								i < 256 && (e = i);
							}
							if (r !== void 0 && typeof r != "string") throw TypeError("encoding must be a string");
							if (typeof r == "string" && !l.isEncoding(r)) throw TypeError("Unknown encoding: " + r);
						} else typeof e == "number" && (e &= 255);
						if (t < 0 || this.length < t || this.length < n) throw RangeError("Out of range index");
						if (n <= t) return this;
						t >>>= 0, n = n === void 0 ? this.length : n >>> 0, e ||= 0;
						var a;
						if (typeof e == "number") for (a = t; a < n; ++a) this[a] = e;
						else {
							var o = l.isBuffer(e) ? e : ie(new l(e, r).toString()), s = o.length;
							for (a = 0; a < n - t; ++a) this[a + t] = o[a % s];
						}
						return this;
					};
					var te = /[^+\/0-9A-Za-z-_]/g;
					function G(e) {
						if (e = ne(e).replace(te, ""), e.length < 2) return "";
						for (; e.length % 4 != 0;) e += "=";
						return e;
					}
					function ne(e) {
						return e.trim ? e.trim() : e.replace(/^\s+|\s+$/g, "");
					}
					function re(e) {
						return e < 16 ? "0" + e.toString(16) : e.toString(16);
					}
					function ie(e, t) {
						t ||= Infinity;
						for (var n, r = e.length, i = null, a = [], o = 0; o < r; ++o) {
							if (n = e.charCodeAt(o), n > 55295 && n < 57344) {
								if (!i) {
									if (n > 56319) {
										(t -= 3) > -1 && a.push(239, 191, 189);
										continue;
									}
									if (o + 1 === r) {
										(t -= 3) > -1 && a.push(239, 191, 189);
										continue;
									}
									i = n;
									continue;
								}
								if (n < 56320) {
									(t -= 3) > -1 && a.push(239, 191, 189), i = n;
									continue;
								}
								n = (i - 55296 << 10 | n - 56320) + 65536;
							} else i && (t -= 3) > -1 && a.push(239, 191, 189);
							if (i = null, n < 128) {
								if (--t < 0) break;
								a.push(n);
							} else if (n < 2048) {
								if ((t -= 2) < 0) break;
								a.push(n >> 6 | 192, n & 63 | 128);
							} else if (n < 65536) {
								if ((t -= 3) < 0) break;
								a.push(n >> 12 | 224, n >> 6 & 63 | 128, n & 63 | 128);
							} else if (n < 1114112) {
								if ((t -= 4) < 0) break;
								a.push(n >> 18 | 240, n >> 12 & 63 | 128, n >> 6 & 63 | 128, n & 63 | 128);
							} else throw Error("Invalid code point");
						}
						return a;
					}
					function ae(e) {
						for (var t = [], n = 0; n < e.length; ++n) t.push(e.charCodeAt(n) & 255);
						return t;
					}
					function K(e, t) {
						for (var n, r, i, a = [], o = 0; o < e.length && !((t -= 2) < 0); ++o) n = e.charCodeAt(o), r = n >> 8, i = n % 256, a.push(i), a.push(r);
						return a;
					}
					function q(e) {
						return r.toByteArray(G(e));
					}
					function oe(e, t, n, r) {
						for (var i = 0; i < r && !(i + n >= t.length || i >= e.length); ++i) t[i + n] = e[i];
						return i;
					}
					function se(e) {
						return e !== e;
					}
				}).call(this, typeof global < "u" ? global : typeof self < "u" ? self : typeof window < "u" ? window : {});
			}, {
				"base64-js": 47,
				ieee754: 51,
				isarray: 52
			}],
			49: [function(e, t, n) {
				Object.defineProperty(n, "__esModule", { value: !0 }), n.default = {
					SYMBOL: {
						32: 32,
						33: 33,
						34: 8704,
						35: 35,
						36: 8707,
						37: 37,
						38: 38,
						39: 8717,
						40: 40,
						41: 41,
						42: 42,
						43: 43,
						44: 44,
						45: 8722,
						46: 46,
						47: 47,
						48: 48,
						49: 49,
						50: 50,
						51: 51,
						52: 52,
						53: 53,
						54: 54,
						55: 55,
						56: 56,
						57: 57,
						58: 58,
						59: 59,
						60: 60,
						61: 61,
						62: 62,
						63: 63,
						64: 8773,
						65: 913,
						66: 914,
						67: 935,
						68: 916,
						69: 917,
						70: 934,
						71: 915,
						72: 919,
						73: 921,
						74: 977,
						75: 922,
						76: 923,
						77: 924,
						78: 925,
						79: 927,
						80: 928,
						81: 920,
						82: 929,
						83: 931,
						84: 932,
						85: 933,
						86: 962,
						87: 937,
						88: 926,
						89: 936,
						90: 918,
						91: 91,
						92: 8756,
						93: 93,
						94: 8869,
						95: 95,
						96: 8254,
						97: 945,
						98: 946,
						99: 967,
						100: 948,
						101: 949,
						102: 966,
						103: 947,
						104: 951,
						105: 953,
						106: 981,
						107: 954,
						108: 955,
						109: 956,
						110: 957,
						111: 959,
						112: 960,
						113: 952,
						114: 961,
						115: 963,
						116: 964,
						117: 965,
						118: 982,
						119: 969,
						120: 958,
						121: 968,
						122: 950,
						123: 123,
						124: 124,
						125: 125,
						126: 126,
						160: 8364,
						161: 978,
						162: 8242,
						163: 8804,
						164: 8260,
						165: 8734,
						166: 402,
						167: 9827,
						168: 9830,
						169: 9829,
						170: 9824,
						171: 8596,
						172: 8592,
						173: 8593,
						174: 8594,
						175: 8595,
						176: 176,
						177: 177,
						178: 8243,
						179: 8805,
						180: 215,
						181: 8733,
						182: 8706,
						183: 8226,
						184: 247,
						185: 8800,
						186: 8801,
						187: 8776,
						188: 8230,
						189: 9168,
						190: 9135,
						191: 8629,
						192: 8501,
						193: 8465,
						194: 8476,
						195: 8472,
						196: 8855,
						197: 8853,
						198: 8709,
						199: 8745,
						200: 8746,
						201: 8835,
						202: 8839,
						203: 8836,
						204: 8834,
						205: 8838,
						206: 8712,
						207: 8713,
						208: 8736,
						209: 8711,
						210: 174,
						211: 169,
						212: 8482,
						213: 8719,
						214: 8730,
						215: 8901,
						216: 172,
						217: 8743,
						218: 8744,
						219: 8660,
						220: 8656,
						221: 8657,
						222: 8658,
						223: 8659,
						224: 9674,
						225: 12296,
						226: 174,
						227: 169,
						228: 8482,
						229: 8721,
						230: 9115,
						231: 9116,
						232: 9117,
						233: 9121,
						234: 9122,
						235: 9123,
						236: 9127,
						237: 9128,
						238: 9129,
						239: 9130,
						240: 63743,
						241: 12297,
						242: 8747,
						243: 8992,
						244: 9134,
						245: 8993,
						246: 9118,
						247: 9119,
						248: 9120,
						249: 9124,
						250: 9125,
						251: 9126,
						252: 9131,
						253: 9132,
						254: 9133
					},
					WEBDINGS: {
						32: 32,
						33: 128375,
						34: 128376,
						35: 128370,
						36: 128374,
						37: 127942,
						38: 127894,
						39: 128391,
						40: 128488,
						41: 128489,
						42: 128496,
						43: 128497,
						44: 127798,
						45: 127895,
						46: 128638,
						47: 128636,
						48: 128469,
						49: 128470,
						50: 128471,
						51: 9204,
						52: 9205,
						53: 9206,
						54: 9207,
						55: 9194,
						56: 9193,
						57: 9198,
						58: 9197,
						59: 9208,
						60: 9209,
						61: 9210,
						62: 128474,
						63: 128499,
						64: 128736,
						65: 127959,
						66: 127960,
						67: 127961,
						68: 127962,
						69: 127964,
						70: 127981,
						71: 127963,
						72: 127968,
						73: 127958,
						74: 127965,
						75: 128739,
						76: 128269,
						77: 127956,
						78: 128065,
						79: 128066,
						80: 127966,
						81: 127957,
						82: 128740,
						83: 127967,
						84: 128755,
						85: 128364,
						86: 128363,
						87: 128360,
						88: 128264,
						89: 127892,
						90: 127893,
						91: 128492,
						92: 128637,
						93: 128493,
						94: 128490,
						95: 128491,
						96: 11156,
						97: 10004,
						98: 128690,
						99: 11036,
						100: 128737,
						101: 128230,
						102: 128753,
						103: 11035,
						104: 128657,
						105: 128712,
						106: 128745,
						107: 128752,
						108: 128968,
						109: 128372,
						110: 11044,
						111: 128741,
						112: 128660,
						113: 128472,
						114: 128473,
						115: 10067,
						116: 128754,
						117: 128647,
						118: 128653,
						119: 9971,
						120: 10680,
						121: 8854,
						122: 128685,
						123: 128494,
						124: 9168,
						125: 128495,
						126: 128498,
						128: 128697,
						129: 128698,
						130: 128713,
						131: 128714,
						132: 128700,
						133: 128125,
						134: 127947,
						135: 9975,
						136: 127938,
						137: 127948,
						138: 127946,
						139: 127940,
						140: 127949,
						141: 127950,
						142: 128664,
						143: 128480,
						144: 128738,
						145: 128176,
						146: 127991,
						147: 128179,
						148: 128106,
						149: 128481,
						150: 128482,
						151: 128483,
						152: 10031,
						153: 128388,
						154: 128389,
						155: 128387,
						156: 128390,
						157: 128441,
						158: 128442,
						159: 128443,
						160: 128373,
						161: 128368,
						162: 128445,
						163: 128446,
						164: 128203,
						165: 128466,
						166: 128467,
						167: 128366,
						168: 128218,
						169: 128478,
						170: 128479,
						171: 128451,
						172: 128450,
						173: 128444,
						174: 127917,
						175: 127900,
						176: 127896,
						177: 127897,
						178: 127911,
						179: 128191,
						180: 127902,
						181: 128247,
						182: 127903,
						183: 127916,
						184: 128253,
						185: 128249,
						186: 128254,
						187: 128251,
						188: 127898,
						189: 127899,
						190: 128250,
						191: 128187,
						192: 128421,
						193: 128422,
						194: 128423,
						195: 128377,
						196: 127918,
						197: 128379,
						198: 128380,
						199: 128223,
						200: 128385,
						201: 128384,
						202: 128424,
						203: 128425,
						204: 128447,
						205: 128426,
						206: 128476,
						207: 128274,
						208: 128275,
						209: 128477,
						210: 128229,
						211: 128228,
						212: 128371,
						213: 127779,
						214: 127780,
						215: 127781,
						216: 127782,
						217: 9729,
						218: 127784,
						219: 127783,
						220: 127785,
						221: 127786,
						222: 127788,
						223: 127787,
						224: 127772,
						225: 127777,
						226: 128715,
						227: 128719,
						228: 127869,
						229: 127864,
						230: 128718,
						231: 128717,
						232: 9413,
						233: 9855,
						234: 128710,
						235: 128392,
						236: 127891,
						237: 128484,
						238: 128485,
						239: 128486,
						240: 128487,
						241: 128746,
						242: 128063,
						243: 128038,
						244: 128031,
						245: 128021,
						246: 128008,
						247: 128620,
						248: 128622,
						249: 128621,
						250: 128623,
						251: 128506,
						252: 127757,
						253: 127759,
						254: 127758,
						255: 128330
					},
					WINGDINGS: {
						32: 32,
						33: 128393,
						34: 9986,
						35: 9985,
						36: 128083,
						37: 128365,
						38: 128366,
						39: 128367,
						40: 128383,
						41: 9990,
						42: 128386,
						43: 128387,
						44: 128234,
						45: 128235,
						46: 128236,
						47: 128237,
						48: 128448,
						49: 128449,
						50: 128462,
						51: 128463,
						52: 128464,
						53: 128452,
						54: 8987,
						55: 128430,
						56: 128432,
						57: 128434,
						58: 128435,
						59: 128436,
						60: 128427,
						61: 128428,
						62: 9991,
						63: 9997,
						64: 128398,
						65: 9996,
						66: 128399,
						67: 128077,
						68: 128078,
						69: 9756,
						70: 9758,
						71: 9757,
						72: 9759,
						73: 128400,
						74: 9786,
						75: 128528,
						76: 9785,
						77: 128163,
						78: 128369,
						79: 127987,
						80: 127985,
						81: 9992,
						82: 9788,
						83: 127778,
						84: 10052,
						85: 128326,
						86: 10014,
						87: 128328,
						88: 10016,
						89: 10017,
						90: 9770,
						91: 9775,
						92: 128329,
						93: 9784,
						94: 9800,
						95: 9801,
						96: 9802,
						97: 9803,
						98: 9804,
						99: 9805,
						100: 9806,
						101: 9807,
						102: 9808,
						103: 9809,
						104: 9810,
						105: 9811,
						106: 128624,
						107: 128629,
						108: 9899,
						109: 128318,
						110: 9724,
						111: 128911,
						112: 128912,
						113: 10065,
						114: 10066,
						115: 128927,
						116: 10731,
						117: 9670,
						118: 10070,
						119: 11049,
						120: 8999,
						121: 11193,
						122: 8984,
						123: 127989,
						124: 127990,
						125: 128630,
						126: 128631,
						127: 9647,
						128: 127243,
						129: 10112,
						130: 10113,
						131: 10114,
						132: 10115,
						133: 10116,
						134: 10117,
						135: 10118,
						136: 10119,
						137: 10120,
						138: 10121,
						139: 127244,
						140: 10122,
						141: 10123,
						142: 10124,
						143: 10125,
						144: 10126,
						145: 10127,
						146: 10128,
						147: 10129,
						148: 10130,
						149: 10131,
						150: 128610,
						151: 128608,
						152: 128609,
						153: 128611,
						154: 128606,
						155: 128604,
						156: 128605,
						157: 128607,
						158: 8729,
						159: 8226,
						160: 11037,
						161: 11096,
						162: 128902,
						163: 128904,
						164: 128906,
						165: 128907,
						166: 128319,
						167: 9642,
						168: 128910,
						169: 128961,
						170: 128965,
						171: 9733,
						172: 128971,
						173: 128975,
						174: 128979,
						175: 128977,
						176: 11216,
						177: 8982,
						178: 11214,
						179: 11215,
						180: 11217,
						181: 10026,
						182: 10032,
						183: 128336,
						184: 128337,
						185: 128338,
						186: 128339,
						187: 128340,
						188: 128341,
						189: 128342,
						190: 128343,
						191: 128344,
						192: 128345,
						193: 128346,
						194: 128347,
						195: 11184,
						196: 11185,
						197: 11186,
						198: 11187,
						199: 11188,
						200: 11189,
						201: 11190,
						202: 11191,
						203: 128618,
						204: 128619,
						205: 128597,
						206: 128596,
						207: 128599,
						208: 128598,
						209: 128592,
						210: 128593,
						211: 128594,
						212: 128595,
						213: 9003,
						214: 8998,
						215: 11160,
						216: 11162,
						217: 11161,
						218: 11163,
						219: 11144,
						220: 11146,
						221: 11145,
						222: 11147,
						223: 129128,
						224: 129130,
						225: 129129,
						226: 129131,
						227: 129132,
						228: 129133,
						229: 129135,
						230: 129134,
						231: 129144,
						232: 129146,
						233: 129145,
						234: 129147,
						235: 129148,
						236: 129149,
						237: 129151,
						238: 129150,
						239: 8678,
						240: 8680,
						241: 8679,
						242: 8681,
						243: 11012,
						244: 8691,
						245: 11009,
						246: 11008,
						247: 11011,
						248: 11010,
						249: 129196,
						250: 129197,
						251: 128502,
						252: 10003,
						253: 128503,
						254: 128505
					},
					"WINGDINGS 2": {
						32: 32,
						33: 128394,
						34: 128395,
						35: 128396,
						36: 128397,
						37: 9988,
						38: 9984,
						39: 128382,
						40: 128381,
						41: 128453,
						42: 128454,
						43: 128455,
						44: 128456,
						45: 128457,
						46: 128458,
						47: 128459,
						48: 128460,
						49: 128461,
						50: 128203,
						51: 128465,
						52: 128468,
						53: 128437,
						54: 128438,
						55: 128439,
						56: 128440,
						57: 128429,
						58: 128431,
						59: 128433,
						60: 128402,
						61: 128403,
						62: 128408,
						63: 128409,
						64: 128410,
						65: 128411,
						66: 128072,
						67: 128073,
						68: 128412,
						69: 128413,
						70: 128414,
						71: 128415,
						72: 128416,
						73: 128417,
						74: 128070,
						75: 128071,
						76: 128418,
						77: 128419,
						78: 128401,
						79: 128500,
						80: 128504,
						81: 128501,
						82: 9745,
						83: 11197,
						84: 9746,
						85: 11198,
						86: 11199,
						87: 128711,
						88: 10680,
						89: 128625,
						90: 128628,
						91: 128626,
						92: 128627,
						93: 8253,
						94: 128633,
						95: 128634,
						96: 128635,
						97: 128614,
						98: 128612,
						99: 128613,
						100: 128615,
						101: 128602,
						102: 128600,
						103: 128601,
						104: 128603,
						105: 9450,
						106: 9312,
						107: 9313,
						108: 9314,
						109: 9315,
						110: 9316,
						111: 9317,
						112: 9318,
						113: 9319,
						114: 9320,
						115: 9321,
						116: 9471,
						117: 10102,
						118: 10103,
						119: 10104,
						120: 10105,
						121: 10106,
						122: 10107,
						123: 10108,
						124: 10109,
						125: 10110,
						126: 10111,
						128: 9737,
						129: 127765,
						130: 9789,
						131: 9790,
						132: 11839,
						133: 10013,
						134: 128327,
						135: 128348,
						136: 128349,
						137: 128350,
						138: 128351,
						139: 128352,
						140: 128353,
						141: 128354,
						142: 128355,
						143: 128356,
						144: 128357,
						145: 128358,
						146: 128359,
						147: 128616,
						148: 128617,
						149: 8901,
						150: 128900,
						151: 10625,
						152: 9679,
						153: 9675,
						154: 128901,
						155: 128903,
						156: 128905,
						157: 8857,
						158: 10687,
						159: 128908,
						160: 128909,
						161: 9726,
						162: 9632,
						163: 9633,
						164: 128913,
						165: 128914,
						166: 128915,
						167: 128916,
						168: 9635,
						169: 128917,
						170: 128918,
						171: 128919,
						172: 128920,
						173: 11049,
						174: 11045,
						175: 9671,
						176: 128922,
						177: 9672,
						178: 128923,
						179: 128924,
						180: 128925,
						181: 128926,
						182: 11050,
						183: 11047,
						184: 9674,
						185: 128928,
						186: 9686,
						187: 9687,
						188: 11210,
						189: 11211,
						190: 11200,
						191: 11201,
						192: 11039,
						193: 11202,
						194: 11043,
						195: 11042,
						196: 11203,
						197: 11204,
						198: 128929,
						199: 128930,
						200: 128931,
						201: 128932,
						202: 128933,
						203: 128934,
						204: 128935,
						205: 128936,
						206: 128937,
						207: 128938,
						208: 128939,
						209: 128940,
						210: 128941,
						211: 128942,
						212: 128943,
						213: 128944,
						214: 128945,
						215: 128946,
						216: 128947,
						217: 128948,
						218: 128949,
						219: 128950,
						220: 128951,
						221: 128952,
						222: 128953,
						223: 128954,
						224: 128955,
						225: 128956,
						226: 128957,
						227: 128958,
						228: 128959,
						229: 128960,
						230: 128962,
						231: 128964,
						232: 128966,
						233: 128969,
						234: 128970,
						235: 10038,
						236: 128972,
						237: 128974,
						238: 128976,
						239: 128978,
						240: 10041,
						241: 128963,
						242: 128967,
						243: 10031,
						244: 128973,
						245: 128980,
						246: 11212,
						247: 11213,
						248: 8251,
						249: 8258
					},
					"WINGDINGS 3": {
						32: 32,
						33: 11104,
						34: 11106,
						35: 11105,
						36: 11107,
						37: 11110,
						38: 11111,
						39: 11113,
						40: 11112,
						41: 11120,
						42: 11122,
						43: 11121,
						44: 11123,
						45: 11126,
						46: 11128,
						47: 11131,
						48: 11133,
						49: 11108,
						50: 11109,
						51: 11114,
						52: 11116,
						53: 11115,
						54: 11117,
						55: 11085,
						56: 11168,
						57: 11169,
						58: 11170,
						59: 11171,
						60: 11172,
						61: 11173,
						62: 11174,
						63: 11175,
						64: 11152,
						65: 11153,
						66: 11154,
						67: 11155,
						68: 11136,
						69: 11139,
						70: 11134,
						71: 11135,
						72: 11140,
						73: 11142,
						74: 11141,
						75: 11143,
						76: 11151,
						77: 11149,
						78: 11150,
						79: 11148,
						80: 11118,
						81: 11119,
						82: 9099,
						83: 8996,
						84: 8963,
						85: 8997,
						86: 9251,
						87: 9085,
						88: 8682,
						89: 11192,
						90: 129184,
						91: 129185,
						92: 129186,
						93: 129187,
						94: 129188,
						95: 129189,
						96: 129190,
						97: 129191,
						98: 129192,
						99: 129193,
						100: 129194,
						101: 129195,
						102: 129104,
						103: 129106,
						104: 129105,
						105: 129107,
						106: 129108,
						107: 129109,
						108: 129111,
						109: 129110,
						110: 129112,
						111: 129113,
						112: 9650,
						113: 9660,
						114: 9651,
						115: 9661,
						116: 9664,
						117: 9654,
						118: 9665,
						119: 9655,
						120: 9699,
						121: 9698,
						122: 9700,
						123: 9701,
						124: 128896,
						125: 128898,
						126: 128897,
						128: 128899,
						129: 11205,
						130: 11206,
						131: 11207,
						132: 11208,
						133: 11164,
						134: 11166,
						135: 11165,
						136: 11167,
						137: 129040,
						138: 129042,
						139: 129041,
						140: 129043,
						141: 129044,
						142: 129046,
						143: 129045,
						144: 129047,
						145: 129048,
						146: 129050,
						147: 129049,
						148: 129051,
						149: 129052,
						150: 129054,
						151: 129053,
						152: 129055,
						153: 129024,
						154: 129026,
						155: 129025,
						156: 129027,
						157: 129028,
						158: 129030,
						159: 129029,
						160: 129031,
						161: 129032,
						162: 129034,
						163: 129033,
						164: 129035,
						165: 129056,
						166: 129058,
						167: 129060,
						168: 129062,
						169: 129064,
						170: 129066,
						171: 129068,
						172: 129180,
						173: 129181,
						174: 129182,
						175: 129183,
						176: 129070,
						177: 129072,
						178: 129074,
						179: 129076,
						180: 129078,
						181: 129080,
						182: 129082,
						183: 129081,
						184: 129083,
						185: 129176,
						186: 129178,
						187: 129177,
						188: 129179,
						189: 129084,
						190: 129086,
						191: 129085,
						192: 129087,
						193: 129088,
						194: 129090,
						195: 129089,
						196: 129091,
						197: 129092,
						198: 129094,
						199: 129093,
						200: 129095,
						201: 11176,
						202: 11177,
						203: 11178,
						204: 11179,
						205: 11180,
						206: 11181,
						207: 11182,
						208: 11183,
						209: 129120,
						210: 129122,
						211: 129121,
						212: 129123,
						213: 129124,
						214: 129125,
						215: 129127,
						216: 129126,
						217: 129136,
						218: 129138,
						219: 129137,
						220: 129139,
						221: 129140,
						222: 129141,
						223: 129143,
						224: 129142,
						225: 129152,
						226: 129154,
						227: 129153,
						228: 129155,
						229: 129156,
						230: 129157,
						231: 129159,
						232: 129158,
						233: 129168,
						234: 129170,
						235: 129169,
						236: 129171,
						237: 129172,
						238: 129174,
						239: 129173,
						240: 129175
					}
				};
			}, {}],
			50: [function(e, t, n) {
				var r = this && this.__importDefault || function(e) {
					return e && e.__esModule ? e : { default: e };
				};
				Object.defineProperty(n, "__esModule", { value: !0 }), n.hex = n.dec = n.codePoint = void 0;
				var i = r(e("./dingbats")), a = String.fromCodePoint ? String.fromCodePoint : l;
				function o(e, t) {
					var n = i.default[e.toUpperCase()];
					if (n !== void 0) {
						var r = n[t];
						if (r !== void 0) return {
							codePoint: r,
							string: a(r)
						};
					}
				}
				n.codePoint = o;
				function s(e, t) {
					return o(e, parseInt(t, 10));
				}
				n.dec = s;
				function c(e, t) {
					return o(e, parseInt(t, 16));
				}
				n.hex = c;
				function l(e) {
					if (e <= 65535) return String.fromCharCode(e);
					var t = Math.floor((e - 65536) / 1024) + 55296, n = (e - 65536) % 1024 + 56320;
					return String.fromCharCode(t, n);
				}
			}, { "./dingbats": 49 }],
			51: [function(e, t, n) {
				n.read = function(e, t, n, r, i) {
					var a, o, s = i * 8 - r - 1, c = (1 << s) - 1, l = c >> 1, u = -7, d = n ? i - 1 : 0, f = n ? -1 : 1, p = e[t + d];
					for (d += f, a = p & (1 << -u) - 1, p >>= -u, u += s; u > 0; a = a * 256 + e[t + d], d += f, u -= 8);
					for (o = a & (1 << -u) - 1, a >>= -u, u += r; u > 0; o = o * 256 + e[t + d], d += f, u -= 8);
					if (a === 0) a = 1 - l;
					else if (a === c) return o ? NaN : (p ? -1 : 1) * Infinity;
					else o += 2 ** r, a -= l;
					return (p ? -1 : 1) * o * 2 ** (a - r);
				}, n.write = function(e, t, n, r, i, a) {
					var o, s, c, l = a * 8 - i - 1, u = (1 << l) - 1, d = u >> 1, f = i === 23 ? 2 ** -24 - 2 ** -77 : 0, p = r ? 0 : a - 1, m = r ? 1 : -1, h = +(t < 0 || t === 0 && 1 / t < 0);
					for (t = Math.abs(t), isNaN(t) || t === Infinity ? (s = +!!isNaN(t), o = u) : (o = Math.floor(Math.log(t) / Math.LN2), t * (c = 2 ** -o) < 1 && (o--, c *= 2), o + d >= 1 ? t += f / c : t += f * 2 ** (1 - d), t * c >= 2 && (o++, c /= 2), o + d >= u ? (s = 0, o = u) : o + d >= 1 ? (s = (t * c - 1) * 2 ** i, o += d) : (s = t * 2 ** (d - 1) * 2 ** i, o = 0)); i >= 8; e[n + p] = s & 255, p += m, s /= 256, i -= 8);
					for (o = o << i | s, l += i; l > 0; e[n + p] = o & 255, p += m, o /= 256, l -= 8);
					e[n + p - m] |= h * 128;
				};
			}, {}],
			52: [function(e, t, n) {
				var r = {}.toString;
				t.exports = Array.isArray || function(e) {
					return r.call(e) == "[object Array]";
				};
			}, {}],
			53: [function(t, n, r) {
				(function(i, a) {
					(function(t) {
						typeof r == "object" && n !== void 0 ? n.exports = t() : typeof e == "function" && e.amd ? e([], t) : (typeof window < "u" ? window : i === void 0 ? typeof self < "u" ? self : this : i).JSZip = t();
					})(function() {
						return function e(n, r, i) {
							function a(s, c) {
								if (!r[s]) {
									if (!n[s]) {
										var l = typeof t == "function" && t;
										if (!c && l) return l(s, !0);
										if (o) return o(s, !0);
										var u = /* @__PURE__ */ Error("Cannot find module '" + s + "'");
										throw u.code = "MODULE_NOT_FOUND", u;
									}
									var d = r[s] = { exports: {} };
									n[s][0].call(d.exports, function(e) {
										var t = n[s][1][e];
										return a(t || e);
									}, d, d.exports, e, n, r, i);
								}
								return r[s].exports;
							}
							for (var o = typeof t == "function" && t, s = 0; s < i.length; s++) a(i[s]);
							return a;
						}({
							1: [function(e, t, n) {
								var r = e("./utils"), i = e("./support"), a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
								n.encode = function(e) {
									for (var t, n, i, o, s, c, l, u = [], d = 0, f = e.length, p = f, m = r.getTypeOf(e) !== "string"; d < e.length;) p = f - d, i = m ? (t = e[d++], n = d < f ? e[d++] : 0, d < f ? e[d++] : 0) : (t = e.charCodeAt(d++), n = d < f ? e.charCodeAt(d++) : 0, d < f ? e.charCodeAt(d++) : 0), o = t >> 2, s = (3 & t) << 4 | n >> 4, c = 1 < p ? (15 & n) << 2 | i >> 6 : 64, l = 2 < p ? 63 & i : 64, u.push(a.charAt(o) + a.charAt(s) + a.charAt(c) + a.charAt(l));
									return u.join("");
								}, n.decode = function(e) {
									var t, n, r, o, s, c, l = 0, u = 0, d = "data:";
									if (e.substr(0, d.length) === d) throw Error("Invalid base64 input, it looks like a data url.");
									var f, p = 3 * (e = e.replace(/[^A-Za-z0-9\+\/\=]/g, "")).length / 4;
									if (e.charAt(e.length - 1) === a.charAt(64) && p--, e.charAt(e.length - 2) === a.charAt(64) && p--, p % 1 != 0) throw Error("Invalid base64 input, bad content length.");
									for (f = i.uint8array ? new Uint8Array(0 | p) : Array(0 | p); l < e.length;) t = a.indexOf(e.charAt(l++)) << 2 | (o = a.indexOf(e.charAt(l++))) >> 4, n = (15 & o) << 4 | (s = a.indexOf(e.charAt(l++))) >> 2, r = (3 & s) << 6 | (c = a.indexOf(e.charAt(l++))), f[u++] = t, s !== 64 && (f[u++] = n), c !== 64 && (f[u++] = r);
									return f;
								};
							}, {
								"./support": 30,
								"./utils": 32
							}],
							2: [function(e, t, n) {
								var r = e("./external"), i = e("./stream/DataWorker"), a = e("./stream/Crc32Probe"), o = e("./stream/DataLengthProbe");
								function s(e, t, n, r, i) {
									this.compressedSize = e, this.uncompressedSize = t, this.crc32 = n, this.compression = r, this.compressedContent = i;
								}
								s.prototype = {
									getContentWorker: function() {
										var e = new i(r.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new o("data_length")), t = this;
										return e.on("end", function() {
											if (this.streamInfo.data_length !== t.uncompressedSize) throw Error("Bug : uncompressed data size mismatch");
										}), e;
									},
									getCompressedWorker: function() {
										return new i(r.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize", this.compressedSize).withStreamInfo("uncompressedSize", this.uncompressedSize).withStreamInfo("crc32", this.crc32).withStreamInfo("compression", this.compression);
									}
								}, s.createWorkerFrom = function(e, t, n) {
									return e.pipe(new a()).pipe(new o("uncompressedSize")).pipe(t.compressWorker(n)).pipe(new o("compressedSize")).withStreamInfo("compression", t);
								}, t.exports = s;
							}, {
								"./external": 6,
								"./stream/Crc32Probe": 25,
								"./stream/DataLengthProbe": 26,
								"./stream/DataWorker": 27
							}],
							3: [function(e, t, n) {
								var r = e("./stream/GenericWorker");
								n.STORE = {
									magic: "\0\0",
									compressWorker: function(e) {
										return new r("STORE compression");
									},
									uncompressWorker: function() {
										return new r("STORE decompression");
									}
								}, n.DEFLATE = e("./flate");
							}, {
								"./flate": 7,
								"./stream/GenericWorker": 28
							}],
							4: [function(e, t, n) {
								var r = e("./utils"), i = function() {
									for (var e, t = [], n = 0; n < 256; n++) {
										e = n;
										for (var r = 0; r < 8; r++) e = 1 & e ? 3988292384 ^ e >>> 1 : e >>> 1;
										t[n] = e;
									}
									return t;
								}();
								t.exports = function(e, t) {
									return e !== void 0 && e.length ? r.getTypeOf(e) === "string" ? function(e, t, n, r) {
										var a = i, o = r + n;
										e ^= -1;
										for (var s = r; s < o; s++) e = e >>> 8 ^ a[255 & (e ^ t.charCodeAt(s))];
										return -1 ^ e;
									}(0 | t, e, e.length, 0) : function(e, t, n, r) {
										var a = i, o = r + n;
										e ^= -1;
										for (var s = r; s < o; s++) e = e >>> 8 ^ a[255 & (e ^ t[s])];
										return -1 ^ e;
									}(0 | t, e, e.length, 0) : 0;
								};
							}, { "./utils": 32 }],
							5: [function(e, t, n) {
								n.base64 = !1, n.binary = !1, n.dir = !1, n.createFolders = !0, n.date = null, n.compression = null, n.compressionOptions = null, n.comment = null, n.unixPermissions = null, n.dosPermissions = null;
							}, {}],
							6: [function(e, t, n) {
								var r = null;
								r = typeof Promise < "u" ? Promise : e("lie"), t.exports = { Promise: r };
							}, { lie: 37 }],
							7: [function(e, t, n) {
								var r = typeof Uint8Array < "u" && typeof Uint16Array < "u" && typeof Uint32Array < "u", i = e("pako"), a = e("./utils"), o = e("./stream/GenericWorker"), s = r ? "uint8array" : "array";
								function c(e, t) {
									o.call(this, "FlateWorker/" + e), this._pako = null, this._pakoAction = e, this._pakoOptions = t, this.meta = {};
								}
								n.magic = "\b\0", a.inherits(c, o), c.prototype.processChunk = function(e) {
									this.meta = e.meta, this._pako === null && this._createPako(), this._pako.push(a.transformTo(s, e.data), !1);
								}, c.prototype.flush = function() {
									o.prototype.flush.call(this), this._pako === null && this._createPako(), this._pako.push([], !0);
								}, c.prototype.cleanUp = function() {
									o.prototype.cleanUp.call(this), this._pako = null;
								}, c.prototype._createPako = function() {
									this._pako = new i[this._pakoAction]({
										raw: !0,
										level: this._pakoOptions.level || -1
									});
									var e = this;
									this._pako.onData = function(t) {
										e.push({
											data: t,
											meta: e.meta
										});
									};
								}, n.compressWorker = function(e) {
									return new c("Deflate", e);
								}, n.uncompressWorker = function() {
									return new c("Inflate", {});
								};
							}, {
								"./stream/GenericWorker": 28,
								"./utils": 32,
								pako: 38
							}],
							8: [function(e, t, n) {
								function r(e, t) {
									var n, r = "";
									for (n = 0; n < t; n++) r += String.fromCharCode(255 & e), e >>>= 8;
									return r;
								}
								function i(e, t, n, i, o, u) {
									var d, f, p = e.file, m = e.compression, h = u !== s.utf8encode, g = a.transformTo("string", u(p.name)), _ = a.transformTo("string", s.utf8encode(p.name)), v = p.comment, y = a.transformTo("string", u(v)), b = a.transformTo("string", s.utf8encode(v)), x = _.length !== p.name.length, S = b.length !== v.length, C = "", w = "", T = "", E = p.dir, D = p.date, O = {
										crc32: 0,
										compressedSize: 0,
										uncompressedSize: 0
									};
									t && !n || (O.crc32 = e.crc32, O.compressedSize = e.compressedSize, O.uncompressedSize = e.uncompressedSize);
									var k = 0;
									t && (k |= 8), h || !x && !S || (k |= 2048);
									var A = 0, j = 0;
									E && (A |= 16), o === "UNIX" ? (j = 798, A |= function(e, t) {
										var n = e;
										return e || (n = t ? 16893 : 33204), (65535 & n) << 16;
									}(p.unixPermissions, E)) : (j = 20, A |= function(e) {
										return 63 & (e || 0);
									}(p.dosPermissions)), d = D.getUTCHours(), d <<= 6, d |= D.getUTCMinutes(), d <<= 5, d |= D.getUTCSeconds() / 2, f = D.getUTCFullYear() - 1980, f <<= 4, f |= D.getUTCMonth() + 1, f <<= 5, f |= D.getUTCDate(), x && (w = r(1, 1) + r(c(g), 4) + _, C += "up" + r(w.length, 2) + w), S && (T = r(1, 1) + r(c(y), 4) + b, C += "uc" + r(T.length, 2) + T);
									var M = "";
									return M += "\n\0", M += r(k, 2), M += m.magic, M += r(d, 2), M += r(f, 2), M += r(O.crc32, 4), M += r(O.compressedSize, 4), M += r(O.uncompressedSize, 4), M += r(g.length, 2), M += r(C.length, 2), {
										fileRecord: l.LOCAL_FILE_HEADER + M + g + C,
										dirRecord: l.CENTRAL_FILE_HEADER + r(j, 2) + M + r(y.length, 2) + "\0\0\0\0" + r(A, 4) + r(i, 4) + g + C + y
									};
								}
								var a = e("../utils"), o = e("../stream/GenericWorker"), s = e("../utf8"), c = e("../crc32"), l = e("../signature");
								function u(e, t, n, r) {
									o.call(this, "ZipFileWorker"), this.bytesWritten = 0, this.zipComment = t, this.zipPlatform = n, this.encodeFileName = r, this.streamFiles = e, this.accumulate = !1, this.contentBuffer = [], this.dirRecords = [], this.currentSourceOffset = 0, this.entriesCount = 0, this.currentFile = null, this._sources = [];
								}
								a.inherits(u, o), u.prototype.push = function(e) {
									var t = e.meta.percent || 0, n = this.entriesCount, r = this._sources.length;
									this.accumulate ? this.contentBuffer.push(e) : (this.bytesWritten += e.data.length, o.prototype.push.call(this, {
										data: e.data,
										meta: {
											currentFile: this.currentFile,
											percent: n ? (t + 100 * (n - r - 1)) / n : 100
										}
									}));
								}, u.prototype.openedSource = function(e) {
									this.currentSourceOffset = this.bytesWritten, this.currentFile = e.file.name;
									var t = this.streamFiles && !e.file.dir;
									if (t) {
										var n = i(e, t, !1, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
										this.push({
											data: n.fileRecord,
											meta: { percent: 0 }
										});
									} else this.accumulate = !0;
								}, u.prototype.closedSource = function(e) {
									this.accumulate = !1;
									var t = this.streamFiles && !e.file.dir, n = i(e, t, !0, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
									if (this.dirRecords.push(n.dirRecord), t) this.push({
										data: function(e) {
											return l.DATA_DESCRIPTOR + r(e.crc32, 4) + r(e.compressedSize, 4) + r(e.uncompressedSize, 4);
										}(e),
										meta: { percent: 100 }
									});
									else for (this.push({
										data: n.fileRecord,
										meta: { percent: 0 }
									}); this.contentBuffer.length;) this.push(this.contentBuffer.shift());
									this.currentFile = null;
								}, u.prototype.flush = function() {
									for (var e = this.bytesWritten, t = 0; t < this.dirRecords.length; t++) this.push({
										data: this.dirRecords[t],
										meta: { percent: 100 }
									});
									var n = this.bytesWritten - e, i = function(e, t, n, i, o) {
										var s = a.transformTo("string", o(i));
										return l.CENTRAL_DIRECTORY_END + "\0\0\0\0" + r(e, 2) + r(e, 2) + r(t, 4) + r(n, 4) + r(s.length, 2) + s;
									}(this.dirRecords.length, n, e, this.zipComment, this.encodeFileName);
									this.push({
										data: i,
										meta: { percent: 100 }
									});
								}, u.prototype.prepareNextSource = function() {
									this.previous = this._sources.shift(), this.openedSource(this.previous.streamInfo), this.isPaused ? this.previous.pause() : this.previous.resume();
								}, u.prototype.registerPrevious = function(e) {
									this._sources.push(e);
									var t = this;
									return e.on("data", function(e) {
										t.processChunk(e);
									}), e.on("end", function() {
										t.closedSource(t.previous.streamInfo), t._sources.length ? t.prepareNextSource() : t.end();
									}), e.on("error", function(e) {
										t.error(e);
									}), this;
								}, u.prototype.resume = function() {
									return !!o.prototype.resume.call(this) && (!this.previous && this._sources.length ? (this.prepareNextSource(), !0) : this.previous || this._sources.length || this.generatedError ? void 0 : (this.end(), !0));
								}, u.prototype.error = function(e) {
									var t = this._sources;
									if (!o.prototype.error.call(this, e)) return !1;
									for (var n = 0; n < t.length; n++) try {
										t[n].error(e);
									} catch {}
									return !0;
								}, u.prototype.lock = function() {
									o.prototype.lock.call(this);
									for (var e = this._sources, t = 0; t < e.length; t++) e[t].lock();
								}, t.exports = u;
							}, {
								"../crc32": 4,
								"../signature": 23,
								"../stream/GenericWorker": 28,
								"../utf8": 31,
								"../utils": 32
							}],
							9: [function(e, t, n) {
								var r = e("../compressions"), i = e("./ZipFileWorker");
								n.generateWorker = function(e, t, n) {
									var a = new i(t.streamFiles, n, t.platform, t.encodeFileName), o = 0;
									try {
										e.forEach(function(e, n) {
											o++;
											var i = function(e, t) {
												var n = e || t, i = r[n];
												if (!i) throw Error(n + " is not a valid compression method !");
												return i;
											}(n.options.compression, t.compression), s = n.options.compressionOptions || t.compressionOptions || {}, c = n.dir, l = n.date;
											n._compressWorker(i, s).withStreamInfo("file", {
												name: e,
												dir: c,
												date: l,
												comment: n.comment || "",
												unixPermissions: n.unixPermissions,
												dosPermissions: n.dosPermissions
											}).pipe(a);
										}), a.entriesCount = o;
									} catch (e) {
										a.error(e);
									}
									return a;
								};
							}, {
								"../compressions": 3,
								"./ZipFileWorker": 8
							}],
							10: [function(e, t, n) {
								function r() {
									if (!(this instanceof r)) return new r();
									if (arguments.length) throw Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");
									this.files = Object.create(null), this.comment = null, this.root = "", this.clone = function() {
										var e = new r();
										for (var t in this) typeof this[t] != "function" && (e[t] = this[t]);
										return e;
									};
								}
								(r.prototype = e("./object")).loadAsync = e("./load"), r.support = e("./support"), r.defaults = e("./defaults"), r.version = "3.7.1", r.loadAsync = function(e, t) {
									return new r().loadAsync(e, t);
								}, r.external = e("./external"), t.exports = r;
							}, {
								"./defaults": 5,
								"./external": 6,
								"./load": 11,
								"./object": 15,
								"./support": 30
							}],
							11: [function(e, t, n) {
								var r = e("./utils"), i = e("./external"), a = e("./utf8"), o = e("./zipEntries"), s = e("./stream/Crc32Probe"), c = e("./nodejsUtils");
								function l(e) {
									return new i.Promise(function(t, n) {
										var r = e.decompressed.getContentWorker().pipe(new s());
										r.on("error", function(e) {
											n(e);
										}).on("end", function() {
											r.streamInfo.crc32 === e.decompressed.crc32 ? t() : n(/* @__PURE__ */ Error("Corrupted zip : CRC32 mismatch"));
										}).resume();
									});
								}
								t.exports = function(e, t) {
									var n = this;
									return t = r.extend(t || {}, {
										base64: !1,
										checkCRC32: !1,
										optimizedBinaryString: !1,
										createFolders: !1,
										decodeFileName: a.utf8decode
									}), c.isNode && c.isStream(e) ? i.Promise.reject(/* @__PURE__ */ Error("JSZip can't accept a stream when loading a zip file.")) : r.prepareContent("the loaded zip file", e, !0, t.optimizedBinaryString, t.base64).then(function(e) {
										var n = new o(t);
										return n.load(e), n;
									}).then(function(e) {
										var n = [i.Promise.resolve(e)], r = e.files;
										if (t.checkCRC32) for (var a = 0; a < r.length; a++) n.push(l(r[a]));
										return i.Promise.all(n);
									}).then(function(e) {
										for (var r = e.shift(), i = r.files, a = 0; a < i.length; a++) {
											var o = i[a];
											n.file(o.fileNameStr, o.decompressed, {
												binary: !0,
												optimizedBinaryString: !0,
												date: o.date,
												dir: o.dir,
												comment: o.fileCommentStr.length ? o.fileCommentStr : null,
												unixPermissions: o.unixPermissions,
												dosPermissions: o.dosPermissions,
												createFolders: t.createFolders
											});
										}
										return r.zipComment.length && (n.comment = r.zipComment), n;
									});
								};
							}, {
								"./external": 6,
								"./nodejsUtils": 14,
								"./stream/Crc32Probe": 25,
								"./utf8": 31,
								"./utils": 32,
								"./zipEntries": 33
							}],
							12: [function(e, t, n) {
								var r = e("../utils"), i = e("../stream/GenericWorker");
								function a(e, t) {
									i.call(this, "Nodejs stream input adapter for " + e), this._upstreamEnded = !1, this._bindStream(t);
								}
								r.inherits(a, i), a.prototype._bindStream = function(e) {
									var t = this;
									(this._stream = e).pause(), e.on("data", function(e) {
										t.push({
											data: e,
											meta: { percent: 0 }
										});
									}).on("error", function(e) {
										t.isPaused ? this.generatedError = e : t.error(e);
									}).on("end", function() {
										t.isPaused ? t._upstreamEnded = !0 : t.end();
									});
								}, a.prototype.pause = function() {
									return !!i.prototype.pause.call(this) && (this._stream.pause(), !0);
								}, a.prototype.resume = function() {
									return !!i.prototype.resume.call(this) && (this._upstreamEnded ? this.end() : this._stream.resume(), !0);
								}, t.exports = a;
							}, {
								"../stream/GenericWorker": 28,
								"../utils": 32
							}],
							13: [function(e, t, n) {
								var r = e("readable-stream").Readable;
								function i(e, t, n) {
									r.call(this, t), this._helper = e;
									var i = this;
									e.on("data", function(e, t) {
										i.push(e) || i._helper.pause(), n && n(t);
									}).on("error", function(e) {
										i.emit("error", e);
									}).on("end", function() {
										i.push(null);
									});
								}
								e("../utils").inherits(i, r), i.prototype._read = function() {
									this._helper.resume();
								}, t.exports = i;
							}, {
								"../utils": 32,
								"readable-stream": 16
							}],
							14: [function(e, t, n) {
								t.exports = {
									isNode: a !== void 0,
									newBufferFrom: function(e, t) {
										if (a.from && a.from !== Uint8Array.from) return a.from(e, t);
										if (typeof e == "number") throw Error("The \"data\" argument must not be a number");
										return new a(e, t);
									},
									allocBuffer: function(e) {
										if (a.alloc) return a.alloc(e);
										var t = new a(e);
										return t.fill(0), t;
									},
									isBuffer: function(e) {
										return a.isBuffer(e);
									},
									isStream: function(e) {
										return e && typeof e.on == "function" && typeof e.pause == "function" && typeof e.resume == "function";
									}
								};
							}, {}],
							15: [function(e, t, n) {
								function r(e, t, n) {
									var r, i = a.getTypeOf(t), s = a.extend(n || {}, c);
									s.date = s.date || /* @__PURE__ */ new Date(), s.compression !== null && (s.compression = s.compression.toUpperCase()), typeof s.unixPermissions == "string" && (s.unixPermissions = parseInt(s.unixPermissions, 8)), s.unixPermissions && 16384 & s.unixPermissions && (s.dir = !0), s.dosPermissions && 16 & s.dosPermissions && (s.dir = !0), s.dir && (e = h(e)), s.createFolders && (r = m(e)) && g.call(this, r, !0);
									var d = i === "string" && !1 === s.binary && !1 === s.base64;
									n && n.binary !== void 0 || (s.binary = !d), (t instanceof l && t.uncompressedSize === 0 || s.dir || !t || t.length === 0) && (s.base64 = !1, s.binary = !0, t = "", s.compression = "STORE", i = "string");
									var _ = null;
									_ = t instanceof l || t instanceof o ? t : f.isNode && f.isStream(t) ? new p(e, t) : a.prepareContent(e, t, s.binary, s.optimizedBinaryString, s.base64);
									var v = new u(e, _, s);
									this.files[e] = v;
								}
								var i = e("./utf8"), a = e("./utils"), o = e("./stream/GenericWorker"), s = e("./stream/StreamHelper"), c = e("./defaults"), l = e("./compressedObject"), u = e("./zipObject"), d = e("./generate"), f = e("./nodejsUtils"), p = e("./nodejs/NodejsStreamInputAdapter"), m = function(e) {
									e.slice(-1) === "/" && (e = e.substring(0, e.length - 1));
									var t = e.lastIndexOf("/");
									return 0 < t ? e.substring(0, t) : "";
								}, h = function(e) {
									return e.slice(-1) !== "/" && (e += "/"), e;
								}, g = function(e, t) {
									return t = t === void 0 ? c.createFolders : t, e = h(e), this.files[e] || r.call(this, e, null, {
										dir: !0,
										createFolders: t
									}), this.files[e];
								};
								function _(e) {
									return Object.prototype.toString.call(e) === "[object RegExp]";
								}
								t.exports = {
									load: function() {
										throw Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
									},
									forEach: function(e) {
										var t, n, r;
										for (t in this.files) r = this.files[t], (n = t.slice(this.root.length, t.length)) && t.slice(0, this.root.length) === this.root && e(n, r);
									},
									filter: function(e) {
										var t = [];
										return this.forEach(function(n, r) {
											e(n, r) && t.push(r);
										}), t;
									},
									file: function(e, t, n) {
										if (arguments.length !== 1) return e = this.root + e, r.call(this, e, t, n), this;
										if (_(e)) {
											var i = e;
											return this.filter(function(e, t) {
												return !t.dir && i.test(e);
											});
										}
										var a = this.files[this.root + e];
										return a && !a.dir ? a : null;
									},
									folder: function(e) {
										if (!e) return this;
										if (_(e)) return this.filter(function(t, n) {
											return n.dir && e.test(t);
										});
										var t = this.root + e, n = g.call(this, t), r = this.clone();
										return r.root = n.name, r;
									},
									remove: function(e) {
										e = this.root + e;
										var t = this.files[e];
										if (t ||= (e.slice(-1) !== "/" && (e += "/"), this.files[e]), t && !t.dir) delete this.files[e];
										else for (var n = this.filter(function(t, n) {
											return n.name.slice(0, e.length) === e;
										}), r = 0; r < n.length; r++) delete this.files[n[r].name];
										return this;
									},
									generate: function(e) {
										throw Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
									},
									generateInternalStream: function(e) {
										var t, n = {};
										try {
											if ((n = a.extend(e || {}, {
												streamFiles: !1,
												compression: "STORE",
												compressionOptions: null,
												type: "",
												platform: "DOS",
												comment: null,
												mimeType: "application/zip",
												encodeFileName: i.utf8encode
											})).type = n.type.toLowerCase(), n.compression = n.compression.toUpperCase(), n.type === "binarystring" && (n.type = "string"), !n.type) throw Error("No output type specified.");
											a.checkSupport(n.type), n.platform !== "darwin" && n.platform !== "freebsd" && n.platform !== "linux" && n.platform !== "sunos" || (n.platform = "UNIX"), n.platform === "win32" && (n.platform = "DOS");
											var r = n.comment || this.comment || "";
											t = d.generateWorker(this, n, r);
										} catch (e) {
											(t = new o("error")).error(e);
										}
										return new s(t, n.type || "string", n.mimeType);
									},
									generateAsync: function(e, t) {
										return this.generateInternalStream(e).accumulate(t);
									},
									generateNodeStream: function(e, t) {
										return (e ||= {}).type || (e.type = "nodebuffer"), this.generateInternalStream(e).toNodejsStream(t);
									}
								};
							}, {
								"./compressedObject": 2,
								"./defaults": 5,
								"./generate": 9,
								"./nodejs/NodejsStreamInputAdapter": 12,
								"./nodejsUtils": 14,
								"./stream/GenericWorker": 28,
								"./stream/StreamHelper": 29,
								"./utf8": 31,
								"./utils": 32,
								"./zipObject": 35
							}],
							16: [function(e, t, n) {
								t.exports = e("stream");
							}, { stream: void 0 }],
							17: [function(e, t, n) {
								var r = e("./DataReader");
								function i(e) {
									r.call(this, e);
									for (var t = 0; t < this.data.length; t++) e[t] = 255 & e[t];
								}
								e("../utils").inherits(i, r), i.prototype.byteAt = function(e) {
									return this.data[this.zero + e];
								}, i.prototype.lastIndexOfSignature = function(e) {
									for (var t = e.charCodeAt(0), n = e.charCodeAt(1), r = e.charCodeAt(2), i = e.charCodeAt(3), a = this.length - 4; 0 <= a; --a) if (this.data[a] === t && this.data[a + 1] === n && this.data[a + 2] === r && this.data[a + 3] === i) return a - this.zero;
									return -1;
								}, i.prototype.readAndCheckSignature = function(e) {
									var t = e.charCodeAt(0), n = e.charCodeAt(1), r = e.charCodeAt(2), i = e.charCodeAt(3), a = this.readData(4);
									return t === a[0] && n === a[1] && r === a[2] && i === a[3];
								}, i.prototype.readData = function(e) {
									if (this.checkOffset(e), e === 0) return [];
									var t = this.data.slice(this.zero + this.index, this.zero + this.index + e);
									return this.index += e, t;
								}, t.exports = i;
							}, {
								"../utils": 32,
								"./DataReader": 18
							}],
							18: [function(e, t, n) {
								var r = e("../utils");
								function i(e) {
									this.data = e, this.length = e.length, this.index = 0, this.zero = 0;
								}
								i.prototype = {
									checkOffset: function(e) {
										this.checkIndex(this.index + e);
									},
									checkIndex: function(e) {
										if (this.length < this.zero + e || e < 0) throw Error("End of data reached (data length = " + this.length + ", asked index = " + e + "). Corrupted zip ?");
									},
									setIndex: function(e) {
										this.checkIndex(e), this.index = e;
									},
									skip: function(e) {
										this.setIndex(this.index + e);
									},
									byteAt: function(e) {},
									readInt: function(e) {
										var t, n = 0;
										for (this.checkOffset(e), t = this.index + e - 1; t >= this.index; t--) n = (n << 8) + this.byteAt(t);
										return this.index += e, n;
									},
									readString: function(e) {
										return r.transformTo("string", this.readData(e));
									},
									readData: function(e) {},
									lastIndexOfSignature: function(e) {},
									readAndCheckSignature: function(e) {},
									readDate: function() {
										var e = this.readInt(4);
										return new Date(Date.UTC(1980 + (e >> 25 & 127), (e >> 21 & 15) - 1, e >> 16 & 31, e >> 11 & 31, e >> 5 & 63, (31 & e) << 1));
									}
								}, t.exports = i;
							}, { "../utils": 32 }],
							19: [function(e, t, n) {
								var r = e("./Uint8ArrayReader");
								function i(e) {
									r.call(this, e);
								}
								e("../utils").inherits(i, r), i.prototype.readData = function(e) {
									this.checkOffset(e);
									var t = this.data.slice(this.zero + this.index, this.zero + this.index + e);
									return this.index += e, t;
								}, t.exports = i;
							}, {
								"../utils": 32,
								"./Uint8ArrayReader": 21
							}],
							20: [function(e, t, n) {
								var r = e("./DataReader");
								function i(e) {
									r.call(this, e);
								}
								e("../utils").inherits(i, r), i.prototype.byteAt = function(e) {
									return this.data.charCodeAt(this.zero + e);
								}, i.prototype.lastIndexOfSignature = function(e) {
									return this.data.lastIndexOf(e) - this.zero;
								}, i.prototype.readAndCheckSignature = function(e) {
									return e === this.readData(4);
								}, i.prototype.readData = function(e) {
									this.checkOffset(e);
									var t = this.data.slice(this.zero + this.index, this.zero + this.index + e);
									return this.index += e, t;
								}, t.exports = i;
							}, {
								"../utils": 32,
								"./DataReader": 18
							}],
							21: [function(e, t, n) {
								var r = e("./ArrayReader");
								function i(e) {
									r.call(this, e);
								}
								e("../utils").inherits(i, r), i.prototype.readData = function(e) {
									if (this.checkOffset(e), e === 0) return /* @__PURE__ */ new Uint8Array();
									var t = this.data.subarray(this.zero + this.index, this.zero + this.index + e);
									return this.index += e, t;
								}, t.exports = i;
							}, {
								"../utils": 32,
								"./ArrayReader": 17
							}],
							22: [function(e, t, n) {
								var r = e("../utils"), i = e("../support"), a = e("./ArrayReader"), o = e("./StringReader"), s = e("./NodeBufferReader"), c = e("./Uint8ArrayReader");
								t.exports = function(e) {
									var t = r.getTypeOf(e);
									return r.checkSupport(t), t !== "string" || i.uint8array ? t === "nodebuffer" ? new s(e) : i.uint8array ? new c(r.transformTo("uint8array", e)) : new a(r.transformTo("array", e)) : new o(e);
								};
							}, {
								"../support": 30,
								"../utils": 32,
								"./ArrayReader": 17,
								"./NodeBufferReader": 19,
								"./StringReader": 20,
								"./Uint8ArrayReader": 21
							}],
							23: [function(e, t, n) {
								n.LOCAL_FILE_HEADER = "PK", n.CENTRAL_FILE_HEADER = "PK", n.CENTRAL_DIRECTORY_END = "PK", n.ZIP64_CENTRAL_DIRECTORY_LOCATOR = "PK\x07", n.ZIP64_CENTRAL_DIRECTORY_END = "PK", n.DATA_DESCRIPTOR = "PK\x07\b";
							}, {}],
							24: [function(e, t, n) {
								var r = e("./GenericWorker"), i = e("../utils");
								function a(e) {
									r.call(this, "ConvertWorker to " + e), this.destType = e;
								}
								i.inherits(a, r), a.prototype.processChunk = function(e) {
									this.push({
										data: i.transformTo(this.destType, e.data),
										meta: e.meta
									});
								}, t.exports = a;
							}, {
								"../utils": 32,
								"./GenericWorker": 28
							}],
							25: [function(e, t, n) {
								var r = e("./GenericWorker"), i = e("../crc32");
								function a() {
									r.call(this, "Crc32Probe"), this.withStreamInfo("crc32", 0);
								}
								e("../utils").inherits(a, r), a.prototype.processChunk = function(e) {
									this.streamInfo.crc32 = i(e.data, this.streamInfo.crc32 || 0), this.push(e);
								}, t.exports = a;
							}, {
								"../crc32": 4,
								"../utils": 32,
								"./GenericWorker": 28
							}],
							26: [function(e, t, n) {
								var r = e("../utils"), i = e("./GenericWorker");
								function a(e) {
									i.call(this, "DataLengthProbe for " + e), this.propName = e, this.withStreamInfo(e, 0);
								}
								r.inherits(a, i), a.prototype.processChunk = function(e) {
									if (e) {
										var t = this.streamInfo[this.propName] || 0;
										this.streamInfo[this.propName] = t + e.data.length;
									}
									i.prototype.processChunk.call(this, e);
								}, t.exports = a;
							}, {
								"../utils": 32,
								"./GenericWorker": 28
							}],
							27: [function(e, t, n) {
								var r = e("../utils"), i = e("./GenericWorker");
								function a(e) {
									i.call(this, "DataWorker");
									var t = this;
									this.dataIsReady = !1, this.index = 0, this.max = 0, this.data = null, this.type = "", this._tickScheduled = !1, e.then(function(e) {
										t.dataIsReady = !0, t.data = e, t.max = e && e.length || 0, t.type = r.getTypeOf(e), t.isPaused || t._tickAndRepeat();
									}, function(e) {
										t.error(e);
									});
								}
								r.inherits(a, i), a.prototype.cleanUp = function() {
									i.prototype.cleanUp.call(this), this.data = null;
								}, a.prototype.resume = function() {
									return !!i.prototype.resume.call(this) && (!this._tickScheduled && this.dataIsReady && (this._tickScheduled = !0, r.delay(this._tickAndRepeat, [], this)), !0);
								}, a.prototype._tickAndRepeat = function() {
									this._tickScheduled = !1, this.isPaused || this.isFinished || (this._tick(), this.isFinished || (r.delay(this._tickAndRepeat, [], this), this._tickScheduled = !0));
								}, a.prototype._tick = function() {
									if (this.isPaused || this.isFinished) return !1;
									var e = null, t = Math.min(this.max, this.index + 16384);
									if (this.index >= this.max) return this.end();
									switch (this.type) {
										case "string":
											e = this.data.substring(this.index, t);
											break;
										case "uint8array":
											e = this.data.subarray(this.index, t);
											break;
										case "array":
										case "nodebuffer": e = this.data.slice(this.index, t);
									}
									return this.index = t, this.push({
										data: e,
										meta: { percent: this.max ? this.index / this.max * 100 : 0 }
									});
								}, t.exports = a;
							}, {
								"../utils": 32,
								"./GenericWorker": 28
							}],
							28: [function(e, t, n) {
								function r(e) {
									this.name = e || "default", this.streamInfo = {}, this.generatedError = null, this.extraStreamInfo = {}, this.isPaused = !0, this.isFinished = !1, this.isLocked = !1, this._listeners = {
										data: [],
										end: [],
										error: []
									}, this.previous = null;
								}
								r.prototype = {
									push: function(e) {
										this.emit("data", e);
									},
									end: function() {
										if (this.isFinished) return !1;
										this.flush();
										try {
											this.emit("end"), this.cleanUp(), this.isFinished = !0;
										} catch (e) {
											this.emit("error", e);
										}
										return !0;
									},
									error: function(e) {
										return !this.isFinished && (this.isPaused ? this.generatedError = e : (this.isFinished = !0, this.emit("error", e), this.previous && this.previous.error(e), this.cleanUp()), !0);
									},
									on: function(e, t) {
										return this._listeners[e].push(t), this;
									},
									cleanUp: function() {
										this.streamInfo = this.generatedError = this.extraStreamInfo = null, this._listeners = [];
									},
									emit: function(e, t) {
										if (this._listeners[e]) for (var n = 0; n < this._listeners[e].length; n++) this._listeners[e][n].call(this, t);
									},
									pipe: function(e) {
										return e.registerPrevious(this);
									},
									registerPrevious: function(e) {
										if (this.isLocked) throw Error("The stream '" + this + "' has already been used.");
										this.streamInfo = e.streamInfo, this.mergeStreamInfo(), this.previous = e;
										var t = this;
										return e.on("data", function(e) {
											t.processChunk(e);
										}), e.on("end", function() {
											t.end();
										}), e.on("error", function(e) {
											t.error(e);
										}), this;
									},
									pause: function() {
										return !this.isPaused && !this.isFinished && (this.isPaused = !0, this.previous && this.previous.pause(), !0);
									},
									resume: function() {
										if (!this.isPaused || this.isFinished) return !1;
										var e = this.isPaused = !1;
										return this.generatedError && (this.error(this.generatedError), e = !0), this.previous && this.previous.resume(), !e;
									},
									flush: function() {},
									processChunk: function(e) {
										this.push(e);
									},
									withStreamInfo: function(e, t) {
										return this.extraStreamInfo[e] = t, this.mergeStreamInfo(), this;
									},
									mergeStreamInfo: function() {
										for (var e in this.extraStreamInfo) this.extraStreamInfo.hasOwnProperty(e) && (this.streamInfo[e] = this.extraStreamInfo[e]);
									},
									lock: function() {
										if (this.isLocked) throw Error("The stream '" + this + "' has already been used.");
										this.isLocked = !0, this.previous && this.previous.lock();
									},
									toString: function() {
										var e = "Worker " + this.name;
										return this.previous ? this.previous + " -> " + e : e;
									}
								}, t.exports = r;
							}, {}],
							29: [function(e, t, n) {
								var r = e("../utils"), i = e("./ConvertWorker"), o = e("./GenericWorker"), s = e("../base64"), c = e("../support"), l = e("../external"), u = null;
								if (c.nodestream) try {
									u = e("../nodejs/NodejsStreamOutputAdapter");
								} catch {}
								function d(e, t) {
									return new l.Promise(function(n, i) {
										var o = [], c = e._internalType, l = e._outputType, u = e._mimeType;
										e.on("data", function(e, n) {
											o.push(e), t && t(n);
										}).on("error", function(e) {
											o = [], i(e);
										}).on("end", function() {
											try {
												n(function(e, t, n) {
													switch (e) {
														case "blob": return r.newBlob(r.transformTo("arraybuffer", t), n);
														case "base64": return s.encode(t);
														default: return r.transformTo(e, t);
													}
												}(l, function(e, t) {
													var n, r = 0, i = null, o = 0;
													for (n = 0; n < t.length; n++) o += t[n].length;
													switch (e) {
														case "string": return t.join("");
														case "array": return Array.prototype.concat.apply([], t);
														case "uint8array":
															for (i = new Uint8Array(o), n = 0; n < t.length; n++) i.set(t[n], r), r += t[n].length;
															return i;
														case "nodebuffer": return a.concat(t);
														default: throw Error("concat : unsupported type '" + e + "'");
													}
												}(c, o), u));
											} catch (e) {
												i(e);
											}
											o = [];
										}).resume();
									});
								}
								function f(e, t, n) {
									var a = t;
									switch (t) {
										case "blob":
										case "arraybuffer":
											a = "uint8array";
											break;
										case "base64": a = "string";
									}
									try {
										this._internalType = a, this._outputType = t, this._mimeType = n, r.checkSupport(a), this._worker = e.pipe(new i(a)), e.lock();
									} catch (e) {
										this._worker = new o("error"), this._worker.error(e);
									}
								}
								f.prototype = {
									accumulate: function(e) {
										return d(this, e);
									},
									on: function(e, t) {
										var n = this;
										return e === "data" ? this._worker.on(e, function(e) {
											t.call(n, e.data, e.meta);
										}) : this._worker.on(e, function() {
											r.delay(t, arguments, n);
										}), this;
									},
									resume: function() {
										return r.delay(this._worker.resume, [], this._worker), this;
									},
									pause: function() {
										return this._worker.pause(), this;
									},
									toNodejsStream: function(e) {
										if (r.checkSupport("nodestream"), this._outputType !== "nodebuffer") throw Error(this._outputType + " is not supported by this method");
										return new u(this, { objectMode: this._outputType !== "nodebuffer" }, e);
									}
								}, t.exports = f;
							}, {
								"../base64": 1,
								"../external": 6,
								"../nodejs/NodejsStreamOutputAdapter": 13,
								"../support": 30,
								"../utils": 32,
								"./ConvertWorker": 24,
								"./GenericWorker": 28
							}],
							30: [function(e, t, n) {
								if (n.base64 = !0, n.array = !0, n.string = !0, n.arraybuffer = typeof ArrayBuffer < "u" && typeof Uint8Array < "u", n.nodebuffer = a !== void 0, n.uint8array = typeof Uint8Array < "u", typeof ArrayBuffer > "u") n.blob = !1;
								else {
									var r = /* @__PURE__ */ new ArrayBuffer(0);
									try {
										n.blob = new Blob([r], { type: "application/zip" }).size === 0;
									} catch {
										try {
											var i = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
											i.append(r), n.blob = i.getBlob("application/zip").size === 0;
										} catch {
											n.blob = !1;
										}
									}
								}
								try {
									n.nodestream = !!e("readable-stream").Readable;
								} catch {
									n.nodestream = !1;
								}
							}, { "readable-stream": 16 }],
							31: [function(e, t, n) {
								for (var r = e("./utils"), i = e("./support"), a = e("./nodejsUtils"), o = e("./stream/GenericWorker"), s = Array(256), c = 0; c < 256; c++) s[c] = 252 <= c ? 6 : 248 <= c ? 5 : 240 <= c ? 4 : 224 <= c ? 3 : 192 <= c ? 2 : 1;
								s[254] = s[254] = 1;
								function l() {
									o.call(this, "utf-8 decode"), this.leftOver = null;
								}
								function u() {
									o.call(this, "utf-8 encode");
								}
								n.utf8encode = function(e) {
									return i.nodebuffer ? a.newBufferFrom(e, "utf-8") : function(e) {
										var t, n, r, a, o, s = e.length, c = 0;
										for (a = 0; a < s; a++) (64512 & (n = e.charCodeAt(a))) == 55296 && a + 1 < s && (64512 & (r = e.charCodeAt(a + 1))) == 56320 && (n = 65536 + (n - 55296 << 10) + (r - 56320), a++), c += n < 128 ? 1 : n < 2048 ? 2 : n < 65536 ? 3 : 4;
										for (t = i.uint8array ? new Uint8Array(c) : Array(c), a = o = 0; o < c; a++) (64512 & (n = e.charCodeAt(a))) == 55296 && a + 1 < s && (64512 & (r = e.charCodeAt(a + 1))) == 56320 && (n = 65536 + (n - 55296 << 10) + (r - 56320), a++), n < 128 ? t[o++] = n : (n < 2048 ? t[o++] = 192 | n >>> 6 : (n < 65536 ? t[o++] = 224 | n >>> 12 : (t[o++] = 240 | n >>> 18, t[o++] = 128 | n >>> 12 & 63), t[o++] = 128 | n >>> 6 & 63), t[o++] = 128 | 63 & n);
										return t;
									}(e);
								}, n.utf8decode = function(e) {
									return i.nodebuffer ? r.transformTo("nodebuffer", e).toString("utf-8") : function(e) {
										var t, n, i, a, o = e.length, c = Array(2 * o);
										for (t = n = 0; t < o;) if ((i = e[t++]) < 128) c[n++] = i;
										else if (4 < (a = s[i])) c[n++] = 65533, t += a - 1;
										else {
											for (i &= a === 2 ? 31 : a === 3 ? 15 : 7; 1 < a && t < o;) i = i << 6 | 63 & e[t++], a--;
											1 < a ? c[n++] = 65533 : i < 65536 ? c[n++] = i : (i -= 65536, c[n++] = 55296 | i >> 10 & 1023, c[n++] = 56320 | 1023 & i);
										}
										return c.length !== n && (c.subarray ? c = c.subarray(0, n) : c.length = n), r.applyFromCharCode(c);
									}(e = r.transformTo(i.uint8array ? "uint8array" : "array", e));
								}, r.inherits(l, o), l.prototype.processChunk = function(e) {
									var t = r.transformTo(i.uint8array ? "uint8array" : "array", e.data);
									if (this.leftOver && this.leftOver.length) {
										if (i.uint8array) {
											var a = t;
											(t = new Uint8Array(a.length + this.leftOver.length)).set(this.leftOver, 0), t.set(a, this.leftOver.length);
										} else t = this.leftOver.concat(t);
										this.leftOver = null;
									}
									var o = function(e, t) {
										var n;
										for ((t ||= e.length) > e.length && (t = e.length), n = t - 1; 0 <= n && (192 & e[n]) == 128;) n--;
										return n < 0 || n === 0 ? t : n + s[e[n]] > t ? n : t;
									}(t), c = t;
									o !== t.length && (i.uint8array ? (c = t.subarray(0, o), this.leftOver = t.subarray(o, t.length)) : (c = t.slice(0, o), this.leftOver = t.slice(o, t.length))), this.push({
										data: n.utf8decode(c),
										meta: e.meta
									});
								}, l.prototype.flush = function() {
									this.leftOver && this.leftOver.length && (this.push({
										data: n.utf8decode(this.leftOver),
										meta: {}
									}), this.leftOver = null);
								}, n.Utf8DecodeWorker = l, r.inherits(u, o), u.prototype.processChunk = function(e) {
									this.push({
										data: n.utf8encode(e.data),
										meta: e.meta
									});
								}, n.Utf8EncodeWorker = u;
							}, {
								"./nodejsUtils": 14,
								"./stream/GenericWorker": 28,
								"./support": 30,
								"./utils": 32
							}],
							32: [function(e, t, n) {
								var r = e("./support"), i = e("./base64"), a = e("./nodejsUtils"), o = e("set-immediate-shim"), s = e("./external");
								function c(e) {
									return e;
								}
								function l(e, t) {
									for (var n = 0; n < e.length; ++n) t[n] = 255 & e.charCodeAt(n);
									return t;
								}
								n.newBlob = function(e, t) {
									n.checkSupport("blob");
									try {
										return new Blob([e], { type: t });
									} catch {
										try {
											var r = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
											return r.append(e), r.getBlob(t);
										} catch {
											throw Error("Bug : can't construct the Blob.");
										}
									}
								};
								var u = {
									stringifyByChunk: function(e, t, n) {
										var r = [], i = 0, a = e.length;
										if (a <= n) return String.fromCharCode.apply(null, e);
										for (; i < a;) t === "array" || t === "nodebuffer" ? r.push(String.fromCharCode.apply(null, e.slice(i, Math.min(i + n, a)))) : r.push(String.fromCharCode.apply(null, e.subarray(i, Math.min(i + n, a)))), i += n;
										return r.join("");
									},
									stringifyByChar: function(e) {
										for (var t = "", n = 0; n < e.length; n++) t += String.fromCharCode(e[n]);
										return t;
									},
									applyCanBeUsed: {
										uint8array: function() {
											try {
												return r.uint8array && String.fromCharCode.apply(null, /* @__PURE__ */ new Uint8Array(1)).length === 1;
											} catch {
												return !1;
											}
										}(),
										nodebuffer: function() {
											try {
												return r.nodebuffer && String.fromCharCode.apply(null, a.allocBuffer(1)).length === 1;
											} catch {
												return !1;
											}
										}()
									}
								};
								function d(e) {
									var t = 65536, r = n.getTypeOf(e), i = !0;
									if (r === "uint8array" ? i = u.applyCanBeUsed.uint8array : r === "nodebuffer" && (i = u.applyCanBeUsed.nodebuffer), i) for (; 1 < t;) try {
										return u.stringifyByChunk(e, r, t);
									} catch {
										t = Math.floor(t / 2);
									}
									return u.stringifyByChar(e);
								}
								function f(e, t) {
									for (var n = 0; n < e.length; n++) t[n] = e[n];
									return t;
								}
								n.applyFromCharCode = d;
								var p = {};
								p.string = {
									string: c,
									array: function(e) {
										return l(e, Array(e.length));
									},
									arraybuffer: function(e) {
										return p.string.uint8array(e).buffer;
									},
									uint8array: function(e) {
										return l(e, new Uint8Array(e.length));
									},
									nodebuffer: function(e) {
										return l(e, a.allocBuffer(e.length));
									}
								}, p.array = {
									string: d,
									array: c,
									arraybuffer: function(e) {
										return new Uint8Array(e).buffer;
									},
									uint8array: function(e) {
										return new Uint8Array(e);
									},
									nodebuffer: function(e) {
										return a.newBufferFrom(e);
									}
								}, p.arraybuffer = {
									string: function(e) {
										return d(new Uint8Array(e));
									},
									array: function(e) {
										return f(new Uint8Array(e), Array(e.byteLength));
									},
									arraybuffer: c,
									uint8array: function(e) {
										return new Uint8Array(e);
									},
									nodebuffer: function(e) {
										return a.newBufferFrom(new Uint8Array(e));
									}
								}, p.uint8array = {
									string: d,
									array: function(e) {
										return f(e, Array(e.length));
									},
									arraybuffer: function(e) {
										return e.buffer;
									},
									uint8array: c,
									nodebuffer: function(e) {
										return a.newBufferFrom(e);
									}
								}, p.nodebuffer = {
									string: d,
									array: function(e) {
										return f(e, Array(e.length));
									},
									arraybuffer: function(e) {
										return p.nodebuffer.uint8array(e).buffer;
									},
									uint8array: function(e) {
										return f(e, new Uint8Array(e.length));
									},
									nodebuffer: c
								}, n.transformTo = function(e, t) {
									return t ||= "", e ? (n.checkSupport(e), p[n.getTypeOf(t)][e](t)) : t;
								}, n.getTypeOf = function(e) {
									return typeof e == "string" ? "string" : Object.prototype.toString.call(e) === "[object Array]" ? "array" : r.nodebuffer && a.isBuffer(e) ? "nodebuffer" : r.uint8array && e instanceof Uint8Array ? "uint8array" : r.arraybuffer && e instanceof ArrayBuffer ? "arraybuffer" : void 0;
								}, n.checkSupport = function(e) {
									if (!r[e.toLowerCase()]) throw Error(e + " is not supported by this platform");
								}, n.MAX_VALUE_16BITS = 65535, n.MAX_VALUE_32BITS = -1, n.pretty = function(e) {
									var t, n, r = "";
									for (n = 0; n < (e || "").length; n++) r += "\\x" + ((t = e.charCodeAt(n)) < 16 ? "0" : "") + t.toString(16).toUpperCase();
									return r;
								}, n.delay = function(e, t, n) {
									o(function() {
										e.apply(n || null, t || []);
									});
								}, n.inherits = function(e, t) {
									function n() {}
									n.prototype = t.prototype, e.prototype = new n();
								}, n.extend = function() {
									var e, t, n = {};
									for (e = 0; e < arguments.length; e++) for (t in arguments[e]) arguments[e].hasOwnProperty(t) && n[t] === void 0 && (n[t] = arguments[e][t]);
									return n;
								}, n.prepareContent = function(e, t, a, o, c) {
									return s.Promise.resolve(t).then(function(e) {
										return r.blob && (e instanceof Blob || ["[object File]", "[object Blob]"].indexOf(Object.prototype.toString.call(e)) !== -1) && typeof FileReader < "u" ? new s.Promise(function(t, n) {
											var r = new FileReader();
											r.onload = function(e) {
												t(e.target.result);
											}, r.onerror = function(e) {
												n(e.target.error);
											}, r.readAsArrayBuffer(e);
										}) : e;
									}).then(function(t) {
										var u = n.getTypeOf(t);
										return u ? (u === "arraybuffer" ? t = n.transformTo("uint8array", t) : u === "string" && (c ? t = i.decode(t) : a && !0 !== o && (t = function(e) {
											return l(e, r.uint8array ? new Uint8Array(e.length) : Array(e.length));
										}(t))), t) : s.Promise.reject(/* @__PURE__ */ Error("Can't read the data of '" + e + "'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?"));
									});
								};
							}, {
								"./base64": 1,
								"./external": 6,
								"./nodejsUtils": 14,
								"./support": 30,
								"set-immediate-shim": 54
							}],
							33: [function(e, t, n) {
								var r = e("./reader/readerFor"), i = e("./utils"), a = e("./signature"), o = e("./zipEntry"), s = (e("./utf8"), e("./support"));
								function c(e) {
									this.files = [], this.loadOptions = e;
								}
								c.prototype = {
									checkSignature: function(e) {
										if (!this.reader.readAndCheckSignature(e)) {
											this.reader.index -= 4;
											var t = this.reader.readString(4);
											throw Error("Corrupted zip or bug: unexpected signature (" + i.pretty(t) + ", expected " + i.pretty(e) + ")");
										}
									},
									isSignature: function(e, t) {
										var n = this.reader.index;
										this.reader.setIndex(e);
										var r = this.reader.readString(4) === t;
										return this.reader.setIndex(n), r;
									},
									readBlockEndOfCentral: function() {
										this.diskNumber = this.reader.readInt(2), this.diskWithCentralDirStart = this.reader.readInt(2), this.centralDirRecordsOnThisDisk = this.reader.readInt(2), this.centralDirRecords = this.reader.readInt(2), this.centralDirSize = this.reader.readInt(4), this.centralDirOffset = this.reader.readInt(4), this.zipCommentLength = this.reader.readInt(2);
										var e = this.reader.readData(this.zipCommentLength), t = s.uint8array ? "uint8array" : "array", n = i.transformTo(t, e);
										this.zipComment = this.loadOptions.decodeFileName(n);
									},
									readBlockZip64EndOfCentral: function() {
										this.zip64EndOfCentralSize = this.reader.readInt(8), this.reader.skip(4), this.diskNumber = this.reader.readInt(4), this.diskWithCentralDirStart = this.reader.readInt(4), this.centralDirRecordsOnThisDisk = this.reader.readInt(8), this.centralDirRecords = this.reader.readInt(8), this.centralDirSize = this.reader.readInt(8), this.centralDirOffset = this.reader.readInt(8), this.zip64ExtensibleData = {};
										for (var e, t, n, r = this.zip64EndOfCentralSize - 44; 0 < r;) e = this.reader.readInt(2), t = this.reader.readInt(4), n = this.reader.readData(t), this.zip64ExtensibleData[e] = {
											id: e,
											length: t,
											value: n
										};
									},
									readBlockZip64EndOfCentralLocator: function() {
										if (this.diskWithZip64CentralDirStart = this.reader.readInt(4), this.relativeOffsetEndOfZip64CentralDir = this.reader.readInt(8), this.disksCount = this.reader.readInt(4), 1 < this.disksCount) throw Error("Multi-volumes zip are not supported");
									},
									readLocalFiles: function() {
										for (var e = 0, t; e < this.files.length; e++) t = this.files[e], this.reader.setIndex(t.localHeaderOffset), this.checkSignature(a.LOCAL_FILE_HEADER), t.readLocalPart(this.reader), t.handleUTF8(), t.processAttributes();
									},
									readCentralDir: function() {
										var e;
										for (this.reader.setIndex(this.centralDirOffset); this.reader.readAndCheckSignature(a.CENTRAL_FILE_HEADER);) (e = new o({ zip64: this.zip64 }, this.loadOptions)).readCentralPart(this.reader), this.files.push(e);
										if (this.centralDirRecords !== this.files.length && this.centralDirRecords !== 0 && this.files.length === 0) throw Error("Corrupted zip or bug: expected " + this.centralDirRecords + " records in central dir, got " + this.files.length);
									},
									readEndOfCentral: function() {
										var e = this.reader.lastIndexOfSignature(a.CENTRAL_DIRECTORY_END);
										if (e < 0) throw this.isSignature(0, a.LOCAL_FILE_HEADER) ? /* @__PURE__ */ Error("Corrupted zip: can't find end of central directory") : /* @__PURE__ */ Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html");
										this.reader.setIndex(e);
										var t = e;
										if (this.checkSignature(a.CENTRAL_DIRECTORY_END), this.readBlockEndOfCentral(), this.diskNumber === i.MAX_VALUE_16BITS || this.diskWithCentralDirStart === i.MAX_VALUE_16BITS || this.centralDirRecordsOnThisDisk === i.MAX_VALUE_16BITS || this.centralDirRecords === i.MAX_VALUE_16BITS || this.centralDirSize === i.MAX_VALUE_32BITS || this.centralDirOffset === i.MAX_VALUE_32BITS) {
											if (this.zip64 = !0, (e = this.reader.lastIndexOfSignature(a.ZIP64_CENTRAL_DIRECTORY_LOCATOR)) < 0) throw Error("Corrupted zip: can't find the ZIP64 end of central directory locator");
											if (this.reader.setIndex(e), this.checkSignature(a.ZIP64_CENTRAL_DIRECTORY_LOCATOR), this.readBlockZip64EndOfCentralLocator(), !this.isSignature(this.relativeOffsetEndOfZip64CentralDir, a.ZIP64_CENTRAL_DIRECTORY_END) && (this.relativeOffsetEndOfZip64CentralDir = this.reader.lastIndexOfSignature(a.ZIP64_CENTRAL_DIRECTORY_END), this.relativeOffsetEndOfZip64CentralDir < 0)) throw Error("Corrupted zip: can't find the ZIP64 end of central directory");
											this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir), this.checkSignature(a.ZIP64_CENTRAL_DIRECTORY_END), this.readBlockZip64EndOfCentral();
										}
										var n = this.centralDirOffset + this.centralDirSize;
										this.zip64 && (n += 20, n += 12 + this.zip64EndOfCentralSize);
										var r = t - n;
										if (0 < r) this.isSignature(t, a.CENTRAL_FILE_HEADER) || (this.reader.zero = r);
										else if (r < 0) throw Error("Corrupted zip: missing " + Math.abs(r) + " bytes.");
									},
									prepareReader: function(e) {
										this.reader = r(e);
									},
									load: function(e) {
										this.prepareReader(e), this.readEndOfCentral(), this.readCentralDir(), this.readLocalFiles();
									}
								}, t.exports = c;
							}, {
								"./reader/readerFor": 22,
								"./signature": 23,
								"./support": 30,
								"./utf8": 31,
								"./utils": 32,
								"./zipEntry": 34
							}],
							34: [function(e, t, n) {
								var r = e("./reader/readerFor"), i = e("./utils"), a = e("./compressedObject"), o = e("./crc32"), s = e("./utf8"), c = e("./compressions"), l = e("./support");
								function u(e, t) {
									this.options = e, this.loadOptions = t;
								}
								u.prototype = {
									isEncrypted: function() {
										return (1 & this.bitFlag) == 1;
									},
									useUTF8: function() {
										return (2048 & this.bitFlag) == 2048;
									},
									readLocalPart: function(e) {
										var t, n;
										if (e.skip(22), this.fileNameLength = e.readInt(2), n = e.readInt(2), this.fileName = e.readData(this.fileNameLength), e.skip(n), this.compressedSize === -1 || this.uncompressedSize === -1) throw Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");
										if ((t = function(e) {
											for (var t in c) if (c.hasOwnProperty(t) && c[t].magic === e) return c[t];
											return null;
										}(this.compressionMethod)) === null) throw Error("Corrupted zip : compression " + i.pretty(this.compressionMethod) + " unknown (inner file : " + i.transformTo("string", this.fileName) + ")");
										this.decompressed = new a(this.compressedSize, this.uncompressedSize, this.crc32, t, e.readData(this.compressedSize));
									},
									readCentralPart: function(e) {
										this.versionMadeBy = e.readInt(2), e.skip(2), this.bitFlag = e.readInt(2), this.compressionMethod = e.readString(2), this.date = e.readDate(), this.crc32 = e.readInt(4), this.compressedSize = e.readInt(4), this.uncompressedSize = e.readInt(4);
										var t = e.readInt(2);
										if (this.extraFieldsLength = e.readInt(2), this.fileCommentLength = e.readInt(2), this.diskNumberStart = e.readInt(2), this.internalFileAttributes = e.readInt(2), this.externalFileAttributes = e.readInt(4), this.localHeaderOffset = e.readInt(4), this.isEncrypted()) throw Error("Encrypted zip are not supported");
										e.skip(t), this.readExtraFields(e), this.parseZIP64ExtraField(e), this.fileComment = e.readData(this.fileCommentLength);
									},
									processAttributes: function() {
										this.unixPermissions = null, this.dosPermissions = null;
										var e = this.versionMadeBy >> 8;
										this.dir = !!(16 & this.externalFileAttributes), e == 0 && (this.dosPermissions = 63 & this.externalFileAttributes), e == 3 && (this.unixPermissions = this.externalFileAttributes >> 16 & 65535), this.dir || this.fileNameStr.slice(-1) !== "/" || (this.dir = !0);
									},
									parseZIP64ExtraField: function(e) {
										if (this.extraFields[1]) {
											var t = r(this.extraFields[1].value);
											this.uncompressedSize === i.MAX_VALUE_32BITS && (this.uncompressedSize = t.readInt(8)), this.compressedSize === i.MAX_VALUE_32BITS && (this.compressedSize = t.readInt(8)), this.localHeaderOffset === i.MAX_VALUE_32BITS && (this.localHeaderOffset = t.readInt(8)), this.diskNumberStart === i.MAX_VALUE_32BITS && (this.diskNumberStart = t.readInt(4));
										}
									},
									readExtraFields: function(e) {
										var t, n, r, i = e.index + this.extraFieldsLength;
										for (this.extraFields ||= {}; e.index + 4 < i;) t = e.readInt(2), n = e.readInt(2), r = e.readData(n), this.extraFields[t] = {
											id: t,
											length: n,
											value: r
										};
										e.setIndex(i);
									},
									handleUTF8: function() {
										var e = l.uint8array ? "uint8array" : "array";
										if (this.useUTF8()) this.fileNameStr = s.utf8decode(this.fileName), this.fileCommentStr = s.utf8decode(this.fileComment);
										else {
											var t = this.findExtraFieldUnicodePath();
											if (t !== null) this.fileNameStr = t;
											else {
												var n = i.transformTo(e, this.fileName);
												this.fileNameStr = this.loadOptions.decodeFileName(n);
											}
											var r = this.findExtraFieldUnicodeComment();
											if (r !== null) this.fileCommentStr = r;
											else {
												var a = i.transformTo(e, this.fileComment);
												this.fileCommentStr = this.loadOptions.decodeFileName(a);
											}
										}
									},
									findExtraFieldUnicodePath: function() {
										var e = this.extraFields[28789];
										if (e) {
											var t = r(e.value);
											return t.readInt(1) === 1 && o(this.fileName) === t.readInt(4) ? s.utf8decode(t.readData(e.length - 5)) : null;
										}
										return null;
									},
									findExtraFieldUnicodeComment: function() {
										var e = this.extraFields[25461];
										if (e) {
											var t = r(e.value);
											return t.readInt(1) === 1 && o(this.fileComment) === t.readInt(4) ? s.utf8decode(t.readData(e.length - 5)) : null;
										}
										return null;
									}
								}, t.exports = u;
							}, {
								"./compressedObject": 2,
								"./compressions": 3,
								"./crc32": 4,
								"./reader/readerFor": 22,
								"./support": 30,
								"./utf8": 31,
								"./utils": 32
							}],
							35: [function(e, t, n) {
								function r(e, t, n) {
									this.name = e, this.dir = n.dir, this.date = n.date, this.comment = n.comment, this.unixPermissions = n.unixPermissions, this.dosPermissions = n.dosPermissions, this._data = t, this._dataBinary = n.binary, this.options = {
										compression: n.compression,
										compressionOptions: n.compressionOptions
									};
								}
								var i = e("./stream/StreamHelper"), a = e("./stream/DataWorker"), o = e("./utf8"), s = e("./compressedObject"), c = e("./stream/GenericWorker");
								r.prototype = {
									internalStream: function(e) {
										var t = null, n = "string";
										try {
											if (!e) throw Error("No output type specified.");
											var r = (n = e.toLowerCase()) === "string" || n === "text";
											n !== "binarystring" && n !== "text" || (n = "string"), t = this._decompressWorker();
											var a = !this._dataBinary;
											a && !r && (t = t.pipe(new o.Utf8EncodeWorker())), !a && r && (t = t.pipe(new o.Utf8DecodeWorker()));
										} catch (e) {
											(t = new c("error")).error(e);
										}
										return new i(t, n, "");
									},
									async: function(e, t) {
										return this.internalStream(e).accumulate(t);
									},
									nodeStream: function(e, t) {
										return this.internalStream(e || "nodebuffer").toNodejsStream(t);
									},
									_compressWorker: function(e, t) {
										if (this._data instanceof s && this._data.compression.magic === e.magic) return this._data.getCompressedWorker();
										var n = this._decompressWorker();
										return this._dataBinary || (n = n.pipe(new o.Utf8EncodeWorker())), s.createWorkerFrom(n, e, t);
									},
									_decompressWorker: function() {
										return this._data instanceof s ? this._data.getContentWorker() : this._data instanceof c ? this._data : new a(this._data);
									}
								};
								for (var l = [
									"asText",
									"asBinary",
									"asNodeBuffer",
									"asUint8Array",
									"asArrayBuffer"
								], u = function() {
									throw Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
								}, d = 0; d < l.length; d++) r.prototype[l[d]] = u;
								t.exports = r;
							}, {
								"./compressedObject": 2,
								"./stream/DataWorker": 27,
								"./stream/GenericWorker": 28,
								"./stream/StreamHelper": 29,
								"./utf8": 31
							}],
							36: [function(e, t, n) {
								(function(e) {
									var n, r, i = e.MutationObserver || e.WebKitMutationObserver;
									if (i) {
										var a = 0, o = new i(u), s = e.document.createTextNode("");
										o.observe(s, { characterData: !0 }), n = function() {
											s.data = a = ++a % 2;
										};
									} else if (e.setImmediate || e.MessageChannel === void 0) n = "document" in e && "onreadystatechange" in e.document.createElement("script") ? function() {
										var t = e.document.createElement("script");
										t.onreadystatechange = function() {
											u(), t.onreadystatechange = null, t.parentNode.removeChild(t), t = null;
										}, e.document.documentElement.appendChild(t);
									} : function() {
										setTimeout(u, 0);
									};
									else {
										var c = new e.MessageChannel();
										c.port1.onmessage = u, n = function() {
											c.port2.postMessage(0);
										};
									}
									var l = [];
									function u() {
										var e, t;
										r = !0;
										for (var n = l.length; n;) {
											for (t = l, l = [], e = -1; ++e < n;) t[e]();
											n = l.length;
										}
										r = !1;
									}
									t.exports = function(e) {
										l.push(e) !== 1 || r || n();
									};
								}).call(this, i === void 0 ? typeof self < "u" ? self : typeof window < "u" ? window : {} : i);
							}, {}],
							37: [function(e, t, n) {
								var r = e("immediate");
								function i() {}
								var a = {}, o = ["REJECTED"], s = ["FULFILLED"], c = ["PENDING"];
								function l(e) {
									if (typeof e != "function") throw TypeError("resolver must be a function");
									this.state = c, this.queue = [], this.outcome = void 0, e !== i && p(this, e);
								}
								function u(e, t, n) {
									this.promise = e, typeof t == "function" && (this.onFulfilled = t, this.callFulfilled = this.otherCallFulfilled), typeof n == "function" && (this.onRejected = n, this.callRejected = this.otherCallRejected);
								}
								function d(e, t, n) {
									r(function() {
										var r;
										try {
											r = t(n);
										} catch (t) {
											return a.reject(e, t);
										}
										r === e ? a.reject(e, /* @__PURE__ */ TypeError("Cannot resolve promise with itself")) : a.resolve(e, r);
									});
								}
								function f(e) {
									var t = e && e.then;
									if (e && (typeof e == "object" || typeof e == "function") && typeof t == "function") return function() {
										t.apply(e, arguments);
									};
								}
								function p(e, t) {
									var n = !1;
									function r(t) {
										n || (n = !0, a.reject(e, t));
									}
									function i(t) {
										n || (n = !0, a.resolve(e, t));
									}
									var o = m(function() {
										t(i, r);
									});
									o.status === "error" && r(o.value);
								}
								function m(e, t) {
									var n = {};
									try {
										n.value = e(t), n.status = "success";
									} catch (e) {
										n.status = "error", n.value = e;
									}
									return n;
								}
								(t.exports = l).prototype.finally = function(e) {
									if (typeof e != "function") return this;
									var t = this.constructor;
									return this.then(function(n) {
										return t.resolve(e()).then(function() {
											return n;
										});
									}, function(n) {
										return t.resolve(e()).then(function() {
											throw n;
										});
									});
								}, l.prototype.catch = function(e) {
									return this.then(null, e);
								}, l.prototype.then = function(e, t) {
									if (typeof e != "function" && this.state === s || typeof t != "function" && this.state === o) return this;
									var n = new this.constructor(i);
									return this.state === c ? this.queue.push(new u(n, e, t)) : d(n, this.state === s ? e : t, this.outcome), n;
								}, u.prototype.callFulfilled = function(e) {
									a.resolve(this.promise, e);
								}, u.prototype.otherCallFulfilled = function(e) {
									d(this.promise, this.onFulfilled, e);
								}, u.prototype.callRejected = function(e) {
									a.reject(this.promise, e);
								}, u.prototype.otherCallRejected = function(e) {
									d(this.promise, this.onRejected, e);
								}, a.resolve = function(e, t) {
									var n = m(f, t);
									if (n.status === "error") return a.reject(e, n.value);
									var r = n.value;
									if (r) p(e, r);
									else {
										e.state = s, e.outcome = t;
										for (var i = -1, o = e.queue.length; ++i < o;) e.queue[i].callFulfilled(t);
									}
									return e;
								}, a.reject = function(e, t) {
									e.state = o, e.outcome = t;
									for (var n = -1, r = e.queue.length; ++n < r;) e.queue[n].callRejected(t);
									return e;
								}, l.resolve = function(e) {
									return e instanceof this ? e : a.resolve(new this(i), e);
								}, l.reject = function(e) {
									var t = new this(i);
									return a.reject(t, e);
								}, l.all = function(e) {
									var t = this;
									if (Object.prototype.toString.call(e) !== "[object Array]") return this.reject(/* @__PURE__ */ TypeError("must be an array"));
									var n = e.length, r = !1;
									if (!n) return this.resolve([]);
									for (var o = Array(n), s = 0, c = -1, l = new this(i); ++c < n;) u(e[c], c);
									return l;
									function u(e, i) {
										t.resolve(e).then(function(e) {
											o[i] = e, ++s !== n || r || (r = !0, a.resolve(l, o));
										}, function(e) {
											r || (r = !0, a.reject(l, e));
										});
									}
								}, l.race = function(e) {
									var t = this;
									if (Object.prototype.toString.call(e) !== "[object Array]") return this.reject(/* @__PURE__ */ TypeError("must be an array"));
									var n = e.length, r = !1;
									if (!n) return this.resolve([]);
									for (var o = -1, s = new this(i); ++o < n;) c = e[o], t.resolve(c).then(function(e) {
										r || (r = !0, a.resolve(s, e));
									}, function(e) {
										r || (r = !0, a.reject(s, e));
									});
									var c;
									return s;
								};
							}, { immediate: 36 }],
							38: [function(e, t, n) {
								var r = {};
								(0, e("./lib/utils/common").assign)(r, e("./lib/deflate"), e("./lib/inflate"), e("./lib/zlib/constants")), t.exports = r;
							}, {
								"./lib/deflate": 39,
								"./lib/inflate": 40,
								"./lib/utils/common": 41,
								"./lib/zlib/constants": 44
							}],
							39: [function(e, t, n) {
								var r = e("./zlib/deflate"), i = e("./utils/common"), a = e("./utils/strings"), o = e("./zlib/messages"), s = e("./zlib/zstream"), c = Object.prototype.toString, l = 0, u = -1, d = 0, f = 8;
								function p(e) {
									if (!(this instanceof p)) return new p(e);
									this.options = i.assign({
										level: u,
										method: f,
										chunkSize: 16384,
										windowBits: 15,
										memLevel: 8,
										strategy: d,
										to: ""
									}, e || {});
									var t = this.options;
									t.raw && 0 < t.windowBits ? t.windowBits = -t.windowBits : t.gzip && 0 < t.windowBits && t.windowBits < 16 && (t.windowBits += 16), this.err = 0, this.msg = "", this.ended = !1, this.chunks = [], this.strm = new s(), this.strm.avail_out = 0;
									var n = r.deflateInit2(this.strm, t.level, t.method, t.windowBits, t.memLevel, t.strategy);
									if (n !== l) throw Error(o[n]);
									if (t.header && r.deflateSetHeader(this.strm, t.header), t.dictionary) {
										var m = typeof t.dictionary == "string" ? a.string2buf(t.dictionary) : c.call(t.dictionary) === "[object ArrayBuffer]" ? new Uint8Array(t.dictionary) : t.dictionary;
										if ((n = r.deflateSetDictionary(this.strm, m)) !== l) throw Error(o[n]);
										this._dict_set = !0;
									}
								}
								function m(e, t) {
									var n = new p(t);
									if (n.push(e, !0), n.err) throw n.msg || o[n.err];
									return n.result;
								}
								p.prototype.push = function(e, t) {
									var n, o, s = this.strm, u = this.options.chunkSize;
									if (this.ended) return !1;
									o = t === ~~t ? t : !0 === t ? 4 : 0, s.input = typeof e == "string" ? a.string2buf(e) : c.call(e) === "[object ArrayBuffer]" ? new Uint8Array(e) : e, s.next_in = 0, s.avail_in = s.input.length;
									do {
										if (s.avail_out === 0 && (s.output = new i.Buf8(u), s.next_out = 0, s.avail_out = u), (n = r.deflate(s, o)) !== 1 && n !== l) return this.onEnd(n), !(this.ended = !0);
										s.avail_out !== 0 && (s.avail_in !== 0 || o !== 4 && o !== 2) || (this.options.to === "string" ? this.onData(a.buf2binstring(i.shrinkBuf(s.output, s.next_out))) : this.onData(i.shrinkBuf(s.output, s.next_out)));
									} while ((0 < s.avail_in || s.avail_out === 0) && n !== 1);
									return o === 4 ? (n = r.deflateEnd(this.strm), this.onEnd(n), this.ended = !0, n === l) : o !== 2 || (this.onEnd(l), !(s.avail_out = 0));
								}, p.prototype.onData = function(e) {
									this.chunks.push(e);
								}, p.prototype.onEnd = function(e) {
									e === l && (this.result = this.options.to === "string" ? this.chunks.join("") : i.flattenChunks(this.chunks)), this.chunks = [], this.err = e, this.msg = this.strm.msg;
								}, n.Deflate = p, n.deflate = m, n.deflateRaw = function(e, t) {
									return (t ||= {}).raw = !0, m(e, t);
								}, n.gzip = function(e, t) {
									return (t ||= {}).gzip = !0, m(e, t);
								};
							}, {
								"./utils/common": 41,
								"./utils/strings": 42,
								"./zlib/deflate": 46,
								"./zlib/messages": 51,
								"./zlib/zstream": 53
							}],
							40: [function(e, t, n) {
								var r = e("./zlib/inflate"), i = e("./utils/common"), a = e("./utils/strings"), o = e("./zlib/constants"), s = e("./zlib/messages"), c = e("./zlib/zstream"), l = e("./zlib/gzheader"), u = Object.prototype.toString;
								function d(e) {
									if (!(this instanceof d)) return new d(e);
									this.options = i.assign({
										chunkSize: 16384,
										windowBits: 0,
										to: ""
									}, e || {});
									var t = this.options;
									t.raw && 0 <= t.windowBits && t.windowBits < 16 && (t.windowBits = -t.windowBits, t.windowBits === 0 && (t.windowBits = -15)), !(0 <= t.windowBits && t.windowBits < 16) || e && e.windowBits || (t.windowBits += 32), 15 < t.windowBits && t.windowBits < 48 && !(15 & t.windowBits) && (t.windowBits |= 15), this.err = 0, this.msg = "", this.ended = !1, this.chunks = [], this.strm = new c(), this.strm.avail_out = 0;
									var n = r.inflateInit2(this.strm, t.windowBits);
									if (n !== o.Z_OK) throw Error(s[n]);
									this.header = new l(), r.inflateGetHeader(this.strm, this.header);
								}
								function f(e, t) {
									var n = new d(t);
									if (n.push(e, !0), n.err) throw n.msg || s[n.err];
									return n.result;
								}
								d.prototype.push = function(e, t) {
									var n, s, c, l, d, f, p = this.strm, m = this.options.chunkSize, h = this.options.dictionary, g = !1;
									if (this.ended) return !1;
									s = t === ~~t ? t : !0 === t ? o.Z_FINISH : o.Z_NO_FLUSH, p.input = typeof e == "string" ? a.binstring2buf(e) : u.call(e) === "[object ArrayBuffer]" ? new Uint8Array(e) : e, p.next_in = 0, p.avail_in = p.input.length;
									do {
										if (p.avail_out === 0 && (p.output = new i.Buf8(m), p.next_out = 0, p.avail_out = m), (n = r.inflate(p, o.Z_NO_FLUSH)) === o.Z_NEED_DICT && h && (f = typeof h == "string" ? a.string2buf(h) : u.call(h) === "[object ArrayBuffer]" ? new Uint8Array(h) : h, n = r.inflateSetDictionary(this.strm, f)), n === o.Z_BUF_ERROR && !0 === g && (n = o.Z_OK, g = !1), n !== o.Z_STREAM_END && n !== o.Z_OK) return this.onEnd(n), !(this.ended = !0);
										p.next_out && (p.avail_out !== 0 && n !== o.Z_STREAM_END && (p.avail_in !== 0 || s !== o.Z_FINISH && s !== o.Z_SYNC_FLUSH) || (this.options.to === "string" ? (c = a.utf8border(p.output, p.next_out), l = p.next_out - c, d = a.buf2string(p.output, c), p.next_out = l, p.avail_out = m - l, l && i.arraySet(p.output, p.output, c, l, 0), this.onData(d)) : this.onData(i.shrinkBuf(p.output, p.next_out)))), p.avail_in === 0 && p.avail_out === 0 && (g = !0);
									} while ((0 < p.avail_in || p.avail_out === 0) && n !== o.Z_STREAM_END);
									return n === o.Z_STREAM_END && (s = o.Z_FINISH), s === o.Z_FINISH ? (n = r.inflateEnd(this.strm), this.onEnd(n), this.ended = !0, n === o.Z_OK) : s !== o.Z_SYNC_FLUSH || (this.onEnd(o.Z_OK), !(p.avail_out = 0));
								}, d.prototype.onData = function(e) {
									this.chunks.push(e);
								}, d.prototype.onEnd = function(e) {
									e === o.Z_OK && (this.result = this.options.to === "string" ? this.chunks.join("") : i.flattenChunks(this.chunks)), this.chunks = [], this.err = e, this.msg = this.strm.msg;
								}, n.Inflate = d, n.inflate = f, n.inflateRaw = function(e, t) {
									return (t ||= {}).raw = !0, f(e, t);
								}, n.ungzip = f;
							}, {
								"./utils/common": 41,
								"./utils/strings": 42,
								"./zlib/constants": 44,
								"./zlib/gzheader": 47,
								"./zlib/inflate": 49,
								"./zlib/messages": 51,
								"./zlib/zstream": 53
							}],
							41: [function(e, t, n) {
								var r = typeof Uint8Array < "u" && typeof Uint16Array < "u" && typeof Int32Array < "u";
								n.assign = function(e) {
									for (var t = Array.prototype.slice.call(arguments, 1); t.length;) {
										var n = t.shift();
										if (n) {
											if (typeof n != "object") throw TypeError(n + "must be non-object");
											for (var r in n) n.hasOwnProperty(r) && (e[r] = n[r]);
										}
									}
									return e;
								}, n.shrinkBuf = function(e, t) {
									return e.length === t ? e : e.subarray ? e.subarray(0, t) : (e.length = t, e);
								};
								var i = {
									arraySet: function(e, t, n, r, i) {
										if (t.subarray && e.subarray) e.set(t.subarray(n, n + r), i);
										else for (var a = 0; a < r; a++) e[i + a] = t[n + a];
									},
									flattenChunks: function(e) {
										for (var t = r = 0, n = e.length, r, i, a, o; t < n; t++) r += e[t].length;
										for (o = new Uint8Array(r), t = i = 0, n = e.length; t < n; t++) a = e[t], o.set(a, i), i += a.length;
										return o;
									}
								}, a = {
									arraySet: function(e, t, n, r, i) {
										for (var a = 0; a < r; a++) e[i + a] = t[n + a];
									},
									flattenChunks: function(e) {
										return [].concat.apply([], e);
									}
								};
								n.setTyped = function(e) {
									e ? (n.Buf8 = Uint8Array, n.Buf16 = Uint16Array, n.Buf32 = Int32Array, n.assign(n, i)) : (n.Buf8 = Array, n.Buf16 = Array, n.Buf32 = Array, n.assign(n, a));
								}, n.setTyped(r);
							}, {}],
							42: [function(e, t, n) {
								var r = e("./common"), i = !0, a = !0;
								try {
									String.fromCharCode.apply(null, [0]);
								} catch {
									i = !1;
								}
								try {
									String.fromCharCode.apply(null, /* @__PURE__ */ new Uint8Array(1));
								} catch {
									a = !1;
								}
								for (var o = new r.Buf8(256), s = 0; s < 256; s++) o[s] = 252 <= s ? 6 : 248 <= s ? 5 : 240 <= s ? 4 : 224 <= s ? 3 : 192 <= s ? 2 : 1;
								function c(e, t) {
									if (t < 65537 && (e.subarray && a || !e.subarray && i)) return String.fromCharCode.apply(null, r.shrinkBuf(e, t));
									for (var n = "", o = 0; o < t; o++) n += String.fromCharCode(e[o]);
									return n;
								}
								o[254] = o[254] = 1, n.string2buf = function(e) {
									var t, n, i, a, o, s = e.length, c = 0;
									for (a = 0; a < s; a++) (64512 & (n = e.charCodeAt(a))) == 55296 && a + 1 < s && (64512 & (i = e.charCodeAt(a + 1))) == 56320 && (n = 65536 + (n - 55296 << 10) + (i - 56320), a++), c += n < 128 ? 1 : n < 2048 ? 2 : n < 65536 ? 3 : 4;
									for (t = new r.Buf8(c), a = o = 0; o < c; a++) (64512 & (n = e.charCodeAt(a))) == 55296 && a + 1 < s && (64512 & (i = e.charCodeAt(a + 1))) == 56320 && (n = 65536 + (n - 55296 << 10) + (i - 56320), a++), n < 128 ? t[o++] = n : (n < 2048 ? t[o++] = 192 | n >>> 6 : (n < 65536 ? t[o++] = 224 | n >>> 12 : (t[o++] = 240 | n >>> 18, t[o++] = 128 | n >>> 12 & 63), t[o++] = 128 | n >>> 6 & 63), t[o++] = 128 | 63 & n);
									return t;
								}, n.buf2binstring = function(e) {
									return c(e, e.length);
								}, n.binstring2buf = function(e) {
									for (var t = new r.Buf8(e.length), n = 0, i = t.length; n < i; n++) t[n] = e.charCodeAt(n);
									return t;
								}, n.buf2string = function(e, t) {
									var n, r, i, a, s = t || e.length, l = Array(2 * s);
									for (n = r = 0; n < s;) if ((i = e[n++]) < 128) l[r++] = i;
									else if (4 < (a = o[i])) l[r++] = 65533, n += a - 1;
									else {
										for (i &= a === 2 ? 31 : a === 3 ? 15 : 7; 1 < a && n < s;) i = i << 6 | 63 & e[n++], a--;
										1 < a ? l[r++] = 65533 : i < 65536 ? l[r++] = i : (i -= 65536, l[r++] = 55296 | i >> 10 & 1023, l[r++] = 56320 | 1023 & i);
									}
									return c(l, r);
								}, n.utf8border = function(e, t) {
									var n;
									for ((t ||= e.length) > e.length && (t = e.length), n = t - 1; 0 <= n && (192 & e[n]) == 128;) n--;
									return n < 0 || n === 0 ? t : n + o[e[n]] > t ? n : t;
								};
							}, { "./common": 41 }],
							43: [function(e, t, n) {
								t.exports = function(e, t, n, r) {
									for (var i = 65535 & e | 0, a = e >>> 16 & 65535 | 0, o = 0; n !== 0;) {
										for (n -= o = 2e3 < n ? 2e3 : n; a = a + (i = i + t[r++] | 0) | 0, --o;);
										i %= 65521, a %= 65521;
									}
									return i | a << 16 | 0;
								};
							}, {}],
							44: [function(e, t, n) {
								t.exports = {
									Z_NO_FLUSH: 0,
									Z_PARTIAL_FLUSH: 1,
									Z_SYNC_FLUSH: 2,
									Z_FULL_FLUSH: 3,
									Z_FINISH: 4,
									Z_BLOCK: 5,
									Z_TREES: 6,
									Z_OK: 0,
									Z_STREAM_END: 1,
									Z_NEED_DICT: 2,
									Z_ERRNO: -1,
									Z_STREAM_ERROR: -2,
									Z_DATA_ERROR: -3,
									Z_BUF_ERROR: -5,
									Z_NO_COMPRESSION: 0,
									Z_BEST_SPEED: 1,
									Z_BEST_COMPRESSION: 9,
									Z_DEFAULT_COMPRESSION: -1,
									Z_FILTERED: 1,
									Z_HUFFMAN_ONLY: 2,
									Z_RLE: 3,
									Z_FIXED: 4,
									Z_DEFAULT_STRATEGY: 0,
									Z_BINARY: 0,
									Z_TEXT: 1,
									Z_UNKNOWN: 2,
									Z_DEFLATED: 8
								};
							}, {}],
							45: [function(e, t, n) {
								var r = function() {
									for (var e, t = [], n = 0; n < 256; n++) {
										e = n;
										for (var r = 0; r < 8; r++) e = 1 & e ? 3988292384 ^ e >>> 1 : e >>> 1;
										t[n] = e;
									}
									return t;
								}();
								t.exports = function(e, t, n, i) {
									var a = r, o = i + n;
									e ^= -1;
									for (var s = i; s < o; s++) e = e >>> 8 ^ a[255 & (e ^ t[s])];
									return -1 ^ e;
								};
							}, {}],
							46: [function(e, t, n) {
								var r, i = e("../utils/common"), a = e("./trees"), o = e("./adler32"), s = e("./crc32"), c = e("./messages"), l = 0, u = 4, d = 0, f = -2, p = -1, m = 4, h = 2, g = 8, _ = 9, v = 286, y = 30, b = 19, x = 2 * v + 1, S = 15, C = 3, w = 258, T = w + C + 1, E = 42, D = 113, O = 1, k = 2, A = 3, j = 4;
								function M(e, t) {
									return e.msg = c[t], t;
								}
								function N(e) {
									return (e << 1) - (4 < e ? 9 : 0);
								}
								function P(e) {
									for (var t = e.length; 0 <= --t;) e[t] = 0;
								}
								function F(e) {
									var t = e.state, n = t.pending;
									n > e.avail_out && (n = e.avail_out), n !== 0 && (i.arraySet(e.output, t.pending_buf, t.pending_out, n, e.next_out), e.next_out += n, t.pending_out += n, e.total_out += n, e.avail_out -= n, t.pending -= n, t.pending === 0 && (t.pending_out = 0));
								}
								function I(e, t) {
									a._tr_flush_block(e, 0 <= e.block_start ? e.block_start : -1, e.strstart - e.block_start, t), e.block_start = e.strstart, F(e.strm);
								}
								function L(e, t) {
									e.pending_buf[e.pending++] = t;
								}
								function R(e, t) {
									e.pending_buf[e.pending++] = t >>> 8 & 255, e.pending_buf[e.pending++] = 255 & t;
								}
								function z(e, t) {
									var n, r, i = e.max_chain_length, a = e.strstart, o = e.prev_length, s = e.nice_match, c = e.strstart > e.w_size - T ? e.strstart - (e.w_size - T) : 0, l = e.window, u = e.w_mask, d = e.prev, f = e.strstart + w, p = l[a + o - 1], m = l[a + o];
									e.prev_length >= e.good_match && (i >>= 2), s > e.lookahead && (s = e.lookahead);
									do
										if (l[(n = t) + o] === m && l[n + o - 1] === p && l[n] === l[a] && l[++n] === l[a + 1]) {
											a += 2, n++;
											do											;
while (l[++a] === l[++n] && l[++a] === l[++n] && l[++a] === l[++n] && l[++a] === l[++n] && l[++a] === l[++n] && l[++a] === l[++n] && l[++a] === l[++n] && l[++a] === l[++n] && a < f);
											if (r = w - (f - a), a = f - w, o < r) {
												if (e.match_start = t, s <= (o = r)) break;
												p = l[a + o - 1], m = l[a + o];
											}
										}
									while ((t = d[t & u]) > c && --i != 0);
									return o <= e.lookahead ? o : e.lookahead;
								}
								function B(e) {
									var t, n, r, a, c, l, u, d, f, p, m = e.w_size;
									do {
										if (a = e.window_size - e.lookahead - e.strstart, e.strstart >= m + (m - T)) {
											for (i.arraySet(e.window, e.window, m, m, 0), e.match_start -= m, e.strstart -= m, e.block_start -= m, t = n = e.hash_size; r = e.head[--t], e.head[t] = m <= r ? r - m : 0, --n;);
											for (t = n = m; r = e.prev[--t], e.prev[t] = m <= r ? r - m : 0, --n;);
											a += m;
										}
										if (e.strm.avail_in === 0) break;
										if (l = e.strm, u = e.window, d = e.strstart + e.lookahead, f = a, p = void 0, p = l.avail_in, f < p && (p = f), n = p === 0 ? 0 : (l.avail_in -= p, i.arraySet(u, l.input, l.next_in, p, d), l.state.wrap === 1 ? l.adler = o(l.adler, u, p, d) : l.state.wrap === 2 && (l.adler = s(l.adler, u, p, d)), l.next_in += p, l.total_in += p, p), e.lookahead += n, e.lookahead + e.insert >= C) for (c = e.strstart - e.insert, e.ins_h = e.window[c], e.ins_h = (e.ins_h << e.hash_shift ^ e.window[c + 1]) & e.hash_mask; e.insert && (e.ins_h = (e.ins_h << e.hash_shift ^ e.window[c + C - 1]) & e.hash_mask, e.prev[c & e.w_mask] = e.head[e.ins_h], e.head[e.ins_h] = c, c++, e.insert--, !(e.lookahead + e.insert < C)););
									} while (e.lookahead < T && e.strm.avail_in !== 0);
								}
								function V(e, t) {
									for (var n, r;;) {
										if (e.lookahead < T) {
											if (B(e), e.lookahead < T && t === l) return O;
											if (e.lookahead === 0) break;
										}
										if (n = 0, e.lookahead >= C && (e.ins_h = (e.ins_h << e.hash_shift ^ e.window[e.strstart + C - 1]) & e.hash_mask, n = e.prev[e.strstart & e.w_mask] = e.head[e.ins_h], e.head[e.ins_h] = e.strstart), n !== 0 && e.strstart - n <= e.w_size - T && (e.match_length = z(e, n)), e.match_length >= C) {
											if (r = a._tr_tally(e, e.strstart - e.match_start, e.match_length - C), e.lookahead -= e.match_length, e.match_length <= e.max_lazy_match && e.lookahead >= C) {
												for (e.match_length--; e.strstart++, e.ins_h = (e.ins_h << e.hash_shift ^ e.window[e.strstart + C - 1]) & e.hash_mask, n = e.prev[e.strstart & e.w_mask] = e.head[e.ins_h], e.head[e.ins_h] = e.strstart, --e.match_length != 0;);
												e.strstart++;
											} else e.strstart += e.match_length, e.match_length = 0, e.ins_h = e.window[e.strstart], e.ins_h = (e.ins_h << e.hash_shift ^ e.window[e.strstart + 1]) & e.hash_mask;
										} else r = a._tr_tally(e, 0, e.window[e.strstart]), e.lookahead--, e.strstart++;
										if (r && (I(e, !1), e.strm.avail_out === 0)) return O;
									}
									return e.insert = e.strstart < C - 1 ? e.strstart : C - 1, t === u ? (I(e, !0), e.strm.avail_out === 0 ? A : j) : e.last_lit && (I(e, !1), e.strm.avail_out === 0) ? O : k;
								}
								function H(e, t) {
									for (var n, r, i;;) {
										if (e.lookahead < T) {
											if (B(e), e.lookahead < T && t === l) return O;
											if (e.lookahead === 0) break;
										}
										if (n = 0, e.lookahead >= C && (e.ins_h = (e.ins_h << e.hash_shift ^ e.window[e.strstart + C - 1]) & e.hash_mask, n = e.prev[e.strstart & e.w_mask] = e.head[e.ins_h], e.head[e.ins_h] = e.strstart), e.prev_length = e.match_length, e.prev_match = e.match_start, e.match_length = C - 1, n !== 0 && e.prev_length < e.max_lazy_match && e.strstart - n <= e.w_size - T && (e.match_length = z(e, n), e.match_length <= 5 && (e.strategy === 1 || e.match_length === C && 4096 < e.strstart - e.match_start) && (e.match_length = C - 1)), e.prev_length >= C && e.match_length <= e.prev_length) {
											for (i = e.strstart + e.lookahead - C, r = a._tr_tally(e, e.strstart - 1 - e.prev_match, e.prev_length - C), e.lookahead -= e.prev_length - 1, e.prev_length -= 2; ++e.strstart <= i && (e.ins_h = (e.ins_h << e.hash_shift ^ e.window[e.strstart + C - 1]) & e.hash_mask, n = e.prev[e.strstart & e.w_mask] = e.head[e.ins_h], e.head[e.ins_h] = e.strstart), --e.prev_length != 0;);
											if (e.match_available = 0, e.match_length = C - 1, e.strstart++, r && (I(e, !1), e.strm.avail_out === 0)) return O;
										} else if (e.match_available) {
											if ((r = a._tr_tally(e, 0, e.window[e.strstart - 1])) && I(e, !1), e.strstart++, e.lookahead--, e.strm.avail_out === 0) return O;
										} else e.match_available = 1, e.strstart++, e.lookahead--;
									}
									return e.match_available &&= (r = a._tr_tally(e, 0, e.window[e.strstart - 1]), 0), e.insert = e.strstart < C - 1 ? e.strstart : C - 1, t === u ? (I(e, !0), e.strm.avail_out === 0 ? A : j) : e.last_lit && (I(e, !1), e.strm.avail_out === 0) ? O : k;
								}
								function U(e, t, n, r, i) {
									this.good_length = e, this.max_lazy = t, this.nice_length = n, this.max_chain = r, this.func = i;
								}
								function ee() {
									this.strm = null, this.status = 0, this.pending_buf = null, this.pending_buf_size = 0, this.pending_out = 0, this.pending = 0, this.wrap = 0, this.gzhead = null, this.gzindex = 0, this.method = g, this.last_flush = -1, this.w_size = 0, this.w_bits = 0, this.w_mask = 0, this.window = null, this.window_size = 0, this.prev = null, this.head = null, this.ins_h = 0, this.hash_size = 0, this.hash_bits = 0, this.hash_mask = 0, this.hash_shift = 0, this.block_start = 0, this.match_length = 0, this.prev_match = 0, this.match_available = 0, this.strstart = 0, this.match_start = 0, this.lookahead = 0, this.prev_length = 0, this.max_chain_length = 0, this.max_lazy_match = 0, this.level = 0, this.strategy = 0, this.good_match = 0, this.nice_match = 0, this.dyn_ltree = new i.Buf16(2 * x), this.dyn_dtree = new i.Buf16(2 * (2 * y + 1)), this.bl_tree = new i.Buf16(2 * (2 * b + 1)), P(this.dyn_ltree), P(this.dyn_dtree), P(this.bl_tree), this.l_desc = null, this.d_desc = null, this.bl_desc = null, this.bl_count = new i.Buf16(S + 1), this.heap = new i.Buf16(2 * v + 1), P(this.heap), this.heap_len = 0, this.heap_max = 0, this.depth = new i.Buf16(2 * v + 1), P(this.depth), this.l_buf = 0, this.lit_bufsize = 0, this.last_lit = 0, this.d_buf = 0, this.opt_len = 0, this.static_len = 0, this.matches = 0, this.insert = 0, this.bi_buf = 0, this.bi_valid = 0;
								}
								function W(e) {
									var t;
									return e && e.state ? (e.total_in = e.total_out = 0, e.data_type = h, (t = e.state).pending = 0, t.pending_out = 0, t.wrap < 0 && (t.wrap = -t.wrap), t.status = t.wrap ? E : D, e.adler = t.wrap === 2 ? 0 : 1, t.last_flush = l, a._tr_init(t), d) : M(e, f);
								}
								function te(e) {
									var t = W(e);
									return t === d && function(e) {
										e.window_size = 2 * e.w_size, P(e.head), e.max_lazy_match = r[e.level].max_lazy, e.good_match = r[e.level].good_length, e.nice_match = r[e.level].nice_length, e.max_chain_length = r[e.level].max_chain, e.strstart = 0, e.block_start = 0, e.lookahead = 0, e.insert = 0, e.match_length = e.prev_length = C - 1, e.match_available = 0, e.ins_h = 0;
									}(e.state), t;
								}
								function G(e, t, n, r, a, o) {
									if (!e) return f;
									var s = 1;
									if (t === p && (t = 6), r < 0 ? (s = 0, r = -r) : 15 < r && (s = 2, r -= 16), a < 1 || _ < a || n !== g || r < 8 || 15 < r || t < 0 || 9 < t || o < 0 || m < o) return M(e, f);
									r === 8 && (r = 9);
									var c = new ee();
									return (e.state = c).strm = e, c.wrap = s, c.gzhead = null, c.w_bits = r, c.w_size = 1 << c.w_bits, c.w_mask = c.w_size - 1, c.hash_bits = a + 7, c.hash_size = 1 << c.hash_bits, c.hash_mask = c.hash_size - 1, c.hash_shift = ~~((c.hash_bits + C - 1) / C), c.window = new i.Buf8(2 * c.w_size), c.head = new i.Buf16(c.hash_size), c.prev = new i.Buf16(c.w_size), c.lit_bufsize = 1 << a + 6, c.pending_buf_size = 4 * c.lit_bufsize, c.pending_buf = new i.Buf8(c.pending_buf_size), c.d_buf = 1 * c.lit_bufsize, c.l_buf = 3 * c.lit_bufsize, c.level = t, c.strategy = o, c.method = n, te(e);
								}
								r = [
									new U(0, 0, 0, 0, function(e, t) {
										var n = 65535;
										for (n > e.pending_buf_size - 5 && (n = e.pending_buf_size - 5);;) {
											if (e.lookahead <= 1) {
												if (B(e), e.lookahead === 0 && t === l) return O;
												if (e.lookahead === 0) break;
											}
											e.strstart += e.lookahead, e.lookahead = 0;
											var r = e.block_start + n;
											if ((e.strstart === 0 || e.strstart >= r) && (e.lookahead = e.strstart - r, e.strstart = r, I(e, !1), e.strm.avail_out === 0) || e.strstart - e.block_start >= e.w_size - T && (I(e, !1), e.strm.avail_out === 0)) return O;
										}
										return e.insert = 0, t === u ? (I(e, !0), e.strm.avail_out === 0 ? A : j) : (e.strstart > e.block_start && (I(e, !1), e.strm.avail_out), O);
									}),
									new U(4, 4, 8, 4, V),
									new U(4, 5, 16, 8, V),
									new U(4, 6, 32, 32, V),
									new U(4, 4, 16, 16, H),
									new U(8, 16, 32, 32, H),
									new U(8, 16, 128, 128, H),
									new U(8, 32, 128, 256, H),
									new U(32, 128, 258, 1024, H),
									new U(32, 258, 258, 4096, H)
								], n.deflateInit = function(e, t) {
									return G(e, t, g, 15, 8, 0);
								}, n.deflateInit2 = G, n.deflateReset = te, n.deflateResetKeep = W, n.deflateSetHeader = function(e, t) {
									return e && e.state && e.state.wrap === 2 ? (e.state.gzhead = t, d) : f;
								}, n.deflate = function(e, t) {
									var n, i, o, c;
									if (!e || !e.state || 5 < t || t < 0) return e ? M(e, f) : f;
									if (i = e.state, !e.output || !e.input && e.avail_in !== 0 || i.status === 666 && t !== u) return M(e, e.avail_out === 0 ? -5 : f);
									if (i.strm = e, n = i.last_flush, i.last_flush = t, i.status === E) {
										if (i.wrap === 2) e.adler = 0, L(i, 31), L(i, 139), L(i, 8), i.gzhead ? (L(i, +!!i.gzhead.text + (i.gzhead.hcrc ? 2 : 0) + (i.gzhead.extra ? 4 : 0) + (i.gzhead.name ? 8 : 0) + (i.gzhead.comment ? 16 : 0)), L(i, 255 & i.gzhead.time), L(i, i.gzhead.time >> 8 & 255), L(i, i.gzhead.time >> 16 & 255), L(i, i.gzhead.time >> 24 & 255), L(i, i.level === 9 ? 2 : 2 <= i.strategy || i.level < 2 ? 4 : 0), L(i, 255 & i.gzhead.os), i.gzhead.extra && i.gzhead.extra.length && (L(i, 255 & i.gzhead.extra.length), L(i, i.gzhead.extra.length >> 8 & 255)), i.gzhead.hcrc && (e.adler = s(e.adler, i.pending_buf, i.pending, 0)), i.gzindex = 0, i.status = 69) : (L(i, 0), L(i, 0), L(i, 0), L(i, 0), L(i, 0), L(i, i.level === 9 ? 2 : 2 <= i.strategy || i.level < 2 ? 4 : 0), L(i, 3), i.status = D);
										else {
											var p = g + (i.w_bits - 8 << 4) << 8;
											p |= (2 <= i.strategy || i.level < 2 ? 0 : i.level < 6 ? 1 : i.level === 6 ? 2 : 3) << 6, i.strstart !== 0 && (p |= 32), p += 31 - p % 31, i.status = D, R(i, p), i.strstart !== 0 && (R(i, e.adler >>> 16), R(i, 65535 & e.adler)), e.adler = 1;
										}
									}
									if (i.status === 69) {
										if (i.gzhead.extra) {
											for (o = i.pending; i.gzindex < (65535 & i.gzhead.extra.length) && (i.pending !== i.pending_buf_size || (i.gzhead.hcrc && i.pending > o && (e.adler = s(e.adler, i.pending_buf, i.pending - o, o)), F(e), o = i.pending, i.pending !== i.pending_buf_size));) L(i, 255 & i.gzhead.extra[i.gzindex]), i.gzindex++;
											i.gzhead.hcrc && i.pending > o && (e.adler = s(e.adler, i.pending_buf, i.pending - o, o)), i.gzindex === i.gzhead.extra.length && (i.gzindex = 0, i.status = 73);
										} else i.status = 73;
									}
									if (i.status === 73) {
										if (i.gzhead.name) {
											o = i.pending;
											do {
												if (i.pending === i.pending_buf_size && (i.gzhead.hcrc && i.pending > o && (e.adler = s(e.adler, i.pending_buf, i.pending - o, o)), F(e), o = i.pending, i.pending === i.pending_buf_size)) {
													c = 1;
													break;
												}
												c = i.gzindex < i.gzhead.name.length ? 255 & i.gzhead.name.charCodeAt(i.gzindex++) : 0, L(i, c);
											} while (c !== 0);
											i.gzhead.hcrc && i.pending > o && (e.adler = s(e.adler, i.pending_buf, i.pending - o, o)), c === 0 && (i.gzindex = 0, i.status = 91);
										} else i.status = 91;
									}
									if (i.status === 91) {
										if (i.gzhead.comment) {
											o = i.pending;
											do {
												if (i.pending === i.pending_buf_size && (i.gzhead.hcrc && i.pending > o && (e.adler = s(e.adler, i.pending_buf, i.pending - o, o)), F(e), o = i.pending, i.pending === i.pending_buf_size)) {
													c = 1;
													break;
												}
												c = i.gzindex < i.gzhead.comment.length ? 255 & i.gzhead.comment.charCodeAt(i.gzindex++) : 0, L(i, c);
											} while (c !== 0);
											i.gzhead.hcrc && i.pending > o && (e.adler = s(e.adler, i.pending_buf, i.pending - o, o)), c === 0 && (i.status = 103);
										} else i.status = 103;
									}
									if (i.status === 103 && (i.gzhead.hcrc ? (i.pending + 2 > i.pending_buf_size && F(e), i.pending + 2 <= i.pending_buf_size && (L(i, 255 & e.adler), L(i, e.adler >> 8 & 255), e.adler = 0, i.status = D)) : i.status = D), i.pending !== 0) {
										if (F(e), e.avail_out === 0) return i.last_flush = -1, d;
									} else if (e.avail_in === 0 && N(t) <= N(n) && t !== u) return M(e, -5);
									if (i.status === 666 && e.avail_in !== 0) return M(e, -5);
									if (e.avail_in !== 0 || i.lookahead !== 0 || t !== l && i.status !== 666) {
										var m = i.strategy === 2 ? function(e, t) {
											for (var n;;) {
												if (e.lookahead === 0 && (B(e), e.lookahead === 0)) {
													if (t === l) return O;
													break;
												}
												if (e.match_length = 0, n = a._tr_tally(e, 0, e.window[e.strstart]), e.lookahead--, e.strstart++, n && (I(e, !1), e.strm.avail_out === 0)) return O;
											}
											return e.insert = 0, t === u ? (I(e, !0), e.strm.avail_out === 0 ? A : j) : e.last_lit && (I(e, !1), e.strm.avail_out === 0) ? O : k;
										}(i, t) : i.strategy === 3 ? function(e, t) {
											for (var n, r, i, o, s = e.window;;) {
												if (e.lookahead <= w) {
													if (B(e), e.lookahead <= w && t === l) return O;
													if (e.lookahead === 0) break;
												}
												if (e.match_length = 0, e.lookahead >= C && 0 < e.strstart && (r = s[i = e.strstart - 1]) === s[++i] && r === s[++i] && r === s[++i]) {
													o = e.strstart + w;
													do													;
while (r === s[++i] && r === s[++i] && r === s[++i] && r === s[++i] && r === s[++i] && r === s[++i] && r === s[++i] && r === s[++i] && i < o);
													e.match_length = w - (o - i), e.match_length > e.lookahead && (e.match_length = e.lookahead);
												}
												if (e.match_length >= C ? (n = a._tr_tally(e, 1, e.match_length - C), e.lookahead -= e.match_length, e.strstart += e.match_length, e.match_length = 0) : (n = a._tr_tally(e, 0, e.window[e.strstart]), e.lookahead--, e.strstart++), n && (I(e, !1), e.strm.avail_out === 0)) return O;
											}
											return e.insert = 0, t === u ? (I(e, !0), e.strm.avail_out === 0 ? A : j) : e.last_lit && (I(e, !1), e.strm.avail_out === 0) ? O : k;
										}(i, t) : r[i.level].func(i, t);
										if (m !== A && m !== j || (i.status = 666), m === O || m === A) return e.avail_out === 0 && (i.last_flush = -1), d;
										if (m === k && (t === 1 ? a._tr_align(i) : t !== 5 && (a._tr_stored_block(i, 0, 0, !1), t === 3 && (P(i.head), i.lookahead === 0 && (i.strstart = 0, i.block_start = 0, i.insert = 0))), F(e), e.avail_out === 0)) return i.last_flush = -1, d;
									}
									return t === u ? i.wrap <= 0 ? 1 : (i.wrap === 2 ? (L(i, 255 & e.adler), L(i, e.adler >> 8 & 255), L(i, e.adler >> 16 & 255), L(i, e.adler >> 24 & 255), L(i, 255 & e.total_in), L(i, e.total_in >> 8 & 255), L(i, e.total_in >> 16 & 255), L(i, e.total_in >> 24 & 255)) : (R(i, e.adler >>> 16), R(i, 65535 & e.adler)), F(e), 0 < i.wrap && (i.wrap = -i.wrap), i.pending === 0 ? 1 : d) : d;
								}, n.deflateEnd = function(e) {
									var t;
									return e && e.state ? (t = e.state.status) !== E && t !== 69 && t !== 73 && t !== 91 && t !== 103 && t !== D && t !== 666 ? M(e, f) : (e.state = null, t === D ? M(e, -3) : d) : f;
								}, n.deflateSetDictionary = function(e, t) {
									var n, r, a, s, c, l, u, p, m = t.length;
									if (!e || !e.state || (s = (n = e.state).wrap) === 2 || s === 1 && n.status !== E || n.lookahead) return f;
									for (s === 1 && (e.adler = o(e.adler, t, m, 0)), n.wrap = 0, m >= n.w_size && (s === 0 && (P(n.head), n.strstart = 0, n.block_start = 0, n.insert = 0), p = new i.Buf8(n.w_size), i.arraySet(p, t, m - n.w_size, n.w_size, 0), t = p, m = n.w_size), c = e.avail_in, l = e.next_in, u = e.input, e.avail_in = m, e.next_in = 0, e.input = t, B(n); n.lookahead >= C;) {
										for (r = n.strstart, a = n.lookahead - (C - 1); n.ins_h = (n.ins_h << n.hash_shift ^ n.window[r + C - 1]) & n.hash_mask, n.prev[r & n.w_mask] = n.head[n.ins_h], n.head[n.ins_h] = r, r++, --a;);
										n.strstart = r, n.lookahead = C - 1, B(n);
									}
									return n.strstart += n.lookahead, n.block_start = n.strstart, n.insert = n.lookahead, n.lookahead = 0, n.match_length = n.prev_length = C - 1, n.match_available = 0, e.next_in = l, e.input = u, e.avail_in = c, n.wrap = s, d;
								}, n.deflateInfo = "pako deflate (from Nodeca project)";
							}, {
								"../utils/common": 41,
								"./adler32": 43,
								"./crc32": 45,
								"./messages": 51,
								"./trees": 52
							}],
							47: [function(e, t, n) {
								t.exports = function() {
									this.text = 0, this.time = 0, this.xflags = 0, this.os = 0, this.extra = null, this.extra_len = 0, this.name = "", this.comment = "", this.hcrc = 0, this.done = !1;
								};
							}, {}],
							48: [function(e, t, n) {
								t.exports = function(e, t) {
									var n = e.state, r = e.next_in, i, a, o, s, c, l, u, d, f, p, m, h, g, _, v, y, b, x, S, C, w, T = e.input, E;
									i = r + (e.avail_in - 5), a = e.next_out, E = e.output, o = a - (t - e.avail_out), s = a + (e.avail_out - 257), c = n.dmax, l = n.wsize, u = n.whave, d = n.wnext, f = n.window, p = n.hold, m = n.bits, h = n.lencode, g = n.distcode, _ = (1 << n.lenbits) - 1, v = (1 << n.distbits) - 1;
									t: do {
										m < 15 && (p += T[r++] << m, m += 8, p += T[r++] << m, m += 8), y = h[p & _];
										e: for (;;) {
											if (p >>>= b = y >>> 24, m -= b, (b = y >>> 16 & 255) == 0) E[a++] = 65535 & y;
											else {
												if (!(16 & b)) {
													if (!(64 & b)) {
														y = h[(65535 & y) + (p & (1 << b) - 1)];
														continue e;
													}
													if (32 & b) {
														n.mode = 12;
														break t;
													}
													e.msg = "invalid literal/length code", n.mode = 30;
													break t;
												}
												x = 65535 & y, (b &= 15) && (m < b && (p += T[r++] << m, m += 8), x += p & (1 << b) - 1, p >>>= b, m -= b), m < 15 && (p += T[r++] << m, m += 8, p += T[r++] << m, m += 8), y = g[p & v];
												r: for (;;) {
													if (p >>>= b = y >>> 24, m -= b, !(16 & (b = y >>> 16 & 255))) {
														if (!(64 & b)) {
															y = g[(65535 & y) + (p & (1 << b) - 1)];
															continue r;
														}
														e.msg = "invalid distance code", n.mode = 30;
														break t;
													}
													if (S = 65535 & y, m < (b &= 15) && (p += T[r++] << m, (m += 8) < b && (p += T[r++] << m, m += 8)), c < (S += p & (1 << b) - 1)) {
														e.msg = "invalid distance too far back", n.mode = 30;
														break t;
													}
													if (p >>>= b, m -= b, (b = a - o) < S) {
														if (u < (b = S - b) && n.sane) {
															e.msg = "invalid distance too far back", n.mode = 30;
															break t;
														}
														if (w = f, (C = 0) === d) {
															if (C += l - b, b < x) {
																for (x -= b; E[a++] = f[C++], --b;);
																C = a - S, w = E;
															}
														} else if (d < b) {
															if (C += l + d - b, (b -= d) < x) {
																for (x -= b; E[a++] = f[C++], --b;);
																if (C = 0, d < x) {
																	for (x -= b = d; E[a++] = f[C++], --b;);
																	C = a - S, w = E;
																}
															}
														} else if (C += d - b, b < x) {
															for (x -= b; E[a++] = f[C++], --b;);
															C = a - S, w = E;
														}
														for (; 2 < x;) E[a++] = w[C++], E[a++] = w[C++], E[a++] = w[C++], x -= 3;
														x && (E[a++] = w[C++], 1 < x && (E[a++] = w[C++]));
													} else {
														for (C = a - S; E[a++] = E[C++], E[a++] = E[C++], E[a++] = E[C++], 2 < (x -= 3););
														x && (E[a++] = E[C++], 1 < x && (E[a++] = E[C++]));
													}
													break;
												}
											}
											break;
										}
									} while (r < i && a < s);
									r -= x = m >> 3, p &= (1 << (m -= x << 3)) - 1, e.next_in = r, e.next_out = a, e.avail_in = r < i ? i - r + 5 : 5 - (r - i), e.avail_out = a < s ? s - a + 257 : 257 - (a - s), n.hold = p, n.bits = m;
								};
							}, {}],
							49: [function(e, t, n) {
								var r = e("../utils/common"), i = e("./adler32"), a = e("./crc32"), o = e("./inffast"), s = e("./inftrees"), c = 1, l = 2, u = 0, d = -2, f = 1, p = 852, m = 592;
								function h(e) {
									return (e >>> 24 & 255) + (e >>> 8 & 65280) + ((65280 & e) << 8) + ((255 & e) << 24);
								}
								function g() {
									this.mode = 0, this.last = !1, this.wrap = 0, this.havedict = !1, this.flags = 0, this.dmax = 0, this.check = 0, this.total = 0, this.head = null, this.wbits = 0, this.wsize = 0, this.whave = 0, this.wnext = 0, this.window = null, this.hold = 0, this.bits = 0, this.length = 0, this.offset = 0, this.extra = 0, this.lencode = null, this.distcode = null, this.lenbits = 0, this.distbits = 0, this.ncode = 0, this.nlen = 0, this.ndist = 0, this.have = 0, this.next = null, this.lens = new r.Buf16(320), this.work = new r.Buf16(288), this.lendyn = null, this.distdyn = null, this.sane = 0, this.back = 0, this.was = 0;
								}
								function _(e) {
									var t;
									return e && e.state ? (t = e.state, e.total_in = e.total_out = t.total = 0, e.msg = "", t.wrap && (e.adler = 1 & t.wrap), t.mode = f, t.last = 0, t.havedict = 0, t.dmax = 32768, t.head = null, t.hold = 0, t.bits = 0, t.lencode = t.lendyn = new r.Buf32(p), t.distcode = t.distdyn = new r.Buf32(m), t.sane = 1, t.back = -1, u) : d;
								}
								function v(e) {
									var t;
									return e && e.state ? ((t = e.state).wsize = 0, t.whave = 0, t.wnext = 0, _(e)) : d;
								}
								function y(e, t) {
									var n, r;
									return e && e.state ? (r = e.state, t < 0 ? (n = 0, t = -t) : (n = 1 + (t >> 4), t < 48 && (t &= 15)), t && (t < 8 || 15 < t) ? d : (r.window !== null && r.wbits !== t && (r.window = null), r.wrap = n, r.wbits = t, v(e))) : d;
								}
								function b(e, t) {
									var n, r;
									return e ? (r = new g(), (e.state = r).window = null, (n = y(e, t)) !== u && (e.state = null), n) : d;
								}
								var x, S, C = !0;
								function w(e) {
									if (C) {
										var t;
										for (x = new r.Buf32(512), S = new r.Buf32(32), t = 0; t < 144;) e.lens[t++] = 8;
										for (; t < 256;) e.lens[t++] = 9;
										for (; t < 280;) e.lens[t++] = 7;
										for (; t < 288;) e.lens[t++] = 8;
										for (s(c, e.lens, 0, 288, x, 0, e.work, { bits: 9 }), t = 0; t < 32;) e.lens[t++] = 5;
										s(l, e.lens, 0, 32, S, 0, e.work, { bits: 5 }), C = !1;
									}
									e.lencode = x, e.lenbits = 9, e.distcode = S, e.distbits = 5;
								}
								function T(e, t, n, i) {
									var a, o = e.state;
									return o.window === null && (o.wsize = 1 << o.wbits, o.wnext = 0, o.whave = 0, o.window = new r.Buf8(o.wsize)), i >= o.wsize ? (r.arraySet(o.window, t, n - o.wsize, o.wsize, 0), o.wnext = 0, o.whave = o.wsize) : (i < (a = o.wsize - o.wnext) && (a = i), r.arraySet(o.window, t, n - i, a, o.wnext), (i -= a) ? (r.arraySet(o.window, t, n - i, i, 0), o.wnext = i, o.whave = o.wsize) : (o.wnext += a, o.wnext === o.wsize && (o.wnext = 0), o.whave < o.wsize && (o.whave += a))), 0;
								}
								n.inflateReset = v, n.inflateReset2 = y, n.inflateResetKeep = _, n.inflateInit = function(e) {
									return b(e, 15);
								}, n.inflateInit2 = b, n.inflate = function(e, t) {
									var n, p, m, g, _, v, y, b, x, S, C, E, D, O, k, A, j, M, N, P, F, I, L, R, z = 0, B = new r.Buf8(4), V = [
										16,
										17,
										18,
										0,
										8,
										7,
										9,
										6,
										10,
										5,
										11,
										4,
										12,
										3,
										13,
										2,
										14,
										1,
										15
									];
									if (!e || !e.state || !e.output || !e.input && e.avail_in !== 0) return d;
									(n = e.state).mode === 12 && (n.mode = 13), _ = e.next_out, m = e.output, y = e.avail_out, g = e.next_in, p = e.input, v = e.avail_in, b = n.hold, x = n.bits, S = v, C = y, I = u;
									t: for (;;) switch (n.mode) {
										case f:
											if (n.wrap === 0) {
												n.mode = 13;
												break;
											}
											for (; x < 16;) {
												if (v === 0) break t;
												v--, b += p[g++] << x, x += 8;
											}
											if (2 & n.wrap && b === 35615) {
												B[n.check = 0] = 255 & b, B[1] = b >>> 8 & 255, n.check = a(n.check, B, 2, 0), x = b = 0, n.mode = 2;
												break;
											}
											if (n.flags = 0, n.head && (n.head.done = !1), !(1 & n.wrap) || (((255 & b) << 8) + (b >> 8)) % 31) {
												e.msg = "incorrect header check", n.mode = 30;
												break;
											}
											if ((15 & b) != 8) {
												e.msg = "unknown compression method", n.mode = 30;
												break;
											}
											if (x -= 4, F = 8 + (15 & (b >>>= 4)), n.wbits === 0) n.wbits = F;
											else if (F > n.wbits) {
												e.msg = "invalid window size", n.mode = 30;
												break;
											}
											n.dmax = 1 << F, e.adler = n.check = 1, n.mode = 512 & b ? 10 : 12, x = b = 0;
											break;
										case 2:
											for (; x < 16;) {
												if (v === 0) break t;
												v--, b += p[g++] << x, x += 8;
											}
											if (n.flags = b, (255 & n.flags) != 8) {
												e.msg = "unknown compression method", n.mode = 30;
												break;
											}
											if (57344 & n.flags) {
												e.msg = "unknown header flags set", n.mode = 30;
												break;
											}
											n.head && (n.head.text = b >> 8 & 1), 512 & n.flags && (B[0] = 255 & b, B[1] = b >>> 8 & 255, n.check = a(n.check, B, 2, 0)), x = b = 0, n.mode = 3;
										case 3:
											for (; x < 32;) {
												if (v === 0) break t;
												v--, b += p[g++] << x, x += 8;
											}
											n.head && (n.head.time = b), 512 & n.flags && (B[0] = 255 & b, B[1] = b >>> 8 & 255, B[2] = b >>> 16 & 255, B[3] = b >>> 24 & 255, n.check = a(n.check, B, 4, 0)), x = b = 0, n.mode = 4;
										case 4:
											for (; x < 16;) {
												if (v === 0) break t;
												v--, b += p[g++] << x, x += 8;
											}
											n.head && (n.head.xflags = 255 & b, n.head.os = b >> 8), 512 & n.flags && (B[0] = 255 & b, B[1] = b >>> 8 & 255, n.check = a(n.check, B, 2, 0)), x = b = 0, n.mode = 5;
										case 5:
											if (1024 & n.flags) {
												for (; x < 16;) {
													if (v === 0) break t;
													v--, b += p[g++] << x, x += 8;
												}
												n.length = b, n.head && (n.head.extra_len = b), 512 & n.flags && (B[0] = 255 & b, B[1] = b >>> 8 & 255, n.check = a(n.check, B, 2, 0)), x = b = 0;
											} else n.head && (n.head.extra = null);
											n.mode = 6;
										case 6:
											if (1024 & n.flags && (v < (E = n.length) && (E = v), E && (n.head && (F = n.head.extra_len - n.length, n.head.extra || (n.head.extra = Array(n.head.extra_len)), r.arraySet(n.head.extra, p, g, E, F)), 512 & n.flags && (n.check = a(n.check, p, E, g)), v -= E, g += E, n.length -= E), n.length)) break t;
											n.length = 0, n.mode = 7;
										case 7:
											if (2048 & n.flags) {
												if (v === 0) break t;
												for (E = 0; F = p[g + E++], n.head && F && n.length < 65536 && (n.head.name += String.fromCharCode(F)), F && E < v;);
												if (512 & n.flags && (n.check = a(n.check, p, E, g)), v -= E, g += E, F) break t;
											} else n.head && (n.head.name = null);
											n.length = 0, n.mode = 8;
										case 8:
											if (4096 & n.flags) {
												if (v === 0) break t;
												for (E = 0; F = p[g + E++], n.head && F && n.length < 65536 && (n.head.comment += String.fromCharCode(F)), F && E < v;);
												if (512 & n.flags && (n.check = a(n.check, p, E, g)), v -= E, g += E, F) break t;
											} else n.head && (n.head.comment = null);
											n.mode = 9;
										case 9:
											if (512 & n.flags) {
												for (; x < 16;) {
													if (v === 0) break t;
													v--, b += p[g++] << x, x += 8;
												}
												if (b !== (65535 & n.check)) {
													e.msg = "header crc mismatch", n.mode = 30;
													break;
												}
												x = b = 0;
											}
											n.head && (n.head.hcrc = n.flags >> 9 & 1, n.head.done = !0), e.adler = n.check = 0, n.mode = 12;
											break;
										case 10:
											for (; x < 32;) {
												if (v === 0) break t;
												v--, b += p[g++] << x, x += 8;
											}
											e.adler = n.check = h(b), x = b = 0, n.mode = 11;
										case 11:
											if (n.havedict === 0) return e.next_out = _, e.avail_out = y, e.next_in = g, e.avail_in = v, n.hold = b, n.bits = x, 2;
											e.adler = n.check = 1, n.mode = 12;
										case 12: if (t === 5 || t === 6) break t;
										case 13:
											if (n.last) {
												b >>>= 7 & x, x -= 7 & x, n.mode = 27;
												break;
											}
											for (; x < 3;) {
												if (v === 0) break t;
												v--, b += p[g++] << x, x += 8;
											}
											switch (n.last = 1 & b, --x, 3 & (b >>>= 1)) {
												case 0:
													n.mode = 14;
													break;
												case 1:
													if (w(n), n.mode = 20, t !== 6) break;
													b >>>= 2, x -= 2;
													break t;
												case 2:
													n.mode = 17;
													break;
												case 3: e.msg = "invalid block type", n.mode = 30;
											}
											b >>>= 2, x -= 2;
											break;
										case 14:
											for (b >>>= 7 & x, x -= 7 & x; x < 32;) {
												if (v === 0) break t;
												v--, b += p[g++] << x, x += 8;
											}
											if ((65535 & b) != (b >>> 16 ^ 65535)) {
												e.msg = "invalid stored block lengths", n.mode = 30;
												break;
											}
											if (n.length = 65535 & b, x = b = 0, n.mode = 15, t === 6) break t;
										case 15: n.mode = 16;
										case 16:
											if (E = n.length) {
												if (v < E && (E = v), y < E && (E = y), E === 0) break t;
												r.arraySet(m, p, g, E, _), v -= E, g += E, y -= E, _ += E, n.length -= E;
												break;
											}
											n.mode = 12;
											break;
										case 17:
											for (; x < 14;) {
												if (v === 0) break t;
												v--, b += p[g++] << x, x += 8;
											}
											if (n.nlen = 257 + (31 & b), b >>>= 5, x -= 5, n.ndist = 1 + (31 & b), b >>>= 5, x -= 5, n.ncode = 4 + (15 & b), b >>>= 4, x -= 4, 286 < n.nlen || 30 < n.ndist) {
												e.msg = "too many length or distance symbols", n.mode = 30;
												break;
											}
											n.have = 0, n.mode = 18;
										case 18:
											for (; n.have < n.ncode;) {
												for (; x < 3;) {
													if (v === 0) break t;
													v--, b += p[g++] << x, x += 8;
												}
												n.lens[V[n.have++]] = 7 & b, b >>>= 3, x -= 3;
											}
											for (; n.have < 19;) n.lens[V[n.have++]] = 0;
											if (n.lencode = n.lendyn, n.lenbits = 7, L = { bits: n.lenbits }, I = s(0, n.lens, 0, 19, n.lencode, 0, n.work, L), n.lenbits = L.bits, I) {
												e.msg = "invalid code lengths set", n.mode = 30;
												break;
											}
											n.have = 0, n.mode = 19;
										case 19:
											for (; n.have < n.nlen + n.ndist;) {
												for (; A = (z = n.lencode[b & (1 << n.lenbits) - 1]) >>> 16 & 255, j = 65535 & z, !((k = z >>> 24) <= x);) {
													if (v === 0) break t;
													v--, b += p[g++] << x, x += 8;
												}
												if (j < 16) b >>>= k, x -= k, n.lens[n.have++] = j;
												else {
													if (j === 16) {
														for (R = k + 2; x < R;) {
															if (v === 0) break t;
															v--, b += p[g++] << x, x += 8;
														}
														if (b >>>= k, x -= k, n.have === 0) {
															e.msg = "invalid bit length repeat", n.mode = 30;
															break;
														}
														F = n.lens[n.have - 1], E = 3 + (3 & b), b >>>= 2, x -= 2;
													} else if (j === 17) {
														for (R = k + 3; x < R;) {
															if (v === 0) break t;
															v--, b += p[g++] << x, x += 8;
														}
														x -= k, F = 0, E = 3 + (7 & (b >>>= k)), b >>>= 3, x -= 3;
													} else {
														for (R = k + 7; x < R;) {
															if (v === 0) break t;
															v--, b += p[g++] << x, x += 8;
														}
														x -= k, F = 0, E = 11 + (127 & (b >>>= k)), b >>>= 7, x -= 7;
													}
													if (n.have + E > n.nlen + n.ndist) {
														e.msg = "invalid bit length repeat", n.mode = 30;
														break;
													}
													for (; E--;) n.lens[n.have++] = F;
												}
											}
											if (n.mode === 30) break;
											if (n.lens[256] === 0) {
												e.msg = "invalid code -- missing end-of-block", n.mode = 30;
												break;
											}
											if (n.lenbits = 9, L = { bits: n.lenbits }, I = s(c, n.lens, 0, n.nlen, n.lencode, 0, n.work, L), n.lenbits = L.bits, I) {
												e.msg = "invalid literal/lengths set", n.mode = 30;
												break;
											}
											if (n.distbits = 6, n.distcode = n.distdyn, L = { bits: n.distbits }, I = s(l, n.lens, n.nlen, n.ndist, n.distcode, 0, n.work, L), n.distbits = L.bits, I) {
												e.msg = "invalid distances set", n.mode = 30;
												break;
											}
											if (n.mode = 20, t === 6) break t;
										case 20: n.mode = 21;
										case 21:
											if (6 <= v && 258 <= y) {
												e.next_out = _, e.avail_out = y, e.next_in = g, e.avail_in = v, n.hold = b, n.bits = x, o(e, C), _ = e.next_out, m = e.output, y = e.avail_out, g = e.next_in, p = e.input, v = e.avail_in, b = n.hold, x = n.bits, n.mode === 12 && (n.back = -1);
												break;
											}
											for (n.back = 0; A = (z = n.lencode[b & (1 << n.lenbits) - 1]) >>> 16 & 255, j = 65535 & z, !((k = z >>> 24) <= x);) {
												if (v === 0) break t;
												v--, b += p[g++] << x, x += 8;
											}
											if (A && !(240 & A)) {
												for (M = k, N = A, P = j; A = (z = n.lencode[P + ((b & (1 << M + N) - 1) >> M)]) >>> 16 & 255, j = 65535 & z, !(M + (k = z >>> 24) <= x);) {
													if (v === 0) break t;
													v--, b += p[g++] << x, x += 8;
												}
												b >>>= M, x -= M, n.back += M;
											}
											if (b >>>= k, x -= k, n.back += k, n.length = j, A === 0) {
												n.mode = 26;
												break;
											}
											if (32 & A) {
												n.back = -1, n.mode = 12;
												break;
											}
											if (64 & A) {
												e.msg = "invalid literal/length code", n.mode = 30;
												break;
											}
											n.extra = 15 & A, n.mode = 22;
										case 22:
											if (n.extra) {
												for (R = n.extra; x < R;) {
													if (v === 0) break t;
													v--, b += p[g++] << x, x += 8;
												}
												n.length += b & (1 << n.extra) - 1, b >>>= n.extra, x -= n.extra, n.back += n.extra;
											}
											n.was = n.length, n.mode = 23;
										case 23:
											for (; A = (z = n.distcode[b & (1 << n.distbits) - 1]) >>> 16 & 255, j = 65535 & z, !((k = z >>> 24) <= x);) {
												if (v === 0) break t;
												v--, b += p[g++] << x, x += 8;
											}
											if (!(240 & A)) {
												for (M = k, N = A, P = j; A = (z = n.distcode[P + ((b & (1 << M + N) - 1) >> M)]) >>> 16 & 255, j = 65535 & z, !(M + (k = z >>> 24) <= x);) {
													if (v === 0) break t;
													v--, b += p[g++] << x, x += 8;
												}
												b >>>= M, x -= M, n.back += M;
											}
											if (b >>>= k, x -= k, n.back += k, 64 & A) {
												e.msg = "invalid distance code", n.mode = 30;
												break;
											}
											n.offset = j, n.extra = 15 & A, n.mode = 24;
										case 24:
											if (n.extra) {
												for (R = n.extra; x < R;) {
													if (v === 0) break t;
													v--, b += p[g++] << x, x += 8;
												}
												n.offset += b & (1 << n.extra) - 1, b >>>= n.extra, x -= n.extra, n.back += n.extra;
											}
											if (n.offset > n.dmax) {
												e.msg = "invalid distance too far back", n.mode = 30;
												break;
											}
											n.mode = 25;
										case 25:
											if (y === 0) break t;
											if (E = C - y, n.offset > E) {
												if ((E = n.offset - E) > n.whave && n.sane) {
													e.msg = "invalid distance too far back", n.mode = 30;
													break;
												}
												D = E > n.wnext ? (E -= n.wnext, n.wsize - E) : n.wnext - E, E > n.length && (E = n.length), O = n.window;
											} else O = m, D = _ - n.offset, E = n.length;
											for (y < E && (E = y), y -= E, n.length -= E; m[_++] = O[D++], --E;);
											n.length === 0 && (n.mode = 21);
											break;
										case 26:
											if (y === 0) break t;
											m[_++] = n.length, y--, n.mode = 21;
											break;
										case 27:
											if (n.wrap) {
												for (; x < 32;) {
													if (v === 0) break t;
													v--, b |= p[g++] << x, x += 8;
												}
												if (C -= y, e.total_out += C, n.total += C, C && (e.adler = n.check = n.flags ? a(n.check, m, C, _ - C) : i(n.check, m, C, _ - C)), C = y, (n.flags ? b : h(b)) !== n.check) {
													e.msg = "incorrect data check", n.mode = 30;
													break;
												}
												x = b = 0;
											}
											n.mode = 28;
										case 28:
											if (n.wrap && n.flags) {
												for (; x < 32;) {
													if (v === 0) break t;
													v--, b += p[g++] << x, x += 8;
												}
												if (b !== (4294967295 & n.total)) {
													e.msg = "incorrect length check", n.mode = 30;
													break;
												}
												x = b = 0;
											}
											n.mode = 29;
										case 29:
											I = 1;
											break t;
										case 30:
											I = -3;
											break t;
										case 31: return -4;
										default: return d;
									}
									return e.next_out = _, e.avail_out = y, e.next_in = g, e.avail_in = v, n.hold = b, n.bits = x, (n.wsize || C !== e.avail_out && n.mode < 30 && (n.mode < 27 || t !== 4)) && T(e, e.output, e.next_out, C - e.avail_out) ? (n.mode = 31, -4) : (S -= e.avail_in, C -= e.avail_out, e.total_in += S, e.total_out += C, n.total += C, n.wrap && C && (e.adler = n.check = n.flags ? a(n.check, m, C, e.next_out - C) : i(n.check, m, C, e.next_out - C)), e.data_type = n.bits + (n.last ? 64 : 0) + (n.mode === 12 ? 128 : 0) + (n.mode === 20 || n.mode === 15 ? 256 : 0), (S == 0 && C === 0 || t === 4) && I === u && (I = -5), I);
								}, n.inflateEnd = function(e) {
									if (!e || !e.state) return d;
									var t = e.state;
									return t.window &&= null, e.state = null, u;
								}, n.inflateGetHeader = function(e, t) {
									var n;
									return e && e.state && 2 & (n = e.state).wrap ? ((n.head = t).done = !1, u) : d;
								}, n.inflateSetDictionary = function(e, t) {
									var n, r = t.length;
									return e && e.state ? (n = e.state).wrap !== 0 && n.mode !== 11 ? d : n.mode === 11 && i(1, t, r, 0) !== n.check ? -3 : T(e, t, r, r) ? (n.mode = 31, -4) : (n.havedict = 1, u) : d;
								}, n.inflateInfo = "pako inflate (from Nodeca project)";
							}, {
								"../utils/common": 41,
								"./adler32": 43,
								"./crc32": 45,
								"./inffast": 48,
								"./inftrees": 50
							}],
							50: [function(e, t, n) {
								var r = e("../utils/common"), i = [
									3,
									4,
									5,
									6,
									7,
									8,
									9,
									10,
									11,
									13,
									15,
									17,
									19,
									23,
									27,
									31,
									35,
									43,
									51,
									59,
									67,
									83,
									99,
									115,
									131,
									163,
									195,
									227,
									258,
									0,
									0
								], a = [
									16,
									16,
									16,
									16,
									16,
									16,
									16,
									16,
									17,
									17,
									17,
									17,
									18,
									18,
									18,
									18,
									19,
									19,
									19,
									19,
									20,
									20,
									20,
									20,
									21,
									21,
									21,
									21,
									16,
									72,
									78
								], o = [
									1,
									2,
									3,
									4,
									5,
									7,
									9,
									13,
									17,
									25,
									33,
									49,
									65,
									97,
									129,
									193,
									257,
									385,
									513,
									769,
									1025,
									1537,
									2049,
									3073,
									4097,
									6145,
									8193,
									12289,
									16385,
									24577,
									0,
									0
								], s = [
									16,
									16,
									16,
									16,
									17,
									17,
									18,
									18,
									19,
									19,
									20,
									20,
									21,
									21,
									22,
									22,
									23,
									23,
									24,
									24,
									25,
									25,
									26,
									26,
									27,
									27,
									28,
									28,
									29,
									29,
									64,
									64
								];
								t.exports = function(e, t, n, c, l, u, d, f) {
									var p, m, h, g, _, v, y, b, x, S = f.bits, C = 0, w = 0, T = 0, E = 0, D = 0, O = 0, k = 0, A = 0, j = 0, M = 0, N = null, P = 0, F = new r.Buf16(16), I = new r.Buf16(16), L = null, R = 0;
									for (C = 0; C <= 15; C++) F[C] = 0;
									for (w = 0; w < c; w++) F[t[n + w]]++;
									for (D = S, E = 15; 1 <= E && F[E] === 0; E--);
									if (E < D && (D = E), E === 0) return l[u++] = 20971520, l[u++] = 20971520, f.bits = 1, 0;
									for (T = 1; T < E && F[T] === 0; T++);
									for (D < T && (D = T), C = A = 1; C <= 15; C++) if (A <<= 1, (A -= F[C]) < 0) return -1;
									if (0 < A && (e === 0 || E !== 1)) return -1;
									for (I[1] = 0, C = 1; C < 15; C++) I[C + 1] = I[C] + F[C];
									for (w = 0; w < c; w++) t[n + w] !== 0 && (d[I[t[n + w]]++] = w);
									if (v = e === 0 ? (N = L = d, 19) : e === 1 ? (N = i, P -= 257, L = a, R -= 257, 256) : (N = o, L = s, -1), C = T, _ = u, k = w = M = 0, h = -1, g = (j = 1 << (O = D)) - 1, e === 1 && 852 < j || e === 2 && 592 < j) return 1;
									for (;;) {
										for (y = C - k, x = d[w] < v ? (b = 0, d[w]) : d[w] > v ? (b = L[R + d[w]], N[P + d[w]]) : (b = 96, 0), p = 1 << C - k, T = m = 1 << O; l[_ + (M >> k) + (m -= p)] = y << 24 | b << 16 | x | 0, m !== 0;);
										for (p = 1 << C - 1; M & p;) p >>= 1;
										if (p === 0 ? M = 0 : (M &= p - 1, M += p), w++, --F[C] == 0) {
											if (C === E) break;
											C = t[n + d[w]];
										}
										if (D < C && (M & g) !== h) {
											for (k === 0 && (k = D), _ += T, A = 1 << (O = C - k); O + k < E && !((A -= F[O + k]) <= 0);) O++, A <<= 1;
											if (j += 1 << O, e === 1 && 852 < j || e === 2 && 592 < j) return 1;
											l[h = M & g] = D << 24 | O << 16 | _ - u | 0;
										}
									}
									return M !== 0 && (l[_ + M] = C - k << 24 | 4194304), f.bits = D, 0;
								};
							}, { "../utils/common": 41 }],
							51: [function(e, t, n) {
								t.exports = {
									2: "need dictionary",
									1: "stream end",
									0: "",
									"-1": "file error",
									"-2": "stream error",
									"-3": "data error",
									"-4": "insufficient memory",
									"-5": "buffer error",
									"-6": "incompatible version"
								};
							}, {}],
							52: [function(e, t, n) {
								var r = e("../utils/common"), i = 0, a = 1;
								function o(e) {
									for (var t = e.length; 0 <= --t;) e[t] = 0;
								}
								var s = 0, c = 29, l = 256, u = l + 1 + c, d = 30, f = 19, p = 2 * u + 1, m = 15, h = 16, g = 7, _ = 256, v = 16, y = 17, b = 18, x = [
									0,
									0,
									0,
									0,
									0,
									0,
									0,
									0,
									1,
									1,
									1,
									1,
									2,
									2,
									2,
									2,
									3,
									3,
									3,
									3,
									4,
									4,
									4,
									4,
									5,
									5,
									5,
									5,
									0
								], S = [
									0,
									0,
									0,
									0,
									1,
									1,
									2,
									2,
									3,
									3,
									4,
									4,
									5,
									5,
									6,
									6,
									7,
									7,
									8,
									8,
									9,
									9,
									10,
									10,
									11,
									11,
									12,
									12,
									13,
									13
								], C = [
									0,
									0,
									0,
									0,
									0,
									0,
									0,
									0,
									0,
									0,
									0,
									0,
									0,
									0,
									0,
									0,
									2,
									3,
									7
								], w = [
									16,
									17,
									18,
									0,
									8,
									7,
									9,
									6,
									10,
									5,
									11,
									4,
									12,
									3,
									13,
									2,
									14,
									1,
									15
								], T = Array(2 * (u + 2));
								o(T);
								var E = Array(2 * d);
								o(E);
								var D = Array(512);
								o(D);
								var O = Array(256);
								o(O);
								var k = Array(c);
								o(k);
								var A, j, M, N = Array(d);
								function P(e, t, n, r, i) {
									this.static_tree = e, this.extra_bits = t, this.extra_base = n, this.elems = r, this.max_length = i, this.has_stree = e && e.length;
								}
								function F(e, t) {
									this.dyn_tree = e, this.max_code = 0, this.stat_desc = t;
								}
								function I(e) {
									return e < 256 ? D[e] : D[256 + (e >>> 7)];
								}
								function L(e, t) {
									e.pending_buf[e.pending++] = 255 & t, e.pending_buf[e.pending++] = t >>> 8 & 255;
								}
								function R(e, t, n) {
									e.bi_valid > h - n ? (e.bi_buf |= t << e.bi_valid & 65535, L(e, e.bi_buf), e.bi_buf = t >> h - e.bi_valid, e.bi_valid += n - h) : (e.bi_buf |= t << e.bi_valid & 65535, e.bi_valid += n);
								}
								function z(e, t, n) {
									R(e, n[2 * t], n[2 * t + 1]);
								}
								function B(e, t) {
									for (var n = 0; n |= 1 & e, e >>>= 1, n <<= 1, 0 < --t;);
									return n >>> 1;
								}
								function V(e, t, n) {
									var r, i, a = Array(m + 1), o = 0;
									for (r = 1; r <= m; r++) a[r] = o = o + n[r - 1] << 1;
									for (i = 0; i <= t; i++) {
										var s = e[2 * i + 1];
										s !== 0 && (e[2 * i] = B(a[s]++, s));
									}
								}
								function H(e) {
									for (var t = 0; t < u; t++) e.dyn_ltree[2 * t] = 0;
									for (t = 0; t < d; t++) e.dyn_dtree[2 * t] = 0;
									for (t = 0; t < f; t++) e.bl_tree[2 * t] = 0;
									e.dyn_ltree[2 * _] = 1, e.opt_len = e.static_len = 0, e.last_lit = e.matches = 0;
								}
								function U(e) {
									8 < e.bi_valid ? L(e, e.bi_buf) : 0 < e.bi_valid && (e.pending_buf[e.pending++] = e.bi_buf), e.bi_buf = 0, e.bi_valid = 0;
								}
								function ee(e, t, n, r) {
									var i = 2 * t, a = 2 * n;
									return e[i] < e[a] || e[i] === e[a] && r[t] <= r[n];
								}
								function W(e, t, n) {
									for (var r = e.heap[n], i = n << 1; i <= e.heap_len && (i < e.heap_len && ee(t, e.heap[i + 1], e.heap[i], e.depth) && i++, !ee(t, r, e.heap[i], e.depth));) e.heap[n] = e.heap[i], n = i, i <<= 1;
									e.heap[n] = r;
								}
								function te(e, t, n) {
									var r, i, a, o, s = 0;
									if (e.last_lit !== 0) for (; r = e.pending_buf[e.d_buf + 2 * s] << 8 | e.pending_buf[e.d_buf + 2 * s + 1], i = e.pending_buf[e.l_buf + s], s++, r === 0 ? z(e, i, t) : (z(e, (a = O[i]) + l + 1, t), (o = x[a]) !== 0 && R(e, i -= k[a], o), z(e, a = I(--r), n), (o = S[a]) !== 0 && R(e, r -= N[a], o)), s < e.last_lit;);
									z(e, _, t);
								}
								function G(e, t) {
									var n, r, i, a = t.dyn_tree, o = t.stat_desc.static_tree, s = t.stat_desc.has_stree, c = t.stat_desc.elems, l = -1;
									for (e.heap_len = 0, e.heap_max = p, n = 0; n < c; n++) a[2 * n] === 0 ? a[2 * n + 1] = 0 : (e.heap[++e.heap_len] = l = n, e.depth[n] = 0);
									for (; e.heap_len < 2;) a[2 * (i = e.heap[++e.heap_len] = l < 2 ? ++l : 0)] = 1, e.depth[i] = 0, e.opt_len--, s && (e.static_len -= o[2 * i + 1]);
									for (t.max_code = l, n = e.heap_len >> 1; 1 <= n; n--) W(e, a, n);
									for (i = c; n = e.heap[1], e.heap[1] = e.heap[e.heap_len--], W(e, a, 1), r = e.heap[1], e.heap[--e.heap_max] = n, e.heap[--e.heap_max] = r, a[2 * i] = a[2 * n] + a[2 * r], e.depth[i] = (e.depth[n] >= e.depth[r] ? e.depth[n] : e.depth[r]) + 1, a[2 * n + 1] = a[2 * r + 1] = i, e.heap[1] = i++, W(e, a, 1), 2 <= e.heap_len;);
									e.heap[--e.heap_max] = e.heap[1], function(e, t) {
										var n, r, i, a, o, s, c = t.dyn_tree, l = t.max_code, u = t.stat_desc.static_tree, d = t.stat_desc.has_stree, f = t.stat_desc.extra_bits, h = t.stat_desc.extra_base, g = t.stat_desc.max_length, _ = 0;
										for (a = 0; a <= m; a++) e.bl_count[a] = 0;
										for (c[2 * e.heap[e.heap_max] + 1] = 0, n = e.heap_max + 1; n < p; n++) g < (a = c[2 * c[2 * (r = e.heap[n]) + 1] + 1] + 1) && (a = g, _++), c[2 * r + 1] = a, l < r || (e.bl_count[a]++, o = 0, h <= r && (o = f[r - h]), s = c[2 * r], e.opt_len += s * (a + o), d && (e.static_len += s * (u[2 * r + 1] + o)));
										if (_ !== 0) {
											do {
												for (a = g - 1; e.bl_count[a] === 0;) a--;
												e.bl_count[a]--, e.bl_count[a + 1] += 2, e.bl_count[g]--, _ -= 2;
											} while (0 < _);
											for (a = g; a !== 0; a--) for (r = e.bl_count[a]; r !== 0;) l < (i = e.heap[--n]) || (c[2 * i + 1] !== a && (e.opt_len += (a - c[2 * i + 1]) * c[2 * i], c[2 * i + 1] = a), r--);
										}
									}(e, t), V(a, l, e.bl_count);
								}
								function ne(e, t, n) {
									var r, i, a = -1, o = t[1], s = 0, c = 7, l = 4;
									for (o === 0 && (c = 138, l = 3), t[2 * (n + 1) + 1] = 65535, r = 0; r <= n; r++) i = o, o = t[2 * (r + 1) + 1], ++s < c && i === o || (s < l ? e.bl_tree[2 * i] += s : i === 0 ? s <= 10 ? e.bl_tree[2 * y]++ : e.bl_tree[2 * b]++ : (i !== a && e.bl_tree[2 * i]++, e.bl_tree[2 * v]++), a = i, l = (s = 0) === o ? (c = 138, 3) : i === o ? (c = 6, 3) : (c = 7, 4));
								}
								function re(e, t, n) {
									var r, i, a = -1, o = t[1], s = 0, c = 7, l = 4;
									for (o === 0 && (c = 138, l = 3), r = 0; r <= n; r++) if (i = o, o = t[2 * (r + 1) + 1], !(++s < c && i === o)) {
										if (s < l) for (; z(e, i, e.bl_tree), --s != 0;);
										else i === 0 ? s <= 10 ? (z(e, y, e.bl_tree), R(e, s - 3, 3)) : (z(e, b, e.bl_tree), R(e, s - 11, 7)) : (i !== a && (z(e, i, e.bl_tree), s--), z(e, v, e.bl_tree), R(e, s - 3, 2));
										a = i, l = (s = 0) === o ? (c = 138, 3) : i === o ? (c = 6, 3) : (c = 7, 4);
									}
								}
								o(N);
								var ie = !1;
								function ae(e, t, n, i) {
									R(e, (s << 1) + +!!i, 3), function(e, t, n, i) {
										U(e), i && (L(e, n), L(e, ~n)), r.arraySet(e.pending_buf, e.window, t, n, e.pending), e.pending += n;
									}(e, t, n, !0);
								}
								n._tr_init = function(e) {
									ie ||= (function() {
										var e, t, n, r, i, a = Array(m + 1);
										for (r = n = 0; r < c - 1; r++) for (k[r] = n, e = 0; e < 1 << x[r]; e++) O[n++] = r;
										for (O[n - 1] = r, r = i = 0; r < 16; r++) for (N[r] = i, e = 0; e < 1 << S[r]; e++) D[i++] = r;
										for (i >>= 7; r < d; r++) for (N[r] = i << 7, e = 0; e < 1 << S[r] - 7; e++) D[256 + i++] = r;
										for (t = 0; t <= m; t++) a[t] = 0;
										for (e = 0; e <= 143;) T[2 * e + 1] = 8, e++, a[8]++;
										for (; e <= 255;) T[2 * e + 1] = 9, e++, a[9]++;
										for (; e <= 279;) T[2 * e + 1] = 7, e++, a[7]++;
										for (; e <= 287;) T[2 * e + 1] = 8, e++, a[8]++;
										for (V(T, u + 1, a), e = 0; e < d; e++) E[2 * e + 1] = 5, E[2 * e] = B(e, 5);
										A = new P(T, x, l + 1, u, m), j = new P(E, S, 0, d, m), M = new P([], C, 0, f, g);
									}(), !0), e.l_desc = new F(e.dyn_ltree, A), e.d_desc = new F(e.dyn_dtree, j), e.bl_desc = new F(e.bl_tree, M), e.bi_buf = 0, e.bi_valid = 0, H(e);
								}, n._tr_stored_block = ae, n._tr_flush_block = function(e, t, n, r) {
									var o, s, c = 0;
									0 < e.level ? (e.strm.data_type === 2 && (e.strm.data_type = function(e) {
										var t, n = 4093624447;
										for (t = 0; t <= 31; t++, n >>>= 1) if (1 & n && e.dyn_ltree[2 * t] !== 0) return i;
										if (e.dyn_ltree[18] !== 0 || e.dyn_ltree[20] !== 0 || e.dyn_ltree[26] !== 0) return a;
										for (t = 32; t < l; t++) if (e.dyn_ltree[2 * t] !== 0) return a;
										return i;
									}(e)), G(e, e.l_desc), G(e, e.d_desc), c = function(e) {
										var t;
										for (ne(e, e.dyn_ltree, e.l_desc.max_code), ne(e, e.dyn_dtree, e.d_desc.max_code), G(e, e.bl_desc), t = f - 1; 3 <= t && e.bl_tree[2 * w[t] + 1] === 0; t--);
										return e.opt_len += 3 * (t + 1) + 5 + 5 + 4, t;
									}(e), o = e.opt_len + 3 + 7 >>> 3, (s = e.static_len + 3 + 7 >>> 3) <= o && (o = s)) : o = s = n + 5, n + 4 <= o && t !== -1 ? ae(e, t, n, r) : e.strategy === 4 || s === o ? (R(e, 2 + +!!r, 3), te(e, T, E)) : (R(e, 4 + +!!r, 3), function(e, t, n, r) {
										var i;
										for (R(e, t - 257, 5), R(e, n - 1, 5), R(e, r - 4, 4), i = 0; i < r; i++) R(e, e.bl_tree[2 * w[i] + 1], 3);
										re(e, e.dyn_ltree, t - 1), re(e, e.dyn_dtree, n - 1);
									}(e, e.l_desc.max_code + 1, e.d_desc.max_code + 1, c + 1), te(e, e.dyn_ltree, e.dyn_dtree)), H(e), r && U(e);
								}, n._tr_tally = function(e, t, n) {
									return e.pending_buf[e.d_buf + 2 * e.last_lit] = t >>> 8 & 255, e.pending_buf[e.d_buf + 2 * e.last_lit + 1] = 255 & t, e.pending_buf[e.l_buf + e.last_lit] = 255 & n, e.last_lit++, t === 0 ? e.dyn_ltree[2 * n]++ : (e.matches++, t--, e.dyn_ltree[2 * (O[n] + l + 1)]++, e.dyn_dtree[2 * I(t)]++), e.last_lit === e.lit_bufsize - 1;
								}, n._tr_align = function(e) {
									R(e, 2, 3), z(e, _, T), function(e) {
										e.bi_valid === 16 ? (L(e, e.bi_buf), e.bi_buf = 0, e.bi_valid = 0) : 8 <= e.bi_valid && (e.pending_buf[e.pending++] = 255 & e.bi_buf, e.bi_buf >>= 8, e.bi_valid -= 8);
									}(e);
								};
							}, { "../utils/common": 41 }],
							53: [function(e, t, n) {
								t.exports = function() {
									this.input = null, this.next_in = 0, this.avail_in = 0, this.total_in = 0, this.output = null, this.next_out = 0, this.avail_out = 0, this.total_out = 0, this.msg = "", this.state = null, this.data_type = 2, this.adler = 0;
								};
							}, {}],
							54: [function(e, t, n) {
								t.exports = typeof setImmediate == "function" ? setImmediate : function() {
									var e = [].slice.apply(arguments);
									e.splice(1, 0, 0), setTimeout.apply(null, e);
								};
							}, {}]
						}, {}, [10])(10);
					});
				}).call(this, typeof global < "u" ? global : typeof self < "u" ? self : typeof window < "u" ? window : {}, t("buffer").Buffer);
			}, { buffer: 48 }],
			54: [function(e, t, n) {
				n.Parser = e("./lib/parser").Parser, n.rules = e("./lib/rules"), n.errors = e("./lib/errors"), n.results = e("./lib/parsing-results"), n.StringSource = e("./lib/StringSource"), n.Token = e("./lib/Token"), n.bottomUp = e("./lib/bottom-up"), n.RegexTokeniser = e("./lib/regex-tokeniser").RegexTokeniser, n.rule = function(e) {
					var t;
					return function(n) {
						return t ||= e(), t(n);
					};
				};
			}, {
				"./lib/StringSource": 55,
				"./lib/Token": 56,
				"./lib/bottom-up": 58,
				"./lib/errors": 59,
				"./lib/parser": 61,
				"./lib/parsing-results": 62,
				"./lib/regex-tokeniser": 63,
				"./lib/rules": 64
			}],
			55: [function(e, t, n) {
				t.exports = function(e, t) {
					return {
						asString: function() {
							return e;
						},
						range: function(n, i) {
							return new r(e, t, n, i);
						}
					};
				};
				var r = function(e, t, n, r) {
					this._string = e, this._description = t, this._startIndex = n, this._endIndex = r;
				};
				r.prototype.to = function(e) {
					return new r(this._string, this._description, this._startIndex, e._endIndex);
				}, r.prototype.describe = function() {
					var e = this._position();
					return (this._description ? this._description + "\n" : "") + "Line number: " + e.lineNumber + "\nCharacter number: " + e.characterNumber;
				}, r.prototype.lineNumber = function() {
					return this._position().lineNumber;
				}, r.prototype.characterNumber = function() {
					return this._position().characterNumber;
				}, r.prototype._position = function() {
					for (var e = this, t = 0, n = function() {
						return e._string.indexOf("\n", t);
					}, r = 1; n() !== -1 && n() < this._startIndex;) t = n() + 1, r += 1;
					var i = this._startIndex - t + 1;
					return {
						lineNumber: r,
						characterNumber: i
					};
				};
			}, {}],
			56: [function(e, t, n) {
				t.exports = function(e, t, n) {
					this.name = e, this.value = t, n && (this.source = n);
				};
			}, {}],
			57: [function(e, t, n) {
				var r = t.exports = function(e, t) {
					this._tokens = e, this._startIndex = t || 0;
				};
				r.prototype.head = function() {
					return this._tokens[this._startIndex];
				}, r.prototype.tail = function(e) {
					return new r(this._tokens, this._startIndex + 1);
				}, r.prototype.toArray = function() {
					return this._tokens.slice(this._startIndex);
				}, r.prototype.end = function() {
					return this._tokens[this._tokens.length - 1];
				}, r.prototype.to = function(e) {
					var t = this.head().source, n = e.head() || e.end();
					return t.to(n.source);
				};
			}, {}],
			58: [function(e, t, n) {
				var r = e("./rules"), i = e("./parsing-results");
				n.parser = function(e, t, n) {
					var i = {
						rule: u,
						leftAssociative: d,
						rightAssociative: f
					}, s = new a(n.map(l)), c = r.firstOf(e, t);
					function l(e) {
						return {
							name: e.name,
							rule: o(e.ruleBuilder.bind(null, i))
						};
					}
					function u() {
						return p(s);
					}
					function d(e) {
						return p(s.untilExclusive(e));
					}
					function f(e) {
						return p(s.untilInclusive(e));
					}
					function p(e) {
						return m.bind(null, e);
					}
					function m(e, t) {
						var n = c(t);
						return n.isSuccess() ? e.apply(n) : n;
					}
					return i;
				};
				function a(e) {
					function t(t) {
						return new a(e.slice(0, o().indexOf(t)));
					}
					function n(t) {
						return new a(e.slice(0, o().indexOf(t) + 1));
					}
					function o() {
						return e.map(function(e) {
							return e.name;
						});
					}
					function s(e) {
						for (var t, n;;) if (t = c(e.remaining()), t.isSuccess()) n = e.source().to(t.source()), e = i.success(t.value()(e.value(), n), t.remaining(), n);
						else if (t.isFailure()) return e;
						else return t;
					}
					function c(t) {
						return r.firstOf("infix", e.map(function(e) {
							return e.rule;
						}))(t);
					}
					return {
						apply: s,
						untilExclusive: t,
						untilInclusive: n
					};
				}
				n.infix = function(e, t) {
					function r(r) {
						return n.infix(e, function(e) {
							var n = t(e);
							return function(e) {
								return n(e).map(function(e) {
									return function(t, n) {
										return r(t, e, n);
									};
								});
							};
						});
					}
					return {
						name: e,
						ruleBuilder: t,
						map: r
					};
				};
				var o = function(e) {
					var t;
					return function(n) {
						return t ||= e(), t(n);
					};
				};
			}, {
				"./parsing-results": 62,
				"./rules": 64
			}],
			59: [function(e, t, n) {
				n.error = function(e) {
					return new r(e);
				};
				var r = function(e) {
					this.expected = e.expected, this.actual = e.actual, this._location = e.location;
				};
				r.prototype.describe = function() {
					return (this._location ? this._location.describe() + ":\n" : "") + "Expected " + this.expected + "\nbut got " + this.actual;
				}, r.prototype.lineNumber = function() {
					return this._location.lineNumber();
				}, r.prototype.characterNumber = function() {
					return this._location.characterNumber();
				};
			}, {}],
			60: [function(e, t, n) {
				n.fromArray = function(e) {
					var t = 0, n = function() {
						return t < e.length;
					};
					return new r({
						hasNext: n,
						next: function() {
							if (n()) return e[t++];
							throw Error("No more elements");
						}
					});
				};
				var r = function(e) {
					this._iterator = e;
				};
				r.prototype.map = function(e) {
					var t = this._iterator;
					return new r({
						hasNext: function() {
							return t.hasNext();
						},
						next: function() {
							return e(t.next());
						}
					});
				}, r.prototype.filter = function(e) {
					var t = this._iterator, n = !1, i = !1, a, o = function() {
						if (!n) for (n = !0, i = !1; t.hasNext() && !i;) a = t.next(), i = e(a);
					};
					return new r({
						hasNext: function() {
							return o(), i;
						},
						next: function() {
							o();
							var e = a;
							return n = !1, e;
						}
					});
				}, r.prototype.first = function() {
					var e = this._iterator;
					return this._iterator.hasNext() ? e.next() : null;
				}, r.prototype.toArray = function() {
					for (var e = []; this._iterator.hasNext();) e.push(this._iterator.next());
					return e;
				};
			}, {}],
			61: [function(e, t, n) {
				var r = e("./TokenIterator");
				n.Parser = function(e) {
					return { parseTokens: function(e, t) {
						return e(new r(t));
					} };
				};
			}, { "./TokenIterator": 57 }],
			62: [function(e, t, n) {
				t.exports = {
					failure: function(e, t) {
						if (e.length < 1) throw Error("Failure must have errors");
						return new r({
							status: "failure",
							remaining: t,
							errors: e
						});
					},
					error: function(e, t) {
						if (e.length < 1) throw Error("Failure must have errors");
						return new r({
							status: "error",
							remaining: t,
							errors: e
						});
					},
					success: function(e, t, n) {
						return new r({
							status: "success",
							value: e,
							source: n,
							remaining: t,
							errors: []
						});
					},
					cut: function(e) {
						return new r({
							status: "cut",
							remaining: e,
							errors: []
						});
					}
				};
				var r = function(e) {
					this._value = e.value, this._status = e.status, this._hasValue = e.value !== void 0, this._remaining = e.remaining, this._source = e.source, this._errors = e.errors;
				};
				r.prototype.map = function(e) {
					return this._hasValue ? new r({
						value: e(this._value, this._source),
						status: this._status,
						remaining: this._remaining,
						source: this._source,
						errors: this._errors
					}) : this;
				}, r.prototype.changeRemaining = function(e) {
					return new r({
						value: this._value,
						status: this._status,
						remaining: e,
						source: this._source,
						errors: this._errors
					});
				}, r.prototype.isSuccess = function() {
					return this._status === "success" || this._status === "cut";
				}, r.prototype.isFailure = function() {
					return this._status === "failure";
				}, r.prototype.isError = function() {
					return this._status === "error";
				}, r.prototype.isCut = function() {
					return this._status === "cut";
				}, r.prototype.value = function() {
					return this._value;
				}, r.prototype.remaining = function() {
					return this._remaining;
				}, r.prototype.source = function() {
					return this._source;
				}, r.prototype.errors = function() {
					return this._errors;
				};
			}, {}],
			63: [function(e, t, n) {
				var r = e("./Token"), i = e("./StringSource");
				n.RegexTokeniser = a;
				function a(e) {
					e = e.map(function(e) {
						return {
							name: e.name,
							regex: new RegExp(e.regex.source, "g")
						};
					});
					function t(e, t) {
						for (var r = new i(e, t), o = 0, s = []; o < e.length;) {
							var c = n(e, o, r);
							o = c.endIndex, s.push(c.token);
						}
						return s.push(a(e, r)), s;
					}
					function n(t, n, i) {
						for (var a = 0; a < e.length; a++) {
							var o = e[a].regex;
							o.lastIndex = n;
							var s = o.exec(t);
							if (s) {
								var c = n + s[0].length;
								if (s.index === n && c > n) {
									var l = s[1], u = new r(e[a].name, l, i.range(n, c));
									return {
										token: u,
										endIndex: c
									};
								}
							}
						}
						var c = n + 1, u = new r("unrecognisedCharacter", t.substring(n, c), i.range(n, c));
						return {
							token: u,
							endIndex: c
						};
					}
					function a(e, t) {
						return new r("end", null, t.range(e.length, e.length));
					}
					return { tokenise: t };
				}
			}, {
				"./StringSource": 55,
				"./Token": 56
			}],
			64: [function(e, t, n) {
				var r = e("underscore"), i = e("option"), a = e("./parsing-results"), o = e("./errors"), s = e("./lazy-iterators");
				n.token = function(e, t) {
					var n = t !== void 0;
					return function(r) {
						var i = r.head();
						return i && i.name === e && (!n || i.value === t) ? a.success(i.value, r.tail(), i.source) : p(r, f({
							name: e,
							value: t
						}));
					};
				}, n.tokenOfType = function(e) {
					return n.token(e);
				}, n.firstOf = function(e, t) {
					return r.isArray(t) || (t = Array.prototype.slice.call(arguments, 1)), function(n) {
						return s.fromArray(t).map(function(e) {
							return e(n);
						}).filter(function(e) {
							return e.isSuccess() || e.isError();
						}).first() || p(n, e);
					};
				}, n.then = function(e, t) {
					return function(n) {
						var r = e(n);
						return r.map || console.log(r), r.map(t);
					};
				}, n.sequence = function() {
					var e = Array.prototype.slice.call(arguments, 0), t = function(t) {
						var i = r.foldl(e, function(e, n) {
							var r = e.result, i = e.hasCut;
							if (!r.isSuccess()) return {
								result: r,
								hasCut: i
							};
							var o = n(r.remaining());
							if (o.isCut()) return {
								result: r,
								hasCut: !0
							};
							if (o.isSuccess()) {
								var s = n.isCaptured ? r.value().withValue(n, o.value()) : r.value(), c = o.remaining(), l = t.to(c);
								return {
									result: a.success(s, c, l),
									hasCut: i
								};
							}
							return i ? {
								result: a.error(o.errors(), o.remaining()),
								hasCut: i
							} : {
								result: o,
								hasCut: i
							};
						}, {
							result: a.success(new c(), t),
							hasCut: !1
						}).result, o = t.to(i.remaining());
						return i.map(function(e) {
							return e.withValue(n.sequence.source, o);
						});
					};
					t.head = function() {
						var a = r.find(e, i);
						return n.then(t, n.sequence.extract(a));
					}, t.map = function(e) {
						return n.then(t, function(t) {
							return e.apply(this, t.toArray());
						});
					};
					function i(e) {
						return e.isCaptured;
					}
					return t;
				};
				var c = function(e, t) {
					this._values = e || {}, this._valuesArray = t || [];
				};
				c.prototype.withValue = function(e, t) {
					if (e.captureName && e.captureName in this._values) throw Error("Cannot add second value for capture \"" + e.captureName + "\"");
					var n = r.clone(this._values);
					return n[e.captureName] = t, new c(n, this._valuesArray.concat([t]));
				}, c.prototype.get = function(e) {
					if (e.captureName in this._values) return this._values[e.captureName];
					throw Error("No value for capture \"" + e.captureName + "\"");
				}, c.prototype.toArray = function() {
					return this._valuesArray;
				}, n.sequence.capture = function(e, t) {
					var n = function() {
						return e.apply(this, arguments);
					};
					return n.captureName = t, n.isCaptured = !0, n;
				}, n.sequence.extract = function(e) {
					return function(t) {
						return t.get(e);
					};
				}, n.sequence.applyValues = function(e) {
					var t = Array.prototype.slice.call(arguments, 1);
					return function(n) {
						var r = t.map(function(e) {
							return n.get(e);
						});
						return e.apply(this, r);
					};
				}, n.sequence.source = { captureName: "☃source☃" }, n.sequence.cut = function() {
					return function(e) {
						return a.cut(e);
					};
				}, n.optional = function(e) {
					return function(t) {
						var n = e(t);
						return n.isSuccess() ? n.map(i.some) : n.isFailure() ? a.success(i.none, t) : n;
					};
				}, n.zeroOrMoreWithSeparator = function(e, t) {
					return d(e, t, !1);
				}, n.oneOrMoreWithSeparator = function(e, t) {
					return d(e, t, !0);
				};
				var l = n.zeroOrMore = function(e) {
					return function(t) {
						for (var n = [], r; (r = e(t)) && r.isSuccess();) t = r.remaining(), n.push(r.value());
						return r.isError() ? r : a.success(n, t);
					};
				};
				n.oneOrMore = function(e) {
					return n.oneOrMoreWithSeparator(e, u);
				};
				function u(e) {
					return a.success(null, e);
				}
				var d = function(e, t, r) {
					return function(i) {
						var o = e(i);
						if (o.isSuccess()) {
							var s = n.sequence.capture(e, "main"), c = l(n.then(n.sequence(t, s), n.sequence.extract(s)))(o.remaining());
							return a.success([o.value()].concat(c.value()), c.remaining());
						}
						return r || o.isError() ? o : a.success([], i);
					};
				};
				n.leftAssociative = function(e, t, r) {
					var i = r ? [{
						func: r,
						rule: t
					}] : t;
					i = i.map(function(e) {
						return n.then(e.rule, function(t) {
							return function(n, r) {
								return e.func(n, t, r);
							};
						});
					});
					var o = n.firstOf.apply(null, ["rules"].concat(i));
					return function(t) {
						var n = t, r = e(t);
						if (!r.isSuccess()) return r;
						for (var i = o(r.remaining()); i.isSuccess();) {
							var s = i.remaining(), c = n.to(i.remaining()), l = i.value();
							r = a.success(l(r.value(), c), s, c), i = o(r.remaining());
						}
						return i.isError() ? i : r;
					};
				}, n.leftAssociative.firstOf = function() {
					return Array.prototype.slice.call(arguments, 0);
				}, n.nonConsuming = function(e) {
					return function(t) {
						return e(t).changeRemaining(t);
					};
				};
				var f = function(e) {
					return e.value ? e.name + " \"" + e.value + "\"" : e.name;
				};
				function p(e, t) {
					var n, r = e.head();
					return n = r ? o.error({
						expected: t,
						actual: f(r),
						location: r.source
					}) : o.error({
						expected: t,
						actual: "end of tokens"
					}), a.failure([n], e);
				}
			}, {
				"./errors": 59,
				"./lazy-iterators": 60,
				"./parsing-results": 62,
				option: 65,
				underscore: 67
			}],
			65: [function(e, t, n) {
				n.none = Object.create({
					value: function() {
						throw Error("Called value on none");
					},
					isNone: function() {
						return !0;
					},
					isSome: function() {
						return !1;
					},
					map: function() {
						return n.none;
					},
					flatMap: function() {
						return n.none;
					},
					filter: function() {
						return n.none;
					},
					toArray: function() {
						return [];
					},
					orElse: r,
					valueOrElse: r
				});
				function r(e) {
					return typeof e == "function" ? e() : e;
				}
				n.some = function(e) {
					return new i(e);
				};
				var i = function(e) {
					this._value = e;
				};
				i.prototype.value = function() {
					return this._value;
				}, i.prototype.isNone = function() {
					return !1;
				}, i.prototype.isSome = function() {
					return !0;
				}, i.prototype.map = function(e) {
					return new i(e(this._value));
				}, i.prototype.flatMap = function(e) {
					return e(this._value);
				}, i.prototype.filter = function(e) {
					return e(this._value) ? this : n.none;
				}, i.prototype.toArray = function() {
					return [this._value];
				}, i.prototype.orElse = function(e) {
					return this;
				}, i.prototype.valueOrElse = function(e) {
					return this._value;
				}, n.isOption = function(e) {
					return e === n.none || e instanceof i;
				}, n.fromNullable = function(e) {
					return e == null ? n.none : new i(e);
				};
			}, {}],
			66: [function(e, t, n) {
				var r = t.exports = {}, i, a;
				function o() {
					throw Error("setTimeout has not been defined");
				}
				function s() {
					throw Error("clearTimeout has not been defined");
				}
				(function() {
					try {
						i = typeof setTimeout == "function" ? setTimeout : o;
					} catch {
						i = o;
					}
					try {
						a = typeof clearTimeout == "function" ? clearTimeout : s;
					} catch {
						a = s;
					}
				})();
				function c(e) {
					if (i === setTimeout) return setTimeout(e, 0);
					if ((i === o || !i) && setTimeout) return i = setTimeout, setTimeout(e, 0);
					try {
						return i(e, 0);
					} catch {
						try {
							return i.call(null, e, 0);
						} catch {
							return i.call(this, e, 0);
						}
					}
				}
				function l(e) {
					if (a === clearTimeout) return clearTimeout(e);
					if ((a === s || !a) && clearTimeout) return a = clearTimeout, clearTimeout(e);
					try {
						return a(e);
					} catch {
						try {
							return a.call(null, e);
						} catch {
							return a.call(this, e);
						}
					}
				}
				var u = [], d = !1, f, p = -1;
				function m() {
					d && f && (d = !1, f.length ? u = f.concat(u) : p = -1, u.length && h());
				}
				function h() {
					if (!d) {
						var e = c(m);
						d = !0;
						for (var t = u.length; t;) {
							for (f = u, u = []; ++p < t;) f && f[p].run();
							p = -1, t = u.length;
						}
						f = null, d = !1, l(e);
					}
				}
				r.nextTick = function(e) {
					var t = Array(arguments.length - 1);
					if (arguments.length > 1) for (var n = 1; n < arguments.length; n++) t[n - 1] = arguments[n];
					u.push(new g(e, t)), u.length === 1 && !d && c(h);
				};
				function g(e, t) {
					this.fun = e, this.array = t;
				}
				g.prototype.run = function() {
					this.fun.apply(null, this.array);
				}, r.title = "browser", r.browser = !0, r.env = {}, r.argv = [], r.version = "", r.versions = {};
				function _() {}
				r.on = _, r.addListener = _, r.once = _, r.off = _, r.removeListener = _, r.removeAllListeners = _, r.emit = _, r.binding = function(e) {
					throw Error("process.binding is not supported");
				}, r.cwd = function() {
					return "/";
				}, r.chdir = function(e) {
					throw Error("process.chdir is not supported");
				}, r.umask = function() {
					return 0;
				};
			}, {}],
			67: [function(t, n, r) {
				(function(t) {
					(function(t, i) {
						typeof r == "object" && n !== void 0 ? n.exports = i() : typeof e == "function" && e.amd ? e("underscore", i) : (t = typeof globalThis < "u" ? globalThis : t || self, function() {
							var e = t._, n = t._ = i();
							n.noConflict = function() {
								return t._ = e, n;
							};
						}());
					})(this, (function() {
						var e = "1.13.1", n = typeof self == "object" && self.self === self && self || typeof t == "object" && t.global === t && t || Function("return this")() || {}, r = Array.prototype, i = Object.prototype, a = typeof Symbol < "u" ? Symbol.prototype : null, o = r.push, s = r.slice, c = i.toString, l = i.hasOwnProperty, u = typeof ArrayBuffer < "u", d = typeof DataView < "u", f = Array.isArray, p = Object.keys, m = Object.create, h = u && ArrayBuffer.isView, g = isNaN, _ = isFinite, v = !{ toString: null }.propertyIsEnumerable("toString"), y = [
							"valueOf",
							"isPrototypeOf",
							"toString",
							"propertyIsEnumerable",
							"hasOwnProperty",
							"toLocaleString"
						], b = 2 ** 53 - 1;
						function x(e, t) {
							return t = t == null ? e.length - 1 : +t, function() {
								for (var n = Math.max(arguments.length - t, 0), r = Array(n), i = 0; i < n; i++) r[i] = arguments[i + t];
								switch (t) {
									case 0: return e.call(this, r);
									case 1: return e.call(this, arguments[0], r);
									case 2: return e.call(this, arguments[0], arguments[1], r);
								}
								var a = Array(t + 1);
								for (i = 0; i < t; i++) a[i] = arguments[i];
								return a[t] = r, e.apply(this, a);
							};
						}
						function S(e) {
							var t = typeof e;
							return t === "function" || t === "object" && !!e;
						}
						function C(e) {
							return e === null;
						}
						function w(e) {
							return e === void 0;
						}
						function T(e) {
							return e === !0 || e === !1 || c.call(e) === "[object Boolean]";
						}
						function E(e) {
							return !!(e && e.nodeType === 1);
						}
						function D(e) {
							var t = "[object " + e + "]";
							return function(e) {
								return c.call(e) === t;
							};
						}
						var O = D("String"), k = D("Number"), A = D("Date"), j = D("RegExp"), M = D("Error"), N = D("Symbol"), P = D("ArrayBuffer"), F = D("Function"), I = n.document && n.document.childNodes;
						typeof /./ != "function" && typeof Int8Array != "object" && typeof I != "function" && (F = function(e) {
							return typeof e == "function" || !1;
						});
						var L = F, R = D("Object"), z = d && R(/* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(8))), B = typeof Map < "u" && R(/* @__PURE__ */ new Map()), V = D("DataView");
						function H(e) {
							return e != null && L(e.getInt8) && P(e.buffer);
						}
						var U = z ? H : V, ee = f || D("Array");
						function W(e, t) {
							return e != null && l.call(e, t);
						}
						var te = D("Arguments");
						(function() {
							te(arguments) || (te = function(e) {
								return W(e, "callee");
							});
						})();
						var G = te;
						function ne(e) {
							return !N(e) && _(e) && !isNaN(parseFloat(e));
						}
						function re(e) {
							return k(e) && g(e);
						}
						function ie(e) {
							return function() {
								return e;
							};
						}
						function ae(e) {
							return function(t) {
								var n = e(t);
								return typeof n == "number" && n >= 0 && n <= b;
							};
						}
						function K(e) {
							return function(t) {
								return t?.[e];
							};
						}
						var q = K("byteLength"), oe = ae(q), se = /\[object ((I|Ui)nt(8|16|32)|Float(32|64)|Uint8Clamped|Big(I|Ui)nt64)Array\]/;
						function ce(e) {
							return h ? h(e) && !U(e) : oe(e) && se.test(c.call(e));
						}
						var le = u ? ce : ie(!1), ue = K("length");
						function de(e) {
							for (var t = {}, n = e.length, r = 0; r < n; ++r) t[e[r]] = !0;
							return {
								contains: function(e) {
									return t[e];
								},
								push: function(n) {
									return t[n] = !0, e.push(n);
								}
							};
						}
						function fe(e, t) {
							t = de(t);
							var n = y.length, r = e.constructor, a = L(r) && r.prototype || i, o = "constructor";
							for (W(e, o) && !t.contains(o) && t.push(o); n--;) o = y[n], o in e && e[o] !== a[o] && !t.contains(o) && t.push(o);
						}
						function J(e) {
							if (!S(e)) return [];
							if (p) return p(e);
							var t = [];
							for (var n in e) W(e, n) && t.push(n);
							return v && fe(e, t), t;
						}
						function pe(e) {
							if (e == null) return !0;
							var t = ue(e);
							return typeof t == "number" && (ee(e) || O(e) || G(e)) ? t === 0 : ue(J(e)) === 0;
						}
						function me(e, t) {
							var n = J(t), r = n.length;
							if (e == null) return !r;
							for (var i = Object(e), a = 0; a < r; a++) {
								var o = n[a];
								if (t[o] !== i[o] || !(o in i)) return !1;
							}
							return !0;
						}
						function Y(e) {
							if (e instanceof Y) return e;
							if (!(this instanceof Y)) return new Y(e);
							this._wrapped = e;
						}
						Y.VERSION = e, Y.prototype.value = function() {
							return this._wrapped;
						}, Y.prototype.valueOf = Y.prototype.toJSON = Y.prototype.value, Y.prototype.toString = function() {
							return String(this._wrapped);
						};
						function he(e) {
							return new Uint8Array(e.buffer || e, e.byteOffset || 0, q(e));
						}
						var ge = "[object DataView]";
						function _e(e, t, n, r) {
							if (e === t) return e !== 0 || 1 / e == 1 / t;
							if (e == null || t == null) return !1;
							if (e !== e) return t !== t;
							var i = typeof e;
							return i !== "function" && i !== "object" && typeof t != "object" ? !1 : ve(e, t, n, r);
						}
						function ve(e, t, n, r) {
							e instanceof Y && (e = e._wrapped), t instanceof Y && (t = t._wrapped);
							var i = c.call(e);
							if (i !== c.call(t)) return !1;
							if (z && i == "[object Object]" && U(e)) {
								if (!U(t)) return !1;
								i = ge;
							}
							switch (i) {
								case "[object RegExp]":
								case "[object String]": return "" + e == "" + t;
								case "[object Number]": return +e == +e ? +e == 0 ? 1 / e == 1 / t : +e == +t : +t != +t;
								case "[object Date]":
								case "[object Boolean]": return +e == +t;
								case "[object Symbol]": return a.valueOf.call(e) === a.valueOf.call(t);
								case "[object ArrayBuffer]":
								case ge: return ve(he(e), he(t), n, r);
							}
							var o = i === "[object Array]";
							if (!o && le(e)) {
								if (q(e) !== q(t)) return !1;
								if (e.buffer === t.buffer && e.byteOffset === t.byteOffset) return !0;
								o = !0;
							}
							if (!o) {
								if (typeof e != "object" || typeof t != "object") return !1;
								var s = e.constructor, l = t.constructor;
								if (s !== l && !(L(s) && s instanceof s && L(l) && l instanceof l) && "constructor" in e && "constructor" in t) return !1;
							}
							n ||= [], r ||= [];
							for (var u = n.length; u--;) if (n[u] === e) return r[u] === t;
							if (n.push(e), r.push(t), o) {
								if (u = e.length, u !== t.length) return !1;
								for (; u--;) if (!_e(e[u], t[u], n, r)) return !1;
							} else {
								var d = J(e), f;
								if (u = d.length, J(t).length !== u) return !1;
								for (; u--;) if (f = d[u], !(W(t, f) && _e(e[f], t[f], n, r))) return !1;
							}
							return n.pop(), r.pop(), !0;
						}
						function ye(e, t) {
							return _e(e, t);
						}
						function be(e) {
							if (!S(e)) return [];
							var t = [];
							for (var n in e) t.push(n);
							return v && fe(e, t), t;
						}
						function xe(e) {
							var t = ue(e);
							return function(n) {
								if (n == null || ue(be(n))) return !1;
								for (var r = 0; r < t; r++) if (!L(n[e[r]])) return !1;
								return e !== De || !L(n[Se]);
							};
						}
						var Se = "forEach", Ce = "has", we = ["clear", "delete"], Te = [
							"get",
							Ce,
							"set"
						], Ee = we.concat(Se, Te), De = we.concat(Te), Oe = ["add"].concat(we, Se, Ce), ke = B ? xe(Ee) : D("Map"), Ae = B ? xe(De) : D("WeakMap"), je = B ? xe(Oe) : D("Set"), Me = D("WeakSet");
						function Ne(e) {
							for (var t = J(e), n = t.length, r = Array(n), i = 0; i < n; i++) r[i] = e[t[i]];
							return r;
						}
						function Pe(e) {
							for (var t = J(e), n = t.length, r = Array(n), i = 0; i < n; i++) r[i] = [t[i], e[t[i]]];
							return r;
						}
						function X(e) {
							for (var t = {}, n = J(e), r = 0, i = n.length; r < i; r++) t[e[n[r]]] = n[r];
							return t;
						}
						function Fe(e) {
							var t = [];
							for (var n in e) L(e[n]) && t.push(n);
							return t.sort();
						}
						function Ie(e, t) {
							return function(n) {
								var r = arguments.length;
								if (t && (n = Object(n)), r < 2 || n == null) return n;
								for (var i = 1; i < r; i++) for (var a = arguments[i], o = e(a), s = o.length, c = 0; c < s; c++) {
									var l = o[c];
									(!t || n[l] === void 0) && (n[l] = a[l]);
								}
								return n;
							};
						}
						var Le = Ie(be), Re = Ie(J), ze = Ie(be, !0);
						function Be() {
							return function() {};
						}
						function Ve(e) {
							if (!S(e)) return {};
							if (m) return m(e);
							var t = Be();
							t.prototype = e;
							var n = new t();
							return t.prototype = null, n;
						}
						function He(e, t) {
							var n = Ve(e);
							return t && Re(n, t), n;
						}
						function Ue(e) {
							return S(e) ? ee(e) ? e.slice() : Le({}, e) : e;
						}
						function We(e, t) {
							return t(e), e;
						}
						function Ge(e) {
							return ee(e) ? e : [e];
						}
						Y.toPath = Ge;
						function Ke(e) {
							return Y.toPath(e);
						}
						function qe(e, t) {
							for (var n = t.length, r = 0; r < n; r++) {
								if (e == null) return;
								e = e[t[r]];
							}
							return n ? e : void 0;
						}
						function Je(e, t, n) {
							var r = qe(e, Ke(t));
							return w(r) ? n : r;
						}
						function Ye(e, t) {
							t = Ke(t);
							for (var n = t.length, r = 0; r < n; r++) {
								var i = t[r];
								if (!W(e, i)) return !1;
								e = e[i];
							}
							return !!n;
						}
						function Xe(e) {
							return e;
						}
						function Ze(e) {
							return e = Re({}, e), function(t) {
								return me(t, e);
							};
						}
						function Qe(e) {
							return e = Ke(e), function(t) {
								return qe(t, e);
							};
						}
						function $e(e, t, n) {
							if (t === void 0) return e;
							switch (n ?? 3) {
								case 1: return function(n) {
									return e.call(t, n);
								};
								case 3: return function(n, r, i) {
									return e.call(t, n, r, i);
								};
								case 4: return function(n, r, i, a) {
									return e.call(t, n, r, i, a);
								};
							}
							return function() {
								return e.apply(t, arguments);
							};
						}
						function et(e, t, n) {
							return e == null ? Xe : L(e) ? $e(e, t, n) : S(e) && !ee(e) ? Ze(e) : Qe(e);
						}
						function tt(e, t) {
							return et(e, t, Infinity);
						}
						Y.iteratee = tt;
						function nt(e, t, n) {
							return Y.iteratee === tt ? et(e, t, n) : Y.iteratee(e, t);
						}
						function rt(e, t, n) {
							t = nt(t, n);
							for (var r = J(e), i = r.length, a = {}, o = 0; o < i; o++) {
								var s = r[o];
								a[s] = t(e[s], s, e);
							}
							return a;
						}
						function it() {}
						function at(e) {
							return e == null ? it : function(t) {
								return Je(e, t);
							};
						}
						function ot(e, t, n) {
							var r = Array(Math.max(0, e));
							t = $e(t, n, 1);
							for (var i = 0; i < e; i++) r[i] = t(i);
							return r;
						}
						function st(e, t) {
							return t ?? (t = e, e = 0), e + Math.floor(Math.random() * (t - e + 1));
						}
						var ct = Date.now || function() {
							return (/* @__PURE__ */ new Date()).getTime();
						};
						function lt(e) {
							var t = function(t) {
								return e[t];
							}, n = "(?:" + J(e).join("|") + ")", r = RegExp(n), i = RegExp(n, "g");
							return function(e) {
								return e = e == null ? "" : "" + e, r.test(e) ? e.replace(i, t) : e;
							};
						}
						var ut = {
							"&": "&amp;",
							"<": "&lt;",
							">": "&gt;",
							"\"": "&quot;",
							"'": "&#x27;",
							"`": "&#x60;"
						}, dt = lt(ut), ft = lt(X(ut)), Z = Y.templateSettings = {
							evaluate: /<%([\s\S]+?)%>/g,
							interpolate: /<%=([\s\S]+?)%>/g,
							escape: /<%-([\s\S]+?)%>/g
						}, pt = /(.)^/, mt = {
							"'": "'",
							"\\": "\\",
							"\r": "r",
							"\n": "n",
							"\u2028": "u2028",
							"\u2029": "u2029"
						}, ht = /\\|'|\r|\n|\u2028|\u2029/g;
						function gt(e) {
							return "\\" + mt[e];
						}
						var _t = /^\s*(\w|\$)+\s*$/;
						function vt(e, t, n) {
							!t && n && (t = n), t = ze({}, t, Y.templateSettings);
							var r = RegExp([
								(t.escape || pt).source,
								(t.interpolate || pt).source,
								(t.evaluate || pt).source
							].join("|") + "|$", "g"), i = 0, a = "__p+='";
							e.replace(r, function(t, n, r, o, s) {
								return a += e.slice(i, s).replace(ht, gt), i = s + t.length, n ? a += "'+\n((__t=(" + n + "))==null?'':_.escape(__t))+\n'" : r ? a += "'+\n((__t=(" + r + "))==null?'':__t)+\n'" : o && (a += "';\n" + o + "\n__p+='"), t;
							}), a += "';\n";
							var o = t.variable;
							if (o) {
								if (!_t.test(o)) throw Error("variable is not a bare identifier: " + o);
							} else a = "with(obj||{}){\n" + a + "}\n", o = "obj";
							a = "var __t,__p='',__j=Array.prototype.join,print=function(){__p+=__j.call(arguments,'');};\n" + a + "return __p;\n";
							var s;
							try {
								s = Function(o, "_", a);
							} catch (e) {
								throw e.source = a, e;
							}
							var c = function(e) {
								return s.call(this, e, Y);
							};
							return c.source = "function(" + o + "){\n" + a + "}", c;
						}
						function yt(e, t, n) {
							t = Ke(t);
							var r = t.length;
							if (!r) return L(n) ? n.call(e) : n;
							for (var i = 0; i < r; i++) {
								var a = e?.[t[i]];
								a === void 0 && (a = n, i = r), e = L(a) ? a.call(e) : a;
							}
							return e;
						}
						var bt = 0;
						function xt(e) {
							var t = ++bt + "";
							return e ? e + t : t;
						}
						function St(e) {
							var t = Y(e);
							return t._chain = !0, t;
						}
						function Ct(e, t, n, r, i) {
							if (!(r instanceof t)) return e.apply(n, i);
							var a = Ve(e.prototype), o = e.apply(a, i);
							return S(o) ? o : a;
						}
						var wt = x(function(e, t) {
							var n = wt.placeholder, r = function() {
								for (var i = 0, a = t.length, o = Array(a), s = 0; s < a; s++) o[s] = t[s] === n ? arguments[i++] : t[s];
								for (; i < arguments.length;) o.push(arguments[i++]);
								return Ct(e, r, this, this, o);
							};
							return r;
						});
						wt.placeholder = Y;
						var Tt = x(function(e, t, n) {
							if (!L(e)) throw TypeError("Bind must be called on a function");
							var r = x(function(i) {
								return Ct(e, r, t, this, n.concat(i));
							});
							return r;
						}), Et = ae(ue);
						function Dt(e, t, n, r) {
							if (r ||= [], !t && t !== 0) t = Infinity;
							else if (t <= 0) return r.concat(e);
							for (var i = r.length, a = 0, o = ue(e); a < o; a++) {
								var s = e[a];
								if (Et(s) && (ee(s) || G(s))) {
									if (t > 1) Dt(s, t - 1, n, r), i = r.length;
									else for (var c = 0, l = s.length; c < l;) r[i++] = s[c++];
								} else n || (r[i++] = s);
							}
							return r;
						}
						var Ot = x(function(e, t) {
							t = Dt(t, !1, !1);
							var n = t.length;
							if (n < 1) throw Error("bindAll must be passed function names");
							for (; n--;) {
								var r = t[n];
								e[r] = Tt(e[r], e);
							}
							return e;
						});
						function kt(e, t) {
							var n = function(r) {
								var i = n.cache, a = "" + (t ? t.apply(this, arguments) : r);
								return W(i, a) || (i[a] = e.apply(this, arguments)), i[a];
							};
							return n.cache = {}, n;
						}
						var At = x(function(e, t, n) {
							return setTimeout(function() {
								return e.apply(null, n);
							}, t);
						}), jt = wt(At, Y, 1);
						function Mt(e, t, n) {
							var r, i, a, o, s = 0;
							n ||= {};
							var c = function() {
								s = n.leading === !1 ? 0 : ct(), r = null, o = e.apply(i, a), r || (i = a = null);
							}, l = function() {
								var l = ct();
								!s && n.leading === !1 && (s = l);
								var u = t - (l - s);
								return i = this, a = arguments, u <= 0 || u > t ? (r &&= (clearTimeout(r), null), s = l, o = e.apply(i, a), r || (i = a = null)) : !r && n.trailing !== !1 && (r = setTimeout(c, u)), o;
							};
							return l.cancel = function() {
								clearTimeout(r), s = 0, r = i = a = null;
							}, l;
						}
						function Nt(e, t, n) {
							var r, i, a, o, s, c = function() {
								var l = ct() - i;
								t > l ? r = setTimeout(c, t - l) : (r = null, n || (o = e.apply(s, a)), r || (a = s = null));
							}, l = x(function(l) {
								return s = this, a = l, i = ct(), r || (r = setTimeout(c, t), n && (o = e.apply(s, a))), o;
							});
							return l.cancel = function() {
								clearTimeout(r), r = a = s = null;
							}, l;
						}
						function Pt(e, t) {
							return wt(t, e);
						}
						function Ft(e) {
							return function() {
								return !e.apply(this, arguments);
							};
						}
						function It() {
							var e = arguments, t = e.length - 1;
							return function() {
								for (var n = t, r = e[t].apply(this, arguments); n--;) r = e[n].call(this, r);
								return r;
							};
						}
						function Lt(e, t) {
							return function() {
								if (--e < 1) return t.apply(this, arguments);
							};
						}
						function Rt(e, t) {
							var n;
							return function() {
								return --e > 0 && (n = t.apply(this, arguments)), e <= 1 && (t = null), n;
							};
						}
						var zt = wt(Rt, 2);
						function Bt(e, t, n) {
							t = nt(t, n);
							for (var r = J(e), i, a = 0, o = r.length; a < o; a++) if (i = r[a], t(e[i], i, e)) return i;
						}
						function Vt(e) {
							return function(t, n, r) {
								n = nt(n, r);
								for (var i = ue(t), a = e > 0 ? 0 : i - 1; a >= 0 && a < i; a += e) if (n(t[a], a, t)) return a;
								return -1;
							};
						}
						var Ht = Vt(1), Ut = Vt(-1);
						function Wt(e, t, n, r) {
							n = nt(n, r, 1);
							for (var i = n(t), a = 0, o = ue(e); a < o;) {
								var s = Math.floor((a + o) / 2);
								n(e[s]) < i ? a = s + 1 : o = s;
							}
							return a;
						}
						function Gt(e, t, n) {
							return function(r, i, a) {
								var o = 0, c = ue(r);
								if (typeof a == "number") e > 0 ? o = a >= 0 ? a : Math.max(a + c, o) : c = a >= 0 ? Math.min(a + 1, c) : a + c + 1;
								else if (n && a && c) return a = n(r, i), r[a] === i ? a : -1;
								if (i !== i) return a = t(s.call(r, o, c), re), a >= 0 ? a + o : -1;
								for (a = e > 0 ? o : c - 1; a >= 0 && a < c; a += e) if (r[a] === i) return a;
								return -1;
							};
						}
						var Kt = Gt(1, Ht, Wt), qt = Gt(-1, Ut);
						function Jt(e, t, n) {
							var r = (Et(e) ? Ht : Bt)(e, t, n);
							if (r !== void 0 && r !== -1) return e[r];
						}
						function Yt(e, t) {
							return Jt(e, Ze(t));
						}
						function Xt(e, t, n) {
							t = $e(t, n);
							var r, i;
							if (Et(e)) for (r = 0, i = e.length; r < i; r++) t(e[r], r, e);
							else {
								var a = J(e);
								for (r = 0, i = a.length; r < i; r++) t(e[a[r]], a[r], e);
							}
							return e;
						}
						function Zt(e, t, n) {
							t = nt(t, n);
							for (var r = !Et(e) && J(e), i = (r || e).length, a = Array(i), o = 0; o < i; o++) {
								var s = r ? r[o] : o;
								a[o] = t(e[s], s, e);
							}
							return a;
						}
						function Qt(e) {
							var t = function(t, n, r, i) {
								var a = !Et(t) && J(t), o = (a || t).length, s = e > 0 ? 0 : o - 1;
								for (i || (r = t[a ? a[s] : s], s += e); s >= 0 && s < o; s += e) {
									var c = a ? a[s] : s;
									r = n(r, t[c], c, t);
								}
								return r;
							};
							return function(e, n, r, i) {
								var a = arguments.length >= 3;
								return t(e, $e(n, i, 4), r, a);
							};
						}
						var $t = Qt(1), en = Qt(-1);
						function tn(e, t, n) {
							var r = [];
							return t = nt(t, n), Xt(e, function(e, n, i) {
								t(e, n, i) && r.push(e);
							}), r;
						}
						function nn(e, t, n) {
							return tn(e, Ft(nt(t)), n);
						}
						function rn(e, t, n) {
							t = nt(t, n);
							for (var r = !Et(e) && J(e), i = (r || e).length, a = 0; a < i; a++) {
								var o = r ? r[a] : a;
								if (!t(e[o], o, e)) return !1;
							}
							return !0;
						}
						function an(e, t, n) {
							t = nt(t, n);
							for (var r = !Et(e) && J(e), i = (r || e).length, a = 0; a < i; a++) {
								var o = r ? r[a] : a;
								if (t(e[o], o, e)) return !0;
							}
							return !1;
						}
						function Q(e, t, n, r) {
							return Et(e) || (e = Ne(e)), (typeof n != "number" || r) && (n = 0), Kt(e, t, n) >= 0;
						}
						var on = x(function(e, t, n) {
							var r, i;
							return L(t) ? i = t : (t = Ke(t), r = t.slice(0, -1), t = t[t.length - 1]), Zt(e, function(e) {
								var a = i;
								if (!a) {
									if (r && r.length && (e = qe(e, r)), e == null) return;
									a = e[t];
								}
								return a == null ? a : a.apply(e, n);
							});
						});
						function sn(e, t) {
							return Zt(e, Qe(t));
						}
						function cn(e, t) {
							return tn(e, Ze(t));
						}
						function ln(e, t, n) {
							var r = -Infinity, i = -Infinity, a, o;
							if (t == null || typeof t == "number" && typeof e[0] != "object" && e != null) {
								e = Et(e) ? e : Ne(e);
								for (var s = 0, c = e.length; s < c; s++) a = e[s], a != null && a > r && (r = a);
							} else t = nt(t, n), Xt(e, function(e, n, a) {
								o = t(e, n, a), (o > i || o === -Infinity && r === -Infinity) && (r = e, i = o);
							});
							return r;
						}
						function un(e, t, n) {
							var r = Infinity, i = Infinity, a, o;
							if (t == null || typeof t == "number" && typeof e[0] != "object" && e != null) {
								e = Et(e) ? e : Ne(e);
								for (var s = 0, c = e.length; s < c; s++) a = e[s], a != null && a < r && (r = a);
							} else t = nt(t, n), Xt(e, function(e, n, a) {
								o = t(e, n, a), (o < i || o === Infinity && r === Infinity) && (r = e, i = o);
							});
							return r;
						}
						function dn(e, t, n) {
							if (t == null || n) return Et(e) || (e = Ne(e)), e[st(e.length - 1)];
							var r = Et(e) ? Ue(e) : Ne(e), i = ue(r);
							t = Math.max(Math.min(t, i), 0);
							for (var a = i - 1, o = 0; o < t; o++) {
								var s = st(o, a), c = r[o];
								r[o] = r[s], r[s] = c;
							}
							return r.slice(0, t);
						}
						function fn(e) {
							return dn(e, Infinity);
						}
						function pn(e, t, n) {
							var r = 0;
							return t = nt(t, n), sn(Zt(e, function(e, n, i) {
								return {
									value: e,
									index: r++,
									criteria: t(e, n, i)
								};
							}).sort(function(e, t) {
								var n = e.criteria, r = t.criteria;
								if (n !== r) {
									if (n > r || n === void 0) return 1;
									if (n < r || r === void 0) return -1;
								}
								return e.index - t.index;
							}), "value");
						}
						function mn(e, t) {
							return function(n, r, i) {
								var a = t ? [[], []] : {};
								return r = nt(r, i), Xt(n, function(t, i) {
									e(a, t, r(t, i, n));
								}), a;
							};
						}
						var hn = mn(function(e, t, n) {
							W(e, n) ? e[n].push(t) : e[n] = [t];
						}), gn = mn(function(e, t, n) {
							e[n] = t;
						}), _n = mn(function(e, t, n) {
							W(e, n) ? e[n]++ : e[n] = 1;
						}), vn = mn(function(e, t, n) {
							e[+!n].push(t);
						}, !0), yn = /[^\ud800-\udfff]|[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]/g;
						function bn(e) {
							return e ? ee(e) ? s.call(e) : O(e) ? e.match(yn) : Et(e) ? Zt(e, Xe) : Ne(e) : [];
						}
						function xn(e) {
							return e == null ? 0 : Et(e) ? e.length : J(e).length;
						}
						function Sn(e, t, n) {
							return t in n;
						}
						var Cn = x(function(e, t) {
							var n = {}, r = t[0];
							if (e == null) return n;
							L(r) ? (t.length > 1 && (r = $e(r, t[1])), t = be(e)) : (r = Sn, t = Dt(t, !1, !1), e = Object(e));
							for (var i = 0, a = t.length; i < a; i++) {
								var o = t[i], s = e[o];
								r(s, o, e) && (n[o] = s);
							}
							return n;
						}), wn = x(function(e, t) {
							var n = t[0], r;
							return L(n) ? (n = Ft(n), t.length > 1 && (r = t[1])) : (t = Zt(Dt(t, !1, !1), String), n = function(e, n) {
								return !Q(t, n);
							}), Cn(e, n, r);
						});
						function Tn(e, t, n) {
							return s.call(e, 0, Math.max(0, e.length - (t == null || n ? 1 : t)));
						}
						function En(e, t, n) {
							return e == null || e.length < 1 ? t == null || n ? void 0 : [] : t == null || n ? e[0] : Tn(e, e.length - t);
						}
						function Dn(e, t, n) {
							return s.call(e, t == null || n ? 1 : t);
						}
						function On(e, t, n) {
							return e == null || e.length < 1 ? t == null || n ? void 0 : [] : t == null || n ? e[e.length - 1] : Dn(e, Math.max(0, e.length - t));
						}
						function kn(e) {
							return tn(e, Boolean);
						}
						function An(e, t) {
							return Dt(e, t, !1);
						}
						var jn = x(function(e, t) {
							return t = Dt(t, !0, !0), tn(e, function(e) {
								return !Q(t, e);
							});
						}), Mn = x(function(e, t) {
							return jn(e, t);
						});
						function Nn(e, t, n, r) {
							T(t) || (r = n, n = t, t = !1), n != null && (n = nt(n, r));
							for (var i = [], a = [], o = 0, s = ue(e); o < s; o++) {
								var c = e[o], l = n ? n(c, o, e) : c;
								t && !n ? ((!o || a !== l) && i.push(c), a = l) : n ? Q(a, l) || (a.push(l), i.push(c)) : Q(i, c) || i.push(c);
							}
							return i;
						}
						var Pn = x(function(e) {
							return Nn(Dt(e, !0, !0));
						});
						function Fn(e) {
							for (var t = [], n = arguments.length, r = 0, i = ue(e); r < i; r++) {
								var a = e[r];
								if (!Q(t, a)) {
									for (var o = 1; o < n && Q(arguments[o], a); o++);
									o === n && t.push(a);
								}
							}
							return t;
						}
						function In(e) {
							for (var t = e && ln(e, ue).length || 0, n = Array(t), r = 0; r < t; r++) n[r] = sn(e, r);
							return n;
						}
						var Ln = x(In);
						function Rn(e, t) {
							for (var n = {}, r = 0, i = ue(e); r < i; r++) t ? n[e[r]] = t[r] : n[e[r][0]] = e[r][1];
							return n;
						}
						function zn(e, t, n) {
							t ?? (t = e || 0, e = 0), n ||= t < e ? -1 : 1;
							for (var r = Math.max(Math.ceil((t - e) / n), 0), i = Array(r), a = 0; a < r; a++, e += n) i[a] = e;
							return i;
						}
						function Bn(e, t) {
							if (t == null || t < 1) return [];
							for (var n = [], r = 0, i = e.length; r < i;) n.push(s.call(e, r, r += t));
							return n;
						}
						function Vn(e, t) {
							return e._chain ? Y(t).chain() : t;
						}
						function Hn(e) {
							return Xt(Fe(e), function(t) {
								var n = Y[t] = e[t];
								Y.prototype[t] = function() {
									var e = [this._wrapped];
									return o.apply(e, arguments), Vn(this, n.apply(Y, e));
								};
							}), Y;
						}
						Xt([
							"pop",
							"push",
							"reverse",
							"shift",
							"sort",
							"splice",
							"unshift"
						], function(e) {
							var t = r[e];
							Y.prototype[e] = function() {
								var n = this._wrapped;
								return n != null && (t.apply(n, arguments), (e === "shift" || e === "splice") && n.length === 0 && delete n[0]), Vn(this, n);
							};
						}), Xt([
							"concat",
							"join",
							"slice"
						], function(e) {
							var t = r[e];
							Y.prototype[e] = function() {
								var e = this._wrapped;
								return e != null && (e = t.apply(e, arguments)), Vn(this, e);
							};
						});
						var Un = Hn({
							__proto__: null,
							VERSION: e,
							restArguments: x,
							isObject: S,
							isNull: C,
							isUndefined: w,
							isBoolean: T,
							isElement: E,
							isString: O,
							isNumber: k,
							isDate: A,
							isRegExp: j,
							isError: M,
							isSymbol: N,
							isArrayBuffer: P,
							isDataView: U,
							isArray: ee,
							isFunction: L,
							isArguments: G,
							isFinite: ne,
							isNaN: re,
							isTypedArray: le,
							isEmpty: pe,
							isMatch: me,
							isEqual: ye,
							isMap: ke,
							isWeakMap: Ae,
							isSet: je,
							isWeakSet: Me,
							keys: J,
							allKeys: be,
							values: Ne,
							pairs: Pe,
							invert: X,
							functions: Fe,
							methods: Fe,
							extend: Le,
							extendOwn: Re,
							assign: Re,
							defaults: ze,
							create: He,
							clone: Ue,
							tap: We,
							get: Je,
							has: Ye,
							mapObject: rt,
							identity: Xe,
							constant: ie,
							noop: it,
							toPath: Ge,
							property: Qe,
							propertyOf: at,
							matcher: Ze,
							matches: Ze,
							times: ot,
							random: st,
							now: ct,
							escape: dt,
							unescape: ft,
							templateSettings: Z,
							template: vt,
							result: yt,
							uniqueId: xt,
							chain: St,
							iteratee: tt,
							partial: wt,
							bind: Tt,
							bindAll: Ot,
							memoize: kt,
							delay: At,
							defer: jt,
							throttle: Mt,
							debounce: Nt,
							wrap: Pt,
							negate: Ft,
							compose: It,
							after: Lt,
							before: Rt,
							once: zt,
							findKey: Bt,
							findIndex: Ht,
							findLastIndex: Ut,
							sortedIndex: Wt,
							indexOf: Kt,
							lastIndexOf: qt,
							find: Jt,
							detect: Jt,
							findWhere: Yt,
							each: Xt,
							forEach: Xt,
							map: Zt,
							collect: Zt,
							reduce: $t,
							foldl: $t,
							inject: $t,
							reduceRight: en,
							foldr: en,
							filter: tn,
							select: tn,
							reject: nn,
							every: rn,
							all: rn,
							some: an,
							any: an,
							contains: Q,
							includes: Q,
							include: Q,
							invoke: on,
							pluck: sn,
							where: cn,
							max: ln,
							min: un,
							shuffle: fn,
							sample: dn,
							sortBy: pn,
							groupBy: hn,
							indexBy: gn,
							countBy: _n,
							partition: vn,
							toArray: bn,
							size: xn,
							pick: Cn,
							omit: wn,
							first: En,
							head: En,
							take: En,
							initial: Tn,
							last: On,
							rest: Dn,
							tail: Dn,
							drop: Dn,
							compact: kn,
							flatten: An,
							without: Mn,
							uniq: Nn,
							unique: Nn,
							union: Pn,
							intersection: Fn,
							difference: jn,
							unzip: In,
							transpose: In,
							zip: Ln,
							object: Rn,
							range: zn,
							chunk: Bn,
							mixin: Hn,
							default: Y
						});
						return Un._ = Un, Un;
					}));
				}).call(this, typeof global < "u" ? global : typeof self < "u" ? self : typeof window < "u" ? window : {});
			}, {}],
			68: [function(e, t, n) {
				(function() {
					var e, n, r, i, a, o, s, c = [].slice, l = {}.hasOwnProperty;
					e = function() {
						var e, t, n, r, i, o = arguments[0];
						if (i = 2 <= arguments.length ? c.call(arguments, 1) : [], a(Object.assign)) Object.assign.apply(null, arguments);
						else for (e = 0, n = i.length; e < n; e++) if (r = i[e], r != null) for (t in r) l.call(r, t) && (o[t] = r[t]);
						return o;
					}, a = function(e) {
						return !!e && Object.prototype.toString.call(e) === "[object Function]";
					}, o = function(e) {
						var t;
						return !!e && ((t = typeof e) == "function" || t === "object");
					}, r = function(e) {
						return a(Array.isArray) ? Array.isArray(e) : Object.prototype.toString.call(e) === "[object Array]";
					}, i = function(e) {
						var t;
						if (r(e)) return !e.length;
						for (t in e) if (l.call(e, t)) return !1;
						return !0;
					}, s = function(e) {
						var t, n;
						return o(e) && (n = Object.getPrototypeOf(e)) && (t = n.constructor) && typeof t == "function" && t instanceof t && Function.prototype.toString.call(t) === Function.prototype.toString.call(Object);
					}, n = function(e) {
						return a(e.valueOf) ? e.valueOf() : e;
					}, t.exports.assign = e, t.exports.isFunction = a, t.exports.isObject = o, t.exports.isArray = r, t.exports.isEmpty = i, t.exports.isPlainObject = s, t.exports.getValue = n;
				}).call(this);
			}, {}],
			69: [function(e, t, n) {
				(function() {
					t.exports = (function() {
						function e(e, t, n) {
							if (this.options = e.options, this.stringify = e.stringify, this.parent = e, t == null) throw Error("Missing attribute name. " + this.debugInfo(t));
							if (n == null) throw Error("Missing attribute value. " + this.debugInfo(t));
							this.name = this.stringify.attName(t), this.value = this.stringify.attValue(n);
						}
						return e.prototype.clone = function() {
							return Object.create(this);
						}, e.prototype.toString = function(e) {
							return this.options.writer.set(e).attribute(this);
						}, e.prototype.debugInfo = function(e) {
							return e ||= this.name, e == null && !this.parent?.name ? "" : e == null ? "parent: <" + this.parent.name + ">" : this.parent?.name ? "attribute: {" + e + "}, parent: <" + this.parent.name + ">" : "attribute: {" + e + "}";
						}, e;
					})();
				}).call(this);
			}, {}],
			70: [function(e, t, n) {
				(function() {
					var n, r = function(e, t) {
						for (var n in t) i.call(t, n) && (e[n] = t[n]);
						function r() {
							this.constructor = e;
						}
						return r.prototype = t.prototype, e.prototype = new r(), e.__super__ = t.prototype, e;
					}, i = {}.hasOwnProperty;
					n = e("./XMLNode"), t.exports = (function(e) {
						r(t, e);
						function t(e, n) {
							if (t.__super__.constructor.call(this, e), n == null) throw Error("Missing CDATA text. " + this.debugInfo());
							this.text = this.stringify.cdata(n);
						}
						return t.prototype.clone = function() {
							return Object.create(this);
						}, t.prototype.toString = function(e) {
							return this.options.writer.set(e).cdata(this);
						}, t;
					})(n);
				}).call(this);
			}, { "./XMLNode": 81 }],
			71: [function(e, t, n) {
				(function() {
					var n, r = function(e, t) {
						for (var n in t) i.call(t, n) && (e[n] = t[n]);
						function r() {
							this.constructor = e;
						}
						return r.prototype = t.prototype, e.prototype = new r(), e.__super__ = t.prototype, e;
					}, i = {}.hasOwnProperty;
					n = e("./XMLNode"), t.exports = (function(e) {
						r(t, e);
						function t(e, n) {
							if (t.__super__.constructor.call(this, e), n == null) throw Error("Missing comment text. " + this.debugInfo());
							this.text = this.stringify.comment(n);
						}
						return t.prototype.clone = function() {
							return Object.create(this);
						}, t.prototype.toString = function(e) {
							return this.options.writer.set(e).comment(this);
						}, t;
					})(n);
				}).call(this);
			}, { "./XMLNode": 81 }],
			72: [function(e, t, n) {
				(function() {
					var n, r = function(e, t) {
						for (var n in t) i.call(t, n) && (e[n] = t[n]);
						function r() {
							this.constructor = e;
						}
						return r.prototype = t.prototype, e.prototype = new r(), e.__super__ = t.prototype, e;
					}, i = {}.hasOwnProperty;
					n = e("./XMLNode"), t.exports = (function(e) {
						r(t, e);
						function t(e, n, r, i, a, o) {
							if (t.__super__.constructor.call(this, e), n == null) throw Error("Missing DTD element name. " + this.debugInfo());
							if (r == null) throw Error("Missing DTD attribute name. " + this.debugInfo(n));
							if (!i) throw Error("Missing DTD attribute type. " + this.debugInfo(n));
							if (!a) throw Error("Missing DTD attribute default. " + this.debugInfo(n));
							if (a.indexOf("#") !== 0 && (a = "#" + a), !a.match(/^(#REQUIRED|#IMPLIED|#FIXED|#DEFAULT)$/)) throw Error("Invalid default value type; expected: #REQUIRED, #IMPLIED, #FIXED or #DEFAULT. " + this.debugInfo(n));
							if (o && !a.match(/^(#FIXED|#DEFAULT)$/)) throw Error("Default value only applies to #FIXED or #DEFAULT. " + this.debugInfo(n));
							this.elementName = this.stringify.eleName(n), this.attributeName = this.stringify.attName(r), this.attributeType = this.stringify.dtdAttType(i), this.defaultValue = this.stringify.dtdAttDefault(o), this.defaultValueType = a;
						}
						return t.prototype.toString = function(e) {
							return this.options.writer.set(e).dtdAttList(this);
						}, t;
					})(n);
				}).call(this);
			}, { "./XMLNode": 81 }],
			73: [function(e, t, n) {
				(function() {
					var n, r = function(e, t) {
						for (var n in t) i.call(t, n) && (e[n] = t[n]);
						function r() {
							this.constructor = e;
						}
						return r.prototype = t.prototype, e.prototype = new r(), e.__super__ = t.prototype, e;
					}, i = {}.hasOwnProperty;
					n = e("./XMLNode"), t.exports = (function(e) {
						r(t, e);
						function t(e, n, r) {
							if (t.__super__.constructor.call(this, e), n == null) throw Error("Missing DTD element name. " + this.debugInfo());
							r ||= "(#PCDATA)", Array.isArray(r) && (r = "(" + r.join(",") + ")"), this.name = this.stringify.eleName(n), this.value = this.stringify.dtdElementValue(r);
						}
						return t.prototype.toString = function(e) {
							return this.options.writer.set(e).dtdElement(this);
						}, t;
					})(n);
				}).call(this);
			}, { "./XMLNode": 81 }],
			74: [function(e, t, n) {
				(function() {
					var n, r, i = function(e, t) {
						for (var n in t) a.call(t, n) && (e[n] = t[n]);
						function r() {
							this.constructor = e;
						}
						return r.prototype = t.prototype, e.prototype = new r(), e.__super__ = t.prototype, e;
					}, a = {}.hasOwnProperty;
					r = e("./Utility").isObject, n = e("./XMLNode"), t.exports = (function(e) {
						i(t, e);
						function t(e, n, i, a) {
							if (t.__super__.constructor.call(this, e), i == null) throw Error("Missing DTD entity name. " + this.debugInfo(i));
							if (a == null) throw Error("Missing DTD entity value. " + this.debugInfo(i));
							if (this.pe = !!n, this.name = this.stringify.eleName(i), !r(a)) this.value = this.stringify.dtdEntityValue(a);
							else {
								if (!a.pubID && !a.sysID) throw Error("Public and/or system identifiers are required for an external entity. " + this.debugInfo(i));
								if (a.pubID && !a.sysID) throw Error("System identifier is required for a public external entity. " + this.debugInfo(i));
								if (a.pubID != null && (this.pubID = this.stringify.dtdPubID(a.pubID)), a.sysID != null && (this.sysID = this.stringify.dtdSysID(a.sysID)), a.nData != null && (this.nData = this.stringify.dtdNData(a.nData)), this.pe && this.nData) throw Error("Notation declaration is not allowed in a parameter entity. " + this.debugInfo(i));
							}
						}
						return t.prototype.toString = function(e) {
							return this.options.writer.set(e).dtdEntity(this);
						}, t;
					})(n);
				}).call(this);
			}, {
				"./Utility": 68,
				"./XMLNode": 81
			}],
			75: [function(e, t, n) {
				(function() {
					var n, r = function(e, t) {
						for (var n in t) i.call(t, n) && (e[n] = t[n]);
						function r() {
							this.constructor = e;
						}
						return r.prototype = t.prototype, e.prototype = new r(), e.__super__ = t.prototype, e;
					}, i = {}.hasOwnProperty;
					n = e("./XMLNode"), t.exports = (function(e) {
						r(t, e);
						function t(e, n, r) {
							if (t.__super__.constructor.call(this, e), n == null) throw Error("Missing DTD notation name. " + this.debugInfo(n));
							if (!r.pubID && !r.sysID) throw Error("Public or system identifiers are required for an external entity. " + this.debugInfo(n));
							this.name = this.stringify.eleName(n), r.pubID != null && (this.pubID = this.stringify.dtdPubID(r.pubID)), r.sysID != null && (this.sysID = this.stringify.dtdSysID(r.sysID));
						}
						return t.prototype.toString = function(e) {
							return this.options.writer.set(e).dtdNotation(this);
						}, t;
					})(n);
				}).call(this);
			}, { "./XMLNode": 81 }],
			76: [function(e, t, n) {
				(function() {
					var n, r, i = function(e, t) {
						for (var n in t) a.call(t, n) && (e[n] = t[n]);
						function r() {
							this.constructor = e;
						}
						return r.prototype = t.prototype, e.prototype = new r(), e.__super__ = t.prototype, e;
					}, a = {}.hasOwnProperty;
					r = e("./Utility").isObject, n = e("./XMLNode"), t.exports = (function(e) {
						i(t, e);
						function t(e, n, i, a) {
							var o;
							t.__super__.constructor.call(this, e), r(n) && (o = n, n = o.version, i = o.encoding, a = o.standalone), n ||= "1.0", this.version = this.stringify.xmlVersion(n), i != null && (this.encoding = this.stringify.xmlEncoding(i)), a != null && (this.standalone = this.stringify.xmlStandalone(a));
						}
						return t.prototype.toString = function(e) {
							return this.options.writer.set(e).declaration(this);
						}, t;
					})(n);
				}).call(this);
			}, {
				"./Utility": 68,
				"./XMLNode": 81
			}],
			77: [function(e, t, n) {
				(function() {
					var n, r, i, a, o, s, c = function(e, t) {
						for (var n in t) l.call(t, n) && (e[n] = t[n]);
						function r() {
							this.constructor = e;
						}
						return r.prototype = t.prototype, e.prototype = new r(), e.__super__ = t.prototype, e;
					}, l = {}.hasOwnProperty;
					s = e("./Utility").isObject, o = e("./XMLNode"), n = e("./XMLDTDAttList"), i = e("./XMLDTDEntity"), r = e("./XMLDTDElement"), a = e("./XMLDTDNotation"), t.exports = (function(e) {
						c(t, e);
						function t(e, n, r) {
							var i, a;
							t.__super__.constructor.call(this, e), this.name = "!DOCTYPE", this.documentObject = e, s(n) && (i = n, n = i.pubID, r = i.sysID), r ?? (a = [n, r], r = a[0], n = a[1]), n != null && (this.pubID = this.stringify.dtdPubID(n)), r != null && (this.sysID = this.stringify.dtdSysID(r));
						}
						return t.prototype.element = function(e, t) {
							var n = new r(this, e, t);
							return this.children.push(n), this;
						}, t.prototype.attList = function(e, t, r, i, a) {
							var o = new n(this, e, t, r, i, a);
							return this.children.push(o), this;
						}, t.prototype.entity = function(e, t) {
							var n = new i(this, !1, e, t);
							return this.children.push(n), this;
						}, t.prototype.pEntity = function(e, t) {
							var n = new i(this, !0, e, t);
							return this.children.push(n), this;
						}, t.prototype.notation = function(e, t) {
							var n = new a(this, e, t);
							return this.children.push(n), this;
						}, t.prototype.toString = function(e) {
							return this.options.writer.set(e).docType(this);
						}, t.prototype.ele = function(e, t) {
							return this.element(e, t);
						}, t.prototype.att = function(e, t, n, r, i) {
							return this.attList(e, t, n, r, i);
						}, t.prototype.ent = function(e, t) {
							return this.entity(e, t);
						}, t.prototype.pent = function(e, t) {
							return this.pEntity(e, t);
						}, t.prototype.not = function(e, t) {
							return this.notation(e, t);
						}, t.prototype.up = function() {
							return this.root() || this.documentObject;
						}, t;
					})(o);
				}).call(this);
			}, {
				"./Utility": 68,
				"./XMLDTDAttList": 72,
				"./XMLDTDElement": 73,
				"./XMLDTDEntity": 74,
				"./XMLDTDNotation": 75,
				"./XMLNode": 81
			}],
			78: [function(e, t, n) {
				(function() {
					var n, r, i, a, o = function(e, t) {
						for (var n in t) s.call(t, n) && (e[n] = t[n]);
						function r() {
							this.constructor = e;
						}
						return r.prototype = t.prototype, e.prototype = new r(), e.__super__ = t.prototype, e;
					}, s = {}.hasOwnProperty;
					a = e("./Utility").isPlainObject, n = e("./XMLNode"), i = e("./XMLStringifier"), r = e("./XMLStringWriter"), t.exports = (function(e) {
						o(t, e);
						function t(e) {
							t.__super__.constructor.call(this, null), this.name = "?xml", e ||= {}, e.writer || (e.writer = new r()), this.options = e, this.stringify = new i(e), this.isDocument = !0;
						}
						return t.prototype.end = function(e) {
							var t;
							return e ? a(e) && (t = e, e = this.options.writer.set(t)) : e = this.options.writer, e.document(this);
						}, t.prototype.toString = function(e) {
							return this.options.writer.set(e).document(this);
						}, t;
					})(n);
				}).call(this);
			}, {
				"./Utility": 68,
				"./XMLNode": 81,
				"./XMLStringWriter": 85,
				"./XMLStringifier": 86
			}],
			79: [function(e, t, n) {
				(function() {
					var n, r, i, a, o, s, c, l, u, d, f, p, m, h, g, _, v, y, b, x, S = {}.hasOwnProperty;
					x = e("./Utility"), y = x.isObject, v = x.isFunction, b = x.isPlainObject, _ = x.getValue, d = e("./XMLElement"), r = e("./XMLCData"), i = e("./XMLComment"), p = e("./XMLRaw"), g = e("./XMLText"), f = e("./XMLProcessingInstruction"), l = e("./XMLDeclaration"), u = e("./XMLDocType"), a = e("./XMLDTDAttList"), s = e("./XMLDTDEntity"), o = e("./XMLDTDElement"), c = e("./XMLDTDNotation"), n = e("./XMLAttribute"), h = e("./XMLStringifier"), m = e("./XMLStringWriter"), t.exports = (function() {
						function e(e, t, n) {
							var r;
							this.name = "?xml", e ||= {}, e.writer ? b(e.writer) && (r = e.writer, e.writer = new m(r)) : e.writer = new m(e), this.options = e, this.writer = e.writer, this.stringify = new h(e), this.onDataCallback = t || function() {}, this.onEndCallback = n || function() {}, this.currentNode = null, this.currentLevel = -1, this.openTags = {}, this.documentStarted = !1, this.documentCompleted = !1, this.root = null;
						}
						return e.prototype.node = function(e, t, n) {
							var r;
							if (e == null) throw Error("Missing node name.");
							if (this.root && this.currentLevel === -1) throw Error("Document can only have one root node. " + this.debugInfo(e));
							return this.openCurrent(), e = _(e), t ??= {}, t = _(t), y(t) || (r = [t, n], n = r[0], t = r[1]), this.currentNode = new d(this, e, t), this.currentNode.children = !1, this.currentLevel++, this.openTags[this.currentLevel] = this.currentNode, n != null && this.text(n), this;
						}, e.prototype.element = function(e, t, n) {
							return this.currentNode && this.currentNode instanceof u ? this.dtdElement.apply(this, arguments) : this.node(e, t, n);
						}, e.prototype.attribute = function(e, t) {
							var r, i;
							if (!this.currentNode || this.currentNode.children) throw Error("att() can only be used immediately after an ele() call in callback mode. " + this.debugInfo(e));
							if (e != null && (e = _(e)), y(e)) for (r in e) S.call(e, r) && (i = e[r], this.attribute(r, i));
							else v(t) && (t = t.apply()), (!this.options.skipNullAttributes || t != null) && (this.currentNode.attributes[e] = new n(this, e, t));
							return this;
						}, e.prototype.text = function(e) {
							var t;
							return this.openCurrent(), t = new g(this, e), this.onData(this.writer.text(t, this.currentLevel + 1), this.currentLevel + 1), this;
						}, e.prototype.cdata = function(e) {
							var t;
							return this.openCurrent(), t = new r(this, e), this.onData(this.writer.cdata(t, this.currentLevel + 1), this.currentLevel + 1), this;
						}, e.prototype.comment = function(e) {
							var t;
							return this.openCurrent(), t = new i(this, e), this.onData(this.writer.comment(t, this.currentLevel + 1), this.currentLevel + 1), this;
						}, e.prototype.raw = function(e) {
							var t;
							return this.openCurrent(), t = new p(this, e), this.onData(this.writer.raw(t, this.currentLevel + 1), this.currentLevel + 1), this;
						}, e.prototype.instruction = function(e, t) {
							var n, r, i, a, o;
							if (this.openCurrent(), e != null && (e = _(e)), t != null && (t = _(t)), Array.isArray(e)) for (n = 0, a = e.length; n < a; n++) r = e[n], this.instruction(r);
							else if (y(e)) for (r in e) S.call(e, r) && (i = e[r], this.instruction(r, i));
							else v(t) && (t = t.apply()), o = new f(this, e, t), this.onData(this.writer.processingInstruction(o, this.currentLevel + 1), this.currentLevel + 1);
							return this;
						}, e.prototype.declaration = function(e, t, n) {
							var r;
							if (this.openCurrent(), this.documentStarted) throw Error("declaration() must be the first node.");
							return r = new l(this, e, t, n), this.onData(this.writer.declaration(r, this.currentLevel + 1), this.currentLevel + 1), this;
						}, e.prototype.doctype = function(e, t, n) {
							if (this.openCurrent(), e == null) throw Error("Missing root node name.");
							if (this.root) throw Error("dtd() must come before the root node.");
							return this.currentNode = new u(this, t, n), this.currentNode.rootNodeName = e, this.currentNode.children = !1, this.currentLevel++, this.openTags[this.currentLevel] = this.currentNode, this;
						}, e.prototype.dtdElement = function(e, t) {
							var n;
							return this.openCurrent(), n = new o(this, e, t), this.onData(this.writer.dtdElement(n, this.currentLevel + 1), this.currentLevel + 1), this;
						}, e.prototype.attList = function(e, t, n, r, i) {
							var o;
							return this.openCurrent(), o = new a(this, e, t, n, r, i), this.onData(this.writer.dtdAttList(o, this.currentLevel + 1), this.currentLevel + 1), this;
						}, e.prototype.entity = function(e, t) {
							var n;
							return this.openCurrent(), n = new s(this, !1, e, t), this.onData(this.writer.dtdEntity(n, this.currentLevel + 1), this.currentLevel + 1), this;
						}, e.prototype.pEntity = function(e, t) {
							var n;
							return this.openCurrent(), n = new s(this, !0, e, t), this.onData(this.writer.dtdEntity(n, this.currentLevel + 1), this.currentLevel + 1), this;
						}, e.prototype.notation = function(e, t) {
							var n;
							return this.openCurrent(), n = new c(this, e, t), this.onData(this.writer.dtdNotation(n, this.currentLevel + 1), this.currentLevel + 1), this;
						}, e.prototype.up = function() {
							if (this.currentLevel < 0) throw Error("The document node has no parent.");
							return this.currentNode ? (this.currentNode.children ? this.closeNode(this.currentNode) : this.openNode(this.currentNode), this.currentNode = null) : this.closeNode(this.openTags[this.currentLevel]), delete this.openTags[this.currentLevel], this.currentLevel--, this;
						}, e.prototype.end = function() {
							for (; this.currentLevel >= 0;) this.up();
							return this.onEnd();
						}, e.prototype.openCurrent = function() {
							if (this.currentNode) return this.currentNode.children = !0, this.openNode(this.currentNode);
						}, e.prototype.openNode = function(e) {
							if (!e.isOpen) return !this.root && this.currentLevel === 0 && e instanceof d && (this.root = e), this.onData(this.writer.openNode(e, this.currentLevel), this.currentLevel), e.isOpen = !0;
						}, e.prototype.closeNode = function(e) {
							if (!e.isClosed) return this.onData(this.writer.closeNode(e, this.currentLevel), this.currentLevel), e.isClosed = !0;
						}, e.prototype.onData = function(e, t) {
							return this.documentStarted = !0, this.onDataCallback(e, t + 1);
						}, e.prototype.onEnd = function() {
							return this.documentCompleted = !0, this.onEndCallback();
						}, e.prototype.debugInfo = function(e) {
							return e == null ? "" : "node: <" + e + ">";
						}, e.prototype.ele = function() {
							return this.element.apply(this, arguments);
						}, e.prototype.nod = function(e, t, n) {
							return this.node(e, t, n);
						}, e.prototype.txt = function(e) {
							return this.text(e);
						}, e.prototype.dat = function(e) {
							return this.cdata(e);
						}, e.prototype.com = function(e) {
							return this.comment(e);
						}, e.prototype.ins = function(e, t) {
							return this.instruction(e, t);
						}, e.prototype.dec = function(e, t, n) {
							return this.declaration(e, t, n);
						}, e.prototype.dtd = function(e, t, n) {
							return this.doctype(e, t, n);
						}, e.prototype.e = function(e, t, n) {
							return this.element(e, t, n);
						}, e.prototype.n = function(e, t, n) {
							return this.node(e, t, n);
						}, e.prototype.t = function(e) {
							return this.text(e);
						}, e.prototype.d = function(e) {
							return this.cdata(e);
						}, e.prototype.c = function(e) {
							return this.comment(e);
						}, e.prototype.r = function(e) {
							return this.raw(e);
						}, e.prototype.i = function(e, t) {
							return this.instruction(e, t);
						}, e.prototype.att = function() {
							return this.currentNode && this.currentNode instanceof u ? this.attList.apply(this, arguments) : this.attribute.apply(this, arguments);
						}, e.prototype.a = function() {
							return this.currentNode && this.currentNode instanceof u ? this.attList.apply(this, arguments) : this.attribute.apply(this, arguments);
						}, e.prototype.ent = function(e, t) {
							return this.entity(e, t);
						}, e.prototype.pent = function(e, t) {
							return this.pEntity(e, t);
						}, e.prototype.not = function(e, t) {
							return this.notation(e, t);
						}, e;
					})();
				}).call(this);
			}, {
				"./Utility": 68,
				"./XMLAttribute": 69,
				"./XMLCData": 70,
				"./XMLComment": 71,
				"./XMLDTDAttList": 72,
				"./XMLDTDElement": 73,
				"./XMLDTDEntity": 74,
				"./XMLDTDNotation": 75,
				"./XMLDeclaration": 76,
				"./XMLDocType": 77,
				"./XMLElement": 80,
				"./XMLProcessingInstruction": 82,
				"./XMLRaw": 83,
				"./XMLStringWriter": 85,
				"./XMLStringifier": 86,
				"./XMLText": 87
			}],
			80: [function(e, t, n) {
				(function() {
					var n, r, i, a, o, s, c = function(e, t) {
						for (var n in t) l.call(t, n) && (e[n] = t[n]);
						function r() {
							this.constructor = e;
						}
						return r.prototype = t.prototype, e.prototype = new r(), e.__super__ = t.prototype, e;
					}, l = {}.hasOwnProperty;
					s = e("./Utility"), o = s.isObject, a = s.isFunction, i = s.getValue, r = e("./XMLNode"), n = e("./XMLAttribute"), t.exports = (function(e) {
						c(t, e);
						function t(e, n, r) {
							if (t.__super__.constructor.call(this, e), n == null) throw Error("Missing element name. " + this.debugInfo());
							this.name = this.stringify.eleName(n), this.attributes = {}, r != null && this.attribute(r), e.isDocument && (this.isRoot = !0, this.documentObject = e, e.rootObject = this);
						}
						return t.prototype.clone = function() {
							var e, t, n = Object.create(this), r;
							for (t in n.isRoot && (n.documentObject = null), n.attributes = {}, r = this.attributes, r) l.call(r, t) && (e = r[t], n.attributes[t] = e.clone());
							return n.children = [], this.children.forEach(function(e) {
								var t = e.clone();
								return t.parent = n, n.children.push(t);
							}), n;
						}, t.prototype.attribute = function(e, t) {
							var r, s;
							if (e != null && (e = i(e)), o(e)) for (r in e) l.call(e, r) && (s = e[r], this.attribute(r, s));
							else a(t) && (t = t.apply()), (!this.options.skipNullAttributes || t != null) && (this.attributes[e] = new n(this, e, t));
							return this;
						}, t.prototype.removeAttribute = function(e) {
							var t, n, r;
							if (e == null) throw Error("Missing attribute name. " + this.debugInfo());
							if (e = i(e), Array.isArray(e)) for (n = 0, r = e.length; n < r; n++) t = e[n], delete this.attributes[t];
							else delete this.attributes[e];
							return this;
						}, t.prototype.toString = function(e) {
							return this.options.writer.set(e).element(this);
						}, t.prototype.att = function(e, t) {
							return this.attribute(e, t);
						}, t.prototype.a = function(e, t) {
							return this.attribute(e, t);
						}, t;
					})(r);
				}).call(this);
			}, {
				"./Utility": 68,
				"./XMLAttribute": 69,
				"./XMLNode": 81
			}],
			81: [function(e, t, n) {
				(function() {
					var n, r, i, a, o, s, c, l, u, d, f, p, m, h = {}.hasOwnProperty;
					m = e("./Utility"), p = m.isObject, f = m.isFunction, d = m.isEmpty, u = m.getValue, o = null, n = null, r = null, i = null, a = null, c = null, l = null, s = null, t.exports = (function() {
						function t(t) {
							this.parent = t, this.parent && (this.options = this.parent.options, this.stringify = this.parent.stringify), this.children = [], o || (o = e("./XMLElement"), n = e("./XMLCData"), r = e("./XMLComment"), i = e("./XMLDeclaration"), a = e("./XMLDocType"), c = e("./XMLRaw"), l = e("./XMLText"), s = e("./XMLProcessingInstruction"));
						}
						return t.prototype.element = function(e, t, n) {
							var r, i, a, o, s, c = null, l, m, g, _;
							if (t ??= {}, t = u(t), p(t) || (g = [t, n], n = g[0], t = g[1]), e != null && (e = u(e)), Array.isArray(e)) for (a = 0, l = e.length; a < l; a++) i = e[a], c = this.element(i);
							else if (f(e)) c = this.element(e.apply());
							else if (p(e)) {
								for (s in e) if (h.call(e, s)) {
									if (_ = e[s], f(_) && (_ = _.apply()), p(_) && d(_) && (_ = null), !this.options.ignoreDecorators && this.stringify.convertAttKey && s.indexOf(this.stringify.convertAttKey) === 0) c = this.attribute(s.substr(this.stringify.convertAttKey.length), _);
									else if (!this.options.separateArrayItems && Array.isArray(_)) for (o = 0, m = _.length; o < m; o++) i = _[o], r = {}, r[s] = i, c = this.element(r);
									else p(_) ? (c = this.element(s), c.element(_)) : c = this.element(s, _);
								}
							} else c = !this.options.ignoreDecorators && this.stringify.convertTextKey && e.indexOf(this.stringify.convertTextKey) === 0 ? this.text(n) : !this.options.ignoreDecorators && this.stringify.convertCDataKey && e.indexOf(this.stringify.convertCDataKey) === 0 ? this.cdata(n) : !this.options.ignoreDecorators && this.stringify.convertCommentKey && e.indexOf(this.stringify.convertCommentKey) === 0 ? this.comment(n) : !this.options.ignoreDecorators && this.stringify.convertRawKey && e.indexOf(this.stringify.convertRawKey) === 0 ? this.raw(n) : !this.options.ignoreDecorators && this.stringify.convertPIKey && e.indexOf(this.stringify.convertPIKey) === 0 ? this.instruction(e.substr(this.stringify.convertPIKey.length), n) : this.node(e, t, n);
							if (c == null) throw Error("Could not create any elements with: " + e + ". " + this.debugInfo());
							return c;
						}, t.prototype.insertBefore = function(e, t, n) {
							var r, i, a;
							if (this.isRoot) throw Error("Cannot insert elements at root level. " + this.debugInfo(e));
							return i = this.parent.children.indexOf(this), a = this.parent.children.splice(i), r = this.parent.element(e, t, n), Array.prototype.push.apply(this.parent.children, a), r;
						}, t.prototype.insertAfter = function(e, t, n) {
							var r, i, a;
							if (this.isRoot) throw Error("Cannot insert elements at root level. " + this.debugInfo(e));
							return i = this.parent.children.indexOf(this), a = this.parent.children.splice(i + 1), r = this.parent.element(e, t, n), Array.prototype.push.apply(this.parent.children, a), r;
						}, t.prototype.remove = function() {
							var e;
							if (this.isRoot) throw Error("Cannot remove the root element. " + this.debugInfo());
							return e = this.parent.children.indexOf(this), [].splice.apply(this.parent.children, [e, e - e + 1]), this.parent;
						}, t.prototype.node = function(e, t, n) {
							var r, i;
							return e != null && (e = u(e)), t ||= {}, t = u(t), p(t) || (i = [t, n], n = i[0], t = i[1]), r = new o(this, e, t), n != null && r.text(n), this.children.push(r), r;
						}, t.prototype.text = function(e) {
							var t = new l(this, e);
							return this.children.push(t), this;
						}, t.prototype.cdata = function(e) {
							var t = new n(this, e);
							return this.children.push(t), this;
						}, t.prototype.comment = function(e) {
							var t = new r(this, e);
							return this.children.push(t), this;
						}, t.prototype.commentBefore = function(e) {
							var t = this.parent.children.indexOf(this), n = this.parent.children.splice(t);
							return this.parent.comment(e), Array.prototype.push.apply(this.parent.children, n), this;
						}, t.prototype.commentAfter = function(e) {
							var t = this.parent.children.indexOf(this), n = this.parent.children.splice(t + 1);
							return this.parent.comment(e), Array.prototype.push.apply(this.parent.children, n), this;
						}, t.prototype.raw = function(e) {
							var t = new c(this, e);
							return this.children.push(t), this;
						}, t.prototype.instruction = function(e, t) {
							var n, r, i, a, o;
							if (e != null && (e = u(e)), t != null && (t = u(t)), Array.isArray(e)) for (a = 0, o = e.length; a < o; a++) n = e[a], this.instruction(n);
							else if (p(e)) for (n in e) h.call(e, n) && (r = e[n], this.instruction(n, r));
							else f(t) && (t = t.apply()), i = new s(this, e, t), this.children.push(i);
							return this;
						}, t.prototype.instructionBefore = function(e, t) {
							var n = this.parent.children.indexOf(this), r = this.parent.children.splice(n);
							return this.parent.instruction(e, t), Array.prototype.push.apply(this.parent.children, r), this;
						}, t.prototype.instructionAfter = function(e, t) {
							var n = this.parent.children.indexOf(this), r = this.parent.children.splice(n + 1);
							return this.parent.instruction(e, t), Array.prototype.push.apply(this.parent.children, r), this;
						}, t.prototype.declaration = function(e, t, n) {
							var r = this.document(), a = new i(r, e, t, n);
							return r.children[0] instanceof i ? r.children[0] = a : r.children.unshift(a), r.root() || r;
						}, t.prototype.doctype = function(e, t) {
							var n, r = this.document(), i = new a(r, e, t), o, s, c, l, u, d = r.children, f;
							for (o = s = 0, l = d.length; s < l; o = ++s) if (n = d[o], n instanceof a) return r.children[o] = i, i;
							for (f = r.children, o = c = 0, u = f.length; c < u; o = ++c) if (n = f[o], n.isRoot) return r.children.splice(o, 0, i), i;
							return r.children.push(i), i;
						}, t.prototype.up = function() {
							if (this.isRoot) throw Error("The root node has no parent. Use doc() if you need to get the document object.");
							return this.parent;
						}, t.prototype.root = function() {
							for (var e = this; e;) if (e.isDocument) return e.rootObject;
							else if (e.isRoot) return e;
							else e = e.parent;
						}, t.prototype.document = function() {
							for (var e = this; e;) if (e.isDocument) return e;
							else e = e.parent;
						}, t.prototype.end = function(e) {
							return this.document().end(e);
						}, t.prototype.prev = function() {
							var e = this.parent.children.indexOf(this);
							if (e < 1) throw Error("Already at the first node. " + this.debugInfo());
							return this.parent.children[e - 1];
						}, t.prototype.next = function() {
							var e = this.parent.children.indexOf(this);
							if (e === -1 || e === this.parent.children.length - 1) throw Error("Already at the last node. " + this.debugInfo());
							return this.parent.children[e + 1];
						}, t.prototype.importDocument = function(e) {
							var t = e.root().clone();
							return t.parent = this, t.isRoot = !1, this.children.push(t), this;
						}, t.prototype.debugInfo = function(e) {
							return e ||= this.name, e == null && !this.parent?.name ? "" : e == null ? "parent: <" + this.parent.name + ">" : this.parent?.name ? "node: <" + e + ">, parent: <" + this.parent.name + ">" : "node: <" + e + ">";
						}, t.prototype.ele = function(e, t, n) {
							return this.element(e, t, n);
						}, t.prototype.nod = function(e, t, n) {
							return this.node(e, t, n);
						}, t.prototype.txt = function(e) {
							return this.text(e);
						}, t.prototype.dat = function(e) {
							return this.cdata(e);
						}, t.prototype.com = function(e) {
							return this.comment(e);
						}, t.prototype.ins = function(e, t) {
							return this.instruction(e, t);
						}, t.prototype.doc = function() {
							return this.document();
						}, t.prototype.dec = function(e, t, n) {
							return this.declaration(e, t, n);
						}, t.prototype.dtd = function(e, t) {
							return this.doctype(e, t);
						}, t.prototype.e = function(e, t, n) {
							return this.element(e, t, n);
						}, t.prototype.n = function(e, t, n) {
							return this.node(e, t, n);
						}, t.prototype.t = function(e) {
							return this.text(e);
						}, t.prototype.d = function(e) {
							return this.cdata(e);
						}, t.prototype.c = function(e) {
							return this.comment(e);
						}, t.prototype.r = function(e) {
							return this.raw(e);
						}, t.prototype.i = function(e, t) {
							return this.instruction(e, t);
						}, t.prototype.u = function() {
							return this.up();
						}, t.prototype.importXMLBuilder = function(e) {
							return this.importDocument(e);
						}, t;
					})();
				}).call(this);
			}, {
				"./Utility": 68,
				"./XMLCData": 70,
				"./XMLComment": 71,
				"./XMLDeclaration": 76,
				"./XMLDocType": 77,
				"./XMLElement": 80,
				"./XMLProcessingInstruction": 82,
				"./XMLRaw": 83,
				"./XMLText": 87
			}],
			82: [function(e, t, n) {
				(function() {
					var n, r = function(e, t) {
						for (var n in t) i.call(t, n) && (e[n] = t[n]);
						function r() {
							this.constructor = e;
						}
						return r.prototype = t.prototype, e.prototype = new r(), e.__super__ = t.prototype, e;
					}, i = {}.hasOwnProperty;
					n = e("./XMLNode"), t.exports = (function(e) {
						r(t, e);
						function t(e, n, r) {
							if (t.__super__.constructor.call(this, e), n == null) throw Error("Missing instruction target. " + this.debugInfo());
							this.target = this.stringify.insTarget(n), r && (this.value = this.stringify.insValue(r));
						}
						return t.prototype.clone = function() {
							return Object.create(this);
						}, t.prototype.toString = function(e) {
							return this.options.writer.set(e).processingInstruction(this);
						}, t;
					})(n);
				}).call(this);
			}, { "./XMLNode": 81 }],
			83: [function(e, t, n) {
				(function() {
					var n, r = function(e, t) {
						for (var n in t) i.call(t, n) && (e[n] = t[n]);
						function r() {
							this.constructor = e;
						}
						return r.prototype = t.prototype, e.prototype = new r(), e.__super__ = t.prototype, e;
					}, i = {}.hasOwnProperty;
					n = e("./XMLNode"), t.exports = (function(e) {
						r(t, e);
						function t(e, n) {
							if (t.__super__.constructor.call(this, e), n == null) throw Error("Missing raw text. " + this.debugInfo());
							this.value = this.stringify.raw(n);
						}
						return t.prototype.clone = function() {
							return Object.create(this);
						}, t.prototype.toString = function(e) {
							return this.options.writer.set(e).raw(this);
						}, t;
					})(n);
				}).call(this);
			}, { "./XMLNode": 81 }],
			84: [function(e, t, n) {
				(function() {
					var n, r, i, a, o, s, c, l, u, d, f, p, m, h = function(e, t) {
						for (var n in t) g.call(t, n) && (e[n] = t[n]);
						function r() {
							this.constructor = e;
						}
						return r.prototype = t.prototype, e.prototype = new r(), e.__super__ = t.prototype, e;
					}, g = {}.hasOwnProperty;
					c = e("./XMLDeclaration"), l = e("./XMLDocType"), n = e("./XMLCData"), r = e("./XMLComment"), u = e("./XMLElement"), f = e("./XMLRaw"), p = e("./XMLText"), d = e("./XMLProcessingInstruction"), i = e("./XMLDTDAttList"), a = e("./XMLDTDElement"), o = e("./XMLDTDEntity"), s = e("./XMLDTDNotation"), m = e("./XMLWriterBase"), t.exports = (function(e) {
						h(t, e);
						function t(e, n) {
							t.__super__.constructor.call(this, n), this.stream = e;
						}
						return t.prototype.document = function(e) {
							var t, n, i, a, o, s = e.children, u, f;
							for (n = 0, a = s.length; n < a; n++) t = s[n], t.isLastRootNode = !1;
							for (e.children[e.children.length - 1].isLastRootNode = !0, u = e.children, f = [], i = 0, o = u.length; i < o; i++) switch (t = u[i], !1) {
								case !(t instanceof c):
									f.push(this.declaration(t));
									break;
								case !(t instanceof l):
									f.push(this.docType(t));
									break;
								case !(t instanceof r):
									f.push(this.comment(t));
									break;
								case !(t instanceof d):
									f.push(this.processingInstruction(t));
									break;
								default: f.push(this.element(t));
							}
							return f;
						}, t.prototype.attribute = function(e) {
							return this.stream.write(" " + e.name + "=\"" + e.value + "\"");
						}, t.prototype.cdata = function(e, t) {
							return this.stream.write(this.space(t) + "<![CDATA[" + e.text + "]]>" + this.endline(e));
						}, t.prototype.comment = function(e, t) {
							return this.stream.write(this.space(t) + "<!-- " + e.text + " -->" + this.endline(e));
						}, t.prototype.declaration = function(e, t) {
							return this.stream.write(this.space(t)), this.stream.write("<?xml version=\"" + e.version + "\""), e.encoding != null && this.stream.write(" encoding=\"" + e.encoding + "\""), e.standalone != null && this.stream.write(" standalone=\"" + e.standalone + "\""), this.stream.write(this.spacebeforeslash + "?>"), this.stream.write(this.endline(e));
						}, t.prototype.docType = function(e, t) {
							var c, l, u, f;
							if (t ||= 0, this.stream.write(this.space(t)), this.stream.write("<!DOCTYPE " + e.root().name), e.pubID && e.sysID ? this.stream.write(" PUBLIC \"" + e.pubID + "\" \"" + e.sysID + "\"") : e.sysID && this.stream.write(" SYSTEM \"" + e.sysID + "\""), e.children.length > 0) {
								for (this.stream.write(" ["), this.stream.write(this.endline(e)), f = e.children, l = 0, u = f.length; l < u; l++) switch (c = f[l], !1) {
									case !(c instanceof i):
										this.dtdAttList(c, t + 1);
										break;
									case !(c instanceof a):
										this.dtdElement(c, t + 1);
										break;
									case !(c instanceof o):
										this.dtdEntity(c, t + 1);
										break;
									case !(c instanceof s):
										this.dtdNotation(c, t + 1);
										break;
									case !(c instanceof n):
										this.cdata(c, t + 1);
										break;
									case !(c instanceof r):
										this.comment(c, t + 1);
										break;
									case !(c instanceof d):
										this.processingInstruction(c, t + 1);
										break;
									default: throw Error("Unknown DTD node type: " + c.constructor.name);
								}
								this.stream.write("]");
							}
							return this.stream.write(this.spacebeforeslash + ">"), this.stream.write(this.endline(e));
						}, t.prototype.element = function(e, t) {
							var i, a, o, s, c, l, m, h;
							for (c in t ||= 0, h = this.space(t), this.stream.write(h + "<" + e.name), l = e.attributes, l) g.call(l, c) && (i = l[c], this.attribute(i));
							if (e.children.length === 0 || e.children.every(function(e) {
								return e.value === "";
							})) this.allowEmpty ? this.stream.write("></" + e.name + ">") : this.stream.write(this.spacebeforeslash + "/>");
							else if (this.pretty && e.children.length === 1 && e.children[0].value != null) this.stream.write(">"), this.stream.write(e.children[0].value), this.stream.write("</" + e.name + ">");
							else {
								for (this.stream.write(">" + this.newline), m = e.children, o = 0, s = m.length; o < s; o++) switch (a = m[o], !1) {
									case !(a instanceof n):
										this.cdata(a, t + 1);
										break;
									case !(a instanceof r):
										this.comment(a, t + 1);
										break;
									case !(a instanceof u):
										this.element(a, t + 1);
										break;
									case !(a instanceof f):
										this.raw(a, t + 1);
										break;
									case !(a instanceof p):
										this.text(a, t + 1);
										break;
									case !(a instanceof d):
										this.processingInstruction(a, t + 1);
										break;
									default: throw Error("Unknown XML node type: " + a.constructor.name);
								}
								this.stream.write(h + "</" + e.name + ">");
							}
							return this.stream.write(this.endline(e));
						}, t.prototype.processingInstruction = function(e, t) {
							return this.stream.write(this.space(t) + "<?" + e.target), e.value && this.stream.write(" " + e.value), this.stream.write(this.spacebeforeslash + "?>" + this.endline(e));
						}, t.prototype.raw = function(e, t) {
							return this.stream.write(this.space(t) + e.value + this.endline(e));
						}, t.prototype.text = function(e, t) {
							return this.stream.write(this.space(t) + e.value + this.endline(e));
						}, t.prototype.dtdAttList = function(e, t) {
							return this.stream.write(this.space(t) + "<!ATTLIST " + e.elementName + " " + e.attributeName + " " + e.attributeType), e.defaultValueType !== "#DEFAULT" && this.stream.write(" " + e.defaultValueType), e.defaultValue && this.stream.write(" \"" + e.defaultValue + "\""), this.stream.write(this.spacebeforeslash + ">" + this.endline(e));
						}, t.prototype.dtdElement = function(e, t) {
							return this.stream.write(this.space(t) + "<!ELEMENT " + e.name + " " + e.value), this.stream.write(this.spacebeforeslash + ">" + this.endline(e));
						}, t.prototype.dtdEntity = function(e, t) {
							return this.stream.write(this.space(t) + "<!ENTITY"), e.pe && this.stream.write(" %"), this.stream.write(" " + e.name), e.value ? this.stream.write(" \"" + e.value + "\"") : (e.pubID && e.sysID ? this.stream.write(" PUBLIC \"" + e.pubID + "\" \"" + e.sysID + "\"") : e.sysID && this.stream.write(" SYSTEM \"" + e.sysID + "\""), e.nData && this.stream.write(" NDATA " + e.nData)), this.stream.write(this.spacebeforeslash + ">" + this.endline(e));
						}, t.prototype.dtdNotation = function(e, t) {
							return this.stream.write(this.space(t) + "<!NOTATION " + e.name), e.pubID && e.sysID ? this.stream.write(" PUBLIC \"" + e.pubID + "\" \"" + e.sysID + "\"") : e.pubID ? this.stream.write(" PUBLIC \"" + e.pubID + "\"") : e.sysID && this.stream.write(" SYSTEM \"" + e.sysID + "\""), this.stream.write(this.spacebeforeslash + ">" + this.endline(e));
						}, t.prototype.endline = function(e) {
							return e.isLastRootNode ? "" : this.newline;
						}, t;
					})(m);
				}).call(this);
			}, {
				"./XMLCData": 70,
				"./XMLComment": 71,
				"./XMLDTDAttList": 72,
				"./XMLDTDElement": 73,
				"./XMLDTDEntity": 74,
				"./XMLDTDNotation": 75,
				"./XMLDeclaration": 76,
				"./XMLDocType": 77,
				"./XMLElement": 80,
				"./XMLProcessingInstruction": 82,
				"./XMLRaw": 83,
				"./XMLText": 87,
				"./XMLWriterBase": 88
			}],
			85: [function(e, t, n) {
				(function() {
					var n, r, i, a, o, s, c, l, u, d, f, p, m, h = function(e, t) {
						for (var n in t) g.call(t, n) && (e[n] = t[n]);
						function r() {
							this.constructor = e;
						}
						return r.prototype = t.prototype, e.prototype = new r(), e.__super__ = t.prototype, e;
					}, g = {}.hasOwnProperty;
					c = e("./XMLDeclaration"), l = e("./XMLDocType"), n = e("./XMLCData"), r = e("./XMLComment"), u = e("./XMLElement"), f = e("./XMLRaw"), p = e("./XMLText"), d = e("./XMLProcessingInstruction"), i = e("./XMLDTDAttList"), a = e("./XMLDTDElement"), o = e("./XMLDTDEntity"), s = e("./XMLDTDNotation"), m = e("./XMLWriterBase"), t.exports = (function(e) {
						h(t, e);
						function t(e) {
							t.__super__.constructor.call(this, e);
						}
						return t.prototype.document = function(e) {
							var t, n, i, a, o;
							for (this.textispresent = !1, a = "", o = e.children, n = 0, i = o.length; n < i; n++) t = o[n], a += (function() {
								switch (!1) {
									case !(t instanceof c): return this.declaration(t);
									case !(t instanceof l): return this.docType(t);
									case !(t instanceof r): return this.comment(t);
									case !(t instanceof d): return this.processingInstruction(t);
									default: return this.element(t, 0);
								}
							}).call(this);
							return this.pretty && a.slice(-this.newline.length) === this.newline && (a = a.slice(0, -this.newline.length)), a;
						}, t.prototype.attribute = function(e) {
							return " " + e.name + "=\"" + e.value + "\"";
						}, t.prototype.cdata = function(e, t) {
							return this.space(t) + "<![CDATA[" + e.text + "]]>" + this.newline;
						}, t.prototype.comment = function(e, t) {
							return this.space(t) + "<!-- " + e.text + " -->" + this.newline;
						}, t.prototype.declaration = function(e, t) {
							var n = this.space(t);
							return n += "<?xml version=\"" + e.version + "\"", e.encoding != null && (n += " encoding=\"" + e.encoding + "\""), e.standalone != null && (n += " standalone=\"" + e.standalone + "\""), n += this.spacebeforeslash + "?>", n += this.newline, n;
						}, t.prototype.docType = function(e, t) {
							var c, l, u, f, p;
							if (t ||= 0, f = this.space(t), f += "<!DOCTYPE " + e.root().name, e.pubID && e.sysID ? f += " PUBLIC \"" + e.pubID + "\" \"" + e.sysID + "\"" : e.sysID && (f += " SYSTEM \"" + e.sysID + "\""), e.children.length > 0) {
								for (f += " [", f += this.newline, p = e.children, l = 0, u = p.length; l < u; l++) c = p[l], f += (function() {
									switch (!1) {
										case !(c instanceof i): return this.dtdAttList(c, t + 1);
										case !(c instanceof a): return this.dtdElement(c, t + 1);
										case !(c instanceof o): return this.dtdEntity(c, t + 1);
										case !(c instanceof s): return this.dtdNotation(c, t + 1);
										case !(c instanceof n): return this.cdata(c, t + 1);
										case !(c instanceof r): return this.comment(c, t + 1);
										case !(c instanceof d): return this.processingInstruction(c, t + 1);
										default: throw Error("Unknown DTD node type: " + c.constructor.name);
									}
								}).call(this);
								f += "]";
							}
							return f += this.spacebeforeslash + ">", f += this.newline, f;
						}, t.prototype.element = function(e, t) {
							var i, a, o, s, c, l, m, h, _, v, y, b, x;
							for (m in t ||= 0, x = !1, this.textispresent ? (this.newline = "", this.pretty = !1) : (this.newline = this.newlinedefault, this.pretty = this.prettydefault), b = this.space(t), h = "", h += b + "<" + e.name, _ = e.attributes, _) g.call(_, m) && (i = _[m], h += this.attribute(i));
							if (e.children.length === 0 || e.children.every(function(e) {
								return e.value === "";
							})) this.allowEmpty ? h += "></" + e.name + ">" + this.newline : h += this.spacebeforeslash + "/>" + this.newline;
							else if (this.pretty && e.children.length === 1 && e.children[0].value != null) h += ">", h += e.children[0].value, h += "</" + e.name + ">" + this.newline;
							else {
								if (this.dontprettytextnodes) {
									for (v = e.children, o = 0, c = v.length; o < c; o++) if (a = v[o], a.value != null) {
										this.textispresent++, x = !0;
										break;
									}
								}
								for (this.textispresent && (this.newline = "", this.pretty = !1, b = this.space(t)), h += ">" + this.newline, y = e.children, s = 0, l = y.length; s < l; s++) a = y[s], h += (function() {
									switch (!1) {
										case !(a instanceof n): return this.cdata(a, t + 1);
										case !(a instanceof r): return this.comment(a, t + 1);
										case !(a instanceof u): return this.element(a, t + 1);
										case !(a instanceof f): return this.raw(a, t + 1);
										case !(a instanceof p): return this.text(a, t + 1);
										case !(a instanceof d): return this.processingInstruction(a, t + 1);
										default: throw Error("Unknown XML node type: " + a.constructor.name);
									}
								}).call(this);
								x && this.textispresent--, this.textispresent || (this.newline = this.newlinedefault, this.pretty = this.prettydefault), h += b + "</" + e.name + ">" + this.newline;
							}
							return h;
						}, t.prototype.processingInstruction = function(e, t) {
							var n = this.space(t) + "<?" + e.target;
							return e.value && (n += " " + e.value), n += this.spacebeforeslash + "?>" + this.newline, n;
						}, t.prototype.raw = function(e, t) {
							return this.space(t) + e.value + this.newline;
						}, t.prototype.text = function(e, t) {
							return this.space(t) + e.value + this.newline;
						}, t.prototype.dtdAttList = function(e, t) {
							var n = this.space(t) + "<!ATTLIST " + e.elementName + " " + e.attributeName + " " + e.attributeType;
							return e.defaultValueType !== "#DEFAULT" && (n += " " + e.defaultValueType), e.defaultValue && (n += " \"" + e.defaultValue + "\""), n += this.spacebeforeslash + ">" + this.newline, n;
						}, t.prototype.dtdElement = function(e, t) {
							return this.space(t) + "<!ELEMENT " + e.name + " " + e.value + this.spacebeforeslash + ">" + this.newline;
						}, t.prototype.dtdEntity = function(e, t) {
							var n = this.space(t) + "<!ENTITY";
							return e.pe && (n += " %"), n += " " + e.name, e.value ? n += " \"" + e.value + "\"" : (e.pubID && e.sysID ? n += " PUBLIC \"" + e.pubID + "\" \"" + e.sysID + "\"" : e.sysID && (n += " SYSTEM \"" + e.sysID + "\""), e.nData && (n += " NDATA " + e.nData)), n += this.spacebeforeslash + ">" + this.newline, n;
						}, t.prototype.dtdNotation = function(e, t) {
							var n = this.space(t) + "<!NOTATION " + e.name;
							return e.pubID && e.sysID ? n += " PUBLIC \"" + e.pubID + "\" \"" + e.sysID + "\"" : e.pubID ? n += " PUBLIC \"" + e.pubID + "\"" : e.sysID && (n += " SYSTEM \"" + e.sysID + "\""), n += this.spacebeforeslash + ">" + this.newline, n;
						}, t.prototype.openNode = function(e, t) {
							var n, r, i, a;
							if (t ||= 0, e instanceof u) {
								for (r in i = this.space(t) + "<" + e.name, a = e.attributes, a) g.call(a, r) && (n = a[r], i += this.attribute(n));
								return i += (e.children ? ">" : "/>") + this.newline, i;
							}
							return i = this.space(t) + "<!DOCTYPE " + e.rootNodeName, e.pubID && e.sysID ? i += " PUBLIC \"" + e.pubID + "\" \"" + e.sysID + "\"" : e.sysID && (i += " SYSTEM \"" + e.sysID + "\""), i += (e.children ? " [" : ">") + this.newline, i;
						}, t.prototype.closeNode = function(e, t) {
							switch (t ||= 0, !1) {
								case !(e instanceof u): return this.space(t) + "</" + e.name + ">" + this.newline;
								case !(e instanceof l): return this.space(t) + "]>" + this.newline;
							}
						}, t;
					})(m);
				}).call(this);
			}, {
				"./XMLCData": 70,
				"./XMLComment": 71,
				"./XMLDTDAttList": 72,
				"./XMLDTDElement": 73,
				"./XMLDTDEntity": 74,
				"./XMLDTDNotation": 75,
				"./XMLDeclaration": 76,
				"./XMLDocType": 77,
				"./XMLElement": 80,
				"./XMLProcessingInstruction": 82,
				"./XMLRaw": 83,
				"./XMLText": 87,
				"./XMLWriterBase": 88
			}],
			86: [function(e, t, n) {
				(function() {
					var e = function(e, t) {
						return function() {
							return e.apply(t, arguments);
						};
					}, n = {}.hasOwnProperty;
					t.exports = (function() {
						function t(t) {
							this.assertLegalChar = e(this.assertLegalChar, this);
							var r, i, a;
							for (r in t ||= {}, this.noDoubleEncoding = t.noDoubleEncoding, i = t.stringify || {}, i) n.call(i, r) && (a = i[r], this[r] = a);
						}
						return t.prototype.eleName = function(e) {
							return e = "" + e || "", this.assertLegalChar(e);
						}, t.prototype.eleText = function(e) {
							return e = "" + e || "", this.assertLegalChar(this.elEscape(e));
						}, t.prototype.cdata = function(e) {
							return e = "" + e || "", e = e.replace("]]>", "]]]]><![CDATA[>"), this.assertLegalChar(e);
						}, t.prototype.comment = function(e) {
							if (e = "" + e || "", e.match(/--/)) throw Error("Comment text cannot contain double-hypen: " + e);
							return this.assertLegalChar(e);
						}, t.prototype.raw = function(e) {
							return "" + e || "";
						}, t.prototype.attName = function(e) {
							return e = "" + e || "";
						}, t.prototype.attValue = function(e) {
							return e = "" + e || "", this.attEscape(e);
						}, t.prototype.insTarget = function(e) {
							return "" + e || "";
						}, t.prototype.insValue = function(e) {
							if (e = "" + e || "", e.match(/\?>/)) throw Error("Invalid processing instruction value: " + e);
							return e;
						}, t.prototype.xmlVersion = function(e) {
							if (e = "" + e || "", !e.match(/1\.[0-9]+/)) throw Error("Invalid version number: " + e);
							return e;
						}, t.prototype.xmlEncoding = function(e) {
							if (e = "" + e || "", !e.match(/^[A-Za-z](?:[A-Za-z0-9._-])*$/)) throw Error("Invalid encoding: " + e);
							return e;
						}, t.prototype.xmlStandalone = function(e) {
							return e ? "yes" : "no";
						}, t.prototype.dtdPubID = function(e) {
							return "" + e || "";
						}, t.prototype.dtdSysID = function(e) {
							return "" + e || "";
						}, t.prototype.dtdElementValue = function(e) {
							return "" + e || "";
						}, t.prototype.dtdAttType = function(e) {
							return "" + e || "";
						}, t.prototype.dtdAttDefault = function(e) {
							return e == null ? e : "" + e || "";
						}, t.prototype.dtdEntityValue = function(e) {
							return "" + e || "";
						}, t.prototype.dtdNData = function(e) {
							return "" + e || "";
						}, t.prototype.convertAttKey = "@", t.prototype.convertPIKey = "?", t.prototype.convertTextKey = "#text", t.prototype.convertCDataKey = "#cdata", t.prototype.convertCommentKey = "#comment", t.prototype.convertRawKey = "#raw", t.prototype.assertLegalChar = function(e) {
							var t = e.match(/[\0\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/);
							if (t) throw Error("Invalid character in string: " + e + " at index " + t.index);
							return e;
						}, t.prototype.elEscape = function(e) {
							var t = this.noDoubleEncoding ? /(?!&\S+;)&/g : /&/g;
							return e.replace(t, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
						}, t.prototype.attEscape = function(e) {
							var t = this.noDoubleEncoding ? /(?!&\S+;)&/g : /&/g;
							return e.replace(t, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/\t/g, "&#x9;").replace(/\n/g, "&#xA;").replace(/\r/g, "&#xD;");
						}, t;
					})();
				}).call(this);
			}, {}],
			87: [function(e, t, n) {
				(function() {
					var n, r = function(e, t) {
						for (var n in t) i.call(t, n) && (e[n] = t[n]);
						function r() {
							this.constructor = e;
						}
						return r.prototype = t.prototype, e.prototype = new r(), e.__super__ = t.prototype, e;
					}, i = {}.hasOwnProperty;
					n = e("./XMLNode"), t.exports = (function(e) {
						r(t, e);
						function t(e, n) {
							if (t.__super__.constructor.call(this, e), n == null) throw Error("Missing element text. " + this.debugInfo());
							this.value = this.stringify.eleText(n);
						}
						return t.prototype.clone = function() {
							return Object.create(this);
						}, t.prototype.toString = function(e) {
							return this.options.writer.set(e).text(this);
						}, t;
					})(n);
				}).call(this);
			}, { "./XMLNode": 81 }],
			88: [function(e, t, n) {
				(function() {
					var e = {}.hasOwnProperty;
					t.exports = (function() {
						function t(t) {
							var n, r, i;
							for (n in t ||= {}, this.pretty = t.pretty || !1, this.allowEmpty = t.allowEmpty ?? !1, this.pretty ? (this.indent = t.indent ?? "  ", this.newline = t.newline ?? "\n", this.offset = t.offset ?? 0, this.dontprettytextnodes = t.dontprettytextnodes ?? 0) : (this.indent = "", this.newline = "", this.offset = 0, this.dontprettytextnodes = 0), this.spacebeforeslash = t.spacebeforeslash ?? "", this.spacebeforeslash === !0 && (this.spacebeforeslash = " "), this.newlinedefault = this.newline, this.prettydefault = this.pretty, r = t.writer || {}, r) e.call(r, n) && (i = r[n], this[n] = i);
						}
						return t.prototype.set = function(t) {
							var n, r, i;
							for (n in t ||= {}, "pretty" in t && (this.pretty = t.pretty), "allowEmpty" in t && (this.allowEmpty = t.allowEmpty), this.pretty ? (this.indent = "indent" in t ? t.indent : "  ", this.newline = "newline" in t ? t.newline : "\n", this.offset = "offset" in t ? t.offset : 0, this.dontprettytextnodes = "dontprettytextnodes" in t ? t.dontprettytextnodes : 0) : (this.indent = "", this.newline = "", this.offset = 0, this.dontprettytextnodes = 0), this.spacebeforeslash = "spacebeforeslash" in t ? t.spacebeforeslash : "", this.spacebeforeslash === !0 && (this.spacebeforeslash = " "), this.newlinedefault = this.newline, this.prettydefault = this.pretty, r = t.writer || {}, r) e.call(r, n) && (i = r[n], this[n] = i);
							return this;
						}, t.prototype.space = function(e) {
							var t;
							return this.pretty ? (t = (e || 0) + this.offset + 1, t > 0 ? Array(t).join(this.indent) : "") : "";
						}, t;
					})();
				}).call(this);
			}, {}],
			89: [function(e, t, n) {
				(function() {
					var n, r, i, a, o, s, c = e("./Utility");
					o = c.assign, s = c.isFunction, n = e("./XMLDocument"), r = e("./XMLDocumentCB"), a = e("./XMLStringWriter"), i = e("./XMLStreamWriter"), t.exports.create = function(e, t, r, i) {
						var a, s;
						if (e == null) throw Error("Root element needs a name.");
						return i = o({}, t, r, i), a = new n(i), s = a.element(e), i.headless || (a.declaration(i), (i.pubID != null || i.sysID != null) && a.doctype(i)), s;
					}, t.exports.begin = function(e, t, i) {
						var a;
						return s(e) && (a = [e, t], t = a[0], i = a[1], e = {}), t ? new r(e, t, i) : new n(e);
					}, t.exports.stringWriter = function(e) {
						return new a(e);
					}, t.exports.streamWriter = function(e, t) {
						return new i(e, t);
					};
				}).call(this);
			}, {
				"./Utility": 68,
				"./XMLDocument": 78,
				"./XMLDocumentCB": 79,
				"./XMLStreamWriter": 84,
				"./XMLStringWriter": 85
			}]
		}, {}, [21])(21);
	});
})))(), 1), d = typeof process == "object" && process + "" == "[object process]" && !process.versions.nw && !(process.versions.electron && process.type && process.type !== "browser"), f = [
	Infinity,
	Infinity,
	-Infinity,
	-Infinity
], p = new Float32Array(f), m = [
	.001,
	0,
	0,
	.001,
	0,
	0
], h = "http://www.w3.org/2000/svg", g = {
	ANY: 1,
	DISPLAY: 2,
	PRINT: 4,
	SAVE: 8,
	ANNOTATIONS_FORMS: 16,
	ANNOTATIONS_STORAGE: 32,
	ANNOTATIONS_DISABLE: 64,
	IS_EDITING: 128,
	OPLIST: 256
}, _ = {
	DISABLE: 0,
	ENABLE: 1,
	ENABLE_FORMS: 2,
	ENABLE_STORAGE: 3
}, v = "pdfjs_internal_id_", y = "pdfjs_internal_editor_", b = {
	DISABLE: -1,
	NONE: 0,
	FREETEXT: 3,
	HIGHLIGHT: 9,
	STAMP: 13,
	INK: 15,
	POPUP: 16,
	SIGNATURE: 101,
	COMMENT: 102
}, x = {
	RESIZE: 1,
	CREATE: 2,
	FREETEXT_SIZE: 11,
	FREETEXT_COLOR: 12,
	FREETEXT_OPACITY: 13,
	INK_COLOR: 21,
	INK_THICKNESS: 22,
	INK_OPACITY: 23,
	INK_COLOR_AND_OPACITY: 24,
	HIGHLIGHT_COLOR: 31,
	HIGHLIGHT_THICKNESS: 32,
	HIGHLIGHT_FREE: 33,
	HIGHLIGHT_SHOW_ALL: 34,
	DRAW_STEP: 41
}, S = {
	PRINT: 4,
	MODIFY_CONTENTS: 8,
	COPY: 16,
	MODIFY_ANNOTATIONS: 32,
	FILL_INTERACTIVE_FORMS: 256,
	COPY_FOR_ACCESSIBILITY: 512,
	ASSEMBLE: 1024,
	PRINT_HIGH_QUALITY: 2048
}, C = {
	FILL: 0,
	STROKE: 1,
	FILL_STROKE: 2,
	INVISIBLE: 3,
	FILL_ADD_TO_PATH: 4,
	STROKE_ADD_TO_PATH: 5,
	FILL_STROKE_ADD_TO_PATH: 6,
	ADD_TO_PATH: 7,
	FILL_STROKE_MASK: 3,
	ADD_TO_PATH_FLAG: 4
}, w = {
	GRAYSCALE_1BPP: 1,
	RGB_24BPP: 2,
	RGBA_32BPP: 3
}, T = {
	TEXT: 1,
	LINK: 2,
	FREETEXT: 3,
	LINE: 4,
	SQUARE: 5,
	CIRCLE: 6,
	POLYGON: 7,
	POLYLINE: 8,
	HIGHLIGHT: 9,
	UNDERLINE: 10,
	SQUIGGLY: 11,
	STRIKEOUT: 12,
	STAMP: 13,
	CARET: 14,
	INK: 15,
	POPUP: 16,
	FILEATTACHMENT: 17,
	SOUND: 18,
	MOVIE: 19,
	WIDGET: 20,
	SCREEN: 21,
	PRINTERMARK: 22,
	TRAPNET: 23,
	WATERMARK: 24,
	THREED: 25,
	REDACT: 26,
	RICHMEDIA: 27
}, E = {
	SOLID: 1,
	DASHED: 2,
	BEVELED: 3,
	INSET: 4,
	UNDERLINE: 5
}, D = {
	ERRORS: 0,
	WARNINGS: 1,
	INFOS: 5
}, O = {
	dependency: 1,
	setLineWidth: 2,
	setLineCap: 3,
	setLineJoin: 4,
	setMiterLimit: 5,
	setDash: 6,
	setRenderingIntent: 7,
	setFlatness: 8,
	setGState: 9,
	save: 10,
	restore: 11,
	transform: 12,
	moveTo: 13,
	lineTo: 14,
	curveTo: 15,
	curveTo2: 16,
	curveTo3: 17,
	closePath: 18,
	rectangle: 19,
	stroke: 20,
	closeStroke: 21,
	fill: 22,
	eoFill: 23,
	fillStroke: 24,
	eoFillStroke: 25,
	closeFillStroke: 26,
	closeEOFillStroke: 27,
	endPath: 28,
	clip: 29,
	eoClip: 30,
	beginText: 31,
	endText: 32,
	setCharSpacing: 33,
	setWordSpacing: 34,
	setHScale: 35,
	setLeading: 36,
	setFont: 37,
	setTextRenderingMode: 38,
	setTextRise: 39,
	moveText: 40,
	setLeadingMoveText: 41,
	setTextMatrix: 42,
	nextLine: 43,
	showText: 44,
	showSpacedText: 45,
	nextLineShowText: 46,
	nextLineSetSpacingShowText: 47,
	setCharWidth: 48,
	setCharWidthAndBounds: 49,
	setStrokeColorSpace: 50,
	setFillColorSpace: 51,
	setStrokeColor: 52,
	setStrokeColorN: 53,
	setFillColor: 54,
	setFillColorN: 55,
	setStrokeGray: 56,
	setFillGray: 57,
	setStrokeRGBColor: 58,
	setFillRGBColor: 59,
	setStrokeCMYKColor: 60,
	setFillCMYKColor: 61,
	shadingFill: 62,
	beginInlineImage: 63,
	beginImageData: 64,
	endInlineImage: 65,
	paintXObject: 66,
	markPoint: 67,
	markPointProps: 68,
	beginMarkedContent: 69,
	beginMarkedContentProps: 70,
	endMarkedContent: 71,
	beginCompat: 72,
	endCompat: 73,
	paintFormXObjectBegin: 74,
	paintFormXObjectEnd: 75,
	beginGroup: 76,
	endGroup: 77,
	beginAnnotation: 80,
	endAnnotation: 81,
	paintImageMaskXObject: 83,
	paintImageMaskXObjectGroup: 84,
	paintImageXObject: 85,
	paintInlineImageXObject: 86,
	paintInlineImageXObjectGroup: 87,
	paintImageXObjectRepeat: 88,
	paintImageMaskXObjectRepeat: 89,
	paintSolidColorImageMask: 90,
	constructPath: 91,
	setStrokeTransparent: 92,
	setFillTransparent: 93,
	rawFillPath: 94
}, k = {
	moveTo: 0,
	lineTo: 1,
	curveTo: 2,
	quadraticCurveTo: 3,
	closePath: 4
}, A = {
	NEED_PASSWORD: 1,
	INCORRECT_PASSWORD: 2
}, j = D.WARNINGS;
function M(e) {
	Number.isInteger(e) && (j = e);
}
function N() {
	return j;
}
function P(e) {
	j >= D.INFOS && console.info(`Info: ${e}`);
}
function F(e) {
	j >= D.WARNINGS && console.warn(`Warning: ${e}`);
}
function I(e) {
	throw Error(e);
}
function L(e, t) {
	e || I(t);
}
function R(e) {
	switch (e?.protocol) {
		case "http:":
		case "https:":
		case "ftp:":
		case "mailto:":
		case "tel:": return !0;
		default: return !1;
	}
}
function z(e, t = null, n = null) {
	if (!e) return null;
	if (n && typeof e == "string" && (n.addDefaultProtocol && e.startsWith("www.") && e.match(/\./g)?.length >= 2 && (e = `http://${e}`), n.tryConvertEncoding)) try {
		e = oe(e);
	} catch {}
	let r = t ? URL.parse(e, t) : URL.parse(e);
	return R(r) ? r : null;
}
function B(e, t, n = !1) {
	let r = URL.parse(e);
	return r ? (r.hash = t, r.href) : n && z(e, "http://example.com") ? e.split("#", 1)[0] + `${t ? `#${t}` : ""}` : "";
}
function V(e) {
	return e.substring(e.lastIndexOf("/") + 1);
}
function H(e, t, n, r = !1) {
	return Object.defineProperty(e, t, {
		value: n,
		enumerable: !r,
		configurable: !0,
		writable: !1
	}), n;
}
var U = function() {
	function e(e, t) {
		this.message = e, this.name = t;
	}
	return e.prototype = /* @__PURE__ */ Error(), e.constructor = e, e;
}(), ee = class extends U {
	constructor(e, t) {
		super(e, "PasswordException"), this.code = t;
	}
}, W = class extends U {
	constructor(e, t) {
		super(e, "UnknownErrorException"), this.details = t;
	}
}, te = class extends U {
	constructor(e) {
		super(e, "InvalidPDFException");
	}
}, G = class extends U {
	constructor(e, t, n) {
		super(e, "ResponseException"), this.status = t, this.missing = n;
	}
}, ne = class extends U {
	constructor(e) {
		super(e, "FormatError");
	}
}, re = class extends U {
	constructor(e) {
		super(e, "AbortException");
	}
};
function ie(e) {
	(typeof e != "object" || e?.length === void 0) && I("Invalid argument for bytesToString");
	let t = e.length, n = 8192;
	if (t < n) return String.fromCharCode.apply(null, e);
	let r = [];
	for (let i = 0; i < t; i += n) {
		let a = Math.min(i + n, t), o = e.subarray(i, a);
		r.push(String.fromCharCode.apply(null, o));
	}
	return r.join("");
}
function ae(e) {
	typeof e != "string" && I("Invalid argument for stringToBytes");
	let t = e.length, n = new Uint8Array(t);
	for (let r = 0; r < t; ++r) n[r] = e.charCodeAt(r) & 255;
	return n;
}
var K = class {
	static get isLittleEndian() {
		let e = /* @__PURE__ */ new Uint8Array(4);
		e[0] = 1;
		let t = new Uint32Array(e.buffer, 0, 1);
		return H(this, "isLittleEndian", t[0] === 1);
	}
	static get isOffscreenCanvasSupported() {
		return H(this, "isOffscreenCanvasSupported", typeof OffscreenCanvas < "u");
	}
	static get isImageDecoderSupported() {
		return H(this, "isImageDecoderSupported", typeof ImageDecoder < "u");
	}
	static get isFloat16ArraySupported() {
		return H(this, "isFloat16ArraySupported", typeof Float16Array < "u");
	}
	static get isSanitizerSupported() {
		return H(this, "isSanitizerSupported", typeof Sanitizer < "u");
	}
	static get platform() {
		let { platform: e, userAgent: t } = navigator;
		return H(this, "platform", {
			isAndroid: t.includes("Android"),
			isLinux: e.includes("Linux"),
			isMac: e.includes("Mac"),
			isWindows: e.includes("Win"),
			isFirefox: t.includes("Firefox")
		});
	}
	static get isCanvasFilterSupported() {
		let e;
		return this.isOffscreenCanvasSupported ? e = new OffscreenCanvas(1, 1).getContext("2d") : typeof document < "u" && (e = document.createElement("canvas").getContext("2d")), H(this, "isCanvasFilterSupported", e?.filter !== void 0);
	}
	static get isAlphaColorInputSupported() {
		if (typeof document > "u") return H(this, "isAlphaColorInputSupported", !1);
		let e = document.createElement("input");
		return e.type = "color", e.setAttribute("alpha", ""), e.value = "#ff000080", H(this, "isAlphaColorInputSupported", e.value !== "#ff0000");
	}
	static get isBackdropFilterSupported() {
		return H(this, "isBackdropFilterSupported", typeof CSS < "u" && CSS.supports("backdrop-filter", "blur(1px)"));
	}
}, q = class {
	static get hexNums() {
		return H(this, "hexNums", Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0")));
	}
	static makeHexColor(e, t, n) {
		return `#${this.hexNums[e]}${this.hexNums[t]}${this.hexNums[n]}`;
	}
	static transform(e, t) {
		return [
			e[0] * t[0] + e[2] * t[1],
			e[1] * t[0] + e[3] * t[1],
			e[0] * t[2] + e[2] * t[3],
			e[1] * t[2] + e[3] * t[3],
			e[0] * t[4] + e[2] * t[5] + e[4],
			e[1] * t[4] + e[3] * t[5] + e[5]
		];
	}
	static multiplyByDOMMatrix(e, t) {
		return [
			e[0] * t.a + e[2] * t.b,
			e[1] * t.a + e[3] * t.b,
			e[0] * t.c + e[2] * t.d,
			e[1] * t.c + e[3] * t.d,
			e[0] * t.e + e[2] * t.f + e[4],
			e[1] * t.e + e[3] * t.f + e[5]
		];
	}
	static applyTransform(e, t, n = 0) {
		let r = e[n], i = e[n + 1];
		e[n] = r * t[0] + i * t[2] + t[4], e[n + 1] = r * t[1] + i * t[3] + t[5];
	}
	static applyTransformToBezier(e, t, n = 0) {
		let r = t[0], i = t[1], a = t[2], o = t[3], s = t[4], c = t[5];
		for (let t = 0; t < 6; t += 2) {
			let l = e[n + t], u = e[n + t + 1];
			e[n + t] = l * r + u * a + s, e[n + t + 1] = l * i + u * o + c;
		}
	}
	static applyInverseTransform(e, t) {
		let n = e[0], r = e[1], i = t[0] * t[3] - t[1] * t[2];
		e[0] = (n * t[3] - r * t[2] + t[2] * t[5] - t[4] * t[3]) / i, e[1] = (-n * t[1] + r * t[0] + t[4] * t[1] - t[5] * t[0]) / i;
	}
	static axialAlignedBoundingBox(e, t, n) {
		let r = t[0], i = t[1], a = t[2], o = t[3], s = t[4], c = t[5], l = e[0], u = e[1], d = e[2], f = e[3], p = r * l + s, m = p, h = r * d + s, g = h, _ = o * u + c, v = _, y = o * f + c, b = y;
		if (i !== 0 || a !== 0) {
			let e = i * l, t = i * d, n = a * u, r = a * f;
			p += n, g += n, h += r, m += r, _ += e, b += e, y += t, v += t;
		}
		n[0] = Math.min(n[0], p, h, m, g), n[1] = Math.min(n[1], _, y, v, b), n[2] = Math.max(n[2], p, h, m, g), n[3] = Math.max(n[3], _, y, v, b);
	}
	static inverseTransform(e) {
		let t = e[0] * e[3] - e[1] * e[2];
		return [
			e[3] / t,
			-e[1] / t,
			-e[2] / t,
			e[0] / t,
			(e[2] * e[5] - e[4] * e[3]) / t,
			(e[4] * e[1] - e[5] * e[0]) / t
		];
	}
	static singularValueDecompose2dScale(e, t) {
		let n = e[0], r = e[1], i = e[2], a = e[3], o = n ** 2 + r ** 2, s = n * i + r * a, c = i ** 2 + a ** 2, l = (o + c) / 2, u = Math.sqrt(l ** 2 - (o * c - s ** 2));
		t[0] = Math.sqrt(l + u || 1), t[1] = Math.sqrt(l - u || 1);
	}
	static normalizeRect(e) {
		let t = e.slice(0);
		return e[0] > e[2] && (t[0] = e[2], t[2] = e[0]), e[1] > e[3] && (t[1] = e[3], t[3] = e[1]), t;
	}
	static intersect(e, t) {
		let n = Math.max(Math.min(e[0], e[2]), Math.min(t[0], t[2])), r = Math.min(Math.max(e[0], e[2]), Math.max(t[0], t[2]));
		if (n > r) return null;
		let i = Math.max(Math.min(e[1], e[3]), Math.min(t[1], t[3])), a = Math.min(Math.max(e[1], e[3]), Math.max(t[1], t[3]));
		return i > a ? null : [
			n,
			i,
			r,
			a
		];
	}
	static pointBoundingBox(e, t, n) {
		n[0] = Math.min(n[0], e), n[1] = Math.min(n[1], t), n[2] = Math.max(n[2], e), n[3] = Math.max(n[3], t);
	}
	static rectBoundingBox(e, t, n, r, i) {
		i[0] = Math.min(i[0], e, n), i[1] = Math.min(i[1], t, r), i[2] = Math.max(i[2], e, n), i[3] = Math.max(i[3], t, r);
	}
	static #e(e, t, n, r, i, a, o, s, c, l) {
		if (c <= 0 || c >= 1) return;
		let u = 1 - c, d = c * c, f = d * c, p = u * (u * (u * e + 3 * c * t) + 3 * d * n) + f * r, m = u * (u * (u * i + 3 * c * a) + 3 * d * o) + f * s;
		l[0] = Math.min(l[0], p), l[1] = Math.min(l[1], m), l[2] = Math.max(l[2], p), l[3] = Math.max(l[3], m);
	}
	static #t(e, t, n, r, i, a, o, s, c, l, u, d) {
		if (Math.abs(c) < 1e-12) {
			Math.abs(l) >= 1e-12 && this.#e(e, t, n, r, i, a, o, s, -u / l, d);
			return;
		}
		let f = l ** 2 - 4 * u * c;
		if (f < 0) return;
		let p = Math.sqrt(f), m = 2 * c;
		this.#e(e, t, n, r, i, a, o, s, (-l + p) / m, d), this.#e(e, t, n, r, i, a, o, s, (-l - p) / m, d);
	}
	static bezierBoundingBox(e, t, n, r, i, a, o, s, c) {
		c[0] = Math.min(c[0], e, o), c[1] = Math.min(c[1], t, s), c[2] = Math.max(c[2], e, o), c[3] = Math.max(c[3], t, s), this.#t(e, n, i, o, t, r, a, s, 3 * (-e + 3 * (n - i) + o), 6 * (e - 2 * n + i), 3 * (n - e), c), this.#t(e, n, i, o, t, r, a, s, 3 * (-t + 3 * (r - a) + s), 6 * (t - 2 * r + a), 3 * (r - t), c);
	}
};
function oe(e) {
	return decodeURIComponent(escape(e));
}
var se = null, ce = null;
function le(e) {
	return se || (se = /([\u00a0\u00b5\u037e\u0eb3\u2000-\u200a\u202f\u2126\ufb00-\ufb04\ufb06\ufb20-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufba1\ufba4-\ufba9\ufbae-\ufbb1\ufbd3-\ufbdc\ufbde-\ufbe7\ufbea-\ufbf8\ufbfc\ufbfd\ufc00-\ufc5d\ufc64-\ufcf1\ufcf5-\ufd3d\ufd88\ufdf4\ufdfa\ufdfb\ufe71\ufe77\ufe79\ufe7b\ufe7d]+)|(\ufb05+)/gu, ce = /* @__PURE__ */ new Map([["ﬅ", "ſt"]])), e.replaceAll(se, (e, t, n) => t ? t.normalize("NFKC") : ce.get(n));
}
function ue() {
	if (typeof crypto.randomUUID == "function") return crypto.randomUUID();
	let e = /* @__PURE__ */ new Uint8Array(32);
	return crypto.getRandomValues(e), ie(e);
}
function de(e, t, n) {
	if (!Array.isArray(n) || n.length < 2) return !1;
	let [r, i, ...a] = n;
	if (!e(r) && !Number.isInteger(r) || !t(i)) return !1;
	let o = a.length, s = !0;
	switch (i.name) {
		case "XYZ":
			if (o < 2 || o > 3) return !1;
			break;
		case "Fit":
		case "FitB": return o === 0;
		case "FitH":
		case "FitBH":
		case "FitV":
		case "FitBV":
			if (o > 1) return !1;
			break;
		case "FitR":
			if (o !== 4) return !1;
			s = !1;
			break;
		default: return !1;
	}
	for (let e of a) if (!(typeof e == "number" || s && e === null)) return !1;
	return !0;
}
var fe = () => [], J = () => /* @__PURE__ */ new Map(), pe = () => Object.create(null), me = () => /* @__PURE__ */ new Set();
typeof Iterator.prototype.join != "function" && (Iterator.prototype.join = function(e) {
	return [...this].join(e);
});
function Y(e, t, n) {
	return Math.min(Math.max(e, t), n);
}
var he = class e {
	constructor({ viewBox: e, userUnit: t, scale: n, rotation: r, offsetX: i = 0, offsetY: a = 0, dontFlip: o = !1 }) {
		this.viewBox = e, this.userUnit = t, this.scale = n, this.rotation = r, this.offsetX = i, this.offsetY = a, n *= t;
		let s = (e[2] + e[0]) / 2, c = (e[3] + e[1]) / 2, l, u, d, f;
		switch (r %= 360, r < 0 && (r += 360), r) {
			case 180:
				l = -1, u = 0, d = 0, f = 1;
				break;
			case 90:
				l = 0, u = 1, d = 1, f = 0;
				break;
			case 270:
				l = 0, u = -1, d = -1, f = 0;
				break;
			case 0:
				l = 1, u = 0, d = 0, f = -1;
				break;
			default: throw Error("PageViewport: Invalid rotation, must be a multiple of 90 degrees.");
		}
		o && (d = -d, f = -f);
		let p, m, h, g;
		l === 0 ? (p = Math.abs(c - e[1]) * n + i, m = Math.abs(s - e[0]) * n + a, h = (e[3] - e[1]) * n, g = (e[2] - e[0]) * n) : (p = Math.abs(s - e[0]) * n + i, m = Math.abs(c - e[1]) * n + a, h = (e[2] - e[0]) * n, g = (e[3] - e[1]) * n), this.transform = [
			l * n,
			u * n,
			d * n,
			f * n,
			p - l * n * s - d * n * c,
			m - u * n * s - f * n * c
		], this.width = h, this.height = g;
	}
	get rawDims() {
		let e = this.viewBox;
		return H(this, "rawDims", {
			pageWidth: e[2] - e[0],
			pageHeight: e[3] - e[1],
			pageX: e[0],
			pageY: e[1]
		});
	}
	clone({ scale: t = this.scale, rotation: n = this.rotation, offsetX: r = this.offsetX, offsetY: i = this.offsetY, dontFlip: a = !1 } = {}) {
		return new e({
			viewBox: this.viewBox.slice(),
			userUnit: this.userUnit,
			scale: t,
			rotation: n,
			offsetX: r,
			offsetY: i,
			dontFlip: a
		});
	}
	convertToViewportPoint(e, t) {
		let n = [e, t];
		return q.applyTransform(n, this.transform), n;
	}
	convertToPdfPoint(e, t) {
		let n = [e, t];
		return q.applyInverseTransform(n, this.transform), n;
	}
}, ge = class e {
	static textContent(t) {
		let n = [], r = {
			items: n,
			styles: Object.create(null)
		};
		function i(t) {
			if (!t) return;
			let r = null, a = t.name;
			if (a === "#text") r = t.value;
			else if (e.shouldBuildText(a)) t?.attributes?.textContent ? r = t.attributes.textContent : t.value && (r = t.value);
			else return;
			if (r !== null && n.push({ str: r }), t.children) for (let e of t.children) i(e);
		}
		return i(t), r;
	}
	static shouldBuildText(e) {
		return e !== "textarea" && e !== "input" && e !== "option" && e !== "select";
	}
}, _e = /url\(|image-set\(/i, ve = /^on/i, ye = class {
	static get _allowedHtmlElements() {
		return H(this, "_allowedHtmlElements", /* @__PURE__ */ new Set([
			"a",
			"b",
			"br",
			"button",
			"div",
			"i",
			"img",
			"input",
			"label",
			"li",
			"ol",
			"option",
			"p",
			"select",
			"span",
			"sub",
			"sup",
			"textarea",
			"ul"
		]));
	}
	static get _allowedSvgElements() {
		return H(this, "_allowedSvgElements", /* @__PURE__ */ new Set([
			"ellipse",
			"line",
			"path",
			"rect",
			"svg"
		]));
	}
	static get _allowedRichTextElements() {
		return H(this, "_allowedRichTextElements", /* @__PURE__ */ new Set([
			"a",
			"b",
			"br",
			"div",
			"i",
			"li",
			"ol",
			"p",
			"span",
			"sub",
			"sup",
			"ul"
		]));
	}
	static get _allowedRichTextAttributes() {
		return H(this, "_allowedRichTextAttributes", /* @__PURE__ */ new Set([
			"class",
			"dir",
			"style"
		]));
	}
	static get _allowedRichTextStyles() {
		return H(this, "_allowedRichTextStyles", /* @__PURE__ */ new Set(/* @__PURE__ */ "color.font.fontFamily.fontSize.fontStretch.fontStyle.fontWeight.kerningMode.letterSpacing.lineHeight.margin.marginBottom.marginLeft.marginRight.marginTop.orphans.paddingLeft.paddingRight.breakAfter.breakBefore.breakInside.tabInterval.tabStop.textAlign.textDecoration.textIndent.transform.verticalAlign.widows".split(".")));
	}
	static setupStorage(e, t, n, r, i) {
		let a = r.getValue(t, { value: null });
		switch (n.name) {
			case "textarea":
				if (a.value !== null && (e.textContent = a.value), i === "print") break;
				e.addEventListener("input", (e) => {
					r.setValue(t, { value: e.target.value });
				});
				break;
			case "input":
				if (n.attributes.type === "radio" || n.attributes.type === "checkbox") {
					if (a.value === n.attributes.xfaOn ? e.setAttribute("checked", !0) : a.value === n.attributes.xfaOff && e.removeAttribute("checked"), i === "print") break;
					e.addEventListener("change", (e) => {
						r.setValue(t, { value: e.target.checked ? e.target.getAttribute("xfaOn") : e.target.getAttribute("xfaOff") });
					});
				} else {
					if (a.value !== null && e.setAttribute("value", a.value), i === "print") break;
					e.addEventListener("input", (e) => {
						r.setValue(t, { value: e.target.value });
					});
				}
				break;
			case "select":
				if (a.value !== null) {
					e.setAttribute("value", a.value);
					for (let e of n.children) e.attributes.value === a.value ? e.attributes.selected = !0 : Object.hasOwn(e.attributes, "selected") && delete e.attributes.selected;
				}
				e.addEventListener("input", (e) => {
					let n = e.target.options, i = n.selectedIndex === -1 ? "" : n[n.selectedIndex].value;
					r.setValue(t, { value: i });
				});
		}
	}
	static setAttributes({ html: e, element: t, storage: n = null, intent: r, linkService: i }) {
		let { attributes: a } = t, o = e instanceof HTMLAnchorElement;
		a.type === "radio" && (a.name = `${a.name}-${r}`);
		for (let [t, n] of Object.entries(a)) if (!(n == null || ve.test(t)) && (r !== "richText" || this._allowedRichTextAttributes.has(t))) switch (t) {
			case "class":
				n.length && e.setAttribute(t, n.join(" "));
				break;
			case "dataId": break;
			case "id":
				e.setAttribute("data-element-id", n);
				break;
			case "style":
				if (r === "richText") {
					let t = this._allowedRichTextStyles;
					for (let [r, i] of Object.entries(n)) t.has(r) && !_e.test(i) && (e.style[r] = i);
				} else Object.assign(e.style, n);
				break;
			case "textContent":
				e.textContent = n;
				break;
			default: (!o || t !== "href" && t !== "newWindow") && e.setAttribute(t, n);
		}
		o && i?.addLinkAttributes(e, a.href, a.newWindow), n && a.dataId && this.setupStorage(e, a.dataId, t, n);
	}
	static #e(e, t, n) {
		return n === "richText" ? !t && this._allowedRichTextElements.has(e) ? document.createElement(e) : null : t ? t === h && this._allowedSvgElements.has(e) ? document.createElementNS(h, e) : null : this._allowedHtmlElements.has(e) ? document.createElement(e) : null;
	}
	static render(e) {
		let t = e.annotationStorage, n = e.linkService, r = e.xfaHtml, i = e.intent || "display", a = this.#e(r.name, r.attributes?.xmlns, i) ?? document.createElement("div");
		r.attributes && this.setAttributes({
			html: a,
			element: r,
			intent: i,
			linkService: n
		});
		let o = i !== "richText", s = e.div;
		if (s.append(a), e.viewport) {
			let t = `matrix(${e.viewport.transform.join(",")})`;
			s.style.transform = t;
		}
		o && s.setAttribute("class", "xfaLayer xfaFont");
		let c = [];
		if (r.children.length === 0) {
			if (r.value) {
				let e = document.createTextNode(r.value);
				a.append(e), o && ge.shouldBuildText(r.name) && c.push(e);
			}
			return { textDivs: c };
		}
		let l = [[
			r,
			-1,
			a
		]];
		for (; l.length > 0;) {
			let [e, r, a] = l.at(-1);
			if (r + 1 === e.children.length) {
				l.pop();
				continue;
			}
			let s = e.children[++l.at(-1)[1]];
			if (s === null) continue;
			let { name: u } = s;
			if (u === "#text") {
				let e = document.createTextNode(s.value);
				c.push(e), a.append(e);
				continue;
			}
			let d = this.#e(u, s.attributes?.xmlns, i);
			if (d) {
				if (a.append(d), s.attributes && this.setAttributes({
					html: d,
					element: s,
					storage: t,
					intent: i,
					linkService: n
				}), s.children?.length > 0) l.push([
					s,
					-1,
					d
				]);
				else if (s.value) {
					let e = document.createTextNode(s.value);
					o && ge.shouldBuildText(u) && c.push(e), d.append(e);
				}
			}
		}
		for (let e of s.querySelectorAll(".xfaNonInteractive input, .xfaNonInteractive textarea")) e.setAttribute("readOnly", !0);
		return { textDivs: c };
	}
	static update(e) {
		let t = `matrix(${e.viewport.transform.join(",")})`;
		e.div.style.transform = t, e.div.hidden = !1;
	}
	static getPageViewport(e, { scale: t = 1, rotation: n = 0 }) {
		let { width: r, height: i } = e.attributes.style;
		return new he({
			viewBox: [
				0,
				0,
				parseInt(r, 10),
				parseInt(i, 10)
			],
			userUnit: 1,
			scale: t,
			rotation: n
		});
	}
}, be = class {
	static CSS = 96;
	static PDF = 72;
	static PDF_TO_CSS_UNITS = this.CSS / this.PDF;
};
async function xe(e, t = "text") {
	if (Oe(e, document.baseURI)) {
		let n = await fetch(e);
		if (!n.ok) throw Error(n.statusText);
		switch (t) {
			case "blob": return n.blob();
			case "bytes": return n.bytes();
			case "json": return n.json();
		}
		return n.text();
	}
	return new Promise((n, r) => {
		let i = new XMLHttpRequest();
		i.open("GET", e, !0), i.responseType = t === "bytes" ? "arraybuffer" : t, i.onreadystatechange = () => {
			if (i.readyState === XMLHttpRequest.DONE) {
				if (i.status === 200 || i.status === 0) {
					switch (t) {
						case "bytes":
							n(new Uint8Array(i.response));
							return;
						case "blob":
						case "json":
							n(i.response);
							return;
					}
					n(i.responseText);
					return;
				}
				r(Error(i.statusText));
			}
		}, i.send(null);
	});
}
var Se = class extends U {
	constructor(e, t = 0) {
		super(e, "RenderingCancelledException"), this.extraDelay = t;
	}
};
function Ce(e) {
	let t = e.length, n = 0;
	for (; n < t && e[n].trim() === "";) n++;
	return e.substring(n, n + 5).toLowerCase() === "data:";
}
function we(e) {
	return typeof e == "string" && /\.pdf$/i.test(e);
}
function Te(e) {
	return [e] = e.split(/[#?]/, 1), V(e);
}
function Ee(e, t = "document.pdf") {
	if (typeof e != "string") return t;
	if (Ce(e)) return F("getPdfFilenameFromUrl: ignore \"data:\"-URL for performance reasons."), t;
	let n = ((e) => {
		try {
			return new URL(e);
		} catch {}
		try {
			return new URL(decodeURIComponent(e));
		} catch {}
		try {
			return new URL(e, "https://foo.bar");
		} catch {}
		try {
			return new URL(decodeURIComponent(e), "https://foo.bar");
		} catch {}
		return null;
	})(e);
	if (!n) return t;
	let r = (e) => {
		try {
			let t = decodeURIComponent(e);
			return t.includes("/") && (t = V(t), t.length === 4 && i.test(t)) ? e : t;
		} catch {
			return e;
		}
	}, i = /\.pdf$/i, a = V(n.pathname);
	if (i.test(a)) return r(a);
	if (n.searchParams.size > 0) {
		let e = (e) => [...e].findLast((e) => i.test(e)), t = e(n.searchParams.values()) ?? e(n.searchParams.keys());
		if (t) return r(t);
	}
	if (n.hash) {
		let { hash: e } = n, t = -1;
		for (let { index: n } of e.matchAll(/\.pdf\b/gi)) t = n;
		if (t > 0) {
			let n = t;
			for (; n > 0 && !"/?#=".includes(e[n - 1]);) n--;
			if (n < t) return r(e.slice(n, t + 4));
		}
	}
	return t;
}
var De = class {
	#e = /* @__PURE__ */ new Map();
	times = [];
	time(e) {
		this.#e.has(e) && F(`Timer is already running for ${e}`), this.#e.set(e, Date.now());
	}
	timeEnd(e) {
		this.#e.has(e) || F(`Timer has not been started for ${e}`), this.times.push({
			name: e,
			start: this.#e.get(e),
			end: Date.now()
		}), this.#e.delete(e);
	}
	toString() {
		let e = Math.max(...this.times.map((e) => e.name.length));
		return this.times.map((t) => `${t.name.padEnd(e)} ${t.end - t.start}ms\n`).join("");
	}
};
function Oe(e, t) {
	let n = t ? URL.parse(e, t) : URL.parse(e);
	return /https?:/.test(n?.protocol ?? "");
}
function ke(e) {
	e.preventDefault();
}
function Ae(e) {
	e.preventDefault(), e.stopPropagation();
}
var je = class {
	static #e;
	static toDateObject(e) {
		if (e instanceof Date) return e;
		if (!e || typeof e != "string") return null;
		this.#e ||= /* @__PURE__ */ RegExp("^D:(\\d{4})(\\d{2})?(\\d{2})?(\\d{2})?(\\d{2})?(\\d{2})?([Z|+\\-])?(\\d{2})?'?(\\d{2})?'?");
		let t = this.#e.exec(e);
		if (!t) return null;
		let n = parseInt(t[1], 10), r = parseInt(t[2], 10);
		r = r >= 1 && r <= 12 ? r - 1 : 0;
		let i = parseInt(t[3], 10);
		i = i >= 1 && i <= 31 ? i : 1;
		let a = parseInt(t[4], 10);
		a = a >= 0 && a <= 23 ? a : 0;
		let o = parseInt(t[5], 10);
		o = o >= 0 && o <= 59 ? o : 0;
		let s = parseInt(t[6], 10);
		s = s >= 0 && s <= 59 ? s : 0;
		let c = t[7] || "Z", l = parseInt(t[8], 10);
		l = l >= 0 && l <= 23 ? l : 0;
		let u = parseInt(t[9], 10) || 0;
		return u = u >= 0 && u <= 59 ? u : 0, c === "-" ? (a += l, o += u) : c === "+" && (a -= l, o -= u), new Date(Date.UTC(n, r, i, a, o, s));
	}
};
function Me(e) {
	if (e.startsWith("#")) {
		let t = e.slice(1);
		return [
			parseInt(t.slice(0, 2), 16),
			parseInt(t.slice(2, 4), 16),
			parseInt(t.slice(4, 6), 16),
			t.length >= 8 ? parseInt(t.slice(6, 8), 16) / 255 : 1
		];
	}
	if (e.startsWith("rgb(")) {
		let [t, n, r] = e.slice(4, -1).split(",").map((e) => parseInt(e, 10));
		return [
			t,
			n,
			r,
			1
		];
	}
	if (e.startsWith("rgba(")) {
		let t = e.slice(5, -1).split(",");
		return [
			parseInt(t[0], 10),
			parseInt(t[1], 10),
			parseInt(t[2], 10),
			parseFloat(t[3])
		];
	}
	let t = e.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+|none))?\)$/);
	return t ? [
		Math.round(parseFloat(t[1]) * 255),
		Math.round(parseFloat(t[2]) * 255),
		Math.round(parseFloat(t[3]) * 255),
		t[4] !== void 0 && t[4] !== "none" ? parseFloat(t[4]) : 1
	] : null;
}
function Ne(e) {
	let t = Me(e);
	return t ? t.slice(0, 3) : (F(`Not a valid color format: "${e}"`), [
		0,
		0,
		0
	]);
}
function Pe(e) {
	let t = document.createElement("span");
	t.style.visibility = "hidden", t.style.colorScheme = "only light", document.body.append(t);
	for (let n of e.keys()) {
		t.style.color = n;
		let r = window.getComputedStyle(t).color;
		e.set(n, Ne(r));
	}
	t.remove();
}
function X(e) {
	let { a: t, b: n, c: r, d: i, e: a, f: o } = e.getTransform();
	return [
		t,
		n,
		r,
		i,
		a,
		o
	];
}
function Fe(e) {
	let { a: t, b: n, c: r, d: i, e: a, f: o } = e.getTransform().invertSelf();
	return [
		t,
		n,
		r,
		i,
		a,
		o
	];
}
function Ie(e, t, n = !1, r = !0) {
	if (t instanceof he) {
		let { pageWidth: r, pageHeight: i } = t.rawDims, { style: a } = e, o = `round(down, var(--total-scale-factor) * ${r}px, var(--scale-round-x))`, s = `round(down, var(--total-scale-factor) * ${i}px, var(--scale-round-y))`;
		!n || t.rotation % 180 == 0 ? (a.width = o, a.height = s) : (a.width = s, a.height = o);
	}
	r && e.setAttribute("data-main-rotation", t.rotation);
}
var Le = class e {
	constructor() {
		let { pixelRatio: t } = e;
		this.sx = t, this.sy = t;
	}
	get scaled() {
		return this.sx !== 1 || this.sy !== 1;
	}
	get symmetric() {
		return this.sx === this.sy;
	}
	limitCanvas(t, n, r, i, a = -1) {
		let o = Infinity, s = Infinity, c = Infinity;
		r = e.capPixels(r, a), r > 0 && (o = Math.sqrt(r / (t * n))), i !== -1 && (s = i / t, c = i / n);
		let l = Math.min(o, s, c);
		return this.sx > l || this.sy > l ? (this.sx = l, this.sy = l, !0) : !1;
	}
	static get pixelRatio() {
		return globalThis.devicePixelRatio || 1;
	}
	static capPixels(e, t) {
		if (t >= 0) {
			let n = Math.ceil(window.screen.availWidth * window.screen.availHeight * this.pixelRatio ** 2 * (1 + t / 100));
			return e > 0 ? Math.min(e, n) : n;
		}
		return e;
	}
}, Re = /* @__PURE__ */ new Set([
	"image/apng",
	"image/avif",
	"image/bmp",
	"image/gif",
	"image/jpeg",
	"image/png",
	"image/svg+xml",
	"image/webp",
	"image/x-icon"
]), ze = class {
	static get isDarkMode() {
		return H(this, "isDarkMode", !!window?.matchMedia?.("(prefers-color-scheme: dark)").matches);
	}
}, Be = class {
	static get commentForegroundColor() {
		let e = document.createElement("span");
		e.classList.add("comment", "sidebar");
		let { style: t } = e;
		t.width = t.height = "0", t.display = "none", t.color = "var(--comment-fg-color)", document.body.append(e);
		let { color: n } = window.getComputedStyle(e);
		return e.remove(), H(this, "commentForegroundColor", Ne(n));
	}
};
function Ve(e, t) {
	t = Y(t ?? 1, 0, 1);
	let n = 255 * (1 - t);
	return e.map((e) => Math.round(e * t + n));
}
function He(e, t) {
	let n = e[0] / 255, r = e[1] / 255, i = e[2] / 255, a = Math.max(n, r, i), o = Math.min(n, r, i), s = (a + o) / 2;
	if (a === o) t[0] = t[1] = 0;
	else {
		let e = a - o;
		switch (t[1] = s < .5 ? e / (a + o) : e / (2 - a - o), a) {
			case n:
				t[0] = ((r - i) / e + (r < i ? 6 : 0)) * 60;
				break;
			case r:
				t[0] = ((i - n) / e + 2) * 60;
				break;
			case i: t[0] = ((n - r) / e + 4) * 60;
		}
	}
	t[2] = s;
}
function Ue(e, t) {
	let n = e[0], r = e[1], i = e[2], a = (1 - Math.abs(2 * i - 1)) * r, o = a * (1 - Math.abs(n / 60 % 2 - 1)), s = i - a / 2;
	switch (Math.floor(n / 60)) {
		case 0:
			t[0] = a + s, t[1] = o + s, t[2] = s;
			break;
		case 1:
			t[0] = o + s, t[1] = a + s, t[2] = s;
			break;
		case 2:
			t[0] = s, t[1] = a + s, t[2] = o + s;
			break;
		case 3:
			t[0] = s, t[1] = o + s, t[2] = a + s;
			break;
		case 4:
			t[0] = o + s, t[1] = s, t[2] = a + s;
			break;
		case 5:
		case 6: t[0] = a + s, t[1] = s, t[2] = o + s;
	}
}
function We(e) {
	return e <= .03928 ? e / 12.92 : ((e + .055) / 1.055) ** 2.4;
}
function Ge(e, t, n) {
	Ue(e, n), n.map(We);
	let r = .2126 * n[0] + .7152 * n[1] + .0722 * n[2];
	Ue(t, n), n.map(We);
	let i = .2126 * n[0] + .7152 * n[1] + .0722 * n[2];
	return r > i ? (r + .05) / (i + .05) : (i + .05) / (r + .05);
}
var Ke = /* @__PURE__ */ new Map();
function qe(e, t) {
	let n = e[0] + e[1] * 256 + e[2] * 65536 + t[0] * 16777216 + t[1] * 4294967296 + t[2] * 1099511627776, r = Ke.get(n);
	if (r) return r;
	let i = /* @__PURE__ */ new Float32Array(9), a = i.subarray(0, 3), o = i.subarray(3, 6);
	He(e, o);
	let s = i.subarray(6, 9);
	He(t, s);
	let c = s[2] < .5, l = c ? 12 : 4.5;
	if (o[2] = c ? Math.sqrt(o[2]) : 1 - Math.sqrt(1 - o[2]), Ge(o, s, a) < l) {
		let e, t;
		for (c ? (e = o[2], t = 1) : (e = 0, t = o[2]); t - e > .005;) {
			let n = o[2] = (e + t) / 2;
			c === Ge(o, s, a) < l ? e = n : t = n;
		}
		o[2] = c ? t : e;
	}
	return Ue(o, a), r = q.makeHexColor(Math.round(a[0] * 255), Math.round(a[1] * 255), Math.round(a[2] * 255)), Ke.set(n, r), r;
}
function Je({ html: e, dir: t, className: n }, r) {
	let i = document.createDocumentFragment();
	if (typeof e == "string") {
		let n = document.createElement("p");
		n.dir = t || "auto";
		let r = e.split(/\r\n?|\n/);
		for (let e = 0, t = r.length; e < t; ++e) {
			let i = r[e];
			n.append(document.createTextNode(i)), e < t - 1 && n.append(document.createElement("br"));
		}
		i.append(n);
	} else ye.render({
		xfaHtml: e,
		div: i,
		intent: "richText"
	});
	i.firstElementChild.classList.add("richText", n), r.append(i);
}
function Ye(e) {
	let t = new Path2D();
	if (!e) return t;
	for (let n = 0, r = e.length; n < r;) switch (e[n++]) {
		case k.moveTo:
			t.moveTo(e[n++], e[n++]);
			break;
		case k.lineTo:
			t.lineTo(e[n++], e[n++]);
			break;
		case k.curveTo:
			t.bezierCurveTo(e[n++], e[n++], e[n++], e[n++], e[n++], e[n++]);
			break;
		case k.quadraticCurveTo:
			t.quadraticCurveTo(e[n++], e[n++], e[n++], e[n++]);
			break;
		case k.closePath:
			t.closePath();
			break;
		default: F(`Unrecognized drawing path operator: ${e[n - 1]}`);
	}
	return t;
}
var Xe = class e {
	#e = null;
	#t = null;
	#n;
	#r = null;
	#i = null;
	#a = null;
	#o = null;
	#s = null;
	static #c = null;
	constructor(t) {
		this.#n = t, e.#c ||= Object.freeze({
			freetext: "pdfjs-editor-remove-freetext-button",
			highlight: "pdfjs-editor-remove-highlight-button",
			ink: "pdfjs-editor-remove-ink-button",
			stamp: "pdfjs-editor-remove-stamp-button",
			signature: "pdfjs-editor-remove-signature-button"
		});
	}
	render() {
		let t = this.#e = document.createElement("div");
		t.classList.add("editToolbar", "hidden"), t.setAttribute("role", "toolbar");
		let n = this.#n._uiManager._signal;
		n instanceof AbortSignal && !n.aborted && (t.addEventListener("contextmenu", ke, { signal: n }), t.addEventListener("pointerdown", e.#l, { signal: n }));
		let r = this.#r = document.createElement("div");
		r.className = "buttons", t.append(r);
		let i = this.#n.toolbarPosition;
		if (i) {
			let { style: e } = t;
			e.insetInlineEnd = `${100 * (this.#n._uiManager.direction === "ltr" ? 1 - i[0] : i[0])}%`, e.top = `calc(${100 * i[1]}% + var(--editor-toolbar-vert-offset))`;
		}
		return t;
	}
	get div() {
		return this.#e;
	}
	static #l(e) {
		e.stopPropagation();
	}
	#u(e) {
		this.#n._focusEventsAllowed = !1, Ae(e);
	}
	#d(e) {
		this.#n._focusEventsAllowed = !0, Ae(e);
	}
	#f(e) {
		let t = this.#n._uiManager._signal;
		return !(t instanceof AbortSignal) || t.aborted ? !1 : (e.addEventListener("focusin", this.#u.bind(this), {
			capture: !0,
			signal: t
		}), e.addEventListener("focusout", this.#d.bind(this), {
			capture: !0,
			signal: t
		}), e.addEventListener("contextmenu", ke, { signal: t }), !0);
	}
	hide() {
		this.#e.classList.add("hidden"), this.#t?.hideDropdown();
	}
	show() {
		this.#e.classList.remove("hidden"), this.#i?.shown(), this.#a?.shown();
	}
	addDeleteButton() {
		let { editorType: t, _uiManager: n } = this.#n, r = document.createElement("button");
		r.classList.add("basic", "deleteButton"), r.tabIndex = 0, r.setAttribute("data-l10n-id", e.#c[t]), this.#f(r) && r.addEventListener("click", (e) => {
			n.delete();
		}, { signal: n._signal }), this.#r.append(r);
	}
	get #p() {
		let e = document.createElement("div");
		return e.className = "divider", e;
	}
	async addAltText(e) {
		let t = await e.render();
		this.#f(t), this.#r.append(t, this.#p), this.#i = e;
	}
	addComment(e, t = null) {
		if (this.#a) return;
		let n = e.renderForToolbar();
		if (!n) return;
		this.#f(n);
		let r = this.#o = this.#p;
		t ? (this.#r.insertBefore(n, t), this.#r.insertBefore(r, t)) : this.#r.append(n, r), this.#a = e, e.toolbar = this;
	}
	addColorPicker(e) {
		if (this.#t) return;
		this.#t = e;
		let t = e.renderButton();
		this.#f(t), this.#r.append(t, this.#p);
	}
	async addEditSignatureButton(e) {
		let t = this.#s = await e.renderEditButton(this.#n);
		t && (this.#f(t), this.#r.append(t, this.#p));
	}
	removeButton(e) {
		e === "comment" && (this.#a?.removeToolbarCommentButton(), this.#a = null, this.#o?.remove(), this.#o = null);
	}
	async addButton(e, t) {
		switch (e) {
			case "colorPicker":
				t && this.addColorPicker(t);
				break;
			case "altText":
				t && await this.addAltText(t);
				break;
			case "editSignature":
				t && await this.addEditSignatureButton(t);
				break;
			case "delete":
				this.addDeleteButton();
				break;
			case "comment": t && this.addComment(t);
		}
	}
	async addButtonBefore(e, t, n) {
		if (!t && e === "comment") return;
		let r = this.#r.querySelector(n);
		r && e === "comment" && this.addComment(t, r);
	}
	updateEditSignatureButton(e) {
		this.#s && (this.#s.title = e);
	}
	remove() {
		this.#e.remove(), this.#t?.destroy(), this.#t = null;
	}
}, Ze = class {
	#e = null;
	#t = null;
	#n;
	constructor(e) {
		this.#n = e;
	}
	#r() {
		let e = this.#t = document.createElement("div");
		e.className = "editToolbar", e.setAttribute("role", "toolbar"), e.dir = this.#n.direction;
		let t = this.#n._signal;
		t instanceof AbortSignal && !t.aborted && e.addEventListener("contextmenu", ke, { signal: t });
		let n = this.#e = document.createElement("div");
		return n.className = "buttons", e.append(n), this.#n.hasCommentManager() && this.#a("commentButton", "pdfjs-comment-floating-button", "pdfjs-comment-floating-button-label", () => {
			this.#n.commentSelection("floating_button");
		}), this.#a("highlightButton", "pdfjs-highlight-floating-button1", "pdfjs-highlight-floating-button-label", () => {
			this.#n.highlightSelection("floating_button");
		}), e;
	}
	#i(e, t) {
		let n = 0, r = 0;
		for (let i of e) {
			let e = i.y + i.height;
			if (e < n) continue;
			let a = i.x + (t ? i.width : 0);
			if (e > n) {
				r = a, n = e;
				continue;
			}
			t ? a > r && (r = a) : a < r && (r = a);
		}
		return [t ? 1 - r : r, n];
	}
	show(e, t, n) {
		let [r, i] = this.#i(t, n), { style: a } = this.#t ||= this.#r();
		e.append(this.#t), a.insetInlineEnd = `${100 * r}%`, a.top = `calc(${100 * i}% + var(--editor-toolbar-vert-offset))`;
	}
	hide() {
		this.#t.remove();
	}
	#a(e, t, n, r) {
		let i = document.createElement("button");
		i.classList.add("basic", e), i.tabIndex = 0, i.setAttribute("data-l10n-id", t);
		let a = document.createElement("span");
		i.append(a), a.className = "visuallyHidden", a.setAttribute("data-l10n-id", n);
		let o = this.#n._signal;
		o instanceof AbortSignal && !o.aborted && (i.addEventListener("contextmenu", ke, { signal: o }), i.addEventListener("click", r, { signal: o })), this.#e.append(i);
	}
}, Qe = Object.freeze({ internal: "2837668c-d334-48d1-ba74-aa7deba483da" });
function $e(e, t, n) {
	for (let r of n) t.addEventListener(r, e[r].bind(e));
}
var et = class e {
	static #e = NaN;
	static #t = null;
	static #n = NaN;
	static #r = null;
	static initializeAndAddPointerId(t) {
		(e.#t ||= /* @__PURE__ */ new Set()).add(t);
	}
	static setPointer(t, n) {
		e.#e ||= n, e.#r ??= t;
	}
	static setTimeStamp(t) {
		e.#n = t;
	}
	static isSamePointerId(t) {
		return e.#e === t;
	}
	static isSamePointerIdOrRemove(t) {
		return e.#e === t || (e.#t?.delete(t), !1);
	}
	static isSamePointerType(t) {
		return e.#r === t;
	}
	static isInitializedAndDifferentPointerType(t) {
		return e.#r !== null && !e.isSamePointerType(t);
	}
	static isSameTimeStamp(t) {
		return e.#n === t;
	}
	static isUsingMultiplePointers() {
		return e.#t?.size >= 1;
	}
	static clearPointerType() {
		e.#r = null;
	}
	static clearPointerIds() {
		e.#e = NaN, e.#t = null;
	}
	static clearTimeStamp() {
		e.#n = NaN;
	}
}, tt = class {
	#e = 0;
	get id() {
		return `${y}${this.#e++}`;
	}
}, nt = class e {
	#e = ue();
	#t = 0;
	#n = null;
	static get _isSVGFittingCanvas() {
		let e = `data:image/svg+xml;charset=UTF-8,<svg viewBox="0 0 1 1" width="1" height="1" xmlns="${h}"><rect width="1" height="1" style="fill:red;"/></svg>`, t = new OffscreenCanvas(1, 3).getContext("2d", { willReadFrequently: !0 }), n = new Image();
		n.src = e;
		let r = n.decode().then(() => (t.drawImage(n, 0, 0, 1, 1, 0, 0, 1, 3), new Uint32Array(t.getImageData(0, 0, 1, 1).data.buffer)[0] === 0));
		return H(this, "_isSVGFittingCanvas", r);
	}
	async #r(t, n) {
		this.#n ||= /* @__PURE__ */ new Map();
		let r = this.#n.get(t);
		if (r === null) return null;
		if (r?.bitmap) return r.refCounter += 1, r;
		try {
			r ||= {
				bitmap: null,
				id: `image_${this.#e}_${this.#t++}`,
				refCounter: 0,
				isSvg: !1
			};
			let t;
			if (typeof n == "string" ? (r.url = n, t = await xe(n, "blob")) : n instanceof File ? t = r.file = n : n instanceof Blob && (t = n), t.type === "image/svg+xml") {
				let n = e._isSVGFittingCanvas, i = new FileReader(), a = new Image(), o = new Promise((e, t) => {
					a.onload = () => {
						r.bitmap = a, r.isSvg = !0, e();
					}, i.onload = async () => {
						let e = r.svgUrl = i.result;
						a.src = await n ? `${e}#svgView(preserveAspectRatio(none))` : e;
					}, a.onerror = i.onerror = t;
				});
				i.readAsDataURL(t), await o;
			} else r.bitmap = await createImageBitmap(t);
			r.refCounter = 1;
		} catch (e) {
			F(e), r = null;
		}
		return this.#n.set(t, r), r && this.#n.set(r.id, r), r;
	}
	async getFromFile(e) {
		let { lastModified: t, name: n, size: r, type: i } = e;
		return this.#r(`${t}_${n}_${r}_${i}`, e);
	}
	async getFromUrl(e) {
		return this.#r(e, e);
	}
	async getFromBlob(e, t) {
		let n = await t;
		return this.#r(e, n);
	}
	async getFromId(e) {
		this.#n ||= /* @__PURE__ */ new Map();
		let t = this.#n.get(e);
		if (!t) return null;
		if (t.bitmap) return t.refCounter += 1, t;
		if (t.file) return this.getFromFile(t.file);
		if (t.blobPromise) {
			let { blobPromise: e } = t;
			return delete t.blobPromise, this.getFromBlob(t.id, e);
		}
		return this.getFromUrl(t.url);
	}
	getFromCanvas(e, t) {
		this.#n ||= /* @__PURE__ */ new Map();
		let n = this.#n.get(e);
		if (n?.bitmap) return n.refCounter += 1, n;
		let r = new OffscreenCanvas(t.width, t.height);
		return r.getContext("2d").drawImage(t, 0, 0), n = {
			bitmap: r.transferToImageBitmap(),
			id: `image_${this.#e}_${this.#t++}`,
			refCounter: 1,
			isSvg: !1
		}, this.#n.set(e, n), this.#n.set(n.id, n), n;
	}
	getSvgUrl(e) {
		let t = this.#n.get(e);
		return t?.isSvg ? t.svgUrl : null;
	}
	deleteId(e) {
		this.#n ||= /* @__PURE__ */ new Map();
		let t = this.#n.get(e);
		if (!t || (--t.refCounter, t.refCounter !== 0)) return;
		let { bitmap: n } = t;
		if (!t.url && !t.file) {
			let e = new OffscreenCanvas(n.width, n.height);
			e.getContext("bitmaprenderer").transferFromImageBitmap(n), t.blobPromise = e.convertToBlob();
		}
		n.close?.(), t.bitmap = null;
	}
	isValidId(e) {
		return e.startsWith(`image_${this.#e}_`);
	}
}, rt = class {
	#e = [];
	#t = !1;
	#n;
	#r = -1;
	constructor(e = 128) {
		this.#n = e;
	}
	add({ cmd: e, undo: t, post: n, mustExec: r, type: i = NaN, overwriteIfSameType: a = !1, keepUndo: o = !1 }) {
		if (r && e(), this.#t) return;
		let s = {
			cmd: e,
			undo: t,
			post: n,
			type: i
		};
		if (this.#r === -1) {
			this.#e.length > 0 && (this.#e.length = 0), this.#r = 0, this.#e.push(s);
			return;
		}
		if (a && this.#e[this.#r].type === i) {
			o && (s.undo = this.#e[this.#r].undo), this.#e[this.#r] = s;
			return;
		}
		let c = this.#r + 1;
		c === this.#n ? this.#e.splice(0, 1) : (this.#r = c, c < this.#e.length && this.#e.splice(c)), this.#e.push(s);
	}
	undo() {
		if (this.#r === -1) return;
		this.#t = !0;
		let { undo: e, post: t } = this.#e[this.#r];
		e(), t?.(), this.#t = !1, --this.#r;
	}
	redo() {
		if (this.#r < this.#e.length - 1) {
			this.#r += 1, this.#t = !0;
			let { cmd: e, post: t } = this.#e[this.#r];
			e(), t?.(), this.#t = !1;
		}
	}
	hasSomethingToUndo() {
		return this.#r !== -1;
	}
	hasSomethingToRedo() {
		return this.#r < this.#e.length - 1;
	}
	cleanType(e) {
		if (this.#r !== -1) {
			for (let t = this.#r; t >= 0; t--) if (this.#e[t].type !== e) {
				this.#e.splice(t + 1, this.#r - t), this.#r = t;
				return;
			}
			this.#e.length = 0, this.#r = -1;
		}
	}
	destroy() {
		this.#e = null;
	}
}, it = class e {
	static ALT = 1;
	static CTRL = 2;
	static META = 4;
	static SHIFT = 8;
	constructor(t) {
		this.callbacks = /* @__PURE__ */ new Map();
		let { isMac: n } = K.platform;
		for (let [r, i, a = {}] of t) {
			let t = r.some((e) => e.startsWith("mac+"));
			for (let o of r) {
				let r = o;
				if (t) {
					let e = o.startsWith("mac+");
					if (n !== e) continue;
					e && (r = o.slice(4));
				}
				let [s, c] = e.#e(r);
				s !== null && this.callbacks.getOrInsertComputed(s, fe).push({
					callback: i,
					options: a,
					modifiers: c
				});
			}
		}
	}
	static #e(t) {
		let n = null, r = 0;
		for (let i of t.split("+")) {
			if (i = i.trim(), !i) continue;
			let a = i.toUpperCase(), o = e[a];
			if (o) {
				r |= o;
				continue;
			}
			if (n !== null) {
				F(`KeyboardManager: multiple keys in shortcut "${t}"`);
				break;
			}
			n = a === "SPACE" ? " " : i;
		}
		return n === null && F(`KeyboardManager: no key found in shortcut "${t}"`), [n, r];
	}
	static #t(e) {
		let t = /^(?:Key([A-Z])|(?:Digit|Numpad)(\d))$/.exec(e);
		return t ? t[1]?.toLowerCase() ?? t[2] : null;
	}
	exec(t, n) {
		let r = this.callbacks.get(n.key);
		if (!r) {
			if (/^[a-z]$/i.test(n.key)) return;
			let t = e.#t(n.code);
			if (t === null || t === n.key || (r = this.callbacks.get(t), !r)) return;
		}
		let i = (n.altKey ? e.ALT : 0) | (n.ctrlKey ? e.CTRL : 0) | (n.metaKey ? e.META : 0) | (n.shiftKey ? e.SHIFT : 0), a = r.find((e) => e.modifiers === i);
		if (!a) return;
		let { callback: o, options: { bubbles: s = !1, args: c = [], checker: l = null } } = a;
		(!l || l(t, n)) && (o.bind(t, ...c, n)(), s || Ae(n));
	}
}, at = class e {
	static _colorsMapping = /* @__PURE__ */ new Map([["CanvasText", [
		0,
		0,
		0
	]], ["Canvas", [
		255,
		255,
		255
	]]]);
	get _colors() {
		let e = /* @__PURE__ */ new Map([["CanvasText", null], ["Canvas", null]]);
		return Pe(e), H(this, "_colors", e);
	}
	convert(t) {
		let n = Ne(t);
		if (!window.matchMedia("(forced-colors: active)").matches) return n;
		for (let [t, r] of this._colors) if (r.every((e, t) => e === n[t])) return e._colorsMapping.get(t);
		return n;
	}
	getHexCode(e) {
		let t = this._colors.get(e);
		return t ? q.makeHexColor(...t) : e;
	}
}, ot = class e {
	#e = new AbortController();
	#t = null;
	#n = null;
	#r = /* @__PURE__ */ new Map();
	#i = /* @__PURE__ */ new Map();
	#a = null;
	#o = null;
	#s = null;
	#c = null;
	#l = null;
	#u = new rt();
	#d = null;
	#f = null;
	#p = null;
	#m = 0;
	#h = /* @__PURE__ */ new Set();
	#g = null;
	#_ = null;
	#v = /* @__PURE__ */ new Set();
	_editorUndoBar = null;
	#y = !1;
	#b = !1;
	#x = !1;
	#S = null;
	#C = null;
	#w = null;
	#T = null;
	#E = !1;
	#D = null;
	#O = new tt();
	#k = !1;
	#A = !1;
	#j = !1;
	#M = null;
	#N = null;
	#P = null;
	#F = null;
	#I = null;
	#L = b.NONE;
	#R = /* @__PURE__ */ new Set();
	#z = null;
	#B = null;
	#V = null;
	#H = null;
	#U = null;
	#W = {
		isEditing: !1,
		isEmpty: !0,
		hasSomethingToUndo: !1,
		hasSomethingToRedo: !1,
		hasSelectedEditor: !1,
		hasSelectedText: !1
	};
	#G = [0, 0];
	#K = null;
	#q = null;
	#J = null;
	#Y = null;
	#X = null;
	static TRANSLATE_SMALL = 1;
	static TRANSLATE_BIG = 10;
	static get _keyboardManager() {
		let t = e.prototype, n = (e) => e.#q.contains(document.activeElement) && document.activeElement.tagName !== "BUTTON" && e.hasSomethingToControl(), r = (e, { target: t }) => {
			if (t instanceof HTMLInputElement) {
				let { type: e } = t;
				return e !== "text" && e !== "number";
			}
			return !0;
		}, i = this.TRANSLATE_SMALL, a = this.TRANSLATE_BIG;
		return H(this, "_keyboardManager", new it([
			[
				["ctrl+a", "mac+meta+a"],
				t.selectAll,
				{ checker: r }
			],
			[
				["ctrl+z", "mac+meta+z"],
				t.undo,
				{ checker: r }
			],
			[
				[
					"ctrl+y",
					"ctrl+shift+z",
					"mac+meta+shift+z",
					"ctrl+shift+Z",
					"mac+meta+shift+Z"
				],
				t.redo,
				{ checker: r }
			],
			[
				[
					"Backspace",
					"alt+Backspace",
					"ctrl+Backspace",
					"shift+Backspace",
					"mac+Backspace",
					"mac+alt+Backspace",
					"mac+ctrl+Backspace",
					"Delete",
					"ctrl+Delete",
					"shift+Delete",
					"mac+Delete"
				],
				t.delete,
				{ checker: r }
			],
			[
				["Enter"],
				t.addNewEditorFromKeyboard,
				{ checker: (e, { target: t }) => !(t instanceof HTMLButtonElement) && e.#q.contains(t) && !e.isEnterHandled }
			],
			[
				["Space"],
				t.addNewEditorFromKeyboard,
				{ checker: (e, { target: t }) => !(t instanceof HTMLButtonElement) && e.#q.contains(document.activeElement) }
			],
			[["Escape"], t.unselectAll],
			[
				["ArrowLeft"],
				t.translateSelectedEditors,
				{
					args: [-i, 0],
					checker: n
				}
			],
			[
				["ctrl+ArrowLeft", "mac+shift+ArrowLeft"],
				t.translateSelectedEditors,
				{
					args: [-a, 0],
					checker: n
				}
			],
			[
				["ArrowRight"],
				t.translateSelectedEditors,
				{
					args: [i, 0],
					checker: n
				}
			],
			[
				["ctrl+ArrowRight", "mac+shift+ArrowRight"],
				t.translateSelectedEditors,
				{
					args: [a, 0],
					checker: n
				}
			],
			[
				["ArrowUp"],
				t.translateSelectedEditors,
				{
					args: [0, -i],
					checker: n
				}
			],
			[
				["ctrl+ArrowUp", "mac+shift+ArrowUp"],
				t.translateSelectedEditors,
				{
					args: [0, -a],
					checker: n
				}
			],
			[
				["ArrowDown"],
				t.translateSelectedEditors,
				{
					args: [0, i],
					checker: n
				}
			],
			[
				["ctrl+ArrowDown", "mac+shift+ArrowDown"],
				t.translateSelectedEditors,
				{
					args: [0, a],
					checker: n
				}
			]
		]));
	}
	constructor(e, t, n, r, i, a, o, s, c, l, u, d, f, p, m, h) {
		let g = this._signal = this.#e.signal;
		this.#q = e, this.#J = t, this.#Y = n, this.#s = r, this.#d = i, this.#B = a, this.#U = s, this._eventBus = o;
		let _ = {
			signal: g,
			...Qe
		};
		o.on("editingaction", this.onEditingAction.bind(this), _), o.on("pagechanging", this.onPageChanging.bind(this), _), o.on("scalechanging", this.onScaleChanging.bind(this), _), o.on("rotationchanging", this.onRotationChanging.bind(this), _), o.on("setpreference", this.onSetPreference.bind(this), _), o.on("switchannotationeditorparams", (e) => this.updateParams(e.type, e.value), _), window.addEventListener("pointerdown", () => {
			this.#A = !0;
		}, {
			capture: !0,
			signal: g
		}), window.addEventListener("pointerup", () => {
			this.#A = !1;
		}, {
			capture: !0,
			signal: g
		}), window.addEventListener("beforeunload", this.endCurrentEditing.bind(this), {
			capture: !0,
			signal: g
		}), this.#ne(), this.#le(), this.#ae(), this.#c = s.annotationStorage, this.#S = s.filterFactory, this.#V = c, this.#T = l || null, this.#y = u, this.#b = d, this.#x = f, this.#I = p || null, this.viewParameters = {
			realScale: be.PDF_TO_CSS_UNITS,
			rotation: 0
		}, this.isShiftKeyDown = !1, this._editorUndoBar = m || null, this._supportsPinchToZoom = h !== !1, i?.setSidebarUiManager(this);
	}
	destroy() {
		this.#X?.resolve(), this.#X = null, this.#e?.abort(), this.#e = null, this._signal = null;
		for (let e of this.#i.values()) e.destroy();
		this.#i.clear(), this.#r.clear(), this.#v.clear(), this.#F?.clear(), this.#t = null, this.#R.clear(), this.#u.destroy(), this.#s?.destroy(), this.#d?.destroy(), this.#B?.destroy(), this.#D?.hide(), this.#D = null, this.#P?.destroy(), this.#P = null, this.#n = null, this.#C &&= (clearTimeout(this.#C), null), this.#K &&= (clearTimeout(this.#K), null), this._editorUndoBar?.destroy(), this.#U = null;
	}
	combinedSignal(e) {
		return AbortSignal.any([this._signal, e.signal]);
	}
	get mlManager() {
		return this.#I;
	}
	get useNewAltTextFlow() {
		return this.#b;
	}
	get useNewAltTextWhenAddingImage() {
		return this.#x;
	}
	get hcmFilter() {
		return H(this, "hcmFilter", this.#V ? this.#S.addHCMFilter(this.#V.foreground, this.#V.background) : "none");
	}
	get direction() {
		return H(this, "direction", getComputedStyle(this.#q).direction);
	}
	get _highlightColors() {
		return H(this, "_highlightColors", this.#T ? new Map(this.#T.split(",").map((e) => (e = e.split("=").map((e) => e.trim()), e[1] = e[1].toUpperCase(), e))) : null);
	}
	get highlightColors() {
		let { _highlightColors: e } = this;
		if (!e) return H(this, "highlightColors", null);
		let t = /* @__PURE__ */ new Map(), n = !!this.#V;
		for (let [r, i] of e) {
			let e = r.endsWith("_HCM");
			if (n && e) {
				t.set(r.replace("_HCM", ""), i);
				continue;
			}
			!n && !e && t.set(r, i);
		}
		return H(this, "highlightColors", t);
	}
	get highlightColorNames() {
		return H(this, "highlightColorNames", this.highlightColors ? new Map(Array.from(this.highlightColors, (e) => e.reverse())) : null);
	}
	getNonHCMColor(e) {
		if (!this._highlightColors) return e;
		let t = this.highlightColorNames.get(e);
		return this._highlightColors.get(t) || e;
	}
	getNonHCMColorName(e) {
		return this.highlightColorNames.get(e) || e;
	}
	setCurrentDrawingSession(e) {
		e ? (this.unselectAll(), this.disableUserSelect(!0)) : this.disableUserSelect(!1), this.#p = e;
	}
	setMainHighlightColorPicker(e) {
		this.#P = e;
	}
	editAltText(e, t = !1) {
		this.#s?.editAltText(this, e, t);
	}
	hasCommentManager() {
		return !!this.#d;
	}
	editComment(e, t, n, r) {
		this.#d?.showDialog(this, e, t, n, r);
	}
	selectComment(e, t) {
		(this.#i.get(e)?.getEditorByUID(t))?.toggleComment(!0, !0);
	}
	updateComment(e) {
		this.#d?.updateComment(e.getData());
	}
	updatePopupColor(e) {
		this.#d?.updatePopupColor(e);
	}
	removeComment(e) {
		this.#d?.removeComments([e.uid]);
	}
	deleteComment(e, t) {
		let n = () => {
			e.comment = t;
		};
		this.addCommands({
			cmd: () => {
				this._editorUndoBar?.show(n, "comment"), this.toggleComment(null), e.comment = null;
			},
			undo: n,
			mustExec: !0
		});
	}
	toggleComment(e, t, n = void 0) {
		this.#d?.toggleCommentPopup(e, t, n);
	}
	makeCommentColor(e, t) {
		return e && this.#d?.makeCommentColor(e, t) || null;
	}
	getCommentDialogElement() {
		return this.#d?.dialogElement || null;
	}
	async waitForEditorsRendered(e) {
		if (this.#i.has(e - 1)) return;
		let { resolve: t, promise: n } = Promise.withResolvers(), r = (n) => {
			n.pageNumber === e && (this._eventBus.off("editorsrendered", r), t());
		};
		this._eventBus.on("editorsrendered", r, Qe), await n;
	}
	getSignature(e) {
		this.#B?.getSignature({
			uiManager: this,
			editor: e
		});
	}
	get signatureManager() {
		return this.#B;
	}
	switchToMode(e, t) {
		this._eventBus.on("annotationeditormodechanged", t, {
			once: !0,
			signal: this._signal,
			...Qe
		}), this._eventBus.dispatch("showannotationeditorui", {
			source: this,
			mode: e
		});
	}
	setPreference(e, t) {
		this._eventBus.dispatch("setpreference", {
			source: this,
			name: e,
			value: t
		});
	}
	onSetPreference({ name: e, value: t }) {
		e === "enableNewAltTextWhenAddingImage" && (this.#x = t);
	}
	onPageChanging({ pageNumber: e }) {
		this.#m = e - 1;
	}
	deletePage(e) {
		for (let t of this.getEditors(e)) t.remove();
		this.#i.delete(e), this.#m === e && (this.#m = 0);
	}
	focusMainContainer() {
		this.#q.focus();
	}
	findParent(e, t) {
		for (let n of this.#i.values()) {
			let { x: r, y: i, width: a, height: o } = n.div.getBoundingClientRect();
			if (e >= r && e <= r + a && t >= i && t <= i + o) return n;
		}
		return null;
	}
	disableUserSelect(e = !1) {
		this.#J.classList.toggle("noUserSelect", e);
	}
	addShouldRescale(e) {
		this.#v.add(e);
	}
	removeShouldRescale(e) {
		this.#v.delete(e);
	}
	onScaleChanging({ scale: e }) {
		this.commitOrRemove(), this.viewParameters.realScale = e * be.PDF_TO_CSS_UNITS;
		for (let e of this.#v) e.onScaleChanging();
		this.#p?.onScaleChanging();
	}
	onRotationChanging({ pagesRotation: e }) {
		this.commitOrRemove(), this.viewParameters.rotation = e;
	}
	#Z({ anchorNode: e }) {
		return e.nodeType === Node.TEXT_NODE ? e.parentElement : e;
	}
	#Q(e) {
		let { currentLayer: t } = this;
		if (t.hasTextLayer(e)) return t;
		for (let t of this.#i.values()) if (t.hasTextLayer(e)) return t;
		return null;
	}
	highlightSelection(e = "", t = !1) {
		let n = document.getSelection();
		if (!n || n.isCollapsed) return;
		let { anchorNode: r, anchorOffset: i, focusNode: a, focusOffset: o } = n, s = n.toString(), c = this.#Z(n).closest(".textLayer"), l = this.getSelectionBoxes(c);
		if (!l) return;
		n.empty();
		let u = this.#Q(c), d = this.#L === b.NONE, f = () => {
			let n = u?.createAndAddNewEditor({
				x: 0,
				y: 0
			}, !1, {
				methodOfCreation: e,
				boxes: l,
				anchorNode: r,
				anchorOffset: i,
				focusNode: a,
				focusOffset: o,
				text: s
			});
			d && this.showAllEditors("highlight", !0, !0), t && n?.editComment();
		};
		if (d) {
			this.switchToMode(b.HIGHLIGHT, f);
			return;
		}
		f();
	}
	commentSelection(e = "") {
		this.highlightSelection(e, !0);
	}
	endCurrentEditing() {
		this.commitOrRemove(), this.currentLayer?.endDrawingSession(!1);
	}
	#$() {
		let e = document.getSelection();
		if (!e || e.isCollapsed) return;
		let t = this.#Z(e).closest(".textLayer"), n = this.getSelectionBoxes(t);
		n && (this.#D ||= new Ze(this), this.#D.show(t, n, this.direction === "ltr"));
	}
	getAndRemoveDataFromAnnotationStorage(e) {
		if (!this.#c) return null;
		let t = `${y}${e}`, n = this.#c.getRawValue(t);
		return n && this.#c.remove(t), n;
	}
	addToAnnotationStorage(e) {
		!e.isEmpty() && this.#c && !this.#c.has(e.id) && this.#c.setValue(e.id, e);
	}
	a11yAlert(e, t = null) {
		let n = this.#Y;
		n && (n.setAttribute("data-l10n-id", e), t ? n.setAttribute("data-l10n-args", JSON.stringify(t)) : n.removeAttribute("data-l10n-args"));
	}
	#ee() {
		let e = document.getSelection();
		if (!e || e.isCollapsed) {
			this.#z && (this.#D?.hide(), this.#z = null, this.#ue({ hasSelectedText: !1 }));
			return;
		}
		let { anchorNode: t } = e;
		if (t === this.#z) return;
		let n = this.#Z(e).closest(".textLayer");
		if (!n) {
			this.#z && (this.#D?.hide(), this.#z = null, this.#ue({ hasSelectedText: !1 }));
			return;
		}
		if (this.#D?.hide(), this.#z = t, this.#ue({ hasSelectedText: !0 }), (this.#L === b.HIGHLIGHT || this.#L === b.NONE) && (this.#L === b.HIGHLIGHT && this.showAllEditors("highlight", !0, !0), this.#E = this.isShiftKeyDown, !this.isShiftKeyDown)) {
			let e = this.#L === b.HIGHLIGHT ? this.#Q(n) : null;
			if (e?.toggleDrawing(), this.#A) {
				let t = new AbortController(), n = this.combinedSignal(t), r = (n) => {
					(n.type !== "pointerup" || n.button === 0) && (t.abort(), e?.toggleDrawing(!0), n.type === "pointerup" && this.#te("main_toolbar"));
				};
				window.addEventListener("pointerup", r, { signal: n }), window.addEventListener("blur", r, { signal: n });
			} else e?.toggleDrawing(!0), this.#te("main_toolbar");
		}
	}
	#te(e = "") {
		this.#L === b.HIGHLIGHT ? this.highlightSelection(e) : this.#y && this.#$();
	}
	#ne() {
		document.addEventListener("selectionchange", this.#ee.bind(this), { signal: this._signal });
	}
	#re() {
		if (this.#w) return;
		this.#w = new AbortController();
		let e = this.combinedSignal(this.#w);
		window.addEventListener("focus", this.focus.bind(this), { signal: e }), window.addEventListener("blur", this.blur.bind(this), { signal: e });
	}
	#ie() {
		this.#w?.abort(), this.#w = null;
	}
	blur() {
		if (this.isShiftKeyDown = !1, this.#E && (this.#E = !1, this.#te("main_toolbar")), !this.hasSelection) return;
		let { activeElement: e } = document;
		for (let t of this.#R) if (t.div.contains(e)) {
			this.#N = [t, e], t._focusEventsAllowed = !1;
			break;
		}
	}
	focus() {
		if (!this.#N) return;
		let [e, t] = this.#N;
		this.#N = null, t.addEventListener("focusin", () => {
			e._focusEventsAllowed = !0;
		}, {
			once: !0,
			signal: this._signal
		}), t.focus();
	}
	#ae() {
		if (this.#M) return;
		this.#M = new AbortController();
		let e = this.combinedSignal(this.#M);
		window.addEventListener("keydown", this.keydown.bind(this), { signal: e }), window.addEventListener("keyup", this.keyup.bind(this), { signal: e });
	}
	#oe() {
		this.#M?.abort(), this.#M = null;
	}
	#se() {
		if (this.#f) return;
		this.#f = new AbortController();
		let e = this.combinedSignal(this.#f);
		document.addEventListener("copy", this.copy.bind(this), { signal: e }), document.addEventListener("cut", this.cut.bind(this), { signal: e }), document.addEventListener("paste", this.paste.bind(this), { signal: e });
	}
	#ce() {
		this.#f?.abort(), this.#f = null;
	}
	#le() {
		let e = this._signal;
		document.addEventListener("dragover", this.dragOver.bind(this), { signal: e }), document.addEventListener("drop", this.drop.bind(this), { signal: e });
	}
	addEditListeners() {
		this.#ae(), this.setEditingState(!0);
	}
	removeEditListeners() {
		this.#oe(), this.setEditingState(!1);
	}
	dragOver(e) {
		for (let { type: t } of e.dataTransfer.items) for (let n of this.#_) if (n.isHandlingMimeForPasting(t)) {
			e.dataTransfer.dropEffect = "copy", e.preventDefault();
			return;
		}
	}
	drop(e) {
		for (let t of e.dataTransfer.items) for (let n of this.#_) if (n.isHandlingMimeForPasting(t.type)) {
			n.paste(t, this.currentLayer), e.preventDefault();
			return;
		}
	}
	copy(e) {
		if (e.preventDefault(), this.#t?.commitOrRemove(), !this.hasSelection) return;
		let t = [];
		for (let e of this.#R) {
			let n = e.serialize(!0);
			n && t.push(n);
		}
		t.length !== 0 && e.clipboardData.setData("application/pdfjs", JSON.stringify(t));
	}
	cut(e) {
		this.copy(e), this.delete();
	}
	async paste(e) {
		e.preventDefault();
		let { clipboardData: t } = e;
		for (let e of t.items) for (let t of this.#_) if (t.isHandlingMimeForPasting(e.type)) {
			t.paste(e, this.currentLayer);
			return;
		}
		let n = t.getData("application/pdfjs");
		if (!n) return;
		try {
			n = JSON.parse(n);
		} catch (e) {
			F(`paste: "${e.message}".`);
			return;
		}
		if (!Array.isArray(n)) return;
		this.unselectAll();
		let r = this.currentLayer;
		try {
			let e = [];
			for (let t of n) {
				let n = await r.deserialize(t);
				if (!n) return;
				e.push(n);
			}
			this.addCommands({
				cmd: () => {
					for (let t of e) this.#me(t);
					this.#_e(e);
				},
				undo: () => {
					for (let t of e) t.remove();
				},
				mustExec: !0
			});
		} catch (e) {
			F(`paste: "${e.message}".`);
		}
	}
	keydown(t) {
		!this.isShiftKeyDown && t.key === "Shift" && (this.isShiftKeyDown = !0), this.#L !== b.NONE && !this.isEditorHandlingKeyboard && e._keyboardManager.exec(this, t);
	}
	keyup(e) {
		this.isShiftKeyDown && e.key === "Shift" && (this.isShiftKeyDown = !1, this.#E && (this.#E = !1, this.#te("main_toolbar")));
	}
	onEditingAction({ name: e }) {
		switch (e) {
			case "undo":
			case "redo":
			case "delete":
			case "selectAll":
				this[e]();
				break;
			case "highlightSelection":
				this.highlightSelection("context_menu");
				break;
			case "commentSelection": this.commentSelection("context_menu");
		}
	}
	updatePageIndex(e, t) {
		for (let n of this.#o.get(e) || []) n.pageIndex = t;
		let n = this.#a.get(e);
		n && (n.pageIndex = t, this.#i.set(t, n), this.#k ? n.enable() : n.disable());
	}
	startUpdatePages() {
		this.#a = new Map(this.#i), this.#i.clear();
		let e = this.#o = /* @__PURE__ */ new Map(), t = (t) => {
			e.getOrInsertComputed(t.pageIndex, fe).push(t);
		};
		for (let e of this.#r.values()) t(e);
		for (let [e, n] of this.#c) e.startsWith(y) && !this.#r.has(e) && Number.isInteger(n?.pageIndex) && t(n);
	}
	endUpdatePages() {
		this.#a = null, this.#o = null;
	}
	clonePage(e, t) {
		for (let n of this.getEditors(e)) {
			let e = n.serialize(n.mode !== b.HIGHLIGHT);
			e && (e.pageIndex = t, e.id = this.getId(), e.isClone = !0, delete e.popupRef, this.#c.setValue(e.id, e));
		}
	}
	findClonesForPage(e) {
		let t = [], { pageIndex: n } = e;
		for (let [r, i] of this.#c) i.pageIndex === n && i.isClone && (this.#c.remove(r), t.push(e.deserialize(i).then((t) => {
			t && (t.isClone = !0, e.addOrRebuild(t));
		})));
		return Promise.all(t);
	}
	#ue(e) {
		Object.entries(e).some(([e, t]) => this.#W[e] !== t) && (this._eventBus.dispatch("editingstateschanged", {
			source: this,
			details: Object.assign(this.#W, e)
		}), this.#L === b.HIGHLIGHT && e.hasSelectedEditor === !1 && this.#de([[x.HIGHLIGHT_FREE, !0]]));
	}
	#de(e) {
		this._eventBus.dispatch("annotationeditorparamschanged", {
			source: this,
			details: e
		});
	}
	setEditingState(e) {
		e ? (this.#re(), this.#se(), this.#ue({
			isEditing: this.#L !== b.NONE,
			isEmpty: this.#ge(),
			hasSomethingToUndo: this.#u.hasSomethingToUndo(),
			hasSomethingToRedo: this.#u.hasSomethingToRedo(),
			hasSelectedEditor: !1
		})) : (this.#ie(), this.#ce(), this.#ue({ isEditing: !1 }), this.disableUserSelect(!1));
	}
	registerEditorTypes(e) {
		if (!this.#_) {
			this.#_ = e;
			for (let e of this.#_) this.#de(e.defaultPropertiesToUpdate);
		}
	}
	getId() {
		return this.#O.id;
	}
	get currentLayer() {
		return this.#i.get(this.#m);
	}
	getLayer(e) {
		return this.#i.get(e);
	}
	get currentPageIndex() {
		return this.#m;
	}
	addLayer(e) {
		this.#i.set(e.pageIndex, e), this.#k ? e.enable() : e.disable();
	}
	removeLayer(e) {
		this.#i.delete(e.pageIndex);
	}
	async updateMode(e, t = null, n = !1, r = !1, i = !1, a = !1) {
		if (this.#L !== e && !(this.#X && (await this.#X.promise, !this.#X))) {
			if (this.#X = Promise.withResolvers(), this.#p?.commitOrRemove(), this.#L === b.POPUP && this.#d?.hideSidebar(), this.#d?.destroyPopup(), this.#L = e, e === b.NONE) {
				this.setEditingState(!1), this.#pe();
				for (let e of this.#r.values()) e.hideStandaloneCommentButton();
				this._editorUndoBar?.hide(), this.toggleComment(null), this.#X.resolve();
				return;
			}
			for (let e of this.#r.values()) e.addStandaloneCommentButton();
			e === b.SIGNATURE && await this.#B?.loadSignatures(), n && et.clearPointerType(), this.setEditingState(!0), await this.#fe(), this.unselectAll();
			for (let t of this.#i.values()) t.updateMode(e);
			if (e === b.POPUP) {
				this.#n ||= await this.#U.getAnnotationsByType(new Set(this.#_.map((e) => e._editorType)));
				let e = /* @__PURE__ */ new Set(), t = [];
				for (let n of this.#r.values()) {
					let { annotationElementId: r, hasComment: i, deleted: a } = n;
					r && e.add(r), i && !a && t.push(n.getData());
				}
				for (let n of this.#n) {
					let { id: r, popupRef: i, contentsObj: a } = n;
					i && a?.str && !e.has(r) && !this.#h.has(r) && t.push(n);
				}
				this.#d?.showSidebar(t);
			}
			if (!t) {
				r && this.addNewEditorFromKeyboard(), this.#X.resolve();
				return;
			}
			for (let e of this.#r.values()) e.uid === t ? (this.setSelected(e), a ? e.editComment() : i ? e.enterInEditMode() : e.focus()) : e.unselect();
			this.#X.resolve();
		}
	}
	addNewEditorFromKeyboard() {
		this.currentLayer.canCreateNewEmptyEditor() && this.currentLayer.addNewEditor();
	}
	updateToolbar(e) {
		e.mode !== this.#L && this._eventBus.dispatch("switchannotationeditormode", {
			source: this,
			...e
		});
	}
	updateParams(e, t) {
		if (this.#_) {
			switch (e) {
				case x.CREATE:
					this.currentLayer.addNewEditor(t);
					return;
				case x.HIGHLIGHT_SHOW_ALL: this._eventBus.dispatch("reporttelemetry", {
					source: this,
					details: {
						type: "editing",
						data: {
							type: "highlight",
							action: "toggle_visibility"
						}
					}
				}), (this.#H ||= /* @__PURE__ */ new Map()).set(e, t), this.showAllEditors("highlight", t);
			}
			if (this.hasSelection) for (let n of this.#R) n.updateParams(e, t);
			else for (let n of this.#_) n.updateDefaultParams(e, t);
		}
	}
	showAllEditors(e, t, n = !1) {
		for (let n of this.#r.values()) n.editorType === e && n.show(t);
		(this.#H?.get(x.HIGHLIGHT_SHOW_ALL) ?? !0) !== t && this.#de([[x.HIGHLIGHT_SHOW_ALL, t]]);
	}
	enableWaiting(e = !1) {
		if (this.#j !== e) {
			this.#j = e;
			for (let t of this.#i.values()) e ? t.disableClick() : t.enableClick(), t.div.classList.toggle("waiting", e);
		}
	}
	async #fe() {
		if (!this.#k) {
			this.#k = !0;
			let e = [];
			for (let t of this.#i.values()) e.push(t.enable());
			await Promise.all(e);
			for (let e of this.#r.values()) e.enable();
		}
	}
	#pe() {
		if (this.unselectAll(), this.#k) {
			this.#k = !1;
			for (let e of this.#i.values()) e.disable();
			for (let e of this.#r.values()) e.disable();
		}
	}
	*getEditors(e) {
		for (let t of this.#r.values()) t.pageIndex === e && (yield t);
	}
	getEditor(e) {
		return this.#r.get(e);
	}
	addEditor(e) {
		this.#r.set(e.id, e);
	}
	removeEditor(e) {
		e.div.contains(document.activeElement) && (this.#C && clearTimeout(this.#C), this.#C = setTimeout(() => {
			this.focusMainContainer(), this.#C = null;
		}, 0)), this.#r.delete(e.id), e.annotationElementId && this.#F?.delete(e.annotationElementId), this.unselect(e), (!e.annotationElementId || !this.#h.has(e.annotationElementId)) && this.#c?.remove(e.id);
	}
	addDeletedAnnotationElement(e) {
		this.#h.add(e.annotationElementId), this.addChangedExistingAnnotation(e), e.deleted = !0;
	}
	isDeletedAnnotationElement(e) {
		return this.#h.has(e);
	}
	removeDeletedAnnotationElement(e) {
		this.#h.delete(e.annotationElementId), this.removeChangedExistingAnnotation(e), e.deleted = !1;
	}
	#me(e) {
		let t = this.#i.get(e.pageIndex);
		t ? t.addOrRebuild(e) : (this.addEditor(e), this.addToAnnotationStorage(e));
	}
	setActiveEditor(e) {
		this.#t !== e && (this.#t = e, e && this.#de(e.propertiesToUpdate));
	}
	get #he() {
		let e = null;
		for (e of this.#R);
		return e;
	}
	updateUI(e) {
		this.#he === e && this.#de(e.propertiesToUpdate);
	}
	updateUIForDefaultProperties(e) {
		this.#de(e.defaultPropertiesToUpdate);
	}
	toggleSelected(e) {
		if (this.#R.has(e)) {
			this.#R.delete(e), e.unselect(), this.#ue({ hasSelectedEditor: this.hasSelection });
			return;
		}
		this.#R.add(e), e.select(), this.#de(e.propertiesToUpdate), this.#ue({ hasSelectedEditor: !0 });
	}
	setSelected(e) {
		this.updateToolbar({
			mode: e.mode,
			editId: e.uid
		}), this.#p?.commitOrRemove();
		for (let t of this.#R) t !== e && t.unselect();
		this.#d?.destroyPopup(), this.#R.clear(), this.#R.add(e), e.select(), this.#de(e.propertiesToUpdate), this.#ue({ hasSelectedEditor: !0 });
	}
	get firstSelectedEditor() {
		return this.#R.values().next().value;
	}
	unselect(e) {
		e.unselect(), this.#R.delete(e), this.#ue({ hasSelectedEditor: this.hasSelection });
	}
	get hasSelection() {
		return this.#R.size !== 0;
	}
	get isEnterHandled() {
		return this.#R.size === 1 && this.firstSelectedEditor.isEnterHandled;
	}
	undo() {
		this.#u.undo(), this.#ue({
			hasSomethingToUndo: this.#u.hasSomethingToUndo(),
			hasSomethingToRedo: !0,
			isEmpty: this.#ge()
		}), this._editorUndoBar?.hide();
	}
	redo() {
		this.#u.redo(), this.#ue({
			hasSomethingToUndo: !0,
			hasSomethingToRedo: this.#u.hasSomethingToRedo(),
			isEmpty: this.#ge()
		});
	}
	addCommands(e) {
		this.#u.add(e), this.#ue({
			hasSomethingToUndo: !0,
			hasSomethingToRedo: !1,
			isEmpty: this.#ge()
		});
	}
	cleanUndoStack(e) {
		this.#u.cleanType(e);
	}
	#ge() {
		if (this.#r.size === 0) return !0;
		if (this.#r.size === 1) for (let e of this.#r.values()) return e.isEmpty();
		return !1;
	}
	delete() {
		this.commitOrRemove();
		let e = this.currentLayer?.endDrawingSession(!0);
		if (!this.hasSelection && !e) return;
		let t = e ? [e] : [...this.#R], n = () => {
			this._editorUndoBar?.show(r, t.length === 1 ? t[0].editorType : t.length);
			for (let e of t) e.remove();
		}, r = () => {
			for (let e of t) this.#me(e);
		};
		this.addCommands({
			cmd: n,
			undo: r,
			mustExec: !0
		});
	}
	commitOrRemove() {
		this.#t?.commitOrRemove();
	}
	hasSomethingToControl() {
		return this.#t || this.hasSelection;
	}
	#_e(e) {
		for (let e of this.#R) e.unselect();
		this.#R.clear();
		for (let t of e) t.isEmpty() || (this.#R.add(t), t.select());
		this.#ue({ hasSelectedEditor: this.hasSelection });
	}
	selectAll() {
		for (let e of this.#R) e.commit();
		this.#_e(this.#r.values());
	}
	unselectAll() {
		if (!(this.#t && (this.#t.commitOrRemove(), this.#L !== b.NONE)) && !this.#p?.commitOrRemove() && (this.#d?.destroyPopup(), this.hasSelection)) {
			for (let e of this.#R) e.unselect();
			this.#R.clear(), this.#ue({ hasSelectedEditor: !1 });
		}
	}
	translateSelectedEditors(e, t, n = !1) {
		if (n || this.commitOrRemove(), !this.hasSelection) return;
		this.#G[0] += e, this.#G[1] += t;
		let [r, i] = this.#G, a = [...this.#R];
		this.#K && clearTimeout(this.#K), this.#K = setTimeout(() => {
			this.#K = null, this.#G[0] = this.#G[1] = 0, this.addCommands({
				cmd: () => {
					for (let e of a) this.#r.has(e.id) && (e.translateInPage(r, i), e.translationDone());
				},
				undo: () => {
					for (let e of a) this.#r.has(e.id) && (e.translateInPage(-r, -i), e.translationDone());
				},
				mustExec: !1
			});
		}, 1e3);
		for (let n of a) n.translateInPage(e, t), n.translationDone();
	}
	setUpDragSession() {
		if (this.hasSelection) {
			this.disableUserSelect(!0), this.#g = /* @__PURE__ */ new Map();
			for (let e of this.#R) this.#g.set(e, {
				savedX: e.x,
				savedY: e.y,
				savedPageIndex: e.pageIndex,
				newX: 0,
				newY: 0,
				newPageIndex: -1
			});
		}
	}
	endDragSession() {
		if (!this.#g) return !1;
		this.disableUserSelect(!1);
		let e = this.#g;
		this.#g = null;
		let t = !1;
		for (let [{ x: n, y: r, pageIndex: i }, a] of e) a.newX = n, a.newY = r, a.newPageIndex = i, t ||= n !== a.savedX || r !== a.savedY || i !== a.savedPageIndex;
		if (!t) return !1;
		let n = (e, t, n, r) => {
			if (this.#r.has(e.id)) {
				let i = this.#i.get(r);
				i ? e._setParentAndPosition(i, t, n) : (e.pageIndex = r, e.x = t, e.y = n);
			}
		};
		return this.addCommands({
			cmd: () => {
				for (let [t, { newX: r, newY: i, newPageIndex: a }] of e) n(t, r, i, a);
			},
			undo: () => {
				for (let [t, { savedX: r, savedY: i, savedPageIndex: a }] of e) n(t, r, i, a);
			},
			mustExec: !0
		}), !0;
	}
	dragSelectedEditors(e, t) {
		if (this.#g) for (let n of this.#g.keys()) n.drag(e, t);
	}
	rebuild(e) {
		if (e.parent === null) {
			let t = this.getLayer(e.pageIndex);
			t ? (t.changeParent(e), t.addOrRebuild(e)) : (this.addEditor(e), this.addToAnnotationStorage(e), e.rebuild());
		} else e.parent.addOrRebuild(e);
	}
	get isEditorHandlingKeyboard() {
		return this.getActive()?.shouldGetKeyboardEvents() || this.#R.size === 1 && this.firstSelectedEditor.shouldGetKeyboardEvents();
	}
	isActive(e) {
		return this.#t === e;
	}
	getActive() {
		return this.#t;
	}
	getMode() {
		return this.#L;
	}
	isEditingMode() {
		return this.#L !== b.NONE;
	}
	get imageManager() {
		return H(this, "imageManager", new nt());
	}
	getSelectionBoxes(e) {
		if (!e) return null;
		let t = document.getSelection();
		for (let n = 0, r = t.rangeCount; n < r; n++) if (!e.contains(t.getRangeAt(n).commonAncestorContainer)) return null;
		let { x: n, y: r, width: i, height: a } = e.getBoundingClientRect(), o;
		switch (e.getAttribute("data-main-rotation")) {
			case "90":
				o = (e, t, o, s) => ({
					x: (t - r) / a,
					y: 1 - (e + o - n) / i,
					width: s / a,
					height: o / i
				});
				break;
			case "180":
				o = (e, t, o, s) => ({
					x: 1 - (e + o - n) / i,
					y: 1 - (t + s - r) / a,
					width: o / i,
					height: s / a
				});
				break;
			case "270":
				o = (e, t, o, s) => ({
					x: 1 - (t + s - r) / a,
					y: (e - n) / i,
					width: s / a,
					height: o / i
				});
				break;
			default: o = (e, t, o, s) => ({
				x: (e - n) / i,
				y: (t - r) / a,
				width: o / i,
				height: s / a
			});
		}
		let s = [];
		for (let e = 0, n = t.rangeCount; e < n; e++) {
			let n = t.getRangeAt(e);
			if (!n.collapsed) for (let { x: e, y: t, width: r, height: i } of n.getClientRects()) r !== 0 && i !== 0 && s.push(o(e, t, r, i));
		}
		return s.length === 0 ? null : s;
	}
	addChangedExistingAnnotation({ annotationElementId: e, id: t }) {
		(this.#l ||= /* @__PURE__ */ new Map()).set(e, t);
	}
	removeChangedExistingAnnotation({ annotationElementId: e }) {
		this.#l?.delete(e);
	}
	renderAnnotationElement(e) {
		let t = this.#l?.get(e.data.id);
		if (!t) return;
		let n = this.#c.getRawValue(t);
		n && (this.#L !== b.NONE || n.hasBeenModified) && n.renderAnnotationElement(e);
	}
	setMissingCanvas(e, t, n) {
		let r = this.#F?.get(e);
		r && (r.setCanvas(t, n), this.#F.delete(e));
	}
	addMissingCanvas(e, t) {
		(this.#F ||= /* @__PURE__ */ new Map()).set(e, t);
	}
}, st = class e {
	#e = null;
	#t = !1;
	#n = null;
	#r = null;
	#i = null;
	#a = null;
	#o = !1;
	#s = null;
	#c = null;
	#l = null;
	#u = null;
	#d = !1;
	static #f = null;
	static _l10n = null;
	constructor(t) {
		this.#c = t, this.#d = t._uiManager.useNewAltTextFlow, e.#f ||= Object.freeze({
			added: "pdfjs-editor-new-alt-text-added-button",
			"added-label": "pdfjs-editor-new-alt-text-added-button-label",
			missing: "pdfjs-editor-new-alt-text-missing-button",
			"missing-label": "pdfjs-editor-new-alt-text-missing-button-label",
			review: "pdfjs-editor-new-alt-text-to-review-button",
			"review-label": "pdfjs-editor-new-alt-text-to-review-button-label"
		});
	}
	static initialize(t) {
		e._l10n ??= t;
	}
	async render() {
		let t = this.#n = document.createElement("button");
		t.className = "altText", t.tabIndex = "0";
		let n = this.#r = document.createElement("span");
		t.append(n), this.#d ? (t.classList.add("new"), t.setAttribute("data-l10n-id", e.#f.missing), n.setAttribute("data-l10n-id", e.#f["missing-label"])) : (t.setAttribute("data-l10n-id", "pdfjs-editor-alt-text-button"), n.setAttribute("data-l10n-id", "pdfjs-editor-alt-text-button-label"));
		let r = this.#c._uiManager._signal;
		t.addEventListener("contextmenu", ke, { signal: r }), t.addEventListener("pointerdown", (e) => e.stopPropagation(), { signal: r });
		let i = (e) => {
			e.preventDefault(), this.#c._uiManager.editAltText(this.#c), this.#d && this.#c._reportTelemetry({
				action: "pdfjs.image.alt_text.image_status_label_clicked",
				data: { label: this.#p }
			});
		};
		return t.addEventListener("click", i, {
			capture: !0,
			signal: r
		}), t.addEventListener("keydown", (e) => {
			e.target === t && e.key === "Enter" && (this.#o = !0, i(e));
		}, { signal: r }), await this.#m(), t;
	}
	get #p() {
		return this.#e && "added" || this.#e === null && this.guessedText && "review" || "missing";
	}
	finish() {
		this.#n && (this.#n.focus({ focusVisible: this.#o }), this.#o = !1);
	}
	isEmpty() {
		return this.#d ? this.#e === null : !this.#e && !this.#t;
	}
	hasData() {
		return this.#d ? this.#e !== null || !!this.#l : this.isEmpty();
	}
	get guessedText() {
		return this.#l;
	}
	async setGuessedText(t) {
		this.#e === null && (this.#l = t, this.#u = await e._l10n.get("pdfjs-editor-new-alt-text-generated-alt-text-with-disclaimer", { generatedAltText: t }), this.#m());
	}
	toggleAltTextBadge(e = !1) {
		if (!this.#d || this.#e) {
			this.#s?.remove(), this.#s = null;
			return;
		}
		if (!this.#s) {
			let e = this.#s = document.createElement("div");
			e.className = "noAltTextBadge", this.#c.div.append(e);
		}
		this.#s.classList.toggle("hidden", !e);
	}
	serialize(e) {
		let t = this.#e;
		return !e && this.#l === t && (t = this.#u), {
			altText: t,
			decorative: this.#t,
			guessedText: this.#l,
			textWithDisclaimer: this.#u
		};
	}
	get data() {
		return {
			altText: this.#e,
			decorative: this.#t
		};
	}
	set data({ altText: e, decorative: t, guessedText: n, textWithDisclaimer: r, cancel: i = !1 }) {
		n && (this.#l = n, this.#u = r), (this.#e !== e || this.#t !== t) && (i || (this.#e = e, this.#t = t), this.#m());
	}
	toggle(e = !1) {
		this.#n && (!e && this.#a && (clearTimeout(this.#a), this.#a = null), this.#n.disabled = !e);
	}
	shown() {
		this.#c._reportTelemetry({
			action: "pdfjs.image.alt_text.image_status_label_displayed",
			data: { label: this.#p }
		});
	}
	destroy() {
		this.#n?.remove(), this.#n = null, this.#r = null, this.#i = null, this.#s?.remove(), this.#s = null;
	}
	async #m() {
		let t = this.#n;
		if (!t) return;
		if (this.#d) {
			if (t.classList.toggle("done", !!this.#e), t.setAttribute("data-l10n-id", e.#f[this.#p]), this.#r?.setAttribute("data-l10n-id", e.#f[`${this.#p}-label`]), !this.#e) {
				this.#i?.remove();
				return;
			}
		} else {
			if (!this.#e && !this.#t) {
				t.classList.remove("done"), this.#i?.remove();
				return;
			}
			t.classList.add("done"), t.setAttribute("data-l10n-id", "pdfjs-editor-alt-text-edit-button");
		}
		let n = this.#i;
		if (!n) {
			this.#i = n = document.createElement("span"), n.className = "tooltip", n.setAttribute("role", "tooltip"), n.id = `alt-text-tooltip-${this.#c.id}`;
			let e = this.#c._uiManager._signal;
			e.addEventListener("abort", () => {
				clearTimeout(this.#a), this.#a = null;
			}, { once: !0 }), t.addEventListener("mouseenter", () => {
				this.#a = setTimeout(() => {
					this.#a = null, this.#i.classList.add("show"), this.#c._reportTelemetry({ action: "alt_text_tooltip" });
				}, 100);
			}, { signal: e }), t.addEventListener("mouseleave", () => {
				this.#a &&= (clearTimeout(this.#a), null), this.#i?.classList.remove("show");
			}, { signal: e });
		}
		this.#t ? n.setAttribute("data-l10n-id", "pdfjs-editor-alt-text-decorative-tooltip") : (n.removeAttribute("data-l10n-id"), n.textContent = this.#e), n.parentNode || t.append(n), this.#c.getElementForAltText()?.setAttribute("aria-describedby", n.id);
	}
}, ct = class {
	#e = null;
	#t = null;
	#n = !1;
	#r = null;
	#i = null;
	#a = null;
	#o = null;
	#s = null;
	#c = !1;
	#l = null;
	constructor(e) {
		this.#r = e;
	}
	renderForToolbar() {
		let e = this.#t = document.createElement("button");
		return e.className = "comment", this.#u(e, !1);
	}
	renderForStandalone() {
		let e = this.#e = document.createElement("button");
		e.className = "annotationCommentButton";
		let t = this.#r.commentButtonPosition;
		if (t) {
			let { style: n } = e;
			n.insetInlineEnd = `calc(${100 * (this.#r._uiManager.direction === "ltr" ? 1 - t[0] : t[0])}% - var(--comment-button-dim))`, n.top = `calc(${100 * t[1]}% - var(--comment-button-dim))`;
			let r = this.#r.commentButtonColor;
			r && (n.backgroundColor = r);
		}
		return this.#u(e, !0);
	}
	focusButton() {
		setTimeout(() => {
			(this.#e ?? this.#t)?.focus();
		}, 0);
	}
	onUpdatedColor() {
		if (!this.#e) return;
		let e = this.#r.commentButtonColor;
		e && (this.#e.style.backgroundColor = e), this.#r._uiManager.updatePopupColor(this.#r);
	}
	get commentButtonWidth() {
		return (this.#e?.getBoundingClientRect().width ?? 0) / this.#r.parent.boundingClientRect.width;
	}
	get commentPopupPositionInLayer() {
		if (this.#l) return this.#l;
		if (!this.#e) return null;
		let { x: e, y: t, height: n } = this.#e.getBoundingClientRect(), { x: r, y: i, width: a, height: o } = this.#r.parent.boundingClientRect;
		return [(e - r) / a, (t + n - i) / o];
	}
	set commentPopupPositionInLayer(e) {
		this.#l = e;
	}
	hasDefaultPopupPosition() {
		return this.#l === null;
	}
	removeStandaloneCommentButton() {
		this.#e?.remove(), this.#e = null;
	}
	removeToolbarCommentButton() {
		this.#t?.remove(), this.#t = null;
	}
	setCommentButtonStates({ selected: e, hasPopup: t }) {
		this.#e && (this.#e.classList.toggle("selected", e), this.#e.ariaExpanded = t);
	}
	#u(e, t) {
		if (!this.#r._uiManager.hasCommentManager()) return null;
		e.tabIndex = "0", e.ariaHasPopup = "dialog", t ? (e.ariaControls = "commentPopup", e.setAttribute("data-l10n-id", "pdfjs-show-comment-button")) : (e.ariaControlsElements = [this.#r._uiManager.getCommentDialogElement()], e.setAttribute("data-l10n-id", "pdfjs-editor-add-comment-button"));
		let n = this.#r._uiManager._signal;
		if (!(n instanceof AbortSignal) || n.aborted) return e;
		e.addEventListener("contextmenu", ke, { signal: n }), t && (e.addEventListener("focusin", (e) => {
			this.#r._focusEventsAllowed = !1, Ae(e);
		}, {
			capture: !0,
			signal: n
		}), e.addEventListener("focusout", (e) => {
			this.#r._focusEventsAllowed = !0, Ae(e);
		}, {
			capture: !0,
			signal: n
		})), e.addEventListener("pointerdown", (e) => e.stopPropagation(), { signal: n });
		let r = (t) => {
			t.preventDefault(), e === this.#t ? this.edit() : this.#r.toggleComment(!0);
		};
		return e.addEventListener("click", r, {
			capture: !0,
			signal: n
		}), e.addEventListener("keydown", (t) => {
			t.target === e && t.key === "Enter" && (this.#n = !0, r(t));
		}, { signal: n }), e.addEventListener("pointerenter", () => {
			this.#r.toggleComment(!1, !0);
		}, { signal: n }), e.addEventListener("pointerleave", () => {
			this.#r.toggleComment(!1, !1);
		}, { signal: n }), e;
	}
	edit(e) {
		let t = this.commentPopupPositionInLayer, n, r;
		if (t) [n, r] = t;
		else {
			[n, r] = this.#r.commentButtonPosition;
			let { width: e, height: t, x: i, y: a } = this.#r;
			n = i + n * e, r = a + r * t;
		}
		let i = this.#r.parent.boundingClientRect, { x: a, y: o, width: s, height: c } = i;
		this.#r._uiManager.editComment(this.#r, a + n * s, o + r * c, {
			...e,
			parentDimensions: i
		});
	}
	finish() {
		this.#t && (this.#t.focus({ focusVisible: this.#n }), this.#n = !1);
	}
	isDeleted() {
		return this.#c || this.#o === "";
	}
	isEmpty() {
		return this.#o === null;
	}
	hasBeenEdited() {
		return this.isDeleted() || this.#o !== this.#i;
	}
	serialize() {
		return this.data;
	}
	get data() {
		return {
			text: this.#o,
			richText: this.#a,
			date: this.#s,
			deleted: this.isDeleted()
		};
	}
	set data(e) {
		if (e !== this.#o && (this.#a = null), e === null) {
			this.#o = "", this.#c = !0;
			return;
		}
		this.#o = e, this.#s = /* @__PURE__ */ new Date(), this.#c = !1;
	}
	restoreData({ text: e, richText: t, date: n }) {
		this.#o = e, this.#a = t, this.#s = n, this.#c = !1;
	}
	setInitialText(e, t = null) {
		this.#i = e, this.data = e, this.#s = null, this.#a = t;
	}
	shown() {}
	destroy() {
		this.#t?.remove(), this.#t = null, this.#e?.remove(), this.#e = null, this.#o = "", this.#a = null, this.#s = null, this.#r = null, this.#n = !1, this.#c = !1;
	}
};
function lt(e) {
	e.preventDefault();
}
var ut = 1e-4;
function dt(e) {
	return e.cancelable ? (Ae(e), !0) : (e.stopPropagation(), !1);
}
var ft = class {
	#e;
	#t = !1;
	#n = null;
	#r;
	#i;
	#a;
	#o;
	#s;
	#c = !1;
	#l = null;
	#u;
	#d = /* @__PURE__ */ new Set();
	#f = null;
	#p;
	#m = null;
	#h = 0;
	constructor({ container: e, isPinchingDisabled: t = null, isPinchingStopped: n = null, onPinchStart: r = null, onPinching: i = null, onPinchEnd: a = null, onPanning: o = null, signal: s }) {
		this.#e = e, this.#n = n, this.#r = t, this.#i = r, this.#a = i, this.#o = a, this.#s = o, this.#p = new AbortController(), this.#u = AbortSignal.any([s, this.#p.signal]), e.addEventListener("touchstart", this.#g.bind(this), {
			passive: !1,
			signal: this.#u
		});
	}
	get MIN_TOUCH_DISTANCE_TO_PINCH() {
		return 35 / Le.pixelRatio;
	}
	get MIN_TOUCH_DISTANCE_TO_SCALE() {
		return 4 / Le.pixelRatio;
	}
	#g(e) {
		if (this.#r?.()) return;
		this.#v(e);
		let t = this.#d;
		for (let { identifier: n } of e.changedTouches) t.add(n);
		if (t.size === 1) {
			this.#_();
			return;
		}
		if (!this.#m) {
			this.#m = new AbortController();
			let e = AbortSignal.any([this.#u, this.#m.signal]), t = this.#e, n = {
				signal: e,
				capture: !1,
				passive: !1
			};
			t.addEventListener("touchmove", this.#x.bind(this), n);
			let r = this.#S.bind(this);
			t.addEventListener("touchend", r, n), t.addEventListener("touchcancel", r, n), n.capture = !0, t.addEventListener("pointerdown", Ae, n), t.addEventListener("pointermove", Ae, n), t.addEventListener("pointercancel", lt, n), t.addEventListener("pointerup", lt, n), this.#i?.();
		}
		this.#c = dt(e), this.#b(e);
	}
	#_() {
		if (this.#l) return;
		let e = this.#l = new AbortController(), t = AbortSignal.any([this.#u, e.signal]), n = this.#e, r = {
			capture: !0,
			signal: t,
			passive: !1
		}, i = (e) => {
			e.pointerType === "touch" && (this.#l?.abort(), this.#l = null);
		};
		n.addEventListener("pointerdown", (e) => {
			e.pointerType === "touch" && (Ae(e), i(e));
		}, r), n.addEventListener("pointerup", i, r), n.addEventListener("pointercancel", i, r);
	}
	#v(e) {
		let t = this.#d;
		if (t.size === 0) return;
		let n = this.#d = /* @__PURE__ */ new Set();
		for (let { identifier: r } of e.touches) t.has(r) && n.add(r);
	}
	#y(e) {
		let t = this.#d, n = [];
		for (let r of e.touches) t.has(r.identifier) && n.push(r);
		return n;
	}
	#b(e) {
		let t = this.#y(e);
		if (t.length !== 2 || this.#n?.()) {
			this.#f = null;
			return;
		}
		let [n, r] = t;
		this.#f = {
			touch0X: n.screenX,
			touch0Y: n.screenY,
			touch1X: r.screenX,
			touch1Y: r.screenY,
			panX: (n.clientX + r.clientX) / 2,
			panY: (n.clientY + r.clientY) / 2,
			screenPanX: (n.screenX + r.screenX) / 2,
			screenPanY: (n.screenY + r.screenY) / 2
		};
	}
	#x(e) {
		if (!this.#f) return;
		let t = this.#y(e);
		if (t.length !== 2) return;
		let n = this.#c;
		if (this.#c = dt(e), !this.#c) return;
		if (!n) {
			this.#b(e);
			return;
		}
		let [r, i] = t, { screenX: a, screenY: o } = r, { screenX: s, screenY: c } = i, l = this.#f, { touch0X: u, touch0Y: d, touch1X: f, touch1Y: p, panX: m, panY: h } = l, g = f - u, _ = p - d, v = s - a, y = c - o, b = (r.clientX + i.clientX) / 2, x = (r.clientY + i.clientY) / 2;
		l.panX = b, l.panY = x;
		let S = b - m, C = x - h, w = (a + s) / 2, T = (o + c) / 2, E = Math.hypot(w - l.screenPanX, T - l.screenPanY);
		l.screenPanX = w, l.screenPanY = T;
		let D = Math.hypot(v, y), O = Math.hypot(g, _), k = this.#t ? this.MIN_TOUCH_DISTANCE_TO_SCALE : this.MIN_TOUCH_DISTANCE_TO_PINCH + 2 * E;
		if (D < ut || O < ut || Math.abs(O - D) <= k) {
			(S || C) && this.#s?.(S, C);
			return;
		}
		l.touch0X = a, l.touch0Y = o, l.touch1X = s, l.touch1Y = c;
		let A = Math.sign(D - O);
		if (!this.#t) {
			this.#t = !0, this.#h = A, (S || C) && this.#s?.(S, C);
			return;
		}
		if (this.#h) {
			let e = this.#h;
			if (this.#h = 0, A !== e && Math.abs(D - O) <= 2 * E) {
				this.#t = !1, (S || C) && this.#s?.(S, C);
				return;
			}
		}
		this.#a?.([m, h], O, D, S, C);
	}
	#S(e) {
		if (this.#v(e), this.#d.size >= 2) {
			this.#b(e);
			return;
		}
		let t = !!this.#f;
		this.#C(), this.#d.size === 1 && this.#_(), t && dt(e);
	}
	#C() {
		this.#f = null, this.#t = !1, this.#h = 0, this.#c = !1, this.#m && (this.#m.abort(), this.#m = null, this.#o?.());
	}
	destroy() {
		this.#C(), this.#d.clear(), this.#p?.abort(), this.#p = null, this.#l?.abort(), this.#l = null;
	}
}, Z = class e {
	#e = null;
	#t = null;
	#n = null;
	#r = null;
	#i = null;
	#a = !1;
	#o = null;
	#s = "";
	#c = null;
	#l = null;
	#u = null;
	#d = null;
	#f = null;
	#p = "";
	#m = !1;
	#h = null;
	#g = !1;
	#_ = !1;
	#v = !1;
	#y = null;
	#b = 0;
	#x = 0;
	#S = null;
	#C = null;
	isSelected = !1;
	_isCopy = !1;
	_editToolbar = null;
	_initialOptions = Object.create(null);
	_initialData = null;
	_isVisible = !0;
	_uiManager = null;
	_focusEventsAllowed = !0;
	static _l10n = null;
	static _l10nAlert = null;
	static _l10nResizer = null;
	#w = !1;
	#T = e._zIndex++;
	static _borderLineWidth = -1;
	static _colorManager = new at();
	static _zIndex = 1;
	static _telemetryTimeout = 1e3;
	static get _resizerKeyboardManager() {
		let t = e.prototype._resizeWithKeyboard, n = ot.TRANSLATE_SMALL, r = ot.TRANSLATE_BIG;
		return H(this, "_resizerKeyboardManager", new it([
			[
				["ArrowLeft"],
				t,
				{ args: [-n, 0] }
			],
			[
				["ctrl+ArrowLeft", "mac+shift+ArrowLeft"],
				t,
				{ args: [-r, 0] }
			],
			[
				["ArrowRight"],
				t,
				{ args: [n, 0] }
			],
			[
				["ctrl+ArrowRight", "mac+shift+ArrowRight"],
				t,
				{ args: [r, 0] }
			],
			[
				["ArrowUp"],
				t,
				{ args: [0, -n] }
			],
			[
				["ctrl+ArrowUp", "mac+shift+ArrowUp"],
				t,
				{ args: [0, -r] }
			],
			[
				["ArrowDown"],
				t,
				{ args: [0, n] }
			],
			[
				["ctrl+ArrowDown", "mac+shift+ArrowDown"],
				t,
				{ args: [0, r] }
			],
			[["Escape"], e.prototype._stopResizingWithKeyboard]
		]));
	}
	constructor(e) {
		this.parent = e.parent, this.id = e.id, this.width = this.height = null, this.pageIndex = e.parent.pageIndex, this.name = e.name, this.div = null, this._uiManager = e.uiManager, this.annotationElementId = null, this._willKeepAspectRatio = !1, this._initialOptions.isCentered = e.isCentered, this._structTreeParentId = null, this.annotationElementId = e.annotationElementId || null, this.creationDate = e.creationDate || /* @__PURE__ */ new Date(), this.modificationDate = e.modificationDate || null, this.canAddComment = !0;
		let { rotation: t, rawDims: { pageWidth: n, pageHeight: r, pageX: i, pageY: a } } = this.parent.viewport;
		this.rotation = t, this.pageRotation = (360 + t - this._uiManager.viewParameters.rotation) % 360, this.pageDimensions = [n, r], this.pageTranslation = [i, a];
		let [o, s] = this.parentDimensions;
		this.x = e.x / o, this.y = e.y / s, this.isAttachedToDOM = !1, this.deleted = !1;
	}
	updatePageIndex(e) {
		this.pageIndex = e;
	}
	get editorType() {
		return Object.getPrototypeOf(this).constructor._type;
	}
	get mode() {
		return Object.getPrototypeOf(this).constructor._editorType;
	}
	static get isDrawer() {
		return !1;
	}
	static get _defaultLineColor() {
		return H(this, "_defaultLineColor", this._colorManager.getHexCode("CanvasText"));
	}
	static deleteAnnotationElement(e) {
		let t = new pt({
			id: e._uiManager.getId(),
			parent: e.parent,
			uiManager: e._uiManager
		});
		t.annotationElementId = e.annotationElementId, t.deleted = !0, t._uiManager.addToAnnotationStorage(t);
	}
	static initialize(t, n) {
		if (e._l10n ??= t, e._l10nAlert ??= Object.freeze({
			highlight: "pdfjs-editor-highlight-added-alert",
			freetext: "pdfjs-editor-freetext-added-alert",
			ink: "pdfjs-editor-ink-added-alert",
			stamp: "pdfjs-editor-stamp-added-alert",
			signature: "pdfjs-editor-signature-added-alert"
		}), e._l10nResizer ??= Object.freeze({
			topLeft: "pdfjs-editor-resizer-top-left",
			topMiddle: "pdfjs-editor-resizer-top-middle",
			topRight: "pdfjs-editor-resizer-top-right",
			middleRight: "pdfjs-editor-resizer-middle-right",
			bottomRight: "pdfjs-editor-resizer-bottom-right",
			bottomMiddle: "pdfjs-editor-resizer-bottom-middle",
			bottomLeft: "pdfjs-editor-resizer-bottom-left",
			middleLeft: "pdfjs-editor-resizer-middle-left"
		}), e._borderLineWidth !== -1) return;
		let r = getComputedStyle(document.documentElement);
		e._borderLineWidth = parseFloat(r.getPropertyValue("--outline-width")) || 0;
	}
	static updateDefaultParams(e, t) {}
	static get defaultPropertiesToUpdate() {
		return [];
	}
	static isHandlingMimeForPasting(e) {
		return !1;
	}
	static paste(e, t) {
		I("Not implemented");
	}
	get propertiesToUpdate() {
		return [];
	}
	get _isDraggable() {
		return this.#w;
	}
	set _isDraggable(e) {
		this.#w = e, this.div?.classList.toggle("draggable", e);
	}
	get uid() {
		return this.annotationElementId || this.id;
	}
	get isEnterHandled() {
		return !0;
	}
	center() {
		let [e, t] = this.pageDimensions;
		switch (this.parentRotation) {
			case 90:
				this.x -= this.height * t / (e * 2), this.y += this.width * e / (t * 2);
				break;
			case 180:
				this.x += this.width / 2, this.y += this.height / 2;
				break;
			case 270:
				this.x += this.height * t / (e * 2), this.y -= this.width * e / (t * 2);
				break;
			default: this.x -= this.width / 2, this.y -= this.height / 2;
		}
		this.fixAndSetPosition();
	}
	addCommands(e) {
		this._uiManager.addCommands(e);
	}
	get currentLayer() {
		return this._uiManager.currentLayer;
	}
	setInBackground() {
		this.div.style.zIndex = 0;
	}
	setInForeground() {
		this.div.style.zIndex = this.#T;
	}
	setParent(e) {
		e === null ? (this.#G(), this.#d?.remove(), this.#d = null) : (this.pageIndex = e.pageIndex, this.pageDimensions = e.pageDimensions), this.parent = e;
	}
	focusin(e) {
		this._focusEventsAllowed && (this.#m ? this.#m = !1 : this.parent.setSelected(this));
	}
	focusout(e) {
		this._focusEventsAllowed && this.isAttachedToDOM && (e.relatedTarget?.closest(`#${this.id}`) || (e.preventDefault(), this.parent?.isMultipleSelection || this.commitOrRemove()));
	}
	commitOrRemove() {
		this.isEmpty() ? this.remove() : this.commit();
	}
	commit() {
		this.isInEditMode() && this.addToAnnotationStorage();
	}
	addToAnnotationStorage() {
		this._uiManager.addToAnnotationStorage(this);
	}
	setAt(e, t, n, r) {
		let [i, a] = this.parentDimensions;
		[n, r] = this.screenToPageTranslation(n, r), this.x = (e + n) / i, this.y = (t + r) / a, this.fixAndSetPosition();
	}
	_moveAfterPaste(e, t) {
		if (this.isClone) {
			delete this.isClone;
			return;
		}
		let [n, r] = this.parentDimensions;
		this.setAt(e * n, t * r, this.width * n, this.height * r), this._onTranslated();
	}
	#E([e, t], n, r) {
		[n, r] = this.screenToPageTranslation(n, r), this.x += n / e, this.y += r / t, this._onTranslating(this.x, this.y), this.fixAndSetPosition();
	}
	translate(e, t) {
		this.#E(this.parentDimensions, e, t);
	}
	translateInPage(e, t) {
		this.#h ||= [
			this.x,
			this.y,
			this.width,
			this.height
		], this.#E(this.pageDimensions, e, t), this.div.scrollIntoView({ block: "nearest" });
	}
	translationDone() {
		this._onTranslated(this.x, this.y);
	}
	drag(e, t) {
		this.#h ||= [
			this.x,
			this.y,
			this.width,
			this.height
		];
		let { div: n, parentDimensions: [r, i] } = this;
		if (this.x += e / r, this.y += t / i, this.parent && (this.x < 0 || this.x > 1 || this.y < 0 || this.y > 1)) {
			let { x: e, y: t } = this.div.getBoundingClientRect();
			this.parent.findNewParent(this, e, t) && (this.x -= Math.floor(this.x), this.y -= Math.floor(this.y));
		}
		let { x: a, y: o } = this, [s, c] = this.getBaseTranslation();
		a += s, o += c;
		let { style: l } = n;
		l.left = `${(100 * a).toFixed(2)}%`, l.top = `${(100 * o).toFixed(2)}%`, this._onTranslating(a, o);
	}
	_onTranslating(e, t) {}
	_onTranslated(e, t) {}
	get _hasBeenMoved() {
		return !!this.#h && (this.#h[0] !== this.x || this.#h[1] !== this.y);
	}
	get _hasBeenResized() {
		return !!this.#h && (this.#h[2] !== this.width || this.#h[3] !== this.height);
	}
	getBaseTranslation() {
		let [t, n] = this.parentDimensions, { _borderLineWidth: r } = e, i = r / t, a = r / n;
		switch (this.rotation) {
			case 90: return [-i, a];
			case 180: return [i, a];
			case 270: return [i, -a];
			default: return [-i, -a];
		}
	}
	get _mustFixPosition() {
		return !0;
	}
	fixAndSetPosition(e = this.rotation) {
		let { div: { style: t }, pageDimensions: [n, r] } = this, { x: i, y: a, width: o, height: s } = this;
		if (o *= n, s *= r, i *= n, a *= r, this._mustFixPosition) switch (e) {
			case 0:
				i = Y(i, 0, n - o), a = Y(a, 0, r - s);
				break;
			case 90:
				i = Y(i, 0, n - s), a = Y(a, o, r);
				break;
			case 180:
				i = Y(i, o, n), a = Y(a, s, r);
				break;
			case 270: i = Y(i, s, n), a = Y(a, 0, r - o);
		}
		this.x = i /= n, this.y = a /= r;
		let [c, l] = this.getBaseTranslation();
		i += c, a += l, t.left = `${(100 * i).toFixed(2)}%`, t.top = `${(100 * a).toFixed(2)}%`, this.moveInDOM();
	}
	static #D(e, t, n) {
		switch (n) {
			case 90: return [t, -e];
			case 180: return [-e, -t];
			case 270: return [-t, e];
			default: return [e, t];
		}
	}
	screenToPageTranslation(t, n) {
		return e.#D(t, n, this.parentRotation);
	}
	pageTranslationToScreen(t, n) {
		return e.#D(t, n, 360 - this.parentRotation);
	}
	#O(e) {
		switch (e) {
			case 90: {
				let [e, t] = this.pageDimensions;
				return [
					0,
					-e / t,
					t / e,
					0
				];
			}
			case 180: return [
				-1,
				0,
				0,
				-1
			];
			case 270: {
				let [e, t] = this.pageDimensions;
				return [
					0,
					e / t,
					-t / e,
					0
				];
			}
			default: return [
				1,
				0,
				0,
				1
			];
		}
	}
	get parentScale() {
		return this._uiManager.viewParameters.realScale;
	}
	get parentRotation() {
		return (this._uiManager.viewParameters.rotation + this.pageRotation) % 360;
	}
	get parentDimensions() {
		let { parentScale: e, pageDimensions: [t, n] } = this;
		return [t * e, n * e];
	}
	setDims() {
		let { div: { style: e }, width: t, height: n } = this;
		e.width = `${(100 * t).toFixed(2)}%`, e.height = `${(100 * n).toFixed(2)}%`;
	}
	getInitialTranslation() {
		return [0, 0];
	}
	#k() {
		if (this.#c) return;
		this.#c = document.createElement("div"), this.#c.classList.add("resizers");
		let e = this._willKeepAspectRatio ? [
			"topLeft",
			"topRight",
			"bottomRight",
			"bottomLeft"
		] : [
			"topLeft",
			"topMiddle",
			"topRight",
			"middleRight",
			"bottomRight",
			"bottomMiddle",
			"bottomLeft",
			"middleLeft"
		], t = this._uiManager._signal;
		for (let n of e) {
			let e = document.createElement("div");
			this.#c.append(e), e.classList.add("resizer", n), e.setAttribute("data-resizer-name", n), e.addEventListener("pointerdown", this.#A.bind(this, n), { signal: t }), e.addEventListener("contextmenu", ke, { signal: t }), e.tabIndex = -1;
		}
		this.div.prepend(this.#c);
	}
	#A(e, t) {
		t.preventDefault();
		let { isMac: n } = K.platform;
		if (t.button !== 0 || t.ctrlKey && n) return;
		this.#n?.toggle(!1);
		let r = this._isDraggable;
		this._isDraggable = !1, this.#l = [t.screenX, t.screenY];
		let i = new AbortController(), a = this._uiManager.combinedSignal(i);
		this.parent.togglePointerEvents(!1), window.addEventListener("pointermove", this.#N.bind(this, e), {
			passive: !0,
			capture: !0,
			signal: a
		}), window.addEventListener("touchmove", Ae, {
			passive: !1,
			signal: a
		}), window.addEventListener("contextmenu", ke, { signal: a }), this.#u = {
			savedX: this.x,
			savedY: this.y,
			savedWidth: this.width,
			savedHeight: this.height
		};
		let o = this.parent.div.style.cursor, s = this.div.style.cursor;
		this.div.style.cursor = this.parent.div.style.cursor = window.getComputedStyle(t.target).cursor;
		let c = () => {
			i.abort(), this.parent.togglePointerEvents(!0), this.#n?.toggle(!0), this._isDraggable = r, this.parent.div.style.cursor = o, this.div.style.cursor = s, this.#M();
		};
		window.addEventListener("pointerup", c, { signal: a }), window.addEventListener("blur", c, { signal: a });
	}
	#j(e, t, n, r) {
		this.width = n, this.height = r, this.x = e, this.y = t, this.setDims(), this.fixAndSetPosition(), this._onResized();
	}
	_onResized() {}
	#M() {
		if (!this.#u) return;
		let { savedX: e, savedY: t, savedWidth: n, savedHeight: r } = this.#u;
		this.#u = null;
		let i = this.x, a = this.y, o = this.width, s = this.height;
		(i !== e || a !== t || o !== n || s !== r) && this.addCommands({
			cmd: this.#j.bind(this, i, a, o, s),
			undo: this.#j.bind(this, e, t, n, r),
			mustExec: !0
		});
	}
	static _round(e) {
		return Math.round(e * 1e4) / 1e4;
	}
	#N(t, n) {
		let [r, i] = this.parentDimensions, a = this.x, o = this.y, s = this.width, c = this.height, l = e.MIN_SIZE / r, u = e.MIN_SIZE / i, d = this.#O(this.rotation), f = (e, t) => [d[0] * e + d[2] * t, d[1] * e + d[3] * t], p = this.#O(360 - this.rotation), m = (e, t) => [p[0] * e + p[2] * t, p[1] * e + p[3] * t], h, g, _ = !1, v = !1;
		switch (t) {
			case "topLeft":
				_ = !0, h = (e, t) => [0, 0], g = (e, t) => [e, t];
				break;
			case "topMiddle":
				h = (e, t) => [e / 2, 0], g = (e, t) => [e / 2, t];
				break;
			case "topRight":
				_ = !0, h = (e, t) => [e, 0], g = (e, t) => [0, t];
				break;
			case "middleRight":
				v = !0, h = (e, t) => [e, t / 2], g = (e, t) => [0, t / 2];
				break;
			case "bottomRight":
				_ = !0, h = (e, t) => [e, t], g = (e, t) => [0, 0];
				break;
			case "bottomMiddle":
				h = (e, t) => [e / 2, t], g = (e, t) => [e / 2, 0];
				break;
			case "bottomLeft":
				_ = !0, h = (e, t) => [0, t], g = (e, t) => [e, 0];
				break;
			case "middleLeft": v = !0, h = (e, t) => [0, t / 2], g = (e, t) => [e, t / 2];
		}
		let y = h(s, c), b = g(s, c), x = f(...b), S = e._round(a + x[0]), C = e._round(o + x[1]), w = 1, T = 1, E, D;
		if (n.fromKeyboard) ({deltaX: E, deltaY: D} = n);
		else {
			let { screenX: e, screenY: t } = n, [r, i] = this.#l;
			[E, D] = this.screenToPageTranslation(e - r, t - i), this.#l[0] = e, this.#l[1] = t;
		}
		if ([E, D] = m(E / r, D / i), _) {
			let e = Math.hypot(s, c);
			w = T = Math.max(Math.min(Math.hypot(b[0] - y[0] - E, b[1] - y[1] - D) / e, 1 / s, 1 / c), l / s, u / c);
		} else v ? w = Y(Math.abs(b[0] - y[0] - E), l, 1) / s : T = Y(Math.abs(b[1] - y[1] - D), u, 1) / c;
		let O = e._round(s * w), k = e._round(c * T);
		x = f(...g(O, k));
		let A = S - x[0], j = C - x[1];
		this.#h ||= [
			this.x,
			this.y,
			this.width,
			this.height
		], this.width = O, this.height = k, this.x = A, this.y = j, this.setDims(), this.fixAndSetPosition(), this._onResizing();
	}
	_onResizing() {}
	altTextFinish() {
		this.#n?.finish();
	}
	get toolbarButtons() {
		return null;
	}
	async addEditToolbar() {
		if (this._editToolbar || this.#_) return this._editToolbar;
		this._editToolbar = new Xe(this), this.div.append(this._editToolbar.render());
		let { toolbarButtons: e } = this;
		if (e) for (let [t, n] of e) await this._editToolbar.addButton(t, n);
		return this.hasComment || this._editToolbar.addButton("comment", this.addCommentButton()), this._editToolbar.addButton("delete"), this._editToolbar;
	}
	addCommentButtonInToolbar() {
		this._editToolbar?.addButtonBefore("comment", this.addCommentButton(), ".deleteButton");
	}
	removeCommentButtonFromToolbar() {
		this._editToolbar?.removeButton("comment");
	}
	removeEditToolbar() {
		this._editToolbar?.remove(), this._editToolbar = null, this.#n?.destroy();
	}
	addContainer(e) {
		let t = this._editToolbar?.div;
		t ? t.before(e) : this.div.append(e);
	}
	getClientDimensions() {
		return this.div.getBoundingClientRect();
	}
	createAltText() {
		return this.#n || (st.initialize(e._l10n), this.#n = new st(this), this.#e &&= (this.#n.data = this.#e, null)), this.#n;
	}
	get altTextData() {
		return this.#n?.data;
	}
	set altTextData(e) {
		this.#n && (this.#n.data = e);
	}
	get guessedAltText() {
		return this.#n?.guessedText;
	}
	async setGuessedAltText(e) {
		await this.#n?.setGuessedText(e);
	}
	serializeAltText(e) {
		return this.#n?.serialize(e);
	}
	hasAltText() {
		return !!this.#n && !this.#n.isEmpty();
	}
	hasAltTextData() {
		return this.#n?.hasData() ?? !1;
	}
	focusCommentButton() {
		this.#r?.focusButton();
	}
	addCommentButton() {
		return this.canAddComment ? this.#r ||= new ct(this) : null;
	}
	addStandaloneCommentButton() {
		if (this._uiManager.hasCommentManager()) {
			if (this.#i) {
				this._uiManager.isEditingMode() && this.#i.classList.remove("hidden");
				return;
			}
			this.hasComment && (this.#i = this.#r.renderForStandalone(), this.div.append(this.#i));
		}
	}
	removeStandaloneCommentButton() {
		this.#r.removeStandaloneCommentButton(), this.#i = null;
	}
	hideStandaloneCommentButton() {
		this.#i?.classList.add("hidden");
	}
	get comment() {
		if (!this.#r) return null;
		let { data: { richText: e, text: t, date: n, deleted: r } } = this.#r;
		return {
			text: t,
			richText: e,
			date: n,
			deleted: r,
			color: this.getNonHCMColor(),
			opacity: this.opacity ?? 1
		};
	}
	set comment(e) {
		this.#r ||= new ct(this), typeof e == "object" && e ? this.#r.restoreData(e) : this.#r.data = e, this.hasComment ? (this.removeCommentButtonFromToolbar(), this.addStandaloneCommentButton(), this._uiManager.updateComment(this)) : (this.addCommentButtonInToolbar(), this.removeStandaloneCommentButton(), this._uiManager.removeComment(this));
	}
	setCommentData({ comment: e, popupRef: t, richText: n }) {
		if (!t || (this.#r ||= new ct(this), this.#r.setInitialText(e, n), !this.annotationElementId)) return;
		let r = this._uiManager.getAndRemoveDataFromAnnotationStorage(this.annotationElementId);
		r && this.updateFromAnnotationLayer(r);
	}
	get hasEditedComment() {
		return this.#r?.hasBeenEdited();
	}
	get hasDeletedComment() {
		return this.#r?.isDeleted();
	}
	get hasComment() {
		return !!this.#r && !this.#r.isEmpty() && !this.#r.isDeleted();
	}
	async editComment(e) {
		this.#r ||= new ct(this), this.#r.edit(e);
	}
	toggleComment(e, t = void 0) {
		this.hasComment && this._uiManager.toggleComment(this, e, t);
	}
	setSelectedCommentButton(e) {
		this.#r.setSelectedButton(e);
	}
	addComment(e) {
		if (this.hasEditedComment) {
			let [, , , t] = e.rect, [n] = this.pageDimensions, [r] = this.pageTranslation, i = r + n + 1, a = t - 100, o = i + 180;
			e.popup = {
				contents: this.comment.text,
				deleted: this.comment.deleted,
				rect: [
					i,
					a,
					o,
					t
				]
			};
		}
	}
	updateFromAnnotationLayer({ popup: { contents: e, deleted: t } }) {
		this.#r.data = t ? null : e;
	}
	get parentBoundingClientRect() {
		return this.parent.boundingClientRect;
	}
	render() {
		let e = this.div = document.createElement("div");
		e.setAttribute("data-editor-rotation", (360 - this.rotation) % 360), e.className = this.name, e.setAttribute("id", this.id), e.tabIndex = this.#a ? -1 : 0, e.setAttribute("role", "application"), this.defaultL10nId && e.setAttribute("data-l10n-id", this.defaultL10nId), this._isVisible || e.classList.add("hidden"), this.setInForeground(), this.#z();
		let [t, n] = this.parentDimensions;
		this.parentRotation % 180 != 0 && (e.style.maxWidth = `${(100 * n / t).toFixed(2)}%`, e.style.maxHeight = `${(100 * t / n).toFixed(2)}%`);
		let [r, i] = this.getInitialTranslation();
		return this.translate(r, i), $e(this, e, [
			"keydown",
			"pointerdown",
			"dblclick"
		]), this.#B(), this.addStandaloneCommentButton(), this._uiManager._editorUndoBar?.hide(), e;
	}
	#P() {
		this.#u = {
			savedX: this.x,
			savedY: this.y,
			savedWidth: this.width,
			savedHeight: this.height
		}, this.#n?.toggle(!1), this.parent.togglePointerEvents(!1);
	}
	#F(t, n, r) {
		let i = .7, a = r / n * i + 1 - i;
		if (a === 1) return;
		let o = this.#O(this.rotation), s = (e, t) => [o[0] * e + o[2] * t, o[1] * e + o[3] * t], [c, l] = this.parentDimensions, u = this.x, d = this.y, f = this.width, p = this.height, m = e.MIN_SIZE / c, h = e.MIN_SIZE / l;
		a = Math.max(Math.min(a, 1 / f, 1 / p), m / f, h / p);
		let g = e._round(f * a), _ = e._round(p * a);
		if (g === f && _ === p) return;
		this.#h ||= [
			u,
			d,
			f,
			p
		];
		let v = s(f / 2, p / 2), y = e._round(u + v[0]), b = e._round(d + v[1]), x = s(g / 2, _ / 2);
		this.x = y - x[0], this.y = b - x[1], this.width = g, this.height = _, this.setDims(), this.fixAndSetPosition(), this._onResizing();
	}
	#I() {
		this.#n?.toggle(!0), this.parent.togglePointerEvents(!0), this.#M();
	}
	pointerdown(e) {
		let { isMac: t } = K.platform;
		if (e.button !== 0 || e.ctrlKey && t) {
			e.preventDefault();
			return;
		}
		if (this.#m = !0, this._isDraggable) {
			this.#R(e);
			return;
		}
		this.#L(e);
	}
	#L(e) {
		let { isMac: t } = K.platform;
		e.ctrlKey && !t || e.shiftKey || e.metaKey && t ? this.parent.toggleSelected(this) : this.parent.setSelected(this);
	}
	#R(e) {
		let { isSelected: t } = this;
		this._uiManager.setUpDragSession();
		let n = !1, r = new AbortController(), i = this._uiManager.combinedSignal(r), a = {
			capture: !0,
			passive: !1,
			signal: i
		}, o = (e) => {
			r.abort(), this.#o = null, this.#m = !1, this._uiManager.endDragSession() || this.#L(e), n && this._onStopDragging();
		};
		t && (this.#b = e.clientX, this.#x = e.clientY, this.#o = e.pointerId, this.#s = e.pointerType, window.addEventListener("pointermove", (e) => {
			n || (n = !0, this._uiManager.toggleComment(this, !0, !1), this._onStartDragging());
			let { clientX: t, clientY: r, pointerId: i } = e;
			if (i !== this.#o) {
				Ae(e);
				return;
			}
			let [a, o] = this.screenToPageTranslation(t - this.#b, r - this.#x);
			this.#b = t, this.#x = r, this._uiManager.dragSelectedEditors(a, o), this.div.scrollIntoView({ block: "nearest" });
		}, a), window.addEventListener("touchmove", Ae, a), window.addEventListener("pointerdown", (e) => {
			e.pointerType === this.#s && (this.#C || e.isPrimary) && o(e), Ae(e);
		}, a));
		let s = (e) => {
			if (!this.#o || this.#o === e.pointerId) {
				o(e);
				return;
			}
			Ae(e);
		};
		window.addEventListener("pointerup", s, { signal: i }), window.addEventListener("blur", s, { signal: i });
	}
	_onStartDragging() {}
	_onStopDragging() {}
	moveInDOM() {
		this.#y && clearTimeout(this.#y), this.#y = setTimeout(() => {
			this.#y = null, this.parent?.moveEditorInDOM(this);
		}, 0);
	}
	_setParentAndPosition(e, t, n) {
		e.changeParent(this), this.x = t, this.y = n, this.fixAndSetPosition(), this._onTranslated();
	}
	getRect(e, t, n = this.rotation) {
		let r = this.parentScale, [i, a] = this.pageDimensions, [o, s] = this.pageTranslation, c = e / r, l = t / r, u = this.x * i, d = this.y * a, f = this.width * i, p = this.height * a;
		switch (n) {
			case 0: return [
				u + c + o,
				a - d - l - p + s,
				u + c + f + o,
				a - d - l + s
			];
			case 90: return [
				u + l + o,
				a - d + c + s,
				u + l + p + o,
				a - d + c + f + s
			];
			case 180: return [
				u - c - f + o,
				a - d + l + s,
				u - c + o,
				a - d + l + p + s
			];
			case 270: return [
				u - l - p + o,
				a - d - c - f + s,
				u - l + o,
				a - d - c + s
			];
			default: throw Error("Invalid rotation");
		}
	}
	getRectInCurrentCoords(e, t) {
		let [n, r, i, a] = e, o = i - n, s = a - r;
		switch (this.rotation) {
			case 0: return [
				n,
				t - a,
				o,
				s
			];
			case 90: return [
				n,
				t - r,
				s,
				o
			];
			case 180: return [
				i,
				t - r,
				o,
				s
			];
			case 270: return [
				i,
				t - a,
				s,
				o
			];
			default: throw Error("Invalid rotation");
		}
	}
	getPDFRect() {
		return this.getRect(0, 0);
	}
	getNonHCMColor() {
		return this.color && e._colorManager.convert(this._uiManager.getNonHCMColor(this.color));
	}
	onUpdatedColor() {
		this.#r?.onUpdatedColor();
	}
	getData() {
		let { comment: { text: e, color: t, date: n, opacity: r, deleted: i, richText: a }, uid: o, pageIndex: s, creationDate: c, modificationDate: l } = this;
		return {
			id: o,
			pageIndex: s,
			rect: this.getPDFRect(),
			richText: a,
			contentsObj: { str: e },
			creationDate: c,
			modificationDate: n || l,
			popupRef: !i,
			color: t,
			opacity: r
		};
	}
	onceAdded(e) {}
	isEmpty() {
		return !1;
	}
	enableEditMode() {
		return !this.isInEditMode() && (this.parent.setEditingState(!1), this.#_ = !0, !0);
	}
	disableEditMode() {
		return this.isInEditMode() ? (this.parent.setEditingState(!0), this.#_ = !1, !0) : !1;
	}
	isInEditMode() {
		return this.#_;
	}
	shouldGetKeyboardEvents() {
		return this.#v;
	}
	needsToBeRebuilt() {
		return this.div && !this.isAttachedToDOM;
	}
	get isOnScreen() {
		let { top: e, left: t, bottom: n, right: r } = this.getClientDimensions(), { innerHeight: i, innerWidth: a } = window;
		return t < a && r > 0 && e < i && n > 0;
	}
	#z() {
		if (this.#f || !this.div) return;
		this.#f = new AbortController();
		let e = this._uiManager.combinedSignal(this.#f);
		this.div.addEventListener("focusin", this.focusin.bind(this), { signal: e }), this.div.addEventListener("focusout", this.focusout.bind(this), { signal: e });
	}
	#B() {
		this.#C || !this.div || !this.isResizable || !this._uiManager._supportsPinchToZoom || (this.#C = new ft({
			container: this.div,
			isPinchingDisabled: () => !this.isSelected,
			onPinchStart: this.#P.bind(this),
			onPinching: this.#F.bind(this),
			onPinchEnd: this.#I.bind(this),
			signal: this._uiManager._signal
		}));
	}
	rebuild() {
		this.#z(), this.#B();
	}
	rotate(e) {}
	resize() {}
	serializeDeleted() {
		return {
			id: this.annotationElementId,
			deleted: !0,
			pageIndex: this.pageIndex,
			popupRef: this._initialData?.popupRef || ""
		};
	}
	serialize(e = !1, t = null) {
		return {
			annotationType: this.mode,
			pageIndex: this.pageIndex,
			rect: this.getPDFRect(),
			rotation: this.rotation,
			structTreeParentId: this._structTreeParentId,
			popupRef: this._initialData?.popupRef || ""
		};
	}
	static async deserialize(e, t, n) {
		let r = new this.prototype.constructor({
			parent: t,
			id: n.getId(),
			uiManager: n,
			annotationElementId: e.annotationElementId,
			creationDate: e.creationDate,
			modificationDate: e.modificationDate
		});
		r.rotation = e.rotation, r.#e = e.accessibilityData, r._isCopy = e.isCopy || !1;
		let [i, a] = r.pageDimensions, [o, s, c, l] = r.getRectInCurrentCoords(e.rect, a);
		return r.x = o / i, r.y = s / a, r.width = c / i, r.height = l / a, r;
	}
	get hasBeenModified() {
		return !!this.annotationElementId && (this.deleted || this.serialize() !== null);
	}
	remove() {
		if (this.#f?.abort(), this.#f = null, this.isEmpty() || this.commit(), this.#C?.destroy(), this.#C = null, this.parent ? this.parent.remove(this) : this._uiManager.removeEditor(this), this.hideCommentPopup(), this.#y &&= (clearTimeout(this.#y), null), this.#G(), this.removeEditToolbar(), this.#S) {
			for (let e of this.#S.values()) clearTimeout(e);
			this.#S = null;
		}
		this.parent = null, this.#d?.remove(), this.#d = null;
	}
	get isResizable() {
		return !1;
	}
	makeResizable() {
		this.isResizable && (this.#k(), this.#c.classList.remove("hidden"));
	}
	get toolbarPosition() {
		return null;
	}
	get commentButtonPosition() {
		return this._uiManager.direction === "ltr" ? [1, 0] : [0, 0];
	}
	get commentButtonPositionInPage() {
		let { commentButtonPosition: [t, n] } = this, [r, i, a, o] = this.getPDFRect();
		return [e._round(r + (a - r) * t), e._round(i + (o - i) * (1 - n))];
	}
	get commentButtonColor() {
		return this._uiManager.makeCommentColor(this.getNonHCMColor(), this.opacity);
	}
	get commentPopupPosition() {
		return this.#r.commentPopupPositionInLayer;
	}
	set commentPopupPosition(e) {
		this.#r.commentPopupPositionInLayer = e;
	}
	hasDefaultPopupPosition() {
		return this.#r.hasDefaultPopupPosition();
	}
	get commentButtonWidth() {
		return this.#r.commentButtonWidth;
	}
	get elementBeforePopup() {
		return this.div;
	}
	setCommentButtonStates(e) {
		this.#r?.setCommentButtonStates(e);
	}
	keydown(t) {
		if (!this.isResizable || t.target !== this.div || t.key !== "Enter") return;
		this._uiManager.setSelected(this), this.#u = {
			savedX: this.x,
			savedY: this.y,
			savedWidth: this.width,
			savedHeight: this.height
		};
		let n = this.#c.children;
		if (!this.#t) {
			this.#t = Array.from(n);
			let t = this.#V.bind(this), r = this.#H.bind(this), i = this._uiManager._signal;
			for (let n of this.#t) {
				let a = n.getAttribute("data-resizer-name");
				n.setAttribute("role", "spinbutton"), n.addEventListener("keydown", t, { signal: i }), n.addEventListener("blur", r, { signal: i }), n.addEventListener("focus", this.#U.bind(this, a), { signal: i }), n.setAttribute("data-l10n-id", e._l10nResizer[a]);
			}
		}
		let r = this.#t[0], i = 0;
		for (let e of n) {
			if (e === r) break;
			i++;
		}
		let a = (360 - this.rotation + this.parentRotation) % 360 / 90 * (this.#t.length / 4);
		if (a !== i) {
			if (a < i) for (let e = 0; e < i - a; e++) this.#c.append(this.#c.firstElementChild);
			else if (a > i) for (let e = 0; e < a - i; e++) this.#c.firstElementChild.before(this.#c.lastElementChild);
			let t = 0;
			for (let r of n) {
				let n = this.#t[t++].getAttribute("data-resizer-name");
				r.setAttribute("data-l10n-id", e._l10nResizer[n]);
			}
		}
		this.#W(0), this.#v = !0, this.#c.firstElementChild.focus({ focusVisible: !0 }), t.preventDefault(), t.stopImmediatePropagation();
	}
	#V(t) {
		e._resizerKeyboardManager.exec(this, t);
	}
	#H(e) {
		this.#v && e.relatedTarget?.parentNode !== this.#c && this.#G();
	}
	#U(e) {
		this.#p = this.#v ? e : "";
	}
	#W(e) {
		if (this.#t) for (let t of this.#t) t.tabIndex = e;
	}
	_resizeWithKeyboard(e, t) {
		this.#v && this.#N(this.#p, {
			deltaX: e,
			deltaY: t,
			fromKeyboard: !0
		});
	}
	#G() {
		this.#v = !1, this.#W(-1), this.#M();
	}
	_stopResizingWithKeyboard() {
		this.#G(), this.div.focus();
	}
	select() {
		if (this.isSelected && this._editToolbar) {
			this._editToolbar.show();
			return;
		}
		if (this.isSelected = !0, this.makeResizable(), this.div?.classList.add("selectedEditor"), !this._editToolbar) {
			this.addEditToolbar().then(() => {
				this.div?.classList.contains("selectedEditor") && this._editToolbar?.show();
			});
			return;
		}
		this._editToolbar?.show(), this.#n?.toggleAltTextBadge(!1);
	}
	focus() {
		this.div && !this.div.contains(document.activeElement) && setTimeout(() => this.div?.focus({ preventScroll: !0 }), 0);
	}
	unselect() {
		this.isSelected && (this.isSelected = !1, this.#c?.classList.add("hidden"), this.div?.classList.remove("selectedEditor"), this.div?.contains(document.activeElement) && this._uiManager.currentLayer.div.focus({ preventScroll: !0 }), this._editToolbar?.hide(), this.#n?.toggleAltTextBadge(!0), this.hideCommentPopup());
	}
	hideCommentPopup() {
		this.hasComment && this._uiManager.toggleComment(null);
	}
	updateParams(e, t) {}
	disableEditing() {}
	enableEditing() {}
	get canChangeContent() {
		return !1;
	}
	enterInEditMode() {
		this.canChangeContent && (this.enableEditMode(), this.div.focus());
	}
	dblclick(e) {
		e.target.nodeName !== "BUTTON" && (this.enterInEditMode(), this.parent.updateToolbar({
			mode: this.constructor._editorType,
			editId: this.uid
		}));
	}
	getElementForAltText() {
		return this.div;
	}
	get contentDiv() {
		return this.div;
	}
	get isEditing() {
		return this.#g;
	}
	set isEditing(e) {
		this.#g = e, this.parent && (e ? (this.parent.setSelected(this), this.parent.setActiveEditor(this)) : this.parent.setActiveEditor(null));
	}
	static get MIN_SIZE() {
		return 16;
	}
	static canCreateNewEmptyEditor() {
		return !0;
	}
	get telemetryInitialData() {
		return { action: "added" };
	}
	get telemetryFinalData() {
		return null;
	}
	_reportTelemetry(t, n = !1) {
		if (n) {
			this.#S ||= /* @__PURE__ */ new Map();
			let { action: n } = t, r = this.#S.get(n);
			r && clearTimeout(r), r = setTimeout(() => {
				this._reportTelemetry(t), this.#S.delete(n), this.#S.size === 0 && (this.#S = null);
			}, e._telemetryTimeout), this.#S.set(n, r);
			return;
		}
		t.type ||= this.editorType, this._uiManager._eventBus.dispatch("reporttelemetry", {
			source: this,
			details: {
				type: "editing",
				data: t
			}
		});
	}
	show(e = this._isVisible) {
		this.div.classList.toggle("hidden", !e), this._isVisible = e;
	}
	enable() {
		this.div && (this.div.tabIndex = 0), this.#a = !1;
	}
	disable() {
		this.div && (this.div.tabIndex = -1), this.#a = !0;
	}
	updateFakeAnnotationElement(e) {
		if (!this.#d && !this.deleted) {
			this.#d = e.addFakeAnnotation(this);
			return;
		}
		if (this.deleted) {
			this.#d.remove(), this.#d = null;
			return;
		}
		(this.hasEditedComment || this._hasBeenMoved || this._hasBeenResized) && this.#d.updateEdited({
			rect: this.getPDFRect(),
			popup: this.comment
		});
	}
	renderAnnotationElement(e) {
		if (this.deleted) return e.hide(), null;
		let t = e.container.querySelector(".annotationContent");
		if (!t) t = document.createElement("div"), t.classList.add("annotationContent", this.editorType), e.container.prepend(t);
		else if (t.nodeName === "CANVAS") {
			let e = t;
			t = document.createElement("div"), t.classList.add("annotationContent", this.editorType), e.before(t);
		}
		return t;
	}
	resetAnnotationElement(e) {
		let { firstElementChild: t } = e.container;
		t?.nodeName === "DIV" && t.classList.contains("annotationContent") && t.remove();
	}
}, pt = class extends Z {
	constructor(e) {
		super(e), this.annotationElementId = e.annotationElementId, this.deleted = !0;
	}
	serialize() {
		return this.serializeDeleted();
	}
}, mt = 3285377520, ht = 4294901760, gt = 65535, _t = class {
	constructor(e) {
		this.h1 = e ? e & 4294967295 : mt, this.h2 = e ? e & 4294967295 : mt;
	}
	update(e) {
		let t, n;
		if (typeof e == "string") {
			t = new Uint8Array(e.length * 2), n = 0;
			for (let r = 0, i = e.length; r < i; r++) {
				let i = e.charCodeAt(r);
				i <= 255 ? t[n++] = i : (t[n++] = i >>> 8, t[n++] = i & 255);
			}
		} else if (ArrayBuffer.isView(e)) t = e.slice(), n = t.byteLength;
		else throw Error("Invalid data format, must be a string or TypedArray.");
		let r = n >> 2, i = n - r * 4, a = new Uint32Array(t.buffer, 0, r), o = 0, s = 0, c = this.h1, l = this.h2, u = 3432918353, d = 461845907, f = 11601, p = 13715;
		for (let e = 0; e < r; e++) e & 1 ? (o = a[e], o = o * u & ht | o * f & gt, o = o << 15 | o >>> 17, o = o * d & ht | o * p & gt, c ^= o, c = c << 13 | c >>> 19, c = c * 5 + 3864292196) : (s = a[e], s = s * u & ht | s * f & gt, s = s << 15 | s >>> 17, s = s * d & ht | s * p & gt, l ^= s, l = l << 13 | l >>> 19, l = l * 5 + 3864292196);
		switch (o = 0, i) {
			case 3: o ^= t[r * 4 + 2] << 16;
			case 2: o ^= t[r * 4 + 1] << 8;
			case 1: o ^= t[r * 4], o = o * u & ht | o * f & gt, o = o << 15 | o >>> 17, o = o * d & ht | o * p & gt, r & 1 ? c ^= o : l ^= o;
		}
		this.h1 = c, this.h2 = l;
	}
	hexdigest() {
		let e = this.h1, t = this.h2;
		return e ^= t >>> 1, e = e * 3981806797 & ht | e * 36045 & gt, t = t * 4283543511 & ht | ((t << 16 | e >>> 16) * 2950163797 & ht) >>> 16, e ^= t >>> 1, e = e * 444984403 & ht | e * 60499 & gt, t = t * 3301882366 & ht | ((t << 16 | e >>> 16) * 3120437893 & ht) >>> 16, e ^= t >>> 1, (e >>> 0).toString(16).padStart(8, "0") + (t >>> 0).toString(16).padStart(8, "0");
	}
}, vt = Object.freeze({
	map: null,
	hash: "",
	transfer: void 0
}), yt = class {
	#e = !1;
	#t = null;
	#n = null;
	#r = /* @__PURE__ */ new Map();
	onSetModified = null;
	onResetModified = null;
	onAnnotationEditor = null;
	getValue(e, t) {
		let n = this.#r.get(e);
		return n === void 0 ? t : Object.assign(t, n);
	}
	getRawValue(e) {
		return this.#r.get(e);
	}
	remove(e) {
		let t = this.#r.get(e);
		t !== void 0 && (t instanceof Z && this.#n.delete(t.annotationElementId), this.#r.delete(e), this.#r.size === 0 && this.resetModified(), !this.#r.values().some((e) => e instanceof Z) && this.onAnnotationEditor?.(null));
	}
	setValue(e, t) {
		let n = this.#r.get(e), r = !1;
		if (n !== void 0) for (let [e, i] of Object.entries(t)) n[e] !== i && (r = !0, n[e] = i);
		else r = !0, this.#r.set(e, t);
		r && this.#i(), t instanceof Z && ((this.#n ||= /* @__PURE__ */ new Map()).set(t.annotationElementId, t), this.onAnnotationEditor?.(t.constructor._type));
	}
	has(e) {
		return this.#r.has(e);
	}
	get size() {
		return this.#r.size;
	}
	#i() {
		this.#e || (this.#e = !0, this.onSetModified?.());
	}
	resetModified() {
		this.#e && (this.#e = !1, this.onResetModified?.());
	}
	get print() {
		return new bt(this);
	}
	get serializable() {
		if (this.#r.size === 0) return vt;
		let e = /* @__PURE__ */ new Map(), t = new _t(), n = [], r = Object.create(null), i = !1;
		for (let [n, a] of this.#r) {
			let o = a instanceof Z ? a.serialize(!1, r) : a;
			a.page && (a.pageIndex = a.page._pageIndex, delete a.page), o && (e.set(n, o), t.update(`${n}:${JSON.stringify(o)}`), i ||= !!o.bitmap);
		}
		if (i) for (let t of e.values()) t.bitmap && n.push(t.bitmap);
		return e.size > 0 ? {
			map: e,
			hash: t.hexdigest(),
			transfer: n
		} : vt;
	}
	get editorStats() {
		let e = null, t = /* @__PURE__ */ new Map(), n = 0, r = 0;
		for (let i of this.#r.values()) {
			if (!(i instanceof Z)) {
				i.popup && (i.popup.deleted ? r += 1 : n += 1);
				continue;
			}
			i.isCommentDeleted ? r += 1 : i.hasEditedComment && (n += 1);
			let a = i.telemetryFinalData;
			if (!a) continue;
			let { type: o } = a;
			t.getOrInsertComputed(o, () => Object.getPrototypeOf(i).constructor), e ||= Object.create(null);
			let s = e[o] ||= /* @__PURE__ */ new Map();
			for (let [e, t] of Object.entries(a)) {
				if (e === "type") continue;
				let n = s.getOrInsertComputed(e, J);
				n.set(t, (n.get(t) ?? 0) + 1);
			}
		}
		if ((r > 0 || n > 0) && (e ||= Object.create(null), e.comments = {
			deleted: r,
			edited: n
		}), !e) return null;
		for (let [n, r] of t) e[n] = r.computeTelemetryFinalData(e[n]);
		return e;
	}
	resetModifiedIds() {
		this.#t = null;
	}
	updateEditor(e, t) {
		let n = this.#n?.get(e);
		return n ? (n.updateFromAnnotationLayer(t), !0) : !1;
	}
	getEditor(e) {
		return this.#n?.get(e) || null;
	}
	get modifiedIds() {
		if (this.#t) return this.#t;
		let e = [];
		if (this.#n) for (let t of this.#n.values()) t.serialize() && e.push(t.annotationElementId);
		let t = "";
		if (e.length) {
			let n = new _t();
			n.update(e.join(",")), t = n.hexdigest();
		}
		return this.#t = {
			ids: new Set(e),
			hash: t
		};
	}
	[Symbol.iterator]() {
		return this.#r.entries();
	}
}, bt = class extends yt {
	#e = vt;
	constructor(e) {
		super();
		let { serializable: t } = e;
		if (t === vt) return;
		let { map: n, hash: r, transfer: i } = t, a = structuredClone(n, i ? { transfer: i } : null);
		this.#e = {
			map: a,
			hash: r,
			transfer: []
		};
	}
	get print() {
		I("Should not call PrintAnnotationStorage.print");
	}
	get serializable() {
		return this.#e;
	}
	get modifiedIds() {
		return H(this, "modifiedIds", {
			ids: /* @__PURE__ */ new Set(),
			hash: ""
		});
	}
}, xt = "__forcedDependency", { floor: St, ceil: Ct } = Math;
function wt(e, t, n, r, i, a) {
	e[t * 4 + 0] = Math.min(e[t * 4 + 0], n), e[t * 4 + 1] = Math.min(e[t * 4 + 1], r), e[t * 4 + 2] = Math.max(e[t * 4 + 2], i), e[t * 4 + 3] = Math.max(e[t * 4 + 3], a);
}
function Tt(e, t, n, r, i) {
	let a;
	e ? (e < 0 && (a = i[0], i[0] = i[2], i[2] = a), i[0] *= e, i[2] *= e, t < 0 && (a = i[1], i[1] = i[3], i[3] = a), i[1] *= t, i[3] *= t) : i.fill(0), i[0] += n, i[1] += r, i[2] += n, i[3] += r;
}
var Et = new Uint32Array(new Uint8Array([
	255,
	255,
	0,
	0
]).buffer)[0], Dt = class {
	#e;
	#t;
	constructor(e, t) {
		this.#e = e, this.#t = t;
	}
	get length() {
		return this.#e.length;
	}
	isEmpty(e) {
		return this.#e[e] === Et;
	}
	minX(e) {
		return this.#t[e * 4 + 0] / 256;
	}
	minY(e) {
		return this.#t[e * 4 + 1] / 256;
	}
	maxX(e) {
		return (this.#t[e * 4 + 2] + 1) / 256;
	}
	maxY(e) {
		return (this.#t[e * 4 + 3] + 1) / 256;
	}
}, Ot = (e, t) => e?.getOrInsertComputed(t, () => ({
	dependencies: /* @__PURE__ */ new Set(),
	isRenderingOperation: !1
})), kt = class {
	#e = [[
		1,
		0,
		0,
		1,
		0,
		0
	]];
	#t = [
		-Infinity,
		-Infinity,
		Infinity,
		Infinity
	];
	#n = new Float64Array(f);
	_pendingBBoxIdx = -1;
	#r;
	#i;
	#a;
	#o;
	_savesStack = [];
	_markedContentStack = [];
	constructor(e, t) {
		this.#r = e.width, this.#i = e.height, this.#s(t);
	}
	growOperationsCount(e) {
		e >= this.#o.length && this.#s(e, this.#o);
	}
	#s(e, t) {
		let n = /* @__PURE__ */ new ArrayBuffer(e * 4);
		this.#a = new Uint8ClampedArray(n), this.#o = new Uint32Array(n), t && t.length > 0 ? (this.#o.set(t), this.#o.fill(Et, t.length)) : this.#o.fill(Et);
	}
	get clipBox() {
		return this.#t;
	}
	save(e) {
		return this.#t = { __proto__: this.#t }, this._savesStack.push(e), this;
	}
	restore(e, t) {
		let n = Object.getPrototypeOf(this.#t);
		if (n === null) return this;
		this.#t = n;
		let r = this._savesStack.pop();
		return r !== void 0 && (t?.(r, e), this.#o[e] = this.#o[r]), this;
	}
	recordOpenMarker(e) {
		return this._savesStack.push(e), this;
	}
	getOpenMarker() {
		return this._savesStack.length === 0 ? null : this._savesStack.at(-1);
	}
	recordCloseMarker(e, t) {
		let n = this._savesStack.pop();
		return n !== void 0 && (t?.(n, e), this.#o[e] = this.#o[n]), this;
	}
	beginMarkedContent(e) {
		return this._markedContentStack.push(e), this;
	}
	endMarkedContent(e, t) {
		let n = this._markedContentStack.pop();
		return n !== void 0 && (t?.(n, e), this.#o[e] = this.#o[n]), this;
	}
	pushBaseTransform(e) {
		return this.#e.push(q.multiplyByDOMMatrix(this.#e.at(-1), e.getTransform())), this;
	}
	popBaseTransform() {
		return this.#e.length > 1 && this.#e.pop(), this;
	}
	resetBBox(e) {
		return this._pendingBBoxIdx !== e && (this._pendingBBoxIdx = e, this.#n.set(f, 0)), this;
	}
	recordClipBox(e, t, n, r, i, a) {
		let o = q.multiplyByDOMMatrix(this.#e.at(-1), t.getTransform()), s = f.slice();
		q.axialAlignedBoundingBox([
			n,
			i,
			r,
			a
		], o, s);
		let c = q.intersect(this.#t, s);
		return c ? (this.#t[0] = c[0], this.#t[1] = c[1], this.#t[2] = c[2], this.#t[3] = c[3]) : (this.#t[0] = this.#t[1] = Infinity, this.#t[2] = this.#t[3] = -Infinity), this;
	}
	recordBBox(e, t, n, r, i, a) {
		let o = this.#t;
		if (o[0] === Infinity) return this;
		let s = q.multiplyByDOMMatrix(this.#e.at(-1), t.getTransform());
		if (o[0] === -Infinity) return q.axialAlignedBoundingBox([
			n,
			i,
			r,
			a
		], s, this.#n), this;
		let c = f.slice();
		return q.axialAlignedBoundingBox([
			n,
			i,
			r,
			a
		], s, c), this.#n[0] = Y(c[0], o[0], this.#n[0]), this.#n[1] = Y(c[1], o[1], this.#n[1]), this.#n[2] = Y(c[2], this.#n[2], o[2]), this.#n[3] = Y(c[3], this.#n[3], o[3]), this;
	}
	recordFullPageBBox(e) {
		return this.#n[0] = Math.max(0, this.#t[0]), this.#n[1] = Math.max(0, this.#t[1]), this.#n[2] = Math.min(this.#r, this.#t[2]), this.#n[3] = Math.min(this.#i, this.#t[3]), this;
	}
	recordOperation(e, t = !1, n) {
		if (this._pendingBBoxIdx !== e) return this;
		let r = St(this.#n[0] * 256 / this.#r), i = St(this.#n[1] * 256 / this.#i), a = Ct(this.#n[2] * 256 / this.#r), o = Ct(this.#n[3] * 256 / this.#i);
		if (wt(this.#a, e, r, i, a, o), n) for (let t of n) for (let n of t) n !== e && wt(this.#a, n, r, i, a, o);
		return t || (this._pendingBBoxIdx = -1), this;
	}
	bboxToClipBoxDropOperation(e) {
		return this._pendingBBoxIdx === e && (this._pendingBBoxIdx = -1, this.#t[0] = Math.max(this.#t[0], this.#n[0]), this.#t[1] = Math.max(this.#t[1], this.#n[1]), this.#t[2] = Math.min(this.#t[2], this.#n[2]), this.#t[3] = Math.min(this.#t[3], this.#n[3])), this;
	}
	take() {
		return new Dt(this.#o, this.#a);
	}
	takeDebugMetadata() {
		throw Error("Unreachable");
	}
	recordSimpleData(e, t) {
		return this;
	}
	recordIncrementalData(e, t) {
		return this;
	}
	resetIncrementalData(e, t) {
		return this;
	}
	recordNamedData(e, t) {
		return this;
	}
	recordSimpleDataFromNamed(e, t, n) {
		return this;
	}
	recordFutureForcedDependency(e, t) {
		return this;
	}
	inheritSimpleDataAsFutureForcedDependencies(e) {
		return this;
	}
	inheritPendingDependenciesAsFutureForcedDependencies() {
		return this;
	}
	recordCharacterBBox(e, t, n, r = 1, i = 0, a = 0, o) {
		return this;
	}
	getSimpleIndex(e) {}
	recordDependencies(e, t) {
		return this;
	}
	recordNamedDependency(e, t) {
		return this;
	}
	recordShowTextOperation(e, t = !1) {
		return this;
	}
}, At = class {
	#e = { __proto__: null };
	#t = {
		__proto__: null,
		transform: [],
		moveText: [],
		sameLineText: [],
		[xt]: []
	};
	#n = /* @__PURE__ */ new Map();
	#r = /* @__PURE__ */ new Set();
	#i = /* @__PURE__ */ new Map();
	#a;
	#o;
	#s;
	constructor(e, t = !1) {
		this.#s = e, t && (this.#a = /* @__PURE__ */ new Map(), this.#o = (e, t) => {
			Ot(this.#a, t).dependencies.add(e);
		});
	}
	get clipBox() {
		return this.#s.clipBox;
	}
	growOperationsCount(e) {
		this.#s.growOperationsCount(e);
	}
	save(e) {
		return this.#e = { __proto__: this.#e }, this.#t = {
			__proto__: this.#t,
			transform: { __proto__: this.#t.transform },
			moveText: { __proto__: this.#t.moveText },
			sameLineText: { __proto__: this.#t.sameLineText },
			[xt]: { __proto__: this.#t[xt] }
		}, this.#s.save(e), this;
	}
	restore(e) {
		this.#s.restore(e, this.#o);
		let t = Object.getPrototypeOf(this.#e);
		return t === null ? this : (this.#e = t, this.#t = Object.getPrototypeOf(this.#t), this);
	}
	recordOpenMarker(e) {
		return this.#s.recordOpenMarker(e, this.#o), this;
	}
	getOpenMarker() {
		return this.#s.getOpenMarker();
	}
	recordCloseMarker(e) {
		return this.#s.recordCloseMarker(e, this.#o), this;
	}
	beginMarkedContent(e) {
		return this.#s.beginMarkedContent(e), this;
	}
	endMarkedContent(e) {
		return this.#s.endMarkedContent(e, this.#o), this;
	}
	pushBaseTransform(e) {
		return this.#s.pushBaseTransform(e), this;
	}
	popBaseTransform() {
		return this.#s.popBaseTransform(), this;
	}
	recordSimpleData(e, t) {
		return this.#e[e] = t, this;
	}
	recordIncrementalData(e, t) {
		return this.#t[e].push(t), this;
	}
	resetIncrementalData(e, t) {
		return this.#t[e].length = 0, this;
	}
	recordNamedData(e, t) {
		return this.#n.set(e, t), this;
	}
	recordSimpleDataFromNamed(e, t, n) {
		this.#e[e] = this.#n.get(t) ?? n;
	}
	recordFutureForcedDependency(e, t) {
		return this.recordIncrementalData(xt, t), this;
	}
	inheritSimpleDataAsFutureForcedDependencies(e) {
		for (let t of e) t in this.#e && this.recordFutureForcedDependency(t, this.#e[t]);
		return this;
	}
	inheritPendingDependenciesAsFutureForcedDependencies() {
		for (let e of this.#r) this.recordFutureForcedDependency(xt, e);
		return this;
	}
	resetBBox(e) {
		return this.#s.resetBBox(e), this;
	}
	recordClipBox(e, t, n, r, i, a) {
		return this.#s.recordClipBox(e, t, n, r, i, a), this;
	}
	recordBBox(e, t, n, r, i, a) {
		return this.#s.recordBBox(e, t, n, r, i, a), this;
	}
	recordCharacterBBox(e, t, n, r = 1, i = 0, a = 0, o) {
		let s = n.bbox, c, l;
		if (s && (c = s[2] !== s[0] && s[3] !== s[1] && this.#i.get(n), c !== !1 && (l = [
			0,
			0,
			0,
			0
		], q.axialAlignedBoundingBox(s, n.fontMatrix, l), (r !== 1 || i !== 0 || a !== 0) && Tt(r, -r, i, a, l), c))) return this.recordBBox(e, t, l[0], l[2], l[1], l[3]);
		if (!o) return this.recordFullPageBBox(e);
		let u = o();
		return s && l && c === void 0 && (c = l[0] <= i - u.actualBoundingBoxLeft && l[2] >= i + u.actualBoundingBoxRight && l[1] <= a - u.actualBoundingBoxAscent && l[3] >= a + u.actualBoundingBoxDescent, this.#i.set(n, c), c) ? this.recordBBox(e, t, l[0], l[2], l[1], l[3]) : this.recordBBox(e, t, i - u.actualBoundingBoxLeft, i + u.actualBoundingBoxRight, a - u.actualBoundingBoxAscent, a + u.actualBoundingBoxDescent);
	}
	recordFullPageBBox(e) {
		return this.#s.recordFullPageBBox(e), this;
	}
	getSimpleIndex(e) {
		return this.#e[e];
	}
	recordDependencies(e, t) {
		let n = this.#r, r = this.#e, i = this.#t;
		for (let e of t) e in this.#e ? n.add(r[e]) : e in i && i[e].forEach(n.add, n);
		return this;
	}
	recordNamedDependency(e, t) {
		return this.#n.has(t) && this.#r.add(this.#n.get(t)), this;
	}
	recordOperation(e, t = !1) {
		if (this.recordDependencies(e, [xt]), this.#a) {
			let t = Ot(this.#a, e), { dependencies: n } = t;
			this.#r.forEach(n.add, n), this.#s._savesStack.forEach(n.add, n), this.#s._markedContentStack.forEach(n.add, n), n.delete(e), t.isRenderingOperation = !0;
		}
		let n = !t && e === this.#s._pendingBBoxIdx;
		return this.#s.recordOperation(e, t, [
			this.#r,
			this.#s._savesStack,
			this.#s._markedContentStack
		]), n && this.#r.clear(), this;
	}
	recordShowTextOperation(e, t = !1) {
		let n = Array.from(this.#r);
		this.recordOperation(e, t), this.recordIncrementalData("sameLineText", e);
		for (let e of n) this.recordIncrementalData("sameLineText", e);
		return this;
	}
	bboxToClipBoxDropOperation(e, t = !1) {
		let n = !t && e === this.#s._pendingBBoxIdx;
		return this.#s.bboxToClipBoxDropOperation(e), n && this.#r.clear(), this;
	}
	take() {
		return this.#i.clear(), this.#s.take();
	}
	takeDebugMetadata() {
		return this.#a;
	}
}, jt = class e {
	#e;
	#t;
	#n;
	#r = 0;
	#i = 0;
	constructor(t, n, r) {
		if (t instanceof e && t.#n === !!r) return t;
		this.#e = t, this.#t = n, this.#n = !!r;
	}
	get clipBox() {
		return this.#e.clipBox;
	}
	growOperationsCount() {
		throw Error("Unreachable");
	}
	save(e) {
		return this.#i++, this.#e.save(this.#t), this;
	}
	restore(e) {
		return this.#i > 0 && (this.#e.restore(this.#t), this.#i--), this;
	}
	recordOpenMarker(e) {
		return this.#r++, this;
	}
	getOpenMarker() {
		return this.#r > 0 ? this.#t : this.#e.getOpenMarker();
	}
	recordCloseMarker(e) {
		return this.#r--, this;
	}
	beginMarkedContent(e) {
		return this;
	}
	endMarkedContent(e) {
		return this;
	}
	pushBaseTransform(e) {
		return this.#e.pushBaseTransform(e), this;
	}
	popBaseTransform() {
		return this.#e.popBaseTransform(), this;
	}
	recordSimpleData(e, t) {
		return this.#e.recordSimpleData(e, this.#t), this;
	}
	recordIncrementalData(e, t) {
		return this.#e.recordIncrementalData(e, this.#t), this;
	}
	resetIncrementalData(e, t) {
		return this.#e.resetIncrementalData(e, this.#t), this;
	}
	recordNamedData(e, t) {
		return this;
	}
	recordSimpleDataFromNamed(e, t, n) {
		return this.#e.recordSimpleDataFromNamed(e, t, this.#t), this;
	}
	recordFutureForcedDependency(e, t) {
		return this.#e.recordFutureForcedDependency(e, this.#t), this;
	}
	inheritSimpleDataAsFutureForcedDependencies(e) {
		return this.#e.inheritSimpleDataAsFutureForcedDependencies(e), this;
	}
	inheritPendingDependenciesAsFutureForcedDependencies() {
		return this.#e.inheritPendingDependenciesAsFutureForcedDependencies(), this;
	}
	resetBBox(e) {
		return this.#n || this.#e.resetBBox(this.#t), this;
	}
	recordClipBox(e, t, n, r, i, a) {
		return this.#n || this.#e.recordClipBox(this.#t, t, n, r, i, a), this;
	}
	recordBBox(e, t, n, r, i, a) {
		return this.#n || this.#e.recordBBox(this.#t, t, n, r, i, a), this;
	}
	recordCharacterBBox(e, t, n, r, i, a, o) {
		return this.#n || this.#e.recordCharacterBBox(this.#t, t, n, r, i, a, o), this;
	}
	recordFullPageBBox(e) {
		return this.#n || this.#e.recordFullPageBBox(this.#t), this;
	}
	getSimpleIndex(e) {
		return this.#e.getSimpleIndex(e);
	}
	recordDependencies(e, t) {
		return this.#e.recordDependencies(this.#t, t), this;
	}
	recordNamedDependency(e, t) {
		return this.#e.recordNamedDependency(this.#t, t), this;
	}
	recordOperation(e) {
		return this.#e.recordOperation(this.#t, !0), this;
	}
	recordShowTextOperation(e) {
		return this.#e.recordShowTextOperation(this.#t, !0), this;
	}
	bboxToClipBoxDropOperation(e) {
		return this.#n || this.#e.bboxToClipBoxDropOperation(this.#t, !0), this;
	}
	take() {
		throw Error("Unreachable");
	}
	takeDebugMetadata() {
		throw Error("Unreachable");
	}
}, Mt = {
	stroke: [
		"path",
		"transform",
		"filter",
		"strokeColor",
		"strokeAlpha",
		"lineWidth",
		"lineCap",
		"lineJoin",
		"miterLimit",
		"dash"
	],
	fill: [
		"path",
		"transform",
		"filter",
		"fillColor",
		"fillAlpha",
		"globalCompositeOperation",
		"SMask"
	],
	imageXObject: [
		"transform",
		"SMask",
		"filter",
		"fillAlpha",
		"strokeAlpha",
		"globalCompositeOperation"
	],
	rawFillPath: [
		"filter",
		"fillColor",
		"fillAlpha"
	],
	showText: [
		"transform",
		"leading",
		"charSpacing",
		"wordSpacing",
		"hScale",
		"textRise",
		"moveText",
		"textMatrix",
		"font",
		"fontObj",
		"filter",
		"fillColor",
		"textRenderingMode",
		"SMask",
		"fillAlpha",
		"strokeAlpha",
		"globalCompositeOperation",
		"sameLineText"
	],
	transform: ["transform"],
	transformAndFill: [
		"transform",
		"filter",
		"fillColor"
	]
}, Nt = class e {
	#e;
	#t;
	#n = 4;
	#r = 0;
	#i = new e.#a(this.#n * 6);
	static #a = K.isFloat16ArraySupported ? Float16Array : Float32Array;
	constructor(e) {
		this.#e = e.width, this.#t = e.height;
	}
	record(t, n, r, i) {
		if (this.#r === this.#n) {
			this.#n *= 2;
			let t = new e.#a(this.#n * 6);
			t.set(this.#i), this.#i = t;
		}
		let a = X(t), o;
		if (i[0] !== Infinity) {
			let e = f.slice();
			q.axialAlignedBoundingBox([
				0,
				-r,
				n,
				0
			], a, e);
			let t = q.intersect(i, e);
			if (!t) return;
			let [s, c, l, u] = t;
			if (s !== e[0] || c !== e[1] || l !== e[2] || u !== e[3]) {
				let e = Math.atan2(a[1], a[0]), t = Math.abs(Math.sin(e)), n = Math.abs(Math.cos(e));
				if (t < 1e-6 || n < 1e-6 || Math.abs(t - n) < 1e-6) o = [
					s,
					c,
					s,
					u,
					l,
					c
				];
				else {
					let e = l - s, r = u - c, i = t * t, a = n * n, d = n * t, f = a - i, p = (r * a - e * d) / f;
					o = [
						s + (r * d - e * i) / f,
						c,
						s,
						c + p,
						l,
						u - p
					];
				}
			}
		}
		o || (o = [
			0,
			-r,
			0,
			0,
			n,
			-r
		], q.applyTransform(o, a, 0), q.applyTransform(o, a, 2), q.applyTransform(o, a, 4)), o[0] /= this.#e, o[1] /= this.#t, o[2] /= this.#e, o[3] /= this.#t, o[4] /= this.#e, o[5] /= this.#t, this.#i.set(o, this.#r * 6), this.#r++;
	}
	take() {
		return this.#i.subarray(0, this.#r * 6);
	}
}, Pt = /\p{Cc}/u;
function Ft(e) {
	let t = e[0];
	if (e.length < 2 || t !== "\"" && t !== "'" || e.at(-1) !== t) return !1;
	let n = e.length - 1;
	for (let r = 1; r < n; r++) {
		let i = e[r];
		if (i === t || Pt.test(i) || i === "\\" && (++r >= n || Pt.test(e[r]))) return !1;
	}
	return !0;
}
function It(e) {
	return Ft(e) ? e : `"${e.replaceAll(/["\\\p{Cc}]/gu, (e) => e === "\"" || e === "\\" ? `\\${e}` : `\\${e.codePointAt(0).toString(16)} `)}"`;
}
var Lt = class {
	#e = /* @__PURE__ */ new Set();
	#t = /* @__PURE__ */ new Set();
	#n = null;
	constructor({ ownerDocument: e = globalThis.document, styleElement: t = null }) {
		this._document = e, this.styleElement = null, this.loadingRequests = [], this.loadTestFontId = 0;
	}
	addNativeFontFace(e) {
		this.#e.add(e), this._document.fonts.add(e);
	}
	removeNativeFontFace(e) {
		this.#e.delete(e), this._document.fonts.delete(e);
	}
	insertRule(e) {
		let t = this.#r();
		t.insertRule(e, t.cssRules.length);
	}
	#r() {
		if (this.#n) return this.#n;
		let e = this._document.defaultView?.CSSStyleSheet || globalThis.CSSStyleSheet;
		if (!this.styleElement && e) {
			let { adoptedStyleSheets: t } = this._document;
			if (t) {
				let n = new e();
				return t.push(n), this.#n = n;
			}
		}
		return this.styleElement || (this.styleElement = this._document.createElement("style"), this._document.documentElement.getElementsByTagName("head")[0].append(this.styleElement)), this.#n = this.styleElement.sheet;
	}
	clear() {
		for (let e of this.#e) this._document.fonts.delete(e);
		if (this.#e.clear(), this.#t.clear(), this.#n) {
			let { adoptedStyleSheets: e } = this._document;
			e?.includes(this.#n) && (this._document.adoptedStyleSheets = e.filter((e) => e !== this.#n)), this.#n = null;
		}
		this.styleElement?.remove(), this.styleElement = null;
	}
	async loadSystemFont({ systemFontInfo: e, disableFontFace: t, _inspectFont: n }) {
		if (e && !this.#t.has(e.loadedName)) {
			if (L(!t, "loadSystemFont shouldn't be called when `disableFontFace` is set."), this.isFontLoadingAPISupported) {
				let { loadedName: t, src: r, style: i } = e, a = new FontFace(t, r, i);
				this.addNativeFontFace(a);
				try {
					await a.load(), this.#t.add(t), n?.(e);
				} catch {
					F(`Cannot load system font: ${e.baseFontName}, installing it could help to improve PDF rendering.`), this.removeNativeFontFace(a);
				}
				return;
			}
			I("Not implemented: loadSystemFont without the Font Loading API.");
		}
	}
	async bind(e) {
		if (e.attached || e.missingFile && !e.systemFontInfo) return;
		if (e.attached = !0, e.systemFontInfo) {
			await this.loadSystemFont(e);
			return;
		}
		if (this.isFontLoadingAPISupported) {
			let t = e.createNativeFontFace();
			if (t) {
				this.addNativeFontFace(t);
				try {
					await t.loaded;
				} catch (n) {
					throw F(`Failed to load font '${t.family}': '${n}'.`), e.disableFontFace = !0, n;
				}
			}
			return;
		}
		let t = e.createFontFaceRule();
		if (t) {
			if (this.insertRule(t), this.isSyncFontLoadingSupported) return;
			await this.#i(e);
		}
	}
	get isFontLoadingAPISupported() {
		return H(this, "isFontLoadingAPISupported", !!this._document?.fonts);
	}
	get isSyncFontLoadingSupported() {
		return H(this, "isSyncFontLoadingSupported", d || K.platform.isFirefox);
	}
	#i(e) {
		function t() {
			for (L(!a.done, "completeRequest() cannot be called twice."), a.done = !0; n.length > 0 && n[0].done;) {
				let e = n.shift();
				setTimeout(e.resolve, 0);
			}
		}
		let { loadingRequests: n } = this, { promise: r, resolve: i } = Promise.withResolvers(), a = {
			done: !1,
			resolve: i
		};
		n.push(a), this._loadTestFont ??= atob("T1RUTwALAIAAAwAwQ0ZGIDHtZg4AAAOYAAAAgUZGVE1lkzZwAAAEHAAAABxHREVGABQAFQAABDgAAAAeT1MvMlYNYwkAAAEgAAAAYGNtYXABDQLUAAACNAAAAUJoZWFk/xVFDQAAALwAAAA2aGhlYQdkA+oAAAD0AAAAJGhtdHgD6AAAAAAEWAAAAAZtYXhwAAJQAAAAARgAAAAGbmFtZVjmdH4AAAGAAAAAsXBvc3T/hgAzAAADeAAAACAAAQAAAAEAALZRFsRfDzz1AAsD6AAAAADOBOTLAAAAAM4KHDwAAAAAA+gDIQAAAAgAAgAAAAAAAAABAAADIQAAAFoD6AAAAAAD6AABAAAAAAAAAAAAAAAAAAAAAQAAUAAAAgAAAAQD6AH0AAUAAAKKArwAAACMAooCvAAAAeAAMQECAAACAAYJAAAAAAAAAAAAAQAAAAAAAAAAAAAAAFBmRWQAwAAuAC4DIP84AFoDIQAAAAAAAQAAAAAAAAAAACAAIAABAAAADgCuAAEAAAAAAAAAAQAAAAEAAAAAAAEAAQAAAAEAAAAAAAIAAQAAAAEAAAAAAAMAAQAAAAEAAAAAAAQAAQAAAAEAAAAAAAUAAQAAAAEAAAAAAAYAAQAAAAMAAQQJAAAAAgABAAMAAQQJAAEAAgABAAMAAQQJAAIAAgABAAMAAQQJAAMAAgABAAMAAQQJAAQAAgABAAMAAQQJAAUAAgABAAMAAQQJAAYAAgABWABYAAAAAAAAAwAAAAMAAAAcAAEAAAAAADwAAwABAAAAHAAEACAAAAAEAAQAAQAAAC7//wAAAC7////TAAEAAAAAAAABBgAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAD/gwAyAAAAAQAAAAAAAAAAAAAAAAAAAAABAAQEAAEBAQJYAAEBASH4DwD4GwHEAvgcA/gXBIwMAYuL+nz5tQXkD5j3CBLnEQACAQEBIVhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYAAABAQAADwACAQEEE/t3Dov6fAH6fAT+fPp8+nwHDosMCvm1Cvm1DAz6fBQAAAAAAAABAAAAAMmJbzEAAAAAzgTjFQAAAADOBOQpAAEAAAAAAAAADAAUAAQAAAABAAAAAgABAAAAAAAAAAAD6AAAAAAAAA==");
		function o(e, t) {
			return e.charCodeAt(t) << 24 | e.charCodeAt(t + 1) << 16 | e.charCodeAt(t + 2) << 8 | e.charCodeAt(t + 3) & 255;
		}
		function s(e) {
			return String.fromCharCode(e >> 24 & 255, e >> 16 & 255, e >> 8 & 255, e & 255);
		}
		function c(e, t, n, r) {
			let i = e.substring(0, t), a = e.substring(t + n);
			return i + r + a;
		}
		let l, u, d = this._document.createElement("canvas");
		d.width = 1, d.height = 1;
		let f = d.getContext("2d"), p = 0;
		function m(e, t) {
			if (++p > 30) {
				F("Load test font never loaded."), t();
				return;
			}
			if (f.font = "30px " + e, f.fillText(".", 0, 20), f.getImageData(0, 0, 1, 1).data[3] > 0) {
				t();
				return;
			}
			setTimeout(m.bind(null, e, t));
		}
		let h = `lt${Date.now()}${this.loadTestFontId++}`, g = this._loadTestFont;
		g = c(g, 976, h.length, h);
		let _ = 1482184792, v = o(g, 16);
		for (l = 0, u = h.length - 3; l < u; l += 4) v = v - _ + o(h, l) | 0;
		l < h.length && (v = v - _ + o(h + "XXX", l) | 0), g = c(g, 16, 4, s(v));
		let y = `@font-face {font-family:"${h}";src:${`url(data:font/opentype;base64,${btoa(g)});`}}`;
		this.insertRule(y);
		let b = this._document.createElement("div");
		b.style.visibility = "hidden", b.style.width = b.style.height = "10px", b.style.position = "absolute", b.style.top = b.style.left = "0px";
		for (let t of [e.loadedName, h]) {
			let e = this._document.createElement("span");
			e.textContent = "Hi", e.style.fontFamily = t, b.append(e);
		}
		return this._document.body.append(b), m(h, () => {
			b.remove(), t();
		}), r;
	}
}, Rt = class {
	#e = /* @__PURE__ */ new Map();
	#t;
	constructor(e, t = null, n, r) {
		this.#t = e, this._inspectFont = t, n && (this.charProcOperatorList = n), r && Object.assign(this, r);
	}
	createNativeFontFace() {
		let { data: e } = this;
		if (!e || this.disableFontFace) return null;
		let t;
		if (!this.cssFontInfo) t = new FontFace(this.loadedName, e, {});
		else {
			let n = { weight: this.cssFontInfo.fontWeight };
			this.cssFontInfo.italicAngle && (n.style = `oblique ${this.cssFontInfo.italicAngle}deg`), t = new FontFace(It(this.cssFontInfo.fontFamily), e, n);
		}
		return this._inspectFont?.(this), t;
	}
	createFontFaceRule() {
		let { data: e } = this;
		if (!e || this.disableFontFace) return null;
		let t = `url(data:${this.mimetype};base64,${e.toBase64()});`, n;
		if (!this.cssFontInfo) n = `@font-face {font-family:"${this.loadedName}";src:${t}}`;
		else {
			let e = `font-weight: ${this.cssFontInfo.fontWeight};`;
			this.cssFontInfo.italicAngle && (e += `font-style: oblique ${this.cssFontInfo.italicAngle}deg;`), n = `@font-face {font-family:${It(this.cssFontInfo.fontFamily)};${e}src:${t}}`;
		}
		return this._inspectFont?.(this, t), n;
	}
	getPathGenerator(e, t) {
		let n = this.#e.get(t);
		if (n) return n;
		let r = `${this.loadedName}_path_${t}`, i;
		try {
			i = e.get(r);
		} catch (e) {
			F(`getPathGenerator - ignoring character: "${e}".`);
		}
		return n = Ye(i?.path), this.fontExtraProperties || e.delete(r), this.#e.set(t, n), n;
	}
	get black() {
		return this.#t.black;
	}
	get bold() {
		return this.#t.bold;
	}
	get disableFontFace() {
		return this.#t.disableFontFace;
	}
	set disableFontFace(e) {
		H(this, "disableFontFace", !!e);
	}
	get fontExtraProperties() {
		return this.#t.fontExtraProperties;
	}
	get isInvalidPDFjsFont() {
		return this.#t.isInvalidPDFjsFont;
	}
	get isType3Font() {
		return this.#t.isType3Font;
	}
	get italic() {
		return this.#t.italic;
	}
	get missingFile() {
		return this.#t.missingFile;
	}
	get remeasure() {
		return this.#t.remeasure;
	}
	get vertical() {
		return this.#t.vertical;
	}
	get bbox() {
		return this.#t.bbox;
	}
	get fontMatrix() {
		return this.#t.fontMatrix;
	}
	get fallbackName() {
		return this.#t.fallbackName;
	}
	get loadedName() {
		return this.#t.loadedName;
	}
	get mimetype() {
		return this.missingFile ? null : "font/opentype";
	}
	get data() {
		return this.#t.data;
	}
	clearData() {
		this.#t.clearData();
	}
	get cssFontInfo() {
		return this.#t.cssFontInfo;
	}
	get systemFontInfo() {
		return this.#t.systemFontInfo;
	}
}, zt = class {
	static strings = [
		"fontFamily",
		"fontWeight",
		"italicAngle"
	];
}, Bt = class {
	static strings = [
		"css",
		"loadedName",
		"baseFontName",
		"src"
	];
}, Vt = class {
	static bools = [
		"black",
		"bold",
		"disableFontFace",
		"fontExtraProperties",
		"isInvalidPDFjsFont",
		"isType3Font",
		"italic",
		"missingFile",
		"remeasure",
		"vertical"
	];
	static strings = ["fallbackName", "loadedName"];
	static OFFSET_BBOX = Math.ceil(this.bools.length * 2 / 8);
	static OFFSET_FONT_MATRIX = this.OFFSET_BBOX + 1 + 8;
	static OFFSET_STRINGS = this.OFFSET_FONT_MATRIX + 1 + 48;
}, Ht = class {
	static KIND = 0;
	static HAS_BBOX = 1;
	static HAS_BACKGROUND = 2;
	static SHADING_TYPE = 3;
	static N_COORD = 4;
	static N_COLOR = 8;
	static N_STOP = 12;
	static N_FIGURES = 16;
}, Ut = class {
	static get decoder() {
		return H(this, "decoder", new TextDecoder());
	}
	static get encoder() {
		return H(this, "encoder", new TextEncoder());
	}
};
function Wt(e, t, n, r = 0) {
	let { decoder: i } = Ut;
	for (let e = 0; e < n; e++) r += t.getUint32(r) + 4;
	let a = t.getUint32(r);
	return i.decode(new Uint8Array(e, r + 4, a));
}
var Gt = class {
	#e;
	#t;
	constructor(e) {
		this.#e = e, this.#t = new DataView(e);
	}
	#n(e) {
		return L(e < zt.strings.length, "Invalid string index"), Wt(this.#e, this.#t, e);
	}
	get fontFamily() {
		return H(this, "fontFamily", this.#n(0));
	}
	get fontWeight() {
		return H(this, "fontWeight", this.#n(1));
	}
	get italicAngle() {
		return H(this, "italicAngle", this.#n(2));
	}
}, Kt = class {
	#e;
	#t;
	constructor(e) {
		this.#e = e, this.#t = new DataView(e);
	}
	#n(e) {
		return L(e < Bt.strings.length, "Invalid string index"), Wt(this.#e, this.#t, e, 4);
	}
	get css() {
		return H(this, "css", this.#n(0));
	}
	get loadedName() {
		return H(this, "loadedName", this.#n(1));
	}
	get baseFontName() {
		return H(this, "baseFontName", this.#n(2));
	}
	get src() {
		return H(this, "src", this.#n(3));
	}
	get style() {
		let e = 0;
		e += 4 + this.#t.getUint32(e);
		let t = Wt(this.#e, this.#t, 0, e), n = Wt(this.#e, this.#t, 1, e);
		return H(this, "style", {
			style: t,
			weight: n
		});
	}
}, qt = class {
	#e;
	#t;
	constructor(e) {
		this.#e = e, this.#t = new DataView(e);
	}
	#n(e) {
		L(e < Vt.bools.length, "Invalid boolean index");
		let t = Math.floor(e / 4), n = e * 2 % 8, r = this.#t.getUint8(t) >> n & 3;
		return r === 0 ? void 0 : r === 2;
	}
	get black() {
		return H(this, "black", this.#n(0));
	}
	get bold() {
		return H(this, "bold", this.#n(1));
	}
	get disableFontFace() {
		return H(this, "disableFontFace", this.#n(2));
	}
	get fontExtraProperties() {
		return H(this, "fontExtraProperties", this.#n(3));
	}
	get isInvalidPDFjsFont() {
		return H(this, "isInvalidPDFjsFont", this.#n(4));
	}
	get isType3Font() {
		return H(this, "isType3Font", this.#n(5));
	}
	get italic() {
		return H(this, "italic", this.#n(6));
	}
	get missingFile() {
		return H(this, "missingFile", this.#n(7));
	}
	get remeasure() {
		return H(this, "remeasure", this.#n(8));
	}
	get vertical() {
		return H(this, "vertical", this.#n(9));
	}
	#r(e, t, n, r) {
		let i = this.#t.getUint8(e++);
		if (i === 0) return;
		L(i === t, "Invalid array length.");
		let a = Array(i);
		for (let t = 0; t < i; t++) a[t] = this.#t[n](e, !0), e += r;
		return a;
	}
	get bbox() {
		return H(this, "bbox", this.#r(Vt.OFFSET_BBOX, 4, "getInt16", 2));
	}
	get fontMatrix() {
		return H(this, "fontMatrix", this.#r(Vt.OFFSET_FONT_MATRIX, 6, "getFloat64", 8));
	}
	#i(e) {
		return L(e < Vt.strings.length, "Invalid string index"), Wt(this.#e, this.#t, e, Vt.OFFSET_STRINGS + 4);
	}
	get fallbackName() {
		return H(this, "fallbackName", this.#i(0));
	}
	get loadedName() {
		return H(this, "loadedName", this.#i(1));
	}
	#a(e) {
		let t = Vt.OFFSET_STRINGS;
		for (let n = 0; n <= e; n++) t += 4 + this.#t.getUint32(t);
		let n = this.#t.getUint32(t);
		return {
			offset: t,
			length: n
		};
	}
	get data() {
		let { offset: e, length: t } = this.#a(2);
		return t ? new Uint8Array(this.#e, e + 4, t) : void 0;
	}
	clearData() {
		let { offset: e, length: t } = this.#a(2);
		t && (this.#t.setUint32(e, 0), this.#e = new Uint8Array(this.#e, 0, e + 4).slice().buffer, this.#t = new DataView(this.#e));
	}
	get cssFontInfo() {
		let { offset: e, length: t } = this.#a(1), n = null;
		return t && (n = new Gt(new Uint8Array(this.#e, e + 4, t).slice().buffer)), H(this, "cssFontInfo", n);
	}
	get systemFontInfo() {
		let { offset: e, length: t } = this.#a(0), n = null;
		return t && (n = new Kt(new Uint8Array(this.#e, e + 4, t).slice().buffer)), H(this, "systemFontInfo", n);
	}
}, Jt = class {
	constructor(e) {
		this.buffer = e, this.view = new DataView(e), this.data = new Uint8Array(e);
	}
	getIR() {
		let e = this.view, t = this.data[Ht.KIND], n = !!this.data[Ht.HAS_BBOX], r = !!this.data[Ht.HAS_BACKGROUND], i = e.getUint32(Ht.N_COORD, !0), a = e.getUint32(Ht.N_COLOR, !0), o = e.getUint32(Ht.N_STOP, !0), s = 20, c = new Float32Array(this.buffer, s, i * 2);
		s += i * 8;
		let l = new Uint8Array(this.buffer, s, a * 4);
		s += a * 4;
		let u = [];
		for (let t = 0; t < o; ++t) {
			let t = e.getFloat32(s, !0);
			s += 4;
			let n = e.getUint32(s, !0);
			s += 4, u.push([t, `#${n.toString(16).padStart(6, "0")}`]);
		}
		let d = null;
		if (n) {
			d = [];
			for (let t = 0; t < 4; ++t) d.push(e.getFloat32(s, !0)), s += 4;
		}
		let p = null;
		if (r && (p = new Uint8Array(this.buffer, s, 3), s += 3), t === 1) return [
			"RadialAxial",
			"axial",
			d,
			u,
			[c[0], c[1]],
			[c[2], c[3]],
			null,
			null
		];
		if (t === 2) return [
			"RadialAxial",
			"radial",
			d,
			u,
			[c[0], c[1]],
			[c[3], c[4]],
			c[2],
			c[5]
		];
		if (t === 3) {
			let e = this.data[Ht.SHADING_TYPE], t = null;
			if (c.length > 0) {
				t = f.slice();
				for (let e = 0, n = c.length; e < n; e += 2) q.pointBoundingBox(c[e], c[e + 1], t);
			}
			return [
				"Mesh",
				e,
				c,
				l,
				i,
				t,
				d,
				p
			];
		}
		throw Error(`Unsupported pattern kind: ${t}`);
	}
}, Yt = class {
	#e;
	constructor(e) {
		this.#e = e;
	}
	get path() {
		return K.isFloat16ArraySupported ? new Float16Array(this.#e) : new Float32Array(this.#e);
	}
};
function Xt(e) {
	if (e instanceof URL) return e;
	if (typeof e == "string") {
		if (d) {
			if (/^[a-z][a-z0-9\-+.]+:/i.test(e)) return new URL(e);
			let t = process.getBuiltinModule("url");
			return new URL(t.pathToFileURL(e));
		}
		let t = URL.parse(e, window.location);
		if (t) return t;
	}
	throw Error("Invalid PDF url data: either string or URL-object is expected in the url property.");
}
function Zt(e) {
	if (d && typeof Buffer < "u" && e instanceof Buffer) throw Error("Please provide binary data as `Uint8Array`, rather than `Buffer`.");
	if (e instanceof Uint8Array && e.byteLength === e.buffer.byteLength) return e;
	if (typeof e == "string") return ae(e);
	if (e instanceof ArrayBuffer || ArrayBuffer.isView(e) || typeof e == "object" && !isNaN(e?.length)) return new Uint8Array(e);
	throw Error("Invalid PDF binary data: either TypedArray, string, or array-like object is expected in the data property.");
}
function Qt(e) {
	if (typeof e != "string") return null;
	if (e.endsWith("/")) return e;
	throw Error(`Invalid factory url: "${e}" must include trailing slash.`);
}
var $t = (e) => typeof e == "object" && Number.isInteger(e?.num) && e.num >= 0 && Number.isInteger(e?.gen) && e.gen >= 0, en = de.bind(null, $t, (e) => typeof e == "object" && typeof e?.name == "string"), tn = class {
	#e = /* @__PURE__ */ new Map();
	#t = Promise.resolve();
	postMessage(e, t) {
		let n = { data: structuredClone(e, t ? { transfer: t } : null) };
		this.#t.then(() => {
			for (let [e] of this.#e) e.call(this, n);
		});
	}
	addEventListener(e, t, n = null) {
		let r = null;
		if (n?.signal instanceof AbortSignal) {
			let { signal: i } = n;
			if (i.aborted) {
				F("LoopbackPort - cannot use an `aborted` signal.");
				return;
			}
			let a = () => this.removeEventListener(e, t);
			r = () => i.removeEventListener("abort", a), i.addEventListener("abort", a);
		}
		this.#e.set(t, r);
	}
	removeEventListener(e, t) {
		this.#e.get(t)?.(), this.#e.delete(t);
	}
	terminate() {
		for (let [, e] of this.#e) e?.();
		this.#e.clear();
	}
}, nn = {
	DATA: 1,
	ERROR: 2
}, rn = {
	CANCEL: 1,
	CANCEL_COMPLETE: 2,
	CLOSE: 3,
	ENQUEUE: 4,
	ERROR: 5,
	PULL: 6,
	PULL_COMPLETE: 7,
	START_COMPLETE: 8
};
function an() {}
function Q(e) {
	if (e instanceof re || e instanceof te || e instanceof ee || e instanceof G || e instanceof W) return e;
	switch (e instanceof Error || typeof e == "object" && e || I("wrapReason: Expected \"reason\" to be a (possibly cloned) Error."), e.name) {
		case "AbortException": return new re(e.message);
		case "InvalidPDFException": return new te(e.message);
		case "PasswordException": return new ee(e.message, e.code);
		case "ResponseException": return new G(e.message, e.status, e.missing);
		case "UnknownErrorException": return new W(e.message, e.details);
	}
	return new W(e.message, e.toString());
}
var on = class {
	#e = /* @__PURE__ */ new Map();
	#t = /* @__PURE__ */ new Map();
	#n = 1;
	#r;
	#i = new AbortController();
	#a;
	#o = /* @__PURE__ */ new Map();
	#s = 1;
	#c = /* @__PURE__ */ new Map();
	#l;
	constructor(e, t, n) {
		this.#a = e, this.#l = t, this.#r = n, n.addEventListener("message", this.#u.bind(this), { signal: this.#i.signal });
	}
	#u({ data: e }) {
		if (e.targetName !== this.#a) return;
		if (e.stream) {
			this.#f(e);
			return;
		}
		if (e.callback) {
			let { callbackId: t, callback: n } = e, r = this.#t.get(t);
			if (!r) throw Error(`Cannot resolve callback ${t}`);
			if (this.#t.delete(t), n === nn.DATA) r.resolve(e.data);
			else if (n === nn.ERROR) r.reject(Q(e.reason));
			else throw Error("Unexpected callback case");
			return;
		}
		let t = this.#e.get(e.action);
		if (!t) throw Error(`Unknown action from worker: ${e.action}`);
		if (e.callbackId) {
			let n = this.#a, r = e.sourceName, i = this.#r;
			Promise.try(t, e.data).then((t) => {
				i.postMessage({
					sourceName: n,
					targetName: r,
					callback: nn.DATA,
					callbackId: e.callbackId,
					data: t
				});
			}, (t) => {
				i.postMessage({
					sourceName: n,
					targetName: r,
					callback: nn.ERROR,
					callbackId: e.callbackId,
					reason: Q(t)
				});
			});
			return;
		}
		if (e.streamId) {
			this.#d(e);
			return;
		}
		t(e.data);
	}
	on(e, t) {
		let n = this.#e;
		if (n.has(e)) throw Error(`There is already a "${e}" handler.`);
		n.set(e, t);
	}
	send(e, t, n) {
		this.#r.postMessage({
			sourceName: this.#a,
			targetName: this.#l,
			action: e,
			data: t
		}, n);
	}
	sendWithPromise(e, t, n) {
		let r = this.#n++, i = Promise.withResolvers();
		this.#t.set(r, i);
		try {
			this.#r.postMessage({
				sourceName: this.#a,
				targetName: this.#l,
				action: e,
				callbackId: r,
				data: t
			}, n);
		} catch (e) {
			i.reject(e);
		}
		return i.promise;
	}
	sendWithStream(e, t, n, r) {
		let i = this.#s++, a = this.#a, o = this.#l, s = this.#r;
		return new ReadableStream({
			start: (n) => {
				let c = Promise.withResolvers();
				return this.#o.set(i, {
					controller: n,
					startCall: c,
					pullCall: null,
					cancelCall: null,
					isClosed: !1
				}), s.postMessage({
					sourceName: a,
					targetName: o,
					action: e,
					streamId: i,
					data: t,
					desiredSize: n.desiredSize
				}, r), c.promise;
			},
			pull: (e) => {
				let t = Promise.withResolvers();
				return this.#o.get(i).pullCall = t, s.postMessage({
					sourceName: a,
					targetName: o,
					stream: rn.PULL,
					streamId: i,
					desiredSize: e.desiredSize
				}), t.promise;
			},
			cancel: (e) => {
				L(e instanceof Error, "cancel must have a valid reason");
				let t = Promise.withResolvers();
				return this.#o.get(i).cancelCall = t, this.#o.get(i).isClosed = !0, s.postMessage({
					sourceName: a,
					targetName: o,
					stream: rn.CANCEL,
					streamId: i,
					reason: Q(e)
				}), t.promise;
			}
		}, n);
	}
	#d(e) {
		let t = e.streamId, n = this.#a, r = e.sourceName, i = this.#r, a = this.#c, o = this.#e.get(e.action), s = {
			enqueue(e, a = 1, o) {
				if (this.isCancelled) return;
				let s = this.desiredSize;
				this.desiredSize -= a, s > 0 && this.desiredSize <= 0 && (this.sinkCapability = Promise.withResolvers(), this.ready = this.sinkCapability.promise), i.postMessage({
					sourceName: n,
					targetName: r,
					stream: rn.ENQUEUE,
					streamId: t,
					chunk: e
				}, o);
			},
			close() {
				this.isCancelled || (this.isCancelled = !0, i.postMessage({
					sourceName: n,
					targetName: r,
					stream: rn.CLOSE,
					streamId: t
				}), a.delete(t));
			},
			error(e) {
				L(e instanceof Error, "error must have a valid reason"), !this.isCancelled && (this.isCancelled = !0, i.postMessage({
					sourceName: n,
					targetName: r,
					stream: rn.ERROR,
					streamId: t,
					reason: Q(e)
				}));
			},
			sinkCapability: Promise.withResolvers(),
			onPull: null,
			onCancel: null,
			isCancelled: !1,
			desiredSize: e.desiredSize,
			ready: null
		};
		s.sinkCapability.resolve(), s.ready = s.sinkCapability.promise, a.set(t, s), Promise.try(o, e.data, s).then(() => {
			i.postMessage({
				sourceName: n,
				targetName: r,
				stream: rn.START_COMPLETE,
				streamId: t,
				success: !0
			});
		}, (e) => {
			i.postMessage({
				sourceName: n,
				targetName: r,
				stream: rn.START_COMPLETE,
				streamId: t,
				reason: Q(e)
			});
		});
	}
	#f(e) {
		let t = e.streamId, n = this.#a, r = e.sourceName, i = this.#r, a = this.#o.get(t), o = this.#c.get(t);
		switch (e.stream) {
			case rn.START_COMPLETE:
				e.success ? a.startCall.resolve() : a.startCall.reject(Q(e.reason));
				break;
			case rn.PULL_COMPLETE:
				e.success ? a.pullCall.resolve() : a.pullCall.reject(Q(e.reason));
				break;
			case rn.PULL:
				if (!o) {
					i.postMessage({
						sourceName: n,
						targetName: r,
						stream: rn.PULL_COMPLETE,
						streamId: t,
						success: !0
					});
					break;
				}
				o.desiredSize <= 0 && e.desiredSize > 0 && o.sinkCapability.resolve(), o.desiredSize = e.desiredSize, Promise.try(o.onPull || an).then(() => {
					i.postMessage({
						sourceName: n,
						targetName: r,
						stream: rn.PULL_COMPLETE,
						streamId: t,
						success: !0
					});
				}, (e) => {
					i.postMessage({
						sourceName: n,
						targetName: r,
						stream: rn.PULL_COMPLETE,
						streamId: t,
						reason: Q(e)
					});
				});
				break;
			case rn.ENQUEUE:
				if (L(a, "enqueue should have stream controller"), a.isClosed) break;
				a.controller.enqueue(e.chunk);
				break;
			case rn.CLOSE:
				if (L(a, "close should have stream controller"), a.isClosed) break;
				a.isClosed = !0, a.controller.close(), this.#p(a, t);
				break;
			case rn.ERROR:
				L(a, "error should have stream controller"), a.controller.error(Q(e.reason)), this.#p(a, t);
				break;
			case rn.CANCEL_COMPLETE:
				e.success ? a.cancelCall.resolve() : a.cancelCall.reject(Q(e.reason)), this.#p(a, t);
				break;
			case rn.CANCEL:
				if (!o) break;
				let s = Q(e.reason);
				Promise.try(o.onCancel || an, s).then(() => {
					i.postMessage({
						sourceName: n,
						targetName: r,
						stream: rn.CANCEL_COMPLETE,
						streamId: t,
						success: !0
					});
				}, (e) => {
					i.postMessage({
						sourceName: n,
						targetName: r,
						stream: rn.CANCEL_COMPLETE,
						streamId: t,
						reason: Q(e)
					});
				}), o.sinkCapability.reject(s), o.isCancelled = !0, this.#c.delete(t);
				break;
			default: throw Error("Unexpected stream case");
		}
	}
	async #p(e, t) {
		await Promise.allSettled([
			e.startCall?.promise,
			e.pullCall?.promise,
			e.cancelCall?.promise
		]), this.#o.delete(t);
	}
	destroy() {
		this.#i?.abort(), this.#i = null;
	}
}, sn = class {
	#e = Object.freeze({
		cMapUrl: "CMap",
		standardFontDataUrl: "font",
		wasmUrl: "wasm"
	});
	constructor({ cMapUrl: e = null, standardFontDataUrl: t = null, wasmUrl: n = null }) {
		this.cMapUrl = e, this.standardFontDataUrl = t, this.wasmUrl = n;
	}
	async fetch({ kind: e, filename: t }) {
		switch (e) {
			case "cMapUrl":
			case "standardFontDataUrl":
			case "wasmUrl": break;
			default: I(`Not implemented: ${e}`);
		}
		let n = this[e];
		if (!n) throw Error(`Ensure that the \`${e}\` API parameter is provided.`);
		let r = `${n}${t}`;
		return this._fetch(r, e).catch((t) => {
			throw Error(`Unable to load ${this.#e[e]} data at: ${r}`);
		});
	}
	async _fetch(e, t) {
		I("Abstract method `_fetch` called.");
	}
}, cn = class extends sn {
	async _fetch(e, t) {
		let n = await xe(e, t === "cMapUrl" && !e.endsWith(".bcmap") ? "text" : "bytes");
		return n instanceof Uint8Array ? n : ae(n);
	}
}, ln = class {
	#e = !1;
	constructor({ enableHWA: e = !1 }) {
		this.#e = e;
	}
	create(e, t) {
		if (e <= 0 || t <= 0) throw Error("Invalid canvas size");
		let n = this._createCanvas(e, t);
		return {
			canvas: n,
			context: n.getContext("2d", { willReadFrequently: !this.#e })
		};
	}
	reset({ canvas: e }, t, n) {
		if (!e) throw Error("Canvas is not specified");
		if (t <= 0 || n <= 0) throw Error("Invalid canvas size");
		e.width = t, e.height = n;
	}
	destroy(e) {
		let { canvas: t } = e;
		if (!t) throw Error("Canvas is not specified");
		t.width = t.height = 0, e.canvas = null, e.context = null;
	}
	_createCanvas(e, t) {
		I("Abstract method `_createCanvas` called.");
	}
}, un = class extends ln {
	constructor({ ownerDocument: e = globalThis.document, enableHWA: t = !1 }) {
		super({ enableHWA: t }), this._document = e;
	}
	_createCanvas(e, t) {
		let n = this._document.createElement("canvas");
		return n.width = e, n.height = t, n;
	}
}, dn = class {
	addFilter(e) {
		return "none";
	}
	addHCMFilter(e, t) {
		return "none";
	}
	addAlphaFilter(e) {
		return "none";
	}
	addLuminosityFilter(e) {
		return "none";
	}
	addKnockoutFilter(e = 0) {
		return "none";
	}
	addHighlightHCMFilter(e, t, n, r, i) {
		return "none";
	}
	addSelectionHCMFilter(e, t) {
		return "none";
	}
	addSelectionFilter() {
		return "none";
	}
	createSelectionStyle(e = null) {
		return null;
	}
	destroy(e = !1) {}
}, fn = class extends dn {
	#e;
	#t;
	#n;
	#r;
	#i;
	#a;
	#o = 0;
	constructor({ docId: e, ownerDocument: t = globalThis.document }) {
		super(), this.#r = e, this.#i = t;
	}
	get #s() {
		return this.#t ||= /* @__PURE__ */ new Map();
	}
	get #c() {
		return this.#a ||= /* @__PURE__ */ new Map();
	}
	get #l() {
		if (!this.#n) {
			let e = this.#i.createElement("div"), { style: t } = e;
			t.colorScheme = "only light", t.visibility = "hidden", t.contain = "strict", t.width = t.height = 0, t.position = "absolute", t.top = t.left = 0, t.zIndex = -1;
			let n = this.#i.createElementNS(h, "svg");
			n.setAttribute("width", 0), n.setAttribute("height", 0), this.#n = this.#i.createElementNS(h, "defs"), e.append(n), n.append(this.#n), this.#i.body.append(e);
		}
		return this.#n;
	}
	#u(e) {
		let t = (e) => e && Array.from(e, (e) => e / 255).join(",");
		if (e.length === 1) {
			let n = t(e[0]);
			return [
				n,
				n,
				n
			];
		}
		let [n, r, i] = e;
		return [
			t(n),
			t(r),
			t(i)
		];
	}
	#d(e) {
		if (this.#e === void 0) {
			this.#e = "";
			let e = this.#i.URL;
			e !== this.#i.baseURI && (Ce(e) ? F("#createUrl: ignore \"data:\"-URL for performance reasons.") : this.#e = B(e, ""));
		}
		return `url(${this.#e}#${e})`;
	}
	addFilter(e) {
		if (!e) return "none";
		let t = this.#s.get(e);
		if (t) return t;
		let [n, r, i] = this.#u(e), a = e.length === 1 ? n : `${n}${r}${i}`;
		if (t = this.#s.get(a), t) return this.#s.set(e, t), t;
		let o = `g_${this.#r}_transfer_map_${this.#o++}`, s = this.#d(o);
		this.#s.set(e, s), this.#s.set(a, s);
		let c = this.#m(o);
		return this.#g(n, r, i, c), s;
	}
	addHCMFilter(e, t) {
		let n = `${e}-${t}`, r = "base", i = this.#c.get(r);
		if (i?.key === n || (i ? (i.filter?.remove(), i.key = n, i.url = "none", i.filter = null) : (i = {
			key: n,
			url: "none",
			filter: null
		}, this.#c.set(r, i)), !e || !t)) return i.url;
		let a = this.#v(e);
		e = q.makeHexColor(...a);
		let o = this.#v(t);
		if (t = q.makeHexColor(...o), this.#b(), e === "#000000" && t === "#ffffff" || e === t) return i.url;
		let s = Array.from({ length: 256 }, (e, t) => We(t / 255)).join(","), c = `g_${this.#r}_hcm_filter`, l = i.filter = this.#m(c);
		this.#g(s, s, s, l), this.#p(l);
		let u = (e, t) => {
			let n = a[e] / 255, r = o[e] / 255, i = Array(t + 1);
			for (let e = 0; e <= t; e++) i[e] = n + e / t * (r - n);
			return i.join(",");
		};
		return this.#g(u(0, 5), u(1, 5), u(2, 5), l), i.url = this.#d(c), i.url;
	}
	addSelectionHCMFilter(e, t) {
		return this.addHighlightHCMFilter("selection", e, t, "HighlightText", "Highlight");
	}
	addSelectionFilter() {
		return this.addHighlightHCMFilter("selection_default", "black", "white", "HighlightText", "Highlight");
	}
	createSelectionStyle(e = null) {
		let t = e ? this.addSelectionHCMFilter(e.foreground, e.background) : this.addSelectionFilter();
		return t === "none" || !K.platform.isFirefox ? null : {
			"backdrop-filter": t,
			"background-color": "transparent"
		};
	}
	addAlphaFilter(e) {
		let t = this.#s.get(e);
		if (t) return t;
		let [n] = this.#u([e]), r = `alpha_${n}`;
		if (t = this.#s.get(r), t) return this.#s.set(e, t), t;
		let i = `g_${this.#r}_alpha_map_${this.#o++}`, a = this.#d(i);
		this.#s.set(e, a), this.#s.set(r, a);
		let o = this.#m(i);
		return this.#_(n, o), a;
	}
	addLuminosityFilter(e) {
		let t = this.#s.get(e || "luminosity");
		if (t) return t;
		let n, r;
		if (e ? ([n] = this.#u([e]), r = `luminosity_${n}`) : r = "luminosity", t = this.#s.get(r), t) return this.#s.set(e, t), t;
		let i = `g_${this.#r}_luminosity_map_${this.#o++}`, a = this.#d(i);
		this.#s.set(e, a), this.#s.set(r, a);
		let o = this.#m(i);
		return this.#f(o), e && this.#_(n, o), a;
	}
	addKnockoutFilter(e = 0) {
		let t = e > 0 ? Math.min(1 / e, 1e6) : 1e6, n = `knockout_${t}`, r = this.#s.get(n);
		if (r) return r;
		let i = `g_${this.#r}_knockout_filter_${this.#o++}`, a = this.#d(i);
		this.#s.set(n, a);
		let o = this.#m(i), s = this.#i.createElementNS(h, "feComponentTransfer");
		o.append(s);
		let c = this.#i.createElementNS(h, "feFuncA");
		return c.setAttribute("type", "linear"), c.setAttribute("slope", `${t}`), c.setAttribute("intercept", "0"), s.append(c), a;
	}
	addHighlightHCMFilter(e, t, n, r, i) {
		let a = `${t}-${n}-${r}-${i}`, o = this.#c.get(e);
		if (o?.key === a || (o ? (o.filter?.remove(), o.key = a, o.url = "none", o.filter = null) : (o = {
			key: a,
			url: "none",
			filter: null
		}, this.#c.set(e, o)), !t || !n)) return o.url;
		let [s, c] = [t, n].map(this.#v.bind(this)), l = Math.round(.2126 * s[0] + .7152 * s[1] + .0722 * s[2]), u = Math.round(.2126 * c[0] + .7152 * c[1] + .0722 * c[2]), [d, f] = [r, i].map(this.#x.bind(this));
		u < l && ([l, u, d, f] = [
			u,
			l,
			f,
			d
		]), this.#b();
		let p = (e, t, n) => {
			let r = Array(256), i = (u - l) / n, a = e / 255, o = (t - e) / (255 * n), s = 0;
			for (let e = 0; e <= n; e++) {
				let t = Math.round(l + e * i), n = a + e * o;
				for (let e = s; e <= t; e++) r[e] = n;
				s = t + 1;
			}
			for (let e = s; e < 256; e++) r[e] = r[s - 1];
			return r.join(",");
		}, m = `g_${this.#r}_hcm_${e}_filter`, h = o.filter = this.#m(m);
		return this.#p(h), this.#g(p(d[0], f[0], 5), p(d[1], f[1], 5), p(d[2], f[2], 5), h), o.url = this.#d(m), o.url;
	}
	destroy(e = !1) {
		e && this.#a?.size || (this.#n?.parentNode.parentNode.remove(), this.#n = null, this.#t?.clear(), this.#t = null, this.#a?.clear(), this.#a = null, this.#o = 0);
	}
	#f(e) {
		let t = this.#i.createElementNS(h, "feColorMatrix");
		t.setAttribute("type", "matrix"), t.setAttribute("values", "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.3 0.59 0.11 0 0"), e.append(t);
	}
	#p(e) {
		let t = this.#i.createElementNS(h, "feColorMatrix");
		t.setAttribute("type", "matrix"), t.setAttribute("values", "0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"), e.append(t);
	}
	#m(e) {
		let t = this.#i.createElementNS(h, "filter");
		return t.setAttribute("color-interpolation-filters", "sRGB"), t.setAttribute("id", e), this.#l.append(t), t;
	}
	#h(e, t, n) {
		if (!n) return;
		let r = this.#i.createElementNS(h, t);
		r.setAttribute("type", "discrete"), r.setAttribute("tableValues", n), e.append(r);
	}
	#g(e, t, n, r) {
		let i = this.#i.createElementNS(h, "feComponentTransfer");
		r.append(i), this.#h(i, "feFuncR", e), this.#h(i, "feFuncG", t), this.#h(i, "feFuncB", n);
	}
	#_(e, t) {
		let n = this.#i.createElementNS(h, "feComponentTransfer");
		t.append(n), this.#h(n, "feFuncA", e);
	}
	#v(e) {
		return this.#l.style.color = "CanvasText", this.#l.style.backgroundColor = e, Ne(getComputedStyle(this.#l).getPropertyValue("background-color"));
	}
	#y(e) {
		return this.#l.style.color = "CanvasText", this.#l.style.backgroundColor = e, Me(getComputedStyle(this.#l).getPropertyValue("background-color"));
	}
	#b() {
		this.#l.style.color = "", this.#l.style.backgroundColor = "";
	}
	#x(e) {
		let [t, n, r, i] = this.#y(e);
		if (i === 1) return [
			t,
			n,
			r
		];
		let [a, o, s] = this.#v("Canvas");
		return [
			pn(t, a, i),
			pn(n, o, i),
			pn(r, s, i)
		];
	}
};
function pn(e, t, n) {
	return Math.round(n * e + (1 - n) * t);
}
d && F("Please use the `legacy` build in Node.js environments.");
async function mn(e) {
	let t = await process.getBuiltinModule("fs/promises").readFile(e);
	return new Uint8Array(t);
}
var hn = class extends dn {}, gn = class extends ln {
	_createCanvas(e, t) {
		return process.getBuiltinModule("module").createRequire(import.meta.url)("@napi-rs/canvas").createCanvas(e, t);
	}
}, _n = class extends sn {
	async _fetch(e, t) {
		return mn(e);
	}
};
function vn({ src: e, srcPos: t = 0, dest: n, width: r, height: i, nonBlackColor: a = 4294967295, inverseDecode: o = !1 }) {
	let s = K.isLittleEndian ? 4278190080 : 255, [c, l] = o ? [a, s] : [s, a], u = r >> 3, d = r & 7, f = c ^ l, p = e.length;
	n = new Uint32Array(n.buffer);
	let m = 0;
	for (let r = 0; r < i; ++r) {
		for (let r = t + u; t < r; ++t, m += 8) {
			let r = e[t];
			n[m] = c ^ -(r >> 7 & 1) & f, n[m + 1] = c ^ -(r >> 6 & 1) & f, n[m + 2] = c ^ -(r >> 5 & 1) & f, n[m + 3] = c ^ -(r >> 4 & 1) & f, n[m + 4] = c ^ -(r >> 3 & 1) & f, n[m + 5] = c ^ -(r >> 2 & 1) & f, n[m + 6] = c ^ -(r >> 1 & 1) & f, n[m + 7] = c ^ -(r & 1) & f;
		}
		if (d === 0) continue;
		let r = t < p ? e[t++] : 255;
		for (let e = 0; e < d; ++e, ++m) n[m] = c ^ -(r >> 7 - e & 1) & f;
	}
	return {
		srcPos: t,
		destPos: m
	};
}
function yn({ src: e, srcPos: t = 0, dest: n, destPos: r = 0, width: i, height: a }) {
	let o = 0, s = i * a * 3, c = s >> 2, l = new Uint32Array(e.buffer, t, c), u = K.isLittleEndian ? 4278190080 : 255;
	if (K.isLittleEndian) {
		for (; o < c - 2; o += 3, r += 4) {
			let e = l[o], t = l[o + 1], i = l[o + 2];
			n[r] = e | u, n[r + 1] = e >>> 24 | t << 8 | u, n[r + 2] = t >>> 16 | i << 16 | u, n[r + 3] = i >>> 8 | u;
		}
		for (let i = t + o * 4, a = t + s; i < a; i += 3) n[r++] = e[i] | e[i + 1] << 8 | e[i + 2] << 16 | u;
	} else {
		for (; o < c - 2; o += 3, r += 4) {
			let e = l[o], t = l[o + 1], i = l[o + 2];
			n[r] = e | u, n[r + 1] = e << 24 | t >>> 8 | u, n[r + 2] = t << 16 | i >>> 16 | u, n[r + 3] = i << 8 | u;
		}
		for (let i = t + o * 4, a = t + s; i < a; i += 3) n[r++] = e[i] << 24 | e[i + 1] << 16 | e[i + 2] << 8 | u;
	}
	return {
		srcPos: t + s,
		destPos: r
	};
}
var bn = "\nstruct Uniforms {\n  offsetX      : f32,\n  offsetY      : f32,\n  scaleX       : f32,\n  scaleY       : f32,\n  paddedWidth  : f32,\n  paddedHeight : f32,\n  borderSize   : f32,\n  _pad         : f32,\n};\n\n@group(0) @binding(0) var<uniform> u : Uniforms;\n\nstruct VertexInput {\n  @location(0) position : vec2<f32>,\n  @location(1) color    : vec4<f32>,\n};\n\nstruct VertexOutput {\n  @builtin(position) position : vec4<f32>,\n  @location(0)       color    : vec3<f32>,\n};\n\n@vertex\nfn vs_main(in : VertexInput) -> VertexOutput {\n  var out : VertexOutput;\n  let cx = (in.position.x + u.offsetX) * u.scaleX;\n  let cy = (in.position.y + u.offsetY) * u.scaleY;\n  out.position = vec4<f32>(\n    ((cx + u.borderSize) / u.paddedWidth) * 2.0 - 1.0,\n    1.0 - ((cy + u.borderSize) / u.paddedHeight) * 2.0,\n    0.0,\n    1.0\n  );\n  out.color = in.color.rgb;\n  return out;\n}\n\n@fragment\nfn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {\n  return vec4<f32>(in.color, 1.0);\n}\n", xn = new class {
	#e = null;
	#t = null;
	#n = null;
	#r = null;
	async #i() {
		if (!globalThis.navigator?.gpu) return !1;
		try {
			let e = await navigator.gpu.requestAdapter();
			return e ? (this.#r = navigator.gpu.getPreferredCanvasFormat(), this.#t = await e.requestDevice(), !0) : !1;
		} catch {
			return !1;
		}
	}
	init() {
		return this.#e ||= this.#i();
	}
	get isReady() {
		return this.#t !== null;
	}
	loadMeshShader() {
		if (!this.#t || this.#n) return;
		let e = this.#t.createShaderModule({ code: bn });
		this.#n = this.#t.createRenderPipeline({
			layout: "auto",
			vertex: {
				module: e,
				entryPoint: "vs_main",
				buffers: [{
					arrayStride: 8,
					attributes: [{
						shaderLocation: 0,
						offset: 0,
						format: "float32x2"
					}]
				}, {
					arrayStride: 4,
					attributes: [{
						shaderLocation: 1,
						offset: 0,
						format: "unorm8x4"
					}]
				}]
			},
			fragment: {
				module: e,
				entryPoint: "fs_main",
				targets: [{ format: this.#r }]
			},
			primitive: { topology: "triangle-list" }
		});
	}
	draw(e, t, n, r, i, a, o, s) {
		this.loadMeshShader();
		let c = this.#t, { offsetX: l, offsetY: u, scaleX: d, scaleY: f } = r, p = c.createBuffer({
			size: Math.max(e.byteLength, 4),
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
		});
		e.byteLength > 0 && c.queue.writeBuffer(p, 0, e);
		let m = c.createBuffer({
			size: Math.max(t.byteLength, 4),
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
		});
		t.byteLength > 0 && c.queue.writeBuffer(m, 0, t);
		let h = c.createBuffer({
			size: 32,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		c.queue.writeBuffer(h, 0, new Float32Array([
			l,
			u,
			d,
			f,
			a,
			o,
			s,
			0
		]));
		let g = c.createBindGroup({
			layout: this.#n.getBindGroupLayout(0),
			entries: [{
				binding: 0,
				resource: { buffer: h }
			}]
		}), _ = new OffscreenCanvas(a, o), v = _.getContext("webgpu");
		v.configure({
			device: c,
			format: this.#r,
			alphaMode: i ? "opaque" : "premultiplied"
		});
		let y = i ? {
			r: i[0] / 255,
			g: i[1] / 255,
			b: i[2] / 255,
			a: 1
		} : {
			r: 0,
			g: 0,
			b: 0,
			a: 0
		}, b = c.createCommandEncoder(), x = b.beginRenderPass({ colorAttachments: [{
			view: v.getCurrentTexture().createView(),
			clearValue: y,
			loadOp: "clear",
			storeOp: "store"
		}] });
		return n > 0 && (x.setPipeline(this.#n), x.setBindGroup(0, g), x.setVertexBuffer(0, p), x.setVertexBuffer(1, m), x.draw(n)), x.end(), c.queue.submit([b.finish()]), p.destroy(), m.destroy(), h.destroy(), _.transferToImageBitmap();
	}
}();
function Sn() {
	return xn.init();
}
function Cn() {
	return xn.isReady;
}
function wn() {
	xn.loadMeshShader();
}
function Tn(e, t, n, r, i, a, o, s) {
	return xn.draw(e, t, n, r, i, a, o, s);
}
var En = {
	FILL: "Fill",
	STROKE: "Stroke",
	SHADING: "Shading"
};
function Dn(e, t) {
	if (!t) return;
	let n = t[2] - t[0], r = t[3] - t[1], i = new Path2D();
	i.rect(t[0], t[1], n, r), e.clip(i);
}
var On = class {
	matrix = null;
	isModifyingCurrentTransform() {
		return !1;
	}
	getPattern() {
		I("Abstract method `getPattern` called.");
	}
}, kn = class extends On {
	constructor(e) {
		super(), this._type = e[1], this._bbox = e[2], this._colorStops = e[3], this._p0 = e[4], this._p1 = e[5], this._r0 = e[6], this._r1 = e[7];
	}
	isOriginBased() {
		return this._p0[0] === 0 && this._p0[1] === 0 && (!this.isRadial() || this._p1[0] === 0 && this._p1[1] === 0);
	}
	isRadial() {
		return this._type === "radial";
	}
	areConic() {
		if (!this.isRadial()) return !1;
		let e = Math.hypot(this._p0[0] - this._p1[0], this._p0[1] - this._p1[1]);
		return e + this._r1 > this._r0 && e + this._r0 > this._r1;
	}
	_createGradient(e, t = null) {
		let n, r = this._p0, i = this._p1;
		if (t && (r = r.slice(), i = i.slice(), q.applyTransform(r, t), q.applyTransform(i, t)), this._type === "axial") n = e.createLinearGradient(r[0], r[1], i[0], i[1]);
		else if (this._type === "radial") {
			let a = this._r0, o = this._r1;
			if (t) {
				let e = /* @__PURE__ */ new Float32Array(2);
				q.singularValueDecompose2dScale(t, e), a *= e[0], o *= e[0];
			}
			n = e.createRadialGradient(r[0], r[1], a, i[0], i[1], o);
		}
		for (let e of this._colorStops) n.addColorStop(e[0], e[1]);
		return n;
	}
	_createReversedGradient(e, t = null) {
		let n = this._p1, r = this._p0;
		t && (n = n.slice(), r = r.slice(), q.applyTransform(n, t), q.applyTransform(r, t));
		let i = this._r1, a = this._r0;
		if (t) {
			let e = /* @__PURE__ */ new Float32Array(2);
			q.singularValueDecompose2dScale(t, e), i *= e[0], a *= e[0];
		}
		let o = e.createRadialGradient(n[0], n[1], i, r[0], r[1], a), s = this._colorStops.map(([e, t]) => [1 - e, t]).reverse();
		for (let [e, t] of s) o.addColorStop(e, t);
		return o;
	}
	_createRasterPattern(e, t, n, r, i, a) {
		let o = Math.ceil(r[2] - r[0]) || 1, s = Math.ceil(r[3] - r[1]) || 1, c = t.canvasFactory.create(o, s), l = c.context;
		l.clearRect(0, 0, o, s), l.beginPath(), l.rect(0, 0, o, s), l.translate(-r[0], -r[1]), n = q.transform(n, [
			1,
			0,
			0,
			1,
			r[0],
			r[1]
		]), l.transform(...i), Dn(l, this._bbox), this.areConic() && (l.fillStyle = this._createReversedGradient(l), l.fill()), l.fillStyle = this._createGradient(l), l.fill(), a?.applyToCanvas(l);
		let u = e.createPattern(c.canvas, "no-repeat");
		return t.canvasFactory.destroy(c), u.setTransform(new DOMMatrix(n)), u;
	}
	getPattern(e, t, n, r) {
		let i = t.current.transferMapsFallback;
		if (r === En.STROKE || r === En.FILL) {
			if (this.isOriginBased() && !i) {
				let r = q.transform(n, t.baseTransform);
				this.matrix && (r = q.transform(r, this.matrix));
				let i = .001, a = Math.hypot(r[0], r[1]), o = Math.hypot(r[2], r[3]), s = (r[0] * r[2] + r[1] * r[3]) / (a * o);
				if (Math.abs(s) < i) {
					if (this.isRadial()) {
						if (Math.abs(a - o) < i) return this._createGradient(e, r);
					} else return this._createGradient(e, r);
				}
			}
			let a = t.current.getClippedPathBoundingBox(r, X(e)) || [
				0,
				0,
				0,
				0
			], o = this.matrix ? q.transform(t.baseTransform, this.matrix) : t.baseTransform;
			return this._createRasterPattern(e, t, n, a, o, i);
		}
		return i && n ? this._createRasterPattern(e, t, n, t.current.clipBox, X(e), i) : (this.areConic() && (e.save(), Dn(e, this._bbox), e.fillStyle = this._createReversedGradient(e), e.fillRect(-1e10, -1e10, 2e10, 2e10), e.restore()), Dn(e, this._bbox), this._createGradient(e));
	}
};
function An(e, t, n, r, i, a, o, s) {
	let c = t.coords, l = t.colors, u = e.data, d = e.width * 4, f;
	c[n * 2 + 1] > c[r * 2 + 1] && (f = n, n = r, r = f, f = a, a = o, o = f), c[r * 2 + 1] > c[i * 2 + 1] && (f = r, r = i, i = f, f = o, o = s, s = f), c[n * 2 + 1] > c[r * 2 + 1] && (f = n, n = r, r = f, f = a, a = o, o = f);
	let p = (c[n * 2] + t.offsetX) * t.scaleX, m = (c[n * 2 + 1] + t.offsetY) * t.scaleY, h = (c[r * 2] + t.offsetX) * t.scaleX, g = (c[r * 2 + 1] + t.offsetY) * t.scaleY, _ = (c[i * 2] + t.offsetX) * t.scaleX, v = (c[i * 2 + 1] + t.offsetY) * t.scaleY;
	if (m >= v) return;
	let y = l[a * 4], b = l[a * 4 + 1], x = l[a * 4 + 2], S = l[o * 4], C = l[o * 4 + 1], w = l[o * 4 + 2], T = l[s * 4], E = l[s * 4 + 1], D = l[s * 4 + 2], O = Math.round(m), k = Math.round(v), A, j, M, N, P, F, I, L;
	for (let e = O; e <= k; e++) {
		if (e < g) {
			let t = e < m ? 0 : (m - e) / (m - g);
			A = p - (p - h) * t, j = y - (y - S) * t, M = b - (b - C) * t, N = x - (x - w) * t;
		} else {
			let t;
			t = e > v ? 1 : g === v ? 0 : (g - e) / (g - v), A = h - (h - _) * t, j = S - (S - T) * t, M = C - (C - E) * t, N = w - (w - D) * t;
		}
		let t;
		t = e < m ? 0 : e > v ? 1 : (m - e) / (m - v), P = p - (p - _) * t, F = y - (y - T) * t, I = b - (b - E) * t, L = x - (x - D) * t;
		let n = Math.round(Math.min(A, P)), r = Math.round(Math.max(A, P)), i = d * e + n * 4;
		for (let e = n; e <= r; e++) t = (A - e) / (A - P), t < 0 ? t = 0 : t > 1 && (t = 1), u[i++] = j - (j - F) * t | 0, u[i++] = M - (M - I) * t | 0, u[i++] = N - (N - L) * t | 0, u[i++] = 255;
	}
}
var jn = class extends On {
	constructor(e) {
		super(), this._posData = e[2], this._colData = e[3], this._vertexCount = e[4], this._bounds = e[5], this._bbox = e[6], this._background = e[7], wn();
	}
	_createMeshCanvas(e, t, n, r = null) {
		let i = 1.1, a = 3e3, o = Math.floor(this._bounds[0]), s = Math.floor(this._bounds[1]), c = Math.ceil(this._bounds[2]) - o, l = Math.ceil(this._bounds[3]) - s, u = Math.min(Math.ceil(Math.abs(c * e[0] * i)), a) || 1, d = Math.min(Math.ceil(Math.abs(l * e[1] * i)), a) || 1, f = c ? c / u : 1, p = l ? l / d : 1, m = {
			coords: this._posData,
			colors: this._colData,
			offsetX: -o,
			offsetY: -s,
			scaleX: 1 / f,
			scaleY: 1 / p
		}, h = u + 4, g = d + 4, _ = n.create(h, g);
		if (Cn() && this._vertexCount > 48) _.context.drawImage(Tn(this._posData, this._colData, this._vertexCount, m, t, h, g, 2), 0, 0);
		else {
			let e = _.context.createImageData(u, d);
			if (t) {
				let n = e.data;
				for (let e = 0, r = n.length; e < r; e += 4) n[e] = t[0], n[e + 1] = t[1], n[e + 2] = t[2], n[e + 3] = 255;
			}
			for (let t = 0, n = this._vertexCount; t < n; t += 3) An(e, m, t, t + 1, t + 2, t, t + 1, t + 2);
			_.context.putImageData(e, 2, 2);
		}
		return r?.applyToCanvas(_.context), {
			canvas: _.canvas,
			offsetX: o - 2 * f,
			offsetY: s - 2 * p,
			scaleX: f,
			scaleY: p
		};
	}
	isModifyingCurrentTransform() {
		return !0;
	}
	getPattern(e, t, n, r) {
		Dn(e, this._bbox);
		let i = /* @__PURE__ */ new Float32Array(2);
		if (r === En.SHADING) q.singularValueDecompose2dScale(X(e), i);
		else if (this.matrix) {
			q.singularValueDecompose2dScale(this.matrix, i);
			let [e, n] = i;
			q.singularValueDecompose2dScale(t.baseTransform, i), i[0] *= e, i[1] *= n;
		} else q.singularValueDecompose2dScale(t.baseTransform, i);
		let a = this._createMeshCanvas(i, r === En.SHADING ? null : this._background, t.canvasFactory, t.current.transferMapsFallback);
		r !== En.SHADING && (e.setTransform(...t.baseTransform), this.matrix && e.transform(...this.matrix)), e.translate(a.offsetX, a.offsetY), e.scale(a.scaleX, a.scaleY);
		let o = e.createPattern(a.canvas, "no-repeat");
		return t.canvasFactory.destroy(a), o;
	}
}, Mn = class extends On {
	getPattern() {
		return "hotpink";
	}
};
function Nn(e) {
	switch (e[0]) {
		case "RadialAxial": return new kn(e);
		case "Mesh": return new jn(e);
		case "Dummy": return new Mn();
	}
	throw Error(`Unknown IR type: ${e[0]}`);
}
var Pn = {
	COLORED: 1,
	UNCOLORED: 2
}, Fn = class e {
	static MAX_PATTERN_SIZE = 3e3;
	constructor(e, t, n, r) {
		this.color = e[1], this.operatorList = e[2], this.matrix = e[3], this.bbox = e[4], this.xstep = e[5], this.ystep = e[6], this.paintType = e[7], this.tilingType = e[8], this.needsIsolation = e[9] ?? !0, this.ctx = t, this.canvasGraphicsFactory = n, this.baseTransform = r, this.patternBaseMatrix = this.matrix ? q.transform(r, this.matrix) : r;
	}
	canSkipPatternCanvas([e, t, n, r]) {
		let [i, a, o, s] = this.bbox, c = Math.abs(this.xstep), l = Math.abs(this.ystep);
		if (e > c + 1e-6 || t > l + 1e-6) return null;
		let u = Math.floor((n - o) / c) + 1, d = Math.ceil((n + e - i) / c) - 1, f = Math.floor((r - s) / l) + 1, p = Math.ceil((r + t - a) / l) - 1;
		return d <= u && p <= f ? [u, f] : null;
	}
	updatePatternDims(e, t) {
		let n = f.slice();
		q.axialAlignedBoundingBox(e, q.inverseTransform(this.patternBaseMatrix), n), t[0] = n[2] - n[0], t[1] = n[3] - n[1], t[2] = n[0], t[3] = n[1];
	}
	_renderTileCanvas(e, t, n, r) {
		let [i, a, o, s] = this.bbox, c = e.canvasFactory.create(n.size, r.size), l = c.context, u = this.canvasGraphicsFactory.createCanvasGraphics(l, t);
		return u.groupLevel = e.groupLevel, u.current.transferMapsFallback = e.current.transferMapsFallback, this.setFillAndStrokeStyleToContext(u, this.paintType, this.color), l.translate(-n.scale * i, -r.scale * a), u.transform(0, n.scale, 0, 0, r.scale, 0, 0), l.save(), u.dependencyTracker?.save(), this.clipBbox(u, i, a, o, s), u.baseTransform = X(u.ctx), u.executeOperatorList(this.operatorList), u.endDrawing(), u.dependencyTracker?.restore(), l.restore(), c;
	}
	_getCombinedScales() {
		let e = /* @__PURE__ */ new Float32Array(2);
		q.singularValueDecompose2dScale(this.matrix, e);
		let [t, n] = e;
		return q.singularValueDecompose2dScale(this.baseTransform, e), [t * e[0], n * e[1]];
	}
	drawPattern(e, t, n = !1, [r, i], a) {
		let [o, s, c, l] = this.bbox, u = e.dependencyTracker;
		if (u && (e.dependencyTracker = new jt(u, a)), e.save(), n ? e.ctx.clip(t, "evenodd") : e.ctx.clip(t), e.ctx.setTransform(...this.patternBaseMatrix), e.ctx.translate(r * this.xstep, i * this.ystep), this.needsIsolation || e.ctx.globalAlpha !== 1 || e.ctx.globalCompositeOperation !== "source-over" || e.inSMaskMode) {
			let t = c - o, n = l - s, [r, i] = this._getCombinedScales(), u = this.getSizeAndScale(t, this.ctx.canvas.width, r), d = this.getSizeAndScale(n, this.ctx.canvas.height, i), f = this._renderTileCanvas(e, a, u, d);
			e.ctx.drawImage(f.canvas, o, s, t, n), e.canvasFactory.destroy(f);
		} else this.setFillAndStrokeStyleToContext(e, this.paintType, this.color), this.clipBbox(e, o, s, c, l), e.baseTransformStack.push(e.baseTransform), e.baseTransform = X(e.ctx), e.executeOperatorList(this.operatorList), e.baseTransform = e.baseTransformStack.pop();
		e.restore(), u && (e.dependencyTracker = u);
	}
	createPatternCanvas(e, t) {
		let [n, r, i, a] = this.bbox, o = i - n, s = a - r, { xstep: c, ystep: l } = this;
		c = Math.abs(c), l = Math.abs(l), P("TilingType: " + this.tilingType);
		let [u, d] = this._getCombinedScales(), f = o, p = s, m = !1, h = !1;
		Math.ceil(c * u) >= Math.ceil(o * u) ? f = c : m = !0, Math.ceil(l * d) >= Math.ceil(s * d) ? p = l : h = !0;
		let g = this.getSizeAndScale(f, this.ctx.canvas.width, u), _ = this.getSizeAndScale(p, this.ctx.canvas.height, d), v = this._renderTileCanvas(e, t, g, _);
		if (m || h) {
			let t = v.canvas;
			m && (f = c), h && (p = l);
			let i = this.getSizeAndScale(f, this.ctx.canvas.width, u), a = this.getSizeAndScale(p, this.ctx.canvas.height, d), g = i.size, _ = a.size, y = e.canvasFactory.create(g, _), b = y.context, x = m ? Math.min(Math.floor(o / c), Math.ceil(t.width / g)) : 0, S = h ? Math.min(Math.floor(s / l), Math.ceil(t.height / _)) : 0, C = t, w = null;
			if (h) {
				w = e.canvasFactory.create(t.width, _);
				let n = w.context;
				for (let e = S; e >= 0; e--) n.drawImage(t, 0, _ * e, t.width, _, 0, 0, t.width, _);
				C = w.canvas;
			}
			for (let e = x; e >= 0; e--) b.drawImage(C, g * e, 0, g, _, 0, 0, g, _);
			return w && e.canvasFactory.destroy(w), e.canvasFactory.destroy(v), {
				canvas: y.canvas,
				canvasEntry: y,
				scaleX: i.scale,
				scaleY: a.scale,
				offsetX: n,
				offsetY: r
			};
		}
		return {
			canvas: v.canvas,
			canvasEntry: v,
			scaleX: g.scale,
			scaleY: _.scale,
			offsetX: n,
			offsetY: r
		};
	}
	getSizeAndScale(t, n, r) {
		let i = Math.max(e.MAX_PATTERN_SIZE, n), a = Math.ceil(t * r);
		return a >= i ? a = i : r = a / t, {
			scale: r,
			size: a
		};
	}
	clipBbox(e, t, n, r, i) {
		let a = r - t, o = i - n, s = new Path2D();
		s.rect(t, n, a, o), q.axialAlignedBoundingBox([
			t,
			n,
			r,
			i
		], X(e.ctx), e.current.minMax), e.ctx.clip(s), e.current.updateClipFromPath();
	}
	setFillAndStrokeStyleToContext(e, t, n) {
		switch (t) {
			case Pn.COLORED:
				n = "#000000";
				break;
			case Pn.UNCOLORED: break;
			default: throw new ne(`Unsupported paint type: ${t}`);
		}
		let { ctx: r, current: i } = e;
		i.patternFill = i.patternStroke = !1, r.fillStyle = r.strokeStyle = i.transferMapsFallback?.applyToColor(n) ?? n, i.fillColor = i.strokeColor = n;
	}
	isModifyingCurrentTransform() {
		return !1;
	}
	getPattern(e, t, n, r, i) {
		let a = r === En.SHADING ? n : q.transform(n, this.patternBaseMatrix), o = this.createPatternCanvas(t, i), s = new DOMMatrix(a);
		s = s.translate(o.offsetX, o.offsetY), s = s.scale(1 / o.scaleX, 1 / o.scaleY);
		let c = e.createPattern(o.canvas, "repeat");
		return t.canvasFactory.destroy(o.canvasEntry), c.setTransform(s), c;
	}
}, In = 16, Ln = 100, Rn = 15, zn = 10, Bn = 16, Vn = /* @__PURE__ */ new Float32Array(2);
function Hn(e, t) {
	if (e._removeMirroring) throw Error("Context is already forwarding operations.");
	let n = /* @__PURE__ */ new Map();
	for (let r of [
		"save",
		"restore",
		"rotate",
		"scale",
		"translate",
		"transform",
		"setTransform",
		"resetTransform",
		"clip",
		"moveTo",
		"lineTo",
		"bezierCurveTo",
		"quadraticCurveTo",
		"arc",
		"arcTo",
		"ellipse",
		"rect",
		"roundRect",
		"closePath",
		"beginPath"
	]) {
		let i = e[r];
		typeof i == "function" && typeof t[r] == "function" && (n.set(r, i), e[r] = function(...e) {
			return t[r](...e), i.apply(this, e);
		});
	}
	e._removeMirroring = () => {
		for (let [t, r] of n) e[t] = r;
		delete e._removeMirroring;
	};
}
function Un(e, t, n, r, i, a, o, s, c, l) {
	let [u, d, f, p, m, h] = X(e);
	if (d === 0 && f === 0) {
		let g = o * u + m, _ = Math.round(g), v = s * p + h, y = Math.round(v), b = (o + c) * u + m, x = Math.abs(Math.round(b) - _) || 1, S = (s + l) * p + h, C = Math.abs(Math.round(S) - y) || 1;
		return e.setTransform(Math.sign(u), 0, 0, Math.sign(p), _, y), e.drawImage(t, n, r, i, a, 0, 0, x, C), e.setTransform(u, d, f, p, m, h), [x, C];
	}
	if (u === 0 && p === 0) {
		let g = s * f + m, _ = Math.round(g), v = o * d + h, y = Math.round(v), b = (s + l) * f + m, x = Math.abs(Math.round(b) - _) || 1, S = (o + c) * d + h, C = Math.abs(Math.round(S) - y) || 1;
		return e.setTransform(0, Math.sign(d), Math.sign(f), 0, _, y), e.drawImage(t, n, r, i, a, 0, 0, C, x), e.setTransform(u, d, f, p, m, h), [C, x];
	}
	e.drawImage(t, n, r, i, a, o, s, c, l);
	let g = Math.hypot(u, d), _ = Math.hypot(f, p);
	return [g * c, _ * l];
}
var Wn = class {
	alphaIsShape = !1;
	fontSize = 0;
	fontSizeScale = 1;
	textMatrix = null;
	textMatrixScale = 1;
	fontMatrix = m;
	leading = 0;
	x = 0;
	y = 0;
	lineX = 0;
	lineY = 0;
	charSpacing = 0;
	wordSpacing = 0;
	textHScale = 1;
	textRenderingMode = C.FILL;
	textRise = 0;
	fillColor = "#000000";
	strokeColor = "#000000";
	tilingPatternDims = null;
	patternFill = !1;
	patternStroke = !1;
	fillAlpha = 1;
	strokeAlpha = 1;
	lineWidth = 1;
	activeSMask = null;
	transferMaps = "none";
	transferMapsFallback = null;
	minMax = p.slice();
	constructor(e, t) {
		this.clipBox = new Float32Array([
			0,
			0,
			e,
			t
		]);
	}
	clone() {
		let e = Object.create(this);
		return e.clipBox = this.clipBox.slice(), e.minMax = this.minMax.slice(), e.tilingPatternDims = this.tilingPatternDims?.slice(), e;
	}
	getPathBoundingBox(e = En.FILL, t = null) {
		let n = this.minMax.slice();
		if (e === En.STROKE) {
			t || I("Stroke bounding box must include transform."), q.singularValueDecompose2dScale(t, Vn);
			let e = Vn[0] * this.lineWidth / 2, r = Vn[1] * this.lineWidth / 2;
			n[0] -= e, n[1] -= r, n[2] += e, n[3] += r;
		}
		return n;
	}
	updateClipFromPath() {
		let e = q.intersect(this.clipBox, this.getPathBoundingBox());
		this.startNewPathAndClipBox(e || [
			0,
			0,
			0,
			0
		]);
	}
	isEmptyClip() {
		return this.minMax[0] === Infinity;
	}
	startNewPathAndClipBox(e) {
		this.clipBox.set(e, 0), this.minMax.set(p, 0);
	}
	getClippedPathBoundingBox(e = En.FILL, t = null) {
		return q.intersect(this.clipBox, this.getPathBoundingBox(e, t));
	}
};
function Gn(e, t) {
	let { width: n, height: r, kind: i } = t, a = r % Bn, o = (r - a) / Bn, s = a === 0 ? o : o + 1, c = e.createImageData(n, Bn), l = 0, u = t.data, d = c.data, f;
	if (i === w.GRAYSCALE_1BPP) for (f = 0; f < s; f++) ({srcPos: l} = vn({
		src: u,
		srcPos: l,
		dest: d,
		width: n,
		height: f < o ? Bn : a
	})), e.putImageData(c, 0, f * Bn);
	else if (i === w.RGBA_32BPP) {
		let t = 0, r = n * Bn * 4;
		for (f = 0; f < o; f++) d.set(u.subarray(l, l + r)), l += r, e.putImageData(c, 0, t), t += Bn;
		f < s && (r = n * a * 4, d.set(u.subarray(l, l + r)), e.putImageData(c, 0, t));
	} else if (i === w.RGB_24BPP) for (f = 0; f < s; f++) ({srcPos: l} = yn({
		src: u,
		srcPos: l,
		dest: new Uint32Array(d.buffer),
		width: n,
		height: f < o ? Bn : a
	})), e.putImageData(c, 0, f * Bn);
	else throw Error(`bad image kind: ${i}`);
}
function Kn(e, t) {
	if (t.bitmap) {
		e.drawImage(t.bitmap, 0, 0);
		return;
	}
	let { width: n, height: r } = t, i = r % Bn, a = (r - i) / Bn, o = i === 0 ? a : a + 1, s = e.createImageData(n, Bn), c = 0, l = t.data, u = s.data;
	for (let t = 0; t < o; t++) ({srcPos: c} = vn({
		src: l,
		srcPos: c,
		dest: u,
		width: n,
		height: t < a ? Bn : i,
		nonBlackColor: 0
	})), e.putImageData(s, 0, t * Bn);
}
function qn(e, t) {
	for (let n of [
		"strokeStyle",
		"fillStyle",
		"fillRule",
		"globalAlpha",
		"lineWidth",
		"lineCap",
		"lineJoin",
		"miterLimit",
		"globalCompositeOperation",
		"font",
		"filter"
	]) e[n] !== void 0 && (t[n] = e[n]);
	e.setLineDash !== void 0 && (t.setLineDash(e.getLineDash()), t.lineDashOffset = e.lineDashOffset);
}
function Jn(e) {
	e.strokeStyle = e.fillStyle = "#000000", e.fillRule = "nonzero", e.globalAlpha = 1, e.lineWidth = 1, e.lineCap = "butt", e.lineJoin = "miter", e.miterLimit = 10, e.globalCompositeOperation = "source-over", e.font = "10px sans-serif", e.setLineDash !== void 0 && (e.setLineDash([]), e.lineDashOffset = 0);
	let { filter: t } = e;
	t !== "none" && t !== "" && (e.filter = "none");
}
var Yn = class e {
	#e;
	constructor(t) {
		let [n, r = n, i = n] = t, { identityMap: a } = e;
		this.#e = [
			n || a,
			r || a,
			i || a
		];
	}
	static get identityMap() {
		return H(this, "identityMap", Uint8Array.from({ length: 256 }, (e, t) => t));
	}
	applyToColor(e) {
		if (typeof e != "string" || !e.startsWith("#")) return e;
		let [t, n, r] = Me(e), [i, a, o] = this.#e;
		return q.makeHexColor(i[t], a[n], o[r]);
	}
	applyToImageData({ data: e }) {
		let [t, n, r] = this.#e;
		for (let i = 0, a = e.length; i < a; i += 4) e[i] = t[e[i]], e[i + 1] = n[e[i + 1]], e[i + 2] = r[e[i + 2]];
	}
	applyToCanvas(e) {
		let { width: t, height: n } = e.canvas, r = e.getImageData(0, 0, t, n);
		this.applyToImageData(r), e.putImageData(r, 0, 0);
	}
};
function Xn(e, t) {
	if (t) return !0;
	q.singularValueDecompose2dScale(e, Vn);
	let n = Math.fround(Le.pixelRatio * be.PDF_TO_CSS_UNITS);
	return Vn[0] <= n && Vn[1] <= n;
}
var Zn = [
	"butt",
	"round",
	"square"
], Qn = [
	"miter",
	"round",
	"bevel"
], $n = {}, er = {}, tr = class e {
	static #e = null;
	#t = 0;
	#n = 0;
	#r = null;
	#i = null;
	#a = null;
	#o = null;
	#s = 1;
	#c;
	#l = null;
	#u = [];
	constructor(e, t, n, r, i, { optionalContentConfig: a, markedContentStack: o = null }, s, c, l, u) {
		this.ctx = e, this.current = new Wn(this.ctx.canvas.width, this.ctx.canvas.height), this.stateStack = [], this.pendingClip = null, this.pendingEOFill = !1, this.commonObjs = t, this.objs = n, this.canvasFactory = r, this.filterFactory = i, this.groupStack = [], this.baseTransform = null, this.baseTransformStack = [], this.groupLevel = 0, this.smaskStack = [], this.tempSMask = null, this.smaskGroupCanvases = [], this.smaskPreparedEntry = null, this.smaskPreparedFor = null, this.smaskPreparedOffsetX = 0, this.smaskPreparedOffsetY = 0, this.smaskPreparedOOBAlpha = null, this.suspendedCtx = null, this.contentVisible = !0, this.markedContentStack = o || [], this.optionalContentConfig = a, this.cachedPatterns = /* @__PURE__ */ new Map(), this.annotationCanvasMap = s, this.viewportScale = 1, this.outputScaleX = 1, this.outputScaleY = 1, this.pageColors = c, this._cachedScaleForStroking = [-1, 0], this._cachedBitmapsMap = /* @__PURE__ */ new Map(), this.dependencyTracker = l ?? null, this.imagesTracker = u ?? null;
	}
	getObject(e, t, n = null) {
		return typeof t == "string" ? (this.dependencyTracker?.recordNamedDependency(e, t), t.startsWith("g_") ? this.commonObjs.get(t) : this.objs.get(t)) : n;
	}
	beginDrawing({ transform: e, viewport: t, transparency: n = !1, background: r = null }) {
		let i = this.ctx.canvas.width, a = this.ctx.canvas.height, o = this.ctx.fillStyle;
		if (this.ctx.fillStyle = r || "#ffffff", this.ctx.fillRect(0, 0, i, a), this.ctx.fillStyle = o, n) {
			let e = this.transparentCanvasEntry = this.canvasFactory.create(i, a);
			this.compositeCtx = this.ctx, {canvas: this.transparentCanvas, context: this.ctx} = e, this.ctx.save(), this.ctx.transform(...X(this.compositeCtx));
		}
		this.ctx.save(), Jn(this.ctx), e && (this.ctx.transform(...e), this.outputScaleX = e[0], this.outputScaleY = e[3]), this.ctx.transform(...t.transform), this.viewportScale = t.scale, this.baseTransform = X(this.ctx);
	}
	executeOperatorList(e, t, n, r, i) {
		let a = e.argsArray, o = e.fnArray, s = t || 0, c = a.length;
		if (c === s) return s;
		let l = c - s > zn && typeof n == "function", u = l ? Date.now() + Rn : 0, d = 0, f = this.commonObjs, p = this.objs, m, h;
		for (;;) {
			if (r !== void 0) {
				if (s === r.nextBreakPoint) return r.breakIt(s, n), s;
				if (r.shouldSkip(s)) {
					if (++s === c) return s;
					continue;
				}
			}
			if (!i || i(s, e)) {
				if (m = o[s], h = a[s] ?? null, m !== O.dependency) h === null ? this[m](s) : this[m](s, ...h);
				else for (let e of h) {
					this.dependencyTracker?.recordNamedData(e, s);
					let t = e.startsWith("g_") ? f : p;
					if (!t.has(e)) return t.get(e, n), s;
				}
			}
			if (s++, s === c) return s;
			if (l && ++d > zn) {
				if (Date.now() > u) return n(), s;
				d = 0;
			}
		}
	}
	#d() {
		for (; this.stateStack.length || this.inSMaskMode;) this.restore();
		this.current.activeSMask = null, this.ctx.restore(), this.transparentCanvas && (this.ctx = this.compositeCtx, this.ctx.save(), this.ctx.setTransform(1, 0, 0, 1, 0, 0), this.ctx.drawImage(this.transparentCanvas, 0, 0), this.ctx.restore(), this.canvasFactory.destroy(this.transparentCanvasEntry), this.transparentCanvas = null, this.transparentCanvasEntry = null);
	}
	endDrawing() {
		this.#d();
		for (let e of this.smaskGroupCanvases) this.canvasFactory.destroy(e);
		this.smaskGroupCanvases.length = 0, this._clearPreparedSMask(), this.tempSMask = null, this.smaskStack.length = 0;
		for (let e of this.#u) this.#x(e);
		this.#u.length = 0, this.#r = null, this.#i = null, this.#a = null, this.#o = null, this.#s = 1, this.#l = null, this.#n = 0, this.#t = 0, this.cachedPatterns.clear();
		for (let e of this._cachedBitmapsMap.values()) {
			for (let t of e.values()) typeof HTMLCanvasElement < "u" && t instanceof HTMLCanvasElement && (t.width = t.height = 0);
			e.clear();
		}
		this._cachedBitmapsMap.clear(), this.#f();
	}
	#f() {
		if (this.pageColors) {
			let e = this.filterFactory.addHCMFilter(this.pageColors.foreground, this.pageColors.background);
			if (e !== "none") {
				let t = this.ctx.filter;
				this.ctx.filter = e, this.ctx.drawImage(this.ctx.canvas, 0, 0), this.ctx.filter = t;
			}
		}
	}
	_scaleImage(e, t) {
		let n = e.width ?? e.displayWidth, r = e.height ?? e.displayHeight, i = Math.max(Math.hypot(t[0], t[1]), 1), a = Math.max(Math.hypot(t[2], t[3]), 1), o = [], s = i, c = a, l = n, u = r;
		for (; s > 2 && l > 1 || c > 2 && u > 1;) {
			let e = l, t = u;
			s > 2 && l > 1 && (e = Math.ceil(l / 2), s /= l / e), c > 2 && u > 1 && (t = Math.ceil(u / 2), c /= u / t), o.push({
				newWidth: e,
				newHeight: t
			}), l = e, u = t;
		}
		if (o.length === 0) return {
			img: e,
			paintWidth: n,
			paintHeight: r,
			tmpCanvas: null
		};
		if (o.length === 1) {
			let { newWidth: t, newHeight: i } = o[0], a = this.canvasFactory.create(t, i);
			return a.context.drawImage(e, 0, 0, n, r, 0, 0, t, i), {
				img: a.canvas,
				paintWidth: t,
				paintHeight: i,
				tmpCanvas: a
			};
		}
		let d = this.canvasFactory.create(1, 1), f = this.canvasFactory.create(1, 1), p = n, m = r, h = e;
		for (let { newWidth: e, newHeight: t } of o) this.canvasFactory.reset(f, e, t), f.context.drawImage(h, 0, 0, p, m, 0, 0, e, t), [d, f] = [f, d], h = d.canvas, p = e, m = t;
		return this.canvasFactory.destroy(f), {
			img: d.canvas,
			paintWidth: p,
			paintHeight: m,
			tmpCanvas: d
		};
	}
	_createMaskCanvas(e, t) {
		let n = this.ctx, { width: r, height: i } = t, a = this.current.patternFill, o = a ? this.current.fillColor : n.fillStyle, s = X(n), c, l, u, d;
		if ((t.bitmap || t.data) && t.count > 1) {
			let n = t.bitmap || t.data.buffer;
			l = JSON.stringify(a ? s : [s.slice(0, 4), o]), c = this._cachedBitmapsMap.getOrInsertComputed(n, J);
			let r = c.get(l);
			if (r && !a) {
				let t = Math.round(Math.min(s[0], s[2]) + s[4]), n = Math.round(Math.min(s[1], s[3]) + s[5]);
				return this.dependencyTracker?.recordDependencies(e, Mt.transformAndFill), {
					canvas: r,
					offsetX: t,
					offsetY: n
				};
			}
			u = r;
		}
		u || (d = this.canvasFactory.create(r, i), Kn(d.context, t));
		let f = q.transform(s, [
			1 / r,
			0,
			0,
			-1 / i,
			0,
			0
		]);
		f = q.transform(f, [
			1,
			0,
			0,
			1,
			0,
			-i
		]);
		let m = p.slice();
		q.axialAlignedBoundingBox([
			0,
			0,
			r,
			i
		], f, m);
		let [h, g, _, v] = m, y = Math.round(_ - h) || 1, b = Math.round(v - g) || 1, x = this.canvasFactory.create(y, b), S = x.context, C = h, w = g;
		S.translate(-C, -w), S.transform(...f);
		let T = null;
		if (!u) {
			let e = this._scaleImage(d.canvas, Fe(S));
			u = e.img, T = e.tmpCanvas, u !== d.canvas && (this.canvasFactory.destroy(d), d = null), c && a && (c.set(l, u), T = null, d = null);
		}
		S.imageSmoothingEnabled = Xn(X(S), t.interpolate), Un(S, u, 0, 0, u.width, u.height, 0, 0, r, i), T && this.canvasFactory.destroy(T), d && this.canvasFactory.destroy(d), S.globalCompositeOperation = "source-in";
		let E = q.transform(Fe(S), [
			1,
			0,
			0,
			1,
			-C,
			-w
		]);
		return S.fillStyle = a ? o.getPattern(n, this, E, En.FILL, e) : o, S.fillRect(0, 0, r, i), c && !a && c.set(l, x.canvas), this.dependencyTracker?.recordDependencies(e, Mt.transformAndFill), {
			canvas: x.canvas,
			canvasEntry: c && !a ? null : x,
			offsetX: Math.round(C),
			offsetY: Math.round(w)
		};
	}
	setLineWidth(e, t) {
		this.dependencyTracker?.recordSimpleData("lineWidth", e), t !== this.current.lineWidth && (this._cachedScaleForStroking[0] = -1), this.current.lineWidth = t, this.ctx.lineWidth = t;
	}
	setLineCap(e, t) {
		this.dependencyTracker?.recordSimpleData("lineCap", e), this.ctx.lineCap = Zn[t];
	}
	setLineJoin(e, t) {
		this.dependencyTracker?.recordSimpleData("lineJoin", e), this.ctx.lineJoin = Qn[t];
	}
	setMiterLimit(e, t) {
		this.dependencyTracker?.recordSimpleData("miterLimit", e), this.ctx.miterLimit = t;
	}
	setDash(e, t, n) {
		this.dependencyTracker?.recordSimpleData("dash", e);
		let r = this.ctx;
		r.setLineDash !== void 0 && (r.setLineDash(t), r.lineDashOffset = n);
	}
	setRenderingIntent(e, t) {}
	setFlatness(e, t) {}
	setGState(e, t) {
		for (let [n, r] of t) switch (n) {
			case "LW":
				this.setLineWidth(e, r);
				break;
			case "LC":
				this.setLineCap(e, r);
				break;
			case "LJ":
				this.setLineJoin(e, r);
				break;
			case "ML":
				this.setMiterLimit(e, r);
				break;
			case "D":
				this.setDash(e, r[0], r[1]);
				break;
			case "RI":
				this.setRenderingIntent(e, r);
				break;
			case "FL":
				this.setFlatness(e, r);
				break;
			case "Font":
				this.setFont(e, r[0], r[1]);
				break;
			case "CA":
				this.dependencyTracker?.recordSimpleData("strokeAlpha", e), this.current.strokeAlpha = r;
				break;
			case "ca":
				this.dependencyTracker?.recordSimpleData("fillAlpha", e), this.ctx.globalAlpha = this.current.fillAlpha = r;
				break;
			case "BM":
				this.dependencyTracker?.recordSimpleData("globalCompositeOperation", e), this.ctx.globalCompositeOperation = r;
				break;
			case "SMask":
				this.dependencyTracker?.recordSimpleData("SMask", e), this.current.activeSMask = r ? this.tempSMask : null, this.current.activeSMask && (this.current.activeSMask.blendMode = this.ctx.globalCompositeOperation), this.tempSMask = null, this.checkSMaskState(e);
				break;
			case "TR": {
				this.dependencyTracker?.recordSimpleData("filter", e);
				let t = this.filterFactory.addFilter(r);
				this.ctx.filter = t;
				let n = null;
				r && (t === "none" || !K.isCanvasFilterSupported || this.ctx.filter === "none" || this.ctx.filter === "") && (this.ctx.filter = t = "none", n = new Yn(r)), this.current.transferMaps = t, (n || this.current.transferMapsFallback) && (this.current.transferMapsFallback = n, this.current.patternFill || (this.ctx.fillStyle = this.#y(this.current.fillColor)), this.current.patternStroke || (this.ctx.strokeStyle = this.#y(this.current.strokeColor)));
				break;
			}
		}
	}
	get inSMaskMode() {
		return !!this.suspendedCtx;
	}
	_clearPreparedSMask() {
		this.smaskPreparedEntry &&= (this.canvasFactory.destroy(this.smaskPreparedEntry), null), this.smaskPreparedFor = null, this.smaskPreparedOffsetX = 0, this.smaskPreparedOffsetY = 0, this.smaskPreparedOOBAlpha = null;
	}
	_ensurePreparedSMask(e) {
		e !== this.smaskPreparedFor && (this._clearPreparedSMask(), this._prepareSMaskCanvas(e));
	}
	checkSMaskState(e) {
		let t = this.inSMaskMode;
		this.current.activeSMask && !t ? this.beginSMaskMode(e) : !this.current.activeSMask && t ? this.endSMaskMode() : this.current.activeSMask && t && this._ensurePreparedSMask(this.current.activeSMask);
	}
	_prepareSMaskCanvas(e) {
		let { canvas: t, subtype: n, backdrop: r, transferMap: i } = e, a = n === "Luminosity" || n === "Alpha" && i;
		if (!a && !(n === "Luminosity" && r)) {
			this.smaskPreparedFor = e;
			return;
		}
		let o;
		if (n === "Luminosity" && r) {
			let [e, t, n] = Me(r), a = Math.round(.3 * e + .59 * t + .11 * n);
			o = i?.[a] ?? a;
		} else o = i?.[0] ?? 0;
		let { width: s, height: c } = this.ctx.canvas, l = t.width * t.height, u = s * c < 4 * l, d = a ? {
			url: n === "Alpha" ? this.filterFactory.addAlphaFilter(i) : this.filterFactory.addLuminosityFilter(i),
			subtype: n,
			transferMap: i
		} : null, f = n === "Luminosity" ? r : null, p, m, h;
		u ? (p = this._bakeSMaskCanvas(t, e.offsetX, e.offsetY, s, c, f, d), m = 0, h = 0) : (p = this._bakeSMaskCanvas(t, 0, 0, t.width, t.height, f, d), m = e.offsetX, h = e.offsetY), this.smaskPreparedEntry = p, this.smaskPreparedFor = e, this.smaskPreparedOffsetX = m, this.smaskPreparedOffsetY = h, this.smaskPreparedOOBAlpha = !u && o !== 0 ? o : null;
	}
	_bakeSMaskCanvas(e, t, n, r, i, a, o) {
		!a && !o && I("_bakeSMaskCanvas with neither backdrop nor filter");
		let s = this.canvasFactory.create(r, i), c = s.context;
		if (c.drawImage(e, t, n), a && (c.globalCompositeOperation = "destination-atop", c.fillStyle = a, c.fillRect(0, 0, r, i)), !o) return s;
		let l = this.canvasFactory.create(r, i), u = l.context;
		u.filter = o.url;
		let d = K.isCanvasFilterSupported && u.filter !== "none" && u.filter !== "";
		if (u.drawImage(s.canvas, 0, 0), K.isCanvasFilterSupported && (u.filter = "none"), !d) {
			let e = u.getImageData(0, 0, r, i), { data: t } = e, { transferMap: n } = o;
			if (o.subtype === "Luminosity") for (let e = 0, r = t.length; e < r; e += 4) {
				let r = .3 * t[e] + .59 * t[e + 1] + .11 * t[e + 2] + .5 | 0;
				t[e] = t[e + 1] = t[e + 2] = 0, t[e + 3] = n?.[r] ?? r;
			}
			else for (let e = 3, r = t.length; e < r; e += 4) t[e] = n[t[e]];
			u.putImageData(e, 0, 0);
		}
		return this.canvasFactory.destroy(s), l;
	}
	beginSMaskMode(e) {
		if (this.inSMaskMode) throw Error("beginSMaskMode called while already in smask mode");
		let { width: t, height: n } = this.ctx.canvas, r = this.canvasFactory.create(t, n);
		this.smaskScratchCanvas = r, this.suspendedCtx = this.ctx;
		let i = this.ctx = r.context;
		i.setTransform(this.suspendedCtx.getTransform()), qn(this.suspendedCtx, i), Hn(i, this.suspendedCtx), this._ensurePreparedSMask(this.current.activeSMask), this.setGState(e, [["BM", "source-over"]]);
	}
	endSMaskMode() {
		if (!this.inSMaskMode) throw Error("endSMaskMode called while not in smask mode");
		this.ctx._removeMirroring(), qn(this.ctx, this.suspendedCtx), this.ctx = this.suspendedCtx, this.suspendedCtx = null, this.canvasFactory.destroy(this.smaskScratchCanvas), this.smaskScratchCanvas = null, this._clearPreparedSMask();
	}
	#p(e, t = null, n = 1) {
		let { width: r, height: i } = e, a = t ?? this.canvasFactory.create(r, i), o = a.context;
		n = Math.round(n * 255) / 255;
		let s = n < 1;
		s && this.#c === void 0 && (this.#c = K.isCanvasFilterSupported ? /* @__PURE__ */ new Map() : "none");
		let c = "none";
		if (s && this.#c instanceof Map && (c = this.#c.getOrInsertComputed(n, () => this.filterFactory.addKnockoutFilter(n))), !s || c !== "none") return t && (o.save(), o.setTransform(1, 0, 0, 1, 0, 0), o.clearRect(0, 0, r, i), o.restore()), o.filter = c, o.drawImage(e, 0, 0), o.filter = "none", a;
		let l = e.getContext("2d", { willReadFrequently: !0 }).getImageData(0, 0, r, i), u = o.createImageData(r, i), d = l.data, f = u.data, p = n > 0 ? 1 / n : 1e6;
		for (let e = 3, t = d.length; e < t; e += 4) f[e] = Math.min(Math.round(d[e] * p), 255);
		return o.putImageData(u, 0, 0), a;
	}
	#m(e, t, n, r) {
		let i = e?.[t] ?? null;
		if (i && (i.canvas.width !== n || i.canvas.height !== r) && (this.canvasFactory.destroy(i), i = null), !i) return i = this.canvasFactory.create(n, r), e && (e[t] = i), i;
		let a = i.context;
		return a.save(), a.setTransform(1, 0, 0, 1, 0, 0), a.clearRect(0, 0, n, r), a.restore(), i;
	}
	#h(e, t, n = {}) {
		let { backdropCanvas: r = null, destTransform: i = [
			1,
			0,
			0,
			1,
			0,
			0
		], backdropOffset: a = [0, 0], reuseMaskEntry: o = null, poolMeta: s = null, sourceAlpha: c = 1, sourceFilter: l = "none", knockoutAlpha: u = 1 } = n, { width: d, height: f } = t, p = this.#p(t, o, u), m = e.globalCompositeOperation;
		if (e.save(), e.setTransform(...i), e.globalAlpha = 1, K.isCanvasFilterSupported && (e.filter = "none"), e.globalCompositeOperation = "destination-out", e.drawImage(p.canvas, 0, 0), r) {
			let [t, n] = a, i = this.#m(s, "knockoutBackdropEntry", d, f), o = i.context;
			o.drawImage(r, t, n, d, f, 0, 0, d, f), o.globalCompositeOperation = "destination-in", o.drawImage(p.canvas, 0, 0), o.globalCompositeOperation = "source-over", e.globalCompositeOperation = "destination-over", e.drawImage(i.canvas, 0, 0), s || this.canvasFactory.destroy(i);
		}
		e.globalCompositeOperation = m, e.globalAlpha = c, K.isCanvasFilterSupported && (e.filter = l ?? "none"), e.drawImage(t, 0, 0), e.restore(), o || this.canvasFactory.destroy(p);
	}
	#g(e = 1) {
		if (this.#t === 0 || this.#n > 0 || !this.contentVisible) return !1;
		this.#n++, this.#s = e;
		let t = this.#u.at(-1), { canvas: n } = this.ctx, r = this.#m(t, "knockoutTempEntry", n.width, n.height);
		this.#r = r;
		let i = r.context;
		return i.save(), i.setTransform(this.ctx.getTransform()), qn(this.ctx, i), this.#o = i.globalCompositeOperation, i.globalCompositeOperation = "source-over", Hn(i, this.ctx), this.#l = t, this.#i = this.ctx, this.#a = this.suspendedCtx, this.ctx = i, this.inSMaskMode && (this.suspendedCtx = i), !0;
	}
	#_(e) {
		if (!e) return;
		let t = this.#r, n = this.#i, r = this.#a, i = t.context;
		this.#r = null, this.#i = null, this.#a = null, this.inSMaskMode && this.suspendedCtx === i && this.ctx !== i && this.endSMaskMode(), this.inSMaskMode && (this.suspendedCtx = r), this.ctx._removeMirroring(), this.ctx.globalCompositeOperation = this.#o, this.#o = null, qn(this.ctx, n), this.ctx = n;
		let a = this.#l;
		this.#l = null;
		let o = this.#s;
		this.#s = 1;
		try {
			this.#h(r ?? n, t.canvas, {
				backdropCanvas: a?.backdropCtx?.canvas ?? null,
				backdropOffset: a?.backdropCtx ? [a.offsetX, a.offsetY] : [0, 0],
				reuseMaskEntry: a?.knockoutMaskEntry ?? null,
				poolMeta: a,
				knockoutAlpha: o
			});
		} finally {
			i.restore(), this.#n--, a || this.canvasFactory.destroy(t);
		}
	}
	compose(e) {
		if (!this.current.activeSMask) return;
		e = e ? [
			Math.floor(e[0]),
			Math.floor(e[1]),
			Math.ceil(e[2]),
			Math.ceil(e[3])
		] : [
			0,
			0,
			this.ctx.canvas.width,
			this.ctx.canvas.height
		];
		let t = this.current.activeSMask, n = this.suspendedCtx, r = this.#n > 0 && n === this.ctx;
		this.composeSMask(r ? null : n, t, this.ctx, e), !r && (this.ctx.save(), this.ctx.setTransform(1, 0, 0, 1, 0, 0), this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height), this.ctx.restore());
	}
	composeSMask(e, t, n, r) {
		let i = r[0], a = r[1], o = r[2] - i, s = r[3] - a;
		if (o === 0 || s === 0) return;
		let c = this.smaskPreparedEntry;
		if (c) {
			let e = i, r = a, l = o, u = s, d = this.smaskPreparedOOBAlpha, f = d !== null;
			if (f) {
				e = Math.max(i, t.offsetX), r = Math.max(a, t.offsetY);
				let n = Math.min(i + o, t.offsetX + t.canvas.width), c = Math.min(a + s, t.offsetY + t.canvas.height);
				l = n - e, u = c - r;
			}
			if (l > 0 && u > 0) {
				let t = e - this.smaskPreparedOffsetX, i = r - this.smaskPreparedOffsetY;
				n.save(), n.globalAlpha = 1, n.setTransform(1, 0, 0, 1, 0, 0);
				let a = new Path2D();
				a.rect(e, r, l, u), n.clip(a), n.globalCompositeOperation = "destination-in", n.drawImage(c.canvas, t, i, l, u, e, r, l, u), n.restore();
			}
			f && d < 255 && this._applySMaskOOBAlpha(n, i, a, o, s, e, r, e + l, r + u, d);
		} else this.genericComposeSMask(t, n, o, s, i, a);
		e && (e.save(), e.globalAlpha = 1, e.globalCompositeOperation = t.blendMode || "source-over", e.setTransform(1, 0, 0, 1, 0, 0), e.drawImage(n.canvas, i, a, o, s, i, a, o, s), e.restore());
	}
	_applySMaskOOBAlpha(e, t, n, r, i, a, o, s, c, l) {
		let u = a < s && o < c;
		if (u && a === t && o === n && s === t + r && c === n + i) return;
		let d = new Path2D();
		d.rect(t, n, r, i), u && d.rect(a, o, s - a, c - o), e.save(), e.globalAlpha = l / 255, e.setTransform(1, 0, 0, 1, 0, 0), e.clip(d, "evenodd"), e.globalCompositeOperation = "destination-in", e.fillStyle = "#000000", e.fillRect(t, n, r, i), e.restore();
	}
	genericComposeSMask(e, t, n, r, i, a) {
		let { context: o, offsetX: s, offsetY: c } = e;
		t.save(), t.globalAlpha = 1, t.setTransform(1, 0, 0, 1, 0, 0);
		let l = new Path2D();
		l.rect(i, a, n, r), t.clip(l), t.globalCompositeOperation = "destination-in", t.drawImage(o.canvas, i - s, a - c, n, r, i, a, n, r), t.restore();
	}
	save(e) {
		this.inSMaskMode && qn(this.ctx, this.suspendedCtx), this.ctx.save();
		let t = this.current;
		this.stateStack.push(t), this.current = t.clone(), this.dependencyTracker?.save(e);
	}
	restore(e) {
		if (this.dependencyTracker?.restore(e), this.stateStack.length === 0) {
			this.inSMaskMode && this.endSMaskMode();
			return;
		}
		this.current = this.stateStack.pop(), this.ctx.restore(), this.inSMaskMode && (qn(this.suspendedCtx, this.ctx), this.ctx.setTransform(this.suspendedCtx.getTransform())), this.checkSMaskState(e), this.pendingClip = null, this._cachedScaleForStroking[0] = -1;
	}
	transform(e, t, n, r, i, a, o) {
		this.dependencyTracker?.recordIncrementalData("transform", e), this.ctx.transform(t, n, r, i, a, o), this._cachedScaleForStroking[0] = -1;
	}
	constructPath(e, t, n, r) {
		let [i] = n;
		if (!r) {
			i ||= n[0] = new Path2D(), t !== O.stroke && t !== O.closeStroke && (this.current.tilingPatternDims = null), this[t](e, i);
			return;
		}
		if (this.dependencyTracker !== null) {
			let n = t === O.stroke ? this.current.lineWidth / 2 : 0;
			this.dependencyTracker.resetBBox(e).recordBBox(e, this.ctx, r[0] - n, r[2] + n, r[1] - n, r[3] + n).recordDependencies(e, ["transform"]);
		}
		i instanceof Path2D || (i = n[0] = Ye(i)), q.axialAlignedBoundingBox(r, X(this.ctx), this.current.minMax);
		let a = this.current.tilingPatternDims;
		if (a && t !== O.stroke && t !== O.closeStroke && this.current.fillColor instanceof Fn) {
			let e = q.intersect(this.current.clipBox, this.current.minMax);
			e ? this.current.fillColor.updatePatternDims(e, a) : this.current.tilingPatternDims = null;
		}
		this[t](e, i), this._pathStartIdx = e;
	}
	closePath(e) {
		this.ctx.closePath();
	}
	stroke(e, t, n = !0) {
		let r = n && this.#g(this.current.strokeAlpha), i = this.ctx, a = this.current.strokeColor;
		if (i.globalAlpha = this.current.strokeAlpha, this.contentVisible) {
			if (typeof a == "object" && a?.getPattern) {
				let n = a.isModifyingCurrentTransform() ? i.getTransform() : null;
				if (i.save(), i.strokeStyle = a.getPattern(i, this, Fe(i), En.STROKE, e), n) {
					let e = new Path2D();
					e.addPath(t, i.getTransform().invertSelf().multiplySelf(n)), t = e;
				}
				this.rescaleAndStroke(t, !1), i.restore();
			} else this.rescaleAndStroke(t, !0);
		}
		this.dependencyTracker?.recordDependencies(e, Mt.stroke), n && this.consumePath(e, t, this.current.getClippedPathBoundingBox(En.STROKE, X(this.ctx))), i.globalAlpha = this.current.fillAlpha, this.#_(r);
	}
	closeStroke(e, t) {
		this.stroke(e, t);
	}
	fill(e, t, n = !0) {
		let r = n && this.#g(this.current.fillAlpha), i = this.ctx, a = this.current.fillColor, o = this.current.patternFill, s = !1, c = this.current.getClippedPathBoundingBox();
		if (this.dependencyTracker?.recordDependencies(e, Mt.fill), o) {
			let o = this.current.tilingPatternDims, l = o && a.canSkipPatternCanvas(o);
			if (l) {
				a.drawPattern(this, t, this.pendingEOFill, l, e), this.pendingEOFill = !1, n && this.consumePath(e, t, c), this.current.tilingPatternDims = null, this.#_(r);
				return;
			}
			let u = a.isModifyingCurrentTransform() ? i.getTransform() : null;
			if (this.dependencyTracker?.save(e), i.save(), i.fillStyle = a.getPattern(i, this, Fe(i), En.FILL, e), u) {
				let e = new Path2D();
				e.addPath(t, i.getTransform().invertSelf().multiplySelf(u)), t = e;
			}
			s = !0;
		}
		this.contentVisible && c !== null && (this.pendingEOFill ? (i.fill(t, "evenodd"), this.pendingEOFill = !1) : i.fill(t)), s && (i.restore(), this.dependencyTracker?.restore(e)), n && this.consumePath(e, t, c), this.#_(r);
	}
	eoFill(e, t) {
		this.pendingEOFill = !0, this.fill(e, t);
	}
	fillStroke(e, t) {
		let n = this.#g(Math.min(this.current.fillAlpha, this.current.strokeAlpha));
		this.fill(e, t, !1), this.stroke(e, t, !1), this.consumePath(e, t), this.#_(n);
	}
	eoFillStroke(e, t) {
		this.pendingEOFill = !0, this.fillStroke(e, t);
	}
	closeFillStroke(e, t) {
		this.fillStroke(e, t);
	}
	closeEOFillStroke(e, t) {
		this.pendingEOFill = !0, this.fillStroke(e, t);
	}
	endPath(e, t) {
		this.consumePath(e, t);
	}
	rawFillPath(e, t) {
		let n = this.#g(this.current.fillAlpha);
		this.ctx.fill(t), this.dependencyTracker?.recordDependencies(e, Mt.rawFillPath).recordOperation(e), this.#_(n);
	}
	clip(e) {
		this.dependencyTracker?.recordFutureForcedDependency("clipMode", e), this.pendingClip = $n;
	}
	eoClip(e) {
		this.dependencyTracker?.recordFutureForcedDependency("clipMode", e), this.pendingClip = er;
	}
	beginText(e) {
		this.current.textMatrix = null, this.current.textMatrixScale = 1, this.current.x = this.current.lineX = 0, this.current.y = this.current.lineY = 0, this.dependencyTracker?.recordOpenMarker(e).resetIncrementalData("sameLineText").resetIncrementalData("moveText", e);
	}
	endText(e) {
		let t = this.pendingTextPaths, n = this.ctx;
		if (this.dependencyTracker) {
			let { dependencyTracker: n } = this;
			t !== void 0 && n.recordFutureForcedDependency("textClip", n.getOpenMarker()).recordFutureForcedDependency("textClip", e), n.recordCloseMarker(e);
		}
		if (t !== void 0) {
			let e = new Path2D(), r = n.getTransform().invertSelf();
			for (let { transform: n, x: i, y: a, fontSize: o, path: s } of t) s && e.addPath(s, new DOMMatrix(n).preMultiplySelf(r).translate(i, a).scale(o, -o));
			n.clip(e);
		}
		delete this.pendingTextPaths;
	}
	setCharSpacing(e, t) {
		this.dependencyTracker?.recordSimpleData("charSpacing", e), this.current.charSpacing = t;
	}
	setWordSpacing(e, t) {
		this.dependencyTracker?.recordSimpleData("wordSpacing", e), this.current.wordSpacing = t;
	}
	setHScale(e, t) {
		this.dependencyTracker?.recordSimpleData("hScale", e), this.current.textHScale = t / 100;
	}
	setLeading(e, t) {
		this.dependencyTracker?.recordSimpleData("leading", e), this.current.leading = -t;
	}
	setFont(e, t, n) {
		this.dependencyTracker?.recordSimpleData("font", e).recordSimpleDataFromNamed("fontObj", t, e);
		let r = this.commonObjs.get(t), i = this.current;
		if (!r) throw Error(`Can't find font for ${t}`);
		if (i.fontMatrix = r.fontMatrix || m, (i.fontMatrix[0] === 0 || i.fontMatrix[3] === 0) && F("Invalid font matrix for font " + t), n < 0 ? (n = -n, i.fontDirection = -1) : i.fontDirection = 1, this.current.font = r, this.current.fontSize = n, r.isType3Font) return;
		let a = r.loadedName || "sans-serif", o = r.systemFontInfo?.css || `"${a}", ${r.fallbackName}`, s = "normal";
		r.black ? s = "900" : r.bold && (s = "bold");
		let c = r.italic ? "italic" : "normal", l = Y(n, In, Ln);
		this.current.fontSizeScale = n / l, this.ctx.font = `${c} ${s} ${l}px ${o}`;
	}
	setTextRenderingMode(e, t) {
		this.dependencyTracker?.recordSimpleData("textRenderingMode", e), this.current.textRenderingMode = t;
	}
	setTextRise(e, t) {
		this.dependencyTracker?.recordSimpleData("textRise", e), this.current.textRise = t;
	}
	moveText(e, t, n) {
		this.dependencyTracker?.resetIncrementalData("sameLineText").recordIncrementalData("moveText", e), this.current.x = this.current.lineX += t, this.current.y = this.current.lineY += n;
	}
	setLeadingMoveText(e, t, n) {
		this.setLeading(e, -n), this.moveText(e, t, n);
	}
	setTextMatrix(e, t) {
		this.dependencyTracker?.resetIncrementalData("sameLineText").recordSimpleData("textMatrix", e);
		let { current: n } = this;
		n.textMatrix = t, n.textMatrixScale = Math.hypot(t[0], t[1]), n.x = n.lineX = 0, n.y = n.lineY = 0;
	}
	nextLine(e) {
		this.moveText(e, 0, this.current.leading), this.dependencyTracker?.recordIncrementalData("moveText", this.dependencyTracker.getSimpleIndex("leading") ?? e);
	}
	#v(e, t, n) {
		let r = new Path2D();
		return r.addPath(e, new DOMMatrix(n).invertSelf().multiplySelf(t)), r;
	}
	paintChar(e, t, n, r, i, a) {
		let o = this.ctx, s = this.current, c = s.font, l = s.textRenderingMode, u = s.fontSize / s.fontSizeScale, d = l & C.FILL_STROKE_MASK, f = !!(l & C.ADD_TO_PATH_FLAG), p = s.patternFill && !c.missingFile, m = s.patternStroke && !c.missingFile, h;
		if ((c.disableFontFace || f || p || m) && !c.missingFile && (h = c.getPathGenerator(this.commonObjs, t)), h && (c.disableFontFace || p || m)) {
			o.save(), o.translate(n, r), o.scale(u, -u), this.dependencyTracker?.recordCharacterBBox(e, o, c);
			let t;
			if (d === C.FILL || d === C.FILL_STROKE) {
				if (i) {
					t = o.getTransform(), o.setTransform(...i);
					let e = this.#v(h, t, i);
					o.fill(e);
				} else o.fill(h);
			}
			if (d === C.STROKE || d === C.FILL_STROKE) {
				if (a) {
					t ||= o.getTransform(), o.setTransform(...a);
					let { a: e, b: n, c: r, d: i } = t, s = q.inverseTransform(a), c = q.transform([
						e,
						n,
						r,
						i,
						0,
						0
					], s);
					q.singularValueDecompose2dScale(c, Vn), o.lineWidth *= Math.max(Vn[0], Vn[1]) / u, o.stroke(this.#v(h, t, a));
				} else o.lineWidth /= u, o.stroke(h);
			}
			o.restore();
		} else (d === C.FILL || d === C.FILL_STROKE) && (o.fillText(t, n, r), this.dependencyTracker?.recordCharacterBBox(e, o, c, u, n, r, () => o.measureText(t))), (d === C.STROKE || d === C.FILL_STROKE) && (this.dependencyTracker && this.dependencyTracker?.recordCharacterBBox(e, o, c, u, n, r, () => o.measureText(t)).recordDependencies(e, Mt.stroke), o.strokeText(t, n, r));
		f && ((this.pendingTextPaths ||= []).push({
			transform: X(o),
			x: n,
			y: r,
			fontSize: u,
			path: h
		}), this.dependencyTracker?.recordCharacterBBox(e, o, c, u, n, r));
	}
	get isFontSubpixelAAEnabled() {
		let e = this.canvasFactory.create(10, 10), t = e.context;
		t.scale(1.5, 1), t.fillText("I", 0, 10);
		let n = t.getImageData(0, 0, 10, 10).data;
		this.canvasFactory.destroy(e);
		let r = !1;
		for (let e = 3; e < n.length; e += 4) if (n[e] > 0 && n[e] < 255) {
			r = !0;
			break;
		}
		return H(this, "isFontSubpixelAAEnabled", r);
	}
	showText(e, t) {
		this.dependencyTracker && (this.dependencyTracker.recordDependencies(e, Mt.showText).resetBBox(e), this.current.textRenderingMode & C.ADD_TO_PATH_FLAG && this.dependencyTracker.recordFutureForcedDependency("textClip", e).inheritPendingDependenciesAsFutureForcedDependencies());
		let n = this.current, r = n.font;
		if (r.isType3Font) {
			let r = this.#g(n.fillAlpha);
			this.showType3Text(e, t), this.dependencyTracker?.recordShowTextOperation(e), this.#_(r);
			return;
		}
		let i = n.fontSize;
		if (i === 0) {
			this.dependencyTracker?.recordOperation(e);
			return;
		}
		let a = this.#g(n.fillAlpha), o = this.ctx, s = n.fontSizeScale, c = n.charSpacing, l = n.wordSpacing, u = n.fontDirection, d = n.textHScale * u, f = t.length, p = r.vertical, m = p ? 1 : -1, h = i * n.fontMatrix[0], g = n.textRenderingMode === C.FILL && !r.disableFontFace && !n.patternFill;
		o.save(), n.textMatrix && o.transform(...n.textMatrix), o.translate(n.x, n.y + n.textRise), u > 0 ? o.scale(d, -1) : o.scale(d, 1);
		let _, v, y = n.textRenderingMode & C.FILL_STROKE_MASK, b = y === C.FILL || y === C.FILL_STROKE, x = y === C.STROKE || y === C.FILL_STROKE, S = n.lineWidth, w = n.textMatrixScale;
		if (w === 0 || S === 0 ? x && (S = this.getSinglePixelWidth()) : S /= w, s !== 1 && (o.scale(s, s), S /= s), o.lineWidth = S, b && n.patternFill) {
			o.save();
			let t = n.fillColor.getPattern(o, this, Fe(o), En.FILL, e);
			_ = X(o), o.restore(), o.fillStyle = t;
		}
		if (x && n.patternStroke) {
			o.save();
			let t = n.strokeColor.getPattern(o, this, Fe(o), En.STROKE, e);
			v = X(o), o.restore(), o.strokeStyle = t;
		}
		if (r.isInvalidPDFjsFont) {
			let r = [], i = 0;
			for (let e of t) r.push(e.unicode), i += e.width;
			let s = r.join("");
			if (o.fillText(s, 0, 0), this.dependencyTracker !== null) {
				let t = o.measureText(s);
				this.dependencyTracker.recordBBox(e, this.ctx, -t.actualBoundingBoxLeft, t.actualBoundingBoxRight, -t.actualBoundingBoxAscent, t.actualBoundingBoxDescent).recordShowTextOperation(e);
			}
			n.x += i * h * d, o.restore(), this.compose(), this.#_(a);
			return;
		}
		let T = 0, E = 0;
		for (; E < f; ++E) {
			let n = t[E];
			if (typeof n == "number") {
				T += m * n * i / 1e3;
				continue;
			}
			let a = !1, d = (n.isSpace ? l : 0) + c, f = n.fontChar, y = n.accent, b, x, S = n.width;
			if (p) {
				let e = n.vmetric, t = -e[1] * h, r = e[2] * h;
				S = -e[0], b = t / s, x = (T + r) / s;
			} else b = T / s, x = 0;
			let C;
			if (r.remeasure && S > 0) {
				C = o.measureText(f);
				let e = C.width * 1e3 / i * s;
				if (S < e && this.isFontSubpixelAAEnabled) {
					let t = S / e;
					a = !0, o.save(), o.scale(t, 1), b /= t;
				} else S !== e && (b += (S - e) / 2e3 * i / s);
			}
			if (this.contentVisible && (n.isInFont || r.missingFile)) {
				if (g && !y) o.fillText(f, b, x), this.dependencyTracker?.recordCharacterBBox(e, o, C ? { bbox: null } : r, i / s, b, x, () => C ?? o.measureText(f));
				else if (this.paintChar(e, f, b, x, _, v), y) {
					let t = b + i * y.offset.x / s, n = x - i * y.offset.y / s;
					this.paintChar(e, y.fontChar, t, n, _, v);
				}
			}
			let w = p ? S * h - d * u : S * h + d * u;
			T += w, a && o.restore();
		}
		p ? n.y -= T : n.x += T * d, o.restore(), this.compose(), this.dependencyTracker?.recordShowTextOperation(e), this.#_(a);
	}
	showType3Text(e, t) {
		let n = this.ctx, r = this.current, i = r.font, a = r.fontSize, o = r.fontDirection, s = i.vertical ? 1 : -1, c = r.charSpacing, l = r.wordSpacing, u = r.textHScale * o, d = r.fontMatrix || m, f = t.length, p = r.textRenderingMode === C.INVISIBLE, h, g, _, v;
		if (p || a === 0) return;
		this._cachedScaleForStroking[0] = -1, n.save(), r.textMatrix && n.transform(...r.textMatrix), n.translate(r.x, r.y + r.textRise), n.scale(u, o);
		let y = this.dependencyTracker;
		for (this.dependencyTracker = y ? new jt(y, e) : null, h = 0; h < f; ++h) {
			if (g = t[h], typeof g == "number") {
				v = s * g * a / 1e3, this.ctx.translate(v, 0), r.x += v * u;
				continue;
			}
			let e = (g.isSpace ? l : 0) + c, o = i.charProcOperatorList.get(g.operatorListId);
			o ? this.contentVisible && (this.save(), o.fnArray[0] === O.setCharWidth && (r.fillAlpha = r.strokeAlpha = 1, n.globalAlpha = 1), n.scale(a, a), n.transform(...d), this.executeOperatorList(o), this.restore()) : F(`Type3 character "${g.operatorListId}" is not available.`);
			let f = [g.width, 0];
			q.applyTransform(f, d), _ = f[0] * a + e, n.translate(_, 0), r.x += _ * u;
		}
		n.restore(), y && (this.dependencyTracker = y);
	}
	setCharWidth(e, t, n) {}
	setCharWidthAndBounds(e, t, n, r, i, a, o) {
		let s = new Path2D();
		s.rect(r, i, a - r, o - i), this.ctx.clip(s), this.dependencyTracker?.recordBBox(e, this.ctx, r, a, i, o).recordClipBox(e, this.ctx, r, a, i, o), this.endPath(e);
	}
	getColorN_Pattern(t, n) {
		let r;
		if (n[0] === "TilingPattern") {
			let t = this.baseTransform || X(this.ctx);
			r = new Fn(n, this.ctx, { createCanvasGraphics: (t, n) => new e(t, this.commonObjs, this.objs, this.canvasFactory, this.filterFactory, {
				optionalContentConfig: this.optionalContentConfig,
				markedContentStack: this.markedContentStack
			}, void 0, void 0, this.dependencyTracker ? new jt(this.dependencyTracker, n, !0) : null) }, t);
		} else r = this._getPattern(t, n[1], n[2]);
		return r;
	}
	setStrokeColorN(e, ...t) {
		this.dependencyTracker?.recordSimpleData("strokeColor", e), this.current.strokeColor = this.getColorN_Pattern(e, t), this.current.patternStroke = !0;
	}
	setFillColorN(e, ...t) {
		this.dependencyTracker?.recordSimpleData("fillColor", e);
		let n = this.current.fillColor = this.getColorN_Pattern(e, t);
		this.current.patternFill = !0, this.current.tilingPatternDims = n instanceof Fn ? [
			0,
			0,
			0,
			0
		] : null;
	}
	#y(e) {
		return this.current.transferMapsFallback?.applyToColor(e) ?? e;
	}
	setStrokeRGBColor(e, t) {
		this.dependencyTracker?.recordSimpleData("strokeColor", e), this.current.strokeColor = t, this.ctx.strokeStyle = this.#y(t), this.current.patternStroke = !1;
	}
	setStrokeTransparent(e) {
		this.dependencyTracker?.recordSimpleData("strokeColor", e), this.ctx.strokeStyle = this.current.strokeColor = "transparent", this.current.patternStroke = !1;
	}
	setFillRGBColor(e, t) {
		this.dependencyTracker?.recordSimpleData("fillColor", e), this.current.fillColor = t, this.ctx.fillStyle = this.#y(t), this.current.patternFill = !1, this.current.tilingPatternDims = null;
	}
	setFillTransparent(e) {
		this.dependencyTracker?.recordSimpleData("fillColor", e), this.ctx.fillStyle = this.current.fillColor = "transparent", this.current.patternFill = !1, this.current.tilingPatternDims = null;
	}
	_getPattern(e, t, n = null) {
		let r = this.cachedPatterns.getOrInsertComputed(t, () => Nn(this.getObject(e, t)));
		return n && (r.matrix = n), r;
	}
	shadingFill(e, t) {
		if (!this.contentVisible) return;
		let n = this.#g(this.current.fillAlpha), r = this.ctx;
		this.save(e), r.fillStyle = this._getPattern(e, t).getPattern(r, this, Fe(r), En.SHADING, e);
		let i = Fe(r);
		if (i) {
			let { width: e, height: t } = r.canvas, n = p.slice();
			q.axialAlignedBoundingBox([
				0,
				0,
				e,
				t
			], i, n);
			let [a, o, s, c] = n;
			this.ctx.fillRect(a, o, s - a, c - o);
		} else this.ctx.fillRect(-1e10, -1e10, 2e10, 2e10);
		this.dependencyTracker?.resetBBox(e).recordFullPageBBox(e).recordDependencies(e, Mt.transform).recordDependencies(e, Mt.fill).recordOperation(e), this.compose(this.current.getClippedPathBoundingBox()), this.restore(e), this.#_(n);
	}
	beginInlineImage() {
		I("Should not call beginInlineImage");
	}
	beginImageData() {
		I("Should not call beginImageData");
	}
	paintFormXObjectBegin(e, t, n) {
		if (this.contentVisible && (this.save(e), this.baseTransformStack.push(this.baseTransform), t && this.transform(e, ...t), this.baseTransform = X(this.ctx), n)) {
			q.axialAlignedBoundingBox(n, this.baseTransform, this.current.minMax);
			let [t, r, i, a] = n, o = new Path2D();
			o.rect(t, r, i - t, a - r), this.ctx.clip(o), this.dependencyTracker?.recordClipBox(e, this.ctx, t, i, r, a), this.endPath(e);
		}
	}
	paintFormXObjectEnd(e) {
		this.contentVisible && (this.restore(e), this.baseTransform = this.baseTransformStack.pop());
	}
	beginGroup(e, t) {
		if (!this.contentVisible) return;
		this.save(e);
		let { inSMaskMode: n } = this;
		n && (this.endSMaskMode(), this.current.activeSMask = null);
		let r = this.ctx;
		if ((!t.needsIsolation || !t.isolated && !t.hasSoftMask) && !t.knockout && !t.isGray && this.#t === 0 && r.globalAlpha === 1 && r.globalCompositeOperation === "source-over" && !n) {
			if (t.bbox) {
				let e = new Path2D(), [n, i, a, o] = t.bbox;
				if (e.rect(n, i, a - n, o - i), t.matrix) {
					let n = new Path2D();
					n.addPath(e, new DOMMatrix(t.matrix)), e = n;
				}
				r.clip(e);
			}
			this.groupStack.push(null), this.#u.push(null), this.groupLevel++;
			return;
		}
		!t.isolated && !t.knockout && this.#t === 0 && P("TODO: Fully support non-isolated non-knockout groups.");
		let i = X(r);
		t.matrix && r.transform(...t.matrix);
		let a = [
			0,
			0,
			r.canvas.width,
			r.canvas.height
		], o;
		t.bbox ? (o = p.slice(), q.axialAlignedBoundingBox(t.bbox, X(r), o), o = q.intersect(o, a) || [
			0,
			0,
			0,
			0
		]) : o = a;
		let s = Math.floor(o[0]), c = Math.floor(o[1]), l = Math.max(Math.ceil(o[2]) - s, 1), u = Math.max(Math.ceil(o[3]) - c, 1);
		this.current.startNewPathAndClipBox([
			0,
			0,
			l,
			u
		]);
		let d = this.canvasFactory.create(l, u);
		t.smask && this.smaskGroupCanvases.push(d);
		let f = d.context, m = t.knockout && !t.isolated ? r : null, h = !t.isolated && !t.knockout && !t.smask && t.needsIsolation && this.#t > 0, g = t.knockout ? this.canvasFactory.create(l, u) : null, _ = this.#t;
		t.knockout ? this.#t++ : this.#t = 0, f.translate(-s, -c), f.transform(...i);
		let v = !t.isolated && !t.smask && t.needsIsolation, y = v && !n && _ === 0 && !t.knockout && !t.isGray && t.hasSoftMask && r.globalAlpha === 1 && r.globalCompositeOperation === "source-over" && this.current.transferMaps === "none" && !this.current.transferMapsFallback;
		if (v && (n || y) && (f.save(), f.setTransform(1, 0, 0, 1, 0, 0), f.drawImage(r.canvas, -s, -c), f.restore()), t.bbox) {
			let e = new Path2D(), [n, r, i, a] = t.bbox;
			if (e.rect(n, r, i - n, a - r), t.matrix) {
				let n = new Path2D();
				n.addPath(e, new DOMMatrix(t.matrix)), e = n;
			}
			f.clip(e);
		}
		t.smask && this.smaskStack.push({
			canvas: d.canvas,
			context: f,
			offsetX: s,
			offsetY: c,
			subtype: t.smask.subtype,
			backdrop: t.smask.backdrop,
			transferMap: t.smask.transferMap || null
		}), (!t.smask || this.dependencyTracker) && (r.setTransform(1, 0, 0, 1, 0, 0), r.translate(s, c), r.save()), qn(r, f), this.ctx = f, this.dependencyTracker?.inheritSimpleDataAsFutureForcedDependencies([
			"fillAlpha",
			"strokeAlpha",
			"globalCompositeOperation"
		]).pushBaseTransform(r), this.setGState(e, [
			["BM", "source-over"],
			["ca", 1],
			["CA", 1],
			["TR", null]
		]), this.groupStack.push(r), this.#u.push({
			backdropCtx: m,
			savedKnockoutLevel: _,
			offsetX: s,
			offsetY: c,
			hasInnerBackdrop: h,
			replaceBackdrop: y,
			knockoutMaskEntry: g,
			knockoutTempEntry: null,
			knockoutBackdropEntry: null
		}), this.groupLevel++;
	}
	endGroup(e, t) {
		if (!this.contentVisible) return;
		this.groupLevel--;
		let n = this.ctx, r = this.groupStack.pop(), i = this.#u.pop();
		if (i && (this.#t = i.savedKnockoutLevel), r === null) {
			this.restore(e);
			return;
		}
		if (t.isGray && this.#b(n), this.ctx = r, this.ctx.imageSmoothingEnabled = !1, this.dependencyTracker?.popBaseTransform(), t.smask) this.tempSMask = this.smaskStack.pop(), this.restore(e), this.dependencyTracker && (this.ctx.restore(), this.inSMaskMode && this.ctx.setTransform(this.suspendedCtx.getTransform())), this.#x(i);
		else {
			this.ctx.restore();
			let t = X(this.ctx);
			this.restore(e), this.current.transferMapsFallback?.applyToCanvas(n), this.ctx.save(), this.ctx.setTransform(...t);
			let a = p.slice();
			q.axialAlignedBoundingBox([
				0,
				0,
				n.canvas.width,
				n.canvas.height
			], t, a);
			let o = this.#u.at(-1);
			if (this.#t > 0) {
				if (i.hasInnerBackdrop) {
					let { width: e, height: a } = n.canvas, o = this.canvasFactory.create(e, a), s = o.context;
					s.drawImage(r.canvas, i.offsetX, i.offsetY, e, a, 0, 0, e, a), s.globalCompositeOperation = "source-over", s.drawImage(n.canvas, 0, 0);
					let c = this.#p(n.canvas);
					s.globalCompositeOperation = "destination-in", s.drawImage(c.canvas, 0, 0);
					let l = this.ctx.globalCompositeOperation, u = this.ctx.globalAlpha, d = this.ctx.filter;
					this.ctx.save(), this.ctx.setTransform(...t), this.ctx.globalAlpha = 1, K.isCanvasFilterSupported && (this.ctx.filter = "none"), this.ctx.globalCompositeOperation = "destination-out", this.ctx.drawImage(c.canvas, 0, 0), this.ctx.globalCompositeOperation = l, this.ctx.globalAlpha = u, K.isCanvasFilterSupported && (this.ctx.filter = d ?? "none"), this.ctx.drawImage(o.canvas, 0, 0), this.ctx.restore(), this.canvasFactory.destroy(c), this.canvasFactory.destroy(o);
				} else {
					let e = o?.backdropCtx ?? null;
					this.#h(this.ctx, n.canvas, {
						backdropCanvas: e?.canvas ?? null,
						destTransform: t,
						backdropOffset: e ? [o.offsetX + i.offsetX, o.offsetY + i.offsetY] : [0, 0],
						sourceAlpha: this.ctx.globalAlpha,
						sourceFilter: this.ctx.filter
					});
				}
			} else {
				if (i.replaceBackdrop) {
					let e = new Path2D();
					e.rect(0, 0, n.canvas.width, n.canvas.height), this.ctx.clip(e), this.ctx.globalCompositeOperation = "copy";
				}
				this.ctx.drawImage(n.canvas, 0, 0);
			}
			this.ctx.restore(), this.canvasFactory.destroy({
				canvas: n.canvas,
				context: n
			}), this.#x(i), this.compose(a);
		}
	}
	#b(e) {
		let { canvas: t } = e, { width: n, height: r } = t;
		if (K.isCanvasFilterSupported) {
			e.save(), e.setTransform(1, 0, 0, 1, 0, 0), e.filter = "grayscale(1)", e.globalAlpha = 1, e.globalCompositeOperation = "copy", e.drawImage(t, 0, 0), e.restore();
			return;
		}
		let i = e.getImageData(0, 0, n, r), { data: a } = i;
		for (let e = 0, t = a.length; e < t; e += 4) {
			let t = a[e] * .2126 + a[e + 1] * .7152 + a[e + 2] * .0722 + .5 | 0;
			a[e] = a[e + 1] = a[e + 2] = t;
		}
		e.putImageData(i, 0, 0);
	}
	#x(e) {
		e && (e.knockoutMaskEntry &&= (this.canvasFactory.destroy(e.knockoutMaskEntry), null), e.knockoutTempEntry &&= (this.canvasFactory.destroy(e.knockoutTempEntry), null), e.knockoutBackdropEntry &&= (this.canvasFactory.destroy(e.knockoutBackdropEntry), null));
	}
	beginAnnotation(e, t, n, r, i, a, o) {
		if (this.#d(), Jn(this.ctx), this.ctx.save(), this.save(e), this.baseTransform && this.ctx.setTransform(...this.baseTransform), n) {
			let i = n[2] - n[0], s = n[3] - n[1];
			if (a && this.annotationCanvasMap) {
				r = r.slice(), r[4] -= n[0], r[5] -= n[1], q.singularValueDecompose2dScale(X(this.ctx), Vn);
				let { viewportScale: e } = this, a = Math.ceil(i * this.outputScaleX * e), c = Math.ceil(s * this.outputScaleY * e);
				this.annotationCanvas = this.canvasFactory.create(a, c);
				let { canvas: l, context: u } = this.annotationCanvas;
				if (o) {
					let e = this.annotationCanvasMap.getOrInsertComputed(t, fe);
					l.setAttribute("data-canvas-name", o);
					let n = e.findIndex((e) => e.getAttribute("data-canvas-name") === o);
					n === -1 ? e.push(l) : e[n] = l;
				} else this.annotationCanvasMap.set(t, l);
				this.annotationCanvas.savedCtx = this.ctx, this.ctx = u, this.ctx.save(), this.ctx.setTransform(Vn[0], 0, 0, -Vn[1], 0, s * Vn[1]), Jn(this.ctx);
			} else {
				Jn(this.ctx), this.endPath(e);
				let t = new Path2D();
				t.rect(n[0], n[1], i, s), this.ctx.clip(t);
			}
		}
		this.current = new Wn(this.ctx.canvas.width, this.ctx.canvas.height), this.baseTransformStack.push(this.baseTransform), this.transform(e, ...r), this.transform(e, ...i), this.baseTransform = X(this.ctx);
	}
	endAnnotation(e) {
		this.annotationCanvas && (this.ctx.restore(), this.#f(), this.ctx = this.annotationCanvas.savedCtx, delete this.annotationCanvas.savedCtx, delete this.annotationCanvas), this.baseTransform = this.baseTransformStack.pop();
	}
	paintImageMaskXObject(e, t) {
		if (!this.contentVisible) return;
		let n = t.count;
		t = this.getObject(e, t.data, t), t.count = n;
		let r = this.#g(this.current.fillAlpha), i = this.ctx, a = this._createMaskCanvas(e, t), o = a.canvas;
		i.save(), i.setTransform(1, 0, 0, 1, 0, 0), i.drawImage(o, a.offsetX, a.offsetY), this.dependencyTracker?.resetBBox(e).recordBBox(e, this.ctx, a.offsetX, a.offsetX + o.width, a.offsetY, a.offsetY + o.height).recordOperation(e), i.restore(), a.canvasEntry && this.canvasFactory.destroy(a.canvasEntry), this.compose(), this.#_(r);
	}
	paintImageMaskXObjectRepeat(e, t, n, r = 0, i = 0, a, o) {
		if (!this.contentVisible) return;
		t = this.getObject(e, t.data, t);
		let s = this.#g(this.current.fillAlpha), c = this.ctx;
		c.save();
		let l = X(c);
		c.transform(n, r, i, a, 0, 0);
		let u = this._createMaskCanvas(e, t);
		c.setTransform(1, 0, 0, 1, u.offsetX - l[4], u.offsetY - l[5]), this.dependencyTracker?.resetBBox(e);
		for (let t = 0, s = o.length; t < s; t += 2) {
			let s = q.transform(l, [
				n,
				r,
				i,
				a,
				o[t],
				o[t + 1]
			]);
			c.drawImage(u.canvas, s[4], s[5]), this.dependencyTracker?.recordBBox(e, this.ctx, s[4], s[4] + u.canvas.width, s[5], s[5] + u.canvas.height);
		}
		c.restore(), u.canvasEntry && this.canvasFactory.destroy(u.canvasEntry), this.compose(), this.dependencyTracker?.recordOperation(e), this.#_(s);
	}
	paintImageMaskXObjectGroup(e, t) {
		if (!this.contentVisible) return;
		let n = this.#g(this.current.fillAlpha), r = this.ctx, i = this.current.patternFill, a = i ? this.current.fillColor : r.fillStyle;
		this.dependencyTracker?.resetBBox(e).recordDependencies(e, Mt.transformAndFill);
		for (let n of t) {
			let { data: t, width: o, height: s, transform: c } = n, l = this.canvasFactory.create(o, s), u = l.context;
			u.save(), Kn(u, this.getObject(e, t, n)), u.globalCompositeOperation = "source-in", u.fillStyle = i ? a.getPattern(u, this, Fe(r), En.FILL, e) : a, u.fillRect(0, 0, o, s), u.restore(), r.save(), r.transform(...c), r.scale(1, -1), Un(r, l.canvas, 0, 0, o, s, 0, -1, 1, 1), this.canvasFactory.destroy(l), this.dependencyTracker?.recordBBox(e, r, 0, o, 0, s), r.restore();
		}
		this.compose(), this.dependencyTracker?.recordOperation(e), this.#_(n);
	}
	paintImageXObject(e, t) {
		if (!this.contentVisible) return;
		let n = this.getObject(e, t);
		if (!n) {
			F("Dependent image isn't ready yet");
			return;
		}
		this.paintInlineImageXObject(e, n);
	}
	paintImageXObjectRepeat(e, t, n, r, i) {
		if (!this.contentVisible) return;
		let a = this.getObject(e, t);
		if (!a) {
			F("Dependent image isn't ready yet");
			return;
		}
		let o = a.width, s = a.height, c = [];
		for (let e = 0, t = i.length; e < t; e += 2) c.push({
			transform: [
				n,
				0,
				0,
				r,
				i[e],
				i[e + 1]
			],
			x: 0,
			y: 0,
			w: o,
			h: s
		});
		this.paintInlineImageXObjectGroup(e, a, c);
	}
	applyTransferMapsToCanvas(e) {
		return this.current.transferMaps === "none" ? this.current.transferMapsFallback?.applyToCanvas(e) : (e.filter = this.current.transferMaps, e.drawImage(e.canvas, 0, 0), e.filter = "none"), e.canvas;
	}
	applyTransferMapsToBitmap(e) {
		let { transferMaps: t, transferMapsFallback: n } = this.current;
		if (t === "none" && !n) return {
			img: e.bitmap,
			canvasEntry: null
		};
		let { bitmap: r, width: i, height: a } = e, o = this.canvasFactory.create(i, a), s = o.context;
		return s.filter = t, s.drawImage(r, 0, 0), s.filter = "none", n?.applyToCanvas(s), {
			img: o.canvas,
			canvasEntry: o
		};
	}
	paintInlineImageXObject(e, t) {
		if (!this.contentVisible) return;
		let n = t.width, r = t.height, i = this.#g(this.current.fillAlpha), a = this.ctx;
		this.save(e);
		let { filter: o } = a;
		o !== "none" && o !== "" && (a.filter = "none"), a.scale(1 / n, -1 / r);
		let s, c = null;
		if (t.bitmap) {
			let e = this.applyTransferMapsToBitmap(t);
			s = e.img, c = e.canvasEntry;
		} else {
			let e = this.canvasFactory.create(n, r);
			Gn(e.context, t), s = this.applyTransferMapsToCanvas(e.context), c = e;
		}
		let l = this._scaleImage(s, Fe(a));
		a.imageSmoothingEnabled = Xn(X(a), t.interpolate), this.dependencyTracker && (this.dependencyTracker.resetBBox(e).recordBBox(e, a, 0, n, -r, 0).recordDependencies(e, Mt.imageXObject).recordOperation(e), this.imagesTracker?.record(a, n, r, this.dependencyTracker.clipBox)), Un(a, l.img, 0, 0, l.paintWidth, l.paintHeight, 0, -r, n, r), l.tmpCanvas && this.canvasFactory.destroy(l.tmpCanvas), c && this.canvasFactory.destroy(c), this.compose(), this.restore(e), this.#_(i);
	}
	paintInlineImageXObjectGroup(e, t, n) {
		if (!this.contentVisible) return;
		let r = this.#g(this.current.fillAlpha), i = this.ctx, a, o = null;
		if (t.bitmap && !this.current.transferMapsFallback) a = t.bitmap;
		else if (t.bitmap) ({img: a, canvasEntry: o} = this.applyTransferMapsToBitmap(t));
		else {
			let e = t.width, n = t.height, r = this.canvasFactory.create(e, n);
			Gn(r.context, t), a = this.applyTransferMapsToCanvas(r.context), o = r;
		}
		this.dependencyTracker?.resetBBox(e);
		for (let t of n) i.save(), i.transform(...t.transform), i.scale(1, -1), Un(i, a, t.x, t.y, t.w, t.h, 0, -1, 1, 1), this.dependencyTracker?.recordBBox(e, i, 0, 1, -1, 0), i.restore();
		o && this.canvasFactory.destroy(o), this.dependencyTracker?.recordOperation(e), this.compose(), this.#_(r);
	}
	paintSolidColorImageMask(e) {
		if (!this.contentVisible) return;
		let t = this.#g(this.current.fillAlpha);
		this.dependencyTracker?.resetBBox(e).recordBBox(e, this.ctx, 0, 1, 0, 1).recordDependencies(e, Mt.fill).recordOperation(e), this.ctx.fillRect(0, 0, 1, 1), this.compose(), this.#_(t);
	}
	markPoint(e, t) {}
	markPointProps(e, t, n) {}
	beginMarkedContent(e, t) {
		this.dependencyTracker?.beginMarkedContent(e), this.markedContentStack.push({ visible: !0 });
	}
	beginMarkedContentProps(e, t, n) {
		this.dependencyTracker?.beginMarkedContent(e), t === "OC" ? this.markedContentStack.push({ visible: this.optionalContentConfig.isVisible(n) }) : this.markedContentStack.push({ visible: !0 }), this.contentVisible = this.isContentVisible();
	}
	endMarkedContent(e) {
		this.dependencyTracker?.endMarkedContent(e), this.markedContentStack.pop(), this.contentVisible = this.isContentVisible();
	}
	beginCompat(e) {}
	endCompat(e) {}
	consumePath(e, t, n) {
		let r = this.current.isEmptyClip();
		this.pendingClip && this.current.updateClipFromPath(), this.pendingClip || this.compose(n);
		let i = this.ctx;
		this.pendingClip ? (r || (this.pendingClip === er ? i.clip(t, "evenodd") : i.clip(t)), this.pendingClip = null, this.dependencyTracker?.bboxToClipBoxDropOperation(e).recordFutureForcedDependency("clipPath", e)) : this.dependencyTracker?.recordOperation(e), this.current.startNewPathAndClipBox(this.current.clipBox);
	}
	getSinglePixelWidth() {
		let e = X(this.ctx);
		if (e[1] === 0 && e[2] === 0) return 1 / Math.min(Math.abs(e[0]), Math.abs(e[3]));
		let t = Math.abs(e[0] * e[3] - e[2] * e[1]), n = Math.hypot(e[0], e[2]), r = Math.hypot(e[1], e[3]);
		return Math.max(n, r) / t;
	}
	getScaleForStroking() {
		if (this._cachedScaleForStroking[0] === -1) {
			let { lineWidth: e } = this.current, { a: t, b: n, c: r, d: i } = this.ctx.getTransform(), a, o;
			if (n === 0 && r === 0) {
				let n = Math.abs(t), r = Math.abs(i);
				if (n === r) {
					if (e === 0) a = o = 1 / n;
					else {
						let t = n * e;
						a = o = t < 1 ? 1 / t : 1;
					}
				} else if (e === 0) a = 1 / n, o = 1 / r;
				else {
					let t = n * e, i = r * e;
					a = t < 1 ? 1 / t : 1, o = i < 1 ? 1 / i : 1;
				}
			} else {
				let s = Math.abs(t * i - n * r), c = Math.hypot(t, n), l = Math.hypot(r, i);
				if (e === 0) a = l / s, o = c / s;
				else {
					let t = e * s;
					a = l > t ? l / t : 1, o = c > t ? c / t : 1;
				}
			}
			this._cachedScaleForStroking[0] = a, this._cachedScaleForStroking[1] = o;
		}
		return this._cachedScaleForStroking;
	}
	rescaleAndStroke(t, n) {
		let { ctx: r, current: { lineWidth: i } } = this, [a, o] = this.getScaleForStroking();
		if (a === o) {
			r.lineWidth = (i || 1) * a, r.stroke(t);
			return;
		}
		let s = e.#e ??= new DOMMatrix(), c = r.getLineDash();
		n && r.save(), r.scale(a, o), s.a = 1 / a, s.d = 1 / o;
		let l = new Path2D();
		if (l.addPath(t, s), c.length > 0) {
			let e = Math.max(a, o);
			r.setLineDash(c.map((t) => t / e)), r.lineDashOffset /= e;
		}
		r.lineWidth = i || 1, r.stroke(l), n && r.restore();
	}
	isContentVisible() {
		for (let e = this.markedContentStack.length - 1; e >= 0; e--) if (!this.markedContentStack[e].visible) return !1;
		return !0;
	}
};
for (let e in O) tr.prototype[e] !== void 0 && (tr.prototype[O[e]] = tr.prototype[e]);
var nr = class {
	#e = null;
	#t = null;
	_fullReader = null;
	_rangeReaders = /* @__PURE__ */ new Set();
	_source = null;
	constructor(e, t, n) {
		this._source = e, this.#e = t, this.#t = n;
	}
	get _progressiveDataLength() {
		return this._fullReader?._loaded ?? 0;
	}
	getFullReader() {
		return L(!this._fullReader, "BasePDFStream.getFullReader can only be called once."), this._fullReader = new this.#e(this);
	}
	getRangeReader(e, t) {
		if (t <= this._progressiveDataLength) return null;
		let n = new this.#t(this, e, t);
		return this._rangeReaders.add(n), n;
	}
	cancelAllRequests(e) {
		this._fullReader?.cancel(e);
		for (let t of new Set(this._rangeReaders)) t.cancel(e);
	}
}, rr = class {
	onProgress = null;
	_contentLength = 0;
	_filename = null;
	_headersCapability = Promise.withResolvers();
	_isRangeSupported = !1;
	_isStreamingSupported = !1;
	_loaded = 0;
	_stream = null;
	constructor(e) {
		this._stream = e;
	}
	_callOnProgress() {
		this.onProgress?.({
			loaded: this._loaded,
			total: this._contentLength
		});
	}
	get headersReady() {
		return this._headersCapability.promise;
	}
	get filename() {
		return this._filename;
	}
	get contentLength() {
		return this._contentLength;
	}
	get isRangeSupported() {
		return this._isRangeSupported;
	}
	get isStreamingSupported() {
		return this._isStreamingSupported;
	}
	async read() {
		I("Abstract method `read` called");
	}
	cancel(e) {
		I("Abstract method `cancel` called");
	}
}, ir = class {
	_stream = null;
	constructor(e, t, n) {
		this._stream = e;
	}
	async read() {
		I("Abstract method `read` called");
	}
	cancel(e) {
		I("Abstract method `cancel` called");
	}
};
function ar(e) {
	let t = !0, n = r("filename\\*", "i").exec(e);
	if (n) {
		n = n[1];
		let e = s(n);
		return e = unescape(e), e = c(e), e = l(e), a(e);
	}
	if (n = o(e), n) return a(l(n));
	if (n = r("filename", "i").exec(e), n) {
		n = n[1];
		let e = s(n);
		return e = l(e), a(e);
	}
	function r(e, t) {
		return RegExp("(?:^|;)\\s*" + e + "\\s*=\\s*([^\";\\s][^;\\s]*|\"(?:[^\"\\\\]|\\\\\"?)+\"?)", t);
	}
	function i(e, n) {
		if (e) {
			if (!/^[\x00-\xFF]+$/.test(n)) return n;
			try {
				let r = new TextDecoder(e, { fatal: !0 }), i = ae(n);
				n = r.decode(i), t = !1;
			} catch {}
		}
		return n;
	}
	function a(e) {
		return t && /[\x80-\xff]/.test(e) && (e = i("utf-8", e), t && (e = i("iso-8859-1", e))), e;
	}
	function o(e) {
		let t = [], n, i = r("filename\\*((?!0\\d)\\d+)(\\*?)", "ig");
		for (; (n = i.exec(e)) !== null;) {
			let [, e, r, i] = n;
			if (e = parseInt(e, 10), e in t) {
				if (e === 0) break;
				continue;
			}
			t[e] = [r, i];
		}
		let a = [];
		for (let e = 0; e < t.length && e in t; ++e) {
			let [n, r] = t[e];
			r = s(r), n && (r = unescape(r), e === 0 && (r = c(r))), a.push(r);
		}
		return a.join("");
	}
	function s(e) {
		if (e.startsWith("\"")) {
			let t = e.slice(1).split("\\\"");
			for (let e = 0; e < t.length; ++e) {
				let n = t[e].indexOf("\"");
				n !== -1 && (t[e] = t[e].slice(0, n), t.length = e + 1), t[e] = t[e].replaceAll(/\\(.)/g, "$1");
			}
			e = t.join("\"");
		}
		return e;
	}
	function c(e) {
		let t = e.indexOf("'");
		return t === -1 ? e : i(e.slice(0, t), e.slice(t + 1).replace(/^[^']*'/, ""));
	}
	function l(e) {
		return !e.startsWith("=?") || /[\x00-\x19\x80-\xff]/.test(e) ? e : e.replaceAll(/=\?([\w-]*)\?([QB])\?((?:[^?]|\?(?!=))*)\?=/gi, function(e, t, n, r) {
			if (n === "q" || n === "Q") return r = r.replaceAll("_", " ").replaceAll(/=([0-9a-f]{2})/gi, (e, t) => String.fromCharCode(parseInt(t, 16))), i(t, r);
			try {
				r = atob(r);
			} catch {}
			return i(t, r);
		});
	}
	return "";
}
function or(e, t) {
	let n = new Headers();
	if (!e || !t || typeof t != "object") return n;
	for (let e in t) {
		let r = t[e];
		r !== void 0 && n.append(e, r);
	}
	return n;
}
function sr(e) {
	let t = e.length;
	for (; t > 0 && e[t - 1] !== " " && /\s/.test(e[t - 1]);) t--;
	return e.slice(0, t);
}
function cr(e) {
	return URL.parse(e)?.origin ?? null;
}
function lr({ responseHeaders: e, isHttp: t, rangeChunkSize: n, disableRange: r }) {
	let i = {
		contentLength: 0,
		isRangeSupported: !1
	}, a = parseInt(e.get("Content-Length"), 10);
	return !Number.isInteger(a) || (i.contentLength = a, a <= 2 * n) || r || !t || e.get("Accept-Ranges") !== "bytes" || (e.get("Content-Encoding") || "identity") === "identity" && (i.isRangeSupported = !0), i;
}
function ur(e) {
	let t = e.get("Content-Disposition");
	if (t) {
		let e = ar(t);
		if (e.includes("%")) try {
			e = decodeURIComponent(e);
		} catch {}
		if (we(e)) return e;
	}
	return null;
}
function dr(e, t) {
	return new G(`Unexpected server response (${e}) while retrieving PDF "${t.href}".`, e, e === 404 || e === 0 && t.protocol === "file:");
}
function fr(e, t) {
	if (e !== t) throw Error(`Expected range response-origin "${e}" to match "${t}".`);
}
function pr(e, t, n, r) {
	return fetch(e, {
		method: "GET",
		headers: t,
		signal: r.signal,
		mode: "cors",
		credentials: n ? "include" : "same-origin",
		redirect: "follow"
	});
}
function mr(e, t) {
	if (e !== 200 && e !== 206) throw dr(e, t);
}
function hr(e) {
	if (e instanceof Uint8Array) return e.buffer;
	if (e instanceof ArrayBuffer) return e;
	throw Error(`getArrayBuffer - unexpected data: ${e}`);
}
var gr = class extends nr {
	_responseOrigin = null;
	constructor(e) {
		super(e, _r, vr);
		let { httpHeaders: t, url: n } = e;
		L(/https?:/.test(n.protocol), "PDFFetchStream only supports http(s):// URLs."), this.headers = or(!0, t);
	}
}, _r = class extends rr {
	_abortController = new AbortController();
	_reader = null;
	constructor(e) {
		super(e);
		let { disableRange: t, disableStream: n, rangeChunkSize: r, url: i, withCredentials: a } = e._source;
		this._isStreamingSupported = !n, pr(i, new Headers(e.headers), a, this._abortController).then((n) => {
			e._responseOrigin = cr(n.url), mr(n.status, i), this._reader = n.body.getReader();
			let a = n.headers, { contentLength: o, isRangeSupported: s } = lr({
				responseHeaders: a,
				isHttp: !0,
				rangeChunkSize: r,
				disableRange: t
			});
			this._contentLength = o, this._isRangeSupported = s, this._filename = ur(a), !this._isStreamingSupported && this._isRangeSupported && this.cancel(new re("Streaming is disabled.")), this._headersCapability.resolve();
		}).catch(this._headersCapability.reject);
	}
	async read() {
		await this._headersCapability.promise;
		let { value: e, done: t } = await this._reader.read();
		return t ? {
			value: e,
			done: t
		} : (this._loaded += e.byteLength, this._callOnProgress(), {
			value: hr(e),
			done: !1
		});
	}
	cancel(e) {
		this._reader?.cancel(e), this._abortController.abort();
	}
}, vr = class extends ir {
	_abortController = new AbortController();
	_readCapability = Promise.withResolvers();
	_reader = null;
	constructor(e, t, n) {
		super(e, t, n);
		let { url: r, withCredentials: i } = e._source, a = new Headers(e.headers);
		a.append("Range", `bytes=${t}-${n - 1}`), pr(r, a, i, this._abortController).then((t) => {
			fr(cr(t.url), e._responseOrigin), mr(t.status, r), this._reader = t.body.getReader(), this._readCapability.resolve();
		}).catch(this._readCapability.reject);
	}
	async read() {
		await this._readCapability.promise;
		let { value: e, done: t } = await this._reader.read();
		return t ? {
			value: e,
			done: t
		} : {
			value: hr(e),
			done: !1
		};
	}
	cancel(e) {
		this._reader?.cancel(e), this._abortController.abort();
	}
};
function yr(e) {
	return e instanceof Uint8Array && e.byteLength === e.buffer.byteLength ? e.buffer : new Uint8Array(e).buffer;
}
function br() {
	for (let e of this._requests) e.resolve({
		value: void 0,
		done: !0
	});
	this._requests.length = 0;
}
var xr = class extends nr {
	_progressiveDone = !1;
	_queuedChunks = [];
	constructor(e) {
		super(e, Sr, Cr);
		let { pdfDataRangeTransport: t } = e, { initialData: n, progressiveDone: r } = t;
		if (n?.length > 0) {
			let e = yr(n);
			this._queuedChunks.push(e);
		}
		this._progressiveDone = r, t.transportReady((e) => {
			switch (e.type) {
				case "range":
				case "progressiveRead":
					this.#e(e.begin, e.chunk);
					break;
				case "progressiveDone": this._fullReader?.progressiveDone(), this._progressiveDone = !0;
			}
		});
	}
	#e(e, t) {
		let n = yr(t);
		if (e === void 0) this._fullReader ? this._fullReader._enqueue(n) : this._queuedChunks.push(n);
		else {
			let t = this._rangeReaders.keys().find((t) => t._begin === e);
			L(t, "#onReceiveData - no `PDFDataTransportStreamRangeReader` instance found."), t._enqueue(n);
		}
	}
	getFullReader() {
		let e = super.getFullReader();
		return this._queuedChunks = null, e;
	}
	getRangeReader(e, t) {
		let n = super.getRangeReader(e, t);
		return n && (n.onDone = () => this._rangeReaders.delete(n), this._source.pdfDataRangeTransport.requestDataRange(e, t)), n;
	}
	cancelAllRequests(e) {
		super.cancelAllRequests(e), this._source.pdfDataRangeTransport.abort();
	}
}, Sr = class extends rr {
	#e = br.bind(this);
	_done = !1;
	_queuedChunks = null;
	_requests = [];
	constructor(e) {
		super(e);
		let { pdfDataRangeTransport: t, disableRange: n, disableStream: r } = e._source, { length: i, contentDispositionFilename: a } = t;
		this._queuedChunks = e._queuedChunks || [];
		for (let e of this._queuedChunks) this._loaded += e.byteLength;
		this._done = e._progressiveDone, this._contentLength = i, this._isStreamingSupported = !r, this._isRangeSupported = !n, we(a) && (this._filename = a), this._headersCapability.resolve();
		let o = this._loaded;
		Promise.resolve().then(() => {
			o > 0 && this._loaded === o && this._callOnProgress();
		});
	}
	_enqueue(e) {
		this._done || (this._requests.length > 0 ? this._requests.shift().resolve({
			value: e,
			done: !1
		}) : this._queuedChunks.push(e), this._loaded += e.byteLength, this._callOnProgress());
	}
	async read() {
		if (this._queuedChunks.length > 0) return {
			value: this._queuedChunks.shift(),
			done: !1
		};
		if (this._done) return {
			value: void 0,
			done: !0
		};
		let e = Promise.withResolvers();
		return this._requests.push(e), e.promise;
	}
	cancel(e) {
		this._done = !0, this.#e();
	}
	progressiveDone() {
		this._done ||= !0, this._queuedChunks.length === 0 && this.#e();
	}
}, Cr = class extends ir {
	#e = br.bind(this);
	onDone = null;
	_begin = -1;
	_done = !1;
	_queuedChunk = null;
	_requests = [];
	constructor(e, t, n) {
		super(e, t, n), this._begin = t;
	}
	_enqueue(e) {
		this._done || (this._requests.length === 0 ? this._queuedChunk = e : (this._requests.shift().resolve({
			value: e,
			done: !1
		}), this.#e()), this._done = !0, this.onDone?.());
	}
	async read() {
		if (this._queuedChunk) {
			let e = this._queuedChunk;
			return this._queuedChunk = null, {
				value: e,
				done: !1
			};
		}
		if (this._done) return {
			value: void 0,
			done: !0
		};
		let e = Promise.withResolvers();
		return this._requests.push(e), e.promise;
	}
	cancel(e) {
		this._done = !0, this.#e(), this.onDone?.();
	}
}, wr = 200, Tr = 206;
function Er(e) {
	return typeof e == "string" ? ae(e).buffer : e;
}
var Dr = class extends nr {
	#e = /* @__PURE__ */ new WeakMap();
	_responseOrigin = null;
	constructor(e) {
		super(e, Or, kr);
		let { httpHeaders: t, url: n } = e;
		this.url = n, this.isHttp = /https?:/.test(n.protocol), this.headers = or(this.isHttp, t);
	}
	_request(e) {
		let t = new XMLHttpRequest(), n = {
			validateStatus: null,
			onHeadersReceived: e.onHeadersReceived,
			onDone: e.onDone,
			onError: e.onError,
			onProgress: e.onProgress
		};
		this.#e.set(t, n), t.open("GET", this.url), t.withCredentials = this._source.withCredentials;
		for (let [e, n] of this.headers) t.setRequestHeader(e, n);
		return this.isHttp && "begin" in e && "end" in e ? (t.setRequestHeader("Range", `bytes=${e.begin}-${e.end - 1}`), n.validateStatus = (e) => e === Tr || e === wr) : n.validateStatus = (e) => e === wr, t.responseType = "arraybuffer", L(e.onError, "Expected `onError` callback to be provided."), t.onerror = () => e.onError(t.status), t.onreadystatechange = this.#n.bind(this, t), t.onprogress = this.#t.bind(this, t), t.send(null), t;
	}
	#t(e, t) {
		this.#e.get(e)?.onProgress?.(t);
	}
	#n(e, t) {
		let n = this.#e.get(e);
		if (!n || (e.readyState >= 2 && n.onHeadersReceived && (n.onHeadersReceived(), delete n.onHeadersReceived), e.readyState !== 4) || !this.#e.has(e)) return;
		if (this.#e.delete(e), e.status === 0 && this.isHttp) {
			n.onError(e.status);
			return;
		}
		let r = e.status || wr;
		if (!n.validateStatus(r)) {
			n.onError(e.status);
			return;
		}
		let i = Er(e.response);
		if (r === Tr) {
			let t = e.getResponseHeader("Content-Range");
			/bytes \d+-\d+\/\d+/.test(t) ? n.onDone(i) : (F("Missing or invalid \"Content-Range\" header."), n.onError(0));
		} else i ? n.onDone(i) : n.onError(e.status);
	}
	_abortRequest(e) {
		this.#e.has(e) && (this.#e.delete(e), e.abort());
	}
	getRangeReader(e, t) {
		let n = super.getRangeReader(e, t);
		return n && (n.onClosed = () => this._rangeReaders.delete(n)), n;
	}
}, Or = class extends rr {
	#e = br.bind(this);
	_cachedChunks = [];
	_done = !1;
	_requests = [];
	_storedError = null;
	constructor(e) {
		super(e), this._fullRequestXhr = e._request({
			onHeadersReceived: this.#t.bind(this),
			onDone: this.#n.bind(this),
			onError: this.#r.bind(this),
			onProgress: this.#i.bind(this)
		});
	}
	#t() {
		let e = this._stream, { disableRange: t, rangeChunkSize: n } = e._source, r = this._fullRequestXhr;
		e._responseOrigin = cr(r.responseURL);
		let i = r.getAllResponseHeaders(), a = new Headers(i ? sr(i.trimStart()).split(/[\r\n]+/).map((e) => {
			let [t, ...n] = e.split(": ");
			return [t, n.join(": ")];
		}) : []), { contentLength: o, isRangeSupported: s } = lr({
			responseHeaders: a,
			isHttp: e.isHttp,
			rangeChunkSize: n,
			disableRange: t
		});
		this._contentLength = o, this._isRangeSupported = s, this._filename = ur(a), this._isRangeSupported && e._abortRequest(r), this._headersCapability.resolve();
	}
	#n(e) {
		this._requests.length > 0 ? this._requests.shift().resolve({
			value: e,
			done: !1
		}) : this._cachedChunks.push(e), this._done = !0, this._cachedChunks.length === 0 && this.#e();
	}
	#r(e) {
		this._storedError = dr(e, this._stream.url), this._headersCapability.reject(this._storedError);
		for (let e of this._requests) e.reject(this._storedError);
		this._requests.length = 0, this._cachedChunks.length = 0;
	}
	#i(e) {
		this.onProgress?.({
			loaded: e.loaded,
			total: e.lengthComputable ? e.total : this._contentLength
		});
	}
	async read() {
		if (await this._headersCapability.promise, this._storedError) throw this._storedError;
		if (this._cachedChunks.length > 0) return {
			value: this._cachedChunks.shift(),
			done: !1
		};
		if (this._done) return {
			value: void 0,
			done: !0
		};
		let e = Promise.withResolvers();
		return this._requests.push(e), e.promise;
	}
	cancel(e) {
		this._done = !0, this._headersCapability.reject(e), this.#e(), this._stream._abortRequest(this._fullRequestXhr), this._fullRequestXhr = null;
	}
}, kr = class extends ir {
	#e = br.bind(this);
	onClosed = null;
	_done = !1;
	_queuedChunk = null;
	_requests = [];
	_storedError = null;
	constructor(e, t, n) {
		super(e, t, n), this._requestXhr = e._request({
			begin: t,
			end: n,
			onHeadersReceived: this.#t.bind(this),
			onDone: this.#n.bind(this),
			onError: this.#r.bind(this),
			onProgress: null
		});
	}
	#t() {
		let e = cr(this._requestXhr?.responseURL);
		try {
			fr(e, this._stream._responseOrigin);
		} catch (e) {
			this._storedError = e, this.#r(0);
		}
	}
	#n(e) {
		this._requests.length > 0 ? this._requests.shift().resolve({
			value: e,
			done: !1
		}) : this._queuedChunk = e, this._done = !0, this.#e(), this.onClosed?.();
	}
	#r(e) {
		this._storedError ??= dr(e, this._stream.url);
		for (let e of this._requests) e.reject(this._storedError);
		this._requests.length = 0, this._queuedChunk = null;
	}
	async read() {
		if (this._storedError) throw this._storedError;
		if (this._queuedChunk !== null) {
			let e = this._queuedChunk;
			return this._queuedChunk = null, {
				value: e,
				done: !1
			};
		}
		if (this._done) return {
			value: void 0,
			done: !0
		};
		let e = Promise.withResolvers();
		return this._requests.push(e), e.promise;
	}
	cancel(e) {
		this._done = !0, this.#e(), this._stream._abortRequest(this._requestXhr), this.onClosed?.();
	}
};
function Ar(e, t = null) {
	let n = process.getBuiltinModule("fs"), { Readable: r } = process.getBuiltinModule("stream"), i = n.createReadStream(e, t);
	return r.toWeb(i);
}
var jr = class extends nr {
	constructor(e) {
		super(e, Mr, Nr);
		let { url: t } = e;
		L(t.protocol === "file:", "PDFNodeStream only supports file:// URLs.");
	}
}, Mr = class extends rr {
	_reader = null;
	constructor(e) {
		super(e);
		let { disableRange: t, disableStream: n, rangeChunkSize: r, url: i } = e._source;
		this._isStreamingSupported = !n, process.getBuiltinModule("fs/promises").lstat(i).then((e) => {
			let n = Ar(i);
			this._reader = n.getReader();
			let { size: a } = e;
			this._contentLength = a, this._isRangeSupported = !t && a > 2 * r, !this._isStreamingSupported && this._isRangeSupported && this.cancel(new re("Streaming is disabled.")), this._headersCapability.resolve();
		}).catch((e) => {
			e.code === "ENOENT" && (e = dr(0, i)), this._headersCapability.reject(e);
		});
	}
	async read() {
		await this._headersCapability.promise;
		let { value: e, done: t } = await this._reader.read();
		return t ? {
			value: e,
			done: t
		} : (this._loaded += e.byteLength, this._callOnProgress(), {
			value: hr(e),
			done: !1
		});
	}
	cancel(e) {
		this._reader?.cancel(e);
	}
}, Nr = class extends ir {
	_readCapability = Promise.withResolvers();
	_reader = null;
	constructor(e, t, n) {
		super(e, t, n);
		let { url: r } = e._source;
		try {
			let e = Ar(r, {
				start: t,
				end: n - 1
			});
			this._reader = e.getReader(), this._readCapability.resolve();
		} catch (e) {
			this._readCapability.reject(e);
		}
	}
	async read() {
		await this._readCapability.promise;
		let { value: e, done: t } = await this._reader.read();
		return t ? {
			value: e,
			done: t
		} : {
			value: hr(e),
			done: !1
		};
	}
	cancel(e) {
		this._reader?.cancel(e);
	}
};
function Pr(e) {
	return Oe(e) ? gr : d ? jr : Dr;
}
var Fr = class {
	static #e = null;
	static #t = "";
	static get workerPort() {
		return this.#e;
	}
	static set workerPort(e) {
		if (!(typeof Worker < "u" && e instanceof Worker) && e !== null) throw Error("Invalid `workerPort` type.");
		this.#e = e;
	}
	static get workerSrc() {
		return this.#t;
	}
	static set workerSrc(e) {
		if (typeof e != "string") throw Error("Invalid `workerSrc` type.");
		this.#t = e;
	}
}, Ir = class {
	#e;
	#t;
	constructor({ parsedData: e, rawData: t }) {
		this.#e = e, this.#t = t;
	}
	getRaw() {
		return this.#t;
	}
	get(e) {
		return this.#e.get(e) ?? null;
	}
	[Symbol.iterator]() {
		return this.#e.entries();
	}
}, Lr = Symbol("INTERNAL"), Rr = class {
	#e = !1;
	#t = !1;
	#n = !1;
	#r = !0;
	constructor(e, { name: t, intent: n, usage: r, rbGroups: i }) {
		this.#e = !!(e & g.DISPLAY), this.#t = !!(e & g.PRINT), this.name = t, this.intent = n, this.usage = r, this.rbGroups = i;
	}
	get visible() {
		if (this.#n) return this.#r;
		if (!this.#r) return !1;
		let { print: e, view: t } = this.usage;
		return this.#e ? t?.viewState !== "OFF" : !this.#t || e?.printState !== "OFF";
	}
	_setVisible(e, t, n = !1) {
		e !== Lr && I("Internal method `_setVisible` called."), this.#n = n, this.#r = t;
	}
	get serializable() {
		return {
			userSet: this.#n,
			visible: this.#r
		};
	}
}, zr = class e {
	#e = null;
	#t = /* @__PURE__ */ new Map();
	#n = null;
	#r = null;
	#i;
	creator = null;
	name = null;
	constructor(e, t = g.DISPLAY, n = null) {
		if (this.#i = e, this.renderingIntent = t, e !== null) {
			this.name = e.name, this.creator = e.creator, this.#r = e.order;
			for (let n of e.groups) this.#t.set(n.id, new Rr(t, n));
			if (n) {
				n.size !== this.#t.size && I("Incorrect serialized groupState.");
				for (let [e, t] of n) this.#t.get(e)._setVisible(Lr, t.visible, t.userSet);
			} else {
				if (e.baseState === "OFF") for (let e of this.#t.values()) e._setVisible(Lr, !1);
				for (let t of e.on) this.#t.get(t)._setVisible(Lr, !0);
				for (let t of e.off) this.#t.get(t)._setVisible(Lr, !1);
			}
			this.#n = this.getHash();
		}
	}
	#a(e) {
		let t = e.length;
		if (t < 2) return !0;
		let n = e[0];
		for (let r = 1; r < t; r++) {
			let t = e[r], i;
			if (Array.isArray(t)) i = this.#a(t);
			else if (this.#t.has(t)) i = this.#t.get(t).visible;
			else return F(`Optional content group not found: ${t}`), !0;
			switch (n) {
				case "And":
					if (!i) return !1;
					break;
				case "Or":
					if (i) return !0;
					break;
				case "Not": return !i;
				default: return !0;
			}
		}
		return n === "And";
	}
	isVisible(e) {
		if (this.#t.size === 0) return !0;
		if (!e) return P("Optional content group not defined."), !0;
		if (e.type === "OCG") return this.#t.has(e.id) ? this.#t.get(e.id).visible : (F(`Optional content group not found: ${e.id}`), !0);
		if (e.type === "OCMD") {
			if (e.expression) return this.#a(e.expression);
			if (!e.policy || e.policy === "AnyOn") {
				for (let t of e.ids) {
					if (!this.#t.has(t)) return F(`Optional content group not found: ${t}`), !0;
					if (this.#t.get(t).visible) return !0;
				}
				return !1;
			}
			if (e.policy === "AllOn") {
				for (let t of e.ids) {
					if (!this.#t.has(t)) return F(`Optional content group not found: ${t}`), !0;
					if (!this.#t.get(t).visible) return !1;
				}
				return !0;
			}
			if (e.policy === "AnyOff") {
				for (let t of e.ids) {
					if (!this.#t.has(t)) return F(`Optional content group not found: ${t}`), !0;
					if (!this.#t.get(t).visible) return !0;
				}
				return !1;
			}
			if (e.policy === "AllOff") {
				for (let t of e.ids) {
					if (!this.#t.has(t)) return F(`Optional content group not found: ${t}`), !0;
					if (this.#t.get(t).visible) return !1;
				}
				return !0;
			}
			return F(`Unknown optional content policy ${e.policy}.`), !0;
		}
		return F(`Unknown group type ${e.type}.`), !0;
	}
	setVisibility(e, t = !0, n = !0) {
		let r = this.#t.get(e);
		if (!r) {
			F(`Optional content group not found: ${e}`);
			return;
		}
		if (n && t && r.rbGroups.length) for (let t of r.rbGroups) for (let n of t) n !== e && this.#t.get(n)?._setVisible(Lr, !1, !0);
		r._setVisible(Lr, !!t, !0), this.#e = null;
	}
	setOCGState({ state: e, preserveRB: t }) {
		let n;
		for (let r of e) {
			switch (r) {
				case "ON":
				case "OFF":
				case "Toggle":
					n = r;
					continue;
			}
			let e = this.#t.get(r);
			if (e) switch (n) {
				case "ON":
					this.setVisibility(r, !0, t);
					break;
				case "OFF":
					this.setVisibility(r, !1, t);
					break;
				case "Toggle": this.setVisibility(r, !e.visible, t);
			}
		}
		this.#e = null;
	}
	get hasInitialVisibility() {
		return this.#n === null || this.getHash() === this.#n;
	}
	getOrder() {
		return this.#t.size ? this.#r ? this.#r.slice() : [...this.#t.keys()] : null;
	}
	getGroup(e) {
		return this.#t.get(e) || null;
	}
	getHash() {
		if (this.#e !== null) return this.#e;
		let e = new _t();
		for (let [t, n] of this.#t) e.update(`${t}:${n.visible}`);
		return this.#e = e.hexdigest();
	}
	[Symbol.iterator]() {
		return this.#t.entries();
	}
	get serializable() {
		let e = /* @__PURE__ */ new Map();
		for (let [t, n] of this.#t) e.set(t, n.serializable);
		return {
			data: this.#i,
			renderingIntent: this.renderingIntent,
			groupState: e
		};
	}
	static fromSerializable({ data: t, renderingIntent: n, groupState: r }) {
		return new e(t, n, r);
	}
}, Br = class {
	#e = null;
	#t = null;
	#n = 0;
	#r = null;
	#i = null;
	get pagesNumber() {
		return this.#n;
	}
	set pagesNumber(e) {
		this.#n !== e && (this.#n = e, this.#e = null, this.#t = null);
	}
	#a() {
		if (this.#e) return;
		let e = this.#n, t = this.#e = new Uint32Array(e);
		for (let n = 0; n < e; n++) t[n] = n + 1;
		this.#t = new Int32Array(t);
	}
	#o() {
		let e = /* @__PURE__ */ new Map(), t = this.#e;
		for (let n = 0, r = this.#n; n < r; n++) {
			let r = t[n], i = e.get(r);
			i ? i.push(n + 1) : e.set(r, [n + 1]);
		}
		return e;
	}
	movePages(e, t, n) {
		this.#a();
		let r = this.#e, i = t.length, a = new Uint32Array(i), o = 0;
		for (let e = 0; e < i; e++) {
			let i = t[e] - 1;
			a[e] = r[i], i < n && o++;
		}
		let s = this.#n, c = s - i, l = new Int32Array(s), u = Y(n - o, 0, c);
		for (let t = 0, n = 0; t < s; t++) e.has(t + 1) || (r[n] = r[t], l[n++] = t + 1);
		r.copyWithin(u + i, u, c), r.set(a, u), l.copyWithin(u + i, u, c), l.set(t, u), this.#t = l, r.every((e, t) => e === t + 1) && (this.#e = null);
	}
	deletePages(e) {
		this.#a();
		let t = this.#e, n = this.#o();
		this.#i = {
			pageNumberToId: t.slice(),
			pagesNumber: this.#n,
			prevPageNumbers: this.#t.slice()
		};
		let r = this.#n - e.length;
		this.#n = r;
		let i = this.#e = new Uint32Array(r);
		this.#t = new Int32Array(r);
		let a = 0, o = 0;
		for (let n of e) {
			let e = n - 1;
			e !== a && (i.set(t.subarray(a, e), o), o += e - a), a = e + 1;
		}
		a < t.length && i.set(t.subarray(a), o), this.#s(n, new Set(e));
	}
	cancelDelete() {
		this.#i &&= (this.#e = this.#i.pageNumberToId, this.#n = this.#i.pagesNumber, this.#t = this.#i.prevPageNumbers, null);
	}
	cleanSavedData() {
		this.#i = null;
	}
	copyPages(e) {
		this.#a(), this.#r = {
			pageNumbers: e,
			pageIds: e.map((e) => this.#e[e - 1])
		};
	}
	cancelCopy() {
		this.#r = null;
	}
	pastePages(e) {
		this.#a();
		let t = this.#e, n = this.#o(), { pageNumbers: r, pageIds: i } = this.#r, a = this.#n + r.length;
		this.#n = a;
		let o = this.#e = new Uint32Array(a);
		this.#t = new Int32Array(a), o.set(t.subarray(0, e), 0), o.set(i, e), o.set(t.subarray(e), e + r.length), this.#s(n, null, e, r), this.#r = null;
	}
	#s(e, t = null, n = -1, r = null) {
		let i = this.#t, a = this.#e, o = n + (r?.length ?? 0), s = /* @__PURE__ */ new Map();
		for (let c = 0, l = this.#n; c < l; c++) {
			if (c >= n && c < o) {
				i[c] = -r[c - n];
				continue;
			}
			let l = a[c], u = e.get(l), d = s.get(l) || 0;
			if (t && u) for (; d < u.length && t.has(u[d]);) d++;
			i[c] = u?.[d], s.set(l, d + 1);
		}
	}
	hasBeenAltered() {
		return this.#e !== null;
	}
	#c(e = null) {
		if (!this.#e) return null;
		let t = new Int32Array(this.#n).fill(-1), n = /* @__PURE__ */ new Map();
		if (e) for (let r of e) {
			let e = this.getPageId(r), i = n.get(e) ?? 0;
			n.set(e, i + 1), t[r - 1] = i;
		}
		else for (let e = 0, r = this.#n; e < r; e++) {
			let r = this.#e[e], i = n.get(r) ?? 0;
			n.set(r, i + 1), t[e] = i;
		}
		return t;
	}
	getPageMappingForSaving(e = null, t = this.#c()) {
		e ??= this.#o();
		let n = 0;
		for (let t of e.values()) n = Math.max(n, t.length);
		let r = Array(n);
		for (let e = 0; e < n; e++) r[e] = {
			document: null,
			pageIndices: [],
			includePages: []
		};
		for (let [t, n] of e) for (let e = 0, i = n.length; e < i; e++) r[e].includePages.push([t - 1, n[e] - 1]);
		for (let { includePages: e, pageIndices: t } of r) {
			e.sort((e, t) => e[0] - t[0]);
			for (let n = 0, r = e.length; n < r; n++) t.push(e[n][1]), e[n] = e[n][0];
		}
		return {
			pageInfos: r,
			copyLevels: t
		};
	}
	extractPages(e) {
		e = Array.from(e).sort((e, t) => e - t);
		let t = /* @__PURE__ */ new Map();
		for (let n = 0, r = e.length; n < r; n++) {
			let r = this.getPageId(e[n]);
			t.getOrInsertComputed(r, fe).push(n + 1);
		}
		return this.getPageMappingForSaving(t, this.#c(e));
	}
	getPrevPageNumber(e) {
		return this.#t?.[e - 1] ?? 0;
	}
	getPageNumber(e) {
		if (!this.#e) return e;
		let t = this.#e;
		for (let n = 0, r = this.#n; n < r; n++) if (t[n] === e) return n + 1;
		return 0;
	}
	getPageId(e) {
		return this.#e?.[e - 1] ?? e;
	}
	getMapping() {
		return this.#e?.subarray(0, this.pagesNumber);
	}
}, Vr = Symbol("INITIAL_DATA"), Hr = () => ({
	...Promise.withResolvers(),
	data: Vr
}), Ur = class {
	#e = /* @__PURE__ */ new Map();
	get(e, t = null) {
		if (t) {
			let n = this.#e.getOrInsertComputed(e, Hr);
			return n.promise.then(() => t(n.data)), null;
		}
		let n = this.#e.get(e);
		if (!n || n.data === Vr) throw Error(`Requesting object that isn't resolved yet ${e}.`);
		return n.data;
	}
	has(e) {
		let t = this.#e.get(e);
		return !!t && t.data !== Vr;
	}
	delete(e) {
		let t = this.#e.get(e);
		return !t || t.data === Vr ? !1 : (this.#e.delete(e), !0);
	}
	resolve(e, t = null) {
		let n = this.#e.getOrInsertComputed(e, Hr);
		if (n.data !== Vr) throw Error(`Object already resolved ${e}.`);
		n.data = t, n.resolve();
	}
	clear() {
		for (let { data: e } of this.#e.values()) e?.bitmap?.close();
		this.#e.clear();
	}
	*[Symbol.iterator]() {
		for (let [e, { data: t }] of this.#e) t !== Vr && (yield [e, t]);
	}
}, Wr = 1e5, Gr = 30, Kr = class e {
	#e = Promise.withResolvers();
	#t = null;
	#n = !1;
	#r = !!globalThis.FontInspector?.enabled;
	#i = null;
	#a = null;
	#o = null;
	#s = 0;
	#c = 0;
	#l = Le.pixelRatio;
	#u = null;
	#d = null;
	#f = 0;
	#p = 0;
	#m = Object.create(null);
	#h = [];
	#g = null;
	#_ = [];
	#v = /* @__PURE__ */ new WeakMap();
	#y = null;
	static #b = /* @__PURE__ */ new Map();
	static #x = /* @__PURE__ */ new Map();
	static #S = /* @__PURE__ */ new WeakMap();
	static #C = null;
	static #w = /* @__PURE__ */ new Set();
	constructor({ textContentSource: t, images: n, container: r, viewport: i }) {
		if (t instanceof ReadableStream) this.#g = t;
		else if (typeof t == "object") this.#g = new ReadableStream({ start(e) {
			e.enqueue(t), e.close();
		} });
		else throw Error("No \"textContentSource\" parameter specified.");
		this.#t = this.#d = r, this.#i = n, this.#p = i.scale * this.#l, this.#f = i.rotation, this.#o = {
			div: null,
			properties: null,
			ctx: null
		};
		let { pageWidth: a, pageHeight: o, pageX: s, pageY: c } = i.rawDims;
		this.#y = [
			1,
			0,
			0,
			-1,
			-s,
			c + o
		], this.#c = a, this.#s = o, e.#j(), r.style.setProperty("--min-font-size", e.#C), Ie(r, i), this.#e.promise.finally(() => {
			e.#w.delete(this), this.#o = null, this.#m = null;
		}).catch(() => {});
	}
	static get fontFamilyMap() {
		let { isWindows: e, isFirefox: t } = K.platform;
		return H(this, "fontFamilyMap", /* @__PURE__ */ new Map([["sans-serif", `${e && t ? "Calibri, " : ""}sans-serif`], ["monospace", `${e && t ? "Lucida Console, " : ""}monospace`]]));
	}
	render() {
		this.#i && this.#t.append(this.#i.render());
		let t = () => {
			this.#u.read().then(({ value: e, done: n }) => {
				if (n) {
					this.#e.resolve();
					return;
				}
				this.#a ??= e.lang, Object.assign(this.#m, e.styles), this.#T(e.items), t();
			}, this.#e.reject);
		};
		return this.#u = this.#g.getReader(), e.#w.add(this), t(), this.#e.promise;
	}
	update({ viewport: t, onBefore: n = null }) {
		let r = t.scale * Le.pixelRatio, i = t.rotation;
		if (i !== this.#f && (n?.(), this.#f = i, Ie(this.#d, { rotation: i })), r !== this.#p) {
			n?.(), this.#p = r, this.#l = Le.pixelRatio;
			let t = {
				div: null,
				properties: null,
				ctx: e.#O(this.#a)
			};
			for (let e of this.#_) t.properties = this.#v.get(e), t.div = e, this.#D(t);
		}
	}
	cancel() {
		let e = new re("TextLayer task cancelled.");
		this.#u?.cancel(e).catch(() => {}), this.#u = null, this.#e.reject(e);
	}
	get textDivs() {
		return this.#_;
	}
	get textContentItemsStr() {
		return this.#h;
	}
	#T(t) {
		if (this.#n) return;
		this.#o.ctx ??= e.#O(this.#a);
		let n = this.#_, r = this.#h;
		for (let e of t) {
			if (n.length > Wr) {
				F("Ignoring additional textDivs for performance reasons."), this.#n = !0;
				return;
			}
			if (e.str === void 0) {
				if (e.type === "beginMarkedContentProps" || e.type === "beginMarkedContent") {
					let t = this.#t;
					this.#t = document.createElement("span"), this.#t.classList.add("markedContent"), e.id && this.#t.setAttribute("id", e.id), e.tag === "Artifact" && (this.#t.ariaHidden = !0), t.append(this.#t);
				} else e.type === "endMarkedContent" && (this.#t = this.#t.parentNode);
				continue;
			}
			r.push(e.str), this.#E(e);
		}
	}
	#E(t) {
		let n = document.createElement("span"), r = {
			angle: 0,
			canvasWidth: 0,
			hasText: t.str !== "",
			hasEOL: t.hasEOL,
			fontSize: 0
		};
		this.#_.push(n);
		let i = q.transform(this.#y, t.transform), a = Math.atan2(i[1], i[0]), o = this.#m[t.fontName];
		o.vertical && (a += Math.PI / 2);
		let s = this.#r && o.fontSubstitution || o.fontFamily;
		s = e.fontFamilyMap.get(s) || s;
		let c = Math.hypot(i[2], i[3]), l = c * e.#M(s, o, this.#a), u, d;
		a === 0 ? (u = i[4], d = i[5] - l) : (u = i[4] + l * Math.sin(a), d = i[5] - l * Math.cos(a));
		let f = n.style;
		f.left = `${(100 * u / this.#c).toFixed(2)}%`, f.top = `${(100 * d / this.#s).toFixed(2)}%`;
		let p = Math.round(c * 100) / 100;
		f.setProperty("--font-height", `${p}px`), f.fontFamily = s, r.fontSize = p, n.setAttribute("role", "presentation"), n.textContent = t.str, n.dir = t.dir, this.#r && (n.dataset.fontName = o.fontSubstitutionLoadedName || t.fontName), a !== 0 && (r.angle = 180 / Math.PI * a);
		let m = !1;
		if (t.str.length > 1) m = !0;
		else if (t.str !== " " && t.transform[0] !== t.transform[3]) {
			let e = Math.abs(t.transform[0]), n = Math.abs(t.transform[3]);
			e !== n && Math.max(e, n) / Math.min(e, n) > 1.5 && (m = !0);
		}
		if (m && (r.canvasWidth = o.vertical ? t.height : t.width), this.#v.set(n, r), this.#o.div = n, this.#o.properties = r, this.#D(this.#o), r.hasText && this.#t.append(n), r.hasEOL) {
			let e = document.createElement("br");
			e.setAttribute("role", "presentation"), this.#t.append(e);
		}
	}
	#D(t) {
		let { div: n, properties: r, ctx: i } = t, { style: a } = n, { canvasWidth: o, fontSize: s } = r;
		if (o !== 0 && s !== 0 && r.hasText) {
			let { fontFamily: t } = a, r = this.#l, c = e.#k(s * this.#p / r) * r;
			e.#A(i, c, t);
			let { width: l } = i.measureText(n.textContent);
			l > 0 && a.setProperty("--scale-x", o * c / (l * s));
		}
		r.angle !== 0 && a.setProperty("--rotate", `${r.angle}deg`);
	}
	static cleanup() {
		if (!(this.#w.size > 0)) {
			this.#b.clear();
			for (let { canvas: e } of this.#x.values()) e.remove();
			this.#x.clear();
		}
	}
	static #O(e = null) {
		let t = this.#x.get(e ||= "");
		if (!t) {
			let n = document.createElement("canvas");
			n.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;display:none;letter-spacing:normal;word-spacing:normal", n.lang = e, document.body.append(n), t = n.getContext("2d", {
				alpha: !1,
				willReadFrequently: !0
			}), this.#x.set(e, t), this.#S.set(t, {
				size: 0,
				family: ""
			});
		}
		return t;
	}
	static #k(e) {
		e = Math.fround(e);
		let t = Math.fround(e * 131073);
		return Math.fround(t - Math.fround(t - e));
	}
	static #A(e, t, n) {
		let r = this.#S.get(e);
		(t !== r.size || n !== r.family) && (e.font = `${t}px ${n}`, r.size = t, r.family = n);
	}
	static #j() {
		if (this.#C !== null) return;
		let e = document.createElement("div");
		e.style.opacity = 0, e.style.lineHeight = 1, e.style.fontSize = "1px", e.style.position = "absolute", e.textContent = "X", document.body.append(e), this.#C = e.getBoundingClientRect().height, e.remove();
	}
	static #M(e, t, n) {
		let r = this.#b.get(e);
		if (r) return r;
		let i = this.#O(n);
		this.#A(i, Gr, e);
		let a = i.measureText(""), o = a.fontBoundingBoxAscent, s = Math.abs(a.fontBoundingBoxDescent), c = .8;
		return o ? c = o / (o + s) : (K.platform.isFirefox && F("Enable the `dom.textMetrics.fontBoundingBox.enabled` preference in `about:config` to improve TextLayer rendering."), t.ascent ? c = t.ascent : t.descent && (c = 1 + t.descent)), this.#b.set(e, c), c;
	}
}, qr = 100;
function Jr(e = {}) {
	let t = new Yr(), { docId: n } = t, r = e.url ? Xt(e.url) : null, i = e.data ? Zt(e.data) : null, a = e.httpHeaders || null, o = e.withCredentials === !0, s = e.password ?? null, c = e.range instanceof Xr ? e.range : null, l = Number.isInteger(e.rangeChunkSize) && e.rangeChunkSize > 0 ? e.rangeChunkSize : 2 ** 16, u = e.worker instanceof $r ? e.worker : null, f = e.verbosity, p = typeof e.docBaseUrl == "string" && !Ce(e.docBaseUrl) ? e.docBaseUrl : null, m = Qt(e.cMapUrl), h = e.cMapPacked !== !1, g = Qt(e.iccUrl), _ = Qt(e.standardFontDataUrl), v = Qt(e.wasmUrl), y = e.stopAtErrors !== !0, b = Number.isInteger(e.maxImageSize) && e.maxImageSize > -1 ? e.maxImageSize : -1, x = typeof e.isOffscreenCanvasSupported == "boolean" ? e.isOffscreenCanvasSupported : !d, S = typeof e.isImageDecoderSupported == "boolean" ? e.isImageDecoderSupported : !d, C = Number.isInteger(e.canvasMaxAreaInBytes) ? e.canvasMaxAreaInBytes : -1, w = typeof e.disableFontFace == "boolean" ? e.disableFontFace : d, T = e.fontExtraProperties === !0, E = e.enableXfa === !0, D = e.ownerDocument || globalThis.document, O = e.disableRange === !0, k = e.disableStream === !0, A = e.disableAutoFetch === !0, j = e.pdfBug === !0, N = e.CanvasFactory || (d ? gn : un), P = e.FilterFactory || (d ? hn : fn), F = e.BinaryDataFactory || (d ? _n : cn), I = e.enableHWA === !0, L = e.enableWebGPU === !0 ? Sn() : Promise.resolve(!1), R = e.useWasm !== !1, z = e.pagesMapper || new Br(), B = typeof e.useSystemFonts == "boolean" ? e.useSystemFonts : !d && !w, V = typeof e.useWorkerFetch == "boolean" ? e.useWorkerFetch : !!(F === cn && m && h && _ && v && Oe(m, document.baseURI) && Oe(_, document.baseURI) && Oe(v, document.baseURI));
	M(f);
	let H = {
		canvasFactory: new N({
			ownerDocument: D,
			enableHWA: I
		}),
		filterFactory: new P({
			docId: n,
			ownerDocument: D
		}),
		binaryDataFactory: V ? null : new F({
			cMapUrl: m,
			standardFontDataUrl: _,
			wasmUrl: v
		})
	};
	u || (u = $r.create({
		verbosity: f,
		port: Fr.workerPort
	}), t._worker = u);
	let U = {
		docId: n,
		apiVersion: "6.4.299",
		data: i,
		password: s,
		disableAutoFetch: A,
		rangeChunkSize: l,
		docBaseUrl: p,
		enableXfa: E,
		evaluatorOptions: {
			maxImageSize: b,
			disableFontFace: w,
			ignoreErrors: y,
			isOffscreenCanvasSupported: x,
			isImageDecoderSupported: S,
			canvasMaxAreaInBytes: C,
			fontExtraProperties: T,
			useSystemFonts: B,
			useWasm: R,
			useWorkerFetch: V,
			cMapUrl: m,
			cMapPacked: h,
			iccUrl: g,
			standardFontDataUrl: _,
			wasmUrl: v,
			hasGPU: !1
		}
	}, ee = {
		ownerDocument: D,
		pdfBug: j,
		styleElement: null,
		enableHWA: I,
		loadingParams: {
			disableAutoFetch: A,
			enableXfa: E
		}
	};
	return Promise.all([u.promise, L]).then(function([, e]) {
		if (u.destroyed) throw Error("Worker was destroyed");
		U.evaluatorOptions.hasGPU = e;
		let s = u.messageHandler.sendWithPromise("GetDocRequest", U, i ? [i.buffer] : null), d;
		if (!i) {
			if (c) d = new xr({
				pdfDataRangeTransport: c,
				disableRange: O,
				disableStream: k
			});
			else if (r) d = new (Pr(r))({
				url: r,
				httpHeaders: a,
				withCredentials: o,
				rangeChunkSize: l,
				disableRange: O,
				disableStream: k
			});
			else throw Error("getDocument - expected either `data`, `range`, or `url` parameter.");
		}
		return s.then((e) => {
			if (u.destroyed) throw Error("Worker was destroyed");
			let r = new on(n, e, u.port), i = new ei(r, t, d, ee, H, z);
			if (t._transport = i, t.destroyed) throw Error("Loading aborted");
			r.send("Ready", null);
		});
	}).catch(t._capability.reject).finally(t._setupCapability.resolve), t;
}
var Yr = class e {
	static #e = 0;
	_capability = Promise.withResolvers();
	_setupCapability = Promise.withResolvers();
	_transport = null;
	_worker = null;
	docId = `d${e.#e++}`;
	destroyed = !1;
	onPassword = null;
	onProgress = null;
	get promise() {
		return this._capability.promise;
	}
	async destroy() {
		this.destroyed = !0, this._capability.promise.catch(() => {});
		try {
			this._worker?.port && (this._worker._pendingDestroy = !0), await this._setupCapability.promise, await this._transport?.destroy();
		} catch (e) {
			throw this._worker?.port && delete this._worker._pendingDestroy, e;
		}
		this._transport = null, this._worker?.destroy(), this._worker = null;
	}
	async getData() {
		return this._transport.getData();
	}
}, Xr = class {
	#e = Promise.withResolvers();
	#t = null;
	constructor(e, t, n = !1, r = null) {
		this.length = e, this.initialData = t, this.progressiveDone = n, this.contentDispositionFilename = r;
	}
	onDataRange(e, t) {
		this.#t({
			type: "range",
			begin: e,
			chunk: t
		});
	}
	onDataProgressiveRead(e) {
		this.#e.promise.then(() => {
			this.#t({
				type: "progressiveRead",
				chunk: e
			});
		});
	}
	onDataProgressiveDone() {
		this.#e.promise.then(() => {
			this.#t({ type: "progressiveDone" });
		});
	}
	transportReady(e) {
		this.#t = e, this.#e.resolve();
	}
	requestDataRange(e, t) {
		I("Abstract method PDFDataRangeTransport.requestDataRange");
	}
	abort() {}
}, Zr = class {
	constructor(e, t) {
		this._pdfInfo = e, this._transport = t;
	}
	get pagesMapper() {
		return this._transport.pagesMapper;
	}
	get annotationStorage() {
		return this._transport.annotationStorage;
	}
	get canvasFactory() {
		return this._transport.canvasFactory;
	}
	get filterFactory() {
		return this._transport.filterFactory;
	}
	get numPages() {
		return this._pdfInfo.numPages;
	}
	get fingerprints() {
		return this._pdfInfo.fingerprints;
	}
	get isPureXfa() {
		return H(this, "isPureXfa", !!this._transport._htmlForXfa);
	}
	get allXfaHtml() {
		return this._transport._htmlForXfa;
	}
	getPage(e) {
		return this._transport.getPage(e);
	}
	getPageIndex(e) {
		return this._transport.getPageIndex(e);
	}
	getDestinations() {
		return this._transport.getDestinations();
	}
	getDestination(e) {
		return this._transport.getDestination(e);
	}
	getPageLabels() {
		return this._transport.getPageLabels();
	}
	getPageLayout() {
		return this._transport.getPageLayout();
	}
	getPageMode() {
		return this._transport.getPageMode();
	}
	getViewerPreferences() {
		return this._transport.getViewerPreferences();
	}
	getOpenAction() {
		return this._transport.getOpenAction();
	}
	getAttachments() {
		return this._transport.getAttachments();
	}
	getAttachmentContent(e) {
		return this._transport.getAttachmentContent(e);
	}
	getAnnotationsByType(e, t) {
		return this._transport.getAnnotationsByType(e, t);
	}
	getJSActions() {
		return this._transport.getDocJSActions();
	}
	getOutline() {
		return this._transport.getOutline();
	}
	getOptionalContentConfig({ intent: e = "display" } = {}) {
		let { renderingIntent: t } = this._transport.getRenderingIntent(e);
		return this._transport.getOptionalContentConfig(t);
	}
	getPermissions() {
		return this._transport.getPermissions();
	}
	getMetadata() {
		return this._transport.getMetadata();
	}
	getMarkInfo() {
		return this._transport.getMarkInfo();
	}
	getData() {
		return this._transport.getData();
	}
	saveDocument(e) {
		return this._transport.saveDocument(e);
	}
	extractPages(e, t = null) {
		return this._transport.extractPages(e, t);
	}
	getDownloadInfo() {
		return this._transport.downloadInfoCapability.promise;
	}
	cleanup(e = !1) {
		return this._transport.startCleanup(e || this.isPureXfa);
	}
	cachedPageNumber(e) {
		return this._transport.cachedPageNumber(e);
	}
	get loadingParams() {
		return this._transport.loadingParams;
	}
	get loadingTask() {
		return this._transport.loadingTask;
	}
	getFieldObjects() {
		return this._transport.getFieldObjects();
	}
	getSignatures() {
		return this._transport.getSignatures();
	}
	getSignatureData(e) {
		return this._transport.getSignatureData(e);
	}
	hasJSActions() {
		return this._transport.hasJSActions();
	}
	getCalculationOrderIds() {
		return this._transport.getCalculationOrderIds();
	}
}, Qr = class e {
	#e = !1;
	#t = null;
	static #n = 0;
	constructor(t, n, r, i, a = !1) {
		this._pageIndex = t, this._id = e.#n++, this._pageInfo = n, this._transport = r, this._stats = a ? new De() : null, this._pdfBug = a, this.commonObjs = r.commonObjs, this.objs = new Ur(), this._intentStates = /* @__PURE__ */ new Map(), this.destroyed = !1, this.recordedBBoxes = null, this.#t = i, this.imageCoordinates = null;
	}
	clone(t) {
		let n = new e(t, this._pageInfo, this._transport, this.#t, this._pdfBug);
		return n.clonedFromIndex = this.clonedFromIndex ?? this._pageIndex, this._transport.updatePage(n), n;
	}
	get pageNumber() {
		return this._pageIndex + 1;
	}
	set pageNumber(e) {
		this._pageIndex = e - 1, this._transport.updatePage(this);
	}
	get rotate() {
		return this._pageInfo.rotate;
	}
	get ref() {
		return this._pageInfo.ref;
	}
	get userUnit() {
		return this._pageInfo.userUnit;
	}
	get view() {
		return this._pageInfo.view;
	}
	getViewport({ scale: e, rotation: t = this.rotate, offsetX: n = 0, offsetY: r = 0, dontFlip: i = !1 } = {}) {
		return new he({
			viewBox: this.view,
			userUnit: this.userUnit,
			scale: e,
			rotation: t,
			offsetX: n,
			offsetY: r,
			dontFlip: i
		});
	}
	getAnnotations({ intent: e = "display" } = {}) {
		let { renderingIntent: t } = this._transport.getRenderingIntent(e);
		return this._transport.getAnnotations(this._pageIndex, t);
	}
	getJSActions() {
		return this._transport.getPageJSActions(this._pageIndex);
	}
	get filterFactory() {
		return this._transport.filterFactory;
	}
	get isPureXfa() {
		return H(this, "isPureXfa", !!this._transport._htmlForXfa);
	}
	async getXfa() {
		return this._transport._htmlForXfa?.children[this._pageIndex] || null;
	}
	render({ canvasContext: e, canvas: t = e.canvas, viewport: n, intent: r = "display", annotationMode: i = _.ENABLE, transform: a = null, background: o = null, optionalContentConfigPromise: s = null, annotationCanvasMap: c = null, pageColors: l = null, printAnnotationStorage: u = null, isEditing: d = !1, recordImages: f = !1, recordOperations: p = !1, operationsFilter: m = null }) {
		this._stats?.time("Overall");
		let h = this._transport.getRenderingIntent(r, i, u, d), { renderingIntent: v, cacheKey: y } = h;
		this.#e = !1, s ||= this._transport.getOptionalContentConfig(v);
		let b = this._intentStates.getOrInsertComputed(y, pe);
		b.streamReaderCancelTimeout &&= (clearTimeout(b.streamReaderCancelTimeout), null);
		let x = !!(v & g.PRINT);
		b.displayReadyCapability || (b.displayReadyCapability = Promise.withResolvers(), b.operatorList = {
			fnArray: [],
			argsArray: [],
			lastChunk: !1,
			separateAnnots: null
		}, this._stats?.time("Page Request"), this._pumpOperatorList(h));
		let S = !!(this._pdfBug && globalThis.StepperManager?.enabled), C = !!t && !this.recordedBBoxes && (p || S), w = !!t && !this.imageCoordinates && f, T = (e) => {
			if (b.renderTasks.delete(O), C) {
				let e = O.gfx?.dependencyTracker.take();
				e && (O.stepper?.setOperatorBBoxes(e, O.gfx.dependencyTracker.takeDebugMetadata()), p && (this.recordedBBoxes = e));
			}
			w && !e && (this.imageCoordinates = O.gfx?.imagesTracker.take()), x && (this.#e = !0), this.#r(), e ? (O.capability.reject(e), this._abortOperatorList({
				intentState: b,
				reason: e instanceof Error ? e : Error(e)
			})) : O.capability.resolve(), this._stats && (this._stats.timeEnd("Rendering"), this._stats.timeEnd("Overall"), globalThis.Stats?.enabled && globalThis.Stats.add(this.pageNumber, this._stats));
		}, E = null, D = null;
		(C || w) && (D = new kt(t, b.operatorList.length)), C && (E = new At(D, S));
		let O = new ni({
			callback: T,
			params: {
				canvas: t,
				canvasContext: e,
				dependencyTracker: E ?? D,
				imagesTracker: w ? new Nt(t) : null,
				viewport: n,
				transform: a,
				background: o
			},
			objs: this.objs,
			commonObjs: this.commonObjs,
			annotationCanvasMap: c,
			operatorList: b.operatorList,
			pageIndex: this._pageIndex,
			canvasFactory: this._transport.canvasFactory,
			filterFactory: this._transport.filterFactory,
			useRequestAnimationFrame: !x,
			pdfBug: this._pdfBug,
			pageColors: l,
			enableHWA: this._transport.enableHWA,
			operationsFilter: m
		});
		(b.renderTasks ||= /* @__PURE__ */ new Set()).add(O);
		let k = O.task;
		return Promise.all([b.displayReadyCapability.promise, s]).then(([e, t]) => {
			if (this.destroyed) {
				T();
				return;
			}
			if (this._stats?.time("Rendering"), !(t.renderingIntent & v)) throw Error("Must use the same `intent`-argument when calling the `PDFPageProxy.render` and `PDFDocumentProxy.getOptionalContentConfig` methods.");
			O.initializeGraphics({
				transparency: e,
				optionalContentConfig: t
			}), O.operatorListChanged();
		}).catch(T), k;
	}
	getOperatorList({ intent: e = "display", annotationMode: t = _.ENABLE, printAnnotationStorage: n = null, isEditing: r = !1 } = {}) {
		function i() {
			o.operatorList.lastChunk && (o.opListReadCapability.resolve(o.operatorList), o.renderTasks.delete(s));
		}
		let a = this._transport.getRenderingIntent(e, t, n, r, !0), o = this._intentStates.getOrInsertComputed(a.cacheKey, pe), s;
		return o.opListReadCapability || (s = Object.create(null), s.operatorListChanged = i, o.opListReadCapability = Promise.withResolvers(), (o.renderTasks ||= /* @__PURE__ */ new Set()).add(s), o.operatorList = {
			fnArray: [],
			argsArray: [],
			lastChunk: !1,
			separateAnnots: null
		}, this._stats?.time("Page Request"), this._pumpOperatorList(a)), o.opListReadCapability.promise;
	}
	streamTextContent({ includeMarkedContent: e = !1, disableNormalization: t = !1 } = {}) {
		return this._transport.messageHandler.sendWithStream("GetTextContent", {
			pageId: this.#t.getPageId(this._pageIndex + 1) - 1,
			pageIndex: this._pageIndex,
			includeMarkedContent: e === !0,
			disableNormalization: t === !0
		}, {
			highWaterMark: 100,
			size: (e) => e.items.length
		});
	}
	async getTextContent(e = {}) {
		if (this._transport._htmlForXfa) return this.getXfa().then((e) => ge.textContent(e));
		let t = this.streamTextContent(e), n = {
			items: [],
			styles: Object.create(null),
			lang: null
		};
		for await (let e of t) n.lang ??= e.lang, Object.assign(n.styles, e.styles), n.items.push(...e.items);
		return n;
	}
	getStructTree() {
		return this._transport.getStructTree(this._pageIndex);
	}
	_destroy() {
		this.destroyed = !0;
		let e = [];
		for (let t of this._intentStates.values()) if (this._abortOperatorList({
			intentState: t,
			reason: /* @__PURE__ */ Error("Page was destroyed."),
			force: !0
		}), !t.opListReadCapability) for (let n of t.renderTasks) e.push(n.completed), n.cancel();
		return this.objs.clear(), this.#e = !1, Promise.all(e);
	}
	cleanup(e = !1) {
		this.#e = !0;
		let t = this.#r();
		return e && t && (this._stats &&= new De()), t;
	}
	#r() {
		if (!this.#e || this.destroyed) return !1;
		for (let { renderTasks: e, operatorList: t } of this._intentStates.values()) if (e.size > 0 || !t.lastChunk) return !1;
		return this._intentStates.clear(), this.objs.clear(), this.#e = !1, !0;
	}
	_startRenderPage(e, t) {
		let n = this._intentStates.get(t);
		n && (this._stats?.timeEnd("Page Request"), n.displayReadyCapability?.resolve(e));
	}
	_renderPageChunk(e, t) {
		for (let n = 0, r = e.length; n < r; n++) t.operatorList.fnArray.push(e.fnArray[n]), t.operatorList.argsArray.push(e.argsArray[n]);
		t.operatorList.lastChunk = e.lastChunk, t.operatorList.separateAnnots = e.separateAnnots;
		for (let e of t.renderTasks) e.operatorListChanged();
		e.lastChunk && this.#r();
	}
	_pumpOperatorList({ renderingIntent: e, cacheKey: t, annotationStorageSerializable: n, modifiedIds: r }) {
		let { map: i, transfer: a } = n, o = this._transport.messageHandler.sendWithStream("GetOperatorList", {
			pageId: this.#t.getPageId(this._pageIndex + 1) - 1,
			pageIndex: this._pageIndex,
			pageProxyId: this._id,
			intent: e,
			cacheKey: t,
			annotationStorage: i,
			modifiedIds: r
		}, void 0, a).getReader(), s = this._intentStates.get(t);
		s.streamReader = o;
		let c = () => {
			o.read().then(({ value: e, done: t }) => {
				if (t) {
					s.streamReader = null;
					return;
				}
				this._transport.destroyed || (this._renderPageChunk(e, s), c());
			}, (e) => {
				if (s.streamReader = null, !this._transport.destroyed) {
					if (s.operatorList) {
						s.operatorList.lastChunk = !0;
						for (let e of s.renderTasks) e.operatorListChanged();
						this.#r();
					}
					if (s.displayReadyCapability) s.displayReadyCapability.reject(e);
					else if (s.opListReadCapability) s.opListReadCapability.reject(e);
					else throw e;
				}
			});
		};
		c();
	}
	_abortOperatorList({ intentState: e, reason: t, force: n = !1 }) {
		if (e.streamReader) {
			if (e.streamReaderCancelTimeout &&= (clearTimeout(e.streamReaderCancelTimeout), null), !n) {
				if (e.renderTasks.size > 0) return;
				if (t instanceof Se) {
					let n = qr;
					t.extraDelay > 0 && t.extraDelay < 1e3 && (n += t.extraDelay), e.streamReaderCancelTimeout = setTimeout(() => {
						e.streamReaderCancelTimeout = null, this._abortOperatorList({
							intentState: e,
							reason: t,
							force: !0
						});
					}, n);
					return;
				}
			}
			if (e.streamReader.cancel(new re(t.message)).catch(() => {}), e.streamReader = null, !this._transport.destroyed) {
				for (let [t, n] of this._intentStates) if (n === e) {
					this._intentStates.delete(t);
					break;
				}
				this.cleanup();
			}
		}
	}
	get stats() {
		return this._stats;
	}
}, $r = class e {
	#e = Promise.withResolvers();
	#t = null;
	#n = null;
	#r = null;
	static #i = 0;
	static #a = !1;
	static #o = /* @__PURE__ */ new WeakMap();
	static {
		d && (this.#a = !0, Fr.workerSrc ||= "./pdf.worker.mjs"), this._isSameOrigin = (e, t) => {
			let n = URL.parse(e);
			if (!n?.origin || n.origin === "null") return !1;
			let r = new URL(t, n);
			return n.origin === r.origin;
		}, this._createCDNWrapper = (e) => {
			let t = `await import("${e}");`;
			return URL.createObjectURL(new Blob([t], { type: "text/javascript" }));
		};
	}
	constructor({ name: t = null, port: n = null, verbosity: r = N() } = {}) {
		if (this.name = t, this.destroyed = !1, this.verbosity = r, n) {
			if (e.#o.has(n)) throw Error("Cannot use more than one PDFWorker per port.");
			e.#o.set(n, this), this.#c(n);
		} else this.#l();
	}
	get promise() {
		return this.#e.promise;
	}
	#s() {
		this.#e.resolve(), this.#t.send("configure", { verbosity: this.verbosity });
	}
	get port() {
		return this.#n;
	}
	get messageHandler() {
		return this.#t;
	}
	#c(e) {
		this.#n = e, this.#t = new on("main", "worker", e), this.#t.on("ready", () => {}), this.#s();
	}
	#l() {
		if (e.#a || e.#d) {
			this.#u();
			return;
		}
		let { workerSrc: t } = e;
		try {
			e._isSameOrigin(window.location, t) || (t = e._createCDNWrapper(new URL(t, window.location).href));
			let n = new Worker(t, { type: "module" }), r = new on("main", "worker", n), i = () => {
				a.abort(), r.destroy(), n.terminate(), this.destroyed ? this.#e.reject(/* @__PURE__ */ Error("Worker was destroyed")) : this.#u();
			}, a = new AbortController();
			n.addEventListener("error", () => {
				this.#r || i();
			}, { signal: a.signal }), r.on("ready", (e) => {
				if (a.abort(), this.destroyed || !(e instanceof Uint8Array)) {
					i();
					return;
				}
				this.#t = r, this.#n = n, this.#r = n, this.#s();
			});
		} catch {
			P("The worker has been disabled."), this.#u();
		}
	}
	#u() {
		e.#a ||= (F("Setting up fake worker."), !0), e._setupFakeWorkerGlobal.then((t) => {
			if (this.destroyed) {
				this.#e.reject(/* @__PURE__ */ Error("Worker was destroyed"));
				return;
			}
			let n = new tn();
			this.#n = n;
			let r = `fake${e.#i++}`, i = new on(r + "_worker", r, n);
			t.setup(i, n), this.#t = new on(r, r + "_worker", n), this.#s();
		}).catch((e) => {
			this.#e.reject(/* @__PURE__ */ Error(`Setting up fake worker failed: "${e.message}".`));
		});
	}
	destroy() {
		this.destroyed = !0, this.#r?.terminate(), this.#r = null, e.#o.delete(this.#n), this.#n = null, this.#t?.destroy(), this.#t = null;
	}
	static create(t) {
		let n = this.#o.get(t?.port);
		if (n) {
			if (n._pendingDestroy) throw Error("PDFWorker.create - the worker is being destroyed.\nPlease remember to await `PDFDocumentLoadingTask.destroy()`-calls.");
			return n;
		}
		return new e(t);
	}
	static get workerSrc() {
		if (Fr.workerSrc) return Fr.workerSrc;
		throw Error("No \"GlobalWorkerOptions.workerSrc\" specified.");
	}
	static get #d() {
		try {
			return globalThis.pdfjsWorker?.WorkerMessageHandler || null;
		} catch {
			return null;
		}
	}
	static get _setupFakeWorkerGlobal() {
		return H(this, "_setupFakeWorkerGlobal", (async () => this.#d ? this.#d : (await import(
			/*webpackIgnore: true*/
			/*@vite-ignore*/
			this.workerSrc
)).WorkerMessageHandler)());
	}
}, ei = class {
	downloadInfoCapability = Promise.withResolvers();
	#e = null;
	#t = /* @__PURE__ */ new Map();
	#n = null;
	#r = /* @__PURE__ */ new Map();
	#i = /* @__PURE__ */ new Map();
	#a = /* @__PURE__ */ new Map();
	#o = null;
	#s = null;
	constructor(e, t, n, r, i, a) {
		this.messageHandler = e, this.loadingTask = t, this.#n = n, this.commonObjs = new Ur(), this.fontLoader = new Lt({
			ownerDocument: r.ownerDocument,
			styleElement: r.styleElement
		}), this.enableHWA = r.enableHWA, this.loadingParams = r.loadingParams, this._params = r, this.canvasFactory = i.canvasFactory, this.filterFactory = i.filterFactory, this.binaryDataFactory = i.binaryDataFactory, this.pagesMapper = a, this.destroyed = !1, this.destroyCapability = null, this.setupMessageHandler();
	}
	updatePage(e) {
		this.#r.set(e._id, e), this.#i.set(e._pageIndex, Promise.resolve(e));
	}
	#c(e, t = null) {
		return this.#t.getOrInsertComputed(e, () => this.messageHandler.sendWithPromise(e, t));
	}
	#l({ loaded: e, total: t }) {
		this.loadingTask.onProgress?.({
			loaded: e,
			total: t,
			percent: t ? Y(Math.round(e / t * 100), 0, 100) : NaN
		});
	}
	get annotationStorage() {
		return H(this, "annotationStorage", new yt());
	}
	getRenderingIntent(e, t = _.ENABLE, n = null, r = !1, i = !1) {
		let a = g.DISPLAY, o = vt;
		switch (e) {
			case "any":
				a = g.ANY;
				break;
			case "display": break;
			case "print":
				a = g.PRINT;
				break;
			default: F(`getRenderingIntent - invalid intent: ${e}`);
		}
		let s = a & g.PRINT && n instanceof bt ? n : this.annotationStorage;
		switch (t) {
			case _.DISABLE:
				a += g.ANNOTATIONS_DISABLE;
				break;
			case _.ENABLE: break;
			case _.ENABLE_FORMS:
				a += g.ANNOTATIONS_FORMS;
				break;
			case _.ENABLE_STORAGE:
				a += g.ANNOTATIONS_STORAGE, o = s.serializable;
				break;
			default: F(`getRenderingIntent - invalid annotationMode: ${t}`);
		}
		r && (a += g.IS_EDITING), i && (a += g.OPLIST);
		let { ids: c, hash: l } = s.modifiedIds, u = [
			a,
			o.hash,
			l
		];
		return {
			renderingIntent: a,
			cacheKey: u.join("_"),
			annotationStorageSerializable: o,
			modifiedIds: c
		};
	}
	destroy() {
		if (this.destroyCapability) return this.destroyCapability.promise;
		this.destroyed = !0, this.destroyCapability = Promise.withResolvers(), this.#o?.reject(/* @__PURE__ */ Error("Worker was destroyed during onPassword callback"));
		let e = [];
		for (let t of this.#r.values()) e.push(t._destroy());
		this.#r.clear(), this.#i.clear(), this.#a.clear(), Object.hasOwn(this, "annotationStorage") && this.annotationStorage.resetModified();
		let t = this.messageHandler.sendWithPromise("Terminate", null);
		return e.push(t), Promise.all(e).then(() => {
			this.commonObjs.clear(), this.fontLoader.clear(), this.#t.clear(), this.filterFactory.destroy(), Kr.cleanup(), this.#n?.cancelAllRequests(new re("Worker was terminated.")), this.messageHandler?.destroy(), this.messageHandler = null, this.destroyCapability.resolve();
		}, this.destroyCapability.reject), this.destroyCapability.promise;
	}
	setupMessageHandler() {
		let { messageHandler: e, loadingTask: t } = this;
		e.on("GetReader", (e, t) => {
			L(this.#n, "GetReader - no `BasePDFStream` instance available."), this.#e = this.#n.getFullReader(), this.#e.onProgress = (e) => this.#l(e), t.onPull = () => {
				this.#e.read().then(function({ value: e, done: n }) {
					if (n) {
						t.close();
						return;
					}
					L(e instanceof ArrayBuffer, "GetReader - expected an ArrayBuffer."), t.enqueue(new Uint8Array(e), 1, [e]);
				}).catch((e) => {
					t.error(e);
				});
			}, t.onCancel = (e) => {
				this.#e.cancel(e), t.ready.catch((e) => {
					if (!this.destroyed) throw e;
				});
			};
		}), e.on("ReaderHeadersReady", async (e) => {
			await this.#e.headersReady;
			let { isStreamingSupported: t, isRangeSupported: n, contentLength: r } = this.#e;
			return t && n && (this.#e.onProgress = null), {
				isStreamingSupported: t,
				isRangeSupported: n,
				contentLength: r
			};
		}), e.on("GetRangeReader", (e, t) => {
			L(this.#n, "GetRangeReader - no `BasePDFStream` instance available.");
			let n = this.#n.getRangeReader(e.begin, e.end);
			if (!n) {
				t.close();
				return;
			}
			t.onPull = () => {
				n.read().then(function({ value: e, done: n }) {
					if (n) {
						t.close();
						return;
					}
					L(e instanceof ArrayBuffer, "GetRangeReader - expected an ArrayBuffer."), t.enqueue(new Uint8Array(e), 1, [e]);
				}).catch((e) => {
					t.error(e);
				});
			}, t.onCancel = (e) => {
				n.cancel(e), t.ready.catch((e) => {
					if (!this.destroyed) throw e;
				});
			};
		}), e.on("GetDoc", ({ pdfInfo: e }) => {
			this.pagesMapper.pagesNumber = e.numPages, this._numPages = e.numPages, this._htmlForXfa = e.htmlForXfa, delete e.htmlForXfa, t._capability.resolve(new Zr(e, this));
		}), e.on("DocException", (e) => {
			t._capability.reject(Q(e));
		}), e.on("PasswordRequest", (e) => {
			this.#o = Promise.withResolvers();
			try {
				if (!t.onPassword) throw Q(e);
				t.onPassword((e) => {
					e instanceof Error ? this.#o.reject(e) : this.#o.resolve({ password: e });
				}, e.code);
			} catch (e) {
				this.#o.reject(e);
			}
			return this.#o.promise;
		}), e.on("DataLoaded", (e) => {
			this.#l({
				loaded: e.length,
				total: e.length
			}), this.downloadInfoCapability.resolve(e);
		}), e.on("StartRenderPage", (e) => {
			this.destroyed || this.#r.get(e.pageProxyId)._startRenderPage(e.transparency, e.cacheKey);
		}), e.on("commonobj", ([t, n, r]) => {
			if (this.destroyed || this.commonObjs.has(t)) return null;
			switch (n) {
				case "Font":
					if ("error" in r) {
						let e = r.error;
						F(`Error during font loading: ${e}`), this.commonObjs.resolve(t, e);
						break;
					}
					let i = new Rt(new qt(r.buffer), this._params.pdfBug && globalThis.FontInspector?.enabled ? (e, t) => globalThis.FontInspector.fontAdded(e, t) : null, r.charProcOperatorList, r.extra);
					this.fontLoader.bind(i).catch(() => e.sendWithPromise("FontFallback", { id: t })).finally(() => {
						i.fontExtraProperties || i.clearData(), this.commonObjs.resolve(t, i);
					});
					break;
				case "CopyLocalImage":
					let { imageRef: a } = r;
					L(a, "The imageRef must be defined.");
					for (let e of this.#r.values()) for (let [, n] of e.objs) {
						if (n?.ref !== a) continue;
						if (!n.dataLen) return null;
						let e = structuredClone(n);
						return this.commonObjs.resolve(t, e), n.dataLen;
					}
					break;
				case "FontPath":
					this.commonObjs.resolve(t, new Yt(r));
					break;
				case "Image":
					this.commonObjs.resolve(t, r);
					break;
				case "Pattern":
					let o = new Jt(r);
					this.commonObjs.resolve(t, o.getIR());
					break;
				default: throw Error(`Got unknown common object type ${n}`);
			}
			return null;
		}), e.on("obj", ([e, t, n, r]) => {
			if (this.destroyed) return;
			let i = this.#r.get(t);
			if (!i.objs.has(e)) {
				if (i._intentStates.size === 0) {
					r?.bitmap?.close();
					return;
				}
				switch (n) {
					case "Image":
					case "Pattern":
						i.objs.resolve(e, r);
						break;
					default: throw Error(`Got unknown object type ${n}`);
				}
			}
		}), e.on("DocProgress", (e) => {
			this.destroyed || this.#l(e);
		}), e.on("FetchBinaryData", async (e) => {
			if (this.destroyed) throw Error("Worker was destroyed.");
			if (!this.binaryDataFactory) throw Error("`BinaryDataFactory` not initialized, see the `useWorkerFetch` parameter.");
			return this.binaryDataFactory.fetch(e);
		});
	}
	getData() {
		return this.messageHandler.sendWithPromise("GetData", null);
	}
	saveDocument(e = null) {
		this.annotationStorage.size <= 0 && F("saveDocument called while `annotationStorage` is empty, please use the getData-method instead.");
		let { map: t, transfer: n } = this.annotationStorage.serializable;
		return this.messageHandler.sendWithPromise("SaveDocument", {
			isPureXfa: !!this._htmlForXfa,
			numPages: this._numPages,
			annotationStorage: t,
			supportsPrintToPDF: this.#s !== null,
			filename: this.#e?.filename ?? null
		}, n).finally(() => {
			this.#s = null, this.annotationStorage.resetModified();
		});
	}
	extractPages(e, t = null) {
		let n = { pageInfos: e }, r, i = globalThis.ImageBitmap;
		if (typeof i == "function") {
			let t = Array.isArray(e) ? e : [e];
			for (let e of t) e?.image instanceof i && (r ||= []).push(e.image);
		}
		if (this.annotationStorage.size > 0) {
			let e = this.annotationStorage.serializable, { map: i } = e;
			e.transfer?.length && (r ? r.push(...e.transfer) : r = e.transfer);
			let a = this.pagesMapper.getMapping();
			if (a) {
				let e = /* @__PURE__ */ new Map();
				for (let [n, r] of i) {
					if (r?.pageIndex !== void 0 && r.pageIndex >= 0 && r.pageIndex < a.length) {
						let i = t?.[r.pageIndex] ?? 0, o = a[r.pageIndex] - 1;
						if (o !== r.pageIndex || i !== 0) {
							e.set(n, {
								...r,
								pageIndex: o,
								copyLevel: i
							});
							continue;
						}
					}
					e.set(n, r);
				}
				i = e;
			}
			n.annotationStorage = i;
		}
		return this.messageHandler.sendWithPromise("ExtractPages", n, r).finally(() => {
			this.annotationStorage.resetModified();
		});
	}
	getPage(e) {
		if (!Number.isInteger(e) || e <= 0 || e > this.pagesMapper.pagesNumber) return Promise.reject(/* @__PURE__ */ Error("Invalid page request."));
		let t = e - 1, n = this.pagesMapper.getPageId(e) - 1, r = this.#i.get(t);
		if (r) return r;
		let i = this.messageHandler.sendWithPromise("GetPage", { pageIndex: n }).then((e) => {
			if (this.destroyed) throw Error("Transport destroyed");
			e.refStr && this.#a.set(e.refStr, n);
			let r = new Qr(t, e, this, this.pagesMapper, this._params.pdfBug);
			return this.#r.set(r._id, r), r;
		});
		return this.#i.set(t, i), i;
	}
	async getPageIndex(e) {
		if (!$t(e)) throw Error("Invalid pageIndex request.");
		let t = await this.messageHandler.sendWithPromise("GetPageIndex", {
			num: e.num,
			gen: e.gen
		}), n = this.pagesMapper.getPageNumber(t + 1);
		if (n === 0) throw Error("GetPageIndex: page has been removed.");
		return n - 1;
	}
	getAnnotations(e, t) {
		return this.messageHandler.sendWithPromise("GetAnnotations", {
			pageIndex: this.pagesMapper.getPageId(e + 1) - 1,
			intent: t
		});
	}
	getFieldObjects() {
		return this.#c("GetFieldObjects");
	}
	getSignatures() {
		return this.#c("GetSignatures");
	}
	getSignatureData(e) {
		return this.messageHandler.sendWithPromise("GetSignatureData", e);
	}
	hasJSActions() {
		return this.#c("HasJSActions");
	}
	getCalculationOrderIds() {
		return this.messageHandler.sendWithPromise("GetCalculationOrderIds", null);
	}
	getDestinations() {
		return this.messageHandler.sendWithPromise("GetDestinations", null);
	}
	getDestination(e) {
		return typeof e == "string" ? this.messageHandler.sendWithPromise("GetDestination", { id: e }) : Promise.reject(/* @__PURE__ */ Error("Invalid destination request."));
	}
	getPageLabels() {
		return this.messageHandler.sendWithPromise("GetPageLabels", null);
	}
	getPageLayout() {
		return this.messageHandler.sendWithPromise("GetPageLayout", null);
	}
	getPageMode() {
		return this.messageHandler.sendWithPromise("GetPageMode", null);
	}
	getViewerPreferences() {
		return this.messageHandler.sendWithPromise("GetViewerPreferences", null);
	}
	getOpenAction() {
		return this.messageHandler.sendWithPromise("GetOpenAction", null);
	}
	getAttachments() {
		return this.messageHandler.sendWithPromise("GetAttachments", null);
	}
	getAttachmentContent(e) {
		return this.messageHandler.sendWithPromise("GetAttachmentContent", e);
	}
	getAnnotationsByType(e, t) {
		return this.messageHandler.sendWithPromise("GetAnnotationsByType", {
			types: e,
			pageIndexesToSkip: t
		});
	}
	getDocJSActions() {
		return this.#c("GetDocJSActions");
	}
	getPageJSActions(e) {
		return this.messageHandler.sendWithPromise("GetPageJSActions", { pageIndex: this.pagesMapper.getPageId(e + 1) - 1 });
	}
	getStructTree(e) {
		return this.messageHandler.sendWithPromise("GetStructTree", { pageIndex: this.pagesMapper.getPageId(e + 1) - 1 });
	}
	getOutline() {
		return this.messageHandler.sendWithPromise("GetOutline", null);
	}
	getOptionalContentConfig(e) {
		return this.#c("GetOptionalContentConfig").then((t) => new zr(t, e));
	}
	getPermissions() {
		return this.messageHandler.sendWithPromise("GetPermissions", null);
	}
	getMetadata() {
		let e = "GetMetadata";
		return this.#t.getOrInsertComputed(e, () => this.messageHandler.sendWithPromise(e, null).then((e) => ({
			info: e[0],
			metadata: e[1] ? new Ir(e[1]) : null,
			contentDispositionFilename: this.#e?.filename ?? null,
			contentLength: this.#e?.contentLength ?? null,
			hasStructTree: e[2]
		})));
	}
	getMarkInfo() {
		return this.messageHandler.sendWithPromise("GetMarkInfo", null);
	}
	async startCleanup(e = !1) {
		if (!this.destroyed) {
			await this.messageHandler.sendWithPromise("Cleanup", null);
			for (let e of this.#r.values()) if (!e.cleanup()) throw Error(`startCleanup: Page ${e.pageNumber} is currently rendering.`);
			this.commonObjs.clear(), e || this.fontLoader.clear(), this.#t.clear(), this.filterFactory.destroy(!0), Kr.cleanup();
		}
	}
	cachedPageNumber(e) {
		if (!$t(e)) return null;
		let t = e.gen === 0 ? `${e.num}R` : `${e.num}R${e.gen}`, n = this.#a.get(t);
		if (n >= 0) {
			let e = this.pagesMapper.getPageNumber(n + 1);
			if (e !== 0) return e;
		}
		return null;
	}
}, ti = class {
	_internalRenderTask = null;
	onContinue = null;
	onError = null;
	constructor(e) {
		this._internalRenderTask = e;
	}
	get promise() {
		return this._internalRenderTask.capability.promise;
	}
	cancel(e = 0) {
		this._internalRenderTask.cancel(null, e);
	}
	get separateAnnots() {
		let { separateAnnots: e } = this._internalRenderTask.operatorList;
		if (!e) return !1;
		let { annotationCanvasMap: t } = this._internalRenderTask;
		return e.form || e.canvas && t?.size > 0;
	}
	get imageCoordinates() {
		return this._internalRenderTask.imageCoordinates || null;
	}
}, ni = class e {
	#e = null;
	static #t = /* @__PURE__ */ new WeakSet();
	constructor({ callback: e, params: t, objs: n, commonObjs: r, annotationCanvasMap: i, operatorList: a, pageIndex: o, canvasFactory: s, filterFactory: c, useRequestAnimationFrame: l = !1, pdfBug: u = !1, pageColors: d = null, enableHWA: f = !1, operationsFilter: p = null }) {
		this.callback = e, this.params = t, this.objs = n, this.commonObjs = r, this.annotationCanvasMap = i, this.operatorListIdx = null, this.operatorList = a, this._pageIndex = o, this.canvasFactory = s, this.filterFactory = c, this._pdfBug = u, this.pageColors = d, this.running = !1, this.graphicsReadyCallback = null, this.graphicsReady = !1, this._useRequestAnimationFrame = l === !0 && typeof window < "u", this.cancelled = !1, this.capability = Promise.withResolvers(), this.task = new ti(this), this._cancelBound = this.cancel.bind(this), this._continueBound = this._continue.bind(this), this._scheduleNextBound = this._scheduleNext.bind(this), this._nextBound = this._next.bind(this), this._canvas = t.canvas, this._canvasContext = t.canvas ? null : t.canvasContext, this._enableHWA = f, this._dependencyTracker = t.dependencyTracker, this._imagesTracker = t.imagesTracker, this._operationsFilter = p;
	}
	get completed() {
		return this.capability.promise.catch(() => {});
	}
	initializeGraphics({ transparency: t = !1, optionalContentConfig: n }) {
		if (this.cancelled) return;
		if (this._canvas) {
			if (e.#t.has(this._canvas)) throw Error("Cannot use the same canvas during multiple render() operations. Use different canvas or ensure previous operations were cancelled or completed.");
			e.#t.add(this._canvas);
		}
		this._pdfBug && globalThis.StepperManager?.enabled && (this.stepper = globalThis.StepperManager.create(this._pageIndex), this.stepper.init(this.operatorList), this.stepper.nextBreakPoint = this.stepper.getNextBreakPoint());
		let { viewport: r, transform: i, background: a, dependencyTracker: o, imagesTracker: s } = this.params, c = this._canvasContext || this._canvas.getContext("2d", {
			alpha: !1,
			willReadFrequently: !this._enableHWA
		});
		this.gfx = new tr(c, this.commonObjs, this.objs, this.canvasFactory, this.filterFactory, { optionalContentConfig: n }, this.annotationCanvasMap, this.pageColors, o, s), this.gfx.beginDrawing({
			transform: i,
			viewport: r,
			transparency: t,
			background: a
		}), this.operatorListIdx = 0, this.graphicsReady = !0, this.graphicsReadyCallback?.();
	}
	cancel(t = null, n = 0) {
		this.running = !1, this.cancelled = !0, this.gfx?.endDrawing(), this.#e &&= (window.cancelAnimationFrame(this.#e), null), e.#t.delete(this._canvas), t ||= new Se(`Rendering cancelled, page ${this._pageIndex + 1}`, n), this.callback(t), this.task.onError?.(t);
	}
	operatorListChanged() {
		if (!this.graphicsReady) {
			this.graphicsReadyCallback ||= this._continueBound;
			return;
		}
		this.gfx.dependencyTracker?.growOperationsCount(this.operatorList.fnArray.length), this.stepper?.updateOperatorList(this.operatorList), !this.running && this._continue();
	}
	_continue() {
		this.running = !0, !this.cancelled && (this.task.onContinue ? this.task.onContinue(this._scheduleNextBound) : this._scheduleNext());
	}
	_scheduleNext() {
		this._useRequestAnimationFrame ? this.#e = window.requestAnimationFrame(() => {
			this.#e = null, this._nextBound().catch(this._cancelBound);
		}) : Promise.resolve().then(this._nextBound).catch(this._cancelBound);
	}
	async _next() {
		this.cancelled || (this.operatorListIdx = this.gfx.executeOperatorList(this.operatorList, this.operatorListIdx, this._continueBound, this.stepper, this._operationsFilter), this.operatorListIdx === this.operatorList.argsArray.length && (this.running = !1, this.operatorList.lastChunk && (this.gfx.endDrawing(), e.#t.delete(this._canvas), this.callback())));
	}
}, ri = "6.4.299", ii = "d0991a0d5", ai = class e {
	#e = null;
	#t = null;
	#n;
	#r = null;
	#i = !1;
	#a = !1;
	#o = null;
	#s;
	#c = null;
	#l = null;
	static #u = null;
	static get _keyboardManager() {
		return H(this, "_keyboardManager", new it([
			[["Escape"], e.prototype._hideDropdownFromKeyboard],
			[["Space"], e.prototype._colorSelectFromKeyboard],
			[["ArrowDown", "ArrowRight"], e.prototype._moveToNext],
			[["ArrowUp", "ArrowLeft"], e.prototype._moveToPrevious],
			[["Home"], e.prototype._moveToBeginning],
			[["End"], e.prototype._moveToEnd]
		]));
	}
	constructor({ editor: t = null, uiManager: n = null }) {
		t ? (this.#a = !1, this.#o = t) : this.#a = !0, this.#l = t?._uiManager || n, this.#s = this.#l._eventBus, this.#n = t?.color?.toUpperCase() || this.#l?.highlightColors.values().next().value || "#FFFF98", e.#u ||= Object.freeze({
			blue: "pdfjs-editor-colorpicker-blue",
			green: "pdfjs-editor-colorpicker-green",
			pink: "pdfjs-editor-colorpicker-pink",
			red: "pdfjs-editor-colorpicker-red",
			yellow: "pdfjs-editor-colorpicker-yellow"
		});
	}
	renderButton() {
		let e = this.#e = document.createElement("button");
		e.className = "colorPicker", e.tabIndex = "0", e.setAttribute("data-l10n-id", "pdfjs-editor-colorpicker-button"), e.ariaHasPopup = "true", this.#o && (e.ariaControls = `${this.#o.id}_colorpicker_dropdown`);
		let t = this.#l._signal;
		e.addEventListener("click", this.#m.bind(this), { signal: t }), e.addEventListener("keydown", this.#p.bind(this), { signal: t });
		let n = this.#t = document.createElement("span");
		return n.className = "swatch", n.ariaHidden = "true", n.style.backgroundColor = this.#n, e.append(n), e;
	}
	renderMainDropdown() {
		let e = this.#r = this.#d();
		return e.ariaOrientation = "horizontal", e.ariaLabelledBy = "highlightColorPickerLabel", e;
	}
	#d() {
		let t = document.createElement("div"), n = this.#l._signal;
		t.addEventListener("contextmenu", ke, { signal: n }), t.className = "dropdown", t.role = "listbox", t.ariaMultiSelectable = "false", t.ariaOrientation = "vertical", t.setAttribute("data-l10n-id", "pdfjs-editor-colorpicker-dropdown"), this.#o && (t.id = `${this.#o.id}_colorpicker_dropdown`);
		for (let [r, i] of this.#l.highlightColors) {
			let a = document.createElement("button");
			a.tabIndex = "0", a.role = "option", a.setAttribute("data-color", i), a.title = r, a.setAttribute("data-l10n-id", e.#u[r]);
			let o = document.createElement("span");
			a.append(o), o.className = "swatch", o.style.backgroundColor = i, a.ariaSelected = i === this.#n, a.addEventListener("click", this.#f.bind(this, i), { signal: n }), t.append(a);
		}
		return t.addEventListener("keydown", this.#p.bind(this), { signal: n }), t;
	}
	#f(e, t) {
		t.stopPropagation(), this.#s.dispatch("switchannotationeditorparams", {
			source: this,
			type: x.HIGHLIGHT_COLOR,
			value: e
		}), this.update(e);
	}
	_colorSelectFromKeyboard(e) {
		if (e.target === this.#e) {
			this.#m(e);
			return;
		}
		let t = e.target.getAttribute("data-color");
		t && this.#f(t, e);
	}
	_moveToNext(e) {
		if (!this.#g) {
			this.#m(e);
			return;
		}
		if (e.target === this.#e) {
			this.#r.firstElementChild?.focus();
			return;
		}
		e.target.nextSibling?.focus();
	}
	_moveToPrevious(e) {
		if (e.target === this.#r?.firstElementChild || e.target === this.#e) {
			this.#g && this._hideDropdownFromKeyboard();
			return;
		}
		this.#g || this.#m(e), e.target.previousSibling?.focus();
	}
	_moveToBeginning(e) {
		if (!this.#g) {
			this.#m(e);
			return;
		}
		this.#r.firstElementChild?.focus();
	}
	_moveToEnd(e) {
		if (!this.#g) {
			this.#m(e);
			return;
		}
		this.#r.lastElementChild?.focus();
	}
	#p(t) {
		e._keyboardManager.exec(this, t);
	}
	#m(e) {
		if (this.#g) {
			this.hideDropdown();
			return;
		}
		if (this.#i = e.detail === 0, this.#c || (this.#c = new AbortController(), window.addEventListener("pointerdown", this.#h.bind(this), { signal: this.#l.combinedSignal(this.#c) })), this.#e.ariaExpanded = "true", this.#r) {
			this.#r.classList.remove("hidden");
			return;
		}
		let t = this.#r = this.#d();
		this.#e.append(t);
	}
	#h(e) {
		this.#r?.contains(e.target) || this.hideDropdown();
	}
	hideDropdown() {
		this.#r?.classList.add("hidden"), this.#e.ariaExpanded = "false", this.#c?.abort(), this.#c = null;
	}
	get #g() {
		return this.#r && !this.#r.classList.contains("hidden");
	}
	_hideDropdownFromKeyboard() {
		if (!this.#a) {
			if (!this.#g) {
				this.#o?.unselect();
				return;
			}
			this.hideDropdown(), this.#e.focus({
				preventScroll: !0,
				focusVisible: this.#i
			});
		}
	}
	update(e) {
		if (this.#t && (this.#t.style.backgroundColor = e), !this.#r) return;
		let t = this.#l.highlightColors.values();
		for (let n of this.#r.children) n.ariaSelected = t.next().value === e.toUpperCase();
	}
	destroy() {
		this.#e?.remove(), this.#e = null, this.#t = null, this.#r?.remove(), this.#r = null;
	}
}, oi = class e {
	#e = null;
	#t = !1;
	#n = null;
	#r = null;
	static #i = null;
	constructor(t) {
		this.#n = t, this.#r = t._uiManager, e.#i ||= Object.freeze({
			freetext: "pdfjs-editor-color-picker-free-text-input",
			ink: "pdfjs-editor-color-picker-ink-input"
		});
	}
	renderButton() {
		if (this.#e) return this.#e;
		let { editorType: t, colorType: n, colorAndOpacityType: r, opacityType: i, color: a, opacity: o } = this.#n, s = this.#t = K.isAlphaColorInputSupported && i !== void 0, c = this.#e = document.createElement("input");
		if (c.type = "color", s) {
			c.setAttribute("alpha", "");
			let e = q.hexNums[Math.round((o ?? 1) * 255)];
			c.value = (a || "#000000") + e;
		} else c.value = a || "#000000";
		return c.className = "basicColorPicker", c.tabIndex = 0, c.setAttribute("data-l10n-id", e.#i[t]), c.addEventListener("input", () => {
			if (s) {
				let e = Me(c.value);
				if (!e) return;
				let [t, a, o, s] = e, l = q.makeHexColor(t, a, o);
				r === void 0 ? (this.#r.updateParams(n, l), this.#r.updateParams(i, s)) : this.#r.updateParams(r, {
					color: l,
					opacity: s
				});
			} else this.#r.updateParams(n, c.value);
		}, { signal: this.#r._signal }), c;
	}
	update(e) {
		if (this.#e) {
			if (this.#t) {
				let t = q.hexNums[Math.round(this.#n.opacity * 255)];
				this.#e.value = e + t;
			} else this.#e.value = e;
		}
	}
	updateOpacity(e) {
		if (!this.#e || !this.#t) return;
		let t = q.hexNums[Math.round(e * 255)];
		this.#e.value = this.#n.color + t;
	}
	destroy() {
		this.#e?.remove(), this.#e = null;
	}
	hideDropdown() {}
};
function si(e) {
	return Math.floor(Y(e, 0, 1) * 255).toString(16).padStart(2, "0");
}
function ci(e) {
	return Y(e, 0, 1) * 255;
}
var li = class {
	static CMYK_G([e, t, n, r]) {
		return ["G", 1 - Math.min(1, .3 * e + .59 * n + .11 * t + r)];
	}
	static G_CMYK([e]) {
		return [
			"CMYK",
			0,
			0,
			0,
			1 - e
		];
	}
	static G_RGB([e]) {
		return [
			"RGB",
			e,
			e,
			e
		];
	}
	static G_rgb([e]) {
		return e = ci(e), [
			e,
			e,
			e
		];
	}
	static G_HTML([e]) {
		let t = si(e);
		return `#${t}${t}${t}`;
	}
	static RGB_G([e, t, n]) {
		return ["G", .3 * e + .59 * t + .11 * n];
	}
	static RGB_rgb(e) {
		return e.map(ci);
	}
	static RGB_HTML(e) {
		return `#${e.map(si).join("")}`;
	}
	static T_HTML() {
		return "#00000000";
	}
	static T_rgb() {
		return [null];
	}
	static CMYK_RGB([e, t, n, r]) {
		return [
			"RGB",
			1 - Math.min(1, e + r),
			1 - Math.min(1, n + r),
			1 - Math.min(1, t + r)
		];
	}
	static CMYK_rgb([e, t, n, r]) {
		return [
			ci(1 - Math.min(1, e + r)),
			ci(1 - Math.min(1, n + r)),
			ci(1 - Math.min(1, t + r))
		];
	}
	static CMYK_HTML(e) {
		let t = this.CMYK_RGB(e).slice(1);
		return this.RGB_HTML(t);
	}
	static RGB_CMYK([e, t, n]) {
		let r = 1 - e, i = 1 - t, a = 1 - n;
		return [
			"CMYK",
			r,
			i,
			a,
			Math.min(r, i, a)
		];
	}
}, ui = class {
	create(e, t, n = !1) {
		if (e <= 0 || t <= 0) throw Error("Invalid SVG dimensions");
		let r = this._createSVG("svg:svg");
		return r.setAttribute("version", "1.1"), n || (r.setAttribute("width", `${e}px`), r.setAttribute("height", `${t}px`)), r.setAttribute("preserveAspectRatio", "none"), r.setAttribute("viewBox", `0 0 ${e} ${t}`), r;
	}
	createElement(e) {
		if (typeof e != "string") throw Error("Invalid SVG element type");
		return this._createSVG(e);
	}
	_createSVG(e) {
		I("Abstract method `_createSVG` called.");
	}
}, di = class extends ui {
	_createSVG(e) {
		return document.createElementNS(h, e);
	}
}, fi = 9, pi = /* @__PURE__ */ new WeakSet(), mi = (/* @__PURE__ */ new Date()).getTimezoneOffset() * 60 * 1e3, hi = class {
	static create(e) {
		switch (e.data.annotationType) {
			case T.LINK: return new vi(e);
			case T.TEXT: return new yi(e);
			case T.WIDGET:
				switch (e.data.fieldType) {
					case "Tx": return new xi(e);
					case "Btn": return e.data.radioButton ? new wi(e) : e.data.checkBox ? new Ci(e) : new Ti(e);
					case "Ch": return new Ei(e);
					case "Sig": return new Si(e);
				}
				return new bi(e);
			case T.POPUP: return new Di(e);
			case T.FREETEXT: return new ki(e);
			case T.LINE: return new Ai(e);
			case T.SQUARE: return new ji(e);
			case T.CIRCLE: return new Mi(e);
			case T.POLYLINE: return new Ni(e);
			case T.CARET: return new Fi(e);
			case T.INK: return new Ii(e);
			case T.POLYGON: return new Pi(e);
			case T.HIGHLIGHT: return new Li(e);
			case T.UNDERLINE: return new Ri(e);
			case T.SQUIGGLY: return new zi(e);
			case T.STRIKEOUT: return new Bi(e);
			case T.STAMP: return new Vi(e);
			case T.FILEATTACHMENT: return new Hi(e);
			case T.RICHMEDIA:
			case T.SCREEN:
			case T.SOUND: return new Ui(e);
			default: return new gi(e);
		}
	}
}, gi = class e {
	#e = null;
	#t = !1;
	#n = null;
	constructor(e, { isRenderable: t = !1, ignoreBorder: n = !1, createQuadrilaterals: r = !1 } = {}) {
		this.isRenderable = t, this.data = e.data, this.layer = e.layer, this.linkService = e.linkService, this.downloadManager = e.downloadManager, this.imageResourcesPath = e.imageResourcesPath, this.renderForms = e.renderForms, this.svgFactory = e.svgFactory, this.annotationStorage = e.annotationStorage, this.enableComment = e.enableComment, this.enableScripting = e.enableScripting, this.hasJSActions = e.hasJSActions, this._fieldObjects = e.fieldObjects, this.parent = e.parent, this.hasOwnCommentButton = !1, t && (this.contentElement = this.container = this._createContainer(n)), r && this._createQuadrilaterals();
	}
	static _hasPopupData({ contentsObj: e, richText: t }) {
		return !!(e?.str || t?.str);
	}
	get _isEditable() {
		return this.data.isEditable;
	}
	get hasPopupData() {
		return e._hasPopupData(this.data) || this.enableComment && !!this.commentText;
	}
	get commentData() {
		let { data: e } = this, t = this.annotationStorage?.getEditor(e.id);
		return t ? t.getData() : e;
	}
	get hasCommentButton() {
		return this.enableComment && this.hasPopupElement;
	}
	get commentButtonPosition() {
		let e = this.annotationStorage?.getEditor(this.data.id);
		if (e) return e.commentButtonPositionInPage;
		let { quadPoints: t, inkLists: n, rect: r } = this.data, i = -Infinity, a = -Infinity;
		if (t?.length >= 8) {
			for (let e = 0; e < t.length; e += 8) t[e + 1] > a ? (a = t[e + 1], i = t[e + 2]) : t[e + 1] === a && (i = Math.max(i, t[e + 2]));
			return [i, a];
		}
		if (n?.length >= 1) {
			for (let e of n) for (let t = 0, n = e.length; t < n; t += 2) e[t + 1] > a ? (a = e[t + 1], i = e[t]) : e[t + 1] === a && (i = Math.max(i, e[t]));
			if (i !== Infinity) return [i, a];
		}
		return r ? [r[2], r[3]] : null;
	}
	_normalizePoint(e) {
		let { page: { view: t }, viewport: { rawDims: { pageWidth: n, pageHeight: r, pageX: i, pageY: a } } } = this.parent;
		return e[1] = t[3] - e[1] + t[1], e[0] = 100 * (e[0] - i) / n, e[1] = 100 * (e[1] - a) / r, e;
	}
	get commentText() {
		let { data: e } = this;
		return this.annotationStorage.getRawValue(`${y}${e.id}`)?.popup?.contents || e.contentsObj?.str || "";
	}
	set commentText(e) {
		let { data: t } = this, n = {
			deleted: !e,
			contents: e || ""
		};
		this.annotationStorage.updateEditor(t.id, { popup: n }) || this.annotationStorage.setValue(`${y}${t.id}`, {
			id: t.id,
			annotationType: t.annotationType,
			page: this.parent.page,
			popup: n,
			popupRef: t.popupRef,
			modificationDate: /* @__PURE__ */ new Date()
		}), e || this.removePopup();
	}
	removePopup() {
		(this.#n?.popup || this.popup)?.remove(), this.#n = this.popup = null;
	}
	updateEdited(e) {
		if (!this.container) return;
		e.rect && (this.#e ||= { rect: this.data.rect.slice(0) });
		let { rect: t, popup: n } = e;
		t && this.#r(t);
		let r = this.#n?.popup || this.popup;
		!r && n?.text && (this._createPopup(n), r = this.#n.popup), r && (r.updateEdited(e), n?.deleted && (r.remove(), this.#n = null, this.popup = null));
	}
	resetEdited() {
		this.#e &&= (this.#r(this.#e.rect), this.#n?.popup.resetEdited(), null);
	}
	#r(e) {
		let { container: { style: t }, data: { rect: n, rotation: r }, parent: { viewport: { rawDims: { pageWidth: i, pageHeight: a, pageX: o, pageY: s } } } } = this;
		n?.splice(0, 4, ...e), t.left = `${100 * (e[0] - o) / i}%`, t.top = `${100 * (a - e[3] + s) / a}%`, r === 0 ? (t.width = `${100 * (e[2] - e[0]) / i}%`, t.height = `${100 * (e[3] - e[1]) / a}%`) : this.setRotation(r);
	}
	_createContainer(e) {
		let { data: t, parent: { page: n, viewport: r } } = this, i = document.createElement("section");
		i.setAttribute("data-annotation-id", t.id), !(this instanceof bi) && !(this instanceof vi) && !(this instanceof Ui) && (i.tabIndex = 0);
		let { style: a } = i;
		if (a.zIndex = this.parent.zIndex, this.parent.zIndex += 2, t.alternativeText && (i.title = t.alternativeText), t.noRotate && i.classList.add("norotate"), !t.rect || this instanceof Di) {
			let { rotation: e } = t;
			return !t.hasOwnCanvas && e !== 0 && this.setRotation(e, i), i;
		}
		let { width: o, height: s } = this;
		if (!e && t.borderStyle.width > 0) {
			a.borderWidth = `${t.borderStyle.width}px`;
			let e = t.borderStyle.horizontalCornerRadius, n = t.borderStyle.verticalCornerRadius;
			switch ((e > 0 || n > 0) && (a.borderRadius = `calc(${e}px * var(--total-scale-factor)) / calc(${n}px * var(--total-scale-factor))`), t.borderStyle.style) {
				case E.SOLID:
					a.borderStyle = "solid";
					break;
				case E.DASHED:
					a.borderStyle = "dashed";
					break;
				case E.BEVELED:
					F("Unimplemented border style: beveled");
					break;
				case E.INSET:
					F("Unimplemented border style: inset");
					break;
				case E.UNDERLINE: a.borderBottomStyle = "solid";
			}
			let r = t.borderColor || null;
			r ? (this.#t = !0, a.borderColor = q.makeHexColor(...r)) : a.borderWidth = 0;
		}
		let c = q.normalizeRect([
			t.rect[0],
			n.view[3] - t.rect[1] + n.view[1],
			t.rect[2],
			n.view[3] - t.rect[3] + n.view[1]
		]), { pageWidth: l, pageHeight: u, pageX: d, pageY: f } = r.rawDims;
		a.left = `${100 * (c[0] - d) / l}%`, a.top = `${100 * (c[1] - f) / u}%`;
		let { rotation: p } = t;
		return t.hasOwnCanvas || p === 0 ? (a.width = `${100 * o / l}%`, a.height = `${100 * s / u}%`) : this.setRotation(p, i), i;
	}
	setRotation(e, t = this.container) {
		if (!this.data.rect) return;
		let { pageWidth: n, pageHeight: r } = this.parent.viewport.rawDims, { width: i, height: a } = this;
		e % 180 != 0 && ([i, a] = [a, i]), t.style.width = `${100 * i / n}%`, t.style.height = `${100 * a / r}%`, t.setAttribute("data-main-rotation", (360 - e) % 360);
	}
	get _commonActions() {
		let e = (e, t, n) => {
			let r = n.detail[e], i = r[0], a = r.slice(1);
			n.target.style[t] = li[`${i}_HTML`](a), this.annotationStorage.setValue(this.data.id, { [t]: li[`${i}_rgb`](a) });
		};
		return H(this, "_commonActions", {
			display: (e) => {
				let { display: t } = e.detail, n = t % 2 == 1;
				this.container.style.visibility = n ? "hidden" : "visible", this.annotationStorage.setValue(this.data.id, {
					noView: n,
					noPrint: t === 1 || t === 2
				});
			},
			print: (e) => {
				this.annotationStorage.setValue(this.data.id, { noPrint: !e.detail.print });
			},
			hidden: (e) => {
				let { hidden: t } = e.detail;
				this.container.style.visibility = t ? "hidden" : "visible", this.annotationStorage.setValue(this.data.id, {
					noPrint: t,
					noView: t
				});
			},
			focus: (e) => {
				setTimeout(() => e.target.focus({ preventScroll: !1 }), 0);
			},
			userName: (e) => {
				e.target.title = e.detail.userName;
			},
			readonly: (e) => {
				e.target.disabled = e.detail.readonly;
			},
			required: (e) => {
				this._setRequired(e.target, e.detail.required);
			},
			bgColor: (t) => {
				e("bgColor", "backgroundColor", t);
			},
			fillColor: (t) => {
				e("fillColor", "backgroundColor", t);
			},
			fgColor: (t) => {
				e("fgColor", "color", t);
			},
			textColor: (t) => {
				e("textColor", "color", t);
			},
			borderColor: (t) => {
				e("borderColor", "borderColor", t);
			},
			strokeColor: (t) => {
				e("strokeColor", "borderColor", t);
			},
			rotation: (e) => {
				let t = e.detail.rotation;
				this.setRotation(t), this.annotationStorage.setValue(this.data.id, { rotation: t });
			}
		});
	}
	_dispatchEventFromSandbox(e, t) {
		let n = this._commonActions;
		for (let r of Object.keys(t.detail)) (e[r] || n[r])?.(t);
	}
	_setDefaultPropertiesFromJS(e) {
		if (!this.enableScripting) return;
		let t = this.annotationStorage.getRawValue(this.data.id);
		if (!t) return;
		let n = this._commonActions;
		for (let [r, i] of Object.entries(t)) {
			let a = n[r];
			a && (a({
				detail: { [r]: i },
				target: e
			}), delete t[r]);
		}
	}
	_createQuadrilaterals() {
		if (!this.container) return;
		let { quadPoints: e } = this.data;
		if (!e) return;
		let [t, n, r, i] = this.data.rect.map(Math.fround);
		if (e.length === 8) {
			let [a, o, s, c] = e.subarray(2, 6);
			if (r === a && i === o && t === s && n === c) return;
		}
		let { style: a } = this.container, o;
		if (this.#t) {
			let { borderColor: e, borderWidth: t } = a;
			a.borderWidth = 0, o = [
				"url('data:image/svg+xml;utf8,",
				`<svg xmlns="${h}" preserveAspectRatio="none" viewBox="0 0 1 1">`,
				`<g fill="transparent" stroke="${e}" stroke-width="${t}">`
			], this.container.classList.add("hasBorder");
		}
		let s = r - t, c = i - n, { svgFactory: l } = this, u = l.createElement("svg");
		u.classList.add("quadrilateralsContainer"), u.setAttribute("width", 0), u.setAttribute("height", 0), u.role = "none";
		let d = l.createElement("defs");
		u.append(d);
		let f = l.createElement("clipPath"), p = `clippath_${this.data.id}`;
		f.setAttribute("id", p), f.setAttribute("clipPathUnits", "objectBoundingBox"), d.append(f);
		for (let n = 2, r = e.length; n < r; n += 8) {
			let r = e[n], a = e[n + 1], u = e[n + 2], d = e[n + 3], p = l.createElement("rect"), m = (u - t) / s, h = (i - a) / c, g = (r - u) / s, _ = (a - d) / c;
			p.setAttribute("x", m), p.setAttribute("y", h), p.setAttribute("width", g), p.setAttribute("height", _), f.append(p), o?.push(`<rect vector-effect="non-scaling-stroke" x="${m}" y="${h}" width="${g}" height="${_}"/>`);
		}
		this.#t && (o.push("</g></svg>')"), a.backgroundImage = o.join("")), this.container.append(u), this.container.style.clipPath = `url(#${p})`;
	}
	_createPopup(e = null) {
		let { data: t } = this, n, r;
		e ? (n = { str: e.text }, r = e.date) : (n = t.contentsObj, r = t.modificationDate), this.#n = new Di({
			data: {
				color: t.color,
				titleObj: t.titleObj,
				modificationDate: r,
				contentsObj: n,
				richText: t.richText,
				parentRect: t.rect,
				borderStyle: 0,
				id: `popup_${t.id}`,
				rotation: t.rotation,
				noRotate: !0
			},
			linkService: this.linkService,
			parent: this.parent,
			elements: [this]
		});
	}
	get hasPopupElement() {
		return !!(this.#n || this.popup || this.data.popupRef);
	}
	get extraPopupElement() {
		return this.#n;
	}
	render() {
		I("Abstract method `AnnotationElement.render` called");
	}
	_getElementsByName(e, t = null) {
		let n = [];
		if (this._fieldObjects) {
			let r = this._fieldObjects.get(e) || [];
			for (let { page: e, id: i, exportValues: a } of r) {
				if (e === -1 || i === t) continue;
				let r = typeof a == "string" ? a : null, o = document.querySelector(`[data-element-id="${i}"]`);
				if (o && !pi.has(o)) {
					F(`_getElementsByName - element not allowed: ${i}`);
					continue;
				}
				n.push({
					id: i,
					exportValue: r,
					domElement: o
				});
			}
			return n;
		}
		for (let r of document.getElementsByName(e)) {
			let { exportValue: e } = r, i = r.getAttribute("data-element-id");
			i !== t && pi.has(r) && n.push({
				id: i,
				exportValue: e,
				domElement: r
			});
		}
		return n;
	}
	show() {
		this.container && (this.container.hidden = !1), this.popup?.maybeShow();
	}
	hide() {
		this.container && (this.container.hidden = !0), this.popup?.forceHide();
	}
	getElementsToTriggerPopup() {
		return this.container;
	}
	addHighlightArea() {
		let e = this.getElementsToTriggerPopup();
		if (Array.isArray(e)) for (let t of e) t.classList.add("highlightArea");
		else e.classList.add("highlightArea");
	}
	_editOnDoubleClick() {
		if (!this._isEditable) return;
		let { annotationEditorType: e, data: { id: t } } = this;
		this.container.addEventListener("dblclick", () => {
			this.linkService.eventBus?.dispatch("switchannotationeditormode", {
				source: this,
				mode: e,
				editId: t,
				mustEnterInEditMode: !0
			});
		});
	}
	updateOC(e) {
		this.data.oc && e && (e.isVisible(this.data.oc) ? this.show() : this.hide());
	}
	get width() {
		return this.data.rect[2] - this.data.rect[0];
	}
	get height() {
		return this.data.rect[3] - this.data.rect[1];
	}
	_setBackgroundColor(e) {
		let t = this.data.backgroundColor || null;
		e.style.backgroundColor = t === null ? "transparent" : q.makeHexColor(...t);
	}
}, _i = class extends gi {
	constructor(e) {
		super(e, {
			isRenderable: !0,
			ignoreBorder: !0
		}), this.editor = e.editor;
	}
	render() {
		return this.container.className = "editorAnnotation", this.container;
	}
	createOrUpdatePopup() {
		let { editor: e } = this;
		e.hasComment && this._createPopup(e.comment);
	}
	get hasCommentButton() {
		return this.enableComment && this.editor.hasComment;
	}
	get commentButtonPosition() {
		return this.editor.commentButtonPositionInPage;
	}
	get commentText() {
		return this.editor.comment.text;
	}
	set commentText(e) {
		this.editor.comment = e, e || this.removePopup();
	}
	get commentData() {
		return this.editor.getData();
	}
	remove() {
		this.parent.removeAnnotation(this.data.id), this.container.remove(), this.container = null, this.removePopup();
	}
}, vi = class extends gi {
	constructor(e, t = null) {
		super(e, {
			isRenderable: !0,
			ignoreBorder: !!t?.ignoreBorder,
			createQuadrilaterals: !0
		}), this.isTooltipOnly = e.data.isTooltipOnly;
	}
	render() {
		let { data: e, linkService: t } = this, n = document.createElement("a");
		n.setAttribute("data-element-id", e.id);
		let r = !1;
		return e.url ? (t.addLinkAttributes(n, e.url, e.newWindow), r = !0) : e.action ? (this._bindNamedAction(n, e.action, e.overlaidText), r = !0) : e.attachment ? (this.#t(n, e.attachmentId, e.attachment, e.overlaidText, e.attachmentDest), r = !0) : e.setOCGState ? (this.#n(n, e.setOCGState, e.overlaidText), r = !0) : e.dest ? (this._bindLink(n, e.dest, e.overlaidText), r = !0) : (e.actions && (e.actions.has("Action") || e.actions.has("Mouse Up") || e.actions.has("Mouse Down")) && this.enableScripting && this.hasJSActions && (this._bindJSAction(n, e), r = !0), e.resetForm ? (this._bindResetFormAction(n, e.resetForm), r = !0) : this.isTooltipOnly && !r && (this._bindLink(n, ""), r = !0)), this.container.classList.add("linkAnnotation"), r && (this.contentElement = n, this.container.append(n)), this.container;
	}
	#e() {
		this.container.setAttribute("data-internal-link", "");
	}
	_bindLink(e, t, n = "") {
		e.href = this.linkService.getDestinationHash(t), e.onclick = () => (t && this.linkService.goToDestination(t), !1), (t || t === "") && this.#e(), n && (e.title = n);
	}
	_bindNamedAction(e, t, n = "") {
		e.href = this.linkService.getAnchorUrl(""), e.onclick = () => (this.linkService.executeNamedAction(t), !1), n && (e.title = n), this.#e();
	}
	#t(e, t, n, r = "", i = null) {
		e.href = this.linkService.getAnchorUrl(""), n.description ? e.title = n.description : r && (e.title = r);
		let a = async () => {
			let e = await this.linkService.getAttachmentContent(t);
			e && this.downloadManager?.openOrDownloadData(e, n.filename, i);
		};
		e.onclick = () => (a(), !1), this.#e();
	}
	#n(e, t, n = "") {
		e.href = this.linkService.getAnchorUrl(""), e.onclick = () => (this.linkService.executeSetOCGState(t), !1), n && (e.title = n), this.#e();
	}
	_bindJSAction(e, { actions: t, id: n, overlaidText: r }) {
		e.href = this.linkService.getAnchorUrl("");
		let i = /* @__PURE__ */ new Map([
			["Action", "onclick"],
			["Mouse Up", "onmouseup"],
			["Mouse Down", "onmousedown"]
		]);
		for (let r of t.keys()) {
			let t = i.get(r);
			t && (e[t] = () => (this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
				source: this,
				detail: {
					id: n,
					name: r
				}
			}), !1));
		}
		r && (e.title = r), e.onclick ||= () => !1, this.#e();
	}
	_bindResetFormAction(e, t) {
		let n = e.onclick;
		if (n || (e.href = this.linkService.getAnchorUrl("")), this.#e(), !this._fieldObjects) {
			F("_bindResetFormAction - \"resetForm\" action not supported, ensure that the `fieldObjects` parameter is provided."), n || (e.onclick = () => !1);
			return;
		}
		e.onclick = () => {
			n?.();
			let { fields: e, refs: r, include: i } = t, a = [];
			if (e.length !== 0 || r.length !== 0) {
				let t = new Set(r);
				for (let n of e) {
					let e = this._fieldObjects.get(n) || [];
					for (let { id: n } of e) t.add(n);
				}
				let n = /* @__PURE__ */ new Map();
				for (let e of this._fieldObjects.values()) for (let { id: t, kidIds: r } of e) r && n.set(t, r);
				for (let e of t) for (let r of n.get(e) || []) t.add(r);
				for (let e of this._fieldObjects.values()) for (let n of e) t.has(n.id) === i && a.push(n);
			} else for (let e of this._fieldObjects.values()) a.push(...e);
			let o = this.annotationStorage, s = [];
			for (let e of a) {
				let { id: t } = e;
				switch (s.push(t), e.type) {
					case "text": {
						let n = e.defaultValue || "";
						o.setValue(t, { value: n });
						break;
					}
					case "checkbox":
					case "radiobutton": {
						let n = e.defaultValue === e.exportValues;
						o.setValue(t, { value: n });
						break;
					}
					case "combobox":
					case "listbox": {
						let n = e.defaultValue || "";
						o.setValue(t, { value: n });
						break;
					}
					default: continue;
				}
				let n = document.querySelector(`[data-element-id="${t}"]`);
				if (n) {
					if (!pi.has(n)) {
						F(`_bindResetFormAction - element not allowed: ${t}`);
						continue;
					}
					n.dispatchEvent(new Event("resetform"));
				}
			}
			return this.enableScripting && this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
				source: this,
				detail: {
					id: "app",
					ids: s,
					name: "ResetForm"
				}
			}), !1;
		};
	}
}, yi = class extends gi {
	constructor(e) {
		super(e, { isRenderable: !0 });
	}
	render() {
		this.container.classList.add("textAnnotation");
		let e = document.createElement("img");
		return e.src = this.imageResourcesPath + "annotation-" + this.data.name.toLowerCase() + ".svg", e.setAttribute("data-l10n-id", "pdfjs-text-annotation-type"), e.setAttribute("data-l10n-args", JSON.stringify({ type: this.data.name })), !this.data.popupRef && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container.append(e), this.container;
	}
}, bi = class extends gi {
	render() {
		return this.container;
	}
	_getKeyModifier(e) {
		return K.platform.isMac ? e.metaKey : e.ctrlKey;
	}
	_setEventListener(e, t, n, r, i) {
		n.includes("mouse") ? e.addEventListener(n, (e) => {
			this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
				source: this,
				detail: {
					id: this.data.id,
					name: r,
					value: i(e),
					shift: e.shiftKey,
					modifier: this._getKeyModifier(e)
				}
			});
		}) : e.addEventListener(n, (e) => {
			if (n === "blur") {
				if (!t.focused || !e.relatedTarget) return;
				t.focused = !1;
			} else if (n === "focus") {
				if (t.focused) return;
				t.focused = !0;
			}
			i && this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
				source: this,
				detail: {
					id: this.data.id,
					name: r,
					value: i(e)
				}
			});
		});
	}
	_setEventListeners(e, t, n, r) {
		let { actions: i } = this.data;
		for (let [a, o] of n) (o === "Action" || i?.has(o)) && ((o === "Focus" || o === "Blur") && (t ||= { focused: !1 }), this._setEventListener(e, t, a, o, r), o === "Focus" && !i?.has("Blur") ? this._setEventListener(e, t, "blur", "Blur", null) : o === "Blur" && !i?.has("Focus") && this._setEventListener(e, t, "focus", "Focus", null));
	}
	_setTextStyle(e) {
		let t = [
			"left",
			"center",
			"right"
		], { fontColor: n } = this.data.defaultAppearanceData, r = this.data.defaultAppearanceData.fontSize || fi, i = e.style, a, o = (e) => Math.round(10 * e) / 10;
		if (this.data.multiLine) {
			let e = Math.abs(this.data.rect[3] - this.data.rect[1] - 2), t = e / (Math.round(e / (1.35 * r)) || 1);
			a = Math.min(r, o(t / 1.35));
		} else {
			let e = Math.abs(this.data.rect[3] - this.data.rect[1] - 2);
			a = Math.min(r, o(e / 1.35));
		}
		i.fontSize = `calc(${a}px * var(--total-scale-factor))`, i.color = q.makeHexColor(...n), this.data.textAlignment !== null && !this.data.comb && (i.textAlign = t[this.data.textAlignment]);
	}
	_setRequired(e, t) {
		t ? e.setAttribute("required", !0) : e.removeAttribute("required"), e.setAttribute("aria-required", t);
	}
}, xi = class extends bi {
	constructor(e) {
		let t = e.renderForms || e.data.hasOwnCanvas || !e.data.hasAppearance && !!e.data.fieldValue;
		super(e, { isRenderable: t });
	}
	setPropertyOnSiblings(e, t, n, r) {
		let i = this.annotationStorage;
		for (let a of this._getElementsByName(e.name, e.id)) a.domElement && (a.domElement[t] = n), i.setValue(a.id, { [r]: n });
	}
	render() {
		let e = this.annotationStorage, t = this.data.id;
		this.container.classList.add("textWidgetAnnotation");
		let n = null;
		if (this.renderForms) {
			let r = e.getValue(t, { value: this.data.fieldValue }), i = r.value || "", a = e.getValue(t, { charLimit: this.data.maxLen }).charLimit;
			a && i.length > a && (i = i.slice(0, a));
			let o = r.formattedValue || this.data.textContent?.join("\n") || null;
			o && this.data.comb && (o = o.replaceAll(/\s+/g, ""));
			let s = {
				userValue: i,
				formattedValue: o,
				lastCommittedValue: null,
				commitKey: 1,
				focused: !1
			};
			this.data.multiLine ? (n = document.createElement("textarea"), n.textContent = o ?? i, this.data.doNotScroll && (n.style.overflowY = "hidden")) : (n = document.createElement("input"), n.type = this.data.password ? "password" : "text", n.setAttribute("value", o ?? i), this.data.doNotScroll && (n.style.overflowX = "hidden")), this.data.hasOwnCanvas && (this.container.classList.add("hasOwnCanvas"), e.has(t) && this.container.classList.add("sandboxModified")), pi.add(n), this.contentElement = n, n.setAttribute("data-element-id", t), n.disabled = this.data.readOnly, n.name = this.data.fieldName, n.tabIndex = 0;
			let { datetimeFormat: c, datetimeType: l, timeStep: u } = this.data, d = !!l && this.enableScripting;
			c && (n.title = c), this._setRequired(n, this.data.required), a && (n.maxLength = a), n.addEventListener("input", (r) => {
				e.setValue(t, { value: r.target.value }), this.setPropertyOnSiblings(n, "value", r.target.value, "value"), s.formattedValue = null;
			}), n.addEventListener("resetform", (e) => {
				let t = this.data.defaultFieldValue ?? "";
				n.value = s.userValue = t, s.formattedValue = null;
			});
			let f = (e) => {
				let { formattedValue: t } = s;
				t != null && (e.target.value = t), e.target.scrollLeft = 0;
			};
			if (this.enableScripting && this.hasJSActions) {
				n.addEventListener("focus", (e) => {
					if (s.focused) return;
					let { target: t } = e;
					if (d && (t.type = l, u && (t.step = u)), s.userValue) {
						let e = s.userValue;
						if (d) {
							if (l === "time") {
								let n = new Date(e);
								t.value = [
									n.getHours(),
									n.getMinutes(),
									n.getSeconds()
								].map((e) => e.toString().padStart(2, "0")).join(":");
							} else t.value = new Date(e - mi).toISOString().split(l === "date" ? "T" : ".", 1)[0];
						} else t.value = e;
					}
					s.lastCommittedValue = t.value, s.commitKey = 1, this.data.actions?.has("Focus") || (s.focused = !0);
				}), n.addEventListener("updatefromsandbox", (n) => {
					this.container.classList.add("sandboxModified"), this._dispatchEventFromSandbox({
						value(n) {
							s.userValue = n.detail.value ?? "", d || e.setValue(t, { value: s.userValue.toString() }), n.target.value = s.userValue;
						},
						formattedValue(n) {
							let { formattedValue: r } = n.detail;
							s.formattedValue = r, r != null && n.target !== document.activeElement && (n.target.value = r);
							let i = { formattedValue: r };
							d && (i.value = r), e.setValue(t, i);
						},
						selRange(e) {
							e.target.setSelectionRange(...e.detail.selRange);
						},
						charLimit: (n) => {
							let { charLimit: r } = n.detail, { target: i } = n;
							if (r === 0) {
								i.removeAttribute("maxLength");
								return;
							}
							i.setAttribute("maxLength", r);
							let a = s.userValue;
							!a || a.length <= r || (a = a.slice(0, r), i.value = s.userValue = a, e.setValue(t, { value: a }), this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
								source: this,
								detail: {
									id: t,
									name: "Keystroke",
									value: a,
									willCommit: !0,
									commitKey: 1,
									selStart: i.selectionStart,
									selEnd: i.selectionEnd
								}
							}));
						}
					}, n);
				}), n.addEventListener("keydown", (e) => {
					s.commitKey = 1;
					let n = -1;
					if (e.key === "Escape" ? n = 0 : e.key === "Enter" && !this.data.multiLine ? n = 2 : e.key === "Tab" && (s.commitKey = 3), n === -1) return;
					let { value: r } = e.target;
					s.lastCommittedValue !== r && (s.lastCommittedValue = r, s.userValue = r, this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
						source: this,
						detail: {
							id: t,
							name: "Keystroke",
							value: r,
							willCommit: !0,
							commitKey: n,
							selStart: e.target.selectionStart,
							selEnd: e.target.selectionEnd
						}
					}));
				});
				let r = f;
				f = null, n.addEventListener("blur", (e) => {
					if (!s.focused || !e.relatedTarget) return;
					this.data.actions?.has("Blur") || (s.focused = !1);
					let { target: n } = e, { value: i } = n;
					if (d) {
						if (i && l === "time") {
							let e = i.split(":").map((e) => parseInt(e, 10));
							i = new Date(2e3, 0, 1, e[0], e[1], e[2] || 0).valueOf(), n.step = "";
						} else i.includes("T") || (i = `${i}T00:00`), i = new Date(i).valueOf();
						n.type = "text";
					}
					s.userValue = i, s.lastCommittedValue !== i && this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
						source: this,
						detail: {
							id: t,
							name: "Keystroke",
							value: i,
							willCommit: !0,
							commitKey: s.commitKey,
							selStart: e.target.selectionStart,
							selEnd: e.target.selectionEnd
						}
					}), r(e);
				}), this.data.actions?.has("Keystroke") && n.addEventListener("beforeinput", (e) => {
					s.lastCommittedValue = null;
					let { data: n, target: r } = e, { value: i, selectionStart: a, selectionEnd: o } = r, c = a, l = o;
					switch (e.inputType) {
						case "deleteWordBackward": {
							let e = /\w/;
							for (; c > 0 && !e.test(i[c - 1]);) c--;
							for (; c > 0 && e.test(i[c - 1]);) c--;
							break;
						}
						case "deleteWordForward": {
							let e = i.substring(a).match(/^\W*\w*/);
							e && (l += e[0].length);
							break;
						}
						case "deleteContentBackward":
							a === o && --c;
							break;
						case "deleteContentForward": a === o && (l += 1);
					}
					e.preventDefault(), this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
						source: this,
						detail: {
							id: t,
							name: "Keystroke",
							value: i,
							change: n || "",
							willCommit: !1,
							selStart: c,
							selEnd: l
						}
					});
				}), this._setEventListeners(n, s, [
					["focus", "Focus"],
					["blur", "Blur"],
					["mousedown", "Mouse Down"],
					["mouseenter", "Mouse Enter"],
					["mouseleave", "Mouse Exit"],
					["mouseup", "Mouse Up"]
				], (e) => e.target.value);
			}
			if (f && n.addEventListener("blur", f), this.data.comb) {
				let e = (this.data.rect[2] - this.data.rect[0]) / a;
				n.classList.add("comb"), n.style.setProperty("--comb-width", `calc(${e}px * var(--total-scale-factor))`);
				let t = this.data.textAlignment;
				if (t === 1 || t === 2) {
					let e = () => {
						let e = a - n.value.length;
						n.style.setProperty("--comb-offset", `${t === 1 ? e >> 1 : e}`);
					};
					e();
					for (let t of [
						"input",
						"blur",
						"resetform",
						"updatefromsandbox"
					]) n.addEventListener(t, e);
				}
			}
		} else n = document.createElement("div"), n.textContent = this.data.fieldValue, n.style.verticalAlign = "middle", n.style.display = "table-cell", this.data.hasOwnCanvas && (n.hidden = !0);
		return this._setTextStyle(n), this._setBackgroundColor(n), this._setDefaultPropertiesFromJS(n), this.container.append(n), this.container;
	}
}, Si = class extends bi {
	constructor(e) {
		super(e, { isRenderable: !!e.data.hasOwnCanvas });
	}
}, Ci = class extends bi {
	constructor(e) {
		super(e, { isRenderable: e.renderForms });
	}
	render() {
		let e = this.annotationStorage, t = this.data, n = t.id, r = e.getValue(n, { value: t.exportValue === t.fieldValue }).value;
		typeof r == "string" && (r = r !== "Off", e.setValue(n, { value: r })), this.container.classList.add("buttonWidgetAnnotation", "checkBox");
		let i = document.createElement("input");
		return pi.add(i), i.setAttribute("data-element-id", n), i.disabled = t.readOnly, this._setRequired(i, this.data.required), i.type = "checkbox", i.name = t.fieldName, r && i.setAttribute("checked", !0), i.setAttribute("exportValue", t.exportValue), i.tabIndex = 0, i.addEventListener("change", (r) => {
			let { name: i, checked: a } = r.target;
			for (let r of this._getElementsByName(i, n)) {
				let n = a && r.exportValue === t.exportValue;
				r.domElement && (r.domElement.checked = n), e.setValue(r.id, { value: n });
			}
			e.setValue(n, { value: a });
		}), i.addEventListener("resetform", (e) => {
			let n = t.defaultFieldValue || "Off";
			e.target.checked = n === t.exportValue;
		}), this.enableScripting && this.hasJSActions && (i.addEventListener("updatefromsandbox", (t) => {
			this._dispatchEventFromSandbox({ value(t) {
				t.target.checked = t.detail.value !== "Off", e.setValue(n, { value: t.target.checked });
			} }, t);
		}), this._setEventListeners(i, null, [
			["change", "Validate"],
			["change", "Action"],
			["focus", "Focus"],
			["blur", "Blur"],
			["mousedown", "Mouse Down"],
			["mouseenter", "Mouse Enter"],
			["mouseleave", "Mouse Exit"],
			["mouseup", "Mouse Up"]
		], (e) => e.target.checked)), this._setDefaultPropertiesFromJS(i), this.container.append(i), this.container;
	}
}, wi = class extends bi {
	constructor(e) {
		super(e, { isRenderable: e.renderForms });
	}
	render() {
		this.container.classList.add("buttonWidgetAnnotation", "radioButton");
		let e = this.annotationStorage, t = this.data, n = t.id, r = e.getValue(n, { value: t.buttonValue !== null && t.fieldValue === t.buttonValue }).value;
		if (typeof r == "string" && (r = r !== t.buttonValue, e.setValue(n, { value: r })), r) for (let r of this._getElementsByName(t.fieldName, n)) e.setValue(r.id, { value: !1 });
		let i = document.createElement("input");
		if (pi.add(i), i.setAttribute("data-element-id", n), i.disabled = t.readOnly, this._setRequired(i, this.data.required), i.type = "radio", i.name = t.fieldName, r && i.setAttribute("checked", !0), i.tabIndex = 0, i.addEventListener("change", (t) => {
			let { name: r, checked: i } = t.target;
			for (let t of this._getElementsByName(r, n)) e.setValue(t.id, { value: !1 });
			e.setValue(n, { value: i });
		}), i.addEventListener("resetform", (e) => {
			let n = t.defaultFieldValue;
			e.target.checked = n != null && n === t.buttonValue;
		}), this.enableScripting && this.hasJSActions) {
			let r = t.buttonValue;
			i.addEventListener("updatefromsandbox", (t) => {
				this._dispatchEventFromSandbox({ value: (t) => {
					let i = r === t.detail.value;
					for (let r of this._getElementsByName(t.target.name)) {
						let t = i && r.id === n;
						r.domElement && (r.domElement.checked = t), e.setValue(r.id, { value: t });
					}
				} }, t);
			}), this._setEventListeners(i, null, [
				["change", "Validate"],
				["change", "Action"],
				["focus", "Focus"],
				["blur", "Blur"],
				["mousedown", "Mouse Down"],
				["mouseenter", "Mouse Enter"],
				["mouseleave", "Mouse Exit"],
				["mouseup", "Mouse Up"]
			], (e) => e.target.checked);
		}
		return this._setDefaultPropertiesFromJS(i), this.container.append(i), this.container;
	}
}, Ti = class extends vi {
	constructor(e) {
		super(e, { ignoreBorder: e.data.hasAppearance });
	}
	render() {
		let e = super.render();
		e.classList.add("buttonWidgetAnnotation", "pushButton");
		let t = e.lastChild;
		return this.enableScripting && this.hasJSActions && t && (this._setDefaultPropertiesFromJS(t), t.addEventListener("updatefromsandbox", (e) => {
			this._dispatchEventFromSandbox({}, e);
		})), e;
	}
}, Ei = class extends bi {
	constructor(e) {
		super(e, { isRenderable: e.renderForms });
	}
	render() {
		this.container.classList.add("choiceWidgetAnnotation");
		let e = this.annotationStorage, t = this.data.id, n = e.getValue(t, { value: this.data.fieldValue }), r = document.createElement("select");
		pi.add(r), r.setAttribute("data-element-id", t), r.disabled = this.data.readOnly, this._setRequired(r, this.data.required), r.name = this.data.fieldName, r.tabIndex = 0;
		let i = this.data.combo && this.data.options.length > 0;
		this.data.combo || (r.size = this.data.options.length, this.data.multiSelect && (r.multiple = !0)), r.addEventListener("resetform", (e) => {
			let t = this.data.defaultFieldValue;
			for (let e of r.options) e.selected = e.value === t;
		});
		let a = (e, t) => {
			let n = t.replaceAll(" ", "\xA0");
			e.textContent = n, n !== t && e.setAttribute("display-value", t);
		};
		for (let e of this.data.options) {
			let t = document.createElement("option");
			a(t, e.displayValue), t.value = e.exportValue, n.value.includes(e.exportValue) && (t.setAttribute("selected", !0), i = !1), r.append(t);
		}
		let o = null;
		if (i) {
			let e = document.createElement("option");
			e.value = " ", e.setAttribute("hidden", !0), e.setAttribute("selected", !0), r.prepend(e), o = () => {
				e.remove(), r.removeEventListener("input", o), o = null;
			}, r.addEventListener("input", o);
		}
		let s = (e) => {
			let t = e ? "value" : "textContent", { options: n, multiple: i } = r;
			return i ? Array.prototype.filter.call(n, (e) => e.selected).map((e) => e[t]) : n.selectedIndex === -1 ? null : n[n.selectedIndex][t];
		}, c = s(!1), l = (e) => {
			let t = e.target.options;
			return Array.prototype.map.call(t, (e) => ({
				displayValue: e.getAttribute("display-value") || e.textContent,
				exportValue: e.value
			}));
		};
		return this.enableScripting && this.hasJSActions ? (r.addEventListener("updatefromsandbox", (n) => {
			this._dispatchEventFromSandbox({
				value(n) {
					o?.();
					let i = n.detail.value, a = new Set(Array.isArray(i) ? i : [i]);
					for (let e of r.options) e.selected = a.has(e.value);
					e.setValue(t, { value: s(!0) }), c = s(!1);
				},
				multipleSelection(e) {
					r.multiple = !0;
				},
				remove(n) {
					let i = r.options, a = n.detail.remove;
					i[a].selected = !1, r.remove(a), i.length > 0 && Array.prototype.findIndex.call(i, (e) => e.selected) === -1 && (i[0].selected = !0), e.setValue(t, {
						value: s(!0),
						items: l(n)
					}), c = s(!1);
				},
				clear(n) {
					for (; r.length !== 0;) r.remove(0);
					e.setValue(t, {
						value: null,
						items: []
					}), c = s(!1);
				},
				insert(n) {
					let { index: i, displayValue: o, exportValue: u } = n.detail.insert, d = r.children[i], f = document.createElement("option");
					a(f, o), f.value = u, d ? d.before(f) : r.append(f), e.setValue(t, {
						value: s(!0),
						items: l(n)
					}), c = s(!1);
				},
				items(n) {
					let { items: i } = n.detail;
					for (; r.length !== 0;) r.remove(0);
					for (let e of i) {
						let { displayValue: t, exportValue: n } = e, i = document.createElement("option");
						a(i, t), i.value = n, r.append(i);
					}
					r.options.length > 0 && (r.options[0].selected = !0), e.setValue(t, {
						value: s(!0),
						items: l(n)
					}), c = s(!1);
				},
				indices(n) {
					let r = new Set(n.detail.indices);
					for (let e of n.target.options) e.selected = r.has(e.index);
					e.setValue(t, { value: s(!0) }), c = s(!1);
				},
				editable(e) {
					e.target.disabled = !e.detail.editable;
				}
			}, n);
		}), r.addEventListener("input", (n) => {
			let r = s(!0), i = s(!1);
			e.setValue(t, { value: r }), n.preventDefault(), this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
				source: this,
				detail: {
					id: t,
					name: "Keystroke",
					value: c,
					change: i,
					changeEx: r,
					willCommit: !1,
					commitKey: 1,
					keyDown: !1
				}
			});
		}), this._setEventListeners(r, null, [
			["focus", "Focus"],
			["blur", "Blur"],
			["mousedown", "Mouse Down"],
			["mouseenter", "Mouse Enter"],
			["mouseleave", "Mouse Exit"],
			["mouseup", "Mouse Up"],
			["input", "Action"],
			["input", "Validate"]
		], (e) => e.target.value)) : r.addEventListener("input", function(n) {
			e.setValue(t, { value: s(!0) });
		}), this.data.combo && this._setTextStyle(r), this._setBackgroundColor(r), this._setDefaultPropertiesFromJS(r), this.container.append(r), this.container;
	}
}, Di = class extends gi {
	constructor(e) {
		let { data: t, elements: n, parent: r } = e, i = !!r._commentManager;
		if (super(e, { isRenderable: !i && gi._hasPopupData(t) }), this.elements = n, i && gi._hasPopupData(t)) {
			let e = this.popup = this.#e();
			for (let t of n) t.popup = e;
		} else this.popup = null;
	}
	#e() {
		return new Oi({
			container: this.container,
			color: this.data.color,
			titleObj: this.data.titleObj,
			modificationDate: this.data.modificationDate || this.data.creationDate,
			contentsObj: this.data.contentsObj,
			richText: this.data.richText,
			rect: this.data.rect,
			parentRect: this.data.parentRect || null,
			parent: this.parent,
			elements: this.elements,
			open: this.data.open,
			commentManager: this.parent._commentManager
		});
	}
	render() {
		let { container: e } = this;
		e.classList.add("popupAnnotation"), e.role = "comment";
		let t = this.popup = this.#e(), n = [];
		for (let e of this.elements) e.popup = t, e.container.ariaHasPopup = "dialog", n.push(e.data.id), e.addHighlightArea();
		return this.container.setAttribute("aria-controls", n.map((e) => `${v}${e}`).join(",")), this.container;
	}
}, Oi = class {
	#e = null;
	#t = this.#P.bind(this);
	#n = this.#R.bind(this);
	#r = this.#L.bind(this);
	#i = this.#I.bind(this);
	#a = null;
	#o = null;
	#s = null;
	#c = null;
	#l = null;
	#u = null;
	#d = null;
	#f = !1;
	#p = null;
	#m = null;
	#h = null;
	#g = null;
	#_ = null;
	#v = null;
	#y = null;
	#b = null;
	#x = null;
	#S = null;
	#C = !1;
	#w = null;
	#T = null;
	constructor({ container: e, color: t, elements: n, titleObj: r, modificationDate: i, contentsObj: a, richText: o, parent: s, rect: c, parentRect: l, open: u, commentManager: d = null }) {
		this.#o = e, this.#x = r, this.#s = a, this.#b = o, this.#u = s, this.#a = t, this.#y = c, this.#d = l, this.#l = n, this.#e = d, this.#w = n[0], this.#c = je.toDateObject(i), this.trigger = n.flatMap((e) => e.getElementsToTriggerPopup()), d || (this.#E(), this.#o.hidden = !0, u && this.#I());
	}
	#E() {
		if (this.#m) return;
		this.#m = new AbortController();
		let { signal: e } = this.#m;
		for (let t of this.trigger) t.addEventListener("click", this.#i, { signal: e }), t.addEventListener("pointerenter", this.#r, { signal: e }), t.addEventListener("pointerleave", this.#n, { signal: e }), t.classList.add("popupTriggerArea");
		for (let t of this.#l) t.container?.addEventListener("keydown", this.#t, { signal: e });
	}
	#D() {
		let e = this.#l.find((e) => e.hasCommentButton);
		e && (this.#_ = e._normalizePoint(e.commentButtonPosition));
	}
	renderCommentButton() {
		if (this.#g) {
			this.#g.parentNode || this.#w.container.after(this.#g);
			return;
		}
		if (this.#_ || this.#D(), !this.#_) return;
		let { signal: e } = this.#m = new AbortController(), t = this.#w.hasOwnCommentButton, n = () => {
			this.#e.toggleCommentPopup(this, !0, void 0, !t);
		}, r = () => {
			this.#e.toggleCommentPopup(this, !1, !0, !t);
		}, i = () => {
			this.#e.toggleCommentPopup(this, !1, !1);
		};
		if (t) {
			this.#g = this.#w.container;
			for (let t of this.trigger) t.ariaHasPopup = "dialog", t.ariaControls = "commentPopup", t.addEventListener("keydown", this.#t, { signal: e }), t.addEventListener("click", n, { signal: e }), t.addEventListener("pointerenter", r, { signal: e }), t.addEventListener("pointerleave", i, { signal: e }), t.classList.add("popupTriggerArea");
		} else {
			let t = this.#g = document.createElement("button");
			t.className = "annotationCommentButton";
			let a = this.#w.container;
			t.style.zIndex = parseInt(a.style.zIndex, 10) + 1, t.tabIndex = 0, t.ariaHasPopup = "dialog", t.ariaControls = "commentPopup", t.setAttribute("data-l10n-id", "pdfjs-show-comment-button"), this.#k(), this.#O(), t.addEventListener("keydown", this.#t, { signal: e }), t.addEventListener("click", n, { signal: e }), t.addEventListener("pointerenter", r, { signal: e }), t.addEventListener("pointerleave", i, { signal: e }), a.after(t);
		}
	}
	#O() {
		if (this.#w.extraPopupElement && !this.#w.editor) return;
		this.#g || this.renderCommentButton();
		let [e, t] = this.#_, { style: n } = this.#g;
		n.left = `calc(${e}%)`, n.top = `calc(${t}% - var(--comment-button-dim))`;
	}
	#k() {
		this.#w.extraPopupElement || (this.#g || this.renderCommentButton(), this.#g.style.backgroundColor = this.commentButtonColor || "");
	}
	get commentButtonColor() {
		let { color: e, opacity: t } = this.#w.commentData;
		return e ? this.#u._commentManager.makeCommentColor(e, t) : null;
	}
	focusCommentButton() {
		setTimeout(() => {
			this.#g?.focus();
		}, 0);
	}
	getData() {
		let { richText: e, color: t, opacity: n, creationDate: r, modificationDate: i } = this.#w.commentData;
		return {
			contentsObj: { str: this.comment },
			richText: e,
			color: t,
			opacity: n,
			creationDate: r,
			modificationDate: i
		};
	}
	get elementBeforePopup() {
		return this.#g;
	}
	get comment() {
		return this.#T ||= this.#w.commentText, this.#T;
	}
	set comment(e) {
		e !== this.comment && (this.#w.commentText = this.#T = e);
	}
	focus() {
		this.#w.container?.focus();
	}
	get parentBoundingClientRect() {
		return this.#w.layer.getBoundingClientRect();
	}
	setCommentButtonStates({ selected: e, hasPopup: t }) {
		this.#g && (this.#g.classList.toggle("selected", e), this.#g.ariaExpanded = t);
	}
	setSelectedCommentButton(e) {
		this.#g.classList.toggle("selected", e);
	}
	get commentPopupPosition() {
		if (this.#v) return this.#v;
		let { x: e, y: t, height: n } = this.#g.getBoundingClientRect(), { x: r, y: i, width: a, height: o } = this.#w.layer.getBoundingClientRect();
		return [(e - r) / a, (t + n - i) / o];
	}
	set commentPopupPosition(e) {
		this.#v = e;
	}
	hasDefaultPopupPosition() {
		return this.#v === null;
	}
	get commentButtonPosition() {
		return this.#_;
	}
	get commentButtonWidth() {
		return this.#g.getBoundingClientRect().width / this.parentBoundingClientRect.width;
	}
	editComment(e) {
		let [t, n] = this.#v || this.commentButtonPosition.map((e) => e / 100), r = this.parentBoundingClientRect, { x: i, y: a, width: o, height: s } = r;
		this.#e.showDialog(null, this, i + t * o, a + n * s, {
			...e,
			parentDimensions: r
		});
	}
	render() {
		if (this.#p) return;
		let e = this.#p = document.createElement("div");
		if (e.className = "popup", this.#a) {
			let t = e.style.outlineColor = q.makeHexColor(...this.#a);
			e.style.backgroundColor = `color-mix(in srgb, ${t} 30%, white)`;
		}
		let t = document.createElement("span");
		if (t.className = "header", this.#x?.str) {
			let e = document.createElement("span");
			e.className = "title", t.append(e), {dir: e.dir, str: e.textContent} = this.#x;
		}
		if (e.append(t), this.#c) {
			let e = document.createElement("time");
			e.className = "popupDate", e.setAttribute("data-l10n-id", "pdfjs-annotation-date-time-string"), e.setAttribute("data-l10n-args", JSON.stringify({ dateObj: this.#c.valueOf() })), e.dateTime = this.#c.toISOString(), t.append(e);
		}
		Je({
			html: this.#A || this.#s.str,
			dir: this.#s?.dir,
			className: "popupContent"
		}, e), this.#o.append(e);
	}
	get #A() {
		let e = this.#b, t = this.#s;
		return e?.str && (!t?.str || t.str === e.str) && this.#b.html || null;
	}
	get #j() {
		return this.#A?.attributes?.style?.fontSize || 0;
	}
	get #M() {
		return this.#A?.attributes?.style?.color || null;
	}
	#N(e) {
		let t = [], n = {
			str: e,
			html: {
				name: "div",
				attributes: { dir: "auto" },
				children: [{
					name: "p",
					children: t
				}]
			}
		}, r = { style: {
			color: this.#M,
			fontSize: this.#j ? `calc(${this.#j}px * var(--total-scale-factor))` : ""
		} };
		for (let n of e.split("\n")) t.push({
			name: "span",
			value: n,
			attributes: r
		});
		return n;
	}
	#P(e) {
		e.altKey || e.shiftKey || e.ctrlKey || e.metaKey || (e.key === "Enter" || e.key === "Escape" && this.#f) && this.#I();
	}
	updateEdited({ rect: e, popup: t, deleted: n }) {
		if (this.#e) {
			n ? (this.remove(), this.#T = null) : t && (t.deleted ? this.remove() : (this.#k(), this.#T = t.text)), e && (this.#_ = null, this.#D(), this.#O());
			return;
		}
		if (n || t?.deleted) {
			this.remove();
			return;
		}
		this.#E(), this.#S ||= {
			contentsObj: this.#s,
			richText: this.#b
		}, e && (this.#h = null), t && t.text && (this.#b = this.#N(t.text), this.#c = je.toDateObject(t.date), this.#s = null), this.#p?.remove(), this.#p = null;
	}
	resetEdited() {
		this.#S && ({contentsObj: this.#s, richText: this.#b} = this.#S, this.#S = null, this.#p?.remove(), this.#p = null, this.#h = null);
	}
	remove() {
		if (this.#m?.abort(), this.#m = null, this.#p?.remove(), this.#p = null, this.#C = !1, this.#f = !1, this.#g?.remove(), this.#g = null, this.trigger) for (let e of this.trigger) e.classList.remove("popupTriggerArea");
	}
	#F() {
		if (this.#h !== null) return;
		let { page: { view: e }, viewport: { rawDims: { pageWidth: t, pageHeight: n, pageX: r, pageY: i } } } = this.#u, a = !!this.#d, o = a ? this.#d : this.#y;
		for (let e of this.#l) if (!o || q.intersect(e.data.rect, o) !== null) {
			o = e.data.rect, a = !0;
			break;
		}
		let s = q.normalizeRect([
			o[0],
			e[3] - o[1] + e[1],
			o[2],
			e[3] - o[3] + e[1]
		]), c = a ? o[2] - o[0] + 5 : 0, l = s[0] + c, u = s[1];
		this.#h = [100 * (l - r) / t, 100 * (u - i) / n];
		let { style: d } = this.#o;
		d.left = `${this.#h[0]}%`, d.top = `${this.#h[1]}%`;
	}
	#I() {
		if (this.#e) {
			this.#e.toggleCommentPopup(this, !1);
			return;
		}
		this.#f = !this.#f, this.#f ? (this.#L(), this.#o.addEventListener("click", this.#i), this.#o.addEventListener("keydown", this.#t)) : (this.#R(), this.#o.removeEventListener("click", this.#i), this.#o.removeEventListener("keydown", this.#t));
	}
	#L() {
		this.#p || this.render(), this.isVisible ? this.#f && this.#o.classList.add("focused") : (this.#F(), this.#o.hidden = !1, this.#o.style.zIndex = parseInt(this.#o.style.zIndex, 10) + 1e3);
	}
	#R() {
		this.#o.classList.remove("focused"), !(this.#f || !this.isVisible) && (this.#o.hidden = !0, this.#o.style.zIndex = parseInt(this.#o.style.zIndex, 10) - 1e3);
	}
	forceHide() {
		this.#C = this.isVisible, this.#C && (this.#o.hidden = !0);
	}
	maybeShow() {
		this.#e || (this.#E(), this.#C && (this.#p || this.#L(), this.#C = !1, this.#o.hidden = !1));
	}
	get isVisible() {
		return !this.#e && this.#o.hidden === !1;
	}
}, ki = class extends gi {
	constructor(e) {
		super(e, {
			isRenderable: !0,
			ignoreBorder: !0
		}), this.textContent = e.data.textContent, this.textPosition = e.data.textPosition, this.annotationEditorType = b.FREETEXT;
	}
	render() {
		if (this.container.classList.add("freeTextAnnotation"), this.textContent) {
			let e = this.contentElement = document.createElement("div");
			e.classList.add("annotationTextContent"), e.setAttribute("role", "comment");
			for (let t of this.textContent) {
				let n = document.createElement("span");
				n.textContent = t, e.append(n);
			}
			this.container.append(e);
		}
		return !this.data.popupRef && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this._editOnDoubleClick(), this.container;
	}
}, Ai = class extends gi {
	#e = null;
	constructor(e) {
		super(e, {
			isRenderable: !0,
			ignoreBorder: !0
		});
	}
	render() {
		this.container.classList.add("lineAnnotation");
		let { data: e, width: t, height: n } = this, r = this.svgFactory.create(t, n, !0), i = this.#e = this.svgFactory.createElement("svg:line");
		return i.setAttribute("x1", e.rect[2] - e.lineCoordinates[0]), i.setAttribute("y1", e.rect[3] - e.lineCoordinates[1]), i.setAttribute("x2", e.rect[2] - e.lineCoordinates[2]), i.setAttribute("y2", e.rect[3] - e.lineCoordinates[3]), i.setAttribute("stroke-width", e.borderStyle.width || 1), i.setAttribute("stroke", "transparent"), i.setAttribute("fill", "transparent"), r.append(i), this.container.append(r), !e.popupRef && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container;
	}
	getElementsToTriggerPopup() {
		return this.#e;
	}
	addHighlightArea() {
		this.container.classList.add("highlightArea");
	}
}, ji = class extends gi {
	#e = null;
	constructor(e) {
		super(e, {
			isRenderable: !0,
			ignoreBorder: !0
		});
	}
	render() {
		this.container.classList.add("squareAnnotation");
		let { data: e, width: t, height: n } = this, r = this.svgFactory.create(t, n, !0), i = e.borderStyle.width, a = this.#e = this.svgFactory.createElement("svg:rect");
		return a.setAttribute("x", i / 2), a.setAttribute("y", i / 2), a.setAttribute("width", t - i), a.setAttribute("height", n - i), a.setAttribute("stroke-width", i || 1), a.setAttribute("stroke", "transparent"), a.setAttribute("fill", "transparent"), r.append(a), this.container.append(r), !e.popupRef && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container;
	}
	getElementsToTriggerPopup() {
		return this.#e;
	}
	addHighlightArea() {
		this.container.classList.add("highlightArea");
	}
}, Mi = class extends gi {
	#e = null;
	constructor(e) {
		super(e, {
			isRenderable: !0,
			ignoreBorder: !0
		});
	}
	render() {
		this.container.classList.add("circleAnnotation");
		let { data: e, width: t, height: n } = this, r = this.svgFactory.create(t, n, !0), i = e.borderStyle.width, a = this.#e = this.svgFactory.createElement("svg:ellipse");
		return a.setAttribute("cx", t / 2), a.setAttribute("cy", n / 2), a.setAttribute("rx", t / 2 - i / 2), a.setAttribute("ry", n / 2 - i / 2), a.setAttribute("stroke-width", i || 1), a.setAttribute("stroke", "transparent"), a.setAttribute("fill", "transparent"), r.append(a), this.container.append(r), !e.popupRef && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container;
	}
	getElementsToTriggerPopup() {
		return this.#e;
	}
	addHighlightArea() {
		this.container.classList.add("highlightArea");
	}
}, Ni = class extends gi {
	#e = null;
	constructor(e) {
		super(e, {
			isRenderable: !0,
			ignoreBorder: !0
		}), this.containerClassName = "polylineAnnotation", this.svgElementName = "svg:polyline";
	}
	render() {
		this.container.classList.add(this.containerClassName);
		let { data: { rect: e, vertices: t, borderStyle: n, popupRef: r }, width: i, height: a } = this;
		if (!t) return this.container;
		let o = this.svgFactory.create(i, a, !0), s = [];
		for (let n = 0, r = t.length; n < r; n += 2) {
			let r = t[n] - e[0], i = e[3] - t[n + 1];
			s.push(`${r},${i}`);
		}
		s = s.join(" ");
		let c = this.#e = this.svgFactory.createElement(this.svgElementName);
		return c.setAttribute("points", s), c.setAttribute("stroke-width", n.width || 1), c.setAttribute("stroke", "transparent"), c.setAttribute("fill", "transparent"), o.append(c), this.container.append(o), !r && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container;
	}
	getElementsToTriggerPopup() {
		return this.#e;
	}
	addHighlightArea() {
		this.container.classList.add("highlightArea");
	}
}, Pi = class extends Ni {
	constructor(e) {
		super(e), this.containerClassName = "polygonAnnotation", this.svgElementName = "svg:polygon";
	}
}, Fi = class extends gi {
	constructor(e) {
		super(e, {
			isRenderable: !0,
			ignoreBorder: !0
		});
	}
	render() {
		return this.container.classList.add("caretAnnotation"), !this.data.popupRef && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container;
	}
}, Ii = class extends gi {
	#e = null;
	#t = [];
	constructor(e) {
		super(e, {
			isRenderable: !0,
			ignoreBorder: !0
		}), this.containerClassName = "inkAnnotation", this.svgElementName = "svg:polyline", this.annotationEditorType = this.data.it === "InkHighlight" ? b.HIGHLIGHT : b.INK;
	}
	#n(e, t) {
		switch (e) {
			case 90: return {
				transform: `rotate(90) translate(${-t[0]},${t[1]}) scale(1,-1)`,
				width: t[3] - t[1],
				height: t[2] - t[0]
			};
			case 180: return {
				transform: `rotate(180) translate(${-t[2]},${t[1]}) scale(1,-1)`,
				width: t[2] - t[0],
				height: t[3] - t[1]
			};
			case 270: return {
				transform: `rotate(270) translate(${-t[2]},${t[3]}) scale(1,-1)`,
				width: t[3] - t[1],
				height: t[2] - t[0]
			};
			default: return {
				transform: `translate(${-t[0]},${t[3]}) scale(1,-1)`,
				width: t[2] - t[0],
				height: t[3] - t[1]
			};
		}
	}
	render() {
		this.container.classList.add(this.containerClassName);
		let { data: { rect: e, rotation: t, inkLists: n, borderStyle: r, popupRef: i } } = this, { transform: a, width: o, height: s } = this.#n(t, e), c = this.svgFactory.create(o, s, !0), l = this.#e = this.svgFactory.createElement("svg:g");
		c.append(l), l.setAttribute("stroke-width", r.width || 1), l.setAttribute("stroke-linecap", "round"), l.setAttribute("stroke-linejoin", "round"), l.setAttribute("stroke-miterlimit", 10), l.setAttribute("stroke", "transparent"), l.setAttribute("fill", "transparent"), l.setAttribute("transform", a);
		for (let e of n) {
			let t = this.svgFactory.createElement(this.svgElementName);
			this.#t.push(t), t.setAttribute("points", e.join(",")), l.append(t);
		}
		return !i && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container.append(c), this._editOnDoubleClick(), this.container;
	}
	updateEdited(e) {
		super.updateEdited(e);
		let { thickness: t, points: n, rect: r } = e, i = this.#e;
		if (t >= 0 && i.setAttribute("stroke-width", t || 1), n) for (let e = 0, t = this.#t.length; e < t; e++) this.#t[e].setAttribute("points", n[e].join(","));
		if (r) {
			let { transform: e, width: t, height: n } = this.#n(this.data.rotation, r);
			i.parentElement.setAttribute("viewBox", `0 0 ${t} ${n}`), i.setAttribute("transform", e);
		}
	}
	getElementsToTriggerPopup() {
		return this.#t;
	}
	addHighlightArea() {
		this.container.classList.add("highlightArea");
	}
}, Li = class extends gi {
	constructor(e) {
		super(e, {
			isRenderable: !0,
			ignoreBorder: !0,
			createQuadrilaterals: !0
		}), this.annotationEditorType = b.HIGHLIGHT;
	}
	render() {
		let { data: { overlaidText: e, popupRef: t } } = this;
		if (!t && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container.classList.add("highlightAnnotation"), this._editOnDoubleClick(), e) {
			let t = document.createElement("mark");
			t.classList.add("overlaidText"), t.textContent = e, this.container.append(t);
		}
		return this.container;
	}
}, Ri = class extends gi {
	constructor(e) {
		super(e, {
			isRenderable: !0,
			ignoreBorder: !0,
			createQuadrilaterals: !0
		});
	}
	render() {
		let { data: { overlaidText: e, popupRef: t } } = this;
		if (!t && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container.classList.add("underlineAnnotation"), e) {
			let t = document.createElement("u");
			t.classList.add("overlaidText"), t.textContent = e, this.container.append(t);
		}
		return this.container;
	}
}, zi = class extends gi {
	constructor(e) {
		super(e, {
			isRenderable: !0,
			ignoreBorder: !0,
			createQuadrilaterals: !0
		});
	}
	render() {
		let { data: { overlaidText: e, popupRef: t } } = this;
		if (!t && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container.classList.add("squigglyAnnotation"), e) {
			let t = document.createElement("u");
			t.classList.add("overlaidText"), t.textContent = e, this.container.append(t);
		}
		return this.container;
	}
}, Bi = class extends gi {
	constructor(e) {
		super(e, {
			isRenderable: !0,
			ignoreBorder: !0,
			createQuadrilaterals: !0
		});
	}
	render() {
		let { data: { overlaidText: e, popupRef: t } } = this;
		if (!t && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container.classList.add("strikeoutAnnotation"), e) {
			let t = document.createElement("s");
			t.classList.add("overlaidText"), t.textContent = e, this.container.append(t);
		}
		return this.container;
	}
}, Vi = class extends gi {
	constructor(e) {
		super(e, {
			isRenderable: !0,
			ignoreBorder: !0
		}), this.annotationEditorType = b.STAMP;
	}
	render() {
		return this.container.classList.add("stampAnnotation"), this.container.setAttribute("role", "img"), !this.data.popupRef && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this._editOnDoubleClick(), this.container;
	}
}, Hi = class extends gi {
	#e = null;
	constructor(e) {
		super(e, { isRenderable: !0 });
		let { fileId: t, file: n } = this.data;
		this.filename = n.filename, this.content = n.content, this.fileId = t, this.linkService.eventBus?.dispatch("fileattachmentannotation", {
			source: this,
			attachmentId: this.fileId,
			...n
		});
	}
	render() {
		this.container.classList.add("fileAttachmentAnnotation");
		let { container: e, data: t } = this, n;
		t.hasAppearance || t.fillAlpha === 0 ? n = document.createElement("div") : (n = document.createElement("img"), n.src = `${this.imageResourcesPath}annotation-${/paperclip/i.test(t.name) ? "paperclip" : "pushpin"}.svg`, t.fillAlpha && t.fillAlpha < 1 && (n.style = `filter: opacity(${Math.round(t.fillAlpha * 100)}%);`)), n.addEventListener("dblclick", this.#t.bind(this)), this.#e = n;
		let { isMac: r } = K.platform;
		return e.addEventListener("keydown", (e) => {
			e.key === "Enter" && (r ? e.metaKey : e.ctrlKey) && this.#t();
		}), !t.popupRef && this.hasPopupData ? (this.hasOwnCommentButton = !0, this._createPopup()) : n.classList.add("popupTriggerArea"), e.append(n), e;
	}
	getElementsToTriggerPopup() {
		return this.#e;
	}
	addHighlightArea() {
		this.container.classList.add("highlightArea");
	}
	async #t() {
		let { fileId: e, filename: t, content: n } = this, r = await this.linkService.getAttachmentContent(e) || n;
		r && this.downloadManager?.openOrDownloadData(r, t);
	}
}, Ui = class extends gi {
	#e = new AbortController();
	#t = null;
	#n = null;
	constructor(e) {
		super(e, { isRenderable: !!e.data.richMedia });
	}
	render() {
		this.container.classList.add("mediaAnnotation");
		let { filename: e } = this.data.richMedia, t = document.createElement("button");
		return t.className = "mediaPlayButton", t.type = "button", t.title = t.ariaLabel = e, t.addEventListener("click", () => this.#r(t), { signal: this.#e.signal }), this.container.append(t), this.container;
	}
	async #r(e) {
		let { fileId: t, filename: n, contentType: r } = this.data.richMedia;
		e.disabled = !0;
		let i;
		try {
			i = await this.linkService.getAttachmentContent(t);
		} catch {
			return;
		} finally {
			e.disabled = !1;
		}
		if (!i || !e.isConnected) return;
		let { signal: a } = this.#e, o = new Blob([i], { type: r });
		if (!/^(?:video|audio)\//.test(o.type)) return;
		let s = URL.createObjectURL(o);
		this.#t = s;
		let c = o.type.startsWith("audio/"), l = document.createElement(c ? "audio" : "video");
		if (this.#n = l, l.className = "mediaContent", this._setBackgroundColor(l), l.src = s, l.title = n, l.controls = !0, l.autoplay = !0, l.tabIndex = 0, c) {
			let e = !1, t = !1, n = () => {
				l.controls = e || t;
			};
			this.container.addEventListener("pointerenter", () => {
				e = !0, n();
			}, { signal: a }), this.container.addEventListener("pointerleave", () => {
				e = !1, n();
			}, { signal: a }), this.container.addEventListener("focusin", () => {
				t = !0, n();
			}, { signal: a }), this.container.addEventListener("focusout", () => {
				t = !1, n();
			}, { signal: a });
		}
		l.addEventListener("emptied", () => this.#i(s), {
			once: !0,
			signal: a
		}), e.replaceWith(l), l.play().catch(() => {});
	}
	#i(e = this.#t) {
		e && e === this.#t && (URL.revokeObjectURL(e), this.#t = null);
	}
	destroy() {
		this.#e.abort(), this.#n &&= (this.#n.pause(), this.#n.removeAttribute("src"), this.#n.load(), null), this.#i();
	}
}, Wi = class e {
	#e = null;
	#t = null;
	#n = null;
	#r = /* @__PURE__ */ new Map();
	#i = null;
	#a = null;
	#o = [];
	#s = !1;
	zIndex = 0;
	constructor({ div: e, accessibilityManager: t, annotationCanvasMap: n, annotationEditorUIManager: r, page: i, viewport: a, structTreeLayer: o, commentManager: s, linkService: c, annotationStorage: l }) {
		this.div = e, this.#e = t, this.#t = n, this.#i = o || null, this.#a = c || null, this.#n = l || new yt(), this.page = i, this.viewport = a, this._annotationEditorUIManager = r, this._commentManager = s || null;
	}
	hasEditableAnnotations() {
		return this.#r.size > 0;
	}
	async render(e) {
		let { annotations: t, optionalContentConfig: n } = e, r = this.div;
		Ie(r, this.viewport);
		let i = /* @__PURE__ */ new Map(), a = [], o = {
			data: null,
			layer: r,
			linkService: this.#a,
			downloadManager: e.downloadManager,
			imageResourcesPath: e.imageResourcesPath || "",
			renderForms: e.renderForms !== !1,
			svgFactory: new di(),
			annotationStorage: this.#n,
			enableComment: e.enableComment === !0,
			enableScripting: e.enableScripting === !0,
			hasJSActions: e.hasJSActions,
			fieldObjects: e.fieldObjects,
			parent: this,
			elements: null
		};
		for (let e of t) {
			if (e.noHTML) continue;
			let t = e.annotationType === T.POPUP;
			if (t) {
				let t = i.get(e.id);
				if (!t) continue;
				if (!this._commentManager) {
					a.push(e);
					continue;
				}
				o.elements = t;
			} else if (e.rect[2] === e.rect[0] || e.rect[3] === e.rect[1]) continue;
			o.data = e;
			let r = hi.create(o);
			if (!r.isRenderable) continue;
			t || (this.#o.push(r), e.popupRef && i.getOrInsertComputed(e.popupRef, fe).push(r));
			let s = r.render();
			e.hidden && (s.style.visibility = "hidden"), r.updateOC(n), r._isEditable && (this.#r.set(r.data.id, r), this._annotationEditorUIManager?.renderAnnotationElement(r));
		}
		await this.#c();
		for (let e of a) {
			let t = o.elements = i.get(e.id);
			o.data = e;
			let n = hi.create(o);
			if (!n.isRenderable) continue;
			let r = n.render();
			n.contentElement.id = `${v}${e.id}`, e.hidden && (r.style.visibility = "hidden"), t.at(-1).container.after(r);
		}
		this.#l();
	}
	async #c() {
		if (this.#o.length === 0) return;
		this.div.replaceChildren();
		let e = [];
		if (!this.#s) {
			this.#s = !0;
			for (let { contentElement: t, data: { hidden: n, id: r, oc: i } } of this.#o) {
				let a = t.id = `${v}${r}`, o = t.localName === "a" && !n && !i;
				e.push(this.#i?.getAriaAttributes(a, { enableLinkOwnership: o }).then((e) => {
					if (e) for (let [n, r] of e) t.setAttribute(n, r);
				}));
			}
		}
		this.#o.sort(({ data: { rect: [e, t, n, r] } }, { data: { rect: [i, a, o, s] } }) => {
			if (e === n && t === r) return 1;
			if (i === o && a === s) return -1;
			let c = r, l = t, u = (t + r) / 2, d = s, f = a, p = (a + s) / 2;
			return u >= d && p <= l ? -1 : p >= c && u <= f ? 1 : (e + n) / 2 - (i + o) / 2;
		});
		let t = document.createDocumentFragment();
		for (let e of this.#o) t.append(e.container), this._commentManager ? (e.extraPopupElement?.popup || e.popup)?.renderCommentButton() : e.extraPopupElement && t.append(e.extraPopupElement.render());
		if (this.div.append(t), await Promise.all(e), this.#e) {
			let e = await this.#i?.getAnnotationIds();
			for (let { contentElement: t } of this.#o) e?.has(t.id) || this.#e.addPointerInTextLayer(t, !1);
		}
	}
	async addLinkAnnotations(t) {
		let n = {
			data: null,
			layer: this.div,
			linkService: this.#a,
			svgFactory: new di(),
			parent: this
		};
		for (let r of t) {
			r.borderStyle ||= e._defaultBorderStyle, n.data = r;
			let t = hi.create(n);
			t.isRenderable && (t.render(), t.contentElement.id = `${v}${r.id}`, this.#o.push(t));
		}
		await this.#c();
	}
	update({ viewport: e, optionalContentConfig: t }) {
		let n = this.div;
		this.viewport = e, Ie(n, { rotation: e.rotation });
		for (let e of this.#o) e.updateOC(t);
		this.#l(), n.hidden = !1;
	}
	destroy() {
		for (let e of this.#o) e.destroy?.(), this.#e?.removePointerInTextLayer(e.contentElement);
		this.#o.length = 0, this.#r.clear(), this.div.replaceChildren();
	}
	#l() {
		if (!this.#t) return;
		let e = this.div;
		for (let [t, n] of this.#t) {
			let r = e.querySelector(`[data-annotation-id="${t}"]`);
			if (!r) continue;
			if (Array.isArray(n)) for (let e of n) e.className = "annotationContent", e.ariaHidden = !0;
			else n.className = "annotationContent", n.ariaHidden = !0;
			let i = [];
			for (let e of r.children) e.nodeName === "CANVAS" && i.push(e);
			for (let e of i) e.remove();
			let a = Array.isArray(n) ? n[0] : n, { firstChild: o } = r;
			if (o ? o.classList.contains("annotationContent") ? o.after(a) : o.before(a) : r.append(a), Array.isArray(n)) {
				let e = a;
				for (let t = 1, r = n.length; t < r; t++) e.after(n[t]), e = n[t];
			}
			this.#t.delete(t);
			let s = this.#r.get(t);
			s && (s._hasNoCanvas ? (this._annotationEditorUIManager?.setMissingCanvas(t, r.id, n), s._hasNoCanvas = !1) : s.canvas = n);
		}
	}
	refreshCanvases() {
		this.#l();
	}
	getEditableAnnotations() {
		return this.#r.values();
	}
	getEditableAnnotation(e) {
		return this.#r.get(e);
	}
	addFakeAnnotation(e) {
		let { div: t } = this, { id: n, rotation: r } = e, i = new _i({
			data: {
				id: n,
				rect: e.getPDFRect(),
				rotation: r
			},
			editor: e,
			layer: t,
			parent: this,
			enableComment: !!this._commentManager,
			linkService: this.#a,
			annotationStorage: this.#n
		});
		return i.render(), i.contentElement.id = `${v}${n}`, i.createOrUpdatePopup(), this.#o.push(i), i;
	}
	removeAnnotation(e) {
		let t = this.#o.findIndex((t) => t.data.id === e);
		if (t < 0) return;
		let [n] = this.#o.splice(t, 1);
		this.#e?.removePointerInTextLayer(n.contentElement);
	}
	updateFakeAnnotations(e) {
		if (e.length !== 0) {
			for (let t of e) t.updateFakeAnnotationElement(this);
			this.#c();
		}
	}
	togglePointerEvents(e = !1) {
		this.div.classList.toggle("disabled", !e);
	}
	static get _defaultBorderStyle() {
		return H(this, "_defaultBorderStyle", Object.freeze({
			width: 1,
			rawWidth: 1,
			style: E.SOLID,
			dashArray: [3],
			horizontalCornerRadius: 0,
			verticalCornerRadius: 0
		}));
	}
}, Gi = /\r\n?|\n/g, Ki = class e extends Z {
	#e = "";
	#t = `${this.id}-editor`;
	#n = null;
	#r;
	_colorPicker = null;
	static _freeTextDefaultContent = "";
	static _internalPadding = 0;
	static _defaultColor = null;
	static _defaultFontSize = 10;
	static get _keyboardManager() {
		let t = e.prototype, n = (e) => e.isEmpty(), r = ot.TRANSLATE_SMALL, i = ot.TRANSLATE_BIG;
		return H(this, "_keyboardManager", new it([
			[
				[
					"ctrl+s",
					"mac+meta+s",
					"ctrl+p",
					"mac+meta+p"
				],
				t.commitOrRemove,
				{ bubbles: !0 }
			],
			[["ctrl+Enter", "mac+meta+Enter"], t.commitOrRemove],
			[["Escape"], t.commitOrRemove],
			[
				["ArrowLeft"],
				t._translateEmpty,
				{
					args: [-r, 0],
					checker: n
				}
			],
			[
				["ctrl+ArrowLeft", "mac+shift+ArrowLeft"],
				t._translateEmpty,
				{
					args: [-i, 0],
					checker: n
				}
			],
			[
				["ArrowRight"],
				t._translateEmpty,
				{
					args: [r, 0],
					checker: n
				}
			],
			[
				["ctrl+ArrowRight", "mac+shift+ArrowRight"],
				t._translateEmpty,
				{
					args: [i, 0],
					checker: n
				}
			],
			[
				["ArrowUp"],
				t._translateEmpty,
				{
					args: [0, -r],
					checker: n
				}
			],
			[
				["ctrl+ArrowUp", "mac+shift+ArrowUp"],
				t._translateEmpty,
				{
					args: [0, -i],
					checker: n
				}
			],
			[
				["ArrowDown"],
				t._translateEmpty,
				{
					args: [0, r],
					checker: n
				}
			],
			[
				["ctrl+ArrowDown", "mac+shift+ArrowDown"],
				t._translateEmpty,
				{
					args: [0, i],
					checker: n
				}
			]
		]));
	}
	static _type = "freetext";
	static _editorType = b.FREETEXT;
	constructor(t) {
		super({
			...t,
			name: "freeTextEditor"
		}), this.color = t.color || e._defaultColor || Z._defaultLineColor, this.#r = t.fontSize || e._defaultFontSize, this.annotationElementId || this._uiManager.a11yAlert(Z._l10nAlert.freetext), this.canAddComment = !1;
	}
	static initialize(e, t) {
		Z.initialize(e, t);
		let n = getComputedStyle(document.documentElement);
		this._internalPadding = parseFloat(n.getPropertyValue("--freetext-padding"));
	}
	static updateDefaultParams(t, n) {
		switch (t) {
			case x.FREETEXT_SIZE:
				e._defaultFontSize = n;
				break;
			case x.FREETEXT_COLOR: e._defaultColor = n;
		}
	}
	updateParams(e, t) {
		switch (e) {
			case x.FREETEXT_SIZE:
				this.#i(t);
				break;
			case x.FREETEXT_COLOR: this.#a(t);
		}
	}
	static get defaultPropertiesToUpdate() {
		return [[x.FREETEXT_SIZE, e._defaultFontSize], [x.FREETEXT_COLOR, e._defaultColor || Z._defaultLineColor]];
	}
	get propertiesToUpdate() {
		return [[x.FREETEXT_SIZE, this.#r], [x.FREETEXT_COLOR, this.color]];
	}
	get toolbarButtons() {
		return this._colorPicker ||= new oi(this), [["colorPicker", this._colorPicker]];
	}
	get colorType() {
		return x.FREETEXT_COLOR;
	}
	#i(e) {
		let t = (e) => {
			this.editorDiv.style.fontSize = `calc(${e}px * var(--total-scale-factor))`, this.translate(0, -(e - this.#r) * this.parentScale), this.#r = e, this.#s();
		}, n = this.#r;
		this.addCommands({
			cmd: t.bind(this, e),
			undo: t.bind(this, n),
			post: this._uiManager.updateUI.bind(this._uiManager, this),
			mustExec: !0,
			type: x.FREETEXT_SIZE,
			overwriteIfSameType: !0,
			keepUndo: !0
		});
	}
	onUpdatedColor() {
		this.editorDiv.style.color = this.color, this._colorPicker?.update(this.color), super.onUpdatedColor();
	}
	#a(e) {
		let t = (e) => {
			this.color = e, this.onUpdatedColor();
		}, n = this.color;
		this.addCommands({
			cmd: t.bind(this, e),
			undo: t.bind(this, n),
			post: this._uiManager.updateUI.bind(this._uiManager, this),
			mustExec: !0,
			type: x.FREETEXT_COLOR,
			overwriteIfSameType: !0,
			keepUndo: !0
		});
	}
	_translateEmpty(e, t) {
		this._uiManager.translateSelectedEditors(e, t, !0);
	}
	getInitialTranslation() {
		let t = this.parentScale;
		return [-e._internalPadding * t, -(e._internalPadding + this.#r) * t];
	}
	rebuild() {
		this.parent && (super.rebuild(), this.div !== null && (this.isAttachedToDOM || this.parent.add(this)));
	}
	enableEditMode() {
		if (!super.enableEditMode()) return !1;
		this.overlayDiv.classList.remove("enabled"), this.editorDiv.contentEditable = !0, this._isDraggable = !1, this.div.removeAttribute("aria-activedescendant"), this.#n = new AbortController();
		let e = this._uiManager.combinedSignal(this.#n);
		return this.editorDiv.addEventListener("keydown", this.editorDivKeydown.bind(this), { signal: e }), this.editorDiv.addEventListener("focus", this.editorDivFocus.bind(this), { signal: e }), this.editorDiv.addEventListener("blur", this.editorDivBlur.bind(this), { signal: e }), this.editorDiv.addEventListener("input", this.editorDivInput.bind(this), { signal: e }), this.editorDiv.addEventListener("paste", this.editorDivPaste.bind(this), { signal: e }), !0;
	}
	disableEditMode() {
		return super.disableEditMode() ? (this.overlayDiv.classList.add("enabled"), this.editorDiv.contentEditable = !1, this.div.setAttribute("aria-activedescendant", this.#t), this._isDraggable = !0, this.#n?.abort(), this.#n = null, this.div.focus({ preventScroll: !0 }), this.isEditing = !1, this.parent.div.classList.add("freetextEditing"), !0) : !1;
	}
	focusin(e) {
		this._focusEventsAllowed && (super.focusin(e), e.target !== this.editorDiv && this.editorDiv.focus());
	}
	onceAdded(e) {
		this.width || (this.enableEditMode(), e && this.editorDiv.focus(), this._initialOptions?.isCentered && this.center(), this._initialOptions = null);
	}
	isEmpty() {
		return !this.editorDiv || this.editorDiv.innerText.trim() === "";
	}
	remove() {
		this.isEditing = !1, this.parent && (this.parent.setEditingState(!0), this.parent.div.classList.add("freetextEditing")), super.remove();
	}
	#o() {
		let t = [];
		this.editorDiv.normalize();
		let n = null;
		for (let r of this.editorDiv.childNodes) (n?.nodeType !== Node.TEXT_NODE || r.nodeName !== "BR") && (t.push(e.#c(r)), n = r);
		return t.join("\n");
	}
	#s() {
		let [e, t] = this.parentDimensions, n;
		if (this.isAttachedToDOM) n = this.div.getBoundingClientRect();
		else {
			let { currentLayer: e, div: t } = this, r = t.style.display, i = t.classList.contains("hidden");
			t.classList.remove("hidden"), t.style.display = "hidden", e.div.append(this.div), n = t.getBoundingClientRect(), t.remove(), t.style.display = r, t.classList.toggle("hidden", i);
		}
		this.rotation % 180 == this.parentRotation % 180 ? (this.width = n.width / e, this.height = n.height / t) : (this.width = n.height / e, this.height = n.width / t), this.fixAndSetPosition();
	}
	commit() {
		if (!this.isInEditMode()) return;
		super.commit(), this.disableEditMode();
		let e = this.#e, t = this.#e = this.#o().trimEnd();
		if (e === t) return;
		let n = (e) => {
			if (this.#e = e, !e) {
				this.remove();
				return;
			}
			this.#l(), this._uiManager.rebuild(this), this.#s();
		};
		this.addCommands({
			cmd: () => {
				n(t);
			},
			undo: () => {
				n(e);
			},
			mustExec: !1
		}), this.#s();
	}
	shouldGetKeyboardEvents() {
		return this.isInEditMode();
	}
	enterInEditMode() {
		this.enableEditMode(), this.editorDiv.focus();
	}
	keydown(e) {
		e.target === this.div && e.key === "Enter" && (this.enterInEditMode(), e.preventDefault());
	}
	editorDivKeydown(t) {
		e._keyboardManager.exec(this, t);
	}
	editorDivFocus(e) {
		this.isEditing = !0;
	}
	editorDivBlur(e) {
		this.isEditing = !1;
	}
	editorDivInput(e) {
		this.parent.div.classList.toggle("freetextEditing", this.isEmpty());
	}
	disableEditing() {
		this.editorDiv.setAttribute("role", "comment"), this.editorDiv.removeAttribute("aria-multiline");
	}
	enableEditing() {
		this.editorDiv.setAttribute("role", "textbox"), this.editorDiv.setAttribute("aria-multiline", !0);
	}
	get canChangeContent() {
		return !0;
	}
	render() {
		if (this.div) return this.div;
		let e, t;
		(this._isCopy || this.annotationElementId) && (e = this.x, t = this.y), super.render(), this.editorDiv = document.createElement("div"), this.editorDiv.className = "internal", this.editorDiv.setAttribute("id", this.#t), this.editorDiv.setAttribute("data-l10n-id", "pdfjs-free-text2"), this.editorDiv.setAttribute("data-l10n-attrs", "default-content"), this.enableEditing(), this.editorDiv.contentEditable = !0;
		let { style: n } = this.editorDiv;
		if (n.fontSize = `calc(${this.#r}px * var(--total-scale-factor))`, n.color = this.color, this.div.append(this.editorDiv), this.overlayDiv = document.createElement("div"), this.overlayDiv.classList.add("overlay", "enabled"), this.div.append(this.overlayDiv), this._isCopy || this.annotationElementId) {
			let [n, r] = this.parentDimensions;
			if (this.annotationElementId) {
				let { position: i } = this._initialData, [a, o] = this.getInitialTranslation();
				[a, o] = this.pageTranslationToScreen(a, o);
				let [s, c] = this.pageDimensions, [l, u] = this.pageTranslation, d, f;
				switch (this.rotation) {
					case 0:
						d = e + (i[0] - l) / s, f = t + this.height - (i[1] - u) / c;
						break;
					case 90:
						d = e + (i[0] - l) / s, f = t - (i[1] - u) / c, [a, o] = [o, -a];
						break;
					case 180:
						d = e - this.width + (i[0] - l) / s, f = t - (i[1] - u) / c, [a, o] = [-a, -o];
						break;
					case 270: d = e + (i[0] - l - this.height * c) / s, f = t + (i[1] - u - this.width * s) / c, [a, o] = [-o, a];
				}
				this.setAt(d * n, f * r, a, o);
			} else this._moveAfterPaste(e, t);
			this.#l(), this._isDraggable = !0, this.editorDiv.contentEditable = !1;
		} else this._isDraggable = !1, this.editorDiv.contentEditable = !0;
		return this.div;
	}
	static #c(e) {
		return (e.nodeType === Node.TEXT_NODE ? e.nodeValue : e.innerText).replaceAll(Gi, "");
	}
	editorDivPaste(t) {
		let n = t.clipboardData || window.clipboardData, { types: r } = n;
		if (r.length === 1 && r[0] === "text/plain") return;
		t.preventDefault();
		let i = e.#d(n.getData("text") || "").replaceAll(Gi, "\n");
		if (!i) return;
		let a = window.getSelection();
		if (!a.rangeCount) return;
		this.editorDiv.normalize(), a.deleteFromDocument();
		let o = a.getRangeAt(0);
		if (!i.includes("\n")) {
			o.insertNode(document.createTextNode(i)), this.editorDiv.normalize(), a.collapseToStart();
			return;
		}
		let { startContainer: s, startOffset: c } = o, l = [], u = [];
		if (s.nodeType === Node.TEXT_NODE) {
			let t = s.parentElement;
			if (u.push(s.nodeValue.slice(c).replaceAll(Gi, "")), t !== this.editorDiv) {
				let n = l;
				for (let r of this.editorDiv.childNodes) {
					if (r === t) {
						n = u;
						continue;
					}
					n.push(e.#c(r));
				}
			}
			l.push(s.nodeValue.slice(0, c).replaceAll(Gi, ""));
		} else if (s === this.editorDiv) {
			let t = l, n = 0;
			for (let r of this.editorDiv.childNodes) n++ === c && (t = u), t.push(e.#c(r));
		}
		this.#e = `${l.join("\n")}${i}${u.join("\n")}`, this.#l();
		let d = new Range(), f = Math.sumPrecise(l.map((e) => e.length));
		for (let { firstChild: e } of this.editorDiv.childNodes) if (e.nodeType === Node.TEXT_NODE) {
			let t = e.nodeValue.length;
			if (f <= t) {
				d.setStart(e, f), d.setEnd(e, f);
				break;
			}
			f -= t;
		}
		a.removeAllRanges(), a.addRange(d);
	}
	#l() {
		if (this.editorDiv.replaceChildren(), this.#e) for (let e of this.#e.split("\n")) {
			let t = document.createElement("div");
			t.append(e ? document.createTextNode(e) : document.createElement("br")), this.editorDiv.append(t);
		}
	}
	#u() {
		return this.#e.replaceAll("\xA0", " ");
	}
	static #d(e) {
		return e.replaceAll(" ", "\xA0");
	}
	get contentDiv() {
		return this.editorDiv;
	}
	getPDFRect() {
		let t = e._internalPadding * this.parentScale;
		return this.getRect(t, t);
	}
	static async deserialize(t, n, r) {
		let i = null;
		if (t instanceof ki) {
			let { data: { defaultAppearanceData: { fontSize: e, fontColor: n }, rect: r, rotation: a, id: o, popupRef: s, richText: c, contentsObj: l, creationDate: u, modificationDate: d }, textContent: f, textPosition: p, parent: { page: { pageNumber: m } } } = t;
			if (!f?.length) return null;
			i = t = {
				annotationType: b.FREETEXT,
				color: Array.from(n),
				fontSize: e,
				value: f.join("\n"),
				position: p,
				pageIndex: m - 1,
				rect: r.slice(0),
				rotation: a,
				annotationElementId: o,
				id: o,
				deleted: !1,
				popupRef: s,
				comment: l?.str || null,
				richText: c,
				creationDate: u,
				modificationDate: d
			};
		}
		let a = await super.deserialize(t, n, r);
		return a.#r = t.fontSize, a.color = q.makeHexColor(...t.color), a.#e = e.#d(t.value), a._initialData = i, t.comment && a.setCommentData(t), a;
	}
	serialize(e = !1) {
		if (this.isEmpty()) return null;
		if (this.deleted) return this.serializeDeleted();
		let t = Z._colorManager.convert(this.isAttachedToDOM ? getComputedStyle(this.editorDiv).color : this.color), n = Object.assign(super.serialize(e), {
			color: t,
			fontSize: this.#r,
			value: this.#u()
		});
		return this.addComment(n), e ? (n.isCopy = !0, n) : this.annotationElementId && !this.#f(n) ? null : (n.id = this.annotationElementId, n);
	}
	#f(e) {
		let { value: t, fontSize: n, color: r, pageIndex: i } = this._initialData;
		return this.hasEditedComment || this._hasBeenMoved || e.value !== t || e.fontSize !== n || e.color.some((e, t) => e !== r[t]) || e.pageIndex !== i;
	}
	renderAnnotationElement(e) {
		let t = super.renderAnnotationElement(e);
		if (!t) return null;
		let { style: n } = t;
		n.fontSize = `calc(${this.#r}px * var(--total-scale-factor))`, n.color = this.color, t.replaceChildren();
		for (let e of this.#e.split("\n")) {
			let n = document.createElement("div");
			n.append(e ? document.createTextNode(e) : document.createElement("br")), t.append(n);
		}
		return e.updateEdited({
			rect: this.getPDFRect(),
			popup: this._uiManager.hasCommentManager() || this.hasEditedComment ? this.comment : { text: this.#e }
		}), t;
	}
	resetAnnotationElement(e) {
		super.resetAnnotationElement(e), e.resetEdited();
	}
}, qi = class {
	#e = Object.create(null);
	updateProperty(e, t) {
		this[e] = t, this.updateSVGProperty(e, t);
	}
	updateProperties(e) {
		if (e) for (let [t, n] of Object.entries(e)) t.startsWith("_") || this.updateProperty(t, n);
	}
	updateSVGProperty(e, t) {
		this.#e[e] = t;
	}
	toSVGProperties() {
		let e = this.#e;
		return this.#e = Object.create(null), { root: e };
	}
	reset() {
		this.#e = Object.create(null);
	}
	updateAll(e = this) {
		this.updateProperties(e);
	}
	clone() {
		I("Not implemented");
	}
}, Ji = class e extends Z {
	#e = null;
	#t;
	_clipPathId = null;
	_colorPicker = null;
	_drawId = null;
	_drawOutlines = null;
	_focusDrawId = null;
	static _currentDrawId = -1;
	static _currentParent = null;
	static #n = null;
	static #r = null;
	static #i = null;
	static #a = null;
	static _INNER_MARGIN = 3;
	constructor(e) {
		super(e), this.#t = e.mustBeCommitted || !1, this._addOutlines(e);
	}
	onUpdatedColor() {
		this._colorPicker?.update(this.color), super.onUpdatedColor();
	}
	onUpdatedOpacity() {
		this._colorPicker?.updateOpacity?.(this.opacity);
	}
	_addOutlines(e) {
		e.drawOutlines && (this.#o(e), this.#m());
	}
	#o({ drawOutlines: e, drawId: t, drawingOptions: n, clipPathId: r }) {
		this._drawOutlines = e, this._drawingOptions ||= n, this.annotationElementId || this._uiManager.a11yAlert(Z._l10nAlert[this.editorType]), t >= 0 ? (this._drawId = t, this._clipPathId = r ?? null, this.parent.drawLayer.finalizeDraw(t, e.defaultProperties), this.#c(this.parent)) : this._drawId = this.#s(e, this.parent), this.#_(e.box);
	}
	#s(t, n) {
		let { id: r, clipPathId: i } = n.drawLayer.draw(e._mergeSVGProperties(this._drawingOptions.toSVGProperties(), t.defaultSVGProperties), !1, this.constructor._hasClipPath);
		return this.constructor._hasClipPath && (this._clipPathId = i), this.#c(n), r;
	}
	#c(e) {
		let t = this._drawOutlines.getFocusSVGProperties(this.#f);
		t && (this._focusDrawId = e.drawLayer.drawOutline(t, this._drawOutlines.focusMustRemoveSelfIntersections));
	}
	#l(e = this.#f) {
		this._focusDrawId !== null && this.parent?.drawLayer.updateProperties(this._focusDrawId, this._drawOutlines.getFocusSVGProperties(e));
	}
	#u(e) {
		this._focusDrawId !== null && this.parent?.drawLayer.updateProperties(this._focusDrawId, { rootClass: e });
	}
	#d() {
		let { parent: e, _drawId: t, _focusDrawId: n, _isVisible: r } = this;
		if (!e || t === null) return;
		let i = { hidden: !r };
		e.drawLayer.updateProperties(t, { rootClass: i }), n !== null && e.drawLayer.updateProperties(n, { rootClass: i });
	}
	static _mergeSVGProperties(e, t) {
		let n = new Set(Object.keys(e));
		for (let [r, i] of Object.entries(t)) n.has(r) ? Object.assign(e[r], i) : e[r] = i;
		return e;
	}
	static getDefaultDrawingOptions(e) {
		I("Not implemented");
	}
	static get typesMap() {
		I("Not implemented");
	}
	static get isDrawer() {
		return !0;
	}
	static get _hasClipPath() {
		return !1;
	}
	static get _hasDrawClass() {
		return !0;
	}
	static get supportMultipleDrawings() {
		return !1;
	}
	get _drawRotation() {
		return this.rotation;
	}
	get _opacityName() {
		return this.constructor.typesMap.get(this.opacityType);
	}
	get #f() {
		return (this.parentRotation - this._drawRotation + 360) % 360;
	}
	static updateDefaultParams(t, n) {
		let r = this.typesMap.get(t);
		r && this._defaultDrawingOptions.updateProperty(r, n), this._currentParent && (e.#n.updateProperty(r, n), this._currentParent.drawLayer.updateProperties(this._currentDrawId, this._defaultDrawingOptions.toSVGProperties()));
	}
	updateParams(e, t) {
		let n = this.constructor.typesMap.get(e);
		n && this._updateProperty(e, n, t);
	}
	static get defaultPropertiesToUpdate() {
		let e = [], t = this._defaultDrawingOptions;
		for (let [n, r] of this.typesMap) e.push([n, t[r]]);
		return e;
	}
	get propertiesToUpdate() {
		let e = [], { _drawingOptions: t } = this;
		for (let [n, r] of this.constructor.typesMap) e.push([n, t[r]]);
		return e;
	}
	_updateProperty(e, t, n) {
		let r = this._drawingOptions, i = r[t], a = (n) => {
			r.updateProperty(t, n);
			let i = this._drawOutlines.updateProperty(t, n);
			i && this.#_(i), this.parent?.drawLayer.updateProperties(this._drawId, r.toSVGProperties()), e === this.colorType ? this.onUpdatedColor() : e === this.opacityType && this.onUpdatedOpacity();
		};
		this.addCommands({
			cmd: a.bind(this, n),
			undo: a.bind(this, i),
			post: this._uiManager.updateUI.bind(this._uiManager, this),
			mustExec: !0,
			type: e,
			overwriteIfSameType: !0,
			keepUndo: !0
		});
	}
	_updateColorAndOpacity(e, t, n = this.colorAndOpacityType) {
		let r = this.constructor.typesMap.get(this.colorType), i = this._opacityName, a = this._drawingOptions, o = a[r], s = a[i], c = (e, t) => {
			a.updateProperty(r, e), a.updateProperty(i, t), this._drawOutlines.updateProperty(r, e), this._drawOutlines.updateProperty(i, t), this.parent?.drawLayer.updateProperties(this._drawId, a.toSVGProperties()), this.onUpdatedColor(), this.onUpdatedOpacity();
		};
		this.addCommands({
			cmd: c.bind(this, e, t),
			undo: c.bind(this, o, s),
			post: this._uiManager.updateUI.bind(this._uiManager, this),
			mustExec: !0,
			type: n,
			overwriteIfSameType: !0,
			keepUndo: !0
		});
	}
	_onResizing() {
		this.parent?.drawLayer.updateProperties(this._drawId, e._mergeSVGProperties(this._drawOutlines.getPathResizingSVGProperties(this.#g()), { bbox: this.#v() }));
	}
	_onResized() {
		this.parent?.drawLayer.updateProperties(this._drawId, e._mergeSVGProperties(this._drawOutlines.getPathResizedSVGProperties(this.#g()), { bbox: this.#v() })), this.#l();
	}
	_onTranslating(e, t) {
		this.parent?.drawLayer.updateProperties(this._drawId, { bbox: this.#v() });
	}
	_onTranslated() {
		this.parent?.drawLayer.updateProperties(this._drawId, e._mergeSVGProperties(this._drawOutlines.getPathTranslatedSVGProperties(this.#g(), this.parentDimensions), { bbox: this.#v() }));
	}
	_onStartDragging() {
		this.parent?.drawLayer.updateProperties(this._drawId, { rootClass: { moving: !0 } });
	}
	_onStopDragging() {
		this.parent?.drawLayer.updateProperties(this._drawId, { rootClass: { moving: !1 } });
	}
	get _mustBeDisabledOnCommit() {
		return !0;
	}
	commit() {
		super.commit(), this._mustBeDisabledOnCommit && (this.disableEditMode(), this.disableEditing());
	}
	disableEditing() {
		super.disableEditing(), this.div.classList.toggle("disabled", !0);
	}
	enableEditing() {
		super.enableEditing(), this.div.classList.toggle("disabled", !1);
	}
	getBaseTranslation() {
		return [0, 0];
	}
	get isResizable() {
		return !0;
	}
	onceAdded(e) {
		this.annotationElementId || this.parent.addUndoableEditor(this), this._isDraggable = !0, this.#t && (this.#t = !1, this.commit(), this.parent.setSelected(this), e && this.isOnScreen && this.div.focus());
	}
	remove() {
		this._uiManager.removeShouldRescale(this), this.#p(), super.remove();
	}
	rebuild() {
		this.parent && (super.rebuild(), this.div !== null && (this.#m(), this.#_(this._drawOutlines.box), this.isAttachedToDOM || this.parent.add(this)));
	}
	setParent(e) {
		let t = !1;
		this.parent && !e ? (this._uiManager.removeShouldRescale(this), this.#p()) : e && (this._uiManager.addShouldRescale(this), this.#m(e), t = !this.parent && this.div?.classList.contains("selectedEditor")), super.setParent(e), this.#d(), t && this.select();
	}
	#p() {
		if (this._drawId === null || !this.parent) return;
		let { drawLayer: e } = this.parent;
		e.remove(this._drawId), this._drawId = null, this._focusDrawId !== null && (e.remove(this._focusDrawId), this._focusDrawId = null), this._drawingOptions.reset();
	}
	#m(e = this.parent) {
		if (this._drawId === null || this.parent !== e) {
			if (this._drawId !== null) {
				let { drawLayer: t } = this.parent;
				t.updateParent(this._drawId, e.drawLayer), this._focusDrawId !== null && t.updateParent(this._focusDrawId, e.drawLayer);
				return;
			}
			this._drawingOptions.updateAll(), this._drawId = this.#s(this._drawOutlines, e), this._clipPathId && this.#e && (this.#e.style.clipPath = this._clipPathId);
		}
	}
	#h([e, t, n, r]) {
		let { parentDimensions: [i, a], _drawRotation: o } = this;
		switch (o) {
			case 90: return [
				t,
				1 - e,
				a / i * n,
				i / a * r
			];
			case 180: return [
				1 - e,
				1 - t,
				n,
				r
			];
			case 270: return [
				1 - t,
				e,
				a / i * n,
				i / a * r
			];
			default: return [
				e,
				t,
				n,
				r
			];
		}
	}
	#g() {
		let { x: e, y: t, width: n, height: r, parentDimensions: [i, a], _drawRotation: o } = this;
		switch (o) {
			case 90: return [
				1 - t,
				e,
				i / a * n,
				a / i * r
			];
			case 180: return [
				1 - e,
				1 - t,
				n,
				r
			];
			case 270: return [
				t,
				1 - e,
				i / a * n,
				a / i * r
			];
			default: return [
				e,
				t,
				n,
				r
			];
		}
	}
	#_(e) {
		[this.x, this.y, this.width, this.height] = this.#h(e), this.div && (this.fixAndSetPosition(), this.setDims()), this._onResized();
	}
	#v(e = this.parentRotation) {
		let { x: t, y: n, width: r, height: i, _drawRotation: a, parentDimensions: [o, s] } = this;
		switch ((a * 4 + e) / 90) {
			case 1: return [
				1 - n - i,
				t,
				i,
				r
			];
			case 2: return [
				1 - t - r,
				1 - n - i,
				r,
				i
			];
			case 3: return [
				n,
				1 - t - r,
				i,
				r
			];
			case 4: return [
				t,
				n - o / s * r,
				s / o * i,
				o / s * r
			];
			case 5: return [
				1 - n,
				t,
				o / s * r,
				s / o * i
			];
			case 6: return [
				1 - t - s / o * i,
				1 - n,
				s / o * i,
				o / s * r
			];
			case 7: return [
				n - o / s * r,
				1 - t - s / o * i,
				o / s * r,
				s / o * i
			];
			case 8: return [
				t - r,
				n - i,
				r,
				i
			];
			case 9: return [
				1 - n,
				t - r,
				i,
				r
			];
			case 10: return [
				1 - t,
				1 - n,
				r,
				i
			];
			case 11: return [
				n - i,
				1 - t,
				i,
				r
			];
			case 12: return [
				t - s / o * i,
				n,
				s / o * i,
				o / s * r
			];
			case 13: return [
				1 - n - o / s * r,
				t - s / o * i,
				o / s * r,
				s / o * i
			];
			case 14: return [
				1 - t,
				1 - n - o / s * r,
				s / o * i,
				o / s * r
			];
			case 15: return [
				n,
				1 - t,
				o / s * r,
				s / o * i
			];
			default: return [
				t,
				n,
				r,
				i
			];
		}
	}
	rotate(t = this.parentRotation) {
		if (!this.parent || this._drawId === null) return;
		let n = (t - this._drawRotation + 360) % 360;
		this.parent.drawLayer.updateProperties(this._drawId, e._mergeSVGProperties({ bbox: this.#v(t) }, this._drawOutlines.updateRotation(n))), this.#l(n);
	}
	show(e = this._isVisible) {
		super.show(e), this.#d();
	}
	select() {
		super.select(), this.#u({
			hovered: !1,
			selected: !0
		});
	}
	unselect() {
		super.unselect(), this.#u({ selected: !1 });
	}
	pointerover() {
		this.isSelected || this.#u({ hovered: !0 });
	}
	pointerleave() {
		this.isSelected || this.#u({ hovered: !1 });
	}
	onScaleChanging() {
		if (!this.parent) return;
		let e = this._drawOutlines.updateParentDimensions(this.parentDimensions, this.parent.scale);
		e && this.#_(e);
	}
	static onScaleChangingWhenDrawing() {}
	render() {
		if (this.div) return this.div;
		let e, t;
		this._isCopy && (e = this.x, t = this.y);
		let n = super.render();
		this.constructor._hasDrawClass && n.classList.add("draw");
		let r = this.#e = document.createElement("div");
		return n.append(r), r.setAttribute("aria-hidden", "true"), r.className = "internal", this._clipPathId && (r.style.clipPath = this._clipPathId), $e(this, r, ["pointerover", "pointerleave"]), this.setDims(), this._uiManager.addShouldRescale(this), this.disableEditing(), this._isCopy && this._moveAfterPaste(e, t), n;
	}
	static createDrawerInstance(e) {
		I("Not implemented");
	}
	static _getDrawingTarget(e, { target: t }) {
		return t;
	}
	static _getPointerCoords({ offsetX: e, offsetY: t, clientX: n, clientY: r }, i = null) {
		if (!i) return [e, t];
		let a = n - i.clientX, o = r - i.clientY;
		switch (this._currentParent.viewport.rotation) {
			case 90:
				[a, o] = [o, -a];
				break;
			case 180:
				[a, o] = [-a, -o];
				break;
			case 270: [a, o] = [-o, a];
		}
		return [i.offsetX + a, i.offsetY + o];
	}
	static _addDrawingListeners(e, t) {}
	static _endDrawingSession(e = !1) {
		return this._currentParent.endDrawingSession(e);
	}
	static startDrawing(t, n, r, i) {
		let { pointerId: a, pointerType: o } = i;
		if (et.isInitializedAndDifferentPointerType(o)) return;
		let s = this._getDrawingTarget(t, i), [c, l] = this._getPointerCoords(i), { viewport: { rotation: u } } = t, { x: d, y: f, width: p, height: m } = s.getBoundingClientRect(), h = e.#r = new AbortController(), g = t.combinedSignal(h);
		if (et.setPointer(o, a), window.addEventListener("pointerup", (e) => {
			et.isSamePointerIdOrRemove(e.pointerId) && this._endDraw(e);
		}, { signal: g }), window.addEventListener("pointercancel", (e) => {
			et.isSamePointerIdOrRemove(e.pointerId) && this._endDrawingSession();
		}, { signal: g }), window.addEventListener("pointerdown", (t) => {
			et.isSamePointerType(t.pointerType) && (et.initializeAndAddPointerId(t.pointerId), e.#n.isCancellable() && (e.#n.removeLastElement(), e.#n.isEmpty() ? this._endDrawingSession(!0) : this._endDraw(null)));
		}, {
			capture: !0,
			passive: !1,
			signal: g
		}), window.addEventListener("contextmenu", ke, { signal: g }), s.addEventListener("pointermove", this._drawMove.bind(this), { signal: g }), s.addEventListener("touchmove", (e) => {
			et.isSameTimeStamp(e.timeStamp) && Ae(e);
		}, { signal: g }), this._addDrawingListeners(s, g), t.toggleDrawing(), n._editorUndoBar?.hide(), e.#n) {
			t.drawLayer.updateProperties(this._currentDrawId, e.#n.startNew(c, l, p, m, u));
			return;
		}
		n.updateUIForDefaultProperties(this), e.#n = this.createDrawerInstance({
			x: c,
			y: l,
			box: [
				d,
				f,
				p,
				m
			],
			rotation: u,
			parent: t,
			isLTR: r
		}), e.#i = this.getDefaultDrawingOptions(), this._currentParent = t;
		let { id: _, clipPathId: v } = t.drawLayer.draw(this._mergeSVGProperties(e.#i.toSVGProperties(), e.#n.defaultSVGProperties), !0, this._hasClipPath);
		this._currentDrawId = _, e.#a = this._hasClipPath ? v : null;
	}
	static _drawMove(t) {
		if (et.isSameTimeStamp(t.timeStamp), !e.#n || !et.isSamePointerId(t.pointerId)) return;
		if (et.isUsingMultiplePointers()) {
			this._endDraw(t);
			return;
		}
		let n, r = t.getCoalescedEvents?.();
		if (r?.length) {
			let i = [];
			for (let e of r) i.push(...this._getPointerCoords(e, t));
			n = e.#n.addPoints(i);
		} else n = e.#n.add(...this._getPointerCoords(t));
		this._currentParent.drawLayer.updateProperties(this._currentDrawId, n), et.setTimeStamp(t.timeStamp), Ae(t);
	}
	static _cleanup(t) {
		t && (this._currentDrawId = -1, this._currentParent = null, e.#n = null, e.#i = null, e.#a = null, et.clearTimeStamp()), e.#r && (e.#r.abort(), e.#r = null, et.clearPointerIds());
	}
	static _endDraw(t) {
		let n = this._currentParent;
		if (n) {
			if (n.toggleDrawing(!0), this._cleanup(!1), n.drawLayer.updateProperties(this._currentDrawId, t?.target === n.div ? e.#n.end(...this._getPointerCoords(t)) : e.#n.end()), this.supportMultipleDrawings) {
				let t = e.#n, r = this._currentDrawId, i = t.getLastElement();
				n.addCommands({
					cmd: () => {
						n.drawLayer.updateProperties(r, t.setLastElement(i));
					},
					undo: () => {
						n.drawLayer.updateProperties(r, t.removeLastElement());
					},
					mustExec: !1,
					type: x.DRAW_STEP
				});
				return;
			}
			this.endDrawing(!1);
		}
	}
	static endDrawing(t) {
		let n = this._currentParent;
		if (!n) return null;
		if (n.toggleDrawing(!0), n.cleanUndoStack(x.DRAW_STEP), !e.#n.isEmpty()) {
			let { pageDimensions: [r, i], scale: a } = n, o = n.createAndAddNewEditor({
				offsetX: 0,
				offsetY: 0
			}, !1, {
				drawId: this._currentDrawId,
				clipPathId: e.#a,
				drawOutlines: e.#n.getOutlines(r * a, i * a, a, this._INNER_MARGIN),
				drawingOptions: e.#i,
				mustBeCommitted: !t
			});
			return this._cleanup(!0), o;
		}
		return n.drawLayer.remove(this._currentDrawId), this._cleanup(!0), null;
	}
	createDrawingOptions(e) {}
	static deserializeDraw(e, t, n, r, i, a, o) {
		I("Not implemented");
	}
	static async deserialize(e, t, n) {
		let { rawDims: { pageWidth: r, pageHeight: i, pageX: a, pageY: o } } = t.viewport, s = this.deserializeDraw(a, o, r, i, this._INNER_MARGIN, e, n), c = await super.deserialize(e, t, n);
		return c.createDrawingOptions(e), c.#o({ drawOutlines: s }), c.#m(), c.onScaleChanging(), c.rotate(), c;
	}
	serializeDraw(e) {
		let [t, n] = this.pageTranslation, [r, i] = this.pageDimensions;
		return this._drawOutlines.serialize([
			t,
			n,
			r,
			i
		], e);
	}
	renderAnnotationElement(e) {
		return e.updateEdited({ rect: this.getPDFRect() }), null;
	}
	static canCreateNewEmptyEditor() {
		return !1;
	}
}, $ = class {
	static PRECISION = 1e-4;
	focusOutline = null;
	toSVGPath() {
		I("Abstract method `toSVGPath` must be implemented.");
	}
	get box() {
		I("Abstract getter `box` must be implemented.");
	}
	serialize(e, t) {
		I("Abstract method `serialize` must be implemented.");
	}
	get defaultSVGProperties() {
		I("Abstract getter `defaultSVGProperties` must be implemented.");
	}
	get defaultProperties() {
		return this.defaultSVGProperties;
	}
	getFocusSVGProperties(e) {
		return null;
	}
	get focusMustRemoveSelfIntersections() {
		return !1;
	}
	updateProperty(e, t) {
		return null;
	}
	updateParentDimensions(e, t) {
		return null;
	}
	serializeQuadPoints(e, t) {
		return null;
	}
	updateRotation(e) {
		return {};
	}
	getPathResizingSVGProperties(e) {
		return {};
	}
	getPathResizedSVGProperties(e) {
		return {};
	}
	getPathTranslatedSVGProperties(e, t) {
		return {};
	}
	static _rotateBox([e, t, n, r], i) {
		switch (i) {
			case 90: return [
				1 - t - r,
				e,
				r,
				n
			];
			case 180: return [
				1 - e - n,
				1 - t - r,
				n,
				r
			];
			case 270: return [
				t,
				1 - e - n,
				r,
				n
			];
		}
		return [
			e,
			t,
			n,
			r
		];
	}
	static _rescale(e, t, n, r, i, a) {
		a ||= new Float32Array(e.length);
		for (let o = 0, s = e.length; o < s; o += 2) a[o] = t + e[o] * r, a[o + 1] = n + e[o + 1] * i;
		return a;
	}
	static _rescaleAndSwap(e, t, n, r, i, a) {
		a ||= new Float32Array(e.length);
		for (let o = 0, s = e.length; o < s; o += 2) a[o] = t + e[o + 1] * r, a[o + 1] = n + e[o] * i;
		return a;
	}
	static _translate(e, t, n, r) {
		r ||= new Float32Array(e.length);
		for (let i = 0, a = e.length; i < a; i += 2) r[i] = t + e[i], r[i + 1] = n + e[i + 1];
		return r;
	}
	static svgRound(e) {
		return Math.round(e * 1e4);
	}
	static _normalizePoint(e, t, n, r, i) {
		switch (i) {
			case 90: return [1 - t / n, e / r];
			case 180: return [1 - e / n, 1 - t / r];
			case 270: return [t / n, 1 - e / r];
			default: return [e / n, t / r];
		}
	}
	static createBezierPoints(e, t, n, r, i, a) {
		return [
			(e + 5 * n) / 6,
			(t + 5 * r) / 6,
			(5 * n + i) / 6,
			(5 * r + a) / 6,
			(n + i) / 2,
			(r + a) / 2
		];
	}
}, Yi = class e {
	#e;
	#t = [];
	#n;
	#r;
	#i = [];
	#a = /* @__PURE__ */ new Float32Array(18);
	#o;
	#s;
	#c;
	#l;
	#u;
	#d;
	#f = [];
	static #p = 8;
	static #m = 2;
	static #h = e.#p + e.#m;
	constructor(t, n, r, i, a, o, s = 0) {
		this.#e = r, this.#d = a * i, this.#r = o, this.#a.set([
			NaN,
			NaN,
			NaN,
			NaN,
			t,
			n
		], 6), this.#n = s, this.#l = e.#p * i, this.#c = e.#h * i, this.#u = i, this.#f.push(t, n);
	}
	isEmpty() {
		return isNaN(this.#a[8]);
	}
	isCancellable() {
		return this.#f.length <= 10;
	}
	removeLastElement() {
		return this.#a.fill(NaN), this.#i.length = this.#t.length = this.#f.length = 0, { path: { d: "" } };
	}
	#g() {
		let e = this.#a.subarray(4, 6), t = this.#a.subarray(16, 18), [n, r, i, a] = this.#e;
		return [
			(this.#o + (e[0] - t[0]) / 2 - n) / i,
			(this.#s + (e[1] - t[1]) / 2 - r) / a,
			(this.#o + (t[0] - e[0]) / 2 - n) / i,
			(this.#s + (t[1] - e[1]) / 2 - r) / a
		];
	}
	add(e, t) {
		this.#o = e, this.#s = t;
		let [n, r, i, a] = this.#e, [o, s, c, l] = this.#a.subarray(8, 12), u = e - c, d = t - l, f = Math.hypot(u, d);
		if (f < this.#c) return !1;
		let p = f - this.#l, m = p / f, h = m * u, g = m * d, _ = o, v = s;
		o = c, s = l, c += h, l += g, this.#f?.push(e, t);
		let y = -g / p, b = h / p, x = y * this.#d, S = b * this.#d;
		return this.#a.set(this.#a.subarray(2, 8), 0), this.#a.set([c + x, l + S], 4), this.#a.set(this.#a.subarray(14, 18), 12), this.#a.set([c - x, l - S], 16), isNaN(this.#a[6]) ? (this.#i.length === 0 && (this.#a.set([o + x, s + S], 2), this.#i.push(NaN, NaN, NaN, NaN, (o + x - n) / i, (s + S - r) / a), this.#a.set([o - x, s - S], 14), this.#t.push(NaN, NaN, NaN, NaN, (o - x - n) / i, (s - S - r) / a)), this.#a.set([
			_,
			v,
			o,
			s,
			c,
			l
		], 6), !this.isEmpty()) : (this.#a.set([
			_,
			v,
			o,
			s,
			c,
			l
		], 6), Math.abs(Math.atan2(v - s, _ - o) - Math.atan2(g, h)) < Math.PI / 2 ? ([o, s, c, l] = this.#a.subarray(2, 6), this.#i.push(NaN, NaN, NaN, NaN, ((o + c) / 2 - n) / i, ((s + l) / 2 - r) / a), [o, s, _, v] = this.#a.subarray(14, 18), this.#t.push(NaN, NaN, NaN, NaN, ((_ + o) / 2 - n) / i, ((v + s) / 2 - r) / a), !0) : ([_, v, o, s, c, l] = this.#a.subarray(0, 6), this.#i.push(((_ + 5 * o) / 6 - n) / i, ((v + 5 * s) / 6 - r) / a, ((5 * o + c) / 6 - n) / i, ((5 * s + l) / 6 - r) / a, ((o + c) / 2 - n) / i, ((s + l) / 2 - r) / a), [c, l, o, s, _, v] = this.#a.subarray(12, 18), this.#t.push(((_ + 5 * o) / 6 - n) / i, ((v + 5 * s) / 6 - r) / a, ((5 * o + c) / 6 - n) / i, ((5 * s + l) / 6 - r) / a, ((o + c) / 2 - n) / i, ((s + l) / 2 - r) / a), !0));
	}
	toSVGPath() {
		if (this.isEmpty()) return "";
		let e = this.#i, t = this.#t;
		if (isNaN(this.#a[6]) && !this.isEmpty()) return this.#_();
		let n = [];
		n.push(`M${e[4]} ${e[5]}`);
		for (let t = 6; t < e.length; t += 6) isNaN(e[t]) ? n.push(`L${e[t + 4]} ${e[t + 5]}`) : n.push(`C${e[t]} ${e[t + 1]} ${e[t + 2]} ${e[t + 3]} ${e[t + 4]} ${e[t + 5]}`);
		this.#y(n);
		for (let e = t.length - 6; e >= 6; e -= 6) isNaN(t[e]) ? n.push(`L${t[e + 4]} ${t[e + 5]}`) : n.push(`C${t[e]} ${t[e + 1]} ${t[e + 2]} ${t[e + 3]} ${t[e + 4]} ${t[e + 5]}`);
		return this.#v(n), n.join(" ");
	}
	#_() {
		let [e, t, n, r] = this.#e, [i, a, o, s] = this.#g();
		return `M${(this.#a[2] - e) / n} ${(this.#a[3] - t) / r} L${(this.#a[4] - e) / n} ${(this.#a[5] - t) / r} L${i} ${a} L${o} ${s} L${(this.#a[16] - e) / n} ${(this.#a[17] - t) / r} L${(this.#a[14] - e) / n} ${(this.#a[15] - t) / r} Z`;
	}
	#v(e) {
		let t = this.#t;
		e.push(`L${t[4]} ${t[5]} Z`);
	}
	#y(e) {
		let [t, n, r, i] = this.#e, a = this.#a.subarray(4, 6), o = this.#a.subarray(16, 18), [s, c, l, u] = this.#g();
		e.push(`L${(a[0] - t) / r} ${(a[1] - n) / i} L${s} ${c} L${l} ${u} L${(o[0] - t) / r} ${(o[1] - n) / i}`);
	}
	newFreeDrawOutline(e, t, n, r, i, a) {
		return new Xi(e, t, n, r, i, a);
	}
	getOutlines() {
		let e = this.#i, t = this.#t, n = this.#a, [r, i, a, o] = this.#e, s = new Float32Array((this.#f?.length ?? 0) + 2);
		for (let e = 0, t = s.length - 2; e < t; e += 2) s[e] = (this.#f[e] - r) / a, s[e + 1] = (this.#f[e + 1] - i) / o;
		if (s[s.length - 2] = (this.#o - r) / a, s[s.length - 1] = (this.#s - i) / o, isNaN(n[6]) && !this.isEmpty()) return this.#b(s);
		let c = new Float32Array(this.#i.length + 24 + this.#t.length), l = e.length;
		for (let t = 0; t < l; t += 2) {
			if (isNaN(e[t])) {
				c[t] = c[t + 1] = NaN;
				continue;
			}
			c[t] = e[t], c[t + 1] = e[t + 1];
		}
		l = this.#S(c, l);
		for (let e = t.length - 6; e >= 6; e -= 6) for (let n = 0; n < 6; n += 2) {
			if (isNaN(t[e + n])) {
				c[l] = c[l + 1] = NaN, l += 2;
				continue;
			}
			c[l] = t[e + n], c[l + 1] = t[e + n + 1], l += 2;
		}
		return this.#x(c, l), this.newFreeDrawOutline(c, s, this.#e, this.#u, this.#n, this.#r);
	}
	#b(e) {
		let t = this.#a, [n, r, i, a] = this.#e, [o, s, c, l] = this.#g(), u = /* @__PURE__ */ new Float32Array(36);
		return u.set([
			NaN,
			NaN,
			NaN,
			NaN,
			(t[2] - n) / i,
			(t[3] - r) / a,
			NaN,
			NaN,
			NaN,
			NaN,
			(t[4] - n) / i,
			(t[5] - r) / a,
			NaN,
			NaN,
			NaN,
			NaN,
			o,
			s,
			NaN,
			NaN,
			NaN,
			NaN,
			c,
			l,
			NaN,
			NaN,
			NaN,
			NaN,
			(t[16] - n) / i,
			(t[17] - r) / a,
			NaN,
			NaN,
			NaN,
			NaN,
			(t[14] - n) / i,
			(t[15] - r) / a
		], 0), this.newFreeDrawOutline(u, e, this.#e, this.#u, this.#n, this.#r);
	}
	#x(e, t) {
		let n = this.#t;
		return e.set([
			NaN,
			NaN,
			NaN,
			NaN,
			n[4],
			n[5]
		], t), t += 6;
	}
	#S(e, t) {
		let n = this.#a.subarray(4, 6), r = this.#a.subarray(16, 18), [i, a, o, s] = this.#e, [c, l, u, d] = this.#g();
		return e.set([
			NaN,
			NaN,
			NaN,
			NaN,
			(n[0] - i) / o,
			(n[1] - a) / s,
			NaN,
			NaN,
			NaN,
			NaN,
			c,
			l,
			NaN,
			NaN,
			NaN,
			NaN,
			u,
			d,
			NaN,
			NaN,
			NaN,
			NaN,
			(r[0] - i) / o,
			(r[1] - a) / s
		], t), t += 24;
	}
}, Xi = class extends $ {
	#e;
	#t = /* @__PURE__ */ new Float32Array(4);
	#n;
	#r;
	#i;
	#a;
	#o;
	constructor(e, t, n, r, i, a) {
		super(), this.#o = e, this.#i = t, this.#e = n, this.#a = r, this.#n = i, this.#r = a, this.firstPoint = [NaN, NaN], this.lastPoint = [NaN, NaN], this.#s(a);
		let [o, s, c, l] = this.#t;
		for (let t = 0, n = e.length; t < n; t += 2) e[t] = (e[t] - o) / c, e[t + 1] = (e[t + 1] - s) / l;
		for (let e = 0, n = t.length; e < n; e += 2) t[e] = (t[e] - o) / c, t[e + 1] = (t[e + 1] - s) / l;
	}
	toSVGPath() {
		let e = [`M${this.#o[4]} ${this.#o[5]}`];
		for (let t = 6, n = this.#o.length; t < n; t += 6) {
			if (isNaN(this.#o[t])) {
				e.push(`L${this.#o[t + 4]} ${this.#o[t + 5]}`);
				continue;
			}
			e.push(`C${this.#o[t]} ${this.#o[t + 1]} ${this.#o[t + 2]} ${this.#o[t + 3]} ${this.#o[t + 4]} ${this.#o[t + 5]}`);
		}
		return e.push("Z"), e.join(" ");
	}
	serialize([e, t, n, r], i) {
		let a = n - e, o = r - t, s, c;
		switch (i) {
			case 0:
				s = $._rescale(this.#o, e, r, a, -o), c = $._rescale(this.#i, e, r, a, -o);
				break;
			case 90:
				s = $._rescaleAndSwap(this.#o, e, t, a, o), c = $._rescaleAndSwap(this.#i, e, t, a, o);
				break;
			case 180:
				s = $._rescale(this.#o, n, t, -a, o), c = $._rescale(this.#i, n, t, -a, o);
				break;
			case 270: s = $._rescaleAndSwap(this.#o, n, r, -a, -o), c = $._rescaleAndSwap(this.#i, n, r, -a, -o);
		}
		return {
			outline: Array.from(s),
			points: [Array.from(c)]
		};
	}
	#s(e) {
		let t = this.#o, n = t[4], r = t[5], i = [
			n,
			r,
			n,
			r
		], a = n, o = r, s = n, c = r, l = e ? Math.max : Math.min, u = /* @__PURE__ */ new Float32Array(4);
		for (let e = 6, d = t.length; e < d; e += 6) {
			let d = t[e + 4], p = t[e + 5];
			isNaN(t[e]) ? (q.pointBoundingBox(d, p, i), o > p ? (a = d, o = p) : o === p && (a = l(a, d)), c < p ? (s = d, c = p) : c === p && (s = l(s, d))) : (u.set(f, 0), q.bezierBoundingBox(n, r, ...t.slice(e, e + 6), u), q.rectBoundingBox(...u, i), o > u[1] ? (a = u[0], o = u[1]) : o === u[1] && (a = l(a, u[0])), c < u[3] ? (s = u[2], c = u[3]) : c === u[3] && (s = l(s, u[2]))), n = d, r = p;
		}
		let d = this.#t;
		d[0] = i[0] - this.#n, d[1] = i[1] - this.#n, d[2] = i[2] - i[0] + 2 * this.#n, d[3] = i[3] - i[1] + 2 * this.#n, this.firstPoint = [a, o], this.lastPoint = [s, c];
	}
	get box() {
		return this.#t;
	}
	newOutliner(e, t, n, r, i, a, o = 0) {
		return new Yi(e, t, n, r, i, a, o);
	}
	updateThickness(e) {
		let t = this.getNewOutline(e);
		return this.#o = t.#o, this.#i = t.#i, this.#t.set(t.#t), this.firstPoint = t.firstPoint, this.lastPoint = t.lastPoint, this.#t;
	}
	getNewOutline(e, t) {
		let [n, r, i, a] = this.#t, [o, s, c, l] = this.#e, u = i * c, d = a * l, f = n * c + o, p = r * l + s, m = this.#i, h = this.newOutliner(m[0] * u + f, m[1] * d + p, this.#e, this.#a, e, this.#r, t ?? this.#n);
		for (let e = 2, t = m.length; e < t; e += 2) h.add(m[e] * u + f, m[e + 1] * d + p);
		return h.getOutlines();
	}
};
function Zi(e) {
	return {
		bbox: e.box,
		root: { viewBox: "0 0 1 1" },
		rootClass: {
			highlight: !0,
			free: e.isFree
		},
		path: { d: e.toSVGPath() }
	};
}
function Qi(e, t) {
	let { focusOutline: n } = e;
	return {
		bbox: $._rotateBox(n.box, t),
		root: { "data-main-rotation": t },
		rootClass: {
			highlightOutline: !0,
			free: e.isFree
		},
		path: { d: n.toSVGPath() }
	};
}
var $i = class {
	#e;
	#t;
	#n;
	#r = [];
	#i = [];
	constructor(e, t = 0, n = 0, r = !0) {
		let i = f.slice(), a = 10 ** -4;
		for (let { x: n, y: r, width: o, height: s } of e) {
			let e = Math.floor((n - t) / a) * a, c = Math.ceil((n + o + t) / a) * a, l = Math.floor((r - t) / a) * a, u = Math.ceil((r + s + t) / a) * a, d = [
				e,
				l,
				u,
				!0
			], f = [
				c,
				l,
				u,
				!1
			];
			this.#r.push(d, f), q.rectBoundingBox(e, l, c, u, i);
		}
		let o = i[2] - i[0] + 2 * n, s = i[3] - i[1] + 2 * n, c = i[0] - n, l = i[1] - n, u = r ? -Infinity : Infinity, d = Infinity, p = this.#r.at(r ? -1 : -2), m = [p[0], p[2]];
		for (let e of this.#r) {
			let [t, n, i, a] = e;
			!a && r ? n < d ? (d = n, u = t) : n === d && (u = Math.max(u, t)) : a && !r && (n < d ? (d = n, u = t) : n === d && (u = Math.min(u, t))), e[0] = (t - c) / o, e[1] = (n - l) / s, e[2] = (i - l) / s;
		}
		this.#e = new Float32Array([
			c,
			l,
			o,
			s
		]), this.#t = [u, d], this.#n = m;
	}
	getOutlines() {
		this.#r.sort((e, t) => e[0] - t[0] || e[1] - t[1] || e[2] - t[2]);
		let e = [];
		for (let t of this.#r) t[3] ? (e.push(...this.#l(t)), this.#s(t)) : (this.#c(t), e.push(...this.#l(t)));
		return this.#a(e);
	}
	#a(e) {
		let t = [], n = /* @__PURE__ */ new Set();
		for (let n of e) {
			let [e, r, i] = n;
			t.push([
				e,
				r,
				n
			], [
				e,
				i,
				n
			]);
		}
		t.sort((e, t) => e[1] - t[1] || e[0] - t[0]);
		for (let e = 0, r = t.length; e < r; e += 2) {
			let r = t[e][2], i = t[e + 1][2];
			r.push(i), i.push(r), n.add(r), n.add(i);
		}
		let r = [];
		for (; n.size > 0;) {
			let e = n.values().next().value, [t, i, a, o, s] = e;
			n.delete(e);
			let c = t, l = i, u = [t, a];
			for (r.push(u);;) {
				let e;
				if (n.has(o)) e = o;
				else if (n.has(s)) e = s;
				else break;
				n.delete(e), [t, i, a, o, s] = e, c !== t && (u.push(c, l, t, l === i ? i : a), c = t), l = l === i ? a : i;
			}
			u.push(c, l);
		}
		return new ea(r, this.#e, this.#t, this.#n);
	}
	#o(e) {
		let t = this.#i, n = 0, r = t.length - 1;
		for (; n <= r;) {
			let i = n + r >> 1, a = t[i][0];
			if (a === e) return i;
			a < e ? n = i + 1 : r = i - 1;
		}
		return r + 1;
	}
	#s([, e, t]) {
		let n = this.#o(e);
		this.#i.splice(n, 0, [e, t]);
	}
	#c([, e, t]) {
		let n = this.#o(e);
		for (let r = n; r < this.#i.length; r++) {
			let [n, i] = this.#i[r];
			if (n !== e) break;
			if (n === e && i === t) {
				this.#i.splice(r, 1);
				return;
			}
		}
		for (let r = n - 1; r >= 0; r--) {
			let [n, i] = this.#i[r];
			if (n !== e) break;
			if (n === e && i === t) {
				this.#i.splice(r, 1);
				return;
			}
		}
	}
	#l(e) {
		let [t, n, r] = e, i = [[
			t,
			n,
			r
		]], a = this.#o(r);
		for (let e = 0; e < a; e++) {
			let [n, r] = this.#i[e];
			for (let e = 0, a = i.length; e < a; e++) {
				let [, o, s] = i[e];
				if (!(r <= o || s <= n)) {
					if (o >= n) {
						if (s > r) i[e][1] = r;
						else {
							if (a === 1) return [];
							i.splice(e, 1), e--, a--;
						}
						continue;
					}
					i[e][2] = n, s > r && i.push([
						t,
						r,
						s
					]);
				}
			}
		}
		return i;
	}
}, ea = class extends $ {
	#e;
	#t = null;
	#n;
	constructor(e, t, n, r) {
		super(), this.#n = e, this.#e = t, this.firstPoint = n, this.lastPoint = r;
	}
	static build(e, t) {
		let n = new $i(e, .001).getOutlines();
		return n.#t = e, n.focusOutline = new $i(e, .0025, .001, t).getOutlines(), n;
	}
	get isFree() {
		return !1;
	}
	get defaultSVGProperties() {
		return Zi(this);
	}
	getFocusSVGProperties(e) {
		return Qi(this, e);
	}
	updateRotation(e) {
		return { root: { "data-main-rotation": e } };
	}
	serializeQuadPoints([e, t], [n, r]) {
		let i = this.#t, a = new Float32Array(i.length * 8), o = 0;
		for (let { x: s, y: c, width: l, height: u } of i) {
			let i = s * n + e, d = (1 - c) * r + t;
			a[o] = a[o + 4] = i, a[o + 1] = a[o + 3] = d, a[o + 2] = a[o + 6] = i + l * n, a[o + 5] = a[o + 7] = d - u * r, o += 8;
		}
		return a;
	}
	toSVGPath() {
		let e = [];
		for (let t of this.#n) {
			let [n, r] = t;
			e.push(`M${n} ${r}`);
			for (let i = 2; i < t.length; i += 2) {
				let a = t[i], o = t[i + 1];
				a === n ? (e.push(`V${o}`), r = o) : o === r && (e.push(`H${a}`), n = a);
			}
			e.push("Z");
		}
		return e.join(" ");
	}
	serialize([e, t, n, r], i) {
		let a = [], o = n - e, s = r - t;
		for (let t of this.#n) {
			let n = Array(t.length);
			for (let i = 0; i < t.length; i += 2) n[i] = e + t[i] * o, n[i + 1] = r - t[i + 1] * s;
			a.push(n);
		}
		return a;
	}
	get box() {
		return this.#e;
	}
}, ta = class extends Yi {
	newFreeDrawOutline(e, t, n, r, i, a) {
		return new ra(e, t, n, r, i, a);
	}
}, na = class {
	#e;
	#t;
	constructor(e, t, n, r, i, a, o) {
		this.#e = new ta(e, t, n, r, i, a, o), this.#t = i;
	}
	add(e, t) {
		return this.#e.add(e, t) ? { path: { d: this.#e.toSVGPath() } } : null;
	}
	addPoints(e) {
		let t = !1;
		for (let n = 0, r = e.length; n < r; n += 2) t = this.#e.add(e[n], e[n + 1]) || t;
		return t ? { path: { d: this.#e.toSVGPath() } } : null;
	}
	end(e, t) {
		return e === void 0 ? null : this.add(e, t);
	}
	isEmpty() {
		return this.#e.isEmpty();
	}
	isCancellable() {
		return this.#e.isCancellable();
	}
	removeLastElement() {
		return this.#e.removeLastElement();
	}
	updateProperty(e, t) {
		return null;
	}
	getOutlines() {
		let e = this.#e.getOutlines();
		return e.buildFocusOutline(2 * this.#t), e;
	}
	get defaultSVGProperties() {
		return {
			bbox: [
				0,
				0,
				1,
				1
			],
			root: { viewBox: "0 0 1 1" },
			rootClass: {
				highlight: !0,
				free: !0
			},
			path: { d: this.#e.toSVGPath() }
		};
	}
}, ra = class e extends Xi {
	static #e = 1.5;
	newOutliner(e, t, n, r, i, a, o = 0) {
		return new ta(e, t, n, r, i, a, o);
	}
	get isFree() {
		return !0;
	}
	buildFocusOutline(t) {
		this.focusOutline = this.getNewOutline(t / 2 + e.#e, .0025);
	}
	get defaultSVGProperties() {
		return Zi(this);
	}
	getFocusSVGProperties(e) {
		return Qi(this, e);
	}
	get focusMustRemoveSelfIntersections() {
		return !0;
	}
	updateRotation(e) {
		return { root: { "data-main-rotation": e } };
	}
	updateProperty(e, t) {
		if (e !== "thickness") return null;
		let n = this.updateThickness(t / 2);
		return this.buildFocusOutline(t), n;
	}
	getPathResizedSVGProperties() {
		return { path: { d: this.toSVGPath() } };
	}
}, ia = class e extends qi {
	constructor(e = null) {
		super(), super.updateProperties(e);
	}
	updateSVGProperty(e, t) {
		e !== "thickness" && super.updateSVGProperty(e, t);
	}
	clone() {
		let t = new e();
		return t.updateAll(this), t;
	}
}, aa = class e extends Ji {
	#e = null;
	#t = 0;
	#n = null;
	#r = 0;
	#i = "";
	#a = "";
	static _DEFAULT_OPACITY = 1;
	static _DEFAULT_THICKNESS = 12;
	static _defaultDrawingOptions = null;
	static _type = "highlight";
	static _editorType = b.HIGHLIGHT;
	static get _keyboardManager() {
		let t = e.prototype;
		return H(this, "_keyboardManager", new it([
			[
				["ArrowLeft"],
				t._moveCaret,
				{ args: [0] }
			],
			[
				["ArrowRight"],
				t._moveCaret,
				{ args: [1] }
			],
			[
				["ArrowUp"],
				t._moveCaret,
				{ args: [2] }
			],
			[
				["ArrowDown"],
				t._moveCaret,
				{ args: [3] }
			]
		]));
	}
	constructor(e) {
		super({
			...e,
			name: "highlightEditor"
		}), this.#e = e.anchorNode || null, this.#t = e.anchorOffset || 0, this.#n = e.focusNode || null, this.#r = e.focusOffset || 0, this.#i = e.methodOfCreation || (this._drawOutlines?.isFree ? "main_toolbar" : ""), this.#a = e.text || "", this._isDraggable = !1, this.defaultL10nId = "pdfjs-editor-highlight-editor", this.rotate();
	}
	static initialize(t, n) {
		Z.initialize(t, n), this._defaultDrawingOptions ||= new ia({
			fill: n.highlightColors?.values().next().value || "#fff066",
			"fill-opacity": e._DEFAULT_OPACITY,
			thickness: e._DEFAULT_THICKNESS
		});
	}
	static getDefaultDrawingOptions(e) {
		let t = this._defaultDrawingOptions.clone();
		return t.updateProperties(e), t;
	}
	static get typesMap() {
		return H(this, "typesMap", /* @__PURE__ */ new Map([[x.HIGHLIGHT_COLOR, "fill"], [x.HIGHLIGHT_THICKNESS, "thickness"]]));
	}
	static get isDrawer() {
		return !1;
	}
	static get _hasClipPath() {
		return !0;
	}
	static get _hasDrawClass() {
		return !1;
	}
	_addOutlines(t) {
		let { boxes: n, drawOutlines: r } = t;
		(n || r) && (this._drawingOptions ||= t.drawingOptions || e.getDefaultDrawingOptions(), n && (t = {
			...t,
			drawOutlines: ea.build(n, this._uiManager.direction === "ltr")
		}), super._addOutlines(t));
	}
	get colorType() {
		return x.HIGHLIGHT_COLOR;
	}
	get color() {
		return this._drawingOptions.fill;
	}
	get opacity() {
		return this._drawingOptions["fill-opacity"];
	}
	get _opacityName() {
		return "fill-opacity";
	}
	get _drawRotation() {
		return this._drawOutlines?.isFree ? this.rotation : 0;
	}
	get isResizable() {
		return !1;
	}
	get _mustBeDisabledOnCommit() {
		return !1;
	}
	get _mustFixPosition() {
		return !this._drawOutlines?.isFree;
	}
	get telemetryInitialData() {
		return {
			action: "added",
			type: this._drawOutlines.isFree ? "free_highlight" : "highlight",
			color: this._uiManager.getNonHCMColorName(this.color),
			thickness: this._drawingOptions.thickness,
			methodOfCreation: this.#i
		};
	}
	get telemetryFinalData() {
		return {
			type: "highlight",
			color: this._uiManager.getNonHCMColorName(this.color)
		};
	}
	static computeTelemetryFinalData(e) {
		return { numberOfColors: e.get("color").size };
	}
	translateInPage(e, t) {}
	get toolbarPosition() {
		return this.#o(this._drawOutlines.focusOutline.lastPoint);
	}
	get commentButtonPosition() {
		return this.#o(this._drawOutlines.firstPoint);
	}
	#o([e, t]) {
		let [n, r, i, a] = this._drawOutlines.box;
		return [(e - n) / i, (t - r) / a];
	}
	updateParams(t, n) {
		switch (t) {
			case x.HIGHLIGHT_COLOR:
				this._updateColorAndOpacity(n, e._DEFAULT_OPACITY, t), this._reportTelemetry({
					action: "color_changed",
					color: this._uiManager.getNonHCMColorName(n)
				}, !0);
				break;
			case x.HIGHLIGHT_THICKNESS: super.updateParams(t, n), this._reportTelemetry({
				action: "thickness_changed",
				thickness: n
			}, !0);
		}
	}
	get propertiesToUpdate() {
		let e = super.propertiesToUpdate;
		return e.push([x.HIGHLIGHT_FREE, this._drawOutlines.isFree]), e;
	}
	get toolbarButtons() {
		return this._uiManager.highlightColors ? (this._colorPicker = new ai({ editor: this }), [["colorPicker", this._colorPicker]]) : super.toolbarButtons;
	}
	fixAndSetPosition() {
		return super.fixAndSetPosition(this._drawRotation);
	}
	getRect(e, t) {
		return super.getRect(e, t, this._drawRotation);
	}
	onceAdded(e) {
		this.annotationElementId || this.parent.addUndoableEditor(this), e && this.div.focus();
	}
	remove() {
		this._reportTelemetry({ action: "deleted" }), super.remove();
	}
	render() {
		if (this.div) return this.div;
		let e = super.render();
		return this.#a && (e.setAttribute("aria-label", this.#a), e.setAttribute("role", "mark")), this._drawOutlines.isFree ? e.classList.add("free") : e.addEventListener("keydown", this.#s.bind(this), { signal: this._uiManager._signal }), this.enableEditing(), e;
	}
	#s(t) {
		e._keyboardManager.exec(this, t);
	}
	_moveCaret(e) {
		switch (this.parent.unselect(this), e) {
			case 0:
			case 2:
				this.#c(!0);
				break;
			case 1:
			case 3: this.#c(!1);
		}
	}
	#c(e) {
		if (!this.#e) return;
		let t = window.getSelection();
		e ? t.setPosition(this.#e, this.#t) : t.setPosition(this.#n, this.#r);
	}
	unselect() {
		super.unselect(), this._drawOutlines.isFree || this.#c(!1);
	}
	static createDrawerInstance({ x: e, y: t, box: n, parent: r, isLTR: i }) {
		return new na(e, t, n, r.scale, this._defaultDrawingOptions.thickness / 2, i, .001);
	}
	static _getDrawingTarget(e, { target: t }) {
		return t.closest(".textLayer");
	}
	static _getPointerCoords({ x: e, y: t }) {
		return [e, t];
	}
	static _addDrawingListeners(e, t) {
		e.classList.add("free"), t.addEventListener("abort", () => e.classList.remove("free"), { once: !0 }), window.addEventListener("blur", () => this._endDraw(null), { signal: t }), window.addEventListener("pointerdown", Ae, {
			capture: !0,
			passive: !1,
			signal: t
		});
	}
	static _endDrawingSession(e = !1) {
		return this.endDrawing(e);
	}
	createDrawingOptions({ color: t, opacity: n, thickness: r }) {
		let { _defaultDrawingOptions: i, _DEFAULT_OPACITY: a } = e;
		this._drawingOptions = e.getDefaultDrawingOptions({
			fill: q.makeHexColor(...t),
			"fill-opacity": n || a,
			thickness: r || i.thickness
		});
	}
	static deserializeDraw(e, t, n, r, i, a, o) {
		let { quadPoints: s } = a;
		if (s) {
			let i = [];
			for (let a = 0, o = s.length; a < o; a += 8) i.push({
				x: (s[a] - e) / n,
				y: 1 - (s[a + 1] - t) / r,
				width: (s[a + 2] - s[a]) / n,
				height: (s[a + 1] - s[a + 5]) / r
			});
			return ea.build(i, o.direction === "ltr");
		}
		let c = a.thickness || this._defaultDrawingOptions.thickness, l = (a.inkLists || a.outlines.points)[0], u = new ta(l[0] - e, r - (l[1] - t), [
			0,
			0,
			n,
			r
		], 1, c / 2, !0, .001);
		for (let n = 0, i = l.length; n < i; n += 2) u.add(l[n] - e, r - (l[n + 1] - t));
		let d = u.getOutlines();
		return d.buildFocusOutline(c), d;
	}
	static async deserialize(e, t, n) {
		let r = null;
		if (e instanceof Li) {
			let { data: { quadPoints: t, rect: n, rotation: i, id: a, color: o, opacity: s, popupRef: c, richText: l, contentsObj: u, creationDate: d, modificationDate: f }, parent: { page: { pageNumber: p } } } = e;
			r = e = {
				annotationType: b.HIGHLIGHT,
				color: Array.from(o),
				opacity: s,
				quadPoints: t,
				pageIndex: p - 1,
				rect: n.slice(0),
				rotation: i,
				annotationElementId: a,
				id: a,
				deleted: !1,
				popupRef: c,
				richText: l,
				comment: u?.str || null,
				creationDate: d,
				modificationDate: f
			};
		} else if (e instanceof Ii) {
			let { data: { inkLists: t, rect: n, rotation: i, id: a, color: o, borderStyle: { rawWidth: s }, popupRef: c, richText: l, contentsObj: u, creationDate: d, modificationDate: f }, parent: { page: { pageNumber: p } } } = e;
			r = e = {
				annotationType: b.HIGHLIGHT,
				color: Array.from(o),
				thickness: s,
				inkLists: t,
				pageIndex: p - 1,
				rect: n.slice(0),
				rotation: i,
				annotationElementId: a,
				id: a,
				deleted: !1,
				popupRef: c,
				richText: l,
				comment: u?.str || null,
				creationDate: d,
				modificationDate: f
			};
		}
		let i = await super.deserialize(e, t, n);
		return i._initialData = r, e.comment && i.setCommentData(e), i;
	}
	serialize(e = !1) {
		if (this.isEmpty() || e) return null;
		if (this.deleted) return this.serializeDeleted();
		let t = super.serialize(e);
		return Object.assign(t, {
			color: Z._colorManager.convert(this._uiManager.getNonHCMColor(this.color)),
			opacity: this.opacity,
			thickness: this._drawingOptions.thickness,
			quadPoints: this._drawOutlines.serializeQuadPoints(this.pageTranslation, this.pageDimensions),
			outlines: this._drawOutlines.serialize(t.rect, this._drawRotation)
		}), this.addComment(t), this.annotationElementId && !this.#l(t) ? null : (t.id = this.annotationElementId, t);
	}
	#l(e) {
		let { color: t } = this._initialData;
		return this.hasEditedComment || e.color.some((e, n) => e !== t[n]);
	}
	renderAnnotationElement(e) {
		return this.deleted ? (e.hide(), null) : (e.updateEdited({
			rect: this.getPDFRect(),
			popup: this.comment
		}), null);
	}
}, oa = class {
	#e = /* @__PURE__ */ new Float64Array(6);
	#t = /* @__PURE__ */ new Float64Array(2);
	#n;
	#r;
	#i;
	#a;
	#o;
	#s = "";
	#c = 0;
	#l = new sa();
	#u;
	#d;
	constructor(e, t, n, r, i, a) {
		this.#u = n, this.#d = r, this.#i = i, this.#a = a, [e, t] = this.#f(e, t);
		let o = this.#n = [
			NaN,
			NaN,
			NaN,
			NaN,
			e,
			t
		];
		this.#o = [e, t], this.#r = [{
			line: o,
			points: this.#o
		}], this.#e.set(o, 0), this.#t.set([e, t], 0);
	}
	updateProperty(e, t) {
		e === "stroke-width" && (this.#a = t);
	}
	#f(e, t) {
		return $._normalizePoint(e, t, this.#u, this.#d, this.#i);
	}
	isEmpty() {
		return !this.#r?.length;
	}
	isCancellable() {
		return this.#o.length <= 10;
	}
	add(e, t) {
		return this.#p(e, t) && this.toSVGPath(), { path: { d: this.#m() } };
	}
	addPoints(e) {
		let t = !1;
		for (let n = 0, r = e.length; n < r; n += 2) this.#p(e[n], e[n + 1]) && (t = !0, this.#o.length <= 6 && (this.toSVGPath(), t = !1));
		return t && this.toSVGPath(), { path: { d: this.#m() } };
	}
	#p(e, t) {
		[e, t] = this.#f(e, t), this.#t.set([e, t], 0);
		let [n, r, i, a] = this.#e.subarray(2, 6), o = e - i, s = t - a;
		return Math.hypot(this.#u * o, this.#d * s) <= 2 ? !1 : (this.#o.push(e, t), isNaN(n) ? (this.#e.set([
			i,
			a,
			e,
			t
		], 2), this.#n.push(NaN, NaN, NaN, NaN, e, t), !0) : (isNaN(this.#e[0]) && this.#n.splice(6, 6), this.#e.set([
			n,
			r,
			i,
			a,
			e,
			t
		], 0), this.#n.push(...$.createBezierPoints(n, r, i, a, e, t)), !0));
	}
	end(e, t) {
		return e !== void 0 && this.#p(e, t) || this.#o.length === 2 ? { path: { d: this.toSVGPath() } } : { path: { d: this.#s } };
	}
	startNew(e, t, n, r, i) {
		this.#u = n, this.#d = r, this.#i = i, [e, t] = this.#f(e, t);
		let a = this.#n = [
			NaN,
			NaN,
			NaN,
			NaN,
			e,
			t
		];
		this.#o = [e, t], this.#t.set([e, t], 0);
		let o = this.#r.at(-1);
		return o && (o.line = new Float32Array(o.line), o.points = new Float32Array(o.points)), this.#r.push({
			line: a,
			points: this.#o
		}), this.#e.set(a, 0), this.#c = 0, this.toSVGPath(), null;
	}
	getLastElement() {
		return this.#r.at(-1);
	}
	setLastElement(e) {
		return this.#r ? (this.#r.push(e), this.#n = e.line, this.#o = e.points, this.#c = 0, { path: { d: this.toSVGPath() } }) : this.#l.setLastElement(e);
	}
	removeLastElement() {
		if (!this.#r) return this.#l.removeLastElement();
		this.#r.pop(), this.#s = "";
		for (let e = 0, t = this.#r.length; e < t; e++) {
			let { line: t, points: n } = this.#r[e];
			this.#n = t, this.#o = n, this.#c = 0, this.toSVGPath();
		}
		return { path: { d: this.#s } };
	}
	#m() {
		let e = $.svgRound(this.#t[0]), t = $.svgRound(this.#t[1]);
		if (this.#o.length === 2) {
			let n = $.svgRound(this.#n[4]), r = $.svgRound(this.#n[5]);
			return `${this.#s} M ${n} ${r} L ${e} ${t}`;
		}
		return `${this.#s} L ${e} ${t}`;
	}
	toSVGPath() {
		let e = $.svgRound(this.#n[4]), t = $.svgRound(this.#n[5]);
		if (this.#o.length === 2) return this.#s = `${this.#s} M ${e} ${t} Z`, this.#s;
		if (this.#o.length <= 6) {
			let n = this.#s.lastIndexOf("M");
			this.#s = `${this.#s.slice(0, n)} M ${e} ${t}`, this.#c = 6;
		}
		if (this.#o.length === 4) {
			let e = $.svgRound(this.#n[10]), t = $.svgRound(this.#n[11]);
			return this.#s = `${this.#s} L ${e} ${t}`, this.#c = 12, this.#s;
		}
		let n = [];
		this.#c === 0 && (n.push(`M ${e} ${t}`), this.#c = 6);
		for (let e = this.#c, t = this.#n.length; e < t; e += 6) {
			let [t, r, i, a, o, s] = this.#n.slice(e, e + 6).map($.svgRound);
			n.push(`C${t} ${r} ${i} ${a} ${o} ${s}`);
		}
		return this.#s += n.join(" "), this.#c = this.#n.length, this.#s;
	}
	getOutlines(e, t, n, r) {
		let i = this.#r.at(-1);
		return i.line = new Float32Array(i.line), i.points = new Float32Array(i.points), this.#l.build(this.#r, e, t, n, this.#i, this.#a, r), this.#e = null, this.#n = null, this.#r = null, this.#s = null, this.#l;
	}
	get defaultSVGProperties() {
		return {
			root: { viewBox: "0 0 10000 10000" },
			rootClass: { draw: !0 },
			bbox: [
				0,
				0,
				1,
				1
			]
		};
	}
}, sa = class extends $ {
	#e;
	#t = 0;
	#n;
	#r;
	#i;
	#a;
	#o;
	#s;
	#c;
	build(e, t, n, r, i, a, o) {
		this.#i = t, this.#a = n, this.#o = r, this.#s = i, this.#c = a, this.#n = o ?? 0, this.#r = e, this.#d();
	}
	get thickness() {
		return this.#c;
	}
	setLastElement(e) {
		return this.#r.push(e), { path: { d: this.toSVGPath() } };
	}
	removeLastElement() {
		return this.#r.pop(), { path: { d: this.toSVGPath() } };
	}
	toSVGPath() {
		let e = [];
		for (let { line: t } of this.#r) {
			if (e.push(`M${$.svgRound(t[4])} ${$.svgRound(t[5])}`), t.length === 6) {
				e.push("Z");
				continue;
			}
			if (t.length === 12 && isNaN(t[6])) {
				e.push(`L${$.svgRound(t[10])} ${$.svgRound(t[11])}`);
				continue;
			}
			for (let n = 6, r = t.length; n < r; n += 6) {
				let [r, i, a, o, s, c] = t.subarray(n, n + 6).map($.svgRound);
				e.push(`C${r} ${i} ${a} ${o} ${s} ${c}`);
			}
		}
		return e.join("");
	}
	serialize([e, t, n, r], i) {
		let a = [], o = [], [s, c, l, u] = this.#u(), d, f, p, m, h, g, _, v, y;
		switch (this.#s) {
			case 0:
				y = $._rescale, d = e, f = t + r, p = n, m = -r, h = e + s * n, g = t + (1 - c - u) * r, _ = e + (s + l) * n, v = t + (1 - c) * r;
				break;
			case 90:
				y = $._rescaleAndSwap, d = e, f = t, p = n, m = r, h = e + c * n, g = t + s * r, _ = e + (c + u) * n, v = t + (s + l) * r;
				break;
			case 180:
				y = $._rescale, d = e + n, f = t, p = -n, m = r, h = e + (1 - s - l) * n, g = t + c * r, _ = e + (1 - s) * n, v = t + (c + u) * r;
				break;
			case 270: y = $._rescaleAndSwap, d = e + n, f = t + r, p = -n, m = -r, h = e + (1 - c - u) * n, g = t + (1 - s - l) * r, _ = e + (1 - c) * n, v = t + (1 - s) * r;
		}
		for (let { line: e, points: t } of this.#r) a.push(y(e, d, f, p, m, i ? Array(e.length) : null)), o.push(y(t, d, f, p, m, i ? Array(t.length) : null));
		return {
			lines: a,
			points: o,
			rect: [
				h,
				g,
				_,
				v
			]
		};
	}
	static deserialize(e, t, n, r, i, { paths: { lines: a, points: o }, rotation: s, thickness: c }) {
		let l = [], u, d, f, p, m;
		switch (s) {
			case 0:
				m = $._rescale, u = -e / n, d = t / r + 1, f = 1 / n, p = -1 / r;
				break;
			case 90:
				m = $._rescaleAndSwap, u = -t / r, d = -e / n, f = 1 / r, p = 1 / n;
				break;
			case 180:
				m = $._rescale, u = e / n + 1, d = -t / r, f = -1 / n, p = 1 / r;
				break;
			case 270: m = $._rescaleAndSwap, u = t / r + 1, d = e / n + 1, f = -1 / r, p = -1 / n;
		}
		if (!a) {
			a = [];
			for (let e of o) {
				let t = e.length;
				if (t === 2) {
					a.push(new Float32Array([
						NaN,
						NaN,
						NaN,
						NaN,
						e[0],
						e[1]
					]));
					continue;
				}
				if (t === 4) {
					a.push(new Float32Array([
						NaN,
						NaN,
						NaN,
						NaN,
						e[0],
						e[1],
						NaN,
						NaN,
						NaN,
						NaN,
						e[2],
						e[3]
					]));
					continue;
				}
				let n = new Float32Array(3 * (t - 2));
				a.push(n);
				let [r, i, o, s] = e.subarray(0, 4);
				n.set([
					NaN,
					NaN,
					NaN,
					NaN,
					r,
					i
				], 0);
				for (let a = 4; a < t; a += 2) {
					let t = e[a], c = e[a + 1];
					n.set($.createBezierPoints(r, i, o, s, t, c), (a - 2) * 3), [r, i, o, s] = [
						o,
						s,
						t,
						c
					];
				}
			}
		}
		for (let e = 0, t = a.length; e < t; e++) l.push({
			line: m(a[e].map((e) => e ?? NaN), u, d, f, p),
			points: m(o[e].map((e) => e ?? NaN), u, d, f, p)
		});
		let h = new this.prototype.constructor();
		return h.build(l, n, r, 1, s, c, i), h;
	}
	#l(e = this.#c) {
		let t = this.#n + e / 2 * this.#o;
		return this.#s % 180 == 0 ? [t / this.#i, t / this.#a] : [t / this.#a, t / this.#i];
	}
	#u() {
		let [e, t, n, r] = this.#e, [i, a] = this.#l(0);
		return [
			e + i,
			t + a,
			n - 2 * i,
			r - 2 * a
		];
	}
	#d() {
		let e = this.#e = p.slice();
		for (let { line: t } of this.#r) {
			if (t.length <= 12) {
				for (let n = 4, r = t.length; n < r; n += 6) q.pointBoundingBox(t[n], t[n + 1], e);
				continue;
			}
			let n = t[4], r = t[5];
			for (let i = 6, a = t.length; i < a; i += 6) {
				let [a, o, s, c, l, u] = t.subarray(i, i + 6);
				q.bezierBoundingBox(n, r, a, o, s, c, l, u, e), n = l, r = u;
			}
		}
		let [t, n] = this.#l();
		e[0] = Y(e[0] - t, 0, 1), e[1] = Y(e[1] - n, 0, 1), e[2] = Y(e[2] + t, 0, 1), e[3] = Y(e[3] + n, 0, 1), e[2] -= e[0], e[3] -= e[1];
	}
	get box() {
		return this.#e;
	}
	updateProperty(e, t) {
		return e === "stroke-width" ? this.#f(t) : null;
	}
	#f(e) {
		let [t, n] = this.#l();
		this.#c = e;
		let [r, i] = this.#l(), [a, o] = [r - t, i - n], s = this.#e;
		return s[0] -= a, s[1] -= o, s[2] += 2 * a, s[3] += 2 * o, s;
	}
	updateParentDimensions([e, t], n) {
		let [r, i] = this.#l();
		this.#i = e, this.#a = t, this.#o = n;
		let [a, o] = this.#l(), s = a - r, c = o - i, l = this.#e;
		return l[0] -= s, l[1] -= c, l[2] += 2 * s, l[3] += 2 * c, l;
	}
	updateRotation(e) {
		return this.#t = e, { path: { transform: this.rotationTransform } };
	}
	get viewBox() {
		return this.#e.map($.svgRound).join(" ");
	}
	get defaultProperties() {
		let [e, t] = this.#e;
		return {
			root: { viewBox: this.viewBox },
			path: { "transform-origin": `${$.svgRound(e)} ${$.svgRound(t)}` }
		};
	}
	get rotationTransform() {
		let [, , e, t] = this.#e, n = 0, r = 0, i = 0, a = 0, o = 0, s = 0;
		switch (this.#t) {
			case 90:
				r = t / e, i = -e / t, o = e;
				break;
			case 180:
				n = -1, a = -1, o = e, s = t;
				break;
			case 270:
				r = -t / e, i = e / t, s = t;
				break;
			default: return "";
		}
		return `matrix(${n} ${r} ${i} ${a} ${$.svgRound(o)} ${$.svgRound(s)})`;
	}
	getPathResizingSVGProperties([e, t, n, r]) {
		let [i, a] = this.#l(), [o, s, c, l] = this.#e;
		if (Math.abs(c - i) <= $.PRECISION || Math.abs(l - a) <= $.PRECISION) {
			let i = e + n / 2 - (o + c / 2), a = t + r / 2 - (s + l / 2);
			return { path: {
				"transform-origin": `${$.svgRound(e)} ${$.svgRound(t)}`,
				transform: `${this.rotationTransform} translate(${i} ${a})`
			} };
		}
		let u = (n - 2 * i) / (c - 2 * i), d = (r - 2 * a) / (l - 2 * a), f = c / n, p = l / r;
		return { path: {
			"transform-origin": `${$.svgRound(o)} ${$.svgRound(s)}`,
			transform: `${this.rotationTransform} scale(${f} ${p}) translate(${$.svgRound(i)} ${$.svgRound(a)}) scale(${u} ${d}) translate(${$.svgRound(-i)} ${$.svgRound(-a)})`
		} };
	}
	getPathResizedSVGProperties([e, t, n, r]) {
		let [i, a] = this.#l(), o = this.#e, [s, c, l, u] = o;
		if (o[0] = e, o[1] = t, o[2] = n, o[3] = r, Math.abs(l - i) <= $.PRECISION || Math.abs(u - a) <= $.PRECISION) {
			let i = e + n / 2 - (s + l / 2), a = t + r / 2 - (c + u / 2);
			for (let { line: e, points: t } of this.#r) $._translate(e, i, a, e), $._translate(t, i, a, t);
			return {
				root: { viewBox: this.viewBox },
				path: {
					"transform-origin": `${$.svgRound(e)} ${$.svgRound(t)}`,
					transform: this.rotationTransform || null,
					d: this.toSVGPath()
				}
			};
		}
		let d = (n - 2 * i) / (l - 2 * i), f = (r - 2 * a) / (u - 2 * a), p = -d * (s + i) + e + i, m = -f * (c + a) + t + a;
		if (d !== 1 || f !== 1 || p !== 0 || m !== 0) for (let { line: e, points: t } of this.#r) $._rescale(e, p, m, d, f, e), $._rescale(t, p, m, d, f, t);
		return {
			root: { viewBox: this.viewBox },
			path: {
				"transform-origin": `${$.svgRound(e)} ${$.svgRound(t)}`,
				transform: this.rotationTransform || null,
				d: this.toSVGPath()
			}
		};
	}
	getPathTranslatedSVGProperties([e, t], n) {
		let [r, i] = n, a = this.#e, o = e - a[0], s = t - a[1];
		if (this.#i === r && this.#a === i) for (let { line: e, points: t } of this.#r) $._translate(e, o, s, e), $._translate(t, o, s, t);
		else {
			let e = this.#i / r, t = this.#a / i;
			this.#i = r, this.#a = i;
			for (let { line: n, points: r } of this.#r) $._rescale(n, o, s, e, t, n), $._rescale(r, o, s, e, t, r);
			a[2] *= e, a[3] *= t;
		}
		return a[0] = e, a[1] = t, {
			root: { viewBox: this.viewBox },
			path: {
				d: this.toSVGPath(),
				"transform-origin": `${$.svgRound(e)} ${$.svgRound(t)}`
			}
		};
	}
	get defaultSVGProperties() {
		let e = this.#e;
		return {
			root: { viewBox: this.viewBox },
			rootClass: { draw: !0 },
			path: {
				d: this.toSVGPath(),
				"transform-origin": `${$.svgRound(e[0])} ${$.svgRound(e[1])}`,
				transform: this.rotationTransform || null
			},
			bbox: e
		};
	}
}, ca = class e extends qi {
	constructor(e) {
		super(), this._viewParameters = e, super.updateProperties({
			fill: "none",
			stroke: Z._defaultLineColor,
			"stroke-opacity": 1,
			"stroke-width": 1,
			"stroke-linecap": "round",
			"stroke-linejoin": "round",
			"stroke-miterlimit": 10
		});
	}
	updateSVGProperty(e, t) {
		e === "stroke-width" && (t ??= this["stroke-width"], t *= this._viewParameters.realScale), super.updateSVGProperty(e, t);
	}
	clone() {
		let t = new e(this._viewParameters);
		return t.updateAll(this), t;
	}
}, la = class e extends Ji {
	static _type = "ink";
	static _editorType = b.INK;
	static _defaultDrawingOptions = null;
	constructor(e) {
		super({
			...e,
			name: "inkEditor"
		}), this._willKeepAspectRatio = !0, this.defaultL10nId = "pdfjs-editor-ink-editor";
	}
	static initialize(e, t) {
		Z.initialize(e, t), this._defaultDrawingOptions = new ca(t.viewParameters);
	}
	static getDefaultDrawingOptions(e) {
		let t = this._defaultDrawingOptions.clone();
		return t.updateProperties(e), t;
	}
	static get supportMultipleDrawings() {
		return !0;
	}
	static get typesMap() {
		return H(this, "typesMap", /* @__PURE__ */ new Map([
			[x.INK_THICKNESS, "stroke-width"],
			[x.INK_COLOR, "stroke"],
			[x.INK_OPACITY, "stroke-opacity"]
		]));
	}
	static createDrawerInstance({ x: e, y: t, box: [, , n, r], rotation: i }) {
		return new oa(e, t, n, r, i, this._defaultDrawingOptions["stroke-width"]);
	}
	static deserializeDraw(e, t, n, r, i, a) {
		return sa.deserialize(e, t, n, r, i, a);
	}
	static async deserialize(e, t, n) {
		let r = null;
		if (e instanceof Ii) {
			let { data: { inkLists: t, rect: n, rotation: i, id: a, color: o, opacity: s, borderStyle: { rawWidth: c }, popupRef: l, richText: u, contentsObj: d, creationDate: f, modificationDate: p }, parent: { page: { pageNumber: m } } } = e;
			r = e = {
				annotationType: b.INK,
				color: Array.from(o),
				thickness: c,
				opacity: s,
				paths: { points: t },
				boxes: null,
				pageIndex: m - 1,
				rect: n.slice(0),
				rotation: i,
				annotationElementId: a,
				id: a,
				deleted: !1,
				popupRef: l,
				richText: u,
				comment: d?.str || null,
				creationDate: f,
				modificationDate: p
			};
		}
		let i = await super.deserialize(e, t, n);
		return i._initialData = r, e.comment && i.setCommentData(e), i;
	}
	get toolbarButtons() {
		return this._colorPicker ||= new oi(this), [["colorPicker", this._colorPicker]];
	}
	get colorType() {
		return x.INK_COLOR;
	}
	get colorAndOpacityType() {
		return x.INK_COLOR_AND_OPACITY;
	}
	get opacityType() {
		return x.INK_OPACITY;
	}
	updateParams(e, t) {
		if (e === x.INK_COLOR_AND_OPACITY) {
			this._updateColorAndOpacity(t.color, t.opacity);
			return;
		}
		super.updateParams(e, t);
	}
	static updateDefaultParams(e, t) {
		if (e === x.INK_COLOR_AND_OPACITY) {
			super.updateDefaultParams(x.INK_COLOR, t.color), super.updateDefaultParams(x.INK_OPACITY, t.opacity);
			return;
		}
		super.updateDefaultParams(e, t);
	}
	get color() {
		return this._drawingOptions.stroke;
	}
	get opacity() {
		return this._drawingOptions["stroke-opacity"];
	}
	onScaleChanging() {
		if (!this.parent) return;
		super.onScaleChanging();
		let { _drawId: e, _drawingOptions: t, parent: n } = this;
		t.updateSVGProperty("stroke-width"), n.drawLayer.updateProperties(e, t.toSVGProperties());
	}
	static onScaleChangingWhenDrawing() {
		let e = this._currentParent;
		e && (super.onScaleChangingWhenDrawing(), this._defaultDrawingOptions.updateSVGProperty("stroke-width"), e.drawLayer.updateProperties(this._currentDrawId, this._defaultDrawingOptions.toSVGProperties()));
	}
	createDrawingOptions({ color: t, thickness: n, opacity: r }) {
		this._drawingOptions = e.getDefaultDrawingOptions({
			stroke: q.makeHexColor(...t),
			"stroke-width": n,
			"stroke-opacity": r
		});
	}
	serialize(e = !1) {
		if (this.isEmpty()) return null;
		if (this.deleted) return this.serializeDeleted();
		let { lines: t, points: n } = this.serializeDraw(e), { _drawingOptions: { stroke: r, "stroke-opacity": i, "stroke-width": a } } = this, o = Object.assign(super.serialize(e), {
			color: Z._colorManager.convert(r),
			opacity: i,
			thickness: a,
			paths: {
				lines: t,
				points: n
			}
		});
		return this.addComment(o), e ? (o.isCopy = !0, o) : this.annotationElementId && !this.#e(o) ? null : (o.id = this.annotationElementId, o);
	}
	#e(e) {
		let { color: t, thickness: n, opacity: r, pageIndex: i } = this._initialData;
		return this.hasEditedComment || this._hasBeenMoved || this._hasBeenResized || e.color.some((e, n) => e !== t[n]) || e.thickness !== n || e.opacity !== r || e.pageIndex !== i;
	}
	renderAnnotationElement(e) {
		if (this.deleted) return e.hide(), null;
		let { points: t, rect: n } = this.serializeDraw(!1);
		return e.updateEdited({
			rect: n,
			thickness: this._drawingOptions["stroke-width"],
			points: t,
			popup: this.comment
		}), null;
	}
}, ua = class extends sa {
	toSVGPath() {
		let e = super.toSVGPath();
		return e.endsWith("Z") || (e += "Z"), e;
	}
}, da = 8, fa = 3, pa = class {
	static #e = {
		maxDim: 512,
		sigmaSFactor: .02,
		sigmaR: 25,
		kernelSize: 16
	};
	static #t(e, t, n, r) {
		return n -= e, r -= t, n === 0 ? r > 0 ? 0 : 4 : n === 1 ? r + 6 : 2 - r;
	}
	static #n = new Int32Array([
		0,
		1,
		-1,
		1,
		-1,
		0,
		-1,
		-1,
		0,
		-1,
		1,
		-1,
		1,
		0,
		1,
		1
	]);
	static #r(e, t, n, r, i, a, o) {
		let s = this.#t(n, r, i, a);
		for (let i = 0; i < 8; i++) {
			let a = (-i + s - o + 16) % 8, c = this.#n[2 * a], l = this.#n[2 * a + 1];
			if (e[(n + c) * t + (r + l)] !== 0) return a;
		}
		return -1;
	}
	static #i(e, t, n, r, i, a, o) {
		let s = this.#t(n, r, i, a);
		for (let i = 0; i < 8; i++) {
			let a = (i + s + o + 16) % 8, c = this.#n[2 * a], l = this.#n[2 * a + 1];
			if (e[(n + c) * t + (r + l)] !== 0) return a;
		}
		return -1;
	}
	static #a(e, t, n, r) {
		let i = e.length, a = new Int32Array(i);
		for (let t = 0; t < i; t++) a[t] = +(e[t] <= r);
		for (let e = 1; e < n - 1; e++) a[e * t] = a[e * t + t - 1] = 0;
		for (let e = 0; e < t; e++) a[e] = a[t * n - 1 - e] = 0;
		let o = 1, s, c = [];
		for (let e = 1; e < n - 1; e++) {
			s = 1;
			for (let n = 1; n < t - 1; n++) {
				let r = e * t + n, i = a[r];
				if (i === 0) continue;
				let l = e, u = n;
				if (i === 1 && a[r - 1] === 0) o += 1, --u;
				else if (i >= 1 && a[r + 1] === 0) o += 1, u += 1, i > 1 && (s = i);
				else {
					i !== 1 && (s = Math.abs(i));
					continue;
				}
				let d = [n, e], f = u === n + 1, p = {
					isHole: f,
					points: d,
					id: o,
					parent: 0
				};
				c.push(p);
				let m;
				for (let e of c) if (e.id === s) {
					m = e;
					break;
				}
				p.parent = m ? m.isHole ? f ? m.parent : s : f ? s : m.parent : f ? s : 0;
				let h = this.#r(a, t, e, n, l, u, 0);
				if (h === -1) {
					a[r] = -o, a[r] !== 1 && (s = Math.abs(a[r]));
					continue;
				}
				let g = this.#n[2 * h], _ = this.#n[2 * h + 1], v = e + g, y = n + _;
				l = v, u = y;
				let b = e, x = n;
				for (;;) {
					let i = this.#i(a, t, b, x, l, u, 1);
					g = this.#n[2 * i], _ = this.#n[2 * i + 1];
					let c = b + g, f = x + _;
					d.push(f, c);
					let p = b * t + x;
					if (a[p + 1] === 0 ? a[p] = -o : a[p] === 1 && (a[p] = o), c === e && f === n && b === v && x === y) {
						a[r] !== 1 && (s = Math.abs(a[r]));
						break;
					}
					l = b, u = x, b = c, x = f;
				}
			}
		}
		return c;
	}
	static #o(e, t, n, r) {
		if (n - t <= 4) {
			for (let i = t; i < n - 2; i += 2) r.push(e[i], e[i + 1]);
			return;
		}
		let i = e[t], a = e[t + 1], o = e[n - 4] - i, s = e[n - 3] - a, c = Math.hypot(o, s), l = o / c, u = s / c, d = l * a - u * i, f = s / o, p = 1 / c, m = Math.atan(f), h = Math.cos(m), g = Math.sin(m), _ = p * (Math.abs(h) + Math.abs(g)), v = p * (1 - _ + _ ** 2), y = Math.max(Math.atan(Math.abs(g + h) * v), Math.atan(Math.abs(g - h) * v)), b = 0, x = t;
		for (let r = t + 2; r < n - 2; r += 2) {
			let t = Math.abs(d - l * e[r + 1] + u * e[r]);
			t > b && (x = r, b = t);
		}
		b > (c * y) ** 2 ? (this.#o(e, t, x + 2, r), this.#o(e, x, n, r)) : r.push(i, a);
	}
	static #s(e) {
		let t = [], n = e.length;
		return this.#o(e, 0, n, t), t.push(e[n - 2], e[n - 1]), t.length <= 4 ? null : t;
	}
	static #c(e, t, n, r, i, a) {
		let o = new Float32Array(a ** 2), s = -2 * r ** 2, c = a >> 1;
		for (let e = 0; e < a; e++) {
			let t = (e - c) ** 2;
			for (let n = 0; n < a; n++) o[e * a + n] = Math.exp((t + (n - c) ** 2) / s);
		}
		let l = /* @__PURE__ */ new Float32Array(256), u = -2 * i ** 2;
		for (let e = 0; e < 256; e++) l[e] = Math.exp(e ** 2 / u);
		let d = e.length, f = new Uint8Array(d), p = /* @__PURE__ */ new Uint32Array(256);
		for (let r = 0; r < n; r++) for (let i = 0; i < t; i++) {
			let s = r * t + i, u = e[s], d = 0, m = 0;
			for (let s = 0; s < a; s++) {
				let f = r + s - c;
				if (!(f < 0 || f >= n)) for (let n = 0; n < a; n++) {
					let r = i + n - c;
					if (r < 0 || r >= t) continue;
					let p = e[f * t + r], h = o[s * a + n] * l[Math.abs(p - u)];
					d += p * h, m += h;
				}
			}
			let h = f[s] = Math.round(d / m);
			p[h]++;
		}
		return [f, p];
	}
	static #l(e) {
		let t = /* @__PURE__ */ new Uint32Array(256);
		for (let n of e) t[n]++;
		return t;
	}
	static #u(e) {
		let t = e.length, n = new Uint8ClampedArray(t >> 2), r = -Infinity, i = Infinity;
		for (let t = 0, a = n.length; t < a; t++) {
			let a = n[t] = e[t << 2];
			r = Math.max(r, a), i = Math.min(i, a);
		}
		let a = 255 / (r - i);
		for (let e = 0, t = n.length; e < t; e++) n[e] = (n[e] - i) * a;
		return n;
	}
	static #d(e) {
		let t, n = -Infinity, r = -Infinity, i = e.findIndex((e) => e !== 0), a = i, o = i;
		for (t = i; t < 256; t++) {
			let i = e[t];
			i > n && (t - a > r && (r = t - a, o = t - 1), n = i, a = t);
		}
		for (t = o - 1; t >= 0 && !(e[t] > e[t + 1]); t--);
		return t;
	}
	static #f(e) {
		let t = e, { width: n, height: r } = e, { maxDim: i } = this.#e, a = n, o = r;
		if (n > i || r > i) {
			let s = n, c = r, l = Math.log2(Math.max(n, r) / i), u = Math.floor(l);
			l = l === u ? u - 1 : u;
			for (let n = 0; n < l; n++) {
				a = Math.ceil(s / 2), o = Math.ceil(c / 2);
				let n = new OffscreenCanvas(a, o);
				n.getContext("2d").drawImage(e, 0, 0, s, c, 0, 0, a, o), s = a, c = o, e !== t && e.close(), e = n.transferToImageBitmap();
			}
			let d = Math.min(i / a, i / o);
			a = Math.round(a * d), o = Math.round(o * d);
		}
		let s = new OffscreenCanvas(a, o).getContext("2d", { willReadFrequently: !0 });
		s.fillStyle = "white", s.fillRect(0, 0, a, o), s.filter = "grayscale(1)", s.drawImage(e, 0, 0, e.width, e.height, 0, 0, a, o);
		let c = s.getImageData(0, 0, a, o).data;
		return [
			this.#u(c),
			a,
			o
		];
	}
	static extractContoursFromText(e, { fontFamily: t, fontStyle: n, fontWeight: r }, i, a, o, s) {
		let c = new OffscreenCanvas(1, 1), l = c.getContext("2d", { alpha: !1 }), u = l.font = `${n} ${r} 200px ${t}`, { actualBoundingBoxLeft: d, actualBoundingBoxRight: f, actualBoundingBoxAscent: p, actualBoundingBoxDescent: m, fontBoundingBoxAscent: h, fontBoundingBoxDescent: g, width: _ } = l.measureText(e), v = 1.5, y = Math.ceil(Math.max(Math.abs(d) + Math.abs(f) || 0, _) * v), b = Math.ceil(Math.max(Math.abs(p) + Math.abs(m) || 200, Math.abs(h) + Math.abs(g) || 200) * v);
		c = new OffscreenCanvas(y, b), l = c.getContext("2d", {
			alpha: !0,
			willReadFrequently: !0
		}), l.font = u, l.filter = "grayscale(1)", l.fillStyle = "white", l.fillRect(0, 0, y, b), l.fillStyle = "black", l.fillText(e, y * .5 / 2, b * 1.5 / 2);
		let x = this.#u(l.getImageData(0, 0, y, b).data), S = this.#l(x), C = this.#d(S), w = this.#a(x, y, b, C);
		return this.processDrawnLines({
			lines: {
				curves: w,
				width: y,
				height: b
			},
			pageWidth: i,
			pageHeight: a,
			rotation: o,
			innerMargin: s,
			mustSmooth: !0,
			areContours: !0
		});
	}
	static process(e, t, n, r, i) {
		let [a, o, s] = this.#f(e), [c, l] = this.#c(a, o, s, Math.hypot(o, s) * this.#e.sigmaSFactor, this.#e.sigmaR, this.#e.kernelSize), u = this.#d(l), d = this.#a(c, o, s, u);
		return this.processDrawnLines({
			lines: {
				curves: d,
				width: o,
				height: s
			},
			pageWidth: t,
			pageHeight: n,
			rotation: r,
			innerMargin: i,
			mustSmooth: !0,
			areContours: !0
		});
	}
	static processDrawnLines({ lines: e, pageWidth: t, pageHeight: n, rotation: r, innerMargin: i, mustSmooth: a, areContours: o }) {
		r % 180 != 0 && ([t, n] = [n, t]);
		let { curves: s, width: c, height: l } = e, u = e.thickness ?? 0, d = [], f = Math.min(t / c, n / l), p = f / t, m = f / n, h = [];
		for (let { points: e } of s) {
			let t = a ? this.#s(e) : e;
			if (!t) continue;
			h.push(t);
			let n = t.length, r = new Float32Array(n), i = new Float32Array(3 * (n === 2 ? 2 : n - 2));
			if (d.push({
				line: i,
				points: r
			}), n === 2) {
				r[0] = t[0] * p, r[1] = t[1] * m, i.set([
					NaN,
					NaN,
					NaN,
					NaN,
					r[0],
					r[1]
				], 0);
				continue;
			}
			let [o, s, c, l] = t;
			o *= p, s *= m, c *= p, l *= m, r.set([
				o,
				s,
				c,
				l
			], 0), i.set([
				NaN,
				NaN,
				NaN,
				NaN,
				o,
				s
			], 0);
			for (let e = 4; e < n; e += 2) {
				let n = r[e] = t[e] * p, a = r[e + 1] = t[e + 1] * m;
				i.set($.createBezierPoints(o, s, c, l, n, a), (e - 2) * 3), [o, s, c, l] = [
					c,
					l,
					n,
					a
				];
			}
		}
		if (d.length === 0) return null;
		let g = o ? new ua() : new sa();
		return g.build(d, t, n, 1, r, o ? 0 : u, i), {
			outline: g,
			newCurves: h,
			areContours: o,
			thickness: u,
			width: c,
			height: l
		};
	}
	static async compressSignature({ outlines: e, areContours: t, thickness: n, width: r, height: i }) {
		let a = Infinity, o = -Infinity, s = 0;
		for (let t of e) {
			s += t.length;
			for (let e = 2, n = t.length; e < n; e++) {
				let n = t[e] - t[e - 2];
				a = Math.min(a, n), o = Math.max(o, n);
			}
		}
		let c;
		c = a >= -128 && o <= 127 ? Int8Array : a >= -32768 && o <= 32767 ? Int16Array : Int32Array;
		let l = e.length, u = da + fa * l, d = new Uint32Array(u), f = 0;
		d[f++] = u * Uint32Array.BYTES_PER_ELEMENT + (s - 2 * l) * c.BYTES_PER_ELEMENT, d[f++] = 0, d[f++] = r, d[f++] = i, d[f++] = +!t, d[f++] = Math.max(0, Math.floor(n ?? 0)), d[f++] = l, d[f++] = c.BYTES_PER_ELEMENT;
		for (let t of e) d[f++] = t.length - 2, d[f++] = t[0], d[f++] = t[1];
		let p = new CompressionStream("deflate-raw"), m = p.writable.getWriter();
		await m.ready, m.write(d);
		let h = c.prototype.constructor;
		for (let t of e) {
			let e = new h(t.length - 2);
			for (let n = 2, r = t.length; n < r; n++) e[n - 2] = t[n] - t[n - 2];
			m.write(e);
		}
		return m.close(), (await new Response(p.readable).bytes()).toBase64();
	}
	static async decompressSignature(e) {
		try {
			let t = Uint8Array.fromBase64(e), { readable: n, writable: r } = new DecompressionStream("deflate-raw"), i = r.getWriter();
			await i.ready, i.write(t).then(async () => {
				await i.ready, await i.close();
			}).catch(() => {});
			let a = null, o = 0;
			for await (let e of n) a ||= new Uint8Array(new Uint32Array(e.buffer, 0, 4)[0]), a.set(e, o), o += e.length;
			let s = new Uint32Array(a.buffer, 0, a.length >> 2), c = s[1];
			if (c !== 0) throw Error(`Invalid version: ${c}`);
			let l = s[2], u = s[3], d = s[4] === 0, f = s[5], p = s[6], m = s[7], h = [], g = (da + fa * p) * Uint32Array.BYTES_PER_ELEMENT, _;
			switch (m) {
				case Int8Array.BYTES_PER_ELEMENT:
					_ = new Int8Array(a.buffer, g);
					break;
				case Int16Array.BYTES_PER_ELEMENT:
					_ = new Int16Array(a.buffer, g);
					break;
				case Int32Array.BYTES_PER_ELEMENT: _ = new Int32Array(a.buffer, g);
			}
			o = 0;
			for (let e = 0; e < p; e++) {
				let t = s[fa * e + da], n = new Float32Array(t + 2);
				h.push(n);
				for (let t = 0; t < 2; t++) n[t] = s[fa * e + da + t + 1];
				for (let e = 0; e < t; e++) n[e + 2] = n[e] + _[o++];
			}
			return {
				areContours: d,
				thickness: f,
				outlines: h,
				width: l,
				height: u
			};
		} catch (e) {
			return F(`decompressSignature: ${e}`), null;
		}
	}
}, ma = class e extends qi {
	constructor() {
		super(), super.updateProperties({
			fill: Z._defaultLineColor,
			"stroke-width": 0
		});
	}
	clone() {
		let t = new e();
		return t.updateAll(this), t;
	}
}, ha = class e extends ca {
	constructor(e) {
		super(e), super.updateProperties({
			stroke: Z._defaultLineColor,
			"stroke-width": 1
		});
	}
	clone() {
		let t = new e(this._viewParameters);
		return t.updateAll(this), t;
	}
}, ga = class e extends Ji {
	#e = !1;
	#t = null;
	#n = null;
	#r = null;
	static _type = "signature";
	static _editorType = b.SIGNATURE;
	static _defaultDrawingOptions = null;
	constructor(e) {
		super({
			...e,
			mustBeCommitted: !0,
			name: "signatureEditor"
		}), this._willKeepAspectRatio = !0, this.#n = e.signatureData || null, this.#t = null, this.defaultL10nId = "pdfjs-editor-signature-editor1";
	}
	static initialize(e, t) {
		Z.initialize(e, t), this._defaultDrawingOptions = new ma(), this._defaultDrawnSignatureOptions = new ha(t.viewParameters);
	}
	static getDefaultDrawingOptions(e) {
		let t = this._defaultDrawingOptions.clone();
		return t.updateProperties(e), t;
	}
	static get supportMultipleDrawings() {
		return !1;
	}
	static get typesMap() {
		return H(this, "typesMap", /* @__PURE__ */ new Map());
	}
	static get isDrawer() {
		return !1;
	}
	get telemetryFinalData() {
		return {
			type: "signature",
			hasDescription: !!this.#t
		};
	}
	static computeTelemetryFinalData(e) {
		let t = e.get("hasDescription");
		return {
			hasAltText: t.get(!0) ?? 0,
			hasNoAltText: t.get(!1) ?? 0
		};
	}
	get isResizable() {
		return !0;
	}
	onScaleChanging() {
		this._drawId !== null && super.onScaleChanging();
	}
	render() {
		if (this.div) return this.div;
		let t, n, { _isCopy: r } = this;
		if (r && (this._isCopy = !1, t = this.x, n = this.y), super.render(), this._drawId === null) {
			if (this.#n) {
				let { lines: t, mustSmooth: n, areContours: r, description: i, uuid: a, heightInPage: o } = this.#n, { rawDims: { pageWidth: s, pageHeight: c }, rotation: l } = this.parent.viewport, u = pa.processDrawnLines({
					lines: t,
					pageWidth: s,
					pageHeight: c,
					rotation: l,
					innerMargin: e._INNER_MARGIN,
					mustSmooth: n,
					areContours: r
				});
				this.addSignature(u, o, i, a);
			} else this.div.setAttribute("data-l10n-args", JSON.stringify({ description: "" })), this.div.hidden = !0, this._uiManager.getSignature(this);
		} else this.div.setAttribute("data-l10n-args", JSON.stringify({ description: this.#t || "" }));
		return r && (this._isCopy = !0, this._moveAfterPaste(t, n)), this.div;
	}
	setUuid(e) {
		this.#r = e, this.addEditToolbar();
	}
	getUuid() {
		return this.#r;
	}
	get description() {
		return this.#t;
	}
	set description(e) {
		this.#t = e, this.div && (this.div.setAttribute("data-l10n-args", JSON.stringify({ description: e })), super.addEditToolbar().then((t) => {
			t?.updateEditSignatureButton(e);
		}));
	}
	getSignaturePreview() {
		let { newCurves: e, areContours: t, thickness: n, width: r, height: i } = this.#n, a = Math.max(r, i);
		return {
			areContours: t,
			outline: pa.processDrawnLines({
				lines: {
					curves: e.map((e) => ({ points: e })),
					thickness: n,
					width: r,
					height: i
				},
				pageWidth: a,
				pageHeight: a,
				rotation: 0,
				innerMargin: 0,
				mustSmooth: !1,
				areContours: t
			}).outline
		};
	}
	get toolbarButtons() {
		return this._uiManager.signatureManager ? [["editSignature", this._uiManager.signatureManager]] : super.toolbarButtons;
	}
	addSignature(t, n, r, i) {
		let { x: a, y: o } = this, { outline: s } = this.#n = t;
		this.#e = s instanceof ua, this.description = r;
		let c;
		this.#e ? c = e.getDefaultDrawingOptions() : (c = e._defaultDrawnSignatureOptions.clone(), c.updateProperties({ "stroke-width": s.thickness })), this._addOutlines({
			drawOutlines: s,
			drawingOptions: c
		});
		let [, l] = this.pageDimensions, u = n / l;
		u = u >= 1 ? .5 : u, this.width *= u / this.height, this.width >= 1 && (u *= .9 / this.width, this.width = .9), this.height = u, this.setDims(), this.x = a, this.y = o, this.center(), this._onResized(), this.onScaleChanging(), this.rotate(), this._uiManager.addToAnnotationStorage(this), this.setUuid(i), this._reportTelemetry({
			action: "pdfjs.signature.inserted",
			data: {
				hasBeenSaved: !!i,
				hasDescription: !!r
			}
		}), this.div.hidden = !1;
	}
	getFromImage(t) {
		let { rawDims: { pageWidth: n, pageHeight: r }, rotation: i } = this.parent.viewport;
		return pa.process(t, n, r, i, e._INNER_MARGIN);
	}
	getFromText(t, n) {
		let { rawDims: { pageWidth: r, pageHeight: i }, rotation: a } = this.parent.viewport;
		return pa.extractContoursFromText(t, n, r, i, a, e._INNER_MARGIN);
	}
	getDrawnSignature(t) {
		let { rawDims: { pageWidth: n, pageHeight: r }, rotation: i } = this.parent.viewport;
		return pa.processDrawnLines({
			lines: t,
			pageWidth: n,
			pageHeight: r,
			rotation: i,
			innerMargin: e._INNER_MARGIN,
			mustSmooth: !1,
			areContours: !1
		});
	}
	createDrawingOptions({ areContours: t, thickness: n }) {
		t ? this._drawingOptions = e.getDefaultDrawingOptions() : (this._drawingOptions = e._defaultDrawnSignatureOptions.clone(), this._drawingOptions.updateProperties({ "stroke-width": n }));
	}
	serialize(e = !1) {
		if (this.isEmpty()) return null;
		let { lines: t, points: n } = this.serializeDraw(e), { _drawingOptions: { "stroke-width": r } } = this, i = Object.assign(super.serialize(e), {
			isSignature: !0,
			areContours: this.#e,
			color: [
				0,
				0,
				0
			],
			thickness: this.#e ? 0 : r
		});
		return this.addComment(i), e ? (i.paths = {
			lines: t,
			points: n
		}, i.uuid = this.#r, i.isCopy = !0) : i.lines = t, this.#t && (i.accessibilityData = {
			type: "Figure",
			alt: this.#t
		}), i;
	}
	static deserializeDraw(e, t, n, r, i, a) {
		return a.areContours ? ua.deserialize(e, t, n, r, i, a) : sa.deserialize(e, t, n, r, i, a);
	}
	static async deserialize(e, t, n) {
		let r = await super.deserialize(e, t, n);
		return r.#e = e.areContours, r.description = e.accessibilityData?.alt || "", r.#r = e.uuid, r;
	}
}, _a = class extends Z {
	#e = null;
	#t = null;
	#n = null;
	#r = null;
	#i = null;
	#a = "";
	#o = null;
	#s = !1;
	#c = null;
	#l = !1;
	#u = !1;
	static _type = "stamp";
	static _editorType = b.STAMP;
	constructor(e) {
		super({
			...e,
			name: "stampEditor"
		}), this.#r = e.bitmapUrl, this.#i = e.bitmapFile, this.defaultL10nId = "pdfjs-editor-stamp-editor";
	}
	static initialize(e, t) {
		Z.initialize(e, t);
	}
	static isHandlingMimeForPasting(e) {
		return Re.has(e);
	}
	static paste(e, t) {
		t.pasteEditor({ mode: b.STAMP }, { bitmapFile: e.getAsFile() });
	}
	altTextFinish() {
		this._uiManager.useNewAltTextFlow && (this.div.hidden = !1), super.altTextFinish();
	}
	get telemetryFinalData() {
		return {
			type: "stamp",
			hasAltText: !!this.altTextData?.altText
		};
	}
	static computeTelemetryFinalData(e) {
		let t = e.get("hasAltText");
		return {
			hasAltText: t.get(!0) ?? 0,
			hasNoAltText: t.get(!1) ?? 0
		};
	}
	#d(e, t = !1) {
		if (!e) {
			this.remove();
			return;
		}
		this.#e = e.bitmap, t || (this.#t = e.id, this.#l = e.isSvg), e.file && (this.#a = e.file.name), this.#m();
	}
	#f() {
		if (this.#n = null, this._uiManager.enableWaiting(!1), this.#o) {
			if (this._uiManager.useNewAltTextWhenAddingImage && this._uiManager.useNewAltTextFlow && this.#e) {
				this.addEditToolbar().then(() => {
					this._editToolbar.hide(), this._uiManager.editAltText(this, !0);
				});
				return;
			}
			if (!this._uiManager.useNewAltTextWhenAddingImage && this._uiManager.useNewAltTextFlow && this.#e) {
				this._reportTelemetry({
					action: "pdfjs.image.image_added",
					data: {
						alt_text_modal: !1,
						alt_text_type: "empty"
					}
				});
				try {
					this.mlGuessAltText();
				} catch {}
			}
			this.div.focus();
		}
	}
	async mlGuessAltText(e = null, t = !0) {
		if (this.hasAltTextData()) return null;
		let { mlManager: n } = this._uiManager;
		if (!n) throw Error("No ML.");
		if (!await n.isEnabledFor("altText")) throw Error("ML isn't enabled for alt text.");
		let { data: r, width: i, height: a } = e || this.copyCanvas(null, null, !0).imageData, o = await n.guess({
			name: "altText",
			request: {
				data: r,
				width: i,
				height: a,
				channels: r.length / (i * a)
			}
		});
		if (!o) throw Error("No response from the AI service.");
		if (o.error) throw Error("Error from the AI service.");
		if (o.cancel) return null;
		if (!o.output) throw Error("No valid response from the AI service.");
		let s = o.output;
		return await this.setGuessedAltText(s), t && !this.hasAltTextData() && (this.altTextData = {
			alt: s,
			decorative: !1
		}), s;
	}
	#p() {
		if (this.#t) {
			this._uiManager.enableWaiting(!0), this._uiManager.imageManager.getFromId(this.#t).then((e) => this.#d(e, !0)).finally(() => this.#f());
			return;
		}
		if (this.#r) {
			let e = this.#r;
			this.#r = null, this._uiManager.enableWaiting(!0), this.#n = this._uiManager.imageManager.getFromUrl(e).then((e) => this.#d(e)).finally(() => this.#f());
			return;
		}
		if (this.#i) {
			let e = this.#i;
			this.#i = null, this._uiManager.enableWaiting(!0), this.#n = this._uiManager.imageManager.getFromFile(e).then((e) => this.#d(e)).finally(() => this.#f());
			return;
		}
		let e = document.createElement("input");
		e.type = "file", e.accept = Re.keys().join(",");
		let t = this._uiManager._signal;
		this.#n = new Promise((n) => {
			e.addEventListener("change", async () => {
				if (!e.files || e.files.length === 0) this.remove();
				else {
					this._uiManager.enableWaiting(!0);
					let t = await this._uiManager.imageManager.getFromFile(e.files[0]);
					this._reportTelemetry({
						action: "pdfjs.image.image_selected",
						data: { alt_text_modal: this._uiManager.useNewAltTextFlow }
					}), this.#d(t);
				}
				n();
			}, { signal: t }), e.addEventListener("cancel", () => {
				this.remove(), n();
			}, { signal: t });
		}).finally(() => this.#f()), e.click();
	}
	remove() {
		this.#t && (this.#e = null, this._uiManager.imageManager.deleteId(this.#t), this.#o?.remove(), this.#o = null, this.#c &&= (clearTimeout(this.#c), null)), super.remove();
	}
	rebuild() {
		if (!this.parent) {
			this.#t && this.#p();
			return;
		}
		super.rebuild(), this.div !== null && (this.#t && this.#o === null && this.#p(), this.isAttachedToDOM || this.parent.add(this));
	}
	onceAdded(e) {
		this._isDraggable = !0, e && this.div.focus();
	}
	isEmpty() {
		return !(this.#n || this.#e || this.#r || this.#i || this.#t || this.#s);
	}
	get toolbarButtons() {
		return [["altText", this.createAltText()]];
	}
	get isResizable() {
		return !0;
	}
	render() {
		if (this.div) return this.div;
		let e, t;
		return this._isCopy && (e = this.x, t = this.y), super.render(), this.div.hidden = !0, this.createAltText(), this.#s || (this.#e ? this.#m() : this.#p()), this._isCopy && this._moveAfterPaste(e, t), this._uiManager.addShouldRescale(this), this.div;
	}
	setCanvas(e, t) {
		let { id: n, bitmap: r } = this._uiManager.imageManager.getFromCanvas(e, t);
		t.remove(), n && this._uiManager.imageManager.isValidId(n) && (this.#t = n, r && (this.#e = r), this.#s = !1, this.#m());
	}
	_onResized() {
		this.onScaleChanging();
	}
	onScaleChanging() {
		this.parent && (this.#c !== null && clearTimeout(this.#c), this.#c = setTimeout(() => {
			this.#c = null, this.#g();
		}, 200));
	}
	#m() {
		let { div: e } = this, { width: t, height: n } = this.#e, [r, i] = this.pageDimensions, a = .75;
		if (this.width) t = this.width * r, n = this.height * i;
		else if (t > a * r || n > a * i) {
			let e = Math.min(a * r / t, a * i / n);
			t *= e, n *= e;
		}
		this._uiManager.enableWaiting(!1);
		let o = this.#o = document.createElement("canvas");
		o.setAttribute("role", "img"), this.addContainer(o), this.width = t / r, this.height = n / i, this.setDims(), this._initialOptions?.isCentered ? this.center() : this.fixAndSetPosition(), this._initialOptions = null, (!this._uiManager.useNewAltTextWhenAddingImage || !this._uiManager.useNewAltTextFlow || this.annotationElementId) && (e.hidden = !1), this.#g(), this.#u ||= (this.parent.addUndoableEditor(this), !0), this._reportTelemetry({ action: "inserted_image" }), this.#a && this.div.setAttribute("aria-description", this.#a), this.annotationElementId || this._uiManager.a11yAlert(Z._l10nAlert.stamp);
	}
	copyCanvas(e, t, n = !1) {
		e ||= 224;
		let { width: r, height: i } = this.#e, a = new Le(), o = this.#e, s = r, c = i, l = null;
		if (t) {
			if (r > t || i > t) {
				let e = Math.min(t / r, t / i);
				s = Math.floor(r * e), c = Math.floor(i * e);
			}
			l = document.createElement("canvas");
			let e = l.width = Math.ceil(s * a.sx), n = l.height = Math.ceil(c * a.sy);
			this.#l || (o = this.#h(e, n));
			let u = l.getContext("2d");
			u.filter = this._uiManager.hcmFilter;
			let d = "white", f = "#cfcfd8";
			this._uiManager.hcmFilter === "none" ? ze.isDarkMode && (d = "#8f8f9d", f = "#42414d") : f = "black";
			let p = 15 * a.sx, m = 15 * a.sy, h = new OffscreenCanvas(p * 2, m * 2), g = h.getContext("2d");
			g.fillStyle = d, g.fillRect(0, 0, p * 2, m * 2), g.fillStyle = f, g.fillRect(0, 0, p, m), g.fillRect(p, m, p, m), u.fillStyle = u.createPattern(h, "repeat"), u.fillRect(0, 0, e, n), u.drawImage(o, 0, 0, o.width, o.height, 0, 0, e, n);
		}
		let u = null;
		if (n) {
			let t, n;
			if (a.symmetric && o.width < e && o.height < e) t = o.width, n = o.height;
			else if (o = this.#e, r > e || i > e) {
				let a = Math.min(e / r, e / i);
				t = Math.floor(r * a), n = Math.floor(i * a), this.#l || (o = this.#h(t, n));
			}
			let s = new OffscreenCanvas(t, n).getContext("2d", { willReadFrequently: !0 });
			s.drawImage(o, 0, 0, o.width, o.height, 0, 0, t, n), u = {
				width: t,
				height: n,
				data: s.getImageData(0, 0, t, n).data
			};
		}
		return {
			canvas: l,
			width: s,
			height: c,
			imageData: u
		};
	}
	#h(e, t) {
		let { width: n, height: r } = this.#e, i = n, a = r, o = this.#e;
		for (; i > 2 * e || a > 2 * t;) {
			let n = i, r = a;
			i > 2 * e && (i = Math.ceil(i / 2)), a > 2 * t && (a = Math.ceil(a / 2));
			let s = new OffscreenCanvas(i, a);
			s.getContext("2d").drawImage(o, 0, 0, n, r, 0, 0, i, a), o = s.transferToImageBitmap();
		}
		return o;
	}
	#g() {
		let [e, t] = this.parentDimensions, { width: n, height: r } = this, i = new Le(), a = Math.ceil(n * e * i.sx), o = Math.ceil(r * t * i.sy), s = this.#o;
		if (!s || s.width === a && s.height === o) return;
		s.width = a, s.height = o;
		let c = this.#l ? this.#e : this.#h(a, o), l = s.getContext("2d");
		l.filter = this._uiManager.hcmFilter, l.drawImage(c, 0, 0, c.width, c.height, 0, 0, a, o);
	}
	#_(e) {
		if (e) {
			if (this.#l) {
				let e = this._uiManager.imageManager.getSvgUrl(this.#t);
				if (e) return e;
			}
			let e = document.createElement("canvas");
			return {width: e.width, height: e.height} = this.#e, e.getContext("2d").drawImage(this.#e, 0, 0), e.toDataURL();
		}
		if (this.#l) {
			let [e, t] = this.pageDimensions, n = Math.round(this.width * e * be.PDF_TO_CSS_UNITS), r = Math.round(this.height * t * be.PDF_TO_CSS_UNITS), i = new OffscreenCanvas(n, r);
			return i.getContext("2d").drawImage(this.#e, 0, 0, this.#e.width, this.#e.height, 0, 0, n, r), i.transferToImageBitmap();
		}
		return structuredClone(this.#e);
	}
	static async deserialize(e, t, n) {
		let r = null, i = !1;
		if (e instanceof Vi) {
			let { data: { rect: a, rotation: o, id: s, structParent: c, popupRef: l, richText: u, contentsObj: d, creationDate: f, modificationDate: p }, container: m, parent: { page: { pageNumber: h } }, canvas: g } = e, _, y;
			g ? (delete e.canvas, {id: _, bitmap: y} = n.imageManager.getFromCanvas(m.id, g), g.remove()) : (i = !0, e._hasNoCanvas = !0);
			let x = (await t._structTree.getAriaAttributes(`${v}${s}`))?.get("aria-label") || "";
			r = e = {
				annotationType: b.STAMP,
				bitmapId: _,
				bitmap: y,
				pageIndex: h - 1,
				rect: a.slice(0),
				rotation: o,
				annotationElementId: s,
				id: s,
				deleted: !1,
				accessibilityData: {
					decorative: !1,
					altText: x
				},
				isSvg: !1,
				structParent: c,
				popupRef: l,
				richText: u,
				comment: d?.str || null,
				creationDate: f,
				modificationDate: p
			};
		}
		let a = await super.deserialize(e, t, n), { rect: o, bitmap: s, bitmapUrl: c, bitmapId: l, isSvg: u, accessibilityData: d } = e;
		i ? (n.addMissingCanvas(e.id, a), a.#s = !0) : l && n.imageManager.isValidId(l) ? (a.#t = l, s && (a.#e = s)) : a.#r = c, a.#l = u;
		let [f, p] = a.pageDimensions;
		return a.width = (o[2] - o[0]) / f, a.height = (o[3] - o[1]) / p, d && (a.altTextData = d), a._initialData = r, e.comment && a.setCommentData(e), a.#u = !!r, a;
	}
	serialize(e = !1, t = null) {
		if (this.isEmpty()) return null;
		if (this.deleted) return this.serializeDeleted();
		let n = Object.assign(super.serialize(e), {
			bitmapId: this.#t,
			isSvg: this.#l
		});
		if (this.addComment(n), e) return n.bitmapUrl = this.#_(!0), n.accessibilityData = this.serializeAltText(!0), n.isCopy = !0, n;
		let { decorative: r, altText: i } = this.serializeAltText(!1);
		if (!r && i && (n.accessibilityData = {
			type: "Figure",
			alt: i
		}), this.annotationElementId) {
			let e = this.#v(n);
			return e.isSame ? null : (e.isSameAltText ? delete n.accessibilityData : n.accessibilityData.structParent = this._initialData.structParent ?? -1, n.id = this.annotationElementId, delete n.bitmapId, n);
		}
		if (t === null) return n;
		t.stamps ||= /* @__PURE__ */ new Map();
		let a = this.#l ? (n.rect[2] - n.rect[0]) * (n.rect[3] - n.rect[1]) : null;
		if (!t.stamps.has(this.#t)) t.stamps.set(this.#t, {
			area: a,
			serialized: n
		}), n.bitmap = this.#_(!1);
		else if (this.#l) {
			let e = t.stamps.get(this.#t);
			a > e.area && (e.area = a, e.serialized.bitmap.close(), e.serialized.bitmap = this.#_(!1));
		}
		return n;
	}
	#v(e) {
		let { pageIndex: t, accessibilityData: { altText: n } } = this._initialData, r = e.pageIndex === t, i = (e.accessibilityData?.alt || "") === n;
		return {
			isSame: !this.hasEditedComment && !this._hasBeenMoved && !this._hasBeenResized && r && i,
			isSameAltText: i
		};
	}
	renderAnnotationElement(e) {
		return this.deleted ? (e.hide(), null) : (e.updateEdited({
			rect: this.getPDFRect(),
			popup: this.comment
		}), null);
	}
}, va = class e {
	#e;
	#t = !1;
	#n = null;
	#r = null;
	#i = null;
	#a = /* @__PURE__ */ new Map();
	#o = !1;
	#s = !1;
	#c = !1;
	#l = null;
	#u = null;
	#d = null;
	#f = null;
	#p = null;
	#m = -1;
	#h;
	static _initialized = !1;
	static #g = new Map([
		Ki,
		la,
		_a,
		aa,
		ga
	].map((e) => [e._editorType, e]));
	constructor({ uiManager: t, pageIndex: n, div: r, structTreeLayer: i, accessibilityManager: a, annotationLayer: o, drawLayer: s, textLayer: c, viewport: l, l10n: u }) {
		let d = [...e.#g.values()];
		if (!e._initialized) {
			e._initialized = !0;
			for (let e of d) e.initialize(u, t);
		}
		t.registerEditorTypes(d), this.#h = t, this.pageIndex = n, this.div = r, this.#e = a, this.#n = o, this.viewport = l, this.#d = c, this.drawLayer = s, this._structTree = i, this.#h.addLayer(this);
	}
	get isEmpty() {
		return this.#a.size === 0;
	}
	get isInvisible() {
		return this.isEmpty && this.#h.getMode() === b.NONE;
	}
	updateToolbar(e) {
		this.#h.updateToolbar(e);
	}
	updateMode(t = this.#h.getMode()) {
		switch (this.#S(), t) {
			case b.NONE:
				this.div.classList.toggle("nonEditing", !0), this.disableTextSelection(), this.togglePointerEvents(!1), this.toggleAnnotationLayerPointerEvents(!0), this.disableClick();
				return;
			case b.INK:
				this.disableTextSelection(), this.togglePointerEvents(!0), this.enableClick();
				break;
			case b.HIGHLIGHT:
				this.enableTextSelection(), this.togglePointerEvents(!1), this.disableClick();
				break;
			default: this.disableTextSelection(), this.togglePointerEvents(!0), this.enableClick();
		}
		this.toggleAnnotationLayerPointerEvents(!1);
		let { classList: n } = this.div;
		if (n.toggle("nonEditing", !1), t === b.POPUP) n.toggle("commentEditing", !0);
		else {
			n.toggle("commentEditing", !1);
			for (let r of e.#g.values()) n.toggle(`${r._type}Editing`, t === r._editorType);
		}
		this.div.hidden = !1;
	}
	hasTextLayer(e) {
		return e === this.#d?.div;
	}
	setEditingState(e) {
		this.#h.setEditingState(e);
	}
	addCommands(e) {
		this.#h.addCommands(e);
	}
	cleanUndoStack(e) {
		this.#h.cleanUndoStack(e);
	}
	toggleDrawing(e = !1) {
		this.div.classList.toggle("drawing", !e);
	}
	togglePointerEvents(e = !1) {
		this.div.classList.toggle("disabled", !e);
	}
	toggleAnnotationLayerPointerEvents(e = !1) {
		this.#n?.togglePointerEvents(e);
	}
	get #_() {
		return this.#a.size === 0 ? this.#h.getEditors(this.pageIndex) : this.#a.values();
	}
	async enable() {
		this.#c = !0, this.div.tabIndex = 0, this.togglePointerEvents(!0), this.div.classList.toggle("nonEditing", !1), this.#p?.abort(), this.#p = null;
		let e = /* @__PURE__ */ new Set();
		for (let t of this.#_) t.enableEditing(), t.show(!0), t.annotationElementId && (this.#h.removeChangedExistingAnnotation(t), e.add(t.annotationElementId));
		let t = this.#n;
		if (t) for (let n of t.getEditableAnnotations()) {
			if (n.hide(), this.#h.isDeletedAnnotationElement(n.data.id) || e.has(n.data.id)) continue;
			let t = await this.deserialize(n);
			t && (this.addOrRebuild(t), t.enableEditing());
		}
		this.#c = !1, this.#h._eventBus.dispatch("editorsrendered", {
			source: this,
			pageNumber: this.pageIndex + 1
		});
	}
	disable() {
		if (this.#s = !0, this.div.tabIndex = -1, this.togglePointerEvents(!1), this.div.classList.toggle("nonEditing", !0), this.#d && !this.#p) {
			this.#p = new AbortController();
			let e = this.#h.combinedSignal(this.#p);
			this.#d.div.addEventListener("pointerdown", (e) => {
				let { clientX: t, clientY: n, timeStamp: r } = e;
				if (r - this.#m > 500) {
					this.#m = r;
					return;
				}
				this.#m = -1;
				let { classList: i } = this.div;
				i.toggle("getElements", !0);
				let a = document.elementsFromPoint(t, n);
				if (i.toggle("getElements", !1), !this.div.contains(a[0])) return;
				let o, s = RegExp(`^${y}[0-9]+$`);
				for (let e of a) if (s.test(e.id)) {
					o = e.id;
					break;
				}
				if (!o) return;
				let c = this.#a.get(o);
				c?.annotationElementId === null && (Ae(e), c.dblclick(e));
			}, {
				signal: e,
				capture: !0
			});
		}
		let t = this.#n, n = [];
		if (t) {
			let e = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map();
			for (let t of this.#_) {
				if (t.disableEditing(), !t.annotationElementId) {
					n.push(t);
					continue;
				}
				if (t.serialize() !== null) {
					e.set(t.annotationElementId, t);
					continue;
				}
				r.set(t.annotationElementId, t), this.getEditableAnnotation(t.annotationElementId)?.show(), t.remove();
			}
			for (let n of t.getEditableAnnotations()) {
				let { id: t } = n.data;
				if (this.#h.isDeletedAnnotationElement(t)) {
					n.updateEdited({ deleted: !0 });
					continue;
				}
				let i = r.get(t);
				if (i) {
					i.resetAnnotationElement(n), i.show(!1), n.show();
					continue;
				}
				i = e.get(t), i && (this.#h.addChangedExistingAnnotation(i), i.renderAnnotationElement(n) && i.show(!1)), n.show();
			}
		}
		this.#S(), this.isEmpty && (this.div.hidden = !0);
		let { classList: r } = this.div;
		for (let t of e.#g.values()) r.remove(`${t._type}Editing`);
		this.disableTextSelection(), this.toggleAnnotationLayerPointerEvents(!0), t?.updateFakeAnnotations(n), this.#s = !1;
	}
	getEditableAnnotation(e) {
		return this.#n?.getEditableAnnotation(e) || null;
	}
	setActiveEditor(e) {
		this.#h.getActive() !== e && this.#h.setActiveEditor(e);
	}
	enableTextSelection() {
		if (this.div.tabIndex = -1, this.#d?.div && !this.#f) {
			this.#f = new AbortController();
			let e = this.#h.combinedSignal(this.#f);
			this.#d.div.addEventListener("pointerdown", this.#v.bind(this), { signal: e }), this.#d.div.classList.add("highlighting");
		}
	}
	disableTextSelection() {
		this.div.tabIndex = 0, this.#d?.div && this.#f && (this.#f.abort(), this.#f = null, this.#d.div.classList.remove("highlighting"));
	}
	#v(e) {
		this.#h.unselectAll();
		let { target: t } = e;
		if (t === this.#d.div || (t.getAttribute("role") === "img" || t.classList.contains("endOfContent") || t.classList.contains("textLayerImages") || t.classList.contains("textLayerImagePlaceholder")) && this.#d.div.contains(t)) {
			let { isMac: t } = K.platform;
			if (e.button !== 0 || e.ctrlKey && t) return;
			this.#h.showAllEditors("highlight", !0, !0), aa.startDrawing(this, this.#h, this.#h.direction === "ltr", e), e.preventDefault();
		}
	}
	enableClick() {
		if (this.#r) return;
		this.#r = new AbortController();
		let e = this.#h.combinedSignal(this.#r);
		this.div.addEventListener("pointerdown", this.pointerdown.bind(this), { signal: e });
		let t = this.pointerup.bind(this);
		this.div.addEventListener("pointerup", t, { signal: e }), this.div.addEventListener("pointercancel", t, { signal: e });
	}
	disableClick() {
		this.#r?.abort(), this.#r = null;
	}
	attach(e) {
		this.#a.set(e.id, e);
		let { annotationElementId: t } = e;
		t && this.#h.isDeletedAnnotationElement(t) && this.#h.removeDeletedAnnotationElement(e);
	}
	detach(e) {
		this.#a.delete(e.id), this.#e?.removePointerInTextLayer(e.contentDiv), !this.#s && e.annotationElementId && this.#h.addDeletedAnnotationElement(e);
	}
	remove(e) {
		this.detach(e), this.#h.removeEditor(e), e.div.remove(), e.isAttachedToDOM = !1;
	}
	changeParent(e) {
		e.parent !== this && (e.parent && e.annotationElementId && (this.#h.addDeletedAnnotationElement(e), Z.deleteAnnotationElement(e), e.annotationElementId = null), this.attach(e), e.parent?.detach(e), e.setParent(this), e.div && e.isAttachedToDOM && (e.div.remove(), this.div.append(e.div)));
	}
	add(e) {
		if (!(e.parent === this && e.isAttachedToDOM)) {
			if (this.changeParent(e), this.#h.addEditor(e), this.attach(e), !e.isAttachedToDOM) {
				let t = e.render();
				this.div.append(t), e.isAttachedToDOM = !0;
			}
			e.fixAndSetPosition(), e.onceAdded(!this.#c), this.#h.addToAnnotationStorage(e), e._reportTelemetry(e.telemetryInitialData);
		}
	}
	moveEditorInDOM(e) {
		if (!e.isAttachedToDOM) return;
		let { activeElement: t } = document;
		e.div.contains(t) && !this.#i && (e._focusEventsAllowed = !1, this.#i = setTimeout(() => {
			this.#i = null, e.div.contains(document.activeElement) ? e._focusEventsAllowed = !0 : (e.div.addEventListener("focusin", () => {
				e._focusEventsAllowed = !0;
			}, {
				once: !0,
				signal: this.#h._signal
			}), t.focus());
		}, 0)), e._structTreeParentId = this.#e?.moveElementInDOM(this.div, e.div, e.contentDiv, !0);
	}
	addOrRebuild(e) {
		e.needsToBeRebuilt() ? (e.parent ||= this, e.rebuild(), e.show()) : this.add(e);
	}
	addUndoableEditor(e) {
		this.addCommands({
			cmd: () => e._uiManager.rebuild(e),
			undo: () => {
				e.remove();
			},
			mustExec: !1
		});
	}
	getEditorByUID(e) {
		for (let t of this.#a.values()) if (t.uid === e) return t;
		return null;
	}
	get #y() {
		return e.#g.get(this.#h.getMode());
	}
	combinedSignal(e) {
		return this.#h.combinedSignal(e);
	}
	#b(e) {
		let t = this.#y;
		return t ? new t.prototype.constructor(e) : null;
	}
	canCreateNewEmptyEditor() {
		return this.#y?.canCreateNewEmptyEditor();
	}
	async pasteEditor(e, t) {
		this.updateToolbar(e), await this.#h.updateMode(e.mode);
		let { offsetX: n, offsetY: r } = this.#x(), i = this.#h.getId(), a = this.#b({
			parent: this,
			id: i,
			x: n,
			y: r,
			uiManager: this.#h,
			isCentered: !0,
			...t
		});
		a && this.add(a);
	}
	async deserialize(t) {
		return await e.#g.get(t.annotationType ?? t.annotationEditorType)?.deserialize(t, this, this.#h) || null;
	}
	createAndAddNewEditor(e, t, n = {}) {
		let r = this.#h.getId(), i = this.#b({
			parent: this,
			id: r,
			x: e.offsetX,
			y: e.offsetY,
			uiManager: this.#h,
			isCentered: t,
			...n
		});
		return i && this.add(i), i;
	}
	get boundingClientRect() {
		return this.div.getBoundingClientRect();
	}
	#x() {
		let { x: e, y: t, width: n, height: r } = this.boundingClientRect, i = Math.max(0, e), a = Math.max(0, t), o = Math.min(window.innerWidth, e + n), s = Math.min(window.innerHeight, t + r), c = (i + o) / 2 - e, l = (a + s) / 2 - t, [u, d] = this.viewport.rotation % 180 == 0 ? [c, l] : [l, c];
		return {
			offsetX: u,
			offsetY: d
		};
	}
	addNewEditor(e = {}) {
		this.createAndAddNewEditor(this.#x(), !0, e);
	}
	setSelected(e) {
		this.#h.setSelected(e);
	}
	toggleSelected(e) {
		this.#h.toggleSelected(e);
	}
	unselect(e) {
		this.#h.unselect(e);
	}
	pointerup(e) {
		let { isMac: t } = K.platform;
		if (e.button !== 0 || e.ctrlKey && t || e.target !== this.div || !this.#o || (this.#o = !1, this.#y?.isDrawer && this.#y.supportMultipleDrawings)) return;
		if (!this.#t) {
			this.#t = !0;
			return;
		}
		let n = this.#h.getMode();
		if (n === b.STAMP || n === b.POPUP || n === b.SIGNATURE) {
			this.#h.unselectAll();
			return;
		}
		this.createAndAddNewEditor(e, !1);
	}
	pointerdown(e) {
		if (this.#h.getMode() === b.HIGHLIGHT && this.enableTextSelection(), this.#o) {
			this.#o = !1;
			return;
		}
		let { isMac: t } = K.platform;
		if (e.button !== 0 || e.ctrlKey && t || e.target !== this.div) return;
		if (this.#o = !0, this.#y?.isDrawer) {
			this.startDrawingSession(e);
			return;
		}
		let n = this.#h.getActive();
		this.#t = !n || n.isEmpty();
	}
	startDrawingSession(e) {
		if (this.div.focus({ preventScroll: !0 }), this.#l) {
			this.#y.startDrawing(this, this.#h, !1, e);
			return;
		}
		this.#h.setCurrentDrawingSession(this), this.#l = new AbortController();
		let t = this.#h.combinedSignal(this.#l);
		this.div.addEventListener("blur", ({ relatedTarget: e }) => {
			e && !this.div.contains(e) && (this.#u = null, this.commitOrRemove());
		}, { signal: t }), this.#y.startDrawing(this, this.#h, !1, e);
	}
	pause(e) {
		if (e) {
			let { activeElement: e } = document;
			this.div.contains(e) && (this.#u = e);
			return;
		}
		this.#u && setTimeout(() => {
			this.#u?.focus(), this.#u = null;
		}, 0);
	}
	endDrawingSession(e = !1) {
		return this.#l ? (this.#h.setCurrentDrawingSession(null), this.#l.abort(), this.#l = null, this.#u = null, this.#y.endDrawing(e)) : null;
	}
	findNewParent(e, t, n) {
		let r = this.#h.findParent(t, n);
		return r === null || r === this ? !1 : (r.changeParent(e), !0);
	}
	commitOrRemove() {
		return this.#l ? (this.endDrawingSession(), !0) : !1;
	}
	onScaleChanging() {
		this.#l && this.#y.onScaleChangingWhenDrawing(this);
	}
	destroy() {
		this.commitOrRemove(), this.#h.getActive()?.parent === this && (this.#h.commitOrRemove(), this.#h.setActiveEditor(null)), this.#i &&= (clearTimeout(this.#i), null);
		for (let e of this.#a.values()) this.#e?.removePointerInTextLayer(e.contentDiv), e.setParent(null), e.isAttachedToDOM = !1, e.div.remove();
		this.div = null, this.#a.clear(), this.#h.removeLayer(this);
	}
	#S() {
		for (let e of this.#a.values()) e.isEmpty() && e.remove();
	}
	async render({ viewport: e }) {
		this.viewport = e, Ie(this.div, e);
		for (let e of this.#h.getEditors(this.pageIndex)) this.add(e), e.rebuild();
		await this.#h.findClonesForPage(this), this.div.hidden = this.isEmpty, this.updateMode();
	}
	update({ viewport: e }) {
		this.#h.commitOrRemove(), this.#S();
		let t = this.viewport.rotation, n = e.rotation;
		if (this.viewport = e, Ie(this.div, { rotation: n }), t !== n) for (let e of this.#a.values()) e.rotate(n);
	}
	get pageDimensions() {
		let { pageWidth: e, pageHeight: t } = this.viewport.rawDims;
		return [e, t];
	}
	get scale() {
		return this.#h.viewParameters.realScale;
	}
};
function ya(e, t) {
	return e === t ? 0 : e.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}
function ba(e) {
	return e ? e.nodeType === Node.ELEMENT_NODE ? e.closest(".textLayer") : e.parentElement?.closest(".textLayer") || null : null;
}
function xa(e, t, n, r) {
	if (e === n) return t <= r;
	let i = e.compareDocumentPosition(n);
	return i & Node.DOCUMENT_POSITION_FOLLOWING ? !0 : i & Node.DOCUMENT_POSITION_PRECEDING ? !1 : null;
}
function Sa(e, t, n) {
	if (e.nodeType !== Node.ELEMENT_NODE || !e.classList.contains("textLayer") || t !== e.childNodes.length) return {
		container: e,
		offset: t
	};
	let r = e.lastChild;
	return r?.nodeType === Node.ELEMENT_NODE && r.classList.contains("endOfContent") && (r = r.previousSibling), !r || !n.contains(r) ? null : r.nodeType === Node.TEXT_NODE ? {
		container: r,
		offset: r.textContent.length
	} : {
		container: r,
		offset: r.childNodes.length
	};
}
var Ca = class e {
	#e = null;
	#t = /* @__PURE__ */ new Map();
	#n = null;
	#r = null;
	#i = null;
	#a = null;
	#o = /* @__PURE__ */ new Map();
	static #s = 0;
	static #c = 0;
	static #l = null;
	static #u = /* @__PURE__ */ new Set();
	static #d = !1;
	static #f = /* @__PURE__ */ new Set();
	static #p = /* @__PURE__ */ new WeakMap();
	constructor({ filterFactory: t = null, pageColors: n = null, pageIndex: r, textLayer: i = null }) {
		if (this.pageIndex = r, this.#r = t, this.#i = n, i) {
			let t = e.#p.get(i);
			if (t?.selectionDiv && (t.selectionDiv.remove(), e.#u.delete(t.selectionDiv)), e.#p.set(i, { drawLayer: this }), e.#f.add(i), this.#n = i, this.#a = new MutationObserver((t) => {
				if (this.#e && this.#n?.isConnected && e.#h()) {
					for (let { addedNodes: n } of t) for (let t of n) if (t.nodeType === Node.ELEMENT_NODE && t.classList.contains("endOfContent")) {
						e.#_();
						return;
					}
				}
			}), this.#a.observe(i, { childList: !0 }), e.#l === null) {
				e.#l = new AbortController();
				let { signal: t } = e.#l;
				document.addEventListener("selectionchange", e.#_.bind(e), { signal: t }), document.addEventListener("pointerdown", () => {
					e.#d = !0;
				}, { signal: t }), document.addEventListener("pointerup", () => {
					e.#d = !1;
				}, { signal: t }), window.addEventListener("blur", () => {
					e.#d = !1;
				}, { signal: t });
			}
		}
	}
	setParent(t) {
		if (!this.#e) {
			this.#e = t, this.#n?.isConnected && e.#h() && e.#_();
			return;
		}
		if (this.#e !== t) {
			if (this.#t.size > 0) for (let e of this.#t.values()) e.remove(), t.append(e);
			this.#e = t;
		}
	}
	static #m(e) {
		let t = this.#p.get(e);
		t?.selectionDiv && (t.selectionDiv.remove(), this.#u.delete(t.selectionDiv), t.selectionDiv = null, t.path = null);
	}
	static #h() {
		let e = document.getSelection();
		return !!e && !e.isCollapsed;
	}
	static #g() {
		return this.#f.keys().filter((e) => e.isConnected).toArray().sort(ya);
	}
	static #_() {
		let t = document.getSelection();
		if (!t || t.isCollapsed) {
			for (let e of this.#u) e.remove();
			this.#u.clear();
			return;
		}
		let n = /* @__PURE__ */ new WeakMap(), r = this.#g(), i = [];
		for (let e = 0, n = t.rangeCount; e < n; e++) {
			let n = t.getRangeAt(e);
			if (n.collapsed) continue;
			let { startContainer: a, startOffset: o, endContainer: s, endOffset: c } = n, l = ba(a), u = ba(s), d = l === null, f = u === null;
			if (this.#d && d !== f) return;
			if (t.rangeCount === 1) {
				let { anchorNode: e, anchorOffset: n, focusNode: r, focusOffset: i } = t, d = ba(e), f = ba(r), p = xa(e, n, r, i);
				d && f && p !== null && (p ? (a = e, o = n, l = d, s = r, c = i, u = f) : (a = r, o = i, l = f, s = e, c = n, u = d));
			}
			let p = r.filter((e) => n.intersectsNode(e));
			if (p.length === 0) continue;
			let m = !1;
			if (l || (l = p[0], a = l, o = 0, m = !0), u || (u = p.at(-1), s = u, c = u.childNodes.length, m = !0), s.nodeType === Node.ELEMENT_NODE) {
				if (s.classList.contains("endOfContent")) {
					let e = s.previousSibling;
					if (!e) continue;
					s = e, c = e.nodeType === Node.TEXT_NODE ? e.textContent.length : e.childNodes.length;
				} else if (s.classList.contains("textLayer") && s.childNodes.length === c) {
					let e = Sa(s, c, u);
					if (!e) continue;
					s = e.container, c = e.offset;
				}
			}
			if (a.nodeType === Node.ELEMENT_NODE) {
				let e = Sa(a, o, l);
				if (!e) continue;
				a = e.container, o = e.offset;
			}
			if (l === u && !m && p.includes(l)) {
				i.push([n, l]);
				continue;
			}
			for (let e of p) {
				let t = e.firstChild;
				if (!t) continue;
				let n = document.createRange();
				if (e === l ? n.setStart(a, o) : n.setStartBefore(t), e === u) n.setEnd(s, c);
				else {
					let t = e.lastChild;
					if (!t) continue;
					if (t.nodeType === Node.ELEMENT_NODE && t.classList.contains("endOfContent")) {
						let e = t.previousSibling;
						if (!e) continue;
						n.setEndAfter(e);
					} else n.setEndAfter(t);
				}
				n.collapsed || i.push([n, e]);
			}
		}
		let a = new Set(i.map((e) => e[1]));
		for (let e of this.#f) a.has(e) || this.#m(e);
		for (let [t, r] of i) {
			let i = e.#p.get(r);
			if (!i) continue;
			let a = n.get(r);
			if (!a) {
				let e = r.getBoundingClientRect();
				a = (t, n, r, i) => ({
					x: (t - e.x) / e.width,
					y: (n - e.y) / e.height,
					width: r / e.width,
					height: i / e.height
				}), n.set(r, a);
			}
			let o = [];
			for (let { x: e, y: n, width: r, height: i } of t.getClientRects()) r !== 0 && i !== 0 && ({x: e, y: n, width: r, height: i} = a(e, n, r, i), (r !== 1 || i !== 1) && o.push(`M${e} ${n} h${r} v${i} h-${r} Z`));
			if (o.length === 0) continue;
			let s = i.drawLayer, c = i.selectionDiv, l = i.path;
			if (!c) {
				let t = `clip_selection_${e.#c++}`;
				c = document.createElement("div"), c.className = "selection", c.style.clipPath = `url(#${t})`;
				let n = s.#r?.createSelectionStyle(s.#i);
				if (n) for (let [e, t] of Object.entries(n)) c.style.setProperty(e, t);
				let r = e._svgFactory.create(1, 1, !0);
				r.setAttribute("aria-hidden", "true"), r.setAttribute("width", "100%"), r.setAttribute("height", "100%");
				let a = e._svgFactory.createElement("clipPath");
				a.setAttribute("id", t), a.setAttribute("clipPathUnits", "objectBoundingBox"), l = e._svgFactory.createElement("path"), a.append(l), r.append(a), c.append(r), i.path = l, i.selectionDiv = c;
			}
			s.#e && c.parentNode !== s.#e && (s.#e.append(c), this.#u.add(c)), l.setAttribute("d", o.join(" "));
		}
	}
	static get _svgFactory() {
		return H(this, "_svgFactory", new di());
	}
	static #v(e, [t, n, r, i]) {
		let { style: a } = e;
		a.top = `${100 * n}%`, a.left = `${100 * t}%`, a.width = `${100 * r}%`, a.height = `${100 * i}%`;
	}
	#y() {
		let t = e._svgFactory.create(1, 1, !0);
		return this.#e.append(t), t.setAttribute("aria-hidden", "true"), t;
	}
	#b(t, n) {
		let r = e._svgFactory.createElement("clipPath");
		t.append(r);
		let i = `clip_${n}`;
		r.setAttribute("id", i), r.setAttribute("clipPathUnits", "objectBoundingBox");
		let a = e._svgFactory.createElement("use");
		return r.append(a), a.setAttribute("href", `#${n}`), a.classList.add("clip"), i;
	}
	#x(e, t) {
		for (let [n, r] of Object.entries(t)) r === null ? e.removeAttribute(n) : e.setAttribute(n, r);
	}
	draw(t, n = !1, r = !1) {
		let i = e.#s++, a = this.#y(), o = e._svgFactory.createElement("defs");
		a.append(o);
		let s = e._svgFactory.createElement("path");
		o.append(s);
		let c = `path_${i}`;
		s.setAttribute("id", c), s.setAttribute("vector-effect", "non-scaling-stroke"), n && this.#o.set(i, s);
		let l = r ? this.#b(o, c) : null, u = e._svgFactory.createElement("use");
		return a.append(u), u.setAttribute("href", `#${c}`), this.updateProperties(a, t), this.#t.set(i, a), {
			id: i,
			clipPathId: `url(#${l})`
		};
	}
	drawOutline(t, n) {
		let r = e.#s++, i = this.#y(), a = e._svgFactory.createElement("defs");
		i.append(a);
		let o = e._svgFactory.createElement("path");
		a.append(o);
		let s = `path_${r}`;
		o.setAttribute("id", s), o.setAttribute("vector-effect", "non-scaling-stroke");
		let c;
		if (n) {
			let t = e._svgFactory.createElement("mask");
			a.append(t), c = `mask_${r}`, t.setAttribute("id", c), t.setAttribute("maskUnits", "objectBoundingBox");
			let n = e._svgFactory.createElement("rect");
			t.append(n), n.setAttribute("width", "1"), n.setAttribute("height", "1"), n.setAttribute("fill", "white");
			let i = e._svgFactory.createElement("use");
			t.append(i), i.setAttribute("href", `#${s}`), i.setAttribute("stroke", "none"), i.setAttribute("fill", "black"), i.setAttribute("fill-rule", "nonzero"), i.classList.add("mask");
		}
		let l = e._svgFactory.createElement("use");
		i.append(l), l.setAttribute("href", `#${s}`), c && l.setAttribute("mask", `url(#${c})`);
		let u = l.cloneNode();
		return i.append(u), l.classList.add("mainOutline"), u.classList.add("secondaryOutline"), this.updateProperties(i, t), this.#t.set(r, i), r;
	}
	finalizeDraw(e, t) {
		this.#o.delete(e), this.updateProperties(e, t);
	}
	updateProperties(t, n) {
		if (!n) return;
		let { root: r, bbox: i, rootClass: a, path: o } = n, s = typeof t == "number" ? this.#t.get(t) : t;
		if (s) {
			if (r && this.#x(s, r), i && e.#v(s, i), a) {
				let { classList: e } = s;
				for (let [t, n] of Object.entries(a)) e.toggle(t, n);
			}
			if (o) {
				let e = s.firstElementChild.firstElementChild;
				this.#x(e, o);
			}
		}
	}
	updateParent(e, t) {
		if (t === this) return;
		let n = this.#t.get(e);
		n && (t.#e.append(n), this.#t.delete(e), t.#t.set(e, n));
	}
	remove(e) {
		this.#o.delete(e), this.#e !== null && (this.#t.get(e).remove(), this.#t.delete(e));
	}
	destroy() {
		this.#e = null;
		for (let e of this.#t.values()) e.remove();
		this.#t.clear(), this.#o.clear(), this.#a?.disconnect(), this.#a = null, this.#n &&= (e.#p.get(this.#n)?.drawLayer === this && (e.#m(this.#n), e.#p.delete(this.#n), e.#f.delete(this.#n), e.#f.size === 0 && (e.#l?.abort(), e.#l = null, e.#d = !1)), null);
	}
};
function wa(e) {
	return `${(e * 100).toFixed(2)}%`;
}
var Ta = class e {
	#e = [];
	#t = /* @__PURE__ */ new Map();
	#n = null;
	#r = 0;
	#i = 0;
	#a = 0;
	static #o = null;
	constructor(e, t, n, r) {
		this.#r = e, this.#e = t, this.#i = n.rawDims.pageWidth, this.#a = n.rawDims.pageHeight, this.#n = r;
	}
	render() {
		let t = document.createElement("div");
		t.className = "textLayerImages";
		for (let e = 0; e < this.#e.length; e += 6) {
			let n = this.#s(this.#e.subarray(e, e + 6));
			n && t.append(n);
		}
		return t.addEventListener("contextmenu", (t) => {
			if (!(t.target instanceof HTMLCanvasElement)) return;
			let n = t.target, r = this.#t.get(n);
			if (!r) return;
			let i = e.#o?.deref();
			if (i === n) return;
			i && (i.width = 0, i.height = 0), e.#o = new WeakRef(n);
			let { inverseTransform: a, x1: o, y1: s, width: c, height: l } = r, u = this.#n(), d = Math.ceil(o * u.width), f = Math.ceil(s * u.height), p = Math.floor((o + c / this.#i) * u.width), m = Math.floor((s + l / this.#a) * u.height);
			n.width = p - d, n.height = m - f;
			let h = n.getContext("2d");
			h.setTransform(...a), h.translate(-d, -f), h.drawImage(u, 0, 0);
		}), t;
	}
	#s([e, t, n, r, i, a]) {
		let o = Math.hypot((i - e) * this.#i, (a - t) * this.#a), s = Math.hypot((n - e) * this.#i, (r - t) * this.#a);
		if (o < this.#r || s < this.#r) return null;
		let c = [
			(i - e) * this.#i / o,
			(a - t) * this.#a / o,
			(n - e) * this.#i / s,
			(r - t) * this.#a / s,
			0,
			0
		], l = q.inverseTransform(c), u = document.createElement("canvas");
		return u.className = "textLayerImagePlaceholder", u.width = 0, u.height = 0, Object.assign(u.style, {
			opacity: 0,
			position: "absolute",
			left: wa(e),
			top: wa(t),
			width: wa(o / this.#i),
			height: wa(s / this.#a),
			transformOrigin: "0% 0%",
			transform: `matrix(${c.join(",")})`
		}), this.#t.set(u, {
			inverseTransform: l,
			width: o,
			height: s,
			x1: e,
			y1: t
		}), u;
	}
};
globalThis._pdfjsTestingUtils = { HighlightOutliner: $i }, globalThis.pdfjsLib = {
	AbortException: re,
	AnnotationEditorLayer: va,
	AnnotationEditorParamsType: x,
	AnnotationEditorType: b,
	AnnotationEditorUIManager: ot,
	AnnotationLayer: Wi,
	AnnotationMode: _,
	AnnotationType: T,
	applyOpacity: Ve,
	build: ii,
	ColorPicker: ai,
	createValidAbsoluteUrl: z,
	CSSConstants: Be,
	DOMSVGFactory: di,
	DrawLayer: Ca,
	FeatureTest: K,
	fetchData: xe,
	findContrastColor: qe,
	getDocument: Jr,
	getFilenameFromUrl: Te,
	getPdfFilenameFromUrl: Ee,
	getRGB: Ne,
	getRGBA: Me,
	getUuid: ue,
	GlobalWorkerOptions: Fr,
	ImageKind: w,
	InvalidPDFException: te,
	isDataScheme: Ce,
	isPdfFile: we,
	isValidExplicitDest: en,
	makeArr: fe,
	makeMap: J,
	makeObj: pe,
	makeSet: me,
	MathClamp: Y,
	noContextMenu: ke,
	normalizeUnicode: le,
	OPS: O,
	OutputScale: Le,
	PasswordException: ee,
	PasswordResponses: A,
	PDFDataRangeTransport: Xr,
	PDFDateString: je,
	PDFWorker: $r,
	PermissionFlag: S,
	PixelsPerInch: be,
	RenderingCancelledException: Se,
	renderRichText: Je,
	ResponseException: G,
	setLayerDimensions: Ie,
	shadow: H,
	SignatureExtractor: pa,
	stopEvent: Ae,
	SupportedImageMimeTypes: Re,
	TextLayer: Kr,
	TextLayerImages: Ta,
	TouchManager: ft,
	updateUrlHash: B,
	Util: q,
	VerbosityLevel: D,
	version: ri,
	XfaLayer: ye
};
//#endregion
//#region design-sources/canvas-document-reader-entry.js
var Ea = 2e6;
function Da(e) {
	let t = new Uint8Array(e);
	if (t[0] === 255 && t[1] === 254) return new TextDecoder("utf-16le").decode(t);
	if (t[0] === 254 && t[1] === 255) return new TextDecoder("utf-16be").decode(t);
	try {
		return new TextDecoder("utf-8", { fatal: !0 }).decode(t);
	} catch {
		return new TextDecoder("gb18030").decode(t);
	}
}
function Oa(e) {
	let t = "", n;
	for (let r of e) {
		if (typeof r.str != "string") continue;
		let e = r.transform?.[5], i = r.transform?.[4];
		n && !t.endsWith("\n") && (Math.abs(e - n.y) > Math.max(2, (r.height || 10) * .35) ? t += "\n" : i - n.end > 2 && !/\s$/.test(t) && (t += " ")), t += r.str, r.hasEOL && (t += "\n"), n = {
			y: e,
			end: i + (r.width || 0)
		};
	}
	return t.trim();
}
async function ka(e, t) {
	if (!e || e.size > 52428800) throw Error("文档不能超过 50 MB。");
	let n = await e.arrayBuffer(), r = "";
	if (t === "txt" || t === "md") r = Da(n);
	else if (t === "docx") try {
		r = (await u.default.extractRawText({ arrayBuffer: n })).value;
	} catch {
		throw Error("DOCX 解析失败，请确认文件完整且未加密。");
	}
	else if (t === "pdf") {
		Fr.workerSrc = new URL("/canvas-pdf-worker.js?v=20261008-text-tools-import", location.href).href;
		let e = Jr({
			data: new Uint8Array(n),
			cMapUrl: "/canvas-pdf-cmaps/",
			cMapPacked: !0,
			standardFontDataUrl: "/canvas-pdf-fonts/",
			isEvalSupported: !1,
			stopAtErrors: !0,
			verbosity: 0
		}), t;
		try {
			if (t = await e.promise, t.numPages > 300) throw Error("PDF 最多支持 300 页，请拆分后导入。");
			let n = [], i = 0;
			for (let e = 1; e <= t.numPages; e++) {
				let r = await t.getPage(e), a = Oa((await r.getTextContent()).items);
				if (i += a.length, i > Ea) throw Error("文档正文过长，请拆分后导入。");
				n.push(a), r.cleanup();
			}
			if (r = n.join("\n\n"), !r.trim()) throw Error("PDF 没有可提取的正文，扫描件请先转换为文字。");
		} catch (e) {
			throw e.name === "PasswordException" ? Error("PDF 已加密，请解锁后再导入。") : /^PDF (最多|没有)|^文档/.test(e.message) ? e : Error("PDF 解析失败，请确认文件完整且未加密。");
		} finally {
			await e.destroy();
		}
	} else throw Error("不支持此文档格式。");
	if (r = r.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n"), r.length > Ea) throw Error("文档正文过长，请拆分后导入。");
	return {
		text: r,
		markdown: t === "md"
	};
}
//#endregion
export { Da as decodeText, ka as read };
