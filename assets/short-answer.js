const QUESTIONS = window.QUESTIONS;

/* ============ 상태 ============ */
const app = document.getElementById('app');
const pill = document.getElementById('sessionPill');
let S = null; // 현재 세션

const CATS = [
  {id:'sys',  name:'시스템 보안',            desc:'리눅스·유닉스·윈도우, 로그, 권한, 메모리', accent:'#0D6E5F'},
  {id:'net',  name:'네트워크 보안',          desc:'라우팅, DNS, IPSec/VPN, 스위칭, 포트', accent:'#1F5FA6'},
  {id:'app',  name:'애플리케이션 보안',      desc:'웹 취약점, SQLi·XSS, HTTP, DB 암호화', accent:'#9A5B1E'},
  {id:'soc',  name:'보안관제·침해사고 대응', desc:'IDS, 악성코드, APT, 스캔, 탐지 도구', accent:'#7A3FA6'},
  {id:'risk', name:'위험관리·법규',          desc:'위험분석, ISMS-P, 개인정보보호법, BCP', accent:'#B4452E'},
];
const CAT_NAME = Object.fromEntries(CATS.map(c=>[c.id,c.name]));

/* 기출 회차 태그 (키 = 문제번호 n → 회차)
   저장소의 정본 기출(13—30회 gichul-data)·기출 복원본(answser/add_anser)과
   문항·정답이 강하게 일치한 문항만 회차를 확정해 표기한다.
   여기에 없는 번호는 회차를 특정할 수 없어 태그를 표시하지 않는다. */
const ROUND_MAP = {
  '1':24,'2':24,'3':24,'4':18,'5':24,'6':24,'7':24,'8':24,'9':24,'10':24,'11':24,'12':24,'13':24,
  '14':23,'15':23,'16':23,'17':23,'18':23,'19':23,'20':23,'21':23,'22':23,'23':23,'24':23,'25':23,
  '26':22,'27':22,'28':22,'29':22,'30':22,'31':22,'32':22,'33':22,'34':22,'35':22,'36':22,'37':22,
  '38':21,'39':21,'40':21,'41':21,'42':21,'43':21,'44':21,'45':21,'46':21,'47':21,'48':21,
  '49':20,'50':20,'51':20,'52':20,'53':20,'54':20,'55':20,'56':20,'57':20,'58':20,'59':20,'60':20,'61':20,
  '62':18,'63':19,'64':19,'65':19,'66':19,'67':19,'68':19,'69':19,'70':19,'71':19,
  '72':18,'73':18,'74':18,'75':18,'76':18,'77':18,'78':18,'79':18,'80':18,'81':18,
  '82':13,'83':13,'84':13,'85':13,'86':13,'87':13,'88':13,'89':13,'90':13,'91':13,'92':13,
  '93':16,'94':16,'95':16,'96':16,'97':16,'99':16,'100':16,'101':16,'102':16,'103':16,'104':16,
  '105':15,'106':15,'107':15,'108':15,'109':15,'110':15,'111':15,'112':15,'113':15,'114':15,
  '115':14,'116':14,'117':14,'118':14,'119':14,'120':14,'121':14,'122':14,'123':14,'124':14,
  '125':17,'126':17,'127':17,'128':17,'129':17,'130':17,'131':17,'132':17,'133':17,'134':17,
  '135':25,'136':25,'137':25,'138':25,'139':25,'140':25,'141':25,'142':25,'143':25,'144':25,'145':25,'146':25,
  '147':26,'148':26,'149':26,'150':26,'151':26,'152':26,'153':26,'154':26,'155':26,'156':26,'157':26,'158':26,
  '196':27,'259':18,'274':27,'275':27,'276':27,'277':27,'278':27,'279':27,'280':18,'281':27,'282':27,'283':27,'284':27,
  '285':28,'286':28,'287':28,'288':28,'289':28,'290':28,'291':28,'292':28,'293':28,'294':28,'295':28,'296':28,
  '297':24,'298':29,'299':29,'300':29,'301':29,'302':29,'303':29,'304':30,'305':30,'306':30,'307':30,'308':30,'309':30,'310':30,
};
function roundChip(n){
  const r = ROUND_MAP[n];
  return r ? `<span class="cat-chip round-chip">${r}회 기출</span>` : '';
}

const WRONG_KEY = 'isec_wrong_v1';

