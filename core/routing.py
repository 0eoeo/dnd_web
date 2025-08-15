from django.urls import re_path
from .consumers import RollConsumer, ArtConsumer

websocket_urlpatterns = [
    re_path(r"^ws/rolls/?$", RollConsumer.as_asgi()),
    re_path(r"^ws/art/?$", ArtConsumer.as_asgi()),
]
