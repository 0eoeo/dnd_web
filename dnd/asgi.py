import os
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "dnd.settings")

django_asgi_app = get_asgi_application()

from core.routing import websocket_urlpatterns  # импорт после инициализации Django

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": URLRouter(websocket_urlpatterns),
})
