/* 개념 키워드 드릴 — window.KEYWORD_DATA의 빈출 개념을 능동 회상으로 훈련
   흐름: 개념 제시 → 부분점수 키워드 회상(작성) → 정답 키워드 확인 → 자가채점(1/2/3) */

const app = document.getElementById('app');
const pill = document.getElementById('sessionPill');
let S = null;               // 현재 세션
let activeKeyJudge = null;   // 화면에 붙은 1·2·3 판정 리스너
let activeStarKey = null;    // 복습 담기(S) 단축키 리스너

/* 과목(분야) — 다른 드릴과 동일한 5개 체계 */
const CATS = [
  {id:'sys',  name:'시스템 보안',            desc:'권한·계정, shadow, 접근통제 모델', accent:'#0D6E5F'},
  {id:'net',  name:'네트워크 보안',          desc:'IPSec, 스니핑·스푸핑, DDoS, DRS', accent:'#1F5FA6'},
  {id:'app',  name:'애플리케이션 보안',      desc:'SQLi·XSS, 파일 업로드, 쿠키, BYOD', accent:'#9A5B1E'},
  {id:'soc',  name:'보안관제·침해사고 대응', desc:'IDS/IPS, 디지털 포렌식', accent:'#7A3FA6'},
  {id:'risk', name:'위험관리·법규',          desc:'위험분석·처리, ISMS-P, PIA, CISO', accent:'#B4452E'},
];
const CAT_NAME = Object.fromEntries(CATS.map(c => [c.id, c.name]));

/* ============ 기출 조회 (관련 기출 연결용) ============ */
// window.GICHUL_DATA에서 "회차-번호" → {round,num,type,question,answer} 맵을 만든다.
const GMAP = {};
(window.GICHUL_DATA?.rounds || []).forEach(r => {
  r.questions.forEach(q => {
    GMAP[`${r.no}-${q.num}`] = { round:r.no, num:q.num, type:q.type, question:q.question, answer:q.answer };
  });
});
// 답안 = [모범답안] + [출제 코멘트]. 코멘트(해설투 불릿)는 학습 화면에서 접어 둔다.
function isNoteLine(line){
  return /^\s*[​\s]*([-*※·]|\\\*)/.test(line) && /(니다|참고|참조|http|출제|수험서|획득)/.test(line);
}
function splitAnswer(ans){
  const lines = (ans||'').split('\n');
  const i = lines.findIndex(isNoteLine);
  if(i < 0) return { body:(ans||'').trim(), note:'' };
  return { body: lines.slice(0,i).join('\n').trim(), note: lines.slice(i).join('\n').trim() };
}

/* ============ 데이터 준비 ============ */
const CONCEPTS = (window.KEYWORD_DATA || []).map(k => ({
  id: k.id,
  cat: k.cat,
  concept: k.concept,
  prompt: k.prompt,
  keywords: k.keywords || [],
  gichul: (k.gichul || []).map(id => GMAP[id] ? { id, ...GMAP[id] } : null).filter(Boolean),
}));

