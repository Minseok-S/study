/* 모의고사 드릴 — 기출에서 랜덤으로 뽑아 실제 실기 구성으로 응시한다.
   구성: 단답형 10 · 서술형 4 · 실무형 2 = 16문항 / 100점 만점, 60점 합격.
   · 단답형   : window.QUESTIONS (기출 단답형 세트, 추천문제 r:true 제외)
   · 서술·실무 : window.GICHUL_DATA 의 서술형·실무형 기출 */

const app = document.getElementById('app');
const pill = document.getElementById('sessionPill');
let S = null;                // 현재 세션
let activeKeyJudge = null;    // 화면에 붙어 있는 판정 리스너 (재채점 중복 방지)

const WRONG_KEY = 'isec_mock_wrong_v1';
const LAST_KEY  = 'isec_mock_last_v1';

/* 모의고사 구성 */
const SPEC = { 단답형: 10, 서술형: 4, 실무형: 2 };
const TOTAL_Q = SPEC.단답형 + SPEC.서술형 + SPEC.실무형;   // 16
// 배점: 단답 4점 × 10 = 40, 서술 10점 × 4 = 40, 실무 10점 × 2 = 20 → 100점
const POINTS = { 단답형: 4, 서술형: 10, 실무형: 10 };
const PASS = 60;
function pointsOf(kind){ return POINTS[kind] || 0; }

/* 과목(분야) */
const CATS = [
  {id:'sys',  name:'시스템 보안'},
  {id:'net',  name:'네트워크 보안'},
  {id:'app',  name:'애플리케이션 보안'},
  {id:'soc',  name:'보안관제·침해사고 대응'},
  {id:'risk', name:'위험관리·법규'},
];
const CAT_NAME = Object.fromEntries(CATS.map(c => [c.id, c.name]));

/* 기출 서술형·실무형 108문항의 과목 분류 (키 = "회차-번호") */
const CAT_MAP = {
  '13-11':'risk','13-12':'net','13-13':'risk','13-14':'app','13-15':'soc','13-16':'app',
  '14-11':'sys','14-12':'sys','14-13':'sys','14-14':'net','14-15':'app','14-16':'soc',
  '15-11':'net','15-12':'soc','15-13':'risk','15-14':'sys','15-15':'net','15-16':'risk',
  '16-11':'app','16-12':'soc','16-13':'app','16-14':'app','16-15':'risk','16-16':'risk',
  '17-11':'app','17-12':'net','17-13':'net','17-14':'soc','17-15':'app','17-16':'app',
  '18-11':'app','18-12':'net','18-13':'net','18-14':'app','18-15':'sys','18-16':'net',
  '19-11':'sys','19-12':'risk','19-13':'net','19-14':'risk','19-15':'app','19-16':'risk',
  '20-11':'risk','20-12':'net','20-13':'soc','20-14':'app','20-15':'net','20-16':'risk',
  '21-11':'soc','21-12':'risk','21-13':'risk','21-14':'net','21-15':'risk','21-16':'net',
  '22-13':'app','22-14':'risk','22-15':'app','22-16':'net','22-17':'app','22-18':'risk',
  '23-13':'app','23-14':'net','23-15':'sys','23-16':'net','23-17':'risk','23-18':'net',
  '24-13':'sys','24-14':'sys','24-15':'net','24-16':'net','24-17':'sys','24-18':'sys',
  '25-13':'app','25-14':'net','25-15':'risk','25-16':'soc','25-17':'net','25-18':'soc',
  '26-13':'sys','26-14':'risk','26-15':'net','26-16':'app','26-17':'app','26-18':'app',
  '27-13':'risk','27-14':'risk','27-15':'sys','27-16':'risk','27-17':'app','27-18':'net',
  '28-13':'sys','28-14':'sys','28-15':'net','28-16':'risk','28-17':'app','28-18':'sys',
  '29-13':'app','29-14':'app','29-15':'soc','29-16':'risk','29-17':'sys','29-18':'risk',
  '30-13':'app','30-14':'risk','30-15':'app','30-16':'soc','30-17':'sys','30-18':'app',
};

/* ============ 데이터 통합 ============ */
const SHORT = (window.QUESTIONS || [])
  .filter(q => !q.r)
  .map(q => ({
    key: 'sa:' + q.n, kind: '단답형', cat: q.c || 'sys',
    label: 'Q-' + String(q.n).padStart(3, '0'), q: q.q, a: q.a,
  }));

const GICHUL = (window.GICHUL_DATA?.rounds || []).flatMap(r =>
  r.questions
    .filter(q => q.type !== '단답형')
    .map(q => ({
      key: 'g:' + r.no + '-' + q.num, kind: q.type,
      cat: CAT_MAP[`${r.no}-${q.num}`] || 'sys',
      label: `${r.no}회 ${q.num}번`, q: q.question, a: q.answer,
    }))
);
const ESSAY_POOL = GICHUL.filter(q => q.kind === '서술형');
const PRAC_POOL  = GICHUL.filter(q => q.kind === '실무형');

