/**
 * 고칠 때마다 돌리는 자체 검사.  node selftest.js
 *
 * 화면을 손대다 계산이 조용히 죽거나 값이 조용히 어긋나는 일이 네 번 있었다.
 *
 *   ROIS   상수 이름을 바꾸고 한 곳을 안 고쳐 "계산 중" 에서 멈춤
 *   wave   캔버스를 지웠는데 촬영 루프가 아직 그리려 해 남은 시간이 멈춤
 *   vit    혈압을 파일에 담으면서 정의 전에 참조해 종료 순간에 터짐
 *   남자   표기를 바꾸자 성별 비교가 빗나가 남성이 전부 여성으로 계산됨
 *
 * 전부 브라우저에서 열어봐야만 드러났고, 눈으로 훑을 때는 매번 놓쳤다.
 * 가짜 DOM 을 세우고 실제 계산까지 한 번 돌려보면 전부 잡힌다.
 */
const fs = require("fs");
const SRC = process.argv[2] || "index.html";
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
//    .screen.hide 와 .screen.roll 이 그래서 자세히 화면이 첫 화면을 덮었다
const css = html.match(/<style>([\s\S]*)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, "");
const disp = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .filter(m => /(^|;)\s*display\s*:/.test(m[2]))
  .map(m => m[1].trim());
const scr = disp.filter(s => s.startsWith(".screen"));
scr[scr.length - 1] === ".screen.hide"
  ? ok("화면 표시 규칙에서 .screen.hide 가 마지막")
  : fail("display 순서가 위험: " + scr.join(" → "));

// 3. CLAUDE.md 6절 금지어가 화면·주석 어디에도 없는지
const banned = ["건강","진단","검진","정상","이상","위험","질환","질병",
                "산소포화도","SpO2","의료","환자","스크리닝"];
const hit = banned.filter(w => html.indexOf(w) >= 0);
hit.length ? fail("금지어가 있다: " + hit.join(", ")) : ok("금지어 없음");