/* ============ 키워드 자동 대조 ============ */
function normalize(str){
  return (str || '').toLowerCase().replace(/\s+/g, '');
}
// 키워드 문자열에서 괄호 앞 '핵심 토큰'만 뽑아 느슨하게 매칭한다.
// 예: "터널 모드(원본IP 전체 + 새 헤더)" → 사용자가 "터널"만 써도 인정
function keyCore(kw){
  const head = (kw || '').split(/[（(]/)[0];
  return head.replace(/[^가-힣A-Za-z0-9]+/g, '');
}
// 사용자 답안에 해당 키워드가 담겼는지 — 코어 토큰 또는 괄호 안 주요 단어 매칭
function hasKeyword(userNorm, kw){
  const core = normalize(keyCore(kw));
  if(core.length >= 2 && userNorm.includes(core)) return true;
  // 괄호 안 영문/약어(SSL, ESP 등)도 단서로 인정
  const tokens = (kw.match(/[A-Za-z]{2,}|[가-힣]{2,}/g) || []);
  return tokens.some(t => t.length >= 3 && userNorm.includes(normalize(t)));
}
function autoGrade(userInput, keywords){
  const uNorm = normalize(userInput);
  const hit = [], miss = [];
  keywords.forEach(k => (hasKeyword(uNorm, k) ? hit : miss).push(k));
  return {
    hit, miss,
    total: keywords.length,
    ratio: keywords.length ? hit.length / keywords.length : 0,
    chars: userInput.trim().length,
  };
}

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

const WRONG_KEY = 'isec_kw_wrong_v1';
function loadWrong(){ try{ return JSON.parse(safeGet(WRONG_KEY, '[]')); }catch(e){ return []; } }
function saveWrong(arr){ safeSet(WRONG_KEY, JSON.stringify([...new Set(arr)])); }
function markWrong(id){ const w = loadWrong(); w.push(id); saveWrong(w); }
function clearWrong(id){ saveWrong(loadWrong().filter(x => x !== id)); }

// ── 복습 항목(직접 선택) ──
const REVIEW_KEY = 'isec_kw_review_v1';
function loadReview(){ try{ return JSON.parse(safeGet(REVIEW_KEY, '[]')); }catch(e){ return []; } }
function saveReview(arr){ safeSet(REVIEW_KEY, JSON.stringify([...new Set(arr)])); }
function isReview(id){ return loadReview().includes(id); }
function toggleReview(id){ const s = new Set(loadReview()); if(s.has(id)) s.delete(id); else s.add(id); saveReview([...s]); return s.has(id); }

// ── 이어풀기(중단 지점 저장) ──
const RESUME_KEY = 'isec_kw_resume_v1';
function saveResume(){
  if(!S || S.i >= S.list.length) return;
  safeSet(RESUME_KEY, JSON.stringify({
    ids: S.list.map(q => q.id), i:S.i, full:S.full, part:S.part, none:S.none,
    wrong:S.wrong, mode:S.mode, label:S.label, at:Date.now()
  }));
}
function clearResume(){ try{ localStorage.removeItem(RESUME_KEY); }catch(e){} delete memStore[RESUME_KEY]; }
function loadResume(){
  let r; try{ r = JSON.parse(safeGet(RESUME_KEY, 'null')); }catch(e){ r = null; }
  if(!r || !Array.isArray(r.ids)) return null;
  const byId = new Map(CONCEPTS.map(q => [q.id, q]));
  const list = r.ids.map(id => byId.get(id)).filter(Boolean);
  if(!list.length || r.i >= list.length) return null;
  return { list, i:Math.min(r.i, list.length), full:r.full||0, part:r.part||0, none:r.none||0,
           wrong:r.wrong||[], mode:r.mode||'resume', label:r.label||'이어풀기' };
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
  const wrongN = CONCEPTS.filter(q => wrong.has(q.id)).length;
  const reviewSet = new Set(loadReview());
  const reviewN = CONCEPTS.filter(q => reviewSet.has(q.id)).length;
  const totalGichul = CONCEPTS.reduce((n, q) => n + q.gichul.length, 0);
  pill.textContent = `${CONCEPTS.length} 개념`;
  const resumeState = loadResume();
  const resumeHTML = resumeState ? `
      <button class="mode-btn primary" id="mResume" style="border-color:var(--accent)">
        <span><span class="t">▶ 이어풀기</span><span class="d">${esc(resumeState.label)} · ${resumeState.i}/${resumeState.list.length}개념까지 풀었어요</span></span>
        <span class="arrow">→</span>
      </button>` : '';

  app.innerHTML = `
  <section class="hero">
    <h1>서술·실무는 <em>키워드를 떠올릴 수</em> 있어야<br>부분 점수가 붙는다</h1>
    <p>기출 서술형·실무형에서 반복 출제되는 핵심 개념 ${CONCEPTS.length}개. 개념을 보고 <b>부분점수 필수 키워드</b>를 직접 떠올려 쓴 뒤 대조하고, 그 개념이 <b>실제 출제된 기출 ${totalGichul}제</b>를 바로 확인하세요.</p>
    <div class="stat-rail">
      <div class="stat"><span class="num">${CONCEPTS.length}</span><span class="lbl">전체 개념</span></div>
      <div class="stat"><span class="num">${totalGichul}</span><span class="lbl">연결 기출</span></div>
      <div class="stat"><span class="num">${reviewN}</span><span class="lbl">복습 담음</span></div>
      <div class="stat bad"><span class="num">${wrongN}</span><span class="lbl">오답 노트</span></div>
    </div>

    <div class="mode-grid">
      ${resumeHTML}
      <button class="mode-btn${resumeState?'':' primary'}" id="mAll">
        <span><span class="t">전체 풀기</span><span class="d">위험관리부터 순서대로 (${CONCEPTS.length}개념)</span></span>
        <span class="arrow">→</span>
      </button>
      <button class="mode-btn" id="mShuffle">
        <span><span class="t">랜덤 셔플</span><span class="d">${CONCEPTS.length}개념을 무작위 순서로</span></span>
        <span class="arrow">→</span>
      </button>
      <button class="mode-btn danger" id="mWrong" ${wrongN ? '' : 'disabled'}>
        <span><span class="t">오답만 다시</span><span class="d">${wrongN ? wrongN + '개념 집중 복습' : '아직 오답 노트가 비어 있어요'}</span></span>
        <span class="arrow">→</span>
      </button>
      <button class="mode-btn review" id="mReview" ${reviewN ? '' : 'disabled'}>
        <span><span class="t">⭐ 복습 항목만 풀기</span><span class="d">${reviewN ? '직접 고른 ' + reviewN + '개념만 모아서' : '아직 담은 복습 항목이 없어요 · ☆로 담아보세요'}</span></span>
        <span class="arrow">→</span>
      </button>
    </div>

    <div class="cat-head">
      <span class="cat-eyebrow">SUBJECT</span>
      <h2 class="cat-title">과목별로 풀기</h2>
      <span style="font-size:.72rem;color:var(--ink-soft);margin-left:auto">카드: 순서대로 · <b style="color:var(--ink)">⤮</b> 셔플</span>
    </div>
    <div class="cat-grid">
      ${CATS.map(c => {
        const cl = CONCEPTS.filter(q => q.cat === c.id);
        const w = cl.filter(q => wrong.has(q.id)).length;
        const gi = cl.reduce((n, q) => n + q.gichul.length, 0);
        return `<div class="cat-btn" style="--ca:${c.accent}">
          <span class="cat-bar"></span>
          <button class="cat-body" data-cat="${c.id}" data-mode="order">
            <span class="cat-name">${c.name}</span>
            <span class="cat-desc">${c.desc}</span>
          </button>
          <span class="cat-meta"><span class="cat-count">${cl.length}</span><span class="cat-wrong" style="background:none;color:var(--ink-soft)">기출 ${gi}</span>${w ? `<span class="cat-wrong">오답 ${w}</span>` : ''}</span>
          <button class="cat-shuffle" data-cat="${c.id}" data-mode="shuffle" title="${c.name} 셔플로 풀기" aria-label="${c.name} 무작위 순서로 풀기">⤮</button>
        </div>`;
      }).join('')}
    </div>

    <p class="note">개념의 <b>필수 키워드</b>를 떠올려 쓰고 <b>Ctrl(⌘)+Enter</b>로 대조하면 몇 개를 담았는지 표시됩니다. 최종 판정은 키보드 <b>1</b>(다 떠올림)·<b>2</b>(일부만)·<b>3</b>(못 떠올림)으로 확정하며, 2·3은 오답 노트에 저장됩니다.</p>
  </section>`;

  if(resumeState){
    document.getElementById('mResume').onclick = () => {
      S = { list:resumeState.list, i:resumeState.i, full:resumeState.full, part:resumeState.part,
            none:resumeState.none, wrong:resumeState.wrong, mode:resumeState.mode, label:resumeState.label };
      renderQuiz();
    };
  }
  document.getElementById('mAll').onclick = () => startSession(CONCEPTS.slice(), 'all', '전체 풀기');
  document.getElementById('mShuffle').onclick = () => startSession(shuffle(CONCEPTS), 'shuffle', '랜덤 셔플');
  document.getElementById('mWrong').onclick = () => {
    const set = new Set(loadWrong());
    startSession(shuffle(CONCEPTS.filter(q => set.has(q.id))), 'wrong', '오답 노트');
  };
  document.getElementById('mReview').onclick = () => {
    const set = new Set(loadReview());
    startSession(CONCEPTS.filter(q => set.has(q.id)), 'review', '복습 항목');
  };
  document.querySelectorAll('.cat-body[data-cat], .cat-shuffle[data-cat]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.cat;
      const sh = btn.dataset.mode === 'shuffle';
      const list = CONCEPTS.filter(q => q.cat === id);
      startSession(sh ? shuffle(list) : list, sh ? 'cat-shuffle' : 'cat', CAT_NAME[id] + (sh ? ' · 셔플' : ''));
    };
  });
}

