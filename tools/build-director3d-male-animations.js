"use strict";

/**
 * Rebuilds every animation clip inside human-male.glb by retargeting it onto
 * the rig that actually plays it.
 *
 * The male actor uses Mixamo's Alpha rig, but its seven clips were lifted off
 * the X Bot (Beta) rig by copying each bone's local quaternion straight across.
 * A local rotation only means anything inside the skeleton that authored it.
 * X Bot rests at identity on all 67 bones, while Alpha bakes its rest pose into
 * 32 of its 65 bones, which leaves the two rigs 127.7 degrees apart at the
 * shoulders and 179.7 apart at the thighs. The copied arms therefore swung out
 * and behind the back instead of hanging at the sides, which is the pose the
 * walk and idle clips were showing. Only the hips rotation and translation had
 * been converted into the male frame, and that is why the actor stood on the
 * right spot wearing the wrong limbs.
 *
 * This transfer keeps each bone's world-space rotation delta instead. The
 * target bone is solved so that
 *
 *     targetDelta == sourceDelta
 *
 * holds at every level of the skeleton, which is the property a retarget has
 * to preserve. Working the chain out gives
 *
 *     local = Rp^-1 * dParent^-1 * dSelf * Rp * restLocal
 *
 * with Rp the parent's resting world orientation. `restLocal` is restored as
 * the last factor, so the male rig keeps its own bind pose and only the motion
 * is transferred.
 *
 * Only rotation tracks are rewritten: translations were already correct, and
 * clip names, key counts and key times are preserved so saved scenes keep
 * playing exactly the clips they referenced.
 *
 * Usage: node tools/build-director3d-male-animations.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MODEL_DIR = path.join(ROOT, "assets", "models", "director3d");
const TARGET_FILE = path.join(MODEL_DIR, "human-male.glb");
const SOURCE_FILE = path.join(MODEL_DIR, "human-xbot.glb");
const BACKUP_FILE = path.join(ROOT, "tmp", "human-male.before-retarget.glb");

const COMPONENT_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const IDENTITY = [0, 0, 0, 1];

/* -------------------------------------------------------------- glTF input */

function parseGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a glb: " + file);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
    else if (type === 0x004e4942) bin = Buffer.from(data);
    offset += 8 + length;
  }
  if (!json || !bin) throw new Error("incomplete glb: " + file);
  return { json, bin };
}

function writeGlb(file, json, bin) {
  const jsonText = Buffer.from(JSON.stringify(json), "utf8");
  const jsonChunk = Buffer.concat([jsonText, Buffer.alloc((4 - (jsonText.length % 4)) % 4, 0x20)]);
  const binChunk = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0)]);
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(out, 20);
  const binHeader = 20 + jsonChunk.length;
  out.writeUInt32LE(binChunk.length, binHeader);
  out.writeUInt32LE(0x004e4942, binHeader + 4);
  binChunk.copy(out, binHeader + 8);
  fs.writeFileSync(file, out);
}

function readAccessor(json, bin, index) {
  const accessor = json.accessors[index];
  const view = json.bufferViews[accessor.bufferView];
  const size = COMPONENT_COUNT[accessor.type];
  const stride = view.byteStride || size * 4;
  const base = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const rows = [];
  for (let i = 0; i < accessor.count; i += 1) {
    const row = [];
    for (let c = 0; c < size; c += 1) row.push(bin.readFloatLE(base + i * stride + c * 4));
    rows.push(row);
  }
  return rows;
}

/* -------------------------------------------------------- quaternion maths */

function qMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function qConj(q) {
  return [-q[0], -q[1], -q[2], q[3]];
}

function qNorm(q) {
  const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}

function qSlerp(a, b, t) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let end = b;
  if (dot < 0) {
    dot = -dot;
    end = [-b[0], -b[1], -b[2], -b[3]];
  }
  if (dot > 0.9995) return qNorm(a.map((value, i) => value + (end[i] - value) * t));
  const theta = Math.acos(Math.min(1, Math.max(-1, dot)));
  const fromStart = Math.sin(theta * (1 - t)) / Math.sin(theta);
  const fromEnd = Math.sin(theta * t) / Math.sin(theta);
  return qNorm(a.map((value, i) => value * fromStart + end[i] * fromEnd));
}

function qRotate(q, v) {
  const x = q[0];
  const y = q[1];
  const z = q[2];
  const w = q[3];
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}

