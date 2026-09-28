# Design QA

## Source

- Reference: dark desktop settings center with a compact category sidebar, API provider browser, detail editor, and persistent footer actions.
- Requested behavior: add Settings at the bottom of the canvas toolbar; allow API URL and API Key entry, model discovery, and model assignment.

## Verified

- Settings is the final item in the floating canvas toolbar and opens above the canvas.
- The settings center follows the reference hierarchy while using the site's graphite and signal-yellow palette.
- API providers can be added, enabled or disabled, edited, removed, and saved.
- API Keys are masked in the browser and their storage file is blocked from static web access.
- Model discovery is available from the provider detail screen.
- Discovered models can be independently assigned to chat, image generation, or left disabled.
- Saved custom models refresh into the corresponding chat, image, and canvas-node model selectors.
- Canvas preferences, personalization, and local storage pages are functional and persist through the settings API.
- Desktop rendering at 1440x900 has no visible overlap or clipped controls.
- All four settings categories and the add-provider state were exercised with no browser errors.

## Verification

- `node --check script.js`
- `node --check server.js`
- `/api/settings`, `/api/models`, and `/api/image-models` return 200.
- `/data/settings.json`, `/.env`, and `/server.js` return 403.

final result: passed

---

# AI OS Global Appearance And Display Scale Design QA

## Comparison Target

- Visual reference: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-bfe5cdd5-cd71-40f6-ac01-bdb059c7b298.png`.
- Pre-fix evidence: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-05e7af02-81cd-4d5f-af77-9d977ac8fe45.png`.
- Final 100% light implementation: `Q:\音乐\Documents\New project\artifacts\design-qa\global-appearance-scale\light-settings.png`.
- Same-frame comparison: `Q:\音乐\Documents\New project\artifacts\design-qa\global-appearance-scale\reference-light-settings-comparison.png`.
- Browser viewport: 1440 × 900 CSS px; device scale factor 1. The supplied 1449 × 843 reference is aspect-preserved inside a 1440 × 900 comparison frame.
- Compared state: Appearance page, light mode, 100% selected, five scale previews visible.

## Focused Region Comparison Evidence

- A — sidebar material/navigation: the source crop is `270x550+20+60` from the 1449 × 843 reference (`focused-sidebar-nav-reference-270x550.png`); the implementation crop is `270x550+310+180` from the 1440 × 900 light/100% capture (`focused-sidebar-nav-implementation-270x550.png`). Both crops remain at 1:1 device pixels. `focused-sidebar-nav-comparison-540x586.png` places the two 270 × 550 crops side by side below a 36 px label strip.
- A conclusion: the focused comparison confirms the soft blue-grey translucent material, compact search/account stack, grouped navigation, icon/text alignment, and blue active row. The implementation uses its approved AI OS account/navigation inventory and a slightly cooler blue tint; these are product-scope/P3 optical differences, not fidelity defects. No dark-theme residue, clipping, or unreadable small text is present.
- B — five scale previews/selected state: the source crop is `1020x340+330+290` (`focused-scale-reference-1020x340.png`); the implementation crop is `1020x340+420+410` (`focused-scale-implementation-1020x340.png`). Both are 1020 × 340 at 1:1 pixels. `focused-scale-comparison-2040x376.png` places them side by side below a 36 px label strip.
- B conclusion: all five equal choices, miniature-window traffic lights/title/text bars, scale names/percentages, soft shadows, and the 100% blue outline/text selected state stay distinct. The implementation also shows the adjacent reduced-motion row as useful card-context evidence; it does not obscure the scale controls.
- These two crops isolate the highest-risk small details without whole-frame fit scaling: A covers sidebar material, typography, icon rhythm, and active-row geometry; B covers preview sharpness, repeated spacing, and the thin selected ring. Together they are sufficient to detect the prior light-sidebar and placeholder-preview regressions at native pixel density.

## Required Fidelity Surfaces

- Fonts and typography: both views use a native system sans stack with the same heading/body/metadata hierarchy. The AI OS small labels are optically a little heavier than the reference; this is P3 polish and does not reduce legibility.
- Spacing and layout: the implementation preserves the compact category sidebar, three appearance choices, one five-column scale row, generous content insets, rounded cards, and stable selected-state spacing. The full 1440 × 900 frame has no clipping or overlap.
- Colors: the previous light-mode black sidebar is gone. Light settings sidebar/window/field colors are `rgba(222, 233, 246, .78)`, `rgba(255, 255, 255, .82)`, and `rgba(255, 255, 255, .82)`; dark equivalents are `rgba(35, 43, 55, .86)`, `rgba(29, 35, 45, .88)`, and `rgba(18, 23, 31, .82)`. Menu bar, Dock, and canvas also change computed backgrounds between modes.
- Image and preview quality: all miniature window previews remain crisp at device scale factor 1. Their traffic-light dots, title, text bars, shadows, and blue selected ring remain distinct at every supported scale.
- Copy: the reference contains only `浅色 / 深色`; those two options and all five scale labels match the approved meaning. `自动` is an intentional product extension explicitly approved by the design specification, not a claim of reference parity. The independent `画布主题` label is absent by exact DOM assertion.
- Interaction: theme changes are account preferences; all five scale controls update the desktop matrix and logical size; 150% window dragging and middle-button canvas panning convert 150 physical px to 100 logical px. Refresh and a fresh login restore 150% for SuperQ while an ordinary account remains independently at 100%.
- Responsive and scale behavior: compensated logical sizes are 1920 × 1200, 1440 × 900, 1152 × 720, 960 × 600, and 822.86 × 514.29 for 75%, 100%, 125%, 150%, and 175%; the physical desktop remains 1440 × 900 within subpixel rounding.

