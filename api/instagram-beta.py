"""Same-origin personal Instagram beta. Disabled until configured."""
import os, json, base64, hashlib, logging, re, urllib.request
from urllib.parse import urlsplit
from http.server import BaseHTTPRequestHandler
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.responses import JSONResponse
from cryptography.fernet import Fernet
from instagrapi import Client

app = FastAPI(docs_url=None,redoc_url=None,openapi_url=None)
COOKIE="__Host-xy_ig_beta"
for name in ("instagrapi","private_request","public_request"):
    logging.getLogger(name).setLevel(logging.CRITICAL+1)

def key():
    value=os.environ.get("INSTAGRAM_SESSION_SECRET","")
    if len(value)<32: raise HTTPException(503,"Instagram β版の暗号鍵が未設定です。")
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(("xy-ig-v1:"+value).encode()).digest()))

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None
opener=urllib.request.build_opener(NoRedirect())

def verify(req):
    raw=os.environ.get("API_BASE_URL_1") or os.environ.get("API_BASE_URL","")
    secret=os.environ.get("API_SHARED_SECRET","")
    allow={v.strip().lower() for v in os.environ.get("INSTAGRAM_BETA_USERS","").split(",") if v.strip()}
    if not raw or not secret or not allow: raise HTTPException(503,"Instagram β版の接続設定が必要です。")
    raw=raw.strip()
    if "://" not in raw: raw="https://"+raw
    p=urlsplit(raw)
    if p.scheme!="https" or not (p.hostname or "").endswith(".workers.dev") or p.username or p.password or p.path not in ("","/") or p.query or p.fragment:
        raise HTTPException(503,"接続設定が不正です。")
    token=req.cookies.get("__Host-xy_session","")
    if not re.fullmatch(r"[a-f0-9]{64}",token): raise HTTPException(401,"Xeroxにログインしてください。")
    try:
        url=raw.rstrip("/")+"/api/account/session"
        headers={"Authorization":"Bearer "+secret,"Cookie":"__Host-xy_session="+token,"Accept":"application/json","Origin":"https://xeroxapp044.vercel.app"}
        with opener.open(urllib.request.Request(url,headers=headers),timeout=6) as r:
            data=json.loads(r.read(65536))
        u=data.get("user",{})
    except Exception: raise HTTPException(403,"Xeroxのアカウント状態を確認できません。") from None
    if not u.get("id") or str(u.get("username","")).lower() not in allow or u.get("banned") or u.get("traffic_stopped"):
        raise HTTPException(403,"現在は許可されたβテスターのみ利用できます。")
    return str(u["id"]),hashlib.sha256(token.encode()).hexdigest()

def read_session(req,owner,binding):
    token="".join(req.cookies.get(COOKIE+str(i),"") for i in range(3))
    if not token: raise HTTPException(401,"Instagramに接続してください。")
    try:
        data=json.loads(key().decrypt(token.encode(),ttl=86400))
        if data.get("owner")!=owner or data.get("binding")!=binding: raise ValueError()
        cl=Client(settings=data["settings"])
        if not cl.user_id: raise ValueError()
        return cl
    except HTTPException: raise
    except Exception: raise HTTPException(401,"Instagramの接続期限が切れました。") from None

def persist(cl,res,owner,binding):
    settings=cl.get_settings()
    settings.pop("password",None)
    settings.pop("username",None)
    token=key().encrypt(json.dumps({"owner":owner,"binding":binding,"settings":settings},default=str).encode()).decode()
    if len(token)>8400: raise HTTPException(503,"セッションが大きすぎます。")
    for i in range(3):
        part=token[i*2800:(i+1)*2800]
        if part: res.set_cookie(COOKIE+str(i),part,secure=True,httponly=True,samesite="strict",max_age=86400,path="/")
        else: res.delete_cookie(COOKIE+str(i),secure=True,httponly=True,samesite="strict",path="/")

def cdn(value):
    if not value: return None
    try:
        p=urlsplit(str(value))
        if p.scheme=="https" and not p.username and not p.password and p.port in (None,443) and any((p.hostname or "")==d or (p.hostname or "").endswith("."+d) for d in ("cdninstagram.com","fbcdn.net")): return str(value)
    except ValueError: pass
    return None

