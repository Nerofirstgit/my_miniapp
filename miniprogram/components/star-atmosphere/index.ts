import { atmosphereColor, atmosphereProjection, atmosphereUniforms, atmosphereView, createAtmosphereModel, createStarTexture } from "../../utils/atmosphere-model";
import { fogVertex, noiseFragment, starsFragment, starsVertex } from "../../utils/atmosphere-shaders";

type GL = WechatMiniprogram.CanvasRenderingContext.WebGLRenderingContext;
type Program = WechatMiniprogram.CanvasRenderingContext.WebGLProgram;
type Buffer = WechatMiniprogram.CanvasRenderingContext.WebGLBuffer;
type Texture = WechatMiniprogram.CanvasRenderingContext.WebGLTexture;
type Location = WechatMiniprogram.CanvasRenderingContext.WebGLUniformLocation;
type Host = Pick<WechatMiniprogram.Component.TrivialInstance, "setData" | "createSelectorQuery"> & {
  data: { active: boolean; rendered: boolean };
};
interface Pass {
  program: Program;
  uniforms: Record<string, Location | null>;
  attributes: { location: number; buffer: Buffer; size: number }[];
}
interface Runtime {
  host: Host;
  mounted: boolean;
  hidden: boolean;
  checkingMotion: boolean;
  failed: boolean;
  warned: boolean;
  loading: boolean;
  generation: number;
  visibilityRevision: number;
  elapsed: number;
  previousTime?: number;
  lastDraw: number;
  frame?: number;
  canvas?: WechatMiniprogram.Canvas;
  gl?: GL;
  fog?: Pass;
  stars?: Pass;
  texture?: Texture;
  programs: Program[];
  buffers: Buffer[];
  model: ReturnType<typeof createAtmosphereModel>;
}
const instances = new WeakMap<object, Runtime>();
const starVertexPrefix = "precision highp float;\nattribute vec3 position;\nuniform mat4 modelViewMatrix;\nuniform mat4 projectionMatrix;\n";
const interval = 1000 / 30;