// localStorage가 차단된 환경(프라이빗 브라우징, 샌드박스 iframe 등)에서도
// 앱이 죽지 않도록 안전한 래퍼 + 메모리 폴백을 사용한다.
const memStore = {};
let storageOK = true;
function safeGet(key, fallback){
  try{ const v = localStorage.getItem(key); return v===null ? fallback : v; }
  catch(e){ storageOK=false; return (key in memStore) ? memStore[key] : fallback; }
}
function safeSet(key, val){
  try{ localStorage.setItem(key, val); }
  catch(e){ storageOK=false; memStore[key]=val; }
}

// 문제 풀 — 기출만 출제 (데이터의 추천 문제 r:true는 제외)
function pool(){ return QUESTIONS.filter(q=>!q.r); }
function loadWrong(){ try{return JSON.parse(safeGet(WRONG_KEY,'[]'))}catch(e){return []} }
function saveWrong(arr){ safeSet(WRONG_KEY, JSON.stringify([...new Set(arr)])); }


/* ============ 채점 정규화 ============ */
function normalize(str){
  return (str||'')
    .toLowerCase()
    .replace(/[\s]/g,'')
    .replace(/[()（）.,·、/:;'"`\-_~!?]/g,'')
    .replace(/[은는이가을를와과의로으로및]/g,'');
}
// 정답 문자열에서 핵심 토큰 추출 (괄호 라벨 (A) 등은 제거)
function answerTokens(ans){
  return ans
    .split('\n')
    .map(line=>line.replace(/^\([A-Za-z0-9]+\)\s*/,'').replace(/^\d+[).]\s*/,'').trim())
    .filter(Boolean);
}
// 사용자가 입력한 답을 라인 단위로 채점 → 일치율
function autoGrade(userInput, ans){
  const tokens = answerTokens(ans);
  if(!userInput.trim()) return {ratio:0, hit:0, total:tokens.length};
  const uNorm = normalize(userInput);
  let hit=0;
  tokens.forEach(t=>{
    // 토큰 안의 핵심어들 — 괄호 안 보조설명/슬래시 구분은 어느 하나라도 맞으면 정답 처리
    const variants = t.split(/[,，]|or|\(|\)|（|）|\//).map(x=>normalize(x)).filter(x=>x.length>=1);
    const matched = variants.some(v=> v.length>=1 && uNorm.includes(v));
    if(matched) hit++;
  });
  return {ratio: tokens.length? hit/tokens.length : 0, hit, total:tokens.length};
}

/* ============ 세션 시작 ============ */
function shuffle(a){const r=a.slice();for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]]}return r}

function startSession(list, mode, label){
  S = { list, i:0, o:0, x:0, wrong:[], mode, label, answered:false };
  renderQuiz();
}

