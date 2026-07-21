/* 기출문제 드릴 — 실제 기출(window.GICHUL_DATA) 전 문항을 회차·유형별로 실전처럼 푼다.
   · 단답형   : Enter 채점 (키워드 일치)
   · 서술·실무 : Ctrl(⌘)+Enter 채점 (모범답안 키워드 매칭)
   과목별 통합 드릴과 렌더/채점 로직을 공유하되, 데이터·저장소를 분리한다. */

const app = document.getElementById('app');
const pill = document.getElementById('sessionPill');
let S = null;                 // 현재 세션
let activeKeyJudge = null;     // 판정(1·2·3) 리스너 (재채점 중복 방지)
let activeStarKey = null;      // 복습 담기(S) 단축키 리스너 — 문제 이동 시 교체

const WRONG_KEY  = 'isec_gichul_wrong_v1';
const REVIEW_KEY = 'isec_gichul_review_v1';

/* ============ 데이터: 기출 전 문항 (단답+서술+실무) ============ */
const KIND_ORDER = { '단답형': 0, '서술형': 1, '실무형': 2 };
const QUESTIONS = (window.GICHUL_DATA?.rounds || []).flatMap(r =>
  r.questions.map(q => ({
    key: 'g:' + r.no + '-' + q.num,
    round: r.no,
    num: q.num,
    kind: q.type,                              // 단답형 | 서술형 | 실무형
    label: `${r.no}회 ${q.num}번`,
    q: q.question,
    a: q.answer,
  }))
);
const BY_KEY = Object.fromEntries(QUESTIONS.map(q => [q.key, q]));
const ROUNDS = [...new Set(QUESTIONS.map(q => q.round))].sort((a, b) => a - b);
const TYPES = [
  { id: '단답형', desc: '용어·개념 단답 (Enter 채점)', accent: '#0D6E5F' },
  { id: '서술형', desc: '개념·원리를 문장으로 (Ctrl+Enter)', accent: '#1F5FA6' },
  { id: '실무형', desc: '로그·설정·시나리오 분석 (Ctrl+Enter)', accent: '#9A5B1E' },
];
function isShort(q) { return q.kind === '단답형'; }
// 회차 안에서는 번호 순, 전체는 회차→번호 순
function roundList(no) { return QUESTIONS.filter(q => q.round === no).sort((a, b) => a.num - b.num); }
function typeList(t) { return QUESTIONS.filter(q => q.kind === t); }
function allInOrder() { return QUESTIONS.slice().sort((a, b) => a.round - b.round || a.num - b.num); }

/* ============ 저장소 (샌드박스·시크릿 모드 대비 폴백) ============ */
const memStore = {};
function safeGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
  catch (e) { return (key in memStore) ? memStore[key] : fallback; }
}
function safeSet(key, val) {
  try { localStorage.setItem(key, val); } catch (e) { memStore[key] = val; }
}
function loadWrong() { try { return JSON.parse(safeGet(WRONG_KEY, '[]')); } catch (e) { return []; } }
function saveWrong(arr) { safeSet(WRONG_KEY, JSON.stringify([...new Set(arr)])); }
function markWrong(key) { const w = loadWrong(); w.push(key); saveWrong(w); }
function clearWrong(key) { saveWrong(loadWrong().filter(x => x !== key)); }

// 복습 항목(직접 선택) — 오답 노트와 별개
function loadReview() { try { return JSON.parse(safeGet(REVIEW_KEY, '[]')); } catch (e) { return []; } }
function saveReview(arr) { safeSet(REVIEW_KEY, JSON.stringify([...new Set(arr)])); }
function isReview(key) { return loadReview().includes(key); }
function toggleReview(key) { const s = new Set(loadReview()); if (s.has(key)) s.delete(key); else s.add(key); saveReview([...s]); return s.has(key); }

