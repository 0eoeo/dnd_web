from rest_framework import serializers
from .models import (
    CharacterSheet, Roll, LoreFolder, MediaFolder,
    LoreArticle, LoreArticleImage, LoreArticleComment, MediaAsset, CharacterSheetRevision
)

class CharacterSheetSerializer(serializers.ModelSerializer):
    class Meta:
        model = CharacterSheet
        fields = ["id", "logical_key", "name", "data", "pdf", "created_at", "updated_at"]


class CharacterSheetRevisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CharacterSheetRevision
        fields = ["id", "sheet", "logical_key", "version", "name", "data", "pdf", "created_at"]


class LoreFolderSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoreFolder
        fields = ['id', 'title', 'created_at']


class MediaFolderSerializer(serializers.ModelSerializer):
    class Meta:
        model = MediaFolder
        fields = ['id', 'title', 'created_at']


class LoreArticleImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoreArticleImage
        fields = ['id', 'image']


class LoreArticleSerializer(serializers.ModelSerializer):
    images = LoreArticleImageSerializer(many=True, read_only=True)
    author = serializers.StringRelatedField()

    class Meta:
        model = LoreArticle
        fields = [
            'id', 'title', 'excerpt', 'content', 'folder',
            'cover', 'images', 'created_at', 'updated_at', 'author'
        ]


class LoreArticleCommentSerializer(serializers.ModelSerializer):
    author = serializers.StringRelatedField()

    class Meta:
        model = LoreArticleComment
        fields = ['id', 'article', 'author', 'content', 'created_at']


class MediaAssetSerializer(serializers.ModelSerializer):
    author = serializers.StringRelatedField()

    class Meta:
        model = MediaAsset
        fields = [
            'id', 'kind', 'folder', 'file', 'title',
            'description', 'author', 'uploaded_at'
        ]

class RollSerializer(serializers.ModelSerializer):
    class Meta:
        model = Roll
        fields = "__all__"