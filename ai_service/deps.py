"""
Dipendenze FastAPI condivise tra i router.

`require_internal_token` è un FastAPI Depends che verifica l'header
X-Internal-Token su ogni richiesta verso i router AI (csv_parser, ocr, classifier).

Rationale: il microservizio NON è più esposto sull'host (porta 8001 rimossa da
docker-compose.yml). Questo token è la barriera applicativa aggiuntiva: anche se
qualcuno riuscisse ad accedere alla rete Docker, non può chiamare i router AI senza
il token. /health è escluso per permettere al healthcheck di docker-compose.
"""
import os

from fastapi import Header, HTTPException, status

# Il token viene letto da env al startup — non cambia a runtime.
_AI_SERVICE_TOKEN = os.environ.get("AI_SERVICE_TOKEN", "")


def require_internal_token(x_internal_token: str = Header(default="")) -> None:
    """
    Dipendenza FastAPI: rifiuta la request con 403 se il token non corrisponde.
    Non viene applicata su /health (dichiarato in main.py senza Depends).

    Se AI_SERVICE_TOKEN è vuoto (non configurato), la dipendenza accetta tutto —
    questo garantisce che il sistema funzioni in sviluppo anche senza il token,
    pur segnalando il problema nei log.
    """
    if not _AI_SERVICE_TOKEN:
        # Token non configurato: logga warning ma non blocca.
        # In produzione impostare AI_SERVICE_TOKEN in .env.ai.
        import logging
        logging.getLogger(__name__).warning(
            "AI_SERVICE_TOKEN non configurato — autenticazione interna disabilitata."
        )
        return
    if x_internal_token != _AI_SERVICE_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token interno non valido.",
        )
