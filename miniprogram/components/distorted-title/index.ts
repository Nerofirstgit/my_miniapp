import { createTitleSweep, TitleBounds } from "../../utils/title-sweep";
import { titleFragment, titleVertex, textureFragment } from "../../utils/title-shader";
import { createCharacterOpacityUpdater } from "../../utils/character-opacity";

type GL = WechatMiniprogram.CanvasRenderingContext.WebGLRenderingContext;
type Program = WechatMiniprogram.CanvasRenderingContext.WebGLProgram;
type Texture = WechatMiniprogram.CanvasRenderingContext.WebGLTexture;
// api-typings 5.2.3 omits the native canvas WebGL context options overload.
type TransparentCanvas = WechatMiniprogram.Canvas & {
  getContext(type: "webgl", attributes: WechatMiniprogram.CanvasRenderingContext.WebGLContextAttributes): GL | null;
};
type Host = Pick<WechatMiniprogram.Component.TrivialInstance, "setData" | "createSelectorQuery"> & {
  data: { active: boolean; hero: boolean; source: string; rendered: boolean; label: string; progress: number };
};
interface Runtime {
  host: Host;
  mounted: boolean;
  hidden: boolean;
  checkingMotion: boolean;
  failed: boolean;
  loading: boolean;
  generation: number;
  visibilityRevision: number;
  enteredAt: number;
  frame?: number;
  timer?: ReturnType<typeof setTimeout>;
  canvas?: WechatMiniprogram.Canvas;
  gl?: GL;
  program?: Program;
  sourceProgram?: Program;
  texture?: Texture;
  target?: Texture;
  buffer?: WechatMiniprogram.CanvasRenderingContext.WebGLBuffer;
  framebuffer?: WechatMiniprogram.CanvasRenderingContext.WebGLFramebuffer;
  title?: TitleBounds;
  bounds?: TitleBounds;
  viewportWidth: number;
  viewportHeight: number;
  sweep: ReturnType<typeof createTitleSweep>;
}
const instances = new WeakMap<object, Runtime>();

function updateFallback(host: Host) {
  if (host.data.hero) return;
  const characters = Array.from(host.data.label + ".").map((text, index, all) => ({
    id: index, text, accent: index === all.length - 1, opacity: .12,
  }));
  const update = createCharacterOpacityUpdater(characters.length, (index, opacity) => {
    characters[index].opacity = opacity;
  });
  update(Number.isFinite(host.data.progress) ? host.data.progress : 1);
  host.setData({ fallbackCharacters: characters });
}

function ensureRuntime(host: Host): Runtime {
  let runtime = instances.get(host);
  if (!runtime) {
    runtime = { host, mounted: false, hidden: false, checkingMotion: false, failed: false, loading: false, generation: 0, visibilityRevision: 0, enteredAt: Date.now(), viewportWidth: 1, viewportHeight: 1, sweep: createTitleSweep() };
    instances.set(host, runtime);
  }
  return runtime;
}

