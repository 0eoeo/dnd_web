from django.db import models

class CharacterSheet(models.Model):
    name = models.CharField(max_length=255, blank=True, default="")
    # сам JSON «как на форму»
    data = models.JSONField(default=dict)
    # опционально хранить исходный pdf
    pdf = models.FileField(upload_to="sheets/", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.id} — {self.name or 'Без названия'}"