// 4. 가짜 DOM 을 세우고 페이지 전체를 실행
const ctx = new Proxy({}, { get: () => () => ({ data: new Uint8ClampedArray(4*192*144) }) });
const mk = id => ({ id, style:{}, className:"", classList:{add(){},remove(){}},
  textContent:"", innerHTML:"",
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
  api = new Function(js + "; return {compute, drawWave, SECONDS, FS, bloodPressure," +
                     " setFrames:f=>{frames=f}, setMaxGap:g=>{maxGap=g}," +
                     " getRaw:()=>lastRaw, heartRateWindowed};")();
  ok("페이지 전체 실행");
} catch (e) { fail("페이지를 못 띄움: " + e.message); process.exit(1); }

// 5. 없는 캔버스에 그려도 촬영이 죽지 않아야 한다
try { api.drawWave(null, [1,2,3], "#000"); ok("없는 캔버스에 그리기 → 조용히 넘어감"); }
catch (e) { fail("없는 캔버스에서 터짐: " + e.message); }

// 6. 실제 계산을 끝까지 돌린다 — 종료 순간에 터지는 것을 잡는 자리
const FS = api.FS;
function fakeFrames(n){
  let seed = 7; const rnd = () => { seed = (seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff-0.5; };
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i/FS, p = Math.sin(2*Math.PI*1.2*t), br = Math.sin(2*Math.PI*0.2*t), roi = {};
    for (const k of ["forehead","left","right"])
      roi[k] = [150+0.3*p+br+rnd(), 120+1.0*p+br+rnd(), 100+0.2*p+br+rnd()];
    out.push({ t:t, roi:roi });
  }
  return out;
}
// 실제 카메라 점검이 넘겨주는 모양 그대로 (index.html 의 info 객체)
const EXP = { supported:false, locked:false, wb:false, why:"시험", exposure:null, bright:null, tried:[] };
const fourText = () => (els.four.innerHTML || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

api.setFrames(fakeFrames(FS * api.SECONDS)); api.setMaxGap(0.05);
try {
  api.compute(EXP);
  /\d/.test(fourText()) ? ok("계산 통과 · 네 칸: " + fourText())
                        : fail("계산은 됐는데 네 칸이 비었다");
  els.verdict2.textContent ? ok("자세히 화면의 판정 문구가 채워짐: " + els.verdict2.textContent.split("\n")[0])
                           : fail("자세히 화면의 판정 문구가 비어 있다");
  api.getRaw() ? ok("내려받을 원시 신호가 준비됨") : fail("원시 신호가 비어 있다");
} catch (e) {
  fail("계산 중 터짐: " + e.message + "\n       " + e.stack.split("\n")[1].trim());
}

// 7. 39.97초처럼 한 장 모자란 촬영에서도 창이 셋 나오는가
//    둘만 나오면 둘의 「중앙값」이 둘 중 큰 값이 되어 위로 치우친다
{
  const x = [];
  for (let i = 0; i < 1199; i++) x.push(Math.sin(2*Math.PI*1.2*i/FS));
  const r = api.heartRateWindowed(x, FS);
  r.estimates.length >= 3 ? ok("1199 샘플에서 창 " + r.estimates.length + "개")
                          : fail("1199 샘플에서 창이 " + r.estimates.length + "개뿐");
}

// 8. 두 번째 촬영이 실패하면 첫 촬영의 흔적이 남지 않아야 한다
//    전에는 네 칸에 지난 값이 그대로 있었고, 파일 저장을 누르면 지난 신호가 나갔다
api.setFrames(fakeFrames(FS * 5));          // 5초뿐 → 신호를 못 뽑는다
try {
  api.compute(EXP);
  /\d/.test(fourText()) ? fail("실패했는데 네 칸에 숫자가 남아 있다: " + fourText())
                        : ok("실패하면 네 칸이 안내 문구로 바뀜");
  api.getRaw() === null ? ok("실패하면 지난 원시 신호를 버림")
                        : fail("실패했는데 지난 원시 신호가 그대로 남아 있다");
  (els.verdict.className || "") === "" ? ok("#verdict 의 클래스를 건드리지 않음")
                                       : fail("#verdict 에 클래스가 붙었다: " + els.verdict.className);
} catch (e) {
  fail("짧은 촬영에서 터짐: " + e.message);
}

// 9. 입력이 결과에 실제로 반영되는가
//    숫자가 나오는지만 보지 말고 입력에 따라 달라지는지를 본다.
const vit = api.bloodPressure;
const m1 = vit("남", 40, 170, 70, 72, 40), m2 = vit("남자", 40, 170, 70, 72, 40);
const f1 = vit("여", 40, 170, 70, 72, 40), f2 = vit("여자", 40, 170, 70, 72, 40);
(m1.sbp === m2.sbp && f1.sbp === f2.sbp)
  ? ok("성별 표기가 남/남자, 여/여자 어느 쪽이든 같은 값")
  : fail("성별 표기에 따라 값이 달라진다 (남 " + m1.sbp + " vs 남자 " + m2.sbp
         + ", 여 " + f1.sbp + " vs 여자 " + f2.sbp + ")");
(m2.sbp !== f2.sbp)
  ? ok("남녀가 서로 다른 값 (" + m2.sbp + "/" + m2.dbp + " vs " + f2.sbp + "/" + f2.dbp + ")")
  : fail("남녀가 같은 값 — 성별이 반영되지 않는다");
(vit("남자",70,170,70,72,40).sbp > vit("남자",20,170,70,72,40).sbp)
  ? ok("나이가 값에 반영됨") : fail("나이를 바꿔도 값이 그대로");
(vit("남자",40,170,95,72,40).sbp > vit("남자",40,170,50,72,40).sbp)
  ? ok("몸무게가 값에 반영됨") : fail("몸무게를 바꿔도 값이 그대로");

console.log(bad ? "\n실패 " + bad + "건" : "\n전부 통과");
process.exit(bad ? 1 : 0);
