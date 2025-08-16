import json
from pathlib import Path
from typing import List

from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from django.db import transaction
from django.http import JsonResponse, HttpResponseBadRequest, HttpRequest, HttpResponse
from django.views.decorators.http import require_http_methods
from django.shortcuts import get_object_or_404, render
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
import json
from django.http import JsonResponse, HttpResponseBadRequest
from django.utils.timezone import now
from rest_framework import generics, permissions, status
from rest_framework.response import Response

from .models import Roll, LoreComment, LoreTopic, MediaAsset, LoreArticleComment, LoreArticle, LoreArticleImage, \
    SpellCache, MediaFolder, LoreFolder
from .config import SPELLS
from .models import CharacterSheet
from .extract_pdf_form_fields import extract_form_fields  # проверь путь
from .serializers import MediaFolderSerializer, LoreFolderSerializer
from .utils import fetch_spell_html_via_process


def _sheet_item(s):
    return {"id": s.id, "name": s.name, "created_at": s.created_at.isoformat()}


def _parse_payload(request):
    """
    Универсальный парсер: сначала пытаемся прочитать application/json,
    если не получилось — берём из form-data / x-www-form-urlencoded.
    """
    # 1) JSON-тело
    try:
        if request.body:
            body = request.body.decode(request.encoding or "utf-8")
            if body.strip():
                return json.loads(body)
    except Exception:
        # пойдём дальше — попробуем форму
        pass

    # 2) form-data / x-www-form-urlencoded
    name = (request.POST.get("name") or "").strip()
    data_raw = request.POST.get("data")
    data = {}
    if data_raw:
        try:
            data = json.loads(data_raw)
        except Exception:
            # если прислали не-JSON — проигнорируем, создадим пустой
            data = {}
    return {"name": name, "data": data}


@ensure_csrf_cookie
def viewer(request):
    return render(request, "viewer.html")

@ensure_csrf_cookie
def home(request: HttpRequest) -> HttpResponse:
    """
    Главная страница сайта (/) — обзор проекта, быстрые ссылки.
    Шаблон: templates/home.html
    """
    ctx = {
        # при необходимости прокинь динамические данные
        "page": "home",
        "title": "DnD — мир приключений",
    }
    return render(request, "home.html", ctx)

@ensure_csrf_cookie
def art(request: HttpRequest) -> HttpResponse:
    """
    Страница 'Творчество' (/art) — разделы: Лор, Иллюстрации, Видео, Музыка.
    Шаблон: templates/art.html
    """
    ctx = {
        "page": "art",
        "title": "Творчество кампании — Лор, Иллюстрации, Видео, Музыка",
        # Пример структуры для будущей динамики, если захочешь подгружать данные из БД/файлов:
        "sections": [
            {"id": "lore", "name": "Лор"},
            {"id": "images", "name": "Иллюстрации"},
            {"id": "video", "name": "Видео"},
            {"id": "music", "name": "Музыка"},
        ],
    }
    return render(request, "art.html", ctx)


@require_http_methods(["GET", "POST"])
def sheets_collection(request):
    if request.method == "GET":
        return JsonResponse([_sheet_item(s) for s in CharacterSheet.objects.all()], safe=False)

    payload = _parse_payload(request)   # как у тебя выше
    if payload is None:
        return HttpResponseBadRequest("invalid json")

    name = payload.get("name") or "Лист без названия"
    data = payload.get("data") or {}
    s = CharacterSheet.objects.create(name=name, data=data)

    # ВАЖНО: вернуть сохранённый data
    return JsonResponse({
        "id": s.id,
        "name": s.name,
        "created_at": s.created_at.isoformat(),
        "data": s.data
    })


@require_http_methods(["GET", "PUT", "PATCH"])
def sheet_detail(request, pk: int):
    s = get_object_or_404(CharacterSheet, pk=pk)

    if request.method == "GET":
        return JsonResponse({"id": s.id, "name": s.name, "created_at": s.created_at.isoformat(), "data": s.data})

    payload = _parse_payload(request)
    if payload is None:
        return HttpResponseBadRequest("invalid json")

    if "name" in payload:
        new_name = (payload.get("name") or "").strip()
        if new_name:
            s.name = new_name
    if "data" in payload and payload.get("data") is not None:
        s.data = payload.get("data")

    s.save(update_fields=["name", "data"])

    # ВАЖНО: вернуть актуальные data
    return JsonResponse({"id": s.id, "name": s.name, "created_at": s.created_at.isoformat(), "data": s.data})

