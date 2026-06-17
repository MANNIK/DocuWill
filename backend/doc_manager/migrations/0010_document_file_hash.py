from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("doc_manager", "0009_add_indexes_and_constraints"),
    ]

    operations = [
        migrations.AddField(
            model_name="document",
            name="file_hash",
            field=models.CharField(
                max_length=64,
                blank=True,
                default="",
                db_index=True,
                help_text="SHA-256 hex del contenuto del file. Usato per rilevare duplicati indipendentemente dal filename.",
            ),
        ),
    ]
