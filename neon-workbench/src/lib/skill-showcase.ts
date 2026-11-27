export type SkillCase = { id?: string; path?: string; url?: string; posterUrl?: string; type: string; title?: string }
export type SkillCategory = { id: string; label: string }
export type SkillPresentation = { displayName?: string; categories?: string[]; summary: string; capabilities: string; inputs: string; outputs: string; coverId: string; media: SkillCase[]; updatedAt?: string }
export type SquareSkill = {
  id: string; label: string; description: string; category: string; categoryLabel: string
  scope: string; enabled: boolean; featured: boolean; cover?: string; coverId?: string; coverMedia?: SkillCase; license?: string
  presentation?: SkillPresentation; categories?: SkillCategory[]
  metadata?: { version?: string }
  install?: { source?: string; version?: string; compatibility?: { status?: string; detail?: string; dependencies?: string[] }; dependencies?: string[] }
}
export type SkillDetail = SquareSkill & {
  instructions: string; references: { path: string; bytes?: number }[]; media: SkillCase[]; canManagePresentation?: boolean; categoryOptions?: SkillCategory[]
}

export function compareSkills(a: { id: string; label?: string; name?: string; scope?: string }, b: { id: string; label?: string; name?: string; scope?: string }) {
  return (a.label || a.name || a.id).localeCompare(b.label || b.name || b.id, "zh-CN")
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    || (a.scope || "").localeCompare(b.scope || "", "en")
}

export function skillQuery(skill: { id: string; scope?: string }) {
  return `skill_id=${encodeURIComponent(skill.id)}${skill.scope === "public" || skill.scope === "system" ? "&scope=public" : ""}`
}
export function skillMediaUrl(skill: { id: string; scope?: string }, media: SkillCase, options: { thumbnail?: boolean; poster?: boolean } = {}) {
  const key = media.id ? `media_id=${encodeURIComponent(media.id)}` : `path=${encodeURIComponent(media.path || "")}`
  return `/api/skills/media?${skillQuery(skill)}&${key}${options.thumbnail ? "&thumbnail=1" : ""}${options.poster ? "&poster=1" : ""}`
}
export function skillCover(skill: SquareSkill) {
  return skill.coverMedia || skill.presentation?.media.find(item => item.id === (skill.coverId || skill.presentation?.coverId))
    || skill.presentation?.media[0] || (skill.cover ? { path: skill.cover, type: "image/unknown" } : undefined)
}
export const skillCategories = (skill: SquareSkill): SkillCategory[] => skill.categories?.length ? skill.categories : [{ id: skill.category, label: skill.categoryLabel || "通用" }]
export const emptyPresentation = (): SkillPresentation => ({ displayName: "", categories: [], summary: "", capabilities: "", inputs: "", outputs: "", coverId: "", media: [] })
