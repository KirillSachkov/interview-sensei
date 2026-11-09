# Транскрибация видео: субтитры и локальное распознавание

Исследование к issue #36. Дата проверки: 2026-11-09.
Вопрос: какие инструменты рекомендовать агенту на каждой ступени лестницы и на каждой ОС.
Лестница из #36: субтитры через `yt-dlp`, затем локальное распознавание, затем транскрипт от кандидата.

Источники первичные: README, release-страницы, исходный код, статьи и model cards. Числа скорости для часа аудио — оценки; раздел 3 показывает расчёт. Непроверенные утверждения помечены «не проверено».

## Ответ

- **Ступень 1.** `yt-dlp` скачивает только субтитры флагом `--skip-download`. Для этого ffmpeg не нужен. Каждая ОС получает один файл 23–41 МБ. Для YouTube `yt-dlp` рекомендует ещё JS runtime Deno; его ставят отдельно.
- **Ступень 2.** Ни один инструмент не распознаёт видео одним файлом без ffmpeg. Видео и аудио YouTube (`webm`, `m4a`) сначала конвертирует ffmpeg.
- **Ступень 2, движок.** Только sherpa-onnx выпускает официальный CLI для всех трёх ОС, включая macOS arm64. Он же запускает GigaAM, Parakeet и Whisper без Python.
- **Ступень 2, модель для русского.** GigaAM v3 даёт лучший WER на русском: 10,6–11,6% на YouTube-речи против 17,8% у Whisper в таблице GigaAM. Архив модели весит 163–170 МБ.
- **Ступень 2, другие языки.** Для английского и других европейских языков подходит Parakeet TDT 0.6B v3: 25 языков, архив int8 487 МБ. Whisper large-v3-turbo покрывает остальные языки.
- **Скорость (оценка).** Час аудио на Apple Silicon занимает около 2–10 минут. На x86-ноутбуке без GPU Whisper small идёт 12–45 минут, large-v3-turbo может идти дольше часа.
- **whisper.cpp** остаётся запасным движком. Официальные бинарники есть для Windows и Linux, для macOS — нет.

## 1. Субтитры через `yt-dlp`

### Сборки

Последний релиз — `2026.10.26` от 2026-10-26 [1]. Standalone-файлы включают Python и не требуют установки [2].

| ОС | Файл | Размер |
| --- | --- | --- |
| macOS 10.15+, universal | `yt-dlp_macos` | 37,5 МБ |
| Linux x86_64, glibc 2.17+ | `yt-dlp_linux` | 41,2 МБ |
| Linux arm64 | `yt-dlp_linux_aarch64` | 40,8 МБ |
| Linux musl | `yt-dlp_musllinux` | 41,2 МБ |
| Windows 10+ x64 | `yt-dlp.exe` | 23,6 МБ |
| Windows arm64 | `yt-dlp_arm64.exe` | 22,8 МБ |
| Любая ОС с Python 3.11+ | `yt-dlp` (zipimport) | 3,1 МБ |

### Зависимости

- **ffmpeg и ffprobe** необязательны. Они нужны для склейки форматов и post-processing [2]. Скачивание субтитров без конвертации их не требует.
- **YouTube** для полной поддержки требует `yt-dlp-ejs` и JS runtime [2]. По умолчанию включён только Deno; Node, QuickJS и Bun включает `--js-runtimes` [2].
- Официальные бинарники содержат скрипты EJS, но не JS runtime [3]. Минимальные версии: Deno 2.3.0, Node 22.0.0 [3].
- Deno v2.9.8 весит 39–43 МБ в zip для macOS arm64, Linux x86_64 и Windows x64 [4].
- Без JS runtime `yt-dlp` убирает клиенты `web` и `tv_samsung` из списка по умолчанию [2]. Остаётся `visionos`. Работают ли тогда субтитры YouTube — **не проверено**.
- PO token для субтитров нужен только клиенту `web` [5]. Флаг `--sleep-subtitles` замедляет запросы субтитров [2]. Лимиты частоты для субтитров в документации не описаны.

### Какие сайты дают субтитры