/* ------------------------------------------------------------------- rigs */

function loadRig(file) {
  const { json, bin } = parseGlb(file);
  const nodes = json.nodes || [];
  const parent = new Map();
  nodes.forEach((node, index) => {
    for (const child of node.children || []) parent.set(child, index);
  });
  const byName = new Map();
  nodes.forEach((node, index) => {
    if (node.name && !byName.has(node.name)) byName.set(node.name, index);
  });
  return { file, json, bin, nodes, parent, byName };
}

function restQuaternion(rig, index) {
  return qNorm(rig.nodes[index].rotation || IDENTITY);
}

function restVector(rig, index, key, fallback) {
  const value = rig.nodes[index][key];
  return value ? [value[0], value[1], value[2]] : fallback.slice();
}

function ancestorChain(rig, index) {
  const chain = [];
  for (let at = index; at !== undefined; at = rig.parent.get(at)) chain.push(at);
  return chain.reverse();
}

function restWorldQuaternion(rig, index) {
  return ancestorChain(rig, index).reduce((acc, at) => qMul(acc, restQuaternion(rig, at)), IDENTITY.slice());
}

/* ------------------------------------------------------------------ clips */

function clipNamed(rig, name) {
  return (rig.json.animations || []).find((clip) => clip.name === name) || null;
}

function clipDuration(rig, clip) {
  let duration = 0;
  for (const sampler of clip.samplers) {
    const accessor = rig.json.accessors[sampler.input];
    if (accessor && accessor.max && typeof accessor.max[0] === "number") {
      duration = Math.max(duration, accessor.max[0]);
    }
  }
  return duration;
}

function trackFor(rig, clip, nodeIndex, targetPath) {
  const channel = (clip.channels || []).find(
    (entry) => entry.target.node === nodeIndex && entry.target.path === targetPath,
  );
  if (!channel) return null;
  const sampler = clip.samplers[channel.sampler];
  return {
    times: readAccessor(rig.json, rig.bin, sampler.input).map((row) => row[0]),
    values: readAccessor(rig.json, rig.bin, sampler.output),
  };
}

function sampleTrack(track, time, isQuaternion) {
  if (!track || !track.times.length) return null;
  let at = 0;
  while (at < track.times.length - 1 && track.times[at + 1] < time) at += 1;
  if (at >= track.times.length - 1) return track.values[track.values.length - 1].slice();
  const span = track.times[at + 1] - track.times[at];
  if (span < 1e-9) return track.values[at].slice();
  const f = (time - track.times[at]) / span;
  const a = track.values[at];
  const b = track.values[at + 1];
  return isQuaternion ? qSlerp(a, b, f) : a.map((value, i) => value + (b[i] - value) * f);
}

function worldQuaternionsAt(rig, clip, time) {
  const out = new Array(rig.nodes.length).fill(null);
  const solve = (index) => {
    if (out[index]) return out[index];
    const track = clip ? trackFor(rig, clip, index, "rotation") : null;
    const sampled = track ? sampleTrack(track, time, true) : null;
    const local = sampled || restQuaternion(rig, index);
    const up = rig.parent.has(index) ? solve(rig.parent.get(index)) : IDENTITY.slice();
    out[index] = qMul(up, local);
    return out[index];
  };
  rig.nodes.forEach((_, index) => solve(index));
  return out;
}

/**
 * The local rotation the target bone needs so its own world delta matches the
 * source bone's. See the file header for the derivation.
 */
function retargetLocal(target, nodeIndex, deltaOf, parentRest) {
  const parentIndex = target.parent.get(nodeIndex);
  const parentName = parentIndex === undefined ? "" : target.nodes[parentIndex].name;
  const parentDelta = parentName && deltaOf(parentName) ? deltaOf(parentName) : IDENTITY.slice();
  const selfDelta = deltaOf(target.nodes[nodeIndex].name) || IDENTITY.slice();
  const swing = qMul(
    qMul(qConj(parentRest), qMul(qConj(parentDelta), selfDelta)),
    parentRest,
  );
  return qNorm(qMul(swing, restQuaternion(target, nodeIndex)));
}

/* ------------------------------------------------------ forward kinematics */

