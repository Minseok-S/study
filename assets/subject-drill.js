/* 과목별 통합 드릴 — 한 과목 안에서 단답형 + 서술형·실무형을 한 번에 푼다.
   · 단답형   : window.QUESTIONS (단답형 드릴과 동일한 큐레이션 세트, 과목 c 보유)
   · 서술·실무 : window.GICHUL_DATA 의 비(非)단답형 문항 (아래 CAT_MAP 으로 과목 분류) */

const app = document.getElementById('app');
const pill = document.getElementById('sessionPill');
let S = null;                // 현재 세션
let activeKeyJudge = null;    // 화면에 붙어 있는 판정 리스너 (재채점 중복 방지)
let activeStarKey = null;     // 복습 담기(S) 단축키 리스너 — 문제 이동 시 교체

const WRONG_KEY = 'isec_subject_wrong_v1';

/* 과목(분야) — 단답형·서술형 드릴과 동일한 5개 체계 */
const CATS = [
  {id:'sys',  name:'시스템 보안',            desc:'리눅스·유닉스·윈도우, 계정·권한, 로그', accent:'#0D6E5F'},
  {id:'net',  name:'네트워크 보안',          desc:'TCP/IP, DNS, IPSec, 스캔·스니핑, 방화벽', accent:'#1F5FA6'},
  {id:'app',  name:'애플리케이션 보안',      desc:'웹 취약점, SQLi·XSS, 파일 업로드, DB·메일', accent:'#9A5B1E'},
  {id:'soc',  name:'보안관제·침해사고 대응', desc:'IDS·Snort, 포렌식, 악성코드 분석', accent:'#7A3FA6'},
  {id:'risk', name:'위험관리·법규',          desc:'위험분석, ISMS-P, 개인정보보호법, BCP', accent:'#B4452E'},
];
const CAT_NAME = Object.fromEntries(CATS.map(c => [c.id, c.name]));

/* 기출 서술형·실무형 108문항의 과목 분류 (키 = "회차-번호") — 서술·실무 드릴과 동일 */
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
  '31-13':'risk','31-14':'app','31-15':'risk','31-16':'net','31-17':'app','31-18':'app',
};

/* ============ 데이터 통합 ============ */
// 단답형: 추천문제(r:true)는 제외하고 기출만
const SHORT = (window.QUESTIONS || [])
  .filter(q => !q.r)
  .map(q => ({
    key: 'sa:' + q.n,
    kind: '단답형',
    cat: q.c || 'sys',
    label: 'Q-' + String(q.n).padStart(3, '0'),
    sort: 0,           // 과목 안에서 단답형을 앞에
    ord: Number(q.n) || 0,
    q: q.q,
    a: q.a,
  }));

// 서술형·실무형: 기출 데이터에서 단답형을 제외
const ESSAY = (window.GICHUL_DATA?.rounds || []).flatMap(r =>
  r.questions
    .filter(q => q.type !== '단답형')
    .map(q => ({
      key: 'g:' + r.no + '-' + q.num,
      kind: q.type,                              // 서술형 | 실무형
      cat: CAT_MAP[`${r.no}-${q.num}`] || 'sys',
      label: `${r.no}회 ${q.num}번`,
      sort: q.type === '서술형' ? 1 : 2,          // 서술형 → 실무형 순
      ord: r.no * 100 + q.num,
      round: r.no,
      q: q.question,
      a: q.answer,
    }))
);

const QUESTIONS = [...SHORT, ...ESSAY];
const BY_KEY = Object.fromEntries(QUESTIONS.map(q => [q.key, q]));
function isShort(q){ return q.kind === '단답형'; }

// 과목 안에서 단답형 → 서술형 → 실무형, 그 안에서는 번호/회차 순
function subjectList(catId){
  return QUESTIONS
    .filter(q => q.cat === catId)
    .sort((a, b) => a.sort - b.sort || a.ord - b.ord);
}

/* ============ 저장소 (샌드박스·시크릿 모드 대비 폴백) ============ */
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

// ── 복습 항목(직접 선택) ──────────────────────────────────
// 자동 오답 노트(오답/부분)와 별개로, 사용자가 직접 골라 담는 복습 목록.
const REVIEW_KEY = 'isec_subject_review_v1';
function loadReview(){ try{ return JSON.parse(safeGet(REVIEW_KEY, '[]')); }catch(e){ return []; } }
function saveReview(arr){ safeSet(REVIEW_KEY, JSON.stringify([...new Set(arr)])); }
function isReview(key){ return loadReview().includes(key); }
function toggleReview(key){ const s = new Set(loadReview()); if(s.has(key)) s.delete(key); else s.add(key); saveReview([...s]); return s.has(key); }

