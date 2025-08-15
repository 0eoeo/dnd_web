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
