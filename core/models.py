from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class CharacterSheet(models.Model):
    name = models.CharField(max_length=255, blank=True, default="")
    data = models.JSONField(default=dict)
    pdf = models.FileField(upload_to="sheets/", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.id} — {self.name or 'Без названия'}"


class Roll(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    character = models.CharField(max_length=120, blank=True, default='')
    spell = models.CharField(max_length=200, blank=True, default='')
    expr = models.CharField(max_length=50)  # "3d6+2"
    total = models.IntegerField()
    breakdown = models.CharField(max_length=200, blank=True, default='')  # "4 + 2 + 5 + 2"
    ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['-created_at'])]

    def as_dict(self):
        return {
            "ts": int(self.created_at.timestamp() * 1000),
            "character": self.character or "Безымянный",
            "spell": self.spell or "",
            "expr": self.expr,
            "total": self.total,
            "breakdown": self.breakdown or "",
        }


class MediaAsset(models.Model):
    MEDIA_IMAGE = 'image'
    MEDIA_AUDIO = 'audio'
    MEDIA_VIDEO = 'video'
    MEDIA_TYPES = [
        (MEDIA_IMAGE, 'Image'),
        (MEDIA_AUDIO, 'Audio'),
        (MEDIA_VIDEO, 'Video'),
    ]

    uploaded_at = models.DateTimeField(auto_now_add=True)
    author = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='media_assets')
    kind = models.CharField(max_length=10, choices=MEDIA_TYPES)
    file = models.FileField(upload_to='art/%Y/%m/%d/')
    title = models.CharField(max_length=200, blank=True, default='')
    description = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-uploaded_at']
        indexes = [models.Index(fields=['-uploaded_at', 'kind'])]

    def as_dict(self):
        return {
            "id": self.id,
            "ts": int(self.uploaded_at.timestamp() * 1000),
            "author": self.author.username if self.author else "anon",
            "kind": self.kind,
            "url": self.file.url if self.file else "",
            "title": self.title,
            "description": self.description,
        }


class LoreTopic(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    author = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='lore_topics')
    title = models.CharField(max_length=200)
    content = models.TextField()

    class Meta:
        ordering = ['-updated_at', '-created_at']
        indexes = [models.Index(fields=['-updated_at'])]

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
    author = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='lore_comments')
    topic = models.ForeignKey(LoreTopic, on_delete=models.CASCADE, related_name='comments')
    content = models.TextField()

    class Meta:
        ordering = ['created_at']
        indexes = [models.Index(fields=['topic', 'created_at'])]

    def as_dict(self):
        return {
            "id": self.id,
            "ts": int(self.created_at.timestamp() * 1000),
            "author": self.author.username if self.author else "anon",
            "topic_id": self.topic_id,
            "content": self.content,
        }


def upload_cover_path(instance, filename):
    return f"art/articles/{instance.id or 'new'}/cover/{filename}"


def upload_gallery_path(instance, filename):
    # instance = LoreArticleImage
    article_id = instance.article_id or 'new'
    return f"art/articles/{article_id}/gallery/{filename}"


class LoreArticle(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)
    author = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='lore_articles')
    title = models.CharField(max_length=200)
    excerpt = models.CharField(max_length=300, blank=True, default="")
    content = models.TextField()
    cover = models.ImageField(upload_to=upload_cover_path, blank=True, null=True)

    class Meta:
        ordering = ['-updated_at', '-created_at']

    def as_dict(self):
        return {
            "id": self.id,
            "ts": int(self.created_at.timestamp() * 1000),
            "author": self.author.username if self.author else "anon",
            "title": self.title,
            "excerpt": self.excerpt,
            "content": self.content,
            "cover_url": self.cover.url if self.cover else "",
            "gallery": [img.image.url for img in self.images.all().order_by('id')],
        }


class LoreArticleImage(models.Model):
    article = models.ForeignKey(LoreArticle, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to=upload_gallery_path)

    def __str__(self):
        return f"Image for article {self.article_id}"


class LoreArticleComment(models.Model):
    article = models.ForeignKey(LoreArticle, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                               related_name='lore_article_comments')
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['created_at']

    def as_dict(self):
        return {
            "id": self.id,
            "article_id": self.article_id,
            "ts": int(self.created_at.timestamp() * 1000),
            "author": self.author.username if self.author else "anon",
            "content": self.content,
        }

class SpellCache(models.Model):
    slug = models.SlugField(primary_key=True)
    html = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.slug