def user(u):
    if hasattr(u,"model_dump"): u=u.model_dump()
    u=u or {}
    return {"id":str(u.get("pk",u.get("id",""))),"username":u.get("username",""),"avatar":cdn(u.get("profile_pic_url"))}

def raw(m):
    im=(m.get("image_versions2") or {}).get("candidates") or []
    vid=m.get("video_versions") or []
    cap=m.get("caption") or {}
    return {"id":str(m.get("pk",m.get("id",""))),"user":user(m.get("user")),"caption":cap.get("text","") if isinstance(cap,dict) else str(cap),"image":cdn(im[0].get("url")) if im else None,"video":cdn(vid[0].get("url")) if vid else None,"code":m.get("code")}

def typed(m):
    return {"id":str(m.pk),"user":user(m.user),"caption":getattr(m,"caption_text","") or "","image":cdn(getattr(m,"thumbnail_url",None)),"video":cdn(getattr(m,"video_url",None)),"code":getattr(m,"code",None)}

@app.middleware("http")
async def security(req,call_next):
    if req.method not in ("GET","HEAD") and (req.headers.get("origin")!="https://xeroxapp044.vercel.app" or req.headers.get("x-xy-beta")!="1"):
        return JSONResponse({"detail":"不正なリクエストです。"},403)
    res=await call_next(req)
    res.headers["Cache-Control"]="private, no-store"
    res.headers["Referrer-Policy"]="no-referrer"
    res.headers["X-Content-Type-Options"]="nosniff"
    return res

@app.api_route("/api/instagram-beta",methods=["GET","POST"])
@app.api_route("/",methods=["GET","POST"])
def run(req:Request,res:Response,op:str="health",id:str=""):
    owner,binding=verify(req)
    key()
    try:
        if op=="health" and req.method=="GET":
            try: read_session(req,owner,binding); connected=True
            except HTTPException: connected=False
            return {"connected":connected,"beta":True}
        if op=="logout" and req.method=="POST":
            for i in range(3): res.delete_cookie(COOKIE+str(i),secure=True,httponly=True,samesite="strict",path="/")
            return {"ok":True}
        # Account authentication is deliberately not copied into the public beta.
        # No Instagram password or exported cookie is accepted by this endpoint.
        if op=="login": raise HTTPException(409,"公式認証への対応が必要です。")
        cl=read_session(req,owner,binding)
        if req.method!="GET": raise HTTPException(405,"Method not supported")
        if op=="feed":
            data=cl.get_timeline_feed()
            items=[]
            for r in (data.get("feed_items") or data.get("items") or [])[:30]:
                if isinstance(r,dict):
                    m=r.get("media_or_ad") or r.get("media") or (r if r.get("pk") else None)
                    if isinstance(m,dict) and not m.get("ad_id"): items.append(raw(m))
            result={"items":items}
        elif op=="reels": result={"items":[typed(m) for m in cl.reels(amount=10) if m.video_url]}
        elif op=="stories":
            tray=cl.get_reels_tray_feed().get("tray") or []
            result={"users":[{"user":user(r.get("user")),"items":[raw(m) for m in (r.get("items") or [])[:20]]} for r in tray[:40] if r.get("user")]}
        elif op=="dm": result={"threads":[{"id":str(t.id),"title":t.thread_title or ", ".join(u.username for u in t.users)} for t in cl.direct_threads(amount=20)]}
        else: raise HTTPException(404,"Not found")
        persist(cl,res,owner,binding)
        return result
    except HTTPException: raise
    except Exception as e:
        kind=type(e).__name__
        if kind in ("ClientNeedsUpgradeError","LoginRequired","ChallengeRequired","TwoFactorRequired","RateLimitError","PleaseWaitFewMinutes"): raise HTTPException(409,"Instagramの認証・利用制限を公式アプリで確認してください。") from None
        raise HTTPException(502,"Instagram request failed: "+kind) from None
