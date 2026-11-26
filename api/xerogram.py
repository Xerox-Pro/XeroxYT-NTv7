"""Same-origin, signed-in Instagram operations for Xerogram."""

import base64
import hashlib
import hmac
import json
import logging
import os
import re
from urllib.parse import urlsplit
import zlib

from cryptography.fernet import Fernet, InvalidToken
from flask import Flask, jsonify, request
from instagrapi import Client
from instagrapi import exceptions as ig
from instagrapi.extractors import extract_direct_message, extract_direct_thread, extract_media_v1

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8192
SESSION = "__Host-xerogram-session"
VERIFY = "__Host-xerogram-verify"
SESSION_AGE = 7 * 24 * 60 * 60
VERIFY_AGE = 300
ID = re.compile(r"[0-9]{1,45}")
CURSOR = re.compile(r"[!-~]{1,2048}")
HANDLE = re.compile(r"[A-Za-z0-9._@+\-]{1,254}")
CODE = re.compile(r"[0-9]{6,8}")
MEDIA_TYPE = {"media", "media_share", "clip", "image", "video"}

silent = logging.Logger("xerogram.instagram", level=logging.CRITICAL + 1)
silent.propagate = False


class InvalidInput(ValueError):
    pass


class ProviderTimeout(Exception):
    pass


class Instagram(Client):
    private_request_logger = silent
    read_timeout = 10

    def _send_private_request(self, endpoint, **kwargs):
        try:
            return super()._send_private_request(endpoint, **kwargs)
        except (ig.ClientRequestTimeout, ig.ClientIncompleteReadError) as error:
            # The library normally retries these, including after a timed-out write.
            raise ProviderTimeout() from error


def new_client(settings=None):
    client = Instagram(
        settings=settings or {
            "locale": "ja_JP", "country": "JP", "country_code": 81,
            "timezone_offset": 32400, "timezone_name": "Asia/Tokyo",
        },
        request_timeout=0,
        public_request_retries_count=0,
        session_retry_total=0,
        with_challenge_flow=False,
        push_disabled=True,
        logger=silent,
    )
    client.private.trust_env = False
    client.public.trust_env = False
    return client


def seal_key():
    value = os.environ.get("XEROGRAM_SECRET", "")
    if len(value) < 43:
        return None
    return value.encode()


def signed_value(key, purpose, message=b""):
    return hmac.digest(key, purpose.encode() + b"\0" + message, hashlib.sha256)


def cipher(key, purpose):
    return Fernet(base64.urlsafe_b64encode(signed_value(key, purpose)))


def cookie(response, name, value, max_age):
    response.set_cookie(name, value, max_age=max_age, secure=True,
                        httponly=True, samesite="Strict", path="/")
    return response


def save_state(response, name, key, state, ttl):
    serialized = json.dumps(state, ensure_ascii=True, separators=(",", ":")).encode()
    token = cipher(key, name).encrypt(zlib.compress(serialized)).decode()
    if len(token) > 3900:
        return failure("session_size", 502)
    return cookie(response, name, token, ttl)


def load_state(name, key, ttl):
    token = request.cookies.get(name, "")
    if not token or len(token) > 3900:
        return None
    try:
        packed = cipher(key, name).decrypt(token.encode(), ttl=ttl)
        plaintext = zlib.decompressobj().decompress(packed, 32769)
        if len(plaintext) > 32768:
            return None
        return json.loads(plaintext)
    except (InvalidToken, ValueError, zlib.error):
        return None


def failure(code, status):
    return jsonify(error=code), status


def field(body, name, pattern):
    value = body.get(name)
    if not isinstance(value, str) or not pattern.fullmatch(value):
        raise InvalidInput()
    return value


def identifier(body, name="id"):
    return field(body, name, ID)


def user_text(body, limit):
    text = body.get("text")
    if not isinstance(text, str) or not text.strip() or len(text) > limit:
        raise InvalidInput()
    return text.strip()


def value_of(obj, key, default=None):
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def safe_url(value):
    if not value:
        return ""
    try:
        url = str(value)
        parsed = urlsplit(url)
        host = parsed.hostname or ""
        if (parsed.scheme == "https" and not parsed.username and not parsed.password
                and parsed.port in (None, 443)
                and host.endswith((".cdninstagram.com", ".fbcdn.net", ".fbsbx.com"))):
            return url
    except ValueError:
        pass
    return ""


def person(obj):
    return {
        "id": str(value_of(obj, "pk") or value_of(obj, "id") or ""),
        "handle": value_of(obj, "username", "") or "",
        "name": value_of(obj, "full_name", "") or "",
        "avatar": safe_url(value_of(obj, "profile_pic_url")),
        "verified": bool(value_of(obj, "is_verified", False)),
        "private": bool(value_of(obj, "is_private", False)),
    }