/* ============ 홈 ============ */
function renderHome(){
  const P = pool();
  pill.textContent = `${P.length} 문항`;
  const wrong = loadWrong();
  const wrongInPool = P.filter(q=>wrong.includes(q.n)).length;
  app.innerHTML = `
  <section class="hero">
    <h1>틀린 문제는 <em>다시 만날 때까지</em><br>끝나지 않는다</h1>
    <p>정보보안기사 실기 단답형 기출 ${P.length}제. 답을 직접 입력해 채점하고, 약점만 골라 반복 훈련하세요.</p>
    <div class="stat-rail">
      <div class="stat"><span class="num">${P.length}</span><span class="lbl">기출 문항</span></div>
      <div class="stat bad"><span class="num">${wrongInPool}</span><span class="lbl">오답 노트</span></div>
      <div class="stat good"><span class="num">${P.length - wrongInPool}</span><span class="lbl">남은 안전 문항</span></div>
    </div>

    <div class="mode-grid">
      <button class="mode-btn primary" id="mAll">
        <span><span class="t">전체 풀기</span><span class="d">처음부터 끝까지 순서대로 (${P.length}문항)</span></span>
        <span class="arrow">→</span>
      </button>
      <button class="mode-btn" id="mShuffle">
        <span><span class="t">랜덤 셔플</span><span class="d">${P.length}문항을 무작위 순서로</span></span>
        <span class="arrow">→</span>
      </button>
      <button class="mode-btn danger" id="mWrong" ${wrongInPool? '':'disabled'}>
        <span><span class="t">오답만 다시</span><span class="d">${wrongInPool? wrongInPool+'문항 집중 복습':'아직 오답 노트가 비어 있어요'}</span></span>
        <span class="arrow">→</span>
      </button>
    </div>

    <div class="cat-head">
      <span class="cat-eyebrow">CATEGORY</span>
      <h2 class="cat-title">분야별로 풀기</h2>
      <span style="font-size:.72rem;color:var(--ink-soft);margin-left:auto">카드: 순서대로 · <b style="color:var(--ink)">⤮</b> 셔플</span>
    </div>
    <div class="cat-grid">
      ${CATS.map(c=>{
        const cl = P.filter(q=>q.c===c.id);
        const n = cl.length;
        const w = cl.filter(q=>wrong.includes(q.n)).length;
        return `<div class="cat-btn" style="--ca:${c.accent}">
          <span class="cat-bar"></span>
          <button class="cat-body" data-cat="${c.id}" data-mode="order">
            <span class="cat-name">${c.name}</span>
            <span class="cat-desc">${c.desc}</span>
          </button>
          <span class="cat-meta"><span class="cat-count">${n}</span>${w? `<span class="cat-wrong">오답 ${w}</span>`:''}</span>
          <button class="cat-shuffle" data-cat="${c.id}" data-mode="shuffle" title="${c.name} 셔플로 풀기" aria-label="${c.name} 무작위 순서로 풀기">⤮</button>
        </div>`;
      }).join('')}
    </div>

    <p class="note">답을 입력하면 키워드 자동 채점이 1차로 도와주고, 최종 정답 여부는 키보드 1(정답)·2(오답)로 확정합니다. 틀린 문제는 오답 노트에 자동 저장됩니다.</p>
  </section>`;

  document.getElementById('mAll').onclick = ()=> startSession(pool(), 'all', '전체 풀기');
  document.getElementById('mShuffle').onclick = ()=> startSession(shuffle(pool()), 'shuffle', '랜덤 셔플');
  document.getElementById('mWrong').onclick = ()=>{
    const set = new Set(loadWrong());
    const list = pool().filter(q=>set.has(q.n));
    if(list.length) startSession(shuffle(list), 'wrong', '오답만 다시');
  };
  document.querySelectorAll('.cat-body, .cat-shuffle').forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.cat;
      const shuffleMode = btn.dataset.mode === 'shuffle';
      let list = pool().filter(q=>q.c===id);
      if(shuffleMode) list = shuffle(list);
      startSession(list, shuffleMode?'cat-shuffle':'cat', CAT_NAME[id] + (shuffleMode?' · 셔플':''));
    };
  });
}

/* ============ 퀴즈 화면 ============ */
function renderQuiz(){
  const q = S.list[S.i];
  const total = S.list.length;
  const pct = Math.round((S.i)/total*100);
  pill.textContent = `${S.label}`;
  app.innerHTML = `
    <div class="quiz-top">
      <div class="q-tag">${String(S.i+1).padStart(2,'0')}<span class="of"> / ${total}</span></div>
      <button class="quit" id="quitBtn">그만두기</button>
    </div>
    <div class="rail"><div class="fill" style="width:${pct}%"></div></div>
    <div class="score-line"><span class="o">정답 ${S.o}</span><span class="x">오답 ${S.x}</span><span>Q-${String(q.n).padStart(3,'0')}</span></div>

    <article class="card">
      <span class="num-chip">Q-${String(q.n).padStart(3,'0')}</span><span class="cat-chip">${CAT_NAME[q.c]||''}</span>${roundChip(q.n)}
      <div class="q-text">${esc(q.q)}</div>

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
        <div id="gradeMsg" style="margin-top:14px;font-size:.85rem"></div>
        <div class="actions" id="verdictRow">
          <button class="btn btn-o" id="markO"><span class="key">1</span> 맞았어요<small>정답 처리</small></button>
          <button class="btn btn-x" id="markX"><span class="key">2</span> 틀렸어요<small>오답 노트에 저장</small></button>
        </div>
      </div>
    </article>`;

  document.querySelector('.q-text').innerHTML = formatQ(q.q);
  const ta = document.getElementById('userAns');
  ta.focus();
  // Enter = 채점 / Shift+Enter = 줄바꿈
  ta.addEventListener('keydown', e=>{
    if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); doCheck(); }
  });

  document.getElementById('checkBtn').onclick = doCheck;
  document.getElementById('revealBtn').onclick = ()=> reveal(null, '');
  document.getElementById('quitBtn').onclick = ()=>{
    showConfirm('지금까지 푼 결과를 보고 종료할까요?', renderResult);
  };

  function doCheck(){
    const val = document.getElementById('userAns').value;
    const g = autoGrade(val, q.a);
    reveal(g, val);
  }
}

