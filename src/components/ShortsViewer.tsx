import {useYouTubeLinked} from '../lib/youtubeConnection';
import PlaybackSettings from './PlaybackSettings';
import {usePlayerPreferences,videoEffectsStyle} from '../lib/playerPreferences';
import {readPlaybackPosition,savePlaybackPosition} from '../lib/playbackPosition.mjs';
import {useSleepTimer,consumeEndTimer} from '../hooks/useSleepTimer';
import RichText from './RichText';
import {useAudioPreference,readMuted} from '../lib/audioPreference';
import CompactError from './CompactError';
import { createPlaybackTracker, learnInteraction, rankCandidates } from '../lib/localRecommendations.mjs';
import { loadShortsRanking } from '../lib/rankingClient.mjs';
import { withShortsInterests } from '../lib/shortsInterests.mjs';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, ThumbsUp, MessageCircle, AlignLeft, X, ArrowLeft, Search, Share2, MoreVertical, Captions, Volume2, VolumeX, ChevronsDown } from 'lucide-react';
import type { ReactNode } from 'react';
import Avatar from './Avatar';
import { Video } from '../types';
import { fetchJSON, formatNumberJP } from '../utils';
import { appendShortsInOrder, excludeSeenShorts, isShortsLocation, MAX_SHORT_PAGES, mixShorts, createShortsSession, readSeenShorts, recordSeenShort, discoveryRequest, unseenRankingFirst } from '../lib/shortsFeed.mjs';
import ShortsComments from './ShortsComments';
import { getShortEmbedUrl } from '../lib/shortsEmbedCache.mjs';
import { ShortsContext, shortsQuery } from './ShortsShelf';

async function fetchShortsPage(url: string, signal: AbortSignal) {
  try {
    return await fetchJSON(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
  } catch (reason: any) {
    // Retry transient network/upstream failures once without retrying account
    // errors or daily limits. Keep the same URL/session so paging is stable.
    if (signal.aborted || reason?.isDailyLimit || [400, 401, 403, 404, 429].includes(reason?.status)) throw reason;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, 450);
      const cancel = () => { clearTimeout(timer); reject(signal.reason); };
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    });
    return fetchJSON(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
  }
}