const BY_KEY = Object.fromEntries([...SHORT, ...GICHUL].map(q => [q.key, q]));
function isShort(q){ return q.kind === '단답형'; }

/* ============ 저장소 ============ */
const memStore = {};
function safeGet(key, fallback){
  try{ const v = localStorage.getItem(key); return v === null ? fallback : v; }
  catch(e){ return (key in memStore) ? memStore[key] : fallback; }
}
function safeSet(key, val){
  try{ localStorage.setItem(key, val); }
  catch(e){ memStore[key] = val; }
}
function loadWrong(){ try{ return JSON.parse(safeGet(WRONG_KEY, '[]')); }catch(e){ return []; } }
function saveWrong(arr){ safeSet(WRONG_KEY, JSON.stringify([...new Set(arr)])); }
function markWrong(key){ const w = loadWrong(); w.push(key); saveWrong(w); }
function clearWrong(key){ saveWrong(loadWrong().filter(x => x !== key)); }
function loadLast(){ try{ return JSON.parse(safeGet(LAST_KEY, 'null')); }catch(e){ return null; } }
function saveLast(obj){ safeSet(LAST_KEY, JSON.stringify(obj)); }

/* ============ 단답형 채점 ============ */
function normShort(str){
  return (str || '').toLowerCase()
    .replace(/[\s]/g, '')
    .replace(/[()（）.,·、/:;'"`\-_~!?]/g, '')
    .replace(/[은는이가을를와과의로으로및]/g, '');
}
function answerTokens(ans){
  return (ans || '').split('\n')
    .map(line => line.replace(/^\([A-Za-z0-9]+\)\s*/, '').replace(/^\d+[).]\s*/, '').trim())
    .filter(Boolean);
}
function gradeShort(userInput, ans){
  const tokens = answerTokens(ans);
  if(!userInput.trim()) return {ratio:0, hit:0, total:tokens.length};
  const uNorm = normShort(userInput);
  let hit = 0;
  tokens.forEach(t => {
    const variants = t.split(/[,，]|or|\(|\)|（|）|\//).map(x => normShort(x)).filter(x => x.length >= 1);
    if(variants.some(v => v.length >= 1 && uNorm.includes(v))) hit++;
  });
  return {ratio: tokens.length ? hit/tokens.length : 0, hit, total: tokens.length};
}

/* ============ 서술·실무 채점 ============ */
function isNoteLine(line){
  return /^\s*[​\s]*([-*※·]|\\\*)/.test(line) && /(니다|참고|참조|http|출제|수험서|획득)/.test(line);
}
function splitAnswer(ans){
  const lines = (ans || '').split('\n');
  const i = lines.findIndex(isNoteLine);
  if(i < 0) return {body: (ans || '').trim(), note: ''};
  return { body: lines.slice(0, i).join('\n').trim(), note: lines.slice(i).join('\n').trim() };
}
const JOSA = /(으로써|으로서|하여야|하여|해야|이라고|라고|에서의|에서|에게|으로|로서|로써|이며|하며|하고|한다|된다|됩니다|합니다|입니다|이다|들이|들을|들의|처럼|보다|까지|부터|만을|만이|와의|과의|에도|에는|이란|라는|하기|하다|되기|시킴|시켜|이나|거나|하는|되는|같은|등의|등을|등은|등이|을|를|이|가|은|는|의|와|과|에|도|만|로|나|랑|아|야|여|함|됨|할|한|된|될|음)$/;
const STOP = new Set([
  '그리고','또는','그러나','따라서','이때','다음','경우','때문','위해','대해','대하여','관하여','통해','통한',
  '있는','없는','하는','되는','같은','모든','일부','해당','관련','기타','다양','여러','매우','반드시','또한',
  '수행','가능','불가','존재','발생','이용','사용','설정','확인','기술','설명','내용','방법','문제','정답',
  '아래','위와','다만','만약','우선','특히','즉시','현재','이상','이하','미만','초과','각각','서로','바로',
  '위한','대한','등을','등의','등이','등은','이러','그러','통하','의해','따른','되어','하게','있어',
  '있음','없음','같음','아님','한다','된다','한','함','됨','음',
  '등으로','등에','내에','하나','여러','모두','다시','경우','이를','그를','것을','것이','되며','하며',
]);
function stem(tok){
  let t = tok;
  if(!/[가-힣]/.test(t)) return t;
  for(let k = 0; k < 3; k++){
    if(t.length <= 2) break;
    const cut = t.replace(JOSA, '');
    if(cut === t || cut.length < 2) break;
    t = cut;
  }
  return t;
}
function keywordsOf(body){
  const raw = (body || '').replace(/[^가-힣A-Za-z0-9]+/g, ' ').split(' ').filter(Boolean);
  const out = [], seen = new Set();
  raw.forEach(tok => {
    if(/^\d+$/.test(tok)) return;
    const t = stem(tok);
    if(t.length < 2) return;
    if(STOP.has(t)) return;
    const key = t.toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    out.push(t);
  });
  const CAP = 34;
  if(out.length <= CAP) return out;
  const step = out.length / CAP;
  return Array.from({length: CAP}, (_, i) => out[Math.floor(i * step)]);
}
function normEssay(str){ return (str || '').toLowerCase().replace(/\s+/g, ''); }
function gradeEssay(userInput, body){
  const keys = keywordsOf(body);
  const uNorm = normEssay(userInput);
  const hit = [], miss = [];
  keys.forEach(k => (uNorm.includes(normEssay(k)) ? hit : miss).push(k));
  return { hit, miss, total: keys.length, ratio: keys.length ? hit.length / keys.length : 0, chars: userInput.trim().length };
}

/* ============ 세션 ============ */
function shuffle(a){ const r = a.slice(); for(let i=r.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [r[i],r[j]]=[r[j],r[i]]; } return r; }
function pick(pool, n){ return shuffle(pool).slice(0, n); }

// 모의고사 세트 생성 — 과목 무관 랜덤, 시험지 순서는 단답 → 서술 → 실무
function buildExam(){
  return [
    ...pick(SHORT, SPEC.단답형),
    ...pick(ESSAY_POOL, SPEC.서술형),
    ...pick(PRAC_POOL, SPEC.실무형),
  ];
}

function startSession(list, mode, label){
  if(!list.length) return;
  // 각 문항의 배점 합계 (오답 모드는 문항 수가 달라질 수 있으므로 세션마다 계산)
  const maxScore = list.reduce((s, q) => s + pointsOf(q.kind), 0);
  S = { list, i:0, full:0, part:0, none:0, wrong:[], earned:0, maxScore, mode, label };
  renderQuiz();
}

/* ============ 홈 ============ */
function renderHome(){
  const wrong = new Set(loadWrong());
  const wrongN = [...wrong].filter(k => BY_KEY[k]).length;
  const last = loadLast();
  pill.textContent = `${TOTAL_Q}문항 · ${PASS}점 합격`;

  app.innerHTML = `
  <section class="hero">
    <h1>실전처럼 <em>16문항 한 회분</em><br>기출 모의고사</h1>
    <p>기출에서 과목 구분 없이 랜덤으로 뽑아 실제 실기 구성 그대로 응시합니다. 단답형 10 · 서술형 4 · 실무형 2, 100점 만점에 60점이면 합격선입니다.</p>
    <div class="stat-rail">
      <div class="stat"><span class="num">${SPEC.단답형}</span><span class="lbl">단답형 · ${POINTS.단답형}점</span></div>
      <div class="stat"><span class="num">${SPEC.서술형}</span><span class="lbl">서술형 · ${POINTS.서술형}점</span></div>
      <div class="stat"><span class="num">${SPEC.실무형}</span><span class="lbl">실무형 · ${POINTS.실무형}점</span></div>
      <div class="stat ${last && last.score >= PASS ? 'good' : 'bad'}"><span class="num">${last ? last.score : '—'}</span><span class="lbl">${last ? '지난 점수' : '첫 응시'}</span></div>
    </div>

    <div class="mode-grid">
      <button class="mode-btn primary" id="mStart">
        <span><span class="t">모의고사 시작</span><span class="d">기출에서 랜덤 출제 · ${TOTAL_Q}문항 (100점)</span></span>
        <span class="arrow">→</span>
      </button>
      <button class="mode-btn danger" id="mWrong" ${wrongN ? '' : 'disabled'}>
        <span><span class="t">오답만 다시 풀기</span><span class="d">${wrongN ? wrongN + '문항 집중 복습' : '아직 오답이 없어요'}</span></span>
        <span class="arrow">→</span>
      </button>
    </div>

    <div class="cat-head">
      <span class="cat-eyebrow">HOW</span>
      <h2 class="cat-title">채점 방식</h2>
    </div>
    <ul style="list-style:none;padding:0;margin:0;display:grid;gap:10px">
      <li style="display:flex;gap:10px;align-items:flex-start;font-size:.86rem;color:var(--ink-soft)"><b style="color:var(--ink)">단답형</b> 답을 입력하고 <b>Enter</b>로 채점 → 키보드 <b>1</b>(정답)·<b>2</b>(오답). 정답이면 ${POINTS.단답형}점.</li>
      <li style="display:flex;gap:10px;align-items:flex-start;font-size:.86rem;color:var(--ink-soft)"><b style="color:var(--ink)">서술·실무형</b> 개조식으로 작성하고 <b>Ctrl(⌘)+Enter</b>로 채점 → 키보드 <b>1</b>(충분)·<b>2</b>(부분)·<b>3</b>(못 씀). 충분 ${POINTS.서술형}점 · 부분 ${POINTS.서술형/2}점.</li>
      <li style="display:flex;gap:10px;align-items:flex-start;font-size:.86rem;color:var(--ink-soft)"><b style="color:var(--ink)">오답 저장</b> 오답·부분·못씀은 오답 목록에 저장되어 "오답만 다시 풀기"로 재도전할 수 있어요.</li>
    </ul>

    <p class="note">자동 채점은 참고용입니다. 서술·실무형은 표현이 달라도 정답일 수 있으니 모범답안과 비교해 스스로 판정하세요.</p>
  </section>`;

  document.getElementById('mStart').onclick = () => startSession(buildExam(), 'exam', '모의고사');
  document.getElementById('mWrong').onclick = () => {
    const set = new Set(loadWrong());
    const list = [...set].map(k => BY_KEY[k]).filter(Boolean);
    // 오답도 시험지 순서(단답→서술→실무)로 정렬
    const ord = {단답형:0, 서술형:1, 실무형:2};
    list.sort((a,b) => (ord[a.kind]-ord[b.kind]));
    startSession(list, 'wrong', '오답 다시 풀기');
  };
}

/* ============ 퀴즈 공통 골격 ============ */
function quizTop(q){
  const total = S.list.length;
  const sec = isShort(q) ? '단답형' : q.kind;
  return `
    <div class="quiz-top">
      <div class="q-tag">${String(S.i+1).padStart(2,'0')}<span class="of"> / ${total}</span></div>
      <button class="quit" id="quitBtn">그만두기</button>
    </div>
    <div class="rail"><div class="fill" style="width:${Math.round(S.i/total*100)}%"></div></div>
    <div class="score-line"><span class="o">정답 ${S.full}</span><span class="mid">부분 ${S.part}</span><span class="x">오답 ${S.none}</span><span>${S.earned}점</span></div>`;
}
function cardHead(q){
  return `<span class="num-chip">${q.label}</span><span class="cat-chip">${q.kind} · ${pointsOf(q.kind)}점</span><span class="cat-chip">${CAT_NAME[q.cat]||''}</span>`;
}

function renderQuiz(){
  pill.textContent = `${S.label} · ${S.i+1}/${S.list.length}`;
  const q = S.list[S.i];
  if(isShort(q)) renderShortQuiz(q);
  else renderEssayQuiz(q);
}

/* ---------- 단답형 화면 ---------- */
function renderShortQuiz(q){
  app.innerHTML = `
    ${quizTop(q)}
    <article class="card">
      ${cardHead(q)}
      <div class="q-text" id="qText"></div>

      <div id="inputArea">
        <label class="a-lbl" style="display:block;margin:20px 0 6px">내 답안 입력</label>
        <textarea id="userAns" rows="3" placeholder="답을 입력하고 Enter로 채점 · 줄바꿈은 Shift+Enter"
          style="width:100%;font-family:var(--mono);font-size:.95rem;padding:12px 14px;border:1.5px solid var(--line);border-radius:10px;resize:vertical;line-height:1.6;color:var(--ink);background:#FBFCFB"></textarea>
        <div class="actions" style="margin-top:12px">
          <button class="btn btn-reveal" id="checkBtn">채점하기 <small>Enter</small></button>
        </div>
        <div class="skip-row"><button id="revealBtn">모르겠음 · 정답만 보기</button></div>
      </div>

      <div class="answer" id="ansBox">
        <div class="my-ans" id="myAnsWrap">
          <div class="a-lbl" style="color:var(--ink-soft)">내 답안</div>
          <div class="my-text" id="myAnsText"></div>
        </div>
        <div class="a-lbl">정답</div>
        <div class="a-text">${esc(q.a)}</div>
        <div id="gradeMsg" class="grade-msg"></div>
        <div class="actions" id="verdictRow">
          <button class="btn btn-o" id="markO"><span class="key">1</span> 맞았어요<small>+${pointsOf(q.kind)}점</small></button>
          <button class="btn btn-x" id="markX"><span class="key">2</span> 틀렸어요<small>오답 저장</small></button>
        </div>
      </div>
    </article>`;

  document.getElementById('qText').innerHTML = formatText(q.q);
  const ta = document.getElementById('userAns');
  ta.focus();
  ta.addEventListener('keydown', e => {
    if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); doCheck(); }
  });
  document.getElementById('checkBtn').onclick = doCheck;
  document.getElementById('revealBtn').onclick = () => revealShort(null, '');
  document.getElementById('quitBtn').onclick = () => showConfirm('지금까지 푼 결과로 채점하고 종료할까요?', renderResult);
  function doCheck(){ const val = ta.value; revealShort(gradeShort(val, q.a), val); }
}

