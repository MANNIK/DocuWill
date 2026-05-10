from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("doc_manager", "0002_add_summary_doc_type"),
    ]

    operations = [
        migrations.AlterField(
            model_name="document",
            name="source",
            field=models.CharField(
                choices=[
                    ("upload", "Upload CSV/Excel"),
                    ("whatsapp", "WhatsApp"),
                    ("image", "Immagine caricata"),
                ],
                max_length=20,
            ),
        ),
    ]
