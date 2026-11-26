"""Same-origin Xerogram API. Never return Instagram settings or raw upstream errors."""
import base64
import hashlib
import hmac
import io
import json
import logging
import os
import re
import time
import zlib
from collections import OrderedDict
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock
from urllib.parse import urlsplit

import requests
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from flask import Flask, jsonify, request
from PIL import Image, ImageOps, UnidentifiedImageError
from instagrapi import Client, exceptions as ig
from instagrapi.extractors import extract_direct_thread, extract_media_v1

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024
SLOTS = ("a", "b", "c")
TTL = 7 * 86400
SITE_COOKIE = "__Host-xy_session"
logger = logging.getLogger("xerogram.instagram")
logger.disabled = True
limits = OrderedDict()
limit_lock = Lock()


class Failure(Exception):
    def __init__(self, code, status):
        self.code = code
        self.status = status


def rate(key, count, seconds):
    now = time.monotonic()
    with limit_lock:
        events = [event for event in limits.pop(key, []) if now - event < seconds]
        limits[key] = events
        if len(limits) > 4096:
            limits.popitem(last=False)
        if len(events) >= count:
            raise Failure("RATE_LIMIT", 429)
        events.append(now)


def setting_key():
    value = os.environ.get("XEROGRAM_SECRET", "")
    if len(value) < 43:
        raise Failure("UNCONFIGURED", 503)
    return hmac.digest(value.encode(), b"xerogram-workspace/session/v1", "sha256")


def site_owner():
    session = request.cookies.get(SITE_COOKIE, "")
    if not re.fullmatch(r"[a-fA-F0-9]{64}", session):
        raise Failure("SITE_LOGIN", 401)
    rate(("site", session), 70, 60)
    origin = os.environ.get("API_BASE_URL") or os.environ.get("API_BASE_URL_1", "")
    url = urlsplit(origin if "://" in origin else "https://" + origin)
    if (url.scheme != "https" or not (url.hostname or "").endswith(".workers.dev")
            or url.username or url.password or url.path not in ("", "/")
            or url.query or url.fragment or url.port not in (443, None)):
        raise Failure("UNCONFIGURED", 503)
    headers = {"Cookie": SITE_COOKIE + "=" + session, "Origin": request.headers["Origin"]}
    if secret := os.environ.get("API_SHARED_SECRET"):
        headers["Authorization"] = "Bearer " + secret
    try:
        result = requests.get(f"https://{url.hostname}/api/account/session", headers=headers,
                              timeout=(3, 5), allow_redirects=False)
    except requests.RequestException:
        raise Failure("SITE_UNAVAILABLE", 503) from None
    if result.status_code in (401, 403):
        raise Failure("SITE_LOGIN", 401)
    if result.status_code != 200:
        raise Failure("SITE_UNAVAILABLE", 503)
    try:
        owner = str(result.json()["user"]["id"])
    except (ValueError, KeyError, TypeError):
        raise Failure("SITE_UNAVAILABLE", 503) from None
    return owner, hashlib.sha256(session.encode()).hexdigest()


def b64(value):
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def cookie_name(slot):
    return "__Secure-xerogram-" + slot


def seal(key, binding, record, ttl):
    iv = os.urandom(12)
    payload = json.dumps({**record, "expires": int(time.time()) + ttl}, separators=(",", ":"))
    cipher = AESGCM(key).encrypt(iv, zlib.compress(payload.encode()), binding)
    return b64(iv + cipher)


def load(key, binding, slot):
    token = request.cookies.get(cookie_name(slot), "")
    if not token or len(token) > 3800:
        return None
    try:
        raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
        payload = AESGCM(key).decrypt(raw[:12], raw[12:], binding + slot.encode())
        record = json.loads(zlib.decompress(payload))
        return record if record["expires"] > time.time() else None
    except Exception:
        return None


def set_session(response, key, binding, slot, record=None, ttl=TTL):
    value = seal(key, binding + slot.encode(), record, ttl) if record is not None else ""
    if len(value) > 3650:
        raise Failure("SESSION_SIZE", 502)
    response.set_cookie(cookie_name(slot), value, max_age=ttl if record is not None else 0,
                        path="/api/xerogram", secure=True, httponly=True, samesite="Strict")
    return response


class XerogramClient(Client):
    def login_flow(self):
        # Authentication already completed. Load tray and timeline independently
        # so a content endpoint failure cannot discard an authenticated session.
        return True