def attachment(obj):
    return {"image": safe_url(value_of(obj, "thumbnail_url")),
            "video": safe_url(value_of(obj, "video_url"))}


def media(obj, raw=None):
    raw = raw or {}
    return {
        "id": str(obj.pk),
        "code": obj.code or "",
        "user": person(obj.user),
        "caption": obj.caption_text or "",
        "time": obj.taken_at.isoformat() if obj.taken_at else "",
        "likes": obj.like_count,
        "comments": obj.comment_count,
        "liked": raw.get("has_liked", value_of(obj, "has_liked")),
        "saved": raw.get("has_viewer_saved"),
        "assets": [attachment(resource) for resource in obj.resources] or [attachment(obj)],
    }


def extract_feed(items):
    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        raw = item.get("media_or_ad") or item.get("media")
        if not isinstance(raw, dict) or raw.get("ad_id") or raw.get("is_ad"):
            continue
        try:
            result.append(media(extract_media_v1(dict(raw)), raw))
        except (TypeError, ValueError, KeyError, IndexError):
            continue
    return result


def thread(row, viewer):
    return {"id": str(row.id), "title": row.thread_title,
            "users": [person(user) for user in row.users if str(user.pk) != viewer],
            "time": row.last_activity_at.isoformat() if row.last_activity_at else "",
            "muted": row.muted}


def message(row, viewer):
    kind = row.item_type or ""
    if row.is_shh_mode or kind in {"visual_media", "raven_media", "view_once"}:
        return None
    own = str(row.user_id) == viewer
    unsent = kind in {"unsent", "deleted", "message_unsent"}
    shared = row.media_share or row.clip
    assets = attachment(shared) if shared else {}
    if kind in MEDIA_TYPE and row.media:
        assets = {"image": safe_url(value_of(row.media, "thumbnail_url")),
                  "video": safe_url(value_of(row.media, "video_url"))}
    return {"id": str(row.id), "sender": str(row.user_id or ""), "own": own,
            "time": row.timestamp.isoformat(), "kind": kind, "unsent": unsent,
            "text": "" if unsent else str(row.text or value_of(row.link, "text") or ""),
            "image": assets.get("image", "") if not unsent else "",
            "video": assets.get("video", "") if not unsent else "",
            "media": str(shared.pk) if shared and not unsent else ""}


def page(items, cursor=None):
    return {"items": items, "next": str(cursor or "")}


def comments_item(item):
    return {"id": str(item.pk), "text": item.text, "user": person(item.user)}


def mutation(ok):
    if not ok:
        return failure("provider_rejected", 409)
    return {"ok": True}


