import fitz
import pytesseract
from PIL import Image
import io
import json

from core.config import FIELDS

pytesseract.pytesseract.tesseract_cmd = r"D:\Tesseract\tesseract.exe"

pdf_path = "Лист персонажа пустой.pdf"

doc = fitz.open(pdf_path)
page = doc[0]
pix = page.get_pixmap(dpi=300)
img = Image.open(io.BytesIO(pix.tobytes("png")))

# OCR с координатами
ocr_data = pytesseract.image_to_data(img, lang="rus+eng", output_type=pytesseract.Output.DICT)

# Список известных меток (как в твоём старом FIELDS)
labels = FIELDS

fields_with_coords = {}
for key, label in labels.items():
    for i, word in enumerate(ocr_data['text']):
        if word.strip().lower() == label.lower():
            fields_with_coords[key] = {
                "label": label,
                "x": ocr_data['left'][i],
                "y": ocr_data['top'][i]
            }
            break

with open("FIELDS_with_coords.json", "w", encoding="utf-8") as f:
    json.dump(fields_with_coords, f, ensure_ascii=False, indent=2)

print("Сохранено в FIELDS_with_coords.json")