/* ============ 답안 분리 (모범답안 + 출제 코멘트) ============ */
function isNoteLine(line) {
  return /^\s*[​\s]*([-*※·]|\\\*)/.test(line) && /(니다|참고|참조|http|출제|수험서|획득)/.test(line);
}
function splitAnswer(ans) {
  const lines = (ans || '').split('\n');
  const i = lines.findIndex(isNoteLine);
  if (i < 0) return { body: (ans || '').trim(), note: '' };
  return { body: lines.slice(0, i).join('\n').trim(), note: lines.slice(i).join('\n').trim() };
}

/* ============ 단답형 채점 ============ */
function normShort(str) {
  return (str || '').toLowerCase().replace(/[\s]/g, '')
    .replace(/[()（）.,·、/:;'"`\-_~!?]/g, '').replace(/[은는이가을를와과의로으로및]/g, '');
}
function answerTokens(ans) {
  return (ans || '').split('\n')
    .map(line => line.replace(/^\([A-Za-z0-9]+\)\s*/, '').replace(/^\d+[).]\s*/, '').trim())
    .filter(Boolean);
}
function gradeShort(userInput, ans) {
  const tokens = answerTokens(ans);
  if (!userInput.trim()) return { ratio: 0, hit: 0, total: tokens.length };
  const uNorm = normShort(userInput);
  let hit = 0;
  tokens.forEach(t => {
    const variants = t.split(/[,，]|or|\(|\)|（|）|\//).map(x => normShort(x)).filter(x => x.length >= 1);
    if (variants.some(v => v.length >= 1 && uNorm.includes(v))) hit++;
  });
  return { ratio: tokens.length ? hit / tokens.length : 0, hit, total: tokens.length };
}

/* ============ 서술·실무 채점 (모범답안 키워드 매칭) ============ */
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
function stem(tok) {
  let t = tok;
  if (!/[가-힣]/.test(t)) return t;
  for (let k = 0; k < 3; k++) {
    if (t.length <= 2) break;
    const cut = t.replace(JOSA, '');
    if (cut === t || cut.length < 2) break;
    t = cut;
  }
  return t;
}
function keywordsOf(body) {
  const raw = (body || '').replace(/[^가-힣A-Za-z0-9]+/g, ' ').split(' ').filter(Boolean);
  const out = [], seen = new Set();
  raw.forEach(tok => {
    if (/^\d+$/.test(tok)) return;
    const t = stem(tok);
    if (t.length < 2) return;
    if (STOP.has(t)) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key); out.push(t);
  });
  const CAP = 34;
  if (out.length <= CAP) return out;
  const step = out.length / CAP;
  return Array.from({ length: CAP }, (_, i) => out[Math.floor(i * step)]);
}
function normEssay(str) { return (str || '').toLowerCase().replace(/\s+/g, ''); }
function gradeEssay(userInput, body) {
  const keys = keywordsOf(body);
  const uNorm = normEssay(userInput);
  const hit = [], miss = [];
  keys.forEach(k => (uNorm.includes(normEssay(k)) ? hit : miss).push(k));
  return { hit, miss, total: keys.length, ratio: keys.length ? hit.length / keys.length : 0, chars: userInput.trim().length };
}

/* ============ 세션 ============ */
function shuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }
function startSession(list, mode, label) {
  if (!list.length) return;
  S = { list, i: 0, full: 0, part: 0, none: 0, wrong: [], mode, label };
  renderQuiz();
}

