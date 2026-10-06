// Isolated visual fixture: npm/node test/skill-preview.mjs, then open port 3012.
// Uses the production markup, styles, game model and animation routines; no account data.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const fixture = `
import {GameUI} from '/js/ui.js';
import {CasinoDuelGame} from '/js/game.js';
import {SPECIALS,getSpecial} from '/js/skills.js';
const ui=new GameUI(), game=new CasinoDuelGame();
document.querySelector('#lobby-screen').classList.remove('is-active');
document.querySelector('#game-screen').classList.add('is-active');
document.querySelector('#game-screen').removeAttribute('aria-hidden');
ui.els['back-lobby'].hidden=true;
const controls=document.createElement('nav');
controls.setAttribute('aria-label','演出確認');
controls.style.cssText='position:fixed;top:0;left:0;right:0;z-index:500;display:flex;flex-wrap:wrap;gap:4px;background:#10090d;padding:4px';
document.body.append(controls);
function reset(id='peek') {
 game.resetRound();game.phase='playing';game.actor='player';game.mode='solo';
 game.player=[{id:'p1',rank:'3',symbol:'♠',suit:'spades'},{id:'p2',rank:'5',symbol:'♥',suit:'hearts'}];
 game.dealer=[{id:'d1',rank:'4',symbol:'♣',suit:'clubs'},{id:'d2',rank:'6',symbol:'♦',suit:'diamonds'}];
 game.deck=[{id:'next',rank:'9',symbol:'♥',suit:'hearts'}];
 game.skills.player=[getSpecial(id),...SPECIALS.filter(s=>s.id!==id).slice(0,2)];
 game.skills.dealer=[getSpecial('double'),getSpecial('lock'),getSpecial('shield')];
 ui.prepareRound(game,run);ui.renderHands(game);ui.renderSpecials(game);ui.setActions(true,'player');
}
async function run(id) {
 controls.hidden=true;ui.setActions(false,'player');
 await ui.showSpecial(getSpecial(id),'player');
 const result=game.applySpecial('player',id,{actorCardId:'p1',opponentCardId:'d1',cardId:'d1'});
 if(id==='shield') await ui.showOpponentSpecialCards(result.revealedSkills,game,'player');
 if(id==='extraDraw') game.discardCard('player','p1');
 ui.renderHands(game);ui.renderSpecials(game);ui.setActions(true,'player');
 controls.hidden=false;
}
function button(label,action) {const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;controls.append(b);}
for(const special of SPECIALS) button('確認 '+special.name,()=>{reset(special.id);run(special.id);});
button('残り3枚',()=>{reset();});
button('残り1枚',()=>{game.skills.player=game.skills.player.slice(0,1);ui.renderSpecials(game);});
ui.els['stand-button'].onclick=()=>{game.stood.player=true;ui.showReservedCard(game,'player');};
ui.els['hit-button'].onclick=()=>{game.hit('player');ui.renderHands(game);ui.renderSpecials(game);};
reset();
`;

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/fixture.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(fixture);
      return;
    }
    const requested = path.resolve(root, `.${url.pathname === "/" ? "/index.html" : url.pathname}`);
    if (!requested.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
    let body = await readFile(requested);
    if (requested.endsWith("index.html")) body = body.toString().replace(/src="\.\/js\/app\.js[^\"]*"/, 'src="/fixture.js"');
    res.setHeader("Content-Type", requested.endsWith(".js") ? "text/javascript" : requested.endsWith(".css") ? "text/css" : "text/html");
    res.setHeader("Cache-Control", "no-store");
    res.end(body);
  } catch { res.writeHead(404).end(); }
}).listen(3012, "127.0.0.1", () => console.log("Skill visual fixture: http://localhost:3012"));