def client(settings=None):
    settings = settings or {"locale": "ja_JP", "country": "JP", "country_code": 81,
                            "timezone_offset": 32400, "timezone_name": "Asia/Tokyo"}
    instance = XerogramClient(settings=settings, logger=logger, request_timeout=0, public_request_retries_count=0,
                      session_retry_total=0, with_challenge_flow=False, push_disabled=True)
    instance.private.trust_env = False
    instance.public.trust_env = False
    return instance


def field(body, key, limit, pattern=None, optional=False):
    value = body.get(key, "")
    if (not isinstance(value, str) or len(value) > limit or (not optional and not value.strip())
            or (value and pattern and not re.fullmatch(pattern, value))):
        raise Failure("INPUT", 400)
    return value


def ident(body, key="id"):
    return field(body, key, 100, r"[0-9]+(?:_[0-9]+)?")


def as_dict(item):
    return item if isinstance(item, dict) else item.model_dump(mode="json")


def media_url(value):
    if not value:
        return None
    try:
        url = urlsplit(str(value))
        if (url.scheme == "https" and not url.username and not url.password
                and url.port in (None, 443) and (url.hostname or "").endswith((".cdninstagram.com", ".fbcdn.net"))):
            return url.geturl()
    except ValueError:
        pass
    return None


def person(item):
    item = as_dict(item)
    return {"id": str(item.get("pk") or item.get("id") or ""), "username": item.get("username"),
            "name": item.get("full_name"), "avatar": media_url(item.get("profile_pic_url")),
            "bio": item.get("biography"), "followers": item.get("follower_count"),
            "following": item.get("following_count")}


def media(item):
    item = as_dict(item)
    return {"id": str(item.get("id") or item.get("pk")), "pk": str(item.get("pk") or ""),
            "caption": item.get("caption_text"), "user": person(item["user"]) if item.get("user") else None,
            "image": media_url(item.get("thumbnail_url")), "video": media_url(item.get("video_url")),
            "items": [{"image": media_url(x.get("thumbnail_url")), "video": media_url(x.get("video_url"))}
                      for x in item.get("resources") or []],
            "likes": item.get("like_count"), "liked": item.get("has_liked"), "saved": item.get("viewer_has_saved"),
            "expires": item.get("expiring_at"), "product": item.get("product_type")}


def feed_media(rows):
    posts = []
    for row in rows:
        raw = row.get("media_or_ad") or row.get("media") or row
        if raw.get("id") and raw.get("user") and not raw.get("ad_id"):
            try:
                posts.append(media(extract_media_v1(raw)))
            except (ValueError, KeyError, TypeError):
                continue
    return posts


def message(item):
    shared = item.media_share or item.clip
    info = as_dict(item.media) if item.media else {}
    images = (info.get("image_versions2") or {}).get("candidates") or []
    videos = info.get("video_versions") or []
    result = {"id": str(item.id), "user": str(item.user_id), "text": item.text, "type": item.item_type,
            "date": item.timestamp.isoformat(), "reply": str(item.reply.id) if item.reply else None,
            "image": media_url(images[0].get("url")) if images else None,
            "video": media_url(videos[0].get("url")) if videos else None,
            "shared": media(shared) if shared else None,
            "reactions": as_dict(item.reactions).get("emojis", []) if item.reactions else []}
    result["revision"] = hashlib.sha256(json.dumps(result, sort_keys=True).encode()).hexdigest()[:24]
    return result


def page(items, cursor=None):
    return {"items": items, "cursor": cursor or ""}


def upload_photo(cl, op, body):
    photos = body.get("photos")
    max_count = 6 if op == "upload_post" else 1
    if not isinstance(photos, list) or not 1 <= len(photos) <= max_count:
        raise Failure("INPUT", 400)
    with TemporaryDirectory(prefix="xerogram-") as directory:
        paths = []
        for index, photo in enumerate(photos):
            if not isinstance(photo, str) or len(photo) > 4_000_000:
                raise Failure("INPUT", 400)
            path = Path(directory) / f"{index}.jpg"
            try:
                with Image.open(io.BytesIO(base64.b64decode(photo, validate=True)), formats=("JPEG", "PNG", "WEBP")) as image:
                    if image.width * image.height > 16_000_000 or getattr(image, "is_animated", False):
                        raise Failure("INPUT", 400)
                    clean = ImageOps.exif_transpose(image).convert("RGB")
                    clean.thumbnail((1800, 1800))
                    clean.save(path, "JPEG", quality=87)
            except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError):
                raise Failure("INPUT", 400) from None
            paths.append(path)
        if op == "send_photo":
            return message(cl.direct_send_photo(paths[0], thread_ids=[int(ident(body))]))
        caption = field(body, "text", 2200, optional=True)
        if op == "upload_story":
            return media(cl.photo_upload_to_story(paths[0], caption=caption))
        result = cl.photo_upload(paths[0], caption) if len(paths) == 1 else cl.album_upload(paths, caption)
        return media(result)


