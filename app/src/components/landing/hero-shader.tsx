"use client";

import { useEffect, useRef } from "react";

const VERT_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision highp float;
uniform vec2  u_res;
uniform float u_time;
uniform vec3  u_brand;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    v += a * vnoise(p);
    p = ROT * p * 2.02;
    a *= 0.5;
  }
  return v;
}
float grain(vec2 uv) {
  return hash(uv * u_res + fract(u_time));
}
void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv   = (frag - 0.5 * u_res) / min(u_res.x, u_res.y);
  float t = u_time * 0.08;
  vec2 q = vec2(fbm(uv + t), fbm(uv + vec2(5.2, 1.3) - t * 0.6));
  vec2 r = vec2(
    fbm(uv + 2.0 * q + vec2(1.7, 9.2) + t * 0.5),
    fbm(uv + 2.0 * q + vec2(8.3, 2.8) - t * 0.4)
  );
  float f = fbm(uv + 3.0 * r);
  vec3 ink  = vec3(0.035, 0.035, 0.04);
  vec3 mid  = u_brand * 0.55;
  vec3 warm = u_brand * 0.82;
  vec3 col = mix(ink, mid, smoothstep(0.25, 0.72, f));
  col = mix(col, warm, smoothstep(0.58, 0.90, f) * 0.75);
  float vig = smoothstep(1.20, 0.10, length(uv));
  col = mix(ink, col, vig);
  col += (grain(uv) - 0.5) * 0.03;
  gl_FragColor = vec4(col, 1.0);
}
`;

export function HeroShader({ brand = "#e8613c" }: { brand?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl =
      (canvas.getContext("webgl", { antialias: false, alpha: false }) as WebGLRenderingContext | null) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGLRenderingContext.useProgram, not a React hook
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const locPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);

    const hex = brand.replace("#", "");
    const n = parseInt(
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex,
      16,
    );
    gl.uniform3f(
      gl.getUniformLocation(prog, "u_brand"),
      ((n >> 16) & 255) / 255,
      ((n >> 8) & 255) / 255,
      (n & 255) / 255,
    );

    const locRes = gl.getUniformLocation(prog, "u_res");
    const locTime = gl.getUniformLocation(prog, "u_time");

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const pw = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const ph = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
        gl.viewport(0, 0, pw, ph);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let visible = true;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible = e.isIntersecting;
      },
      { threshold: 0.01 },
    );
    io.observe(canvas);

    let raf = 0;
    const start = performance.now();
    const render = (now: number) => {
      raf = requestAnimationFrame(render);
      if (!visible) return;
      gl.uniform2f(locRes, canvas.width, canvas.height);
      gl.uniform1f(locTime, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [brand]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
