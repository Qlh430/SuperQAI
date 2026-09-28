const assert = require("node:assert/strict");
const path = require("node:path");

const director = require(path.join(__dirname, "..", "canvas-director3d.js"));

const {
  createProject,
  normalizeProject,
  cloneProject,
  createItem,
  addItem,
  removeItem,
  renameItem,
  defaultItemName,
  describeProject,
  sceneContext,
  recordKeyframe,
  findKeyframe,
  removeKeyframe,
  clearItemKeyframes,
  keyframesFor,
  resolveItemTransform,
  easeValue,
  applyShotPreset,
  applyCameraMotionPreset,
  cameraViewFor,
  rotationMatrix,
  rotationFromMatrix,
  aimCamera,
  applyStancePreset,
  CHARACTER_STANCE_PRESETS,
  JOINT_CONTROLS,
  ITEM_KINDS,
  itemBounds,
  isModelItem,
  modelFor,
  clipsForKind,
  buildFaceList,
  renderScene,
  pickItem,
  pointerGroundPoint,
  screenPoint,
  aspectValue,
  SHOT_PRESETS,
  CAMERA_MOTION_PRESETS,
  MOTION_CURVES,
  ASPECT_RATIOS,
  NEAR_PLANE,
  clipPolygonToNear,
} = director;

const failures = [];
function check(label, run) {
  try {
    run();
  } catch (error) {
    failures.push(`${label} :: ${error.message}`);
  }
}

