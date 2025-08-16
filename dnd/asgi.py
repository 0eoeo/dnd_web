import os
from pathlib import Path

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter

from starlette.applications import Starlette
from starlette.staticfiles import StaticFiles
from starlette.routing import Mount

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'dnd.settings')

django_asgi_app = get_asgi_application()

# Импорты после инициализации Django
from core.routing import websocket_urlpatterns  # noqa

BASE_DIR = Path(__file__).resolve().parent.parent
MEDIA_ROOT = BASE_DIR / 'media'

media_app = StaticFiles(directory=str(MEDIA_ROOT), check_dir=True)  # лучше True, чтобы видеть ошибки пути

application = ProtocolTypeRouter({
    'http': Starlette(routes=[
        Mount('/media', app=media_app),          # 1) сначала media
        Mount('/', app=django_asgi_app),         # 2) затем Django
    ]),
    'websocket': URLRouter(websocket_urlpatterns),
})