function revealShort(grade, userVal){
  document.getElementById('inputArea').style.display = 'none';
  document.getElementById('ansBox').classList.add('show');

  const myText = document.getElementById('myAnsText');
  if(userVal && userVal.trim()) myText.textContent = userVal;
  else myText.innerHTML = '<span style="color:var(--ink-soft);font-weight:400">(입력 없음 · 정답만 확인)</span>';

  const msg = document.getElementById('gradeMsg');
  if(grade === null){
    msg.innerHTML = `<span style="color:var(--ink-soft)">정답을 확인하고 스스로 채점하세요.</span>`;
  }else{
    const p = Math.round(grade.ratio * 100);
    if(grade.ratio >= 0.999){
      msg.innerHTML = `<span style="color:var(--accent);font-weight:600">자동 채점: 핵심 키워드 ${grade.hit}/${grade.total} 일치 (${p}%) — 정답으로 보입니다.</span>`;
    }else if(grade.ratio > 0){
      msg.innerHTML = `<span style="color:var(--warn);font-weight:600">자동 채점: ${grade.hit}/${grade.total} 일치 (${p}%)</span> <span style="color:var(--ink-soft)">— 정답과 비교 후 직접 확정하세요.</span>`;
    }else{
      msg.innerHTML = `<span style="color:var(--warn);font-weight:600">자동 채점: 일치하는 키워드를 찾지 못했어요.</span> <span style="color:var(--ink-soft)">표기 차이일 수 있으니 직접 확인하세요.</span>`;
    }
  }
  msg.innerHTML += `<div style="margin-top:8px;font-size:.74rem;color:var(--ink-soft)">키보드 <b>1</b> 정답 · <b>2</b> 오답</div>`;

  document.getElementById('markO').onclick = () => decide('full');
  document.getElementById('markX').onclick = () => decide('none');

  if(activeKeyJudge){ document.removeEventListener('keydown', activeKeyJudge); activeKeyJudge = null; }
  function decide(v){ document.removeEventListener('keydown', keyJudge); activeKeyJudge = null; next(v); }
  function keyJudge(e){
    if(e.target && e.target.tagName === 'TEXTAREA') return;
    if(e.key === '1'){ e.preventDefault(); decide('full'); }
    else if(e.key === '2'){ e.preventDefault(); decide('none'); }
  }
  activeKeyJudge = keyJudge;
  document.addEventListener('keydown', keyJudge);
}