@require_http_methods(["POST"])
def upload_pdf(request):
    f = request.FILES.get("file")
    if not f:
        return HttpResponseBadRequest("file missing")

    import os
    sheet = CharacterSheet.objects.create(name=os.path.splitext(f.name)[0] or "Импортированный лист", data={})
    sheet.pdf.save(f"{sheet.id}_{f.name}", f, save=True)

    data = extract_form_fields(sheet.pdf.path)  # {"fields":[...], ...}
    sheet.data = {"fields": data.get("fields", [])}
    sheet.save(update_fields=["data"])

    return JsonResponse({"id": sheet.id, "name": sheet.name, "data": sheet.data})

@require_http_methods(["GET"])
def list_media_sheets(request):
    """
    Возвращает актуальный список PDF-файлов из MEDIA_ROOT/sheets.
    Если файл привязан к CharacterSheet.pdf — вернём id и name из БД,
    иначе id=None и name=имя файла.
    """
    base = Path(settings.MEDIA_ROOT) / "sheets"
    items = []

    if base.exists():
        # .iterdir() — без рекурсии. Если нужны подпапки — поменяем на rglob("*.pdf")
        for p in sorted(base.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
            if p.is_file() and p.suffix.lower() == ".pdf":
                rel = f"sheets/{p.name}"  # то, как FileField хранит путь относительно MEDIA_ROOT
                # Попробуем найти соответствующую запись в БД
                try:
                    s = CharacterSheet.objects.get(pdf=rel)
                    items.append({
                        "id": s.id,
                        "name": s.name or p.name,
                        "created_at": s.created_at.isoformat(),
                        "file_url": settings.MEDIA_URL + rel
                    })
                except CharacterSheet.DoesNotExist:
                    items.append({
                        "id": None,
                        "name": p.name,
                        "created_at": None,
                        "file_url": settings.MEDIA_URL + rel
                    })
    return JsonResponse(items, safe=False)

@require_http_methods(["GET"])
def spells_list(request):
    """
    Вернуть список заклинаний для дропдауна: [{slug, name}, …]
    (можно вернуть и level/school/source, если захочешь использовать для подсказок)
    """
    data = [{"slug": s["slug"], "name": s["name"]} for s in SPELLS]
    return JsonResponse(data, safe=False)

@require_http_methods(["GET"])
def spell_detail_view(request, slug: str):
    if not slug:
        return HttpResponseBadRequest("slug required")

    TTL_SEC = 3600
    refresh = request.GET.get("refresh") == "1"

    obj = SpellCache.objects.filter(slug=slug).first()
    if obj and obj.html and not refresh:
        if (now() - obj.updated_at).total_seconds() < TTL_SEC:
            return JsonResponse({"slug": slug, "html": obj.html})

    # Только при отсутствии/просрочке кэша — один «дорогой» вызов в отдельном процессе
    html = fetch_spell_html_via_process(slug, timeout_sec=30)

    if obj:
        if html and "Не удалось" not in html:
            obj.html = html
            obj.save(update_fields=["html", "updated_at"])
    else:
        obj = SpellCache.objects.create(slug=slug, html=html)

    return JsonResponse({"slug": slug, "html": obj.html})

@require_http_methods(["GET"])
def api_rolls(request):
    limit = int(request.GET.get('limit', 50))
    limit = max(1, min(limit, 200))
    data = [r.as_dict() for r in Roll.objects.order_by('-created_at')[:limit]]
    return JsonResponse({"items": data})

@require_http_methods(["POST"])
def api_roll_create(request):
    try:
        payload = json.loads(request.body.decode('utf-8'))
    except Exception:
        return HttpResponseBadRequest("Invalid JSON")

    expr = str(payload.get("expr", "")).strip()
    total = payload.get("total")
    breakdown = str(payload.get("breakdown", "")).strip()
    character = str(payload.get("character", "")).strip()
    spell = str(payload.get("spell", "")).strip()

    if not expr or not isinstance(total, int):
        return HttpResponseBadRequest("expr and total required")

    r = Roll.objects.create(
        expr=expr,
        total=total,
        breakdown=breakdown,
        character=character,
        spell=spell,
        ip=(request.META.get('REMOTE_ADDR') or None),
    )

    item = r.as_dict()
    # уведомим по WebSocket (если Channels настроен)
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            "rolls", {"type": "roll.created", "item": item}
        )
    except Exception:
        pass

    return JsonResponse({"ok": True, "item": item}, status=201)