/* ============ 홈 ============ */
function renderHome() {
  const wrong = new Set(loadWrong());
  const wrongN = QUESTIONS.filter(q => wrong.has(q.key)).length;
  const review = new Set(loadReview());
  const reviewN = QUESTIONS.filter(q => review.has(q.key)).length;
  const shortN = typeList('단답형').length;
  const essayN = QUESTIONS.length - shortN;
  pill.textContent = `${QUESTIONS.length} 문항`;

  app.innerHTML = `
  <section class="hero">
    <h1>실제 기출을 <em>회차별로, 실전처럼</em><br>처음부터 끝까지</h1>
    <p>정보보안기사 실기 ${ROUNDS[0]}~${ROUNDS[ROUNDS.length - 1]}회 기출 ${QUESTIONS.length}문항(단답·서술·실무)을 회차 단위로 풀어봅니다. 자동 채점은 참고용이며, 최종 판정은 키보드로 확정하고 틀린 문제는 오답 노트에 저장됩니다.</p>
    <div class="stat-rail">
      <div class="stat"><span class="num">${QUESTIONS.length}</span><span class="lbl">전체 문항</span></div>
      <div class="stat"><span class="num">${ROUNDS.length}</span><span class="lbl">회차</span></div>
      <div class="stat bad"><span class="num">${wrongN}</span><span class="lbl">오답 노트</span></div>
      <div class="stat good"><span class="num">${reviewN}</span><span class="lbl">복습 항목</span></div>
    </div>

    <div class="mode-grid">
      <button class="mode-btn primary" id="mAll">
        <span><span class="t">전체 풀기</span><span class="d">${ROUNDS[0]}회부터 회차·번호 순 (${QUESTIONS.length}문항)</span></span>
        <span class="arrow">→</span>
      </button>
      <button class="mode-btn" id="mShuffle">
        <span><span class="t">랜덤 셔플</span><span class="d">${QUESTIONS.length}문항을 무작위 순서로</span></span>
        <span class="arrow">→</span>
      </button>
      <button class="mode-btn danger" id="mWrong" ${wrongN ? '' : 'disabled'}>
        <span><span class="t">오답만 다시</span><span class="d">${wrongN ? wrongN + '문항 집중 복습' : '아직 오답 노트가 비어 있어요'}</span></span>
        <span class="arrow">→</span>
      </button>
      <button class="mode-btn review" id="mReview" ${reviewN ? '' : 'disabled'}>
        <span><span class="t">⭐ 복습 항목만 풀기</span><span class="d">${reviewN ? '직접 고른 ' + reviewN + '문항만 모아서 공부' : '아직 담은 복습 항목이 없어요 · 문제를 풀며 ☆로 담아보세요'}</span></span>
        <span class="arrow">→</span>
      </button>
    </div>

    <div class="cat-head">
      <span class="cat-eyebrow">ROUND</span>
      <h2 class="cat-title">회차별로 풀기</h2>
      <span style="font-size:.72rem;color:var(--ink-soft);margin-left:auto">한 회차 = 단답 → 서술 → 실무 순</span>
    </div>
    <div class="round-grid">
      ${ROUNDS.map(no => {
        const cl = roundList(no);
        const w = cl.filter(q => wrong.has(q.key)).length;
        return `<button class="round-btn" data-round="${no}">
          <span class="r-no">${no}회</span>
          <span class="r-cnt">${cl.length}문항</span>
          ${w ? `<span class="r-w">오답 ${w}</span>` : ''}
        </button>`;
      }).join('')}
    </div>

    <div class="cat-head">
      <span class="cat-eyebrow">TYPE</span>
      <h2 class="cat-title">유형별로 풀기</h2>
      <span style="font-size:.72rem;color:var(--ink-soft);margin-left:auto">카드: 순서대로 · <b style="color:var(--ink)">⤮</b> 셔플</span>
    </div>
    <div class="cat-grid">
      ${TYPES.map(t => {
        const cl = typeList(t.id);
        const w = cl.filter(q => wrong.has(q.key)).length;
        return `<div class="cat-btn" style="--ca:${t.accent}">
          <span class="cat-bar"></span>
          <button class="cat-body" data-type="${t.id}" data-mode="order">
            <span class="cat-name">${t.id}</span>
            <span class="cat-desc">${t.desc}</span>
          </button>
          <span class="cat-meta"><span class="cat-count">${cl.length}</span>${w ? `<span class="cat-wrong">오답 ${w}</span>` : ''}</span>
          <button class="cat-shuffle" data-type="${t.id}" data-mode="shuffle" title="${t.id} 셔플로 풀기" aria-label="${t.id} 무작위 순서로 풀기">⤮</button>
        </div>`;
      }).join('')}
    </div>

    <p class="note">단답형은 답을 입력하고 <b>Enter</b>로, 서술·실무형은 <b>Ctrl(⌘)+Enter</b>로 채점합니다. 최종 판정은 키보드로 확정 — 단답형 <b>1</b>(정답)·<b>2</b>(오답), 서술·실무형 <b>1</b>(충분)·<b>2</b>(부분)·<b>3</b>(못 씀). 풀면서 <b>S</b> 키로 현재 문제를 복습 항목에 담을 수 있어요.</p>
  </section>`;

  document.getElementById('mAll').onclick = () => startSession(allInOrder(), 'all', '전체 기출');
  document.getElementById('mShuffle').onclick = () => startSession(shuffle(QUESTIONS), 'shuffle', '랜덤 셔플');
  document.getElementById('mWrong').onclick = () => {
    const set = new Set(loadWrong());
    startSession(shuffle(QUESTIONS.filter(q => set.has(q.key))), 'wrong', '오답 노트');
  };
  document.getElementById('mReview').onclick = () => {
    const set = new Set(loadReview());
    startSession(allInOrder().filter(q => set.has(q.key)), 'review', '복습 항목');
  };
  document.querySelectorAll('.round-btn').forEach(btn => {
    btn.onclick = () => { const no = +btn.dataset.round; startSession(roundList(no), 'round', `${no}회 기출`); };
  });
  document.querySelectorAll('.cat-body[data-type], .cat-shuffle[data-type]').forEach(btn => {
    btn.onclick = () => {
      const t = btn.dataset.type;
      const sh = btn.dataset.mode === 'shuffle';
      const list = typeList(t);
      startSession(sh ? shuffle(list) : list, sh ? 'type-shuffle' : 'type', t + (sh ? ' · 셔플' : ''));
    };
  });
}

