/**
 * AI OS · 3D 导演台 · three.js 渲染层
 *
 * The software rasteriser in canvas-director3d.js draws everything out of
 * boxes. This module is the second renderer: it loads the real skinned GLB
 * characters, plays their animation clips and drives individual bones, so a
 * scene can mix a rigged person with simple primitives.
 *
 * It is loaded lazily as an ES module. The stage keeps working on the software
 * renderer until this module resolves, and keeps working if it never does -
 * WebGL missing, offline, model files absent - so the two renderers are a
 * fallback pair rather than a hard dependency.
 *
 * three itself is vendored under assets/vendor/three and pulled in through the
 * page import map, because the official addons import the bare "three"
 * specifier instead of a relative path.
 *
 * Only one three.js scene is kept alive per stage. Every frame the module
 * reconciles that scene against the plain project data, which means the
 * project stays the single source of truth and nothing here writes to it.
 */
(function initCanvasDirector3dThree(root, factory) {
  if (root) root.CanvasDirector3dThree = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasDirector3dThree() {
  "use strict";

  const MODEL_BASE_URL = "./assets/models/director3d/";
  let modulePromise = null;

  /** Pulls three + the addons in once, and remembers the failure. */
  function loadThree() {
    if (modulePromise) return modulePromise;
    modulePromise = Promise.all([
      import("./assets/vendor/three/three.module.js"),
      import("./assets/vendor/three/addons/loaders/GLTFLoader.js"),
      import("./assets/vendor/three/addons/utils/SkeletonUtils.js"),
      import("./assets/vendor/three/addons/controls/TransformControls.js"),
    ]).then(([THREE, gltf, skeleton, transform]) => ({
      THREE,
      GLTFLoader: gltf.GLTFLoader,
      clone: skeleton.clone,
      TransformControls: transform.TransformControls,
    }));
    return modulePromise;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  /** A monotonic millisecond clock, so clips advance on wall time. */
  function now() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  /**
   * The live renderer for one stage. Everything it draws is derived from the
   * project data handed in through the getters, so the stage stays the single
   * writer and nothing here mutates the scene graph the caller owns.
   */
  function createStage3d(options = {}) {
    const core = options.core;
    const canvas = options.canvas;
    const getProject = options.getProject || (() => ({ items: [], keyframes: [] }));
    const getTime = options.getTime || (() => 0);
    const getSelectedId = options.getSelectedId || (() => "");
    const getShowGrid = options.getShowGrid || (() => true);
    const getShowNames = options.getShowNames || (() => true);
    const getHiddenIds = options.getHiddenIds || (() => []);
    const onFrame = typeof options.onFrame === "function" ? options.onFrame : () => {};

    let context = null;
    let renderer = null;
    let webglScene = null;
    let webglCamera = null;
    let pickCamera = null;
    let disposed = false;
    let ready = false;
    let loadError = "";
    let frameHandle = 0;
    let lastPixelRatio = 1;
    let gizmo = null;
    // The helper object the gizmo draws itself with. It lives in the scene, so
    // it has to be hidden around any render that is not the live stage - the
    // export and the camera preview would otherwise bake the arrows into the
    // picture.
    let gizmoHelper = null;
    // A handle request that arrived before its object had been built.
    let pendingGizmo = null;
    let ring = null;
    let lastStamp = 0;

    // One entry per item currently in the scene: meshes, rigs, mixers and the
    // last pose we pushed, so unchanged items are left alone between frames.
    const entries = new Map();
    const sourceCache = new Map();
    const loadPromises = new Map();
    const spriteCache = new Map();
    const grids = { grid: null };

    /**
     * Loads a GLB once and keeps the parsed result around. Both the mesh clone
     * and SkeletonUtils.clone need the parsed scene, so caching the source
     * avoids re-parsing a multi-megabyte file for every instance.
     */
    function loadSource(url) {
      if (sourceCache.has(url)) return Promise.resolve(sourceCache.get(url));
      if (loadPromises.has(url)) return loadPromises.get(url);
      const promise = new Promise((resolve, reject) => {
        const loader = new context.GLTFLoader();
        loader.load(url, (gltf) => {
          sourceCache.set(url, gltf);
          resolve(gltf);
        }, undefined, (error) => reject(error instanceof Error ? error : new Error(String((error && error.message) || error))));
      });
      loadPromises.set(url, promise);
      return promise;
    }

    function init() {
      return loadThree().then((loaded) => {
        if (disposed) return false;
        context = loaded;
        const THREE = loaded.THREE;
        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: true,
          // The camera preview is composited into a 2D canvas, which reads the
          // WebGL surface back after the render call. Without a preserved
          // drawing buffer that read is undefined once the frame is composited.
          preserveDrawingBuffer: Boolean(options.preserveBuffer),
          powerPreference: "high-performance",
        });
        renderer.setClearAlpha(0);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;

        webglScene = new THREE.Scene();
        webglCamera = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 400);
        pickCamera = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 400);

        // Lighting matches the software renderer's mood: a cool key from the
        // upper left, a soft fill opposite it, a hemisphere so backs never go
        // flat, and a cool rim from behind to pick the silhouette off the dark
        // backdrop. Without the rim a dark-costumed actor disappears into the
        // background and the shot reads as empty.
        webglScene.add(new THREE.HemisphereLight(0xe4ecf7, 0x39404a, 1.75));
        const key = new THREE.DirectionalLight(0xfff4e8, 2.9);
        key.position.set(4.5, 7.5, 3.2);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.camera.near = 0.5;
        key.shadow.camera.far = 40;
        key.shadow.camera.left = -9;
        key.shadow.camera.right = 9;
        key.shadow.camera.top = 9;
        key.shadow.camera.bottom = -9;
        webglScene.add(key);
        const fill = new THREE.DirectionalLight(0xa9c0da, 0.95);
        fill.position.set(-5, 3.5, -4);
        webglScene.add(fill);
        const rim = new THREE.DirectionalLight(0xcfe0ff, 1.1);
        rim.position.set(-2.5, 4.2, -6.5);
        webglScene.add(rim);

        // A ground plane catches the shadows that make a figure read as
        // standing on the floor rather than floating over the grid.
        const ground = new THREE.Mesh(
          new THREE.PlaneGeometry(120, 120),
          new THREE.ShadowMaterial({ opacity: 0.22 }),
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        ground.renderOrder = -1;
        webglScene.add(ground);

        ready = true;
        schedule();
        return true;
      }).catch((error) => {
        loadError = String((error && error.message) || error);
        if (typeof options.onError === "function") options.onError(loadError);
        return false;
      });
    }

    function isReady() {
      return ready && !disposed;
    }

    function error() {
      return loadError;
    }

    /**
     * Queues one frame on the next animation tick.
     *
     * This is a coalescing nudge rather than a loop: the stage itself owns the
     * frame clock because it has to keep its 2D overlay layers and the camera
     * preview in step with every WebGL frame, and two independent loops would
     * simply draw each frame twice.
     */
    function schedule() {
      if (frameHandle || disposed) return;
      frameHandle = requestAnimationFrame(() => {
        frameHandle = 0;
        draw();
      });
    }

    /** Builds the line grid that replaces the software renderer's floor. */
    function ensureGrid() {
      if (grids.grid || !isReady()) return;
      const THREE = context.THREE;
      const size = core.GROUND_LIMIT * 2;
      const grid = new THREE.GridHelper(size, 24, 0x5c6b7d, 0x39434f);
      grid.material.transparent = true;
      grid.material.opacity = 0.55;
      grid.position.y = 0.002;
      webglScene.add(grid);
      grids.grid = grid;
    }

    /** A canvas-texture name tag that always faces the camera. */
    function nameSprite(item) {
      if (!isReady()) return null;
      if (spriteCache.has(item.id)) return spriteCache.get(item.id);
      const THREE = context.THREE;
      const pad = 10;
      const font = "500 26px system-ui, -apple-system, 'Segoe UI', sans-serif";
      const probe = document.createElement("canvas").getContext("2d");
      probe.font = font;
      const label = String(item.name || "");
      const width = Math.ceil(probe.measureText(label).width) + pad * 2;
      const height = 44;
      const canvasEl = document.createElement("canvas");
      canvasEl.width = width;
      canvasEl.height = height;
      const ctx = canvasEl.getContext("2d");
      const selected = getSelectedId() === item.id;
      ctx.fillStyle = selected ? "rgba(213,255,64,0.94)" : "rgba(12,14,18,0.74)";
      ctx.beginPath();
      ctx.roundRect(0, 0, width, height, height / 2);
      ctx.fill();
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = selected ? "#10110e" : "#e8ecf2";
      ctx.fillText(label, width / 2, height / 2 + 1);
      const texture = new THREE.CanvasTexture(canvasEl);
      if ("colorSpace" in texture) texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
      sprite.scale.set((width / height) * 0.24, 0.24, 1);
      sprite.renderOrder = 999;
      sprite.userData.selected = selected;
      spriteCache.set(item.id, sprite);
      return sprite;
    }

    function dropSprite(itemId) {
      const sprite = spriteCache.get(itemId);
      if (!sprite) return;
      webglScene?.remove(sprite);
      sprite.material?.map?.dispose?.();
      sprite.material?.dispose?.();
      spriteCache.delete(itemId);
    }

    function clearSpriteCache() {
      for (const id of [...spriteCache.keys()]) dropSprite(id);
    }

    /**
     * Bone names that may touch the floor while a character is posed.
     *
     * The contact point has to be read off the *sole*, so only joints at or
     * below the ankle are considered: reading the whole skeleton would let a
     * hand dangling past the knee decide where the character stands. Every rig
     * in the library names these the same way except the fox and the wooden
     * figure, whose feet are simply absent from the list and therefore ignored.
     */
    const CONTACT_JOINTS = [
      "LeftToe_End", "LeftToeBase", "LeftFoot",
      "RightToe_End", "RightToeBase", "RightFoot",
    ];

    /**
     * The lowest a hand-posed character's hips may sit, in world metres.
     *
     * Only a safety net: the solved stances place the hips around 0.8 m standing
     * folded and 0.45 m seated, so a pose that reads correctly never reaches
     * this line.
     */
    const HIP_FLOOR = 0.06;

    /**
     * World-space Y of the lowest point of the posed figure.
     *
     * The feet are preferred, because that is what a standing character rests
     * on; but a stance can fold a leg so far that the knee ends up below the
     * ankle, or reach a hand to the floor, and grounding by the feet alone would
     * then bury the rest of the body. Falling back to the whole skeleton keeps
     * the character above the grid whatever the pose does.
     */
    function lowestContactY(entry) {
      const world = new context.THREE.Vector3();
      let lowest = Infinity;
      for (const name of CONTACT_JOINTS) {
        const bone = entry.bones.get(name);
        if (!bone) continue;
        bone.getWorldPosition(world);
        if (world.y < lowest) lowest = world.y;
      }
      if (Number.isFinite(lowest)) return lowest;
      for (const bone of entry.bones.values()) {
        if (!bone.isBone) continue;
        bone.getWorldPosition(world);
        if (world.y < lowest) lowest = world.y;
      }
      return lowest;
    }

    /**
     * Keeps a hand-posed character standing on the floor.
     *
     * A joint override rotates a bone but never moves the hips, so a stance that
     * folds the legs - a squat, a seat - swings the feet up towards the chest and
     * leaves the character hanging a metre in the air. The clip is not at fault
     * and neither is the rig, so the correction belongs here rather than in the
     * angle tables.
     *
     * What is corrected is the *difference* the overrides make, measured by
     * momentarily handing the posed bones back to the clip and reading the same
     * joints again. That matters: grounding the pose outright would cancel the
     * rise and fall a stride is supposed to have, while grounding it relative to
     * the clip leaves the animation's own contact and bounce exactly as it was.
     * A character with no overrides makes no correction at all, so nothing that
     * already looked right can move.
     */
    function groundLock(entry) {
      const root = entry.modelRoot;
      if (!root || !entry.bones || !entry.jointApplied || !entry.jointApplied.size) return;
      if (entry.baseY === undefined) return;
      entry.jointBase = entry.jointBase || new Map();

      root.updateMatrixWorld(true);
      const posed = lowestContactY(entry);
      if (!Number.isFinite(posed)) return;

      // Hand the overridden bones back to the clip, read the untouched contact,
      // then restore the pose. Only rotations are touched, so nothing is lost.
      const saved = [];
      for (const name of entry.jointApplied.keys()) {
        const bone = entry.bones.get(name);
        const base = entry.jointBase.get(name);
        if (!bone || !base) continue;
        saved.push([bone, bone.rotation.clone()]);
        bone.rotation.copy(base);
      }
      root.updateMatrixWorld(true);
      const plain = lowestContactY(entry);
      for (const [bone, rotation] of saved) bone.rotation.copy(rotation);
      root.updateMatrixWorld(true);
      if (!Number.isFinite(plain)) return;

      // Both readings share the same root offset, so their difference is purely
      // what the pose added; the absolute target is therefore a fixed number and
      // must be assigned rather than accumulated, or it would compound every
      // frame.
      let wanted = entry.baseY - (posed - plain) * localPerWorldY(root);

      // A pose can fold so far that parking the feet on the floor would push
      // the body underground - a leg rotated the wrong way for this rig, or an
      // override saved before the angle was corrected. Lowering is therefore
      // capped at the point where the hips meet the grid: the figure may end up
      // standing high, but it never sinks out of sight, and every pose that
      // already works sits far above this line.
      root.position.y = wanted;
      root.updateMatrixWorld(true);
      const hips = entry.bones.get("Hips");
      if (hips) {
        const world = new context.THREE.Vector3();
        hips.getWorldPosition(world);
        if (world.y < HIP_FLOOR) {
          wanted += (HIP_FLOOR - world.y) * localPerWorldY(root);
          root.position.y = wanted;
          root.updateMatrixWorld(true);
        }
      }
    }


    /**
     * How many local Y units the model root needs per world Y metre.
     *
     * The root hangs under the item group, which carries the project scale and
     * the item's rotation; a yaw leaves world Y alone, but a scale or a tilt
     * does not, and dividing by the wrong number is what would leave the
     * character hovering just above or just below the grid.
     */
    function localPerWorldY(root) {
      const parent = root.parent;
      if (!parent) return 1;
      const elements = parent.matrixWorld.elements;
      const length = Math.hypot(elements[4], elements[5], elements[6]);
      if (!length) return 1;
      // Component of the parent's local +Y along world +Y, in unit terms.
      const alignment = elements[5] / length;
      if (Math.abs(alignment) < 1e-4) return 1;
      return 1 / (length * alignment);
    }

    /** Degrees from the project become radians for three. */
    function jointToRadians(rotation) {
      return [
        ((Number(rotation && rotation.x) || 0) * Math.PI) / 180,
        ((Number(rotation && rotation.y) || 0) * Math.PI) / 180,
        ((Number(rotation && rotation.z) || 0) * Math.PI) / 180,
      ];
    }

    /** True when two eulers hold the same angle, within float noise. */
    function sameRotation(left, right) {
      return Math.abs(left.x - right.x) < 1e-6
        && Math.abs(left.y - right.y) < 1e-6
        && Math.abs(left.z - right.z) < 1e-6;
    }

    /**
     * Applies manual joint overrides on top of whatever the clip just wrote.
     *
     * An override is an offset in degrees, not a replacement. The stage and the
     * panel both promise that a pose stacks on the animation that is playing, and
     * writing the euler outright throws away the rig's own rotation for that
     * bone - which is exactly how a hand-authored "hands on hips" ended up with
     * both hands at the shoulders, and why posing a bone snapped the limb to an
     * unrelated angle instead of nudging it.
     *
     * The rotation the clip drives is remembered per bone so the offset can be
     * re-applied every frame. The mixer rewrites that rotation each frame, while
     * a bone no clip touches still holds the value written last time; comparing
     * against that tells the two apart without a second skeleton.
     */
    function applyJoints(entry, joints) {
      if (!entry.bones) return;
      if (!entry.jointBase) {
        entry.jointBase = new Map();
        entry.jointApplied = new Map();
      }
      const wanted = joints && typeof joints === "object" ? joints : {};

      // A bone that is no longer overridden is released so the clip owns it again.
      for (const name of [...entry.jointApplied.keys()]) {
        if (wanted[name]) continue;
        entry.jointApplied.delete(name);
        entry.jointBase.delete(name);
      }

      for (const [name, rotation] of Object.entries(wanted)) {
        const bone = entry.bones.get(name);
        if (!bone) continue;
        const applied = entry.jointApplied.get(name);
        // Anything other than the value written last frame came from the mixer,
        // so that is the clip's own pose for this bone and becomes the new base.
        if (!applied || !sameRotation(bone.rotation, applied)) {
          entry.jointBase.set(name, bone.rotation.clone());
        }
        const base = entry.jointBase.get(name) || bone.rotation.clone();
        if (!entry.jointBase.has(name)) entry.jointBase.set(name, base);
        const radians = jointToRadians(rotation);
        bone.rotation.set(base.x + radians[0], base.y + radians[1], base.z + radians[2]);
        entry.jointApplied.set(name, bone.rotation.clone());
      }
    }

    /**
     * Indexes every bone under both its authored name and its bare name.
     *
     * The bundled rigs author bones as `mixamorig:Hips`, but GLTFLoader runs
     * names through PropertyBinding.sanitizeNodeName, which drops the colon and
     * yields `mixamorigHips`. Mapping the prefix away as well means one joint
     * table works whether a model arrives namespaced, sanitized, or plain.
     */
    function collectBones(root) {
      const bones = new Map();
      const prefixes = ["mixamorig", "mixamorig_", "Armature"];
      root.traverse((node) => {
        if (!node.isBone) return;
        const raw = String(node.name || "").trim();
        if (!raw) return;
        const names = new Set([raw]);
        if (raw.includes(":")) names.add(raw.split(":").pop());
        if (raw.includes("|")) names.add(raw.split("|").pop());
        for (const prefix of prefixes) {
          if (raw.length <= prefix.length || !raw.startsWith(prefix)) continue;
          const rest = raw.slice(prefix.length).replace(/^[_:|-]+/, "");
          if (rest) names.add(rest);
        }
        for (const name of names) {
          if (!bones.has(name)) bones.set(name, node);
        }
      });
      return bones;
    }

    /** Builds the three-side object for one project item. */
    function buildEntry(item) {
      const THREE = context.THREE;
      const group = new THREE.Group();
      group.userData.itemId = item.id;
      const entry = { item, group, mixer: null, action: null, bones: null, clipId: "", model: null };

      if (core.isModelItem(item)) {
        const model = core.modelFor(item);
        entry.model = model;
        entry.loading = loadSource(model.url).then((gltf) => {
          if (disposed || entries.get(item.id) !== entry) return;
          const clone = context.clone(gltf.scene);
          clone.traverse((node) => {
            if (node.isMesh || node.isSkinnedMesh) {
              node.castShadow = true;
              node.receiveShadow = true;
              node.frustumCulled = false;
            }
          });
          // Normalise every character to the same height so shot presets and
          // camera distances behave the same across the library.
          //
          // The world matrices have to be brought up to date first: the skinned
          // rig hangs under an `Armature` node that carries its own 0.01 scale,
          // and a bounds box measured before that transform is applied reports
          // the raw centimetre units instead of metres, which would normalise
          // the model to roughly a hundred times its intended size.
          clone.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(clone);
          const height = Math.max(0.01, box.max.y - box.min.y);
          const scaleFactor = model.height / height;
          clone.scale.setScalar(scaleFactor);
          // Where the bind pose sits once its own bounds are normalised. A
          // hand-posed stance can leave the figure standing in mid air - see
          // the ground lock in the draw loop - so the value is kept as the
          // baseline the lock offsets from.
          clone.position.y = -box.min.y * scaleFactor;
          entry.baseY = clone.position.y;
          clone.updateMatrixWorld(true);
          entry.modelRoot = clone;
          entry.bones = collectBones(clone);
          group.add(clone);
          if (gltf.animations && gltf.animations.length) {
            entry.mixer = new THREE.AnimationMixer(clone);
            entry.clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
          }
          if (entry.mixer) playClip(entry, model.clip, true);
          applyJoints(entry, model.joints);
          // The bones move as soon as the mixer runs, so the world matrices are
          // refreshed once more before anything projects a joint to screen.
          clone.updateMatrixWorld(true);
          entry.ready = true;
          schedule();
        }).catch((loadFailure) => {
          entry.failed = String((loadFailure && loadFailure.message) || loadFailure);
          if (typeof options.onModelError === "function") options.onModelError(item.kind, entry.failed);
        });
      } else if (item.kind === "camera") {
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.22, 0.34),
          new THREE.MeshStandardMaterial({ color: 0x3c4450, roughness: 0.6, metalness: 0.1 }),
        );
        body.castShadow = true;
        const lens = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.16, 0.24),
          new THREE.MeshStandardMaterial({ color: 0x2b323b }),
        );
        lens.position.set(0, 0.02, -0.28);
        group.add(body, lens);
      } else if (item.kind === "board") {
        const board = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 1.2, 0.04),
          new THREE.MeshStandardMaterial({ color: item.color || 0xcbd2d8, roughness: 0.85 }),
        );
        board.position.y = 0.6;
        board.castShadow = true;
        board.receiveShadow = true;
        group.add(board);
      } else if (item.kind === "plane") {
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(2, 2),
          new THREE.MeshStandardMaterial({ color: item.color || 0x9aa6b2, roughness: 0.9, side: THREE.DoubleSide }),
        );
        plane.rotation.x = -Math.PI / 2;
        plane.receiveShadow = true;
        group.add(plane);
      } else {
        const cube = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ color: item.color || 0xb9c2cb, roughness: 0.7, metalness: 0.05 }),
        );
        cube.position.y = 0.5;
        cube.castShadow = true;
        cube.receiveShadow = true;
        group.add(cube);
      }

      webglScene.add(group);
      return entry;
    }

    function dropEntry(itemId) {
      const entry = entries.get(itemId);
      if (!entry) return;
      webglScene?.remove(entry.group);
      entry.group.traverse((node) => {
        if (node.geometry) node.geometry.dispose?.();
        if (node.material) {
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          for (const material of materials) material.dispose?.();
        }
      });
      dropSprite(itemId);
      entries.delete(itemId);
      forgetPendingGizmo(itemId);
    }

    function playClip(entry, clipId, immediate) {
      if (!entry.mixer || !entry.clips) return null;
      const wanted = String(clipId || "");
      const clip = entry.clips.get(wanted) || entry.clips.values().next().value;
      if (!clip) return null;
      const changed = entry.clipId !== clip.name;
      entry.clipId = clip.name;
      if (changed || !entry.action) {
        if (entry.action) entry.action.stop();
        entry.action = entry.mixer.clipAction(clip);
        entry.action.loop = context.THREE.LoopRepeat;
        entry.action.clampWhenFinished = false;
        if (!immediate) entry.action.reset();
        entry.action.play();
        entry.action.paused = false;
        entry.action.weight = 1;
      }
      return entry.action;
    }

    function syncOne(item, time) {
      let entry = entries.get(item.id);
      if (!entry) {
        entry = buildEntry(item);
        entries.set(item.id, entry);
      }
      // The project is rebuilt on every load, so the item this entry was built
      // from is a different object once a scene is replaced or reloaded.
      // Holding the original would keep posing and clip changes frozen on the
      // first copy that was ever seen.
      entry.item = item;
      const transform = core.resolveItemTransform(getProject(), item, time);
      const group = entry.group;
      group.position.set(transform.position[0], transform.position[1], transform.position[2]);
      if (item.kind === "camera" && typeof core.rotationMatrix === "function") {
        // The marker has to point exactly where the shot points, and three's
        // default Euler order does not read these numbers the way the project
        // basis does. Feeding it the basis as a quaternion sidesteps the order
        // entirely, so the box the operator drags always faces the lens axis.
        entry.basis = core.rotationMatrix(transform.rotation);
        const THREE = context.THREE;
        const flat = entry.basis;
        const ordered = [flat[0], flat[4], flat[8], 0, flat[1], flat[5], flat[9], 0, flat[2], flat[6], flat[10], 0, 0, 0, 0, 1];
        group.quaternion.setFromRotationMatrix(new THREE.Matrix4().fromArray(ordered));
      } else {
        group.rotation.set(transform.rotation[0], transform.rotation[1], transform.rotation[2]);
      }
      group.scale.set(transform.scale[0], transform.scale[1], transform.scale[2]);
      group.visible = transform.visible !== false;
      entry.transform = transform;
      if (entry.mixer) {
        const wanted = core.isModelItem(item) ? core.modelFor(item).clip : "";
        playClip(entry, wanted, false);
      }
      return entry;
    }

    /**
     * The logical size of the surface.
     *
     * The stage canvas is measured from the document, but the camera preview
     * renders into a detached canvas whose rect is always zero, so it supplies
     * its own size instead.
     */
    function stageRect() {
      if (typeof options.getSize === "function") {
        const sized = options.getSize();
        if (sized) return { width: Math.max(1, Number(sized.width) || 1), height: Math.max(1, Number(sized.height) || 1) };
      }
      const rect = canvas.getBoundingClientRect();
      return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    }

    function syncCamera(camera, view, rect) {
      camera.fov = Number(view.fov) || 42;
      camera.aspect = rect.width / Math.max(1, rect.height);
      camera.up.set(0, 1, 0);
      camera.position.set(view.eye.x, view.eye.y, view.eye.z);
      camera.lookAt(view.target.x, view.target.y, view.target.z);
      if (view.roll) camera.rotateZ((-view.roll * Math.PI) / 180);
      camera.updateProjectionMatrix();
    }

    function draw() {
      if (!isReady()) return;
      const rect = stageRect();
      if (rect.width < 2 || rect.height < 2) return;
      const ratio = clamp(window.devicePixelRatio || 1, 1, 2);
      const pixelWidth = Math.round(rect.width * ratio);
      const pixelHeight = Math.round(rect.height * ratio);
      if (renderer.domElement.width !== pixelWidth || renderer.domElement.height !== pixelHeight || lastPixelRatio !== ratio) {
        lastPixelRatio = ratio;
        renderer.setPixelRatio(ratio);
        renderer.setSize(rect.width, rect.height, false);
      }
      // A detached canvas keeps its own stylesheet untouched; setSize would
      // otherwise rewrite width/height and grow the element on every frame.
      if (typeof options.getSize === "function") {
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }
      const view = options.getView ? options.getView() : null;
      if (!view) return;
      syncCamera(webglCamera, view, rect);

      const project = getProject();
      const time = getTime();
      const hidden = new Set(getHiddenIds().map(String));
      const alive = new Set();
      for (const item of project.items || []) {
        alive.add(item.id);
        if (hidden.has(String(item.id))) {
          const existing = entries.get(item.id);
          if (existing) existing.group.visible = false;
          continue;
        }
        syncOne(item, time);
      }
      for (const id of [...entries.keys()]) if (!alive.has(id)) dropEntry(id);
      // The objects exist now, so a handle request that arrived early can be
      // satisfied on this frame.
      applyPendingGizmo();

      // Animation clips run on their own clock, deliberately decoupled from the
      // timeline playhead: a character keeps its idle or walk loop alive while
      // the director scrubs camera keyframes elsewhere. Manual joint overrides
      // are re-applied after the mixer every frame, so a hand-posed limb beats
      // the clip that is also driving that bone.
      const stamp = now();
      const delta = lastStamp ? Math.min(0.12, (stamp - lastStamp) / 1000) : 0;
      lastStamp = stamp;
      for (const entry of entries.values()) {
        if (entry.mixer) entry.mixer.update(delta);
        // Manual overrides are re-applied after the mixer so a hand-posed limb
        // beats the clip that also drives that bone.
        if (core.isModelItem(entry.item)) applyJoints(entry, core.modelFor(entry.item).joints);
        // A pose that folds the legs has to be brought back down to the floor,
        // and it has to happen after the overrides but before anything projects
        // a bone to the screen, or the joint dots would sit where the character
        // used to be.
        groundLock(entry);
      }

      ensureGrid();
      if (grids.grid) grids.grid.visible = getShowGrid();

      // Name tags.
      const showNames = getShowNames();
      for (const item of project.items || []) {
        const wanted = showNames && !hidden.has(String(item.id));
        if (!wanted) {
          dropSprite(item.id);
          continue;
        }
        const sprite = nameSprite(item);
        if (!sprite) continue;
        const transform = core.resolveItemTransform(project, item, time);
        const meta = core.ITEM_KINDS[item.kind] || {};
        const height = (meta.height || 1) * Math.abs(transform.scale[1] || 1);
        sprite.position.set(transform.position[0], transform.position[1] + height + 0.26, transform.position[2]);
        if (!sprite.parent) webglScene.add(sprite);
      }

      syncSelectionRing(project, time);

      renderer.render(webglScene, webglCamera);
      onFrame();
    }

    function syncSelectionRing(project, time) {
      const selected = core.findItem(project, getSelectedId());
      if (!selected) {
        if (ring) ring.visible = false;
        return;
      }
      const THREE = context.THREE;
      if (!ring) {
        const geometry = new THREE.RingGeometry(0.46, 0.54, 48);
        const material = new THREE.MeshBasicMaterial({ color: 0xd5ff40, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
        ring = new THREE.Mesh(geometry, material);
        ring.rotation.x = -Math.PI / 2;
        webglScene.add(ring);
      }
      const transform = core.resolveItemTransform(project, selected, time);
      ring.visible = selected.kind !== "camera";
      ring.position.set(transform.position[0], transform.position[1] + 0.01, transform.position[2]);
    }

    /** Raycasts the skinned meshes and primitives, nearest hit wins. */
    function pick(view, point) {
      if (!isReady()) return null;
      const THREE = context.THREE;
      const rect = stageRect();
      syncCamera(pickCamera, view, rect);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(
        new THREE.Vector2((point.x / rect.width) * 2 - 1, -(point.y / rect.height) * 2 + 1),
        pickCamera,
      );
      const hidden = new Set(getHiddenIds().map(String));
      const targets = [];
      for (const entry of entries.values()) {
        if (!entry.group.visible) continue;
        if (hidden.has(String(entry.item.id))) continue;
        entry.group.traverse((node) => {
          if (node.isMesh || node.isSkinnedMesh) targets.push(node);
        });
      }
      for (const hit of raycaster.intersectObjects(targets, false)) {
        let node = hit.object;
        while (node && !node.userData.itemId) node = node.parent;
        if (node && node.userData.itemId) return core.findItem(getProject(), node.userData.itemId);
      }
      return null;
    }

    /** Ground point under the pointer, for dragging things across the floor. */
    function groundPoint(view, point) {
      if (!isReady()) return null;
      const THREE = context.THREE;
      const rect = stageRect();
      syncCamera(pickCamera, view, rect);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(
        new THREE.Vector2((point.x / rect.width) * 2 - 1, -(point.y / rect.height) * 2 + 1),
        pickCamera,
      );
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
      return { x: hit.x, y: 0, z: hit.z };
    }

    /** Where a single bone sits on screen, for drawing joint dots. */
    function boneScreenPoint(item, boneId, view) {
      const entry = entries.get(item.id);
      if (!entry || !entry.bones) return null;
      const bone = entry.bones.get(boneId);
      if (!bone) return null;
      const THREE = context.THREE;
      const rect = stageRect();
      syncCamera(webglCamera, view, rect);
      webglCamera.updateMatrixWorld(true);
      const world = new THREE.Vector3();
      bone.getWorldPosition(world);
      const projected = world.clone().project(webglCamera);
      if (projected.z > 1) return null;
      return {
        x: ((projected.x + 1) / 2) * rect.width,
        y: ((1 - projected.y) / 2) * rect.height,
        depth: projected.z,
      };
    }

    /** Every grabbable bone of an item, projected to screen space. */
    function boneHandles(item, view, jointControls) {
      const handles = [];
      for (const control of jointControls || []) {
        const point = boneScreenPoint(item, control.id, view);
        if (point) handles.push({ ...control, x: point.x, y: point.y, depth: point.depth });
      }
      return handles;
    }

    /**
     * Attaches the three transform gizmo to an object.
     *
     * Dragging the gizmo edits the three object in place; the stage reads the
     * result back through readItemTransform and stores it on the project, so
     * the project stays the only thing that is ever saved.
     *
     * A camera marker keeps its orientation expressed as the project's own
     * basis rather than as a three Euler. The two layers read the same three
     * numbers differently - three meshes use the default `XYZ` order while the
     * project basis is `ZYX(-x, y, -z)` - so a marker turned by three would
     * show a different aim than the shot that is actually rendered. Writing the
     * basis straight onto the marker removes the ambiguity, and
     * `readItemTransform` hands the dragged basis back for the project to
     * invert.
     */
    function attachGizmo(item, mode) {
      // A request that arrives before the item has been built - a freshly added
      // object, or a scene that has not drawn one frame yet - is remembered and
      // honoured on the next pass instead of being dropped. Dropping it is what
      // makes selecting an object appear to do nothing.
      pendingGizmo = { itemId: String(item && item.id || ""), mode: mode || "translate" };
      return applyPendingGizmo();
    }

    /** Attaches the remembered handle request, once its object exists. */
    function applyPendingGizmo() {
      if (!pendingGizmo || !isReady()) return false;
      // The addon exports the class itself, while a host may hand over either
      // the class or a bag that carries it. Both shapes are resolved down to
      // one constructor here: reading `.TransformControls` off the class is how
      // the handle silently became `new undefined()` and never appeared.
      const Controls = resolveTransformControls();
      if (typeof Controls !== "function") return false;
      const entry = entries.get(pendingGizmo.itemId);
      if (!entry) return false;
      const mode = pendingGizmo.mode;
      const wanted = pendingGizmo.itemId;
      pendingGizmo = null;
      const item = entry.item;
      if (!item) return false;
      if (!gizmo) {
        gizmo = new Controls(webglCamera, canvas);
        gizmoHelper = typeof gizmo.getHelper === "function" ? gizmo.getHelper() : gizmo;
        webglScene.add(gizmoHelper);
        gizmo.addEventListener("dragging-changed", (event) => {
          if (typeof options.onDragging === "function") options.onDragging(event.value);
        });
        gizmo.addEventListener("objectChange", () => {
          if (typeof options.onGizmoChange === "function") options.onGizmoChange();
        });
      }
      gizmo.setMode(mode || "translate");
      gizmo.attach(entry.group);
      schedule();
      return true;
    }

    /** Drops a remembered handle request when its target goes away. */
    function forgetPendingGizmo(itemId) {
      if (pendingGizmo && pendingGizmo.itemId === String(itemId || "")) pendingGizmo = null;
    }

    function detachGizmo() {
      pendingGizmo = null;
      if (gizmo) gizmo.detach();
      schedule();
    }

    /**
     * The id of the item the transform handles are currently bound to, or "".
     *
     * `gizmoAxis()` only says whether the pointer happens to be over a handle,
     * which is useless for telling whether the arrows are on screen at all;
     * this is the read-only seam the browser check uses to assert that
     * selecting an object is enough to show them.
     */
    function gizmoAttachedTo() {
      const target = gizmo && gizmo.object;
      return target && target.userData ? String(target.userData.itemId || "") : "";
    }

    /** The TransformControls constructor, whichever shape it arrived in. */
    function resolveTransformControls() {
      const supplied = options.transform;
      if (typeof supplied === "function") return supplied;
      if (supplied && typeof supplied.TransformControls === "function") return supplied.TransformControls;
      return typeof context.TransformControls === "function" ? context.TransformControls : null;
    }

    /**
     * The bone names a loaded rig actually carries, without the namespace
     * prefix. The panel uses this to grey out joints a model does not have, and
     * it doubles as the answer to "did the skin even load".
     */
    function boneNames(itemId) {
      const entry = entries.get(String(itemId || ""));
      if (!entry || !entry.bones) return [];
      return [...new Set(entry.bones.keys())].sort();
    }

    /**
     * World-space position of one bone, for diagnostics and for tests that need
     * to reason about a pose without going through a screen projection.
     */
    function boneWorldPosition(itemId, boneId) {
      const entry = entries.get(String(itemId || ""));
      if (!entry || !entry.bones) return null;
      const bone = entry.bones.get(String(boneId || ""));
      if (!bone) return null;
      const point = new context.THREE.Vector3();
      bone.getWorldPosition(point);
      return [point.x, point.y, point.z];
    }

    /**
     * Which gizmo handle the pointer is over, or "" when none.
     *
     * The stage checks this on pointerdown: TransformControls sets `axis` during
     * its own pointermove hover pass, so a non-empty axis means the press landed
     * on a handle and the stage must not start orbiting or box-dragging instead.
     */
    function gizmoAxis() {
      if (!gizmo || !gizmo.object) return "";
      return String(gizmo.axis || "");
    }

    /**
     * The live three transform of an item.
     *
     * The gizmo edits the three object in place, so this is how a drag is read
     * back out and written onto the project. It returns null for ids the scene
     * has never built, which keeps a stale selection from inventing an object.
     */
    function readItemTransform(itemId) {
      const entry = entries.get(String(itemId || ""));
      if (!entry) return null;
      const group = entry.group;
      const out = {
        position: [group.position.x, group.position.y, group.position.z],
        rotation: [group.rotation.x, group.rotation.y, group.rotation.z],
        scale: [group.scale.x, group.scale.y, group.scale.z],
      };
      // A camera marker is held as the project's own basis, so the reader has to
      // hand that basis back rather than the Euler three happens to derive from
      // it. `group.rotation` would be in three's `XYZ` order, and the project
      // would then store an aim that leans the other way.
      if (entry.item && entry.item.kind === "camera") {
        // The orientation is read from the quaternion rather than from
        // `matrix`. `group.matrix` is only rebuilt by the render pass, so a drag
        // that has not been drawn yet would hand back the previous frame, and
        // the matrix also carries the marker's scale, which would leak into the
        // angles. The quaternion is the exact value that was written here and
        // that the drag handler edits, and it reconstructs the same basis.
        const basis = new context.THREE.Matrix4().makeRotationFromQuaternion(group.quaternion).elements;
        // three stores column-major; the project basis is row-major.
        out.basis = [
          basis[0], basis[4], basis[8], 0,
          basis[1], basis[5], basis[9], 0,
          basis[2], basis[6], basis[10], 0,
          0, 0, 0, 1,
        ];
      }
      return out;
    }

    /**
     * Renders the scene through an arbitrary camera into a fresh canvas.
     *
     * The stage canvas is sized to the viewport, but an exported frame is
     * 1600px wide; sharing one renderer would mean resizing the live canvas on
     * every export. A throwaway renderer that borrows the same scene keeps the
     * export resolution independent of the window.
     */
    function capture(view, width, height) {
      if (!isReady()) return null;
      const THREE = context.THREE;
      const frameWidth = Math.max(160, Math.round(Number(width) || 1600));
      const frameHeight = Math.max(90, Math.round(Number(height) || 900));
      const canvasEl = document.createElement("canvas");
      canvasEl.width = frameWidth;
      canvasEl.height = frameHeight;
      const temp = new THREE.WebGLRenderer({ canvas: canvasEl, alpha: true, antialias: true, preserveDrawingBuffer: true });
      temp.setClearAlpha(0);
      temp.setPixelRatio(1);
      temp.setSize(frameWidth, frameHeight, false);
      temp.shadowMap.enabled = true;
      temp.shadowMap.type = THREE.PCFSoftShadowMap;
      if ("outputColorSpace" in temp) temp.outputColorSpace = THREE.SRGBColorSpace;
      const camera = new THREE.PerspectiveCamera(Number(view.fov) || 42, frameWidth / frameHeight, 0.05, 400);
      camera.up.set(0, 1, 0);
      camera.position.set(view.eye.x, view.eye.y, view.eye.z);
      camera.lookAt(view.target.x, view.target.y, view.target.z);
      if (view.roll) camera.rotateZ((-view.roll * Math.PI) / 180);
      camera.updateProjectionMatrix();

      // The operator's own camera gizmo would fill the shot, exactly as it
      // does in the software renderer.
      const hiddenIds = new Set(getHiddenIds().map(String));
      const restore = [];
      for (const entry of entries.values()) {
        if (hiddenIds.has(String(entry.item.id)) && entry.group.visible) {
          restore.push(entry.group);
          entry.group.visible = false;
        }
      }
      const gridWasVisible = grids.grid ? grids.grid.visible : false;
      if (grids.grid) grids.grid.visible = false;
      const ringWasVisible = ring ? ring.visible : false;
      if (ring) ring.visible = false;
      const gizmoWasVisible = gizmoHelper ? gizmoHelper.visible : false;
      if (gizmoHelper) gizmoHelper.visible = false;

      temp.render(webglScene, camera);

      for (const group of restore) group.visible = true;
      if (grids.grid) grids.grid.visible = gridWasVisible;
      if (ring) ring.visible = ringWasVisible;
      if (gizmoHelper) gizmoHelper.visible = gizmoWasVisible;

      const dataUrl = canvasEl.toDataURL("image/png");
      temp.dispose();
      return { width: frameWidth, height: frameHeight, dataUrl };
    }

    const thumbnailCache = new Map();

    /**
     * Renders one library model to a small square data URL, for the palette.
     * Results are cached per model file, and a failure resolves to an empty
     * string so the palette can fall back to a text-only tile.
     */
    function thumbnail(model, size) {
      if (!isReady() || !model || !model.url) return Promise.resolve("");
      if (thumbnailCache.has(model.url)) return thumbnailCache.get(model.url);
      const promise = loadSource(model.url).then((gltf) => {
        if (disposed) return "";
        const THREE = context.THREE;
        const px = Math.max(48, Math.round(Number(size) || 128));
        const canvasEl = document.createElement("canvas");
        canvasEl.width = px;
        canvasEl.height = px;
        const temp = new THREE.WebGLRenderer({ canvas: canvasEl, alpha: true, antialias: true, preserveDrawingBuffer: true });
        temp.setClearAlpha(0);
        temp.setPixelRatio(1);
        temp.setSize(px, px, false);
        if ("outputColorSpace" in temp) temp.outputColorSpace = THREE.SRGBColorSpace;

        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xf2f6fb, 0x3b434e, 2.6));
        const key = new THREE.DirectionalLight(0xffffff, 2.6);
        key.position.set(2.5, 4, 3);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xbcd0e6, 1.2);
        fill.position.set(-3, 2, -2.5);
        scene.add(fill);
        const rim = new THREE.DirectionalLight(0xdce8fb, 1.4);
        rim.position.set(-2, 3.5, -3);
        scene.add(rim);

        const clone = context.clone(gltf.scene);
        // As with the stage, the bounds have to be measured with world matrices
        // applied or a rig that hangs under its own scaled Armature node reports
        // centimetres and the tile frames the model a hundred times too closely.
        clone.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(clone);
        const height = Math.max(0.01, box.max.y - box.min.y);
        const width = Math.max(0.01, box.max.x - box.min.x);
        const span = Math.max(height, width);
        // Lift the model so its feet sit on the frame origin, the way the stage
        // stands it on the floor.
        clone.position.y -= box.min.y;
        scene.add(clone);

        // A three-quarter view framed with headroom reads as a portrait rather
        // than a cropped ID photo.
        const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 200);
        const distance = span * 2.9;
        camera.position.set(distance * 0.38, height * 0.72, distance);
        camera.lookAt(0, height * 0.5, 0);
        camera.updateProjectionMatrix();
        temp.render(scene, camera);
        const dataUrl = canvasEl.toDataURL("image/png");
        temp.dispose();
        clone.traverse((node) => {
          if (node.geometry) node.geometry.dispose?.();
          if (node.material) {
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            for (const material of materials) {
              material.map?.dispose?.();
              material.dispose?.();
            }
          }
        });
        return dataUrl;
      }).catch(() => "");
      thumbnailCache.set(model.url, promise);
      return promise;
    }

    /** Disposes the WebGL context and every GPU resource it owns. */
    function destroy() {
      disposed = true;
      if (frameHandle) cancelAnimationFrame(frameHandle);
      frameHandle = 0;
      clearSpriteCache();
      for (const id of [...entries.keys()]) dropEntry(id);
      if (gizmo) {
        gizmo.detach?.();
        gizmo.dispose?.();
        gizmo = null;
        gizmoHelper = null;
      }
      if (grids.grid) {
        webglScene?.remove(grids.grid);
        grids.grid.geometry?.dispose?.();
        grids.grid.material?.dispose?.();
        grids.grid = null;
      }
      if (ring) {
        webglScene?.remove(ring);
        ring.geometry?.dispose?.();
        ring.material?.dispose?.();
        ring = null;
      }
      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss?.();
        renderer = null;
      }
      webglScene = null;
      webglCamera = null;
      pickCamera = null;
      ready = false;
    }

    return {
      init,
      isReady,
      error,
      schedule,
      draw,
      pick,
      groundPoint,
      boneScreenPoint,
      boneHandles,
      attachGizmo,
      detachGizmo,
      gizmoAxis,
      gizmoAttachedTo,
      boneNames,
      boneWorldPosition,
      readItemTransform,
      element: canvas,
      capture,
      thumbnail,
      destroy,
      resize: schedule,
    };
  }

  return {
    loadThree,
    createStage3d,
    MODEL_BASE_URL,
  };
});
