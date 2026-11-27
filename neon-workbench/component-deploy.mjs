import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { execFileSync } from "node:child_process"
import visualPresetBuild from "./visual-presets-build.cjs"
export const { compileGeneratorComposer } = visualPresetBuild
export const cameraPreviewMappings = "camera-preview-mappings"
export const stageOnlyPresetComponents = [cameraPreviewMappings, "visual-presets-script"]
const canvasImageViewer = "canvas-image-viewer"
const canvasImageHistory = "canvas-image-history"
const canvasImageHistorySync = "canvas-image-history-sync"
const canvasReferenceSync = "canvas-reference-sync"
const canvasReferencePickerPerformance = "canvas-reference-picker-performance"
const canvasImageParameters = "canvas-image-parameters"
const h3CommerceSubmission = "h3-commerce-submission"
const canvasFileImportValidation = "canvas-file-import-validation"
const naturalPhotoFidelity = "natural-photo-fidelity"
const naturalPhotoOutput = "natural-photo-output"
const naturalPhotoBriefStatus = "natural-photo-brief-status"
const canvasAgentImageThumbnails = "canvas-agent-image-thumbnails"
const canvasAgentComposerInteraction = "canvas-agent-composer-interaction"
const imagePromptMentions = "image-prompt-mentions"
const agentPromptMentions = "agent-prompt-mentions"
const livePromptMentionPreviews = "live-prompt-mention-previews"
const agentWorkflowRecovery = "agent-workflow-recovery"
const canvasWireVideoPrompt = "canvas-wire-video-prompt"
const canvasSelectionPromptCursor = "canvas-selection-prompt-cursor"
const canvasPhotoReferenceFeedback = "canvas-photo-reference-feedback"
const canvasAgentPoster = "canvas-agent-poster"
const canvasAgentCreativeBatch = "canvas-agent-creative-batch"
const canvasAgentCreativeBatchLayout = "canvas-agent-creative-batch-layout"
const canvasAgentUpscale = "canvas-agent-upscale"
const canvasAgentCutout = "canvas-agent-cutout"
const canvasAgentOrganize = "canvas-agent-organize"
const canvasAgentAudio = "canvas-agent-audio"
const canvasTextResize = "canvas-text-resize"
export const stageOnlyComponents = [...stageOnlyPresetComponents, canvasImageViewer, canvasImageHistorySync, canvasReferenceSync, canvasImageParameters, h3CommerceSubmission, canvasFileImportValidation, naturalPhotoFidelity, naturalPhotoOutput, naturalPhotoBriefStatus, imagePromptMentions, agentPromptMentions, livePromptMentionPreviews, agentWorkflowRecovery, canvasWireVideoPrompt, canvasSelectionPromptCursor, canvasPhotoReferenceFeedback, canvasAgentPoster, canvasAgentCreativeBatch, canvasAgentCreativeBatchLayout, canvasAgentUpscale, canvasAgentCutout, canvasAgentOrganize, canvasAgentAudio, canvasTextResize, canvasAgentImageThumbnails, canvasAgentComposerInteraction]
const modules = Object.create(null)
stageOnlyComponents.push(canvasReferencePickerPerformance)
stageOnlyComponents.push("canvas-text-renderer-source")
const modulePairs = names => names.map(name => [`design-sources/${name}`, name])
const previewInventory = JSON.parse(fs.readFileSync(new URL("./design-sources/visual-preset-release.json", import.meta.url), "utf8"))
const previewPairs = previewInventory.files.map(({ path: file }) => [`public/${file}`, file])
stageOnlyComponents.push("visual-preview-assets")
modules["visual-preview-assets"] = previewPairs
modules["canvas-text-renderer-source"] = modulePairs(["canvas-text-node-renderer.js"])
modules[naturalPhotoBriefStatus] = [["../host-sources/app/canvas-agent-ui.js", "canvas-agent-ui.js"]]
modules[canvasAgentImageThumbnails] = ["canvas-agent.css", "canvas-agent-ui.js", "canvas-note-node-renderer.js"]
  .map(file => [`../host-sources/app/${file}`, file])
