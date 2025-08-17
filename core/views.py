import json

from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.utils.timezone import now
from django.views.generic import TemplateView
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from django.db import transaction

from .extract_pdf_form_fields import extract_form_fields
from .models import (
    CharacterSheet, Roll, LoreFolder, MediaFolder,
    LoreArticle, LoreArticleComment, MediaAsset, SpellCache, CharacterSheetRevision, LoreArticleImage
)
from .serializers import (
    CharacterSheetSerializer, RollSerializer,
    LoreFolderSerializer, MediaFolderSerializer,
    LoreArticleSerializer, LoreArticleCommentSerializer,
    MediaAssetSerializer, CharacterSheetRevisionSerializer
)
from .config import SPELLS
from .utils import fetch_spell_html_via_process


@method_decorator(ensure_csrf_cookie, name="dispatch")
class HomeView(TemplateView):
    template_name = "home.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx.update({
            "page": "home",
            "title": "DnD — мир приключений",
        })
        return ctx


@method_decorator(ensure_csrf_cookie, name="dispatch")
class ArtView(TemplateView):
    template_name = "art.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx.update({
            "page": "art",
            "title": "Творчество кампании — Лор, Иллюстрации, Видео, Музыка",
            "sections": [
                {"id": "lore", "name": "Лор"},
                {"id": "images", "name": "Иллюстрации"},
                {"id": "video", "name": "Видео"},
                {"id": "music", "name": "Музыка"},
            ],
        })
        return ctx


@method_decorator(ensure_csrf_cookie, name="dispatch")
class ViewerView(TemplateView):
    template_name = "viewer.html"


