from fastapi import FastAPI
from routers import csv_parser, ocr, classifier

app = FastAPI(
    title="WeWill AI Service",
    description="Microservizio per parsing CSV/Excel e OCR documenti",
    version="0.1.0",
)

app.include_router(csv_parser.router)
app.include_router(ocr.router)
app.include_router(classifier.router)


@app.get("/health")
def health():
    return {"status": "ok"}