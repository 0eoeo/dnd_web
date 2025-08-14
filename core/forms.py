from django import forms
from .models import UploadedPDF

class PDFUploadForm(forms.Form):
    pdf_file = forms.FileField(required=False, label="Загрузить PDF")
    existing_file = forms.ModelChoiceField(
        queryset=UploadedPDF.objects.all(),
        required=False,
        label="Или выбрать сохранённый"
    )
