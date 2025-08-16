import os
from pathlib import Path

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter

# Добавлено: Starlette для статики
from starlette.applications import Starlette
from starlette.staticfiles import StaticFiles
from starlette.routing import Mount

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "dnd.settings")

# Инициализируем Django (apps, settings и т.п.)
django_asgi_app = get_asgi_application()

# Импорт после инициализации Django
from core.routing import websocket_urlpatterns  # noqa: E402

# MEDIA: путь к директории и ASGI-приложение для статики
BASE_DIR = Path(__file__).resolve().parent.parent
MEDIA_ROOT = BASE_DIR / "media"
media_app = StaticFiles(directory=str(MEDIA_ROOT), check_dir=False)

# Собираем финальное приложение:
application = ProtocolTypeRouter({
    "http": Starlette(routes=[
        Mount("/media", app=media_app),  # раздача MEDIA
        Mount("/", app=django_asgi_app),
    ]),
    "websocket": URLRouter(websocket_urlpatterns),
})
