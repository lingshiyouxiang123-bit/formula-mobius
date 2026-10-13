"use client";

import { useEffect, useRef } from "react";
import type { GameState } from "@/game/types";

const VERTEX_SHADER = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

// Artist reference: https://x.com/YoheiNishitsuji
// The sample count and render resolution are capped so the HUD stays responsive.
const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uTime;
uniform float uMotion;
uniform vec3 uConditions;

void main() {
  vec2 r = uResolution;
  float t = uTime * uMotion;
  float z = 0.0;
  float d = 0.0;
  float h = 0.0;
  vec3 energy = vec3(0.0);
  vec2 fc = gl_FragCoord.xy - 0.5 * r;
  vec3 ray = normalize(vec3(fc, r.y * 0.5));

  for (int step = 0; step < 64; step++) {
    vec3 p = z * ray;
    p.z += t;
    p.xz += uPointer * vec2(0.24, 0.13);
    h = 0.8;
    float f = 1.0472;
    for (int octave = 0; octave < 8; octave++) {
      h += abs(dot(sin(p.xz * f * 0.4 + t * f + cos(p.zx * f * 0.6)), vec2(0.4))) / f;
      f *= 2.0;
    }
    d = 0.01 + abs(p.y - h * 2.0 + p.x * 0.7) * 0.2;
    energy += (vec3(0.05, 0.10, 0.15) + h * vec3(0.10)) / d * 0.002;
    z += d;
  }

  energy *= energy;
  energy /= 1.0 + energy;
  float redEdge = smoothstep(0.34, 0.92, energy.r + abs(fc.x / r.x) * 0.12);
  float heatPulse = 0.5 + 0.5 * sin(uTime * 0.85);
  float redMix = clamp(0.16 + uConditions.z * 0.36 + heatPulse * 0.13 - uConditions.x * 0.17, 0.02, 0.75);
  vec3 coldSignal = energy * vec3(0.26, 0.92, 1.25) * 1.8;
  vec3 hotSignal = energy * vec3(1.12, 0.28, 0.20) * 1.8;
  vec3 color = mix(coldSignal, hotSignal, redMix);
  color += vec3(0.95, 0.065, 0.025) * redEdge * (0.28 + uConditions.z * 0.22);
  color = mix(color, color * vec3(1.0, 0.73, 0.18), uConditions.y * 0.68);
  float horizon = exp(-abs(fc.y / r.y + 0.08) * 34.0);
  color += mix(vec3(0.04, 0.36, 0.52), vec3(0.72, 0.035, 0.018), step(0.0, fc.x)) * horizon * 0.28;
  float vignette = 1.0 - smoothstep(0.28, 0.82, length(fc / r.y));
  gl_FragColor = vec4(color * vignette, clamp(vignette * 0.9, 0.0, 0.9));
}`;

const TUNNEL_FRAGMENT_SHADER = `
precision highp float;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uTime;
uniform float uMotion;
uniform float uPoster;

mat3 rotate3D(float angle, vec3 axis) {
  axis = normalize(axis);
  float s = sin(angle);
  float c = cos(angle);
  float oc = 1.0 - c;
  return mat3(
    oc * axis.x * axis.x + c, oc * axis.x * axis.y - axis.z * s, oc * axis.z * axis.x + axis.y * s,
    oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c, oc * axis.y * axis.z - axis.x * s,
    oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s, oc * axis.z * axis.z + c
  );
}