# ============ Media API ============
@require_http_methods(["GET", "POST"])
def api_media_list_create(request: HttpRequest) -> JsonResponse:
    if request.method == "GET":
        kind = request.GET.get("kind")
        folder_id = request.GET.get("folder_id")  # ⬅️
        qs = MediaAsset.objects.all()
        if kind in (MediaAsset.MEDIA_IMAGE, MediaAsset.MEDIA_AUDIO, MediaAsset.MEDIA_VIDEO):
            qs = qs.filter(kind=kind)
        if folder_id:
            qs = qs.filter(folder_id=folder_id)    # ⬅️
        limit = int(request.GET.get("limit", "50"))
        limit = max(1, min(limit, 200))
        items = [m.as_dict() for m in qs[:limit]]
        return JsonResponse({"items": items})

    # POST (multipart/form-data)
    f = request.FILES.get("file")
    kind = request.POST.get("kind")
    title = (request.POST.get("title") or "").strip()
    description = (request.POST.get("description") or "").strip()
    folder_id = request.POST.get("folder_id")  # ⬅️

    if not f or kind not in (MediaAsset.MEDIA_IMAGE, MediaAsset.MEDIA_AUDIO, MediaAsset.MEDIA_VIDEO):
        return HttpResponseBadRequest("file and valid kind required")

    folder = None
    if folder_id:
        try:
            folder = MediaFolder.objects.get(pk=folder_id)
        except MediaFolder.DoesNotExist:
            folder = None

    asset = MediaAsset.objects.create(
        author=request.user if request.user.is_authenticated else None,
        kind=kind,
        file=f,
        title=title,
        description=description,
        folder=folder,  # ⬅️ привязка к папке
    )
    item = asset.as_dict()
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)("art", {"type": "media.created", "item": item})
    except Exception:
        pass

    return JsonResponse({"ok": True, "item": item}, status=201)

@require_http_methods(["GET", "DELETE"])
def api_media_detail(request: HttpRequest, pk: int) -> JsonResponse:
    asset = get_object_or_404(MediaAsset, pk=pk)
    if request.method == "GET":
        return JsonResponse({"item": asset.as_dict()})
    # DELETE (права в продакшне ограничить)
    asset.delete()
    return JsonResponse({"ok": True})

# ===== Articles =====

# ===== Articles =====
@require_http_methods(["GET", "POST"])
def api_articles_list_create(request: HttpRequest) -> JsonResponse:
    if request.method == "GET":
        limit = int(request.GET.get("limit", "50"))
        limit = max(1, min(limit, 200))
        qs = LoreArticle.objects.all()

        # ⬇️ ФИЛЬТР ПО ПАПКЕ
        folder_id = request.GET.get("folder_id")
        if folder_id:
            qs = qs.filter(folder_id=folder_id)

        items = [a.as_dict() for a in qs[:limit]]
        return JsonResponse({"items": items})

    # POST multipart: title, excerpt?, content, cover?, gallery[], folder_id?
    if request.content_type and request.content_type.startswith("multipart/form-data"):
        title = (request.POST.get("title") or "").strip()
        excerpt = (request.POST.get("excerpt") or "").strip()
        content = (request.POST.get("content") or "").strip()
        folder_id = request.POST.get("folder_id")  # ⬅️ ВАЖНО
        cover: UploadedFile | None = request.FILES.get("cover")
        gallery_files: List[UploadedFile] = request.FILES.getlist("gallery")

        if not title or not content:
            return HttpResponseBadRequest("title and content required")

        # найдём папку, если указана; если модели нет поля folder — см. примечание ниже
        folder = None
        if folder_id:
            try:
                folder = LoreFolder.objects.get(pk=folder_id)
            except LoreFolder.DoesNotExist:
                folder = None

        with transaction.atomic():
            article = LoreArticle.objects.create(
                title=title,
                excerpt=excerpt,
                content=content,
                author=request.user if request.user.is_authenticated else None,
                folder=folder,  # ⬅️ привязка к папке
            )
            if cover:
                article.cover = cover
                article.save(update_fields=["cover"])

            for f in gallery_files:
                LoreArticleImage.objects.create(article=article, image=f)

        item = article.as_dict()
        _ws_notify("art", "article", item)
        return JsonResponse({"ok": True, "item": item}, status=201)

    return HttpResponseBadRequest("multipart/form-data required")

