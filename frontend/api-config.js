/**
 * Flask API base URL — must match the address printed when you start backend/app.py.
 *
 * Default backend port is 5050 (see backend/app.py) because macOS often reserves port 5000.
 * If you run Flask with PORT=5000, change this string to http://127.0.0.1:5000
 *
 * Open the UI at http://127.0.0.1:5050/ui/index.html (same origin as /api/*) so session
 * cookies work when EAP_REQUIRE_SESSION_IDENTITY=1. Do not use file:// for teacher/student pages.
 */
/** Agent-window fork — default port 5051 (Desktop eap_platform uses 5050). */
window.EAP_API_BASE = "http://127.0.0.1:5051";
