const KEY='myMovieArchiveRatingsV2';
let ratings=JSON.parse(localStorage.getItem(KEY)||'{}');
let current=null;
const posterCache=JSON.parse(localStorage.getItem('myMovieArchivePostersV2')||'{}');
const els={grid:document.getElementById('grid'),search:document.getElementById('search'),genre:document.getElementById('genre'),sort:document.getElementById('sort'),resultCount:document.getElementById('resultCount'),count:document.getElementById('count'),rated:document.getElementById('rated'),avg:document.getElementById('avg'),modal:document.getElementById('modal'),dialogTitle:document.getElementById('dialogTitle'),dialogMeta:document.getElementById('dialogMeta'),dialogTags:document.getElementById('dialogTags'),dialogSynopsis:document.getElementById('dialogSynopsis'),dialogPoster:document.getElementById('dialogPoster'),dialogRating:document.getElementById('dialogRating'),toplist:document.getElementById('toplist'),topNotice:document.getElementById('topNotice')};
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function initials(title){const words=title.replace(/[:&–-]/g,' ').split(/\s+/).filter(w=>w.length>2&&!['the','and'].includes(w.toLowerCase()));return (words.slice(0,2).map(w=>w[0]).join('')||title.slice(0,2)).toUpperCase()}
function getRating(m){return ratings[m.id]??null}
function saveAll(){localStorage.setItem(KEY,JSON.stringify(ratings));updateStats();render();renderTop()}
function updateStats(){const rs=MOVIES.map(getRating).filter(x=>typeof x==='number');els.count.textContent=MOVIES.length;els.rated.textContent=rs.length;els.avg.textContent=rs.length?(rs.reduce((a,b)=>a+b,0)/rs.length).toFixed(1):'—'}
function genres(){const set=new Set();MOVIES.forEach(m=>m.genre.split(', ').forEach(g=>set.add(g)));return [...set].sort()}
function posterKey(m){return m.id}
function imageHtml(m,cls=''){
  const cached=posterCache[posterKey(m)];
  return `<div class="poster ${cls}">${cached?`<img src="${esc(cached)}" alt="${esc(m.title)} poster" loading="lazy" class="loaded">`:`<div class="fallback"><span class="initials">${esc(initials(m.title))}</span></div>`}${m.year?`<span class="year">${m.year}</span>`:''}</div>`
}