def run_action(client, viewer, action, body):
    cursor = field(body, "cursor", CURSOR) if body.get("cursor") else ""
    if action == "feed":
        data = client.get_timeline_feed(max_id=cursor or None)
        return page(extract_feed(data.get("feed_items", [])[:48]), data.get("next_max_id"))
    if action == "reels":
        endpoints = {"all": "clips/discover/", "following": "clips/connected/", "friends": "clips/discover/social/"}
        endpoint = endpoints.get(body.get("mode", "all"))
        if endpoint is None:
            raise InvalidInput()
        data = client.private_request(endpoint, data=" ", params={"max_id": cursor})
        paging = data.get("paging_info") or {}
        return page(extract_feed((data.get("items") or data.get("items_with_ads") or [])[:24]), paging.get("max_id") or data.get("next_max_id"))
    if action == "stories":
        data = client.get_reels_tray_feed()
        return page([person(row["user"]) for row in data.get("tray", [])[:80] if row.get("user")])
    if action == "story":
        items = client.user_stories_v1(identifier(body), amount=30)
        return page([{"id": str(item.pk), **attachment(item), "user": person(item.user),
                      "time": item.taken_at.isoformat()} for item in items])
    if action == "suggestions":
        user_id = identifier(body) if body.get("id") else viewer
        data = client.chaining(user_id)
        rows = data.get("users") or data.get("suggested_users") or data.get("suggestions") or []
        return page([person(row.get("user") or row) for row in rows[:40] if isinstance(row, dict)])
    if action == "search":
        query = user_text(body, 80)
        if query.startswith("#") and len(query) > 1:
            tag = query[1:]
            if not re.fullmatch(r"[\w]+", tag):
                raise InvalidInput()
            return {"view": "media", **page([media(item) for item in client.hashtag_medias_top_v1(tag, amount=12)])}
        return {"view": "people", **page([person(item) for item in client.search_users_v1(query.lstrip("@"), 30)])}
    if action == "profile":
        user_id = identifier(body) if body.get("id") else viewer
        obj = client.user_info_v1(user_id)
        relationship = client.user_friendship_v1(user_id) if user_id != viewer else None
        return {**person(obj), "bio": obj.biography, "posts": obj.media_count,
                "followers": obj.follower_count, "following": obj.following_count,
                "relationship": {"following": relationship.following, "pending": relationship.outgoing_request} if relationship else None}
    if action in {"posts", "profile_reels", "saved"}:
        user_id = identifier(body) if body.get("id") else viewer
        if action == "posts":
            items, next_id = client.user_medias_paginated_v1(user_id, amount=15, end_cursor=cursor)
        elif action == "profile_reels":
            items, next_id = client.user_clips_chunk_v1(user_id, end_cursor=cursor)
        else:
            items, next_id = client.collection_medias_v1_chunk("ALL_MEDIA_AUTO_COLLECTION", max_id=cursor)
        return page([media(item) for item in items], next_id)
    if action in {"followers", "following"}:
        user_id = identifier(body) if body.get("id") else viewer
        finder = client.user_followers_v1_chunk if action == "followers" else client.user_following_v1_chunk
        items, next_id = finder(user_id, max_amount=30, max_id=cursor)
        return page([person(item) for item in items], next_id)
    if action == "post":
        media_id = identifier(body)
        data = client.private_request(f"media/{media_id}/info/")
        items = extract_feed([{"media": item} for item in data.get("items", [])])
        return {"item": items[0]} if items else failure("not_found", 404)
    if action == "comments":
        items, next_id = client.media_comments_chunk(identifier(body), max_amount=20, min_id=cursor or None)
        return page([comments_item(item) for item in items], next_id)
    if action == "comment":
        return {"item": comments_item(client.media_comment(identifier(body), user_text(body, 1000)))}
    if action in {"like", "unlike", "save", "unsave", "follow", "unfollow"}:
        operation = {"like": client.media_like, "unlike": client.media_unlike,
                     "save": client.media_save, "unsave": client.media_unsave,
                     "follow": client.user_follow, "unfollow": client.user_unfollow}[action]
        return mutation(operation(identifier(body)))
    if action in {"inbox", "requests"}:
        if action == "inbox":
            items, next_id = client.direct_threads_chunk(thread_message_limit=1, cursor=cursor or None)
        else:
            items, next_id = client.direct_pending_chunk(cursor=cursor or None)
        return page([thread(item, viewer) for item in items], next_id)
    if action == "messages":
        thread_id = identifier(body)
        params = {"visual_message_return_type": "unseen", "direction": "older", "limit": "20"}
        if cursor:
            params["cursor"] = cursor
        data = client.private_request(f"direct_v2/threads/{thread_id}/", params=params)["thread"]
        detailed = extract_direct_thread({**data, "items": []})
        items = []
        for entry in data.get("items", []):
            if not isinstance(entry, dict):
                continue
            try:
                item = message(extract_direct_message(entry.copy()), viewer)
            except (ValueError, TypeError, KeyError):
                continue
            if item:
                if entry.get("is_unsent") is True:
                    item.update(unsent=True, text="", image="", video="", media="")
                items.append(item)
        return {**page(items, data.get("oldest_cursor") if data.get("has_older", True) else ""),
                "thread": thread(detailed, viewer)}
    if action == "send":
        thread_id = identifier(body) if body.get("id") else ""
        target = [int(identifier(body, "user"))] if not thread_id else []
        item = client.direct_send(user_text(body, 1000), thread_ids=[int(thread_id)] if thread_id else [],
                                  user_ids=target, send_attribute="inbox" if thread_id else "message_button")
        return {"item": message(item, viewer), "threadId": str(item.thread_id or thread_id)}
    if action == "unsend":
        thread_id = int(identifier(body))
        message_id = int(identifier(body, "message"))
        original = client.direct_message(thread_id, message_id, amount=20)
        if str(original.user_id) != viewer or original.is_shh_mode:
            return failure("not_found", 404)
        return mutation(client.direct_message_delete(thread_id, message_id))
    if action in {"mute", "unmute", "mark_unread"}:
        operation = {"mute": client.direct_thread_mute, "unmute": client.direct_thread_unmute,
                     "mark_unread": client.direct_thread_mark_unread}[action]
        return mutation(operation(int(identifier(body))))
    if action == "notes":
        return page([{"id": str(item.id), "text": item.text, "user": person(item.user)}
                     for item in client.get_notes()])
    if action == "note":
        from instagrapi.mixins.note import NoteAudience
        audience = NoteAudience.CLOSE_FRIENDS if body.get("closeFriends") is True else NoteAudience.MUTUAL_FOLLOWERS
        client.create_note(user_text(body, 60), audience)
        return {"ok": True}
    if action == "delete_note":
        note_id = identifier(body)
        mine = any(str(item.id) == note_id and str(item.user.pk) == viewer for item in client.get_notes())
        if not mine:
            return failure("not_found", 404)
        return mutation(client.delete_note(int(note_id)))
    raise InvalidInput()


