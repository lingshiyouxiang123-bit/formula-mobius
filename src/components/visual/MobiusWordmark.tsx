"use client";

import { useEffect, useRef } from "react";

const VERTEX = `
attribute vec2 aPosition;
varying vec2 vUv;
void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}
`;

// Six texture reads: lettering, two split channels and three overprint echoes.
const FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uLettering;
uniform vec2 uTexel;
uniform float uTime;
uniform float uPulse;
uniform float uMotion;
void main(){
  vec2 uv=vUv;
  float phase=fract(uTime/6.4);
  float burst=smoothstep(.68,.70,phase)*(1.-smoothstep(.86,.89,phase))*uMotion;
  float kick=max(burst,uPulse);
  // Keep the central axis fixed. Compression is symmetric, never italic.
  float fold=sin(uv.x*3.14159265);
  float squeeze=(.10+.04*sin(uTime*.42))*fold*fold*uMotion;
  uv.y=.5+(uv.y-.5)*(1.+squeeze);
  float beat=floor(uTime*8.);
  float tear=step(.72,sin(uv.y*91.+beat*1.6));
  uv.x+=tear*sin(beat*2.1)*kick*.007;
  vec2 separation=vec2(uTexel.x*(3.+15.*tear)*kick,0.);
  vec4 face=texture2D(uLettering,uv);
  vec4 red=texture2D(uLettering,uv+separation);
  vec4 blue=texture2D(uLettering,uv-separation);
  float drift=sin(uTime*.38)*.003*uMotion;
  float echoA=texture2D(uLettering,uv+vec2(0.,.035+drift)).a;
  float echoB=texture2D(uLettering,uv+vec2(0.,.074+drift*1.5)).a;
  float echoC=texture2D(uLettering,uv+vec2(0.,.119+drift*2.)).a;
  float faceAlpha=max(face.a,max(red.a,blue.a)*kick*.7);
  vec3 split=vec3(red.r,face.g,blue.b);
  vec3 printInk=mix(vec3(.27,.43,1.),vec3(1.,.16,.23),step(0.,sin(uv.y*12.+uTime*.6)));
  vec3 front=mix(face.rgb,split,kick*.85);
  front=mix(front,printInk,kick*tear*.48);
  float space=1.-faceAlpha;
  float a=echoA*.20*space;
  float b=echoB*.12*space;
  float c=echoC*.06*space;
  float total=faceAlpha+a+b+c;
  vec3 color=(front*faceAlpha+vec3(.92,.08,.16)*a+vec3(.16,.34,1.)*b+vec3(.58,.24,.8)*c)/max(total,.001);
  float alpha=clamp(total,0.,1.);
  gl_FragColor=vec4(color,alpha);
}
`;

export function MobiusWordmark() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const replayRef = useRef<() => void>(() => {});

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: false, premultipliedAlpha: false, powerPreference: "low-power" });
    if (!gl) return;
    const shaders: WebGLShader[] = [];
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) {
      shaders.forEach(shader => gl.deleteShader(shader));
      if (program) gl.deleteProgram(program);
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      shaders.forEach(shader => gl.deleteShader(shader));
      gl.deleteProgram(program);
      return;
    }
    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(gl.getUniformLocation(program, "uLettering"), 0);
    const texel = gl.getUniformLocation(program, "uTexel");
    const time = gl.getUniformLocation(program, "uTime");
    const pulse = gl.getUniformLocation(program, "uPulse");
    const motion = gl.getUniformLocation(program, "uMotion");
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = preference.matches;
    let inView = true;
    let loaded = false;
    let disposed = false;
    let frame = 0;
    let lastDraw = -40;
    let pulseStart = -10000;
    let lastContact = -10000;
    const start = performance.now();
    const draw = (now: number) => {
      if (!loaded || !inView || document.hidden || disposed) return;
      if (now - lastDraw >= 32 || reduced) {
        lastDraw = now;
        gl.uniform2f(texel, 1 / 1600, 1 / 550);
        gl.uniform1f(time, reduced ? 0 : (now - start) / 1000);
        gl.uniform1f(pulse, reduced ? 0 : Math.max(0, 1 - (now - pulseStart) / 1050));
        gl.uniform1f(motion, reduced ? 0 : 1);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      if (!reduced) frame = requestAnimationFrame(draw);
    };
    const requestDraw = () => {
      cancelAnimationFrame(frame);
      lastDraw = -40;
      if (loaded && inView && !document.hidden) frame = requestAnimationFrame(draw);
    };
    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const scale = Math.min(devicePixelRatio || 1, 1, 1700 / Math.max(1, width));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      requestDraw();
    };
    const contact = () => {
      const now = performance.now();
      if (reduced || now - lastContact < 1400) return;
      lastContact = pulseStart = now;
      requestDraw();
    };
    replayRef.current = () => {
      if (reduced) return;
      pulseStart = performance.now();
      root.animate([{ opacity: .25, transform: "scale(.98)" }, { opacity: 1, transform: "scale(1)" }], { duration: 480, easing: "cubic-bezier(.16,.85,.2,1)" });
      requestDraw();
    };
    const updatePreference = () => { reduced = preference.matches; requestDraw(); };
    const sizeObserver = new ResizeObserver(resize);
    const visibilityObserver = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; requestDraw(); });
    // Rasterize the locally hosted typeface once; no per-frame text layout.
    const prepareLettering = () => {
      if (disposed) return;
      const lettering = document.createElement("canvas");
      lettering.width = 1600;
      lettering.height = 550;
      const context = lettering.getContext("2d");
      if (!context) return;
      const drawLine = (text: string, baseline: number, outlined: number[]) => {
        context.font = '900 100px "Archivo Display"';
        const characters = [...text];
        const measured = characters.reduce((sum, character) => sum + context.measureText(character).width, 0) + (characters.length - 1) * 6;
        const size = 100 * 1480 / measured;
        context.font = `900 ${size}px "Archivo Display"`;
        const gap = size * .06;
        const widths = characters.map(character => context.measureText(character).width);
        let x = (1600 - widths.reduce((sum, width) => sum + width, 0) - gap * (characters.length - 1)) / 2;
        context.fillStyle = "#f1f2eb";
        context.strokeStyle = "#f1f2eb";
        context.lineWidth = size * .012;
        context.lineJoin = "round";
        characters.forEach((character, index) => {
          if (outlined.includes(index)) context.strokeText(character, x, baseline);
          else context.fillText(character, x, baseline);
          x += widths[index] + gap;
        });
      };
      drawLine("FORMULA:", 220, [0, 6]);
      drawLine("MOBIUS", 505, [1, 4]);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, lettering);
      loaded = true;
      root.classList.add("wordmark-ready");
      resize();
    };
    void document.fonts.load('900 100px "Archivo Display"', "FORMULA:MOBIUS").then(prepareLettering, prepareLettering);
    sizeObserver.observe(root);
    visibilityObserver.observe(root);
    root.addEventListener("pointerenter", contact);
    document.addEventListener("visibilitychange", requestDraw);
    preference.addEventListener("change", updatePreference);
    return () => {
      disposed = true;
      replayRef.current = () => {};
      cancelAnimationFrame(frame);
      sizeObserver.disconnect();
      visibilityObserver.disconnect();
      root.removeEventListener("pointerenter", contact);
      document.removeEventListener("visibilitychange", requestDraw);
      preference.removeEventListener("change", updatePreference);
      root.classList.remove("wordmark-ready");
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      shaders.forEach(shader => gl.deleteShader(shader));
    };
  }, []);

  return (
    <div className="mobius-wordmark" ref={rootRef}>
      <button className="wordmark-replay" aria-label="重播标题动效" onClick={() => replayRef.current()}>
        <span className="wordmark-static" aria-hidden="true">
          <span className="wordmark-formula"><span>F</span>ORMUL<span>A</span>:</span>
          <span className="wordmark-mobius">M<span>O</span>BI<span>U</span>S</span>
        </span>
        <canvas className="wordmark-canvas" ref={canvasRef} aria-hidden="true" />
      </button>
    </div>
  );
}