// Poster loading is deliberately batched. The old version made one Wikipedia
// request per movie at the same time, which caused throttling and left most
// cards without posters. Wikimedia supports up to 50 titles per request.
const posterJobs=new Map();
let posterBatchTimer=null;
function posterTitle(m){return m.posterSearch||m.title}
function queuePoster(m){
  if(posterCache[posterKey(m)] || posterJobs.has(posterKey(m))) return;
  posterJobs.set(posterKey(m),m);
  if(!posterBatchTimer) posterBatchTimer=setTimeout(flushPosterJobs,30);
}
async function flushPosterJobs(){
  posterBatchTimer=null;
  const jobs=[...posterJobs.values()];
  posterJobs.clear();
  if(!jobs.length)return;
  for(let i=0;i<jobs.length;i+=50){
    await fetchPosterBatch(jobs.slice(i,i+50));
    // A small pause between Wikimedia requests avoids rate limiting.
    if(i+50<jobs.length) await sleep(150);
  }
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function savePoster(m,src){
  if(!src)return;
  posterCache[posterKey(m)]=src;
  localStorage.setItem('myMovieArchivePostersV2',JSON.stringify(posterCache));
  document.querySelectorAll(`[data-movie-id="${CSS.escape(m.id)}"]`).forEach(card=>setPosterOnContainer(card,src,m));
}
function setPosterOnContainer(container,src,m){
  if(!container)return;
  let img=container.querySelector('img');
  if(!img){img=document.createElement('img');container.prepend(img)}
  img.src=src;img.alt=`${m.title} poster`;img.loading='lazy';img.classList.add('loaded');
  const fb=container.querySelector('.fallback');if(fb)fb.style.display='none';
}
function attachImageErrorHandlers(root=document){
  root.querySelectorAll('.poster img').forEach(img=>{
    if(img.dataset.posterHandled)return;
    img.dataset.posterHandled='1';
    img.addEventListener('error',()=>{
      const card=img.closest('[data-movie-id]');
      if(card){
        const id=card.dataset.movieId;delete posterCache[id];localStorage.setItem('myMovieArchivePostersV2',JSON.stringify(posterCache));
      }
      img.remove();
      const fb=card?.querySelector('.fallback');if(fb)fb.style.display='flex';
    });
  });
}
async function fetchPosterBatch(batch){
  const titles=batch.map(posterTitle);
  const params=new URLSearchParams({action:'query',format:'json',formatversion:'2',prop:'pageimages',piprop:'thumbnail',pithumbsize:'700',pilimit:'max',redirects:'1',titles:titles.join('|'),origin:'*'});
  try{
    const r=await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`,{mode:'cors'});
    if(!r.ok)throw new Error(`Wikipedia HTTP ${r.status}`);
    const d=await r.json();
    const pages=d.query?.pages||[];
    const byTitle=new Map();
    pages.forEach(p=>{if(p.thumbnail?.source)byTitle.set(p.title.toLowerCase(),p.thumbnail.source)});
    const missing=[];
    batch.forEach(m=>{
      const src=byTitle.get(posterTitle(m).toLowerCase())||byTitle.get(m.title.toLowerCase());
      if(src)savePoster(m,src);else missing.push(m);
    });
    if(missing.length)await searchMissing(missing);
  }catch(e){
    // If the exact-title batch fails, fall back to the search API in small groups.
    await searchMissing(batch);
  }
  attachImageErrorHandlers();
}
async function searchMissing(batch){
  // Search only the movies that did not have an exact Wikipedia page image.
  // Requests are sequential to keep the site friendly to Wikimedia's API.
  for(const m of batch){
    if(posterCache[posterKey(m)])continue;
    try{
      const params=new URLSearchParams({action:'query',format:'json',formatversion:'2',generator:'search',gsrsearch:`${posterTitle(m)} film`,gsrnamespace:'0',gsrlimit:'3',prop:'pageimages',piprop:'thumbnail',pithumbsize:'700',pilimit:'max',origin:'*'});
      const r=await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`,{mode:'cors'});
      if(!r.ok)continue;
      const d=await r.json();
      const pages=d.query?.pages||[];
      // Prefer the first result with a thumbnail.
      const page=pages.find(p=>p.thumbnail?.source);
      if(page?.thumbnail?.source)savePoster(m,page.thumbnail.source);
    }catch(e){/* fallback remains visible */}
    await sleep(80);
  }
}
function loadPosters(movies){
  movies.forEach(m=>{if(!posterCache[posterKey(m)])queuePoster(m)});
  movies.forEach(m=>{
    const src=posterCache[posterKey(m)];
    if(src)document.querySelectorAll(`[data-movie-id="${CSS.escape(m.id)}"]`).forEach(c=>setPosterOnContainer(c,src,m));
  });
  attachImageErrorHandlers();
}

