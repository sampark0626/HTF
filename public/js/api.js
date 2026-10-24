// 서버 API 래퍼. 토큰은 탭이 살아 있는 동안만 sessionStorage 에 둔다 (다른 친구가 같은 태블릿을 쓸 수 있으니까).
const KEY = 'htf_token';
let token = null;
try { token = sessionStorage.getItem(KEY); } catch (_) { /* 저장소 사용 불가 */ }
let onAuthLost = () => {};
let adminToken = null; // 부모님 메뉴 토큰은 저장하지 않고 메모리에만 둔다

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export const setAuthLostHandler = (fn) => { onAuthLost = fn; };
export const hasToken = () => Boolean(token);

export function setToken(t) {
  token = t;
  try {
    if (t) sessionStorage.setItem(KEY, t);
    else sessionStorage.removeItem(KEY);
  } catch (_) { /* 무시 */ }
}

async function request(method, path, body, asAdmin = false) {
  const bearer = asAdmin ? adminToken : token;
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (_) {
    throw new ApiError('인터넷 연결을 확인해 주세요 📶', 0);
  }
  let data = null;
  try { data = await res.json(); } catch (_) { /* JSON 아님 */ }
  if (!res.ok) {
    if (res.status === 401 && asAdmin) {
      adminToken = null;
    } else if (res.status === 401 && token) {
      setToken(null);
      onAuthLost();
    }
    throw new ApiError((data && data.error) || '문제가 생겼어요', res.status);
  }
  return data;
}

export const api = {
  config: () => request('GET', '/config'),
  register: (p) => request('POST', '/register', p),
  login: (name, pin) => request('POST', '/login', { name, pin }),
  setPin: (name, pin) => request('POST', '/set-pin', { name, pin }),
  me: () => request('GET', '/me'),
  updateMe: (p) => request('PUT', '/me', p),
  htf: () => request('GET', '/htf'),
  startHtf: (durationSec) => request('POST', '/htf/start', { durationSec }),
  endHtf: () => request('POST', '/htf/end', {}),
  addHomework: (title) => request('POST', '/homework', { title }),
  frequent: () => request('GET', '/homework/frequent'),
  deleteHomework: (id) => request('DELETE', `/homework/${id}`),
  clear: (id, image) => request('POST', `/homework/${id}/clear`, { image }),
  reanalyze: (id) => request('POST', `/homework/${id}/reanalyze`, {}),
  records: () => request('GET', '/records'),
  // 부모님 메뉴
  adminLogin: async (code) => { adminToken = (await request('POST', '/admin/login', { code })).token; },
  adminLogout: () => { adminToken = null; },
  adminKids: () => request('GET', '/admin/kids', undefined, true),
  adminAction: (name, action) => request('POST', `/admin/kids/${encodeURIComponent(name)}/${action}`, {}, true),
};

// 사진은 로그인 토큰이 있어야 볼 수 있어서, 헤더를 붙여 받아온 뒤 blob URL 로 보여 준다.
const photoCache = new Map();

export async function photoUrl(id) {
  if (photoCache.has(id)) return photoCache.get(id);
  const res = await fetch(`/api/photos/${id}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError('사진을 불러오지 못했어요', res.status);
  const url = URL.createObjectURL(await res.blob());
  photoCache.set(id, url);
  return url;
}

export function clearPhotoCache() {
  for (const url of photoCache.values()) URL.revokeObjectURL(url);
  photoCache.clear();
}
