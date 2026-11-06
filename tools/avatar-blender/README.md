# Сборка аватара в headless Blender

Скрипты, которыми собран `src/assets/model/avatar.glb` (волосы с чёлкой и «шапкой», глаза, ткань).
Запуск (Python 3.13, `pip install bpy numpy pillow`): сначала `python texgen.py` (текстуры), затем `python build_v1.py export`.
Пути внутри скриптов указывают на рабочую папку сессии — поправьте `SRC`, `TEX`, `SC` под свою машину.
Оригинальный GLB остаётся в истории git (коммит до `Аватар: ...`).
