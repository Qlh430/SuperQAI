const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const root = __dirname
const settings = fs.readFileSync(path.join(root, "src/pages/advanced-settings.tsx"), "utf8")
const management = fs.readFileSync(path.join(root, "src/pages/management.tsx"), "utf8")

test("settings passes the authenticated admin role into Skill management", () => {
  assert.match(management, /<SkillsSettings\s+notify=\{notify\}\s+admin=\{admin\}\s*\/>/)
})

test("only administrators can toggle instance-wide public Skills", () => {
  assert.match(settings, /\{\(scope !== "public" \|\| admin\)\s*&&\s*<Switch/)
})

test("administrators can manage installed public Skills", () => {
  assert.match(settings, /\{\(ownerScope \|\| publicScope && admin\)\s*&&\s*<CardContent/)
  assert.doesNotMatch(settings, /scope !== "shared"\s*&&\s*<Button/)
})