- Поле `automatic_captions` (автосубтитры) заполняют extractors YouTube, Facebook, Floatplane, Lecturio, Naver и Udemy. Вывод сделан поиском по исходному коду тега `2026.10.26` [6].
- Около 292 файлов extractors упоминают `subtitles` [6]. Среди них Vimeo, TED, Rutube, VK, Loom, Zoom, Dailymotion и Bilibili.
- Список `supportedsites.md` не отмечает поддержку субтитров по сайтам [7]. Наличие дорожки зависит от конкретного видео.
- Ловушка YouTube: `automatic_captions` содержит машинные переводы на многие языки. Исходная дорожка распознавания помечена `<lang>-orig` [8]. Поэтому запрос `ru` у английского видео вернёт машинный перевод. Флаг `--extractor-args "youtube:skip=translated_subs"` убирает переводы [2].

### Команды

Агент сначала проверяет, какие дорожки есть:

```sh
yt-dlp --skip-download -J URL     # JSON: поля subtitles и automatic_captions
yt-dlp --list-subs URL            # таблица для человека
```

Затем агент скачивает только текст. Ручные субтитры идут первыми, автосубтитры — на языке оригинала:

```sh
yt-dlp --skip-download --write-subs --write-auto-subs \
  --sub-langs "ru,ru-orig,en,en-orig" --sub-format "vtt/srt/best" \
  --extractor-args "youtube:skip=translated_subs" \
  -P "subtitle:<каталог>" -o "subtitle:%(id)s.%(ext)s" URL
```

| Флаг | Что делает [2] |
| --- | --- |
| `--skip-download` | не скачивает видео, пишет только сопутствующие файлы |
| `--write-subs` | пишет ручные субтитры |
| `--write-auto-subs` | пишет автосубтитры |
| `--sub-langs` | список языков через запятую; принимает regex, `all` и исключение через `-` |
| `--sub-format` | порядок предпочтения форматов, например `vtt/srt/best` |
| `--list-subs` | показывает дорожки без скачивания |
| `-J` | печатает JSON с URL дорожек; агент может скачать дорожку сам |

**Простой текст.** `--convert-subs` поддерживает только `ass`, `lrc`, `srt` и `vtt` и вызывает ffmpeg [9]. Формата `txt` нет. Поэтому текст из `vtt` или `srt` извлекает агент или приложение: удаляет заголовок `WEBVTT`, строки времени с `-->`, номера и теги `<...>`. Автосубтитры YouTube в `vtt` повторяют строки, поэтому повторы нужно убрать. Это наблюдение сообщества, в документации его нет (**не проверено**).

## 2. Локальное распознавание

### Сводка движков

| Движок | Официальные сборки без brew и pip | Вход без ffmpeg | Лицензия |
| --- | --- | --- | --- |
| sherpa-onnx v2.0.1 | macOS arm64 и universal2, Linux x64, Windows x64: 20–44 МБ [10] | только WAV PCM [11] | Apache-2.0 |
| whisper.cpp v1.9.5 | Windows x64 8,9 МБ, Linux x64 10,4 МБ, Linux arm64 4,6 МБ; macOS — нет [12] | `wav`, `mp3`, `ogg`, `flac` [13] | MIT |
| faster-whisper 1.2.1 | нет, только `pip` [14] | любой формат: PyAV несёт свои библиотеки FFmpeg [14] | MIT |
| mlx-whisper 0.4.3 | нет, только `pip`; только Apple Silicon [15] | нет, README требует ffmpeg [15] | MIT |
| GigaAM (Python) | нет, `pip` и PyTorch [16] | нет, требует ffmpeg [16] | MIT |
| Vosk | библиотеки 2022 года для Windows и Linux; CLI только из `pip` [17] | CLI вызывает ffmpeg [18] | Apache-2.0 |

Подробности:

- **whisper.cpp.** Тег `v1.9.5` не содержит файлов. Бинарники лежат в nightly-теге `b5454` того же дня [12]. Есть Windows-сборки с OpenBLAS (21,7 МБ) и CUDA (285–685 МБ). Для macOS выходит только `xcframework`: это библиотека, не CLI. На macOS whisper.cpp нужно собирать из исходников или ставить через brew.
- **Вход whisper.cpp.** `whisper-cli` декодирует `mp3`, `ogg`, `flac` и `wav` встроенными miniaudio и stb_vorbis [13]. Главный README ещё пишет «только 16-bit WAV»; код это опровергает. Форматы `webm`, `m4a`, `opus` и `mp4` требуют ffmpeg [19].
- **sherpa-onnx.** Программа `sherpa-onnx-vad-with-offline-asr` режет длинное аудио через Silero VAD и распознаёт куски офлайн-моделью [20]. VAD (voice activity detection) находит участки речи. Файл `silero_vad.onnx` весит 644 КБ.
- **faster-whisper.** Сторонняя сборка Purfview `whisper-standalone-win` весит 1,4–1,7 ГБ [21]. У репозитория нет файла лицензии. Сборки для macOS arm64 нет. Рекомендовать её не стоит.
- **GigaAM.** Метод `.transcribe` принимает до 25 секунд аудио. Длинное аудио требует pyannote и токен Hugging Face [16]. Без Python GigaAM запускает sherpa-onnx с VAD.
- **onnx-asr 0.12.0** — `pip`-пакет без PyTorch и FFmpeg [22]. Он запускает Parakeet, Canary, GigaAM и Whisper. Вход — только WAV.

**Вывод: ffmpeg нужен почти всегда.** Видеофайл кандидата и аудио с YouTube приходят в контейнерах `mp4`, `webm` или `m4a`. Их читает только ffmpeg. Официальный сайт ffmpeg не выпускает бинарники; он ссылается на сторонние сборки [23]. `yt-dlp` поддерживает свои сборки FFmpeg-Builds [24]:

| ОС | Сборка ffmpeg | Размер архива |
| --- | --- | --- |
| Linux x64 | `ffmpeg-master-latest-linux64-gpl.tar.xz` [24] | 158 МБ |
| Linux arm64 | `ffmpeg-master-latest-linuxarm64-gpl.tar.xz` [24] | 133 МБ |
| Windows x64 | `ffmpeg-master-latest-win64-gpl.zip` [24] | 202 МБ |
| macOS | evermeet.cx, ссылка с ffmpeg.org [23] | размер не проверен |

Команда подготовки аудио:

```sh
ffmpeg -i input.mp4 -vn -ac 1 -ar 16000 -c:a pcm_s16le audio.wav
```

### Модели: размер и память

| Модель | Языки | Файл | RAM |
| --- | --- | --- | --- |
| GigaAM v3 CTC / RNN-T, с пунктуацией или без, sherpa-onnx | русский | архив 163–170 МБ [25] | не опубликовано |
| Parakeet TDT 0.6B v3 int8, sherpa-onnx | 25 европейских, включая русский [26] | архив 487 МБ, распакованно 640 МБ [27] | не опубликовано |
| Whisper small, whisper.cpp | 99 | 466 МиБ; `q5_1` 190 МБ [19][28] | ~852 МБ [19] |
| Whisper medium, whisper.cpp | 99 | 1,5 ГиБ; `q5_0` 539 МБ [19][28] | ~2,1 ГБ [19] |
| Whisper large-v3-turbo, whisper.cpp | 99 | 1625 МБ; `q8_0` 874 МБ; `q5_0` 574 МБ [28] | не опубликовано; large ~3,9 ГБ [19] |
| Whisper large-v3, whisper.cpp | 99 | 3095 МБ; `q5_0` 1081 МБ [28] | ~3,9 ГБ [19] |
| Whisper turbo / large-v3, sherpa-onnx | 99 | архивы 564 / 1068 МБ [25] | не опубликовано |
| Vosk ru 0.42 / small ru 0.22 | русский | 1,8 ГБ / 45 МБ [17] | до 16 ГБ / ~300 МБ [17] |

Лицензии моделей: GigaAM — MIT с декабря 2024 [16]; первая версия GigaAM была некоммерческой [29]. Parakeet v3 и Canary-1b-v2 — CC BY 4.0 [26][30]. Whisper — MIT.

## 3. Скорость для часа аудио

### Опубликованные замеры