function pause(runtime: Runtime) {
  if (runtime.frame !== undefined && runtime.canvas) runtime.canvas.cancelAnimationFrame(runtime.frame);
  if (runtime.timer !== undefined) clearTimeout(runtime.timer);
  runtime.frame = undefined;
  runtime.timer = undefined;
}
function dispose(runtime: Runtime) {
  pause(runtime);
  runtime.generation++;
  runtime.loading = false;
  runtime.checkingMotion = false;
  const gl = runtime.gl;
  if (gl) {
    if (runtime.texture) gl.deleteTexture(runtime.texture);
    if (runtime.target) gl.deleteTexture(runtime.target);
    if (runtime.program) gl.deleteProgram(runtime.program);
    if (runtime.sourceProgram) gl.deleteProgram(runtime.sourceProgram);
    if (runtime.buffer) gl.deleteBuffer(runtime.buffer);
    if (runtime.framebuffer) gl.deleteFramebuffer(runtime.framebuffer);
  }
  runtime.texture = runtime.target = undefined;
  runtime.program = runtime.sourceProgram = undefined;
  runtime.framebuffer = undefined;
  runtime.buffer = undefined;
  runtime.gl = undefined;
  runtime.canvas = undefined;
}
function fail(runtime: Runtime, error: unknown) {
  if (!runtime.failed) console.warn("Title shader unavailable; showing text fallback", error);
  runtime.failed = true;
  dispose(runtime);
  if (runtime.mounted) runtime.host.setData({ rendered: false });
}
function canAnimate(runtime: Runtime) {
  return runtime.mounted && !runtime.hidden && !runtime.checkingMotion && !runtime.failed && runtime.host.data.active;
}
function makeProgram(gl: GL, fragment: string): Program {
  const program = gl.createProgram();
  if (!program) throw new Error("Cannot allocate title program");
  try {
    for (const [kind, source] of [[gl.VERTEX_SHADER, titleVertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error("Cannot allocate title shader");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const reason = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(reason || "Title shader compile failed");
      }
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Title shader link failed");
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  }
}
function makeTexture(gl: GL): Texture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Cannot allocate title texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}
function useProgram(runtime: Runtime, program: Program) {
  const gl = runtime.gl!;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, runtime.buffer!);
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.uniform1i(gl.getUniformLocation(program, "tDiffuse"), 0);
}
function draw(runtime: Runtime, now: number) {
  const gl = runtime.gl!;
  const program = runtime.program!;
  if (gl.isContextLost()) throw new Error("Title WebGL context lost");
  const point = runtime.sweep.update(now, runtime.title!, runtime.bounds!, runtime.viewportWidth, runtime.viewportHeight);
  useProgram(runtime, program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, runtime.target!);
  gl.uniform2f(gl.getUniformLocation(program, "uMouse"), point?.x || 0, point?.y || 0);
  gl.uniform2f(gl.getUniformLocation(program, "uVelocity"), point?.velocityX || 0, point?.velocityY || 0);
  gl.uniform2f(gl.getUniformLocation(program, "uViewportScale"), runtime.bounds!.width / runtime.viewportWidth, runtime.bounds!.height / runtime.viewportHeight);
  const title = runtime.title!;
  const bounds = runtime.bounds!;
  gl.uniform4f(gl.getUniformLocation(program, "uTitleRect"), title.left / bounds.width, title.top / bounds.height, title.width / bounds.width, title.height / bounds.height);
  gl.uniform1f(gl.getUniformLocation(program, "uRevealProgress"), Number.isFinite(runtime.host.data.progress) ? runtime.host.data.progress : 1);
  gl.uniform1f(gl.getUniformLocation(program, "uRevealGlyphCount"), runtime.host.data.hero ? 0 : Array.from(runtime.host.data.label).length + 1);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  const error = gl.getError();
  if (error !== gl.NO_ERROR) throw new Error(`Title WebGL error ${error}`);
}
function tick(runtime: Runtime) {
  pause(runtime);
  if (!canAnimate(runtime) || !runtime.target) return;
  try {
    const now = Date.now();
    const entranceDelay = runtime.host.data.hero ? Math.max(0, runtime.enteredAt + 1700 - now) : 0;
    if (entranceDelay) {
      runtime.timer = setTimeout(() => tick(runtime), entranceDelay);
      return;
    }
    draw(runtime, now);
    if (!runtime.host.data.rendered) runtime.host.setData({ rendered: true });
    const delay = runtime.sweep.nextDelay(now);
    if (delay > 0) runtime.timer = setTimeout(() => tick(runtime), delay);
    else runtime.frame = runtime.canvas!.requestAnimationFrame(() => tick(runtime));
  } catch (error) { fail(runtime, error); }
}
function initialize(runtime: Runtime) {
  if (runtime.loading || runtime.target || !canAnimate(runtime) || !runtime.host.data.source) return;
  runtime.loading = true;
  const generation = ++runtime.generation;
  runtime.host.createSelectorQuery().select(".title-host").boundingClientRect().select(".title-canvas").fields({ node: true, size: true, computedStyle: ["display"] }).exec((results) => {
    if (!runtime.mounted || generation !== runtime.generation) return;
    const title = results[0] as TitleBounds | null;
    const result = results[1] as { node?: WechatMiniprogram.Canvas; display?: string } | null;
    // The media query also applies before the first frame: do not allocate a
    // WebGL context or schedule frames for a reduced-motion fallback.
    if (!canAnimate(runtime) || result?.display === "none") {
      runtime.loading = false;
      return;
    }
    if (!title?.width || !title.height || !result?.node) {
      fail(runtime, new Error("Title canvas has no measurable bounds"));
      return;
    }
    try {
      const viewport = wx.getWindowInfo();
      runtime.viewportWidth = viewport.windowWidth;
      runtime.viewportHeight = viewport.windowHeight;
      const padX = Math.min(80, viewport.windowWidth * .15);
      const padY = 48;
      const width = title.width + 2 * padX;
      const height = title.height + 2 * padY;
      runtime.title = { left: padX, top: padY, width: title.width, height: title.height };
      runtime.bounds = { left: 0, top: 0, width, height };
      runtime.host.setData({ canvasStyle: `left:-${padX}px;top:-${padY}px;width:${width}px;height:${height}px;` });
      const canvas = result.node;
      runtime.canvas = canvas;
      const ratio = Math.min(viewport.pixelRatio || 1, runtime.host.data.hero ? 2 : 1.5);
      canvas.width = Math.ceil(width * ratio);
      canvas.height = Math.ceil(height * ratio);
      const gl = (canvas as TransparentCanvas).getContext("webgl", { alpha: true, premultipliedAlpha: true });
      if (!gl) throw new Error("WebGL is not supported");
      // A shader's zero alpha cannot expose the atmosphere through an opaque
      // drawing buffer. Keep the text fallback if the runtime cannot provide it.
      if (!gl.getContextAttributes()?.alpha) throw new Error("Title canvas requires a transparent WebGL context");
      runtime.gl = gl;
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.viewport(0, 0, canvas.width, canvas.height);
      runtime.program = makeProgram(gl, titleFragment);
      runtime.sourceProgram = makeProgram(gl, textureFragment);
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error("Cannot allocate title quad");
      runtime.buffer = buffer;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const image = canvas.createImage();
      image.onerror = () => { if (generation === runtime.generation) fail(runtime, new Error("Title image could not load")); };
      image.onload = () => {
        if (!runtime.mounted || generation !== runtime.generation) return;
        if (!canAnimate(runtime)) { dispose(runtime); return; }
        try {
          // Match the original shader's premultiplied pigment and alpha.
          runtime.texture = makeTexture(gl);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          runtime.target = makeTexture(gl);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          const framebuffer = gl.createFramebuffer();
          if (!framebuffer) throw new Error("Cannot allocate title framebuffer");
          runtime.framebuffer = framebuffer;
          gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, runtime.target, 0);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Title framebuffer incomplete");
          // Transparent padding prevents the shader from smearing clamped image edges.
          useProgram(runtime, runtime.sourceProgram!);
          gl.bindTexture(gl.TEXTURE_2D, runtime.texture);
          gl.uniform4f(gl.getUniformLocation(runtime.sourceProgram!, "uRect"), padX / width, padY / height, title.width / width, title.height / height);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          runtime.loading = false;
          runtime.sweep.reset();
          tick(runtime);
        } catch (error) { fail(runtime, error); }
      };
      image.src = runtime.host.data.source;
    } catch (error) { fail(runtime, error); }
  });
}
function synchronize(host: Host) {
  const runtime = instances.get(host);
  if (!runtime) return;
  if (canAnimate(runtime)) {
    if (runtime.target) tick(runtime);
    else initialize(runtime);
  } else {
    pause(runtime);
    // Render the neutral state once, with no new frames scheduled.
    if (runtime.target && !runtime.failed) {
      try {
        runtime.sweep.reset(86400);
        draw(runtime, Date.now());
        runtime.sweep.reset();
      } catch (error) { fail(runtime, error); }
    }
  }
}
Component({
  properties: {
    source: { type: String, value: "" },
    label: { type: String, value: "" },
    hero: { type: Boolean, value: false },
    active: { type: Boolean, value: false },
    progress: { type: Number, value: 1 },
  },
  data: { rendered: false, heroImageFailed: false, canvasStyle: "", fallbackCharacters: [] as Array<{ id: number; text: string; accent: boolean; opacity: number }> },
  observers: {
    active() { synchronize(this); },
    "progress, label"() {
      updateFallback(this);
      const runtime = instances.get(this);
      // Scroll updates must also repaint during the five-second sweep rest.
      // Keep its existing timer/frame and phase; hidden/paused titles redraw
      // with the latest progress when synchronize resumes them.
      if (!runtime || !canAnimate(runtime) || !runtime.target || !this.data.rendered) return;
      try { draw(runtime, Date.now()); }
      catch (error) { fail(runtime, error); }
    },
    "source, hero"() {
      this.setData({ heroImageFailed: false });
      updateFallback(this);
      const runtime = instances.get(this);
      if (!runtime) return;
      dispose(runtime);
      runtime.failed = false;
      this.setData({ rendered: false });
      synchronize(this);
    },
  },
  lifetimes: {
    attached() {
      ensureRuntime(this);
    },
    ready() {
      updateFallback(this);
      ensureRuntime(this).mounted = true;
      synchronize(this);
    },
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
      const visibilityRevision = ++runtime.visibilityRevision;
      if (!runtime.target) { runtime.hidden = false; synchronize(this); return; }
      // Recheck a preference changed while the app was in the background.
      runtime.hidden = false;
      runtime.checkingMotion = true;
      pause(runtime);
      const generation = runtime.generation;
      this.createSelectorQuery().select(".title-canvas").fields({ computedStyle: ["display"] }).exec((results) => {
        if (!runtime.mounted || generation !== runtime.generation || visibilityRevision !== runtime.visibilityRevision) return;
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
    heroImageError() { this.setData({ heroImageFailed: true }); },
    canvasError() {
      const runtime = instances.get(this);
      if (runtime) fail(runtime, new Error("Native title canvas failed"));
    },
  },
});