def dispatch(cl, op, body):
    if op in ("upload_post", "upload_story", "send_photo"):
        return upload_photo(cl, op, body)
    cursor = field(body, "cursor", 2000, optional=True)
    if op == "feed":
        data = cl.get_timeline_feed(reason="paginating" if cursor else "pull_to_refresh", max_id=cursor or None)
        return page(feed_media(data.get("feed_items", [])), data.get("next_max_id"))
    if op == "reels":
        data = cl.private_request("clips/discover/", data=" ", params={"max_id": cursor} if cursor else {})
        return page(feed_media(data.get("items") or data.get("items_with_ads") or []),
                    (data.get("paging_info") or {}).get("max_id"))
    if op == "search":
        query = field(body, "query", 100)
        if query.startswith("#"):
            items, next_id = cl.hashtag_medias_paginated(query[1:], amount=20, end_cursor=cursor or None)
            return page([media(item) for item in items], next_id)
        return page([person(row) for row in cl.search_users(query, count=20)])
    if op == "suggestions":
        return page([person(row) for row in cl.fbsearch_suggested_profiles(str(cl.user_id))[:30]])
    if op == "post":
        return page([media(cl.media_info_v1(ident(body)))])
    if op == "profile":
        user = ident(body)
        items, next_id = cl.user_medias_paginated_v1(user, amount=18, end_cursor=cursor)
        profile = person(cl.user_info_v1(user))
        if str(cl.user_id) != user and not cursor:
            profile["follows"] = cl.user_friendship_v1(user).following
        return {**page([media(row) for row in items], next_id), "user": profile}
    if op in ("followers", "following"):
        getter = cl.user_followers_v1_chunk if op == "followers" else cl.user_following_v1_chunk
        items, next_id = getter(ident(body), max_amount=30, max_id=cursor)
        return page([person(item) for item in items], next_id)
    if op in ("follow", "unfollow"):
        return {"ok": (cl.user_follow if op == "follow" else cl.user_unfollow)(ident(body))}
    if op == "edit_profile":
        return {"user": person(cl.account_edit(full_name=field(body, "name", 64),
                                               biography=field(body, "bio", 150, optional=True)))}
    if op == "saved":
        items, next_id = cl.collection_medias_v1_chunk("all", max_id=cursor)
        return page([media(item) for item in items], next_id)
    if op in ("close_add", "close_remove"):
        method = cl.close_friend_add if op == "close_add" else cl.close_friend_remove
        return {"ok": bool(method(ident(body)))}
    if op == "notifications":
        data = cl.news_inbox_v1()
        rows = []
        for index, row in enumerate((data.get("new_stories") or []) + (data.get("old_stories") or [])):
            text = (row.get("args") or {}).get("text")
            if isinstance(text, str) and text:
                rows.append({"id": str(row.get("pk") or index), "text": text})
        return page(rows[:50])
    if op in ("like", "unlike", "save", "unsave", "delete_post"):
        methods = {"like": cl.media_like, "unlike": cl.media_unlike, "save": cl.media_save,
                   "unsave": cl.media_unsave, "delete_post": cl.media_delete}
        return {"ok": methods[op](ident(body))}
    if op == "edit_post":
        return {"ok": bool(cl.media_edit(ident(body), caption=field(body, "text", 2200, optional=True)))}
    if op == "comments":
        comments, next_id = cl.media_comments_chunk(ident(body), max_amount=24, min_id=cursor or None)
        return page([{"id": str(row.pk), "text": row.text, "user": person(row.user)} for row in comments], next_id)
    if op == "comment":
        row = cl.media_comment(ident(body), field(body, "text", 2200))
        return {"id": str(row.pk), "text": row.text, "user": person(row.user)}
    if op == "inbox":
        threads, next_id = cl.direct_threads_chunk(thread_message_limit=1, cursor=cursor or None)
        return page([{"id": str(row.id), "title": row.thread_title, "group": row.is_group,
                      "date": row.last_activity_at.isoformat(), "unread": row.read_state == 1,
                      "person": person(row.users[0]) if len(row.users) == 1 else None,
                      "preview": row.messages[0].text if row.messages and not row.messages[0].is_shh_mode else None} for row in threads], next_id)
    if op == "thread":
        thread_id = ident(body)
        params = {"direction": "older", "limit": "20", "visual_message_return_type": "unseen"}
        if cursor:
            params["cursor"] = cursor
        raw = cl.private_request(f"direct_v2/threads/{thread_id}/", params=params)["thread"]
        thread = extract_direct_thread(raw)
        messages = [message(item) for item in thread.messages if not item.is_shh_mode and not item.visual_media]
        if body.get("seen") is True and not cursor and thread.messages:
            try:
                cl.direct_message_seen(int(thread_id), int(thread.messages[0].id))
            except ig.ClientError:
                pass
        known = body.get("known", {})
        if not isinstance(known, dict) or len(known) > 20:
            raise Failure("INPUT", 400)
        changed = [row for row in messages if row["revision"] != known.get(row["id"])]
        return {**page(changed, raw.get("oldest_cursor")), "order": [row["id"] for row in messages],
                "title": thread.thread_title,
                "users": [person(item) for item in thread.users],
                "seen": {k: str(v.item_id) for k, v in thread.last_seen_at.items()}}
    if op == "send_to":
        user = int(ident(body))
        sent = cl.direct_send(field(body, "text", 2000), user_ids=[user])
        return {"id": str(sent.thread_id or ""), "message": message(sent)}
    if op == "send":
        thread_id = int(ident(body))
        reply_id = field(body, "reply", 100, r"[0-9]+", optional=True)
        reply = cl.direct_message(thread_id, int(reply_id), amount=80) if reply_id else None
        if reply_id and not reply:
            raise Failure("REPLY_UNAVAILABLE", 409)
        return message(cl.direct_send(field(body, "text", 2000), thread_ids=[thread_id], reply_to_message=reply))
    if op in ("unsend", "reaction"):
        args = (int(ident(body)), int(ident(body, "message")))
        return {"ok": cl.direct_message_unsend(*args) if op == "unsend" else cl.direct_send_reaction(*args)}
    if op == "start_chat":
        users = body.get("users")
        if not isinstance(users, list) or not 2 <= len(users) <= 8:
            raise Failure("INPUT", 400)
        ids = [int(ident({"id": value})) for value in users]
        return {"id": str(cl.direct_thread_create(ids, title=field(body, "title", 64, optional=True)))}
    if op == "stories":
        tray = cl.get_reels_tray_feed().get("tray", [])
        return page([person(item["user"]) for item in tray[:60] if item.get("user")])
    if op == "story":
        return page([{**media(row), "expires": (row.taken_at + timedelta(hours=24)).isoformat()}
                     for row in cl.user_stories_v1(ident(body), amount=24)])
    if op in ("story_like", "story_seen", "story_viewers"):
        target = ident(body)
        if op == "story_like":
            return {"ok": cl.story_like(target)}
        pk = int(target.split("_")[0])
        if op == "story_seen":
            cl.story_seen([pk])
            return {"ok": True}
        items, next_id = cl.story_viewers_chunk(pk, max_amount=30, max_id=cursor)
        return page([person(row.user if hasattr(row, "user") else row) for row in items], next_id)
    if op == "highlights":
        items = cl.user_highlights_v1(ident(body), amount=20)
        return page([{"id": str(row.pk).split(":")[-1], "title": row.title} for row in items])
    if op == "highlight":
        return page([media(row) for row in cl.highlight_info_v1(ident(body)).items])
    if op == "notes":
        return page([{"id": str(row.id), "text": row.text, "user": person(row.user) if row.user else None}
                     for row in cl.get_notes()])
    if op == "note":
        return {"ok": bool(cl.create_note(field(body, "text", 60)))}
    raise Failure("INPUT", 400)


