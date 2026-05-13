from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("doc_manager", "0003_add_image_source"),
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
                    ("inventory", "Inventario"),
                ],
                default="unknown",
                max_length=20,
            ),
        ),
    ]
