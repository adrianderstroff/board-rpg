// A tiny orthographic signed-distance-field renderer used to build
// characters, creatures and props from 3D primitives, then quantize the
// shading to palette ramps and outline the result (pixel-art style).
//
// Coordinates: y is up. For characters, local +z = forward (facing),
// local +x = the character's right-hand side. The camera orbits around y:
// yaw = 0 means the model faces the viewer, yaw = +PI/2 means it faces screen-right.
import { Canvas, mix, BAYER4 } from './raster.mjs';
import { OUTLINE } from './palette.mjs';

// ---------------------------------------------------------------- math
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
export function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
export function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
export function rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
export function mmul(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
export const apply = (m, [x, y, z]) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
const applyT = (m, x, y, z) => [m[0] * x + m[3] * y + m[6] * z, m[1] * x + m[4] * y + m[7] * z, m[2] * x + m[5] * y + m[8] * z];

/** Rotation matrix that maps +y onto direction d (for oriented primitives). */
export function alignY(d) {
  const l = len3(...d); const [x, y, z] = [d[0] / l, d[1] / l, d[2] / l];
  // rotation axis = y × d
  const ax = z, az = -x; const s = Math.sqrt(ax * ax + az * az), c = y;
  if (s < 1e-6) return c > 0 ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : [1, 0, 0, 0, -1, 0, 0, 0, -1];
  const kx = ax / s, kz = az / s, t = 1 - c;
  return [t * kx * kx + c, -kz * s, t * kx * kz, kz * s, c, -kx * s, t * kx * kz, kx * s, t * kz * kz + c];
}

// ---------------------------------------------------------------- primitives
// Each returns f(x,y,z) -> distance, with f.b = [cx,cy,cz,radius] bounding sphere.
function withBound(f, b) { f.b = b; return f; }

export function sphere([cx, cy, cz], r) {
  return withBound((x, y, z) => len3(x - cx, y - cy, z - cz) - r, [cx, cy, cz, r]);
}
export function ellipsoid([cx, cy, cz], [rx, ry, rz], rot = null) {
  return withBound((x, y, z) => {
    let px = x - cx, py = y - cy, pz = z - cz;
    if (rot) [px, py, pz] = applyT(rot, px, py, pz);
    const k0 = len3(px / rx, py / ry, pz / rz);
    const k1 = len3(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
    return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
  }, [cx, cy, cz, Math.max(rx, ry, rz)]);
}
export function capsule(a, b, r) {
  const [ax, ay, az] = a, bax = b[0] - ax, bay = b[1] - ay, baz = b[2] - az;
  const bb = bax * bax + bay * bay + baz * baz || 1e-9;
  return withBound((x, y, z) => {
    const pax = x - ax, pay = y - ay, paz = z - az;
    const h = clamp((pax * bax + pay * bay + paz * baz) / bb, 0, 1);
    return len3(pax - bax * h, pay - bay * h, paz - baz * h) - r;
  }, [(ax + b[0]) / 2, (ay + b[1]) / 2, (az + b[2]) / 2, Math.sqrt(bb) / 2 + r]);
}
/** Round cone between a (radius r1) and b (radius r2). */
export function roundCone(a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  return withBound((x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const yy = pax * bax + pay * bay + paz * baz;
    const zz = yy - l2;
    const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  }, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, Math.sqrt(l2) / 2 + Math.max(r1, r2)]);
}
/** Axis-aligned (optionally rotated) rounded box. half = [hx,hy,hz]. */
export function box([cx, cy, cz], [hx, hy, hz], round = 0, rot = null) {
  return withBound((x, y, z) => {
    let px = x - cx, py = y - cy, pz = z - cz;
    if (rot) [px, py, pz] = applyT(rot, px, py, pz);
    const qx = Math.abs(px) - hx + round, qy = Math.abs(py) - hy + round, qz = Math.abs(pz) - hz + round;
    return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - round;
  }, [cx, cy, cz, len3(hx, hy, hz)]);
}
/** Vertical capped cone / frustum from y0 (radius r0) to y1 (radius r1), elliptic squash sz in z. */
export function cone([cx, cy, cz], y0, y1, r0, r1, sz = 1, rot = null) {
  const h = (y1 - y0) / 2, mid = (y0 + y1) / 2;
  return withBound((x, y, z) => {
    let px = x - cx, py = y - cy, pz = z - cz;
    if (rot) [px, py, pz] = applyT(rot, px, py, pz);
    const qx = Math.sqrt(px * px + (pz / sz) * (pz / sz)), qy = py - mid;
    const k1x = r1, k1y = h, k2x = r1 - r0, k2y = 2 * h;
    const cax = qx - Math.min(qx, qy < 0 ? r0 : r1), cay = Math.abs(qy) - h;
    const t = clamp(((k1x - qx) * k2x + (k1y - qy) * k2y) / (k2x * k2x + k2y * k2y), 0, 1);
    const cbx = qx - k1x + k2x * t, cby = qy - k1y + k2y * t;
    const s = cbx < 0 && cay < 0 ? -1 : 1;
    return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby)) * Math.min(1, sz);
  }, [cx, cy + mid, cz, Math.max(r0, r1) + Math.abs(h)]);
}
/** Torus around y axis. */
export function torus([cx, cy, cz], R, r, sz = 1) {
  return withBound((x, y, z) => {
    const px = x - cx, py = y - cy, pz = (z - cz) / sz;
    const q = Math.sqrt(px * px + pz * pz) - R;
    return Math.sqrt(q * q + py * py) - r;
  }, [cx, cy, cz, R + r]);
}
/** Custom bounded function. */
export function custom(f, bound) { return withBound(f, bound); }

