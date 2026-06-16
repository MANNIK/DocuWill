from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from doc_manager.throttling import LoginBurstThrottle


class ThrottledTokenObtainPairView(TokenObtainPairView):
    """Login JWT con rate limiting anti brute-force (10 tentativi/min per IP)."""
    throttle_classes = [LoginBurstThrottle]


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/token/", ThrottledTokenObtainPairView.as_view(), name="token_obtain"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/", include("doc_manager.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)