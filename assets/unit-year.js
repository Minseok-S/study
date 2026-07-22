/* 단원별 · 연도별 기출 정리 (unit_year.html)
   기출 서술·실무형 108문항(window.GICHUL_DATA)을 "단원(과목) × 연도" 매트릭스로 한눈에 정리한다.
   · 세로축 = 단원(과목) 5개 (과목별 통합 드릴과 동일한 CAT_MAP 분류)
   · 가로축 = 연도 (아래 ROUND_YEAR 로 회차→연도 매핑) / 토글로 회차 원본 보기
   · 셀·행·열을 누르면 해당 범위의 문항이 아래에 펼쳐지고, 각 문항을 열어 모범답안까지 확인.
   ※ 데이터에는 회차만 있고 연도는 없으므로 ROUND_YEAR 는 추정값입니다. 실제 시행 연도와
     다르면 이 표만 고치면 화면 전체가 그에 맞춰 다시 묶입니다. */

/* ===== 회차 → 연도 매핑 (추정 · 필요 시 여기만 수정) =====================
   정보보안기사 실기는 근래 연 3회 시행을 기준으로 32회를 다가오는 시험(≈2026)으로 보고
   역산한 추정값입니다. 회차의 실제 연도를 알면 값을 바꿔 주세요. */
const ROUND_YEAR = {
  13:2019, 14:2019, 15:2019,
  16:2020, 17:2020, 18:2020,
  19:2021, 20:2021, 21:2021,
  22:2022, 23:2022, 24:2022,
  25:2023, 26:2023, 27:2023,
  28:2024, 29:2024, 30:2024,
  31:2025,
};
/* ====================================================================== */

const app = document.getElementById('app');
const pill = document.getElementById('sessionPill');

/* 단원(과목) — 과목별 통합 드릴과 동일한 5개 체계 */
const CATS = [
  {id:'sys',  name:'시스템 보안',            accent:'#0D6E5F'},
  {id:'net',  name:'네트워크 보안',          accent:'#1F5FA6'},
  {id:'app',  name:'애플리케이션 보안',      accent:'#9A5B1E'},
  {id:'soc',  name:'보안관제·침해사고 대응', accent:'#7A3FA6'},
  {id:'risk', name:'위험관리·법규',          accent:'#B4452E'},
];
const CAT_BY_ID = Object.fromEntries(CATS.map(c => [c.id, c]));

/* 기출 서술·실무형 108문항의 단원 분류 (키 = "회차-번호") — 과목별 통합 드릴과 동일 */
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

/* ===== 데이터: 기출 서술·실무형 문항 ===== */
const QUESTIONS = (window.GICHUL_DATA?.rounds || []).flatMap(r =>
  r.questions
    .filter(q => q.type !== '단답형')
    .map(q => ({
      round: r.no,
      num: q.num,
      year: ROUND_YEAR[r.no] ?? null,
      cat: CAT_MAP[`${r.no}-${q.num}`] || 'sys',
      kind: q.type,                 // 서술형 | 실무형
      label: `${r.no}회 ${q.num}번`,
      q: q.question,
      a: q.answer,
    }))
);

/* 가로축 값(연도 or 회차) 목록 */
let axis = 'year';                                    // 'year' | 'round'
function colOf(q){ return axis === 'year' ? (q.year ?? '미상') : q.round; }
function colLabel(v){ return axis === 'year' ? `${v}년` : `${v}회`; }
function colSub(v){
  if (axis === 'round') return ROUND_YEAR[v] ? `${ROUND_YEAR[v]}년` : '';
  const rounds = [...new Set(QUESTIONS.filter(q => q.year === v).map(q => q.round))].sort((a,b)=>a-b);
  return rounds.length ? rounds.join('·') + '회' : '';
}
function cols(){
  const set = [...new Set(QUESTIONS.map(colOf))];
  return set.sort((a,b) => (a === '미상' ? 1 : b === '미상' ? -1 : a - b));
}