| Источник | Железо | Модель | Результат |
| --- | --- | --- | --- |
| faster-whisper README [14] | i7-12700K, 8 потоков, CPU | small, 13 мин аудио, beam 5 | faster-whisper int8: 1 мин 42 с; с `batch_size=8`: 51 с; whisper.cpp fp32: 2 мин 05 с |
| whisper.cpp v1.8.0 [31] | M1 Pro, Metal | small | encoder 135 мс на окно 30 с; decoder 4,23 мс на токен |
| whisper.cpp v1.8.0 [31] | M1 Pro, Metal | medium | encoder 395 мс; decoder 9,14 мс |
| whisper.cpp v1.8.0 [31] | M4 Max, Metal | large-v3-turbo | encoder 250 мс; decoder 1,65 мс |
| whisper.cpp issue #89 [32] | i5-1135G7, ноутбук, 8 потоков | medium | encoder 24,9 с на окно |
| whisper.cpp issue #89 [33] | M1 Ultra, Core ML + Metal | turbo `q8_0` | encoder 618 мс; decoder 2,01 мс |
| sherpa-onnx docs [27] | CPU, 2 потока, железо не указано | Parakeet v3 int8 + VAD, файл 334 с | RTF 0,028 |
| sherpa-onnx docs [29] | CPU, 2 потока, железо не указано | GigaAM v2 CTC int8, клип 11,3 с | RTF 0,329 |

RTF (real-time factor) — время обработки, делённое на длину аудио. RTF 0,1 значит: час аудио обрабатывается за 6 минут.
Замеры issue #89 публикуют пользователи, а не мейнтейнеры. Их стоит считать ориентиром.

### Оценки

Допущения: час — это 120 окон по 30 секунд. Русская речь даёт около 200 токенов Whisper на окно; это допущение, источника нет. Декодирование greedy, загрузка модели не учитывается.

| Модель и движок | macOS Apple Silicon | x86-ноутбук без GPU |
| --- | --- | --- |
| Whisper small, whisper.cpp | M1 Pro: 120 × (0,135 + 200 × 0,00423) ≈ 2 мин. M1: ~4–5 мин, у M1 вдвое меньше GPU-ядер | 12700K: RTF 125/780 = 0,16, то есть ~10 мин. Ноутбук в 1,5–4,6 раза медленнее, то есть ~15–45 мин |
| Whisper small, faster-whisper int8 | не рекомендуется: нет Metal | 12700K: RTF 102/780 = 0,131, то есть ~8 мин. Ноутбук: ~12–36 мин |
| Whisper large-v3-turbo, whisper.cpp | M1 Pro: замеры M1 Ultra × 1,18 дают ~0,73 с + 200 × 2,4 мс на окно, то есть ~2,5–5 мин. M1: ~5–10 мин | i5-1135G7: encoder turbo ≈ 2,1 × medium ≈ 52 с на окно; 120 × 52 с ≈ 1,7 ч. Медленнее реального времени |
| Parakeet v3 int8, sherpa-onnx | 3600 × 0,028 ≈ 2 мин на машине мейнтейнера | ~2–10 мин; замера на x86 нет |
| GigaAM v3 int8, sherpa-onnx | верхняя граница 0,33 × 60 ≈ 20 мин по короткому клипу | реально ближе к Parakeet: модель меньше. **Не проверено** |

Как получены коэффициенты:

- **1,5–4,6 раза** — разница encoder small между Ryzen 9 5950X (1,39 с) и Ryzen 5 4500U (6,37 с) в issue #89 [32]. Код 2022 года.
- **1,18** — отношение encoder small у M1 Pro (135 мс) и M1 Ultra (114 мс).
- **2,1** — отношение вычислений encoder large-v3 (32 слоя × 1280²) к medium (24 слоя × 1024²).
- RTF короткого клипа завышен. У Parakeet RTF падает с 0,325 на клипе 3,8 с до 0,028 на файле 334 с [27].

Вывод: на x86 без GPU Whisper large-v3-turbo для часового видео не годится. GigaAM и Parakeet через sherpa-onnx — самые быстрые варианты, но их скорость на x86 нужно замерить самим.

## 4. Качество русской речи