/* ============ 퀴즈 공통 골격 ============ */
function quizTop(q) {
  const total = S.list.length;
  return `
    <div class="quiz-top">
      <div class="q-tag">${String(S.i + 1).padStart(2, '0')}<span class="of"> / ${total}</span></div>
      <div class="quiz-top-actions">
        <button class="star-btn" id="starBtn" aria-pressed="false"></button>
        <button class="quit" id="quitBtn">그만두기</button>
      </div>
    </div>
    <div class="rail"><div class="fill" style="width:${Math.round(S.i / total * 100)}%"></div></div>
    <div class="score-line"><span class="o">정답 ${S.full}</span><span class="mid">부분 ${S.part}</span><span class="x">오답 ${S.none}</span></div>`;
}
function cardHead(q) {
  return `<span class="num-chip">${q.label}</span><span class="cat-chip">${q.kind}</span>`;
}
function bindStar(q) {
  const starBtn = document.getElementById('starBtn');
  if (!starBtn) return;
  starBtn.title = '복습 항목에 담기 · 빼기 (단축키 S)';
  const paint = () => {
    const on = isReview(q.key);
    starBtn.classList.toggle('on', on);
    starBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    starBtn.textContent = on ? '★ 복습 항목 (S)' : '☆ 복습 담기 (S)';
  };
  paint();
  starBtn.onclick = () => { toggleReview(q.key); paint(); };
  if (activeStarKey) document.removeEventListener('keydown', activeStarKey);
  activeStarKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
    if (e.code === 'KeyS' || e.key === 's' || e.key === 'S') { e.preventDefault(); toggleReview(q.key); paint(); }
  };
  document.addEventListener('keydown', activeStarKey);
}

function renderQuiz() {
  pill.textContent = S.label;
  const q = S.list[S.i];
  if (isShort(q)) renderShortQuiz(q);
  else renderEssayQuiz(q);
}