/* 선택 상태 { catId|null, col|null } — 둘 중 하나 또는 교차 */
let sel = { cat: null, col: null };

/* ===== 렌더 ===== */
function render(){
  const COLS = cols();
  const totalN = QUESTIONS.length;
  pill.textContent = `서술·실무 ${totalN}문항 · 단원 ${CATS.length} · ${axis === 'year' ? '연도' : '회차'} ${COLS.length}`;

  const count = (catId, col) =>
    QUESTIONS.filter(q => q.cat === catId && colOf(q) === col).length;
  const rowTotal = catId => QUESTIONS.filter(q => q.cat === catId).length;
  const colTotal = col => QUESTIONS.filter(q => colOf(q) === col).length;

  const head = `<thead><tr>
      <th style="text-align:left">단원 \\ ${axis === 'year' ? '연도' : '회차'}</th>
      ${COLS.map(c => `<th class="col-h" data-col="${c}" title="${colLabel(c)} 전체 보기">
        ${colLabel(c)}<span class="col-sub">${colSub(c)}</span></th>`).join('')}
      <th class="tot">합계</th>
    </tr></thead>`;

  const rows = CATS.map(cat => {
    const cells = COLS.map(c => {
      const n = count(cat.id, c);
      const on = sel.cat === cat.id && sel.col === c;
      return `<td class="uy-cell${on ? ' sel' : ''}" data-n="${n}" data-cat="${cat.id}" data-col="${c}"
        title="${cat.name} · ${colLabel(c)} (${n})"><span class="n">${n || '·'}</span></td>`;
    }).join('');
    return `<tr>
      <th class="row-h" data-cat="${cat.id}" style="--rc:${cat.accent}" title="${cat.name} 전체 보기">
        <span class="row-name">${cat.name}</span>
      </th>
      ${cells}
      <td class="tot uy-cell" data-cat="${cat.id}" data-col="" title="${cat.name} 전체 (${rowTotal(cat.id)})">${rowTotal(cat.id)}</td>
    </tr>`;
  }).join('');

  const foot = `<tfoot><tr>
      <th style="text-align:left">합계</th>
      ${COLS.map(c => `<td class="uy-cell" data-cat="" data-col="${c}" title="${colLabel(c)} 전체 (${colTotal(c)})">${colTotal(c)}</td>`).join('')}
      <td class="tot">${totalN}</td>
    </tr></tfoot>`;

  app.innerHTML = `
    <div class="uy-toolbar">
      <div class="uy-seg" id="axisSeg">
        <button data-axis="year" class="${axis==='year'?'on':''}">연도별</button>
        <button data-axis="round" class="${axis==='round'?'on':''}">회차별</button>
      </div>
      <span style="font-size:.8rem;color:var(--ink-soft)">칸·단원·${axis==='year'?'연도':'회차'}를 누르면 아래에 문항이 펼쳐집니다.</span>
      ${axis==='year' ? `<span class="uy-hint">※ 데이터에는 회차만 있어 연도는 <b>추정값</b>입니다. 실제 연도와 다르면 <code>assets/unit-year.js</code> 상단 <code>ROUND_YEAR</code>만 고치면 됩니다.</span>` : ''}
    </div>

    <div class="uy-scroll">
      <table class="uy-matrix">${head}<tbody>${rows}</tbody>${foot}</table>
    </div>

    <div class="uy-legend">
      ${CATS.map(c => `<span><i style="background:${c.accent}"></i>${c.name}</span>`).join('')}
    </div>

    <div class="uy-panel" id="panel"></div>`;

  // 축 토글
  document.querySelectorAll('#axisSeg button').forEach(b => {
    b.onclick = () => { if (axis !== b.dataset.axis){ axis = b.dataset.axis; sel = { cat:null, col:null }; render(); } };
  });
  // 셀
  document.querySelectorAll('.uy-cell').forEach(cell => {
    if (cell.dataset.n === '0') return;
    cell.onclick = () => {
      const cat = cell.dataset.cat || null;
      const col = cell.dataset.col === '' ? null : (axis === 'year' ? colCast(cell.dataset.col) : +cell.dataset.col);
      selectCell(cat, col);
    };
  });
  // 열 헤더(연도/회차 전체)
  document.querySelectorAll('.col-h').forEach(th => {
    th.onclick = () => selectCell(null, axis === 'year' ? colCast(th.dataset.col) : +th.dataset.col);
  });
  // 행 헤더(단원 전체)
  document.querySelectorAll('.row-h').forEach(th => {
    th.onclick = () => selectCell(th.dataset.cat, null);
  });

  renderPanel();
}