WER (word error rate) — доля ошибочных слов, ниже — лучше. Источники по-разному нормализуют текст. Числа из разных таблиц годятся только для грубого сравнения.

### Whisper, статья OpenAI [34]

| Модель | Common Voice 9 ru | FLEURS ru |
| --- | --- | --- |
| tiny | 40,6 | 31,1 |
| base | 28,8 | 20,5 |
| small | 15,0 | 11,4 |
| medium | 9,3 | 7,2 |
| large | 8,2 | 6,4 |
| large-v2 | 7,1 | 5,6 |

MLS не содержит русского, поэтому числа MLS нет.
OpenAI заявляет для large-v3 на 10–20% меньше ошибок, чем у large-v2 [35]. Числа по языкам опубликованы только картинкой; русское число **не проверено**.
Turbo, по словам OpenAI, работает «примерно как large-v2» [36]. Русского числа нет.

### GigaAM, таблица мейнтейнеров [37]

| Набор | GigaAM v3 CTC | GigaAM v3 RNN-T | GigaAM v2 RNN-T | Whisper* |
| --- | --- | --- | --- | --- |
| Golos Farfield | 4,5 | 3,9 | 4,0 | 16,4 |
| Golos Crowd | 2,8 | 2,4 | 2,3 | 19,0 |
| Russian LibriSpeech | 4,7 | 4,4 | 5,2 | 9,4 |
| Common Voice 19 | 1,3 | 0,9 | 0,9 | 5,5 |
| OpenSTT YouTube | 11,6 | 10,6 | 13,0 | 17,8 |
| OpenSTT Phone Calls | 18,6 | 17,4 | 19,8 | 27,4 |
| OpenSTT Audiobooks | 8,7 | 8,2 | 10,3 | 14,3 |
| Среднее по 10 наборам | 9,1 | 8,3 | 10,6 | 21,0 |

Версия Whisper* в таблице не указана (**не проверено**). Набор OpenSTT YouTube ближе всего к видео собеседований.
Та же страница сравнивает многоязычные модели на коротких фразах: Whisper large-v3 даёт 9,1 на CV ru и 3,1 на FLEURS ru [37].
README GigaAM заявляет: в side-by-side с оценкой LLM ответы GigaAM v3 предпочли в 70% случаев против 30% у Whisper-large-v3 [16].

### NVIDIA и Vosk

| Модель | Набор | WER ru |
| --- | --- | --- |
| Parakeet TDT 0.6B v3 [26] | FLEURS | 5,51 |
| Parakeet TDT 0.6B v3 [26] | CoVoST2 | 3,00 |
| Canary-1b-v2 [30] | FLEURS | 6,90 |
| Canary-1b-v2 [30] | CoVoST2 | 5,14 |
| Vosk ru 0.42 [17] | OpenSTT YouTube | 19,5 |
| Vosk ru 0.42 [17] | Golos Crowd | 4,4 |
| Vosk small ru 0.22 [17] | OpenSTT YouTube | 31,97 |

Open ASR Leaderboard в версиях статьи v1–v3 оценивает только de, fr, it, es и pt; русского нет [38]. Состав языков в v4 и в живом Space **не проверен**.

**Ранжирование для русского:** GigaAM v3 → Parakeet v3 ≈ Whisper large-v3 → Whisper turbo и medium → Whisper small → Vosk. Whisper small с 15% WER на Common Voice даёт заметно худший текст.

## 5. Рекомендуемая лестница по ОС

| Ступень | macOS Apple Silicon | Linux x86_64 | Windows x64 |
| --- | --- | --- | --- |
| 1. Субтитры | `yt-dlp_macos` + Deno для YouTube | `yt-dlp_linux` + Deno | `yt-dlp.exe` + Deno |
| 2а. Аудио | ffmpeg от evermeet.cx | ffmpeg из `yt-dlp/FFmpeg-Builds` | ffmpeg из `yt-dlp/FFmpeg-Builds` |
| 2б. Движок | sherpa-onnx `osx-arm64-shared` | sherpa-onnx `linux-x64-shared` | sherpa-onnx `win-x64-shared` |
| 2в. Модель, русский | GigaAM v3 RNN-T с пунктуацией | то же | то же |
| 2в. Модель, другие языки | Parakeet v3 int8; вне 25 языков — Whisper turbo | Parakeet v3 int8; Whisper turbo очень медленный | как на Linux |
| Запасной движок | whisper.cpp, сборка из исходников + Metal | whisper.cpp `whisper-bin-ubuntu-x64` | whisper.cpp `whisper-bin-x64` |
| 3. Транскрипт | кандидат прикладывает текст | то же | то же |

