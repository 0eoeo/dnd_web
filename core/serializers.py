from rest_framework import serializers
from .models import LoreFolder, MediaFolder

class LoreFolderSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoreFolder
        fields = ['id','title','created_at']

class MediaFolderSerializer(serializers.ModelSerializer):
    class Meta:
        model = MediaFolder
        fields = ['id','title','created_at']
