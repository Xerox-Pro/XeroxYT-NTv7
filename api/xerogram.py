import base64
import hmac
import zlib
import hashlib
import json
import os
import secrets
from flask import Flask, request, jsonify, abort
from cryptography.fernet import Fernet
from redis import Redis
from instagrapi import Client
from instagrapi.exceptions import TwoFactorRequired

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8192
COOKIE = "__Host-xerogram"

@app.after_request
def private(response):
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response

@app.post("/api/xerogram")
def run():
    if request.headers.get("Origin") != request.host_url.rstrip("/") or not request.is_json:
        abort(403)
    data = request.get_json()
    if not isinstance(data, dict):
        abort(400)
    db = Redis.from_url(os.environ["REDIS_TLS_URL"], ssl_cert_reqs="required") if os.getenv("REDIS_TLS_URL") else None
    secret = os.getenv("XEROGRAM_KEY")
    if not secret:
        root = os.getenv("API_SHARED_SECRET")
        if not root:
            return jsonify(error="Xerogram session key is unavailable"), 503
        secret = base64.urlsafe_b64encode(hmac.digest(root.encode(), b"xerogram-session-v1", "sha256"))
    cipher = Fernet(secret)
    token = request.cookies.get(COOKIE, "")
    key = "xerogram:session:" + token
    action = data.get("action")
    if action == "logout":
        if db is not None:
            db.delete(key)
        response = jsonify(ok=True)
        response.delete_cookie(COOKIE, secure=True, httponly=True, samesite="Strict")
        return response
    client = Client()
    client.challenge_code_handler = lambda *args: ""
    try:
        if action == "login":
            client.login(data["username"], data["password"], verification_code=data.get("code", ""))
            if not client.user_id:
                abort(401)
            token = secrets.token_urlsafe(32)
            encoded = cipher.encrypt(zlib.compress(json.dumps(client.get_settings()).encode()))
            if db is None:
                token = encoded.decode()
                if len(token) > 3800:
                    return jsonify(error="Session storage required"), 503
            else:
                db.setex("xerogram:session:" + token, 604800, encoded)
            response = jsonify(account=str(client.user_id))
            response.set_cookie(COOKIE, token, max_age=604800, secure=True, httponly=True, samesite="Strict")
            return response
        session = db.get(key) if db is not None else token.encode()
        if not session:
            return jsonify(error="ログインしてください"), 401
        client.set_settings(json.loads(zlib.decompress(cipher.decrypt(session, ttl=604800))))
        if action == "session":
            return jsonify(account=str(client.user_id))
        if action in {"profile","home","reels","search","inbox","messages","suggestions"}:
            resource = json.dumps([str(client.user_id),action,data.get("id"),data.get("query")])
            bucket = "xerogram:data:" + hashlib.sha256(resource.encode()).hexdigest()
            saved = db.get(bucket) if db is not None else None
            if saved and not data.get("refresh"):
                return jsonify(rows=json.loads(cipher.decrypt(saved)))
            def result(rows):
                if db is not None:
                    db.set(bucket, cipher.encrypt(json.dumps(rows).encode()))
                return jsonify(rows=rows)
        if action == "suggestions":
            return result([person(u) for u in client.fbsearch_suggested_profiles(str(client.user_id))])
        if action == "profile":
            user = client.user_info(str(client.user_id))
            return result([person(user)])
        if action == "search":
            return result([person(u) for u in client.search_users(data["query"])])
        if action == "inbox":
            return result([dict(id=str(t.id), title=t.thread_title or "メッセージ") for t in client.direct_threads(amount=20)])
        if action == "messages":
            return result([dict(id=str(m.id), title=m.text or m.item_type) for m in reversed(client.direct_messages(data["id"], amount=30))])
        if action == "send":
            client.direct_send(data["text"], thread_ids=[data["id"]])
            return jsonify(ok=True)
        if action == "home":
            items = client.get_timeline_feed().get("feed_items", [])
            return result([media(i["media_or_ad"]) for i in items if i.get("media_or_ad")])
        if action == "reels":
            return result([dict(id=str(i.pk), title=i.user.username, body=i.caption_text,
                                image=str(i.thumbnail_url or ""), video=str(i.video_url or "")) for i in client.reels(12)])
        return jsonify(error="未対応の操作です"), 400
    except TwoFactorRequired:
        return jsonify(error="認証コードを入力してください"), 401
    except (KeyError, ValueError):
        return jsonify(error="入力を確認してください"), 400
    except Exception:
        return jsonify(error="Instagram と通信できませんでした。ログイン状態と本人確認を確認してください。"), 502

def person(u):
    return dict(id=str(u.pk), title=u.username, body=u.full_name, image=str(u.profile_pic_url or ""))

def media(item):
    asset = (item.get("carousel_media") or [item])[0]
    images = asset.get("image_versions2", {}).get("candidates", [])
    videos = asset.get("video_versions", [])
    return dict(id=str(item.get("pk", "")), title=item.get("user", {}).get("username", ""),
                body=(item.get("caption") or {}).get("text", ""),
                image=images[0]["url"] if images else "", video=videos[0]["url"] if videos else "")