Почему так:

- **sherpa-onnx одинаков на трёх ОС.** Один skill описывает одну процедуру. Официальные сборки есть везде, Python не нужен.
- **GigaAM v3** лучше всех на русском и весит меньше 200 МБ. На OpenSTT YouTube её WER 10,6–11,6 против 17,8 у Whisper.
- **Parakeet v3** показал RTF 0,028 на CPU в замере sherpa-onnx. На русском FLEURS он не хуже Whisper large-v2 на русском FLEURS: 5,51 против 5,6. Нормализация текста разная, поэтому сравнение грубое.
- **whisper.cpp** нужен для языков вне 25 европейских и как проверенный движок с Metal на Mac. Но на macOS его нужно собирать: нужны Xcode Command Line Tools и cmake.
- **faster-whisper и mlx-whisper** требуют Python-окружение. Это противоречит цели «без brew и pip». Их стоит предлагать, только если у кандидата уже есть Python.

Что агент спрашивает у кандидата перед установкой:

1. **Язык видео.** Ответ выбирает модель: GigaAM, Parakeet или Whisper.
2. **Есть ли готовые инструменты.** Агент проверяет `yt-dlp`, `deno`, `ffmpeg` в `PATH` и спрашивает, использовать ли их.
3. **Место установки.** Каталог данных приложения или система кандидата. Это открытый вопрос #36.
4. **Объём загрузки.** Агент называет сумму: например, `yt-dlp` 38 МБ + Deno 39 МБ + ffmpeg 130–200 МБ + sherpa-onnx 20–30 МБ + модель 170–490 МБ.
5. **Ожидаемое время.** Агент называет оценку для часа видео на машине кандидата и предупреждает, что это оценка.
6. **Каждую загрузку и запуск** агент подтверждает отдельно, как требует #36.

## Открытые вопросы

- Работают ли субтитры YouTube без JS runtime через клиент `visionos`. Нужен ручной опыт.
- Скорость GigaAM v3 и Parakeet v3 на x86-ноутбуке и на Apple Silicon для часового файла. Первичных замеров нет; нужен прототип.
- Потребление RAM моделями sherpa-onnx не опубликовано.
- Русский WER Whisper large-v3 и turbo в числах OpenAI не опубликован.
- Размер и подпись сборки ffmpeg для macOS с evermeet.cx не проверены. На macOS Gatekeeper может блокировать скачанные бинарники; это тоже нужно проверить в прототипе.
- Нужна ли диаризация (кто говорит: интервьюер или кандидат). Ни один рекомендованный движок её не делает из коробки.

## Источники

