'use strict';
// 마음 쉼터 넓히기: 마음 별로 새 공간을 하나씩 산다 (앞 공간을 열어야 다음 공간이 열린다).
// 별은 마음 쉼터를 다녀올 때마다 쌓이고(users.tour_stars), 쓴 별은 users.tour_spent 에, 연 공간은 users.world_unlocked 에 쉼표로 적는다.
// 공간 모양(복도·화장실·계단)은 public/js/schoolhall.js 가 id 로 만든다. 이 목록의 id 가 둘을 잇는다.

const CATALOG = [
  { id: 'hall1', name: '복도', icon: '🚪', cost: 10, needs: '' },
  { id: 'hall2', name: '복도 2', icon: '🏫', cost: 20, needs: 'hall1' },
  { id: 'wc', name: '화장실', icon: '🚻', cost: 30, needs: 'hall2' },
  { id: 'stairs', name: '2층 계단', icon: '🪜', cost: 45, needs: 'wc' },
];
const IDS = CATALOG.map((c) => c.id);

// 저장된 글에서 열린 공간을 읽는다 (모르는 id 는 버리고, 목록 순서로 돌려준다)
const parseUnlocked = (text) => {
  const have = String(text || '').split(',');
  return IDS.filter((id) => have.includes(id));
};
const serialize = (ids) => IDS.filter((id) => ids.includes(id)).join(',');

function publicWorld(u) {
  const earned = u.tour_stars || 0;
  const spent = u.tour_spent || 0;
  return {
    stars: Math.max(0, earned - spent), // 지금 쓸 수 있는 별
    earned,
    spent,
    unlocked: parseUnlocked(u.world_unlocked),
    catalog: CATALOG,
  };
}

// 이 공간을 살 수 있는지: { item } 또는 { error, status }
function checkBuy(u, id) {
  const item = CATALOG.find((c) => c.id === id);
  if (!item) return { error: '그런 공간은 없어요', status: 404 };
  const w = publicWorld(u);
  if (w.unlocked.includes(id)) return { error: '이미 열려 있어요 🎉', status: 409 };
  if (item.needs && !w.unlocked.includes(item.needs)) {
    const before = CATALOG.find((c) => c.id === item.needs);
    return { error: `먼저 앞 공간(${before.name})을 열어야 해요`, status: 400 };
  }
  if (w.stars < item.cost) return { error: `별이 ${item.cost - w.stars}개 모자라요`, status: 400 };
  return { item, world: w };
}

module.exports = { CATALOG, IDS, parseUnlocked, serialize, publicWorld, checkBuy };
