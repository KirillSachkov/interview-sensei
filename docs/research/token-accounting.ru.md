Агент (Codex): исследование [#102](https://github.com/KirillSachkov/interview-sensei/issues/102), 2026-11-10.

# Измерение расхода токенов всей цепочки

У всех трёх проверенных адаптеров есть счётчики input/output/cache в ответе
`session/prompt`. Приложение сейчас их отбрасывает. Поэтому отдельная метрика полезна,
но её следует назвать «сообщённые агентом токены запросов», с указанием охвата.
Назвать её точным расходом подписки или оплаченными токенами оснований нет.
Это рекомендация для отдельной задачи: исследование не меняет приложение и отчёт #66.
Основание: [контракт ACP][acp-types], реализации [Claude][claude-turn],
[Codex][codex-count], [OpenCode][oc-translate] и [текущее потребление ответа][app-prompt].

## Что именно измеряется

| Величина | Значение и предел |
| --- | --- |
| Контекст | `usage_update.used` — текущая заполненность окна, `size` — размер окна. Сумма снимков повторно считает историю. Адаптеры приближают заполненность токенами последнего запроса. |
| Токены запросов модели | Вход, выход, чтение и запись кэша за ход либо другой явно указанный интервал. Один ход может сделать несколько запросов. Это доступная основа новой метрики. |
| Оплаченные токены, billed tokens | Категории, которые поставщик включил в расчёт оплаты. ACP не даёт подтверждения счёта или полного набора тарифных правил. Счётчики запросов сами по себе этого не доказывают. |
| Стоимость | `usage_update.cost` — накопленная сообщённая стоимость сессии. У Claude это оценка SDK, у OpenCode возможен расчёт по каталогу; Codex в этом уведомлении цены не передаёт. |
| Расход подписки | Доля лимита учётной записи за окно времени. Это другой масштаб: учётная запись может работать вне Interview Sensei. Проверенные поля ACP не связывают конкретную цепочку со списанием её лимита. |

Определения контекста и стоимости задаёт [схема ACP][acp-types]. Источники токенов,
правила подсчёта и отсутствие цены у Codex видны в [его обработчике][codex-events];
оценочный характер USD у Claude описан в [типах SDK 0.3.318][claude-sdk-types],
выбор цены у OpenCode — в [SessionUsage][oc-usage], передача стоимости сессии —
в [sendUsageUpdate][oc-turn]. Отсутствие доказательства оплаты
и привязки к подписке — вывод из этих контрактов, а не утверждение об устройстве
закрытых систем тарификации поставщиков.

## Закреплённые версии и способ проверки

| Компонент | Версия | Проверенная ревизия |
| --- | --- | --- |
| Claude Code ACP, npm `@agentclientprotocol/claude-agent-acp` | 0.101.0 | [`85aec26ef984a421fe8064ce43f60138a3372384`][claude-package] |
| Claude Agent SDK, зависимость адаптера | 0.3.318 | опубликованный `sdk.d.ts` этой версии, [npm-архив][claude-sdk-tarball] |
| codex-acp | 2.5.0 | [`34e08970aa324a2be985f5080674d5aa91d7666f`][codex-package] |
| OpenCode | 2.2.6 | [`dc2ffcf8bf26f9e669b6aa22b95f50e12be15e06`][oc-package] |
| ACP TypeScript SDK приложения и Claude ACP | 2.4.0 | [`8d953276e54f8fd60108d6ffca3aefc4c83644a4`][acp-types] |

codex-acp использует SDK `~2.1.0`, OpenCode — `1.6.0`; версии указаны в их
[package.json][codex-package] и [package.json][oc-package]. Проверка опирается
на код конкретных адаптеров, а не на обещание одинакового поведения всех SDK.
Ревизия приложения: `66a0da2577cb6cde9e29b2208b6c83ecfe8b0722`.
Сопоставлены package.json/lockfile, исходники по тегам, типы установленного SDK
и опубликованного Claude Agent SDK. Страницы первоисточников проверены через браузинг;
полный код прочитан из публичных архивов GitHub в отдельном временном каталоге.
Личные журналы и credentials не читались; агенты не запускались, системные компоненты
не устанавливались. Это проверка доступности и смысла полей, а не новый живой замер.

## Что доступно через ACP

| Адаптер | `PromptResponse.usage` в ACP v1 | Ограничение |
| --- | --- | --- |
| Claude ACP 0.101.0 | `inputTokens`, `outputTokens`, `cachedReadTokens`, `cachedWriteTokens`, `totalTokens` | Основной цикл агента. Более широкий охват есть отдельно в `_meta.quota.model_usage`. |
| codex-acp 2.5.0 | Те же поля и `thoughtTokens`; `usage: null`, если Codex не сообщил данные | Счётчики текущего хода основного thread; дочерние native threads не прибавляются к нему. |
| OpenCode 2.2.6 | `inputTokens`, `outputTokens`, `totalTokens`; cache/thought поля при значении больше нуля | Сумма шагов основной сессии в текущем ходе; без шагов `usage` отсутствует. |

Таблица следует из [формирования ответа Claude][claude-turn],
[преобразования Codex][codex-count], [построения ответа Codex][codex-response]
и [формирования ответа OpenCode][oc-translate]. У всех трёх подтверждены
счётчики запросов; оплаченные токены и расход подписки для цепочки **не установлены**.

В SDK 2.4.0 `PromptResponse.usage` — необязательное **unstable** поле для хода.
В комментариях к вложенному `Usage` при этом остались слова про session/all turns.
Поэтому период нельзя определять только по имени поля: перечисленные реализации
явно накапливают текущий ход. `usage_update` имеет отдельный контракт контекста
и накопленной стоимости. См. [типы ACP][acp-types].

Приложение импортирует `@agentclientprotocol/sdk/unstable`; этот entrypoint
выбирает ACP v1, `PROTOCOL_VERSION` равен `1`. Оно отправляет эту версию при
initialize, а затем берёт из `session/prompt` только `stopReason`.
В журнал и отчёты попадает последнее корректное `usage_update`.
Это подтверждают [запуск ACP][app-prompt], [модель расхода][app-usage]
и [exports SDK 2.4.0][acp-package]. Следовательно, данные #66 не позволяют
восстановить отброшенные счётчики. Возможность адаптера не означает, что тот
конкретный запуск передал все поля: нового захвата ответов в исследовании нет.

Claude и Codex также переносят usage в `state_update` при ACP v2, но этот путь
не используется текущим приложением. Переход на v2 ради счётчиков не требуется:
они доступны в ответе v1. См. [Claude v2][claude-v2] и [Codex v2][codex-v2].

## Различия, которые нельзя скрывать общей суммой

**Claude.** SDK `result.usage` охватывает основной цикл и относится к ходу;
`result.modelUsage` — накопленные суммы по моделям, включая Task subagents,
sidechains и compaction. Внешние для query pipeline служебные вызовы SDK
из них исключены. `total_cost_usd` и `modelUsage` — оценки, не платёжная выписка.
См. опубликованные типы [SDKResultSuccess/SDKResultError][claude-sdk-types].

Адаптер отдаёт основной цикл в `usage` и `_meta.quota.token_count`, а приращения
более широких сумм — в `_meta.quota.model_usage`. Складывать эти представления
нельзя: они пересекаются. После resume первое `modelUsage` становится базой;
адаптер подставляет для этого хода данные основного цикла и может недосчитать
subagents. Автономные результаты исключены из счётчика пользовательского хода.
См. [обработку result][claude-result] и [расчёт приращений][claude-accounting].
Поэтому даже расширенная метрика требует отметки неполного охвата.

**Codex.** Native `inputTokens` включает cache read/write. Адаптер вычитает оба
счётчика и возвращает свежий input отдельно; повторно вычитать cache на стороне
приложения нельзя. `outputTokens` уже включает reasoning; `thoughtTokens` — его
часть, добавлять её к total нельзя. Расход хода получается из разности thread
totals; при неизвестной базе или сбросе используются последние запросы с защитой
от повторных уведомлений. На первом ходе после resume compaction может быть
принята за базу и недосчитана. Это явно описано в [TokenCount][codex-count]
и [обработчике событий][codex-events]. `cacheWriteInputTokens` уже поддерживается
в версии 2.5.0; предположение о его безусловном отсутствии здесь неверно.

**OpenCode.** Основная сессия суммирует `session.step.ended` и доступные токены
`session.step.failed`. Дочерние события идут отдельным путём и не складываются
в этот счётчик. `outputTokens` содержит видимый выход, а reasoning идёт отдельно
в `thoughtTokens` и уже включён в `totalTokens` вместе с input/cache.
См. [перевод событий в ACP][oc-translate] и [формулу total][oc-total].
Единой формулы «input + output + cache + thought» для всех трёх адаптеров нет.

OpenCode заменяет неизвестные внутренние значения usage на нули, а на ACP-проводе
опускает нулевые cache/thought поля. Клиент не сможет надёжно отличить реальный
ноль от отсутствия информации provider. Стоимость берётся из ответа endpoint,
включая явный ноль, либо считается по каталогу. См. [нормализацию и цену][oc-usage].
Поэтому даже присутствующий объект usage не доказывает полноту счётчиков.

## Рекомендация для отдельной задачи

Новая метрика нужна для сравнения этапов Inbox, наполнения и мока: размер последнего
контекста не отвечает, сколько запросов и повторной обработки они потребовали.
Безопасный первый шаг — сохранять уже полученный `PromptResponse.usage` из ACP v1
в собственном журнале приложения, с привязкой к сессии и ходу, версией адаптера,
источником и охватом. Читать личные журналы или менять способ авторизации не нужно.
Это предложение, а не согласованное изменение требований.

В будущей задаче стоит закрепить такие правила приёмки:

1. Контекст, токены запросов, сообщённая стоимость и расход подписки показаны отдельно.
   Цена не превращается в токены обратным расчётом; токены не превращаются в процент подписки.
2. Суммируются только непересекающиеся ходы одной цепочки. Повторная доставка,
   resume и перезапуск не удваивают сумму; снимки `used` никогда не суммируются.
3. Нет поля/ответа, crash, неизвестная база или неполный охват дают явное «нет данных»
   либо «частичные данные», а не ноль и не обещание точного расхода всей цепочки.
   Сообщённый ноль сохраняется как ноль с оговоркой о нормализации OpenCode.
4. Основной цикл и более широкий `_meta.quota.model_usage` Claude хранятся как
   разные представления. Дочерние и фоновые запросы требуют отдельного решения;
   пока их полнота не проверена, итог обозначается частичным.
5. Поведение проверяется на завершении, отмене, ошибке, нескольких запросах за ход,
   повторе события, resume, compaction и работе subagent. Для каждого адаптера
   проверяется смысл cache/reasoning, а не только наличие чисел.

Альтернатива — оставить только текущий контекст и стоимость. Она не требует нового
контракта и хранения, но сохраняет невозможность сравнить расход запросов этапов.
Рекомендуется первая возможность с честным охватом; точные списания подписки
не обещать. Решение о реализации остаётся отдельной задачей владельца.

## Воспроизведение и границы вывода

Проверку исходников можно повторить без запуска моделей: получить публичные архивы
по трём SHA из таблицы; найти `turnOutcome`/`turnQuotaMeta` у Claude,
`toPromptUsage`/`PromptTokenUsage` у Codex, `response`/`recordStep` у OpenCode;
сопоставить их с `PromptResponse` и `UsageUpdate` SDK 2.4.0. Типы Claude SDK доступны
в [npm-архиве конкретной версии][claude-sdk-tarball]. Для приложения проверить
`openAcpSession`, `promptTurn` и `sessionUsage`. SHA позволяет повторить
вывод даже после новых релизов.

Исследование не подтверждает полноту учёта оплаченных запросов, включая повторы
внутри закрытых клиентов и служебные вызовы поставщика. Нового живого опыта,
проверки счетов и сопоставления с лимитами подписки не было. Старые результаты
[#66](pipeline-evaluation.ru.md) остаются снимками контекста и сообщённой стоимости;
данные этого исследования не превращают их в сумму токенов запросов.

[acp-types]: https://github.com/agentclientprotocol/typescript-sdk/blob/8d953276e54f8fd60108d6ffca3aefc4c83644a4/src/v1/unstable/schema/types.gen.ts
[acp-package]: https://github.com/agentclientprotocol/typescript-sdk/blob/8d953276e54f8fd60108d6ffca3aefc4c83644a4/package.json
[claude-package]: https://github.com/agentclientprotocol/claude-agent-acp/blob/85aec26ef984a421fe8064ce43f60138a3372384/package.json
[claude-turn]: https://github.com/agentclientprotocol/claude-agent-acp/blob/85aec26ef984a421fe8064ce43f60138a3372384/src/acp-agent.ts#L13043-L13069
[claude-result]: https://github.com/agentclientprotocol/claude-agent-acp/blob/85aec26ef984a421fe8064ce43f60138a3372384/src/acp-agent.ts#L7274-L7378
[claude-accounting]: https://github.com/agentclientprotocol/claude-agent-acp/blob/85aec26ef984a421fe8064ce43f60138a3372384/src/acp-agent.ts#L13119-L13340
[claude-v2]: https://github.com/agentclientprotocol/claude-agent-acp/blob/85aec26ef984a421fe8064ce43f60138a3372384/src/v2/prompt.ts#L85-L141
[claude-sdk-types]: https://unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.318/sdk.d.ts
[claude-sdk-tarball]: https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk/-/claude-agent-sdk-0.3.318.tgz
[codex-package]: https://github.com/agentclientprotocol/codex-acp/blob/34e08970aa324a2be985f5080674d5aa91d7666f/package.json
[codex-count]: https://github.com/agentclientprotocol/codex-acp/blob/34e08970aa324a2be985f5080674d5aa91d7666f/src/TokenCount.ts
[codex-response]: https://github.com/agentclientprotocol/codex-acp/blob/34e08970aa324a2be985f5080674d5aa91d7666f/src/CodexAcpServer.ts#L5480-L5534
[codex-events]: https://github.com/agentclientprotocol/codex-acp/blob/34e08970aa324a2be985f5080674d5aa91d7666f/src/CodexEventHandler.ts#L1315-L1380
[codex-v2]: https://github.com/agentclientprotocol/codex-acp/blob/34e08970aa324a2be985f5080674d5aa91d7666f/src/AcpV2Prompt.ts#L75-L100
[oc-package]: https://github.com/anomalyco/opencode/blob/dc2ffcf8bf26f9e669b6aa22b95f50e12be15e06/packages/cli/package.json
[oc-translate]: https://github.com/anomalyco/opencode/blob/dc2ffcf8bf26f9e669b6aa22b95f50e12be15e06/packages/cli/src/acp/translate.ts
[oc-turn]: https://github.com/anomalyco/opencode/blob/dc2ffcf8bf26f9e669b6aa22b95f50e12be15e06/packages/cli/src/acp/turn.ts#L328-L348
[oc-total]: https://github.com/anomalyco/opencode/blob/dc2ffcf8bf26f9e669b6aa22b95f50e12be15e06/packages/schema/src/token-usage.ts
[oc-usage]: https://github.com/anomalyco/opencode/blob/dc2ffcf8bf26f9e669b6aa22b95f50e12be15e06/packages/core/src/session/usage.ts
[app-prompt]: https://github.com/KirillSachkov/interview-sensei/blob/66a0da2577cb6cde9e29b2208b6c83ecfe8b0722/packages/core/src/features/agent-runtime/infrastructure/acp-process-launcher.ts
[app-usage]: https://github.com/KirillSachkov/interview-sensei/blob/66a0da2577cb6cde9e29b2208b6c83ecfe8b0722/packages/core/src/features/agent-sessions/domain/session-usage.ts