function reveal(grade, userVal){
  const q = S.list[S.i];
  document.getElementById('inputArea').style.display='none';
  const box = document.getElementById('ansBox');
  box.classList.add('show');

  // 내가 입력한 답 표시
  const wrap = document.getElementById('myAnsWrap');
  const myText = document.getElementById('myAnsText');
  if(userVal && userVal.trim()){
    myText.textContent = userVal;
    wrap.style.display='block';
  }else{
    myText.innerHTML = '<span style="color:var(--ink-soft);font-weight:400">(입력 없음 · 정답만 확인)</span>';
    wrap.style.display='block';
  }

  const msg = document.getElementById('gradeMsg');
  if(grade===null){
    msg.innerHTML = `<span style="color:var(--ink-soft)">정답을 확인하고 스스로 채점하세요.</span>`;
    // 모르겠음은 기본 오답 쪽으로 안내하되 강제하진 않음
  }else{
    const p = Math.round(grade.ratio*100);
    if(grade.ratio>=0.999){
      msg.innerHTML = `<span style="color:var(--accent);font-weight:600">자동 채점: 핵심 키워드 ${grade.hit}/${grade.total} 일치 (${p}%) — 정답으로 보입니다.</span>`;
    }else if(grade.ratio>0){
      msg.innerHTML = `<span style="color:var(--warn);font-weight:600">자동 채점: ${grade.hit}/${grade.total} 일치 (${p}%)</span> <span style="color:var(--ink-soft)">— 정답과 비교 후 직접 확정하세요.</span>`;
    }else{
      msg.innerHTML = `<span style="color:var(--warn);font-weight:600">자동 채점: 일치하는 키워드를 찾지 못했어요.</span> <span style="color:var(--ink-soft)">표기 차이일 수 있으니 직접 확인하세요.</span>`;
    }
  }
  msg.innerHTML += `<div style="margin-top:8px;font-size:.74rem;color:var(--ink-soft)">키보드 <b>1</b> 정답 · <b>2</b> 오답 으로 바로 넘어가기</div>`;
  document.getElementById('markO').onclick = ()=> decide(true);
  document.getElementById('markX').onclick = ()=> decide(false);

  // 정답 확인 후 키보드 1 / 2 로 판정
  function decide(correct){
    document.removeEventListener('keydown', keyJudge);
    next(correct);
  }
  function keyJudge(e){
    if(e.key==='1'){ e.preventDefault(); decide(true); }
    else if(e.key==='2'){ e.preventDefault(); decide(false); }
  }
  document.addEventListener('keydown', keyJudge);
}

function next(correct){
  const q = S.list[S.i];
  if(correct){
    S.o++;
    // 오답 노트에서 제거 (이제 맞췄으므로)
    const w = loadWrong().filter(n=>n!==q.n);
    saveWrong(w);
  }else{
    S.x++;
    S.wrong.push(q.n);
    const w = loadWrong(); w.push(q.n); saveWrong(w);
  }
  S.i++;
  if(S.i>=S.list.length) renderResult();
  else renderQuiz();
}