modules[canvasAgentComposerInteraction] = [
  ["../host-sources/app/canvas-agent.css", "canvas-agent.css"],
  ["../host-sources/app/canvas-agent-ui.js", "canvas-agent-ui.js"],
  ["../host-sources/app/canvas-note-node-renderer.js", "canvas-note-node-renderer.js"],
  ["design-sources/canvas-text-node-renderer.js", "canvas-text-node-renderer.js"],
]
modules[naturalPhotoOutput] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ["../host-sources/app/canvas-agent-core.js", "canvas-agent-core.js"],
  ["../host-sources/app/canvas-agent-conversation.js", "canvas-agent-conversation.js"],
  ["../host-sources/app/canvas-agent-ui.js", "canvas-agent-ui.js"],
  ["../host-sources/app/skill-packages/natural-aesthetic-product-photography/interaction.json", "skill-interactions/natural-aesthetic-product-photography.json"],
]
modules[canvasAgentPoster] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ["../host-sources/app/canvas-agent-core.js", "canvas-agent-core.js"],
  ["../host-sources/app/canvas-agent-ui.js", "canvas-agent-ui.js"],
]
modules[canvasAgentCreativeBatch] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ...["canvas-agent-core.js", "canvas-agent-conversation.js", "canvas-agent-capabilities.js", "canvas-agent-ui.js"]
    .map(name => [`../host-sources/app/${name}`, name]),
]
modules[canvasAgentCreativeBatchLayout] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ["../host-sources/app/canvas-agent-ui.js", "canvas-agent-ui.js"],
]
for (const name of stageOnlyPresetComponents) modules[name] = modulePairs(["flora-generator-composer.js"])
modules[canvasImageViewer] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ...modulePairs(["flora-node-shell.js", "flora-node-shell.css"]),
]
modules.cutout = modulePairs(["background-removal-ui.js", "background-removal-service.js", "canvas-features/tool-cutout.js"])
modules.h3 = [
  ...modulePairs(["comfyui-client.js", "minimax-h3-workflow.js", "minimax-h3-task-service.js", "h3-commerce-workflow.js", "canvas-h3-node-renderer.js", "flora-node-shell.css", "workflows/h3-commerce-video.json"]),
  ["design-sources/script-before-save-bridge.js", "script.js"],
]
modules["h3-commerce-frontend"] = [
  ...modulePairs(["canvas-h3-node-renderer.js", "flora-generator-composer.js", "flora-node-shell.css"]),
  ["design-sources/script-before-save-bridge.js", "script.js"],
]
modules["h3-commerce-inputs"] = [
  ...modulePairs(["canvas-h3-node-renderer.js", "flora-generator-parameters.js", "flora-node-shell.css"]),
  ["design-sources/script-before-save-bridge.js", "script.js"],
]
modules[h3CommerceSubmission] = [["design-sources/script-before-save-bridge.js", "script.js"]]
modules[canvasFileImportValidation] = [["design-sources/script-before-save-bridge.js", "script.js"]]
modules[naturalPhotoFidelity] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ["design-sources/flora-generator-composer.js", "flora-generator-composer.js"],
  ["../host-sources/app/canvas-agent-conversation.js", "canvas-agent-conversation.js"],
  ["../host-sources/app/canvas-agent-ui.js", "canvas-agent-ui.js"],
  ["../host-sources/app/canvas-agent.css", "canvas-agent.css"],
]
modules[imagePromptMentions] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ...modulePairs(["flora-generator-composer.js", "flora-node-shell.css"]),
]
modules[agentPromptMentions] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ["../host-sources/app/canvas-agent-ui.js", "canvas-agent-ui.js"],
]
modules[livePromptMentionPreviews] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ...modulePairs(["flora-generator-composer.js"]),
]
modules[agentWorkflowRecovery] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ["../host-sources/app/canvas-agent-ui.js", "canvas-agent-ui.js"],
  ...modulePairs(["canvas-text-node-renderer.js"]),
]
modules[canvasWireVideoPrompt] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ...modulePairs(["flora-generator-composer.js", "canvas-scene-layer.js"]),
]
modules[canvasSelectionPromptCursor] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ...modulePairs(["flora-node-shell.css"]),
]
modules[canvasPhotoReferenceFeedback] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ...modulePairs(["flora-generator-composer.js"]),
]
modules["h3-commerce-agent-runtime"] = [
  "canvas-agent-capabilities.js", "canvas-agent-tool-adapters.js", "canvas-agent-skill-contract.js",
  "canvas-agent-core.js", "canvas-agent-ui.js",
].map(name => [`../host-sources/app/${name}`, name])
modules["h3-commerce-package-backend"] = [
  "h3-commerce-package-service.js", "server-components/composition.js",
].map(name => [`../host-sources/app/${name}`, name])
modules["h3-commerce-backend"] = [
  ...modulePairs(["minimax-h3-task-service.js", "media-generation-http-api.js", "h3-commerce-workflow.js", "workflows/h3-commerce-video.json"]),
  ...[
    "canvas-agent-capabilities.js", "canvas-agent-runtime.js",
    "canvas-agent-http-api.js", "canvas-agent-skill-contract.js", "canvas-agent-core.js",
    "skills/canvas-agent-core/SKILL.md", "media-provider-bridge.js", "server.js",
    "server-components/composition.js", "server-components/manifest.js", "h3-commerce-package-service.js",
  ].map(name => [`../host-sources/app/${name}`, name]),
  ...["SKILL.md", "agent.skill.json", "interaction.json", "agents/openai.yaml",
    "references/assets.md", "references/onboarding.md", "references/production.md",
    "references/prompts.md", "references/selling-copy.md", "references/workflow-contract.md",
    "scripts/validate_package.py",
    "assets/workflows/h3-commerce-prefix5-2images.json",
    "assets/workflows/h3-commerce-prefix5-4images-UNTESTED.json",
    "assets/workflows/h3-commerce-prefix5-4images.json",
  ].map(name => [`../host-sources/app/skills/h3-commerce-video/${name}`, `skills/h3-commerce-video/${name}`]),
]
modules.chat = modulePairs(["provider-protocol-engine.js", "chat-http-api.js"])
modules["chat-backend"] = modules.chat
modules.naming = [["dist/workbench.js", "neon-workbench.js"], ["host-bridge.js", "neon-host-bridge.js"]]
modules["workbench-frontend"] = [...modules.naming, ["dist/neon-workbench.css", "neon-workbench.css"]]
modules["brand-display"] = [
  ["design-sources/desktop-startup.html", "desktop/startup.html"],
  ["design-sources/desktop-shell-before-bridge.js", "desktop-shell.js"],
  ["../host-sources/app/neon-bridge.css", "neon-bridge.css"],
]
modules["media-naming"] = [
  ...modulePairs(["resource-access.js", "curated-asset-service.js", "canvas-media-gc-service.js", "audio-output-persistence.js", "flora-generation-history.js", "comfy-workflow-task-service.js", "minimax-h3-task-service.js"]),
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ...["asset-library-service.js", "asset-library-http-api.js", "server.js", "media-http-api.js", "image-generation-http-api.js", "image-job-http-api.js", "image-job-manager.js", "server-components/composition.js", "canvas-media-node-renderer.js", "canvas-asset-collection-rules.js", "runninghub-outpaint-service.js"].map(name => [`../host-sources/app/${name}`, name]),
  ...modulePairs(["resource-http-api.js"]),
  ["dist/workbench.js", "neon-workbench.js"],
  ["dist/neon-workbench.css", "neon-workbench.css"],
]
modules["media-naming-backend"] = [
  ["../host-sources/app/asset-library-service.js", "asset-library-service.js"],
  ["design-sources/resource-http-api.js", "resource-http-api.js"],
  ["design-sources/curated-asset-service.js", "curated-asset-service.js"],
]
modules["minimax-h3-quality-backend"] = modulePairs(["minimax-h3-workflow.js"])
modules["canvas-feature-core"] = modulePairs(["canvas-feature-registry.js"])
modules["canvas-node-catalog"] = [["../host-sources/app/canvas-node-catalog.js", "canvas-node-catalog.js"]]
modules["canvas-light-visual"] = modulePairs(["canvas-representation-host.js"])
modules["canvas-text-scroll"] = modulePairs(["canvas-representation-host.js", "canvas-node-visuals.js"])
modules["canvas-fullscreen-original-preview"] = [["design-sources/script-before-save-bridge.js", "script.js"]]
modules[canvasImageHistory] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ...modulePairs(["flora-generation-history.js"]),
]
modules[canvasImageHistorySync] = modules[canvasImageHistory]
modules[canvasReferenceSync] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ...modulePairs(["flora-generator-composer.js"]),
]
modules[canvasReferencePickerPerformance] = modules[canvasReferenceSync]
modules[canvasImageParameters] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ...modulePairs(["flora-node-shell.js", "flora-generator-parameters.js"]),
]
modules["canvas-asset-library"] = modulePairs(["canvas-asset-library.js", "neon-page-rebuild.css"])
modules["startup-gate"] = [
  ["../host-sources/app/startup-overlay.js", "startup-overlay.js"],
  ["design-sources/startup-overlay.css", "startup-overlay.css"],
]
// Keep generator empty-state icon previews isolated from unrelated canvas fixes.
modules["generator-empty-placeholder"] = modulePairs(["canvas-node-visuals.js", "flora-generator-composer.js", "flora-node-shell.css"])
modules["image-visual-presets"] = [
  ...modulePairs(["flora-generator-composer.js", "flora-node-shell.css"]),
  ["../host-sources/app/styles.css", "styles.css"],
  ["../host-sources/app/neon-bridge.css", "neon-bridge.css"],
  ["../host-sources/app/desktop-shell.css", "desktop-shell.css"],
  ["design-sources/script-before-save-bridge.js", "script.js"],
]
modules["visual-presets-ui"] = [
  ...modulePairs(["flora-generator-composer.js", "flora-node-shell.css"]),
  ["../host-sources/app/styles.css", "styles.css"],
  ["../host-sources/app/neon-bridge.css", "neon-bridge.css"],
]
modules["audio-node-appearance"] = [
  ...modulePairs(["canvas-node-visuals.js", "canvas-audio-generator.js", "canvas-audio-generator.css", "flora-generator-composer.js", "flora-generator-parameters.js", "flora-node-shell.js", "flora-node-shell.css"]),
  ["design-sources/script-before-save-bridge.js", "script.js"],
]
modules["canvas-redraw-frontend"] = [
  ...modulePairs(["flora-node-shell.js", "script-before-save-bridge.js", "neon-canvas-surface.css"])
    .map(pair => pair[0].endsWith("/script-before-save-bridge.js") ? [pair[0], "script.js"] : pair),
]
modules["ace-step-backend"] = [
  ...modulePairs(["provider-http-api.js", "comfyui-client.js", "ace-step-task-service.cjs"]),
  ["../host-sources/app/server-components/composition.js", "server-components/composition.js"],
  ["design-sources/workflows/ace-step-music.json", "workflows/ace-step-music.json"],
]
modules["qwen-tts-backend"] = [
  ...modulePairs(["provider-http-api.js", "audio-output-persistence.js", "qwen-tts-task-service.cjs", "qwen-tts-reference.cjs", "workflows/qwen-tts-three-in-one.json"]),
  ["../host-sources/app/server-components/composition.js", "server-components/composition.js"],
]
modules["canvas-redraw-backend"] = [
  ...modulePairs(["comfy-workflow-task-service.js", "media-generation-http-api.js", "workflows/qwen-image21-redraw.json"]),
  ["../host-sources/app/server-components/composition.js", "server-components/composition.js"],
  ["../host-sources/app/server-config.js", "server-config.js"],
  ["../host-sources/app/server.js", "server.js"],
]
modules["canvas-media-stability"] = [
  ["../host-sources/app/image-resource-manager.js", "image-resource-manager.js"],
  ...modulePairs(["canvas-representation-host.js", "canvas-representation-manager.js", "canvas-node-visuals.js", "flora-connection-interaction.js", "flora-node-shell.js", "flora-node-shell.css", "neon-canvas-surface.css"]),
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ["dist/neon-workbench.css", "neon-workbench.css"],
]
modules["v302-targeted-fixes"] = [
  ...modulePairs(["canvas-representation-host.js", "canvas-node-visuals.js", "flora-node-shell.js", "flora-node-shell.css", "neon-canvas-surface.css", "flora-connection-interaction.js", "flora-generator-composer.js", "script-before-save-bridge.js", "background-removal-ui.js"])
    .map(pair => pair[0].endsWith("/script-before-save-bridge.js") ? [pair[0], "script.js"] : pair),
  ["dist/neon-workbench.css", "neon-workbench.css"],
  ["../host-sources/app/canvas-note-node-renderer.js", "canvas-note-node-renderer.js"],
  ["../host-sources/app/core/canvas-node-registry.js", "core/canvas-node-registry.js"],
]
// Group visual/auto-fit hotfix: deploy only the group rendering files and the
// canonical canvas bridge assembled in the same way as deploy.mjs.
modules["canvas-group-visual"] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ["design-sources/canvas-node-visuals.js", "canvas-node-visuals.js"],
  ["design-sources/canvas-scene-layer.js", "canvas-scene-layer.js"],
  ["design-sources/canvas-representation-host.js", "canvas-representation-host.js"],
  ["design-sources/neon-canvas-surface.css", "neon-canvas-surface.css"],
]
modules["canvas-final-adjustments"] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ["design-sources/canvas-text-node-renderer.js", "canvas-text-node-renderer.js"],
  ["design-sources/canvas-node-visuals.js", "canvas-node-visuals.js"],
  ["design-sources/canvas-scene-layer.js", "canvas-scene-layer.js"],
  ["design-sources/canvas-representation-host.js", "canvas-representation-host.js"],
  ["design-sources/flora-connection-interaction.js", "flora-connection-interaction.js"],
  ["design-sources/flora-node-shell.css", "flora-node-shell.css"],
  ["../host-sources/app/canvas-note-node-renderer.js", "canvas-note-node-renderer.js"],
  ["../host-sources/app/styles.css", "styles.css"],
]
modules["canvas-interaction-final"] = [
  ...modulePairs(["script-before-save-bridge.js", "canvas-representation-host.js", "canvas-feature-registry.js", "flora-node-shell.js", "flora-node-shell.css", "startup-overlay.css", "canvas-node-visuals.js", "canvas-scene-layer.js"])
    .map(pair => pair[0].endsWith("/script-before-save-bridge.js") ? [pair[0],"script.js"] : pair),
  ["design-sources/desktop-startup.html", "desktop/startup.html"],
  ["design-sources/neon-auth.css", "neon-auth.css"],
  ["../host-sources/app/canvas-agent-capabilities.js", "canvas-agent-capabilities.js"],
  ["../host-sources/app/canvas-agent-tool-adapters.js", "canvas-agent-tool-adapters.js"],
]
modules["canvas-agent-context"] = [
  ["../host-sources/app/canvas-agent-core.js", "canvas-agent-core.js"],
  ["../host-sources/app/canvas-agent-skill-contract.js", "canvas-agent-skill-contract.js"],
  ["../host-sources/app/canvas-agent-conversation.js", "canvas-agent-conversation.js"],
  ["../host-sources/app/canvas-agent-ui.js", "canvas-agent-ui.js"],
  ["../host-sources/app/canvas-agent.css", "canvas-agent.css"],
  ["../host-sources/app/neon-bridge.css", "neon-bridge.css"],
  ["../host-sources/app/module-manifest.js", "module-manifest.js"],
]
modules["canvas-agent-ui"] = [
  ["../host-sources/app/canvas-agent-ui.js", "canvas-agent-ui.js"],
  ["../host-sources/app/canvas-agent.css", "canvas-agent.css"],
]
modules["canvas-agent-wizard-frontend"] = [
  ["../host-sources/app/canvas-agent-conversation.js", "canvas-agent-conversation.js"],
  ["../host-sources/app/canvas-agent-capabilities.js", "canvas-agent-capabilities.js"],
  ["../host-sources/app/canvas-agent-ui.js", "canvas-agent-ui.js"],
  ["../host-sources/app/canvas-agent.css", "canvas-agent.css"],
  ["../host-sources/app/skill-packages/natural-aesthetic-product-photography/interaction.json", "skill-interactions/natural-aesthetic-product-photography.json"],
  ["../host-sources/app/skills/h3-commerce-video/interaction.json", "skill-interactions/h3-commerce-video.json"],
  ["../host-sources/app/canvas-agent-picker-cursor.svg", "canvas-agent-picker-cursor.svg"],
  ["../host-sources/app/module-manifest.js", "module-manifest.js"],
]
modules["canvas-agent-backend"] = [
  ["../host-sources/app/canvas-agent-core.js", "canvas-agent-core.js"],
  ["../host-sources/app/canvas-agent-capabilities.js", "canvas-agent-capabilities.js"],
  ["../host-sources/app/canvas-agent-tool-adapters.js", "canvas-agent-tool-adapters.js"],
  ...["agent-model-settings.js", "provider-executor.js", "canvas-agent-provider-bridge.js"]
    .map(name => [`../host-sources/app/${name}`, name]),
  ["../host-sources/app/canvas-agent-runtime.js", "canvas-agent-runtime.js"],
  ["../host-sources/app/canvas-agent-skill-contract.js", "canvas-agent-skill-contract.js"],
  ["../host-sources/app/canvas-agent-http-api.js", "canvas-agent-http-api.js"],
  ["../host-sources/app/skill-registry.js", "skill-registry.js"],
  ["../host-sources/app/skills/canvas-agent-core/SKILL.md", "skills/canvas-agent-core/SKILL.md"],
  ...[
    "ecommerce-image-set",
    "generate-image",
    "poster-design",
    "social-media-pack",
    "product-refinement",
    "edit-image",
  ].map(name => [`../host-sources/app/skills/${name}/SKILL.md`, `skills/${name}/SKILL.md`]),
]
modules["skill-management-ui"] = [
  ["../host-sources/app/system-settings-ui.js", "system-settings-ui.js"],
  ["../host-sources/app/system-settings.css", "system-settings.css"],
  ["../host-sources/app/neon-bridge.css", "neon-bridge.css"],
  ["../host-sources/app/module-manifest.js", "module-manifest.js"],
]
modules["skill-management-backend"] = [
  ["../host-sources/app/static-http-api.js", "static-http-api.js"],
  ["../host-sources/app/skill-import-manager.js", "skill-import-manager.js"],
  ["../host-sources/app/skill-registry.js", "skill-registry.js"],
  ["../host-sources/app/skill-http-api.js", "skill-http-api.js"],
  ["../host-sources/app/canvas-agent-http-api.js", "canvas-agent-http-api.js"],
  ["../host-sources/app/server-components/composition.js", "server-components/composition.js"],
  ["../host-sources/app/server.js", "server.js"],
]
modules["release-host-sync"] = [
  "backup-service.js", "canvas-image-info.js", "desktop/main.js", "desktop/icon.ico", "desktop/autostart.js", "desktop/migration.html",
  "assets/branding/bendo-logo.svg", "provider-catalog-health.js", "provider-telemetry-service.js",
  "bundled-skills/commercial-product-photography-10/SKILL.md",
  "bundled-skills/commercial-product-photography-10/assets/cover.png",
  "bundled-skills/fashion-ecommerce-ai-model-video/assets/cover.mp4",
  ...["SKILL.md", "README.md", "references/01-product-front-back.md", "references/02-fashion-model-front.md",
    "references/03-natural-turn-video.md", "references/04-canvas-execution.md"]
    .map(file => `bundled-skills/fashion-ecommerce-ai-model-video/${file}`),
  "desktop/portable-setup.js", "desktop/portable-setup.html",
  "desktop/rollback-retention.js", "desktop/update-install.js", "desktop/updater.js",
  "desktop/runtime-retention.js", "desktop/update-helper.js", "desktop/update-files.js",
  "canvas-agent-conversation-store.js", "canvas-agent-core.js", "canvas-agent-http-api.js",
  "canvas-agent-runtime.js", "canvas-agent-conversation.js", "canvas-agent-capabilities.js", "skills/canvas-agent-core/SKILL.md",
  "skill-registry.js", "skill-http-api.js", "skill-import-manager.js",
  "skills/h3-commerce-video/interaction.json", "skills/poster-design/SKILL.md",
  "skills/poster-design/references/creative-brief.md", "skills/poster-design/references/festival-poster.md",
  "skills/poster-design/references/poster-playbook.md",
].map(name => [`../host-sources/app/${name}`, name]).concat(modulePairs([
  "comfy-workflow-task-service.js", "media-generation-http-api.js",
  "h3-commerce-workflow.js", "minimax-h3-task-service.js",
  "flora-generator-composer.js",
])).concat(
  ["SKILL.md", "agent.skill.json", "interaction.json", "references/photography-methods.md", "references/visual-method-catalog.md", "assets/cover.png"]
    .map(file => [
      `../host-sources/app/skill-packages/natural-aesthetic-product-photography/${file}`,
      `bundled-skills/natural-aesthetic-product-photography/${file}`,
    ]),
).concat(previewPairs, [
  ["../host-sources/app/server.js", "server.js"],
  ["../host-sources/app/server-components/composition.js", "server-components/composition.js"],
])
modules["skill-wizard-backend"] = [
  ["../host-sources/app/canvas-agent-conversation.js", "canvas-agent-conversation.js"],
  ["../host-sources/app/canvas-agent-runtime.js", "canvas-agent-runtime.js"],
  ["../host-sources/app/skill-packages/natural-aesthetic-product-photography/interaction.json", "skill-interactions/natural-aesthetic-product-photography.json"],
]
// Only fixed owner inputs may cross the workbench source root.
const hostInputs = new Set(["../host-sources/app/canvas-note-node-renderer.js", "../host-sources/app/core/canvas-node-registry.js", "../host-sources/app/canvas-node-catalog.js", "../host-sources/app/styles.css", "../host-sources/app/canvas-agent-capabilities.js", "../host-sources/app/canvas-agent-tool-adapters.js", "../host-sources/app/canvas-agent-core.js", "../host-sources/app/module-manifest.js"])
hostInputs.add("../host-sources/app/image-resource-manager.js")
hostInputs.add("../host-sources/app/canvas-agent-ui.js")
hostInputs.add("../host-sources/app/canvas-agent.css")
hostInputs.add("../host-sources/app/canvas-agent-picker-cursor.svg")
hostInputs.add("../host-sources/app/canvas-agent-conversation.js")
hostInputs.add("../host-sources/app/canvas-agent-skill-contract.js")
hostInputs.add("../host-sources/app/canvas-agent-runtime.js")
hostInputs.add("../host-sources/app/canvas-agent-http-api.js")
hostInputs.add("../host-sources/app/canvas-agent-conversation-store.js")
for (const name of ["agent-model-settings.js", "provider-executor.js", "canvas-agent-provider-bridge.js"]) hostInputs.add(`../host-sources/app/${name}`)
hostInputs.add("../host-sources/app/skill-import-manager.js")
hostInputs.add("../host-sources/app/skill-registry.js")
hostInputs.add("../host-sources/app/skill-http-api.js")
hostInputs.add("../host-sources/app/h3-commerce-package-service.js")
hostInputs.add("../host-sources/app/media-provider-bridge.js")
for (const name of [
  "SKILL.md", "agent.skill.json", "interaction.json", "agents/openai.yaml",
  "references/assets.md", "references/onboarding.md", "references/production.md",
  "references/prompts.md", "references/selling-copy.md", "references/workflow-contract.md",
  "scripts/validate_package.py",
  "assets/workflows/h3-commerce-prefix5-2images.json",
  "assets/workflows/h3-commerce-prefix5-4images-UNTESTED.json",
  "assets/workflows/h3-commerce-prefix5-4images.json",
]) hostInputs.add(`../host-sources/app/skills/h3-commerce-video/${name}`)
hostInputs.add("../host-sources/app/static-http-api.js")
hostInputs.add("../host-sources/app/system-settings-ui.js")
hostInputs.add("../host-sources/app/system-settings.css")
hostInputs.add("../host-sources/app/neon-bridge.css")
hostInputs.add("../host-sources/app/desktop-shell.css")
hostInputs.add("../host-sources/app/skills/canvas-agent-core/SKILL.md")
for (const name of ["ecommerce-image-set", "generate-image", "poster-design", "social-media-pack", "product-refinement", "edit-image"]) {
  hostInputs.add(`../host-sources/app/skills/${name}/SKILL.md`)
}
hostInputs.add("../host-sources/app/startup-overlay.js")
hostInputs.add("../host-sources/app/neon-bridge.css")
hostInputs.add("../host-sources/app/server-components/composition.js")
hostInputs.add("../host-sources/app/server-components/manifest.js")
hostInputs.add("../host-sources/app/server-config.js")
hostInputs.add("../host-sources/app/server.js")
for (const [input] of modules["media-naming"]) if (input.startsWith("../host-sources/app/")) hostInputs.add(input)
for (const [input] of modules["release-host-sync"]) {
  if (input.startsWith("../host-sources/app/")) hostInputs.add(input)
}
for (const [input] of modules["skill-wizard-backend"]) hostInputs.add(input)
export function startupLogo(source) {
  const file = checkedPath(path.resolve(source,"../host-sources/app"),"assets/branding/bendo-logo.svg",{required:true})
  const svg = fs.readFileSync(file,"utf8").trim()
  if (!svg.startsWith('<svg ') || /<script|<image|href=|onload=/i.test(svg)) throw new Error("启动品牌 SVG 必须为受控本地矢量。")
  return svg.replace(/<svg\b[^>]*>/, opening => opening.replace(/\sfill="[^"]*"/, '').replace('<svg ', '<svg width="40" height="40" fill="currentColor" '))
}
export function injectStartupLogo(html, source) {
  const logo = startupLogo(source)
  return html
    .replaceAll('<!-- __BENDO_STARTUP_LOGO__ -->', logo)
    .replace(/(<span class="ai-os-startup-brand-mark" aria-hidden="true">)[\s\S]*?(<\/span>)/, `$1${logo}$2`)
    .replace(/(<span class="ai-os-brand-mark" aria-hidden="true">)[\s\S]*?(<\/span>)/, `$1${logo}$2`)
}
export function compileStartupHtml(source) {
  const css = fs.readFileSync(checkedPath(source,"src/index.css",{required:true}),"utf8")
  const tokens = ["background","foreground","primary","primary-foreground","secondary","muted-foreground","radius"].map(name=>{
    const value=css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]
    if(!value)throw new Error(`启动页缺少令牌 ${name}`)
    return `--${name}: ${value};`
  }).join("\n")
  const html=fs.readFileSync(checkedPath(source,"design-sources/desktop-startup.html",{required:true}),"utf8")
  if(!html.includes('/* __NEON_STARTUP_TOKENS__ */')||!html.includes('<!-- __BENDO_STARTUP_LOGO__ -->'))throw new Error('启动页构建契约不完整。')
  return injectStartupLogo(html.replace('/* __NEON_STARTUP_TOKENS__ */',`:root {\n${tokens}\n}`), source)
}
export function patchBrandDisplay(text) {
  return text
    .replaceAll("<title>AI OS</title>", "<title>BenDo</title>")
    .replaceAll("AI OS 正在启动", "BenDo 正在启动")
    .replaceAll("<strong>AI OS</strong>", "<strong>BenDo</strong>")
    .replaceAll("正在准备 AI OS", "正在准备 BenDo")
    .replaceAll("登录 AI OS", "登录 BenDo")
    .replaceAll("AI OS 工作台", "BenDo 工作台")
    .replaceAll("请重新打开 AI OS", "请重新打开 BenDo")
}
function inputPath(source, input, options) {
  return hostInputs.has(input)
    ? checkedPath(path.resolve(source, "../host-sources/app"), input.slice("../host-sources/app/".length), options)
    : checkedPath(source, input, options)
}
for (const name of ["tool-crop", "tool-outpaint", "tool-angle", "tool-upscale", "node-image", "node-video", "node-audio", "node-text", "node-script", "node-upload"]) modules[name] = modulePairs([`canvas-features/${name}.js`])
modules["tool-upscale"].push(...modulePairs(["canvas-feature-registry.js"]))
modules[canvasAgentUpscale] = [
  ...modules["tool-upscale"],
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ...["canvas-agent-core.js", "canvas-agent-capabilities.js", "canvas-agent-tool-adapters.js", "canvas-agent-ui.js"]
    .map(name => [`../host-sources/app/${name}`, name]),
]
modules[canvasAgentCutout] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ...["canvas-agent-core.js", "canvas-agent-capabilities.js", "canvas-agent-ui.js"]
    .map(name => [`../host-sources/app/${name}`, name]),
]
modules[canvasAgentOrganize] = [["design-sources/script-before-save-bridge.js", "script.js"]]
modules[canvasAgentAudio] = [...modules[canvasAgentOrganize], ...modulePairs(["canvas-audio-generator.js"])]
modules[canvasTextResize] = [["design-sources/script-before-save-bridge.js", "script.js"]]
modules["node-note"] = [
  ["design-sources/canvas-features/node-note.js", "canvas-features/node-note.js"],
  ["../host-sources/app/canvas-note-node-renderer.js", "canvas-note-node-renderer.js"],
  ["design-sources/flora-node-shell.js", "flora-node-shell.js"],
  ["design-sources/flora-node-shell.css", "flora-node-shell.css"],
  ["../host-sources/app/styles.css", "styles.css"],
]

