(function(){
"use strict";
var RAW = JSON.parse(document.getElementById('planData').textContent);
var SLOT = ['--s1','--s2','--s3','--s4','--s5','--s6','--s7','--s8'];
function cv(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function col(i){ return cv(SLOT[i % 8]); }

/* The source export reports a 0.00% withdrawal rate for 2046 despite a real
   withdrawal that year. Fill that gap by computing it from the prior year's
   portfolio so the chart has no phantom hole. Flagged in the footnote.
   Done for both currency modes since each has its own totals. */
['nominal','real'].forEach(function(mode){
  var d = RAW[mode];
  d.years = RAW.years;
  d.rateComputed = d.withdrawalRate.map(function(r,i){
    if(r>0 || !d.withdrawalTotal[i] || i===0) return r;
    var base = d.portfolioTotal[i-1];
    return base>0 ? Math.round((d.withdrawalTotal[i]/base)*10000)/100 : 0;
  });
  d.rateEstimated = d.withdrawalRate.map(function(r,i){ return r<=0 && d.rateComputed[i]>0; });
});

var D = RAW.nominal;
var state = { detail:'grouped', currency:'nominal', from:0, to:D.years.length-1, off:{} };

var RANGES = [
  {label:'Full plan', a:0, b:D.years.length-1},
  {label:'Next 10 years', a:0, b:9},
  {label:'2036–2045', a:10, b:19},
  {label:'2046–2055', a:20, b:29}
];

/* ---------- formatting ---------- */
function money(v){
  var s = v<0?'-':''; v=Math.abs(v);
  if(v>=1e6) return s+'$'+(v/1e6).toFixed(2)+'M';
  if(v>=1e3) return s+'$'+Math.round(v/1e3)+'K';
  return s+'$'+Math.round(v);
}
function full(v){ return '$'+Math.round(v).toLocaleString('en-US'); }
function pct(v){ return v.toFixed(1)+'%'; }

/* ---------- stat tiles ---------- */
function renderTiles(){
  var y=D.years, t=D.portfolioTotal;
  var peakRate=0, peakYear=0;
  D.rateComputed.forEach(function(r,i){ if(r>peakRate){peakRate=r;peakYear=y[i];} });
  var lifetime = D.withdrawalTotal.reduce(function(a,b){return a+b;},0);
  var avgRate = D.rateComputed.reduce(function(a,b){return a+b;},0)/D.rateComputed.length;
  var data=[
    ['Portfolio today', full(t[0]), 'End of '+y[0]],
    ['Portfolio in '+y[y.length-1], full(t[t.length-1]), (t[t.length-1]>t[0]?'Grows':'Falls')+' '+Math.abs(Math.round((t[t.length-1]/t[0]-1)*100))+'% over the plan'],
    ['Typical withdrawal rate', pct(avgRate), 'Peaks at '+pct(peakRate)+' in '+peakYear],
    ['Total drawn 2026–'+y[y.length-1], money(lifetime), 'Across all accounts']
  ];
  var host=document.getElementById('tiles');
  host.textContent='';
  data.forEach(function(d){
    var el=document.createElement('div'); el.className='tile';
    var a=document.createElement('div'); a.className='lab'; a.textContent=d[0];
    var b=document.createElement('div'); b.className='val'; b.textContent=d[1];
    var c=document.createElement('div'); c.className='note'; c.textContent=d[2];
    el.appendChild(a);el.appendChild(b);el.appendChild(c);host.appendChild(el);
  });
}

/* ---------- footnote ---------- */
function updateFooter(){
  var basis = state.currency==='real'
    ? "Figures are shown in today's dollars (inflation-adjusted, using ProjectionLab's Today's Currency setting)"
    : "Figures are nominal (the actual dollar amounts in each future year, not adjusted for inflation)";
  document.getElementById('footnote').textContent = basis+', and come directly from the ProjectionLab plan export dated 16–17 August 2026. Projections assume the plan\'s stated return, inflation and tax assumptions hold; actual results will differ. This is an illustration, not advice. The export reports no withdrawal rate for 2046; that one figure (marked *) is calculated as the year\'s withdrawal over the prior year-end portfolio.';
}

/* ---------- filter controls ---------- */
(function(){
  var seg=document.getElementById('rangeSeg');
  RANGES.forEach(function(r,i){
    var b=document.createElement('button');
    b.className='btn'+(i===0?' on':''); b.textContent=r.label;
    b.onclick=function(){
      state.from=r.a; state.to=r.b;
      Array.prototype.forEach.call(seg.children,function(c){c.classList.remove('on');});
      b.classList.add('on'); renderAll();
    };
    seg.appendChild(b);
  });
  var ds=document.getElementById('detailSeg');
  Array.prototype.forEach.call(ds.children,function(b){
    b.onclick=function(){
      state.detail=b.dataset.d; state.off={};
      Array.prototype.forEach.call(ds.children,function(c){c.classList.remove('on');});
      b.classList.add('on'); renderAll();
    };
  });
  var cs=document.getElementById('currencySeg');
  Array.prototype.forEach.call(cs.children,function(b){
    b.onclick=function(){
      state.currency=b.dataset.c; D=RAW[state.currency];
      Array.prototype.forEach.call(cs.children,function(c){c.classList.remove('on');});
      b.classList.add('on'); renderAll(); updateFooter();
    };
  });
  document.querySelectorAll('[data-table]').forEach(function(b){
    b.onclick=function(){
      var w=document.getElementById('tbl-'+b.dataset.table);
      var on=w.classList.toggle('show');
      b.textContent = on?'Hide table':'Show table';
    };
  });
})();

/* Re-render when the shared theme toggle (assets/js/theme.js) changes theme,
   since charts read colors via getComputedStyle and need fresh values. */
document.addEventListener('themechange', function(){ renderAll(); });

/* ---------- svg helpers ---------- */
var NS='http://www.w3.org/2000/svg';
function el(n,a){ var e=document.createElementNS(NS,n); for(var k in a) e.setAttribute(k,a[k]); return e; }
function niceMax(v){
  if(v<=0) return 1;
  var mag=Math.pow(10,Math.floor(Math.log10(v)));
  var steps=[1,1.25,1.5,2,2.5,3,4,5,6,8,10];
  for(var i=0;i<steps.length;i++){ if(steps[i]*mag>=v) return steps[i]*mag; }
  return 10*mag;
}

/* ---------- legend ---------- */
function legend(id,names,shape,key){
  var host=document.getElementById(id); host.textContent='';
  names.forEach(function(n,i){
    var b=document.createElement('button'); b.className='lg'; b.type='button';
    b.setAttribute('aria-pressed', state.off[key+n]?'false':'true');
    if(state.off[key+n]) b.dataset.off='1';
    var sw=document.createElement('span');
    sw.className = shape==='line'?'swline':'sw';
    sw.style.background=col(i);
    var tx=document.createElement('span'); tx.textContent=n;
    b.appendChild(sw); b.appendChild(tx);
    b.onclick=function(){ state.off[key+n]=!state.off[key+n]; renderAll(); };
    host.appendChild(b);
  });
}

/* ---------- table view ---------- */
function tableView(id,series,valFmt,totLabel){
  var w=document.getElementById(id); var keep=w.classList.contains('show');
  w.textContent='';
  var yrs=D.years.slice(state.from,state.to+1);
  var t=document.createElement('table'); t.className='data';
  var thead=document.createElement('thead'); var hr=document.createElement('tr');
  var th0=document.createElement('th'); th0.textContent='Year'; hr.appendChild(th0);
  series.forEach(function(s){ var th=document.createElement('th'); th.textContent=s.name; hr.appendChild(th); });
  var tht=document.createElement('th'); tht.textContent=totLabel; hr.appendChild(tht);
  thead.appendChild(hr); t.appendChild(thead);
  var tb=document.createElement('tbody');
  yrs.forEach(function(y,i){
    var idx=state.from+i, tr=document.createElement('tr');
    var td0=document.createElement('td'); td0.textContent=y; tr.appendChild(td0);
    var sum=0;
    series.forEach(function(s){
      var v=s.values[idx]; sum+=v;
      var td=document.createElement('td'); td.textContent=v?valFmt(v):'—'; tr.appendChild(td);
    });
    var tdt=document.createElement('td'); tdt.textContent=valFmt(sum); tr.appendChild(tdt);
    tb.appendChild(tr);
  });
  t.appendChild(tb); w.appendChild(t);
  if(keep) w.classList.add('show');
}

/* ---------- stacked chart (area or column) ---------- */
function stacked(opts){
  var host=document.getElementById(opts.plot);
  var tip=document.getElementById(opts.tip);
  Array.prototype.slice.call(host.querySelectorAll('svg')).forEach(function(s){s.remove();});

  var all=opts.series;
  var series=all.filter(function(s){ return !state.off[opts.key+s.name]; });
  var idxOf={}; all.forEach(function(s,i){ idxOf[s.name]=i; });

  var yrs=D.years.slice(state.from,state.to+1);
  var n=yrs.length;
  var W=980, H=opts.height||330;
  var m={t:14,r:opts.rightPad||58,b:34,l:66};
  var pw=W-m.l-m.r, ph=H-m.t-m.b;

  var totals=yrs.map(function(_,i){
    var idx=state.from+i, s=0;
    series.forEach(function(se){ s+=se.values[idx]; });
    return s;
  });
  var maxV=niceMax(Math.max.apply(null,totals.concat([0])));
  var X=function(i){ return m.l + (n===1?pw/2:(pw*i)/(n-1)); };
  var Xb=function(i){ return m.l + pw*(i+0.5)/n; };
  var Y=function(v){ return m.t + ph - (v/maxV)*ph; };

  var svg=el('svg',{viewBox:'0 0 '+W+' '+H, role:'img'});
  svg.setAttribute('aria-label', opts.aria);

  /* gridlines + y ticks */
  var ticks=5;
  for(var g=0; g<=ticks; g++){
    var v=maxV*g/ticks, y=Y(v);
    svg.appendChild(el('line',{x1:m.l,x2:W-m.r,y1:y,y2:y,stroke:g?cv('--grid'):cv('--axis'),'stroke-width':1}));
    var tl=el('text',{x:m.l-10,y:y+4,'text-anchor':'end',fill:cv('--muted'),'font-size':11.5,'font-family':'system-ui,sans-serif'});
    tl.setAttribute('style','font-variant-numeric:tabular-nums');
    tl.textContent = opts.fmtAxis(v);
    svg.appendChild(tl);
  }

  /* x labels: thin out to avoid collisions */
  var step=Math.max(1,Math.ceil(n/12));
  yrs.forEach(function(y,i){
    if(i%step && i!==n-1) return;
    var t=el('text',{x:(opts.mode==='bar'?Xb(i):X(i)),y:H-m.b+20,'text-anchor':'middle',fill:cv('--muted'),'font-size':11.5,'font-family':'system-ui,sans-serif'});
    t.textContent=y; svg.appendChild(t);
  });

  var GAP=2;

  if(opts.mode==='area'){
    /* stacked areas, drawn top-down so the 2px gap shows the surface beneath */
    var cum=new Array(n).fill(0);
    var bands=series.map(function(s){
      var lo=cum.slice();
      var hi=cum.map(function(c,i){ return c + s.values[state.from+i]; });
      cum=hi.slice();
      return {s:s, lo:lo, hi:hi};
    });
    bands.slice().reverse().forEach(function(b){
      var d='M'+X(0)+' '+Y(b.hi[0]);
      for(var i=1;i<n;i++) d+='L'+X(i)+' '+Y(b.hi[i]);
      for(var j=n-1;j>=0;j--) d+='L'+X(j)+' '+Y(b.lo[j]);
      d+='Z';
      svg.appendChild(el('path',{d:d,fill:col(idxOf[b.s.name]),'fill-opacity':.9}));
      /* 2px surface gap along the top edge of each band */
      var dd='M'+X(0)+' '+Y(b.hi[0]);
      for(var k=1;k<n;k++) dd+='L'+X(k)+' '+Y(b.hi[k]);
      svg.appendChild(el('path',{d:dd,fill:'none',stroke:cv('--surface-1'),'stroke-width':GAP}));
    });
    /* total line */
    var td='M'+X(0)+' '+Y(totals[0]);
    for(var q=1;q<n;q++) td+='L'+X(q)+' '+Y(totals[q]);
    svg.appendChild(el('path',{d:td,fill:'none',stroke:cv('--text-primary'),'stroke-width':2,'stroke-linejoin':'round','stroke-linecap':'round'}));
    svg.appendChild(el('circle',{cx:X(n-1),cy:Y(totals[n-1]),r:4.5,fill:cv('--text-primary'),stroke:cv('--surface-1'),'stroke-width':2}));
    var lbl=el('text',{x:X(n-1)+9,y:Y(totals[n-1])+4,fill:cv('--text-primary'),'font-size':12.5,'font-weight':600,'font-family':'system-ui,sans-serif'});
    lbl.textContent=money(totals[n-1]); svg.appendChild(lbl);
  } else {
    var bw=Math.min(24, (pw/n)-4);
    yrs.forEach(function(_,i){
      var idx=state.from+i, base=0;
      var cx=Xb(i)-bw/2;
      series.forEach(function(s){
        var v=s.values[idx]; if(v<=0) return;
        var y0=Y(base+v), y1=Y(base), h=Math.max(0.6, y1-y0-GAP);
        var isTop = (base+v) >= totals[i]-0.01;
        var r=isTop?Math.min(4,bw/2):0;
        var d = r
          ? 'M'+cx+' '+(y0+h)+'V'+(y0+r)+'a'+r+' '+r+' 0 0 1 '+r+' '+(-r)+'h'+(bw-2*r)+'a'+r+' '+r+' 0 0 1 '+r+' '+r+'V'+(y0+h)+'Z'
          : 'M'+cx+' '+(y0+h)+'V'+y0+'h'+bw+'V'+(y0+h)+'Z';
        svg.appendChild(el('path',{d:d,fill:col(idxOf[s.name])}));
        base+=v;
      });
    });
    /* peak callout */
    var pi=totals.indexOf(Math.max.apply(null,totals));
    if(totals[pi]>0){
      var pl=el('text',{x:Xb(pi),y:Y(totals[pi])-8,'text-anchor':'middle',fill:cv('--text-primary'),'font-size':12,'font-weight':600,'font-family':'system-ui,sans-serif'});
      pl.textContent=money(totals[pi]);
      if(Xb(pi) < m.l+30) pl.setAttribute('text-anchor','start');
      if(Xb(pi) > W-m.r-30) pl.setAttribute('text-anchor','end');
      svg.appendChild(pl);
    }
  }

  /* hover layer */
  var cross=el('line',{x1:0,x2:0,y1:m.t,y2:m.t+ph,stroke:cv('--axis'),'stroke-width':1,opacity:0});
  svg.appendChild(cross);
  var hit=el('rect',{x:m.l-6,y:m.t,width:pw+12,height:ph,fill:'transparent'});
  hit.style.cursor='crosshair';
  svg.appendChild(hit);

  function show(i,px){
    cross.setAttribute('opacity',1);
    var cxp = opts.mode==='bar'?Xb(i):X(i);
    cross.setAttribute('x1',cxp); cross.setAttribute('x2',cxp);
    tip.textContent='';
    var yr=document.createElement('div'); yr.className='ttyear'; yr.textContent=yrs[i];
    tip.appendChild(yr);
    var tbl=document.createElement('table');
    var idx=state.from+i, sum=0;
    series.forEach(function(s){
      var v=s.values[idx]; sum+=v; if(v<=0) return;
      var tr=document.createElement('tr');
      var k=document.createElement('td'); k.className='k';
      var sp=document.createElement('span'); sp.className='key'; sp.style.background=col(idxOf[s.name]);
      k.appendChild(sp);
      var nm=document.createElement('td'); nm.className='n'; nm.textContent=s.name;
      var vv=document.createElement('td'); vv.className='v'; vv.textContent=full(v);
      tr.appendChild(k);tr.appendChild(nm);tr.appendChild(vv);tbl.appendChild(tr);
    });
    var tr2=document.createElement('tr'); tr2.className='tot';
    var e1=document.createElement('td'); e1.className='k tot';
    var e2=document.createElement('td'); e2.className='n tot'; e2.textContent=opts.totalLabel;
    var e3=document.createElement('td'); e3.className='v tot'; e3.textContent=full(sum);
    tr2.appendChild(e1);tr2.appendChild(e2);tr2.appendChild(e3);tbl.appendChild(tr2);
    if(opts.extra){
      var tr3=document.createElement('tr');
      var f1=document.createElement('td');
      var f2=document.createElement('td'); f2.className='n'; f2.textContent=opts.extra.label;
      var f3=document.createElement('td'); f3.className='v'; f3.textContent=opts.extra.fmt(opts.extra.values[idx]);
      tr3.appendChild(f1);tr3.appendChild(f2);tr3.appendChild(f3);tbl.appendChild(tr3);
    }
    tip.appendChild(tbl);
    tip.style.opacity=1;
    var hw=host.clientWidth, tw=tip.offsetWidth;
    var left = px + 18; if(left+tw > hw) left = px - tw - 18; if(left<0) left=0;
    tip.style.left=left+'px'; tip.style.top='8px';
  }
  function hide(){ tip.style.opacity=0; cross.setAttribute('opacity',0); }
  function move(ev){
    var r=host.getBoundingClientRect();
    var px=ev.clientX-r.left;
    var rel=(px/r.width)*W;
    var i;
    if(opts.mode==='bar'){ i=Math.floor(((rel-m.l)/pw)*n); }
    else { i=Math.round(((rel-m.l)/pw)*(n-1)); }
    i=Math.max(0,Math.min(n-1,i));
    show(i,px);
  }
  hit.addEventListener('pointermove',move);
  hit.addEventListener('pointerleave',hide);
  host.insertBefore(svg, tip);
}

/* ---------- single-series column chart (withdrawal rate) ---------- */
function rateChart(){
  var host=document.getElementById('plot-rate');
  var tip=document.getElementById('tt-rate');
  Array.prototype.slice.call(host.querySelectorAll('svg')).forEach(function(s){s.remove();});
  var yrs=D.years.slice(state.from,state.to+1);
  var vals=D.rateComputed.slice(state.from,state.to+1);
  var n=yrs.length, W=980, H=210, m={t:16,r:58,b:34,l:66};
  var pw=W-m.l-m.r, ph=H-m.t-m.b;
  var maxV=niceMax(Math.max.apply(null,vals.concat([5])));
  var Xb=function(i){ return m.l+pw*(i+0.5)/n; };
  var Y=function(v){ return m.t+ph-(v/maxV)*ph; };
  var svg=el('svg',{viewBox:'0 0 '+W+' '+H, role:'img'});
  svg.setAttribute('aria-label','Withdrawal rate by year, percent of portfolio');
  for(var g=0; g<=4; g++){
    var v=maxV*g/4, y=Y(v);
    svg.appendChild(el('line',{x1:m.l,x2:W-m.r,y1:y,y2:y,stroke:g?cv('--grid'):cv('--axis'),'stroke-width':1}));
    var t=el('text',{x:m.l-10,y:y+4,'text-anchor':'end',fill:cv('--muted'),'font-size':11.5,'font-family':'system-ui,sans-serif'});
    t.setAttribute('style','font-variant-numeric:tabular-nums'); t.textContent=v.toFixed(0)+'%';
    svg.appendChild(t);
  }
  /* 4% reference */
  var ry=Y(4);
  svg.appendChild(el('line',{x1:m.l,x2:W-m.r,y1:ry,y2:ry,stroke:cv('--text-secondary'),'stroke-width':1}));
  var rl=el('text',{x:W-m.r+8,y:ry+4,fill:cv('--text-secondary'),'font-size':11.5,'font-family':'system-ui,sans-serif'});
  rl.textContent='4% guide'; svg.appendChild(rl);

  var step=Math.max(1,Math.ceil(n/12));
  yrs.forEach(function(y,i){
    if(i%step && i!==n-1) return;
    var t=el('text',{x:Xb(i),y:H-m.b+20,'text-anchor':'middle',fill:cv('--muted'),'font-size':11.5,'font-family':'system-ui,sans-serif'});
    t.textContent=y; svg.appendChild(t);
  });
  var bw=Math.min(24,(pw/n)-4);
  vals.forEach(function(v,i){
    if(v<=0) return;
    var y0=Y(v), h=(m.t+ph)-y0, r=Math.min(4,bw/2), cx=Xb(i)-bw/2;
    var d='M'+cx+' '+(y0+h)+'V'+(y0+r)+'a'+r+' '+r+' 0 0 1 '+r+' '+(-r)+'h'+(bw-2*r)+'a'+r+' '+r+' 0 0 1 '+r+' '+r+'V'+(y0+h)+'Z';
    svg.appendChild(el('path',{d:d,fill:cv('--s1')}));
  });
  var pi=vals.indexOf(Math.max.apply(null,vals));
  var pl=el('text',{x:Xb(pi),y:Y(vals[pi])-8,'text-anchor':'middle',fill:cv('--text-primary'),'font-size':12,'font-weight':600,'font-family':'system-ui,sans-serif'});
  pl.textContent=vals[pi].toFixed(1)+'%';
  if(Xb(pi)<m.l+24) pl.setAttribute('text-anchor','start');
  if(Xb(pi)>W-m.r-24) pl.setAttribute('text-anchor','end');
  svg.appendChild(pl);

  var cross=el('line',{x1:0,x2:0,y1:m.t,y2:m.t+ph,stroke:cv('--axis'),'stroke-width':1,opacity:0});
  svg.appendChild(cross);
  var hit=el('rect',{x:m.l-6,y:m.t,width:pw+12,height:ph,fill:'transparent'});
  hit.style.cursor='crosshair'; svg.appendChild(hit);
  hit.addEventListener('pointermove',function(ev){
    var r=host.getBoundingClientRect(), px=ev.clientX-r.left;
    var i=Math.max(0,Math.min(n-1,Math.floor((((px/r.width)*W)-m.l)/pw*n)));
    cross.setAttribute('opacity',1); cross.setAttribute('x1',Xb(i)); cross.setAttribute('x2',Xb(i));
    tip.textContent='';
    var yr=document.createElement('div'); yr.className='ttyear'; yr.textContent=yrs[i]; tip.appendChild(yr);
    var tb=document.createElement('table');
    [['Withdrawal rate', vals[i].toFixed(2)+'%'+(D.rateEstimated[state.from+i]?' (calculated)':'')],
     ['Withdrawn', full(D.withdrawalTotal[state.from+i])],
     ['Portfolio', full(D.portfolioTotal[state.from+i])]].forEach(function(row,k){
      var tr=document.createElement('tr');
      var a=document.createElement('td'); a.className='k';
      if(k===0){ var sp=document.createElement('span'); sp.className='key'; sp.style.background=cv('--s1'); a.appendChild(sp); }
      var b=document.createElement('td'); b.className='n'; b.textContent=row[0];
      var c=document.createElement('td'); c.className='v'; c.textContent=row[1];
      tr.appendChild(a);tr.appendChild(b);tr.appendChild(c);tb.appendChild(tr);
    });
    tip.appendChild(tb); tip.style.opacity=1;
    var hw=host.clientWidth, tw=tip.offsetWidth;
    var left=px+18; if(left+tw>hw) left=px-tw-18; if(left<0) left=0;
    tip.style.left=left+'px'; tip.style.top='6px';
  });
  hit.addEventListener('pointerleave',function(){ tip.style.opacity=0; cross.setAttribute('opacity',0); });
  host.insertBefore(svg,tip);

  /* table */
  var w=document.getElementById('tbl-rate'); var keep=w.classList.contains('show'); w.textContent='';
  var t=document.createElement('table'); t.className='data';
  var th=document.createElement('thead'), hr=document.createElement('tr');
  ['Year','Withdrawal rate','Withdrawn','Portfolio value'].forEach(function(h){ var e=document.createElement('th'); e.textContent=h; hr.appendChild(e); });
  th.appendChild(hr); t.appendChild(th);
  var tb2=document.createElement('tbody');
  yrs.forEach(function(y,i){
    var tr=document.createElement('tr');
    [y, vals[i].toFixed(2)+'%'+(D.rateEstimated[state.from+i]?' *':''), full(D.withdrawalTotal[state.from+i]), full(D.portfolioTotal[state.from+i])].forEach(function(c){
      var td=document.createElement('td'); td.textContent=c; tr.appendChild(td);
    });
    tb2.appendChild(tr);
  });
  t.appendChild(tb2); w.appendChild(t); if(keep) w.classList.add('show');
}

/* ---------- render ---------- */
function renderAll(){
  renderTiles();
  var acc=D.accounts[state.detail], wd=D.withdrawals[state.detail], exp=D.expenses.grouped;

  legend('lg-acc', acc.map(function(s){return s.name;}), 'rect', 'a:');
  stacked({plot:'plot-acc', tip:'tt-acc', series:acc, key:'a:', mode:'area', height:340,
    totalLabel:'Total portfolio', fmtAxis:money,
    aria:'Portfolio value by account, '+D.years[state.from]+' to '+D.years[state.to]});
  tableView('tbl-acc', acc, full, 'Total');

  legend('lg-wd', wd.map(function(s){return s.name;}), 'rect', 'w:');
  stacked({plot:'plot-wd', tip:'tt-wd', series:wd, key:'w:', mode:'bar', height:300,
    totalLabel:'Total withdrawn', fmtAxis:money,
    extra:{label:'Withdrawal rate', values:D.rateComputed, fmt:function(v){return v.toFixed(2)+'%';}},
    aria:'Annual withdrawals by source account'});
  tableView('tbl-wd', wd, full, 'Total');

  rateChart();

  legend('lg-exp', exp.map(function(s){return s.name;}), 'rect', 'e:');
  stacked({plot:'plot-exp', tip:'tt-exp', series:exp, key:'e:', mode:'bar', height:300,
    totalLabel:'Total spending', fmtAxis:money,
    aria:'Annual expenses by category'});
  tableView('tbl-exp', exp, full, 'Total');
}
renderAll();
updateFooter();
window.addEventListener('resize', function(){ /* svg is viewBox-scaled; tooltips reposition on hover */ });
})();
