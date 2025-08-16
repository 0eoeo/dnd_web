# models.py
from django.conf import settings
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


# ---------- базовые утилиты ----------
class TimeStamped(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True


# ---------- папки ----------
class LoreFolder(TimeStamped):
    title = models.CharField(max_length=200)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )

    class Meta:
        ordering = ["title"]
        indexes = [models.Index(fields=["title"])]

    def __str__(self):
        return self.title


class MediaFolder(TimeStamped):
    title = models.CharField(max_length=200)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )

    class Meta:
        ordering = ["title"]
        indexes = [models.Index(fields=["title"])]

    def __str__(self):
        return self.title


# ---------- character sheet ----------
class CharacterSheet(models.Model):
    name = models.CharField(max_length=255, blank=True, default="")
    data = models.JSONField(default=dict, blank=True)
    pdf = models.FileField(upload_to="sheets/", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["-created_at"])]

    def __str__(self):
        return f"{self.id} — {self.name or 'Без названия'}"

    def as_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at.isoformat(),
            "data": self.data,
            "file_url": self.pdf.url if self.pdf else "",
        }


# ---------- броски кубов ----------
class Roll(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    character = models.CharField(max_length=120, blank=True, default="")
    spell = models.CharField(max_length=200, blank=True, default="")
    expr = models.CharField(max_length=50)  # "3d6+2"
    total = models.IntegerField()
    breakdown = models.CharField(max_length=200, blank=True, default="")  # "4 + 2 + 5 + 2"
    ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["-created_at"])]

    def as_dict(self):
        return {
            "ts": int(self.created_at.timestamp() * 1000),
            "character": self.character or "Безымянный",
            "spell": self.spell or "",
            "expr": self.expr,
            "total": self.total,
            "breakdown": self.breakdown or "",
        }


# ---------- лор: статьи ----------
def upload_cover_path(instance, filename):
    # instance: LoreArticle
    return f"art/articles/{instance.id or 'new'}/cover/{filename}"


def upload_gallery_path(instance, filename):
    # instance: LoreArticleImage
    article_id = instance.article_id or "new"
    return f"art/articles/{article_id}/gallery/{filename}"


class LoreArticle(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)
    author = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="lore_articles"
    )
    folder = models.ForeignKey(  # ← привязка к папке лора
        "LoreFolder", null=True, blank=True, on_delete=models.SET_NULL, related_name="articles"
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

    def as_dict(self):
        return {
            "id": self.id,
            "ts": int(self.created_at.timestamp() * 1000),
            "author": self.author.username if self.author else "anon",
            "title": self.title,
            "excerpt": self.excerpt,
            "content": self.content,
            "folder_id": self.folder_id,
            "cover_url": self.cover.url if self.cover else "",
            "gallery": [img.image.url for img in self.images.all().order_by("id")],
        }


class LoreArticleImage(models.Model):
    article = models.ForeignKey(
        "LoreArticle", on_delete=models.CASCADE, related_name="images"
    )
    image = models.ImageField(upload_to=upload_gallery_path)

    def __str__(self):
        return f"Image for article {self.article_id}"


class LoreArticleComment(models.Model):
    article = models.ForeignKey(
        "LoreArticle", on_delete=models.CASCADE, related_name="comments"
    )
    author = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="lore_article_comments"
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["article", "created_at"])]

    def as_dict(self):
        return {
            "id": self.id,
            "article_id": self.article_id,
            "ts": int(self.created_at.timestamp() * 1000),
            "author": self.author.username if self.author else "anon",
            "content": self.content,
        }


# ---------- лор: старые темы/комменты (если используешь) ----------
class LoreTopic(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    author = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="lore_topics"
    )
    title = models.CharField(max_length=200)
    content = models.TextField()

    class Meta:
        ordering = ["-updated_at", "-created_at"]
        indexes = [models.Index(fields=["-updated_at"])]

    def as_dict(self):
        return {
            "id": self.id,
            "ts": int(self.created_at.timestamp() * 1000),
            "author": self.author.username if self.author else "anon",
            "title": self.title,
            "content": self.content,
        }


class LoreComment(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    author = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="lore_comments"
    )
    topic = models.ForeignKey("LoreTopic", on_delete=models.CASCADE, related_name="comments")
    content = models.TextField()

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["topic", "created_at"])]

    def as_dict(self):
        return {
            "id": self.id,
            "ts": int(self.created_at.timestamp() * 1000),
            "author": self.author.username if self.author else "anon",
            "topic_id": self.topic_id,
            "content": self.content,
        }


# ---------- медиа ----------
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
    folder = models.ForeignKey(  # ← привязка к папке медиа
        "MediaFolder", null=True, blank=True, on_delete=models.SET_NULL, related_name="assets"
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

    def as_dict(self):
        return {
            "id": self.id,
            "ts": int(self.uploaded_at.timestamp() * 1000),
            "author": self.author.username if self.author else "anon",
            "folder_id": self.folder_id,
            "kind": self.kind,
            "url": self.file.url if self.file else "",
            "title": self.title,
            "description": self.description,
        }


# ---------- кэш заклинаний ----------
class SpellCache(models.Model):
    slug = models.SlugField(primary_key=True)
    html = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.slug