/* ---------- 서술·실무형 화면 ---------- */
function renderEssayQuiz(q){
  const { body, note } = splitAnswer(q.a);
  app.innerHTML = `
    ${quizTop(q)}
    <article class="card">
      ${cardHead(q)}
      <div class="q-text" id="qText"></div>

      <div id="inputArea">
        <label class="a-lbl" style="display:block;margin:20px 0 6px">내 답안 작성</label>
        <textarea id="userAns" rows="10" class="essay-input"
          placeholder="실제 시험처럼 개조식으로 작성해 보세요. 채점은 Ctrl(⌘)+Enter"></textarea>
        <div class="input-foot"><span id="charCnt">0자</span></div>
        <div class="actions" style="margin-top:12px">
          <button class="btn btn-reveal" id="checkBtn">채점하기 <small>Ctrl+Enter</small></button>
        </div>
        <div class="skip-row"><button id="revealBtn">모르겠음 · 모범답안 보기</button></div>
      </div>

      <div class="answer" id="ansBox">
        <div class="my-ans" id="myAnsWrap">
          <div class="a-lbl" style="color:var(--ink-soft)">내 답안 <span style="font-weight:400;font-size:.72rem;color:var(--ink-soft)">· 모범답안을 보면서 고친 뒤 다시 채점할 수 있어요</span></div>
          <textarea id="myAnsEdit" rows="8" class="essay-input"
            placeholder="모범답안과 비교해 답안을 보완해 보세요. 다시 채점은 Ctrl(⌘)+Enter"></textarea>
          <div class="actions" style="margin-top:10px">
            <button class="btn btn-reveal" id="regradeBtn">수정 후 다시 채점 <small>Ctrl+Enter</small></button>
          </div>
        </div>
        <div class="a-lbl">모범답안</div>
        <div class="a-text" id="modelAns"></div>
        ${note ? `<details class="note-box"><summary>출제 코멘트 · 배점 전략</summary><div class="note-text"></div></details>` : ''}
        <div id="gradeMsg" class="grade-msg"></div>
        <div class="actions three" id="verdictRow">
          <button class="btn btn-o" id="markO"><span class="key">1</span> 충분히 씀<small>+${pointsOf(q.kind)}점</small></button>
          <button class="btn btn-mid" id="markM"><span class="key">2</span> 부분 점수<small>+${pointsOf(q.kind)/2}점</small></button>
          <button class="btn btn-x" id="markX"><span class="key">3</span> 못 씀<small>오답 저장</small></button>
        </div>
      </div>
    </article>`;

  document.getElementById('qText').innerHTML = formatText(q.q);
  document.getElementById('modelAns').innerHTML = formatText(body);
  if(note) document.querySelector('.note-text').innerHTML = formatText(note);

  const ta = document.getElementById('userAns');
  const cnt = document.getElementById('charCnt');
  ta.focus();
  ta.addEventListener('input', () => { cnt.textContent = `${ta.value.trim().length}자`; });
  ta.addEventListener('keydown', e => {
    if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); doCheck(); }
  });
  document.getElementById('checkBtn').onclick = doCheck;
  document.getElementById('revealBtn').onclick = () => revealEssay(null, '', body);
  document.getElementById('quitBtn').onclick = () => showConfirm('지금까지 푼 결과로 채점하고 종료할까요?', renderResult);

  const meTa = document.getElementById('myAnsEdit');
  meTa.addEventListener('keydown', e => {
    if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); doRegrade(); }
  });
  document.getElementById('regradeBtn').onclick = doRegrade;

  function doCheck(){ const val = ta.value; revealEssay(gradeEssay(val, body), val, body); }
  function doRegrade(){ const val = meTa.value; revealEssay(gradeEssay(val, body), val, body); }
}

