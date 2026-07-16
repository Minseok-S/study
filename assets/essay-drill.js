/* 서술형·실무형 드릴 — 기출 데이터(window.GICHUL_DATA)에서 단답형을 제외한 문항만 사용 */

const app = document.getElementById('app');
const pill = document.getElementById('sessionPill');
let S = null; // 현재 세션

const WRONG_KEY = 'isec_essay_wrong_v1';
const TYPES = [
  {id:'서술형', desc:'개념·원리를 문장으로 풀어 쓰는 유형', accent:'#1F5FA6'},
  {id:'실무형', desc:'로그·설정·시나리오를 보고 판단하는 유형', accent:'#9A5B1E'},
];

/* ============ 데이터 준비 ============ */
const QUESTIONS = (window.GICHUL_DATA?.rounds || []).flatMap(r =>
  r.questions
    .filter(q => q.type !== '단답형')
    .map(q => ({
      id: `${r.no}-${q.num}`,
      round: r.no,
      num: q.num,
      type: q.type,
      q: q.question,
      a: q.answer,
    }))
);

// 답안 문자열은 [모범답안] + [출제 코멘트]가 이어져 있다.
// 코멘트는 -, *, ※ 로 시작하면서 해설투(~니다/참고/링크)인 줄부터 시작한다.
function isNoteLine(line){
  return /^\s*[​\s]*([-*※·]|\\\*)/.test(line) && /(니다|참고|참조|http|출제|수험서|획득)/.test(line);
}
function splitAnswer(ans){
  const lines = (ans||'').split('\n');
  const i = lines.findIndex(isNoteLine);
  if(i < 0) return {body: ans.trim(), note: ''};
  return {
    body: lines.slice(0, i).join('\n').trim(),
    note: lines.slice(i).join('\n').trim(),
  };
}

