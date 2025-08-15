from django.urls import re_path
from .consumers import RollConsumer

websocket_urlpatterns = [
    re_path(r"^ws/rolls/?$", RollConsumer.as_asgi()),
]