def login(body, key, verify):
    username = field(body, "username", HANDLE)
    password = body.get("password")
    if not isinstance(password, str) or not password or len(password) > 512:
        raise InvalidInput()
    settings = None
    code = ""
    if verify:
        pending = load_state(VERIFY, key, VERIFY_AGE)
        if not pending or pending["username"] != username:
            return failure("verify_expired", 409)
        settings = pending["settings"]
        code = field(body, "code", CODE)
    client = new_client(settings)
    try:
        if not client.login(username, password, verification_code=code) or not client.user_id:
            return failure("login_failed", 401)
    except ig.TwoFactorRequired:
        response = jsonify(error="two_factor")
        response.status_code = 409
        return save_state(response, VERIFY, key, {"username": username, "settings": client.get_settings()}, VERIFY_AGE)
    account = client.account_info()
    user = person(account)
    if user["id"] != str(client.user_id) or not ID.fullmatch(user["id"]):
        return failure("login_failed", 401)
    response = jsonify(session_view(key, user))
    cookie(response, VERIFY, "", 0)
    return save_state(response, SESSION, key, {"user": user, "settings": client.get_settings()}, SESSION_AGE)


def session_view(key, user):
    account = user["id"].encode()
    cache_key = signed_value(key, "xerogram-cache-v1", request.host.lower().encode() + b"\0" + account)
    return {"user": user, "cacheKey": base64.b64encode(cache_key).decode()}


@app.after_request
def private_response(response):
    response.headers["Cache-Control"] = "private, no-store, max-age=0"
    response.headers["CDN-Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.post("/api/xerogram")
def dispatch():
    host = request.host.lower()
    local = host.startswith(("127.0.0.1:", "localhost:")) and not os.environ.get("VERCEL")
    origin = ("http://" if local else "https://") + host
    if request.headers.get("Origin") != origin or request.headers.get("Sec-Fetch-Site", "same-origin") != "same-origin":
        return failure("forbidden", 403)
    if request.mimetype != "application/json" or request.headers.get("X-Xerogram") != "1":
        return failure("invalid_request", 415)
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or not isinstance(body.get("action"), str):
        return failure("invalid_request", 400)
    key = seal_key()
    if key is None:
        return failure("configuration", 503)
    action = body["action"]
    try:
        if action in {"login", "verify"}:
            return login(body, key, action == "verify")
        session = load_state(SESSION, key, SESSION_AGE)
        if action == "session":
            return session_view(key, session["user"]) if session else {"user": None}
        if action == "logout":
            revoked = False
            if session:
                try:
                    revoked = bool(new_client(session["settings"]).logout())
                except (ig.ClientError, ProviderTimeout):
                    pass
            response = jsonify(ok=True, revoked=revoked)
            cookie(response, VERIFY, "", 0)
            return cookie(response, SESSION, "", 0)
        if not session:
            return failure("signed_out", 401)
        client = new_client(session["settings"])
        viewer = session["user"]["id"]
        if str(client.user_id) != viewer:
            return failure("signed_out", 401)
        return run_action(client, viewer, action, body)
    except InvalidInput:
        return failure("invalid_request", 400)
    except (ig.BadPassword, ig.BadCredentials):
        return failure("login_failed", 401)
    except (ig.LoginRequired, ig.ClientLoginRequired):
        response = jsonify(error="signed_out")
        response.status_code = 401
        return cookie(response, SESSION, "", 0)
    except (ig.ChallengeError, ig.SentryBlock, ig.AccountSuspended):
        return failure("challenge", 409)
    except (ig.PleaseWaitFewMinutes, ig.ClientThrottledError, ig.FeedbackRequired, ig.RateLimitError):
        return failure("provider_rate_limit", 429)
    except (ig.ClientNotFoundError, ig.NotFoundError):
        return failure("not_found", 404)
    except (ProviderTimeout, TimeoutError):
        return failure("provider_timeout", 504)
    except (ig.ClientError, KeyError, TypeError, ValueError, AttributeError, IndexError) as error:
        # Provider exceptions may include signed headers, request bodies and private data.
        app.logger.warning("Instagram operation failed (%s)", type(error).__name__)
        return failure("provider_error", 502)