function ShortEmbed({ video, onRecord, onMetadata, onEnded, autoScroll, children, active, isSelected, captionsEnabled }: {
  video: Video; onRecord: (video: Video) => void; onMetadata: (video: Video) => void; onEnded: (id: string) => boolean; autoScroll: boolean; children?: ReactNode; active: boolean; isSelected: () => boolean; captionsEnabled: boolean;
}) {
  const [muted] = useAudioPreference();
  const prefs=usePlayerPreferences();
  const lastPosition=useRef({time:0,duration:0,received:false});
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const detail = useRef<Video | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const activeRef = useRef(active); activeRef.current = active;
  const recorded = useRef(false);
  const captionsRef = useRef(captionsEnabled); captionsRef.current = captionsEnabled;
  const command = (func: string, args: unknown[] = []) => { if (frame.current?.contentWindow && url) frame.current.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), new URL(url).origin); };
  useSleepTimer(()=>command('pauseVideo'));
  const syncCaptions = () => {
    if (captionsRef.current) { command('loadModule', ['captions']); command('setOption', ['captions', 'reload', true]); }
    else { command('setOption', ['captions', 'track', {}]); command('unloadModule', ['captions']); }
  };
  useEffect(() => {
    if (!url) return;
    syncCaptions();
    const timers = [400, 1200, 2400].map(delay => window.setTimeout(syncCaptions, delay));
    return () => timers.forEach(clearTimeout);
  }, [captionsEnabled, url]);
  useEffect(() => {
    if (!url) return;
    const sync = () => command(readMuted() ? 'mute' : 'unMute');
    sync(); const timers = [300, 1000].map(delay => window.setTimeout(sync,delay));
    return () => timers.forEach(clearTimeout);
  }, [muted,url]);
  const record = () => { if (activeRef.current && detail.current && !recorded.current) { recorded.current = true; callbacks.current.onRecord(detail.current); } };
  const callbacks = useRef({ onRecord, onMetadata, onEnded, autoScroll, isSelected }); callbacks.current = { onRecord, onMetadata, onEnded, autoScroll, isSelected };
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setUrl(''); setError(''); detail.current = null;
    detail.current = video;
    // Metadata is optional: it must never block the device-built player.
    fetchJSON(`/api/shorts/${video.videoId}?title=${encodeURIComponent(video.title.slice(0, 160))}&details=2`, {signal:controller.signal}).then(metadata=>{
      if(!cancelled&&metadata){detail.current=metadata;callbacks.current.onMetadata(metadata);}
    }).catch(()=>{});
    getShortEmbedUrl(video.videoId,controller.signal,attempt>0).then(rawUrl=>{
      if(cancelled)return;
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:' || !['www.youtubeeducation.com', 'www.youtube.com', 'www.youtube-nocookie.com'].includes(parsed.hostname)) throw new Error('埋め込みURLが正しくありません。');
      parsed.searchParams.set('enablejsapi', '1');
      parsed.searchParams.set('origin', window.location.origin);
      // Handle repeat ourselves so an ended event can advance when enabled.
      for (const [key, value] of Object.entries({ loop: '0', playlist: video.videoId!, controls: '1', playsinline: '1', autoplay: activeRef.current ? '1' : '0', mute: readMuted() ? '1' : '0', rel: '0', cc_load_policy: captionsRef.current ? '1' : '0' })) parsed.searchParams.set(key, value);
      const position=readPlaybackPosition(video.videoId);
      if(position>0)parsed.searchParams.set('start',String(position));
      setUrl(parsed.toString());
    }).catch(reason => { if (!cancelled) setError(reason.message || '動画を読み込めませんでした。'); });
    return () => { cancelled = true; controller.abort(); };
  }, [video.videoId, attempt]);
  useEffect(() => {
    let hiddenAt = document.hidden ? Date.now() : 0;
    const resume = () => {
      if (document.hidden || !activeRef.current) return;
      // Refresh expired player configuration after a long background suspension.
      if (error || (hiddenAt && Date.now() - hiddenAt >= 15 * 60 * 1000)) setAttempt(value => value + 1);
      hiddenAt = 0;
    };
    const visibility = () => { if (document.hidden) hiddenAt = Date.now(); else resume(); };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', visibility); };
  }, [error]);
  useEffect(() => {
    if (!url) return;
    const sync = () => { command(active ? 'playVideo' : 'pauseVideo'); if (active) record(); };
    sync(); const timers = [300, 800, 1600].map(delay => window.setTimeout(sync, delay));
    return () => timers.forEach(clearTimeout);
  }, [active, url]);
  useEffect(() => {
    if (!active || !url) return;
    const tracker = createPlaybackTracker(detail.current || video);
    let playing = false;
    let handledEnd = false;
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== new URL(url).origin) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if(data?.event==='onError'){const code=Number(data.info);if(![100,101,150].includes(code)&&attempt<2){setAttempt(value=>value+1);}else setError([100,101,150].includes(code)?'この動画は埋め込み再生できません。次の動画へ進んでください。':'動画を再生できませんでした。再読み込みしてください。');return;}
        if (!['infoDelivery', 'initialDelivery', 'onStateChange'].includes(data?.event)) return;
        const info = data.info && typeof data.info === 'object' ? data.info : {};
        const playerState = data.event === 'onStateChange' && typeof data.info === 'number' ? data.info : info.playerState;
        if (typeof playerState === 'number') {
          playing = playerState === 1;
          if (playing) handledEnd = false;
          if (playerState === 0 && !handledEnd && activeRef.current && callbacks.current.isSelected()) {
            handledEnd = true;
            if (consumeEndTimer()) { command('pauseVideo'); return; }
            if (!callbacks.current.autoScroll || !callbacks.current.onEnded(video.videoId!)) {
              command('seekTo', [0, true]);
              command('playVideo');
            }
          }
        }
        if (typeof info.currentTime === 'number') lastPosition.current={time:info.currentTime,duration:info.duration||detail.current?.lengthSeconds||0,received:true};
        if (typeof info.currentTime === 'number') tracker.update(info.currentTime, info.duration || detail.current?.lengthSeconds, playing, document.visibilityState !== 'hidden');
      } catch {}
    };
    window.addEventListener('message', receive);
    return () => { window.removeEventListener('message', receive); tracker.finish(callbacks.current.isSelected() ? 'leave' : 'skip'); };
  }, [active, url, video.videoId]);
  useEffect(()=>{
    if(!active)return;
    const save=()=>{const p=lastPosition.current;if(p.received)savePlaybackPosition(video.videoId,p.time,p.duration);};
    const timer=setInterval(save,4000);window.addEventListener('pagehide',save);document.addEventListener('visibilitychange',save);
    return()=>{save();clearInterval(timer);window.removeEventListener('pagehide',save);document.removeEventListener('visibilitychange',save);};
  },[active,video.videoId]);
  return <div className="shorts-frame">
    {url && <iframe ref={frame} tabIndex={active ? 0 : -1} aria-hidden={!active} src={url} title={video.title} className="shorts-iframe" style={videoEffectsStyle(prefs)} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onLoad={() => { frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), new URL(url).origin); command(readMuted() ? 'mute' : 'unMute'); command(activeRef.current ? 'playVideo' : 'pauseVideo'); syncCaptions(); record(); }} />}
    {!url && !error && <div className="absolute inset-0 grid place-items-center"><Loader2 className="animate-spin" size={28} /></div>}
    {children}
    {error && <div className="shorts-embed-error !z-10 pointer-events-auto touch-auto"><CompactError error={error} onRetry={() => setAttempt(value => value + 1)} retryLabel="再読み込み"/><button className="mt-3 underline" onClick={()=>callbacks.current.onEnded(video.videoId!)}>次の動画へ</button></div>}
  </div>;
}

