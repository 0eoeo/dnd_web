from django.db import models

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
    expr = models.CharField(max_length=50)         # "3d6+2"
    total = models.IntegerField()
    breakdown = models.CharField(max_length=200, blank=True, default='')  # "4 + 2 + 5 + 2"
    ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['-created_at'])]

    def as_dict(self):
        return {
            "ts": int(self.created_at.timestamp()*1000),
            "character": self.character or "Безымянный",
            "spell": self.spell or "",
            "expr": self.expr,
            "total": self.total,
            "breakdown": self.breakdown or "",
        }