// ---------------------------------------------------------------- operators
export function union(...fs) {
  let cx = 0, cy = 0, cz = 0;
  for (const f of fs) { cx += f.b[0]; cy += f.b[1]; cz += f.b[2]; }
  cx /= fs.length; cy /= fs.length; cz /= fs.length;
  let r = 0;
  for (const f of fs) r = Math.max(r, len3(f.b[0] - cx, f.b[1] - cy, f.b[2] - cz) + f.b[3]);
  return withBound((x, y, z) => { let d = Infinity; for (const f of fs) d = Math.min(d, f(x, y, z)); return d; }, [cx, cy, cz, r]);
}
export function smoothUnion(k, ...fs) {
  const u = union(...fs);
  return withBound((x, y, z) => {
    let d = fs[0](x, y, z);
    for (let i = 1; i < fs.length; i++) {
      const d2 = fs[i](x, y, z), h = clamp(0.5 + (0.5 * (d2 - d)) / k, 0, 1);
      d = d2 + (d - d2) * h - k * h * (1 - h);
    }
    return d;
  }, u.b);
}
export function intersect(a, ...bs) {
  return withBound((x, y, z) => { let d = a(x, y, z); for (const b of bs) d = Math.max(d, b(x, y, z)); return d; }, a.b);
}
export function subtract(a, ...bs) {
  return withBound((x, y, z) => { let d = a(x, y, z); for (const b of bs) d = Math.max(d, -b(x, y, z)); return d; }, a.b);
}
/** Half-space keeping points where (p - o)·n > 0 (n need not be normalized). */
export function halfSpace(o, n) {
  const l = len3(...n), nx = n[0] / l, ny = n[1] / l, nz = n[2] / l;
  return withBound((x, y, z) => -((x - o[0]) * nx + (y - o[1]) * ny + (z - o[2]) * nz), [o[0], o[1], o[2], 1e6]);
}
/** Shell of thickness t around a surface. */
export function shell(f, t) { return withBound((x, y, z) => Math.abs(f(x, y, z)) - t, f.b); }

// ---------------------------------------------------------------- model
/**
 * A model is a list of parts plus optional line/dot overlays.
 * part = { sdf, mat, group?, toLocal?(p) }
 *   mat(h) -> packed color | ramp array | { ramp, bias } | null (transparent -> treat as miss)
 *   h = { p (local point), n (world normal), lam (light -1..1) }
 * line = { a, b, color | colors[], z? }  dot = { p, color, w, h, on? (group) }
 */
