from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("doc_manager", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="document",
            name="doc_type",
            field=models.CharField(
                choices=[
                    ("unknown", "Sconosciuto"),
                    ("order", "Ordine"),
                    ("invoice", "Fattura"),
                    ("ddt", "DDT"),
                    ("price_list", "Tariffario"),
                    ("packing_list", "Packing List"),
                    ("shipment", "Spedizione"),
                    ("confirmation", "Conferma"),
                    ("summary", "Riepilogo"),
                ],
                default="unknown",
                max_length=20,
            ),
        ),
    ]