const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex")
export function componentTargets(names) {
  if (!Array.isArray(names) || !names.length || names.some(name => !Object.hasOwn(modules, name))) throw new Error("请选择有效的白名单组件。")
  return [...new Set(names.flatMap(name => modules[name].map(pair => pair[1])))]
}
export const releaseComponents = Object.keys(modules).filter(name => !stageOnlyComponents.includes(name))
export function componentInputs(names = releaseComponents) {
  componentTargets(names)
  const inputs = names.flatMap(name => modules[name].map(pair => pair[0]))
  if (inputs.includes("design-sources/flora-generator-composer.js")) inputs.push(...visualPresetBuild.visualPresetInputs)
  return [...new Set(inputs)]
}
function unsharedTarget(file) {
  if (fs.existsSync(file) && fs.statSync(file).nlink !== 1) throw new Error(`目标文件含硬链接或无法确认独占，禁止修改共享内容：${file}`)
  return file
}
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

function noLinks(absolute) {
  let cursor = path.parse(absolute).root
  for (const segment of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment)
    let stat
    try { stat = fs.lstatSync(cursor) }
    catch (error) { if (error.code === "ENOENT") break; throw error }
    if (stat.isSymbolicLink()) throw new Error(`部署路径不能包含目录链接或符号链接：${cursor}`)
    if (cursor !== absolute && !stat.isDirectory()) throw new Error(`部署路径中的父目录类型不正确：${cursor}`)
  }
}

function checkedPath(root, relative, { required = false, directory = false, label = "部署文件" } = {}) {
  const absolute = path.resolve(root, relative)
  if (absolute !== root && !absolute.startsWith(root + path.sep)) throw new Error(`${label}超出允许目录。`)
  noLinks(absolute)
  if (fs.existsSync(absolute)) {
    const stat = fs.statSync(absolute)
    if (directory ? !stat.isDirectory() : !stat.isFile()) throw new Error(`${label}类型不正确：${absolute}`)
  } else if (required) throw new Error(`${label}不存在：${absolute}`)
  return absolute
}

function patchUrls(text, versions) {
  let result = text
  for (const [file, version] of versions) {
    // Restrict to exact local URL string literals; leave other components and queries untouched.
    const pattern = new RegExp(`(["'\\x60])((?:\\./|/)?${escapeRegExp(file)})(?:\\?([^"'\\x60#]*))?(#[^"'\\x60]*)?\\1`, "g")
    result = result.replace(pattern, (_match, quote, url, query, fragment = "") => {
      const parameters = new URLSearchParams(query || "")
      parameters.set("v", version)
      return `${quote}${url}?${parameters}${fragment}${quote}`
    })
  }
  return result
}

function buildProject(source) {
  const options = { cwd: source, windowsHide: true, stdio: "inherit" }
  try {
    // Invoke the pinned local toolchain directly. Spawning npm/cmd is blocked
    // by the current Windows portable environment with EPERM, while the same
    // Node entry points are allowed and keep the build reproducible.
    execFileSync(process.execPath, [path.join(source, "node_modules/typescript/bin/tsc"), "-b"], options)
    execFileSync(process.execPath, [path.join(source, "node_modules/vite/bin/vite.js"), "build", "--configLoader", "native"], options)
    execFileSync(process.execPath, [path.join(source, "build-document-reader.mjs")], options)
  } catch (error) {
    throw new Error(`组件构建失败，运行时未修改：${error.message}`, { cause: error })
  }
}