/* ============ 단답형 채점 (short-answer 방식) ============ */
function normShort(str){
  return (str || '')
    .toLowerCase()
    .replace(/[\s]/g, '')
    .replace(/[()（）.,·、/:;'"`\-_~!?]/g, '')
    .replace(/[은는이가을를와과의로으로및]/g, '');
}
function answerTokens(ans){
  return (ans || '')
    .split('\n')
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

/* ============ 서술·실무 채점 (essay 방식: 모범답안 키워드 매칭) ============ */
function isNoteLine(line){
  return /^\s*[​\s]*([-*※·]|\\\*)/.test(line) && /(니다|참고|참조|http|출제|수험서|획득)/.test(line);
}
function splitAnswer(ans){
  const lines = (ans || '').split('\n');
  const i = lines.findIndex(isNoteLine);
  if(i < 0) return {body: (ans || '').trim(), note: ''};
  return {
    body: lines.slice(0, i).join('\n').trim(),
    note: lines.slice(i).join('\n').trim(),
  };
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
  return {
    hit, miss,
    total: keys.length,
    ratio: keys.length ? hit.length / keys.length : 0,
    chars: userInput.trim().length,
  };
}

/* ============ 세션 ============ */
function shuffle(a){ const r = a.slice(); for(let i=r.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [r[i],r[j]]=[r[j],r[i]]; } return r; }

function startSession(list, mode, label){
  if(!list.length) return;
  S = { list, i:0, full:0, part:0, none:0, wrong:[], mode, label };
  renderQuiz();
}

/* ============ 홈 ============ */
function renderHome(){
  const wrong = new Set(loadWrong());
  const wrongN = QUESTIONS.filter(q => wrong.has(q.key)).length;
  const reviewSet = new Set(loadReview());
  const reviewN = QUESTIONS.filter(q => reviewSet.has(q.key)).length;
  const shortN = SHORT.length, essayN = ESSAY.length;
  pill.textContent = `${QUESTIONS.length} 문항`;

  app.innerHTML = `
  <section class="hero">
    <h1>과목 하나를 <em>단답부터 서술·실무까지</em><br>한 번에 끝낸다</h1>
    <p>과목을 고르면 그 분야의 단답형 기출과 서술·실무형 기출이 한 세트로 이어집니다. 개념 암기(단답)로 몸을 풀고, 바로 그 과목의 서술·실무형까지 손으로 써보며 마무리하세요.</p>
    <div class="stat-rail">
      <div class="stat"><span class="num">${QUESTIONS.length}</span><span class="lbl">전체 문항</span></div>
      <div class="stat"><span class="num">${shortN}</span><span class="lbl">단답형</span></div>
      <div class="stat"><span class="num">${essayN}</span><span class="lbl">서술·실무형</span></div>
      <div class="stat bad"><span class="num">${wrongN}</span><span class="lbl">오답 노트</span></div>
    </div>

    <div class="cat-head">
      <span class="cat-eyebrow">SUBJECT</span>
      <h2 class="cat-title">과목별로 풀기 <span style="font-weight:500;font-size:.8rem;color:var(--ink-soft)">단답 → 서술·실무 순</span></h2>
      <span style="font-size:.72rem;color:var(--ink-soft);margin-left:auto">카드: 순서대로 · <b style="color:var(--ink)">⤮</b> 셔플 · ☑ 여러 과목</span>
    </div>
    <div class="cat-grid">
      ${CATS.map(c => {
        const cl = subjectList(c.id);
        const s = cl.filter(isShort).length;
        const e = cl.length - s;
        const w = cl.filter(q => wrong.has(q.key)).length;
        return `<div class="cat-btn" style="--ca:${c.accent}" data-card="${c.id}">
          <span class="cat-bar"></span>
          <label class="cat-pick" title="여러 과목 함께 풀기"><input type="checkbox" class="pick" data-cat="${c.id}"></label>
          <button class="cat-body" data-cat="${c.id}" data-mode="order">
            <span class="cat-name">${c.name}</span>
            <span class="cat-desc">${c.desc}</span>
            <span class="cat-mix">단답 ${s} · 서술·실무 ${e}</span>
          </button>
          <span class="cat-meta"><span class="cat-count">${cl.length}</span>${w ? `<span class="cat-wrong">오답 ${w}</span>` : ''}</span>
          <button class="cat-shuffle" data-cat="${c.id}" data-mode="shuffle" title="${c.name} 셔플로 풀기" aria-label="${c.name} 무작위 순서로 풀기">⤮</button>
        </div>`;
      }).join('')}
    </div>
    <div class="combo-bar" id="comboBar" hidden>
      <span class="combo-info" id="comboInfo"></span>
      <div class="combo-actions">
        <button class="combo-clear" id="comboClear">선택 해제</button>
        <button id="comboOrder">순서대로</button>
        <button class="primary" id="comboShuffle">셔플로 풀기</button>
      </div>
    </div>

    <div class="cat-head">
      <span class="cat-eyebrow">ALL</span>
      <h2 class="cat-title">과목 구분 없이 풀기</h2>
    </div>
    <div class="mode-grid">
      <button class="mode-btn primary" id="mAll">
        <span><span class="t">전체 통합 풀기</span><span class="d">과목 순 · 단답 먼저 (${QUESTIONS.length}문항)</span></span>
        <span class="arrow">→</span>
      </button>
      <button class="mode-btn" id="mShuffle">
        <span><span class="t">랜덤 셔플</span><span class="d">${QUESTIONS.length}문항을 유형 섞어 무작위로</span></span>
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

    <p class="note">단답형은 답을 입력하고 <b>Enter</b>로, 서술·실무형은 <b>Ctrl(⌘)+Enter</b>로 채점합니다. 자동 채점은 참고용이며 최종 판정은 키보드로 확정합니다 — 단답형 <b>1</b>(정답)·<b>2</b>(오답), 서술·실무형 <b>1</b>(충분)·<b>2</b>(부분)·<b>3</b>(못 씀). 부분·오답은 이 드릴 전용 오답 노트에 저장됩니다.</p>
  </section>`;

  document.getElementById('mAll').onclick = () =>
    startSession(CATS.flatMap(c => subjectList(c.id)), 'all', '전체 통합');
  document.getElementById('mShuffle').onclick = () =>
    startSession(shuffle(QUESTIONS), 'shuffle', '랜덤 셔플');
  document.getElementById('mWrong').onclick = () => {
    const set = new Set(loadWrong());
    startSession(shuffle(QUESTIONS.filter(q => set.has(q.key))), 'wrong', '오답 노트');
  };
  document.getElementById('mReview').onclick = () => {
    const set = new Set(loadReview());
    // 복습 항목도 과목 순 · 단답 먼저 순서를 유지
    startSession(CATS.flatMap(c => subjectList(c.id)).filter(q => set.has(q.key)), 'review', '복습 항목');
  };
  document.querySelectorAll('.cat-body[data-cat], .cat-shuffle[data-cat]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.cat;
      const sh = btn.dataset.mode === 'shuffle';
      const list = subjectList(id);
      startSession(sh ? shuffle(list) : list, sh ? 'cat-shuffle' : 'cat', CAT_NAME[id] + (sh ? ' · 셔플' : ''));
    };
  });

  /* ---- 여러 과목 함께 풀기 (선택 과목의 단답 → 서술·실무 순) ---- */
  const picked = new Set();
  const bar = document.getElementById('comboBar');
  const info = document.getElementById('comboInfo');
  function refreshCombo(){
    const ids = CATS.filter(c => picked.has(c.id)).map(c => c.id);
    const cnt = QUESTIONS.filter(q => picked.has(q.cat)).length;
    if(ids.length){
      bar.hidden = false;
      info.innerHTML = `<b>${ids.length}과목</b> 선택 · ${cnt}문항 &nbsp;<span style="color:var(--ink-soft);font-weight:500">${ids.map(id => CAT_NAME[id]).join(' · ')}</span>`;
    }else{
      bar.hidden = true;
    }
  }
  function comboLabel(){
    const names = CATS.filter(c => picked.has(c.id)).map(c => CAT_NAME[c.id]);
    return names.length <= 2 ? names.join(' + ') : `${names.length}과목 선택`;
  }
  function startCombo(sh){
    // 순서대로: 선택 과목을 CATS 순으로, 각 과목 안에서는 단답 → 서술·실무 순
    let list = CATS.filter(c => picked.has(c.id)).flatMap(c => subjectList(c.id));
    if(!list.length) return;
    startSession(sh ? shuffle(list) : list, sh ? 'multi-shuffle' : 'multi', comboLabel() + (sh ? ' · 셔플' : ''));
  }
  document.querySelectorAll('.pick').forEach(chk => {
    chk.onchange = () => {
      const id = chk.dataset.cat;
      if(chk.checked) picked.add(id); else picked.delete(id);
      chk.closest('.cat-btn').classList.toggle('picked', chk.checked);
      refreshCombo();
    };
  });
  document.getElementById('comboClear').onclick = () => {
    picked.clear();
    document.querySelectorAll('.pick').forEach(c => { c.checked = false; c.closest('.cat-btn').classList.remove('picked'); });
    refreshCombo();
  };
  document.getElementById('comboOrder').onclick = () => startCombo(false);
  document.getElementById('comboShuffle').onclick = () => startCombo(true);
}

/* ============ 퀴즈 공통 골격 ============ */
function quizTop(q){
  const total = S.list.length;
  return `
    <div class="quiz-top">
      <div class="q-tag">${String(S.i+1).padStart(2,'0')}<span class="of"> / ${total}</span></div>
      <div class="quiz-top-actions">
        <button class="star-btn" id="starBtn" aria-pressed="false"></button>
        <button class="quit" id="quitBtn">그만두기</button>
      </div>
    </div>
    <div class="rail"><div class="fill" style="width:${Math.round(S.i/total*100)}%"></div></div>
    <div class="score-line"><span class="o">정답 ${S.full}</span><span class="mid">부분 ${S.part}</span><span class="x">오답 ${S.none}</span></div>`;
}
function bindStar(q){
  const starBtn = document.getElementById('starBtn');
  if(!starBtn) return;
  starBtn.title = '복습 항목에 담기 · 빼기 (단축키 S)';
  const paint = () => {
    const on = isReview(q.key);
    starBtn.classList.toggle('on', on);
    starBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    starBtn.textContent = on ? '★ 복습 항목 (S)' : '☆ 복습 담기 (S)';
  };
  paint();
  starBtn.onclick = () => { toggleReview(q.key); paint(); };
  // 단축키 S — 입력창 타이핑 중이거나 Ctrl/⌘/Alt 조합일 땐 무시
  if(activeStarKey) document.removeEventListener('keydown', activeStarKey);
  activeStarKey = (e) => {
    if(e.ctrlKey || e.metaKey || e.altKey) return;
    if(e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
    if(e.code === 'KeyS' || e.key === 's' || e.key === 'S'){
      e.preventDefault();
      toggleReview(q.key);
      paint();
    }
  };
  document.addEventListener('keydown', activeStarKey);
}
function cardHead(q){
  return `<span class="num-chip">${q.label}</span><span class="cat-chip">${q.kind}</span><span class="cat-chip">${CAT_NAME[q.cat]||''}</span>`;
}

function renderQuiz(){
  pill.textContent = S.label;
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
          <button class="btn btn-o" id="markO"><span class="key">1</span> 맞았어요<small>정답 처리</small></button>
          <button class="btn btn-x" id="markX"><span class="key">2</span> 틀렸어요<small>오답 노트에 저장</small></button>
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
  document.getElementById('quitBtn').onclick = () => showConfirm('지금까지 푼 결과를 보고 종료할까요?', renderResult);
  bindStar(q);

  function doCheck(){
    const val = ta.value;
    revealShort(gradeShort(val, q.a), val);
  }
}

function revealShort(grade, userVal){
  document.getElementById('inputArea').style.display = 'none';
  document.getElementById('ansBox').classList.add('show');

  document.getElementById('myAnsWrap').style.display = 'block';
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
  msg.innerHTML += `<div style="margin-top:8px;font-size:.74rem;color:var(--ink-soft)">키보드 <b>1</b> 정답 · <b>2</b> 오답 · <b>S</b> 복습 담기</div>`;

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
          <button class="btn btn-o" id="markO"><span class="key">1</span> 충분히 씀<small>오답 노트에서 제외</small></button>
          <button class="btn btn-mid" id="markM"><span class="key">2</span> 부분 점수<small>오답 노트에 저장</small></button>
          <button class="btn btn-x" id="markX"><span class="key">3</span> 못 씀<small>오답 노트에 저장</small></button>
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
  document.getElementById('quitBtn').onclick = () => showConfirm('지금까지 푼 결과를 보고 종료할까요?', renderResult);

  const meTa = document.getElementById('myAnsEdit');
  meTa.addEventListener('keydown', e => {
    if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); doRegrade(); }
  });
  document.getElementById('regradeBtn').onclick = doRegrade;
  bindStar(q);

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
  msg.innerHTML += `<div style="margin-top:8px;font-size:.74rem;color:var(--ink-soft)">키보드 <b>1</b> 충분히 씀 · <b>2</b> 부분 점수 · <b>3</b> 못 씀 · <b>S</b> 복습 담기</div>`;

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
  if(verdict === 'full'){ S.full++; clearWrong(q.key); }
  else{
    if(verdict === 'part') S.part++; else S.none++;
    S.wrong.push({key:q.key, verdict});
    markWrong(q.key);
  }
  S.i++;
  if(S.i >= S.list.length) renderResult();
  else renderQuiz();
}

