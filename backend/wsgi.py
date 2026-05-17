"""
WSGI entry for production (Gunicorn, uWSGI, etc.).

Example:
  cd backend && source venv/bin/activate
  gunicorn -w 2 -b 0.0.0.0:5051 wsgi:app
"""
from app import app  # noqa: F401