/* ============ 결과 ============ */
function renderResult(){
  const done = S.o + S.x;
  const pct = done? Math.round(S.o/done*100) : 0;
  pill.textContent = '결과';
  let verdict, sub;
  if(pct>=90){verdict='합격권 컨디션'; sub='이 페이스를 유지하면 단답형은 든든합니다.';}
  else if(pct>=70){verdict='조금만 더'; sub='오답만 모아 한 번 더 돌리면 확실해집니다.';}
  else if(pct>=40){verdict='약점이 보입니다'; sub='오답 노트 복습으로 점수를 끌어올리세요.';}
  else{verdict='지금이 시작점'; sub='틀린 만큼 오를 수 있어요. 오답부터 다시.';}

  const wrongDetails = S.wrong.map(n=>{
    const q = QUESTIONS.find(x=>x.n===n);
    return `<details class="wrong-item">
      <summary>Q-${String(q.n).padStart(3,'0')}${ROUND_MAP[q.n] ? ' · '+ROUND_MAP[q.n]+'회 기출' : ''}</summary>
      <div class="wq">${esc(q.q)}</div>
      <div class="wa">정답 · ${esc(q.a)}</div>
    </details>`;
  }).join('');

  app.innerHTML = `
    <div class="result-hero">
      <div class="big">${S.o}<span class="pct"> / ${done}</span></div>
      <div class="big" style="font-size:1.3rem;color:var(--accent)">${pct}%</div>
      <h2>${verdict}</h2>
      <p>${sub}</p>
    </div>
    ${S.wrong.length? `<div class="wrong-list"><h3>틀린 문제 ${S.wrong.length}개 · 오답 노트에 저장됨</h3>${wrongDetails}</div>`:`<p style="text-align:center;color:var(--accent);font-weight:600">틀린 문제 없음 — 완벽합니다.</p>`}
    <div class="result-actions">
      ${S.wrong.length? `<button class="mode-btn danger" id="rWrong"><span><span class="t">방금 틀린 문제만 다시</span><span class="d">${S.wrong.length}문항 즉시 재도전</span></span><span class="arrow">→</span></button>`:''}
      <button class="mode-btn" id="rRetry"><span><span class="t">같은 세트 다시 풀기</span></span><span class="arrow">↻</span></button>
      <button class="mode-btn" id="rHome"><span><span class="t">처음 화면으로</span></span><span class="arrow">⌂</span></button>
    </div>`;

  document.querySelectorAll('.wrong-item .wq').forEach((el,idx)=>{
    const n = S.wrong[idx]; const q = QUESTIONS.find(x=>x.n===n);
    el.innerHTML = formatQ(q.q);
  });

  if(S.wrong.length){
    document.getElementById('rWrong').onclick = ()=>{
      const list = S.wrong.map(n=>QUESTIONS.find(x=>x.n===n));
      startSession(shuffle(list), 'wrong', '방금 틀린 문제');
    };
  }
  document.getElementById('rRetry').onclick = ()=>{
    const reshuffle = (S.mode==='shuffle' || S.mode==='cat-shuffle' || S.mode==='wrong');
    startSession(reshuffle?shuffle(S.list):S.list.slice(), S.mode, S.label);
  };
  document.getElementById('rHome').onclick = renderHome;
}

/* ============ 유틸 ============ */
/* ============ 커스텀 확인 모달 (샌드박스 환경에서도 동작) ============ */
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
  const close = ()=> overlay.remove();
  overlay.addEventListener('click', e=>{ if(e.target===overlay) close(); });
  document.getElementById('confirmCancel').onclick = close;
  document.getElementById('confirmOk').onclick = ()=>{ close(); onYes(); };
}

function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
// 코드/표처럼 보이는 문제 가독성: 그대로 pre-wrap, 괄호 빈칸 강조
function formatQ(s){
  let h = esc(s);
  // ( A ) (1) 형태 빈칸 살짝 강조
  h = h.replace(/\(\s*([A-Za-z]|[0-9]{1,2}|[가-힣])\s*\)/g, '<span style="color:var(--accent);font-weight:600;font-family:var(--mono)">( $1 )</span>');
  return h;
}

// 예상치 못한 오류가 나도 빈 화면 대신 안내를 보여준다
window.addEventListener('error', function(e){
  if(!document.getElementById('app').innerHTML.trim()){
    showFatal(e && e.message);
  }
});
function showFatal(msg){
  app.innerHTML = `
    <div style="text-align:center;padding:60px 16px;color:var(--ink-soft)">
      <p style="font-size:1.05rem;font-weight:600;color:var(--ink);margin-bottom:8px">페이지를 불러오지 못했어요</p>
      <p style="font-size:.88rem;margin-bottom:18px">브라우저의 개인정보 보호 설정(추적 방지·시크릿 모드 등)이 원인일 수 있어요. 새 탭에서 다시 열어보세요.</p>
      <button onclick="location.reload()" style="font-size:.9rem;font-weight:600;color:#fff;background:var(--accent);border:none;border-radius:8px;padding:10px 20px;cursor:pointer">다시 시도</button>
    </div>`;
}
try{
  renderHome();
}catch(e){
  showFatal(e && e.message);
}