1. yt-dlp, последний релиз, GitHub API `repos/yt-dlp/yt-dlp/releases/latest`. https://github.com/yt-dlp/yt-dlp/releases/latest
2. yt-dlp README: Release files, Dependencies, Subtitle Options, Download Options, Workarounds, extractor-args. https://github.com/yt-dlp/yt-dlp#readme
3. yt-dlp wiki, EJS. https://github.com/yt-dlp/yt-dlp/wiki/EJS
4. Deno, последний релиз v2.9.8. https://github.com/denoland/deno/releases/latest
5. yt-dlp wiki, PO Token Guide. https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
6. yt-dlp, исходный код extractors, тег `2026.10.26`. https://github.com/yt-dlp/yt-dlp/tree/2026.10.26/yt_dlp/extractor
7. yt-dlp, supportedsites.md. https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md
8. yt-dlp, `youtube/_video.py`, тег `2026.10.26`. https://github.com/yt-dlp/yt-dlp/blob/2026.10.26/yt_dlp/extractor/youtube/_video.py
9. yt-dlp, `postprocessor/ffmpeg.py`, `FFmpegSubtitlesConvertorPP`. https://github.com/yt-dlp/yt-dlp/blob/2026.10.26/yt_dlp/postprocessor/ffmpeg.py
10. sherpa-onnx, релиз v2.0.1 от 2026-10-26. https://github.com/k2-fsa/sherpa-onnx/releases/tag/v2.0.1
11. sherpa-onnx, `wave-reader.cc`. https://github.com/k2-fsa/sherpa-onnx/blob/master/sherpa-onnx/csrc/wave-reader.cc
12. whisper.cpp, релизы `v1.9.5` и `b5454`; workflow `release.yml`. https://github.com/ggml-org/whisper.cpp/releases/tag/b5454, https://github.com/ggml-org/whisper.cpp/blob/master/.github/workflows/release.yml
13. whisper.cpp, `examples/common-whisper.cpp` и `examples/cli/README.md`. https://github.com/ggml-org/whisper.cpp/blob/master/examples/common-whisper.cpp
14. faster-whisper README, Requirements и Benchmark. https://github.com/SYSTRAN/faster-whisper
15. mlx-whisper README и PyPI. https://github.com/ml-explore/mlx-examples/tree/main/whisper, https://pypi.org/project/mlx-whisper/
16. GigaAM README. https://github.com/salute-developers/GigaAM
17. Vosk, список моделей. https://alphacephei.com/vosk/models
18. Vosk, `transcriber.py`. https://github.com/alphacep/vosk-api/blob/master/python/vosk/transcriber/transcriber.py
19. whisper.cpp README: Memory usage, FFmpeg support, Core ML. https://github.com/ggml-org/whisper.cpp
20. sherpa-onnx, `sherpa-onnx-vad-with-offline-asr.cc`. https://github.com/k2-fsa/sherpa-onnx/blob/master/sherpa-onnx/csrc/sherpa-onnx-vad-with-offline-asr.cc
21. Purfview, whisper-standalone-win. https://github.com/Purfview/whisper-standalone-win
22. onnx-asr README. https://github.com/istupakov/onnx-asr
23. FFmpeg, страница загрузки. https://ffmpeg.org/download.html
24. yt-dlp/FFmpeg-Builds, релиз `latest` от 2026-11-08. https://github.com/yt-dlp/FFmpeg-Builds/releases/tag/latest
25. sherpa-onnx, релиз `asr-models`. https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models
26. NVIDIA, model card parakeet-tdt-0.6b-v3. https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3
27. sherpa-onnx docs, NeMo transducer models. https://k2-fsa.github.io/sherpa/onnx/pretrained_models/offline-transducer/nemo-transducer-models.html
28. Модели whisper.cpp на Hugging Face. https://huggingface.co/ggerganov/whisper.cpp/tree/main
29. sherpa-onnx docs, русские NeMo CTC-модели. https://k2-fsa.github.io/sherpa/onnx/pretrained_models/offline-ctc/nemo/russian.html
30. NVIDIA, model card canary-1b-v2. https://huggingface.co/nvidia/canary-1b-v2
31. whisper.cpp, release notes v1.8.0. https://github.com/ggml-org/whisper.cpp/releases/tag/v1.8.0
32. whisper.cpp issue #89, замеры пользователей. https://github.com/ggml-org/whisper.cpp/issues/89, https://github.com/ggml-org/whisper.cpp/issues/89#issuecomment-3449627639
33. whisper.cpp issue #89, M1 Ultra. https://github.com/ggml-org/whisper.cpp/issues/89#issuecomment-3762700537
34. Radford et al. Robust Speech Recognition via Large-Scale Weak Supervision, 2022, Appendix D.2, Tables 11 и 13. https://cdn.openai.com/papers/whisper.pdf
35. OpenAI, анонс large-v3. https://github.com/openai/whisper/discussions/1762
36. OpenAI, анонс large-v3-turbo. https://github.com/openai/whisper/discussions/2363
37. GigaAM, evaluation.md. https://github.com/salute-developers/GigaAM/blob/main/evaluation.md
38. Open ASR Leaderboard, arXiv 2510.06961. https://arxiv.org/abs/2510.06961
