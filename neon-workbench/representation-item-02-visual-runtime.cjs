const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { openFixture, loadModels, settle } = require("./dom-scaling-test-support.cjs");

(async () => {
  const fixture = await openFixture();
  const screenshots = path.join(__dirname, "..", ".planning", "representation-fidelity-20261016", "item-02-visual-composition", "identity-probe");
  fs.mkdirSync(screenshots, { recursive: true });
  try {
    await loadModels(fixture, 100, "B");
    await settle(fixture.page, 900);
    const canvas = await fixture.page.evaluate(() => {
      const model = canvasVirtualStore.get("1");
      Object.assign(model, {
        tag: { id: "qa-tag", name: "验收标签", color: "#245a78", foreground: "#ffffff" },
        status: { text: "检查中", state: "running" },
        groupColor: "#345678",
        nodeColor: "#123456",
      });
      const geometry = window.resolveNodeVisualGeometry(model.id);
      canvasRepresentation.localScene = null;
      const identity = window.CanvasRepresentationVisualIdentity(model);
      const page = canvasRepresentation.scenePage(true);
      const row = page.visualNodes.find(item => String(item.id) === "1");
      const drawnText = [];
      const iconStrokes = [];
      const context = canvasSceneLayer.bufferContext;
      const fillText = context.fillText.bind(context);
      const stroke = context.stroke.bind(context);
      context.fillText = (text, ...args) => { drawnText.push(String(text)); return fillText(text, ...args); };
      context.stroke = (...args) => { if (args[0] instanceof Path2D) iconStrokes.push(context.strokeStyle); return stroke(...args); };
      canvasState.scale = 0.55;
      renderCanvasSceneLayer();
      context.fillText = fillText;
      context.stroke = stroke;
      return {
        identity,
        geometry,
        row: row && { kind: row.kind, icon: row.icon, title: row.title, kindLabel: row.kindLabel, tag: row.tag, status: row.status, groupColor: row.groupColor, nodeColor: row.nodeColor },
        drawnText,
        iconStrokes,
        summary: canvasSceneLayer.visualSummary,
        scale: canvasState.scale,
      };
    });
    assert.ok(canvas.row?.icon, "local Scene row must contain the resident node icon");
    assert.ok(canvas.row?.title, "local Scene row must contain the resident node title");
    assert.equal(canvas.row?.tag?.name, "验收标签", "local Scene row must share the resident node tag");
    assert.equal(canvas.row?.status?.text, "检查中", "local Scene row must share the resident node status");
    assert.equal(canvas.row?.nodeColor, "#123456", "local Scene row must share node color");
    assert.equal(canvas.row?.groupColor, "#345678", "local Scene row must share group color");
    assert.ok(canvas.geometry?.identityBounds && canvas.geometry?.mediaBounds && canvas.geometry?.statusBounds, "resolver must keep floating identity, media and overlay status regions distinct");
    assert.ok(canvas.drawnText.some(text => text.includes("验收节点1")), "Canvas must actually paint the resident node title");
    assert.ok(canvas.drawnText.includes("验收标签"), "Canvas must actually paint the resident node tag");
    assert.ok(canvas.drawnText.includes("检查中"), "Canvas must actually paint the resident node status");
    assert.ok(canvas.iconStrokes.includes("#123456"), "Canvas must actually stroke its icon in the node's semantic color");
    await fixture.page.screenshot({ path: path.join(screenshots, "normal-canvas.png") });

    const lightGeometry = await fixture.page.evaluate(async () => {
      canvasState.scale = .75;
      applyCanvasTransformNow();
      canvasVirtualizer.flushNow();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const model=canvasVirtualStore.get("1"),node=canvasVirtualStore.getMounted("1");
      if(!node||node.dataset.virtualLevel!=="light")return {level:node?.dataset.virtualLevel||"canvas"};
      const rootStyle=getComputedStyle(node),bodyStyle=getComputedStyle(node,"::before");
      const title=node.querySelector(".canvas-light-title").getBoundingClientRect();
      const icon=node.querySelector(".canvas-light-icon").getBoundingClientRect();
      const media=node.querySelector(".canvas-light-media")?.getBoundingClientRect()||null;
      return {level:node.dataset.virtualLevel,geometry:resolveNodeVisualGeometry(model.id),rootBorder:rootStyle.borderWidth,rootBackground:rootStyle.backgroundColor,bodyDisplay:bodyStyle.display,title:{left:title.left,top:title.top,width:title.width,height:title.height},icon:{left:icon.left,top:icon.top,width:icon.width,height:icon.height},media:media&&{left:media.left,top:media.top,width:media.width,height:media.height},mediaFit:node.querySelector(".canvas-light-media")&&getComputedStyle(node.querySelector(".canvas-light-media")).objectFit};
    });
    if(lightGeometry.level==="light") {
      assert.equal(lightGeometry.rootBorder,"0px","Light root must stay visually transparent");
      assert.equal(lightGeometry.mediaFit,"contain","Light media must preserve source ratio");
      await fixture.page.screenshot({ path: path.join(screenshots, "normal-light.png") });
    }

    const transition = await fixture.page.evaluate(async () => {
      const id="1",model=canvasVirtualStore.get(id),viewport=document.querySelector("#infiniteCanvas"),vr=viewport.getBoundingClientRect();
      if(canvasVirtualStore.getMountedLevel(id)==="light") await new Promise(resolve=>setTimeout(resolve,140));
      const point={x:vr.left+canvasState.x+(Number(model.x||0)+Number(model.width||400)/2)*canvasState.scale,y:vr.top+canvasState.y+(Number(model.y||0)+48+Number(model.height||400)/2)*canvasState.scale};
      return point;
    });
    await fixture.page.mouse.click(transition.x,transition.y);
    await settle(fixture.page,180);
    const fullGeometry=await fixture.page.evaluate(id=>{
      const node=getCanvasNode(id),viewport=document.querySelector("#infiniteCanvas"),vr=viewport.getBoundingClientRect(),card=node?.querySelector(".flora-node-card"),r=card?.getBoundingClientRect(),model=canvasVirtualStore.get(id),geometry=resolveNodeVisualGeometry(id);
      if(!node||!r)return null;
      const expected={left:vr.left+canvasState.x+geometry.outerBounds.left*canvasState.scale,top:vr.top+canvasState.y+geometry.outerBounds.top*canvasState.scale,width:(geometry.outerBounds.right-geometry.outerBounds.left)*canvasState.scale,height:(geometry.outerBounds.bottom-geometry.outerBounds.top)*canvasState.scale};
      return {selected:canvasState.selectedIds.has(id),level:CanvasNodeRepresentation.getLevel(id),actual:{left:r.left,top:r.top,width:r.width,height:r.height},expected,geometry};
    },"1");
    assert.ok(fullGeometry?.selected&&fullGeometry.level==="full","clicking the Scene body must enter selected Full");
    for(const key of ["left","top"])assert.ok(Math.abs(fullGeometry.actual[key]-fullGeometry.expected[key])<.5,`Full ${key} must follow the shared geometry`);
    for(const key of ["width","height"])assert.ok(Math.abs(fullGeometry.actual[key]-fullGeometry.expected[key])<1,`Full ${key} must follow the shared geometry`);
    await fixture.page.screenshot({ path: path.join(screenshots, "scene-to-selected-full.png") });
    await fixture.page.evaluate(async id=>{clearCanvasSelection();await CanvasNodeRepresentation.dehydrateNode(id);renderCanvasSceneLayer();},"1");
    await settle(fixture.page,150);
    await fixture.page.screenshot({ path: path.join(screenshots, "full-to-scene.png") });

    const light = await fixture.page.evaluate(() => {
      const model = {
        id: "item02-light-probe", kind: "image", icon: "sparkles", nodeTitle: "验收节点Light",
        kindLabel: "图片生成", tag: { id: "qa-tag", name: "验收标签", color: "#245a78", foreground: "#ffffff" },
        status: { text: "检查中", state: "running" }, groupColor: "#345678", nodeColor: "#123456",
        x: 9000, y: 9000, width: 400, height: 400,
      };
      const node = canvasRepresentation.createLight(model);
      const result = {
        id: node.dataset.id,
        level: node.dataset.virtualLevel,
        classes: node.className,
        children: node.querySelectorAll("*").length,
        iconPaths: node.querySelectorAll(".canvas-light-icon svg path").length,
        title: node.querySelector(".canvas-light-title")?.textContent,
        kind: node.querySelector(".canvas-light-kind")?.textContent,
        tag: node.querySelector(".canvas-light-tag")?.textContent,
        status: node.querySelector(".canvas-light-status")?.textContent,
        color: node.style.getPropertyValue("--canvas-light-color").trim(),
        tagColor: node.style.getPropertyValue("--canvas-light-tag-color").trim(),
        lucideAvailable: Boolean(window.lucide),
        lucideCreateElement: typeof window.lucide?.createElement,
        lucideIconCount: Object.keys(window.lucide?.icons || {}).length,
        hasSparkles: Boolean(window.lucide?.icons?.Sparkles),
      };
      node.remove();
      return result;
    });
    assert.equal(light.level, "light", "the inspected resident node must remain Light");
    assert.ok(light.iconPaths > 0, `Light DOM must contain a visible Lucide icon, not only a data-lucide placeholder: ${JSON.stringify(light)}`);
    assert.ok(light.title, "Light DOM must contain its node title");
    assert.ok(light.kind, "Light DOM must contain its node type");
    assert.equal(light.tag, "验收标签", "Light DOM must share the resident node tag");
    assert.equal(light.status, "检查中", "Light DOM must share the resident node status");
    assert.equal(light.color, "#123456", "Light DOM must share node color");
    assert.equal(light.tagColor, "#245a78", "Light DOM must share tag color");
    assert.ok(light.status, "Light DOM must contain its basic status");
    assert.ok(light.children <= 50, "Light must remain a compact DOM shell");
    assert.deepEqual(fixture.errors, [], "browser fixture must not emit page errors");
    console.log(JSON.stringify({ pass: true, canvas, lightGeometry, fullGeometry, screenshots, light, browser: fixture.browserVersion }, null, 2));
  } finally {
    await fixture.close();
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });

