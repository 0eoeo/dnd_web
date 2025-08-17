import os
from pathlib import Path

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'dnd.settings')

from django.conf import settings
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from starlette.applications import Starlette
from starlette.staticfiles import StaticFiles
from starlette.routing import Mount

django_asgi_app = get_asgi_application()

# Гарантируем существование MEDIA_ROOT
Path(settings.MEDIA_ROOT).mkdir(parents=True, exist_ok=True)

application = ProtocolTypeRouter({
    "http": Starlette(routes=[
        # сначала медиa, затем django
        Mount("/media/", app=StaticFiles(directory=str(settings.MEDIA_ROOT), check_dir=True), name="media"),
        Mount("/", app=django_asgi_app),
    ]),
    "websocket": URLRouter(__import__("core.routing").routing.websocket_urlpatterns),
})