export class Model {
  constructor() { this.parts = []; this.lines = []; this.dots = []; }
  add(sdf, mat, group = null, extra = {}) { this.parts.push({ sdf, mat, group, ...extra }); return this; }
  line(a, b, color, extra = {}) { this.lines.push({ a, b, color, ...extra }); return this; }
  dot(p, color, w = 1, h = 1, extra = {}) { this.dots.push({ p, color, w, h, ...extra }); return this; }
  merge(m) { this.parts.push(...m.parts); this.lines.push(...m.lines); this.dots.push(...m.dots); return this; }
  /** Rigidly transform the whole model: p' = rot*(p - pivot) + pivot + offset */
  transform(rot, pivot = [0, 0, 0], offset = [0, 0, 0]) {
    const out = new Model();
    const fwd = (p) => { const q = apply(rot, [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]]); return [q[0] + pivot[0] + offset[0], q[1] + pivot[1] + offset[1], q[2] + pivot[2] + offset[2]]; };
    const inv = (x, y, z) => { const q = applyT(rot, x - pivot[0] - offset[0], y - pivot[1] - offset[1], z - pivot[2] - offset[2]); return [q[0] + pivot[0], q[1] + pivot[1], q[2] + pivot[2]]; };
    for (const pt of this.parts) {
      const f = pt.sdf, prevLocal = pt.toLocal;
      const nb = fwd(f.b.slice(0, 3));
      const sdf = withBound((x, y, z) => { const q = inv(x, y, z); return f(q[0], q[1], q[2]); }, [...nb, f.b[3]]);
      out.parts.push({ ...pt, sdf, toLocal: (p) => { const q = inv(p[0], p[1], p[2]); return prevLocal ? prevLocal(q) : q; } });
    }
    for (const l of this.lines) out.lines.push({ ...l, a: fwd(l.a), b: fwd(l.b) });
    for (const d of this.dots) out.dots.push({ ...d, p: fwd(d.p) });
    return out;
  }
  translate(o) { return this.transform([1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0], o); }
}

// ---------------------------------------------------------------- camera
export class Camera {
  /** yaw: model facing (0 = toward viewer); pitch: looking down angle; s: pixels per unit; (ox,oy): screen pos of origin */
  constructor({ yaw = 0, pitch = 0.3, scale = 1, ox = 0, oy = 0 } = {}) {
    Object.assign(this, { yaw, pitch, scale, ox, oy });
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    // world -> camera (cx right, cy up, cz toward viewer)
    // yaw: cx = -cy*x + sy*z ; cz = sy*x + cy*z   (x = model's right side)
    const Y = [-cy, 0, sy, 0, 1, 0, sy, 0, cy];
    const Pm = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
    this.m = mmul(Pm, Y);
  }
  toCam(p) { return apply(this.m, p); }
  toWorld(c) { return applyT(this.m, c[0], c[1], c[2]); }
  project(p) { const c = this.toCam(p); return [this.ox + c[0] * this.scale, this.oy - c[1] * this.scale, c[2]]; }
}

// Light direction in camera space: from the top-left, slightly toward the viewer.
export const LIGHT = (() => { const v = [-0.55, 0.72, 0.42], l = len3(...v); return v.map((a) => a / l); })();

function resolveMat(res, lam, x, y, ditherAmt) {
  if (res == null) return null;
  if (typeof res === 'number') return { c: res, dark: res };
  const ramp = Array.isArray(res) ? res : res.ramp;
  const bias = Array.isArray(res) ? 0 : res.bias || 0;
  const n = ramp.length;
  let t = (lam + 1) / 2;
  t = t * n + bias;
  if (ditherAmt) t += ((BAYER4[y & 3][x & 3] + 0.5) / 16 - 0.5) * ditherAmt;
  const i = clamp(Math.floor(t), 0, n - 1);
  return { c: ramp[i], dark: ramp[0] };
}

/**
 * Render a model into a new Canvas.
 * opts: w,h, cam (Camera), outline (color|null), inner (depth threshold for inner lines, 0=off),
 *       dither (0..1 amount of ordered dither at band edges)
 */