/** Update only explicitly selected components after the initial full canvas migration. */
export function ensureCanvasNavigationBridge(script) {
  const source = String(script)
  const marker = "saveForNavigation: async function"
  if (source.includes(marker)) return source
  const anchor = "window.CanvasWorkspace = {"
  if (source.split(anchor).length !== 2) throw new Error("画布导航保存桥接入口不匹配，已停止部署。")
  return source.replace(anchor, `${anchor}\n  saveForNavigation: async function () {\n    if (canvasState.isRestoring || canvasState.boardOpening) throw new Error("画布正在恢复，请完成后重试。");\n    await saveCanvasBoardNow();\n    if (canvasPagedStore.getPendingOperations().length || canvasState.hasUnsavedChanges) {\n      throw new Error("画布尚未保存成功，请重试后再返回。");\n    }\n  },`)
}
function updateCameraPreviewMappings(installed, compiled) {
  const prefix = "globalThis.FloraVisualPresetConfig = "
  const readConfig = text => {
    const firstLine = text.slice(0, text.indexOf("\n")).trimEnd()
    if (!firstLine.startsWith(prefix) || !firstLine.endsWith(";")) throw new Error("摄像机预览注册表格式不匹配，停止同步。")
    return JSON.parse(firstLine.slice(prefix.length, -1))
  }
  const config = readConfig(installed)
  const expected = readConfig(compiled).presets
  let changed = false
  for (const [group, prefixId, start] of [["camera", "CAM", 2], ["lens", "LEN", 1]]) {
    for (let index = start; index <= 6; index += 1) {
      const id = `${prefixId}0${index}`
      const [next, ...duplicates] = expected.filter(preset => preset.libraryId === id)
      const [current, ...installedDuplicates] = config.presets.filter(preset => preset.libraryId === id)
      if (!next?.thumbnail || !next.previewSource || next.assetStatus !== "available" || next.group !== group
        || current?.id !== next.id || current.group !== group || duplicates.length || installedDuplicates.length) {
        throw new Error(`摄像机预览 ${id} 缺少已校验素材或稳定 ID 不匹配，停止同步。`)
      }
      for (const field of ["thumbnail", "previewSource"]) {
        if (current[field] === next[field]) continue
        if (current[field]) throw new Error(`摄像机预览 ${id} 已有不同映射，保留现状。`)
        current[field] = next[field]
        if (field === "thumbnail") current.assetStatus = next.assetStatus
        changed = true
      }
    }
  }
  if (!changed) return installed
  const lineEnd = installed.indexOf("\n")
  const eol = installed[lineEnd - 1] === "\r" ? "\r" : ""
  // Keep the installed composer and preset runtime byte-for-byte outside its data line.
  return `${prefix}${JSON.stringify(config).replaceAll("<", "\\u003c")};${eol}${installed.slice(lineEnd)}`
}

