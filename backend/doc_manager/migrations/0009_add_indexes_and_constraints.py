# Migration manuale — aggiunge indici mancanti e constraint unicità su Reconciliation.
# Verificata contro models.py corrente.

from django.db import migrations, models
from django.db.models.functions import Lower


class Migration(migrations.Migration):

    dependencies = [
        ('doc_manager', '0008_security_fields'),
    ]

    operations = [
        # Indice su Document.status (filtrato di continuo nelle queryset)
        migrations.AddIndex(
            model_name='document',
            index=models.Index(fields=['status'], name='doc_status_idx'),
        ),
        # Indice su Document.created_at (usato per ordinamento default e query quota)
        migrations.AddIndex(
            model_name='document',
            index=models.Index(fields=['created_at'], name='doc_created_at_idx'),
        ),
        # Indice su Document.created_by (già ha db_index=True, ma manca nel Meta.indexes
        # per il query planner — il db_index genera già un indice, questo è ridondante
        # ma esplicito; skippiamo per evitare duplicati)

        # Indice su Reconciliation.status
        migrations.AddIndex(
            model_name='reconciliation',
            index=models.Index(fields=['status'], name='recon_status_idx'),
        ),
        # Constraint unicità su (doc1, doc2): impedisce riconciliazioni duplicate
        # tra la stessa coppia di documenti a livello DB (la logica Python già lo
        # controlla, ma il constraint è la barriera definitiva contro race condition).
        migrations.AddConstraint(
            model_name='reconciliation',
            constraint=models.UniqueConstraint(
                fields=['doc1', 'doc2'],
                name='unique_reconciliation_pair',
            ),
        ),
    ]
