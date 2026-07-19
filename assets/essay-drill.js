/* 서술형·실무형 드릴 — 기출 데이터(window.GICHUL_DATA)에서 단답형을 제외한 문항만 사용 */

const app = document.getElementById('app');
const pill = document.getElementById('sessionPill');
let S = null; // 현재 세션
let activeKeyJudge = null; // 현재 화면에 붙어 있는 1·2·3 판정 리스너 (재채점 시 중복 방지)

const WRONG_KEY = 'isec_essay_wrong_v1';
const TYPES = [
  {id:'서술형', desc:'개념·원리를 문장으로 풀어 쓰는 유형', accent:'#1F5FA6'},
  {id:'실무형', desc:'로그·설정·시나리오를 보고 판단하는 유형', accent:'#9A5B1E'},
];

/* 과목(분야) — 단답형 드릴과 동일한 5개 체계로 분류 */
const CATS = [
  {id:'sys',  name:'시스템 보안',            desc:'리눅스·유닉스·윈도우, 계정·권한, 로그', accent:'#0D6E5F'},
  {id:'net',  name:'네트워크 보안',          desc:'TCP/IP, DNS, IPSec, 스캔·스니핑, 방화벽', accent:'#1F5FA6'},
  {id:'app',  name:'애플리케이션 보안',      desc:'웹 취약점, SQLi·XSS, 파일 업로드, DB·메일', accent:'#9A5B1E'},
  {id:'soc',  name:'보안관제·침해사고 대응', desc:'IDS·Snort, 포렌식, 악성코드 분석', accent:'#7A3FA6'},
  {id:'risk', name:'위험관리·법규',          desc:'위험분석, ISMS-P, 개인정보보호법, BCP', accent:'#B4452E'},
];
const CAT_NAME = Object.fromEntries(CATS.map(c => [c.id, c.name]));

// 기출 서술형·실무형 108문항의 과목 분류 (키 = "회차-번호")
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

