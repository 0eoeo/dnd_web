import json
from pathlib import Path

from django.conf import settings
from django.http import JsonResponse, HttpResponseBadRequest
from django.views.decorators.http import require_http_methods
from django.shortcuts import get_object_or_404, render
from django.views.decorators.csrf import ensure_csrf_cookie

from .config import SPELLS
from .models import CharacterSheet
from .extract_pdf_form_fields import extract_form_fields  # проверь путь
from .utils import get_spell_detail


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
    return render(request, "core/viewer.html")


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
    """
    Вернуть HTML-фрагмент описания заклинания.
    """
    if not slug:
        return HttpResponseBadRequest("slug required")
    html = get_spell_detail(slug)  # <- твоя функция из сообщения
    return JsonResponse({"slug": slug, "html": html})