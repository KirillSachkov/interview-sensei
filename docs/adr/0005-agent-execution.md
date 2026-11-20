# 0005. Все реплики помощнику проходят через общий агентский слой

«Выполнение агента» принимает реплики в контексте текущего шага. Для свободного текста он использует LangChain и модель через AITUNNEL. При явном согласии с показанным предложением слой передаёт подтверждение владельцу цели без вызова модели. Согласно ADR 0001 владелец проверяет права и допустимость записи. При подтверждении цели он также сверяет версию предложения.

Для процессов с развилками выбран LangGraph. При сравнении с Vercel AI SDK решающим оказалось то, что готовый агент LangChain и явно заданные переходы используют один механизм исполнения. Из исполняемого определения можно получить карту допустимых переходов. Путь отдельной реплики и его результат проверяются прогоном через приложение. Рабочую модель для каждой операции выбираем по замерам.

## English

Agent Execution receives each message addressed to the assistant in the context of the current step. It uses LangChain and a model through AITUNNEL for free-form text. For explicit agreement with the displayed goal proposal it passes confirmation to the goal owner without a model call. Under ADR 0001, the owner checks access and whether the change is allowed. For goal confirmation it also checks the proposal version.

We chose LangGraph for branching processes. Compared with Vercel AI SDK, the deciding factor was that LangChain's built-in agent and explicit transitions use the same execution mechanism. The executable definition can produce a map of allowed transitions. An application-level run verifies the actual path and outcome for a particular message. Measurements determine the model for each operation.

[Спецификация этапа / Stage specification](https://github.com/KirillSachkov/interview-sensei/issues/14) · [Владельцы данных / Data ownership](0001-module-ownership.md)
