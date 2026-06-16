"""
Dipendenze FastAPI condivise tra i router.

`require_internal_token` è un FastAPI Depends che verifica l'header
X-Internal-Token su ogni richiesta verso i router AI (csv_parser, ocr, classifier).

Rationale: il microservizio NON è più esposto sull'host (porta 8001 rimossa da
docker-compose.yml). Questo token è la barriera applicativa aggiuntiva: anche se
qualcuno riuscisse ad accedere alla rete Docker, non può chiamare i router AI senza
il token. /health è escluso per permettere al healthcheck di docker-compose.
"""
import hmac
import logging
import os

from fastapi import Header, HTTPException, status

logger = logging.getLogger(__name__)

# Il token viene letto da env al startup — non cambia a runtime.
_AI_SERVICE_TOKEN = os.environ.get("AI_SERVICE_TOKEN", "")

if not _AI_SERVICE_TOKEN:
    logger.warning(
        "AI_SERVICE_TOKEN non configurato. In produzione impostare questa variabile "
        "in .env.ai per abilitare l'autenticazione interna tra backend e ai_service."
    )


def require_internal_token(x_internal_token: str = Header(default="")) -> None:
    """
    Dipendenza FastAPI: rifiuta la request con 403 se il token non corrisponde.
    Non viene applicata su /health (dichiarato in main.py senza Depends).

    Se AI_SERVICE_TOKEN è vuoto (non configurato in .env.ai) il servizio opera
    in modalità sviluppo senza autenticazione — accettabile solo in dev/Docker
    con la porta non esposta sull'host.

    In produzione, AI_SERVICE_TOKEN DEVE essere impostato: un token mancante
    lascia l'ai_service accessibile a chiunque raggiunga la rete Docker.

    Il confronto usa hmac.compare_digest per resistere a timing side-channel.
    """
    if not _AI_SERVICE_TOKEN:
        # Dev mode: nessun token configurato → accetta tutto (solo dentro Docker).
        return
    # Confronto constant-time per evitare timing attacks.
    if not hmac.compare_digest(x_internal_token, _AI_SERVICE_TOKEN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token interno non valido.",
        )