function revealEssay(grade, userVal, body){
  document.getElementById('inputArea').style.display = 'none';
  document.getElementById('ansBox').classList.add('show');

  document.getElementById('myAnsWrap').style.display = 'block';
  const meTa = document.getElementById('myAnsEdit');
  if(typeof userVal === 'string') meTa.value = userVal;

  const msg = document.getElementById('gradeMsg');
  if(grade === null){
    msg.innerHTML = `<span style="color:var(--ink-soft)">모범답안을 읽고 스스로 판정하세요.</span>`;
  }else{
    const p = Math.round(grade.ratio * 100);
    const tone = grade.ratio >= 0.6 ? 'var(--accent)' : 'var(--warn)';
    const verdict = grade.ratio >= 0.6 ? '핵심을 대체로 담았습니다.'
      : grade.ratio >= 0.3 ? '핵심 일부가 빠졌습니다.'
      : '핵심 키워드가 많이 빠졌습니다.';
    msg.innerHTML = `
      <div style="color:${tone};font-weight:600">키워드 채점: ${grade.hit.length}/${grade.total} (${p}%) — ${verdict}</div>
      <div style="color:var(--ink-soft);font-size:.78rem;margin-top:4px">서술형은 표현이 달라도 정답일 수 있어요. 모범답안과 비교해 직접 판정하세요. (작성 ${grade.chars}자)</div>
      ${grade.miss.length ? `<div class="kw-wrap"><span class="kw-lbl">빠진 키워드</span>${grade.miss.map(k => `<span class="kw miss">${esc(k)}</span>`).join('')}</div>` : ''}
      ${grade.hit.length ? `<div class="kw-wrap"><span class="kw-lbl">포함된 키워드</span>${grade.hit.map(k => `<span class="kw hit">${esc(k)}</span>`).join('')}</div>` : ''}`;
  }
  msg.innerHTML += `<div style="margin-top:8px;font-size:.74rem;color:var(--ink-soft)">키보드 <b>1</b> 충분히 씀 · <b>2</b> 부분 점수 · <b>3</b> 못 씀</div>`;

  document.getElementById('markO').onclick = () => decide('full');
  document.getElementById('markM').onclick = () => decide('part');
  document.getElementById('markX').onclick = () => decide('none');

  if(activeKeyJudge){ document.removeEventListener('keydown', activeKeyJudge); activeKeyJudge = null; }
  function decide(v){ document.removeEventListener('keydown', keyJudge); activeKeyJudge = null; next(v); }
  function keyJudge(e){
    if(e.target && e.target.tagName === 'TEXTAREA') return;
    if(e.key === '1'){ e.preventDefault(); decide('full'); }
    else if(e.key === '2'){ e.preventDefault(); decide('part'); }
    else if(e.key === '3'){ e.preventDefault(); decide('none'); }
  }
  activeKeyJudge = keyJudge;
  document.addEventListener('keydown', keyJudge);
}