/* ============ 퀴즈 ============ */
function renderQuiz(){
  saveResume();
  const q = S.list[S.i];
  const total = S.list.length;
  pill.textContent = S.label;

  app.innerHTML = `
    <div class="quiz-top">
      <div class="q-tag">${String(S.i+1).padStart(2,'0')}<span class="of"> / ${total}</span></div>
      <div class="quiz-top-actions">
        <button class="star-btn" id="starBtn" aria-pressed="false"></button>
        <button class="quit" id="quitBtn">그만두기</button>
      </div>
    </div>
    <div class="rail"><div class="fill" style="width:${Math.round(S.i/total*100)}%"></div></div>
    <div class="score-line"><span class="o">떠올림 ${S.full}</span><span class="mid">일부 ${S.part}</span><span class="x">못함 ${S.none}</span></div>

    <article class="card">
      <span class="cat-chip">${CAT_NAME[q.cat]||''}</span>
      <div class="concept-name" style="font-size:1.15rem;font-weight:700;margin:8px 0 10px">${esc(q.concept)}</div>
      <div class="q-text prose">${esc(q.prompt)}</div>
      <div style="font-size:.76rem;color:var(--ink-soft);margin-top:8px">이 개념의 <b>부분점수 필수 키워드 ${q.keywords.length}개</b>를 떠올려 적어보세요.</div>

      <div id="inputArea">
        <label class="a-lbl" style="display:block;margin:18px 0 6px">키워드 회상</label>
        <textarea id="userAns" rows="6" class="essay-input"
          placeholder="떠오르는 핵심 키워드를 쉼표·줄바꿈으로 적어보세요. 대조는 Ctrl(⌘)+Enter"></textarea>
        <div class="input-foot"><span id="charCnt">0자</span></div>
        <div class="actions" style="margin-top:12px">
          <button class="btn btn-reveal" id="checkBtn">키워드 대조 <small>Ctrl+Enter</small></button>
        </div>
        <div class="skip-row"><button id="revealBtn">모르겠음 · 키워드 보기</button></div>
      </div>

      <div class="answer" id="ansBox">
        <div class="a-lbl">필수 키워드</div>
        <div class="a-text" id="modelAns"></div>
        <div id="gradeMsg" class="grade-msg"></div>
        <div class="actions three" id="verdictRow">
          <button class="btn btn-o" id="markO"><span class="key">1</span> 다 떠올림<small>오답 노트에서 제외</small></button>
          <button class="btn btn-mid" id="markM"><span class="key">2</span> 일부만<small>오답 노트에 저장</small></button>
          <button class="btn btn-x" id="markX"><span class="key">3</span> 못 떠올림<small>오답 노트에 저장</small></button>
        </div>
        <div id="relatedGichul"></div>
      </div>
    </article>`;

  const ta = document.getElementById('userAns');
  const cnt = document.getElementById('charCnt');
  ta.focus();
  ta.addEventListener('input', () => { cnt.textContent = `${ta.value.trim().length}자`; });
  ta.addEventListener('keydown', e => {
    if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); doCheck(); }
  });

  const starBtn = document.getElementById('starBtn');
  starBtn.title = '복습 항목에 담기 · 빼기 (단축키 S)';
  function paintStar(){
    const on = isReview(q.id);
    starBtn.classList.toggle('on', on);
    starBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    starBtn.textContent = on ? '★ 복습 항목 (S)' : '☆ 복습 담기 (S)';
  }
  paintStar();
  starBtn.onclick = () => { toggleReview(q.id); paintStar(); };
  if(activeStarKey) document.removeEventListener('keydown', activeStarKey);
  activeStarKey = (e) => {
    if(e.ctrlKey || e.metaKey || e.altKey) return;
    if(e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
    if(e.code === 'KeyS' || e.key === 's' || e.key === 'S'){
      e.preventDefault();
      toggleReview(q.id);
      paintStar();
    }
  };
  document.addEventListener('keydown', activeStarKey);

  document.getElementById('checkBtn').onclick = doCheck;
  document.getElementById('revealBtn').onclick = () => reveal(null);
  document.getElementById('quitBtn').onclick = () => showConfirm('지금까지 푼 결과를 보고 종료할까요?', renderResult);

  function doCheck(){ reveal(autoGrade(ta.value, q.keywords)); }
}