/* ============ 데이터 준비 ============ */
const QUESTIONS = (window.GICHUL_DATA?.rounds || []).flatMap(r =>
  r.questions
    .filter(q => q.type !== '단답형')
    .map(q => ({
      id: `${r.no}-${q.num}`,
      round: r.no,
      num: q.num,
      type: q.type,
      cat: CAT_MAP[`${r.no}-${q.num}`] || 'sys',
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

// ── 복습 항목(직접 선택) ──────────────────────────────────
// 자동 복습 목록(오답)과 별개로, 사용자가 직접 골라 담는 복습 목록.
const REVIEW_KEY = 'isec_essay_review_v1';
function loadReview(){ try{ return JSON.parse(safeGet(REVIEW_KEY, '[]')); }catch(e){ return []; } }
function saveReview(arr){ safeSet(REVIEW_KEY, JSON.stringify([...new Set(arr)])); }
function isReview(id){ return loadReview().includes(id); }
function toggleReview(id){ const s = new Set(loadReview()); if(s.has(id)) s.delete(id); else s.add(id); saveReview([...s]); return s.has(id); }
function setReview(id, on){ const s = new Set(loadReview()); if(on) s.add(id); else s.delete(id); saveReview([...s]); }

// ── 이어풀기(중단 지점 저장) ─────────────────────────────
const RESUME_KEY = 'isec_essay_resume_v1';
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
  const byId = new Map(QUESTIONS.map(q => [q.id, q]));
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
  const wrongN = QUESTIONS.filter(q => wrong.has(q.id)).length;
  const reviewSet = new Set(loadReview());
  const reviewN = QUESTIONS.filter(q => reviewSet.has(q.id)).length;
  pill.textContent = `${QUESTIONS.length} 문항`;
  const rounds = [...new Set(QUESTIONS.map(q => q.round))].sort((a,b) => a-b);
  const resumeState = loadResume();
  const resumeHTML = resumeState ? `
      <button class="mode-btn primary" id="mResume" style="border-color:var(--accent)">
        <span><span class="t">▶ 이어풀기</span><span class="d">${esc(resumeState.label)} · ${resumeState.i}/${resumeState.list.length}문항까지 풀었어요</span></span>
        <span class="arrow">→</span>
      </button>` : '';

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
      ${resumeHTML}
      <button class="mode-btn${resumeState?'':' primary'}" id="mAll">
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
      <button class="mode-btn review" id="mReview" ${reviewN ? '' : 'disabled'}>
        <span><span class="t">⭐ 복습 항목만 풀기</span><span class="d">${reviewN ? '직접 고른 ' + reviewN + '문항만 모아서 공부' : '아직 담은 복습 항목이 없어요 · 아래에서 선택하세요'}</span></span>
        <span class="arrow">→</span>
      </button>
      <button class="mode-btn" id="mReviewPick">
        <span><span class="t">복습 항목 선택·관리</span><span class="d">문제를 직접 골라 나만의 복습 목록을 만들어요</span></span>
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
      <span class="cat-eyebrow">SUBJECT</span>
      <h2 class="cat-title">과목별로 풀기</h2>
      <span style="font-size:.72rem;color:var(--ink-soft);margin-left:auto">카드: 순서대로 · <b style="color:var(--ink)">⤮</b> 셔플 · ☑ 여러 과목</span>
    </div>
    <div class="cat-grid">
      ${CATS.map(c => {
        const cl = QUESTIONS.filter(q => q.cat === c.id);
        const w = cl.filter(q => wrong.has(q.id)).length;
        return `<div class="cat-btn" style="--ca:${c.accent}" data-card="${c.id}">
          <span class="cat-bar"></span>
          <label class="cat-pick" title="여러 과목 함께 풀기"><input type="checkbox" class="pick" data-cat="${c.id}"></label>
          <button class="cat-body" data-cat="${c.id}" data-mode="order">
            <span class="cat-name">${c.name}</span>
            <span class="cat-desc">${c.desc}</span>
          </button>
          <span class="cat-meta"><span class="cat-count">${cl.length}</span>${w ? `<span class="cat-wrong">복습 ${w}</span>` : ''}</span>
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

  if(resumeState){
    document.getElementById('mResume').onclick = () => {
      S = { list:resumeState.list, i:resumeState.i, full:resumeState.full, part:resumeState.part,
            none:resumeState.none, wrong:resumeState.wrong, mode:resumeState.mode, label:resumeState.label };
      renderQuiz();
    };
  }
  document.getElementById('mAll').onclick = () => startSession(QUESTIONS.slice(), 'all', '전체 풀기');
  document.getElementById('mShuffle').onclick = () => startSession(shuffle(QUESTIONS), 'shuffle', '랜덤 셔플');
  document.getElementById('mWrong').onclick = () => {
    const set = new Set(loadWrong());
    startSession(shuffle(QUESTIONS.filter(q => set.has(q.id))), 'wrong', '복습 목록');
  };
  document.getElementById('mReview').onclick = () => {
    const set = new Set(loadReview());
    startSession(QUESTIONS.filter(q => set.has(q.id)), 'review', '복습 항목');
  };
  document.getElementById('mReviewPick').onclick = renderReviewPicker;
  document.querySelectorAll('.cat-body[data-type], .cat-shuffle[data-type]').forEach(btn => {
    btn.onclick = () => {
      const t = btn.dataset.type;
      const sh = btn.dataset.mode === 'shuffle';
      let list = QUESTIONS.filter(q => q.type === t);
      startSession(sh ? shuffle(list) : list, sh ? 'type-shuffle' : 'type', t + (sh ? ' · 셔플' : ''));
    };
  });
  document.querySelectorAll('.cat-body[data-cat], .cat-shuffle[data-cat]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.cat;
      const sh = btn.dataset.mode === 'shuffle';
      let list = QUESTIONS.filter(q => q.cat === id);
      startSession(sh ? shuffle(list) : list, sh ? 'cat-shuffle' : 'cat', CAT_NAME[id] + (sh ? ' · 셔플' : ''));
    };
  });
  document.querySelectorAll('.round-btn').forEach(btn => {
    btn.onclick = () => {
      const no = +btn.dataset.round;
      startSession(QUESTIONS.filter(q => q.round === no), 'round', `${no}회`);
    };
  });

  /* ---- 여러 과목 함께 풀기 ---- */
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
    let list = QUESTIONS.filter(q => picked.has(q.cat));
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

/* ============ 복습 항목 선택·관리 화면 ============ */
function renderReviewPicker(){
  pill.textContent = '복습 항목 선택';
  const P = QUESTIONS;
  app.innerHTML = `
  <section class="review-picker">
    <div class="rp-head">
      <button class="rp-back" id="rpBack">← 홈으로</button>
      <h2 class="cat-title">복습 항목 선택</h2>
      <p class="rp-sub">공부할 문제를 직접 골라 체크하세요. 선택한 항목은 <b>자동 저장</b>되며, 홈의 <b>복습 항목만 풀기</b> 또는 아래 버튼으로 모아서 공부할 수 있어요.</p>
    </div>
    <div class="rp-toolbar">
      <input type="search" id="rpSearch" class="rp-search" placeholder="문제·모범답안·회차로 검색" autocomplete="off">
      <span class="rp-count" id="rpCount"></span>
    </div>
    <div class="rp-list" id="rpList"></div>
    <div class="combo-bar" id="reviewBar" hidden>
      <span class="combo-info" id="rpBarInfo"></span>
      <div class="combo-actions">
        <button class="combo-clear" id="rpClear">전체 해제</button>
        <button id="rpOrder">순서대로</button>
        <button class="primary" id="rpShuffle">셔플로 풀기</button>
      </div>
    </div>
  </section>`;

  const listEl = document.getElementById('rpList');
  const countEl = document.getElementById('rpCount');
  const barInfo = document.getElementById('rpBarInfo');
  const bar = document.getElementById('reviewBar');
  const search = document.getElementById('rpSearch');

  function match(q, f){
    return !f || q.q.toLowerCase().includes(f) || (q.a||'').toLowerCase().includes(f)
      || `${q.round}회`.includes(f) || `${q.round}-${q.num}`.includes(f);
  }
  function refreshMeta(){
    const set = new Set(loadReview());
    const n = P.filter(q => set.has(q.id)).length;
    countEl.textContent = `선택 ${n} / 전체 ${P.length}`;
    if(n){ bar.hidden = false; barInfo.innerHTML = `<b>${n}개</b> 복습 항목 선택됨`; }
    else{ bar.hidden = true; }
  }
  function drawList(){
    const sel = new Set(loadReview());
    const f = search.value.trim().toLowerCase();
    const groups = CATS.map(c => ({ c, items: P.filter(q => q.cat === c.id && match(q, f)) }))
      .filter(g => g.items.length);
    if(!groups.length){ listEl.innerHTML = `<p class="rp-empty">검색 결과가 없어요.</p>`; return; }

    listEl.innerHTML = groups.map(g => `
      <div class="rp-group" style="--ca:${g.c.accent}">
        <div class="rp-group-head">
          <span class="rp-group-name">${g.c.name}</span>
          <span class="rp-group-cnt">${g.items.length}문항</span>
          <button class="rp-all" data-cat="${g.c.id}">이 목록 전체 선택</button>
        </div>
        ${g.items.map(q => `
          <label class="rp-item${sel.has(q.id)?' on':''}">
            <input type="checkbox" class="rp-chk" data-id="${esc(q.id)}" ${sel.has(q.id)?'checked':''}>
            <span class="rp-item-main">
              <span class="rp-item-tag">${q.round}회 ${q.num}번 · ${q.type}</span>
              <span class="rp-item-q">${esc(q.q).replace(/\s*\n\s*/g,' ')}</span>
            </span>
          </label>`).join('')}
      </div>`).join('');

    listEl.querySelectorAll('.rp-chk').forEach(chk => {
      chk.onchange = () => {
        setReview(chk.dataset.id, chk.checked);
        chk.closest('.rp-item').classList.toggle('on', chk.checked);
        refreshMeta();
      };
    });
    listEl.querySelectorAll('.rp-all').forEach(btn => {
      btn.onclick = () => {
        const f2 = search.value.trim().toLowerCase();
        const ids = P.filter(q => q.cat === btn.dataset.cat && match(q, f2)).map(q => q.id);
        const set = new Set(loadReview());
        const allOn = ids.every(id => set.has(id));
        ids.forEach(id => allOn ? set.delete(id) : set.add(id));
        saveReview([...set]);
        drawList(); refreshMeta();
      };
    });
  }
  function startReview(sh){
    const set = new Set(loadReview());
    let list = P.filter(q => set.has(q.id));
    if(!list.length) return;
    startSession(sh ? shuffle(list) : list, sh ? 'review-shuffle' : 'review', '복습 항목' + (sh ? ' · 셔플' : ''));
  }

  document.getElementById('rpBack').onclick = renderHome;
  document.getElementById('rpClear').onclick = () => {
    const keep = loadReview().filter(id => !P.some(q => q.id === id));
    saveReview(keep);
    drawList(); refreshMeta();
  };
  document.getElementById('rpOrder').onclick = () => startReview(false);
  document.getElementById('rpShuffle').onclick = () => startReview(true);
  search.addEventListener('input', drawList);

  drawList();
  refreshMeta();
}

/* ============ 퀴즈 ============ */
function renderQuiz(){
  saveResume();                       // 현재 진행 지점 저장 (이어풀기용)
  const q = S.list[S.i];
  const { body, note } = splitAnswer(q.a);
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
    <div class="score-line"><span class="o">충분 ${S.full}</span><span class="mid">부분 ${S.part}</span><span class="x">못씀 ${S.none}</span></div>

    <article class="card">
      <span class="num-chip">${q.round}회 ${q.num}번</span><span class="cat-chip">${q.type}</span><span class="cat-chip">${CAT_NAME[q.cat]||''}</span>
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

  const starBtn = document.getElementById('starBtn');
  function paintStar(){
    const on = isReview(q.id);
    starBtn.classList.toggle('on', on);
    starBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    starBtn.textContent = on ? '★ 복습 항목' : '☆ 복습 담기';
  }
  paintStar();
  starBtn.onclick = () => { toggleReview(q.id); paintStar(); };

  document.getElementById('checkBtn').onclick = doCheck;
  document.getElementById('revealBtn').onclick = () => reveal(null, '');
  document.getElementById('quitBtn').onclick = () => showConfirm('지금까지 푼 결과를 보고 종료할까요?', renderResult);

  // 채점 후 모범답안을 보면서 내 답안을 고쳐 다시 채점
  const meTa = document.getElementById('myAnsEdit');
  meTa.addEventListener('keydown', e => {
    if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); doRegrade(); }
  });
  document.getElementById('regradeBtn').onclick = doRegrade;

  function doCheck(){
    const val = ta.value;
    reveal(autoGrade(val, body), val);
  }
  function doRegrade(){
    const val = meTa.value;
    reveal(autoGrade(val, body), val);
  }
}

function reveal(grade, userVal){
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

  // 재채점(reveal 재호출) 시 이전 판정 리스너가 남아 중복되지 않도록 정리 후 다시 등록
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
      <summary>${q.round}회 ${q.num}번 · ${q.type} · ${CAT_NAME[q.cat]||''} <span class="v-chip ${w.verdict}">${w.verdict === 'part' ? '부분' : '못씀'}</span></summary>
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

/* ---------- 코드·로그 블록 인식 ----------
   기출 지문의 설정 파일·룰·로그는 ``` 펜스 없이 평문으로 들어있다.
   아래 신호가 잡히는 줄을 코드로 보고, 연속된 구간을 <pre>로 묶어 가독성을 높인다.
   산문이 코드로 잘못 잡히면 오히려 읽기 나빠지므로 신호는 보수적으로 유지할 것. */
const CODE_SIGNS = [
  /[{};]\s*$/,                                   // zone "..." IN {  /  type master;  /  };
  /^\s*[{}]/,                                    // 블록 여닫기
  /^\s*\d{1,3}(\.\d{1,3}){3}[\s:]/,              // 로그 앞머리의 IP
  /"(GET|POST|HEAD|PUT|DELETE)\s|\bHTTP\/[012]\.[019]/,  // 웹 로그·요청 라인
  /^\s*(GET|POST)\s+\/\S/,
  /^\s*(alert|pass|drop|reject)\s+(tcp|udp|icmp|ip|any)\b/i,  // Snort 룰
  /\b(iptables|access-list|hping3?|nmap|tcpdump|netstat|lsof)\b/,
  /^\s*(zone|type|file|masters|allow-\w+|options|forwarders)\b.*[;{"]/i,
  /^\s*(Options|AddType|AddHandler|Order|Deny|Allow|LimitRequestBody|AllowOverride)\s+\S/,
  /^\s*<\/?(FilesMatch|Directory|Location|VirtualHost|Limit)\b/i,
  /^\s*[#$]\s+\S/,                               // 셸 프롬프트
  /^[\w.\-]+:[^:\s]*:\d+:/,                      // passwd / shadow 레코드
  /^\s*(int|char|void|unsigned|return|if|for|while)\b.*[;({]/,  // C 코드
  /\b(strcpy|printf|scanf|sprintf|memcpy|gets)\s*\(/,
  /^\s*(chmod|chown|find|grep|awk|sed|cat|ls|ps|su|sudo|useradd|usermod|passwd)\s+[-\/\w]/,
  /^\s*[\w.\-]+\s*=\s*[^=]+$/,                   // key = value 설정
  /^\s*(Content-Type|User-Agent|Referer|Host|Cache-Control|Cookie|Set-Cookie|Accept|Connection|Server|Date|Content-Length)\s*:/i,
];
// 중괄호·세미콜론·IP·HTTP 처럼 산문에는 거의 나오지 않는 '구조적' 신호
const CODE_STRUCT = [
  /[{};]\s*$/,
  /^\s*[{}]/,
  /^\s*\d{1,3}(\.\d{1,3}){3}[\s:]/,
  /\bHTTP\/[012]\.[019]/,
];
function isCodeLine(l){
  const t = l.trim();
  if(!t) return false;
  // 산문 불릿("- iptables 룰 설정은 출제 0순위...")이 도구명 때문에 코드로 잡히는 것을 막는다
  if(/^[-*•]\s/.test(t) && !/[;{]\s*$/.test(t)) return false;
  if(/^[가-힣]/.test(t) && !/[{};]\s*$/.test(t)) return false;  // 한글로 시작하는 설명문은 제외
  if(!CODE_SIGNS.some(re => re.test(l))) return false;
  // 한글 비중이 높으면 구조적 신호가 있을 때만 코드로 인정 (설명이 섞인 줄 보호)
  const ko = (t.match(/[가-힣]/g) || []).length / t.length;
  if(ko > 0.3) return CODE_STRUCT.some(re => re.test(l));
  return true;
}
// 연속된 코드 줄을 하나의 블록으로 묶는다 (블록 내부의 빈 줄은 유지)
function groupBlocks(lines){
  const out = [];
  let i = 0;
  while(i < lines.length){
    if(isCodeLine(lines[i])){
      const buf = [];
      while(i < lines.length){
        if(isCodeLine(lines[i])){ buf.push(lines[i]); i++; continue; }
        // 코드 줄 사이에 낀 빈 줄은 블록에 포함 (뒤에 코드가 더 있을 때만)
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
  return h.replace(/\(\s*([A-Za-z]|[0-9]{1,2}|[가-힣])\s*\)/g,
    '<span class="blank">( $1 )</span>');
}
function formatText(s){
  const src = (s || '').replace(/\r/g, '');
  // ``` 펜스가 있으면 그대로 존중한다
  const parts = src.split(/```/);
  let html = '';
  parts.forEach((part, idx) => {
    if(idx % 2 === 1){   // 펜스 안 = 코드
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
  if(!QUESTIONS.length) showFatal('서술형·실무형 문항을 찾지 못했습니다.');
  else renderHome();
}catch(e){
  showFatal(e && e.message);
}
