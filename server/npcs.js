'use strict';
// 마음 쉼터 교실에 나오는 친구와 선생님. 아이마다 따로 있고, 부모님이 만들고 고칠 수 있다.
//  look: 외모 { skin, hair, hairStyle, top, bottom, bottomStyle, glasses }

const ROLES = ['friend', 'teacher'];
const HAIR_STYLES = ['short', 'long', 'bob', 'pony', 'twin', 'bun'];
const BOTTOM_STYLES = ['pants', 'skirt'];
const MAX_NPCS = 12;
const hex = /^#[0-9a-fA-F]{6}$/;

function sanitizeLook(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const key of ['skin', 'hair', 'top', 'bottom']) {
    if (typeof raw[key] !== 'string' || !hex.test(raw[key])) return null;
    out[key] = raw[key].toLowerCase();
  }
  if (!HAIR_STYLES.includes(raw.hairStyle)) return null;
  if (!BOTTOM_STYLES.includes(raw.bottomStyle)) return null;
  out.hairStyle = raw.hairStyle;
  out.bottomStyle = raw.bottomStyle;
  out.glasses = Boolean(raw.glasses);
  return out;
}

const SKIN = '#ffdcc0';
const look = (hair, hairStyle, top, bottom, extra = {}) => ({
  skin: SKIN, hair, hairStyle, top, bottom, bottomStyle: 'pants', glasses: false, ...extra,
});

// {이름} 은 그 교실 주인(아이)의 이름으로 바뀐다
const DEFAULT_FRIENDS = [
  { name: '하늘', look: look('#3b2a20', 'short', '#7ec8ff', '#1f2030'), msg: '숙제 다 끝냈구나! 정말 멋져 ✨' },
  { name: '다온', look: look('#7a4b2a', 'pony', '#ff9ec7', '#1f2030'), msg: '오늘 열심히 한 네 마음이 반짝반짝해 💛' },
  { name: '보리', look: look('#2b2d42', 'short', '#a6e3a1', '#1f2030'), msg: '나랑 같이 천천히 숨 쉬어 볼래? 후~ 🌬️' },
  { name: '이안', look: look('#1f1f2e', 'short', '#c7a6ff', '#1f2030'), msg: '창문 밖 구름 좀 봐. 느릿느릿 가고 있어 ☁️' },
  { name: '소율', look: look('#5a3825', 'bun', '#ffc38a', '#1f2030'), msg: '쉬는 시간엔 눈도 푹 쉬어야 해 😌' },
  { name: '도윤', look: look('#2b2d42', 'short', '#8fd3d9', '#1f2030'), msg: '토끼가 너를 기다리고 있어 🐰' },
  { name: '나래', look: look('#4a2f22', 'twin', '#ff8a8a', '#1f2030'), msg: '칠판에 고마운 마음을 써 보자 ✏️' },
];

// 아이마다 담임·영어 선생님이 다르다. 실제 모습과 다르면 부모님이 고치면 된다.
const DEFAULT_TEACHERS = {
  박준선: [
    { name: '서은미 선생님', look: look('#2b2018', 'bun', '#f2a7c4', '#3b3f58', { bottomStyle: 'skirt' }), msg: '{이름} 덕분에 교실이 환해요. 오늘도 정말 수고했어요 😊' },
    { name: 'Ms. Kimpsey 선생님', look: look('#e0b25a', 'long', '#8ecae6', '#2b2d42', { glasses: true }), msg: 'Great job today! 오늘 정말 잘했어요 🌟' },
  ],
  박준혁: [
    { name: '곽하영 선생님', look: look('#4a2f22', 'bob', '#a6e3a1', '#3b3f58'), msg: '{이름} 덕분에 교실이 환해요. 숙제 끝낸 거 멋져요 😊' },
    { name: 'Mr. Oullete 선생님', look: look('#4a2f22', 'short', '#6c8ebf', '#2b2d42', { glasses: true }), msg: 'Well done! 숙제를 끝내다니 정말 멋져요 👏' },
  ],
};

function defaultNpcs(kidName) {
  const teachers = DEFAULT_TEACHERS[kidName] || [
    { name: '담임 선생님', look: look('#2b2018', 'bun', '#f2a7c4', '#3b3f58', { bottomStyle: 'skirt' }), msg: '오늘도 정말 수고했어요 😊' },
  ];
  return [
    ...teachers.map((t) => ({ role: 'teacher', ...t })),
    ...DEFAULT_FRIENDS.map((f) => ({ role: 'friend', ...f })),
  ];
}

module.exports = { ROLES, MAX_NPCS, sanitizeLook, defaultNpcs };
