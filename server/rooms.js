'use strict';
// 아이마다 자기 교실(공간)이 있다. 마음 쉼터의 분위기와 문패가 여기서 정해진다.
//  theme: public/js/world.js 의 THEMES 키 (chrysanthemum 국화 / orchid 난초 / default)
//  grade: 학년. 1학년 교실은 친구와 아이가 조금 더 작다.
const ROOMS = {
  박준선: { who: '형', grade: 5, name: '국화', label: '5학년 국화 반', theme: 'chrysanthemum' },
  박준혁: { who: '동생', grade: 1, name: '난초', label: '1학년 난초 반', theme: 'orchid' },
};

// 알려진 아이가 아니면 아이가 적은 학년/반을 문패로 쓴다
function roomFor(kidName, className = '') {
  const r = ROOMS[kidName];
  if (r) return { ...r };
  return { who: '', grade: 0, name: '', label: String(className || '우리 반').slice(0, 24), theme: 'default' };
}

module.exports = { ROOMS, roomFor };