## Comparison History

1. Round 0 — supplied pre-fix screenshot.
   - P0: none.
   - P1: light mode retained a black settings sidebar and dark field structure, breaking the system-wide light appearance.
   - P2: scale choices were plain glyph tiles rather than five readable miniature-window previews.
   - P2: a separate `画布主题` control allowed Canvas to disagree with the system appearance.
2. Round 1 — final Playwright captures.
   - Fix evidence for P1: `light-settings.png` shows a light semantic sidebar, surface, fields, menu bar, and Dock; computed-color assertions also distinguish every required light/dark surface.
   - Fix evidence for both P2 findings: the final settings capture shows five equal preview columns, and the browser asserts zero exact `画布主题` labels. `light-canvas.png` / `dark-canvas.png` show Canvas following the system mode.
   - P0/P1/P2 remaining: none.
3. Round 2 — native-pixel focused comparisons.
   - `focused-sidebar-nav-comparison-540x586.png` and `focused-scale-comparison-2040x376.png` were opened and inspected at their original pixel dimensions.
   - P0: none. P1: none. P2: none. The slightly cooler sidebar tint and small-label optical weight remain optional P3 polish only.

## Browser Evidence

- Captures: `light-settings.png`, `dark-settings.png`, `light-canvas.png`, and `dark-canvas.png` under `artifacts/design-qa/global-appearance-scale/`.
- Persistence: 150% survived reload and explicit logout/login for the administrator; the ordinary account stayed at its independent 100% default; returning to the administrator restored 150%.
- Console: no JavaScript `console.error` or uncaught page error occurred after authentication. The login gate still produces expected protected-resource 401 entries and a missing-favicon 404 in Chromium's network console; recorded as optional P3 cleanup because neither affects an authenticated surface or the accepted appearance/scale behavior.
- P3 optional: align the small-label optical weight even more closely with the reference and silence the login-gate network diagnostics.

final result: passed

---

# Gallery Frameless Cover And History Panel Design QA

## Comparison Target

- Source visual truth:
  - `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-93eb8167-b853-4c91-a6c5-572c0d35a4ac.png`
  - `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-736242d7-cb37-4048-8253-7139251cbf00.png`
- Browser-rendered implementation: `Q:\音乐\Documents\New project\artifacts\design-qa\gallery-frameless-history-implementation.png`
- Combined comparison: `Q:\音乐\Documents\New project\artifacts\design-qa\gallery-reference-implementation-comparison.png`
- Viewport: 1600 × 1000 CSS px.
- Density normalization: device scale factor 1; implementation capture is 1600 × 1000 px.
- Source pixels: frameless node 650 × 1050 px; history panel 575 × 1090 px.
- State: light theme, canvas 17, two-image gallery, current image 2, history panel open.

## Full-View Comparison Evidence

- The gallery surface is transparent and the image itself forms the node boundary.
- The cover uses a large rounded mask, layered cards, an overlapping history control, and a compact count badge.
- The history panel sits beside the node without changing its size and uses the same rounded floating-panel hierarchy as the reference.
- The history items are large visual previews with expand at the top-right and download at the bottom-right.

## Focused Region Comparison Evidence

- The combined comparison places both source references and the implementation crop in one image.
- The focused gallery region confirms that the node shell, title treatment, image crop, count badge, panel radius, item spacing, and action alignment remain readable at the same density.
- Portrait and landscape history images use `object-fit: contain`, so their visual size follows their own aspect ratio rather than a fixed thumbnail slot.

## Required Fidelity Surfaces

- Fonts and typography: the existing product font stack is retained; title size, weight, and hierarchy match the reference closely. Minor optical-weight differences are P3.
- Spacing and layout rhythm: panel width, header height, card gaps, control insets, large radii, and node-to-panel spacing match the reference structure.
- Colors and visual tokens: the product's warm canvas and yellow active state are retained; the history count badge uses the reference-like violet accent.
- Image quality and asset fidelity: the implementation uses the real generated image assets at full resolution. No placeholder, CSS drawing, or replacement image is used.
- Copy and content: `结果 · 2` and `点击图片可设为当前图片` communicate the same state and action as the reference.

## Comparison History

1. Initial capture found that dynamically mounted Lucide icons were not hydrated, leaving the history control visually empty.
   - Fix: defer icon hydration until after the gallery node is attached.
   - Post-fix evidence: the image-stack, close, expand, download, and delete icons render in the browser.
2. Second capture found a legacy 92px grid track constraining history previews.
   - Fix: replace the legacy two-column track with a single full-width preview track.
   - Post-fix evidence: apple and watermelon previews fill the card according to their aspect ratios.

## Findings

- No actionable P0, P1, or P2 differences remain.
- P3: the local product font has slightly heavier small-label rendering than the reference.

## Primary Interactions Tested

- Open the two-image history panel.
- Select an older history image as the current cover.
- Restore the latest image as the current cover.
- Confirm the history order remains unchanged.
- Confirm the browser console contains no errors.

final result: passed
