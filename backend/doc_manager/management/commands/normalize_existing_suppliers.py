from django.core.management.base import BaseCommand
from doc_manager.models import Document
from doc_manager.utils import normalize_supplier, canonical_supplier_name


class Command(BaseCommand):
    help = 'Normalizza i nomi fornitore esistenti e popola supplier_canonical'

    def handle(self, *args, **options):
        # Step 1: normalizza whitespace su tutti i Document
        updated_names = 0
        for doc in Document.objects.exclude(supplier_name=''):
            normalized = normalize_supplier(doc.supplier_name)
            if normalized != doc.supplier_name:
                doc.supplier_name = normalized
                doc.save(update_fields=['supplier_name'])
                updated_names += 1
        self.stdout.write(f'Step 1: normalizzati {updated_names} nomi (whitespace).')

        # Step 2: canonical "secco" (suffix strip, no fuzzy) — prima passata
        for doc in Document.objects.exclude(supplier_name=''):
            doc.supplier_canonical = canonical_supplier_name(doc.supplier_name)
            doc.save(update_fields=['supplier_canonical'])
        total = Document.objects.exclude(supplier_name='').count()
        self.stdout.write(f'Step 2: canonical secco su {total} documenti.')

        # Step 3: seconda passata con fuzzy matching contro i canonical già calcolati
        # Questo unifica varianti tipo "NORDIC DESIGN" vs leggere differenze ortografiche
        existing = list(
            Document.objects.exclude(supplier_canonical='')
            .values_list('supplier_canonical', flat=True).distinct()
        )
        updated_canon = 0
        for doc in Document.objects.exclude(supplier_name=''):
            new_canon = canonical_supplier_name(doc.supplier_name, existing)
            if new_canon != doc.supplier_canonical:
                doc.supplier_canonical = new_canon
                doc.save(update_fields=['supplier_canonical'])
                updated_canon += 1
        self.stdout.write(f'Step 3: fuzzy-resolved {updated_canon} documenti.')

        self.stdout.write(self.style.SUCCESS('Backfill completato.'))
        self.stdout.write(self.style.WARNING(
            'Le chiavi cache Redis col_map:* sono ora stale.\n'
            'Esegui: docker compose exec redis redis-cli -n 2 FLUSHDB'
        ))
