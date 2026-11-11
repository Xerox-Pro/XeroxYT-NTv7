import {fetchJSON} from '../utils';
import {useYouTubeLinked} from '../lib/youtubeConnection';
import React, { useState } from 'react';
import { UserPlaylist, Video } from '../types';
import { X, Plus, Check, FolderPlus, Music } from 'lucide-react';

interface AddToPlaylistModalProps {
  video: Video;
  playlists: UserPlaylist[];
  onClose: () => void;
  onToggleVideoInPlaylist: (playlistId: string, video: Video) => void;
  youtubePlaylists?:{id:string;title:string}[];
  onCreatePlaylist: (title: string, description?: string) => string; // returns new playlist id
}

export default function AddToPlaylistModal({
  video,
  playlists,
  onClose,
  onToggleVideoInPlaylist,
  onCreatePlaylist, youtubePlaylists=[]
}: AddToPlaylistModalProps) {
  const linked=useYouTubeLinked();
  const [remoteSaved,setRemoteSaved]=useState<string[]>([]);const [remoteError,setRemoteError]=useState('');const [remoteBusy,setRemoteBusy]=useState('');
  const [createGoogle,setCreateGoogle]=useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    if(createGoogle&&linked){setRemoteBusy('create');setRemoteError('');try{await fetchJSON('/api/user/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'playlistCreate',title:newTitle.trim(),videoIds:[video.videoId]})});onClose();}catch(error:any){setRemoteError(error.message);}finally{setRemoteBusy('');}return;}
    const newId = onCreatePlaylist(newTitle.trim(), newDesc.trim());
    onToggleVideoInPlaylist(newId, video);
    setNewTitle('');
    setNewDesc('');
    setIsCreating(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-gray-100 flex flex-col gap-4 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {linked&&youtubePlaylists.length>0&&<section><h3 className="text-sm font-bold">YouTubeに保存</h3>{youtubePlaylists.map(list=><button type="button" key={list.id} disabled={!!remoteBusy||remoteSaved.includes(list.id)} className="flex w-full justify-between py-2 text-left text-sm" onClick={async()=>{setRemoteBusy(list.id);setRemoteError('');try{await fetchJSON('/api/user/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'playlistAdd',playlistId:list.id,videoIds:[video.videoId]})});setRemoteSaved(previous=>[...previous,list.id]);}catch(error:any){setRemoteError(error.message);}finally{setRemoteBusy('');}}}>{list.title}<span>{remoteSaved.includes(list.id)?'追加済み':'追加'}</span></button>)}{remoteError&&<p role="alert" className="text-xs text-red-700">{remoteError}</p>}</section>}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2 text-gray-900 font-bold text-base">
            <Music size={18} className="text-red-600" />
            <span>再生リストに保存</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* 対象動画の簡単なプレビュー */}
        <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-xl border border-gray-200/80">
          <img
            src={video.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`}
            alt={video.title}
            className="w-16 aspect-video object-cover rounded-lg shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-gray-900 truncate">{video.title}</h4>
            <p className="text-[11px] text-gray-500 truncate">{video.author}</p>
          </div>
        </div>

        {/* プレイリスト選択リスト */}
        <div className="max-h-60 overflow-y-auto flex flex-col gap-1 pr-1">
          {playlists.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">プレイリストがありません。下に作成してください。</p>
          ) : (
            playlists.map((pl) => {
              const inPlaylist = pl.videos.some((v) => v.videoId === video.videoId);
              return (
                <button
                  key={pl.id}
                  onClick={() => onToggleVideoInPlaylist(pl.id, video)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                    inPlaylist
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'hover:bg-gray-100 text-gray-800'
                  }`}
                >
                  <span className="truncate max-w-[200px]">{pl.title} ({pl.videos.length}本)</span>
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                    inPlaylist ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 bg-white'
                  }`}>
                    {inPlaylist && <Check size={14} />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* 新規プレイリスト作成フォーム/ボタン */}
        {!isCreating ? (
          <button
            onClick={() => setIsCreating(true)}
            className="w-full py-2.5 px-3 rounded-xl border border-dashed border-gray-300 text-gray-700 hover:text-black hover:border-gray-400 hover:bg-gray-50 text-xs font-bold flex items-center justify-center gap-2 transition-all duration-200"
          >
            <FolderPlus size={16} />
            <span>新しい再生リストを作成</span>
          </button>
        ) : (
          <form onSubmit={handleCreate} className="flex flex-col gap-2 pt-2 border-t border-gray-100">
            {linked&&<label className="flex gap-2 py-2 text-xs"><input type="checkbox" checked={createGoogle} onChange={event=>setCreateGoogle(event.target.checked)}/>YouTubeに作成する</label>}
            {remoteError&&<p role="alert" className="text-xs text-red-700">{remoteError}</p>}
            <input
              type="text"
              placeholder="再生リストのタイトル (必須)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-black"
              autoFocus
              required
            />
            <input
              type="text"
              placeholder="説明 (端末内リスト・任意)"
              disabled={createGoogle}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-black"
            />
            <div className="flex items-center justify-end gap-2 mt-1">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3 py-1.5 text-xs text-gray-600 font-bold hover:text-gray-900 transition-colors"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={!newTitle.trim()||!!remoteBusy}
                className="px-4 py-1.5 bg-black text-white text-xs font-bold rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors"
              >
                作成して追加
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
