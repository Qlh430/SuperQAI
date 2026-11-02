# DOM Scaling P0–P3 Implementation Plan

> **For agentic workers:** Use subagent-driven-development for independent decision/diagnostic and browser-harness tasks, with host integration and final review in this session. User approved this design and explicitly requested continuous implementation; no further design approval gate.

**Goal:** Visible local resident nodes use bounded Full/Light DOM and existing Canvas Scene, with safe state round trips and measured100→200 scaling.

**Architecture:** RepresentationManager produces a desired Full/Light map for the existing Virtualizer; omitted visible nodes remain Canvas. Host adapters isolate lightweight markup from canonical full-node lookups and serialize before removal. Existing Scene receives merged local resident/server scene rows, never a fabricated server scenePage.

**Tech Stack:** Native JS, existing Canvas2D, model store, Edge/Playwright/CDP, Node assertions.

## Global constraints

Only P0–P3. No Screen Overlay, WebGPU, Edge Adjacency, Pan Fast Mode or separate media strategy. Full<=5 browsing, <=8 complex interaction; record protected exceptions. Light<=8, <=50 elements each, canvasDOM<=5000. 100→200 document/canvasDOM<=20%; native Pan/Zoom P95 median growth<=25%; separately P95<30ms. Preserve Neon/Flora, model/pending/undo/connections/protocol; no localStorage. Never stop3199. Backup before runtime edits, build then deploy.mjs only. Four-width acceptance after deploy.

### Task1: Pure decisions and bounded diagnostics

Files: new design-sources/canvas-representation-manager.js; new canvas-representation-manager.test.cjs.
Interface: new CanvasRepresentationManager({getFlags,now,onSchedule,fullBudget:5,lightBudget:8,demoteDelay:500}); plan({visibleIds,viewport,store,protectedReasons,selectedIds,primaryId,hoveredId,interacting}) -> Map<id,'full'|'light'>. levels Map retains 'canvas'/'canvas-rich' for visible nonDOM rows. recordTransition(kind,ms); diagnostics snapshot returns quantiles and protection counts/reasons.

- [ ] Red:200 visible models, no interaction yields0Full, <=8Light; protected focus survives budget; inactive Full receives500ms grace; flag-off returnsnull; gesture cannot add batch Full; bounded samples.
- [ ] Green:implement decision/diagnostic module only, unit test with fake clock/store; flags read dynamically.
- [ ] Review decision rules and pin exception reporting.

### Task2: Host representation and safe state

Files: design-sources/canvas-virtualizer.js, script-before-save-bridge.js, canvas-scene-layer.js, flora-node-shell.css; minimal composer/shell cleanup only if needed.
Virtualizer consumes getRepresentationPlan(context) callback; null means byte-for-byte legacy decision path; managed desired excludes legacy retention and pin promotion except explicit host protection.
Host mountCanvasVirtualNode(id,level) returns true lightweight representation forlight and original renderer forfull; getCanvasNode remainsfull-only. synchronize/capture UI only forfull, restore onhydrate. protect focus/playing/tasks/menus/resize/connecting/closures and record reason. use existing model scene fallback, merge pending updates and exclude mounted representation; actual local candidate query and no fake scenePage.

- [ ] Red browser test:local200 models/no scenePage leaves boundedDOM; light <=50; Scene hit activatesrealFull; prompt/model/parameters/results/history andundo/save survive downgrade.
- [ ] Green wire manager, localScene fallback, cleanup,500ms delay and independentflag fallback; keep existing event/selection contracts, multi-selection inScene.
- [ ] Verify connection/hit/group/composer/known renderer regressions, each transition failure visibly Chinese.

### Task3: Reproducible expansion and regression harness

Files: new dom-scaling-regression.cjs anddom-scaling-benchmark.cjs; test support under.planning/dom-scaling-20261015.
Use AI_OS_TEST_URL isolatedserver; optional source overlay addsnewmodule beforehostscript androutes canonical JS. normal model restore/add/load, neverpinall/deleteDOM/fakeScenePage. baseline disables3flags, after defaultson.

- [ ] Red run integration beforehostimplementation, confirm meaningful missing diagnostics/fullDOMfailure.
- [ ] Matrix36/100/200complex,500lightweight, A fixed-density andB trueoverview,3rounds, alternated100/200, sameviewport/content/edges. Native Pan andZoom separately; rAF active/whole/transition metrics, CDP Style/Layout/Paint/LongTasks, peakDOM andrepresentationcounts, GC heap/detached counters.
- [ ] Functional eachcase:edit/multiselect/boxselect/connection/result/enter-exit/SceneFullScene. Record masks andfailures, do nothideconstraints.
- [ ] State-specific andindependent3flagrollback checks. Save rawJSON/trace andexactenvironment.

### Task4: Review/deploy/final report

- [ ] Independent code review; fix important findings withcoveringtests.
- [ ] npm runbuild; deploy.mjs; verifycacheversions andsource/runtimehashes.
- [ ] Deployeddirectedtests andacceptance390/768/1440/1728. Compare fullScene visuals/focus/hover/fullscreen/mobile.
- [ ] UpdateDOM_SCALING_REPORT.md withallrequiredmetrics,remainingO(total)/O(visible),failedabsolute/scalingcriteria andmock/realboundary. NoP4–P13 followup.
- [ ] Stop onlyrecordedownedtestPID, verify3199alive. No unrelatedcommits orworktree reset; essentialexistinguncommittedwork stays.