/* ============ 결과 ============ */
function renderResult(){
  if(activeStarKey){ document.removeEventListener('keydown', activeStarKey); activeStarKey = null; }
  const done = S.full + S.part + S.none;
  const pct = done ? Math.round((S.full + S.part * 0.5) / done * 100) : 0;
  pill.textContent = '결과';

  let verdict, sub;
  if(pct >= 85){ verdict = '합격권 답안력'; sub = '단답부터 서술·실무까지 고르게 잡았습니다.'; }
  else if(pct >= 60){ verdict = '부분 점수는 확보'; sub = '빠진 키워드만 채우면 만점권까지 갑니다.'; }
  else if(pct >= 35){ verdict = '뼈대는 있습니다'; sub = '오답 노트를 한 번 더 돌려 살을 붙이세요.'; }
  else{ verdict = '지금이 시작점'; sub = '단답 개념부터 다시 다지고 서술 틀을 익히세요.'; }

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
      <div class="big">${S.full}<span class="pct"> / ${done}</span></div>
      <div class="big" style="font-size:1.3rem;color:var(--accent)">${pct}%<span style="font-size:.8rem;color:var(--ink-soft);font-weight:500"> · 부분 ${S.part}개 0.5점 환산</span></div>
      <h2>${verdict}</h2>
      <p>${sub}</p>
    </div>
    ${S.wrong.length
      ? `<div class="wrong-list"><h3>오답 ${S.wrong.length}개 · 오답 노트에 저장됨</h3>${details}</div>`
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

  if(S.wrong.length){
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
        <button class="confirm-btn confirm-ok" id="confirmOk">종료하기</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if(e.target === overlay) close(); });
  document.getElementById('confirmCancel').onclick = close;
  document.getElementById('confirmOk').onclick = () => { close(); onYes(); };
}