void main() {
  vec2 r = uResolution;
  vec2 uv = (gl_FragCoord.xy - 0.5 * r) / r.y;
  float t = uTime * uMotion * 4.2;
  float column = floor(gl_FragCoord.x / r.x * 7.0);
  float slice = sin(column * 1.7 + t * .16) * .035;
  uv.y += slice * uPoster;
  vec3 d = normalize(vec3(uv.yx + uPointer * 0.12, 0.82));
  d = rotate3D(0.5, vec3(2.0, 2.0, cos(t * 0.5))) * d;
  vec3 q = vec3(0.0, -1.0, -1.0);
  vec3 color = vec3(0.0);
  float radius = 1.0;
  float travel = 0.015;

  for (int step = 0; step < 52; step++) {
    float fi = float(step) + 1.0;
    travel += fi / 3000.0;
    q += d * travel * radius * 0.17;
    vec3 p = q;
    radius = max(length(p), 0.001);
    p = vec3(log2(radius) - t * 0.5, radius - p.z / radius, atan(p.y, p.x));
    p.y -= 1.0;
    float field = p.y;
    float scale = 4.0;
    for (int octave = 0; octave < 8; octave++) {
      field += 0.1 - abs(dot(cos(p * scale), sin(p.zxy * scale))) / scale;
      scale *= 2.0;
    }
    float glow = 0.0035 / max(abs(field), 0.006);
    float side = 0.5 + 0.5 * sin(p.z * 2.0 + p.x * 0.35);
    color += mix(vec3(0.86, 0.025, 0.012), vec3(0.025, 0.42, 0.68), side) * glow;
  }

  color = color / (1.0 + color);
  if (uPoster > .5) {
    float contour = pow(.5 + .5 * sin(length(uv * vec2(.88,1.0)) * 105.0 + color.b * 11.0 - t * .22), 16.0);
    float palette = smoothstep(-.24,.24,uv.y + .14 * sin(uv.x * 2.4 + t * .15));
    vec3 baseInk = mix(vec3(.06,.13,.67),vec3(.82,.035,.075),palette);
    vec3 lineInk = mix(vec3(.12,.29,1.0),vec3(1.0,.12,.16),palette);
    vec3 ink = baseInk * (color.b * 1.15 + color.r * .65);
    ink += lineInk * contour * (.23 + color.b * .5 + color.r * .25);
    float printShift = .78 + .22 * sin(column * 1.7 + t * .09);
    color = mix(color, ink * printShift, .9);
  }
  float vignette = 1.0 - smoothstep(0.32, 0.86, length(uv));
  gl_FragColor = vec4(color * vignette * 1.35, clamp(vignette * 0.94, 0.0, 0.94));
}`;

// Original analytic print field: no ray march, textures or external shader code.
// Shared poster rhythm for workspaces, kept quieter than the landing hero.
const PRINT_FRAGMENT_SHADER = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uMotion;
void main() {
  vec2 uv = (gl_FragCoord.xy - .5 * uResolution) / uResolution.y;
  float t = uTime * uMotion;
  vec2 left = uv - vec2(-.65 + .08 * sin(t), .24);
  vec2 right = uv - vec2(.65 + .06 * cos(t * .8), -.22);
  float a = length(left * vec2(.72, 1.0));
  float b = length(right * vec2(.86, 1.0));
  float red = pow(.5 + .5 * cos((uv.x + uv.y * .28) * 110.0 + sin(uv.y * 4.0 + t) * 2.0), 14.0) * exp(-a * 1.7);
  float blue = pow(.5 + .5 * cos((uv.x - uv.y * .28) * 105.0 + sin(uv.y * 4.0 - t) * 2.0), 14.0) * exp(-b * 1.65);
  float edge = smoothstep(.08, .8, abs(uv.x));
  vec3 ink = vec3(.94,.045,.09) * red + vec3(.12,.24,.94) * blue;
  ink *= .3 + .7 * edge;
  gl_FragColor = vec4(ink, .7);
}`;

