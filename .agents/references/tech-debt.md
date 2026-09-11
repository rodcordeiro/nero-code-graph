# Tech debt

Gaps vs guideline mcp (`$nero` → `references/guidelines/mcp-guidelines.md`) e checkout atual:

| Débito | Nota |
| --- | --- |
| PHP / .NET extractors são MVP regex | Cobertura limitada vs AST real; Roslyn / parser PHP formalmente fica para depois |
| QueryEnvelope sem `extractorId`/`extractorVersion` | Generate/status já expõem; query envelope opcional |
| Viewer do grafo | Issue `#10` |
| Composição multi-extractor no mesmo GraphDocument | Repos mistos escolhem primário por sinais; composição fica aberta |
| Open questions remanescentes | Ver `docs/references/open-questions.md` se ainda listarem gaps vivos |