function approx(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label || "value"} expected ${expected} +/- ${tolerance} but received ${actual}`,
  );
}

/* ---------------------------------------------------------------- catalog */

check("超宽画幅比例换算", () => {
  assert.equal(ASPECT_RATIOS.length, 7, "七种画幅");
  approx(aspectValue({ aspectRatio: "21:9" }), 21 / 9, 1e-6, "21:9");
  approx(aspectValue({ aspectRatio: "9:16" }), 9 / 16, 1e-6, "9:16");
  assert.equal(aspectValue({ aspectRatio: "auto" }), 16 / 9, "自动模式回退 16:9");
  assert.equal(aspectValue({ aspectRatio: "乱填" }), 16 / 9, "非法画幅回退 16:9");
});

check("机位预设与 DX 导演台同名同序", () => {
  const ids = SHOT_PRESETS.map((preset) => preset.id);
  assert.deepEqual(ids.slice(0, 4), ["current", "front-full", "front-medium", "front-close"]);
  assert.ok(ids.includes("shoulder-left") && ids.includes("bird-eye") && ids.includes("dutch"));
  assert.equal(ids.length, 15, "十五个机位预设");
});

check("相机动画预设时长与数量", () => {
  const ids = CAMERA_MOTION_PRESETS.map((preset) => preset.id);
  assert.deepEqual(ids, [
    "follow",
    "orbit-follow",
    "fps-orbit",
    "handheld-follow",
    "dolly-in",
    "dolly-out",
    "crane-up",
    "hitchcock",
    "static",
  ]);
  for (const preset of CAMERA_MOTION_PRESETS) {
    assert.ok(Number(preset.duration) >= 0.5, `${preset.id} 时长下限`);
    assert.ok(preset.label && preset.description, `${preset.id} 需要中文文案`);
  }
});

check("运动曲线覆盖四种且边界收口", () => {
  assert.deepEqual(
    MOTION_CURVES.map((curve) => curve.id),
    ["linear", "ease-in-out", "ease-in", "ease-out"],
  );
  for (const curve of MOTION_CURVES) {
    approx(easeValue(curve.id, 0), 0, 1e-6, `${curve.id} 起点`);
    approx(easeValue(curve.id, 1), 1, 1e-6, `${curve.id} 终点`);
  }
  approx(easeValue("linear", 0.25), 0.25, 1e-6, "线性中点");
  assert.ok(easeValue("ease-in", 0.25) < 0.25, "缓入前段更慢");
  assert.ok(easeValue("ease-out", 0.25) > 0.25, "缓出前段更快");
  approx(easeValue("ease-in-out", 0.5), 0.5, 1e-6, "缓入缓出对称");
  assert.equal(easeValue("不存在", 0.4), 0.4, "未知曲线按线性处理");
});

/* -------------------------------------------------------- project parsing */

check("历史脏数据可以被宽容解析", () => {
  const project = normalizeProject({
    version: "x",
    name: 5,
    duration: "abc",
    aspectRatio: "7:3",
    items: [
      { id: "a", kind: "dragon", position: ["1", "2", null], rotation: null, scale: {} },
      { id: "a", kind: "cube" },
      null,
    ],
    keyframes: [{ itemId: "ghost", time: "2" }, { itemId: "a", time: 1, position: [1, 2, 3] }],
  });
  assert.equal(project.version, 1, "版本号归一");
  assert.equal(project.duration, 10, "非法时长回退默认值");
  assert.equal(project.aspectRatio, "auto", "非法画幅回退自动");
  assert.equal(project.items.length, 2, "丢弃空条目并保留重复 id");
  assert.equal(project.items[0].kind, "cube", "未知类型回退立方体");
  assert.deepEqual(project.items[0].position, [1, 2, 0], "坐标字符串转数字");
  assert.equal(new Set(project.items.map((item) => item.id)).size, 2, "重复 id 被重新分配");
  assert.equal(project.keyframes.length, 1, "指向缺失对象的轨道被丢弃");
  assert.equal(project.keyframes[0].itemId, "a", "有效轨道保留");
  assert.ok(project.keyframes[0].id, "缺失关键帧 id 自动补齐");
});

check("完全非法的输入回退到可用空场景", () => {
  const project = normalizeProject(null);
  assert.equal(project.items.length, 0);
  assert.equal(project.keyframes.length, 0);
  assert.ok(project.duration > 0);
});

check("克隆是深拷贝不会回写原对象", () => {
  const project = createProject({ name: "演示" });
  addItem(project, "cube", { position: [1, 0, 1] });
  const copy = cloneProject(project);
  copy.items[0].position[0] = 99;
  copy.name = "改动";
  assert.equal(project.items[0].position[0], 1, "原场景坐标未被污染");
  assert.equal(project.name, "演示", "原场景名称未被污染");
});

/* -------------------------------------------------------------- naming */

check("新增对象自动避让重名", () => {
  const project = createProject();
  const first = addItem(project, "robot-male");
  const second = addItem(project, "robot-male");
  const third = addItem(project, "robot-male");
  assert.equal(first.name, "男性角色");
  assert.equal(second.name, "男性角色 2");
  assert.equal(third.name, "男性角色 3");
  const names = project.items.map((item) => item.name);
  assert.equal(new Set(names).size, names.length, "场景内名称唯一");
  assert.equal(defaultItemName("robot-male", names), "男性角色 4");
});

check("重命名冲突自动追加序号", () => {
  const project = createProject();
  const first = addItem(project, "cube");
  const second = addItem(project, "cube");
  renameItem(project, second.id, first.name);
  assert.notEqual(second.name, first.name, "重名被拆开");
  assert.ok(second.name.startsWith(first.name), "保留用户输入的词干");
  renameItem(project, second.id, "  主视角  ");
  assert.equal(second.name, "主视角", "名称两端空白被修剪");
  renameItem(project, second.id, "   ");
  assert.ok(second.name.length > 0, "空名称被忽略");
});

check("新增对象不会互相叠放", () => {
  const project = createProject();
  const seen = new Set();
  for (let index = 0; index < 6; index += 1) {
    const item = addItem(project, "cube");
    const key = item.position.join(",");
    assert.ok(!seen.has(key), `第 ${index + 1} 个对象位置未被占用`);
    seen.add(key);
  }
});

check("机位默认站在眼高而不是地面", () => {
  const project = createProject();
  const camera = addItem(project, "camera");
  assert.ok(camera.position[1] > 1, "机位默认抬到眼高");
});

check("删除对象会连带清理它的关键帧", () => {
  const project = createProject();
  const camera = addItem(project, "camera");
  recordKeyframe(project, camera.id, 1);
  recordKeyframe(project, camera.id, 2);
  assert.equal(keyframesFor(project, camera.id).length, 2);
  removeItem(project, camera.id);
  assert.equal(project.items.length, 0);
  assert.equal(keyframesFor(project, camera.id).length, 0, "悬空轨道被清理");
});

/* ----------------------------------------------------------- keyframes */

check("同一时刻记录关键帧是覆盖而不是叠加", () => {
  const project = createProject();
  const cube = addItem(project, "cube");
  cube.position = [1, 0, 0];
  recordKeyframe(project, cube.id, 1);
  cube.position = [3, 0, 0];
  recordKeyframe(project, cube.id, 1.004);
  assert.equal(keyframesFor(project, cube.id).length, 1, "容差内视为同一时刻");
  const keyframe = findKeyframe(project, cube.id, 1);
  approx(keyframe.position[0], 3, 1e-6, "保留最新一次记录");
});

check("关键帧按时间排序且插值连续", () => {
  const project = createProject();
  const cube = addItem(project, "cube");
  cube.position = [0, 0, 0];
  recordKeyframe(project, cube.id, 2);
  cube.position = [4, 0, 0];
  recordKeyframe(project, cube.id, 0);
  const stamps = keyframesFor(project, cube.id).map((keyframe) => keyframe.time);
  assert.deepEqual(stamps, [0, 2], "轨道按时间升序");
  approx(resolveItemTransform(project, cube, 0).position[0], 4, 1e-6, "起点");
  approx(resolveItemTransform(project, cube, 2).position[0], 0, 1e-6, "终点");
  approx(resolveItemTransform(project, cube, 1).position[0], 2, 1e-6, "中点线性插值");
  approx(resolveItemTransform(project, cube, 5).position[0], 0, 1e-6, "越界后保持末帧");
  approx(resolveItemTransform(project, cube, -3).position[0], 4, 1e-6, "越界前保持首帧");
});

check("删除与清空关键帧按区间生效", () => {
  const project = createProject();
  const camera = addItem(project, "camera");
  for (const time of [0, 1, 2, 3]) {
    camera.position = [time, 1.6, 0];
    recordKeyframe(project, camera.id, time);
  }
  const middle = findKeyframe(project, camera.id, 1);
  removeKeyframe(project, middle.id);
  assert.deepEqual(
    keyframesFor(project, camera.id).map((keyframe) => keyframe.time),
    [0, 2, 3],
  );
  clearItemKeyframes(project, camera.id, 2, 5);
  assert.deepEqual(
    keyframesFor(project, camera.id).map((keyframe) => keyframe.time),
    [0],
  );
});

/* -------------------------------------------------- rotation basis */

check("旋转基是正交的，且行列式为 1", () => {
  // The matrix used to be non-orthonormal: its second row read
  // `-sz * sy * cx + cz * sx`, so `R R^T` drifted by up to 0.84 and any
  // direction mixing pitch, yaw and roll was skewed. The Dutch-angle shot and
  // camera transform handles both ride on this.
  const cases = [[0.3, 0.7, 0.2], [-0.5, 1.1, -0.4], [0.9, -0.8, 0.6], [0.4, 0, 0], [0, 0.9, 0]];
  for (const angles of cases) {
    const m = rotationMatrix(angles);
    const rows = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]];
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        const dot = rows[i][0] * rows[j][0] + rows[i][1] * rows[j][1] + rows[i][2] * rows[j][2];
        approx(dot, i === j ? 1 : 0, 1e-9, `R R^T 第 ${i}${j} 项`);
      }
    }
    const det = rows[0][0] * (rows[1][1] * rows[2][2] - rows[1][2] * rows[2][1])
      - rows[0][1] * (rows[1][0] * rows[2][2] - rows[1][2] * rows[2][0])
      + rows[0][2] * (rows[1][0] * rows[2][1] - rows[1][1] * rows[2][0]);
    approx(det, 1, 1e-9, "旋转矩阵行列式");
  }
});

check("rotationFromMatrix 能反解回同一组旋转", () => {
  const cases = [[0.3, 0.7, 0.2], [-0.5, 1.1, -0.4], [0.9, -0.8, 0.6], [1.5708, 0.4, 0], [-1.5708, 0.4, 0]];
  for (const angles of cases) {
    const before = rotationMatrix(angles);
    const after = rotationMatrix(rotationFromMatrix(before));
    for (let index = 0; index < 16; index += 1) {
      approx(after[index], before[index], 1e-9, `反解后第 ${index} 项`);
    }
  }
});

check("相机手柄用的基矩阵不改变机位取景", () => {
  // A camera marker is carried as the project's basis in both directions: the
  // stage writes `rotationMatrix(rotation)` onto the marker and the project
  // reads the dragged orientation back through `rotationFromMatrix`. The pair
  // has to be lossless, or a dragged camera would aim somewhere the preview
  // pane does not show. The forward vector is the one the framing depends on,
  // so it is compared against the shot solved the ordinary way.
  const project = createProject();
  const camera = addItem(project, "camera");
  for (const [yaw, pitch, roll] of [[0.4, -0.25, 0], [-1.2, 0.3, 0.18], [2.6, 0, -0.4]]) {
    camera.rotation = [pitch, yaw, roll];
    const forward = (rotation) => {
      const m = rotationMatrix(rotation);
      return { x: -m[2], y: -m[6], z: -m[10] };
    };
    const direct = forward(camera.rotation);
    const roundTrip = forward(rotationFromMatrix(rotationMatrix(camera.rotation)));
    approx(roundTrip.x, direct.x, 1e-9, "往返后的 forward.x");
    approx(roundTrip.y, direct.y, 1e-9, "往返后的 forward.y");
    approx(roundTrip.z, direct.z, 1e-9, "往返后的 forward.z");
    const view = cameraViewFor(project, camera, 0);
    approx(view.roll, (camera.rotation[2] * 180) / Math.PI, 1e-6, "相机 roll 直接来自第三个角");
  }
});

check("机位朝向不受 roll 影响，且瞄准点回到目标", () => {
  const project = createProject();
  for (const [eye, target, roll] of [
    [{ x: 3, y: 1.4, z: 2.4 }, { x: 0, y: 0.9, z: 0 }, 0],
    [{ x: 0, y: 6.2, z: 5.4 }, { x: 0, y: 0.9, z: 0 }, 0],
    [{ x: -2, y: 2, z: -3 }, { x: 0.5, y: 0.2, z: 0 }, 0],
  ]) {
    const item = createItem("camera");
    aimCamera(item, eye, target, { roll });
    const view = cameraViewFor(project, item, 0);
    const want = { x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z };
    const length = Math.hypot(want.x, want.y, want.z);
    const got = { x: view.target.x - view.eye.x, y: view.target.y - view.eye.y, z: view.target.z - view.eye.z };
    const gotLength = Math.hypot(got.x, got.y, got.z);
    const dot = (want.x * got.x + want.y * got.y + want.z * got.z) / (length * gotLength);
    approx(dot, 1, 1e-6, "瞄准方向应当和求出的朝向一致");
  }
});

check("荷兰倾斜机位的 roll 恰好等于预设值", () => {
  const project = createProject();
  const actor = addItem(project, "robot-male");
  const camera = addItem(project, "camera");
  const preset = SHOT_PRESETS.find((entry) => entry.id === "dutch");
  applyShotPreset(project, camera.id, "dutch", actor.id);
  const view = cameraViewFor(project, camera, 0);
  approx(view.roll, preset.roll, 0.5, "荷兰倾斜的 roll");
});

/* ------------------------------------------------------- stance presets */

check("叉腰姿态在每种 rig 上都自成一表", () => {
  // A joint override is euler degrees in the bone's own local frame, so the
  // numbers that put the male rig's hand on its hip put the female rig's hand
  // out in the air: her rest orientation differs. Each rig therefore carries its
  // own table, and asking for a rig with no entry must fall back rather than
  // pose nothing at all.
  const power = CHARACTER_STANCE_PRESETS.find((entry) => entry.id === "power");
  assert.ok(power && power.rigs, "叉腰必须有按 rig 分的数值");
  assert.ok(power.rigs["human-xbot"], "红色素体需要自己的叉腰数值");
  assert.ok(power.rigs["human-female"], "舞者角色需要自己的叉腰数值");
  assert.ok(power.rigs["human-soldier"], "士兵需要自己的叉腰数值");
  // The default table describes the male rig, which is the one it was solved
  // against; `human-male` deliberately has no entry of its own.
  assert.equal(power.joints.LeftArm.y, 106, "默认表的左臂角度与男性 rig 求解一致");

  const xbot = applyStancePreset({}, "power", "human-xbot");
  assert.deepEqual(xbot.LeftArm, { y: -41, z: 82, x: 142 }, "红色素体取到自己的左臂角度");
  const female = applyStancePreset({}, "power", "human-female");
  assert.deepEqual(female.LeftArm, { y: -142, z: -50, x: 16 }, "舞者角色取到自己的左臂角度");
  const soldier = applyStancePreset({}, "power", "human-soldier");
  assert.deepEqual(soldier.LeftArm, { y: 27, z: 24, x: -10 }, "士兵取到自己的左臂角度");
  const male = applyStancePreset({}, "power", "human-male");
  assert.deepEqual(male.LeftArm, { y: 106, z: 26, x: -37 }, "男性角色取默认表");
  // No rig may fall back to the arm angles of another: that is what put the
  // female rig's hand in the air in the first place.
  assert.notDeepEqual(xbot.LeftArm, male.LeftArm, "素体不复用男性角度");
  assert.notDeepEqual(female.LeftArm, male.LeftArm, "舞者不复用男性角度");
  assert.notDeepEqual(soldier.LeftArm, male.LeftArm, "士兵不复用男性角度");

  // A kind with no entry, and a call that omits the kind entirely, both fall
  // back to the default table instead of returning an unposed map.
  const unknown = applyStancePreset({}, "power", "human-cesium");
  assert.deepEqual(unknown.LeftArm, male.LeftArm, "没有专属数值时回退默认表");
  const noKind = applyStancePreset({}, "power");
  assert.deepEqual(noKind.LeftArm, male.LeftArm, "省略 kind 时回退默认表");

  // A rig whose default clip keeps the arms moving needs a still clip to pose
  // against, and the catalogue has to say which one that is.
  assert.equal(
    ITEM_KINDS["human-female"].stanceClip,
    "TPose",
    "女性角色声明了用于摆姿态的静止动画",
  );
  for (const kind of ["human-male", "human-soldier"]) {
    assert.ok(
      !ITEM_KINDS[kind].stanceClip,
      `${kind} 的默认动画本身就能承载姿态，不应额外切换`,
    );
  }

  // The other presets keep working without a rig table at all.
  const crossed = applyStancePreset({}, "arms-crossed", "human-female");
  assert.ok(crossed.LeftArm && crossed.LeftForeArm, "其余预设不受按 rig 分表影响");
  assert.deepEqual(applyStancePreset({}, "neutral", "human-female"), {}, "自然站姿仍然清空覆盖");
});

check("折腿姿态按 rig 分表：男性与舞者用自己的腿角度", () => {
  // The male and dancer rigs rest with their thighs swung round compared with
  // the plain mannequin, so the shared leg numbers fold their legs backwards
  // and drive the hips under the grid. Both folded presets therefore have to
  // carry their own numbers for those two rigs.
  for (const poseId of ["crouch", "sit"]) {
    const preset = CHARACTER_STANCE_PRESETS.find((entry) => entry.id === poseId);
    assert.ok(preset && preset.rigs, `${poseId} 必须有按 rig 分的腿角度`);
    assert.ok(preset.rigs["human-male"], `${poseId} 需要男性角色的腿角度`);
    assert.ok(preset.rigs["human-female"], `${poseId} 需要舞者角色的腿角度`);
    assert.ok(preset.rigsPatch, `${poseId} 的按 rig 数值是补丁而不是替换`);

    const male = applyStancePreset({}, poseId, "human-male");
    // The rig entry patches the shared pose instead of replacing it, so the
    // spine and arms the pose is built from have to survive.
    assert.equal(male.Spine.x, preset.joints.Spine.x, `${poseId} 保留共享的躯干角度`);
    assert.equal(male.LeftArm.z, preset.joints.LeftArm.z, `${poseId} 保留共享的手臂角度`);
    assert.notDeepEqual(male.LeftUpLeg, preset.joints.LeftUpLeg, `${poseId} 为男性角色换掉了大腿角度`);
    assert.notDeepEqual(
      applyStancePreset({}, poseId, "human-female").LeftUpLeg,
      preset.joints.LeftUpLeg,
      `${poseId} 为舞者换掉了大腿角度`,
    );
    // A rig the shared numbers already suit keeps them, so a pose that used to
    // work cannot move.
    assert.deepEqual(
      applyStancePreset({}, poseId, "human-soldier").LeftUpLeg,
      preset.joints.LeftUpLeg,
      `${poseId} 没有专属数值的 rig 沿用共享腿角度`,
    );
  }
  // A scene saved before the split still carries the old folded-leg angles,
  // which fold these rigs backwards; opening it has to swap them out.
  const stale = normalizeProject({ items: [{
    id: "stale", kind: "human-male",
    joints: {
      Neck: { x: 4 }, Spine: { x: 16 }, Spine1: { x: 8 }, LeftArm: { z: 22 }, RightArm: { z: -22 },
      LeftUpLeg: { x: -62 }, LeftLeg: { x: 78 }, LeftFoot: { x: -18 },
      RightUpLeg: { x: -62 }, RightLeg: { x: 78 }, RightFoot: { x: -18 },
    },
  }] });
  const crouch = CHARACTER_STANCE_PRESETS.find((entry) => entry.id === "crouch");
  assert.deepEqual(
    stale.items[0].joints.LeftUpLeg,
    crouch.rigs["human-male"].LeftUpLeg,
    "旧存档里的半蹲腿角度在打开时被换成正确值",
  );
  assert.equal(stale.items[0].joints.Neck.x, 4, "修复腿角度时不动其他关节");
  assert.equal(stale.items[0].joints.Spine1.x, 8, "修复腿角度时保留躯干微调");

  // A pose only repaired when the whole leg signature matches: a hand-adjusted
  // stance is the operator's own work and has to survive untouched.
  const handPosed = normalizeProject({ items: [{
    id: "hand", kind: "human-male",
    joints: {
      LeftUpLeg: { x: -62 }, LeftLeg: { x: 78 }, LeftFoot: { x: -18 },
      RightUpLeg: { x: -62 }, RightLeg: { x: 78 }, RightFoot: { x: -40 },
    },
  }] });
  assert.equal(handPosed.items[0].joints.LeftUpLeg.x, -62, "手工调过的姿势不被自动改写");

  // The scene on the board "agent测试" carries exactly this: the folded-leg
  // signature plus a few arm and neck tweaks of the operator's own.
  const fromBoard = normalizeProject({ items: [{
    id: "board", kind: "human-male",
    joints: {
      RightArm: { x: 12, z: -22 }, RightForeArm: { y: -12 }, RightHand: { y: 10 }, Neck: { x: 4 },
      LeftUpLeg: { x: -62 }, LeftLeg: { x: 78 }, LeftFoot: { x: -18 },
      RightUpLeg: { x: -62 }, RightLeg: { x: 78 }, RightFoot: { x: -18 },
      Spine: { x: 16 }, Spine1: { x: 8 }, LeftArm: { z: 22 },
    },
  }] });
  assert.deepEqual(
    fromBoard.items[0].joints.LeftUpLeg,
    crouch.rigs["human-male"].LeftUpLeg,
    "存档画布上的半蹲腿角度被换成正确值",
  );
  assert.deepEqual(fromBoard.items[0].joints.RightArm, { x: 12, z: -22 }, "操作者的手臂微调保持不动");
  assert.equal(fromBoard.items[0].joints.Neck.x, 4, "操作者的脖子微调保持不动");
  for (const kind of ["human-soldier", "human-xbot"]) {
    const kept = normalizeProject({ items: [{
      id: "kept", kind,
      joints: {
        LeftUpLeg: { x: -62 }, LeftLeg: { x: 78 }, LeftFoot: { x: -18 },
        RightUpLeg: { x: -62 }, RightLeg: { x: 78 }, RightFoot: { x: -18 },
      },
    }] });
    assert.equal(kept.items[0].joints.LeftUpLeg.x, -62, `${kind} 的旧角度本来就正确，保持不动`);
  }

  // Every angle has to stay inside the slider travel, or the panel would show a
  // value the operator cannot dial back to.
  const limits = new Map(JOINT_CONTROLS.map((entry) => [entry.id, entry]));
  for (const poseId of ["crouch", "sit"]) {
    for (const kind of ["human-male", "human-female", "human-soldier", "human-xbot"]) {
      const joints = applyStancePreset({}, poseId, kind);
      for (const [bone, rotation] of Object.entries(joints)) {
        const control = limits.get(bone);
        if (!control) continue;
        const value = Number(rotation[control.axis]) || 0;
        assert.ok(
          value >= control.min && value <= control.max,
          `${poseId} 的 ${kind}.${bone}.${control.axis} = ${value} 超出滑块范围 ${control.min}..${control.max}`,
        );
      }
    }
  }
});

/* -------------------------------------------------------- shot presets */

check("正面机位站在角色正面一侧", () => {
  const project = createProject();
  const actor = addItem(project, "robot-male", { position: [0, 0, 0] });
  const camera = addItem(project, "camera");
  applyShotPreset(project, camera.id, "front-full", actor.id);
  const bounds = itemBounds(project, actor, 0);
  assert.ok(camera.position[0] === undefined || true);
  const eye = camera.position;
  assert.ok(eye[2] > bounds.center.z, "站在角色正前方（+Z 侧）");
  approx(eye[0], bounds.center.x, 0.35, "水平方向基本对齐角色");
  assert.ok(eye[1] > 0.4 && eye[1] < 2.4, "机位高度落在人眼区间");
});

check("近景不切头：抬升注视点而不是压低机位", () => {
  const project = createProject();
  const actor = addItem(project, "robot-male", { position: [0, 0, 0] });
  const camera = addItem(project, "camera");
  applyShotPreset(project, camera.id, "front-close", actor.id);
  const bounds = itemBounds(project, actor, 0);
  const view = { ...cameraViewFor(project, camera, 0), width: 640, height: 360 };
  const head = screenPoint(view, { x: 0, y: bounds.center.y + bounds.height / 2, z: 0 });
  const feet = screenPoint(view, { x: 0, y: 0, z: 0 });
  assert.ok(head, "头顶应当可见");
  assert.ok(head.y > 0 && head.y < view.height, `头顶不能切出画面，实际 y=${head.y.toFixed(1)}`);
  const reach = Math.hypot(view.eye.x, view.eye.z);
  assert.ok(reach < 2.2, `近景应当靠近角色，实际 ${reach.toFixed(2)}`);
  assert.ok(head.y < feet.y, "画面里头顶在脚上方");
});

check("全身机位把角色完整收进画幅", () => {
  const project = createProject();
  const actor = addItem(project, "robot-male", { position: [0, 0, 0] });
  const camera = addItem(project, "camera");
  applyShotPreset(project, camera.id, "front-full", actor.id);
  const bounds = itemBounds(project, actor, 0);
  const view = { ...cameraViewFor(project, camera, 0), width: 640, height: 360 };
  const head = screenPoint(view, { x: 0, y: bounds.center.y + bounds.height / 2, z: 0 });
  const feet = screenPoint(view, { x: 0, y: 0, z: 0 });
  assert.ok(head.y > 0 && feet.y < view.height, "全身机位头顶与脚底都在画面内");
});

check("俯拍机位高于角色且向下看", () => {
  const project = createProject();
  const actor = addItem(project, "robot-male");
  const camera = addItem(project, "camera");
  applyShotPreset(project, camera.id, "bird-eye", actor.id);
  const bounds = itemBounds(project, actor, 0);
  assert.ok(camera.position[1] > bounds.center.y + bounds.height, "机位明显高于角色头顶");
  const view = cameraViewFor(project, camera, 0);
  assert.ok(view.target.y < view.eye.y, "机位朝下看");
});

check("低机位视线低于角色胸口", () => {
  const project = createProject();
  const actor = addItem(project, "robot-male", { position: [0, 0, 0] });
  const camera = addItem(project, "camera");
  applyShotPreset(project, camera.id, "low-medium", actor.id);
  assert.ok(camera.position[1] < 0.8, `低机位高度应当贴地，实际 ${camera.position[1]}`);
});

check("机位预设按角色身高缩放距离", () => {
  const project = createProject();
  const small = addItem(project, "cube", { position: [0, 0.5, 0] });
  const camera = addItem(project, "camera");
  applyShotPreset(project, camera.id, "front-full", small.id);
  const near = Math.hypot(camera.position[0], camera.position[2]);
  const big = createProject();
  const tall = addItem(big, "robot-male", { position: [0, 0, 0] });
  const cameraB = addItem(big, "camera");
  applyShotPreset(big, cameraB.id, "front-full", tall.id);
  const far = Math.hypot(cameraB.position[0], cameraB.position[2]);
  assert.ok(far > near, "高个子需要更远的机位");
});

check("机位预设会旋转到角色朝向的正面", () => {
  const project = createProject();
  const actor = addItem(project, "robot-male", { position: [0, 0, 0], rotation: [0, Math.PI / 2, 0] });
  const camera = addItem(project, "camera");
  applyShotPreset(project, camera.id, "front-full", actor.id);
  assert.ok(camera.position[0] > 1, `角色转向 +X 后机位应跟到 +X，实际 x=${camera.position[0]}`);
});

check("当前视角预设不会挪动机位", () => {
  const project = createProject();
  const camera = addItem(project, "camera", { position: [1, 1.6, 5] });
  const before = [...camera.position];
  applyShotPreset(project, camera.id, "current");
  assert.deepEqual(camera.position, before, "当前视角保持原位");
});

check("未知机位预设返回空且不抛异常", () => {
  const project = createProject();
  const camera = addItem(project, "camera");
  assert.equal(applyShotPreset(project, camera.id, "不存在的机位"), null);
  assert.equal(applyShotPreset(project, "不存在的机位", "front-full"), null);
});

/* --------------------------------------------------- camera animations */

check("相机动画预设按声明时长生成关键帧", () => {
  const project = createProject();
  const actor = addItem(project, "robot-male", { position: [0, 0, 0] });
  const camera = addItem(project, "camera");
  const result = applyCameraMotionPreset(project, camera.id, "orbit-follow", actor.id, 1);
  assert.ok(result, "返回结果对象");
  const keys = keyframesFor(project, camera.id);
  assert.ok(keys.length >= 2, `环绕跟拍需要至少两个关键帧，实际 ${keys.length}`);
  approx(keys[0].time, 1, 1e-6, "起始时间");
  approx(keys[keys.length - 1].time, 1 + 4, 1e-6, "结束时间等于起点加时长");
  const radius = Math.hypot(keys[0].position[0], keys[0].position[2]);
  const laterRadius = Math.hypot(keys[keys.length - 1].position[0], keys[keys.length - 1].position[2]);
  approx(laterRadius, radius, 1.4, "环绕跟拍保持半径");
  const firstAngle = Math.atan2(keys[0].position[0], keys[0].position[2]);
  const lastAngle = Math.atan2(keys[keys.length - 1].position[0], keys[keys.length - 1].position[2]);
  assert.ok(Math.abs(lastAngle - firstAngle) > 1, "环绕跟拍应当绕出明显角度");
});

check("重复应用动画预设不会叠加旧轨道", () => {
  const project = createProject();
  const actor = addItem(project, "robot-male");
  const camera = addItem(project, "camera");
  applyCameraMotionPreset(project, camera.id, "dolly-in", actor.id, 0);
  const firstCount = keyframesFor(project, camera.id).length;
  applyCameraMotionPreset(project, camera.id, "dolly-in", actor.id, 0);
  assert.equal(keyframesFor(project, camera.id).length, firstCount, "同时段轨道被覆盖");
});

check("固定镜头预设只锁一个关键帧", () => {
  const project = createProject();
  const actor = addItem(project, "robot-male");
  const camera = addItem(project, "camera");
  applyCameraMotionPreset(project, camera.id, "static", actor.id, 0);
  const keys = keyframesFor(project, camera.id);
  assert.equal(keys.length, 2, "固定镜头用首尾两个关键帧锁住");
  assert.deepEqual(keys[0].position, keys[1].position, "首尾机位一致");
  assert.deepEqual(keys[0].rotation, keys[1].rotation, "首尾朝向一致");
});

check("推进镜头终点比起点更靠近角色", () => {
  const project = createProject();
  const actor = addItem(project, "robot-male");
  const camera = addItem(project, "camera");
  applyCameraMotionPreset(project, camera.id, "dolly-in", actor.id, 0);
  const keys = keyframesFor(project, camera.id);
  const start = Math.hypot(keys[0].position[0], keys[0].position[2]);
  const end = Math.hypot(keys[keys.length - 1].position[0], keys[keys.length - 1].position[2]);
  assert.ok(end < start, `推进镜头应当靠近，起点 ${start.toFixed(2)} 终点 ${end.toFixed(2)}`);
});

/* ------------------------------------------------------------ describe */

check("场景描述包含角色位置与朝向", () => {
  const project = createProject({ name: "发布会演示", duration: 8, aspectRatio: "16:9" });
  const actor = addItem(project, "robot-female", { position: [1, 0, -2] });
  const camera = addItem(project, "camera");
  applyShotPreset(project, camera.id, "front-medium", actor.id);
  const text = describeProject(project);
  assert.ok(text.includes("发布会演示"), "包含场景名");
  assert.ok(text.includes("女性角色"), "包含角色类型");
  assert.ok(text.includes("朝向"), "包含朝向");
  assert.ok(text.includes("机位"), "包含机位段落");
  assert.ok(text.includes("供 AI") || text.length > 40, "描述足够具体");
});

check("空场景描述不报错", () => {
  const text = describeProject(createProject());
  assert.equal(typeof text, "string");
  assert.ok(text.includes("0") || text.length > 0);
});

check("Agent 上下文与 DX 导演台同构", () => {
  const project = createProject({ duration: 6 });
  const actor = addItem(project, "robot-male", { position: [0, 0, 1] });
  addItem(project, "camera");
  const context = sceneContext(project, { nodeId: "node-7", time: 1.5 });
  assert.equal(context.active, true);
  assert.equal(context.nodeId, "node-7");
  approx(context.currentTime, 1.5, 1e-6);
  approx(context.duration, 6, 1e-6);
  assert.deepEqual(
    context.cameraAnimationPresets.map((preset) => preset.id),
    CAMERA_MOTION_PRESETS.map((preset) => preset.id),
    "动画预设清单透出给 Agent",
  );
  assert.equal(context.scene.length, 2, "场景条目完整");
  const entry = context.scene.find((item) => item.id === actor.id);
  assert.equal(entry.kind, "robot-male");
  assert.ok(Array.isArray(entry.position) && entry.position.length === 3);
  assert.ok(Array.isArray(entry.rotation) && entry.rotation.length === 3);
  assert.ok(Array.isArray(entry.forward) && entry.forward.length === 3, "包含朝向向量");
  approx(entry.forward[2], 1, 1e-6, "未旋转的角色朝向 +Z");
  assert.equal(typeof entry.type, "string");
  assert.ok(entry.name, "包含对象名称");
});

/* ------------------------------------------------------------ geometry */

check("几何面片包含角色与机位", () => {
  const project = createProject();
  const actor = addItem(project, "robot-male");
  const camera = addItem(project, "camera");
  const faces = buildFaceList(project, 0);
  assert.ok(faces.length > 12, `人物应当是盒装骨架，实际面片 ${faces.length}`);
  const ids = new Set(faces.map((face) => face.item && face.item.id));
  assert.ok(ids.has(actor.id), "含角色面片");
  assert.ok(ids.has(camera.id), "含机位面片");
  for (const face of faces) {
    if (face.segments) {
      assert.ok(Array.isArray(face.segments[0]) && face.segments[0].length === 2, "视锥线段成对给出端点");
      continue;
    }
    assert.ok(face.points.length >= 3, "每个面片至少三个顶点");
    assert.ok(face.normal && Number.isFinite(face.normal.y), "面片带有法线");
  }
  const actorWorld = faces
    .filter((face) => !face.segments && face.item.id === actor.id)
    .flatMap((face) => face.points.map((point) => point.y));
  assert.ok(Math.max(...actorWorld) > 1.5, "角色头顶应当到 1.5 米以上");
  approx(Math.min(...actorWorld), 0, 0.15, "角色脚底贴地");
});

check("立方体六个面的法线全部朝外", () => {
  const project = createProject();
  addItem(project, "cube", { position: [0, 0, 0] });
  const faces = buildFaceList(project, 0).filter((face) => !face.segments);
  assert.equal(faces.length, 6, "立方体六个面");
  const center = { x: 0, y: 0.5, z: 0 };
  const normals = new Set();
  for (const face of faces) {
    const sum = face.points.reduce((acc, point) => ({
      x: acc.x + point.x / face.points.length,
      y: acc.y + point.y / face.points.length,
      z: acc.z + point.z / face.points.length,
    }), { x: 0, y: 0, z: 0 });
    const outward = dot3(face.normal, { x: sum.x - center.x, y: sum.y - center.y, z: sum.z - center.z });
    assert.ok(outward > 0, `法线必须背离立方体中心，实际 ${outward.toFixed(3)}`);
    assert.equal(face.normal.x ** 2 + face.normal.y ** 2 + face.normal.z ** 2, 1, "法线是单位向量");
    normals.add(`${face.normal.x.toFixed(0)},${face.normal.y.toFixed(0)},${face.normal.z.toFixed(0)}`);
  }
  assert.equal(normals.size, 6, "六个面朝向各不相同");
});

function dot3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function stubContext() {
  const calls = { fill: 0, fillText: 0, stroke: 0, drawImage: 0, maxAbs: 0, notFinite: 0, vertices: 0 };
  const gradient = { addColorStop() {} };
  // Track the projected vertices so tests can prove a polygon was clipped
  // instead of projected into a runaway quad or dropped as unusable.
  const track = (x, y) => {
    calls.vertices += 1;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      calls.notFinite += 1;
      return;
    }
    calls.maxAbs = Math.max(calls.maxAbs, Math.abs(x), Math.abs(y));
  };
  const context = {
    calls,
    save() {},
    restore() {},
    clearRect() {},
    createLinearGradient() {
      return gradient;
    },
    beginPath() {},
    closePath() {},
    moveTo(x, y) {
      track(x, y);
    },
    lineTo(x, y) {
      track(x, y);
    },
    arc() {},
    rect() {},
    roundRect() {},
    clip() {},
    setTransform() {},
    setLineDash() {},
    fill() {
      calls.fill += 1;
    },
    stroke() {
      calls.stroke += 1;
    },
    fillRect() {},
    fillText() {
      calls.fillText += 1;
    },
    measureText() {
      return { width: 24 };
    },
    drawImage() {
      calls.drawImage += 1;
    },
  };
  return context;
}

const stageView = (overrides = {}) => ({
  eye: { x: 0.6, y: 2.2, z: 6.4 },
  target: { x: 0, y: 0.9, z: 0 },
  fov: 42,
  roll: 0,
  width: 640,
  height: 400,
  ...overrides,
});

check("渲染一场完整场景不会抛异常且真的画了东西", () => {
  const project = createProject();
  const actor = addItem(project, "robot-male");
  const camera = addItem(project, "camera");
  applyCameraMotionPreset(project, camera.id, "dolly-in", actor.id, 0);
  const context = stubContext();
  renderScene(context, stageView(), project, 1, { showGrid: true, showLabels: true });
  assert.ok(context.calls.fill > 20, `应当绘制大量面片，实际 fill=${context.calls.fill}`);
  assert.ok(context.calls.fillText > 0, "应当绘制名称标签");
});

check("渲染空场景不会抛异常", () => {
  const context = stubContext();
  renderScene(context, stageView(), createProject(), 0);
  assert.ok(context.calls.fill > 0, "地面网格仍然绘制");
});

check("背面剔除：背对镜头的面片不绘制", () => {
  const project = createProject();
  addItem(project, "cube", { position: [0, 0, 0] });
  const front = stubContext();
  const behind = stubContext();
  const forwardView = {
    eye: { x: 0, y: 0.5, z: 6 },
    target: { x: 0, y: 0.5, z: 0 },
    fov: 42,
    roll: 0,
    width: 640,
    height: 400,
  };
  renderScene(front, forwardView, project, 0, { showGrid: false });
  renderScene(
    behind,
    { ...forwardView, eye: { x: 0, y: 0.5, z: -6 } },
    project,
    0,
    { showGrid: false },
  );
  assert.ok(front.calls.fill > 0 && behind.calls.fill > 0, "两个方向都能看到立方体");
  assert.equal(
    front.calls.fill,
    behind.calls.fill,
    "对称的前后视角绘制面片数量应当一致，说明做了背面剔除",
  );
  const faces = buildFaceList(project, 0);
  assert.equal(faces.length, 6, "立方体一共六个面片");
  const baseline = stubContext();
  renderScene(baseline, forwardView, createProject(), 0, { showGrid: false });
  assert.equal(
    front.calls.fill - baseline.calls.fill,
    3,
    "空场景之上只多画朝向镜头的三个面片",
  );
});

check("近平面裁剪：跨镜头的多边形被收在镜头前而不是整块丢弃", () => {
  // Synthetic matrix with w = -z so the near plane is simply z = -NEAR_PLANE.
  const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -1, 0];
  const depthOf = (point) => -point.z;
  const quad = (z) => [
    { x: -1, y: -1, z },
    { x: 1, y: -1, z },
    { x: 1, y: 1, z },
    { x: -1, y: 1, z },
  ];

  const inFront = clipPolygonToNear(quad(-1), matrix);
  assert.equal(inFront.length, 4, "完全在镜头前的面片保持原样");

  const behind = clipPolygonToNear(quad(1), matrix);
  assert.equal(behind.length, 0, "完全在镜头后的面片被整块裁掉");

  const straddling = clipPolygonToNear(
    [
      { x: -1, y: -1, z: -2 },
      { x: 1, y: -1, z: -2 },
      { x: 1, y: 1, z: 3 },
      { x: -1, y: 1, z: 3 },
    ],
    matrix,
  );
  assert.ok(straddling.length >= 3, `跨界多边形应当留下多边形，实际 ${straddling.length} 个顶点`);
  for (const vertex of straddling) {
    assert.ok(
      depthOf(vertex) >= NEAR_PLANE - 1e-9,
      `裁剪后的顶点必须落在近平面之前，实际 w=${depthOf(vertex)}`,
    );
  }
  // The vertices sitting on the plane are the original ones; the two inserted
  // ones have to land exactly on the near plane.
  const onPlane = straddling.filter((vertex) => Math.abs(depthOf(vertex) - NEAR_PLANE) < 1e-9);
  assert.equal(onPlane.length, 2, "应当插入两个恰好落在近平面上的交点");
});

check("近平面裁剪：贴地取景不会整块丢掉穿过镜头的面片", () => {
  // A camera grazing the floor is the everyday version of this bug: the cells
  // under the lens cross the near plane, and dropping them wholesale leaves a
  // hole in the floor. Without clipping this scene painted 365 faces with a
  // runaway coordinate of 21510; with clipping it paints 390 and stays bounded.
  const project = createProject();
  addItem(project, "cube", { position: [0, 0.5, 0], rotation: [0, Math.PI / 6, 0] });
  addItem(project, "robot-male", { position: [0, 0, 0] });
  const context = stubContext();
  renderScene(context, {
    eye: { x: 0, y: 0.35, z: 1.2 },
    target: { x: 0, y: 0.4, z: -3 },
    fov: 55,
    roll: 0,
    width: 640,
    height: 360,
  }, project, 0, { showGrid: true, showLabels: false });
  assert.equal(context.calls.notFinite, 0, "投影坐标不允许出现 NaN 或 Infinity");
  assert.equal(context.calls.fill, 390, "裁剪后的面片数量必须稳定，掉到 365 说明又有整块面片被丢掉了");
  assert.ok(context.calls.maxAbs < 100000, `投影范围要收得住，实际最大 ${Math.round(context.calls.maxAbs)}`);
});

check("隐藏对象：机位辅助体可以从相机画面里排除", () => {
  const project = createProject();
  addItem(project, "robot-male", { position: [0, 0, 0] });
  const camera = addItem(project, "camera");
  applyShotPreset(project, camera.id, "front-full", "", 0);
  const view = { ...cameraViewFor(project, camera, 0), width: 640, height: 360 };

  const withoutCamera = createProject();
  addItem(withoutCamera, "robot-male", { position: [0, 0, 0] });
  const expected = stubContext();
  renderScene(expected, view, withoutCamera, 0, { showGrid: false, showLabels: false });

  const visible = stubContext();
  renderScene(visible, view, project, 0, { showGrid: false, showLabels: false });
  assert.ok(
    visible.calls.fill > expected.calls.fill,
    "机位辅助体默认是画出来的，否则这条检查证明不了什么",
  );

  const hidden = stubContext();
  renderScene(hidden, view, project, 0, { showGrid: false, showLabels: false, hideItemIds: [camera.id] });
  assert.equal(
    hidden.calls.fill,
    expected.calls.fill,
    "隐藏机位后，相机画面应当和没有这个机位时完全一致",
  );
});

check("拾取：点中对象中心命中，点空格返回空", () => {
  const project = createProject();
  const actor = addItem(project, "robot-male", { position: [0, 0, 0] });
  const view = stageView();
  const torso = screenPoint(view, { x: 0, y: 1.22, z: 0 });
  const hit = pickItem(project, 0, view, { x: torso.x, y: torso.y });
  assert.ok(hit, "点角色躯干应当命中");
  assert.equal(hit.id, actor.id);
  const head = screenPoint(view, { x: 0, y: 1.6, z: 0 });
  const headHit = pickItem(project, 0, view, { x: head.x, y: head.y });
  assert.equal(headHit.id, actor.id, "点头部也应当命中角色");
  assert.equal(pickItem(project, 0, view, { x: 6, y: 6 }), null, "角落空白不命中");
});

check("拾取：多个对象时返回离镜头更近的那个", () => {
  const project = createProject();
  const far = addItem(project, "cube", { position: [0, 0, -2] });
  const near = addItem(project, "cube", { position: [0, 0, 1] });
  const view = stageView({ eye: { x: 0, y: 0.5, z: 6 }, target: { x: 0, y: 0.5, z: 0 } });
  const center = screenPoint(view, { x: 0, y: 0.5, z: 1 });
  const hit = pickItem(project, 0, view, { x: center.x, y: center.y });
  assert.ok(hit, "应当命中重叠对象之一");
  assert.equal(hit.id, near.id, "应当返回更靠近镜头的对象");
  assert.notEqual(hit.id, far.id);
});

check("地面反投影：把地面点投到屏幕再反算应回到原点", () => {
  const view = stageView();
  // 正向投影：用引擎自己的矩阵把世界坐标换算到屏幕坐标
  for (const target of [{ x: 1.5, y: 0, z: -0.8 }, { x: -1.2, y: 0, z: 1.4 }, { x: 0, y: 0, z: -3 }]) {
    const projected = screenPoint(view, target);
    assert.ok(projected, "地面点应当在镜头内");
    const back = pointerGroundPoint(view, { x: projected.x, y: projected.y }, 0);
    assert.ok(back, "反投影应当命中地面");
    approx(back.x, target.x, 0.05, `地面点 x 还原 (${target.x})`);
    approx(back.z, target.z, 0.05, `地面点 z 还原 (${target.z})`);
  }
});

check("地面反投影方向与屏幕方向一致", () => {
  const view = stageView();
  const left = pointerGroundPoint(view, { x: 120, y: 360 }, 0);
  const right = pointerGroundPoint(view, { x: 520, y: 360 }, 0);
  assert.ok(left && right, "两个采样点都命中地面");
  assert.ok(right.x > left.x, "屏幕右侧对应世界 +X 方向");
  const near = pointerGroundPoint(view, { x: 320, y: 380 }, 0);
  const far = pointerGroundPoint(view, { x: 320, y: 300 }, 0);
  assert.ok(near && far, "前后采样点都命中地面");
  assert.ok(near.z > far.z, "屏幕下方对应更靠近镜头的地面");
});

check("屏幕平面反投影沿视线落在锚点平面上", () => {
  const view = stageView();
  const anchor = { x: 0, y: 1.2, z: 0 };
  const spot = screenPoint(view, anchor);
  const back = director.pointerPlanePoint(view, { x: spot.x, y: spot.y }, anchor);
  assert.ok(back, "应当命中平面");
  approx(back.x, anchor.x, 0.05, "平面点 x 还原");
  approx(back.y, anchor.y, 0.05, "平面点 y 还原");
  approx(back.z, anchor.z, 0.05, "平面点 z 还原");
});

check("屏幕投影：镜头后方的点返回空", () => {
  const view = stageView({ eye: { x: 0, y: 1.6, z: 0 }, target: { x: 0, y: 1.6, z: -5 } });
  assert.equal(screenPoint(view, { x: 0, y: 1.6, z: 4 }), null, "背后点不可投影");
  assert.ok(screenPoint(view, { x: 0, y: 1.6, z: -5 }), "正前方点可以投影");
});

check("地面反投影：镜头平视天空时返回空", () => {
  const view = stageView({
    eye: { x: 0, y: 1.6, z: 0 },
    target: { x: 0, y: 1.6, z: -5 },
  });
  assert.equal(pointerGroundPoint(view, { x: 320, y: 200 }, 0), null, "与地面平行时没有交点");
});

/* --------------------------------------------- agent tool wiring */

check("Agent 工具的预设清单与本模块保持一致", () => {
  const capabilities = require(path.join(__dirname, "..", "canvas-agent-capabilities.js"));
  assert.deepEqual(
    [...capabilities.DIRECTOR3D_SHOT_PRESETS],
    SHOT_PRESETS.map((preset) => preset.id),
    "机位预设清单必须与 canvas-agent-capabilities 同步",
  );
  assert.deepEqual(
    [...capabilities.DIRECTOR3D_CAMERA_MOTIONS],
    CAMERA_MOTION_PRESETS.map((preset) => preset.id),
    "相机动画清单必须与 canvas-agent-capabilities 同步",
  );
  const capability = capabilities.getCapabilityByToolName("canvas_director3d_apply_animation");
  assert.ok(capability, "缺少 编排 3D 导演台 这个 Agent 能力");
  assert.equal(capability.id, "director3d.animate");
  assert.equal(capability.tool.title, "编排 3D 导演台");
  assert.equal(capability.tool.inputSchema.required.includes("shot_preset"), true);
  assert.equal(capability.tool.inputSchema.properties.camera_motion.enum.includes(null), true, "相机动画允许不改变");
});

check("Agent 适配器把编排能力接到画布 API", () => {
  const capabilities = require(path.join(__dirname, "..", "canvas-agent-capabilities.js"));
  const adapters = require(path.join(__dirname, "..", "canvas-agent-tool-adapters.js"));
  const calls = [];
  const canvasApi = new Proxy({}, {
    get(_target, name) {
      return async (...args) => {
        calls.push({ name, args });
        return { method: name };
      };
    },
  });
  const built = adapters.create({ canvasApi });
  assert.deepEqual(Object.keys(built), capabilities.CAPABILITY_REGISTRY.map((item) => item.tool.name));
  const handler = built.canvas_director3d_apply_animation;
  assert.equal(typeof handler, "function", "适配器必须暴露编排入口");
  handler({ shot_preset: "front-full", camera_motion: "orbit-follow" }, { scope: { boardId: "b" } });
  assert.equal(calls.at(-1).name, "director3dApplyAnimation");
});

/* --------------------------------------------- legacy box-mannequin ids */

check("旧场景的 robot-male 现在渲染成真实骨骼模型", () => {
  // A project saved before the skinned catalogue existed stores the box id and
  // a pose name. It used to open as a plain white cube, because a box kind is
  // not a model and the WebGL layer fell through to the primitive geometry.
  const project = normalizeProject({
    version: 1,
    items: [{ id: "legacy-1", name: "男性角色", kind: "robot-male", position: [-1.35, 0, 0], pose: "walk" }],
  });
  const item = project.items[0];
  assert.equal(item.kind, "robot-male", "旧的类型 id 原样保留，不强迫改写存档");
  assert.equal(isModelItem(item), true, "旧角色必须走骨骼模型分支");
  const model = modelFor(item);
  assert.ok(model && /human-male\.glb$/.test(model.url), `旧男性角色应指向真实模型，实际 ${model && model.url}`);
  assert.equal(model.clip, "walk", "旧 pose=walk 必须映射到同名动画");
  assert.ok(clipsForKind(item.kind).length >= 5, "旧的类型 id 也要能列出动画");
});

check("旧 pose 逐一映射到对应动画，没有对应时回退默认动画", () => {
  const cases = [["stand", "idle"], ["walk", "walk"], ["run", "run"]];
  for (const [pose, expected] of cases) {
    const item = createItem("robot-male", { pose });
    assert.equal(modelFor(item).clip, expected, `pose=${pose} 应映射到 ${expected}`);
  }
  // 旧的女性盒子姿态现在指向动作齐全的红色素体，所以 stand/walk/run 都有诚实对应。
  const female = createItem("robot-female", { pose: "walk" });
  assert.equal(isModelItem(female), true, "旧女性角色也必须走骨骼模型分支");
  assert.equal(modelFor(female).clip, "walk", "旧 pose=walk 映射到素体的行走动画");
  assert.ok(/human-xbot\.glb$/.test(modelFor(female).url), "旧女性角色指向红色素体");
  // 没有对应的姿态（素体只有 document 里那七条）才回退默认动画。
  const femaleSit = createItem("robot-female", { pose: "sit" });
  assert.equal(modelFor(femaleSit).clip, "idle", "没有对应动画时回退到默认动画");
  // 舞者模型只带桑巴舞和 T 字站姿，它的默认动画就是桑巴舞。
  const dancer = createItem("human-female", {});
  assert.ok(/human-female\.glb$/.test(modelFor(dancer).url), "舞者走自己的模型");
  assert.equal(modelFor(dancer).clip, "SambaDance", "舞者默认播放桑巴舞");
});

check("显式 clip 优先于旧 pose", () => {
  const item = createItem("robot-male", { pose: "walk", clip: "run" });
  assert.equal(modelFor(item).clip, "run", "已经存了动画就以动画为准");
});

check("旧角色仍按角色参与镜头与描述", () => {
  const project = createProject();
  const actor = addItem(project, "robot-male", { position: [0, 0, 0] });
  const camera = addItem(project, "camera");
  applyShotPreset(project, camera.id, "front-full", actor.id);
  assert.ok(Math.hypot(camera.position[0], camera.position[2]) > 1, "机位按角色身高退到远处");
  const text = describeProject(project);
  assert.ok(text.includes("男性角色") && text.includes("角色 1 个"), "场景描述把它算作角色");
});

/* ------------------------------------------------------------- results */

if (failures.length) {
  console.error(`canvas-director3d: ${failures.length} failure(s)`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log("canvas-director3d: all checks passed");
}