/* ============ 다음 문제 ============ */
function next(verdict){
  const q = S.list[S.i];
  const pts = pointsOf(q.kind);
  if(verdict === 'full'){ S.full++; S.earned += pts; clearWrong(q.key); }
  else if(verdict === 'part'){ S.part++; S.earned += pts/2; S.wrong.push({key:q.key, verdict}); markWrong(q.key); }
  else{ S.none++; S.wrong.push({key:q.key, verdict}); markWrong(q.key); }
  S.i++;
  if(S.i >= S.list.length) renderResult();
  else renderQuiz();
}

/* ============ 결과 ============ */
function renderResult(){
  const answered = S.full + S.part + S.none;
  // 100점 환산 (오답 모드처럼 총점이 100이 아닐 수 있어 만점 대비 환산)
  const score = S.maxScore ? Math.round(S.earned / S.maxScore * 100) : 0;
  const passed = score >= PASS;
  pill.textContent = `${S.earned} / ${S.maxScore}점`;

  // 시험 모드일 때 지난 점수 저장
  if(S.mode === 'exam' && answered === S.list.length){
    saveLast({ score, earned: S.earned, max: S.maxScore, date: Date.now() });
  }

  // 유형별 득점 집계
  const seg = {단답형:{e:0,m:0}, 서술형:{e:0,m:0}, 실무형:{e:0,m:0}};
  const gained = {};
  S.wrong.forEach(w => { gained[w.key] = w.verdict; });
  S.list.slice(0, answered).forEach(q => {
    const m = pointsOf(q.kind); seg[q.kind].m += m;
    const v = gained[q.key];
    seg[q.kind].e += v === 'part' ? m/2 : (v ? 0 : m);
  });

  let verdict, sub;
  if(score >= 80){ verdict = '안정 합격권'; sub = '이 점수대를 유지하면 실기가 든든합니다.'; }
  else if(score >= PASS){ verdict = '합격권'; sub = '아슬한 구간이에요 — 오답만 채우면 안정권입니다.'; }
  else if(score >= 40){ verdict = '합격까지 한 걸음'; sub = '오답 목록을 돌려 부족한 유형을 메우세요.'; }
  else{ verdict = '기초부터 다지기'; sub = '단답 개념과 서술 답안 틀부터 익히면 빠르게 오릅니다.'; }

  const segRow = ['단답형','서술형','실무형'].map(k =>
    `<div class="seg"><span class="seg-k">${k}</span><span class="seg-v">${seg[k].e} / ${seg[k].m}점</span></div>`
  ).join('');

  const details = S.wrong.map(w => {
    const q = BY_KEY[w.key];
    const { body } = splitAnswer(q.a);
    const vlabel = w.verdict === 'part' ? '부분' : (isShort(q) ? '오답' : '못씀');
    return `<details class="wrong-item">
      <summary>${q.label} · ${q.kind} · ${CAT_NAME[q.cat]||''} <span class="v-chip ${w.verdict}">${vlabel}</span></summary>
      <div class="wq">${esc(q.q)}</div>
      <div class="wa">${isShort(q) ? '정답' : '모범답안'} · ${esc(body)}</div>
    </details>`;
  }).join('');

  app.innerHTML = `
    <div class="result-hero">
      <div class="pass-badge ${passed ? 'pass' : 'fail'}">${passed ? '합격' : '불합격'} · 커트라인 ${PASS}점</div>
      <div class="big">${score}<span class="pct">점 / 100</span></div>
      <div class="big" style="font-size:1rem;color:var(--ink-soft);font-weight:500">획득 ${S.earned} / ${S.maxScore}점 · 정답 ${S.full} · 부분 ${S.part} · 오답 ${S.none}</div>
      <h2>${verdict}</h2>
      <p>${sub}</p>
      <div class="seg-rail">${segRow}</div>
    </div>
    ${S.wrong.length
      ? `<div class="wrong-list"><h3>복습할 문제 ${S.wrong.length}개 · 오답 목록에 저장됨</h3>${details}</div>`
      : `<p style="text-align:center;color:var(--accent);font-weight:600">감점 없이 완주 — 완벽합니다.</p>`}
    <div class="result-actions">
      ${S.wrong.length ? `<button class="mode-btn danger" id="rWrong"><span><span class="t">방금 틀린 문제만 다시</span><span class="d">${S.wrong.length}문항 즉시 재도전</span></span><span class="arrow">→</span></button>` : ''}
      <button class="mode-btn primary" id="rNew"><span><span class="t">새 모의고사</span><span class="d">기출에서 새로 ${TOTAL_Q}문항 출제</span></span><span class="arrow">↻</span></button>
      <button class="mode-btn" id="rHome"><span><span class="t">처음 화면으로</span></span><span class="arrow">⌂</span></button>
    </div>`;

  document.querySelectorAll('.wrong-item').forEach((el, idx) => {
    const q = BY_KEY[S.wrong[idx].key];
    const { body } = splitAnswer(q.a);
    el.querySelector('.wq').innerHTML = formatText(q.q);
    el.querySelector('.wa').innerHTML = (isShort(q) ? '<b>정답</b><br>' : '<b>모범답안</b><br>') + formatText(body);
  });

  if(S.wrong.length){
    document.getElementById('rWrong').onclick = () => {
      const ord = {단답형:0, 서술형:1, 실무형:2};
      const list = S.wrong.map(w => BY_KEY[w.key]).sort((a,b) => ord[a.kind]-ord[b.kind]);
      startSession(list, 'wrong', '오답 다시 풀기');
    };
  }
  document.getElementById('rNew').onclick = () => startSession(buildExam(), 'exam', '모의고사');
  document.getElementById('rHome').onclick = renderHome;
}