function clipLocalOf(rig, clip, time) {
  return (index) => {
    const rotation = clip ? sampleTrack(trackFor(rig, clip, index, "rotation"), time, true) : null;
    const translation = clip ? sampleTrack(trackFor(rig, clip, index, "translation"), time, false) : null;
    const scale = clip ? sampleTrack(trackFor(rig, clip, index, "scale"), time, false) : null;
    return {
      q: rotation || restQuaternion(rig, index),
      t: translation || restVector(rig, index, "translation", [0, 0, 0]),
      s: scale || restVector(rig, index, "scale", [1, 1, 1]),
    };
  };
}

function withRotationOverrides(rig, clip, time, overrides) {
  const base = clipLocalOf(rig, clip, time);
  return (index) => {
    const local = base(index);
    const replacement = overrides.get(index);
    return replacement ? { q: replacement, t: local.t, s: local.s } : local;
  };
}

function forwardKinematics(rig, localOf) {
  const count = rig.nodes.length;
  const pos = new Array(count).fill(null);
  const rot = new Array(count).fill(null);
  const scl = new Array(count).fill(null);
  const solve = (index) => {
    if (pos[index]) return;
    const local = localOf(index);
    if (!rig.parent.has(index)) {
      rot[index] = qNorm(local.q);
      pos[index] = local.t.slice();
      scl[index] = local.s.slice();
      return;
    }
    const up = rig.parent.get(index);
    solve(up);
    const offset = qRotate(rot[up], local.t);
    scl[index] = [scl[up][0] * local.s[0], scl[up][1] * local.s[1], scl[up][2] * local.s[2]];
    pos[index] = [
      pos[up][0] + offset[0] * scl[up][0],
      pos[up][1] + offset[1] * scl[up][1],
      pos[up][2] + offset[2] * scl[up][2],
    ];
    rot[index] = qMul(rot[up], qNorm(local.q));
  };
  rig.nodes.forEach((_, index) => solve(index));
  return { pos, rot };
}

/**
 * Bones whose swing is checked against the source. Each entry compares the
 * bone's direction away from its parent, which is what reads as a limb
 * pointing the wrong way on screen.
 */
const DIRECTION_PROBES = {
  "mixamorig:LeftForeArm": "mixamorig:LeftArm",
  "mixamorig:LeftHand": "mixamorig:LeftForeArm",
  "mixamorig:LeftLeg": "mixamorig:LeftUpLeg",
  "mixamorig:LeftFoot": "mixamorig:LeftLeg",
  "mixamorig:RightForeArm": "mixamorig:RightArm",
  "mixamorig:RightHand": "mixamorig:RightForeArm",
  "mixamorig:RightLeg": "mixamorig:RightUpLeg",
  "mixamorig:RightFoot": "mixamorig:RightLeg",
};

function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function limbDirection(rig, pose, bone, parent) {
  const child = rig.byName.get(bone);
  const up = rig.byName.get(parent);
  if (child === undefined || up === undefined) return null;
  return normalize([
    pose.pos[child][0] - pose.pos[up][0],
    pose.pos[child][1] - pose.pos[up][1],
    pose.pos[child][2] - pose.pos[up][2],
  ]);
}

function directionError(a, b) {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
}

/* ------------------------------------------------------------------- main */

function retargetClip(target, source, clip, donor) {
  const ownDuration = clipDuration(target, clip);
  const donorDuration = clipDuration(source, donor);
  const toSourceTime = (time) => (ownDuration > 0 ? (time / ownDuration) * donorDuration : time);

  const rebuilt = new Map();
  for (const channel of clip.channels) {
    if (channel.target.path !== "rotation") continue;
    const nodeIndex = channel.target.node;
    const name = target.nodes[nodeIndex].name;
    if (!name || !source.byName.has(name)) continue;
    const track = trackFor(target, clip, nodeIndex, "rotation");
    if (!track) continue;

    const parentIndex = target.parent.get(nodeIndex);
    const parentRest = parentIndex === undefined
      ? IDENTITY.slice()
      : restWorldQuaternion(target, parentIndex);
    const worldCache = new Map();
    const deltaAt = (sampleTime) => {
      const key = sampleTime.toFixed(6);
      if (!worldCache.has(key)) worldCache.set(key, worldQuaternionsAt(source, donor, sampleTime));
      const world = worldCache.get(key);
      return (sourceName) => {
        const sourceIndex = source.byName.get(sourceName);
        if (sourceIndex === undefined) return IDENTITY.slice();
        return qMul(qNorm(world[sourceIndex]), qConj(restWorldQuaternion(source, sourceIndex)));
      };
    };

    rebuilt.set(nodeIndex, track.times.map((time) => retargetLocal(
      target,
      nodeIndex,
      deltaAt(toSourceTime(time)),
      parentRest,
    )));
  }
  return rebuilt;
}

