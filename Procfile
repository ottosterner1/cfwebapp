release: FLASK_APP=wsgi.py flask db upgrade
web: gunicorn wsgi:app --bind 0.0.0.0:$PORT