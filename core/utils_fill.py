import fitz  # PyMuPDF

def fill_pdf_acroform(src_pdf_path: str, dst_pdf_path: str, values: dict):
    """
    Подставляет значения в поля формы (AcroForm) и сохраняет новый PDF.
    Для чекбоксов ожидаем True/False или 'Yes'/'Off'.
    """
    doc = fitz.open(src_pdf_path)
    for page in doc:
        widgets = page.widgets() or []
        for w in widgets:
            name = w.field_name
            if not name or name not in values:
                continue
            val = values[name]
            # нормализация чекбоксов
            if w.field_type == 2:  # Checkbox
                checked = str(val).lower() in ('true', '1', 'yes', 'on')
                w.field_value = 'Yes' if checked else 'Off'
            else:
                w.field_value = '' if val is None else str(val)
            w.update()
    doc.save(dst_pdf_path)
    doc.close()
