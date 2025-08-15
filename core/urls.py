from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('art/', views.art, name='art'),
    path("viewer/", views.viewer, name="viewer"),

    path("api/sheets/", views.sheets_collection, name="sheets-collection"),
    path("api/sheets/<int:pk>/", views.sheet_detail, name="sheets-detail"),
    path("api/upload-pdf/", views.upload_pdf, name="upload-pdf"),
    path("api/media-sheets/", views.list_media_sheets, name="media-sheets"),
    path("api/spells/", views.spells_list, name="spells-list"),
    path("api/spells/<path:slug>/", views.spell_detail_view, name="spell-detail"),

    path("api/rolls", views.api_rolls),
    path("api/rolls/create", views.api_roll_create),
]
