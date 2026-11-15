/* Terreno sintético para la demostración. Las capas vectoriales conservan su ubicación. */
(() => {
  'use strict';

  const ORIGIN = [-66.175, -17.39];
  const KM_LON = 111.195 * Math.cos(ORIGIN[1] * Math.PI / 180);
  const KM_LAT = 111.195;
  const XMIN = -55, XMAX = 55, ZMIN = -56, ZMAX = 53;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const mix = (a, b, t) => a + (b-a)*t;
  const smooth = (a, b, x) => {
    const t = clamp((x-a)/(b-a), 0, 1);
    return t*t*(3-2*t);
  };
  const norm = a => {
    const length = Math.hypot(...a) || 1;
    return a.map(x => x/length);
  };
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const subtract = (a,b) => a.map((x,i) => x-b[i]);
  const hash = (x,z) => {
    const n = Math.sin(x*127.1 + z*311.7)*43758.5453123;
    return n-Math.floor(n);
  };
  function noise(x,z) {
    const a = Math.floor(x), b = Math.floor(z);
    const tx = smooth(0,1,x-a), tz = smooth(0,1,z-b);
    return mix(mix(hash(a,b),hash(a+1,b),tx),mix(hash(a,b+1),hash(a+1,b+1),tx),tz);
  }
  function elevation(x,z) {
    const n = -z;
    const bend = 8.3 + 2.6*Math.sin(x*.14+.4) + 1.3*Math.sin(x*.33);
    const ridge = 3.4*Math.exp(-(((n-bend)/6.6)**2)) * (.69+.31*noise(x*.15+4,n*.16));
    const foothills = 1.24 * Math.exp(-(((n-bend+4.8)/5.4)**2));
    const secondary = 2.2*Math.exp(-(((n-20+4*Math.cos(x*.12))/9)**2));
    const south = 1.45*smooth(8,20,z)*(0.4+0.6*noise(x*.12+9,z*.15));
    const ravine = .48*Math.exp(-(((x+3.8+2.3*Math.sin(n*.32))/1.05)**2));
    const rocky = smooth(1,7,n)+.24*smooth(7,16,z);
    const detail = (noise(x*.37,z*.38)-.5)*1.38 + (noise(x*.88+5,z*.82)-.5)*.60 +
      (noise(x*1.78,z*1.67)-.5)*.28;
    return Math.max(.03, .13+south+ridge+foothills+secondary+rocky*(detail-ravine));
  }
  function position(lon,lat,lift=0) {
    const x = (lon-ORIGIN[0])*KM_LON;
    const z = (ORIGIN[1]-lat)*KM_LAT;
    return [x,elevation(x,z)*1.28+lift,z];
  }

  function vertex(x,z) {
    const step = .13;
    const y = elevation(x,z)*1.28;
    return [x,y,z,...norm([(elevation(x-step,z)-elevation(x+step,z))*1.28,step*2,
      (elevation(x,z-step)-elevation(x,z+step))*1.28])];
  }
  function mesh(nx,nz) {
    const vertices = new Float32Array((nx+1)*(nz+1)*6);
    const indices = new Uint16Array(nx*nz*6);
    const stride = nx+1;
    for (let j=0;j<=nz;j++) for (let i=0;i<=nx;i++) {
      vertices.set(vertex(mix(XMIN,XMAX,i/nx),mix(ZMIN,ZMAX,j/nz)),(j*stride+i)*6);
    }
    let offset = 0;
    for (let j=0;j<nz;j++) for (let i=0;i<nx;i++) {
      const a = j*stride+i;
      indices.set([a,a+stride,a+1,a+1,a+stride,a+stride+1],offset);
      offset += 6;
    }
    return {vertices,indices,nx,nz};
  }

  const vert = `
    attribute vec3 pos;
    attribute vec3 normal;
    uniform vec3 eye, right, up, ahead;
    uniform float scale, aspect;
    varying vec3 vPos, vNormal;
    varying float vDepth;
    void main(){
      vec3 d=pos-eye;
      float z=dot(d,ahead);
      vPos=pos; vNormal=normal; vDepth=z;
      gl_Position=vec4(dot(d,right)*scale/aspect,dot(d,up)*scale,z*1.0011-.18,z);
    }
  `;
  const frag = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    varying vec3 vPos,vNormal;
    varying float vDepth;
    uniform float line;
    uniform vec4 lineColor;
    float noise2(vec2 p) { return fract(sin(dot(mod(p,173.),vec2(12.9898,14.233)))*437.5453); }
    void main(){
      if(line>0.5){ gl_FragColor=lineColor; return; }
      float h=vPos.y;
      vec2 p=vPos.xz;
      vec3 n=normalize(vNormal);
      float lum=dot(n,normalize(vec3(-.58,.72,-.4)));
      float urban=smoothstep(2.2,10.5,12.2-length((p-vec2(0.,4.))*vec2(.73,1.25)))*(1.-smoothstep(.5,1.1,h));
      vec3 low=vec3(.23,.35,.235);
      vec3 green=vec3(.234,.369,.294);
      vec3 high=vec3(.47,.49,.38);
      vec3 rock=vec3(.61,.56,.435);
      vec3 color=mix(low,green,smoothstep(.1,1.6,h));
      color=mix(color,high,smoothstep(1.9,4.3,h));
      color=mix(color,rock,smoothstep(4.2,6.2,h)*(.55+.45*(1.-n.y)));
      color=mix(color,vec3(.43,.417,.325),urban*.62);
      vec2 grid=fract(vec2(p.x+p.y*.51,p.y-p.x*.25)*3.4);
      float roads=max(1.-smoothstep(.025,.09,abs(grid.x-.38)),1.-smoothstep(.012,.084,abs(grid.y-.55)));
      color+=urban*roads*vec3(.10,.086,.046);
      float contours=1.-smoothstep(.007,.032,abs(fract(h/.275)-.5));
      color*=1.-contours*.105*smoothstep(.19,.55,h);
      float texture=noise2(floor(p*56.));
      color*=.84+max(0.,lum)*.29+texture*.12;
      color=mix(color,vec3(.112,.183,.176),smoothstep(60.,135.,vDepth)*.83);
      gl_FragColor=vec4(color,1.);
    }
  `;

  function makeRenderer(canvas) {
    const gl = canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:false});
    if (!gl) return null;
    function shader(type,text) {
      const value = gl.createShader(type);
      gl.shaderSource(value,text); gl.compileShader(value);
      if (!gl.getShaderParameter(value,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(value));
      return value;
    }
    const program = gl.createProgram();
    const vs=shader(gl.VERTEX_SHADER,vert), fs=shader(gl.FRAGMENT_SHADER,frag);
    gl.attachShader(program,vs); gl.attachShader(program,fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const uniform = Object.fromEntries(['eye','right','up','ahead','scale','aspect','line','lineColor']
      .map(key => [key,gl.getUniformLocation(program,key)]));
    const pos = gl.getAttribLocation(program,'pos'), normal = gl.getAttribLocation(program,'normal');
    const surface = mesh(216,182);
    function buffer(type,data) {
      const value=gl.createBuffer();
      gl.bindBuffer(type,value); gl.bufferData(type,data,gl.STATIC_DRAW);
      return value;
    }
    const points=buffer(gl.ARRAY_BUFFER,surface.vertices), faces=buffer(gl.ELEMENT_ARRAY_BUFFER,surface.indices);
    const tracks = new Map();
    function setTracks(name,segments) {
      if (tracks.has(name)) gl.deleteBuffer(tracks.get(name).buffer);
      const data = new Float32Array(segments.flat());
      tracks.set(name,{buffer:buffer(gl.ARRAY_BUFFER,data),count:data.length/3});
    }
    function draw(camera,show,selected) {
      gl.clearColor(.105,.167,.146,1.);
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      for (const key of ['eye','right','up','ahead']) gl.uniform3fv(uniform[key],camera[key]);
      gl.uniform1f(uniform.scale,camera.scale);
      gl.uniform1f(uniform.aspect,camera.aspect);
      gl.uniform1f(uniform.line,0);
      gl.bindBuffer(gl.ARRAY_BUFFER,points); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,faces);
      gl.enableVertexAttribArray(pos); gl.enableVertexAttribArray(normal);
      gl.vertexAttribPointer(pos,3,gl.FLOAT,false,24,0);
      gl.vertexAttribPointer(normal,3,gl.FLOAT,false,24,12);
      gl.drawElements(gl.TRIANGLES,surface.indices.length,gl.UNSIGNED_SHORT,0);
      gl.disableVertexAttribArray(normal);
      gl.uniform1f(uniform.line,1);
      if (show.districts) {
        trace('districts',[.72,.91,.80,.72]);
        if (selected) trace(selected,[.94,1,.74,1]);
      }
      if (show.park) trace('park',[.93,1,.47,.95]);
      trace('simulation',[1.,.57,.25,1.]);
    }
    function trace(name,color) {
      const track=tracks.get(name);
      if (!track?.count) return;
      gl.uniform4fv(uniform.lineColor,color);
      gl.bindBuffer(gl.ARRAY_BUFFER,track.buffer);
      gl.vertexAttribPointer(pos,3,gl.FLOAT,false,12,0);
      gl.drawArrays(gl.LINES,0,track.count);
    }
    return {draw,setTracks};
  }

  function rings(geometry) {
    return (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).flat();
  }
  function traces(geometries,lift) {
    const segments=[];
    for (const geometry of geometries) for (const ring of rings(geometry)) {
      for (let i=1;i<ring.length;i++) {
        const [lon0,lat0]=ring[i-1], [lon1,lat1]=ring[i];
        const n=Math.max(1,Math.ceil(Math.hypot((lon1-lon0)*KM_LON,(lat1-lat0)*KM_LAT)/.27));
        for (let j=0;j<n;j++) segments.push(position(mix(lon0,lon1,j/n),mix(lat0,lat1,j/n),lift),
          position(mix(lon0,lon1,(j+1)/n),mix(lat0,lat1,(j+1)/n),lift));
      }
    }
    return segments;
  }

  function cameraFor(view,width,height) {
    const distance = view.distance, plane = Math.cos(view.tilt)*distance;
    const eye = [view.x+Math.sin(view.angle)*plane,view.y+Math.sin(view.tilt)*distance,
      view.z+Math.cos(view.angle)*plane];
    const ahead=norm(subtract([view.x,view.y,view.z],eye));
    const right=norm(cross(ahead,[0,1,0]));
    const up=cross(right,ahead);
    return {eye,ahead,right,up,scale:2.18,aspect:width/height,width,height};
  }
  function project(point,camera) {
    const d=subtract(point,camera.eye);
    const depth=dot(d,camera.ahead);
    const scale=camera.height*.5*camera.scale/(depth||.001);
    return {x:camera.width*.5+dot(d,camera.right)*scale,y:camera.height*.5-dot(d,camera.up)*scale,depth};
  }
  function visible(camera,world) {
    for (let i=1;i<=14;i++) {
      const t=i/17;
      const [x,y,z]=world.map((value,k) => mix(camera.eye[k],value,t));
      if (elevation(x,z)*1.28 > y+.16) return false;
    }
    return true;
  }

  function software(canvas,project) {
    const ctx=canvas.getContext('2d');
    if (!ctx) return null;
    const terrain=mesh(95,83);
    const positions=[];
    for(let i=0;i<terrain.vertices.length;i+=6) positions.push(Array.from(terrain.vertices.slice(i,i+6)));
    const triangles=[];
    const light=norm([-.58,.72,-.4]);
    for(let t=0;t<terrain.indices.length;t+=3) {
      const face=[terrain.indices[t],terrain.indices[t+1],terrain.indices[t+2]];
      const a=positions[face[0]], b=positions[face[1]],c=positions[face[2]];
      const x=(a[0]+b[0]+c[0])/3,h=(a[1]+b[1]+c[1])/3,z=(a[2]+b[2]+c[2])/3;
      const n=norm([a[3]+b[3]+c[3],a[4]+b[4]+c[4],a[5]+b[5]+c[5]]);
      const d=smooth(.4,4.4,h);
      const urban=smooth(2,10,12-Math.hypot(x*.73,(z-4)*1.25))*(1-smooth(.5,1.1,h));
      const bright=.79+Math.max(0,dot(n,light))*.36+hash(x,z)*.12;
      const base=[mix(55,123,d),mix(86,128,d),mix(60,95,d)].map((v,k)=>mix(v,[104,107,85][k],urban*.55)*bright);
      const style='rgb('+base.map(Math.round).join(',')+')';
      triangles.push({face,style});
    }
    const lines=new Map();
    function draw(camera,show,selected) {
      ctx.setTransform(canvas.width/camera.width,0,0,canvas.height/camera.height,0,0);
      ctx.fillStyle='#22342d'; ctx.fillRect(0,0,camera.width,camera.height);
      const points=positions.map(p=>project(p,camera));
      const faces=[];
      for(const triangle of triangles){
        const [a,b,c]=triangle.face.map(i=>points[i]);
        if(Math.min(a.depth,b.depth,c.depth)<.12 ||
          Math.min(a.x,b.x,c.x)>camera.width || Math.max(a.x,b.x,c.x)<0 ||
          Math.min(a.y,b.y,c.y)>camera.height || Math.max(a.y,b.y,c.y)<0) continue;
        if((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)>=0) continue;
        faces.push({a,b,c,depth:a.depth+b.depth+c.depth,style:triangle.style});
      }
      faces.sort((a,b)=>b.depth-a.depth);
      for(const {a,b,c,style} of faces){
        ctx.fillStyle=style;ctx.strokeStyle=style;ctx.lineWidth=.65;
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.closePath();
        ctx.fill();ctx.stroke();
      }
      function outline(key,color,width) {
        const segments=lines.get(key)??[];
        ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=width;
        for(let i=0;i<segments.length;i+=2){
          const start=segments[i],end=segments[i+1];
          const a=project(start,camera),b=project(end,camera);
          if(a.depth<.1||b.depth<.1||!visible(camera,start)) continue;
          ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
        }
        ctx.stroke();
      }
      if(show.districts){outline('districts','#a1c8b4a8',1);if(selected)outline(selected,'#f1fbd2',1.8);}
      if(show.park) outline('park','#e8fb90',1.5);
      outline('simulation','#ff9d58',2);
    }
    return {draw,setTracks:(key,value)=>lines.set(key,value)};
  }

  function create({host,canvas,overlay,districts,onCell,onDistrict,onEngine}) {
    let drawing=canvas;
    let renderer;
    try {renderer=makeRenderer(drawing);} catch {renderer=null;}
    function useSoftware() {
      const replacement=document.createElement('canvas');
      replacement.className=drawing.className;
      replacement.setAttribute('aria-hidden','true');
      drawing.replaceWith(replacement);
      drawing=replacement;
      renderer=software(drawing,project);
      if (!renderer) throw Error('No está disponible el dibujo 3D.');
      onEngine('software');
    }
    if (!renderer) useSoftware();
    else onEngine('webgl');

    const tracks=new Map();
    const allDistrictTraces=traces(districts.map(d=>d.geometry),.18);
    const boundsWorld=window.FireAnalysis.union(districts.map(d=>d.box));
    function focus(box,pose,animated=true) {
      const [w,s,e,n]=box;
      const point=position((w+e)/2,(s+n)/2);
      const width=(e-w)*KM_LON, height=(n-s)*KM_LAT;
      const narrow=host.clientWidth/Math.max(1,host.clientHeight)<1.21;
      return move({x:point[0],y:Math.min(1.9,point[1]*.45+.25),z:point[2],
        distance:clamp(Math.max(width*(narrow?1.85:1.13),height*1.14,7.8),8.5,92),
        angle:pose?.angle ?? -.29,tilt:pose?.tilt ?? .79},animated);
    }
    let view={angle:-.29,tilt:.79,distance:33,x:0,y:1,z:-1};
    let animation=null, scheduled=0, active=true, size=[0,0,0], needsDraw=true;
    let options={districts:true,park:true,fires:true,scope:'city'}, data=[], hit=[], picked=null, selection='city';
    let labelLayout=[], fireLayout=[], lastPaint=0;
    const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx=overlay.getContext('2d');
    const labels=districts.map(d=>{
      const [w,s,e,n]=d.box;
      const samples=[[.5,.5],[.43,.55],[.59,.51],[.43,.69],[.59,.69],[.31,.52],[.72,.55],[.48,.3]];
      const p=samples.map(([x,y])=>[mix(w,e,x),mix(s,n,y)])
        .find(c=>window.FireAnalysis.inside(c,d))??[(w+e)/2,(s+n)/2];
      return {id:d.id,coordinate:p};
    });

    function mark() {
      needsDraw=true;
      if(active&&!scheduled) scheduled=requestAnimationFrame(frame);
    }
    function setTrack(key,data) {
      tracks.set(key,data);
      renderer.setTracks(key,data);
    }
    setTrack('districts',allDistrictTraces);
    drawing.addEventListener('webglcontextlost',event=>{
      event.preventDefault();
      useSoftware();
      for(const [key,data] of tracks) renderer.setTracks(key,data);
      size=[0,0,0];
      mark();
    });
    function move(next,animated) {
      if (animated && !reduceMotion) {
        animation={from:{...view},to:{...view,...next},start:performance.now(),ms:540};
      } else {
        animation=null;
        Object.assign(view,next);
      }
      mark();
    }
    function frame(time) {
      scheduled=0;
      if(!active) return;
      const width=host.clientWidth,height=host.clientHeight;
      if(!width||!height) return;
      const factor=Math.min(1.75,window.devicePixelRatio||1);
      if(width!==size[0]||height!==size[1]||factor!==size[2]) {
        for(const c of [drawing,overlay]){c.width=Math.floor(width*factor);c.height=Math.floor(height*factor);}
        size=[width,height,factor];
        needsDraw=true;
      }
      if(animation) {
        const t=clamp((time-animation.start)/animation.ms,0,1);
        for(const key of Object.keys(view)) view[key]=mix(animation.from[key],animation.to[key],smooth(0,1,t));
        needsDraw=true;
        if(t===1) animation=null;
      }
      const camera=cameraFor(view,width,height);
      if(needsDraw){
        renderer.draw(camera,options,selection);
        layout(camera);
      }
      if(needsDraw||time-lastPaint>=32) {
        drawHud(camera,factor,time);
        lastPaint=time;
      }
      needsDraw=false;
      if(animation || (options.fires && data.length && !reduceMotion)) {
        scheduled=requestAnimationFrame(frame);
      }
    }

    function textPlate(label,x,y,color) {
      ctx.font='700 10px "Segoe UI", sans-serif';
      const w=ctx.measureText(label).width+12;
      ctx.fillStyle='#091613d9';
      ctx.beginPath(); ctx.roundRect(x-w/2,y-8,w,17,4); ctx.fill();
      ctx.fillStyle=color; ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(label,x,y+1);
      return w;
    }
    const colors={modis:'#ffc97b',viirs:'#79e2e2',both:'#ff9d6c'};
    function layout(camera) {
      const {width,height}=camera;
      const only=options.scope.startsWith('D');
      labelLayout=[];
      fireLayout=[];
      if(options.districts) {
        for(const item of labels) {
          if(only&&item.id!==options.scope) continue;
          const world=position(...item.coordinate,.46);
          const p=project(world,camera);
          if(p.depth>.1&&p.x>20&&p.x<width-20&&p.y>71&&p.y<height-42&&visible(camera,world)) {
            labelLayout.push({id:item.id,p,only});
          }
        }
      }
      if(options.fires) {
        for(const cell of data) {
          const base=position(cell.lon,cell.lat,.16);
          const altitude=(.38+Math.min(cell.days,8)*.12);
          const top=[base[0],base[1]+altitude,base[2]];
          const ground=project(base,camera), p=project(top,camera);
          if(p.depth<.1||p.x<-16||p.x>width+16||p.y<-16||p.y>height+16||!visible(camera,top)) continue;
          fireLayout.push({cell,ground,p});
        }
      }
      fireLayout.sort((a,b)=>b.p.depth-a.p.depth);
    }
    function drawHud(camera,factor,time) {
      const {width,height}=camera;
      ctx.setTransform(factor,0,0,factor,0,0);
      ctx.clearRect(0,0,width,height);
      hit=[];
      for(const {id,p,only} of labelLayout){
        const w=textPlate(id,p.x,p.y,only?'#f0f8d3':'#c5dbc8');
        hit.push({type:'district',item:id,x:p.x,y:p.y,r:w*.55});
      }
      for(const {cell,p,ground} of fireLayout) {
        const selected=picked===cell.key;
        const wave=reduceMotion?0:Math.sin(time*.0025+cell.lat*25+cell.lon*20);
        const radius=(selected?6.3:3.15)+Math.min(2,cell.days*.25);
        const color=colors[cell.color];
        ctx.strokeStyle=color;ctx.globalAlpha=.68;ctx.lineWidth=1.15;
        ctx.beginPath();ctx.moveTo(ground.x,ground.y);ctx.lineTo(p.x,p.y);ctx.stroke();
        ctx.beginPath();ctx.ellipse(ground.x,ground.y,6.8+Math.max(0,wave)*3,3.3+Math.max(0,wave)*1.3,0,0,Math.PI*2);ctx.stroke();
        ctx.globalAlpha=.22+wave*.07;
        ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,radius+4.5,0,Math.PI*2);ctx.fill();
        ctx.globalAlpha=1;ctx.fillStyle=color;ctx.strokeStyle='#2e2019';ctx.lineWidth=1.45;
        ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
        hit.push({type:'cell',item:cell,x:p.x,y:p.y,r:Math.max(10,radius+4)});
      }
    }

    function movePointer(dx,dy,pan) {
      animation=null;
      if(pan) {
        const k=view.distance*.0017;
        view.x=clamp(view.x-(Math.cos(view.angle)*dx+Math.sin(view.angle)*dy)*k,-36,36);
        view.z=clamp(view.z-(Math.cos(view.angle)*dy-Math.sin(view.angle)*dx)*k,-36,36);
      } else {
        view.angle-=dx*.008;
        view.tilt=clamp(view.tilt+dy*.006,.39,1.48);
      }
      mark();
    }
    function zoom(factor){move({distance:clamp(view.distance*factor,6.5,115)},false);}
    function fit(box=boundsWorld,pose){focus(box,pose,true);}
    const pointers=new Map();
    const span=()=> {
      const [a,b]=[...pointers.values()];
      return Math.hypot(a.x-b.x,a.y-b.y);
    };
    host.addEventListener('pointerdown',e=>{
      if(e.target!==overlay||e.button>0||pointers.size>=2) return;
      animation=null;
      pointers.set(e.pointerId,{startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,moved:false});
      overlay.setPointerCapture(e.pointerId);
    });
    host.addEventListener('pointermove',e=>{
      const pointer=pointers.get(e.pointerId);
      if(!pointer) return;
      const oldSpan=pointers.size===2 ? span() : 0;
      const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
      pointer.x=e.clientX;pointer.y=e.clientY;
      if(oldSpan){
        for(const p of pointers.values()) p.moved=true;
        zoom(clamp(oldSpan/Math.max(1,span()),.88,1.12));
      } else {
        if(Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY)>4) pointer.moved=true;
        if(pointer.moved) movePointer(dx,dy,e.shiftKey);
      }
    });
    function finish(e,cancel=false){
      const pointer=pointers.get(e.pointerId);
      if(!pointer) return;
      if(!cancel&&pointers.size===1&&!pointer.moved){
        const rect=overlay.getBoundingClientRect();
        const x=e.clientX-rect.left,y=e.clientY-rect.top;
        const targets=hit.map(p=>({...p,d:Math.hypot(p.x-x,p.y-y)}))
          .filter(p=>p.d<p.r).sort((a,b)=>a.type===b.type ? a.d-b.d : a.type==='cell' ? -1 : 1);
        const found=targets[0];
        if(found?.type==='cell'){picked=found.item.key;onCell(found.item);}
        else if(found?.type==='district'){picked=null;onDistrict(found.item);}
      }
      pointers.delete(e.pointerId);mark();
    }
    host.addEventListener('pointerup',finish);
    host.addEventListener('pointercancel',e=>finish(e,true));
    overlay.addEventListener('lostpointercapture',e=>pointers.delete(e.pointerId));
    overlay.addEventListener('wheel',e=>{
      e.preventDefault();zoom(Math.exp(clamp(e.deltaY,-140,140)*.0024));
    },{passive:false});
    overlay.addEventListener('keydown',e=>{
      const keys={ArrowLeft:[-19,0],ArrowRight:[19,0],ArrowUp:[0,-13],ArrowDown:[0,13]};
      if(keys[e.key]) movePointer(...keys[e.key],e.shiftKey);
      else if(e.key==='+'||e.key==='=') zoom(.83);
      else if(e.key==='-') zoom(1.20);
      else if(e.key==='Home') fit();
      else return;
      e.preventDefault();
    });
    new ResizeObserver(mark).observe(host);

    return {
      setActive(value){
        active=value;
        if(!active&&scheduled){cancelAnimationFrame(scheduled);scheduled=0;}
        if(active) mark();
      },
      setData(cells,next){
        data=cells;
        options=next;
        if(selection!==next.scope&&next.scope.startsWith('D')){
          const d=districts.find(item=>item.id===next.scope);
          if(d&&!tracks.has(d.id)) setTrack(d.id,traces([d.geometry],.25));
        }
        selection=next.scope;
        if(picked&&!data.some(c=>c.key===picked)) picked=null;
        mark();
      },
      setPark(geometry){
        setTrack('park',traces(geometry,.26));
        mark();
      },
      setSimulation(geometry){
        setTrack('simulation',traces(geometry ? [geometry] : [],.29));
        mark();
      },
      fit, zoom,
      north(){move({angle:0},true);},
      pick(cell){
        picked=cell?.key??null;
        if(cell) onCell(cell);
        mark();
      }
    };
  }

  window.FireTerrain={create,preview:{elevation,position,mesh,project,cameraFor,vert,frag}};
})();
