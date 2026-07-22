/* 확정 후보 집중 드릴 — window.FOCUS_DRILL_DATA(기출+예상)를 능동 풀이로 훈련
   흐름: 문항 제시(기출/예상 배지) → 답안 작성 → Ctrl+Enter로 모범답안·키워드 대조 → 자가채점(1/2/3) */

const app = document.getElementById('app');
const pill = document.getElementById('sessionPill');
let S = null;
let activeKeyJudge = null;
let activeStarKey = null;

const CATS = [
  {id:'sys',  name:'시스템 보안',      accent:'#0D6E5F'},
  {id:'net',  name:'네트워크 보안',    accent:'#1F5FA6'},
  {id:'app',  name:'애플리케이션 보안', accent:'#9A5B1E'},
  {id:'soc',  name:'보안관제·대응',    accent:'#7A3FA6'},
  {id:'risk', name:'위험관리·법규',    accent:'#B4452E'},
];
const CAT_NAME = Object.fromEntries(CATS.map(c => [c.id, c.name]));

const ITEMS = (window.FOCUS_DRILL_DATA || []).map(x => ({...x, keywords: x.keywords || []}));

/* 후보(topic) 목록 — 데이터 등장 순서 유지 */
const TOPICS = [];
ITEMS.forEach(it => { if (!TOPICS.includes(it.topic)) TOPICS.push(it.topic); });

