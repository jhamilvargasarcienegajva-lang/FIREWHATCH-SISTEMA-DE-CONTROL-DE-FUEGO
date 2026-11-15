(() => {
  'use strict';
  const A=window.FireAnalysis, P=window.FireAssessment;
  const $=id=>document.getElementById(id);
  const archive=window.FIRMS_ARCHIVE;
  const districts=window.DISTRITOS_GAMC.features.map(feature=>({
    id:feature.properties.Distrito, geometry:feature.geometry, box:A.bounds(feature.geometry)
  }));
  const city=A.union(districts.map(d=>d.box)), local=archive.meta.local.box;
  const number=new Intl.NumberFormat('es-BO',{maximumFractionDigits:1});
  const localTime=new Intl.DateTimeFormat('es-BO',{dateStyle:'short',timeStyle:'short',timeZone:'America/La_Paz'});
  const fmt=n=>number.format(n);
  const dateTime=raw=>localTime.format(new Date(raw));
  const utcLabel=new Intl.DateTimeFormat('es-BO',{dateStyle:'medium',timeZone:'UTC'});
  const formatDay=day=>utcLabel.format(new Date(day+'T00:00:00Z'));
  const latLon=(lat,lon)=>lat.toFixed(5)+'°, '+lon.toFixed(5)+'°';
  const values=row=>({id:row[0],lat:row[1],lon:row[2],at:row[3],sensor:row[4],sat:row[5],frp:row[6],quality:row[7],event:row[8]});
  const published=archive.rows.map(values);
  const compass=([w,s,e,n])=>[[s,w],[n,e]];
  const empty=() => ({layers:[],box:null});
  const sampleDistrict=districts.find(d=>d.id==='D13');
  const drillSite=(()=>{
    const [w,s,e,n]=sampleDistrict.box;
    for(let i=0;i<9;i++) for(let j=0;j<9;j++){
      const lon=(w+e)/2+(i-4)*(e-w)/12;
      const lat=(s+n)/2+(j-4)*(n-s)/12;
      if(A.inside([lon,lat],sampleDistrict)&&A.inBox([lon,lat],local)) return {lat,lon};
    }
    return {lat:-17.34,lon:-66.18};
  })();
  const state={screen:'mapa',region:'local',mode:'3d',sensor:'all',day:'all',source:'archive',park:empty(),live:null,scenario:null,selected:null,seed:null,timer:null};
  const create=(tag,text)=>{
    const node=document.createElement(tag);
    if(text!==undefined) node.textContent=text;
    return node;
  };
  const text=(id,value)=>{$(id).textContent=value;};

  const map=L.map('map',{preferCanvas:true,zoomControl:false,scrollWheelZoom:false,maxZoom:17,attributionControl:true});
  map.setView([-17.38,-66.17],11);
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Distritos · GAMC');
  L.control.scale({imperial:false,position:'bottomright'}).addTo(map);
  L.rectangle(compass(local),{color:'#a4c2a7',weight:1.4,dashArray:'6 7',fill:false,interactive:false}).addTo(map);
  L.geoJSON(window.DISTRITOS_GAMC,{style:{color:'#a4d0b2',weight:1.1,fillOpacity:.13},interactive:false}).addTo(map);
  const parks=L.geoJSON(null,{style:{color:'#e2eaa2',weight:2,dashArray:'4 4',fillOpacity:.08},interactive:false}).addTo(map);
  const sites=L.layerGroup().addTo(map);
  const simulation=L.layerGroup().addTo(map);
  let tiles=null, tileIdentity='', terrain=null, footprint=null;

  function publicData(){
    if(state.region==='regional') return {rows:published,info:archive.meta.regional,live:false};
    const localRows=published.filter(p=>A.inBox([p.lon,p.lat],local));
    return state.source==='live'&&state.live ? state.live : {rows:localRows,info:archive.meta.local,live:false};
  }
  function visibleRows(withDate=true){
    return publicData().rows.filter(r=>(state.sensor==='all'||r.sensor===state.sensor)&&
      (!withDate||state.day==='all'||r.at.startsWith(state.day))&&
      (state.region!=='local'||!state.park.layers.length||state.park.layers.some(s=>A.inside([r.lon,r.lat],s))));
  }
  function queryDays(info){
    const end=Date.parse(info.at.slice(0,10)+'T00:00:00Z');
    return Array.from({length:info.days},(_,i)=>new Date(end-(info.days-1-i)*86400000).toISOString().slice(0,10));
  }
  function syncFilters(){
    const select=$('map-day');
    const days=queryDays(publicData().info);
    if(state.day!=='all'&&!days.includes(state.day)) state.day='all';
    const all=create('option','Toda la consulta');
    all.value='all';
    select.replaceChildren(all,...days.map(day=>{
      const option=create('option',formatDay(day));option.value=day;return option;
    }));
    select.value=state.day;
    $('source-control').hidden=!(state.live&&state.region==='local');
    $('source').value=state.source;
  }
  function getImagery(){
    if(state.mode==='3d') return;
    const source=$('imagery').value, date=state.day==='all'?publicData().info.at.slice(0,10):state.day;
    const identity=source==='nasa'?source+date:source;
    if(identity===tileIdentity) return;
    tileIdentity=identity;
    if(tiles) map.removeLayer(tiles);
    $('imagery-status').hidden=true;
    if(source==='none'){tiles=null;return;}
    const nasa='https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/'+
      date+'/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg';
    tiles=L.tileLayer(source==='nasa'?nasa:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxNativeZoom:source==='nasa'?9:19,attribution:source==='nasa'?'NASA EOSDIS GIBS · '+date:'© OpenStreetMap contributors'
    }).addTo(map);
    tiles.on('tileerror',()=>{
      $('imagery-status').hidden=false;
      text('imagery-status','La imagen en línea no respondió. Los límites y focos siguen disponibles.');
    });
  }
  function positionMap(){ map.invalidateSize(); }
  function fit(){
    if(state.screen!=='mapa') return;
    if(state.mode==='3d'){
      const s=state.scenario;
      terrain?.fit(s?[s.lon-.042,s.lat-.038,s.lon+.042,s.lat+.038]:city);
      return;
    }
    positionMap();
    if(state.scenario&&state.selected?.demo){
      map.setView([state.scenario.lat,state.scenario.lon],12);
    } else {
      const box=state.region==='regional'?archive.meta.regional.box:state.park.box||local;
      map.fitBounds(compass(box),{padding:[17,17],maxZoom:13});
    }
  }
  function setView(next,center=true){
    state.mode=next==='3d'&&terrain&&state.region==='local'?'3d':'2d';
    $('map').hidden=state.mode==='3d';
    $('terrain').hidden=state.mode!=='3d';
    $('terrain-caption').hidden=state.mode!=='3d';
    $('imagery-control').hidden=state.mode==='3d';
    if(state.mode==='3d') $('imagery-status').hidden=true;
    $('two-d').setAttribute('aria-pressed',String(state.mode==='2d'));
    $('three-d').setAttribute('aria-pressed',String(state.mode==='3d'));
    $('three-d').disabled=!terrain||state.region==='regional';
    terrain?.setActive(state.mode==='3d'&&state.screen==='mapa');
    drawMap();
    if(center) fit();
  }

  function districtFor(row){return districts.find(d=>A.inside([row.lon,row.lat],d))?.id;}
  function choose(row){
    state.selected=row;
    drawInspector();
  }
  function drawMap(){
    const rows=visibleRows();
    const drill=state.scenario;
    if(state.mode==='3d') {
      const cells=rows.map(r=>({...r,key:r.id,days:1,color:r.sensor==='MODIS'?'modis':'viirs'}));
      if(drill) cells.push({...drill,key:drill.id,days:5,color:'both'});
      terrain.setData(cells,{districts:true,park:true,fires:true,scope:'city'});
      return;
    }
    getImagery();
    sites.clearLayers();
    for(const row of rows){
      const color=row.sensor==='MODIS'?'#ffc77a':'#78d6dd';
      L.circleMarker([row.lat,row.lon],{radius:state.region==='regional'?3:5,color:'#213730',weight:1,fillColor:color,
        fillOpacity:.94}).bindTooltip(row.sensor+' · '+row.id).on('click',()=>choose(row)).addTo(sites);
    }
    simulation.clearLayers();
    footprint=null;
    if(drill){
      L.circleMarker([drill.lat,drill.lon],{radius:10,color:'#fff1d5',weight:2,fillColor:'#ed6d38',fillOpacity:1})
        .bindTooltip('SIMULACIÓN · '+drill.id,{direction:'top'}).on('click',()=>choose(drill)).addTo(simulation);
      footprint=L.geoJSON(null,{style:{color:'#ff8a4a',weight:2,fillColor:'#ff9657',fillOpacity:.27},interactive:false}).addTo(simulation);
      updateFootprint();
    }
  }
  function details(entries){
    $('inspector-details').replaceChildren(...entries.map(([label,value])=>{
      const row=create('div'); row.append(create('dt',label),create('dd',value));return row;
    }));
  }
  function drawInspector(){
    const row=state.selected, source=publicData();
    $('inspector-source').classList.toggle('simulated',Boolean(row?.demo));
    $('open-simulator').hidden=!row?.demo;
    $('seed-scenario').hidden=!row||row.demo||!A.inBox([row.lon,row.lat],local);
    $('map-playback').hidden=!row?.demo;
    if(!row){
      text('inspector-source',source.live?'Consulta en vivo':'Consulta archivada');
      text('inspector-title',state.region==='local'?'Área de interés del Tunari':'Ventana regional de FIRMS');
      text('inspector-note',visibleRows().length?'Selecciona una detección para ver su ficha.':
        'La consulta no registró detecciones para la selección actual.');
      details([['Consulta (Bolivia)',dateTime(source.info.at)],['Fecha UTC',state.day==='all'?'Toda la consulta':formatDay(state.day)],
        ['Sensor',state.sensor==='all'?'MODIS y VIIRS':state.sensor],
        ['Base territorial',state.park.box&&state.region==='local'?'Polígono cargado':'Área de consulta']]);
      return;
    }
    if(row.demo){
      const s=state.scenario;
      text('inspector-source','Simulación · '+s.id);
      text('inspector-title','Foco de calor simulado');
      text('inspector-note','Escenario de práctica con condiciones hipotéticas. El puntaje es una estimación del simulador.');
      details([['Ubicación',latLon(s.lat,s.lon)],['Sector',districtFor(s)||'Área de interés'],['Temperatura',s.input.temperature+' °C'],
        ['Humedad',s.input.humidity+' %'],['Viento',s.input.wind+' km/h'],['Riesgo estimado',s.risk.level+' · '+fmt(s.risk.score)+' / 100']]);
      return;
    }
    text('inspector-source','NASA FIRMS · '+(source.live?'En vivo':'Archivo'));
    text('inspector-title','Detección '+row.id);
    text('inspector-note','Anomalía térmica detectada por satélite. La confirmación de un incendio requiere verificación de campo.');
    details([['Ubicación',latLon(row.lat,row.lon)],['Fecha (Bolivia)',dateTime(row.at)],['Sensor',row.sensor],
      ['Satélite',row.sat||'Sin dato'],['Potencia radiativa',row.frp===null?'Sin dato':fmt(row.frp)+' MW'],
      ['Confianza normalizada',row.quality===null?'Sin dato':fmt(row.quality*100)+' %']]);
  }
  function summary(){
    const {info,live}=publicData(), rows=visibleRows();
    text('count',fmt(rows.length)); text('modis-count',fmt(rows.filter(r=>r.sensor==='MODIS').length));
    text('viirs-count',fmt(rows.filter(r=>r.sensor==='VIIRS').length));text('demo-count',state.scenario?'1':'0');
    text('coverage-label',state.region==='regional'?'Ventana regional de consulta':state.park.box?'Polígono del parque cargado':'Área de consulta del Tunari');
    text('map-source','NASA FIRMS · '+(live?'En vivo':'Archivo Módulo 03')+' · '+dateTime(info.at)+' (Bolivia)');
    const days=queryDays(info);
    const archiveRows=visibleRows(false);
    text('stat-origin',(state.region==='regional'?'Ventana regional':'Área del Tunari')+
      ' · '+fmt(archiveRows.length)+' detecciones en la consulta. Corte '+dateTime(info.at)+' (Bolivia).');
    $('export-sim').disabled=!state.scenario;
    const grouped=new Map(days.map(day=>[day,{MODIS:0,VIIRS:0}]));
    for(const row of archiveRows){
      const entry=grouped.get(row.at.slice(0,10));
      if(entry&&Object.hasOwn(entry,row.sensor)) entry[row.sensor]++;
    }
    const chart=$('daily-chart');
    chart.replaceChildren();
    const max=Math.max(1,...[...grouped.values()].map(counts=>counts.MODIS+counts.VIIRS));
    for(const [day,counts] of grouped){
      const total=counts.MODIS+counts.VIIRS;
      const row=create('button');row.type='button';row.className='chart-row';
      row.setAttribute('aria-label',formatDay(day)+', '+total+' detecciones, ver en mapa');
      const track=create('span');track.className='chart-track';
      for(const sensor of ['MODIS','VIIRS']){
        const bar=create('i');bar.className=sensor.toLowerCase();
        bar.style.width=(100*counts[sensor]/max)+'%';track.append(bar);
      }
      row.title='MODIS '+counts.MODIS+' · VIIRS '+counts.VIIRS;
      row.append(create('span',formatDay(day)),track,create('b',fmt(total)));
      row.addEventListener('click',()=>{
        state.day=day;state.selected=null;
        syncFilters();location.hash='mapa';navigate();summary();
      });
      chart.append(row);
    }
    drawInspector();
  }
  function navigate(){
    const requested=location.hash.slice(1);
    state.screen=['mapa','simulacion','estadisticas','fuentes'].includes(requested)?requested:'mapa';
    text('scenario-location',state.seed?'Punto de partida: detección '+state.seed.id+' de NASA FIRMS.':'Punto de demostración en el Distrito 13.');
    document.querySelectorAll('[data-screen]').forEach(el=>el.hidden=el.dataset.screen!==state.screen);
    document.querySelectorAll('#nav a').forEach(el=>{
      const active=el.hash==='#'+state.screen;
      el.classList.toggle('actual',active);
      if(active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
    });
    $('nav').classList.remove('abierto');$('menu').setAttribute('aria-expanded','false');
    terrain?.setActive(state.screen==='mapa'&&state.mode==='3d');
    if(state.screen==='mapa') { if(state.mode==='2d') positionMap();drawMap();fit(); }
  }

  function updateFootprint(){
    const s=state.scenario;
    const frame=s?P.spread(s,s.hour,s.input):null;
    terrain?.setSimulation(frame?.geometry??null);
    if(footprint){
      footprint.clearLayers();
      if(frame) footprint.addData(frame.geometry);
    }
  }
  function updateScenario(){
    const s=state.scenario;
    $('clear-demo').hidden=!s;
    if(!s){text('sim-result','Pulsa Simular foco de calor para crear un caso y ver la proyección.');return;}
    const frame=P.spread(s,s.hour,s.input);
    const hectares=fmt(frame.area)+' ha estimadas';
    $('map-time').value=s.hour;
    text('map-hour','+'+fmt(s.hour)+' h');text('map-hectares',hectares);
    text('map-play',state.timer?'Pausar':s.hour>=24?'Repetir':'Reproducir');
    text('sim-result','Riesgo '+s.risk.level+' · '+fmt(s.risk.score)+' / 100. A +'+fmt(s.hour)+' h: '+hectares+'.');
    updateFootprint();
  }
  function stopPlayback(){
    clearInterval(state.timer);
    state.timer=null;
  }
  function play(){
    if(!state.scenario) return;
    if(state.timer){stopPlayback();updateScenario();return;}
    if(state.scenario.hour>=24) state.scenario.hour=0;
    state.timer=setInterval(()=>{
      const s=state.scenario;
      s.hour=Math.min(24,s.hour+.5);
      if(s.hour===24) stopPlayback();
      updateScenario();
    },260);
    updateScenario();
  }
  function startScenario(seed=null){
    if(!$('scenario-form').reportValidity()) return;
    stopPlayback();
    const input=Object.fromEntries(['temperature','humidity','wind','bearing','rain'].map(k=>[k,Number($(k).value)]));
    input.cover=$('cover').value;
    const origin=seed?{lat:seed.lat,lon:seed.lon}:drillSite;
    const localRows=state.live?.rows??published.filter(row=>A.inBox([row.lon,row.lat],local));
    const nearby=seed?localRows.filter(row=>Math.hypot((row.lon-seed.lon)*107,(row.lat-seed.lat)*111)<55).length:1;
    state.seed=seed;
    state.scenario={...origin,reference:seed?.id??null,id:'SIM-01',demo:true,hour:0,input,risk:P.assess({...input,nearby})};
    state.region='local';state.day='all';$('region').value='local';syncFilters();
    state.selected=state.scenario;
    location.hash='mapa';navigate();
    setView(state.mode);
    if(state.mode==='3d') terrain.pick({...state.scenario,key:state.scenario.id});
    summary();play();
  }
  function clearScenario(){
    stopPlayback();state.scenario=null;
    if(state.selected?.demo) state.selected=null;
    terrain?.pick(null);
    drawMap();updateFootprint();updateScenario();summary();
  }
  function download(name,data,type){
    const url=URL.createObjectURL(new Blob([data],{type}));
    const a=create('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  let pending=false;
  async function checkServer(){
    if(!['127.0.0.1','localhost','[::1]'].includes(location.hostname)) return;
    try{
      const res=await fetch('/api/estado');
      if(!res.ok || (await res.json()).service!=='firewatch-firms') return;
      $('firms-form').hidden=false;
      text('connection-note','Servidor local disponible. La consulta reúne MODIS y VIIRS para el área del Tunari.');
    }catch{ /* El archivo archivado permanece disponible. */ }
  }
  $('firms-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(pending) return;
    pending=true; $('refresh-firms').disabled=true;
    text('live-status','Consultando NASA FIRMS…');
    try{
      const res=await fetch('/api/firms',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({key:$('firms-key').value.trim(),days:Number($('firms-days').value)})});
      const result=await res.json();
      if(!res.ok) throw Error(result.error||'La consulta no se pudo completar.');
      const rows=result.rows.map(values);
      state.live={rows,info:result.info,live:true};
      state.region='local';state.source='live';state.day='all';$('region').value='local';state.selected=null;syncFilters();
      text('live-status','Consulta completada · '+fmt(rows.length)+' detecciones en el área de consulta.');
      setView(state.mode,false);summary();
    }catch(e){
      text('live-status',e.message+' Se conserva la última consulta disponible.');
    }finally{
      pending=false;$('refresh-firms').disabled=false;
    }
  });
  $('park-file').addEventListener('change',async e=>{
    const file=e.target.files[0];
    if(!file) return;
    try{
      if(file.size>16*1024*1024) throw Error('El archivo supera el límite de 16 MB.');
      const collection=A.validatePark(JSON.parse(await file.text()));
      const layers=collection.features.map(f=>({geometry:f.geometry,box:A.bounds(f.geometry)}));
      state.park={layers,box:A.union(layers.map(l=>l.box))};
      const fully=A.containsBox(local,state.park.box);
      parks.clearLayers();parks.addData(collection);
      terrain?.setPark(layers.map(l=>l.geometry));
      text('park-note','Límite incorporado a la sesión.'+(fully?'':' La consulta cubre solo el sector que coincide con el área descargada.'));
      state.selected=null;drawMap();summary();
    }catch(err){text('park-note',err.message);}
    finally{e.target.value='';}
  });
  $('export-real').addEventListener('click',()=>{
    download('FireWatch_FIRMS_'+state.region+'.csv',A.csv(
      ['fuente','modo','id','latitude','longitude','utc','sensor','satelite','frp_mw','confianza_normalizada'],
      visibleRows().map(r=>['NASA FIRMS',publicData().live?'en_vivo':'archivo',r.id,r.lat,r.lon,r.at,r.sensor,r.sat,r.frp,r.quality])
    ),'text/csv;charset=utf-8');
  });
  $('export-sim').addEventListener('click',()=>{
    const s=state.scenario;
    if(!s) return;
    const frame=P.spread(s,s.hour,s.input);
    const properties={modo:'simulacion',id:s.id,referencia_firms:s.reference,horas:s.hour,area_hectareas:frame.area,riesgo:s.risk,...s.input};
    download('FireWatch_SIMULACION.geojson',JSON.stringify({type:'FeatureCollection',features:[
      {type:'Feature',geometry:{type:'Point',coordinates:[s.lon,s.lat]},properties},
      {type:'Feature',geometry:frame.geometry,properties}
    ]},null,2),'application/geo+json');
  });
  $('archive-main').addEventListener('click',()=>{
    state.region='regional';state.source='archive';state.day='all';state.sensor='all';state.selected=null;
    $('region').value='regional';$('sensor').value='all';syncFilters();setView('2d',false);
    location.hash='estadisticas';navigate();summary();
  });
  $('simulate-main').addEventListener('click',()=>startScenario());
  $('seed-scenario').addEventListener('click',()=>{
    if(!state.selected||state.selected.demo) return;
    state.seed=state.selected;location.hash='simulacion';navigate();
  });
  $('scenario-form').addEventListener('submit',e=>{e.preventDefault();startScenario(state.seed);});
  $('clear-demo').addEventListener('click',clearScenario);
  $('clear-map').addEventListener('click',clearScenario);
  $('map-play').addEventListener('click',play);
  $('map-time').addEventListener('input',e=>{
    if(!state.scenario) return;
    stopPlayback();state.scenario.hour=Number(e.target.value);updateScenario();
  });
  $('region').addEventListener('change',()=>{
    state.region=$('region').value;state.day='all';state.selected=null;
    if(state.region==='regional') state.source='archive';
    syncFilters();setView(state.mode);summary();
  });
  $('map-day').addEventListener('change',()=>{
    state.day=$('map-day').value;
    if(!state.selected?.demo) state.selected=null;
    drawMap();summary();
  });
  $('source').addEventListener('change',()=>{
    state.source=$('source').value;state.day='all';state.selected=null;
    syncFilters();drawMap();summary();
  });
  $('sensor').addEventListener('change',()=>{
    state.sensor=$('sensor').value;
    if(!state.selected?.demo) state.selected=null;
    drawMap();summary();
  });
  $('imagery').addEventListener('change',getImagery);
  $('two-d').addEventListener('click',()=>setView('2d'));
  $('three-d').addEventListener('click',()=>setView('3d'));
  $('center').addEventListener('click',fit);
  $('zoom-in').addEventListener('click',()=>state.mode==='3d'?terrain.zoom(.82):map.zoomIn());
  $('zoom-out').addEventListener('click',()=>state.mode==='3d'?terrain.zoom(1.22):map.zoomOut());
  $('menu').addEventListener('click',()=>{
    const active=$('nav').classList.toggle('abierto');
    $('menu').setAttribute('aria-expanded',String(active));
  });
  window.addEventListener('hashchange',navigate);
  try{
    terrain=window.FireTerrain.create({host:$('terrain'),canvas:$('terrain-scene'),overlay:$('terrain-hud'),districts,
      onCell:choose,onDistrict:()=>{},onEngine:()=>{}});
  }catch{terrain=null;}
  syncFilters();navigate();setView(state.mode);summary();updateScenario();checkServer();
})();
