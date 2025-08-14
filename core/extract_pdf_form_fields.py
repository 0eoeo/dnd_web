# pip install pymupdf pypdf
import json
from typing import Any, Dict, List, Optional, Tuple

import fitz  # PyMuPDF
from pypdf import PdfReader

FIELD_TYPE_MAP = {
    0: "Unknown",
    1: "Text",
    2: "Checkbox",
    3: "Radio",
    4: "Combo",
    5: "List",
    # возможны и другие, если твой PDF использует кастомные
}


def _nearest_left_label(page: fitz.Page, rect: fitz.Rect, y_tolerance: float = 10.0) -> str:
    """
    Ищем текстовый блок слева от прямоугольника поля на той же "строке".
    Возвращаем ближайший по X (правому краю блока).
    """
    blocks = page.get_text("blocks")
    y_mid = (rect.y0 + rect.y1) / 2.0
    best = None
    best_dx = 1e9

    for bx0, by0, bx1, by1, btxt, *_ in blocks:
        if not isinstance(btxt, str) or not btxt.strip():
            continue
        # примерно на одной горизонтали?
        if (by0 - y_tolerance) <= y_mid <= (by1 + y_tolerance):
            # блок должен быть строго слева от поля
            if bx1 <= rect.x0:
                dx = rect.x0 - bx1
                if dx < best_dx:
                    best = btxt.strip()
                    best_dx = dx
    return best or ""


def _normalize_value(val: Any) -> Any:
    """
    Нормализуем значение из аннотации/поля:
    - строки оставляем,
    - объекты-имена /Yes -> "Yes",
    - для множественного выбора списки оставляем списком.
    """
    if val is None:
        return None
    # pypdf может вернуть объекты-имена вида '/Yes'
    if isinstance(val, str):
        if val.startswith("/"):
            return val[1:]
        return val
    # списки как есть
    if isinstance(val, list):
        out = []
        for v in val:
            if isinstance(v, str) and v.startswith("/"):
                out.append(v[1:])
            else:
                out.append(v)
        return out
    # иные типы
    try:
        return str(val)
    except Exception:
        return val


def extract_form_fields(pdf_path: str) -> Dict[str, Any]:
    """
    Возвращает структуру:
    {
      "fields": [
        {
          "page": 1,
          "name": "CharacterName",
          "type": "Text" | "Button" | "Choice" | "Signature" | ...,
          "rect": [x0,y0,x1,y1],
          "value": "..." | ["..."] | True/False/None,
          "label": "подпись слева",
          "export_values": ["Yes","Off", ...]  # для чекбоксов/радио/списков
        },
        ...
      ],
      "by_name": {
        "CharacterName": "Значение",
        "Agree": "Yes",
        ...
      }
    }
    """
    # Читаем значения полей в целом через pypdf (надёжно отдаёт /V)
    reader = PdfReader(pdf_path)
    fields_map: Dict[str, Any] = {}
    try:
        fields = reader.get_fields()  # может вернуть None, если форм нет
    except Exception:
        fields = None

    if fields:
        for name, fdict in fields.items():
            val = _normalize_value(fdict.get("/V"))
            fields_map[name] = val

    # Теперь идём по страницам через PyMuPDF (чтобы получить виджеты и координаты)
    doc = fitz.open(pdf_path)
    items: List[Dict[str, Any]] = []

    for pno in range(len(doc)):
        page = doc[pno]
        widgets = page.widgets() or []
        # Если widgets пуст — на этой странице нет виджетов формы
        for w in widgets:
            name: str = w.field_name or ""
            ftype_code = w.field_type
            ftype: str = FIELD_TYPE_MAP.get(ftype_code, "Unknown")
            rect: fitz.Rect = w.rect

            # Текущее значение: пробуем у самого виджета
            # PyMuPDF .field_value может быть строкой/None/'Yes' и т.п.
            value = w.field_value
            value = _normalize_value(value)

            # Если пусто — пробуем взять из общей карты значений pypdf по имени поля
            if (value in (None, "", [])) and name in fields_map:
                value = fields_map[name]

            # Чекбокс/радио: иногда фактическое on/off хранится в /AS (appearance state)
            if ftype in ("Checkbox", "Radiobutton", "Radio"):
                # Если value пусто — сравним визуальное состояние
                # PyMuPDF не всегда даёт /AS, но можно уточнить через reader
                if name in fields_map:
                    value = fields_map[name]
                else:
                    # попытка определения по флагам виджета (не всегда сработает)
                    pass

            # Варианты значений (экспортные) — у choice/btn
            export_values: Optional[List[str]] = None
            try:
                # PyMuPDF 1.24+ имеет widget.choices для списков
                if hasattr(w, "choices") and w.choices:
                    export_values = [str(c) for c in w.choices]
            except Exception:
                pass

            # Подпись слева (эвристика)
            label = _nearest_left_label(page, rect)

            items.append({
                "page": pno + 1,
                "name": name,
                "type": ftype,
                "rect": [rect.x0, rect.y0, rect.x1, rect.y1],
                "value": value,
                "label": label,
                "export_values": export_values
            })

    # Дополнительно: включим в by_name всё, что нашли
    by_name = dict(fields_map)  # стартуем со значений pypdf
    for it in items:
        n = it["name"]
        v = it["value"]
        if n and (n not in by_name or by_name[n] in (None, "", [])) and v not in (None, "", []):
            by_name[n] = v

    return {"fields": items, "by_name": by_name}


if __name__ == "__main__":
    import sys, pathlib
    if len(sys.argv) < 2:
        print("Usage: python extract_pdf_form_fields.py input.pdf")
        raise SystemExit(2)
    pdf = sys.argv[1]
    data = extract_form_fields(pdf)
    out = pathlib.Path(pdf).with_suffix(".fields.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Saved: {out}")
