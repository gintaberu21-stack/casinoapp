import { numberColor } from './roulette.js';

const examples = {
  A: [5], B: [6,9], C: [10,11,12], D: [13,14,16,17], E: [0,'00',1,2,3], F: [19,20,21,22,23,24],
  G: Array.from({length:12},(_,i)=>(i+1)*3-1), H: Array.from({length:12},(_,i)=>i+25),
  I: Array.from({length:18},(_,i)=>i+19), J: Array.from({length:18},(_,i)=>i*2+1),
  K: Array.from({length:36},(_,i)=>i+1).filter(n=>numberColor(n)==='black'),
};
function diagram(letter = null) {
  const cell = (x,y,w,h,label,color='green',hit=false) => `<g class="guide-cell ${color} ${hit?'guide-hit':''}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/><text x="${x+w/2}" y="${y+h/2}" dominant-baseline="central" text-anchor="middle">${label}</text></g>`;
  let body = cell(12,12,42,54,'00','green',examples[letter]?.includes('00')) + cell(12,66,42,54,0,'green',examples[letter]?.includes(0));
  for(let c=0;c<12;c++) for(let r=0;r<3;r++) {
    const n=c*3+3-r;
    body+=cell(54+c*42,12+r*36,42,36,n,numberColor(n),examples[letter]?.includes(n));
  }
  for(let r=0;r<3;r++) body+=cell(558,12+r*36,42,36,'2:1');
  for(let i=0;i<3;i++) body+=cell(54+i*168,120,168,34,['1st 12','2nd 12','3rd 12'][i]);
  for(let i=0;i<6;i++) body+=cell(54+i*84,154,84,34,['1–18','EVEN','RED','BLACK','ODD','19–36'][i],i===2?'red':i===3?'black':'green');
  if(!letter) {
    const markers=[['A',117,66],['B',138,30],['C',201,120],['D',264,84],['E',54,120],['F',348,120],['G',579,66],['H',474,137],['I',516,171],['J',432,171],['K',348,171]];
    body+=markers.map(([key,x,y])=>`<g class="guide-marker ${key<'G'?'inside':'outside'}"><circle cx="${x}" cy="${y}" r="10"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central">${key}</text></g>`).join('');
  }
  return `<svg class="bet-guide-svg ${letter?'mini-guide':''}" viewBox="0 0 612 200" role="img" aria-label="${letter?`${letter}：黄色い枠の数字が当たりの対象`:'ベットの位置を示すAからKの図'}">${body}</svg>`;
}
const inside = [
  ['A', 'ストレートアップ', '数字ひとつ', '36倍', '例：5に置くと、5が出たら当たり。', true],
  ['B', 'スプリット', '隣り合う2数字', '18倍', '例：6と9の境界線に置くと、6・9のどちらかで当たり。', true],
  ['C', 'ストリート／トリプル', '横一列の3数字', '12倍', '例：10・11・12の列に置くと、その3数字のいずれかで当たり。テーブルの表示方向によって列の向きは変わります。', true],
  ['D', 'コーナー／フォー', '隣接する4数字', '9倍', '例：13・14・16・17が接する角に置くと、その4数字のいずれかで当たり。', true],
  ['E', 'ファイブナンバー', '0・00・1・2・3', '7倍', '0・00・1・2・3の5数字のいずれかで当たり。', true],
  ['F', 'ライン', '隣接する2列の6数字', '6倍', '例：19〜24に置くと、その6数字のいずれかで当たり。', true],
];
const outside = [
  ['G', 'コラム', '同じ列の12数字', '3倍', 'テーブル右端の「2:1」に置きます。例：2・5・8・…・35の12数字。', true],
  ['H', 'ダズン', '12数字ずつの範囲', '3倍', '1st 12＝1〜12、2nd 12＝13〜24、3rd 12＝25〜36。', true],
  ['I', 'ロウ／ハイ', '前半か後半の18数字', '2倍', '1〜18、または19〜36のどちらかを選びます。', true],
  ['J', 'イーブン／オッド', '偶数か奇数の18数字', '2倍', 'EVEN＝偶数、ODD＝奇数。0・00はどちらにも入りません。', true],
  ['K', 'レッド／ブラック', '赤か黒の18数字', '2倍', 'RED＝赤、BLACK＝黒。数字の背景色で判定します。0・00の緑は含みません。', true],
];
function cards(items) {
  return items.map(([letter, name, coverage, multiplier, example]) => `<article class="bet-help-card"><span class="bet-help-letter">${letter}</span><div><h4>${name}</h4><p class="bet-help-coverage">${coverage}<strong>${multiplier}</strong></p>${diagram(letter)}<p>${example}</p></div></article>`).join('');
}
export const ROULETTE_HELP = `
  <button class="close" type="button" aria-label="閉じる">×</button>
  <p class="eyebrow">BETTING GUIDE</p><h2 id="roulette-help-title">ルーレットの賭け方</h2>
  <p class="bet-help-intro">数字を直接狙う「インサイドベット」と、色や範囲を選ぶ「アウトサイドベット」があります。参考画像と同じA〜Kで説明します。</p>
  <figure class="bet-guide-overview">${diagram()}<figcaption>黄色のA〜F：数字や境界に賭ける ／ 青色のG〜K：列・範囲・色に賭ける</figcaption></figure>
  <p class="help-section-note">各説明の小さな図では、黄色い枠の数字が当たりの対象です。図は配置の説明用です。B〜Fは画面下の「組み合わせで賭ける」から置けます。</p>
  <section class="help-steps" aria-label="基本操作"><h3>チップの置き方</h3><ol><li>ブラックジャックと共通の赤100・青500・黒1,000のチップを選びます。</li><li>数字や外側の範囲はテーブルを押して置きます。数字は同じ場所をもう一度押すと取り消せます。B〜Fは「組み合わせで賭ける」で賭け方と対象の数字を選び、「PTを置く」を押します。外側や組み合わせへの追加、複数箇所へのベットもできます。</li><li>合計ベットを確認して「SPIN」で回します。回転中は変更できません。</li></ol><p>「戻す」は直前の1枚を取り消し、「クリア」は全ベットを取り消します。</p></section>
  <div class="bet-help-columns"><section><h3>インサイドベット</h3><p class="help-section-note">数字、数字の境界線、交点に置く賭け方</p>${cards(inside)}</section><section><h3>アウトサイドベット</h3><p class="help-section-note">テーブル外側の列・範囲・色に置く賭け方</p>${cards(outside)}</section></div>
`;