/* ---------- 단답형 화면 ---------- */
function renderShortQuiz(q) {
  const { body, note } = splitAnswer(q.a);
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
        <div class="a-text" id="modelAns"></div>
        ${note ? `<details class="note-box"><summary>출제 코멘트 · 참고</summary><div class="note-text"></div></details>` : ''}
        <div id="gradeMsg" class="grade-msg"></div>
        <div class="actions" id="verdictRow">
          <button class="btn btn-o" id="markO"><span class="key">1</span> 맞았어요<small>정답 처리</small></button>
          <button class="btn btn-x" id="markX"><span class="key">2</span> 틀렸어요<small>오답 노트에 저장</small></button>
        </div>
      </div>
    </article>`;

  document.getElementById('qText').innerHTML = formatText(q.q);
  document.getElementById('modelAns').innerHTML = formatText(body);
  if (note) document.querySelector('.note-text').innerHTML = formatText(note);
  const ta = document.getElementById('userAns');
  ta.focus();
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doCheck(); } });
  document.getElementById('checkBtn').onclick = doCheck;
  document.getElementById('revealBtn').onclick = () => revealShort(null, '');
  document.getElementById('quitBtn').onclick = () => showConfirm('지금까지 푼 결과를 보고 종료할까요?', renderResult);
  bindStar(q);

  function doCheck() { revealShort(gradeShort(ta.value, body), ta.value); }
}

function revealShort(grade, userVal) {
  document.getElementById('inputArea').style.display = 'none';
  document.getElementById('ansBox').classList.add('show');
  document.getElementById('myAnsWrap').style.display = 'block';
  const myText = document.getElementById('myAnsText');
  if (userVal && userVal.trim()) myText.textContent = userVal;
  else myText.innerHTML = '<span style="color:var(--ink-soft);font-weight:400">(입력 없음 · 정답만 확인)</span>';

  const msg = document.getElementById('gradeMsg');
  if (grade === null) {
    msg.innerHTML = `<span style="color:var(--ink-soft)">정답을 확인하고 스스로 채점하세요.</span>`;
  } else {
    const p = Math.round(grade.ratio * 100);
    if (grade.ratio >= 0.999) msg.innerHTML = `<span style="color:var(--accent);font-weight:600">자동 채점: 핵심 키워드 ${grade.hit}/${grade.total} 일치 (${p}%) — 정답으로 보입니다.</span>`;
    else if (grade.ratio > 0) msg.innerHTML = `<span style="color:var(--warn);font-weight:600">자동 채점: ${grade.hit}/${grade.total} 일치 (${p}%)</span> <span style="color:var(--ink-soft)">— 정답과 비교 후 직접 확정하세요.</span>`;
    else msg.innerHTML = `<span style="color:var(--warn);font-weight:600">자동 채점: 일치하는 키워드를 찾지 못했어요.</span> <span style="color:var(--ink-soft)">표기 차이일 수 있으니 직접 확인하세요.</span>`;
  }
  msg.innerHTML += `<div style="margin-top:8px;font-size:.74rem;color:var(--ink-soft)">키보드 <b>1</b> 정답 · <b>2</b> 오답 · <b>S</b> 복습 담기</div>`;

  document.getElementById('markO').onclick = () => decide('full');
  document.getElementById('markX').onclick = () => decide('none');
  if (activeKeyJudge) { document.removeEventListener('keydown', activeKeyJudge); activeKeyJudge = null; }
  function decide(v) { document.removeEventListener('keydown', keyJudge); activeKeyJudge = null; next(v); }
  function keyJudge(e) {
    if (e.target && e.target.tagName === 'TEXTAREA') return;
    if (e.key === '1') { e.preventDefault(); decide('full'); }
    else if (e.key === '2') { e.preventDefault(); decide('none'); }
  }
  activeKeyJudge = keyJudge;
  document.addEventListener('keydown', keyJudge);
}

/* ---------- 서술·실무형 화면 ---------- */
function renderEssayQuiz(q) {
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
          <button class="btn btn-o" id="markO"><span class="key">1</span> 충분히 씀<small>오답 노트에서 제외</small></button>
          <button class="btn btn-mid" id="markM"><span class="key">2</span> 부분 점수<small>오답 노트에 저장</small></button>
          <button class="btn btn-x" id="markX"><span class="key">3</span> 못 씀<small>오답 노트에 저장</small></button>
        </div>
      </div>
    </article>`;

  document.getElementById('qText').innerHTML = formatText(q.q);
  document.getElementById('modelAns').innerHTML = formatText(body);
  if (note) document.querySelector('.note-text').innerHTML = formatText(note);

  const ta = document.getElementById('userAns');
  const cnt = document.getElementById('charCnt');
  ta.focus();
  ta.addEventListener('input', () => { cnt.textContent = `${ta.value.trim().length}자`; });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doCheck(); } });
  document.getElementById('checkBtn').onclick = doCheck;
  document.getElementById('revealBtn').onclick = () => revealEssay(null, '', body);
  document.getElementById('quitBtn').onclick = () => showConfirm('지금까지 푼 결과를 보고 종료할까요?', renderResult);

  const meTa = document.getElementById('myAnsEdit');
  meTa.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doRegrade(); } });
  document.getElementById('regradeBtn').onclick = doRegrade;
  bindStar(q);

  function doCheck() { revealEssay(gradeEssay(ta.value, body), ta.value, body); }
  function doRegrade() { revealEssay(gradeEssay(meTa.value, body), meTa.value, body); }
}

