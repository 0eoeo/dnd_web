from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    HomeView, ArtView, ViewerView,
    CharacterSheetViewSet, RollViewSet,
    LoreFolderViewSet, MediaFolderViewSet,
    LoreArticleViewSet, MediaAssetViewSet,
    spells_list, spell_detail,
)

router = DefaultRouter()
router.register(r'sheets', CharacterSheetViewSet, basename='sheets')
router.register(r'rolls', RollViewSet, basename='rolls')
router.register(r'lore-folders', LoreFolderViewSet, basename='lore-folders')
router.register(r'media-folders', MediaFolderViewSet, basename='media-folders')
router.register(r'articles', LoreArticleViewSet, basename='articles')
router.register(r'media', MediaAssetViewSet, basename='media')

urlpatterns = [
    path("", HomeView.as_view(), name="home"),
    path("art/", ArtView.as_view(), name="art"),
    path("viewer/", ViewerView.as_view(), name="viewer"),
    path("api/", include(router.urls)),
    path("api/spells/", spells_list, name="spells-list"),
    path("api/spells/<slug:slug>/", spell_detail, name="spell-detail"),
]
