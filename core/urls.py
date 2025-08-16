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

    path("api/art/media", views.api_media_list_create, name="api_media_list_create"),  # GET(list), POST(upload)
    path("api/art/media/<int:pk>/", views.api_media_detail, name="api_media_detail"),  # GET/DELETE

    # Articles API
    path("api/art/lore/articles", views.api_articles_list_create, name="api_articles_list_create"),
    path("api/art/lore/articles/<int:pk>/", views.api_article_detail, name="api_article_detail"),
    # Article comments API
    path("api/art/lore/articles/<int:pk>/comments", views.api_article_comments, name="api_article_comments"),

path('api/art/lore/folders', views.LoreFolderListCreate.as_view(), name='lore_folders'),
    path('api/art/lore/folders/<int:pk>/', views.LoreFolderDestroy.as_view(), name='lore_folder_detail'),
    # media folders
    path('api/art/media/folders', views.MediaFolderListCreate.as_view(), name='media_folders'),
    path('api/art/media/folders/<int:pk>/', views.MediaFolderDestroy.as_view(), name='media_folder_detail'),
]