/* ============ 유틸 ============ */
function showConfirm(message, onYes){
  const old = document.getElementById('confirmOverlay');
  if(old) old.remove();
  const overlay = document.createElement('div');
  overlay.id = 'confirmOverlay';
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <p class="confirm-msg">${esc(message)}</p>
      <div class="confirm-actions">
        <button class="confirm-btn confirm-cancel" id="confirmCancel">계속 풀기</button>
        <button class="confirm-btn confirm-ok" id="confirmOk">채점하기</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if(e.target === overlay) close(); });
  document.getElementById('confirmCancel').onclick = close;
  document.getElementById('confirmOk').onclick = () => { close(); onYes(); };
}

function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ---------- 코드·로그 블록 인식 ---------- */
const CODE_SIGNS = [
  /[{};]\s*$/, /^\s*[{}]/, /^\s*\d{1,3}(\.\d{1,3}){3}[\s:]/,
  /"(GET|POST|HEAD|PUT|DELETE)\s|\bHTTP\/[012]\.[019]/, /^\s*(GET|POST)\s+\/\S/,
  /^\s*(alert|pass|drop|reject)\s+(tcp|udp|icmp|ip|any)\b/i,
  /\b(iptables|access-list|hping3?|nmap|tcpdump|netstat|lsof)\b/,
  /^\s*(zone|type|file|masters|allow-\w+|options|forwarders)\b.*[;{"]/i,
  /^\s*(Options|AddType|AddHandler|Order|Deny|Allow|LimitRequestBody|AllowOverride)\s+\S/,
  /^\s*<\/?(FilesMatch|Directory|Location|VirtualHost|Limit)\b/i,
  /^\s*[#$]\s+\S/, /^[\w.\-]+:[^:\s]*:\d+:/,
  /^\s*(int|char|void|unsigned|return|if|for|while)\b.*[;({]/,
  /\b(strcpy|printf|scanf|sprintf|memcpy|gets)\s*\(/,
  /^\s*(chmod|chown|find|grep|awk|sed|cat|ls|ps|su|sudo|useradd|usermod|passwd)\s+[-\/\w]/,
  /^\s*[\w.\-]+\s*=\s*[^=]+$/,
  /^\s*(Content-Type|User-Agent|Referer|Host|Cache-Control|Cookie|Set-Cookie|Accept|Connection|Server|Date|Content-Length)\s*:/i,
];
const CODE_STRUCT = [ /[{};]\s*$/, /^\s*[{}]/, /^\s*\d{1,3}(\.\d{1,3}){3}[\s:]/, /\bHTTP\/[012]\.[019]/ ];
function isCodeLine(l){
  const t = l.trim();
  if(!t) return false;
  if(/^[-*•]\s/.test(t) && !/[;{]\s*$/.test(t)) return false;
  if(/^[가-힣]/.test(t) && !/[{};]\s*$/.test(t)) return false;
  if(!CODE_SIGNS.some(re => re.test(l))) return false;
  const ko = (t.match(/[가-힣]/g) || []).length / t.length;
  if(ko > 0.3) return CODE_STRUCT.some(re => re.test(l));
  return true;
}
function groupBlocks(lines){
  const out = [];
  let i = 0;
  while(i < lines.length){
    if(isCodeLine(lines[i])){
      const buf = [];
      while(i < lines.length){
        if(isCodeLine(lines[i])){ buf.push(lines[i]); i++; continue; }
        if(!lines[i].trim()){
          let j = i;
          while(j < lines.length && !lines[j].trim()) j++;
          if(j < lines.length && isCodeLine(lines[j])){ i = j; continue; }
        }
        break;
      }
      out.push({ code: true, lines: buf });
    } else {
      const buf = [];
      while(i < lines.length && !isCodeLine(lines[i])){ buf.push(lines[i]); i++; }
      out.push({ code: false, lines: buf });
    }
  }
  return out;
}
function highlightBlanks(h){
  return h.replace(/\(\s*([A-Za-z]|[0-9]{1,2}|[가-힣])\s*\)/g, '<span class="blank">( $1 )</span>');
}
function formatText(s){
  const src = (s || '').replace(/\r/g, '');
  const parts = src.split(/```/);
  let html = '';
  parts.forEach((part, idx) => {
    if(idx % 2 === 1){
      html += '<pre class="code">' + esc(part.replace(/^\w*\n/, '').replace(/\n$/, '')) + '</pre>';
      return;
    }
    groupBlocks(part.split('\n')).forEach(b => {
      const text = b.lines.join('\n').replace(/^\n+|\n+$/g, '');
      if(!text.trim()) return;
      if(b.code) html += '<pre class="code">' + esc(text) + '</pre>';
      else html += '<div class="prose">' + highlightBlanks(esc(text)) + '</div>';
    });
  });
  return html || '<div class="prose">' + highlightBlanks(esc(src)) + '</div>';
}

function showFatal(msg){
  app.innerHTML = `
    <div style="text-align:center;padding:60px 16px;color:var(--ink-soft)">
      <p style="font-size:1.05rem;font-weight:600;color:var(--ink);margin-bottom:8px">페이지를 불러오지 못했어요</p>
      <p style="font-size:.88rem;margin-bottom:18px">${esc(msg||'')}</p>
      <button onclick="location.reload()" style="font-size:.9rem;font-weight:600;color:#fff;background:var(--accent);border:none;border-radius:8px;padding:10px 20px;cursor:pointer">다시 시도</button>
    </div>`;
}
window.addEventListener('error', e => {
  if(!document.getElementById('app').innerHTML.trim()) showFatal(e && e.message);
});
try{
  if(SHORT.length < SPEC.단답형 || ESSAY_POOL.length < SPEC.서술형 || PRAC_POOL.length < SPEC.실무형)
    showFatal('모의고사를 구성할 문항이 부족합니다.');
  else renderHome();
}catch(e){
  showFatal(e && e.message);
}