function reveal(grade){
  const q = S.list[S.i];
  document.getElementById('inputArea').style.display = 'none';
  document.getElementById('ansBox').classList.add('show');

  // 키워드를 hit/miss 색으로 표시
  const hitSet = new Set(grade ? grade.hit : []);
  document.getElementById('modelAns').innerHTML =
    `<div class="kw-wrap" style="margin:0">${q.keywords.map(k =>
      `<span class="kw ${grade ? (hitSet.has(k) ? 'hit' : 'miss') : ''}">${esc(k)}</span>`).join('')}</div>`;

  const msg = document.getElementById('gradeMsg');
  if(grade === null){
    msg.innerHTML = `<span style="color:var(--ink-soft)">키워드를 눈으로 익히고 스스로 판정하세요.</span>`;
  }else{
    const p = Math.round(grade.ratio * 100);
    const tone = grade.ratio >= 0.6 ? 'var(--accent)' : 'var(--warn)';
    const verdict = grade.ratio >= 0.6 ? '핵심을 대체로 떠올렸습니다.'
      : grade.ratio >= 0.3 ? '핵심 일부가 빠졌습니다.'
      : '핵심 키워드가 많이 빠졌습니다.';
    msg.innerHTML = `
      <div style="color:${tone};font-weight:600">키워드 대조: ${grade.hit.length}/${grade.total} (${p}%) — ${verdict}</div>
      <div style="color:var(--ink-soft);font-size:.78rem;margin-top:4px">표현이 달라도 핵심을 담았다면 정답입니다. 위 키워드와 비교해 직접 판정하세요. (작성 ${grade.chars}자)</div>`;
  }
  msg.innerHTML += `<div style="margin-top:8px;font-size:.74rem;color:var(--ink-soft)">키보드 <b>1</b> 다 떠올림 · <b>2</b> 일부만 · <b>3</b> 못 떠올림 · <b>S</b> 복습 담기</div>`;

  // 이 개념과 연결된 실제 기출 문항 (접이식)
  const relBox = document.getElementById('relatedGichul');
  if(relBox) relBox.innerHTML = relatedGichulHTML(q);

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

function next(verdict){
  const q = S.list[S.i];
  if(verdict === 'full'){ S.full++; clearWrong(q.id); }
  else{
    if(verdict === 'part') S.part++; else S.none++;
    S.wrong.push({id:q.id, verdict});
    markWrong(q.id);
  }
  S.i++;
  if(S.i >= S.list.length){ clearResume(); renderResult(); }
  else renderQuiz();
}

/* ============ 결과 ============ */
function renderResult(){
  if(activeStarKey){ document.removeEventListener('keydown', activeStarKey); activeStarKey = null; }
  const done = S.full + S.part + S.none;
  const pct = done ? Math.round((S.full + S.part * 0.5) / done * 100) : 0;
  pill.textContent = '결과';

  let verdict, sub;
  if(pct >= 85){ verdict = '키워드가 손에 붙었습니다'; sub = '서술·실무에서 부분 점수를 확실히 벌 수 있습니다.'; }
  else if(pct >= 60){ verdict = '부분 점수는 확보'; sub = '빠진 키워드만 채우면 만점권입니다.'; }
  else if(pct >= 35){ verdict = '뼈대는 있습니다'; sub = '오답 노트를 한 번 더 돌려 키워드를 굳히세요.'; }
  else{ verdict = '지금이 시작점'; sub = '키워드를 소리 내어 외운 뒤 다시 회상해 보세요.'; }

  const details = S.wrong.map(w => {
    const q = CONCEPTS.find(x => x.id === w.id);
    return `<details class="wrong-item">
      <summary>${esc(q.concept)} · ${CAT_NAME[q.cat]||''} <span class="v-chip ${w.verdict}">${w.verdict === 'part' ? '일부' : '못함'}</span></summary>
      <div class="wq">${esc(q.prompt)}</div>
      <div class="wa"><b>필수 키워드</b><br>${q.keywords.map(k => esc(k)).join(' · ')}</div>
    </details>`;
  }).join('');

  app.innerHTML = `
    <div class="result-hero">
      <div class="big">${S.full}<span class="pct"> / ${done}</span></div>
      <div class="big" style="font-size:1.3rem;color:var(--accent)">${pct}%<span style="font-size:.8rem;color:var(--ink-soft);font-weight:500"> · 일부 ${S.part}개 0.5점 환산</span></div>
      <h2>${verdict}</h2>
      <p>${sub}</p>
    </div>
    ${S.wrong.length
      ? `<div class="wrong-list"><h3>덜 떠올린 ${S.wrong.length}개 · 오답 노트에 저장됨</h3>${details}</div>`
      : `<p style="text-align:center;color:var(--accent);font-weight:600">모든 개념의 키워드를 떠올렸습니다 — 완벽합니다.</p>`}
    <div class="result-actions">
      ${S.wrong.length ? `<button class="mode-btn danger" id="rWrong"><span><span class="t">방금 덜 떠올린 것만</span><span class="d">${S.wrong.length}개념 즉시 재도전</span></span><span class="arrow">→</span></button>` : ''}
      <button class="mode-btn" id="rRetry"><span><span class="t">같은 세트 다시 풀기</span></span><span class="arrow">↻</span></button>
      <button class="mode-btn" id="rHome"><span><span class="t">처음 화면으로</span></span><span class="arrow">⌂</span></button>
    </div>`;

  if(S.wrong.length){
    document.getElementById('rWrong').onclick = () => {
      const list = S.wrong.map(w => CONCEPTS.find(x => x.id === w.id));
      startSession(shuffle(list), 'wrong', '방금 덜 떠올린 개념');
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
// 기출 지문·답안은 줄바꿈을 살려 그대로 보여준다(코드·로그 포함).
function preText(s){ return `<div style="white-space:pre-wrap;word-break:break-word">${esc(s)}</div>`; }
// 개념에 연결된 기출을 접이식 목록으로 렌더
function relatedGichulHTML(q){
  if(!q.gichul || !q.gichul.length) return '';
  const items = q.gichul.map(g => {
    const { body } = splitAnswer(g.answer);
    return `<details class="wrong-item">
      <summary>${g.round}회 ${g.num}번 · ${esc(g.type)}</summary>
      <div class="wq">${preText(g.question)}</div>
      <div class="wa"><b>모범답안</b>${preText(body)}</div>
    </details>`;
  }).join('');
  return `<div class="wrong-list" style="margin-top:18px">
      <h3 style="font-size:.9rem">📚 이 개념이 나온 기출 ${q.gichul.length}제</h3>
      <p style="font-size:.76rem;color:var(--ink-soft);margin:-6px 0 10px">회차를 눌러 실제 출제 지문과 모범답안을 펼쳐 보세요.</p>
      ${items}
    </div>`;
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
  if(!CONCEPTS.length) showFatal('개념 키워드 데이터를 찾지 못했습니다.');
  else renderHome();
}catch(e){
  showFatal(e && e.message);
}
