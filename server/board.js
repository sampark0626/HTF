'use strict';
// 칠판 낙서: 아이가 마음 쉼터 칠판에 그린 그림을 PNG 한 장으로 보관한다 (users.board, data URL 글).
// 진짜 PNG 인지, 너무 크지 않은지만 확인한다. 낙서 층은 투명 바탕이라 거의 비어 있으면 몇 KB, 가득 그려도 수백 KB 를 넘지 않는다.

const PREFIX = 'data:image/png;base64,';
const MAX_CHARS = 560 * 1024; // base64 글자 수 (원래 크기로 약 400KB)
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// png: 브라우저가 canvas.toDataURL('image/png') 로 만든 글. 빈 글이면 낙서를 지운다.
// 돌려주는 값: { value } (저장할 글, 지우기는 '') 또는 { error }
function check(png) {
  if (png === '' || png === null) return { value: '' };
  if (typeof png !== 'string' || !png.startsWith(PREFIX)) return { error: '칠판 그림이 올바르지 않아요' };
  if (png.length > MAX_CHARS) return { error: '칠판 그림이 너무 커요. 조금만 지우고 다시 저장해 봐요' };
  const body = png.slice(PREFIX.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return { error: '칠판 그림이 올바르지 않아요' };
  const head = Buffer.from(body.slice(0, 16), 'base64');
  if (head.length < SIGNATURE.length || !head.subarray(0, SIGNATURE.length).equals(SIGNATURE)) return { error: '칠판 그림이 올바르지 않아요' };
  return { value: png };
}

module.exports = { check, MAX_CHARS };