function revealEssay(grade, userVal, body) {
  document.getElementById('inputArea').style.display = 'none';
  document.getElementById('ansBox').classList.add('show');
  document.getElementById('myAnsWrap').style.display = 'block';
  const meTa = document.getElementById('myAnsEdit');
  if (typeof userVal === 'string') meTa.value = userVal;

  const msg = document.getElementById('gradeMsg');
  if (grade === null) {
    msg.innerHTML = `<span style="color:var(--ink-soft)">모범답안을 읽고 스스로 판정하세요.</span>`;
  } else {
    const p = Math.round(grade.ratio * 100);
    const tone = grade.ratio >= 0.6 ? 'var(--accent)' : 'var(--warn)';
    const verdict = grade.ratio >= 0.6 ? '핵심을 대체로 담았습니다.' : grade.ratio >= 0.3 ? '핵심 일부가 빠졌습니다.' : '핵심 키워드가 많이 빠졌습니다.';
    msg.innerHTML = `
      <div style="color:${tone};font-weight:600">키워드 채점: ${grade.hit.length}/${grade.total} (${p}%) — ${verdict}</div>
      <div style="color:var(--ink-soft);font-size:.78rem;margin-top:4px">서술형은 표현이 달라도 정답일 수 있어요. 모범답안과 비교해 직접 판정하세요. (작성 ${grade.chars}자)</div>
      ${grade.miss.length ? `<div class="kw-wrap"><span class="kw-lbl">빠진 키워드</span>${grade.miss.map(k => `<span class="kw miss">${esc(k)}</span>`).join('')}</div>` : ''}
      ${grade.hit.length ? `<div class="kw-wrap"><span class="kw-lbl">포함된 키워드</span>${grade.hit.map(k => `<span class="kw hit">${esc(k)}</span>`).join('')}</div>` : ''}`;
  }
  msg.innerHTML += `<div style="margin-top:8px;font-size:.74rem;color:var(--ink-soft)">키보드 <b>1</b> 충분히 씀 · <b>2</b> 부분 점수 · <b>3</b> 못 씀 · <b>S</b> 복습 담기</div>`;

  document.getElementById('markO').onclick = () => decide('full');
  document.getElementById('markM').onclick = () => decide('part');
  document.getElementById('markX').onclick = () => decide('none');
  if (activeKeyJudge) { document.removeEventListener('keydown', activeKeyJudge); activeKeyJudge = null; }
  function decide(v) { document.removeEventListener('keydown', keyJudge); activeKeyJudge = null; next(v); }
  function keyJudge(e) {
    if (e.target && e.target.tagName === 'TEXTAREA') return;
    if (e.key === '1') { e.preventDefault(); decide('full'); }
    else if (e.key === '2') { e.preventDefault(); decide('part'); }
    else if (e.key === '3') { e.preventDefault(); decide('none'); }
  }
  activeKeyJudge = keyJudge;
  document.addEventListener('keydown', keyJudge);
}

/* ============ 다음 문제 ============ */
function next(verdict) {
  const q = S.list[S.i];
  if (verdict === 'full') { S.full++; clearWrong(q.key); }
  else {
    if (verdict === 'part') S.part++; else S.none++;
    S.wrong.push({ key: q.key, verdict });
    markWrong(q.key);
  }
  S.i++;
  if (activeStarKey) { document.removeEventListener('keydown', activeStarKey); activeStarKey = null; }
  if (S.i >= S.list.length) renderResult();
  else renderQuiz();
}