/* ── 키워드 자동 대조 ── */
function normalize(str){ return (str || '').toLowerCase().replace(/\s+/g, ''); }
function keyCore(kw){ return (kw || '').split(/[（(]/)[0].replace(/[^가-힣A-Za-z0-9]+/g, ''); }
function hasKeyword(userNorm, kw){
  const core = normalize(keyCore(kw));
  if(core.length >= 2 && userNorm.includes(core)) return true;
  const tokens = (kw.match(/[A-Za-z0-9]{2,}|[가-힣]{2,}/g) || []);
  return tokens.some(t => t.length >= 2 && userNorm.includes(normalize(t)));
}
function autoGrade(userInput, keywords){
  const uNorm = normalize(userInput);
  const hit = [], miss = [];
  keywords.forEach(k => (hasKeyword(uNorm, k) ? hit : miss).push(k));
  return { hit, miss, total: keywords.length, ratio: keywords.length ? hit.length/keywords.length : 0, chars: userInput.trim().length };
}

/* ── 저장소 ── */
const memStore = {};
function safeGet(key, fb){ try{ const v = localStorage.getItem(key); return v === null ? fb : v; }catch(e){ return (key in memStore) ? memStore[key] : fb; } }
function safeSet(key, val){ try{ localStorage.setItem(key, val); }catch(e){ memStore[key] = val; } }
const WRONG_KEY = 'isec_focus_wrong_v1';
function loadWrong(){ try{ return JSON.parse(safeGet(WRONG_KEY, '[]')); }catch(e){ return []; } }
function saveWrong(arr){ safeSet(WRONG_KEY, JSON.stringify([...new Set(arr)])); }
function markWrong(id){ const w = loadWrong(); w.push(id); saveWrong(w); }
function clearWrong(id){ saveWrong(loadWrong().filter(x => x !== id)); }
const REVIEW_KEY = 'isec_focus_review_v1';
function loadReview(){ try{ return JSON.parse(safeGet(REVIEW_KEY, '[]')); }catch(e){ return []; } }
function saveReview(arr){ safeSet(REVIEW_KEY, JSON.stringify([...new Set(arr)])); }
function isReview(id){ return loadReview().includes(id); }
function toggleReview(id){ const s = new Set(loadReview()); if(s.has(id)) s.delete(id); else s.add(id); saveReview([...s]); return s.has(id); }

/* ── 세션 ── */
function shuffle(a){ const r = a.slice(); for(let i=r.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [r[i],r[j]]=[r[j],r[i]]; } return r; }
function startSession(list, mode, label){ if(!list.length) return; S = { list, i:0, full:0, part:0, none:0, wrong:[], mode, label }; renderQuiz(); }

/* ── 홈 ── */
function renderHome(){
  if(activeStarKey){ document.removeEventListener('keydown', activeStarKey); activeStarKey = null; }
  const wrong = new Set(loadWrong());
  const wrongN = ITEMS.filter(q => wrong.has(q.id)).length;
  const reviewN = ITEMS.filter(q => isReview(q.id)).length;
  const gichulN = ITEMS.filter(q => q.kind === '기출').length;
  const yesangN = ITEMS.filter(q => q.kind === '예상').length;
  pill.textContent = `${ITEMS.length} 문항`;

  app.innerHTML = `
  <section class="hero">
    <h1>확정 후보를 <em>직접 풀어</em><br>기출로 검증하고 예상으로 굳힌다</h1>
    <p>32회 고신뢰 확정 후보 <b>${TOPICS.length}개</b>에 대한 <b>기출 ${gichulN}제 + 예상 ${yesangN}제</b>. 문항을 읽고 답안을 직접 쓴 뒤 <b>Ctrl(⌘)+Enter</b>로 모범답안과 대조하고, 키보드 <b>1·2·3</b>으로 자가채점하세요.</p>
    <div class="stat-rail">
      <div class="stat"><span class="num">${ITEMS.length}</span><span class="lbl">전체 문항</span></div>
      <div class="stat"><span class="num">${gichulN}</span><span class="lbl">기출</span></div>
      <div class="stat"><span class="num">${yesangN}</span><span class="lbl">예상</span></div>
      <div class="stat bad"><span class="num">${wrongN}</span><span class="lbl">오답 노트</span></div>
    </div>

    <div class="mode-grid">
      <button class="mode-btn primary" id="mAll"><span><span class="t">전체 풀기</span><span class="d">후보 순서대로 (${ITEMS.length}문항)</span></span><span class="arrow">→</span></button>
      <button class="mode-btn" id="mShuffle"><span><span class="t">랜덤 셔플</span><span class="d">전체를 무작위 순서로</span></span><span class="arrow">→</span></button>
      <button class="mode-btn" id="mGichul"><span><span class="t">📚 기출만 풀기</span><span class="d">실제 출제된 ${gichulN}제</span></span><span class="arrow">→</span></button>
      <button class="mode-btn" id="mYesang"><span><span class="t">📝 예상문제만 풀기</span><span class="d">기출 기반 창작 ${yesangN}제</span></span><span class="arrow">→</span></button>
      <button class="mode-btn danger" id="mWrong" ${wrongN ? '' : 'disabled'}><span><span class="t">오답만 다시</span><span class="d">${wrongN ? wrongN + '문항 집중 복습' : '오답 노트가 비어 있어요'}</span></span><span class="arrow">→</span></button>
      <button class="mode-btn review" id="mReview" ${reviewN ? '' : 'disabled'}><span><span class="t">⭐ 복습 항목만</span><span class="d">${reviewN ? '직접 고른 ' + reviewN + '문항' : '☆로 담아보세요'}</span></span><span class="arrow">→</span></button>
    </div>

    <div class="cat-head"><span class="cat-eyebrow">TOPIC</span><h2 class="cat-title">후보별로 풀기</h2></div>
    <div class="cat-grid">
      ${TOPICS.map(t => {
        const list = ITEMS.filter(q => q.topic === t);
        const cat = list[0].cat;
        const accent = (CATS.find(c=>c.id===cat)||{}).accent || '#666';
        const gi = list.filter(q=>q.kind==='기출').length, ye = list.filter(q=>q.kind==='예상').length;
        const w = list.filter(q=>wrong.has(q.id)).length;
        return `<div class="cat-btn" style="--ca:${accent}">
          <span class="cat-bar"></span>
          <button class="cat-body" data-topic="${esc(t)}" data-mode="order">
            <span class="cat-name">${esc(t)}</span>
            <span class="cat-desc">${CAT_NAME[cat]||''}</span>
          </button>
          <span class="cat-meta"><span class="cat-count">${list.length}</span><span class="cat-wrong" style="background:none;color:var(--ink-soft)">기출 ${gi}·예상 ${ye}</span>${w ? `<span class="cat-wrong">오답 ${w}</span>` : ''}</span>
          <button class="cat-shuffle" data-topic="${esc(t)}" data-mode="shuffle" title="${esc(t)} 셔플" aria-label="${esc(t)} 무작위">⤮</button>
        </div>`;
      }).join('')}
    </div>
    <p class="note">답안을 쓰고 <b>Ctrl(⌘)+Enter</b>로 대조하면 모범답안의 핵심 키워드를 몇 개 담았는지 표시됩니다. 최종 판정은 키보드 <b>1</b>(충분)·<b>2</b>(부분)·<b>3</b>(못 씀)이며, 2·3은 오답 노트에 저장됩니다. <b>S</b> 키로 복습 담기.</p>
  </section>`;

  document.getElementById('mAll').onclick = () => startSession(ITEMS.slice(), 'all', '전체 풀기');
  document.getElementById('mShuffle').onclick = () => startSession(shuffle(ITEMS), 'shuffle', '랜덤 셔플');
  document.getElementById('mGichul').onclick = () => startSession(ITEMS.filter(q=>q.kind==='기출'), 'gichul', '기출만');
  document.getElementById('mYesang').onclick = () => startSession(ITEMS.filter(q=>q.kind==='예상'), 'yesang', '예상문제만');
  document.getElementById('mWrong').onclick = () => { const set = new Set(loadWrong()); startSession(shuffle(ITEMS.filter(q=>set.has(q.id))), 'wrong', '오답 노트'); };
  document.getElementById('mReview').onclick = () => startSession(ITEMS.filter(q=>isReview(q.id)), 'review', '복습 항목');
  document.querySelectorAll('.cat-body[data-topic], .cat-shuffle[data-topic]').forEach(btn => {
    btn.onclick = () => {
      const t = btn.dataset.topic, sh = btn.dataset.mode === 'shuffle';
      const list = ITEMS.filter(q => q.topic === t);
      startSession(sh ? shuffle(list) : list, sh ? 'topic-shuffle' : 'topic', t + (sh ? ' · 셔플' : ''));
    };
  });
}

/* ── 퀴즈 ── */
function renderQuiz(){
  const q = S.list[S.i];
  const total = S.list.length;
  pill.textContent = S.label;
  const kindChip = q.kind === '기출'
    ? `<span class="cat-chip" style="background:#E4EEF7;color:#1F5FA6">📚 기출 ${esc(q.src)}</span>`
    : `<span class="cat-chip" style="background:#F6ECD9;color:#9A6410">📝 예상문제</span>`;

  app.innerHTML = `
    <div class="quiz-top">
      <div class="q-tag">${String(S.i+1).padStart(2,'0')}<span class="of"> / ${total}</span></div>
      <div class="quiz-top-actions">
        <button class="star-btn" id="starBtn" aria-pressed="false"></button>
        <button class="quit" id="quitBtn">그만두기</button>
      </div>
    </div>
    <div class="rail"><div class="fill" style="width:${Math.round(S.i/total*100)}%"></div></div>
    <div class="score-line"><span class="o">충분 ${S.full}</span><span class="mid">부분 ${S.part}</span><span class="x">못함 ${S.none}</span></div>

    <article class="card">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        ${kindChip}
        <span class="cat-chip">${CAT_NAME[q.cat]||''}</span>
        <span class="cat-chip" style="background:var(--surface-2);color:var(--ink-soft)">${esc(q.type||'')}</span>
      </div>
      <div class="concept-name" style="font-size:1.05rem;font-weight:700;margin:10px 0 4px">${esc(q.topic)}</div>
      <div class="q-text prose" style="white-space:pre-wrap">${esc(q.q)}</div>
      <div style="font-size:.76rem;color:var(--ink-soft);margin-top:8px">답안을 작성하고 <b>Ctrl(⌘)+Enter</b>로 모범답안과 대조하세요. (필수 키워드 ${q.keywords.length}개)</div>

      <div id="inputArea">
        <label class="a-lbl" style="display:block;margin:16px 0 6px">내 답안</label>
        <textarea id="userAns" rows="6" class="essay-input" placeholder="답안을 서술해 보세요. 대조는 Ctrl(⌘)+Enter"></textarea>
        <div class="input-foot"><span id="charCnt">0자</span></div>
        <div class="actions" style="margin-top:12px"><button class="btn btn-reveal" id="checkBtn">모범답안 대조 <small>Ctrl+Enter</small></button></div>
        <div class="skip-row"><button id="revealBtn">모르겠음 · 답안 보기</button></div>
      </div>

      <div class="answer" id="ansBox">
        <div class="a-lbl">모범답안</div>
        <div class="a-text" id="modelAns" style="white-space:pre-wrap"></div>
        <div class="a-lbl" style="margin-top:12px">필수 키워드 대조</div>
        <div class="a-text" id="kwAns"></div>
        <div id="gradeMsg" class="grade-msg"></div>
        <div class="actions three" id="verdictRow">
          <button class="btn btn-o" id="markO"><span class="key">1</span> 충분히 씀<small>오답에서 제외</small></button>
          <button class="btn btn-mid" id="markM"><span class="key">2</span> 부분만<small>오답 노트 저장</small></button>
          <button class="btn btn-x" id="markX"><span class="key">3</span> 못 씀<small>오답 노트 저장</small></button>
        </div>
      </div>
    </article>`;

  const ta = document.getElementById('userAns');
  const cnt = document.getElementById('charCnt');
  ta.focus();
  ta.addEventListener('input', () => { cnt.textContent = `${ta.value.trim().length}자`; });
  ta.addEventListener('keydown', e => { if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); doCheck(); } });

  const starBtn = document.getElementById('starBtn');
  function paintStar(){ const on = isReview(q.id); starBtn.classList.toggle('on', on); starBtn.setAttribute('aria-pressed', on?'true':'false'); starBtn.textContent = on ? '★ 복습 항목 (S)' : '☆ 복습 담기 (S)'; }
  paintStar();
  starBtn.onclick = () => { toggleReview(q.id); paintStar(); };
  if(activeStarKey) document.removeEventListener('keydown', activeStarKey);
  activeStarKey = (e) => {
    if(e.ctrlKey || e.metaKey || e.altKey) return;
    if(e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
    if(e.key === 's' || e.key === 'S'){ e.preventDefault(); toggleReview(q.id); paintStar(); }
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
  document.getElementById('modelAns').textContent = q.a;

  const hitSet = new Set(grade ? grade.hit : []);
  document.getElementById('kwAns').innerHTML =
    `<div class="kw-wrap" style="margin:0">${q.keywords.map(k => `<span class="kw ${grade ? (hitSet.has(k) ? 'hit' : 'miss') : ''}">${esc(k)}</span>`).join('')}</div>`;

  const msg = document.getElementById('gradeMsg');
  if(grade === null){
    msg.innerHTML = `<span style="color:var(--ink-soft)">모범답안과 비교해 스스로 판정하세요.</span>`;
  }else{
    const p = Math.round(grade.ratio * 100);
    const tone = grade.ratio >= 0.6 ? 'var(--accent)' : 'var(--warn)';
    const verdict = grade.ratio >= 0.6 ? '핵심을 대체로 담았습니다.' : grade.ratio >= 0.3 ? '핵심 일부가 빠졌습니다.' : '핵심 키워드가 많이 빠졌습니다.';
    msg.innerHTML = `<div style="color:${tone};font-weight:600">키워드 대조: ${grade.hit.length}/${grade.total} (${p}%) — ${verdict}</div>
      <div style="color:var(--ink-soft);font-size:.78rem;margin-top:4px">표현이 달라도 핵심을 담았다면 정답입니다. 직접 판정하세요. (작성 ${grade.chars}자)</div>`;
  }
  msg.innerHTML += `<div style="margin-top:8px;font-size:.74rem;color:var(--ink-soft)">키보드 <b>1</b> 충분 · <b>2</b> 부분 · <b>3</b> 못 씀 · <b>S</b> 복습 담기</div>`;

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
  else { if(verdict === 'part') S.part++; else S.none++; S.wrong.push({id:q.id, verdict}); markWrong(q.id); }
  S.i++;
  if(S.i >= S.list.length) renderResult();
  else renderQuiz();
}

/* ── 결과 ── */
function renderResult(){
  if(activeStarKey){ document.removeEventListener('keydown', activeStarKey); activeStarKey = null; }
  if(activeKeyJudge){ document.removeEventListener('keydown', activeKeyJudge); activeKeyJudge = null; }
  const done = S.full + S.part + S.none;
  const pct = done ? Math.round((S.full + S.part * 0.5) / done * 100) : 0;
  pill.textContent = '결과';
  let verdict, sub;
  if(pct >= 85){ verdict = '답안이 손에 붙었습니다'; sub = '서술·실무에서 확실히 득점할 수 있습니다.'; }
  else if(pct >= 60){ verdict = '부분 점수는 확보'; sub = '빠진 키워드만 채우면 만점권입니다.'; }
  else if(pct >= 35){ verdict = '뼈대는 있습니다'; sub = '오답 노트를 한 번 더 돌려 굳히세요.'; }
  else{ verdict = '지금이 시작점'; sub = '모범답안을 소리 내어 익힌 뒤 다시 써 보세요.'; }

  const details = S.wrong.map(w => {
    const q = ITEMS.find(x => x.id === w.id);
    return `<details class="wrong-item">
      <summary>${esc(q.topic)} · ${q.kind==='기출'?('기출 '+esc(q.src)):'예상'} <span class="v-chip ${w.verdict}">${w.verdict === 'part' ? '부분' : '못함'}</span></summary>
      <div class="wq" style="white-space:pre-wrap">${esc(q.q)}</div>
      <div class="wa" style="white-space:pre-wrap"><b>모범답안</b><br>${esc(q.a)}</div>
    </details>`;
  }).join('');

  app.innerHTML = `
    <div class="result-hero">
      <div class="big">${S.full}<span class="pct"> / ${done}</span></div>
      <div class="big" style="font-size:1.3rem;color:var(--accent)">${pct}%<span style="font-size:.8rem;color:var(--ink-soft);font-weight:500"> · 부분 ${S.part}개 0.5 환산</span></div>
      <h2>${verdict}</h2><p>${sub}</p>
    </div>
    ${S.wrong.length ? `<div class="wrong-list"><h3>덜 쓴 ${S.wrong.length}문항 · 오답 노트에 저장됨</h3>${details}</div>` : `<p style="text-align:center;color:var(--accent);font-weight:600">모든 문항을 충분히 작성했습니다 — 완벽합니다.</p>`}
    <div class="result-actions">
      ${S.wrong.length ? `<button class="mode-btn danger" id="rWrong"><span><span class="t">방금 덜 쓴 것만</span><span class="d">${S.wrong.length}문항 즉시 재도전</span></span><span class="arrow">→</span></button>` : ''}
      <button class="mode-btn" id="rRetry"><span><span class="t">같은 세트 다시</span></span><span class="arrow">↻</span></button>
      <button class="mode-btn" id="rHome"><span><span class="t">처음 화면으로</span></span><span class="arrow">⌂</span></button>
    </div>`;

  if(S.wrong.length){
    document.getElementById('rWrong').onclick = () => startSession(shuffle(S.wrong.map(w => ITEMS.find(x => x.id === w.id))), 'wrong', '방금 덜 쓴 문항');
  }
  document.getElementById('rRetry').onclick = () => { const re = S.mode.includes('shuffle') || S.mode === 'wrong'; startSession(re ? shuffle(S.list) : S.list.slice(), S.mode, S.label); };
  document.getElementById('rHome').onclick = renderHome;
}

/* ── 유틸 ── */
function showConfirm(message, onYes){
  const old = document.getElementById('confirmOverlay'); if(old) old.remove();
  const overlay = document.createElement('div');
  overlay.id = 'confirmOverlay'; overlay.className = 'confirm-overlay';
  overlay.innerHTML = `<div class="confirm-box"><p class="confirm-msg">${esc(message)}</p>
    <div class="confirm-actions"><button class="confirm-btn confirm-cancel" id="confirmCancel">계속 풀기</button><button class="confirm-btn confirm-ok" id="confirmOk">종료하기</button></div></div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if(e.target === overlay) close(); });
  document.getElementById('confirmCancel').onclick = close;
  document.getElementById('confirmOk').onclick = () => { close(); onYes(); };
}
function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function showFatal(msg){
  app.innerHTML = `<div style="text-align:center;padding:60px 16px;color:var(--ink-soft)">
    <p style="font-size:1.05rem;font-weight:600;color:var(--ink);margin-bottom:8px">페이지를 불러오지 못했어요</p>
    <p style="font-size:.88rem;margin-bottom:18px">${esc(msg||'')}</p>
    <button onclick="location.reload()" style="font-size:.9rem;font-weight:600;color:#fff;background:var(--accent);border:none;border-radius:8px;padding:10px 20px;cursor:pointer">다시 시도</button></div>`;
}
window.addEventListener('error', e => { if(!document.getElementById('app').innerHTML.trim()) showFatal(e && e.message); });
try{
  if(!ITEMS.length) showFatal('확정 후보 드릴 데이터를 찾지 못했습니다.');
  else renderHome();
}catch(e){ showFatal(e && e.message); }