@require_http_methods(["GET"])
def api_article_detail(request: HttpRequest, pk: int) -> JsonResponse:
    article = get_object_or_404(LoreArticle, pk=pk)
    return JsonResponse({"item": article.as_dict()})

# ===== Article comments =====

@require_http_methods(["GET", "POST"])
def api_article_comments(request: HttpRequest, pk: int) -> JsonResponse:
    article = get_object_or_404(LoreArticle, pk=pk)

    if request.method == "GET":
        items = [c.as_dict() for c in article.comments.all()]
        return JsonResponse({"items": items})

    # POST JSON: {"content": "..."}
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        return HttpResponseBadRequest("Invalid JSON")
    content = (payload.get("content") or "").strip()
    if not content:
        return HttpResponseBadRequest("content required")

    c = LoreArticleComment.objects.create(
        article=article,
        content=content,
        author=request.user if request.user.is_authenticated else None
    )
    item = c.as_dict()
    _ws_notify("art", "lore_comment", item)  # realtime
    return JsonResponse({"ok": True, "item": item}, status=201)

@csrf_exempt
@require_http_methods(["GET", "DELETE"])
def api_article_detail(request, pk):
    article = get_object_or_404(LoreArticle, pk=pk)
    if request.method == "GET":
        return JsonResponse({"item": article.as_dict()})
    article.delete()
    _ws_notify_silent("art", "article", {"deleted_id": pk})
    return JsonResponse({"ok": True})

@require_http_methods(["GET", "DELETE"])
def api_media_detail(request, pk):
    """
    GET    /api/art/media/<id>/      -> {"item": {...}}
    DELETE /api/art/media/<id>/      -> {"ok": true}
    Права: автор файла или staff/superuser (рекомендуется).
    В DEV можно временно ослабить до "любой аутентифицированный".
    """
    asset = get_object_or_404(MediaAsset, pk=pk)

    if request.method == "GET":
        return JsonResponse({"item": asset.as_dict()})

    asset.file.delete(save=False)
    asset.delete()

    _ws_notify_silent("art", "media", {"deleted_id": pk})
    return JsonResponse({"ok": True})

# ===== helpers =====

def _ws_notify(group: str, msg_type: str, item: dict) -> None:
    """Отправка сообщения в группу WS (если настроены Channels). Тихо игнорируем, если в окружении нет слоя."""
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        ch = get_channel_layer()
        if ch:
            async_to_sync(ch.group_send)(group, {"type": f"{msg_type}", "item": item})
    except Exception:
        # отсутствие настроенного слоя или любая ошибка — молча
        pass

def _ws_notify_silent(group: str, msg_type: str, item: dict) -> None:
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        ch = get_channel_layer()
        if ch:
            async_to_sync(ch.group_send)(group, {"type": f"{msg_type}", "item": item})
    except Exception:
        pass

class LoreFolderListCreate(generics.ListCreateAPIView):
    queryset = LoreFolder.objects.all().order_by('title')
    serializer_class = LoreFolderSerializer
    permission_classes = [permissions.AllowAny]
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user if self.request.user.is_authenticated else None)

class LoreFolderDestroy(generics.DestroyAPIView):
    queryset = LoreFolder.objects.all()
    serializer_class = LoreFolderSerializer
    permission_classes = [permissions.AllowAny]

class MediaFolderListCreate(generics.ListCreateAPIView):
    queryset = MediaFolder.objects.all().order_by('title')
    serializer_class = MediaFolderSerializer
    permission_classes = [permissions.AllowAny]
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user if self.request.user.is_authenticated else None)

class MediaFolderDestroy(generics.DestroyAPIView):
    queryset = MediaFolder.objects.all()
    serializer_class = MediaFolderSerializer
    permission_classes = [permissions.AllowAny]