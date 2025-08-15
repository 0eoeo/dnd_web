import json
from channels.generic.websocket import AsyncWebsocketConsumer

class RollConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.channel_layer.group_add("rolls", self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard("rolls", self.channel_name)

    async def roll_created(self, event):
        item = event.get("item")
        if item is not None:
            await self.send(text_data=json.dumps({"type": "roll", "item": item}))

class ArtConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # В будущем можно делать комнаты: art:<campaign_id>
        await self.channel_layer.group_add("art", self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard("art", self.channel_name)

    async def media_created(self, event):
        item = event.get("item")
        if item:
            await self.send(text_data=json.dumps({"type": "media", "item": item}))

    # Сообщение о новой статье
    async def article(self, event):
        await self.send(text_data=json.dumps({"type": "article", "item": event.get("item")}))

    # Комментарии к статье (исторически у вас было lore_comment)
    async def lore_comment(self, event):
        await self.send(text_data=json.dumps({"type": "lore_comment", "item": event.get("item")}))