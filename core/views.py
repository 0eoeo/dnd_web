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
    LoreArticle, LoreArticleComment, MediaAsset, SpellCache, CharacterSheetRevision
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

    def _create_revision(self, sheet: CharacterSheet, *, name: str, data: dict, pdf_file):
        """
        Создание новой ревизии для логического листа: version = last + 1.
        """
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
            # Сохраняем копию файла в историю, чтобы «снимок» был самодостаточным
            rev.pdf.save(f"{sheet.id}_v{next_version}.pdf", pdf_file, save=False)
        rev.save()
        return rev

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """
        Два режима:
        - multipart: pdf(или file) + name → распарсить PDF в data, создать sheet и ревизию v1.
        - JSON: name?, data? → создать sheet и ревизию v1.
        """
        pdf = request.FILES.get("pdf") or request.FILES.get("file")
        name = (request.data.get("name") or "").strip() or "Импортированный лист"

        # Создаём базовую запись
        sheet = CharacterSheet.objects.create(name=name, data={})

        # Сохраняем PDF, если есть, и парсим в data
        if pdf:
            sheet.pdf.save(f"{sheet.id}_{pdf.name}", pdf, save=True)
            parsed = extract_form_fields(sheet.pdf.path) or {}
            sheet.data = {"fields": parsed.get("fields", [])}
            sheet.save(update_fields=["data"])

            # В историю писать бинарно PDF — используем исходный загруженный файл (он уже прочитан)
            # Важно: для ревизии надо заново открыть файл из sheet.pdf (так надёжнее)
            with sheet.pdf.open("rb") as f:
                self._create_revision(sheet, name=sheet.name, data=sheet.data, pdf_file=f)
        else:
            # Чистый JSON create
            payload_data = request.data.get("data") or {}
            sheet.data = payload_data
            sheet.save(update_fields=["data"])
            self._create_revision(sheet, name=sheet.name, data=sheet.data, pdf_file=None)

        return Response(self.get_serializer(sheet).data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def partial_update(self, request, *args, **kwargs):
        """
        PATCH: обновляем «текущую» запись и создаём новую ревизию (version += 1).
        """
        sheet = self.get_object()
        name = (request.data.get("name") or sheet.name).strip()
        data = request.data.get("data", sheet.data)

        # Обновляем текущий лист
        sheet.name = name
        sheet.data = data
        sheet.save(update_fields=["name", "data", "updated_at"])

        # В историю — снимок данных (без перезаписи текущего pdf)
        self._create_revision(sheet, name=name, data=data, pdf_file=None)

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

    @action(detail=True, methods=['get', 'post'])
    def comments(self, request, pk=None):
        article = self.get_object()
        if request.method == 'GET':
            qs = article.comments.all().order_by("created_at")
            return Response(LoreArticleCommentSerializer(qs, many=True).data)

        serializer = LoreArticleCommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(
            article=article,
            author=request.user if request.user.is_authenticated else None
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class MediaAssetViewSet(viewsets.ModelViewSet):
    queryset = MediaAsset.objects.all().order_by("-uploaded_at")
    serializer_class = MediaAssetSerializer
    permission_classes = [permissions.AllowAny]


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
