/**
 * 고칠 때마다 돌리는 자체 검사.  node selftest.js
 *
 * 화면을 손대다 계산이 조용히 죽는 일이 세 번 있었다.
 *
 *   ROIS   상수 이름을 바꾸고 한 곳을 안 고쳐 "계산 중" 에서 멈춤
 *   wave   캔버스를 지웠는데 촬영 루프가 아직 그리려 해 남은 시간이 멈춤
 *   vit    혈압을 파일에 담으면서 정의 전에 참조해 종료 순간에 터짐
 *
 * 셋 다 브라우저에서 열어봐야만 드러났고, 눈으로 훑을 때는 매번 놓쳤다.
 * 가짜 DOM 을 세우고 실제 계산까지 한 번 돌려보면 전부 잡힌다.
 */
const fs = require("fs");
const SRC = "index.html";
const html = fs.readFileSync(SRC, "utf8");
const js = html.match(/<script>([\s\S]*)<\/script>/)[1];

let bad = 0;
const ok   = m => console.log("  OK   " + m);
const fail = m => { console.log("  실패 " + m); bad++; };

// 1. HTML 의 id 와 JS 가 찾는 id 대조
const ids  = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const used = [...new Set([...js.matchAll(/\$\("([^"]+)"\)/g)].map(m => m[1]))];
const miss = used.filter(u => !ids.has(u));
miss.length ? fail("없는 id 를 찾는 곳: " + miss.join(", "))
            : ok("id 참조 " + used.length + "개 모두 존재");

// 2. display 를 같은 우선순위로 다투는 규칙이 있는지
//    .screen.hide 와 .screen.roll 이 그래서 진단 화면이 첫 화면을 덮었다
const css = html.match(/<style>([\s\S]*)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, "");
const disp = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .filter(m => /(^|;)\s*display\s*:/.test(m[2]))
  .map(m => m[1].trim());
const scr = disp.filter(s => s.startsWith(".screen"));
scr[scr.length - 1] === ".screen.hide"
  ? ok("화면 표시 규칙에서 .screen.hide 가 마지막")
  : fail("display 순서가 위험: " + scr.join(" → "));

// 3. 가짜 DOM 을 세우고 페이지 전체를 실행
const ctx = new Proxy({}, { get: () => () => ({ data: new Uint8ClampedArray(4*192*144) }) });
const mk = id => ({ id, style:{}, classList:{add(){},remove(){}}, textContent:"", innerHTML:"",
  addEventListener(){}, getContext:()=>ctx, width:300, height:100,
  videoWidth:640, videoHeight:480, appendChild(){}, children:[],
  getBoundingClientRect:()=>({width:300,height:100}),
  setAttribute(){}, getAttribute:()=>null, remove(){} });
const els = {};
global.document = { getElementById:id => els[id] || (els[id] = mk(id)), createElement:mk,
  body:{appendChild(){}}, getElementsByClassName:()=>[], querySelectorAll:()=>[],
  addEventListener(){}, documentElement:mk("html") };
global.navigator = { userAgent:"selftest", mediaDevices:{}, clipboard:{} };
global.performance = { now:()=>Date.now() };
global.requestAnimationFrame = f => setTimeout(f, 0);
global.Blob = class { constructor(){ this.size = 100; } };
global.URL = { createObjectURL:()=>"x", revokeObjectURL(){} };
global.addEventListener = function(){};
global.window = { addEventListener(){}, scrollTo(){} };

let api;
try {
  api = new Function(js + "; return {compute, drawWave, SECONDS, FS," +
                     " setFrames:f=>{frames=f}, setMaxGap:g=>{maxGap=g}};")();
  ok("페이지 전체 실행");
} catch (e) { fail("페이지를 못 띄움: " + e.message); process.exit(1); }

// 4. 없는 캔버스에 그려도 촬영이 죽지 않아야 한다
try { api.drawWave(null, [1,2,3], "#000"); ok("없는 캔버스에 그리기 → 조용히 넘어감"); }
catch (e) { fail("없는 캔버스에서 터짐: " + e.message); }

// 5. 실제 계산을 끝까지 돌린다 — 종료 순간에 터지는 것을 잡는 자리
const FS = api.FS, N = FS * api.SECONDS, frames = [];
let seed = 7; const rnd = () => { seed = (seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff-0.5; };
for (let i = 0; i < N; i++) {
  const t = i/FS, p = Math.sin(2*Math.PI*1.2*t), br = Math.sin(2*Math.PI*0.2*t), roi = {};
  for (const k of ["forehead","left","right"])
    roi[k] = [150+0.3*p+br+rnd(), 120+1.0*p+br+rnd(), 100+0.2*p+br+rnd()];
  frames.push({ t:t, roi:roi });
}
api.setFrames(frames); api.setMaxGap(0.05);
try {
  // 실제 카메라 진단이 넘겨주는 모양 그대로 (index.html 의 info 객체)
  api.compute({ supported:false, locked:false, wb:false, why:"시험",
                exposure:null, bright:null, tried:[] });
  const four = (els.four.innerHTML || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  /\d/.test(four) ? ok("계산 통과 · 네 칸: " + four)
                  : fail("계산은 됐는데 네 칸이 비었다");
} catch (e) {
  fail("계산 중 터짐: " + e.message + "\n       " + e.stack.split("\n")[1].trim());
}

console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과");
process.exit(bad ? 1 : 0);