// data-col 은 문자열 — 연도 축에서 '미상' 은 그대로, 나머지는 숫자
function colCast(v){ return v === '미상' ? '미상' : +v; }

function selectCell(cat, col){
  // 같은 곳을 다시 누르면 해제
  if (sel.cat === cat && sel.col === col) sel = { cat:null, col:null };
  else sel = { cat, col };
  // 셀 하이라이트만 갱신 (표 전체 재구성 없이)
  document.querySelectorAll('.uy-cell').forEach(c => {
    const cc = c.dataset.cat || null;
    const cv = c.dataset.col === '' ? null : (axis === 'year' ? colCast(c.dataset.col) : +c.dataset.col);
    c.classList.toggle('sel', sel.cat === cc && sel.col === cv);
  });
  renderPanel();
}

function renderPanel(){
  const panel = document.getElementById('panel');
  if (sel.cat === null && sel.col === null){
    panel.innerHTML = `<p class="uy-empty">표에서 칸을 누르면 해당 <b>단원·${axis==='year'?'연도':'회차'}</b>의 기출 문항이 여기에 정리됩니다. 단원 이름(행)이나 ${axis==='year'?'연도':'회차'}(열 머리글)을 누르면 그 줄 전체를 볼 수 있어요.</p>`;
    return;
  }
  const list = QUESTIONS
    .filter(q => (sel.cat === null || q.cat === sel.cat) && (sel.col === null || colOf(q) === sel.col))
    .sort((a,b) => a.round - b.round || a.num - b.num);

  const parts = [];
  if (sel.cat) parts.push(CAT_BY_ID[sel.cat].name);
  if (sel.col !== null) parts.push(colLabel(sel.col));
  const title = parts.join(' · ') || '전체';

  panel.innerHTML = `
    <div class="uy-panel-head">
      <h2>${esc(title)}</h2>
      <span class="cnt">${list.length}문항</span>
    </div>
    ${list.length ? list.map(qCard).join('') : `<p class="uy-empty">이 범위에 해당하는 서술·실무형 기출이 없습니다.</p>`}`;

  panel.querySelectorAll('.uy-q').forEach((el, i) => {
    const q = list[i];
    const { body, note } = splitAnswer(q.a);
    el.querySelector('.q-text').innerHTML = formatText(q.q);
    el.querySelector('.a-text').innerHTML = formatText(body);
    const nt = el.querySelector('.note-text');
    if (nt) nt.innerHTML = formatText(note);
  });
  panel.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function qCard(q){
  const cat = CAT_BY_ID[q.cat];
  const { note } = splitAnswer(q.a);
  const firstLine = (q.q || '').split('\n').find(l => l.trim()) || '';
  return `<details class="uy-q">
    <summary>
      <span class="badge b-round">${q.round}회 ${q.num}번</span>
      <span class="badge b-kind">${q.kind}</span>
      <span class="badge b-cat" style="--cc:${cat.accent}">${cat.name}</span>
      <span class="q-line">${esc(firstLine.length > 70 ? firstLine.slice(0,70) + '…' : firstLine)}</span>
      <span class="chev">▸</span>
    </summary>
    <div class="body">
      <div class="lbl">문제</div>
      <div class="q-text"></div>
      <div class="lbl">모범답안</div>
      <div class="a-text"></div>
      ${note ? `<details class="note-box"><summary>출제 코멘트 · 배점 전략</summary><div class="note-text"></div></details>` : ''}
    </div>
  </details>`;
}

/* ===== 답안 분리 (모범답안 + 출제 코멘트) — 기출 드릴과 동일 ===== */
function isNoteLine(line){
  return /^\s*[​\s]*([-*※·]|\\\*)/.test(line) && /(니다|참고|참조|http|출제|수험서|획득)/.test(line);
}
function splitAnswer(ans){
  const lines = (ans || '').split('\n');
  const i = lines.findIndex(isNoteLine);
  if (i < 0) return { body: (ans || '').trim(), note: '' };
  return { body: lines.slice(0, i).join('\n').trim(), note: lines.slice(i).join('\n').trim() };
}

/* ===== 텍스트 포맷 (코드·로그 블록 인식) — 기출 드릴과 동일 ===== */
function esc(s){ return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
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
function isCodeLine(l){
  const t = l.trim();
  if (!t) return false;
  if (/^[-*•]\s/.test(t) && !/[;{]\s*$/.test(t)) return false;
  if (/^[가-힣]/.test(t) && !/[{};]\s*$/.test(t)) return false;
  if (!CODE_SIGNS.some(re => re.test(l))) return false;
  const ko = (t.match(/[가-힣]/g) || []).length / t.length;
  if (ko > 0.3) return CODE_STRUCT.some(re => re.test(l));
  return true;
}
function groupBlocks(lines){
  const out = []; let i = 0;
  while (i < lines.length){
    if (isCodeLine(lines[i])){
      const buf = [];
      while (i < lines.length){
        if (isCodeLine(lines[i])){ buf.push(lines[i]); i++; continue; }
        if (!lines[i].trim()){ let j = i; while (j < lines.length && !lines[j].trim()) j++; if (j < lines.length && isCodeLine(lines[j])){ i = j; continue; } }
        break;
      }
      out.push({ code: true, lines: buf });
    } else {
      const buf = [];
      while (i < lines.length && !isCodeLine(lines[i])){ buf.push(lines[i]); i++; }
      out.push({ code: false, lines: buf });
    }
  }
  return out;
}
function highlightBlanks(h){ return h.replace(/\(\s*([A-Za-z]|[0-9]{1,2}|[가-힣])\s*\)/g, '<span class="blank">( $1 )</span>'); }
function formatText(s){
  const src = (s || '').replace(/\r/g, '');
  const parts = src.split(/```/);
  let html = '';
  parts.forEach((part, idx) => {
    if (idx % 2 === 1){ html += '<pre class="code">' + esc(part.replace(/^\w*\n/, '').replace(/\n$/, '')) + '</pre>'; return; }
    groupBlocks(part.split('\n')).forEach(b => {
      const text = b.lines.join('\n').replace(/^\n+|\n+$/g, '');
      if (!text.trim()) return;
      if (b.code) html += '<pre class="code">' + esc(text) + '</pre>';
      else html += '<div class="prose">' + highlightBlanks(esc(text)) + '</div>';
    });
  });
  return html || '<div class="prose">' + highlightBlanks(esc(src)) + '</div>';
}

/* ===== 부팅 ===== */
function showFatal(msg){
  app.innerHTML = `<div style="text-align:center;padding:60px 16px;color:var(--ink-soft)">
    <p style="font-size:1.05rem;font-weight:600;color:var(--ink);margin-bottom:8px">페이지를 불러오지 못했어요</p>
    <p style="font-size:.88rem">${esc(msg || '')}</p></div>`;
}
try {
  if (!QUESTIONS.length) showFatal('기출 문항을 찾지 못했습니다.');
  else render();
} catch (e) { showFatal(e && e.message); }
