"""
Phase I2e: consistent JSON errors for mobile / WeChat clients.

Web UI may still read success/message; mini-program should prefer error + code.
"""
from __future__ import annotations

from flask import jsonify


def api_error(message: str, code: str, status: int = 400, **extra):
    """Return (jsonify(...), status) with error + code fields."""
    body = {"error": message, "code": code}
    body.update(extra)
    return jsonify(body), status


def login_failure_response():
    """401 — invalid credentials (cookie + v1 login)."""
    return jsonify(
        {
            "success": False,
            "message": "Invalid username or password",
            "error": "Invalid username or password",
            "code": "AUTH_INVALID_CREDENTIALS",
        }
    ), 401


def bearer_auth_failure_response():
    """401 — missing or invalid Bearer token."""
    return jsonify(
        {
            "success": False,
            "message": "Invalid or expired access token",
            "error": "Invalid or expired access token",
            "code": "AUTH_INVALID_TOKEN",
        }
    ), 401


def teacher_not_authorized_response():
    """403 — teacher pending manager approval."""
    return jsonify(
        {
            "success": False,
            "message": "This teacher account is not authorized yet. Please contact your manager.",
            "error": "This teacher account is not authorized yet. Please contact your manager.",
            "code": "AUTH_TEACHER_NOT_AUTHORIZED",
        }
    ), 403