function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ---------- 코드·로그 블록 인식 (서술·실무 지문 가독성) ---------- */
const CODE_SIGNS = [
  /[{};]\s*$/,
  /^\s*[{}]/,
  /^\s*\d{1,3}(\.\d{1,3}){3}[\s:]/,
  /"(GET|POST|HEAD|PUT|DELETE)\s|\bHTTP\/[012]\.[019]/,
  /^\s*(GET|POST)\s+\/\S/,
  /^\s*(alert|pass|drop|reject)\s+(tcp|udp|icmp|ip|any)\b/i,
  /\b(iptables|access-list|hping3?|nmap|tcpdump|netstat|lsof)\b/,
  /^\s*(zone|type|file|masters|allow-\w+|options|forwarders)\b.*[;{"]/i,
  /^\s*(Options|AddType|AddHandler|Order|Deny|Allow|LimitRequestBody|AllowOverride)\s+\S/,
  /^\s*<\/?(FilesMatch|Directory|Location|VirtualHost|Limit)\b/i,
  /^\s*[#$]\s+\S/,
  /^[\w.\-]+:[^:\s]*:\d+:/,
  /^\s*(int|char|void|unsigned|return|if|for|while)\b.*[;({]/,
  /\b(strcpy|printf|scanf|sprintf|memcpy|gets)\s*\(/,
  /^\s*(chmod|chown|find|grep|awk|sed|cat|ls|ps|su|sudo|useradd|usermod|passwd)\s+[-\/\w]/,
  /^\s*[\w.\-]+\s*=\s*[^=]+$/,
  /^\s*(Content-Type|User-Agent|Referer|Host|Cache-Control|Cookie|Set-Cookie|Accept|Connection|Server|Date|Content-Length)\s*:/i,
];
const CODE_STRUCT = [
  /[{};]\s*$/,
  /^\s*[{}]/,
  /^\s*\d{1,3}(\.\d{1,3}){3}[\s:]/,
  /\bHTTP\/[012]\.[019]/,
];
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
  if(!QUESTIONS.length) showFatal('문항을 찾지 못했습니다.');
  else renderHome();
}catch(e){
  showFatal(e && e.message);
}
