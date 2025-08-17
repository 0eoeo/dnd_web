from rest_framework import serializers
from .models import (
    CharacterSheet, Roll, LoreFolder, MediaFolder,
    LoreArticle, LoreArticleImage, LoreArticleComment, MediaAsset, CharacterSheetRevision
)

class CharacterSheetSerializer(serializers.ModelSerializer):
    avatar = serializers.ImageField(write_only=True, required=False, allow_null=True)
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = CharacterSheet
        fields = ["id","logical_key","name","data","pdf","avatar","avatar_url","created_at","updated_at"]

    def get_avatar_url(self, obj):
        try:
            return obj.avatar.url if obj.avatar else ''
        except ValueError:
            return ''


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
    url = serializers.SerializerMethodField()

    class Meta:
        model = LoreArticleImage
        fields = ['id', 'url']  # вместо 'image' отдаем единое 'url'

    def get_url(self, obj):
        try:
            return obj.image.url if obj.image else ''
        except ValueError:
            return ''


# serializers.py
class LoreArticleSerializer(serializers.ModelSerializer):
    cover = serializers.ImageField(write_only=True, required=False, allow_null=True)
    cover_url = serializers.SerializerMethodField()
    images = LoreArticleImageSerializer(many=True, read_only=True)
    author = serializers.StringRelatedField()

    class Meta:
        model = LoreArticle
        fields = [
            'id', 'title', 'excerpt', 'content', 'folder',
            'cover',        # ← write_only
            'cover_url',    # ← read_only из метода
            'images', 'created_at', 'updated_at', 'author'
        ]

    def get_cover_url(self, obj):
        try:
            return obj.cover.url if obj.cover else ''
        except ValueError:
            return ''


class LoreArticleCommentSerializer(serializers.ModelSerializer):
    author = serializers.StringRelatedField()

    class Meta:
        model = LoreArticleComment
        fields = ['id', 'article', 'author', 'content', 'created_at']


class MediaAssetSerializer(serializers.ModelSerializer):
    author = serializers.StringRelatedField(read_only=True)
    file = serializers.FileField(write_only=True, required=True, allow_empty_file=False)
    url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = MediaAsset
        fields = [
            'id', 'kind', 'folder',
            'file',            # ← write_only
            'url',             # ← read_only
            'title', 'description',
            'author', 'uploaded_at'
        ]

    def validate(self, attrs):
        f = attrs.get('file')
        kind = attrs.get('kind')
        if not f:
            raise serializers.ValidationError({'file': 'Файл обязателен'})
        ct = getattr(f, 'content_type', '').lower()
        if not kind:
            if ct.startswith('image/'):
                attrs['kind'] = MediaAsset.MEDIA_IMAGE
            elif ct.startswith('video/'):
                attrs['kind'] = MediaAsset.MEDIA_VIDEO
            elif ct.startswith('audio/'):
                attrs['kind'] = MediaAsset.MEDIA_AUDIO
        return attrs

    def create(self, validated_data):
        request = self.context.get('request')
        author = request.user if request and request.user.is_authenticated else None
        return MediaAsset.objects.create(author=author, **validated_data)

    def get_url(self, obj):
        try:
            return obj.file.url if obj.file else ''
        except ValueError:
            return ''

class RollSerializer(serializers.ModelSerializer):
    class Meta:
        model = Roll
        fields = "__all__"