/* ============ 키워드 추출 · 자동 채점 ============ */
// 조사/어미가 붙은 토큰을 비교 가능한 어간으로 자른다.
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
// "전송함으로써" 처럼 어미가 겹쳐 붙는 경우가 있어 2글자가 될 때까지 반복해서 깎는다.
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
  const raw = (body||'')
    .replace(/[^가-힣A-Za-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
  const out = [];
  const seen = new Set();
  raw.forEach(tok => {
    if(/^\d+$/.test(tok)) return;
    const t = stem(tok);
    const isKo = /[가-힣]/.test(t);
    if(isKo && t.length < 2) return;
    if(!isKo && t.length < 2) return;
    if(STOP.has(t)) return;
    const key = t.toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    out.push(t);
  });
  // 답안이 길면 앞부분만 잘라 쓰지 않고 전체에서 고르게 뽑는다.
  // (2)·(3)번 소문항만 쓴 답안이 0%로 나오는 것을 막기 위함
  const CAP = 34;
  if(out.length <= CAP) return out;
  const step = out.length / CAP;
  return Array.from({length: CAP}, (_, i) => out[Math.floor(i * step)]);
}
function normalize(str){
  return (str||'').toLowerCase().replace(/\s+/g, '');
}
// 모범답안 키워드가 내 답안에 얼마나 등장하는지 — 참고용 지표
function autoGrade(userInput, body){
  const keys = keywordsOf(body);
  const uNorm = normalize(userInput);
  const hit = [], miss = [];
  keys.forEach(k => (uNorm.includes(normalize(k)) ? hit : miss).push(k));
  return {
    hit, miss,
    total: keys.length,
    ratio: keys.length ? hit.length / keys.length : 0,
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
function loadWrong(){ try{ return JSON.parse(safeGet(WRONG_KEY, '[]')); }catch(e){ return []; } }
function saveWrong(arr){ safeSet(WRONG_KEY, JSON.stringify([...new Set(arr)])); }
function markWrong(id){ const w = loadWrong(); w.push(id); saveWrong(w); }
function clearWrong(id){ saveWrong(loadWrong().filter(x => x !== id)); }

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
  const wrongN = QUESTIONS.filter(q => wrong.has(q.id)).length;
  pill.textContent = `${QUESTIONS.length} 문항`;
  const rounds = [...new Set(QUESTIONS.map(q => q.round))].sort((a,b) => a-b);

  app.innerHTML = `
  <section class="hero">
    <h1>서술형·실무형은 <em>손으로 써봐야</em><br>내 것이 된다</h1>
    <p>기출 13—30회의 서술형·실무형 ${QUESTIONS.length}제. 답안을 직접 작성하고 모범답안과 대조해 스스로 채점하세요.</p>
    <div class="stat-rail">
      <div class="stat"><span class="num">${QUESTIONS.length}</span><span class="lbl">전체 문항</span></div>
      <div class="stat"><span class="num">${QUESTIONS.filter(q=>q.type==='서술형').length}</span><span class="lbl">서술형</span></div>
      <div class="stat"><span class="num">${QUESTIONS.filter(q=>q.type==='실무형').length}</span><span class="lbl">실무형</span></div>
      <div class="stat bad"><span class="num">${wrongN}</span><span class="lbl">복습 대상</span></div>
    </div>

    <div class="mode-grid">
      <button class="mode-btn primary" id="mAll">
        <span><span class="t">전체 풀기</span><span class="d">13회부터 순서대로 (${QUESTIONS.length}문항)</span></span>
        <span class="arrow">→</span>
      </button>
      <button class="mode-btn" id="mShuffle">
        <span><span class="t">랜덤 셔플</span><span class="d">${QUESTIONS.length}문항을 무작위 순서로</span></span>
        <span class="arrow">→</span>
      </button>
      <button class="mode-btn danger" id="mWrong" ${wrongN ? '' : 'disabled'}>
        <span><span class="t">복습 목록만 다시</span><span class="d">${wrongN ? wrongN + '문항 집중 복습' : '아직 복습 목록이 비어 있어요'}</span></span>
        <span class="arrow">→</span>
      </button>
    </div>

    <div class="cat-head">
      <span class="cat-eyebrow">TYPE</span>
      <h2 class="cat-title">유형별로 풀기</h2>
      <span style="font-size:.72rem;color:var(--ink-soft);margin-left:auto">카드: 순서대로 · <b style="color:var(--ink)">⤮</b> 셔플</span>
    </div>
    <div class="cat-grid">
      ${TYPES.map(t => {
        const cl = QUESTIONS.filter(q => q.type === t.id);
        const w = cl.filter(q => wrong.has(q.id)).length;
        return `<div class="cat-btn" style="--ca:${t.accent}">
          <span class="cat-bar"></span>
          <button class="cat-body" data-type="${t.id}" data-mode="order">
            <span class="cat-name">${t.id}</span>
            <span class="cat-desc">${t.desc}</span>
          </button>
          <span class="cat-meta"><span class="cat-count">${cl.length}</span>${w ? `<span class="cat-wrong">복습 ${w}</span>` : ''}</span>
          <button class="cat-shuffle" data-type="${t.id}" data-mode="shuffle" title="${t.id} 셔플로 풀기" aria-label="${t.id} 무작위 순서로 풀기">⤮</button>
        </div>`;
      }).join('')}
    </div>

    <div class="cat-head">
      <span class="cat-eyebrow">ROUND</span>
      <h2 class="cat-title">회차별로 풀기</h2>
    </div>
    <div class="round-grid">
      ${rounds.map(no => {
        const cl = QUESTIONS.filter(q => q.round === no);
        const w = cl.filter(q => wrong.has(q.id)).length;
        return `<button class="round-btn" data-round="${no}">
          <span class="r-no">${no}회</span>
          <span class="r-cnt">${cl.length}문항</span>
          ${w ? `<span class="r-w">복습 ${w}</span>` : ''}
        </button>`;
      }).join('')}
    </div>

    <p class="note">답안을 쓰고 <b>Ctrl(⌘)+Enter</b>로 채점하면 모범답안의 핵심 키워드가 몇 개나 들어갔는지 표시됩니다. 최종 판정은 키보드 <b>1</b>(충분히 씀)·<b>2</b>(부분 점수)·<b>3</b>(못 씀)으로 확정하며, 2·3은 복습 목록에 저장됩니다.</p>
  </section>`;

  document.getElementById('mAll').onclick = () => startSession(QUESTIONS.slice(), 'all', '전체 풀기');
  document.getElementById('mShuffle').onclick = () => startSession(shuffle(QUESTIONS), 'shuffle', '랜덤 셔플');
  document.getElementById('mWrong').onclick = () => {
    const set = new Set(loadWrong());
    startSession(shuffle(QUESTIONS.filter(q => set.has(q.id))), 'wrong', '복습 목록');
  };
  document.querySelectorAll('.cat-body, .cat-shuffle').forEach(btn => {
    btn.onclick = () => {
      const t = btn.dataset.type;
      const sh = btn.dataset.mode === 'shuffle';
      let list = QUESTIONS.filter(q => q.type === t);
      startSession(sh ? shuffle(list) : list, sh ? 'type-shuffle' : 'type', t + (sh ? ' · 셔플' : ''));
    };
  });
  document.querySelectorAll('.round-btn').forEach(btn => {
    btn.onclick = () => {
      const no = +btn.dataset.round;
      startSession(QUESTIONS.filter(q => q.round === no), 'round', `${no}회`);
    };
  });
}

/* ============ 퀴즈 ============ */
function renderQuiz(){
  const q = S.list[S.i];
  const { body, note } = splitAnswer(q.a);
  const total = S.list.length;
  pill.textContent = S.label;

  app.innerHTML = `
    <div class="quiz-top">
      <div class="q-tag">${String(S.i+1).padStart(2,'0')}<span class="of"> / ${total}</span></div>
      <button class="quit" id="quitBtn">그만두기</button>
    </div>
    <div class="rail"><div class="fill" style="width:${Math.round(S.i/total*100)}%"></div></div>
    <div class="score-line"><span class="o">충분 ${S.full}</span><span class="mid">부분 ${S.part}</span><span class="x">못씀 ${S.none}</span></div>

    <article class="card">
      <span class="num-chip">${q.round}회 ${q.num}번</span><span class="cat-chip">${q.type}</span>
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
          <div class="a-lbl" style="color:var(--ink-soft)">내 답안</div>
          <div class="my-text" id="myAnsText"></div>
        </div>
        <div class="a-lbl">모범답안</div>
        <div class="a-text" id="modelAns"></div>
        ${note ? `<details class="note-box"><summary>출제 코멘트 · 배점 전략</summary><div class="note-text"></div></details>` : ''}
        <div id="gradeMsg" class="grade-msg"></div>
        <div class="actions three" id="verdictRow">
          <button class="btn btn-o" id="markO"><span class="key">1</span> 충분히 씀<small>복습 목록에서 제외</small></button>
          <button class="btn btn-mid" id="markM"><span class="key">2</span> 부분 점수<small>복습 목록에 저장</small></button>
          <button class="btn btn-x" id="markX"><span class="key">3</span> 못 씀<small>복습 목록에 저장</small></button>
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
  document.getElementById('revealBtn').onclick = () => reveal(null, '');
  document.getElementById('quitBtn').onclick = () => showConfirm('지금까지 푼 결과를 보고 종료할까요?', renderResult);

  function doCheck(){
    const val = ta.value;
    reveal(autoGrade(val, body), val);
  }
}

function reveal(grade, userVal){
  document.getElementById('inputArea').style.display = 'none';
  document.getElementById('ansBox').classList.add('show');

  const myText = document.getElementById('myAnsText');
  document.getElementById('myAnsWrap').style.display = 'block';
  if(userVal && userVal.trim()) myText.textContent = userVal;
  else myText.innerHTML = '<span style="color:var(--ink-soft);font-weight:400">(작성 없음 · 모범답안만 확인)</span>';

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

  function decide(v){ document.removeEventListener('keydown', keyJudge); next(v); }
  function keyJudge(e){
    if(e.target && e.target.tagName === 'TEXTAREA') return;
    if(e.key === '1'){ e.preventDefault(); decide('full'); }
    else if(e.key === '2'){ e.preventDefault(); decide('part'); }
    else if(e.key === '3'){ e.preventDefault(); decide('none'); }
  }
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
  if(S.i >= S.list.length) renderResult();
  else renderQuiz();
}

/* ============ 결과 ============ */
function renderResult(){
  const done = S.full + S.part + S.none;
  // 부분 점수는 0.5점으로 환산
  const pct = done ? Math.round((S.full + S.part * 0.5) / done * 100) : 0;
  pill.textContent = '결과';

  let verdict, sub;
  if(pct >= 85){ verdict = '합격권 답안력'; sub = '이대로면 서술형에서 점수를 벌 수 있습니다.'; }
  else if(pct >= 60){ verdict = '부분 점수는 확보'; sub = '빠진 키워드만 채우면 만점권까지 갑니다.'; }
  else if(pct >= 35){ verdict = '뼈대는 있습니다'; sub = '복습 목록을 한 번 더 돌려 살을 붙이세요.'; }
  else{ verdict = '지금이 시작점'; sub = '모범답안을 보고 개조식 답안 틀부터 익히세요.'; }

  const details = S.wrong.map(w => {
    const q = QUESTIONS.find(x => x.id === w.id);
    const { body } = splitAnswer(q.a);
    return `<details class="wrong-item">
      <summary>${q.round}회 ${q.num}번 · ${q.type} <span class="v-chip ${w.verdict}">${w.verdict === 'part' ? '부분' : '못씀'}</span></summary>
      <div class="wq" data-body="${esc(body)}">${esc(q.q)}</div>
      <div class="wa">모범답안 · ${esc(body)}</div>
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
      ? `<div class="wrong-list"><h3>복습할 문제 ${S.wrong.length}개 · 복습 목록에 저장됨</h3>${details}</div>`
      : `<p style="text-align:center;color:var(--accent);font-weight:600">모두 충분히 작성했습니다 — 완벽합니다.</p>`}
    <div class="result-actions">
      ${S.wrong.length ? `<button class="mode-btn danger" id="rWrong"><span><span class="t">방금 복습 표시한 문제만</span><span class="d">${S.wrong.length}문항 즉시 재도전</span></span><span class="arrow">→</span></button>` : ''}
      <button class="mode-btn" id="rRetry"><span><span class="t">같은 세트 다시 풀기</span></span><span class="arrow">↻</span></button>
      <button class="mode-btn" id="rHome"><span><span class="t">처음 화면으로</span></span><span class="arrow">⌂</span></button>
    </div>`;

  document.querySelectorAll('.wrong-item').forEach((el, idx) => {
    const q = QUESTIONS.find(x => x.id === S.wrong[idx].id);
    const { body } = splitAnswer(q.a);
    el.querySelector('.wq').innerHTML = formatText(q.q);
    el.querySelector('.wa').innerHTML = '<b>모범답안</b><br>' + formatText(body);
  });

  if(S.wrong.length){
    document.getElementById('rWrong').onclick = () => {
      const list = S.wrong.map(w => QUESTIONS.find(x => x.id === w.id));
      startSession(shuffle(list), 'wrong', '방금 복습 표시한 문제');
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
function formatText(s){
  let h = esc(s);
  h = h.replace(/\(\s*([A-Za-z]|[0-9]{1,2}|[가-힣])\s*\)/g, '<span style="color:var(--accent);font-weight:600;font-family:var(--mono)">( $1 )</span>');
  return h;
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
  if(!QUESTIONS.length) showFatal('서술형·실무형 문항을 찾지 못했습니다.');
  else renderHome();
}catch(e){
  showFatal(e && e.message);
}
