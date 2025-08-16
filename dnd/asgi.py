# asgi.py
import os
from pathlib import Path
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from starlette.applications import Starlette
from starlette.staticfiles import StaticFiles
from starlette.routing import Mount
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'dnd.settings')
django_asgi_app = get_asgi_application()

from core.routing import websocket_urlpatterns  # noqa

# Гарантия: создаём MEDIA_ROOT, если нет
Path(settings.MEDIA_ROOT).mkdir(parents=True, exist_ok=True)

media_app = StaticFiles(directory=str(settings.MEDIA_ROOT), check_dir=True)

application = ProtocolTypeRouter({
    "http": Starlette(routes=[
        Mount("/media", app=media_app),
        Mount("/", app=django_asgi_app),
    ]),
    "websocket": URLRouter(websocket_urlpatterns),
})
