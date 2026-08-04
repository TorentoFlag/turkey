# Почему агентский процесс устроен так

Этот процесс основан на первичных практиках, а не на идее, что больше агентов всегда быстрее.

- [OpenAI Codex best practices](https://learn.chatgpt.com/guides/best-practices.md) рекомендует хранить в `AGENTS.md` устойчивые команды, ограничения и definition of done; задачи давать с goal/context/constraints/done criteria; планировать и проверять результат до приёмки.
- [OpenAI: subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) описывает bounded specialist subagents и project-scoped роли. Из этого следует разделение на product, architecture, implementation, verification и review.
- [OpenAI: practical guide to agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/) рекомендует coordinator-worker подход и human approval для действий с финансовым, необратимым или привилегированным риском.
- [Anthropic: multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) показывает ценность параллельных независимых исследований, но также цену координации. Поэтому параллельны исследования и review, а не конфликтующие правки.
- [Anthropic: effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) обосновывает короткие artifact-based handoff вместо передачи больших неструктурированных контекстов.
- [Anthropic: building effective agents](https://www.anthropic.com/engineering/building-effective-agents) поддерживает явные критерии, evaluator/verification loop и ограниченные условия остановки.
- [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) — ориентир для будущего Git процесса: required checks/review, защита main и merge queue при высокой параллельности.

Практический вывод: один оркестратор держит решение и integration, независимые агенты получают малые ограниченные задания, один владелец меняет каждую поверхность, а проверка отделена от реализации. Это уменьшает дублирование, скрытые конфликты и ложные заявления о готовности.
