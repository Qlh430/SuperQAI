"use strict";

const { normalizeImageResultData } = require("./media-image-contract");

// Only call this for a received upstream response, never for a transport error.
function isQuotaRejection(status, detail) {
  const httpStatus = Number(status);
  if (!(httpStatus >= 200 && httpStatus < 300) && !(httpStatus >= 400 && httpStatus < 500)) return false;
  let payload = detail;
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch { payload = null; }
  }
  if (payload && typeof payload === "object") {
    // A task ID/output is evidence of acceptance, even with contradictory errors.
    if (payload.task_id || payload.taskId || payload.id
      || payload.data?.task_id || payload.data?.taskId || payload.data?.id
      || (Array.isArray(payload.data) && payload.data.some(item => item?.task_id || item?.taskId || item?.id))
      || payload.choices?.length || payload.candidates?.length || payload.output?.length
      || normalizeImageResultData(payload).length) return false;
  }
  const error = payload?.error || payload?.data?.error;
  const code = error?.code || error?.type || payload?.code || payload?.statusCode || payload?.data?.code;
  const serviceFailure = code && !["0", "200", "ok", "success"].includes(String(code).toLowerCase());
  if (httpStatus < 400 && !error && payload?.success !== false && !serviceFailure) return false;
  if (httpStatus === 402) return true;
  const message = payload && typeof payload === "object"
    ? [code, typeof error === "string" ? error : error?.message,
      payload.message, payload.msg, payload.data?.message].filter(Boolean).join(" ")
    : String(detail || "");
  const text = message.toLowerCase().replace(/[_-]+/g, " ");
  return /\binsufficient\s+(?:user\s+)?(?:balance|quota|credits?|funds)\b/.test(text)
    || /\b(?:balance|quota|credits?|funds)\b.{0,40}\b(?:insufficient|exhausted|depleted|exceeded|not enough)\b/.test(text)
    || /\b(?:exceeded|exhausted)\b.{0,25}\b(?:quota|credits?|balance)\b/.test(text)
    || /\bbilling\s+hard\s+limit\s+reached\b/.test(text)
    || /(?:余额|额度|配额|积分|点数).{0,12}(?:不足|耗尽|用尽|超限|已用完)|(?:超出|超过).{0,12}(?:额度|配额)|欠费/.test(text);
}

module.exports = { isQuotaRejection };