function ensureRuntime(host: Host) {
  let runtime = instances.get(host);
  if (!runtime) {
    runtime = { host, mounted: false, hidden: false, checkingMotion: false, failed: false, warned: false, loading: false, generation: 0, visibilityRevision: 0, elapsed: 0, lastDraw: -interval, programs: [], buffers: [], model: createAtmosphereModel() };
    instances.set(host, runtime);
  }
  return runtime;
}
function pause(runtime: Runtime) {
  if (runtime.frame !== undefined && runtime.canvas) runtime.canvas.cancelAnimationFrame(runtime.frame);
  runtime.frame = undefined;
  runtime.previousTime = undefined;
}
function dispose(runtime: Runtime) {
  pause(runtime);
  runtime.generation++;
  runtime.loading = false;
  runtime.checkingMotion = false;
  const gl = runtime.gl;
  if (gl) {
    if (runtime.texture) gl.deleteTexture(runtime.texture);
    runtime.programs.forEach((program) => gl.deleteProgram(program));
    runtime.buffers.forEach((buffer) => gl.deleteBuffer(buffer));
  }
  runtime.programs = [];
  runtime.buffers = [];
  runtime.texture = undefined;
  runtime.stars = runtime.fog = undefined;
  runtime.gl = undefined;
  runtime.canvas = undefined;
}
function fail(runtime: Runtime, error: unknown) {
  if (!runtime.warned) console.warn("Star atmosphere unavailable; showing static fallback", error);
  runtime.warned = true;
  runtime.failed = true;
  dispose(runtime);
  if (runtime.mounted) runtime.host.setData({ rendered: false });
}
function canAnimate(runtime: Runtime) {
  return runtime.mounted && !runtime.hidden && !runtime.checkingMotion && !runtime.failed && runtime.host.data.active;
}
function makeProgram(runtime: Runtime, vertex: string, fragment: string) {
  const gl = runtime.gl!;
  const program = gl.createProgram();
  if (!program) throw new Error("Cannot allocate atmosphere program");
  runtime.programs.push(program);
  for (const [kind, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
    const shader = gl.createShader(kind);
    if (!shader) throw new Error("Cannot allocate atmosphere shader");
    try {
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "Atmosphere shader compile failed");
      gl.attachShader(program, shader);
    } finally { gl.deleteShader(shader); }
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Atmosphere shader link failed");
  return program;
}
function makePass(runtime: Runtime, vertex: string, fragment: string, uniforms: string[], attributes: { name: string; size: number; values: Float32Array }[]): Pass {
  const gl = runtime.gl!;
  const program = makeProgram(runtime, vertex, fragment);
  const locations: Pass["uniforms"] = {};
  uniforms.forEach((name) => { locations[name] = gl.getUniformLocation(program, name); });
  return { program, uniforms: locations, attributes: attributes.map(({ name, size, values }) => {
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Cannot allocate atmosphere buffer");
    runtime.buffers.push(buffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
    return { buffer, size, location: gl.getAttribLocation(program, name) };
  }) };
}
function usePass(gl: GL, pass: Pass) {
  gl.useProgram(pass.program);
  pass.attributes.forEach(({ location, buffer, size }) => {
    if (location < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  });
}
function setup(runtime: Runtime, width: number, height: number) {
  const gl = runtime.gl!;
  gl.viewport(0, 0, width, height);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  runtime.fog = makePass(runtime, fogVertex, noiseFragment,
    ["uColor", "uNoiseOffsetX", "uNoiseOffsetY", "uNoiseScale", "uTime", "uDenoise"],
    [{ name: "aPosition", size: 2, values: new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]) }]);
  const fog = runtime.fog;
  usePass(gl, fog);
  gl.uniform3f(fog.uniforms.uColor, ...atmosphereColor);
  gl.uniform1f(fog.uniforms.uNoiseOffsetX, 0);
  gl.uniform1f(fog.uniforms.uNoiseOffsetY, 2.1);
  gl.uniform1f(fog.uniforms.uNoiseScale, 1.5);
  gl.uniform1f(fog.uniforms.uDenoise, 0);
  runtime.stars = makePass(runtime, starVertexPrefix + starsVertex, starsFragment,
    ["uTime", "uSize", "uMaxSize", "uScrollOffset", "uMouseX", "uMouseY", "uMouseInfluence", "uZDepth", "uTexture", "modelViewMatrix", "projectionMatrix"],
    [{ name: "position", size: 3, values: runtime.model.positions }, { name: "randomTiming", size: 1, values: runtime.model.timings }, { name: "randomMovement", size: 2, values: runtime.model.movements }]);
  const stars = runtime.stars;
  usePass(gl, stars);
  gl.uniformMatrix4fv(stars.uniforms.modelViewMatrix, false, atmosphereView);
  gl.uniformMatrix4fv(stars.uniforms.projectionMatrix, false, atmosphereProjection(width, height));
  gl.uniform1f(stars.uniforms.uSize, .25);
  gl.uniform1f(stars.uniforms.uMaxSize, 16);
  gl.uniform1f(stars.uniforms.uMouseX, 0);
  gl.uniform1f(stars.uniforms.uMouseY, 0);
  gl.uniform1f(stars.uniforms.uMouseInfluence, .085);
  gl.uniform1f(stars.uniforms.uZDepth, 100);
  gl.uniform1i(stars.uniforms.uTexture, 0);
  const texture = gl.createTexture();
  if (!texture) throw new Error("Cannot allocate atmosphere texture");
  runtime.texture = texture;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 32, 32, 0, gl.RGBA, gl.UNSIGNED_BYTE, createStarTexture());
}
function draw(runtime: Runtime) {
  const gl = runtime.gl!, fog = runtime.fog!, stars = runtime.stars!;
  if (gl.isContextLost()) throw new Error("Atmosphere WebGL context lost");
  const uniforms = atmosphereUniforms(runtime.elapsed / 1000);
  // The opaque full-screen noise pass replaces the previous frame completely.
  gl.disable(gl.BLEND);
  usePass(gl, fog);
  gl.uniform1f(fog.uniforms.uTime, uniforms.fogTime);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  usePass(gl, stars);
  gl.enable(gl.BLEND);
  // Match Three's non-premultiplied AdditiveBlending, keeping canvas opaque.
  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ZERO, gl.ONE);
  gl.uniform1f(stars.uniforms.uTime, uniforms.time);
  gl.uniform1f(stars.uniforms.uScrollOffset, uniforms.scrollOffset);
  gl.drawArrays(gl.POINTS, 0, runtime.model.timings.length);
  const error = gl.getError();
  if (error !== gl.NO_ERROR) throw new Error(`Atmosphere WebGL error ${error}`);
}
function tick(runtime: Runtime) {
  runtime.frame = undefined;
  if (!canAnimate(runtime) || !runtime.stars) return;
  try {
    const now = Date.now();
    if (runtime.previousTime !== undefined) runtime.elapsed += Math.max(0, now - runtime.previousTime);
    runtime.previousTime = now;
    const delta = runtime.elapsed - runtime.lastDraw;
    if (delta >= interval || !runtime.host.data.rendered) {
      draw(runtime);
      runtime.lastDraw = runtime.elapsed - Math.max(0, delta % interval);
      if (!runtime.host.data.rendered) runtime.host.setData({ rendered: true });
    }
    runtime.frame = runtime.canvas!.requestAnimationFrame(() => tick(runtime));
  } catch (error) { fail(runtime, error); }
}
function initialize(runtime: Runtime) {
  if (runtime.loading || runtime.stars || !canAnimate(runtime)) return;
  runtime.loading = true;
  const generation = ++runtime.generation;
  runtime.host.createSelectorQuery().select(".atmosphere-canvas").fields({ node: true, size: true, computedStyle: ["display"] }).exec((results) => {
    if (!runtime.mounted || generation !== runtime.generation) return;
    runtime.loading = false;
    const result = results[0] as { node?: WechatMiniprogram.Canvas; width?: number; height?: number; display?: string } | null;
    // Respect reduced motion before allocating any GPU resources.
    if (!canAnimate(runtime) || result?.display === "none") return;
    if (!result?.node || !result.width || !result.height) { fail(runtime, new Error("Atmosphere canvas has no measurable bounds")); return; }
    try {
      const canvas = result.node;
      runtime.canvas = canvas;
      // Match the website's mobile DPR limit; CSS still fills the host.
      canvas.width = Math.max(1, Math.round(result.width));
      canvas.height = Math.max(1, Math.round(result.height));
      const gl = canvas.getContext("webgl");
      if (!gl) throw new Error("WebGL is not supported");
      runtime.gl = gl;
      setup(runtime, canvas.width, canvas.height);
      tick(runtime);
    } catch (error) { fail(runtime, error); }
  });
}
function synchronize(host: Host) {
  const runtime = instances.get(host);
  if (!runtime) return;
  if (!canAnimate(runtime)) { pause(runtime); return; }
  if (!runtime.stars) initialize(runtime);
  else if (runtime.frame === undefined) tick(runtime);
}
Component({
  properties: { active: { type: Boolean, value: false } },
  data: { rendered: false },
  observers: { active() { synchronize(this); } },
  lifetimes: {
    attached() { ensureRuntime(this); },
    ready() { ensureRuntime(this).mounted = true; synchronize(this); },
    detached() {
      const runtime = instances.get(this);
      if (runtime) { runtime.mounted = false; dispose(runtime); }
      instances.delete(this);
    },
  },
  pageLifetimes: {
    show() {
      const runtime = instances.get(this);
      if (!runtime) return;
      const revision = ++runtime.visibilityRevision;
      runtime.hidden = false;
      if (!runtime.stars) { synchronize(this); return; }
      runtime.checkingMotion = true;
      pause(runtime);
      const generation = runtime.generation;
      this.createSelectorQuery().select(".atmosphere-canvas").fields({ computedStyle: ["display"] }).exec((results) => {
        if (!runtime.mounted || generation !== runtime.generation || revision !== runtime.visibilityRevision) return;
        runtime.checkingMotion = false;
        if ((results[0] as { display?: string } | null)?.display === "none") {
          dispose(runtime);
          this.setData({ rendered: false });
          return;
        }
        synchronize(this);
      });
    },
    hide() {
      const runtime = instances.get(this);
      if (runtime) { runtime.visibilityRevision++; runtime.hidden = true; pause(runtime); }
    },
    resize() {
      const runtime = instances.get(this);
      if (!runtime) return;
      dispose(runtime);
      runtime.failed = false;
      this.setData({ rendered: false });
      wx.nextTick(() => synchronize(this));
    },
  },
  methods: {
    canvasError() {
      const runtime = instances.get(this);
      if (runtime) fail(runtime, new Error("Native atmosphere canvas failed"));
    },
  },
});