@app.after_request
def headers(response):
    response.headers["Cache-Control"] = "no-store, private"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.errorhandler(Failure)
def expected(error):
    response = jsonify(error=error.code)
    if error.status == 429:
        response.headers["Retry-After"] = "60"
    return response, error.status


@app.errorhandler(413)
def too_large(_error):
    return jsonify(error="INPUT"), 413


@app.post("/api/xerogram")
def xerogram():
    expected_origin = "https://" + request.host
    if request.headers.get("Origin") != expected_origin or request.headers.get("Sec-Fetch-Site") not in (None, "same-origin"):
        raise Failure("ORIGIN", 403)
    if not request.is_json:
        raise Failure("INPUT", 400)
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise Failure("INPUT", 400)
    op = field(body, "op", 30, r"[a-z_]+")
    if op not in ("upload_post", "upload_story", "send_photo") and (request.content_length or 0) > 48 * 1024:
        raise Failure("INPUT", 413)
    key = setting_key()
    owner, session_digest = site_owner()
    binding = json.dumps([expected_origin, owner, session_digest]).encode()
    try:
        if op == "status":
            accounts = []
            for slot in SLOTS:
                if record := load(key, binding, slot):
                    user = record["user"]
                    cache_key = hmac.digest(key, json.dumps(["cache", expected_origin, owner, user["id"]]).encode(), "sha256")
                    account = {"slot": slot, "user": user, "cache": b64(cache_key)}
                    accounts.append(account)
            return jsonify(accounts=accounts)
        if op == "login":
            rate(("login", owner), 5, 300)
            username = field(body, "username", 30, r"[A-Za-z0-9_.]+")
            password = field(body, "password", 512)
            code = field(body, "code", 8, r"[0-9]{6,8}", optional=True)
            pending = load(key, binding, "verify") if code else None
            cl = client(pending["settings"] if pending and pending["username"] == username else None)
            existing = [(slot, load(key, binding, slot)) for slot in SLOTS]
            slot = next((s for s, r in existing if r and (r["user"]["username"] or "").lower() == username.lower()), None)
            slot = slot or next((s for s, r in existing if r is None), None)
            if slot is None:
                raise Failure("ACCOUNT_LIMIT", 409)
            try:
                if not cl.login(username, password, verification_code=code):
                    raise Failure("LOGIN_FAILED", 401)
            except ig.TwoFactorRequired:
                response = jsonify(error="TWO_FACTOR")
                response.status_code = 409
                return set_session(response, key, binding, "verify", {"username": username, "settings": cl.get_settings()}, 300)
            if not cl.user_id:
                raise Failure("LOGIN_FAILED", 401)
            user = {"id": str(cl.user_id), "username": username}
            response = jsonify(slot=slot)
            set_session(response, key, binding, "verify")
            return set_session(response, key, binding, slot, {"settings": cl.get_settings(), "user": user})
        slot = field(body, "slot", 1, r"[abc]")
        record = load(key, binding, slot)
        if op == "logout":
            if record:
                try:
                    client(record["settings"]).logout()
                except ig.ClientError:
                    pass
            return set_session(jsonify(ok=True), key, binding, slot)
        if not record:
            raise Failure("IG_SESSION", 401)
        cl = client(record["settings"])
        if op in ("upload_post", "upload_story", "send_photo"):
            rate(("upload", owner), 6, 300)
        data = dispatch(cl, op, body)
        return jsonify(data)
    except Failure:
        raise
    except (ig.PleaseWaitFewMinutes, ig.RateLimitError, ig.FeedbackRequired):
        raise Failure("RATE_LIMIT", 429) from None
    except (ig.ChallengeRequired, ig.CaptchaChallengeRequired):
        raise Failure("CHALLENGE", 409) from None
    except (ig.BadPassword, ig.BadCredentials, ig.TwoFactorRequired):
        raise Failure("LOGIN_FAILED", 401) from None
    except (ig.LoginRequired, ig.ClientLoginRequired):
        raise Failure("IG_SESSION", 401) from None
    except (ig.ClientNotFoundError, ig.DirectThreadNotFound, ig.DirectMessageNotFound):
        raise Failure("NOT_FOUND", 404) from None
    except (ig.ClientError, requests.RequestException) as error:
        upstream_status = getattr(getattr(error, "response", None), "status_code", None)
        app.logger.warning("xerogram upstream op=%s category=%s status=%s",
                           op, type(error).__name__, upstream_status)
        code = "IG_LOGIN_UPSTREAM" if op == "login" else "UPSTREAM"
        raise Failure(code, 502) from None
    except Exception as error:
        app.logger.error("xerogram internal op=%s category=%s", op, type(error).__name__)
        raise Failure("INTERNAL", 500) from None
