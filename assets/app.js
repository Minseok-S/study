(function(){
  "use strict";
  const DATA = window.STUDY_DATA;
  const LS_KEY = "secmaster_done_v1";

  // ── 항목 평탄화 + 고유 id 부여 ──
  const ITEMS = [];
  DATA.forEach((subj,si)=>{
    subj.sections.forEach((sec,ci)=>{
      sec.items.forEach((it,ii)=>{
        it.id = "s"+si+"_"+ci+"_"+ii;
        it.subjNum = subj.num; it.subjTitle = subj.title;
        it.secTitle = sec.title; it._si=si; it._ci=ci;
        ITEMS.push(it);
      });
    });
  });
  document.getElementById("totalCount").textContent = ITEMS.length;

  // ── 진도 저장 ──
  let done = {};
  try{ done = JSON.parse(localStorage.getItem(LS_KEY)||"{}"); }catch(e){ done={}; }
  function save(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(done)); }catch(e){} }
  function isDone(id){ return !!done[id]; }
  function toggleDone(id){ if(done[id]) delete done[id]; else done[id]=1; save(); updateProgress(); }

  function updateProgress(){
    const total = ITEMS.length;
    const d = ITEMS.filter(it=>isDone(it.id)).length;
    const pct = total? Math.round(d/total*100):0;
    document.getElementById("progBar").style.width = pct+"%";
    document.getElementById("progTxt").textContent = pct+"% ("+d+"/"+total+")";
    // 섹션 카운트 갱신
    document.querySelectorAll(".sec-btn").forEach(b=>{
      const si=+b.dataset.si, ci=+b.dataset.ci;
      const items = DATA[si].sections[ci].items;
      const dn = items.filter(it=>isDone(it.id)).length;
      const el = b.querySelector(".sc");
      if(el){ el.textContent = dn+"/"+items.length; el.style.color = dn===items.length? "var(--done)":""; }
    });
  }

  // ── 상태 ──
  const state = { mode:"browse", si:0, ci:0, viewAll:false, search:"", filters:{star:false,add:false,todo:false}, flashIdx:0, flashList:[] };

  // ── 마크다운 → HTML (경량) ──
  function esc(s){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function inlineMd(s){
    // 코드 우선 보호
    const codes=[]; s=s.replace(/`([^`]+)`/g,(m,c)=>{ codes.push(c); return "\u0000"+(codes.length-1)+"\u0000"; });
    s=esc(s);
    s=s.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>");
    s=s.replace(/\u0000(\d+)\u0000/g,(m,i)=>"<code>"+esc(codes[+i])+"</code>");
    return s;
  }
  // ── 패킷 구조 다이어그램 ──
  // ```packet
  // title: ESP 터널모드
  // fields: +New IP 헤더, +ESP 헤더, IP 헤더, TCP 헤더, 데이터, +ESP Trailer, +ESP Auth
  // enc: 3-6 | 암호화 (기밀성)
  // auth: 2-6
  // note: 새 IP 헤더는 보호되지 않음
  // ```
  // fields 앞의 +는 IPSec이 새로 추가하는 필드. enc/auth는 1-based 인덱스 범위.
  function packetHTML(code){
    const cfg={fields:[]};
    code.split("\n").forEach(l=>{
      const m=l.match(/^\s*(title|fields|enc|auth|note)\s*:\s*(.+)$/);
      if(m) cfg[m[1]]=m[2].trim();
    });
    const fields=(cfg.fields||"").split(",").map(f=>f.trim()).filter(Boolean);
    if(!fields.length) return "";
    const n=fields.length;
    function bar(spec, cls, fallback, row){
      if(!spec) return "";
      const [range,label]=spec.split("|").map(s=>s.trim());
      const m=range.match(/^(\d+)\s*-\s*(\d+)$/);
      if(!m) return "";
      const a=Math.max(1,Math.min(n,+m[1])), b=Math.max(a,Math.min(n,+m[2]));
      return '<div class="pkt-bar '+cls+'" style="grid-column:'+a+'/'+(b+1)+';grid-row:'+row+'">'
        + esc(label||fallback) + '</div>';
    }
    let h='<div class="pkt">';
    if(cfg.title) h+='<div class="pkt-title">'+inlineMd(cfg.title)+'</div>';
    h+='<div class="pkt-scroll"><div class="pkt-grid" style="grid-template-columns:repeat('+n+',auto)">';
    fields.forEach((f,idx)=>{
      const added=f.startsWith("+");
      h+='<div class="pkt-f'+(added?" add":"")+'" style="grid-column:'+(idx+1)+';grid-row:1">'
        + esc(added?f.slice(1).trim():f) + '</div>';
    });
    h+=bar(cfg.enc,"enc","🔒 암호화 범위",2);
    h+=bar(cfg.auth,"auth","🛡 인증 범위",3);
    h+='</div></div>';
    if(cfg.note) h+='<div class="pkt-note">'+inlineMd(cfg.note)+'</div>';
    return h+'</div>';
  }

  function renderMd(src){
    const lines = src.replace(/\r/g,"").split("\n");
    let html="", i=0;
    function listBlock(baseIndent){
      let out="<ul>"; 
      while(i<lines.length){
        const raw=lines[i];
        const m=raw.match(/^(\s*)[-*]\s+(.*)$/);
        if(!m) break;
        const indent=m[1].length;
        if(indent<baseIndent) break;
        if(indent>baseIndent){ // 중첩
          const sub=listBlock(indent); out=out.replace(/<\/li>$/,"")+sub+"</li>"; continue;
        }
        i++;
        let li="<li>"+inlineMd(m[2]);
        // 연속 중첩 리스트 처리
        if(i<lines.length){
          const nm=lines[i].match(/^(\s*)[-*]\s+/);
          if(nm && nm[1].length>indent){ li+=listBlock(nm[1].length); }
        }
        out+=li+"</li>";
      }
      return out+"</ul>";
    }
    while(i<lines.length){
      const line=lines[i];
      if(/^\s*```/.test(line)){ // 코드블록
        const lang=line.replace(/^\s*```/,"").trim(); i++;
        let code="";
        while(i<lines.length && !/^\s*```/.test(lines[i])){ code+=lines[i]+"\n"; i++; }
        i++;
        if(lang==="packet"){ html+=packetHTML(code); continue; }
        html+="<pre><code>"+esc(code.replace(/\n$/,""))+"</code></pre>"; continue;
      }
      if(/^\s*\|.*\|\s*$/.test(line) && i+1<lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i+1])){
        // 테이블
        const head=line.trim().replace(/^\||\|$/g,"").split("|").map(c=>c.trim());
        i+=2; let rows=[];
        while(i<lines.length && /^\s*\|.*\|\s*$/.test(lines[i])){
          rows.push(lines[i].trim().replace(/^\||\|$/g,"").split("|").map(c=>c.trim())); i++;
        }
        html+="<table><thead><tr>"+head.map(h=>"<th>"+inlineMd(h)+"</th>").join("")+"</tr></thead><tbody>";
        rows.forEach(r=>{ html+="<tr>"+r.map(c=>"<td>"+inlineMd(c)+"</td>").join("")+"</tr>"; });
        html+="</tbody></table>"; continue;
      }
      if(/^\s*[-*]\s+/.test(line)){ html+=listBlock(line.match(/^(\s*)/)[1].length); continue; }
      if(line.trim()==="::\uBCF4\uAC15::"){ html+='<div class="add-mark">\uFF0B \uC5EC\uAE30\uBD80\uD130 \uBCF4\uAC15 \uB0B4\uC6A9</div>'; i++; continue; }
      if(/^\s*>\s?/.test(line)){ html+="<p style='color:var(--ink-mute);border-left:2px solid var(--line2);padding-left:10px'>"+inlineMd(line.replace(/^\s*>\s?/,""))+"</p>"; i++; continue; }
      if(line.trim()===""){ i++; continue; }
      html+="<p>"+inlineMd(line)+"</p>"; i++;
    }
    return html;
  }

  function highlight(html, q){
    if(!q) return html;
    const re=new RegExp("("+q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+")","gi");
    // 태그 밖 텍스트만
    return html.replace(/>([^<]+)</g,(m,txt)=>">"+txt.replace(re,"<mark>$1</mark>")+"<");
  }

  // ── 필터링된 항목 목록 ──
  function filterItems(list){
    const f=state.filters;
    return list.filter(it=>{
      if(f.star && !it.star) return false;
      if(f.add && !(it.added || it.hasAdd)) return false;
      if(f.todo && isDone(it.id)) return false;
      return true;
    });
  }

  // ── ROI 점수 ──
  // 기출 연결 문항 수(it.gichul.q.length)를 그대로 우선순위 점수로 사용한다.
  // ★(빈출) 표시는 이 값이 3 이상인 항목과 100% 일치하도록 사전 검수되어 있어
  // 별도 가중치 없이 gichul 연결 개수만으로 충분한 순위를 만든다.
  function roiScore(it){ return it.gichul ? it.gichul.q.length : 0; }
  // roi 정렬은 "숨기기"가 아니라 "순서 재배치"이므로 filterItems와 분리해 둔다.
  function sortByRoi(list){
    if(!state.filters.roi) return list;
    return list.map((it,i)=>({it,i})).sort((a,b)=> roiScore(b.it)-roiScore(a.it) || a.i-b.i).map(x=>x.it);
  }
  function currentBaseList(){
    if(state.search.trim()){
      const q=state.search.trim().toLowerCase();
      return ITEMS.filter(it=> (it.title+" "+it.body+" "+it.secTitle+" "+it.subjTitle).toLowerCase().includes(q));
    }
    return DATA[state.si].sections[state.ci].items;
  }

  // ── 네비게이션 렌더 ──
  function renderNav(){
    const nav=document.getElementById("nav");
    nav.innerHTML="";
    const allBtn=document.createElement("button");
    allBtn.className="all-btn"+(state.viewAll&&!state.search?" active":"");
    allBtn.innerHTML='<span>📚 전체 항목 보기</span><span class="cnt">'+ITEMS.length+'</span>';
    allBtn.onclick=()=>{ state.viewAll=true; state.search=""; document.getElementById("searchInput").value=""; state.mode="browse"; setModeButtons(); if(state.mode==="flash") buildFlashList(); closeSidebar(); render(); };
    nav.appendChild(allBtn);
    DATA.forEach((subj,si)=>{
      const wrap=document.createElement("div");
      wrap.className="subj"+(si===state.si?" open":"");
      const cnt=subj.sections.reduce((a,s)=>a+s.items.length,0);
      const btn=document.createElement("button");
      btn.className="subj-btn";
      btn.innerHTML='<span class="num">'+subj.num+'</span><span>'+subj.title.replace(/\s*\(.*\)/,"")+'</span><span class="cnt">'+cnt+'</span><span class="chev">▶</span>';
      btn.onclick=()=>{ wrap.classList.toggle("open"); };
      wrap.appendChild(btn);
      const secWrap=document.createElement("div"); secWrap.className="sections";
      subj.sections.forEach((sec,ci)=>{
        const sb=document.createElement("button");
        sb.className="sec-btn"+(si===state.si&&ci===state.ci&&!state.search?" active":"");
        sb.dataset.si=si; sb.dataset.ci=ci;
        const dn=sec.items.filter(it=>isDone(it.id)).length;
        sb.innerHTML='<span>'+sec.title+'</span><span class="sc">'+dn+'/'+sec.items.length+'</span>';
        sb.onclick=()=>{ state.si=si; state.ci=ci; state.viewAll=false; state.search=""; document.getElementById("searchInput").value=""; state.mode="browse"; setModeButtons(); closeSidebar(); render(); };
        secWrap.appendChild(sb);
      });
      wrap.appendChild(secWrap);
      nav.appendChild(wrap);
    });
  }

  // ── 기출 출제 이력 배지 ──
  // it.gichul = {q:["24-9","30-3"], a:["근거앵커"]} — 이 항목과 연결된 실제 기출 문항.
  // 앵커 용어를 기출 원문에서 찾아 자동 연결한 결과이며, 표본 검수 기준 정확도는 8~9할이다.
  // 그래서 배지에 '몇 회 몇 번'을 그대로 노출해 직접 대조·검증할 수 있게 한다.
  function gichulBadge(it){
    if(!it.gichul || !it.gichul.q || !it.gichul.q.length) return "";
    const qs=it.gichul.q;
    const label = qs.map(x=>{const [r,n]=x.split("-"); return r+"회 "+n+"번";});
    const cls = qs.length>=3 ? " hot" : qs.length>=2 ? " warm" : "";
    const title = "클릭하면 연결된 기출 문항(문제·정답)을 볼 수 있어요\n· "+label.join("\n· ");
    // 1개면 회차·번호를 그대로, 여러 개면 개수로 접어서 보여준다
    const text = qs.length===1 ? label[0] : "기출 "+qs.length+"문항";
    return '<span class="badge gichul'+cls+' gk-open" data-gichul="'+esc(qs.join(","))+'" title="'+esc(title)+'">📄 '+esc(text)+'</span>';
  }

  // ── 학습노트 ↔ 기출 연결 보기 ──
  // 기출 배지를 클릭하면 연결된 실제 기출 문항(문제·정답)을 모달로 보여준다.
  let _gichulMap=null;
  function gichulMap(){
    if(_gichulMap) return _gichulMap;
    _gichulMap={};
    ((window.GICHUL_DATA&&window.GICHUL_DATA.rounds)||[]).forEach(r=>r.questions.forEach(q=>{
      _gichulMap[r.no+"-"+q.num]={q:q.question,a:q.answer,type:q.type,round:r.no,num:q.num};
    }));
    return _gichulMap;
  }
  function showGichulModal(ids){
    const map=gichulMap();
    const list=ids.map(id=>map[id]).filter(Boolean);
    if(!list.length) return;
    const body=list.map(g=>
      '<div class="gk-item">'
      +'<div class="gk-tag">'+g.round+'회 '+g.num+'번 · '+esc(g.type)+'</div>'
      +'<div class="gk-q"><div class="md">'+renderMd(g.q)+'</div></div>'
      +'<div class="gk-alabel">정답 · 해설</div>'
      +'<div class="gk-a"><div class="md">'+renderMd(g.a)+'</div></div>'
      +'</div>'
    ).join('');
    const ov=document.createElement("div");
    ov.className="gk-overlay";
    ov.innerHTML='<div class="gk-modal"><div class="gk-head"><span>📄 연결된 기출 '+list.length+'문항</span><button class="gk-close" aria-label="닫기">✕</button></div><div class="gk-scroll">'+body+'</div></div>';
    ov.addEventListener("click",e=>{ if(e.target===ov||e.target.closest(".gk-close")) ov.remove(); });
    document.addEventListener("keydown",function esc2(ev){ if(ev.key==="Escape"){ ov.remove(); document.removeEventListener("keydown",esc2); } });
    document.body.appendChild(ov);
  }

  // ── 카드(둘러보기) 렌더 ──
  function cardHTML(it){
    const doneC=isDone(it.id)?" done":"";
    let badges="";
    if(it.star) badges+='<span class="badge star">★ 빈출</span>';
    badges+=gichulBadge(it);
    if(it.added) badges+='<span class="badge add">＋ 보강</span>';
    else if(it.hasAdd) badges+='<span class="badge add">＋ 보강 추가</span>';
    const showOrigin = state.search || (state.viewAll && state.filters.roi);
    const tag = showOrigin ? (it.subjNum+". "+it.subjTitle.replace(/\s*\(.*\)/,"")+" › "+it.secTitle) : "";
    let body=renderMd(it.body);
    if(state.search) body=highlight(body, state.search.trim());
    let title=inlineMd(it.title);
    if(state.search) title=highlight(title, state.search.trim());
    return '<article class="card'+doneC+'" data-id="'+it.id+'">'
      +'<div class="card-head">'
        +'<button class="chk" data-act="done" title="학습 완료 체크"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M20 6 9 17l-5-5"/></svg></button>'
        +'<div class="card-titles" data-act="expand">'
          +'<div class="card-title">'+title+'<span class="badges">'+badges+'</span></div>'
          +(tag?'<div class="card-tag">'+tag+'</div>':'')
        +'</div>'
        +'<div class="card-toggle" data-act="expand">▾</div>'
      +'</div>'
      +'<div class="card-body"><div class="md">'+body+'</div></div>'
    +'</article>';
  }

  function renderBrowse(){
    const content=document.getElementById("content");
    let list, crumb, title, meta;
    // 전체 보기: ROI 정렬이 꺼져 있으면 모든 과목·섹션을 구분선과 함께 표시,
    // 켜져 있으면 과목 구분 없이 ROI 점수 내림차순의 단일 랭킹 리스트로 평탄화한다.
    if(state.viewAll && !state.search.trim()){
      const dnAll=ITEMS.filter(it=>isDone(it.id)).length;
      let body="", shown=0;
      if(state.filters.roi){
        const flat=sortByRoi(filterItems(ITEMS));
        shown=flat.length;
        body=flat.map(cardHTML).join("");
      }else{
        DATA.forEach(subj=>{
          subj.sections.forEach(sec=>{
            const items=filterItems(sec.items);
            if(!items.length) return;
            shown+=items.length;
            body+='<div class="sec-div"><h3>'+esc(subj.num+". "+sec.title)+'</h3><div class="l"></div><span class="p">'+items.length+'</span></div>';
            body+=items.map(cardHTML).join("");
          });
        });
      }
      let html='<div class="crumb">전체 항목</div>'
        +'<div class="page-h"><h2>📚 전체 보기'+(state.filters.roi?' · 🔥 ROI 랭킹순':'')+'</h2></div>'
        +'<div class="page-meta">'+shown+'개 항목 표시 · 전체 학습 '+dnAll+'/'+ITEMS.length
          +(state.filters.roi?' · 기출 연결 문항 수가 많은 순으로 정렬됨':'')+'</div>';
      html += shown? body : '<div class="empty"><div class="big">🔍</div><div>조건에 맞는 항목이 없어요. 필터를 조정해 보세요.</div></div>';
      content.innerHTML=html;
      return;
    }
    if(state.search.trim()){
      list=sortByRoi(filterItems(currentBaseList()));
      crumb="검색 결과"; title='"'+state.search.trim()+'"';
      meta=list.length+"개 항목";
    }else{
      const subj=DATA[state.si], sec=subj.sections[state.ci];
      list=sortByRoi(filterItems(sec.items));
      crumb=subj.num+". "+subj.title;
      title=sec.title;
      const dn=sec.items.filter(it=>isDone(it.id)).length;
      meta=list.length+"개 항목 · 이 섹션 학습 "+dn+"/"+sec.items.length;
    }
    let html='<div class="crumb">'+esc(crumb)+'</div>'
      +'<div class="page-h"><h2>'+esc(title)+'</h2></div>'
      +'<div class="page-meta">'+esc(meta)+'</div>';
    if(list.length===0){
      html+='<div class="empty"><div class="big">🔍</div><div>조건에 맞는 항목이 없어요. 필터를 조정해 보세요.</div></div>';
    }else{
      html+=list.map(cardHTML).join("");
    }
    content.innerHTML=html;
  }

  // ── 플래시카드 렌더 ──
  function buildFlashList(){
    let list;
    if(state.search.trim()) list=filterItems(currentBaseList());
    else if(state.viewAll) list=filterItems(ITEMS);
    else list=filterItems(DATA[state.si].sections[state.ci].items);
    state.flashList=sortByRoi(list); state.flashIdx=0;
  }
  function renderFlash(){
    const content=document.getElementById("content");
    const list=state.flashList;
    if(list.length===0){
      content.innerHTML='<div class="empty"><div class="big">🗂️</div><div>학습할 카드가 없어요. 섹션을 고르거나 필터를 조정하세요.</div></div>';
      return;
    }
    if(state.flashIdx>=list.length) state.flashIdx=list.length-1;
    const it=list[state.flashIdx];
    let badges="";
    if(it.star) badges+='<span class="badge star">★ 빈출</span>';
    badges+=gichulBadge(it);
    if(it.added) badges+='<span class="badge add">＋ 보강</span>';
    content.innerHTML=
      '<div class="flash-wrap">'
      +'<div class="flash-count">'+(state.flashIdx+1)+' / '+list.length+' · '+esc(it.subjNum+". "+it.secTitle)+'</div>'
      +'<div class="flash" id="flash">'
        +'<div class="flash-q">'
          +'<div class="fq-crumb">Q</div>'
          +'<div class="fq-title">'+inlineMd(it.title)+' <span class="badges">'+badges+'</span></div>'
        +'</div>'
        +'<div class="flash-a">'
          +'<div class="fb-title">A</div><div class="md">'+renderMd(it.body)+'</div>'
        +'</div>'
      +'</div>'
      +'<div class="flash-nav">'
        +'<button data-fa="prev">← 이전</button>'
        +'<button data-fa="know" class="know">✓ 안다 &amp; 다음</button>'
        +'<button data-fa="next">다음 →</button>'
      +'</div>'
      +'<div class="flash-count" style="margin-top:14px">'+(isDone(it.id)?'이 항목은 학습 완료로 체크됨':'')+'</div>'
      +'</div>';
  }
  function flashGo(d){
    const n=state.flashList.length; if(!n) return;
    state.flashIdx=(state.flashIdx+d+n)%n; renderFlash();
  }

  // ── 이벤트 위임 ──
  document.getElementById("content").addEventListener("click",e=>{
    // 기출 배지 클릭 → 연결된 기출 문항 보기 (카드 펼침보다 먼저 처리)
    const gk=e.target.closest(".gk-open");
    if(gk && gk.dataset.gichul){ showGichulModal(gk.dataset.gichul.split(",")); e.stopPropagation(); return; }
    const card=e.target.closest(".card");
    if(card){
      const act=e.target.closest("[data-act]");
      if(act && act.dataset.act==="done"){ toggleDone(card.dataset.id); card.classList.toggle("done"); e.stopPropagation(); return; }
      if(act && act.dataset.act==="expand"){ card.classList.toggle("expanded"); return; }
    }
    const fa=e.target.closest("[data-fa]");
    if(fa){
      const a=fa.dataset.fa;
      if(a==="prev") flashGo(-1);
      else if(a==="next") flashGo(1);
      else if(a==="know"){ const it=state.flashList[state.flashIdx]; if(it){ done[it.id]=1; save(); updateProgress(); } flashGo(1); }
    }
  });

  // ── 모드/검색/필터 ──
  function setModeButtons(){
    document.querySelectorAll(".modes button").forEach(b=>b.classList.toggle("on", b.dataset.mode===state.mode));
  }
  document.querySelectorAll(".modes button").forEach(b=>{
    b.onclick=()=>{ state.mode=b.dataset.mode; setModeButtons(); if(state.mode==="flash") buildFlashList(); render(); };
  });
  document.querySelectorAll(".chip").forEach(c=>{
    c.onclick=()=>{ const f=c.dataset.f; state.filters[f]=!state.filters[f]; c.classList.toggle("on",state.filters[f]);
      if(state.mode==="flash") buildFlashList(); render(); };
  });
  let searchT;
  document.getElementById("searchInput").addEventListener("input",e=>{
    clearTimeout(searchT);
    searchT=setTimeout(()=>{ state.search=e.target.value; if(state.mode==="flash") buildFlashList(); renderNav(); render(); }, 160);
  });

  // ── 키보드 (플래시카드) ──
  document.addEventListener("keydown",e=>{
    if(state.mode!=="flash") return;
    if(e.target.tagName==="INPUT") return;
    if(e.code==="Space"){ e.preventDefault(); flashGo(1); }
    else if(e.key==="ArrowLeft") flashGo(-1);
    else if(e.key==="ArrowRight") flashGo(1);
  });

  // ── 사이드바 토글 (모바일: 드로어 / 데스크톱: 접기) ──
  const SIDE_LS="sec_side_collapsed";
  const mqMobile=window.matchMedia("(max-width:860px)");
  function closeSidebar(){ document.getElementById("sidebar").classList.remove("show"); document.getElementById("scrim").classList.remove("show"); }
  document.getElementById("menuBtn").onclick=()=>{
    if(mqMobile.matches){
      document.getElementById("sidebar").classList.add("show");
      document.getElementById("scrim").classList.add("show");
    }else{
      const c=document.body.classList.toggle("side-collapsed");
      try{ localStorage.setItem(SIDE_LS, c?"1":"0"); }catch(e){}
    }
  };
  document.getElementById("scrim").onclick=closeSidebar;
  try{ if(localStorage.getItem(SIDE_LS)==="1") document.body.classList.add("side-collapsed"); }catch(e){}

  // ══════════ 예상문제 모드 ══════════
  const EXAM = window.EXAM_DATA;
  const EX_LS = "secexam_all_v1";
  let exStore={};
  try{ exStore=JSON.parse(localStorage.getItem(EX_LS)||"{}"); }catch(e){ exStore={}; }
  function exPersist(){ try{ localStorage.setItem(EX_LS, JSON.stringify(exStore)); }catch(e){} }
  state.round = 0; // 현재 회차 인덱스

  const EX_TYPE_INFO = {
    "단답형":["단답형","1~12번 · 각 3점 · 36점"],
    "서술형":["서술형","13~16번 · 각 12점 · 48점"],
    "실무형":["실무형","17~18번 · 2문항 중 택1 · 각 16점"]
  };

  function exKey(r,n){ return "r"+r+"_q"+n; }

  function calcExamScore(ri){
    const qs = EXAM.rounds[ri].questions;
    let s=0;
    qs.forEach(q=>{
      if(q.type==="실무형") return;
      const g=(exStore[exKey(ri,q.num)]||{}).grade;
      if(g==="correct") s+=q.points; else if(g==="partial") s+=Math.round(q.points/2);
    });
    const pr = qs.filter(q=>q.type==="실무형").map(q=>{
      const g=(exStore[exKey(ri,q.num)]||{}).grade;
      if(g==="correct") return q.points; if(g==="partial") return Math.round(q.points/2); return 0;
    });
    if(pr.length) s += Math.max(...pr);
    return s;
  }

  function renderExam(){
    const c=document.getElementById("content");
    const ri=state.round;
    let html='<div class="exam-intro">'
      +'<div class="ei-title">📝 실전 예상문제</div>'
      +'<div class="ei-sub">'+esc(EXAM.title)+' · 총 '+EXAM.rounds.length+'회분 · 회차당 18문항(100점·180분)</div>'
      +'</div>';
    // 회차 탭
    html+='<div class="round-tabs">';
    EXAM.rounds.forEach((r,i)=>{ html+='<button class="round-tab'+(i===ri?" on":"")+'" data-round="'+i+'">'+esc(r.title)+'</button>'; });
    html+='</div>';
    // 점수 바
    html+='<div class="exam-bar">'
      +'<div class="escore">자가채점 <b id="exScore">'+calcExamScore(ri)+'</b> / 100점</div>'
      +'<div class="spacer"></div>'
      +'<button class="ebtn" data-ex="revealAll">전체 정답</button>'
      +'<button class="ebtn" data-ex="hideAll">정답 접기</button>'
      +'<button class="ebtn" data-ex="reset">답안 초기화</button>'
      +'</div>';
    // 문제
    let lastType="";
    EXAM.rounds[ri].questions.forEach(q=>{
      if(q.type!==lastType){ lastType=q.type; const info=EX_TYPE_INFO[q.type];
        html+='<div class="sec-div"><h3>'+info[0]+'</h3><div class="l"></div><span class="p">'+info[1]+'</span></div>'; }
      const st=exStore[exKey(ri,q.num)]||{};
      let scen="";
      if(q.scenario){
        scen='<div class="exq-scen"><div class="md">'+renderMd(q.scenario)+'</div></div>';
      }
      html+='<article class="exq'+(st.open?" open":"")+'" data-r="'+ri+'" data-n="'+q.num+'">'
        +'<div class="exq-head"><span class="exq-no">'+q.num+'</span>'
          +'<span class="exq-type t'+q.type+'">'+q.type+'</span>'
          +'<span class="exq-dom">'+esc(q.domain)+'</span>'
          +'<span class="exq-pts">'+q.points+'점</span></div>'
        +'<div class="exq-body">'
          +'<div class="exq-q"><div class="md">'+renderMd(q.question)+'</div></div>'
          +scen
          +'<textarea class="exq-ta" placeholder="답안을 작성해 보세요 (자동 저장)">'+(st.ans?esc(st.ans):"")+'</textarea>'
          +'<button class="exq-reveal">📖 모범답안 · 해설 보기</button>'
          +'<div class="exq-ans"><div class="at">✔ 모범답안</div><div class="ab"><div class="md">'+renderMd(q.answer)+'</div>'
            +'<div class="et">💡 해설 · 채점 포인트</div><div class="md">'+renderMd(q.explanation)+'</div></div></div>'
          +'<div class="exq-sc"><span class="l">자가채점:</span>'
            +'<button class="scb c'+(st.grade==="correct"?" on":"")+'" data-g="correct">정답</button>'
            +'<button class="scb p'+(st.grade==="partial"?" on":"")+'" data-g="partial">부분</button>'
            +'<button class="scb w'+(st.grade==="wrong"?" on":"")+'" data-g="wrong">오답</button>'
          +'</div>'
        +'</div></article>';
    });
    html+='<div class="exam-foot">⚠️ 학습용 <b>예상문제</b>로 실제 출제 문제가 아닙니다. 법령·수치는 개정될 수 있으니 시험 직전 최신 공고·조문을 확인하세요.<br>실무형(17·18번)은 <b>2문항 중 1문항만 선택</b>하여 작성합니다.</div>';
    c.innerHTML=html;
  }

  function updateExScore(){ const el=document.getElementById("exScore"); if(el) el.textContent=calcExamScore(state.round); }

  // ══════════ 기출문제 모드 ══════════
  // 예상문제와 렌더/이벤트 로직을 공유하되, 데이터·저장소·채점 방식만 분리한다.
  const GICHUL = window.GICHUL_DATA;
  const GI_LS = "secgichul_v1";
  let giStore={};
  try{ giStore=JSON.parse(localStorage.getItem(GI_LS)||"{}"); }catch(e){ giStore={}; }
  function giPersist(){ try{ localStorage.setItem(GI_LS, JSON.stringify(giStore)); }catch(e){} }
  state.giRound = 0; // 현재 기출 회차 인덱스

  function calcGiStats(ri){
    const qs = GICHUL.rounds[ri].questions;
    let c=0,p=0,w=0;
    qs.forEach(q=>{ const g=(giStore[exKey(ri,q.num)]||{}).grade;
      if(g==="correct")c++; else if(g==="partial")p++; else if(g==="wrong")w++; });
    return {c,p,w,total:qs.length};
  }
  function giStatText(s){ return '정답 <b>'+s.c+'</b> · 부분 <b>'+s.p+'</b> · 오답 <b>'+s.w+'</b> / 전체 '+s.total+'문항'; }
  function updateGiStat(){ const el=document.getElementById("giStat"); if(el) el.innerHTML=giStatText(calcGiStats(state.giRound)); }

  function renderGichul(){
    const c=document.getElementById("content");
    const ri=state.giRound;
    let html='<div class="exam-intro gichul">'
      +'<div class="ei-title">🗂️ 기출문제 회차별 풀이</div>'
      +'<div class="ei-sub">'+esc(GICHUL.title)+' · 총 '+GICHUL.rounds.length+'회분</div>'
      +'</div>';
    // 회차 탭
    html+='<div class="round-tabs">';
    GICHUL.rounds.forEach((r,i)=>{ html+='<button class="round-tab'+(i===ri?" on":"")+'" data-giround="'+i+'">'+esc(r.title)+'</button>'; });
    html+='</div>';
    // 채점 현황 바
    html+='<div class="exam-bar">'
      +'<div class="escore" id="giStat">'+giStatText(calcGiStats(ri))+'</div>'
      +'<div class="spacer"></div>'
      +'<button class="ebtn" data-gi="revealAll">전체 정답</button>'
      +'<button class="ebtn" data-gi="hideAll">정답 접기</button>'
      +'<button class="ebtn" data-gi="reset">답안 초기화</button>'
      +'</div>';
    // 문제
    let lastType="";
    GICHUL.rounds[ri].questions.forEach(q=>{
      if(q.type!==lastType){ lastType=q.type;
        html+='<div class="sec-div"><h3>'+esc(q.type)+'</h3><div class="l"></div><span class="p"></span></div>'; }
      const st=giStore[exKey(ri,q.num)]||{};
      html+='<article class="exq gi'+(st.open?" open":"")+'" data-r="'+ri+'" data-n="'+q.num+'">'
        +'<div class="exq-head"><span class="exq-no">'+q.num+'</span>'
          +'<span class="exq-type t'+q.type+'">'+q.type+'</span></div>'
        +'<div class="exq-body">'
          +'<div class="exq-q"><div class="md">'+renderMd(q.question)+'</div></div>'
          +'<textarea class="exq-ta" placeholder="답안을 작성해 보세요 (자동 저장)">'+(st.ans?esc(st.ans):"")+'</textarea>'
          +'<button class="exq-reveal">📖 정답 · 해설 보기</button>'
          +'<div class="exq-ans"><div class="at">✔ 정답 · 해설</div><div class="ab"><div class="md">'+renderMd(q.answer)+'</div></div></div>'
          +'<div class="exq-sc"><span class="l">자가채점:</span>'
            +'<button class="scb c'+(st.grade==="correct"?" on":"")+'" data-g="correct">정답</button>'
            +'<button class="scb p'+(st.grade==="partial"?" on":"")+'" data-g="partial">부분</button>'
            +'<button class="scb w'+(st.grade==="wrong"?" on":"")+'" data-g="wrong">오답</button>'
          +'</div>'
        +'</div></article>';
    });
    html+='<div class="exam-foot">📚 실제 기출문제 복원본으로, 모범답안·해설은 학습용 참고 자료입니다. 법령·수치는 개정될 수 있으니 최신 조문을 확인하세요.</div>';
    c.innerHTML=html;
  }

  // 예상문제·기출문제 공통 이벤트 (content 위임)
  document.getElementById("content").addEventListener("click",e=>{
    // 회차 탭 (예상: data-round / 기출: data-giround)
    const tab=e.target.closest(".round-tab");
    if(tab){
      if(tab.dataset.giround!==undefined){ state.giRound=+tab.dataset.giround; renderGichul(); }
      else { state.round=+tab.dataset.round; renderExam(); }
      return;
    }
    // 상단 바 버튼 (예상)
    const eb=e.target.closest("[data-ex]");
    if(eb){
      const a=eb.dataset.ex, ri=state.round;
      if(a==="revealAll"){ EXAM.rounds[ri].questions.forEach(q=>{exStore[exKey(ri,q.num)]=Object.assign(exStore[exKey(ri,q.num)]||{},{open:true});}); exPersist(); renderExam(); }
      else if(a==="hideAll"){ EXAM.rounds[ri].questions.forEach(q=>{ if(exStore[exKey(ri,q.num)]) exStore[exKey(ri,q.num)].open=false; }); exPersist(); renderExam(); }
      else if(a==="reset"){ if(confirm("이 회차의 답안과 채점 기록을 모두 삭제할까요?")){ EXAM.rounds[ri].questions.forEach(q=>{ delete exStore[exKey(ri,q.num)]; }); exPersist(); renderExam(); } }
      return;
    }
    // 상단 바 버튼 (기출)
    const gb=e.target.closest("[data-gi]");
    if(gb){
      const a=gb.dataset.gi, ri=state.giRound;
      if(a==="revealAll"){ GICHUL.rounds[ri].questions.forEach(q=>{giStore[exKey(ri,q.num)]=Object.assign(giStore[exKey(ri,q.num)]||{},{open:true});}); giPersist(); renderGichul(); }
      else if(a==="hideAll"){ GICHUL.rounds[ri].questions.forEach(q=>{ if(giStore[exKey(ri,q.num)]) giStore[exKey(ri,q.num)].open=false; }); giPersist(); renderGichul(); }
      else if(a==="reset"){ if(confirm("이 회차의 답안과 채점 기록을 모두 삭제할까요?")){ GICHUL.rounds[ri].questions.forEach(q=>{ delete giStore[exKey(ri,q.num)]; }); giPersist(); renderGichul(); } }
      return;
    }
    // 문제 카드 (예상·기출 공통 — 현재 모드로 저장소 결정)
    const card=e.target.closest(".exq");
    if(card){
      const gi=state.mode==="gichul";
      const store=gi?giStore:exStore, persist=gi?giPersist:exPersist;
      const ri=+card.dataset.r, n=+card.dataset.n, k=exKey(ri,n);
      if(e.target.closest(".exq-reveal")){ card.classList.add("open"); store[k]=Object.assign(store[k]||{},{open:true}); persist(); return; }
      const sc=e.target.closest(".scb");
      if(sc){ const g=sc.dataset.g; const cur=(store[k]||{}).grade; const ng=cur===g?null:g;
        store[k]=Object.assign(store[k]||{},{grade:ng}); persist();
        card.querySelectorAll(".scb").forEach(x=>x.classList.toggle("on", ng&&x.dataset.g===ng));
        if(gi) updateGiStat(); else updateExScore(); return; }
    }
  });
  document.getElementById("content").addEventListener("input",e=>{
    const ta=e.target.closest(".exq-ta"); if(!ta) return;
    const card=e.target.closest(".exq"); const k=exKey(+card.dataset.r,+card.dataset.n);
    const gi=state.mode==="gichul";
    const store=gi?giStore:exStore, persist=gi?giPersist:exPersist;
    store[k]=Object.assign(store[k]||{},{ans:ta.value}); persist();
  });

  // ── 렌더 ──
  function render(){
    const searchBox=document.querySelector(".search"), filters=document.querySelector(".filters");
    const solveMode = state.mode==="exam"||state.mode==="gichul";
    document.body.classList.toggle("exam-mode", solveMode);
    if(solveMode){
      searchBox.style.display="none"; filters.style.display="none";
      if(state.mode==="gichul") renderGichul(); else renderExam();
      return;
    }
    searchBox.style.display=""; filters.style.display="";
    if(state.mode==="flash") renderFlash();
    else renderBrowse();
    document.querySelectorAll(".sec-btn").forEach(b=>{
      b.classList.toggle("active", !state.search && !state.viewAll && +b.dataset.si===state.si && +b.dataset.ci===state.ci);
    });
    const ab=document.querySelector(".all-btn");
    if(ab) ab.classList.toggle("active", state.viewAll && !state.search);
  }

  // 딥링크: index.html?q=검색어 로 특정 항목/검색 결과를 바로 연다 (다른 페이지에서 연결용)
  try{
    const q=new URLSearchParams(location.search).get("q");
    if(q){ state.search=q; state.viewAll=false; const si=document.getElementById("searchInput"); if(si) si.value=q; }
  }catch(e){}

  renderNav(); updateProgress(); render();
})();
