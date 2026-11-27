"""Xerogram boundary checks with Instagram and XeroxYT substitutes."""
import json
import os
import unittest
from unittest.mock import Mock, PropertyMock, patch

from api import xerogram as x


class XerogramTest(unittest.TestCase):
    origin = "https://localhost"

    def setUp(self):
        env = patch.dict(os.environ, {"XEROGRAM_SECRET": "1" * 64,
                                      "API_BASE_URL": "https://account.example.workers.dev"})
        env.start()
        self.addCleanup(env.stop)
        self.browser = x.app.test_client()
        with x.limit_lock:
            x.limits.clear()

    def post(self, op, **args):
        return self.browser.post("/api/xerogram", headers={"Origin": self.origin}, json={"op": op, **args})

    def cookie(self, user="11", slot="a", owner="owner", digest="session"):
        binding = json.dumps([self.origin, owner, digest]).encode() + slot.encode()
        record = {"user": {"id": user, "username": "test"}, "settings": x.client().get_settings()}
        self.browser.set_cookie(x.cookie_name(slot), x.seal(x.setting_key(), binding, record, 400))

    def test_origin_and_site_session_required(self):
        response = self.browser.post("/api/xerogram", headers={"Origin": "https://example.net"}, json={"op": "status"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.post("status").status_code, 401)

    def test_account_binding_and_cache_key_separation(self):
        self.cookie()
        self.cookie(user="22", slot="b")
        with patch.object(x, "site_owner", return_value=("owner", "session")):
            accounts = self.post("status").json["accounts"]
            self.assertEqual([account["user"]["id"] for account in accounts], ["11", "22"])
            self.assertNotEqual(accounts[0]["cache"], accounts[1]["cache"])
            with patch.object(x, "dispatch", return_value=x.page([{"id": "123"}])):
                self.assertEqual(self.post("feed", slot="a").json["items"], [{"id": "123"}])
        with patch.object(x, "site_owner", return_value=("other", "session")):
            self.assertEqual(self.post("status").json, {"accounts": []})
            self.assertEqual(self.post("feed", slot="a").status_code, 401)

    def test_login_keeps_password_and_session_settings_out_of_response(self):
        client = Mock()
        client.login.return_value = True
        client.user_id = 11
        client.get_settings.return_value = x.client().get_settings()
        with patch.object(x, "site_owner", return_value=("owner", "session")), patch.object(x, "client", return_value=client):
            response = self.post("login", username="test", password="sample-password")
        self.assertEqual(response.json, {"slot": "a"})
        client.account_info.assert_not_called()
        cookies = response.headers.getlist("Set-Cookie")
        self.assertTrue(all("HttpOnly" in cookie and "Secure" in cookie for cookie in cookies))
        self.assertNotIn("sample-password", "".join(cookies))

    def test_rate_errors_have_retry_after(self):
        self.cookie()
        with patch.object(x, "site_owner", return_value=("owner", "session")), patch.object(x, "dispatch", side_effect=x.ig.RateLimitError()):
            response = self.post("feed", slot="a")
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers.get("Retry-After"), "60")

    def test_two_factor_continues_without_password_or_restarting_login(self):
        initial = x.client()
        restored = x.client()
        challenge = x.ig.TwoFactorRequired(
            "verification required", two_step_verification_context="example-context",
            sms_two_factor_on=True,
        )
        with patch.object(x, "site_owner", return_value=("owner", "session")), patch.object(
            x, "client", side_effect=[initial, restored]
        ) as factory, patch.object(initial, "login", side_effect=challenge):
            response = self.post("login", username="test", password="sample-password")
            self.assertEqual(response.json, {"error": "TWO_FACTOR", "passwordRequired": False})
            with patch.object(restored, "_login_with_bloks_two_factor", return_value=True) as verify, patch.object(
                type(restored), "user_id", new_callable=PropertyMock,
                return_value=11,
            ), patch.object(restored, "login") as login:
                response = self.post("login", username="test", code="123456")
            self.assertEqual(response.json, {"slot": "a"})
            self.assertEqual(verify.call_args.args[1]["two_step_verification_context"], "example-context")
            login.assert_not_called()
            self.assertIsNotNone(factory.call_args.args[0])

    def test_profile_verification_requests_code_and_submits_it_through_login(self):
        initial, restored = x.client(), x.client()
        with patch.object(x, "site_owner", return_value=("owner", "session")), patch.object(
            x, "client", side_effect=[initial, restored]
        ) as factory, patch.object(
            initial, "bloks_caa_login",
            side_effect=lambda **_: initial.challenge_code_handler("test", None),
        ):
            response = self.post("login", username="test", password="sample-password")
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.json, {"error": "TWO_FACTOR", "passwordRequired": True})
            with patch.object(restored, "login", return_value=True) as login, patch.object(
                type(restored), "user_id", new_callable=PropertyMock, return_value=11,
            ):
                response = self.post("login", username="test", password="sample-password", code="123456")
            self.assertEqual(response.json, {"slot": "a"})
            login.assert_called_once_with("test", "sample-password", verification_code="123456")
            self.assertIsNotNone(factory.call_args.args[0])

    def test_login_diagnostic_omits_credentials_and_raw_instagram_errors(self):
        instance = x.client()
        error = x.ig.BadPassword("sensitive upstream detail", response=Mock(status_code=400))
        with patch.object(x, "site_owner", return_value=("owner", "session")), patch.object(
            x, "client", return_value=instance
        ), patch.object(instance, "login", side_effect=error), self.assertLogs(x.app.logger, "WARNING") as logs:
            response = self.post("login", username="private_user", password="private_password", code="123456")
        self.assertEqual(response.json, {"error": "LOGIN_FAILED"})
        entry, = logs.output
        self.assertIn("stage=instagram_code result=LOGIN_FAILED http=401 error_type=BadPassword upstream_http=400", entry)
        for value in ("private_user", "private_password", "123456", "sensitive upstream detail"):
            self.assertNotIn(value, entry)

    def test_upgrade_rejection_is_not_reported_as_connection_failure(self):
        instance = x.client()
        with patch.object(x, "site_owner", return_value=("owner", "session")), patch.object(
            x, "client", return_value=instance
        ), patch.object(instance, "login", side_effect=x.ig.ClientNeedsUpgradeError()):
            response = self.post("login", username="test", password="sample-password")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json, {"error": "IG_CLIENT_UPGRADE"})