function updateCanvasImagePreviewEntrypoint(installed, source) {
  const entry = /^function openCanvasImageOriginalPreview\(node, image\) \{[\s\S]*?(?=\r?\n\r?\nfunction deleteCanvasImageSelection\()/m
  const replacement = source.match(entry)?.[0]
  if (!replacement?.includes("window.CanvasNodeImageViewer.open(") || !entry.test(installed)) {
    throw new Error("画布图片预览入口不匹配，停止定向同步。")
  }
  // Other host-script revisions may still be pending their own acceptance.
  return installed.replace(entry, () => replacement)
}

const functionPattern = name => new RegExp(`^(?:async )?function ${name}\\([^]*?^\\}`, "gm")

function readSection(script, pattern) {
  const matches = [...script.matchAll(pattern)]
  if (matches.length !== 1) throw new Error(`定向同步锚点缺失或不唯一：${pattern.source}`)
  return matches[0][0]
}

function updateCanvasAgentUpscale(installed, source) {
  const eol = installed.includes("\r\n") ? "\r\n" : "\n"
  let updated = installed
  for (const name of ["openCanvasImageToolPanel", "resolveCanvasImageToolSource", "runCanvasImageTool",
    "runCanvasComfyNode", "runAgentCanvasNodeWithGuard"]) {
    const section = functionPattern(name)
    updated = updated.replace(readSection(updated, section), () => readSection(source, section).replace(/\r?\n/g, eol))
  }
  const agent = /^const canvasAgentUpscaleApprovals = new WeakMap\(\);[^]*?(?=^const CanvasAgentCanvasApi)/gm
  const api = /^const CanvasAgentCanvasApi = Object.freeze\(\{/gm
  const methods = /^  upscaleImage: upscaleAgentCanvasImage,\r?\n  prepareUpscale: prepareAgentCanvasUpscale,\r?\n  authorizeUpscale: authorizeAgentCanvasUpscale,/gm
  const anchor = /^  removeBackground: removeAgentCanvasImageBackground,/gm
  const group = readSection(source, agent).replace(/\r?\n/g, eol)
  const definitions = readSection(source, methods).replace(/\r?\n/g, eol)
  updated = [...updated.matchAll(agent)].length
    ? updated.replace(readSection(updated, agent), () => group)
    : updated.replace(readSection(updated, api), match => group + match)
  return [...updated.matchAll(methods)].length
    ? updated.replace(readSection(updated, methods), () => definitions)
    : updated.replace(readSection(updated, anchor), match => definitions + eol + match)
}

function updateCanvasSelectionPromptCursor(installed, source, target) {
  const eol = installed.includes("\r\n") ? "\r\n" : "\n"
  if (target === "script.js") {
    const pattern = functionPattern("replaceCanvasVirtualNode")
    return installed.replace(readSection(installed, pattern),
      () => readSection(source, pattern).replace(/\r?\n/g, eol))
  }
  const cursor = /^#neonEngineSurface #canvasEditorScreen #canvasPlane \.flora-generator-prompt-area,[^]*?^\}/gm
  const rule = readSection(source, cursor).replace(/\r?\n/g, eol)
  if ([...installed.matchAll(cursor)].length) {
    return installed.replace(readSection(installed, cursor), () => rule)
  }
  const anchor = /^#neonEngineSurface #canvasEditorScreen #canvasPlane \.flora-generator-prompt-area \{[^]*?^\}/gm
  return installed.replace(readSection(installed, anchor), match => match + eol + eol + rule)
}

function updateCanvasPhotoReferenceFeedback(installed, source, target) {
  const eol = installed.includes("\r\n") ? "\r\n" : "\n"
  const fromSource = pattern => readSection(source, pattern).replace(/\r?\n/g, eol)
  if (target === "script.js") {
    const request = functionPattern("getCanvasPromptImageRequest")
    const state = functionPattern("getCanvasPhotoPromptReferenceState")
    const match = functionPattern("matchesCanvasPhotoReference")
    for (const name of ["runCanvasImageEdit", "runCanvasImageEditRequest", "createCanvasImageJob"]) {
      const pattern = functionPattern(name)
      installed = installed.replace(readSection(installed, pattern), () => fromSource(pattern))
    }
    installed = installed.replace(readSection(installed, request), () => fromSource(request))
    installed = [...installed.matchAll(state)].length
      ? installed.replace(readSection(installed, state), () => fromSource(state))
      : installed.replace(readSection(installed, request), section => fromSource(state) + eol + eol + section)
    return [...installed.matchAll(match)].length
      ? installed.replace(readSection(installed, match), () => fromSource(match))
      : installed.replace(readSection(installed, state), section => fromSource(match) + eol + eol + section)
  }
  for (const name of ["createPromptMentionEditor", "syncStatus"]) {
    const pattern = new RegExp(`^  function ${name}\\([^]*?^  \\}`, "gm")
    installed = installed.replace(readSection(installed, pattern), () => fromSource(pattern))
  }
  return installed
}

function updateCanvasImageHistory(installed, source) {
  const eol = installed.includes("\r\n") ? "\r\n" : "\n"
  const functions = [
    "runCanvasMidjourneyNode", "createCanvasImageJob", "commitCanvasImageJobResult",
    "runCanvasImageEdit", "runCanvasComfyQwen21Node", "runCanvasComfyNode",
    "appendCanvasGenerationToGallery", "serializeCanvasNode", "applyCanvasOperationLocally",
    "restoreCanvasGenerationHistory",
  ]
  for (const name of functions) {
    const pattern = functionPattern(name)
    const current = readSection(installed, pattern)
    let revised = readSection(source, pattern)
    // Request validation and preset-negative routing are maintained separately.
    if (name === "runCanvasImageEdit" || name === "runCanvasComfyQwen21Node") {
      const newGuard = /^  const referenceError = getCanvasVisualPresetReferenceError\(node, refs\);\r?\n  if \(referenceError\) return referenceError;\r?\n/gm
      const previousGuard = /^  if \(window\.FloraVisualPresets\?\.requiresImageReference\?\.\(node\) && !refs\.length\) \{[^]*?^  \}\r?\n/gm
      const currentGuard = [...current.matchAll(newGuard), ...current.matchAll(previousGuard)].map(match => match[0])
      revised = revised.replace(readSection(revised, newGuard), () => currentGuard.join(""))
    }
    if (name === "runCanvasImageEdit" && !current.includes("getCanvasImageProtocolParams(node, activeModel, presetNegative)")) {
      revised = revised.replace(/^  const presetNegative = .*;\r?\n/m, "")
        .replace("getCanvasImageProtocolParams(node, activeModel, presetNegative)", "getCanvasImageProtocolParams(node, activeModel)")
    }
    installed = installed.replace(current, () => revised.replace(/\r?\n/g, eol))
  }
  const helperGroups = [
    ["createCanvasImageJob", ["captureCanvasImageHistorySnapshot", "readCanvasImageJobSnapshot"]],
    ["runCanvasComfyQwen21Node", ["captureCanvasComfyHistorySnapshot"]],
    [null, ["restoreCanvasHistoryModel", "restoreCanvasHistoryControl", "restoreCanvasImageHistorySnapshot", "restoreLegacyCanvasImageHistory"]],
  ]
  for (const [anchor, helpers] of helperGroups) {
    const target = anchor ? functionPattern(anchor) : /^window\.addEventListener\("flora-generation-history-select", [^]*?(?=\r?\nwindow\.addEventListener\("flora-generation-history-change", )/gm
    const current = readSection(installed, target)
    const newSection = anchor ? current : readSection(source, target)
    let missing = ""
    for (const name of helpers) {
      const pattern = functionPattern(name)
      const revised = readSection(source, pattern).replace(/\r?\n/g, eol)
      if ([...installed.matchAll(pattern)].length) installed = installed.replace(readSection(installed, pattern), () => revised)
      else missing += revised + eol + eol
    }
    installed = installed.replace(current, () => missing + newSection.replace(/\r?\n/g, eol))
  }
  return installed
}

function updateCanvasReferenceSections(installed, source, target) {
  const sections = target === "script.js" ? [
    ...["getCanvasAssetCollectionOutput", "getCanvasModelPortPoint", "getCanvasConnectionPortPoint",
      "getCanvasVirtualNodeOutput", "applyCanvasH3CommerceSlot"].map(functionPattern),
    /^function getCanvasReference(?:Material|Asset)Compatibility\([^]*?(?=^function updateCanvasNodeRefs\()/gm,
    /^(?:const canvasReferenceUploads = new Set\(\);\r?\n\r?\n)?window\.addEventListener\("flora-generator-reference-upload", [^]*?(?=^function getCanvasH3CommerceSlotIndex\()/gm,
  ] : [
    /^      render\(\) \{\r?\n        const query = this\.query\.trim\(\)[^]*?(?=^    const close = \(\) => state\.referencePicker\.close\(\);)/gm,
  ]
  const eol = installed.includes("\r\n") ? "\r\n" : "\n"
  // The installed preset configuration and other previously accepted Stage changes stay in place.
  return sections.reduce((text, section) => text.replace(readSection(text, section),
    () => readSection(source, section).replace(/\r?\n/g, eol)), installed)
}

function updateCanvasWireVideoPrompt(installed, source, target) {
  const eol = installed.includes("\r\n") ? "\r\n" : "\n"
  const replace = (section, sourceSection = section) => {
    installed = installed.replace(readSection(installed, section),
      () => readSection(source, sourceSection).replace(/\r?\n/g, eol))
  }
  if (target === "flora-generator-composer.js") {
    replace(/^  function createReferenceCard\([^]*?^  \}/gm)
    replace(/^  function syncReferenceMaterials\([^]*?^  \}/gm)
    return installed
  }
  if (target === "canvas-scene-layer.js") {
    replace(/^    drawConnection\(context, item, transform\) \{[^]*?^    \}/gm)
    return installed
  }
  for (const [name, helpers] of [
    ["getCanvasConnectionPathData", ["canvasWireIntersectsBody", "getCanvasWireBodies", "getCanvasConnectionRoute", "getCanvasConnectionCommands"]],
    ["syncCanvasMinimaxH3Prompt", ["migrateCanvasH3CopiedPrompt"]],
    ["getCanvasGenerationPrompt", ["getCanvasH3ConnectedTexts"]],
  ]) {
    replace(functionPattern(name))
    for (const helper of helpers) {
      const pattern = functionPattern(helper)
      if ([...installed.matchAll(pattern)].length) replace(pattern)
      else installed = installed.replace(readSection(installed, functionPattern(name)), match =>
        readSection(source, pattern).replace(/\r?\n/g, eol) + eol + eol + match)
    }
  }
  for (const name of ["getCanvasSceneConnectionSegments", "getCanvasModelPortPoint", "getCanvasConnectionPortPoint",
    "getCanvasConnectionNodeBox", "renderCanvasConnections", "updateCanvasConnectionPathsForNodes",
    "updateCanvasNodeVirtualGeometry", "getCanvasIncomingReferenceMaterials", "getAgentCanvasSkillWorkflowRequirements", "inspectAgentCanvasSkillWorkflow",
    "prepareAgentCanvasFashionNode"]) replace(functionPattern(name))
  const runH3 = readSection(installed, functionPattern("runCanvasMinimaxH3Node"))
  const loadSources = /^  const missingSources = [^]*?(?=^  syncCanvasMinimaxH3Prompt\(node\);)/gm
  if ([...runH3.matchAll(loadSources)].length) replace(loadSources)
  else installed = installed.replace(runH3, () => runH3.replace(/^  syncCanvasMinimaxH3Prompt\(node\);$/m,
    match => readSection(source, loadSources).replace(/\r?\n/g, eol) + match))
  const resize = readSection(installed, functionPattern("beginCanvasNodeResize"))
  if (!resize.includes("    updateCanvasNodeVirtualGeometry(node);")) {
    const refresh = /^    scheduleCanvasConnectionRender\(\{ trailing: false \}\);$/gm
    installed = installed.replace(resize, () => resize.replace(readSection(resize, refresh),
      match => "    updateCanvasNodeVirtualGeometry(node);" + eol + match))
  }

  const focusSource = /^  focusSource\(sourceId\) \{[^]*?^  \},/gm
  if ([...installed.matchAll(focusSource)].length) replace(focusSource)
  else installed = installed.replace(/^window\.CanvasReferenceBridge = Object\.freeze\(\{$/m,
    match => match + eol + readSection(source, focusSource).replace(/\r?\n/g, eol))
  return installed
}

function updateAgentWorkflowRecovery(installed, source, target) {
  const eol = installed.includes("\r\n") ? "\r\n" : "\n"
  const pattern = name => target === "script.js" ? functionPattern(name)
    : new RegExp(`^  (?:async )?function ${name}\\([^]*?^  \\}`, "gm")
  const sourcePart = name => readSection(source, pattern(name)).replace(/\r?\n/g, eol)
  const set = (name, anchor) => {
    const section = pattern(name)
    if ([...installed.matchAll(section)].length) installed = installed.replace(readSection(installed, section), () => sourcePart(name))
    else installed = installed.replace(readSection(installed, pattern(anchor)), match => sourcePart(name) + eol + eol + match)
  }
  const insertAfter = (name, anchor, addition) => {
    const section = readSection(installed, pattern(name))
    if (!section.includes(addition)) installed = installed.replace(section,
      () => section.replace(readSection(section, anchor), match => match + eol + addition))
  }
  if (target === "script.js") {
    set("getCanvasAgentFashionImageModel", "prepareAgentCanvasFashionNode")
    set("getAgentCanvasSkillWorkflowRequirements")
    set("inspectAgentCanvasSkillWorkflow")
    set("prepareAgentCanvasFashionNode")
    set("findAgentCanvasPromptPointNearVideo", "placeAgentCanvasPromptBeforeVideo")
    set("placeAgentCanvasPromptBeforeVideo")
    set("placeAgentFashionVideoPrompt", "centerAgentCanvasNodesInViewport")
    set("findAgentCanvasNodeByIdentity")
    const resultSection = readSection(installed, pattern("getAgentCanvasNodeResult"))
    const h3ReferenceReadback = /^      if \(result.input_mode === "reference"\) \{[^]*?^      \}/gm
    installed = installed.replace(resultSection, () => resultSection.replace(readSection(resultSection, h3ReferenceReadback),
      () => readSection(sourcePart("getAgentCanvasNodeResult"), h3ReferenceReadback)))
    const create = sourcePart("createAgentCanvasNode")
    const reuse = readSection(create, /^  const priorFashionImage = [^]*?(?=^  if \(existing\) \{)/gm).trimEnd()
    insertAfter("createAgentCanvasNode", /^  const existing = identityKey [^\r\n]+;$/gm, reuse)
    const createSection = readSection(installed, pattern("createAgentCanvasNode"))
    const legacyLayout = /^  if \(\["video-api", "minimax-h3"\]\.includes\(effectiveKind\)\) \{\r?\n    const workflow = [^]*?^  \}\r?\n/gm
    const layout = readSection(create, /^  if \(isFashionWorkflow && effectiveKind === "minimax-h3"\) placeAgentFashionVideoPrompt[^\r\n]+$/gm)
    if (!createSection.includes(layout)) {
      installed = installed.replace(createSection, () => createSection.replace(readSection(createSection, legacyLayout), () => layout + eol))
    }
    const moveLayout = readSection(sourcePart("moveAgentCanvasNodes"), /^  if \(getAgentCanvasSkillWorkflowRequirements[^]*?^  \}/gm)
    insertAfter("moveAgentCanvasNodes", /^  \}\);(?=\r?\n  scheduleCanvasConnectionRender\(\);)/gm, moveLayout)
    return installed
  }
  if (target === "canvas-text-node-renderer.js") {
    set("syncAutoSize")
    return installed
  }
  if (![...installed.matchAll(pattern("executeCanvasAgentRun"))].length) {
    const start = readSection(installed, pattern("startCanvasAgentRun"))
    installed = installed.replace(start, () => start.replace(/^  async function startCanvasAgentRun[^\r\n]+\r?\n    event\?\.preventDefault\?\.\(\);/,
      "  async function executeCanvasAgentRun(options = {}) {"))
  }
  set("renderCanvasAgentStoredTool", "executeCanvasAgentRun")
  set("recordCanvasAgentToolBatchProgress", "executeCanvasAgentRun")
  insertAfter("addCanvasAgentToolStep", /^    step\.dataset\.toolRunId = [^\r\n]+;$/gm,
    '    step.dataset.toolCallId = String(call.call_id || "");')
  set("startCanvasAgentRun", "executeCanvasAgentRun")
  set("showCanvasAgentPendingSubmission", "executeCanvasAgentRun")
  set("finishCanvasAgentPendingSubmission", "executeCanvasAgentRun")
  set("getCanvasAgentWorkflowCatalogInstruction", "requestCanvasAgentTurn")
  set("recordCanvasAgentSubmissionPhase", "requestCanvasAgentTurn")
  set("verifyCanvasAgentTurnIdentity", "requestCanvasAgentTurn")
  const replaceOptional = (name, region, replacement) => {
    const section = readSection(installed, pattern(name))
    if ([...section.matchAll(region)].length) installed = installed.replace(section,
      () => section.replace(readSection(section, region), () => replacement))
  }
  replaceOptional("loadCanvasAgentGenerationCatalog", /^        if \(response\.ok\) \{\r?\n          if \(String\(data\.request_id [^]*?^        \}\r?\n/gm, "")
  replaceOptional("executeCanvasAgentRun", /^      if \(turn\.request_id !== requestId\) \{[^]*?^      \}/gm,
    "      verifyCanvasAgentTurnIdentity(turn, run);")
  replaceOptional("requestCanvasAgentTurn", /^        if \(String\(data\.request_id [^]*?^        if \(String\(data\.message_id [^]*?^        \}/gm,
    "        verifyCanvasAgentTurnIdentity(data, state.currentRun);")
  replaceOptional("readCanvasAgentEventStream", /^            if \(String\(turn\?\.request_id [^]*?^            if \(String\(turn\?\.message_id [^]*?^            \}/gm,
    "            verifyCanvasAgentTurnIdentity(turn, state.currentRun);")
  const execute = readSection(installed, pattern("executeCanvasAgentRun"))
  if (!execute.includes("options.pending")) {
    insertAfter("executeCanvasAgentRun", /^    state\.currentRun\.submission = message;$/gm,
      "    state.currentRun.pendingPreview = options.pending;")
    insertAfter("completeCanvasAgentSubmission", /^    run\.submission = null;$/gm,
      "    run.pendingPreview?.element.remove();")
  }
  insertAfter("requestCanvasAgentTurn", /^    try \{$/gm,
    ["      const workflowCatalog = payload.prompt ? await getCanvasAgentWorkflowCatalogInstruction(state.currentRun) : \"\";",
      "      if (!isCanvasAgentRunActive(runId)) throw createCanvasAgentAbortError();"].join(eol))
  insertAfter("requestCanvasAgentTurn", /^              payload\.prompt,$/gm, "              workflowCatalog,")
  const request = readSection(installed, pattern("requestCanvasAgentTurn"))
  if (!request.includes('recordCanvasAgentSubmissionPhase(state.currentRun, "request")')) {
    installed = installed.replace(request, () => request.replace("      const response = await fetch(TURN_API_URL, {",
      '      recordCanvasAgentSubmissionPhase(state.currentRun, "request");' + eol + "      const response = await fetch(TURN_API_URL, {"))
  }
  insertAfter("requestCanvasAgentTurn", /^      const contentType = response\.headers\.get\("content-type"\) \|\| "";$/gm,
    '      recordCanvasAgentSubmissionPhase(state.currentRun, "response");')
  insertAfter("executeCanvasAgentRun", /^      setCanvasAgentStatus\(sources\.length [^\r\n]+;$/gm,
    '      recordCanvasAgentSubmissionPhase(run, "attachments-start");')
  insertAfter("executeCanvasAgentRun", /^      const visionImages = await collectCanvasAgentVisionImages[^\r\n]+;$/gm,
    '      recordCanvasAgentSubmissionPhase(run, "attachments-ready");')
  insertAfter("scheduleCanvasAgentStage", /^    if \(!label \|\| !isCanvasAgentRunActive\(runId\)\) return;$/gm,
    "    recordCanvasAgentSubmissionPhase(state.currentRun, stage);")
  insertAfter("finishCanvasAgentRun", /^    const run = state\.currentRun;$/gm,
    '    recordCanvasAgentSubmissionPhase(run, "workflow-finish");')
  const handleTurn = sourcePart("handleCanvasAgentTurn")
  const readOnlyWorkflow = readSection(handleTurn, /^      if \(hasWorkflow && \/\^\(\?:请[^]*?^      \}/gm)
  insertAfter("handleCanvasAgentTurn", /^      const hasWorkflow = [^\r\n]+;$/gm, readOnlyWorkflow)
  const complete = readSection(handleTurn, /^      if \(hasWorkflow && state\.currentRun\?\.id === runId [^]*?^      \}/gm)
  replaceOptional("handleCanvasAgentTurn", /^      if \(hasWorkflow && isCanvasAgentRunActive\(runId\)\) \{[^]*?^      \}\r?\n/gm, "")
  insertAfter("handleCanvasAgentTurn", /^      if \(hasWorkflow && await tryContinueCanvasAgentForSkillViolation\(turn\.message, runId\)\) return;$/gm, complete)
  const correction = sourcePart("tryContinueCanvasAgentForSkillViolation")
  const pause = readSection(correction, /^      if \(workflow && !workflow\.ok && canCanvasAgentContinueSegment\(run\)\) \{[^]*?^      \}/gm)
  insertAfter("tryContinueCanvasAgentForSkillViolation", /^    if \(!CanvasAgentSkillContract\.canRetry\(run\.skillContract\)\) \{$/gm, pause)
  return installed
}

export async function deployComponents({ source, runtime, names, build = true, transforms = {}, verifyOnly = false, onlyFiles } = {}) {
  if (!Array.isArray(names) || names.length === 0 || names.some(name => typeof name !== "string" || !Object.hasOwn(modules, name))) throw new Error("请选择有效的白名单组件；未知组件禁止部署。")
  if (typeof source !== "string" || typeof runtime !== "string" || !source || !runtime) throw new Error("组件部署必须提供源码目录与运行时目录。")
  source = path.resolve(source)
  runtime = path.resolve(runtime)
  if (source === runtime || source.startsWith(runtime + path.sep) || runtime.startsWith(source + path.sep)) throw new Error("源码目录与运行时目录必须相互独立。")
  checkedPath(source, ".", { required: true, directory: true, label: "源码目录" })
  checkedPath(runtime, ".", { required: true, directory: true, label: "运行时目录" })
  const components = [...new Set(names)]
  let pairs = [...new Map(components.flatMap(name => modules[name]).map(pair => [pair[1], pair])).values()]
  if (onlyFiles) {
    if (components.length !== 1 || components[0] !== "release-host-sync"
      || !onlyFiles.length || onlyFiles.some(file => !pairs.some(([, target]) => target === file))) {
      throw new Error("后端文件必须属于 release-host-sync 白名单。")
    }
    pairs = pairs.filter(([, target]) => onlyFiles.includes(target))
  }
  const needsCanvas = components.some(name => name === "cutout" || name.startsWith("tool-") || name.startsWith("node-") || name === "canvas-feature-core")
  if (needsCanvas) {
    try {
      checkedPath(runtime, "script.js", { required: true })
      checkedPath(runtime, "canvas-feature-registry.js", { required: true })
    } catch (error) { throw new Error(`缺少已安装的画布共享核心，请先通过 deploy.mjs 执行一次完整部署：${error.message}`, { cause: error }) }
  }
  const metadataFiles = components.length === 1 && ["release-host-sync", "skill-wizard-backend", "h3-commerce-package-backend"].includes(components[0])
    ? []
    : ["index.html", "module-manifest.js", ...(components.some(name => ["naming", "media-naming", "workbench-frontend", "brand-display"].includes(name)) ? ["neon-workbench.html"] : [])]
  for (const file of metadataFiles) unsharedTarget(checkedPath(runtime, file, { required: true, label: "运行时入口文件" }))
  // Validate static inputs before a build; dist/workbench.js is produced by that build.
  for (const [input, target] of pairs) {
    inputPath(source, input, { required: !(build && input.startsWith("dist/")), label: "组件源文件" })
    unsharedTarget(checkedPath(runtime, target, { label: "组件目标文件" }))
  }
  const selectedInputs = onlyFiles ? pairs.map(([input]) => input) : componentInputs(components)
  for (const input of selectedInputs.filter(input => !input.startsWith("dist/"))) {
    inputPath(source, input, { required: true, label: "组件构建输入" })
  }
  const backupRoot = path.resolve(source, "..", ".design", "deploy-backups")
  noLinks(backupRoot)
  if (build) {
    checkedPath(source, "package.json", { required: true, label: "构建配置" })
    buildProject(source)
  }

  // Prepare every byte and validate every path again before the first runtime mutation.
  const plan = new Map(), versions = new Map(), sourceVersions = new Map()
  for (const [input, target] of pairs) {
    const from = inputPath(source, input, { required: true, label: "组件源文件" })
    const to = unsharedTarget(checkedPath(runtime, target, { label: "组件目标文件" }))
    let contents = fs.readFileSync(from)
    if (components.includes(canvasAgentComposerInteraction)) {
      const installed = fs.readFileSync(to, "utf8")
      const original = contents.toString("utf8")
      const eol = installed.includes("\r\n") ? "\r\n" : "\n"
      const uiFunction = name => new RegExp(`^  (?:async )?function ${name}\\([^]*?^  \\}`, "gm")
      let updated = installed
      if (target === "canvas-agent-ui.js") {
        for (const name of ["syncCanvasAgentSelection", "getAgentContextNodes", "applyCanvasAgentOpen",
          "handleCanvasAgentBoardChanged", "prepareCanvasAgentConversationSwitch", "isCanvasAgentPickerNode",
          "handleCanvasAgentContextClick", "attachCanvasAgentFiles", "renderCanvasAgentContext", "showCanvasAgentPendingSubmission",
          "beginCanvasAgentCanvasPicker", "cancelCanvasAgentCanvasPicker", "selectCanvasAgentPickerNode"]) {
          const pattern = uiFunction(name)
          updated = updated.replace(readSection(updated, pattern), () => readSection(original, pattern).replace(/\r?\n/g, eol))
        }
        const listener = /^    window\.addEventListener\("canvas:selectionchange", \(event\) => \{[^]*?^    \}\);\r?\n/gm
        updated = updated.replace(readSection(updated, listener), () => readSection(original, listener).replace(/\r?\n/g, eol))
        const gestureGuard = /^      if \(\(!picker\?\.slot && picker\?\.target !== "composer"\)[^]*? return;/gm
        updated = updated.replace(readSection(updated, gestureGuard), () => readSection(original, gestureGuard).replace(/\r?\n/g, eol))
        updated = updated.replace("...state.mentionedNodeIds, ...state.selectedNodeIds, ...getPhotoMentions()",
          "...state.mentionedNodeIds, ...getPhotoMentions()")
      } else if (target === "canvas-agent.css") {
        const marker = "/* Agent composer picker banner */"
        const sourceBlock = readSection(original, /^\/\* Agent composer picker banner \*\/[^]*?(?=^\.canvas-agent-resize-handle \{)/gm).replace(/\r?\n/g, eol)
        const start = updated.indexOf(marker)
        const end = updated.indexOf(`${eol}.canvas-agent-resize-handle`, start >= 0 ? start : 0)
        updated = start >= 0 && end >= 0
          ? updated.slice(0, start) + sourceBlock + updated.slice(end)
          : updated.replace(/^\.canvas-agent-resize-handle \{/m, `${sourceBlock}${eol}${eol}.canvas-agent-resize-handle {`)
      } else if (target === "canvas-text-node-renderer.js") {
        for (const pattern of [/^    const insert = \(event, data\) => \{[^]*?^    \};/gm,
          uiFunction("applyFormat"), uiFunction("mountToolbar"), uiFunction("renderPreview"), uiFunction("htmlToMarkdown")]) {
          updated = updated.replace(readSection(updated, pattern), () => readSection(original, pattern).replace(/\r?\n/g, eol))
        }
        const helper = uiFunction("readPlainClipboardLines")
        const addition = readSection(original, helper).replace(/\r?\n/g, eol)
        if ([...updated.matchAll(helper)].length) updated = updated.replace(readSection(updated, helper), () => addition)
        else {
          const next = readSection(updated, uiFunction("getRichHtml"))
          updated = updated.replace(next, () => addition + eol + eol + next)
        }
      } else {
        for (const pattern of [uiFunction("render"), uiFunction("syncText")]) {
          updated = updated.replace(readSection(updated, pattern), () => readSection(original, pattern).replace(/\r?\n/g, eol))
        }
      }
      contents = Buffer.from(updated)
    } else if (components.includes(canvasAgentImageThumbnails)) {
      const installed = fs.readFileSync(to, "utf8")
      const eol = installed.includes("\r\n") ? "\r\n" : "\n"
      const section = target === "canvas-agent.css"
        ? /^\/\* Agent composer image thumbnails \*\/[^]*?(?=^\.canvas-agent-context > \.canvas-agent-context-chip\.is-skill > span)/gm
        : target === "canvas-agent-ui.js"
          ? /^  function createCanvasAgentContextChip\(reference\) \{[^]*?^  \}/gm
          : /^  function render\(node, options = \{\}, context = \{\}\) \{[^]*?^  \}/gm
      const replacement = readSection(contents.toString("utf8"), section).replace(/\r?\n/g, eol)
      const anchor = target === "canvas-agent.css" && ![...installed.matchAll(section)].length
        ? /^\.canvas-agent-context > \.canvas-agent-context-chip\.is-skill > span \{/gm
        : section
      const previous = readSection(installed, anchor)
      const updated = installed.replace(previous, () => replacement + (anchor === section ? "" : previous))
      contents = Buffer.from(target === "canvas-agent.css"
        ? updated.replace(/^\.canvas-agent-context-role \{[^]*?^@media \(hover: none\) \{\r?\n  \.canvas-agent-context-role \{ opacity: 1; \}\r?\n\}\r?\n\r?\n/m, "")
        : target === "canvas-agent-ui.js"
          ? updated.replace(/^    document\.querySelector\("#canvasAgentContext"\)\?\.addEventListener\("change", handleCanvasAgentMaterialRole\);\r?\n/m, "")
            .replace(/^  function handleCanvasAgentMaterialRole\(event\) \{[^]*?^  \}\r?\n\r?\n/m, "")
          : updated)
    } else if (components.includes(naturalPhotoBriefStatus)) {
      const installed = fs.readFileSync(to, "utf8")
      const original = contents.toString("utf8")
      const eol = installed.includes("\r\n") ? "\r\n" : "\n"
      const uiFunction = name => new RegExp(`^  (?:async )?function ${name}\\([^]*?^  \\}`, "gm")
      const names = ["saveCanvasAgentConversation", "persistCanvasAgentPendingWorkflow", "renderCanvasAgentStoredTool",
        "executeCanvasAgentCallBatch", "executeCanvasAgentToolsAndContinue", "repairNaturalPhotoBrief",
        "showCanvasAgentDesignBrief", "addCanvasAgentToolStep", "updateCanvasAgentToolStep"]
      const helpers = ["isNaturalPhotoBriefValidationError", "runCanRepairNaturalPhotoBrief",
        "getNaturalPhotoBriefToolItemId", "updateNaturalPhotoBriefToolStep"]
      let updated = names.reduce((current, name) => {
        const section = uiFunction(name)
        return current.replace(readSection(current, section), () => readSection(original, section).replace(/\r?\n/g, eol))
      }, installed)
      const anchor = readSection(updated, uiFunction("repairNaturalPhotoBrief"))
      const missing = helpers.filter(name => ![...updated.matchAll(uiFunction(name))].length)
        .map(name => readSection(original, uiFunction(name)).replace(/\r?\n/g, eol))
      if (missing.length) updated = updated.replace(anchor, () => [...missing, anchor].join(eol + eol))
      contents = Buffer.from(updated)
    } else if (components.includes(canvasAgentCreativeBatchLayout)) {
      const installed = fs.readFileSync(to, "utf8")
      const original = contents.toString("utf8")
      const eol = installed.includes("\r\n") ? "\r\n" : "\n"
      const placement = /^  else if \(hasExplicitPoint\)(?: \{[^]*?^  \}| placeAgentCanvasNodeAtPoint\(node, point\);)/gm
      const planRequest = /^        const layout = await CanvasAgentCanvasApi\.planImageNodeBatch\([^]*?\}, context\);/gm
      const sections = target === "script.js"
        ? [functionPattern("planAgentCanvasImageBatch"), functionPattern("createAgentCanvasImageNodeBatch"), placement]
        : [planRequest]
      contents = Buffer.from(sections.reduce((current, section) => current.replace(readSection(current, section),
        () => readSection(original, section).replace(/\r?\n/g, eol)), installed))
    } else if (components.includes(canvasPhotoReferenceFeedback)) {
      contents = Buffer.from(updateCanvasPhotoReferenceFeedback(fs.readFileSync(to, "utf8"), contents.toString("utf8"), target))
    } else if (components.includes(canvasSelectionPromptCursor)) {
      contents = Buffer.from(updateCanvasSelectionPromptCursor(fs.readFileSync(to, "utf8"), contents.toString("utf8"), target))
    } else if (components.includes(canvasWireVideoPrompt)) {
      let installed = fs.readFileSync(to, "utf8")
      if (target === "script.js") {
        const legacyBundle = ["canvas-script-production.js", "canvas-asset-entry.js"]
          .map(file => "\n" + fs.readFileSync(checkedPath(source, `design-sources/${file}`, { required: true }), "utf8")).join("")
        if (installed.endsWith(legacyBundle + legacyBundle)) installed = installed.slice(0, -legacyBundle.length)
      }
      contents = Buffer.from(updateCanvasWireVideoPrompt(installed, contents.toString("utf8"), target))
    } else if (components.includes(agentWorkflowRecovery)) {
      contents = Buffer.from(updateAgentWorkflowRecovery(fs.readFileSync(to, "utf8"), contents.toString("utf8"), target))
    } else if (components.includes(livePromptMentionPreviews)) {
      const installed = fs.readFileSync(to, "utf8")
      const eol = installed.includes("\r\n") ? "\r\n" : "\n"
      const section = target === "script.js" ? functionPattern("resolveCanvasPromptImage")
        : /^  function createPromptMentionEditor\([^]*?^  \}/gm
      contents = Buffer.from(installed.replace(readSection(installed, section),
        () => readSection(contents.toString("utf8"), section).replace(/\r?\n/g, eol)))
    } else if (components.includes(agentPromptMentions) && target === "script.js") {
      let updated = fs.readFileSync(to, "utf8")
      const sourceText = contents.toString("utf8")
      const eol = updated.includes("\r\n") ? "\r\n" : "\n"
      const part = pattern => readSection(sourceText, pattern).replace(/\r?\n/g, eol)
      const binding = functionPattern("bindAgentCanvasPromptMentions")
      const plan = functionPattern("planAgentCanvasPromptMentions")
      if (![...updated.matchAll(plan)].length) updated = updated.replace(readSection(updated, binding), match => part(plan) + eol + eol + match)
      for (const name of ["readCanvasPromptMentions", "planAgentCanvasPromptMentions", "bindAgentCanvasPromptMentions", "resolveCanvasPromptImage",
        "mergeCanvasPromptMaterials", "updateAgentCanvasNodeFields"]) {
        const pattern = functionPattern(name)
        updated = updated.replace(readSection(updated, pattern), () => part(pattern))
      }
      const create = functionPattern("createAgentCanvasNode")
      const current = readSection(updated, create)
      const sourceCreate = readSection(sourceText, create)
      const replaceCreatePart = (text, targetPattern, sourcePattern) => text.replace(readSection(text, targetPattern),
        () => readSection(sourceCreate, sourcePattern).replace(/\r?\n/g, eol))
      let createUpdated = replaceCreatePart(current,
        /^  if \(!photoLock .* bindAgentCanvasPromptMentions\(node,[^\r\n]+$/gm,
        /^  if \(!photoLock .* bindAgentCanvasPromptMentions\(node,[^\r\n]+$/gm)
      createUpdated = replaceCreatePart(createUpdated,
        /^    .*bindAgentCanvasPromptMentions\(existing, args\.reference_node_ids[^\r\n]+$/gm,
        /^    bindAgentCanvasPromptMentions\(existing, args\.reference_node_ids[^\r\n]+$/gm)
      if (!createUpdated.includes("bindAgentCanvasPromptMentions(priorFashionImage")) {
        createUpdated = replaceCreatePart(createUpdated,
          /^      if \(!failed\.length\) return \{ \.\.\.getAgentCanvasNodeResult\(priorFashionImage\)[^\r\n]+$/gm,
          /^      if \(!failed\.length\) \{\r?\n        bindAgentCanvasPromptMentions\(priorFashionImage[^]*?^      \}$/gm)
      }
      if (!createUpdated.includes("const expectedPrompt = planAgentCanvasPromptMentions(priorFashionImage")) {
        createUpdated = replaceCreatePart(createUpdated,
          /^    if \(current\.prompt === args\.prompt && current\.model[^\r\n]+$/gm,
          /^    const expectedPrompt = planAgentCanvasPromptMentions\(priorFashionImage[^\r\n]+\r?\n    if \(current\.prompt === [^\r\n]+$/gm)
      }
      contents = Buffer.from(updated.replace(current, () => createUpdated))
    } else if (components.includes(imagePromptMentions)) {
      const installed = fs.readFileSync(to, "utf8")
      const sourceText = contents.toString("utf8")
      const eol = installed.includes("\r\n") ? "\r\n" : "\n"
      const fromSource = pattern => readSection(sourceText, pattern).replace(/\r?\n/g, eol)
      let updated = installed
      if (target === "flora-generator-composer.js") {
        for (const name of ["createPromptMentionEditor", "syncPromptMentionEditor"]) {
          const pattern = new RegExp(`^  function ${name}\\([^]*?^  \\}`, "gm")
          updated = updated.replace(readSection(updated, pattern), () => fromSource(pattern))
        }
      } else if (target === "flora-node-shell.css") {
        const pattern = /^\.flora-prompt-mention-chip img \{[^]*?^\}/gm
        const warning = /^\.flora-prompt-mention-warning:not\(\[hidden\]\) \{[^]*?^\}/gm
        updated = [...updated.matchAll(warning)].length
          ? updated.replace(readSection(updated, warning), () => fromSource(warning))
          : updated.replace(readSection(updated, pattern), match => match + eol + eol + fromSource(warning))
      } else {
        for (const name of ["readCanvasPromptMentions", "getCanvasPromptImageRequest"]) {
          const pattern = functionPattern(name)
          updated = updated.replace(readSection(updated, pattern), () => fromSource(pattern))
        }
        for (const name of ["findUnboundCanvasPromptMentions", "bindAgentCanvasPromptMentions", "syncCanvasPromptMentionConnections"]) {
          const pattern = functionPattern(name)
          updated = [...updated.matchAll(pattern)].length
            ? updated.replace(readSection(updated, pattern), () => fromSource(pattern))
            : updated.replace("function resolveCanvasPromptImage(", () => fromSource(pattern) + eol + eol + "function resolveCanvasPromptImage(")
        }
        const createNode = functionPattern("createAgentCanvasNode")
        const current = readSection(updated, createNode)
        const sourceNode = readSection(sourceText, createNode)
        const binding = sourceNode.match(/^  if .* bindAgentCanvasPromptMentions\(node, args\.reference_node_ids(?:, workflow\.referenceImages)?\);/m)?.[0]
        const connect = /^  const failedReferences = node && args\.reference_node_ids [^\r\n]+;/gm
        if (!binding) throw new Error("图片节点缺少 Agent 素材绑定入口。")
        if (!current.includes(binding)) updated = updated.replace(current,
          () => current.replace(readSection(current, connect), match => match + eol + binding))
      }
      contents = Buffer.from(updated)
    } else if (components.includes(canvasReferencePickerPerformance)) {
      const installed = fs.readFileSync(to, "utf8")
      const original = contents.toString("utf8")
      const eol = installed.includes("\r\n") ? "\r\n" : "\n"
      const sections = target === "script.js" ? [
        ...["getCanvasH3ConnectionCapacity", "getCanvasApiVideoConnectionCapacity",
          "getCanvasMidjourneyConnectionCapacity", "getCanvasConnectionCompatibility"].map(functionPattern),
        /^(?:let canvasReferenceCatalogCache;\r?\n)?window\.CanvasReferenceBridge = Object\.freeze\(\{[^]*?(?=^  pickCommerceImage:)/gm,
      ] : [
        /^  function referencePickerAssetEntry\([^]*?^  \}/gm,
        /^  function ensureReferencePicker\([^]*?^  \}/gm,
      ]
      contents = Buffer.from(sections.reduce((text, section) => text.replace(readSection(text, section),
        () => readSection(original, section).replace(/\r?\n/g, eol)), installed))
    } else if (components.includes(canvasReferenceSync)) {
      contents = Buffer.from(updateCanvasReferenceSections(fs.readFileSync(to, "utf8"), contents.toString("utf8"), target))
    } else if (target === "flora-generator-composer.js") {
      if (components.includes(naturalPhotoFidelity)) {
        const installed = fs.readFileSync(to, "utf8")
        const section = /^  function createPromptMentionEditor\([^]*?^  \}/gm
        const eol = installed.includes("\r\n") ? "\r\n" : "\n"
        contents = Buffer.from(installed.replace(readSection(installed, section),
          () => readSection(contents.toString("utf8"), section).replace(/\r?\n/g, eol)))
      } else {
        const compiled = compileGeneratorComposer(source)
        contents = Buffer.from(components.includes(cameraPreviewMappings)
          ? updateCameraPreviewMappings(fs.readFileSync(to, "utf8"), compiled)
          : compiled)
      }
    }
    if (input === "design-sources/script-before-save-bridge.js" && target === "script.js"
      && !components.includes(canvasReferencePickerPerformance)
      && !components.includes(canvasAgentCreativeBatchLayout)
      && !components.includes(canvasReferenceSync) && !components.includes(imagePromptMentions) && !components.includes(agentPromptMentions)
      && !components.includes(livePromptMentionPreviews)
      && !components.includes(agentWorkflowRecovery) && !components.includes(canvasWireVideoPrompt)
      && !components.includes(canvasSelectionPromptCursor) && !components.includes(canvasPhotoReferenceFeedback)) {
      if (components.includes(canvasAgentUpscale)) {
        contents = Buffer.from(updateCanvasAgentUpscale(fs.readFileSync(to, "utf8"), contents.toString("utf8")))
      } else if (components.includes(canvasImageParameters)) {
        const installed = fs.readFileSync(to, "utf8")
        const original = contents.toString("utf8")
        const eol = installed.includes("\r\n") ? "\r\n" : "\n"
        const helper = functionPattern("usesCanvasImageResolutionTiers")
        const sections = ["fillCanvasNodeResolutionSelect", "syncCanvasNodeResolutionState", "getCanvasOutputSize",
          "getCanvasImageResolution", "getCanvasImageQuality", "getCanvasImageProtocolParams",
          "createCanvasImageJobTerminalError", "runCanvasImageEditRequest"]
        let updated = installed
        if (updated.match(helper)) {
          updated = updated.replace(readSection(updated, helper), () => readSection(original, helper).replace(/\r?\n/g, eol))
        }
        for (const name of sections) {
          const section = functionPattern(name)
          const replacement = readSection(original, section).replace(/\r?\n/g, eol)
          const addHelper = name === "fillCanvasNodeResolutionSelect" && !updated.match(helper)
          const prefix = addHelper ? readSection(original, helper).replace(/\r?\n/g, eol) + eol + eol : ""
          updated = updated.replace(readSection(updated, section), () => prefix + replacement)
        }
        contents = Buffer.from(updated)
      } else if (components.includes(canvasTextResize)) {
        const installed = fs.readFileSync(to, "utf8")
        const eol = installed.includes("\r\n") ? "\r\n" : "\n"
        const section = functionPattern("beginCanvasNodeResize")
        contents = Buffer.from(installed.replace(readSection(installed, section),
          () => readSection(contents.toString("utf8"), section).replace(/\r?\n/g, eol)))
      } else if (components.includes(canvasAgentOrganize)) {
        const installed = fs.readFileSync(to, "utf8")
        const original = contents.toString("utf8")
        const eol = installed.includes("\r\n") ? "\r\n" : "\n"
        const sections = [
          ...["getAgentCanvasNodesToOrganize", "organizeAgentCanvasNodes", "fetchCanvasBoardExportPages",
            "loadCanvasSelectedModels", "updateAgentCanvasNodeFields", "moveAgentCanvasNodes",
            "setAgentCanvasReferenceOrder", "groupAgentCanvasNodes", "ungroupAgentCanvasNodes",
            "flushCanvasOperations"].map(functionPattern),
          ...["organizeNodes", "group", "ungroup"].map(name => new RegExp(`^  ${name}: [^\\r\\n]+,$`, "gm")),
        ]
        let updated = sections.reduce((script, section) => script.replace(
          readSection(script, section), () => readSection(original, section).replace(/\r?\n/g, eol)), installed)
        for (const [name, after] of [["loadAgentCanvasOwnedNodes", "findAgentOwnedCanvasNode"],
          ["commitAgentCanvasOrganization", "organizeAgentCanvasNodes"], ["sendCanvasOperationBatch", "flushCanvasOperations"]]) {
          const section = functionPattern(name)
          const sourceSection = readSection(original, section).replace(/\r?\n/g, eol)
          if (updated.match(section)) updated = updated.replace(readSection(updated, section), () => sourceSection)
          else {
            const anchor = readSection(updated, functionPattern(after))
            updated = updated.replace(anchor, () => anchor + eol + eol + sourceSection)
          }
        }
        contents = Buffer.from(updated)
      } else if (components.includes(canvasAgentAudio)) {
        const installed = fs.readFileSync(to, "utf8")
        const eol = installed.includes("\r\n") ? "\r\n" : "\n"
        const original = contents.toString("utf8")
        contents = Buffer.from(["runAgentCanvasNodeWithGuard", "renderCanvasAudioGeneratorNode"].map(functionPattern)
          .reduce((script, section) => script.replace(readSection(script, section),
            () => readSection(original, section).replace(/\r?\n/g, eol)), installed))
      } else if (components.includes(canvasImageViewer)) {
        contents = Buffer.from(updateCanvasImagePreviewEntrypoint(fs.readFileSync(to, "utf8"), contents.toString("utf8")))
      } else if (components.includes(canvasImageHistorySync)) {
        contents = Buffer.from(updateCanvasImageHistory(fs.readFileSync(to, "utf8"), contents.toString("utf8")))
      } else if (components.includes(h3CommerceSubmission)) {
        const installed = fs.readFileSync(to, "utf8")
        const section = functionPattern("runCanvasH3CommerceNode")
        const eol = installed.includes("\r\n") ? "\r\n" : "\n"
        contents = Buffer.from(installed.replace(readSection(installed, section),
          () => readSection(contents.toString("utf8"), section).replace(/\r?\n/g, eol)))
      } else if (components.includes(canvasFileImportValidation)) {
        const installed = fs.readFileSync(to, "utf8")
        const fillMediaSection = /  async fillMedia\(node, file\) \{[\s\S]*?(?=\r?\n  fillText\(node,)/g;
        const sourceApiSection = /  getH3CommerceImage:[\s\S]*?(?=\r?\n  addH3CommerceMaterial:)/g;
        const eol = installed.includes("\r\n") ? "\r\n" : "\n"
        const source = contents.toString("utf8");
        const updated = [fillMediaSection, sourceApiSection].reduce((script, section) =>
          script.replace(readSection(script, section), () => readSection(source, section).replace(/\r?\n/g, eol)), installed);
        contents = Buffer.from(updated)
      } else if (components.includes(canvasAgentPoster)) {
        const installed = fs.readFileSync(to, "utf8")
        const eol = installed.includes("\r\n") ? "\r\n" : "\n"
        const original = contents.toString("utf8")
        contents = Buffer.from(["requestAgentDesignBrief", "createAgentCanvasNode", "bindAgentCanvasPromptMentions"].reduce((script, name) => {
          const section = functionPattern(name)
          return script.replace(readSection(script, section), () => readSection(original, section).replace(/\r?\n/g, eol))
        }, installed))
      } else if (components.includes(canvasAgentCreativeBatch)) {
        let updated = fs.readFileSync(to, "utf8")
        const eol = updated.includes("\r\n") ? "\r\n" : "\n"
        const original = contents.toString("utf8")
        for (const name of ["planAgentCanvasImageBatch", "createAgentCanvasImageNodeBatch"]) {
          const pattern = functionPattern(name)
          const helper = readSection(original, pattern).replace(/\r?\n/g, eol)
          updated = [...updated.matchAll(pattern)].length
            ? updated.replace(readSection(updated, pattern), () => helper)
            : updated.replace(readSection(updated, functionPattern("createAgentCanvasNode")), anchor => helper + eol + eol + anchor)
        }
        const readback = /^  async readNodePersisted\([^]*?^  \},/gm
        const readbackSource = readSection(original, readback).replace(/\r?\n/g, eol)
        updated = [...updated.matchAll(readback)].length
          ? updated.replace(readSection(updated, readback), () => readbackSource)
          : updated.replace(readSection(updated, /^  getNodes: [^\r\n]+/gm), match => match + eol + readbackSource)
        const apiAnchor = "  createNode: (kind, args, context) => executeAndSaveAgentCanvasOperation(createAgentCanvasNode, [kind, args], context),"
        const apiBlock = [
          "  planImageNodeBatch: planAgentCanvasImageBatch,",
          "  createImageNodeBatch: (args, context) => executeAndSaveAgentCanvasOperation(createAgentCanvasImageNodeBatch, [args], context),",
          apiAnchor,
        ].join(eol)
        if (!updated.includes("planImageNodeBatch: planAgentCanvasImageBatch")) {
          if (!updated.includes(apiAnchor)) throw new Error("十创意批量 API 锚点缺失，已停止组件同步。")
          updated = updated.replace(apiAnchor, apiBlock)
        }
        contents = Buffer.from(updated)
      } else if (components.includes(naturalPhotoOutput)) {
        const installed = fs.readFileSync(to, "utf8")
        const eol = installed.includes("\r\n") ? "\r\n" : "\n"
        const section = functionPattern("createCanvasImageJob")
        contents = Buffer.from(installed.replace(readSection(installed, section),
          () => readSection(contents.toString("utf8"), section).replace(/\r?\n/g, eol)))
      } else if (components.includes(naturalPhotoFidelity)) {
        const installed = fs.readFileSync(to, "utf8")
        const eol = installed.includes("\r\n") ? "\r\n" : "\n"
        const original = contents.toString("utf8")
        const sections = ["requestAgentDesignBrief", "createAgentCanvasNode", "serializeCanvasNode", "readCanvasPromptMentions",
          "restoreCanvasBoardNode", "runCanvasImageEdit", "createCanvasImageJob", "syncCanvasImageDependencyStatus",
          "runCanvasComfyQwen21Node", "runCanvasComfyNode"]
        let updated = sections.reduce((script, name) => {
          const section = functionPattern(name)
          return script.replace(readSection(script, section), () => readSection(original, section).replace(/\r?\n/g, eol))
        }, installed)
        for (const name of ["blockNaturalPhotoEngine", "runCanvasImageEditRequest"]) {
          const helper = functionPattern(name)
          const sourceHelper = readSection(original, helper).replace(/\r?\n/g, eol)
          updated = [...updated.matchAll(helper)].length
            ? updated.replace(readSection(updated, helper), () => sourceHelper)
            : updated.replace("async function runCanvasImageEdit(", () => sourceHelper + eol + eol + "async function runCanvasImageEdit(")
        }
        contents = Buffer.from(updated)
      } else {
        let canonical = ensureCanvasNavigationBridge(contents.toString("utf8"))
        canonical += "\n" + fs.readFileSync(checkedPath(source, "design-sources/canvas-script-production.js", { required: true }), "utf8")
        canonical += "\n" + fs.readFileSync(checkedPath(source, "design-sources/canvas-asset-entry.js", { required: true }), "utf8")
        contents = Buffer.from(canonical, "utf8")
      }
    }
    if (target === "script.js" && !contents.toString("utf8").includes("saveForNavigation: async function")) throw new Error("新画布脚本缺少导航保存桥接，已停止部署。")
    if(input === "design-sources/desktop-startup.html") contents=Buffer.from(compileStartupHtml(source))
    if (transforms[target]) contents = Buffer.from(transforms[target](contents.toString("utf8")))
    if (target === "desktop-shell.js" && components.includes("brand-display")) contents = Buffer.from(patchBrandDisplay(contents.toString("utf8")))
    const digest = hash(contents)
    sourceVersions.set(target, digest.slice(0, 16))
    const previous = fs.existsSync(to) ? fs.readFileSync(to) : null
    if (previous && hash(previous) === digest) continue
    plan.set(target, { to, contents, previous })
    versions.set(target, digest.slice(0, 16))
  }
  for (const file of [...metadataFiles].sort((a, b) => a === 'module-manifest.js' ? -1 : b === 'module-manifest.js' ? 1 : 0)) {
    const to = checkedPath(runtime, file, { required: true, label: "运行时入口文件" })
    const previous = fs.readFileSync(to)
    const current = plan.get(file)?.contents || previous
    let patched = patchUrls(current.toString("utf8"), sourceVersions.has(file) ? sourceVersions : versions)
    if (components.includes("brand-display") && file.endsWith(".html")) {
      patched = patchBrandDisplay(patched)
      const brand = checkedPath(path.resolve(source, "../host-sources/app"), "assets/branding/bendo-logo.svg", { required: true })
      const favicon = "data:" + "image/svg+xml;base64," + fs.readFileSync(brand).toString("base64")
      const icon = `<link rel="icon" href="${favicon}" type="image/svg+xml" sizes="any">`
      patched = /<link\b[^>]*\brel=["']icon["'][^>]*>/i.test(patched)
        ? patched.replace(/<link\b[^>]*\brel=["']icon["'][^>]*>/i, icon)
        : patched.replace("</title>", `</title>${icon}`)
      if (file === "index.html") patched = injectStartupLogo(patched, source)
    }
    if(file === 'index.html' && components.includes('canvas-interaction-final')) {
      const marker=/<span class="ai-os-startup-brand-mark" aria-hidden="true">[\s\S]*?<\/span>/
      if(!marker.test(patched))throw new Error('缺少启动门品牌入口，停止部署。')
      patched=injectStartupLogo(patched, source)
    }
    if (patched !== previous.toString("utf8")) {
      const contents = Buffer.from(patched)
      plan.set(file, { to, contents, previous })
      if (file === "module-manifest.js") versions.set(file, hash(contents).slice(0, 16))
    } else {
      plan.delete(file)
      versions.delete(file)
    }
  }
  // A changed manifest is itself cached by index.html. Revisit only this matching URL.
  if (versions.has("module-manifest.js")) {
    const to = checkedPath(runtime, "index.html", { required: true })
    const previous = fs.readFileSync(to)
    const current = plan.get("index.html")?.contents || previous
    const patched = Buffer.from(patchUrls(current.toString("utf8"), new Map([["module-manifest.js", versions.get("module-manifest.js")]])))
    if (!patched.equals(previous)) plan.set("index.html", { to, contents: patched, previous })
    else plan.delete("index.html")
  }
  if (!plan.size) return { components, changed: [], backupDir: null, restartRequired: false }
  if (verifyOnly) return { components, changed: [...plan.keys()], backupDir: null, restartRequired: false }

  let stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")
  let backupDir = path.join(backupRoot, `${stamp}-components`)
  for (let suffix = 1; fs.existsSync(backupDir); suffix++) backupDir = path.join(backupRoot, `${stamp}-${suffix}-components`)
  noLinks(backupDir)
  fs.mkdirSync(backupDir, { recursive: true })
  // Finish every backup before writing any selected runtime module.
  for (const [file, entry] of plan) {
    if (!entry.previous) continue
    const backup = checkedPath(backupDir, file)
    fs.mkdirSync(path.dirname(backup), { recursive: true })
    fs.writeFileSync(backup, entry.previous)
  }
  fs.writeFileSync(path.join(backupDir, "component-deploy.json"), JSON.stringify({ components, files: [...plan].map(([file, entry]) => ({ file, existed: Boolean(entry.previous), sha256: hash(entry.contents) })) }, null, 2))
  const touched = []
  try {
    for (const [file, entry] of plan) {
      unsharedTarget(checkedPath(runtime, file))
      fs.mkdirSync(path.dirname(entry.to), { recursive: true })
      touched.push([file, entry])
      fs.writeFileSync(entry.to, entry.contents)
      if (hash(fs.readFileSync(entry.to)) !== hash(entry.contents)) throw new Error(`组件写入校验失败：${file}`)
    }
  } catch (error) {
    const failures = []
    for (const [file, entry] of touched.reverse()) {
      try {
        if (entry.previous) fs.copyFileSync(path.join(backupDir, file), entry.to)
        else fs.rmSync(entry.to, { force: true })
      } catch (restoreError) { failures.push(`${file}：${restoreError.message}`) }
    }
    const message = failures.length ? `部分文件恢复失败：${failures.join("；")}。备份：${backupDir}` : "已从备份回滚全部运行时改动。"
    throw new Error(`组件部署失败，${message} 原因：${error.message}`, { cause: error })
  }
  const backend = new Set(["background-removal-service.js", "comfyui-client.js", "minimax-h3-workflow.js", "minimax-h3-task-service.js", "provider-protocol-engine.js", "provider-http-api.js", "ace-step-task-service.cjs", "asset-library-service.js", "resource-http-api.js", "curated-asset-service.js", "server-components/composition.js", "workflows/ace-step-music.json", "provider-protocol-engine.js", "chat-http-api.js", "canvas-feature-registry.js", "canvas-agent-capabilities.js", "canvas-agent-tool-adapters.js", "canvas-agent-runtime.js", "canvas-agent-conversation.js", "canvas-agent-skill-contract.js", "canvas-agent-http-api.js", "skill-registry.js", "skills/canvas-agent-core/SKILL.md", "core/canvas-node-registry.js", "desktop/startup.html"])
  backend.add("comfy-workflow-task-service.js")
  backend.add("media-generation-http-api.js")
  for (const name of components.filter(name => name.endsWith('-backend'))) {
    for (const file of componentTargets([name])) backend.add(file)
  }
  return { components, changed: [...plan.keys()], backupDir, restartRequired: [...plan.keys()].some(file => backend.has(file) || file.startsWith('desktop/')) }
}
