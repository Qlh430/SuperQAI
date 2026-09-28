/**
 * AI OS · 3D 导演台
 *
 * A director stage for the canvas: build a scene out of characters, primitives
 * and reference boards, place cameras, keyframe them over a timeline, and hand
 * the resulting framing back to the canvas as an image node.
 *
 * The project shape follows the DX OS stage so the two stay compatible:
 *
 *   { version, name, duration, aspectRatio, items: [...], keyframes: [...] }
 *
 * Rendering is a small software rasteriser on a 2D canvas: boxes and image
 * quads are transformed, back-face culled, shaded and painted back to front.
 * That keeps the whole stage dependency free — no three.js, no build step, no
 * model downloads — which is what this project can actually ship.
 *
 * The module is split in two halves on purpose:
 *   - the scene half (math, project, presets, sampling, description) is pure
 *     data with no DOM access, so tools/check-canvas-director3d.js can require it;
 *   - the view half (Director3dStage, Director3dApp) owns the DOM.
 */
(function initCanvasDirector3d(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasDirector3d = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasDirector3dModule() {
  "use strict";

  const PROJECT_VERSION = 1;
  const DEG = Math.PI / 180;
  const GROUND_LIMIT = 12;
  const GROUND_CELLS = 24;
  const EYE_HEIGHT = 1.62;
  const LIGHT_DIRECTION = { x: 0.42, y: 0.84, z: 0.34 };
  // Projection near plane, in metres. Geometry closer than this is clipped
  // instead of being projected into an enormous quad that swallows the frame.
  const NEAR_PLANE = 0.08;

  /* ------------------------------------------------------------------ math -- */

  function identity() {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }

  function multiply(a, b) {
    const out = new Array(16).fill(0);
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        let sum = 0;
        for (let index = 0; index < 4; index += 1) sum += a[row * 4 + index] * b[index * 4 + column];
        out[row * 4 + column] = sum;
      }
    }
    return out;
  }

  function transformPoint(matrix, point) {
    const x = Number(point.x) || 0;
    const y = Number(point.y) || 0;
    const z = Number(point.z) || 0;
    return {
      x: matrix[0] * x + matrix[1] * y + matrix[2] * z + matrix[3],
      y: matrix[4] * x + matrix[5] * y + matrix[6] * z + matrix[7],
      z: matrix[8] * x + matrix[9] * y + matrix[10] * z + matrix[11],
    };
  }

  /**
   * Accepts either [x, y, z] or { x, y, z }. Geometry helpers pass objects
   * while project data stores arrays, and both must land on the same vector.
   */
  function toTriple(value, fallback = [0, 0, 0]) {
    if (Array.isArray(value)) {
      return [
        Number(value[0]) || 0,
        Number(value[1]) || 0,
        Number(value[2]) || 0,
      ];
    }
    if (value && typeof value === "object") {
      return [
        Number(value.x) || 0,
        Number(value.y) || 0,
        Number(value.z) || 0,
      ];
    }
    return [...fallback];
  }

  /**
   * The project's rotation basis, stored column-major the way three does.
   *
   * The numbers mean what three's default orientation reads as `YXZ`: index 0
   * is pitch, 1 is yaw, 2 is roll, and any three mesh built by the stage is
   * given exactly these values in exactly that order, so the software renderer
   * and the WebGL stage agree to the last bit.
   *
   * The second row's third entry used to read `-sz * sy * cx + cz * sx`. That
   * sign turned the "rotation" into a non-orthonormal matrix - `R R^T` drifted
   * by up to 0.84 - which skewed every direction that involved all three
   * angles at once. It is why the Dutch-angle shot leaned the wrong way and
   * why a camera could not be given transform handles: rotating one would have
   * aimed it somewhere the panes did not show.
   */
  function rotationMatrix(rotation) {
    const rx = Number(rotation?.[0] || 0) || 0;
    const ry = Number(rotation?.[1] || 0) || 0;
    const rz = Number(rotation?.[2] || 0) || 0;
    const cx = Math.cos(rx);
    const sx = Math.sin(rx);
    const cy = Math.cos(ry);
    const sy = Math.sin(ry);
    const cz = Math.cos(rz);
    const sz = Math.sin(rz);
    return [
      cz * cy, -cz * sy * sx + sz * cx, cz * sy * cx + sz * sx, 0,
      -sz * cy, sz * sy * sx + cz * cx, -sz * sy * cx + cz * sx, 0,
      -sy, -cy * sx, cy * cx, 0,
      0, 0, 0, 1,
    ];
  }

  function composeMatrix(position, rotation, scale) {
    const r = rotationMatrix(rotation);
    const sx = Number(scale?.[0] ?? 1) || 1;
    const sy = Number(scale?.[1] ?? 1) || 1;
    const sz = Number(scale?.[2] ?? 1) || 1;
    const [px, py, pz] = toTriple(position, [0, 0, 0]);
    return [
      r[0] * sx, r[1] * sy, r[2] * sz, px,
      r[4] * sx, r[5] * sy, r[6] * sz, py,
      r[8] * sx, r[9] * sy, r[10] * sz, pz,
      0, 0, 0, 1,
    ];
  }

  function transformDirection(matrix, direction) {
    const x = Number(direction?.x) || 0;
    const y = Number(direction?.y) || 0;
    const z = Number(direction?.z) || 0;
    return {
      x: matrix[0] * x + matrix[1] * y + matrix[2] * z,
      y: matrix[4] * x + matrix[5] * y + matrix[6] * z,
      z: matrix[8] * x + matrix[9] * y + matrix[10] * z,
    };
  }

  function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  function scaleVec(vector, factor) {
    return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }

  function length(vector) {
    return Math.hypot(vector.x, vector.y, vector.z);
  }

  function normalize(vector) {
    const size = length(vector);
    if (size < 1e-6) return { x: 0, y: 0, z: 0 };
    return { x: vector.x / size, y: vector.y / size, z: vector.z / size };
  }

  function lookAtMatrix(eye, target, up = { x: 0, y: 1, z: 0 }) {
    const zAxis = normalize(subtract(eye, target));
    const xAxis = normalize(cross(up, zAxis));
    const yAxis = cross(zAxis, xAxis);
    return [
      xAxis.x, xAxis.y, xAxis.z, -dot(xAxis, eye),
      yAxis.x, yAxis.y, yAxis.z, -dot(yAxis, eye),
      zAxis.x, zAxis.y, zAxis.z, -dot(zAxis, eye),
      0, 0, 0, 1,
    ];
  }

  function perspectiveMatrix(fovDegrees, aspect, near = 0.05, far = 200) {
    const fov = Math.min(170, Math.max(5, Number(fovDegrees) || 50)) * DEG;
    const f = 1 / Math.tan(fov / 2);
    const ratio = aspect > 0 ? aspect : 1;
    return [
      f / ratio, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) / (near - far), (2 * far * near) / (near - far),
      0, 0, -1, 0,
    ];
  }

  /** Degrees for the panels, radians for the project. */
  function degrees(radians) {
    return (Number(radians) || 0) / DEG;
  }

  function radians(degreesValue) {
    return (Number(degreesValue) || 0) * DEG;
  }

  function roundTo(value, step = 0.01) {
    return Math.round((Number(value) || 0) / step) * step;
  }

  /* ------------------------------------------------------------ catalogue -- */

  /**
   * Catalogue of everything that can stand on the stage.
   *
   * `model: true` entries are real skinned GLB characters rendered by the
   * three.js layer, with a bone rig and animation clips. They also carry
   * `pose: true`, because the dependency-free software rasteriser can only
   * draw a character as a box mannequin and still needs a pose name for it.
   *
   * The box-only ids a project could have been authored with before the
   * skinned catalogue existed are not dropped; the chart below re-points each
   * of them at the real model, so an old scene opens on the same actor.
   */
  const MODEL_LIBRARY = [
    {
      kind: "human-male",
      label: "男性角色",
      category: "人物",
      file: "human-male.glb",
      height: 1.78,
      rig: "mixamo",
      clips: [
        { id: "idle", label: "待机" },
        { id: "walk", label: "行走" },
        { id: "run", label: "奔跑" },
        { id: "agree", label: "点头同意" },
        { id: "headShake", label: "摇头否定" },
        { id: "sneak_pose", label: "潜行" },
        { id: "sad_pose", label: "沮丧" },
      ],
    },
    {
      // The plain red mannequin ("X Bot"). It was the female actor a project
      // used to open on, so it keeps the bare "女性角色" name and the wider
      // clip set; the textured dancer below is the newer arrival and is named
      // for what it is.
      kind: "human-xbot",
      label: "女性角色",
      category: "人物",
      file: "human-xbot.glb",
      height: 1.8,
      rig: "mixamo",
      clips: [
        { id: "idle", label: "待机" },
        { id: "walk", label: "行走" },
        { id: "run", label: "奔跑" },
        { id: "agree", label: "点头同意" },
        { id: "headShake", label: "摇头否定" },
        { id: "sneak_pose", label: "潜行" },
        { id: "sad_pose", label: "沮丧" },
      ],
    },
    {
      kind: "human-female",
      label: "女性角色（舞者）",
      category: "人物",
      file: "human-female.glb",
      height: 1.7,
      rig: "mixamo",
      clips: [
        { id: "SambaDance", label: "桑巴舞" },
        { id: "TPose", label: "T 字站姿" },
      ],
      // Her default clip is a dance whose arms sweep a wide arc, so a static
      // stance stacked on top of it would drift through the loop. A stance is
      // composed against this clip instead: it is the only one that holds still.
      stanceClip: "TPose",
    },
    {
      kind: "human-soldier",
      label: "士兵",
      category: "人物",
      file: "human-soldier.glb",
      height: 1.82,
      rig: "mixamo",
      clips: [
        { id: "Idle", label: "待机" },
        { id: "Walk", label: "行走" },
        { id: "Run", label: "奔跑" },
        { id: "TPose", label: "T 字站姿" },
      ],
    },
    {
      kind: "human-cesium",
      label: "素模人物",
      category: "人物",
      file: "cesium-man.glb",
      height: 1.75,
      rig: "generic",
      clips: [{ id: "animation_0", label: "行走" }],
    },
    {
      kind: "human-rigged",
      label: "木质人偶",
      category: "人物",
      file: "rigged-figure.glb",
      height: 1.72,
      rig: "generic",
      clips: [{ id: "animation_0", label: "行走" }],
    },
    {
      kind: "robot-expressive",
      label: "机器人",
      category: "机器人",
      file: "robot-expressive.glb",
      height: 1.6,
      rig: "robot",
      clips: [
        { id: "Idle", label: "待机" },
        { id: "Walking", label: "行走" },
        { id: "Running", label: "奔跑" },
        { id: "WalkJump", label: "跑跳" },
        { id: "Jump", label: "跳跃" },
        { id: "Dance", label: "跳舞" },
        { id: "Wave", label: "挥手" },
        { id: "ThumbsUp", label: "点赞" },
        { id: "Punch", label: "出拳" },
        { id: "Sitting", label: "坐下" },
        { id: "Standing", label: "站起" },
        { id: "Yes", label: "点头" },
        { id: "No", label: "摇头" },
        { id: "Death", label: "倒地" },
      ],
    },
    {
      kind: "animal-fox",
      label: "狐狸",
      category: "动物",
      file: "animal-fox.glb",
      height: 0.9,
      rig: "generic",
      clips: [
        { id: "Walk", label: "行走" },
        { id: "Run", label: "奔跑" },
        { id: "Survey", label: "张望" },
      ],
    },
  ];

  const MODEL_BASE_URL = "./assets/models/director3d/";

  const ITEM_KINDS = {
    cube: { label: "立方体", group: "prop", height: 1, width: 1, color: "#b9c2cb" },
    plane: { label: "平面", group: "prop", height: 0.02, width: 2, color: "#9aa6b2", flat: true },
    board: { label: "图片板", group: "prop", height: 1.2, width: 1.6, color: "#cbd2d8", image: true },
    camera: { label: "机位", group: "camera", height: 0.3, width: 0.34, color: "#3c4450", camera: true },
  };

  // Skinned models join the same catalogue, so addItem/rename/bounds/describe
  // keep working without a second code path.
  for (const entry of MODEL_LIBRARY) {
    ITEM_KINDS[entry.kind] = {
      label: entry.label,
      group: "character",
      height: entry.height,
      width: Math.max(0.5, entry.height * 0.34),
      color: "#c8cfd6",
      model: true,
      file: entry.file,
      rig: entry.rig,
      category: entry.category,
      clips: entry.clips,
      // The clip a stance preset is composed against, when it differs from the
      // model's own default. A rig whose default animation keeps the arms moving
      // needs to stand on a still clip for a static pose to hold its shape.
      stanceClip: entry.stanceClip || "",
    };
  }

  /**
   * The two box-mannequin ids a scene could have been authored with before the
   * skinned catalogue existed.
   *
   * They are kept as working actors rather than dropped: each one resolves to
   * the real model that replaced it, and the pose name the old project stored
   * still selects the clip that means the same thing. Without this a saved
   * scene opened as a plain white cube, because a box kind is not a model and
   * the WebGL layer therefore fell through to the primitive geometry.
   */
  const LEGACY_KIND_ALIASES = {
    "robot-male": {
      kind: "human-male",
      poseClips: { stand: "idle", walk: "walk", run: "run" },
    },
    // The plain mannequin carries the same walk/run/idle set as the male rig, so
    // the old female box poses still mean what they meant instead of falling
    // through to a clip that happens to be first in the list. It points at the
    // plain rig rather than the textured dancer for exactly that reason: the
    // dancer only ships a dance and a T-pose.
    "robot-female": {
      kind: "human-xbot",
      poseClips: { stand: "idle", walk: "walk", run: "run" },
    },
  };

  for (const [legacyKind, alias] of Object.entries(LEGACY_KIND_ALIASES)) {
    const target = ITEM_KINDS[alias.kind];
    if (!target) continue;
    // `pose: true` keeps the old pose name alive through normalisation, so the
    // clip lookup below can still read it and the box rasteriser keeps an angle
    // to draw if WebGL never comes up.
    ITEM_KINDS[legacyKind] = { ...target, pose: true, poseClips: alias.poseClips };
  }

  /**
   * The clip an item that stores an old pose name instead of a clip should
   * play. Returns "" when nothing matches, so callers fall back to the model's
   * own default clip rather than to a broken one.
   */
  function clipFromPose(meta, source) {
    const map = meta && meta.poseClips;
    if (!map) return "";
    const wanted = String(map[String((source && source.pose) || "")] || "");
    if (!wanted) return "";
    const clips = Array.isArray(meta.clips) ? meta.clips : [];
    return clips.some((entry) => entry.id === wanted) ? wanted : "";
  }

  /**
   * Shot presets are expressed the way a director thinks about them: how far
   * the camera stands from the subject, how high it sits, which way around the
   * subject it is, and where the subject sits in frame (`aimLift` raises the
   * aim point for close-ups so heads are not cropped). `yaw` is measured from
   * the subject's own facing, so "正面" stays the front after the subject turns.
   */
  const SHOT_PRESETS = [
    { id: "current", label: "当前视角" },
    { id: "front-full", label: "正面全身", distance: 3.6, height: 1.15, yaw: 0, fov: 42, aimLift: 0.02 },
    { id: "front-medium", label: "正面中景", distance: 2.4, height: 1.4, yaw: 0, fov: 44, aimLift: 0.16 },
    { id: "front-close", label: "正面近景", distance: 1.45, height: 1.55, yaw: 0, fov: 46, aimLift: 0.42 },
    { id: "side-medium", label: "侧面中景", distance: 2.5, height: 1.38, yaw: 90, fov: 44, aimLift: 0.16 },
    { id: "side-close", label: "侧面近景", distance: 1.5, height: 1.52, yaw: 90, fov: 46, aimLift: 0.4 },
    { id: "back-medium", label: "背面中景", distance: 2.7, height: 1.55, yaw: 180, fov: 44, aimLift: 0.2 },
    { id: "overhead-full", label: "俯拍全景", distance: 4.2, height: 4.6, yaw: 0, fov: 40, aimLift: 0 },
    { id: "overhead-45", label: "45° 俯拍", distance: 3.6, height: 3, yaw: 35, fov: 42, aimLift: 0.05 },
    { id: "low-medium", label: "低机位中景", distance: 2.6, height: 0.42, yaw: 12, fov: 46, aimLift: 0.24 },
    { id: "low-wide", label: "低机位广角", distance: 3.2, height: 0.36, yaw: -14, fov: 62, aimLift: 0.2 },
    { id: "shoulder-left", label: "左肩镜头", distance: 1.8, height: 1.58, yaw: -34, fov: 40, aimLift: 0.3 },
    { id: "shoulder-right", label: "右肩镜头", distance: 1.8, height: 1.58, yaw: 34, fov: 40, aimLift: 0.3 },
    { id: "bird-eye", label: "正俯视", distance: 5.4, height: 6.2, yaw: 0, fov: 38, aimLift: 0 },
    { id: "dutch", label: "荷兰倾斜", distance: 2.9, height: 1.6, yaw: 20, fov: 44, roll: 16, aimLift: 0.14 },
  ];

  const CAMERA_MOTION_PRESETS = [
    { id: "follow", label: "稳定跟拍", description: "角色后方平滑跟随", duration: 3 },
    { id: "orbit-follow", label: "环绕跟拍", description: "移动中环绕主体", duration: 4, arcDegrees: 140 },
    { id: "fps-orbit", label: "FPS 高机动", description: "快速环绕与轻微升降", duration: 3, arcDegrees: 300 },
    { id: "handheld-follow", label: "手持追拍", description: "带呼吸感的动态跟随", duration: 3 },
    { id: "dolly-in", label: "推进镜头", description: "从远景推进到近景", duration: 3 },
    { id: "dolly-out", label: "拉远镜头", description: "从近景拉到全景", duration: 3 },
    { id: "crane-up", label: "摇臂升起", description: "由平视升至俯拍", duration: 4 },
    { id: "hitchcock", label: "希区柯克变焦", description: "移动与焦距反向补偿", duration: 3 },
    { id: "static", label: "镜头保持固定", description: "机位在时段内不动", duration: 3 },
  ];

  const MOTION_CURVES = [
    { id: "linear", label: "线性" },
    { id: "ease-in-out", label: "缓入缓出" },
    { id: "ease-in", label: "缓入" },
    { id: "ease-out", label: "缓出" },
  ];

  const CHARACTER_POSES = [
    { id: "stand", label: "站立" },
    { id: "walk", label: "行走" },
    { id: "run", label: "奔跑" },
    { id: "sit", label: "坐下" },
    { id: "wave", label: "挥手" },
  ];

  /**
   * Bones a user can grab on a skinned character, in the order they read
   * naturally down the body. Every id is a Mixamo joint name without the
   * `mixamorig:` prefix, because the bundled human models share that rig.
   * `axis` is the swing the panel slider drives, in the joint's local space.
   */
  const JOINT_CONTROLS = [
    { id: "Hips", label: "躯干根部", group: "躯干", axis: "y", min: -180, max: 180 },
    { id: "Spine", label: "腰", group: "躯干", axis: "x", min: -35, max: 35 },
    { id: "Spine1", label: "胸", group: "躯干", axis: "x", min: -30, max: 30 },
    { id: "Spine2", label: "上胸", group: "躯干", axis: "x", min: -25, max: 25 },
    { id: "Neck", label: "脖子", group: "头部", axis: "x", min: -40, max: 40 },
    { id: "Head", label: "头", group: "头部", axis: "y", min: -75, max: 75 },
    { id: "LeftShoulder", label: "左肩", group: "左臂", axis: "z", min: -35, max: 35 },
    { id: "LeftArm", label: "左上臂", group: "左臂", axis: "z", min: -95, max: 95 },
    { id: "LeftForeArm", label: "左小臂", group: "左臂", axis: "y", min: -140, max: 5 },
    { id: "LeftHand", label: "左手", group: "左臂", axis: "y", min: -70, max: 70 },
    { id: "RightShoulder", label: "右肩", group: "右臂", axis: "z", min: -35, max: 35 },
    { id: "RightArm", label: "右上臂", group: "右臂", axis: "z", min: -95, max: 95 },
    { id: "RightForeArm", label: "右小臂", group: "右臂", axis: "y", min: -140, max: 5 },
    { id: "RightHand", label: "右手", group: "右臂", axis: "y", min: -70, max: 70 },
    { id: "LeftUpLeg", label: "左大腿", group: "左腿", axis: "x", min: -95, max: 60 },
    { id: "LeftLeg", label: "左小腿", group: "左腿", axis: "x", min: -5, max: 140 },
    { id: "LeftFoot", label: "左脚", group: "左腿", axis: "x", min: -45, max: 45 },
    { id: "RightUpLeg", label: "右大腿", group: "右腿", axis: "x", min: -95, max: 60 },
    { id: "RightLeg", label: "右小腿", group: "右腿", axis: "x", min: -5, max: 140 },
    { id: "RightFoot", label: "右脚", group: "右腿", axis: "x", min: -45, max: 45 },
  ];

  const JOINT_BY_ID = new Map(JOINT_CONTROLS.map((entry) => [entry.id, entry]));

  /**
   * One-tap poses written as joint overrides in degrees. They stack on top of
   * whatever clip is playing: the preset drives the bones it names and the
   * animation keeps driving the rest, so "pose over a walk" still reads as a
   * walk.
   *
   * A joint override is euler degrees added in the bone's own local frame, so
   * the same number reads as a different limb angle on a rig whose rest pose
   * faces elsewhere. The male and the dancer rigs both rest with their thighs
   * swung round compared with the plain mannequin, so the leg numbers below are
   * solved per rig rather than shared; the other rigs read the shared table
   * correctly and are left out so nothing that already worked can move.
   *
   * Each set below lands the figure with the hips at roughly 0.80 m standing
   * folded and 0.45 m seated, feet under the body with the soles flat - the
   * same silhouette the shared table gives the rigs it already suits.
   */
  const LEG_STANCE_RIGS = {
    crouch: {
      "human-male": {
        LeftUpLeg: { x: 20 }, LeftLeg: { x: 68 }, LeftFoot: { x: -30 },
        RightUpLeg: { x: 20 }, RightLeg: { x: 68 }, RightFoot: { x: -30 },
      },
      "human-female": {
        LeftUpLeg: { x: 20 }, LeftLeg: { x: 64 }, LeftFoot: { x: -4 },
        RightUpLeg: { x: 20 }, RightLeg: { x: 64 }, RightFoot: { x: -4 },
      },
    },
    sit: {
      "human-male": {
        LeftUpLeg: { x: 0 }, LeftLeg: { x: 102 }, LeftFoot: { x: -45 },
        RightUpLeg: { x: 0 }, RightLeg: { x: 102 }, RightFoot: { x: -45 },
      },
      "human-female": {
        LeftUpLeg: { x: 20 }, LeftLeg: { x: 113 }, LeftFoot: { x: -45 },
        RightUpLeg: { x: 20 }, RightLeg: { x: 113 }, RightFoot: { x: -45 },
      },
    },
  };

  const CHARACTER_STANCE_PRESETS = [
    { id: "neutral", label: "自然站姿", joints: {} },
    { id: "power", label: "叉腰", joints: {
      // Solved against the real rig rather than guessed, and re-solved whenever
      // a rig's clips are rebuilt: the preset is a joint offset added on top of
      // whatever the clip wrote, so rebuilding a clip moves the pose even when
      // these numbers stay the same. The arm swings forward and in on Y/Z, and
      // the forearm folds on X. The old values drove the forearm on Y, which is
      // the twist axis on this rig, so the elbow never bent and both hands ended
      // up at the chest.
      LeftArm: { y: 106, z: 26, x: -37 }, RightArm: { y: -119, z: -31, x: -43 },
      LeftForeArm: { x: -83 }, RightForeArm: { x: -83 },
      Spine: { x: 2 },
    },
    // A joint override is euler degrees added in the bone's own local frame, so
    // a rig whose rest orientation differs needs its own numbers for the same
    // visible pose. Each entry below was solved the same way as the default and
    // lands the palm on the hip crest with the elbow outside and above it. The
    // solver reads a rig's handedness off its rest pose, so a mirrored rig like
    // the soldier's comes out right without a second code path.
    rigs: {
      "human-xbot": {
        LeftArm: { y: -41, z: 82, x: 142 }, RightArm: { y: 64, z: -74, x: 141 },
        LeftForeArm: { x: 6, z: 86 }, RightForeArm: { z: -86 },
        Spine: { x: 2 },
      },
      "human-female": {
        LeftArm: { y: -142, z: -50, x: 16 }, RightArm: { y: 142, z: 49, x: 17 },
        LeftForeArm: { x: -109 }, RightForeArm: { x: -109 },
        Spine: { x: 2 },
      },
      "human-soldier": {
        LeftArm: { y: 27, z: 24, x: -10 }, RightArm: { y: -8, z: -3, x: 60 },
        LeftForeArm: { x: -23 }, RightForeArm: { x: 24 },
        Spine: { x: 2 },
      },
    } },
    { id: "arms-crossed", label: "抱臂", joints: {
      LeftArm: { z: 74, x: -18 }, LeftForeArm: { y: -128 }, LeftHand: { y: -20 },
      RightArm: { z: -74, x: -18 }, RightForeArm: { y: -128 }, RightHand: { y: 20 },
      Spine2: { x: -4 },
    } },
    { id: "point", label: "抬手示意", joints: {
      RightArm: { z: -108, x: 12 }, RightForeArm: { y: -12 }, RightHand: { y: 10 },
      Neck: { x: 4 },
    } },
    { id: "sit", label: "坐姿", joints: {
      LeftUpLeg: { x: -88 }, LeftLeg: { x: 88 }, LeftFoot: { x: 4 },
      RightUpLeg: { x: -88 }, RightLeg: { x: 88 }, RightFoot: { x: 4 },
      Spine: { x: 4 }, LeftArm: { z: 46 }, LeftForeArm: { y: -46 },
      RightArm: { z: -46 }, RightForeArm: { y: -46 },
    }, rigs: LEG_STANCE_RIGS.sit, rigsPatch: true },
    { id: "crouch", label: "半蹲", joints: {
      LeftUpLeg: { x: -62 }, LeftLeg: { x: 78 }, LeftFoot: { x: -18 },
      RightUpLeg: { x: -62 }, RightLeg: { x: 78 }, RightFoot: { x: -18 },
      Spine: { x: 16 }, Spine1: { x: 8 }, LeftArm: { z: 22 }, RightArm: { z: -22 },
    }, rigs: LEG_STANCE_RIGS.crouch, rigsPatch: true },
    { id: "thinking", label: "沉思", joints: {
      RightArm: { z: -52, x: 26 }, RightForeArm: { y: -124 }, RightHand: { y: 16 },
      Head: { y: 14, x: 8 }, Neck: { x: 6 },
    } },
    { id: "run-start", label: "起跑", joints: {
      Spine: { x: 18 }, Spine1: { x: 6 },
      LeftUpLeg: { x: 46 }, LeftLeg: { x: 26 }, LeftFoot: { x: -14 },
      RightUpLeg: { x: -30 }, RightLeg: { x: 62 }, RightFoot: { x: 12 },
      LeftArm: { z: -62, x: -22 }, LeftForeArm: { y: -78 },
      RightArm: { z: 66, x: 24 }, RightForeArm: { y: -92 },
    } },
  ];

  const STANCE_BY_ID = new Map(CHARACTER_STANCE_PRESETS.map((entry) => [entry.id, entry]));

  /** Normalises joint overrides into `{ bone: {x,y,z} }` degrees. */
  function normalizeJoints(value) {
    const joints = {};
    if (!value || typeof value !== "object") return joints;
    for (const [bone, rotation] of Object.entries(value)) {
      if (!JOINT_BY_ID.has(bone) || !rotation || typeof rotation !== "object") continue;
      const entry = {};
      for (const axis of ["x", "y", "z"]) {
        const number = Number(rotation[axis]);
        if (Number.isFinite(number)) entry[axis] = roundTo(number, 0.1);
      }
      if (Object.keys(entry).length) joints[bone] = entry;
    }
    return joints;
  }

  /**
   * Applies a stance preset on top of the joint map a model already carries.
   * "Natural" clears the overrides instead of storing zeroes, so the animation
   * clip plays untouched.
   *
   * `kind` selects the preset's per-rig numbers when it has any. Hand-authored
   * angles are local to the bone, so a rig with a different rest orientation
   * needs its own table to reach the same pose; when there is no entry for the
   * kind the default numbers are used.
   */
  function applyStancePreset(currentJoints, presetId, kind) {
    const preset = STANCE_BY_ID.get(String(presetId || ""));
    if (preset && preset.id === "neutral") return {};
    const next = normalizeJoints(currentJoints);
    if (!preset) return next;
    // Two kinds of rig entry exist. A stance whose whole shape differs per rig
    // (the arms of the hand-on-hip pose) replaces the shared joints outright. A
    // stance that only re-solves part of the body - the folded legs below -
    // patches on top, so the arms and spine still come from the shared pose.
    const rigJoints = preset.rigs && kind ? preset.rigs[String(kind)] : null;
    const sources = rigJoints && preset.rigsPatch ? [preset.joints, rigJoints] : [rigJoints || preset.joints];
    for (const source of sources) {
      if (!source) continue;
      for (const [bone, rotation] of Object.entries(source)) {
        next[bone] = { ...(next[bone] || {}), ...rotation };
      }
    }
    return next;
  }

  /**
   * Leg values the folded stances wrote before they were solved per rig.
   *
   * The male and dancer rigs rest with their thighs swung right round compared
   * with the plain mannequin, so these numbers folded their legs backwards and
   * the figure came out folded in mid air. A scene that stored them therefore
   * still opens wrong however the table is fixed, which is what the repair
   * below is for.
   */
  const SUPERSEDED_LEG_STANCES = {
    crouch: { LeftUpLeg: -62, LeftLeg: 78, LeftFoot: -18, RightUpLeg: -62, RightLeg: 78, RightFoot: -18 },
    sit: { LeftUpLeg: -88, LeftLeg: 88, LeftFoot: 4, RightUpLeg: -88, RightLeg: 88, RightFoot: 4 },
  };

  /**
   * Swaps superseded folded-leg angles for the rig-correct ones.
   *
   * Only an exact match on all six leg bones counts, because that is the
   * signature a stance preset leaves behind and not something an operator
   * dials by hand; a pose that has been adjusted in any other way is left
   * alone, and so is a rig whose legs the old numbers already suited.
   */
  function repairSupersededStance(joints, kind) {
    const next = normalizeJoints(joints);
    const rigKind = String(kind || "");
    if (!rigKind || !next.LeftUpLeg || !next.RightFoot) return next;
    for (const [poseId, corrected] of Object.entries(LEG_STANCE_RIGS)) {
      const rigJoints = corrected[rigKind];
      const superseded = SUPERSEDED_LEG_STANCES[poseId];
      if (!rigJoints || !superseded) continue;
      let matches = true;
      for (const [bone, angle] of Object.entries(superseded)) {
        if (Number(next[bone]?.x) !== angle) { matches = false; break; }
      }
      if (!matches) continue;
      for (const [bone, rotation] of Object.entries(rigJoints)) {
        next[bone] = { ...(next[bone] || {}), ...rotation };
      }
      return next;
    }
    return next;
  }

  const CAMERA_PRESET_VALUES = {
    auto: 0,
    "21:9": 21 / 9,
    "16:9": 16 / 9,
    "4:3": 4 / 3,
    "1:1": 1,
    "3:4": 3 / 4,
    "9:16": 9 / 16,
  };
  const ASPECT_RATIOS = Object.keys(CAMERA_PRESET_VALUES).map((id) => ({
    id,
    label: id === "auto" ? "自动" : id,
    ratio: CAMERA_PRESET_VALUES[id],
  }));

  function aspectValue(project, fallback = 16 / 9) {
    const ratio = CAMERA_PRESET_VALUES[String(project?.aspectRatio || "auto")];
    return ratio > 0 ? ratio : fallback;
  }

  /* --------------------------------------------------------------- project -- */

  function createId(prefix = "item") {
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now().toString(36)}-${random}`;
  }

  function defaultItemName(kind, existingNames = []) {
    const base = ITEM_KINDS[kind]?.label || "对象";
    if (!existingNames.includes(base)) return base;
    let index = 2;
    while (existingNames.includes(`${base} ${index}`)) index += 1;
    return `${base} ${index}`;
  }

  function createItem(kind, options = {}) {
    const meta = ITEM_KINDS[kind] || ITEM_KINDS.cube;
    const item = {
      id: options.id || createId("item"),
      name: options.name || meta.label,
      kind: ITEM_KINDS[kind] ? kind : "cube",
      position: Array.isArray(options.position) ? [...options.position] : [0, 0, 0],
      rotation: Array.isArray(options.rotation) ? [...options.rotation] : [0, 0, 0],
      scale: Array.isArray(options.scale) ? [...options.scale] : [1, 1, 1],
    };
    if (meta.color && options.color === undefined) item.color = meta.color;
    if (options.color) item.color = options.color;
    if (meta.pose) item.pose = options.pose || "stand";
    if (meta.model) {
      // An explicit clip wins; otherwise a stored box pose is translated, and
      // only then does the model's own default apply.
      item.clip = String(options.clip || clipFromPose(meta, options) || meta.clips?.[0]?.id || "");
      const joints = normalizeJoints(options.joints);
      if (Object.keys(joints).length) item.joints = joints;
    }
    if (meta.image) {
      item.imageUrl = options.imageUrl || "";
      item.imageName = options.imageName || "";
    }
    if (meta.camera) {
      item.fov = Number(options.fov || 42);
      item.focalLength = Number(options.focalLength || focalFromFov(Number(options.fov || 42)));
      item.aperture = Number(options.aperture || 2.8);
      if (Array.isArray(options.cameraPath)) item.cameraPath = options.cameraPath.map((point) => [...point]);
    }
    if (options.state) item.state = options.state;
    if (Number.isFinite(Number(options.appearAt))) item.appearAt = Number(options.appearAt);
    if (options.motionCurve) item.motionCurve = options.motionCurve;
    return item;
  }

  /** 35mm equivalent, matching the value the panel shows next to FOV. */
  function focalFromFov(fovDegrees) {
    const fov = Math.min(170, Math.max(5, Number(fovDegrees) || 42)) * DEG;
    return 36 / (2 * Math.tan(fov / 2));
  }

  function fovFromFocal(focalLength) {
    const focal = Math.max(4, Number(focalLength) || 35);
    return (2 * Math.atan(36 / (2 * focal))) / DEG;
  }

  function createProject(options = {}) {
    return {
      version: PROJECT_VERSION,
      name: options.name || "未命名场景",
      duration: Number.isFinite(Number(options.duration)) ? Number(options.duration) : 10,
      aspectRatio: CAMERA_PRESET_VALUES[options.aspectRatio] !== undefined ? options.aspectRatio : "auto",
      items: [],
      keyframes: [],
    };
  }

  function cloneProject(project) {
    return JSON.parse(JSON.stringify(normalizeProject(project)));
  }

  function numberTriple(value, fallback) {
    const list = Array.isArray(value) ? value : fallback;
    return [Number(list?.[0]) || 0, Number(list?.[1]) || 0, Number(list?.[2]) || 0];
  }

  /**
   * Accepts anything that came out of storage — including a project written by
   * an older build or hand-edited JSON — and returns a project the stage can
   * render without further guessing.
   */
  function normalizeProject(project) {
    const source = project && typeof project === "object" ? project : {};
    const normalized = createProject({
      name: String(source.name || "未命名场景"),
      duration: Number(source.duration) > 0 ? Number(source.duration) : 10,
      aspectRatio: source.aspectRatio,
    });
    const seen = new Set();
    const items = [];
    for (const raw of Array.isArray(source.items) ? source.items : []) {
      if (!raw || typeof raw !== "object") continue;
      const kind = ITEM_KINDS[raw.kind] ? String(raw.kind) : "cube";
      const meta = ITEM_KINDS[kind];
      const item = createItem(kind, {
        id: String(raw.id || createId("item")),
        name: String(raw.name || meta.label),
        position: numberTriple(raw.position, [0, 0, 0]),
        rotation: numberTriple(raw.rotation, [0, 0, 0]),
        scale: numberTriple(raw.scale, [1, 1, 1]),
        color: raw.color,
        pose: meta.pose ? String(raw.pose || "stand") : undefined,
        clip: meta.model ? String(raw.clip || "") || clipFromPose(meta, raw) : undefined,
        // A scene saved before the folded-leg stances were solved per rig still
        // carries leg angles that fold the male and dancer rigs backwards; they
        // are swapped for the corrected ones as it opens.
        joints: meta.model ? repairSupersededStance(raw.joints, kind) : undefined,
        imageUrl: meta.image ? String(raw.imageUrl || "") : undefined,
        imageName: meta.image ? String(raw.imageName || "") : undefined,
        fov: meta.camera ? Number(raw.fov) || 42 : undefined,
        focalLength: meta.camera ? Number(raw.focalLength) || focalFromFov(Number(raw.fov) || 42) : undefined,
        aperture: meta.camera ? Number(raw.aperture) || 2.8 : undefined,
        cameraPath: meta.camera && Array.isArray(raw.cameraPath) ? raw.cameraPath : undefined,
        state: typeof raw.state === "string" ? raw.state : "",
        appearAt: Number.isFinite(Number(raw.appearAt)) ? Number(raw.appearAt) : undefined,
        motionCurve: MOTION_CURVES.some((curve) => curve.id === raw.motionCurve) ? raw.motionCurve : undefined,
      });
      if (seen.has(item.id)) item.id = createId("item");
      seen.add(item.id);
      items.push(item);
    }
    normalized.items = items;
    normalized.keyframes = (Array.isArray(source.keyframes) ? source.keyframes : [])
      .filter((keyframe) => keyframe && typeof keyframe === "object" && seen.has(String(keyframe.itemId)))
      .map((keyframe) => {
        const entry = {
          id: String(keyframe.id || createId("key")),
          itemId: String(keyframe.itemId),
          time: Math.max(0, Number(keyframe.time) || 0),
          position: numberTriple(keyframe.position, [0, 0, 0]),
          rotation: numberTriple(keyframe.rotation, [0, 0, 0]),
          scale: numberTriple(keyframe.scale, [1, 1, 1]),
        };
        if (typeof keyframe.state === "string") entry.state = keyframe.state;
        if (Number.isFinite(Number(keyframe.fov))) entry.fov = Number(keyframe.fov);
        if (typeof keyframe.pose === "string") entry.pose = keyframe.pose;
        return entry;
      })
      .sort((left, right) => left.time - right.time);
    return normalized;
  }

  function itemNames(project) {
    return (project?.items || []).map((item) => String(item.name || ""));
  }

  function addItem(project, kind, options = {}) {
    const meta = ITEM_KINDS[kind] || ITEM_KINDS.cube;
    const name = options.name || defaultItemName(kind, itemNames(project));
    const position = Array.isArray(options.position) ? options.position : [0, 0, 0];
    if (!Array.isArray(options.position)) {
      // New objects land beside the last one instead of on top of it.
      const index = (project.items || []).length;
      position[0] = ((index % 4) - 1.5) * 0.9;
      position[2] = (Math.floor(index / 4) % 3) * 0.9;
    }
    const item = createItem(kind, { ...options, name, position });
    if (meta.camera) {
      item.position = [position[0] || 2.4, Number(options.position?.[1] ?? EYE_HEIGHT), position[2] || 2.6];
    }
    project.items.push(item);
    return item;
  }

  function removeItem(project, itemId) {
    const id = String(itemId || "");
    if (!id) return false;
    const before = project.items.length;
    project.items = project.items.filter((item) => item.id !== id);
    project.keyframes = project.keyframes.filter((keyframe) => keyframe.itemId !== id);
    return project.items.length !== before;
  }

  function findItem(project, itemId) {
    return (project?.items || []).find((item) => item.id === String(itemId || "")) || null;
  }

  function renameItem(project, itemId, name) {
    const item = findItem(project, itemId);
    if (!item) return "";
    const requested = String(name || "").trim() || ITEM_KINDS[item.kind]?.label || "对象";
    const taken = new Set(itemNames(project).filter((value) => value !== item.name));
    let unique = requested;
    let index = 2;
    while (taken.has(unique)) {
      unique = `${requested} ${index}`;
      index += 1;
    }
    item.name = unique;
    return unique;
  }

  /** World-space footprint used by the property panel and the shot presets. */
  function itemBounds(project, item, time = 0) {
    const transform = resolveItemTransform(project, item, time);
    const meta = ITEM_KINDS[item.kind] || ITEM_KINDS.cube;
    const halfWidth = (meta.width / 2) * Math.abs(transform.scale[0] || 1);
    const height = meta.height * Math.abs(transform.scale[1] || 1);
    const halfDepth = (meta.width / 2) * Math.abs(transform.scale[2] || 1);
    return {
      center: { x: transform.position[0], y: transform.position[1] + height / 2, z: transform.position[2] },
      halfWidth,
      halfDepth,
      height,
      radius: Math.hypot(halfWidth, halfDepth),
    };
  }

  /** True when the item is drawn from a skinned GLB instead of box geometry. */
  function isModelItem(item) {
    return Boolean(item && ITEM_KINDS[item.kind]?.model);
  }

  /** Everything the stage needs to load and pose one skinned item. */
  function modelFor(item) {
    const meta = ITEM_KINDS[item?.kind];
    if (!meta?.model) return null;
    const clips = Array.isArray(meta.clips) ? meta.clips : [];
    // An item carries a clip id, or - in a scene authored before the skinned
    // catalogue - a box pose name, which is translated here so a reloaded
    // scene plays the clip its pose meant.
    const requested = String(item?.clip || "") || clipFromPose(meta, item);
    const clip = clips.some((entry) => entry.id === requested) ? requested : (clips[0]?.id || "");
    return {
      kind: item.kind,
      label: meta.label,
      category: meta.category || "角色",
      url: MODEL_BASE_URL + meta.file,
      rig: meta.rig || "generic",
      height: meta.height,
      clips,
      clip,
      joints: normalizeJoints(item?.joints),
    };
  }

  /** Animation clips a given kind can play, for the inspector's dropdown. */
  function clipsForKind(kind) {
    const clips = ITEM_KINDS[String(kind || "")]?.clips;
    return Array.isArray(clips) ? clips : [];
  }

  /** The subject a camera aims at: the selection, else the first character. */
  function defaultSubject(project, preferredId = "") {
    const preferred = findItem(project, preferredId);
    if (preferred && preferred.kind !== "camera") return preferred;
    return (project.items || []).find((item) => ITEM_KINDS[item.kind]?.group === "character")
      || (project.items || []).find((item) => item.kind !== "camera")
      || null;
  }

  /* ------------------------------------------------------------- keyframes -- */

  function keyframesFor(project, itemId) {
    const id = String(itemId || "");
    return (project?.keyframes || []).filter((keyframe) => keyframe.itemId === id).sort((left, right) => left.time - right.time);
  }

  function findKeyframe(project, itemId, time, tolerance = 0.02) {
    const id = String(itemId || "");
    return (project?.keyframes || []).find((keyframe) => keyframe.itemId === id && Math.abs(keyframe.time - Number(time)) <= tolerance) || null;
  }

  function captureState(item, extra = {}) {
    const state = {
      position: [...item.position],
      rotation: [...item.rotation],
      scale: [...item.scale],
    };
    if (typeof item.state === "string") state.state = item.state;
    if (item.pose) state.pose = item.pose;
    if (Number.isFinite(Number(item.fov))) state.fov = Number(item.fov);
    return { ...state, ...extra };
  }

  /** Recording twice at the same instant edits the existing keyframe. */
  function recordKeyframe(project, itemId, time, extra = {}) {
    const item = findItem(project, itemId);
    if (!item) return null;
    const stamp = Math.max(0, roundTo(time, 0.01));
    const existing = findKeyframe(project, itemId, stamp);
    const payload = captureState(item, extra);
    if (existing) {
      Object.assign(existing, payload, { time: stamp });
      return existing;
    }
    const keyframe = { id: createId("key"), itemId: item.id, time: stamp, ...payload };
    project.keyframes.push(keyframe);
    project.keyframes.sort((left, right) => left.time - right.time);
    return keyframe;
  }

  function removeKeyframe(project, keyframeId) {
    const before = project.keyframes.length;
    project.keyframes = project.keyframes.filter((keyframe) => keyframe.id !== String(keyframeId || ""));
    return project.keyframes.length !== before;
  }

  function clearItemKeyframes(project, itemId, fromTime = -Infinity, toTime = Infinity) {
    const id = String(itemId || "");
    project.keyframes = project.keyframes.filter((keyframe) => (
      keyframe.itemId !== id || keyframe.time < fromTime || keyframe.time > toTime
    ));
  }

  function easeValue(curve, ratio) {
    const t = Math.min(1, Math.max(0, ratio));
    if (curve === "linear") return t;
    if (curve === "ease-in") return t * t;
    if (curve === "ease-out") return 1 - (1 - t) * (1 - t);
    if (curve === "ease-in-out") return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
    return t;
  }

  function lerpTriple(from, to, ratio) {
    const list = [0, 1, 2].map((index) => (Number(from?.[index]) || 0) + ((Number(to?.[index]) || 0) - (Number(from?.[index]) || 0)) * ratio);
    return list;
  }

  function resolveItemTransform(project, item, time = 0) {
    const keys = keyframesFor(project, item.id);
    const stamp = Number(time) || 0;
    const appearAt = Number(item.appearAt);
    const base = {
      position: [...item.position],
      rotation: [...item.rotation],
      scale: [...item.scale],
      state: item.state,
      pose: item.pose,
      fov: Number.isFinite(Number(item.fov)) ? Number(item.fov) : undefined,
      visible: !Number.isFinite(appearAt) || stamp >= appearAt,
    };
    if (!keys.length) return base;
    if (stamp <= keys[0].time) return { ...base, ...pickKeyframe(keys[0]), visible: base.visible };
    const last = keys[keys.length - 1];
    if (stamp >= last.time) return { ...base, ...pickKeyframe(last), visible: base.visible };
    let index = 0;
    while (index < keys.length - 1 && keys[index + 1].time < stamp) index += 1;
    const from = keys[index];
    const to = keys[index + 1];
    const span = Math.max(1e-4, to.time - from.time);
    const curve = item.motionCurve || "ease-in-out";
    const ratio = easeValue(curve, (stamp - from.time) / span);
    return {
      ...base,
      position: lerpTriple(from.position, to.position, ratio),
      rotation: lerpTriple(from.rotation, to.rotation, ratio),
      scale: lerpTriple(from.scale, to.scale, ratio),
      state: ratio < 0.5 ? from.state ?? base.state : to.state ?? base.state,
      pose: ratio < 0.5 ? from.pose ?? base.pose : to.pose ?? base.pose,
      fov: from.fov !== undefined || to.fov !== undefined
        ? (Number(from.fov ?? to.fov) + (Number(to.fov ?? from.fov) - Number(from.fov ?? to.fov)) * ratio)
        : base.fov,
      visible: base.visible,
    };
  }

  function pickKeyframe(keyframe) {
    return {
      position: [...keyframe.position],
      rotation: [...keyframe.rotation],
      scale: [...keyframe.scale],
      state: keyframe.state,
      pose: keyframe.pose,
      fov: keyframe.fov,
    };
  }

  /* --------------------------------------------------------------- cameras -- */

  /** Camera transform at `time`, honouring any camera keyframes. */
  function cameraTransform(project, item, time = 0) {
    const transform = resolveItemTransform(project, item, time);
    const meta = ITEM_KINDS.camera;
    const position = { x: transform.position[0], y: transform.position[1], z: transform.position[2] };
    const rotation = transform.rotation;
    const forward = transformDirection(rotationMatrix(rotation), { x: 0, y: 0, z: -1 });
    return {
      eye: position,
      forward,
      target: add(position, scaleVec(forward, 4)),
      fov: Number.isFinite(Number(transform.fov)) ? Number(transform.fov) : Number(item.fov || meta.defaultFov || 42),
      roll: degrees(rotation[2] || 0),
      position,
      rotation,
    };
  }

  function cameraViewFor(project, item, time = 0) {
    const transform = cameraTransform(project, item, time);
    return { eye: transform.eye, target: transform.target, fov: transform.fov, roll: transform.roll };
  }

  /**
   * The project rotation that produces a given orientation basis.
   *
   * `rotationMatrix` is a pure function of three angles, so the WebGL layer can
   * hand a rotation to three as a matrix and read the dragged result straight
   * back out without either side having to agree on an Euler order. The two
   * layers disagree there on purpose - three meshes are built with the default
   * `XYZ` order while this basis reads as `ZYX(-x, y, -z)` - which is exactly
   * why a camera could not be given handles before: a marker oriented by one
   * convention showed a different aim than the shot the other one rendered.
   */
  function rotationFromMatrix(matrix) {
    const at = (index) => Number(matrix?.[index] || 0) || 0;
    const y = Math.asin(Math.max(-1, Math.min(1, -at(8))));
    const cy = Math.cos(y);
    if (Math.abs(cy) > 1e-6) {
      return [Math.atan2(-at(9), at(10)), y, Math.atan2(-at(4), at(0))];
    }
    // Looking straight up or down the yaw is degenerate; keep it in roll.
    return [Math.atan2(at(6), at(5)), y, 0];
  }

  /** Aim a camera at a point, preserving its own roll. */
  function aimCamera(item, eye, target, extra = {}) {
    const direction = normalize(subtract(target, eye));
    const yaw = Math.atan2(-direction.x, -direction.z);
    const pitch = Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
    item.position = [roundTo(eye.x, 0.001), roundTo(eye.y, 0.001), roundTo(eye.z, 0.001)];
    item.rotation = [roundTo(-pitch, 0.0001), roundTo(yaw, 0.0001), roundTo(extra.roll ? radians(extra.roll) : item.rotation?.[2] || 0, 0.0001)];
    if (Number.isFinite(Number(extra.fov))) {
      item.fov = Number(extra.fov);
      item.focalLength = focalFromFov(Number(extra.fov));
    }
    return item;
  }

  /** Places a camera for one of the shot presets, relative to the subject. */
  function applyShotPreset(project, cameraId, presetId, subjectId = "", time = 0) {
    const preset = SHOT_PRESETS.find((entry) => entry.id === presetId);
    const camera = findItem(project, cameraId);
    if (!preset || !camera) return null;
    if (preset.id === "current") return camera;
    const subject = defaultSubject(project, subjectId);
    const bounds = subject ? itemBounds(project, subject, time) : null;
    const focus = bounds?.center || { x: 0, y: 0.86, z: 0 };
    const subjectHeight = bounds?.height || 1.72;
    const scaleFactor = subjectHeight > 0.6 ? subjectHeight / 1.72 : 1;
    const distance = preset.distance * scaleFactor;
    const yaw = (preset.yaw || 0) * DEG;
    // The subject faces +Z in its own space; the preset yaw spins around it.
    const subjectYaw = subject ? Number(subject.rotation?.[1] || 0) : 0;
    const spin = subjectYaw + yaw;
    const eye = {
      x: focus.x + Math.sin(spin) * distance,
      y: Math.max(0.15, preset.height * scaleFactor),
      z: focus.z + Math.cos(spin) * distance,
    };
    const aim = { x: focus.x, y: focus.y + (preset.aimLift || 0) * scaleFactor, z: focus.z };
    return aimCamera(camera, eye, aim, { fov: preset.fov, roll: preset.roll || 0 });
  }

  /**
   * Generates the keyframes for one of the DX camera moves. Everything is
   * expressed relative to the subject, so the move stays usable after the
   * character is moved again.
   */
  function applyCameraMotionPreset(project, cameraId, presetId, subjectId = "", startTime = 0) {
    const preset = CAMERA_MOTION_PRESETS.find((entry) => entry.id === presetId);
    const camera = findItem(project, cameraId);
    if (!preset || !camera) return null;
    const subject = defaultSubject(project, subjectId);
    const start = Math.max(0, Number(startTime) || 0);
    const duration = Math.max(0.5, Number(preset.duration) || 3);
    const end = start + duration;
    const focus = subject ? itemBounds(project, subject, start).center : { x: 0, y: 0.9, z: 0 };
    const height = subject ? itemBounds(project, subject, start).height : 1.7;
    const headHeight = Math.max(0.6, height * 0.86);
    clearItemKeyframes(project, camera.id, start, end);
    const fov = Number(camera.fov || 42);
    const keys = [];
    const push = (time, eye, extra = {}) => {
      const previousPosition = camera.position;
      const previousRotation = camera.rotation;
      aimCamera(camera, eye, { x: focus.x, y: focus.y + height * 0.12, z: focus.z }, { fov: extra.fov ?? fov });
      keys.push({ time, position: [...camera.position], rotation: [...camera.rotation], scale: [...camera.scale], fov: extra.fov ?? fov, state: extra.state });
      camera.position = previousPosition;
      camera.rotation = previousRotation;
    };
    const subjectYaw = subject ? Number(subject.rotation?.[1] || 0) : 0;
    const behind = {
      x: focus.x - Math.sin(subjectYaw) * 3.1,
      z: focus.z - Math.cos(subjectYaw) * 3.1,
    };
    if (preset.id === "static") {
      const transform = cameraTransform(project, camera, start);
      recordKeyframe(project, camera.id, start, { position: [...camera.position], rotation: [...camera.rotation], scale: [...camera.scale], fov, state: "镜头保持固定" });
      recordKeyframe(project, camera.id, end, { position: [...camera.position], rotation: [...camera.rotation], scale: [...camera.scale], fov, state: "镜头保持固定" });
      return { item: camera, duration, keys: 2, transform };
    }
    const steps = preset.id === "orbit-follow" || preset.id === "fps-orbit" ? 8 : preset.id === "handheld-follow" ? 8 : 6;
    const arc = radians(preset.arcDegrees || 60);
    for (let step = 0; step <= steps; step += 1) {
      const ratio = step / steps;
      const time = start + duration * ratio;
      const spin = subjectYaw + arc * ratio - Math.PI / 2;
      const breathe = Math.sin(ratio * Math.PI * 3) * 0.035;
      let eye;
      if (preset.id === "follow") {
        eye = { x: behind.x, y: headHeight + 0.35, z: behind.z };
      } else if (preset.id === "handheld-follow") {
        eye = { x: behind.x + breathe, y: headHeight + 0.32 + breathe, z: behind.z + breathe * 0.8 };
      } else if (preset.id === "orbit-follow" || preset.id === "fps-orbit") {
        const radius = preset.id === "fps-orbit" ? 2.1 : 2.7;
        eye = {
          x: focus.x + Math.sin(spin) * radius,
          y: headHeight + (preset.id === "fps-orbit" ? 0.2 + ratio * 0.5 : 0.28),
          z: focus.z + Math.cos(spin) * radius,
        };
      } else if (preset.id === "dolly-in") {
        eye = {
          x: focus.x + Math.sin(subjectYaw) * (4.6 - 2.6 * ratio),
          y: headHeight + 0.1 - 0.05 * ratio,
          z: focus.z + Math.cos(subjectYaw) * (4.6 - 2.6 * ratio),
        };
      } else if (preset.id === "dolly-out") {
        eye = {
          x: focus.x + Math.sin(subjectYaw) * (1.8 + 3 * ratio),
          y: headHeight + 0.05 + 0.1 * ratio,
          z: focus.z + Math.cos(subjectYaw) * (1.8 + 3 * ratio),
        };
      } else if (preset.id === "crane-up") {
        eye = {
          x: focus.x + Math.sin(subjectYaw) * 3.2,
          y: 1.2 + 3.4 * ratio,
          z: focus.z + Math.cos(subjectYaw) * 3.2,
        };
      } else {
        // Hitchcock: the camera closes in while the focal length compensates.
        const near = 1.5 + 2.4 * (1 - ratio);
        const compensation = 1 + ratio * 1.5;
        eye = {
          x: focus.x + Math.sin(subjectYaw) * near,
          y: headHeight + 0.05,
          z: focus.z + Math.cos(subjectYaw) * near,
        };
        push(time, eye, { fov: Math.max(12, fov / compensation), state: "移动与焦距反向补偿" });
        continue;
      }
      push(time, eye, { state: preset.description });
    }
    for (const key of keys) {
      const record = { position: key.position, rotation: key.rotation, scale: key.scale, fov: key.fov };
      if (key.state) record.state = key.state;
      recordKeyframe(project, camera.id, key.time, record);
    }
    return { item: camera, duration, keys: keys.length };
  }

  /* ------------------------------------------------------------ description -- */

  function formatTriple(value, digits = 2) {
    return `(${[0, 1, 2].map((index) => Number(value?.[index] || 0).toFixed(digits)).join(", ")})`;
  }

  function formatTime(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(total / 60);
    const rest = total - minutes * 60;
    return `${String(minutes).padStart(2, "0")}:${rest.toFixed(1).padStart(4, "0")}`;
  }

  function itemTypeLabel(kind) {
    const group = ITEM_KINDS[kind]?.group;
    if (group === "character") return "角色";
    if (group === "camera") return "机位";
    return "道具";
  }

  function facingDegrees(item) {
    const rotation = item.rotation || [0, 0, 0];
    return ((degrees(rotation[1]) % 360) + 360) % 360;
  }

  /**
   * Plain-language scene state. This is the text the stage hands to the canvas
   * agent (and the user can read it before generating), so it names every
   * object, where it stands, where it looks and what it is doing.
   */
  function describeProject(project, options = {}) {
    const scene = normalizeProject(project);
    const time = Number(options.time) || 0;
    const lines = [];
    lines.push(`场景「${scene.name}」，时长 ${scene.duration.toFixed(1)} 秒，画幅 ${scene.aspectRatio === "auto" ? "自动" : scene.aspectRatio}。`);
    const characters = scene.items.filter((item) => ITEM_KINDS[item.kind]?.group === "character");
    const cameras = scene.items.filter((item) => item.kind === "camera");
    const props = scene.items.filter((item) => {
      const group = ITEM_KINDS[item.kind]?.group;
      return group === "prop";
    });
    if (characters.length) {
      lines.push(`角色 ${characters.length} 个：`);
      for (const item of characters) {
        const transform = resolveItemTransform(scene, item, time);
        const bits = [
          `${item.name}（${ITEM_KINDS[item.kind].label}）位于 ${formatTriple(transform.position)}`,
          `朝向 ${facingDegrees(item).toFixed(0)}°`,
        ];
        const pose = CHARACTER_POSES.find((entry) => entry.id === (transform.pose || item.pose));
        if (pose && pose.id !== "stand") bits.push(`动作 ${pose.label}`);
        const visibleAt = Number(item.appearAt);
        if (Number.isFinite(visibleAt) && visibleAt > 0) bits.push(`${visibleAt.toFixed(1)} 秒后出现`);
        const state = String(transform.state ?? item.state ?? "").trim();
        if (state) bits.push(`状态描述「${state}」`);
        bits.push(`${keyframesFor(scene, item.id).length} 个关键帧`);
        lines.push(`  - ${bits.join("，")}。`);
      }
    }
    if (props.length) {
      lines.push(`道具 ${props.length} 个：`);
      for (const item of props) {
        const transform = resolveItemTransform(scene, item, time);
        const extra = item.kind === "board" && item.imageName ? `，贴图 ${item.imageName}` : "";
        lines.push(`  - ${item.name}（${ITEM_KINDS[item.kind].label}）位于 ${formatTriple(transform.position)}，尺寸 ${formatTriple(transform.scale)}${extra}。`);
      }
    }
    if (cameras.length) {
      lines.push(`机位 ${cameras.length} 个：`);
      for (const item of cameras) {
        const view = cameraViewFor(scene, item, time);
        const direction = normalize(subtract(view.target, view.eye));
        const keys = keyframesFor(scene, item.id);
        const bits = [
          `${item.name} 位于 ${formatTriple(view.eye)}`,
          `FOV ${view.fov.toFixed(0)}°（约 ${(item.focalLength || focalFromFov(item.fov)).toFixed(0)}mm）`,
          `朝向 ${formatTriple([direction.x, direction.y, direction.z])}`,
        ];
        if (keys.length) bits.push(`${keys.length} 个关键帧，${keys[0].time.toFixed(1)}s 至 ${keys[keys.length - 1].time.toFixed(1)}s`);
        lines.push(`  - ${bits.join("，")}。`);
      }
    }
    if (!scene.items.length) lines.push("场景还没有任何对象。");
    return lines.join("\n");
  }

  /** DX-compatible context for the canvas agent. */
  function sceneContext(project, options = {}) {
    const scene = normalizeProject(project);
    const time = Number(options.time) || 0;
    return {
      active: true,
      nodeId: String(options.nodeId || ""),
      currentTime: time,
      duration: scene.duration,
      aspectRatio: scene.aspectRatio,
      cameraAnimationPresets: CAMERA_MOTION_PRESETS.map((preset) => ({
        id: preset.id,
        label: preset.label,
        description: preset.description,
      })),
      scene: scene.items.map((item) => {
        const transform = resolveItemTransform(scene, item, time);
        const forward = transformDirection(rotationMatrix(transform.rotation), { x: 0, y: 0, z: 1 });
        return {
          id: item.id,
          name: item.name,
          kind: item.kind,
          type: itemTypeLabel(item.kind),
          position: [transform.position[0], transform.position[1], transform.position[2]],
          rotation: [transform.rotation[0], transform.rotation[1], transform.rotation[2]],
          forward: [forward.x, forward.y, forward.z],
          state: String(transform.state ?? item.state ?? ""),
          pose: transform.pose || item.pose || "",
          keyframes: keyframesFor(scene, item.id).length,
        };
      }),
    };
  }

  /* -------------------------------------------------------------- geometry -- */

  function boxFaces(center, size) {
    const hx = size[0] / 2;
    const hy = size[1] / 2;
    const hz = size[2] / 2;
    const corners = [
      { x: -hx, y: -hy, z: -hz }, { x: hx, y: -hy, z: -hz }, { x: hx, y: hy, z: -hz }, { x: -hx, y: hy, z: -hz },
      { x: -hx, y: -hy, z: hz }, { x: hx, y: -hy, z: hz }, { x: hx, y: hy, z: hz }, { x: -hx, y: hy, z: hz },
    ].map((corner) => ({ x: corner.x + center.x, y: corner.y + center.y, z: corner.z + center.z }));
    // Each quad is wound counter clockwise as seen from outside the box so the
    // cross product normal points away from the centre and lighting stays right.
    const quads = [
      [1, 0, 3, 2], // back, -Z
      [4, 5, 6, 7], // front, +Z
      [0, 4, 7, 3], // left, -X
      [5, 1, 2, 6], // right, +X
      [7, 6, 2, 3], // top, +Y
      [0, 1, 5, 4], // bottom, -Y
    ];
    return quads.map((quad) => ({
      points: quad.map((index) => corners[index]),
      normal: faceNormal(quad.map((index) => corners[index])),
    }));
  }

  function faceNormal(points) {
    const normal = cross(subtract(points[1], points[0]), subtract(points[2], points[0]));
    return normalize(normal);
  }

  function boxCorners(center, size) {
    const hx = size[0] / 2;
    const hy = size[1] / 2;
    const hz = size[2] / 2;
    return [
      { x: -hx, y: -hy, z: -hz }, { x: hx, y: -hy, z: -hz }, { x: hx, y: hy, z: -hz }, { x: -hx, y: hy, z: -hz },
      { x: -hx, y: -hy, z: hz }, { x: hx, y: -hy, z: hz }, { x: hx, y: hy, z: hz }, { x: -hx, y: hy, z: hz },
    ].map((corner) => ({ x: corner.x + center.x, y: corner.y + center.y, z: corner.z + center.z }));
  }

  /**
   * Every renderable box of one item in world space. Characters are built from
   * a jointed skeleton of boxes — the same white-mannequin idea as the DX stage,
   * minus the downloaded mesh.
   */
  function itemBoxes(item, transform) {
    const matrix = composeMatrix(transform.position, transform.rotation, transform.scale);
    const boxes = [];
    const push = (center, size, localRotation = [0, 0, 0], color = item.color) => {
      const local = composeMatrix(center, localRotation, [1, 1, 1]);
      const combined = multiply(matrix, local);
      boxes.push({
        center: { x: combined[3], y: combined[7], z: combined[11] },
        size,
        matrix: combined,
        color,
        item,
      });
    };
    if (ITEM_KINDS[item.kind]?.group === "character") {
      pushCharacter(boxes, item, transform, matrix, push);
      return boxes;
    }
    if (item.kind === "camera") {
      push({ x: 0, y: 0, z: 0 }, [0.3, 0.22, 0.34], [0, 0, 0], item.color || "#3c4450");
      push({ x: 0, y: 0.02, z: -0.28 }, [0.16, 0.16, 0.24], [0, 0, 0], "#2b323b");
      return boxes;
    }
    if (item.kind === "plane") {
      push({ x: 0, y: 0.01, z: 0 }, [2, 0.02, 2], [0, 0, 0], item.color || "#9aa6b2");
      return boxes;
    }
    if (item.kind === "board") {
      boxes.push({
        center: { x: matrix[3], y: matrix[7] + 0.6, z: matrix[11] },
        size: [1.6, 1.2, 0.04],
        matrix: multiply(matrix, composeMatrix({ x: 0, y: 0.6, z: 0 }, [0, 0, 0], [1, 1, 1])),
        color: item.color || "#cbd2d8",
        item,
        image: item.imageUrl || "",
      });
      return boxes;
    }
    push({ x: 0, y: 0.5, z: 0 }, [1, 1, 1], [0, 0, 0], item.color || "#b9c2cb");
    return boxes;
  }

  /**
   * Box mannequin. Proportions are for a ~1.72 m adult; the pose angles rotate
   * the limb boxes around their joints, which is enough to read as a person
   * standing, walking, running, sitting or waving.
   */
  function pushCharacter(boxes, item, transform, matrix, push) {
    const pose = POSE_ANGLES[transform.pose || item.pose] || POSE_ANGLES.stand;
    const color = item.color || ITEM_KINDS[item.kind]?.color || "#e9e6e1";
    const dim = (value) => value * (Number(item.kind === "robot-female" ? 0.95 : 1));
    // Torso chain: pelvis, chest, neck, head.
    push({ x: 0, y: dim(0.94), z: 0 }, [dim(0.3), dim(0.2), dim(0.2)], [pose.pelvisPitch, 0, 0], color);
    push({ x: 0, y: dim(1.22), z: 0 }, [dim(0.36), dim(0.38), dim(0.21)], [pose.torsoPitch, 0, 0], color);
    push({ x: 0, y: dim(1.46), z: 0 }, [dim(0.1), dim(0.08), dim(0.1)], [pose.torsoPitch, 0, 0], color);
    push({ x: 0, y: dim(1.6), z: 0 }, [dim(0.2), dim(0.24), dim(0.22)], [pose.torsoPitch * 0.4, pose.headYaw, 0], color);
    // Arms.
    for (const side of [-1, 1]) {
      const shoulderX = side * dim(0.245);
      const shoulder = { x: shoulderX, y: dim(1.34), z: 0 };
      const swing = side > 0 ? pose.rightShoulder : pose.leftShoulder;
      const elbow = side > 0 ? pose.rightElbow : pose.leftElbow;
      const upper = limbSegment(shoulder, dim(0.3), 0, swing, pose.torsoPitch);
      push(upper.center, [dim(0.11), dim(0.3), dim(0.11)], upper.rotation, color);
      const elbowJoint = limbEnd(shoulder, dim(0.3), 0, swing, pose.torsoPitch);
      const forearm = limbSegment(elbowJoint, dim(0.28), 0, swing + elbow, pose.torsoPitch);
      push(forearm.center, [dim(0.1), dim(0.28), dim(0.1)], forearm.rotation, color);
    }
    // Legs.
    for (const side of [-1, 1]) {
      const hipX = side * dim(0.095);
      const hip = { x: hipX, y: dim(0.86), z: 0 };
      const swing = side > 0 ? pose.rightHip : pose.leftHip;
      const knee = side > 0 ? pose.rightKnee : pose.leftKnee;
      const thigh = limbSegment(hip, dim(0.44), 0, swing);
      push(thigh.center, [dim(0.145), dim(0.44), dim(0.16)], thigh.rotation, color);
      const kneeJoint = limbEnd(hip, dim(0.44), 0, swing);
      const shin = limbSegment(kneeJoint, dim(0.44), 0, swing + knee);
      push(shin.center, [dim(0.125), dim(0.44), dim(0.135)], shin.rotation, color);
      const ankle = limbEnd(kneeJoint, dim(0.44), 0, swing + knee);
      const footPitch = knee > 0 ? 0 : 0;
      push({ x: ankle.x, y: Math.max(dim(0.04), ankle.y - dim(0.02)), z: ankle.z + dim(0.05) }, [dim(0.12), dim(0.08), dim(0.24)], [footPitch, 0, 0], color);
    }
  }

  const POSE_ANGLES = {
    stand: { pelvisPitch: 0, torsoPitch: 0, headYaw: 0, leftShoulder: 0.06, rightShoulder: -0.06, leftElbow: 0.12, rightElbow: -0.12, leftHip: 0, rightHip: 0, leftKnee: 0, rightKnee: 0 },
    walk: { pelvisPitch: 0, torsoPitch: 0.03, headYaw: 0, leftShoulder: 0.42, rightShoulder: -0.42, leftElbow: 0.25, rightElbow: -0.25, leftHip: 0.36, rightHip: -0.36, leftKnee: 0.22, rightKnee: 0.05 },
    run: { pelvisPitch: 0, torsoPitch: 0.16, headYaw: 0, leftShoulder: 0.95, rightShoulder: -0.95, leftElbow: 1.15, rightElbow: -1.15, leftHip: 0.72, rightHip: -0.72, leftKnee: 0.95, rightKnee: 0.25 },
    sit: { pelvisPitch: 0, torsoPitch: 0.08, headYaw: 0, leftShoulder: 0.2, rightShoulder: -0.2, leftElbow: 0.5, rightElbow: -0.5, leftHip: 1.45, rightHip: 1.45, leftKnee: -1.4, rightKnee: -1.4 },
    wave: { pelvisPitch: 0, torsoPitch: 0, headYaw: -0.2, leftShoulder: 0.08, rightShoulder: -2.35, leftElbow: 0.15, rightElbow: -0.5, leftHip: 0, rightHip: 0, leftKnee: 0, rightKnee: 0 },
  };

  /** Segment geometry for a limb that hangs from `origin` and swings in X. */
  function limbSegment(origin, length, spread, angle, torsoPitch = 0) {
    const total = Number(angle) || 0;
    const half = length / 2;
    const dy = -Math.cos(total) * half;
    const dz = Math.sin(total) * half;
    return {
      center: { x: origin.x + (Number(spread) || 0), y: origin.y + dy, z: origin.z + dz },
      rotation: [total + Number(torsoPitch || 0), 0, 0],
    };
  }

  function limbEnd(origin, length, spread, angle, torsoPitch = 0) {
    const total = (Number(angle) || 0) + Number(torsoPitch || 0);
    return {
      x: origin.x + (Number(spread) || 0),
      y: origin.y - Math.cos(total) * length,
      z: origin.z + Math.sin(total) * length,
    };
  }

  /* -------------------------------------------------------------- renderer -- */

  function shade(color, normal, alpha = 1) {
    const rgb = parseColor(color);
    const light = Math.max(0, dot(normal, normalize(LIGHT_DIRECTION)));
    const intensity = 0.42 + 0.58 * light;
    return {
      fill: `rgb(${Math.round(rgb[0] * intensity)} ${Math.round(rgb[1] * intensity)} ${Math.round(rgb[2] * intensity)} / ${alpha})`,
      rgb,
    };
  }

  /**
   * Object ids the renderer must leave out of a frame.
   *
   * The camera preview and the exported frame are rendered from the lens of a
   * camera gizmo, so that gizmo (and its siblings) have to be hidden: their box
   * sits on the lens and would otherwise fill the shot. The stage view keeps
   * them because that is where the operator picks and drags them.
   */
  function hiddenItemSet(options = {}) {
    const hidden = new Set();
    if (Array.isArray(options.hideItemIds)) {
      for (const id of options.hideItemIds) hidden.add(String(id));
    }
    if (options.hideItems) {
      for (const item of options.hideItems) {
        if (item && item.id) hidden.add(String(item.id));
      }
    }
    return hidden;
  }

  function parseColor(color) {
    const value = String(color || "#b9c2cb").trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) {
      return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];
    }
    if (/^#[0-9a-f]{3}$/i.test(value)) {
      return [parseInt(value[1] + value[1], 16), parseInt(value[2] + value[2], 16), parseInt(value[3] + value[3], 16)];
    }
    return [185, 194, 203];
  }

  function viewProjection(view) {
    const aspect = view.width / Math.max(1, view.height);
    const projection = perspectiveMatrix(view.fov, aspect, NEAR_PLANE, 220);
    let matrix = multiply(projection, lookAtMatrix(view.eye, view.target, { x: 0, y: 1, z: 0 }));
    if (view.roll) {
      const roll = Number(view.roll) * DEG;
      const c = Math.cos(roll);
      const s = Math.sin(roll);
      matrix = multiply([c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], matrix);
    }
    return matrix;
  }

  /** Screen projection plus the camera-space depth used for ordering. */
  function projectPoint(matrix, point, width, height) {
    const clip = transformPoint(matrix, point);
    if (!Number.isFinite(clip.x) || !Number.isFinite(clip.y) || !Number.isFinite(clip.z)) return null;
    const w = matrix[12] * point.x + matrix[13] * point.y + matrix[14] * point.z + matrix[15];
    if (w <= 1e-4) return null;
    return {
      x: (clip.x / w * 0.5 + 0.5) * width,
      y: (1 - (clip.y / w * 0.5 + 0.5)) * height,
      depth: w,
    };
  }

  const EPSILON = 1e-4;

  /**
   * Clip a world space polygon against the camera near plane.
   *
   * The clip space w of a point equals its distance in front of the lens, so
   * the near plane is simply w = NEAR_PLANE and Sutherland-Hodgman applies
   * directly to world space points. Without this a box that surrounds the lens
   * (a camera gizmo, or the stage camera flown inside a prop) projects to a
   * quad far larger than the viewport and paints over everything.
   */
  function clipPolygonToNear(points, matrix, near = NEAR_PLANE) {
    const safeNear = Math.max(1e-3, Number(near) || NEAR_PLANE);
    const depthOf = (point) => matrix[12] * point.x + matrix[13] * point.y + matrix[14] * point.z + matrix[15];
    const clipped = [];
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      const currentDepth = depthOf(current);
      const nextDepth = depthOf(next);
      const currentInside = currentDepth >= safeNear;
      const nextInside = nextDepth >= safeNear;
      if (currentInside) clipped.push(current);
      if (currentInside === nextInside) continue;
      const span = nextDepth - currentDepth;
      if (Math.abs(span) < 1e-9) continue;
      const ratio = (safeNear - currentDepth) / span;
      clipped.push({
        x: current.x + (next.x - current.x) * ratio,
        y: current.y + (next.y - current.y) * ratio,
        z: current.z + (next.z - current.z) * ratio,
      });
    }
    return clipped;
  }

  /** World point to stage pixel coordinates, or null when behind the lens. */
  function screenPoint(view, point) {
    const width = Math.max(1, Math.round(view.width || 1));
    const height = Math.max(1, Math.round(view.height || 1));
    return projectPoint(viewProjection({ ...view, width, height }), point, width, height);
  }

  function pointInPolygon(polygon, x, y) {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
      const current = polygon[index];
      const last = polygon[previous];
      if ((current.y > y) !== (last.y > y)
        && x < ((last.x - current.x) * (y - current.y)) / (last.y - current.y + EPSILON) + current.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  function convexHull(points) {
    const list = [...points].sort((left, right) => (left.x - right.x) || (left.y - right.y));
    if (list.length < 3) return list;
    const build = (source) => {
      const stack = [];
      for (const point of source) {
        while (stack.length >= 2) {
          const a = stack[stack.length - 2];
          const b = stack[stack.length - 1];
          if ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) <= 0) stack.pop();
          else break;
        }
        stack.push(point);
      }
      return stack;
    };
    const lower = build(list);
    const upper = build([...list].reverse());
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
  }

  function buildFaceList(project, time, options = {}) {
    const faces = [];
    for (const item of project.items) {
      const transform = resolveItemTransform(project, item, time);
      if (!transform.visible) continue;
      const boxes = itemBoxes(item, transform);
      const selected = options.selectedId && options.selectedId === item.id;
      for (const box of boxes) {
        for (const face of boxFaces({ x: 0, y: 0, z: 0 }, box.size)) {
          const points = face.points.map((point) => transformPoint(box.matrix, point));
          const normal = normalize(transformDirection(box.matrix, face.normal));
          faces.push({
            item,
            selected,
            points,
            normal,
            color: box.color,
            image: box.image,
            alpha: 1,
          });
        }
      }
      if (item.kind === "camera") {
        const matrix = composeMatrix(transform.position, transform.rotation, transform.scale);
        const fov = Number(transform.fov || item.fov || 42) * DEG;
        const aspect = options.aspect || 16 / 9;
        const reach = 1.6;
        const halfHeight = Math.tan(fov / 2) * reach;
        const halfWidth = halfHeight * aspect;
        const lens = transformPoint(matrix, { x: 0, y: 0, z: -0.44 });
        const apex = transformPoint(matrix, { x: 0, y: 0, z: 0 });
        const corners = [
          { x: -halfWidth, y: halfHeight, z: -reach },
          { x: halfWidth, y: halfHeight, z: -reach },
          { x: halfWidth, y: -halfHeight, z: -reach },
          { x: -halfWidth, y: -halfHeight, z: -reach },
        ].map((corner) => transformPoint(matrix, corner));
        for (const corner of corners) {
          faces.push({ item, selected, segments: [[lens, corner]], color: "#7d8a99", alpha: 0.75, alphaFill: 0 });
        }
        for (let index = 0; index < corners.length; index += 1) {
          faces.push({ item, selected, segments: [[corners[index], corners[(index + 1) % corners.length]]], color: "#7d8a99", alpha: 0.75 });
        }
        faces.push({ item, selected, segments: [[apex, lens]], color: "#8c98a6", alpha: 0.9 });
      }
    }
    return faces;
  }

  function groundShadowPolygon(project, time) {
    const polygons = [];
    for (const item of project.items) {
      const transform = resolveItemTransform(project, item, time);
      if (!transform.visible || item.kind === "camera") continue;
      const boxes = itemBoxes(item, transform);
      for (const box of boxes) {
        const corners = boxCorners({ x: 0, y: 0, z: 0 }, box.size).map((corner) => transformPoint(box.matrix, corner));
        const projected = [];
        for (const corner of corners) {
          const height = Math.max(0, corner.y);
          const drop = height / Math.max(0.2, normalize(LIGHT_DIRECTION).y);
          projected.push({
            x: corner.x + normalize(LIGHT_DIRECTION).x * drop,
            y: 0.01,
            z: corner.z + normalize(LIGHT_DIRECTION).z * drop,
          });
        }
        const hull = convexHull(projected.map((point) => ({ x: point.x, z: point.z })));
        if (hull.length >= 3) polygons.push(hull.map((point) => ({ x: point.x, y: 0.01, z: point.z })));
      }
    }
    return polygons;
  }

  /**
   * Paints the scene. `view` is {eye, target, fov, width, height, roll} and
   * `textures` maps image urls to decoded HTMLImageElement objects.
   */
  function renderScene(context, view, project, time, options = {}) {
    const width = Math.max(1, Math.round(view.width));
    const height = Math.max(1, Math.round(view.height));
    const matrix = viewProjection({ ...view, width, height });
    const cameraSpaceEye = view.eye;
    context.save();
    context.clearRect(0, 0, width, height);
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, options.skyTop || "#1b1f26");
    gradient.addColorStop(1, options.skyBottom || "#101317");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    const groundPolygons = [];
    const groundFaces = [];
    const cell = (GROUND_LIMIT * 2) / GROUND_CELLS;
    for (let row = 0; row < GROUND_CELLS; row += 1) {
      for (let column = 0; column < GROUND_CELLS; column += 1) {
        const x0 = -GROUND_LIMIT + column * cell;
        const z0 = -GROUND_LIMIT + row * cell;
        const corners = [
          { x: x0, y: 0, z: z0 },
          { x: x0 + cell, y: 0, z: z0 },
          { x: x0 + cell, y: 0, z: z0 + cell },
          { x: x0, y: 0, z: z0 + cell },
        ];
        const shaded = ((row + column) % 2) === 0;
        groundFaces.push({ points: corners, fill: shaded ? "#171b21" : "#141820", alpha: 1 });
      }
    }
    drawFaces(context, groundFaces, matrix, width, height, cameraSpaceEye);

    for (const polygon of groundShadowPolygon(project, time)) {
      groundPolygons.push(polygon);
    }
    drawFaces(context, groundPolygons.map((points) => ({
      points,
      fill: "rgb(0 0 0 / 0.22)",
      alpha: 1,
      flat: true,
    })), matrix, width, height, cameraSpaceEye);

    const axis = [];
    axis.push({ points: [{ x: -GROUND_LIMIT, y: 0.005, z: 0 }, { x: GROUND_LIMIT, y: 0.005, z: 0 }], segments: true, stroke: "rgb(214 92 92 / 0.35)", width: 1 });
    axis.push({ points: [{ x: 0, y: 0.005, z: -GROUND_LIMIT }, { x: 0, y: 0.005, z: GROUND_LIMIT }], segments: true, stroke: "rgb(110 142 226 / 0.35)", width: 1 });
    drawFaces(context, axis, matrix, width, height, cameraSpaceEye);

    const hidden = hiddenItemSet(options);
    const faces = buildFaceList(project, time, { selectedId: options.selectedId, aspect: view.width / view.height })
      .filter((face) => !(face.item && hidden.has(face.item.id)));
    const drawable = [];
    for (const face of faces) {
      const entry = toScreenFace(face, matrix, width, height, cameraSpaceEye);
      if (entry) drawable.push(entry);
    }
    drawable.sort((left, right) => right.depth - left.depth);
    for (const entry of drawable) {
      if (entry.segments) {
        context.strokeStyle = entry.stroke;
        context.lineWidth = entry.lineWidth;
        context.globalAlpha = entry.alpha;
        context.beginPath();
        context.moveTo(entry.segments[0][0].x, entry.segments[0][0].y);
        context.lineTo(entry.segments[0][1].x, entry.segments[0][1].y);
        context.stroke();
        context.globalAlpha = 1;
        continue;
      }
      context.beginPath();
      context.moveTo(entry.points[0].x, entry.points[0].y);
      for (let index = 1; index < entry.points.length; index += 1) context.lineTo(entry.points[index].x, entry.points[index].y);
      context.closePath();
      if (entry.image && options.textures?.get(entry.image)) {
        context.save();
        context.clip();
        paintTexturedQuad(context, entry, options.textures.get(entry.image));
        context.restore();
      } else {
        context.fillStyle = entry.fill;
        context.fill();
      }
      if (entry.selected) {
        context.strokeStyle = options.accent || "#d5ff40";
        context.lineWidth = 1.6;
        context.stroke();
      } else if (entry.outline) {
        context.strokeStyle = entry.outline;
        context.lineWidth = 1;
        context.stroke();
      }
    }

    if (options.showLabels !== false) {
      paintLabels(context, project, time, matrix, width, height, options, hidden);
    }
    context.restore();
    return { matrix, width, height };
  }

  function toScreenFace(face, matrix, width, height, eye) {
    if (face.segments) {
      const points = face.segments[0].map((point) => projectPoint(matrix, point, width, height));
      if (points.some((point) => !point)) return null;
      const mid = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
      return {
        segments: face.segments.map((segment) => segment.map((point) => projectPoint(matrix, point, width, height))),
        stroke: face.color,
        lineWidth: 1.2,
        alpha: face.alpha ?? 1,
        depth: (points[0].depth + points[1].depth) / 2,
        key: `${mid.x.toFixed(1)}:${mid.y.toFixed(1)}`,
        item: face.item,
      };
    }
    // Back-face culling: the eye must be behind the face plane.
    const centroid = face.points.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 });
    const center = scaleVec(centroid, 1 / face.points.length);
    if (dot(face.normal, subtract(eye, center)) <= 0) return null;
    const clipped = clipPolygonToNear(face.points, matrix);
    if (clipped.length < 3) return null;
    const projected = [];
    for (const vertex of clipped) {
      const point = projectPoint(matrix, vertex, width, height);
      if (!point) return null;
      projected.push(point);
    }
    const depth = projected.reduce((sum, point) => sum + point.depth, 0) / projected.length;
    const shading = shade(face.color, face.normal, face.alpha ?? 1);
    return {
      points: projected,
      fill: face.fill || shading.fill,
      depth,
      image: face.image || "",
      selected: face.selected,
      outline: face.flat ? "" : `rgb(0 0 0 / 0.18)`,
      item: face.item,
    };
  }

  function drawFaces(context, faces, matrix, width, height, eye) {
    const entries = faces.map((face) => (face.segments
      ? toScreenFace({ ...face, segments: [face.points] }, matrix, width, height, eye)
      : toScreenFace({ points: face.points, normal: { x: 0, y: 1, z: 0 }, color: face.fill, alpha: face.alpha, flat: true }, matrix, width, height, eye)))
      .filter(Boolean);
    entries.sort((left, right) => right.depth - left.depth);
    for (const entry of entries) {
      if (entry.segments) {
        context.strokeStyle = entry.stroke;
        context.lineWidth = entry.lineWidth;
        context.beginPath();
        context.moveTo(entry.segments[0][0].x, entry.segments[0][0].y);
        context.lineTo(entry.segments[0][1].x, entry.segments[0][1].y);
        context.stroke();
        continue;
      }
      context.beginPath();
      context.moveTo(entry.points[0].x, entry.points[0].y);
      for (let index = 1; index < entry.points.length; index += 1) context.lineTo(entry.points[index].x, entry.points[index].y);
      context.closePath();
      context.fillStyle = entry.fill;
      context.fill();
    }
  }

  /**
   * Affine approximation of a textured quad: the image is cut into cells that
   * are drawn one by one, which keeps straight edges looking straight without a
   * real projective texture mapper.
   */
  function paintTexturedQuad(context, entry, image) {
    const [p0, p1, p2, p3] = entry.points;
    const cells = 8;
    const sourceWidth = image.naturalWidth || image.width || 1;
    const sourceHeight = image.naturalHeight || image.height || 1;
    const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    const top = (t) => lerp(p0, p1, t);
    const bottom = (t) => lerp(p3, p2, t);
    for (let row = 0; row < cells; row += 1) {
      for (let column = 0; column < cells; column += 1) {
        const u0 = column / cells;
        const u1 = (column + 1) / cells;
        const v0 = row / cells;
        const v1 = (row + 1) / cells;
        const a = lerp(top(u0), bottom(u0), v0);
        const b = lerp(top(u1), bottom(u0), v0);
        const c = lerp(top(u1), bottom(u1), v1);
        context.save();
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.lineTo(c.x, c.y);
        context.closePath();
        context.clip();
        const scaleX = (b.x - a.x) / (sourceWidth * (u1 - u0));
        const scaleY = (c.y - a.y) / (sourceHeight * (v1 - v0));
        const skewX = (b.y - a.y) / (sourceWidth * (u1 - u0));
        const skewY = (c.x - a.x) / (sourceHeight * (v1 - v0));
        context.setTransform(scaleX, skewX, skewY, scaleY, a.x - scaleX * sourceWidth * u0 - skewY * sourceHeight * v0, a.y - skewX * sourceWidth * u0 - scaleY * sourceHeight * v0);
        context.drawImage(image, 0, 0);
        context.restore();
      }
    }
  }

  function paintLabels(context, project, time, matrix, width, height, options, hiddenOverride) {
    const hidden = hiddenOverride || hiddenItemSet(options);
    context.font = "500 12px system-ui, -apple-system, Segoe UI, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (const item of project.items) {
      if (hidden.has(item.id)) continue;
      const transform = resolveItemTransform(project, item, time);
      if (!transform.visible) continue;
      const meta = ITEM_KINDS[item.kind] || ITEM_KINDS.cube;
      const top = {
        x: transform.position[0],
        y: transform.position[1] + meta.height * Math.abs(transform.scale[1] || 1) + 0.22,
        z: transform.position[2],
      };
      const point = projectPoint(matrix, top, width, height);
      if (!point || point.depth > 60) continue;
      const selected = options.selectedId === item.id;
      const text = item.name;
      const metrics = context.measureText(text);
      const padding = 6;
      context.fillStyle = selected ? "rgb(213 255 64 / 0.92)" : "rgb(12 14 18 / 0.72)";
      context.beginPath();
      const boxWidth = metrics.width + padding * 2;
      context.roundRect(point.x - boxWidth / 2, point.y - 9, boxWidth, 18, 9);
      context.fill();
      context.fillStyle = selected ? "#10110e" : "#e8ecf2";
      context.fillText(text, point.x, point.y + 0.5);
    }
  }

  /** Nearest object under a canvas-space point, using the same projection. */
  function pickItem(project, time, view, point) {
    const width = Math.max(1, Math.round(view.width));
    const height = Math.max(1, Math.round(view.height));
    const matrix = viewProjection({ ...view, width, height });
    const hidden = hiddenItemSet(view);
    const faces = buildFaceList(project, time, { aspect: view.width / view.height });
    let best = null;
    for (const face of faces) {
      if (face.segments) continue;
      if (face.item && hidden.has(face.item.id)) continue;
      // Reuse the renderer projection so picking and painting never disagree.
      const entry = toScreenFace(face, matrix, width, height, view.eye);
      if (!entry || entry.segments) continue;
      if (!pointInPolygon(entry.points, point.x, point.y)) continue;
      if (!best || entry.depth < best.depth) best = { item: face.item, depth: entry.depth };
    }
    return best ? best.item : null;
  }

  /** Pointer ray turned into a point on the ground, for dragging objects. */
  /**
   * Right-handed camera basis matching lookAtMatrix: right = forward x worldUp,
   * up = right x forward. Keeping this in one place avoids mirrored picking.
   */
  function cameraBasis(view) {
    const forward = normalize(subtract(view.target, view.eye));
    let right = cross(forward, { x: 0, y: 1, z: 0 });
    if (length(right) < 1e-4) right = cross(forward, { x: 0, y: 0, z: 1 });
    right = normalize(right);
    return { forward, right, up: normalize(cross(right, forward)) };
  }

  /** Pixel to a unit ray direction in world space. */
  function pointerRay(view, point) {
    const width = Math.max(1, Math.round(view.width));
    const height = Math.max(1, Math.round(view.height));
    const aspect = width / height;
    const fov = Math.min(170, Math.max(5, Number(view.fov) || 42)) * DEG;
    const { forward, right, up } = cameraBasis(view);
    const tan = Math.tan(fov / 2);
    const ndcX = (point.x / width) * 2 - 1;
    const ndcY = 1 - (point.y / height) * 2;
    return normalize(add(forward, add(scaleVec(right, ndcX * tan * aspect), scaleVec(up, ndcY * tan))));
  }

  function pointerGroundPoint(view, point, planeY = 0) {
    const direction = pointerRay(view, point);
    if (Math.abs(direction.y) < 1e-5) return null;
    const distance = (planeY - view.eye.y) / direction.y;
    if (!Number.isFinite(distance) || distance <= 0) return null;
    return add(view.eye, scaleVec(direction, distance));
  }

  /** Pointer ray against a screen-facing plane through `anchor`. */
  function pointerPlanePoint(view, point, anchor) {
    const forward = normalize(subtract(view.target, view.eye));
    const direction = pointerRay(view, point);
    const denominator = dot(forward, direction);
    if (Math.abs(denominator) < 1e-5) return null;
    const distance = dot(forward, subtract(anchor, view.eye)) / denominator;
    return add(view.eye, scaleVec(direction, distance));
  }

  return {
    PROJECT_VERSION,
    ITEM_KINDS,
    SHOT_PRESETS,
    CAMERA_MOTION_PRESETS,
    MOTION_CURVES,
    CHARACTER_POSES,
    POSE_ANGLES,
    MODEL_LIBRARY,
    MODEL_BASE_URL,
    JOINT_CONTROLS,
    CHARACTER_STANCE_PRESETS,
    ASPECT_RATIOS,
    GROUND_LIMIT,
    // project
    createProject,
    normalizeProject,
    cloneProject,
    createItem,
    addItem,
    removeItem,
    findItem,
    renameItem,
    defaultItemName,
    itemBounds,
    defaultSubject,
    isModelItem,
    modelFor,
    clipsForKind,
    normalizeJoints,
    applyStancePreset,
    aspectValue,
    focalFromFov,
    fovFromFocal,
    degrees,
    radians,
    // keyframes
    keyframesFor,
    findKeyframe,
    recordKeyframe,
    removeKeyframe,
    clearItemKeyframes,
    resolveItemTransform,
    easeValue,
    // cameras
    cameraTransform,
    cameraViewFor,
    rotationMatrix,
    rotationFromMatrix,
    aimCamera,
    applyShotPreset,
    applyCameraMotionPreset,
    // text
    describeProject,
    sceneContext,
    formatTime,
    itemTypeLabel,
    // geometry and painting
    itemBoxes,
    buildFaceList,
    renderScene,
    pickItem,
    pointerGroundPoint,
    screenPoint,
    pointerPlanePoint,
    clipPolygonToNear,
    NEAR_PLANE,
  };
});