# --- DRF ViewSets ---
class CharacterSheetViewSet(viewsets.ModelViewSet):
    queryset = CharacterSheet.objects.all().order_by("-updated_at", "-created_at")
    serializer_class = CharacterSheetSerializer
    permission_classes = [permissions.AllowAny]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def _parse_payload_data(self, raw):
        if isinstance(raw, str):
            try:
                return json.loads(raw)
            except Exception:
                return {}
        return raw or {}

    def _create_revision(self, sheet: CharacterSheet, *, name: str, data: dict, pdf_file):
        last = (
            CharacterSheetRevision.objects
            .filter(logical_key=sheet.logical_key)
            .order_by("-version")
            .first()
        )
        next_version = (last.version + 1) if last else 1
        rev = CharacterSheetRevision(
            sheet=sheet,
            logical_key=sheet.logical_key,
            version=next_version,
            name=name,
            data=data or {},
        )
        if pdf_file:
            rev.pdf.save(f"{sheet.id}_v{next_version}.pdf", pdf_file, save=False)
        rev.save()
        return rev

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        pdf = request.FILES.get("pdf") or request.FILES.get("file")
        avatar = request.FILES.get("avatar")
        name = (request.data.get("name") or "").strip() or "Импортированный лист"

        # data может быть строкой (multipart) или объектом (JSON)
        payload_data = self._parse_payload_data(request.data.get("data"))

        sheet = CharacterSheet.objects.create(name=name, data={})

        if avatar:
            sheet.avatar.save(avatar.name, avatar, save=False)

        if pdf:
            sheet.pdf.save(f"{sheet.id}_{pdf.name}", pdf, save=False)
            sheet.save()
            parsed = extract_form_fields(sheet.pdf.path) or {}
            sheet.data = {"fields": parsed.get("fields", [])}
            sheet.save(update_fields=["data"])
            with sheet.pdf.open("rb") as f:
                self._create_revision(sheet, name=sheet.name, data=sheet.data, pdf_file=f)
        else:
            sheet.data = payload_data or {}
            sheet.save(update_fields=["data", "avatar"])
            self._create_revision(sheet, name=sheet.name, data=sheet.data, pdf_file=None)

        return Response(self.get_serializer(sheet).data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def partial_update(self, request, *args, **kwargs):
        sheet = self.get_object()
        name = (request.data.get("name") or sheet.name).strip()

        raw_data = request.data.get("data", sheet.data)
        data = self._parse_payload_data(raw_data)

        avatar = request.FILES.get("avatar")
        if avatar:
            sheet.avatar.save(avatar.name, avatar, save=False)

        sheet.name = name
        sheet.data = data or {}
        sheet.save(update_fields=["name", "data", "avatar", "updated_at"])

        self._create_revision(sheet, name=name, data=sheet.data, pdf_file=None)

        return Response(self.get_serializer(sheet).data, status=status.HTTP_200_OK)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        """
        PUT: аналогично PATCH, но полный апдейт.
        """
        return self.partial_update(request, *args, **kwargs)

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        """
        История версий для конкретного листа (id «текущей» записи).
        Самая свежая версия — первая.
        """
        sheet = self.get_object()
        qs = CharacterSheetRevision.objects.filter(logical_key=sheet.logical_key).order_by("-version")
        data = CharacterSheetRevisionSerializer(qs, many=True).data
        return Response(data, status=status.HTTP_200_OK)

class RollViewSet(viewsets.ModelViewSet):
    queryset = Roll.objects.all().order_by("-created_at")
    serializer_class = RollSerializer
    permission_classes = [permissions.AllowAny]


class LoreFolderViewSet(viewsets.ModelViewSet):
    queryset = LoreFolder.objects.all().order_by("title")
    serializer_class = LoreFolderSerializer
    permission_classes = [permissions.AllowAny]


class MediaFolderViewSet(viewsets.ModelViewSet):
    queryset = MediaFolder.objects.all().order_by("title")
    serializer_class = MediaFolderSerializer
    permission_classes = [permissions.AllowAny]


class LoreArticleViewSet(viewsets.ModelViewSet):
    queryset = LoreArticle.objects.all().order_by("-updated_at", "-created_at")
    serializer_class = LoreArticleSerializer
    permission_classes = [permissions.AllowAny]
    parser_classes = [JSONParser, MultiPartParser, FormParser]  # важно

    def perform_create(self, serializer):
        # создаём саму статью
        article = serializer.save(author=self.request.user if self.request.user.is_authenticated else None)

        # обрабатываем вложения из поля 'gallery'
        files = self.request.FILES.getlist('gallery')
        for f in files:
            LoreArticleImage.objects.create(article=article, image=f)

    def perform_update(self, serializer):
        article = serializer.save()
        # добавление новых вложений при редактировании (опционально)
        files = self.request.FILES.getlist('gallery')
        for f in files:
            LoreArticleImage.objects.create(article=article, image=f)

    @action(detail=True, methods=["get", "post"], url_path="comments")
    def comments(self, request, pk=None):
        article = self.get_object()

        if request.method.lower() == "get":
            qs = LoreArticleComment.objects.filter(article=article).order_by("created_at")
            data = LoreArticleCommentSerializer(qs, many=True).data
            return Response(data, status=status.HTTP_200_OK)

        # POST — создание комментария
        content = (request.data.get("content") or "").strip()
        if not content:
            return Response({"error": "content is required"}, status=status.HTTP_400_BAD_REQUEST)

        author = request.user if request.user.is_authenticated else None
        comment = LoreArticleComment.objects.create(article=article, author=author, content=content)
        data = LoreArticleCommentSerializer(comment).data
        return Response(data, status=status.HTTP_201_CREATED)

class MediaAssetViewSet(viewsets.ModelViewSet):
    queryset = MediaAsset.objects.all().order_by("-uploaded_at")
    serializer_class = MediaAssetSerializer
    permission_classes = [permissions.AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    # Подстрахуемся: не принимаем запрос без файла вовсе
    def create(self, request, *args, **kwargs):
        if 'file' not in request.FILES:
            return Response({'file': 'required'}, status=status.HTTP_400_BAD_REQUEST)
        return super().create(request, *args, **kwargs)


# --- Сервисные эндпоинты для заклинаний ---
@api_view(["GET"])
def spells_list(request):
    data = [{"slug": s["slug"], "name": s["name"]} for s in SPELLS]
    return Response(data)


@api_view(["GET"])
def spell_detail(request, slug: str):
    if not slug:
        return Response({"error": "slug required"}, status=status.HTTP_400_BAD_REQUEST)

    TTL_SEC = 3600
    refresh = request.GET.get("refresh") == "1"
    obj = SpellCache.objects.filter(slug=slug).first()

    if obj and obj.html and not refresh:
        age_sec = (now() - obj.updated_at).total_seconds()
        if age_sec < TTL_SEC:
            return Response({"slug": slug, "html": obj.html})

    html = fetch_spell_html_via_process(slug, timeout_sec=30)

    if obj:
        obj.html = html
        obj.save(update_fields=["html", "updated_at"])
    else:
        obj = SpellCache.objects.create(slug=slug, html=html)

    return Response({"slug": slug, "html": obj.html})
