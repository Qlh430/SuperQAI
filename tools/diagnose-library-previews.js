"use strict";

/**
 * 只读盘点：真实数据目录里有多少资源能拿到缩略图。
 *
 * 回答的是「文件与共享里为什么有的卡片还是类型图标」：按 refType 分组列出
 * 能出图的比例，并给每类挑一个拿不到图的样本，方便判断是解析漏了、还是这
 * 类资源本来就没有图（对话、还在跑的任务、空画布）。不写库、不起服务。
 */

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { resolveResourcePreview } = require("../resource-preview");

const ROOT = path.resolve(__dirname, "..");
const dataDir = process.env.AI_OS_DATA_DIR ? path.resolve(process.env.AI_OS_DATA_DIR) : path.join(ROOT, "data");
const dbPath = path.join(dataDir, "system.sqlite");
const jobsPath = path.join(dataDir, "image-jobs.json");
const canvasPath = process.env.CANVAS_DB_FILE ? path.resolve(process.env.CANVAS_DB_FILE) : path.join(dataDir, "canvas.db");

if (!fs.existsSync(dbPath)) {
  console.error(`system database not found: ${dbPath}`);
  process.exitCode = 1;
} else {
  const database = new DatabaseSync(dbPath, { readOnly: true });
  const rows = database.prepare("SELECT * FROM resources").all();
  database.close();

  let jobs = new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
    jobs = new Map(Object.entries(parsed.jobs || parsed));
  } catch {
    jobs = new Map();
  }

  let boards = new Map();
  if (fs.existsSync(canvasPath)) {
    const canvasDb = new DatabaseSync(canvasPath, { readOnly: true });
    const boardRows = canvasDb.prepare(`
      SELECT b.external_id AS id,
             (SELECT COUNT(*) FROM nodes n WHERE n.board_pk = b.pk) AS node_count,
             COALESCE((
               SELECT json_group_array(source)
                 FROM (
                   SELECT source FROM node_previews p
                    WHERE p.board_pk = b.pk AND p.source != ''
                    ORDER BY p.z_order DESC, p.updated_at DESC
                    LIMIT 4
                 )
             ), '[]') AS previews
        FROM boards b
       WHERE b.migration_state = 'active'
    `).all();
    canvasDb.close();
    boards = new Map(boardRows.map((row) => {
      let previewImages = [];
      try {
        previewImages = JSON.parse(row.previews);
      } catch {
        previewImages = [];
      }
      return [String(row.id), {
        previewImages: Array.isArray(previewImages) ? previewImages : [],
        nodeCount: Number(row.node_count || 0),
      }];
    }));
    const withImages = [...boards.values()].filter((board) => board.previewImages.length).length;
    const emptyBoards = [...boards.values()].filter((board) => !board.nodeCount).length;
    const nodeCounts = [...boards.values()].map((board) => board.nodeCount).sort((left, right) => right - left);
    console.log(`canvas boards=${boards.size} withPreviewImages=${withImages} emptyBoards=${emptyBoards} nodeCounts=${nodeCounts.join(",")}`);
  } else {
    console.log("canvas database not found, canvas rows are counted as preview-less");
  }

  const byRefType = new Map();
  const missing = new Map();
  let withPreview = 0;
  let deleted = 0;
  const byKind = { image: 0, video: 0 };

  for (const row of rows) {
    const resource = {
      type: row.type,
      refType: row.ref_type,
      refId: row.ref_id,
      metadata: JSON.parse(row.metadata_json || "{}"),
      deletedAt: row.deleted_at,
    };
    if (resource.deletedAt) deleted += 1;
    const preview = resolveResourcePreview(resource, { jobs, boards });
    const key = String(row.ref_type || "(none)");
    const bucket = byRefType.get(key) || { total: 0, preview: 0 };
    bucket.total += 1;
    if (preview) {
      withPreview += 1;
      bucket.preview += 1;
      byKind[preview.kind] += 1;
    } else if (!missing.has(key)) {
      missing.set(key, { title: row.title, refId: row.ref_id, type: row.type });
    }
    byRefType.set(key, bucket);
  }

  console.log(`resources=${rows.length} deleted=${deleted} withPreview=${withPreview} image=${byKind.image} video=${byKind.video}`);
  for (const [key, bucket] of [...byRefType.entries()].sort((left, right) => right[1].total - left[1].total)) {
    console.log(`  ${key}: ${bucket.preview}/${bucket.total}`);
  }
  for (const [key, sample] of missing) {
    console.log(`  no-preview sample ${key}: ${JSON.stringify(sample)}`);
  }
}
