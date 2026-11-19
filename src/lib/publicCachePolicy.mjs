// Only cache public, non-session API responses. Authentication, bans, messages,
// private YouTube feeds, and live playback must always reach the server.
const key = url => 'xerox-public-v4:' + url;
const policy = (url, ttlMs) => ({ key: key(url), ttlMs, permanent: ttlMs === Infinity });
export function getPublicCachePolicy(url, data) {
  if (typeof url !== 'string' || !url.startsWith('/api/') || url.startsWith('//')) return null;
  const path = url.split('?')[0];
  const video = /^\/api\/video\/[a-zA-Z0-9_-]{11}$/.test(path);
  const short = /^\/api\/shorts\/[a-zA-Z0-9_-]{11}$/.test(path);
  if (video || short) {
    // Live/upcoming videos change constantly. Do not freeze them in storage.
    if (data && (data.isLive || data.isUpcoming || data.isLiveContent || data.isPlayerOnly || data.error)) return null;
    return policy(url, Infinity);
  }
  // Channel responses contain upload lists and subscriber counts: keep them fresh.
  if (/^\/api\/channel\/[^/]+$/.test(path)) return policy(url, 60 * 60 * 1000);
  if (/^\/api\/video\/[a-zA-Z0-9_-]{11}\/related$/.test(path)) return policy(url, 10 * 60 * 1000);
  if (/^\/api\/video\/[a-zA-Z0-9_-]{11}\/comments$/.test(path)) return policy(url, 5 * 60 * 1000);
  if (path === '/api/recommendations') return policy(url, 5 * 60 * 1000);
  if (path === '/api/trending') return policy(url, 15 * 60 * 1000);
  if (path === '/api/search' || path === '/api/suggestions') return policy(url, 10 * 60 * 1000);
  return null;
}
export function isPublicCacheFresh(entry, policy, now = Date.now()) {
  return !!(entry && typeof entry.timestamp === 'number' && entry.timestamp > 0
    && (policy.ttlMs === Infinity || (now >= entry.timestamp && now - entry.timestamp < policy.ttlMs)));
}