/* ============ 결과 ============ */
function renderResult() {
  if (activeStarKey) { document.removeEventListener('keydown', activeStarKey); activeStarKey = null; }
  const done = S.full + S.part + S.none;
  const pct = done ? Math.round((S.full + S.part * 0.5) / done * 100) : 0;
  pill.textContent = '결과';

  let verdict, sub;
  if (pct >= 85) { verdict = '합격권 답안력'; sub = '이 회차 기출은 든든합니다.'; }
  else if (pct >= 60) { verdict = '부분 점수는 확보'; sub = '오답 노트를 한 번 더 돌리면 만점권입니다.'; }
  else if (pct >= 35) { verdict = '뼈대는 있습니다'; sub = '틀린 문제를 모아 반복 학습하세요.'; }
  else { verdict = '지금이 시작점'; sub = '모범답안을 보며 개념과 답안 틀을 익히세요.'; }

  const details = S.wrong.map(w => {
    const q = BY_KEY[w.key];
    const { body } = splitAnswer(q.a);
    const vlabel = w.verdict === 'part' ? '부분' : (isShort(q) ? '오답' : '못씀');
    return `<details class="wrong-item">
      <summary>${q.label} · ${q.kind} <span class="v-chip ${w.verdict}">${vlabel}</span></summary>
      <div class="wq">${esc(q.q)}</div>
      <div class="wa">${isShort(q) ? '정답' : '모범답안'} · ${esc(body)}</div>
    </details>`;
  }).join('');

  app.innerHTML = `
    <div class="result-hero">
      <div class="big">${S.full}<span class="pct"> / ${done}</span></div>
      <div class="big" style="font-size:1.3rem;color:var(--accent)">${pct}%<span style="font-size:.8rem;color:var(--ink-soft);font-weight:500"> · 부분 ${S.part}개 0.5점 환산</span></div>
      <h2>${verdict}</h2>
      <p>${sub}</p>
    </div>
    ${S.wrong.length
      ? `<div class="wrong-list"><h3>틀린 문제 ${S.wrong.length}개 · 오답 노트에 저장됨</h3>${details}</div>`
      : `<p style="text-align:center;color:var(--accent);font-weight:600">모두 정답/충분 — 완벽합니다.</p>`}
    <div class="result-actions">
      ${S.wrong.length ? `<button class="mode-btn danger" id="rWrong"><span><span class="t">방금 틀린 문제만</span><span class="d">${S.wrong.length}문항 즉시 재도전</span></span><span class="arrow">→</span></button>` : ''}
      <button class="mode-btn" id="rRetry"><span><span class="t">같은 세트 다시 풀기</span></span><span class="arrow">↻</span></button>
      <button class="mode-btn" id="rHome"><span><span class="t">처음 화면으로</span></span><span class="arrow">⌂</span></button>
    </div>`;

  document.querySelectorAll('.wrong-item').forEach((el, idx) => {
    const q = BY_KEY[S.wrong[idx].key];
    const { body } = splitAnswer(q.a);
    el.querySelector('.wq').innerHTML = formatText(q.q);
    el.querySelector('.wa').innerHTML = (isShort(q) ? '<b>정답</b><br>' : '<b>모범답안</b><br>') + formatText(body);
  });

  if (S.wrong.length) {
    document.getElementById('rWrong').onclick = () => {
      const list = S.wrong.map(w => BY_KEY[w.key]);
      startSession(shuffle(list), 'wrong', '방금 틀린 문제');
    };
  }
  document.getElementById('rRetry').onclick = () => {
    const re = S.mode.includes('shuffle') || S.mode === 'wrong';
    startSession(re ? shuffle(S.list) : S.list.slice(), S.mode, S.label);
  };
  document.getElementById('rHome').onclick = renderHome;
}

