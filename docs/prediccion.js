/* Evaluación y geometría de propagación del simulador de campo. */
(() => {
  'use strict';
  const cover = {bosque:[4,.045],pastizal:[12,.08],mixta:[8,.0625]};
  const levels = ['Bajo','Medio','Alto','Crítico'];
  const rad = Math.PI/180;

  function assess({temperature,humidity,wind,nearby}) {
    const z=.12*(temperature-30)-.08*(humidity-40)+.03*(wind-15)+.5*nearby-.04*60-1.2;
    const score=Math.round(1000/(1+Math.exp(-z)))/10;
    return {score,level:levels[score<20?0:score<40?1:score<70?2:3]};
  }

  function spread(origin,hours,input) {
    const [b,k]=cover[input.cover];
    const ros=b*Math.max(.1,1-(input.humidity-10)/88)*(1+k*input.wind)*
      Math.max(.5,1+.02*(input.temperature-30))*Math.max(.15,1-.03*input.rain);
    const a=ros*30*(6+hours);
    const width=a/Math.min(1+.12*input.wind,6);
    const bearing=input.bearing*rad;
    const coords=Array.from({length:48},(_,i)=>{
      const theta=i/48*2*Math.PI;
      const shape=1+.1*Math.sin(3*theta+1.3)+.07*Math.sin(5*theta+.4)+.04*Math.sin(9*theta);
      const x=a*(1+Math.cos(theta)*shape), y=width*Math.sin(theta)*shape;
      const dx=x*Math.sin(bearing)+y*Math.cos(bearing);
      const dy=x*Math.cos(bearing)-y*Math.sin(bearing);
      return [origin.lon+dx/(111320*Math.cos(origin.lat*rad)),origin.lat+dy/110574];
    });
    coords.push(coords[0]);
    return {area:Math.PI*a*width/1e4,geometry:{type:'Polygon',coordinates:[coords]}};
  }
  window.FireAssessment={assess,spread};
})();
