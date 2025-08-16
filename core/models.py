import uuid

from django.conf import settings
from django.db import models

User = settings.AUTH_USER_MODEL


# --- базовые утилиты ---
class TimeStamped(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True


# --- папки ---
class BaseFolder(TimeStamped):
    title = models.CharField(max_length=200)
    created_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL
    )

    class Meta:
        abstract = True
        ordering = ['title']
        indexes = [models.Index(fields=['title'])]

    def __str__(self):
        return self.title


class LoreFolder(BaseFolder):
    pass


class MediaFolder(BaseFolder):
    pass


# --- character sheets ---
class CharacterSheet(models.Model):
    # Устойчивый ключ листа (одинаковый для всех его версий)
    logical_key = models.UUIDField(default=uuid.uuid4, editable=False, db_index=True, unique=True)

    name = models.CharField(max_length=255, blank=True, default="")
    data = models.JSONField(default=dict, blank=True)
    pdf = models.FileField(upload_to="sheets/", blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        ordering = ["-updated_at", "-created_at"]
        indexes = [
            models.Index(fields=["-updated_at"]),
            models.Index(fields=["logical_key"]),
        ]

    def __str__(self):
        return f"{self.name or 'Без названия'} ({self.logical_key})"


class CharacterSheetRevision(models.Model):
    # Ссылка на «текущий» лист: логическая сущность, а не «снимок»
    sheet = models.ForeignKey(CharacterSheet, on_delete=models.CASCADE, related_name="revisions")
    logical_key = models.UUIDField(db_index=True)  # дублируем для удобных запросов
    version = models.PositiveIntegerField(db_index=True)

    name = models.CharField(max_length=255, blank=True, default="")
    data = models.JSONField(default=dict, blank=True)
    pdf = models.FileField(upload_to="sheets/revisions/", blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        unique_together = ("logical_key", "version")
        ordering = ["-version"]
        indexes = [
            models.Index(fields=["logical_key", "-version"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self):
        return f"{self.logical_key} v{self.version} — {self.name or 'Без названия'}"


# --- броски кубов ---
class Roll(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    character = models.CharField(max_length=120, blank=True, default="")
    spell = models.CharField(max_length=200, blank=True, default="")
    expr = models.CharField(max_length=50)
    total = models.IntegerField()
    breakdown = models.CharField(max_length=200, blank=True, default="")
    ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["-created_at"])]

    def __str__(self):
        return f"{self.expr} = {self.total}"


# --- лор: статьи ---
def upload_cover_path(instance, filename):
    return f"art/articles/{instance.id or 'new'}/cover/{filename}"


def upload_gallery_path(instance, filename):
    return f"art/articles/{instance.article_id or 'new'}/gallery/{filename}"


class LoreArticle(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)
    author = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="lore_articles"
    )
    folder = models.ForeignKey(
        LoreFolder, null=True, blank=True, on_delete=models.SET_NULL, related_name="articles"
    )
    title = models.CharField(max_length=200)
    excerpt = models.CharField(max_length=300, blank=True, default="")
    content = models.TextField()
    cover = models.ImageField(upload_to=upload_cover_path, blank=True, null=True)

    class Meta:
        ordering = ["-updated_at", "-created_at"]
        indexes = [
            models.Index(fields=["-updated_at"]),
            models.Index(fields=["folder", "-updated_at"]),
        ]

    def __str__(self):
        return self.title


class LoreArticleImage(models.Model):
    article = models.ForeignKey(LoreArticle, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to=upload_gallery_path)

    def __str__(self):
        return f"Image for article {self.article_id}"


class LoreArticleComment(models.Model):
    article = models.ForeignKey(LoreArticle, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="lore_comments"
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at"]


# --- медиа ---
class MediaAsset(models.Model):
    MEDIA_IMAGE = "image"
    MEDIA_AUDIO = "audio"
    MEDIA_VIDEO = "video"
    MEDIA_TYPES = [
        (MEDIA_IMAGE, "Image"),
        (MEDIA_AUDIO, "Audio"),
        (MEDIA_VIDEO, "Video"),
    ]

    uploaded_at = models.DateTimeField(auto_now_add=True)
    author = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="media_assets"
    )
    folder = models.ForeignKey(
        MediaFolder, null=True, blank=True, on_delete=models.SET_NULL, related_name="assets"
    )
    kind = models.CharField(max_length=10, choices=MEDIA_TYPES)
    file = models.FileField(upload_to="art/%Y/%m/%d/")
    title = models.CharField(max_length=200, blank=True, default="")
    description = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-uploaded_at"]
        indexes = [
            models.Index(fields=["-uploaded_at", "kind"]),
            models.Index(fields=["folder", "-uploaded_at"]),
        ]

    def __str__(self):
        return self.title or f"{self.kind} #{self.pk}"


# --- кэш заклинаний ---
class SpellCache(models.Model):
    slug = models.SlugField(primary_key=True)
    html = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.slug
