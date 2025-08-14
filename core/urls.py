from django.urls import path
from . import views

urlpatterns = [
    path("viewer/", views.viewer, name="viewer"),

    # Коллекция листов: GET (список) и POST (создать)
    path("api/sheets/", views.sheets_collection, name="sheets-collection"),

    # Детально: GET (получить), PUT/PATCH (обновить)
    path("api/sheets/<int:pk>/", views.sheet_detail, name="sheets-detail"),

    # PDF -> JSON -> сохранение
    path("api/upload-pdf/", views.upload_pdf, name="upload-pdf"),

    path("api/media-sheets/", views.list_media_sheets, name="media-sheets"),

    path("api/spells/", views.spells_list, name="spells-list"),

    path("api/spells/<path:slug>/", views.spell_detail_view, name="spell-detail"),
]