export default function ShortsViewer({ initialId, initialVideo, context, onRecord, onSelectChannel }: {
  initialId?: string; initialVideo?: Video; context: ShortsContext;
  onRecord: (video: Video) => void; onSelectChannel: (id: string) => void;
}) {
  const youtubeLinked=useYouTubeLinked();
  const personalized=youtubeLinked&&context.source==='home';
  const navigate = useNavigate();
  const location = useLocation();
  const route = useRef(location); route.current = location;
  const navigateRef = useRef(navigate); navigateRef.current = navigate;
  const channelMode = context.source === 'channel' && !!context.channelId;
  const [channelStart] = useState(() => {
    try {
      const data = JSON.parse(sessionStorage.getItem(`xerox_channel_shorts_${context.channelId}`) || 'null');
      if (channelMode && Array.isArray(data?.videos)) return data;
    } catch {}
    return null;
  });
  const positioned = useRef(false);
  const anchor = useRef<{ id: string; top: number } | null>(null);
  const seed = useRef(initialId ? initialVideo || { videoId: initialId, title: 'ショート動画', author: 'チャンネル', isShort: true, viewCount: 0, publishedText: '', lengthSeconds: 0, videoThumbnails: [] } as Video : null);
  const [session] = useState(createShortsSession);
  const [seenOnEntry] = useState(readSeenShorts);
  const personalCursor=useRef('');
  const regularRef = useRef<Video[]>([]);
  const [regular, setRegular] = useState<Video[]>(channelMode && channelStart ? [...channelStart.videos] : seed.current ? [seed.current] : []);
  const [ranking, setRanking] = useState<Video[]>([]);
  const [rankingReady, setRankingReady] = useState(false);
  const [activeId, setActiveId] = useState(initialId || '');
  const [muted,setMuted] = useAudioPreference();
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [autoScroll, setAutoScroll] = useState(() => {
    try { return localStorage.getItem('xerox_shorts_auto_scroll_v1') !== 'off'; }
    catch { return true; }
  });
  const [metadata, setMetadata] = useState<Record<string, Video>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(channelStart?.page || 1);
  const [hasMore, setHasMore] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [commentsId, setCommentsId] = useState('');
  const [descriptionId, setDescriptionId] = useState('');
  const [likes, setLikes] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem('xerox_shorts_likes_v1') || '{}'); } catch { return {}; } });
  const scroll = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const touchStartY = useRef<number | null>(null);
  const activeRef = useRef(activeId); activeRef.current = activeId;
  const query = shortsQuery(context).toString();
  regularRef.current = regular;
  const ranked = unseenRankingFirst(excludeSeenShorts(ranking, seenOnEntry, seed.current?.videoId), seenOnEntry, seed.current?.videoId);
  const videos: Video[] = !rankingReady ? regular : ranked.length ? mixShorts(regular, ranked, seed.current?.videoId) : regular;
  const ids = videos.map(video => video.videoId).join(',');
  useEffect(() => {
    try { localStorage.setItem('xerox_shorts_auto_scroll_v1', autoScroll ? 'on' : 'off'); } catch {}
  }, [autoScroll]);
  useEffect(() => {
    let cancelled = false;
    ((context.source === 'search' || channelMode || personalized) ? Promise.resolve({ videos: [], updatedAt: '' }) : loadShortsRanking()).then(data => {
      if (!cancelled) setRanking(rankCandidates(excludeSeenShorts(data.videos || [], readSeenShorts(), seed.current?.videoId), { short: true, seed: session, seen: seenOnEntry }));
    }).catch(reason => { if (!cancelled) console.warn('[Shorts ranking]', reason); })
      .finally(() => { if (!cancelled) setRankingReady(true); });
    return () => { cancelled = true; };
  }, [personalized]);
  useEffect(() => {
    let cancelled = false; pending.current = true; setLoading(true); setError('');
    const controller = new AbortController();
    if (channelMode) {
      fetchShortsPage(`/api/channel/${encodeURIComponent(context.channelId!)}/tab/shorts?page=${page}&sort=latest`, controller.signal).then(data => {
        if (cancelled) return;
        const current = scroll.current?.querySelector<HTMLElement>(`[data-short-id="${activeRef.current}"]`);
        if (current) anchor.current = { id: activeRef.current, top: current.getBoundingClientRect().top };
        const older = (data.videos || []).filter((video: Video) => video.videoId);
        const combined: Video[] = [...new Map([...regularRef.current, ...older].map(video => [video.videoId, video])).values()] as Video[];
        setRegular(combined);
        try { sessionStorage.setItem(`xerox_channel_shorts_${context.channelId}`, JSON.stringify({ videos: combined, page, hasMore: Boolean(data.hasMore) })); } catch {}
        setHasMore(Boolean(data.hasMore));
      }).catch(reason => { if (!cancelled) setError(reason.message || 'チャンネルのショートを取得できませんでした。'); })
        .finally(() => { if (!cancelled) { pending.current = false; setLoading(false); } });
      return () => { cancelled = true; controller.abort(); };
    }
    const excluded = [...regularRef.current.map(video => video.videoId!), ...readSeenShorts()];
    if(page===1)personalCursor.current='';
    let request=discoveryRequest(withShortsInterests(query,page),page,session,excluded);
    if(personalized){const params=new URLSearchParams();if(personalCursor.current)params.set('continuation',personalCursor.current);else if(seed.current?.videoId)params.set('videoId',seed.current.videoId);request='/api/user/shorts-sequence?'+params;}
    fetchShortsPage(request, controller.signal).then(data => {
      if (cancelled) return;
      if(personalized)personalCursor.current=data.continuation||'';
      const fetched=(data.videos||[]).filter((video:Video)=>video.isShort);
      const items:Video[]=personalized?excludeSeenShorts(fetched,readSeenShorts(),seed.current?.videoId):rankCandidates(excludeSeenShorts(fetched,readSeenShorts(),seed.current?.videoId),{short:true,seed:session,seen:readSeenShorts()});
      setRegular(previous => appendShortsInOrder(previous,items));
      setHasMore(Boolean(data.hasMore));
    }).catch(reason => { if (!cancelled) setError(reason.message || 'ショートを読み込めませんでした。'); })
      .finally(() => { if (!cancelled) { pending.current = false; setLoading(false); } });
    return () => { cancelled = true; controller.abort(); };
  }, [query, page, session, attempt, personalized]);
  useLayoutEffect(() => {
    if (!channelMode || !scroll.current || !videos.length) return;
    const selected = scroll.current.querySelector<HTMLElement>(`[data-short-id="${initialId}"]`);
    if (!positioned.current && selected) {
      scroll.current.scrollTop += selected.getBoundingClientRect().top - scroll.current.getBoundingClientRect().top;
      positioned.current = true;
    } else if (anchor.current) {
      const node = scroll.current.querySelector<HTMLElement>(`[data-short-id="${anchor.current.id}"]`);
      if (node) scroll.current.scrollTop += node.getBoundingClientRect().top - anchor.current.top;
    }
    anchor.current = null;
  }, [ids]);
  useEffect(() => {
    if (!videos.length) return;
    setActiveId(previous => videos.some(video => video.videoId === previous) ? previous : videos[0].videoId!);
  }, [ids]);
  useEffect(() => {
    const container = scroll.current;
    if (!container) return;
    const observer = new IntersectionObserver(entries => {
      // This component can remain mounted during its exit animation. Never
      // reactivate or navigate from a feed after the user has left its route.
      if (!isShortsLocation(route.current.pathname)) return;
      for (const entry of entries) if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
        recordSeenShort((entry.target as HTMLElement).dataset.shortId!);
        setActiveId((entry.target as HTMLElement).dataset.shortId!); setCommentsId('');
      }
    }, { root: container, threshold: [0.6] });
    container.querySelectorAll('[data-short-id]').forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [ids]);
  useEffect(() => {
    if (!initialId || initialId === activeRef.current) return;
    setActiveId(initialId); setCommentsId('');
    scroll.current?.querySelector<HTMLElement>(`[data-short-id="${initialId}"]`)?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [initialId]);
  useEffect(() => {
    if (!activeId || !isShortsLocation(route.current.pathname)) return;
    const pathname = `/shorts/${activeId}`;
    const search = `?${query}`;
    if (route.current.pathname !== pathname || route.current.search !== search) navigateRef.current(pathname + search, { replace: true });
    // Synchronize only a new active clip, never a navigation or a loading state.
  }, [activeId, query]);
  useEffect(() => {
    const index = videos.findIndex(video => video.videoId === activeId);
    const filledRanking = ranking.length > 0 && videos.length >= ranking.length * 2;
    if (rankingReady && !filledRanking && (channelMode ? videos.length > 0 && index >= videos.length - 3 : index >= videos.length - 6) && hasMore && !loading && !pending.current && !error && page < (channelMode ? 100 : MAX_SHORT_PAGES)) setPage(value => value + 1);
  }, [activeId, ids, rankingReady, ranking.length, hasMore, loading, error, page]);
  useEffect(() => {
    if (personalized || channelMode || context.source === 'search' || !activeId) return;
    // Preserve everything already visited and the two prepared embeds.
    const index = videos.findIndex(v => v.videoId === activeId);
    const locked = new Set(videos.slice(0, index + 3).map(v => v.videoId));
    const adapt = (list: Video[]) => {
      let end = 0;
      list.forEach((v, i) => { if (locked.has(v.videoId)) end = i + 1; });
      return [...list.slice(0, end), ...rankCandidates(list.slice(end), { short: true, seed: session, seen: readSeenShorts() })];
    };
    setRegular(adapt); setRanking(adapt);
  }, [activeId]);
  const move = useCallback((direction: number) => {
    // A failed next-page request must be recoverable with another downward
    // swipe/scroll, including when there are no slides to scroll to yet.
    if (direction > 0 && error && !pending.current && !loading) {
      pending.current = true;
      setAttempt(value => value + 1);
      return;
    }
    const index = videos.findIndex(video => video.videoId === activeRef.current);
    (scroll.current?.querySelectorAll<HTMLElement>('[data-short-id]')[index + direction])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [ids, error, loading]);
  const advanceOnEnd = useCallback((id: string) => {
    if (!isShortsLocation(route.current.pathname) || activeRef.current !== id) return false;
    const nodes = scroll.current?.querySelectorAll<HTMLElement>('[data-short-id]');
    const index = videos.findIndex(video => video.videoId === id);
    const next = index >= 0 ? nodes?.[index + 1] : undefined;
    if (next) {
      next.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    }
    // At the end of a partially fetched feed, request another page. Replay
    // this clip meanwhile so the player does not stop on an empty frame.
    if (index >= 0 && hasMore && !loading && !pending.current && !error && page < (channelMode ? 100 : MAX_SHORT_PAGES)) {
      setPage(value => value + 1);
    }
    return false;
  }, [ids, hasMore, loading, error, page, channelMode]);
  const retryOnScroll = (direction: number) => {
    if (direction > 0 && error && !loading && !pending.current) {
      pending.current = true;
      setAttempt(value => value + 1);
    }
  };
  const retryFeed = () => {
    if (loading || pending.current) return;
    pending.current = true;
    setAttempt(value => value + 1);
  };
  useEffect(() => {
    const resume = () => {
      if (!document.hidden && error && !pending.current && isShortsLocation(route.current.pathname)) {
        pending.current = true;
        setAttempt(value => value + 1);
      }
    };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => { window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume); };
  }, [error]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (commentsId || descriptionId)) { setCommentsId(''); setDescriptionId(''); return; }
      if (!isShortsLocation(route.current.pathname) || commentsId || descriptionId || /INPUT|TEXTAREA|SELECT|BUTTON/.test((event.target as HTMLElement)?.tagName)) return;
      if (['ArrowDown', 'PageDown', 'ArrowUp', 'PageUp'].includes(event.key)) { event.preventDefault(); move(['ArrowDown', 'PageDown'].includes(event.key) ? 1 : -1); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [move, commentsId, descriptionId]);
  return <section className={`shorts-viewer ${activeId && (commentsId === activeId || descriptionId === activeId) ? "shorts-has-panel" : ""}`} aria-label="ショート動画">
    <header className="shorts-mobile-header"><button aria-label="ショートを閉じる" onClick={()=>navigate('/')}><ArrowLeft size={27}/></button><div><button aria-label="検索" onClick={()=>navigate('/search')}><Search size={26}/></button><button aria-label="概要欄" onClick={()=>{setCommentsId('');setDescriptionId(activeId||'');}}><MoreVertical size={25}/></button></div></header>
    <div className="shorts-scroll" ref={scroll} tabIndex={0} aria-label="動画の外側を上下にスクロールして切り替え"
      onWheel={event => retryOnScroll(event.deltaY)}
      onTouchStart={event => { touchStartY.current = event.touches[0]?.clientY ?? null; }}
      onTouchEnd={event => {
        if (touchStartY.current !== null && event.changedTouches[0]) {
          const delta = touchStartY.current - event.changedTouches[0].clientY;
          if (delta > 40) retryOnScroll(delta);
        }
        touchStartY.current = null;
      }}
      onTouchCancel={() => { touchStartY.current = null; }}>
      {videos.map((video, index) => {
        const detail = metadata[video.videoId!];
        const info = detail ? { ...video, ...detail, viewCount: detail.viewCount || video.viewCount, description: detail.description || video.description, publishedText: detail.publishedText || video.publishedText } : video;
        const active = video.videoId === activeId;
        const activeIndex = videos.findIndex(item => item.videoId === activeId);
        const prepare = index >= activeIndex && index <= activeIndex + 2;
        const overlay = <div className="shorts-overlay">
          <button className="shorts-channel" onClick={() => onSelectChannel(info.authorId || info.author)} aria-label={`${info.author}のチャンネル`}>
            {active && (info.authorAvatar || metadata[video.videoId!]) ? <Avatar src={info.authorAvatar} name={info.author} channelId={info.authorId} videoId={info.videoId} className="w-9 h-9 text-sm" />
              : info.authorAvatar ? <img src={info.authorAvatar} alt="" className="w-9 h-9 rounded-full object-cover" loading="lazy" /> : <span className="shorts-channel-placeholder">{info.author.slice(0, 1)}</span>}
            <span>{info.author}</span>
          </button>
          <button className="shorts-title-button" onClick={()=>{setCommentsId('');setDescriptionId(video.videoId!);}}><h1 className="shorts-overlay-title">{info.title}</h1></button>
          <p className="shorts-overlay-stats">{info.viewCount > 0 ? `${formatNumberJP(info.viewCount)}回視聴` : ''}{info.likeCount == null ? '' : ` · 高評価 ${formatNumberJP(info.likeCount)}`}</p>
        </div>;
        return <article className="shorts-slide" key={video.videoId} data-short-id={video.videoId} aria-label={info.title}>
          <div className="shorts-player-row">
          {prepare ? <ShortEmbed video={video} active={active} captionsEnabled={captionsEnabled} autoScroll={autoScroll} onEnded={advanceOnEnd} isSelected={() => !isShortsLocation(route.current.pathname) || activeRef.current === video.videoId} onRecord={detail => { recordSeenShort(detail.videoId!); onRecord(detail); }} onMetadata={detail => setMetadata(previous => ({ ...previous, [detail.videoId!]: detail }))}>{overlay}</ShortEmbed>
            : <div className="shorts-frame"><img src={video.videoThumbnails[0]?.url} alt="" loading="lazy" className="w-full h-full object-cover" />{overlay}</div>}
          <div className="shorts-side-actions">
            <button aria-label="高評価（この端末に保存）" aria-pressed={!!likes[video.videoId!]} title="この端末に保存・YouTubeには送信されません" onClick={async () => { if(youtubeLinked){try{await fetchJSON('/api/user/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:likes[video.videoId!]?'removeRating':'like',videoId:video.videoId})});}catch(error:any){window.dispatchEvent(new CustomEvent('xerox-youtube-action-error',{detail:error.message}));return;}}learnInteraction(info, likes[video.videoId!] ? 'unlike' : 'like'); const next = { ...likes, [video.videoId!]: !likes[video.videoId!] }; setLikes(next); try { localStorage.setItem('xerox_shorts_likes_v1', JSON.stringify(next)); } catch {} }}><span><ThumbsUp size={24} fill={likes[video.videoId!] ? 'currentColor' : 'none'} /></span><small>{info.likeCount == null ? '高評価' : formatNumberJP(info.likeCount)}</small></button>
            <button aria-label="コメントを表示" onClick={() => { if (commentsId !== video.videoId) learnInteraction(info, 'comment'); setDescriptionId(''); setCommentsId(commentsId === video.videoId ? '' : video.videoId!); }}><span><MessageCircle size={24} /></span><small>コメント</small></button>
            <PlaybackSettings short>
              <button className="playback-toggle" aria-label="音声" role="switch" aria-checked={!muted} onClick={()=>setMuted(!muted)}>音声<span>{muted?'OFF':'ON'}</span></button>
              <button className="playback-toggle" aria-label="字幕" role="switch" aria-checked={captionsEnabled} onClick={()=>setCaptionsEnabled(value=>!value)}>字幕<span>{captionsEnabled?'ON':'OFF'}</span></button>
              <button className="playback-toggle" aria-label="自動スクロール" role="switch" aria-checked={autoScroll} onClick={()=>setAutoScroll(value=>!value)}>自動スクロール<span>{autoScroll?'ON':'OFF'}</span></button>
            </PlaybackSettings>
            <button aria-label="共有" onClick={async()=>{const url=new URL(`/shorts/${video.videoId}`,window.location.origin).href;try{if(navigator.share)await navigator.share({title:info.title,url});else await navigator.clipboard.writeText(url);}catch{}}}><span><Share2 size={25}/></span><small>共有</small></button>
            <button className="shorts-description-action" aria-label="概要欄を表示" onClick={() => { setCommentsId(''); setDescriptionId(descriptionId === video.videoId ? '' : video.videoId!); }}><span><AlignLeft size={24} /></span><small>概要</small></button>
          </div>
          </div>
          {active && (commentsId === video.videoId || descriptionId === video.videoId) && <><button className="shorts-panel-backdrop" aria-label="背景を押してパネルを閉じる" onClick={() => { setCommentsId(''); setDescriptionId(''); }} /><aside className="shorts-info-panel" aria-label={commentsId ? 'コメント' : '概要欄'}>
            <header><strong>{commentsId ? 'コメント' : '概要欄'}</strong><button aria-label="パネルを閉じる" onClick={() => { setCommentsId(''); setDescriptionId(''); }}><X size={22} /></button></header>
            {commentsId ? <ShortsComments videoId={video.videoId!} inline onSelectChannel={onSelectChannel} /> : <div className="shorts-description"><h2>{info.title}</h2><p>{info.author}</p><p>{info.viewCount > 0 ? `${formatNumberJP(info.viewCount)}回視聴` : '再生数を取得できませんでした'} {info.publishedText || ''}</p><p className="whitespace-pre-wrap break-words"><RichText text={info.description || '概要欄はありません。'} onSelectChannel={onSelectChannel} onSelectVideo={id=>navigate('/watch?v='+id)}/></p></div>}
          </aside></>}

        </article>;
      })}
      <div className={channelMode && videos.length ? "shorts-channel-status" : "shorts-feed-end"}>
        {(loading || !rankingReady) && <p className="flex gap-2"><Loader2 size={18} className="animate-spin" />読み込み中…</p>}
        {!loading && rankingReady && !error && (!channelMode || !videos.length) && <p>{videos.length ? 'ここまでのショートを表示しました。' : personalized ? '未表示のショートが見つかりませんでした。' : '表示できる縦長ショートがありません。'}</p>}
        {!loading && !error && hasMore && (!channelMode || activeId === videos[videos.length - 1]?.videoId) && page < (channelMode ? 100 : MAX_SHORT_PAGES) && (!ranking.length || videos.length < ranking.length * 2) && <button className="underline mt-3" onClick={() => setPage(value => value + 1)}>{channelMode ? '古いショートを読み込む' : '続きを読み込む'}</button>}
        {error && videos.length > 0 && <div className="mt-3" role="status"><CompactError error="続きのショートを取得できませんでした。" onRetry={retryFeed} retryLabel="再試行"/></div>}
      </div>
    </div>
    {error && videos.length === 0 && <div className="shorts-feed-retry" role="alert"><CompactError error={error} onRetry={retryFeed} retryLabel="再読み込み"/></div>}
  </section>;
}