function card(m){
  const r=getRating(m),c=document.createElement('article');
  c.className='card';c.dataset.movieId=m.id;c.onclick=()=>openMovie(m);
  c.innerHTML=`${imageHtml(m)}<div class="cardbody"><div class="title">${esc(m.title)}</div><div class="meta">${m.year||'Year unknown'} · ${esc(m.genre)}</div><div class="rating">${r!==null?`<b>★ ${Number(r).toFixed(1)} / 10</b>`:`<span class="empty-rating">Not rated yet</span>`}<span class="meta">Watched ✓</span></div></div>`;
  return c
}
function filtered(){const q=(els.search?.value||'').toLowerCase().trim(),g=els.genre?.value||'';let arr=MOVIES.filter(m=>(!q||m.title.toLowerCase().includes(q)||m.genre.toLowerCase().includes(q))&&(!g||m.genre.split(', ').includes(g)));if(els.sort?.value==='rating')arr.sort((a,b)=>(getRating(b)??-1)-(getRating(a)??-1));else if(els.sort?.value==='year')arr.sort((a,b)=>(b.year||0)-(a.year||0));else arr.sort((a,b)=>a.title.localeCompare(b.title));return arr}
function render(){if(!els.grid)return;const arr=filtered();els.grid.innerHTML='';arr.forEach(m=>els.grid.appendChild(card(m)));if(els.resultCount)els.resultCount.textContent=`${arr.length} of ${MOVIES.length} movies`;loadPosters(arr)}
function renderTop(){if(!els.toplist)return;const rated=MOVIES.filter(m=>getRating(m)!==null).sort((a,b)=>getRating(b)-getRating(a)).slice(0,10);els.toplist.innerHTML='';els.topNotice.textContent=rated.length?'Add ratings from any movie card. Your highest-rated films automatically appear here.':'Your Top 10 is ready — rate movies from any detail window and your ranking will build automatically.';rated.forEach((m,i)=>{const row=document.createElement('div');row.className='toprow';row.innerHTML=`<div class="rank">#${i+1}</div><div><div class="topname">${esc(m.title)}</div><div class="topmeta">${m.year||''} · ${esc(m.genre)}</div></div><div class="score">★ ${Number(getRating(m)).toFixed(1)}</div><div class="edit"><input value="${getRating(m)}" min="0" max="10" step=".1" type="number"></div>`;row.querySelector('input').onchange=e=>{let v=Number(e.target.value);if(v>=0&&v<=10){ratings[m.id]=v;saveAll()}};els.toplist.appendChild(row)})}
async function openMovie(m){
  current=m;els.modal.classList.add('open');els.dialogTitle.textContent=m.title;els.dialogMeta.textContent=`${m.year||'Year unknown'} · Watched`;els.dialogTags.innerHTML=m.genre.split(', ').map(g=>`<span class="tag">${esc(g)}</span>`).join('');els.dialogSynopsis.textContent=m.synopsis;els.dialogPoster.innerHTML=imageHtml(m).replace('class="poster"','class="dialog-poster-inner"');els.dialogRating.value=getRating(m)??'';
  const box=els.dialogPoster.querySelector('.dialog-poster-inner');
  if(box){box.style.height='100%';box.style.aspectRatio='auto';box.dataset.movieId=m.id;const src=posterCache[posterKey(m)];if(src)setPosterOnContainer(box,src,m);else{queuePoster(m);setTimeout(()=>{const latest=posterCache[posterKey(m)];if(latest)setPosterOnContainer(box,latest,m)},200)}}
}
document.getElementById('close')?.addEventListener('click',()=>els.modal.classList.remove('open'));els.modal?.addEventListener('click',e=>{if(e.target===els.modal)els.modal.classList.remove('open')});document.addEventListener('keydown',e=>{if(e.key==='Escape')els.modal?.classList.remove('open')});
document.getElementById('saveRating')?.addEventListener('click',()=>{const v=els.dialogRating.value===''?null:Number(els.dialogRating.value);if(v!==null&&(v<0||v>10))return alert('Please enter a rating from 0 to 10.');if(v===null)delete ratings[current.id];else ratings[current.id]=v;saveAll();els.modal.classList.remove('open')});
if(els.genre)genres().forEach(g=>{const o=document.createElement('option');o.value=g;o.textContent=g;els.genre.appendChild(o)});els.search?.addEventListener('input',render);els.genre?.addEventListener('change',render);els.sort?.addEventListener('change',render);updateStats();render();renderTop();