export function render(model, opts) {
  const { w, h, cam, outline = OUTLINE, inner = 1.6, dither = 0, innerColor = null } = opts;
  const s = cam.scale;
  const cv = new Canvas(w, h);
  const depth = new Float32Array(w * h).fill(-Infinity);
  const pid = new Int32Array(w * h).fill(-1);
  const dark = new Uint32Array(w * h);
  const dir = cam.toWorld([0, 0, -1]);
  const parts = model.parts;
  const bcam = parts.map((p) => { const c = cam.toCam(p.sdf.b); return [c[0], c[1], c[2], p.sdf.b[3]]; });
  const Z0 = 200;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const cx = (px + 0.5 - cam.ox) / s, cyv = (cam.oy - py - 0.5) / s;
      // candidate parts by bounding sphere
      const cand = [];
      let tmin = Infinity, tmax = -Infinity;
      for (let i = 0; i < parts.length; i++) {
        const b = bcam[i];
        const dx = cx - b[0], dy = cyv - b[1], r2 = b[3] * b[3] - dx * dx - dy * dy;
        if (r2 < 0) continue;
        const r = Math.sqrt(r2);
        cand.push(i);
        tmin = Math.min(tmin, Z0 - (b[2] + r));
        tmax = Math.max(tmax, Z0 - (b[2] - r));
      }
      if (!cand.length) continue;
      const o = cam.toWorld([cx, cyv, Z0]);
      let t = Math.max(0, tmin - 0.01), hit = -1;
      for (let step = 0; step < 160 && t <= tmax + 0.01; step++) {
        const x = o[0] + dir[0] * t, y = o[1] + dir[1] * t, z = o[2] + dir[2] * t;
        let d = Infinity, bi = -1;
        for (const i of cand) { const di = parts[i].sdf(x, y, z); if (di < d) { d = di; bi = i; } }
        if (d < 0.01) {
          // material may reject (null) -> skip this part for this ray and continue
          const part = parts[bi];
          const e = 0.015;
          const f = part.sdf;
          let nx = f(x + e, y, z) - f(x - e, y, z), ny = f(x, y + e, z) - f(x, y - e, z), nz = f(x, y, z + e) - f(x, y, z - e);
          const nl = len3(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
          const nc = cam.toCam([nx, ny, nz]);
          const lam = nc[0] * LIGHT[0] + nc[1] * LIGHT[1] + nc[2] * LIGHT[2];
          const lp = part.toLocal ? part.toLocal([x, y, z]) : [x, y, z];
          const res = resolveMat(typeof part.mat === "function" ? part.mat({ p: lp, n: [nx, ny, nz], nc, lam, px, py }) : part.mat, lam, px, py, dither);
          if (res) {
            const k = py * w + px;
            cv.set(px, py, res.c);
            depth[k] = Z0 - t; pid[k] = bi; dark[k] = res.dark;
            hit = bi;
            break;
          }
          cand.splice(cand.indexOf(bi), 1);
          if (!cand.length) break;
          t += 0.05;
          continue;
        }
        t += Math.max(d * 0.85, 0.01);
      }
    }
  }
  // line overlays (depth tested)
  for (const l of model.lines) {
    const a = cam.project(l.a), b = cam.project(l.b);
    const x0 = Math.floor(a[0]), y0 = Math.floor(a[1]), x1 = Math.floor(b[0]), y1 = Math.floor(b[1]);
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    let i = 0;
    const cols = Array.isArray(l.color) ? l.color : null;
    const pts = [];
    new Canvas(1, 1).line(x0, y0, x1, y1, (x, y) => { pts.push([x, y]); return null; });
    for (const [x, y] of pts) {
      const tt = pts.length > 1 ? i / (pts.length - 1) : 0;
      const z = a[2] + (b[2] - a[2]) * tt;
      i++;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const k = y * w + x;
      if (z + (l.bias ?? 0.4) < depth[k]) continue;
      const c = cols ? cols[Math.min(cols.length - 1, Math.floor(tt * cols.length))] : typeof l.color === 'function' ? l.color(tt, x, y) : l.color;
      if (c == null) continue;
      cv.set(x, y, c); depth[k] = z; pid[k] = -2; dark[k] = l.dark ?? c;
    }
  }
  // dots (eyes etc): drawn if the surface under them is near the dot depth
  for (const d of model.dots) {
    const p = cam.project(d.p);
    const x = Math.floor(p[0]), y = Math.floor(p[1]);
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const k = y * w + x;
    if (depth[k] === -Infinity || Math.abs(depth[k] - p[2]) > (d.tol ?? 1.2)) continue;
    if (d.on != null && (pid[k] < 0 || parts[pid[k]].group !== d.on)) continue;
    for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) cv.set(x + i - (d.ax ?? 0), y + j, d.color);
  }
  // inner outlines: darken pixels bordering a nearer, different part
  if (inner > 0) {
    const out = cv.clone();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (pid[k] < 0) continue;
        const g = parts[pid[k]].group ?? pid[k];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const kk = yy * w + xx;
          if (pid[kk] === -1) continue;
          const g2 = pid[kk] === -2 ? -2 : parts[pid[kk]].group ?? pid[kk];
          if (g2 !== g && depth[kk] > depth[k] + (g2 === -2 ? 0.05 : inner)) { out.set(x, y, innerColor ?? dark[k]); break; }
        }
      }
    cv.data.set(out.data);
  }
  if (outline != null) cv.outline(outline);
  return cv;
}

/** Ramp helper: shade bias (+ = lighter). */
export const shade = (ramp, bias = 0) => (ramp && ramp.ramp ? { ramp: ramp.ramp, bias: (ramp.bias || 0) + bias } : { ramp, bias });
/** Blend a ramp color toward another color by t. */
export const tint = (ramp, c, t) => ramp.map((r) => mix(r, c, t));
