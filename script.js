"use strict";
(() => {
const $=id=>document.getElementById(id);
const canvas=$("game");
const ctx=canvas.getContext("2d");
const DEFAULTS={
 mapSize:20,foodCount:1,foodValue:1,startLength:3,speed:100,speedGrowth:0,
 wrap:false,selfCollision:true,grid:false,ghostFood:false,respawn:true,obstacles:0,
 bonusChance:0,goldMultiplier:3,nearMiss:false,perfectBonus:false,theme:"mono",
 snakeStyle:"block",foodStyle:"block"
};
const THEMES={
 mono:{bg:"#000",snake:"#fff",head:"#fff",food:"#fff",bonus:"#fff",grid:"#161616",obstacle:"#555"},
 green:{bg:"#001000",snake:"#54ff54",head:"#b6ffb6",food:"#7dff4f",bonus:"#fff45c",grid:"#103510",obstacle:"#276327"},
 amber:{bg:"#100a00",snake:"#ffbf3f",head:"#ffe29a",food:"#ff9d2e",bonus:"#fff0a0",grid:"#382300",obstacle:"#8b5b1a"},
 ice:{bg:"#001018",snake:"#8de7ff",head:"#e1fbff",food:"#42cfff",bonus:"#fff",grid:"#0d2b36",obstacle:"#37606d"}
};
let settings={...DEFAULTS};
let snake=[],foods=[],obstacles=[],direction={x:1,y:0},queued={x:1,y:0};
let score=0,best=Number(localStorage.getItem("snake-best")||0);
let running=false,paused=false,gameStart=0,elapsed=0,timer=null,lastFrame=0;
let inputQueue=[];
let particles=[],flash=0,toastTimer=null,achievementTimer=null;

let feature={mode:"classic",powerups:false,powerupRate:20,sound:true,music:false,vibration:true,volume:45,reducedMotion:false,largeUI:false,highContrast:false};
let musicTimer=null;
function toggleMusic(on){feature.music=on;if(!on){clearInterval(musicTimer);musicTimer=null;return}if(musicTimer)return;musicTimer=setInterval(()=>{if(feature.sound)featureTone(110+Math.random()*80,.35)},900)}
function featureTone(freq,dur){try{const a=featureTone.ctx||(featureTone.ctx=new (window.AudioContext||window.webkitAudioContext)());const o=a.createOscillator(),g=a.createGain();o.frequency.value=freq;g.gain.value=feature.volume/1000;o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+dur)}catch(e){}}
let stats=JSON.parse(localStorage.getItem("snake-stats")||'{"games":0,"deaths":0,"food":0,"bestLength":0,"bestTime":0,"powerups":0}');
let powerups=[];let powerState={shield:0,multiplier:1};
let nextXFormationId=1;

function featureSave(){localStorage.setItem("snake-feature",JSON.stringify(feature));localStorage.setItem("snake-stats",JSON.stringify(stats))}
function featureLoad(){try{feature={...feature,...JSON.parse(localStorage.getItem("snake-feature")||"{}")}}catch(e){};stats={...stats,...JSON.parse(localStorage.getItem("snake-stats")||"{}")};featureUI()}
function featureUI(){["powerupsEnabled","soundEnabled","musicEnabled","vibrationEnabled","reducedMotion","largeUI","highContrast"].forEach(id=>{const e=$(id);if(e)e.checked=feature[id.replace("Enabled","")]??false});$("gameMode").value=feature.mode;$("powerupRate").value=feature.powerupRate;$("powerupRateVal").textContent=feature.powerupRate+"%";$("volume").value=feature.volume;$("volumeVal").textContent=feature.volume+"%";document.body.classList.toggle("large-ui",feature.largeUI);document.body.classList.toggle("high-contrast",feature.highContrast);document.body.classList.toggle("reduced-motion",feature.reducedMotion);renderStats();renderAchievements();renderPresets()}
function renderStats(){$("statsGrid").innerHTML=Object.entries({Games:stats.games,Deaths:stats.deaths,"Food eaten":stats.food,"Best length":stats.bestLength,"Best time":Math.floor(stats.bestTime)+"s","Power-ups":stats.powerups}).map(([k,v])=>"<div><b>"+v+"</b><span>"+k+"</span></div>").join("")}
function showAchievement(name){const el=$("achievementNotification"),label=$("achievementName");if(!el||!label)return;label.textContent=name;el.classList.remove("show");void el.offsetWidth;el.classList.add("show");clearTimeout(achievementTimer);achievementTimer=setTimeout(()=>el.classList.remove("show"),3000)}
function unlockAchievement(key,name){if(stats[key])return false;stats[key]=true;featureSave();renderAchievements();showAchievement(name);return true}
function renderAchievements(){const a=[["Bush camping",!!stats.bushCamping],["Limp",!!stats.limp],["X marks the spot",!!stats.xMarksTheSpot],["First Bite",stats.food>0],["Century",best>=100],["Long Snake",stats.bestLength>=20],["Dedicated",stats.games>=10],["Survivor",stats.bestTime>=120],["Powered Up",stats.powerups>0]];$("achievements").innerHTML=a.map(x=>"<span class='"+(x[1]?"unlocked":"")+"'>"+(x[1]?"★ ":"☆ ")+x[0]+"</span>").join("")}
function renderPresets(){const p=JSON.parse(localStorage.getItem("snake-presets")||"{}");$("customPresets").innerHTML=Object.keys(p).map(n=>"<button data-custom='"+encodeURIComponent(n)+"'>"+n+"</button>").join("");$("customPresets").querySelectorAll("[data-custom]").forEach(b=>b.onclick=()=>{settings={...DEFAULTS,...p[decodeURIComponent(b.dataset.custom)]};applySettingsToUI();saveSettings();newGame();closeFeatureMenu()})}
function savePreset(){const n=$("presetName").value.trim();if(!n)return;const p=JSON.parse(localStorage.getItem("snake-presets")||"{}");p[n]={...settings};localStorage.setItem("snake-presets",JSON.stringify(p));renderPresets();toast("Preset saved")}
function openFeatureMenu(){$("featureMenu").classList.add("show");renderStats();renderAchievements();renderPresets()}
function closeFeatureMenu(){$("featureMenu").classList.remove("show")}
function applyMode(){if(feature.mode==="endless"){settings.wrap=true;settings.selfCollision=false}else if(feature.mode==="challenge"){settings.obstacles=Math.max(12,settings.obstacles);settings.foodCount=Math.min(3,settings.foodCount)}else if(feature.mode==="survival"){settings.speedGrowth=Math.max(3,settings.speedGrowth)}else if(feature.mode==="timed"){settings.speed=Math.min(90,settings.speed)}}
function featureTick(){if(feature.powerups&&Math.random()*100<feature.powerupRate/4){const p=randomOpenCell();if(p)powerups.push({...p,type:["shield","multiplier","shrink","speed"][rand(4)],life:90})}powerups.forEach(p=>p.life--);powerups=powerups.filter(p=>p.life>0)}
function drawPowerups(){const c=cellSize(),t=THEMES[settings.theme];powerups.forEach(p=>{ctx.fillStyle=t.bonus;ctx.beginPath();ctx.arc((p.x+.5)*c,(p.y+.5)*c,c*.3,0,Math.PI*2);ctx.fill();ctx.fillStyle=t.bg;ctx.font=Math.max(8,c*.28)+"px monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(p.type[0].toUpperCase(),(p.x+.5)*c,(p.y+.5)*c)})}
function collectPowerup(p){const hit=powerups.find(x=>same(x,p));if(!hit)return;powerups=powerups.filter(x=>x!==hit);if(hit.type==="shield")powerState.shield=120;if(hit.type==="multiplier")powerState.multiplier=2;if(hit.type==="shrink")snake.length=Math.max(2,Math.ceil(snake.length/2));if(hit.type==="speed")powerState.speed=120;stats.powerups++;featureSave();toast(hit.type.toUpperCase()+" POWER-UP");if(feature.vibration)navigator.vibrate?.(30)}

function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function rand(n){return Math.floor(Math.random()*n)}
function same(a,b){return a.x===b.x&&a.y===b.y}
function key(p){return p.x+","+p.y}
function readSettings(){
 settings.mapSize=Number($("mapSize").value);
 settings.foodCount=Number($("foodCount").value);
 settings.foodValue=Number($("foodValue").value);
 settings.startLength=Number($("startLength").value);
 settings.speed=Number($("speed").value);
 settings.speedGrowth=Number($("speedGrowth").value);
 settings.wrap=$("wrap").checked;
 settings.selfCollision=$("selfCollision").checked;
 settings.grid=$("grid").checked;
 settings.ghostFood=$("ghostFood").checked;
 settings.respawn=$("respawn").checked;
 settings.obstacles=Number($("obstacles").value);
 settings.bonusChance=Number($("bonusChance").value);
 settings.goldMultiplier=Number($("goldMultiplier").value);
 settings.nearMiss=$("nearMiss").checked;
 settings.perfectBonus=$("perfectBonus").checked;
 settings.theme=$("theme").value;
 settings.snakeStyle=$("snakeStyle").value;
 settings.foodStyle=$("foodStyle").value;
 updateLabels();
 resizeCanvas();
}
function updateLabels(){$("foodCountVal").textContent=settings.foodCount;$("foodValueVal").textContent=settings.foodValue;$("startLengthVal").textContent=settings.startLength;$("speedVal").textContent=settings.speed;$("speedGrowthVal").textContent=settings.speedGrowth+"%";$("obstaclesVal").textContent=settings.obstacles;$("bonusChanceVal").textContent=settings.bonusChance+"%";$("goldMultiplierVal").textContent=settings.goldMultiplier+"×";$("best").textContent=best}
function saveSettings(){localStorage.setItem("snake-settings",JSON.stringify(settings))}
function loadSettings(){try{const saved=JSON.parse(localStorage.getItem("snake-settings")||"null");if(saved)settings={...DEFAULTS,...saved}}catch(e){settings={...DEFAULTS}}applySettingsToUI()}
function applySettingsToUI(){$("mapSize").value=settings.mapSize;$("foodCount").value=settings.foodCount;$("foodValue").value=settings.foodValue;$("startLength").value=settings.startLength;$("speed").value=settings.speed;$("speedGrowth").value=settings.speedGrowth;$("wrap").checked=settings.wrap;$("selfCollision").checked=settings.selfCollision;$("grid").checked=settings.grid;$("ghostFood").checked=settings.ghostFood;$("respawn").checked=settings.respawn;$("obstacles").value=settings.obstacles;$("bonusChance").value=settings.bonusChance;$("goldMultiplier").value=settings.goldMultiplier;$("nearMiss").checked=settings.nearMiss;$("perfectBonus").checked=settings.perfectBonus;$("theme").value=settings.theme;$("snakeStyle").value=settings.snakeStyle;$("foodStyle").value=settings.foodStyle;updateLabels()}
function resizeCanvas(){const side=settings.mapSize;canvas.width=side*30;canvas.height=side*30}
function resetSettings(){settings={...DEFAULTS};applySettingsToUI();saveSettings();newGame();toast("Settings reset")}
function randomize(){const choices={mapSize:[15,20,25,30,35,40],foodCount:rand(12)+1,foodValue:rand(8)+1,startLength:clamp(rand(10)+2,2,20),speed:35+rand(30)*5,speedGrowth:rand(7)*2,wrap:Math.random()<.35,selfCollision:Math.random()<.85,grid:Math.random()<.5,ghostFood:Math.random()<.35,respawn:true,obstacles:rand(16),bonusChance:rand(61),goldMultiplier:2+rand(6),nearMiss:Math.random()<.5,perfectBonus:Math.random()<.5,theme:Object.keys(THEMES)[rand(4)],snakeStyle:["block","dot","outline","scan"][rand(4)],foodStyle:["block","dot","cross","diamond"][rand(4)]};settings={...settings,...choices};applySettingsToUI();saveSettings();newGame();toast("Random modifier set generated")}
function startSnake(){const center=Math.floor(settings.mapSize/2);snake=[];for(let i=0;i<settings.startLength;i++)snake.push({x:center-i,y:center});direction={x:1,y:0};queued={x:1,y:0}}
function cellAvailable(p){if(p.x<0||p.x>=settings.mapSize||p.y<0||p.y>=settings.mapSize)return false;if(snake.some(s=>same(s,p)))return false;if(obstacles.some(o=>same(o,p)))return false;if(foods.some(f=>same(f,p)))return false;return true}
function randomOpenCell(){const total=settings.mapSize*settings.mapSize;for(let tries=0;tries<total*2;tries++){const p={x:rand(settings.mapSize),y:rand(settings.mapSize)};if(cellAvailable(p))return p}return null}
function buildObstacles(){obstacles=[];const wanted=settings.obstacles;let attempts=0;while(obstacles.length<wanted&&attempts<wanted*30){attempts++;const p=randomOpenCell();if(!p)break;const center=Math.floor(settings.mapSize/2);if(Math.abs(p.x-center)<3&&Math.abs(p.y-center)<2)continue;obstacles.push(p)}}
function spawnXFormation(){
 const offsets=[{x:-1,y:-1},{x:0,y:0},{x:1,y:1},{x:-1,y:1},{x:1,y:-1}];
 const centers=[];
 for(let x=1;x<settings.mapSize-1;x++)for(let y=1;y<settings.mapSize-1;y++){
  const cells=offsets.map(o=>({x:x+o.x,y:y+o.y}));
  if(cells.every(cellAvailable))centers.push({x,y,cells});
 }
 if(!centers.length)return false;
 const formation=centers[rand(centers.length)];
 const id=nextXFormationId++;
 formation.cells.forEach(p=>foods.push({x:p.x,y:p.y,bonus:false,value:settings.foodValue,phase:Math.random()*Math.PI*2,xFormationId:id}));
 return true;
}
function spawnFood(forceBonus=false){
 const shouldTryX=!forceBonus&&!foods.some(f=>f.xFormationId)&&Math.floor(Math.random()*200)===0;
 if(shouldTryX&&spawnXFormation())return;
 const p=randomOpenCell();if(!p)return;
 const bonus=forceBonus||Math.random()*100<settings.bonusChance;
 foods.push({x:p.x,y:p.y,bonus,value:bonus?settings.foodValue*settings.goldMultiplier:settings.foodValue,phase:Math.random()*Math.PI*2});
}
function fillFood(){const target=Math.min(settings.foodCount,settings.mapSize*settings.mapSize-1);while(foods.length<target)spawnFood()}

function newGame(){
 applyMode();powerups=[];powerState={shield:0,multiplier:1};
 stopTimer();readSettings();startSnake();buildObstacles();foods=[];nextXFormationId=1;fillFood();spawnBushCampingFood();score=0;elapsed=0;particles=[];flash=0;inputQueue=[];running=true;paused=false;gameStart=performance.now();stats.games++;featureSave();updateHUD();draw();startTimer();
}
function startTimer(){stopTimer();timer=setInterval(tick,getTickRate())}
function stopTimer(){if(timer){clearInterval(timer);timer=null}}
function getTickRate(){const growth=Math.pow(1-settings.speedGrowth/100,score);return Math.max(18,Math.round(settings.speed*growth))}
function restartTimerIfNeeded(){if(running&&!paused)startTimer()}
function queueDirection(x,y){if(!running)return;const base=inputQueue.length?inputQueue[inputQueue.length-1]:queued;if(x===-base.x&&y===-base.y)return;if(x===base.x&&y===base.y)return;if(inputQueue.length<3)inputQueue.push({x,y})}
function consumeDirection(){if(inputQueue.length)queued=inputQueue.shift();direction=queued}
function nextHead(){let p={x:snake[0].x+direction.x,y:snake[0].y+direction.y};if(settings.wrap){p.x=(p.x+settings.mapSize)%settings.mapSize;p.y=(p.y+settings.mapSize)%settings.mapSize}return p}
function hitsWall(p){return !settings.wrap&&(p.x<0||p.x>=settings.mapSize||p.y<0||p.y>=settings.mapSize)}
function hitsSelf(p){if(!settings.selfCollision)return false;const eating=foods.some(f=>same(f,p));const limit=eating?snake.length:snake.length-1;for(let i=0;i<limit;i++)if(same(snake[i],p))return true;return false}
function hitsObstacle(p){return obstacles.some(o=>same(o,p))}
function eatAt(p){const eaten=foods.filter(f=>same(f,p));if(!eaten.length)return 0;let gained=0;eaten.forEach(f=>{gained+=f.value;burst(f.x,f.y,f.bonus?12:7,f.bonus)});foods=foods.filter(f=>!same(f,p));return gained}

function spawnBushCampingFood(){
 if(stats.bushCamping)return null;
 const candidates=[];
 for(let x=0;x<settings.mapSize;x++){
  for(let y=0;y<settings.mapSize;y++){
   const p={x,y};
   if(cellAvailable(p))candidates.push(p);
  }
 }
 if(!candidates.length)return null;
 const pointNumber=rand(Math.min(20,candidates.length));
 const p=candidates[pointNumber];
 const marker={x:p.x,y:p.y,bushCamping:true,bonus:false,value:0,phase:0,pointNumber:pointNumber+1};
 foods.push(marker);
 return marker;
}

function tick(){
 if(!running||paused)return;
 consumeDirection();featureTick();powerState.shield=Math.max(0,powerState.shield-1);powerState.multiplier=powerState.multiplier>1?Math.max(1,powerState.multiplier-.01):1;
 const head=nextHead();collectPowerup(head);
 if((hitsWall(head)||hitsSelf(head)||hitsObstacle(head))&&powerState.shield<=0){gameOver("Game Over");return}
 const bush=foods.find(f=>f.bushCamping&&same(f,head));
 if(bush){
  foods=foods.filter(f=>f!==bush);
  unlockAchievement("bushCamping","Bush camping");
  window.location.href="http://scratch.mit.edu/projects/1013099217/";
  return;
 }
 const xFood=eatAt(head);
 const completedX=xFood>0&&foods.every(f=>!f.xFormationId||f.xFormationId!==xFood);
 const gained=xFood;
 if(completedX)unlockAchievement("xMarksTheSpot","X marks the spot");
 snake.unshift(head);
 if(gained>0){
  score+=Math.round(gained*powerState.multiplier);stats.food++;featureSave();
  if(settings.perfectBonus&&foods.length===0)score+=settings.foodValue;
  if(settings.respawn)fillFood();flash=1;restartTimerIfNeeded();
 }else snake.pop();
 if(settings.nearMiss)nearMissCheck(head);
 elapsed=(performance.now()-gameStart)/1000;updateHUD();draw();
}
function nearMissCheck(head){const neighbors=[{x:head.x+1,y:head.y},{x:head.x-1,y:head.y},{x:head.x,y:head.y+1},{x:head.x,y:head.y-1}];const danger=neighbors.some(p=>snake.some((s,i)=>i>0&&same(p,s))||obstacles.some(o=>same(p,o)));if(danger&&Math.random()<.12){score+=1;toast("Near-miss +1")}}
function gameOver(reason){stats.deaths++;stats.bestLength=Math.max(stats.bestLength,snake.length);stats.bestTime=Math.max(stats.bestTime,elapsed);featureSave();running=false;paused=false;stopTimer();if(score>best){best=score;localStorage.setItem("snake-best",String(best))}$("message").textContent=reason;$("finalScore").textContent=score;$("finalLength").textContent=snake.length;$("overlay").classList.add("show");updateHUD();draw()}
function togglePause(){if(!running)return;paused=!paused;if(paused){stopTimer();$("message").textContent="Paused";$("finalScore").textContent=score;$("finalLength").textContent=snake.length;$("overlay").classList.add("show")}else{$("overlay").classList.remove("show");gameStart=performance.now()-elapsed*1000;startTimer()}}
function updateHUD(){$("score").textContent=score;$("length").textContent=snake.length;$("best").textContent=best;const total=Math.floor(elapsed);const m=Math.floor(total/60);const s=String(total%60).padStart(2,"0");$("time").textContent=m+":"+s}
function clearBoard(){const t=THEMES[settings.theme];ctx.fillStyle=t.bg;ctx.fillRect(0,0,canvas.width,canvas.height)}
function cellSize(){return canvas.width/settings.mapSize}
function drawGrid(){if(!settings.grid)return;const t=THEMES[settings.theme],c=cellSize();ctx.strokeStyle=t.grid;ctx.lineWidth=1;for(let i=1;i<settings.mapSize;i++){const p=Math.round(i*c)+.5;ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p,canvas.height);ctx.stroke();ctx.beginPath();ctx.moveTo(0,p);ctx.lineTo(canvas.width,p);ctx.stroke()}}
function drawObstacles(){const t=THEMES[settings.theme],c=cellSize();ctx.fillStyle=t.obstacle;obstacles.forEach(o=>{const x=o.x*c,y=o.y*c;ctx.fillRect(x+c*.12,y+c*.12,c*.76,c*.76);ctx.fillStyle=t.bg;ctx.fillRect(x+c*.28,y+c*.28,c*.44,c*.44);ctx.fillStyle=t.obstacle})}
function drawFood(){const t=THEMES[settings.theme],c=cellSize(),now=performance.now()/160;foods.forEach(f=>{if(settings.ghostFood&&Math.sin(now+f.phase)<-.25)return;const x=f.x*c,y=f.y*c;ctx.fillStyle=f.bushCamping?"#198754":f.bonus?t.bonus:t.food;const inset=c*.18;if(f.bushCamping){ctx.beginPath();ctx.arc(x+c/2,y+c*.38,c*.22,0,Math.PI*2);ctx.arc(x+c*.32,y+c*.58,c*.2,0,Math.PI*2);ctx.arc(x+c*.68,y+c*.58,c*.2,0,Math.PI*2);ctx.fill();ctx.fillRect(x+c*.43,y+c*.48,c*.14,c*.3);return}if(settings.foodStyle==="dot"){ctx.beginPath();ctx.arc(x+c/2,y+c/2,c*.28,0,Math.PI*2);ctx.fill()}else if(settings.foodStyle==="cross"){ctx.fillRect(x+c*.35,y+c*.12,c*.3,c*.76);ctx.fillRect(x+c*.12,y+c*.35,c*.76,c*.3)}else if(settings.foodStyle==="diamond"){ctx.beginPath();ctx.moveTo(x+c/2,y+inset);ctx.lineTo(x+c-inset,y+c/2);ctx.lineTo(x+c/2,y+c-inset);ctx.lineTo(x+inset,y+c/2);ctx.closePath();ctx.fill()}else ctx.fillRect(x+inset,y+inset,c-inset*2,c-inset*2)})}
function drawSnake(){const t=THEMES[settings.theme],c=cellSize();snake.forEach((p,i)=>{const x=p.x*c,y=p.y*c,isHead=i===0;ctx.fillStyle=isHead?t.head:t.snake;if(settings.snakeStyle==="dot"){ctx.beginPath();ctx.arc(x+c/2,y+c/2,c*(isHead?.38:.31),0,Math.PI*2);ctx.fill()}else if(settings.snakeStyle==="outline"){ctx.strokeStyle=t.snake;ctx.lineWidth=Math.max(1,c*.1);ctx.strokeRect(x+c*.13,y+c*.13,c*.74,c*.74)}else if(settings.snakeStyle==="scan"){ctx.fillRect(x+c*.1,y+c*.15,c*.8,c*.7);ctx.fillStyle=t.bg;ctx.fillRect(x+c*.1,y+c*.48,c*.8,Math.max(1,c*.07))}else{const pad=isHead?c*.06:c*.1;ctx.fillRect(x+pad,y+pad,c-pad*2,c-pad*2)}if(isHead)drawEyes(p,c)})}
function drawEyes(p,c){const t=THEMES[settings.theme],x=p.x*c,y=p.y*c;ctx.fillStyle=t.bg;const eye=c*.1;if(direction.x!==0){const ex=direction.x>0?x+c*.7:x+c*.2;ctx.fillRect(ex,y+c*.25,eye,eye);ctx.fillRect(ex,y+c*.65,eye,eye)}else{const ey=direction.y>0?y+c*.7:y+c*.2;ctx.fillRect(x+c*.25,ey,eye,eye);ctx.fillRect(x+c*.65,ey,eye,eye)}}
function drawParticles(){const t=THEMES[settings.theme];particles.forEach(p=>{ctx.globalAlpha=p.life;ctx.fillStyle=p.bonus?t.bonus:t.food;ctx.fillRect(p.x,p.y,p.size,p.size)});ctx.globalAlpha=1}
function draw(){clearBoard();if(!feature.reducedMotion)animateBackground(performance.now());drawGrid();drawObstacles();drawFood();drawPowerups();drawSnake();drawParticles();if(flash>0){ctx.globalAlpha=flash*.12;ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.globalAlpha=1;flash=Math.max(0,flash-.08)}}
function burst(cx,cy,count,bonus){const c=cellSize();for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,speed=1+Math.random()*3;particles.push({x:(cx+.5)*c,y:(cy+.5)*c,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,size:Math.max(1,c*.08+Math.random()*c*.08),life:1,bonus})}}
function animateBackground(time){const t=THEMES[settings.theme],w=canvas.width,h=canvas.height;ctx.save();ctx.globalAlpha=.18;const spacing=Math.max(36,cellSize()*2.2),drift=(time*.018)%spacing;ctx.strokeStyle=t.grid;ctx.lineWidth=1;for(let x=-spacing+drift;x<w+spacing;x+=spacing){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x-spacing,h);ctx.stroke()}for(let y=-spacing+drift;y<h+spacing;y+=spacing){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y-spacing);ctx.stroke()}const glowRadius=Math.max(w,h)*.38,pulse=.5+.5*Math.sin(time*.0015),gradient=ctx.createRadialGradient(w*.5,h*.5,0,w*.5,h*.5,glowRadius);gradient.addColorStop(0,t.snake);gradient.addColorStop(1,t.bg);ctx.globalAlpha=.035+.02*pulse;ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);ctx.restore()}
function animateParticles(){particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.life-=.035});particles=particles.filter(p=>p.life>0);if(particles.length||flash>0)draw();requestAnimationFrame(animateParticles)}
function toast(text){const el=$("toast");el.textContent=text;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),1300)}
function bindRange(id,rerun){$(id).addEventListener("input",()=>{readSettings();saveSettings();if(rerun)restartTimerIfNeeded()})}
function bindSetting(id,rerun){$(id).addEventListener("change",()=>{readSettings();saveSettings();if(rerun)restartTimerIfNeeded()})}
function bindAll(){
 $("closeFeatureMenu").onclick=closeFeatureMenu;document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>document.querySelectorAll("[data-panel]").forEach(p=>p.hidden=p.dataset.panel!==b.dataset.tab));$("savePreset").onclick=savePreset;$("fullscreen").onclick=()=>document.documentElement.requestFullscreen?.();$("clearStats").onclick=()=>{stats={games:0,deaths:0,food:0,bestLength:0,bestTime:0,powerups:0};featureSave();renderStats();renderAchievements()};$("resetAchievements").onclick=()=>{stats.bushCamping=false;stats.limp=false;stats.xMarksTheSpot=false;featureSave();renderAchievements();toast("Achievements reset")};document.querySelectorAll("[data-preset]").forEach(b=>b.onclick=()=>{const p=b.dataset.preset;settings={...DEFAULTS};if(p==="chaos"){settings.foodCount=8;settings.obstacles=10;settings.bonusChance=40;settings.speed=60;settings.wrap=true}else if(p==="speedrun"){settings.speed=45;settings.speedGrowth=5}else if(p==="maze"){settings.obstacles=20;settings.mapSize=30}else if(p==="zen"){settings.speed=160;settings.wrap=true;settings.selfCollision=false;settings.foodCount=3}applySettingsToUI();saveSettings();newGame();closeFeatureMenu()});
 $("gameMode").onchange=e=>{feature.mode=e.target.value;featureSave()};$("powerupsEnabled").onchange=e=>{feature.powerups=e.target.checked;featureSave()};$("powerupRate").oninput=e=>{feature.powerupRate=+e.target.value;$("powerupRateVal").textContent=e.target.value+"%";featureSave()};$("soundEnabled").onchange=e=>{feature.sound=e.target.checked;featureSave()};$("musicEnabled").onchange=e=>{toggleMusic(e.target.checked);featureSave()};$("vibrationEnabled").onchange=e=>{feature.vibration=e.target.checked;featureSave()};$("volume").oninput=e=>{feature.volume=+e.target.value;$("volumeVal").textContent=e.target.value+"%";featureSave()};["reducedMotion","largeUI","highContrast"].forEach(id=>$(id).onchange=e=>{feature[id]=e.target.checked;document.body.classList.toggle(id==="largeUI"?"large-ui":id==="highContrast"?"high-contrast":"reduced-motion",e.target.checked);featureSave()});
 bindRange("foodCount",false);bindRange("foodValue",false);bindRange("startLength",false);bindRange("speed",true);bindRange("speedGrowth",true);bindRange("obstacles",false);bindRange("bonusChance",false);bindRange("goldMultiplier",false);
 ["mapSize","wrap","selfCollision","grid","ghostFood","respawn","nearMiss","perfectBonus","theme","snakeStyle","foodStyle"].forEach(id=>bindSetting(id,false));
 $("start").addEventListener("click",newGame);$("restart").addEventListener("click",()=>{$("overlay").classList.remove("show");newGame()});$("dismiss").addEventListener("click",()=>{$("overlay").classList.remove("show")});$("pause").addEventListener("click",togglePause);$("random").addEventListener("click",randomize);$("reset").addEventListener("click",resetSettings);document.addEventListener("keydown",onKey);
}
function isMobileDevice(){return window.matchMedia("(pointer: coarse)").matches||/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)}
function setupMobileControls(){if(!isMobileDevice())return;document.body.classList.add("mobile-device");const pad=document.createElement("div");pad.id="mobileControls";pad.setAttribute("aria-label","Mobile snake controls");pad.innerHTML='<button data-dir="up" aria-label="Up">▲</button><div><button data-dir="left" aria-label="Left">◀</button><button data-dir="down" aria-label="Down">▼</button><button data-dir="right" aria-label="Right">▶</button></div>';document.body.appendChild(pad);const directions={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};pad.querySelectorAll("button").forEach(button=>{const press=e=>{e.preventDefault();const d=directions[button.dataset.dir];queueDirection(d[0],d[1])};button.addEventListener("pointerdown",press,{passive:false});button.addEventListener("touchstart",press,{passive:false})});let startX=0,startY=0;canvas.addEventListener("touchstart",e=>{if(e.touches.length!==1)return;startX=e.touches[0].clientX;startY=e.touches[0].clientY;e.preventDefault()},{passive:false});canvas.addEventListener("touchend",e=>{if(!startX&&!startY)return;const dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;startX=startY=0;if(Math.max(Math.abs(dx),Math.abs(dy))<24)return;if(Math.abs(dx)>Math.abs(dy))queueDirection(dx>0?1:-1,0);else queueDirection(0,dy>0?1:-1);e.preventDefault()},{passive:false})}
function onKey(e){if(e.target&&e.target.matches&&e.target.matches("input,select,textarea"))return;const k=e.key.toLowerCase();if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k))e.preventDefault();if(k==="arrowup"||k==="w")queueDirection(0,-1);else if(k==="arrowdown"||k==="s")queueDirection(0,1);else if(k==="arrowleft"||k==="a")queueDirection(-1,0);else if(k==="arrowright"||k==="d")queueDirection(1,0);else if(k===" ")togglePause();else if(k==="enter"&&!running){$("overlay").classList.remove("show");newGame()}else if(k==="r")randomize()}
document.addEventListener("keydown",e=>{if(e.key===";"){e.preventDefault();$("featureMenu").classList.contains("show")?closeFeatureMenu():openFeatureMenu()}});

function triggerLimp(){if(running)stopTimer();running=false;paused=false;unlockAchievement("limp","Limp");const overlay=$("overlay");if(overlay)overlay.classList.remove("show");const limp=$("limpOverlay");if(limp){limp.classList.add("show");limp.setAttribute("aria-hidden","false")}}
function setupSecretCode(){const input=$("codeInput"),limp=$("limpOverlay"),restart=$("limpRestart");if(!input||!limp||!restart)return;input.addEventListener("keydown",e=>{if(e.key!=="Enter")return;e.preventDefault();if(input.value.trim().toLowerCase()==="limp")triggerLimp();input.value=""});restart.addEventListener("click",()=>{limp.classList.remove("show");limp.setAttribute("aria-hidden","true");newGame()})}

function safeLoad(){featureLoad();loadSettings();readSettings()}
safeLoad();
bindAll();
setupSecretCode();
newGame();
animateParticles();
})();