type RacePhase = GameState["phase"] | "garage";

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function ShaderRaceBackdrop({ phase, variant = "field", weather, yellow = false, heat = 0, interactive = true, poster = false }: { phase: RacePhase; variant?: "field" | "tunnel" | "print"; weather?: GameState["weather"]; yellow?: boolean; heat?: number; interactive?: boolean; poster?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const conditionsRef = useRef<[number, number, number]>([0, 0, 0]);
  const redrawRef = useRef<() => void>(() => {});
  useEffect(() => {
    conditionsRef.current = [weather === "heavy_rain" || weather === "light_rain" ? 1 : 0, yellow ? 1 : 0, Math.max(0, Math.min(1, heat / 6))];
    redrawRef.current();
  }, [weather, yellow, heat]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: "low-power",
      premultipliedAlpha: true,
    });
    if (!gl) return;

    const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, variant === "tunnel" ? TUNNEL_FRAGMENT_SHADER : variant === "print" ? PRINT_FRAGMENT_SHADER : FRAGMENT_SHADER);
    if (!vertex || !fragment) {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      return;
    }
    const program = gl.createProgram();
    if (!program) { gl.deleteShader(vertex); gl.deleteShader(fragment); return; }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
      return;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const resolution = gl.getUniformLocation(program, "uResolution");
    const pointer = gl.getUniformLocation(program, "uPointer");
    const time = gl.getUniformLocation(program, "uTime");
    const motion = gl.getUniformLocation(program, "uMotion");
    const conditions = gl.getUniformLocation(program, "uConditions");
    const posterMode = gl.getUniformLocation(program, "uPoster");
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionPreference.matches;
    let inView = true;
    const phaseSpeed: Record<RacePhase, number> = {
      garage: 0.055,
      practice: 0.06,
      setup: 0.065,
      qualifying: 0.085,
      preRace: 0.065,
      strategy: 0.075,
      movement: 0.13,
      roundEnd: 0.07,
      redFlag: 0.02,
      finished: 0.025,
    };
    let frame = 0;
    let lastFrame = -40;
    let targetX = 0;
    let targetY = 0;
    let pointerX = 0;
    let pointerY = 0;

    const updatePointer = (event: PointerEvent) => {
      if (!inView || reducedMotion) return;
      const rect = canvas.getBoundingClientRect();
      targetX = Math.max(-.5, Math.min(.5, (event.clientX - rect.left) / Math.max(1, rect.width) - .5));
      targetY = Math.max(-.5, Math.min(.5, .5 - (event.clientY - rect.top) / Math.max(1, rect.height)));
    };
    const render = (now: number) => {
      if (!inView || document.hidden) return;
      if (now - lastFrame >= 32 || reducedMotion) {
        lastFrame = now;
        pointerX += (targetX - pointerX) * 0.055;
        pointerY += (targetY - pointerY) * 0.055;
        gl.uniform2f(resolution, canvas.width, canvas.height);
        gl.uniform2f(pointer, pointerX, pointerY);
        gl.uniform1f(time, reducedMotion ? 0 : now * 0.001);
        gl.uniform1f(motion, phaseSpeed[phase]);
        gl.uniform1f(posterMode, poster ? 1 : 0);
        gl.uniform3f(conditions, ...conditionsRef.current);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      if (!reducedMotion) frame = window.requestAnimationFrame(render);
    };

    const requestDraw = () => {
      window.cancelAnimationFrame(frame);
      lastFrame = -40;
      if (inView && !document.hidden) frame = window.requestAnimationFrame(render);
    };
    redrawRef.current = requestDraw;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, rect.width < 720 ? .55 : .82);
      const width = Math.max(1, Math.round(rect.width * scale));
      const height = Math.max(1, Math.round(rect.height * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width; canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
      requestDraw();
    };
    const updateMotionPreference = () => {
      reducedMotion = motionPreference.matches;
      if (reducedMotion) targetX = targetY = pointerX = pointerY = 0;
      requestDraw();
    };
    const sizeObserver = new ResizeObserver(resize);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      requestDraw();
    });

    resize();
    sizeObserver.observe(canvas);
    visibilityObserver.observe(canvas);
    window.addEventListener("resize", resize);
    if (interactive) window.addEventListener("pointermove", updatePointer, { passive: true });
    document.addEventListener("visibilitychange", requestDraw);
    motionPreference.addEventListener("change", updateMotionPreference);
    return () => {
      redrawRef.current = () => {};
      window.cancelAnimationFrame(frame);
      sizeObserver.disconnect();
      visibilityObserver.disconnect();
      window.removeEventListener("resize", resize);
      if (interactive) window.removeEventListener("pointermove", updatePointer);
      document.removeEventListener("visibilitychange", requestDraw);
      motionPreference.removeEventListener("change", updateMotionPreference);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, [phase, variant, interactive, poster]);

  return <canvas ref={canvasRef} className={`generative-speed-field shader-race-field shader-${variant}`} />;
}