/* ============ 유틸 ============ */
function showConfirm(message, onYes) {
  const old = document.getElementById('confirmOverlay');
  if (old) old.remove();
  const overlay = document.createElement('div');
  overlay.id = 'confirmOverlay';
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <p class="confirm-msg">${esc(message)}</p>
      <div class="confirm-actions">
        <button class="confirm-btn confirm-cancel" id="confirmCancel">계속 풀기</button>
        <button class="confirm-btn confirm-ok" id="confirmOk">종료하기</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.getElementById('confirmCancel').onclick = close;
  document.getElementById('confirmOk').onclick = () => { close(); onYes(); };
}

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/* ---------- 코드·로그 블록 인식 (서술·실무 지문 가독성) ---------- */
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
const CODE_STRUCT = [/[{};]\s*$/, /^\s*[{}]/, /^\s*\d{1,3}(\.\d{1,3}){3}[\s:]/, /\bHTTP\/[012]\.[019]/];
function isCodeLine(l) {
  const t = l.trim();
  if (!t) return false;
  if (/^[-*•]\s/.test(t) && !/[;{]\s*$/.test(t)) return false;
  if (/^[가-힣]/.test(t) && !/[{};]\s*$/.test(t)) return false;
  if (!CODE_SIGNS.some(re => re.test(l))) return false;
  const ko = (t.match(/[가-힣]/g) || []).length / t.length;
  if (ko > 0.3) return CODE_STRUCT.some(re => re.test(l));
  return true;
}
function groupBlocks(lines) {
  const out = []; let i = 0;
  while (i < lines.length) {
    if (isCodeLine(lines[i])) {
      const buf = [];
      while (i < lines.length) {
        if (isCodeLine(lines[i])) { buf.push(lines[i]); i++; continue; }
        if (!lines[i].trim()) { let j = i; while (j < lines.length && !lines[j].trim()) j++; if (j < lines.length && isCodeLine(lines[j])) { i = j; continue; } }
        break;
      }
      out.push({ code: true, lines: buf });
    } else {
      const buf = [];
      while (i < lines.length && !isCodeLine(lines[i])) { buf.push(lines[i]); i++; }
      out.push({ code: false, lines: buf });
    }
  }
  return out;
}
function highlightBlanks(h) { return h.replace(/\(\s*([A-Za-z]|[0-9]{1,2}|[가-힣])\s*\)/g, '<span class="blank">( $1 )</span>'); }
function formatText(s) {
  const src = (s || '').replace(/\r/g, '');
  const parts = src.split(/```/);
  let html = '';
  parts.forEach((part, idx) => {
    if (idx % 2 === 1) { html += '<pre class="code">' + esc(part.replace(/^\w*\n/, '').replace(/\n$/, '')) + '</pre>'; return; }
    groupBlocks(part.split('\n')).forEach(b => {
      const text = b.lines.join('\n').replace(/^\n+|\n+$/g, '');
      if (!text.trim()) return;
      if (b.code) html += '<pre class="code">' + esc(text) + '</pre>';
      else html += '<div class="prose">' + highlightBlanks(esc(text)) + '</div>';
    });
  });
  return html || '<div class="prose">' + highlightBlanks(esc(src)) + '</div>';
}

function showFatal(msg) {
  app.innerHTML = `
    <div style="text-align:center;padding:60px 16px;color:var(--ink-soft)">
      <p style="font-size:1.05rem;font-weight:600;color:var(--ink);margin-bottom:8px">페이지를 불러오지 못했어요</p>
      <p style="font-size:.88rem;margin-bottom:18px">${esc(msg || '')}</p>
      <button onclick="location.reload()" style="font-size:.9rem;font-weight:600;color:#fff;background:var(--accent);border:none;border-radius:8px;padding:10px 20px;cursor:pointer">다시 시도</button>
    </div>`;
}
window.addEventListener('error', e => { if (!document.getElementById('app').innerHTML.trim()) showFatal(e && e.message); });
try {
  if (!QUESTIONS.length) showFatal('기출 문항을 찾지 못했습니다.');
  else renderHome();
} catch (e) { showFatal(e && e.message); }
