# 0002. Сервис хранит состояние встречи между сессиями модели

Встреча может продолжаться через несколько вызовов модели и после обрыва связи. Сервис хранит в PostgreSQL состояние мока, версии, попытки и очередь заданий. При повторной отправке уже принятого хода с тем же идентификатором сервис возвращает прежнюю запись. Кандидат продолжает с сохранённого места.

Загруженные файлы хранятся в закрытом объектном хранилище. API и фоновый обработчик работают отдельными процессами из одного Docker-образа. Так кандидат может продолжать мок по готовым материалам, пока сервис разбирает новый файл и пополняет банк вопросов.

## English

A meeting can span model calls and survive a lost connection. The service stores mock interview state, versions, attempts and the job queue in PostgreSQL. When a client resends an accepted turn with the same identifier, the service returns the existing record and the candidate resumes from the saved position.

Uploaded files live in private object storage. The API and background worker run as separate processes from the same Docker image. The candidate can continue using available materials while the service processes a new file and adds questions to the bank.

[Восстановление / Recovery](https://github.com/KirillSachkov/interview-sensei/issues/9#issuecomment-7009806166) · [Хранение и выполнение / Storage and execution](https://github.com/KirillSachkov/interview-sensei/issues/10#issuecomment-7010882213)
