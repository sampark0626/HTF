// 우리 반 약속: 칠판 구석에 적히고, 말썽 부리는 친구를 타이를 때 힌트가 된다.
//  - 마음 쉼터에서 친구가 가끔 약속을 어긴다 (뛰어다니기, 나쁜 말, 장난치기, 선생님 말씀 안 듣기)
//  - 아이가 그 친구를 찾아가 다정하게 말해 주면 별을 받는다. 알맞은 말은 칠판의 약속과 같은 뜻이다.
//  - 말썽 장면은 schoolroom.js, 타이르는 화면은 world.js, 칠판 그림은 board.js 가 쓴다.
import { pick } from './world-shared.js';

// id: 말썽 종류 / icon: 약속 그림 / board: 칠판에 적히는 약속 / alert: 친구가 하고 있는 일
// fix: 타이르는 알맞은 말 / apology: 타이르면 친구가 하는 대답 / lines: 말썽 부리는 친구가 하는 말
export const RULES = [
  {
    id: 'run', icon: '🏃', board: '교실에서 뛰지 않아요', alert: '교실에서 뛰고 있어요',
    fix: '교실에서는 걸어 다녀요 🚶', apology: '앗, 미안해! 걸어 다닐게 🚶',
    lines: ['와~ 나 잡아 봐라!', '헉헉… 더 빨리!', '휙휙~ 빠르다!'],
  },
  {
    id: 'bad', icon: '🙊', board: '나쁜 말 금지', alert: '나쁜 말을 하고 있어요',
    fix: '예쁜 말을 써요 💛', apology: '미안해… 예쁜 말 쓸게 💛',
    lines: ['💢 #@$%&!', '😤 !@#$%…!', '💢 &%$#@!!'],
  },
  {
    id: 'tease', icon: '🤝', board: '친구에게 장난치지 않아요', alert: '친구에게 장난치고 있어요',
    fix: '친구가 싫어해요, 장난은 그만! 🛑', apology: '앗, 미안해! 장난 안 칠게 🙏',
    lines: ['킥킥 😜', '메롱~ 😝', '콕콕! 히히 😆'], victimLines: ['하지 마~ 😣', '싫어! 그만해 😖'],
  },
  {
    id: 'ignore', icon: '👂', board: '선생님 말씀을 잘 들어요', alert: '선생님 말씀을 안 듣고 있어요',
    fix: '선생님 말씀을 잘 들어요 👂', apology: '네, 선생님! 잘 들을게요 🙋',
    lines: ['싫어요~ 🙉', '몰라요~ 😝', '안 들려요~ 🙈'], teacherLines: ['자리에 앉아 줄래요?', '선생님 말씀 들어 보세요 🙂', '이리 와서 같이 해요'],
  },
];
export const ruleOf = (id) => RULES.find((r) => r.id === id);

// 알맞지 않은 말: 화내기, 모른 척하기 (다정하게 말해야 별을 받는다)
const HARSH = [
  { text: '큰 소리로 혼내요 😠', why: '화를 내면 마음이 아파요. 다정하게 말해 줘요 💛' },
  { text: '못 본 척해요 🙈', why: '모른 척하면 안 돼요. 다정하게 알려 줘요 💛' },
];

const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// 타이르는 말 3개: 알맞은 말 하나(칠판의 약속과 같은 뜻), 다른 약속의 말, 화내거나 모른 척하는 말
export function makeChoices(ruleId) {
  const rule = ruleOf(ruleId);
  const other = pick(RULES.filter((r) => r.id !== ruleId));
  const harsh = pick(HARSH);
  return shuffle([
    { text: rule.fix, ok: true },
    { text: other.fix, ok: false, why: `이 친구는 "${rule.board}" 약속을 안 지켰어요. 칠판 구석을 다시 봐요 👀` },
    { text: harsh.text, ok: false, why: harsh.why },
  ]);
}