function measureClip(target, source, clip, donor, rebuilt) {
  const ownDuration = clipDuration(target, clip);
  const donorDuration = clipDuration(source, donor);
  let worst = 0;
  let worstBone = "";
  const steps = 8;

  for (let step = 0; step < steps; step += 1) {
    const fraction = step / steps;
    const overrides = new Map();
    for (const [nodeIndex, keys] of rebuilt) {
      const at = Math.min(keys.length - 1, Math.round(fraction * (keys.length - 1)));
      overrides.set(nodeIndex, keys[at]);
    }
    const targetPose = forwardKinematics(
      target,
      withRotationOverrides(target, clip, fraction * ownDuration, overrides),
    );
    const sourcePose = forwardKinematics(source, clipLocalOf(source, donor, fraction * donorDuration));

    for (const [bone, parent] of Object.entries(DIRECTION_PROBES)) {
      const a = limbDirection(source, sourcePose, bone, parent);
      const b = limbDirection(target, targetPose, bone, parent);
      if (!a || !b) continue;
      const error = directionError(a, b);
      if (error > worst) {
        worst = error;
        worstBone = bone.replace("mixamorig:", "");
      }
    }
  }
  return { worst, worstBone };
}

function main() {
  const target = loadRig(TARGET_FILE);
  const source = loadRig(SOURCE_FILE);

  fs.mkdirSync(path.dirname(BACKUP_FILE), { recursive: true });
  if (!fs.existsSync(BACKUP_FILE)) fs.copyFileSync(TARGET_FILE, BACKUP_FILE);

  const additions = [];

  for (const clip of target.json.animations || []) {
    const donor = clipNamed(source, clip.name);
    if (!donor) {
      console.log(clip.name.padEnd(12) + " no donor clip in source - left untouched");
      continue;
    }
    const rebuilt = retargetClip(target, source, clip, donor);
    const check = measureClip(target, source, clip, donor, rebuilt);
    console.log(
      clip.name.padEnd(12)
      + " " + String(rebuilt.size).padStart(3) + " rotation tracks"
      + "   limb-direction error " + check.worst.toFixed(1).padStart(5) + " deg"
      + (check.worstBone ? " (" + check.worstBone + ")" : ""),
    );
    for (const channel of clip.channels) {
      if (channel.target.path !== "rotation") continue;
      const keys = rebuilt.get(channel.target.node);
      if (keys) additions.push({ clip, channel, keys });
    }
  }

  // Lay every rebuilt track out after the existing buffer and re-point the
  // samplers at the fresh accessors. Existing views keep their offsets because
  // new data only ever goes on the end.
  const pad = (4 - (target.bin.length % 4)) % 4;
  const parts = [target.bin, Buffer.alloc(pad, 0)];
  let cursor = target.bin.length + pad;

  for (const entry of additions) {
    const buffer = Buffer.alloc(entry.keys.length * 4 * 4);
    entry.keys.forEach((row, rowIndex) => {
      row.forEach((value, column) => buffer.writeFloatLE(value, (rowIndex * 4 + column) * 4));
    });
    const bufferView = target.json.bufferViews.length;
    target.json.bufferViews.push({ buffer: 0, byteLength: buffer.length, byteOffset: cursor });
    const accessor = target.json.accessors.length;
    target.json.accessors.push({
      bufferView,
      componentType: 5126,
      count: entry.keys.length,
      type: "VEC4",
    });
    entry.clip.samplers[entry.channel.sampler].output = accessor;
    parts.push(buffer);
    cursor += buffer.length;
  }

  target.json.buffers[0].byteLength = cursor;
  writeGlb(TARGET_FILE, target.json, Buffer.concat(parts, cursor));
  console.log("");
  console.log("wrote " + path.relative(ROOT, TARGET_FILE) + " (" + fs.statSync(TARGET_FILE).size + " bytes)");
  console.log("backup kept at " + path.relative(ROOT, BACKUP_FILE));
}

main();
